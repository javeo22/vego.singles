-- Explain approval readiness and allow audited final-price decisions.
-- Existing prices, stock, evidence and proposals are preserved.
begin;

create function pricing_card_snapshot(p_listing uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('listingId',l.id,'printingId',c.id,'game',c.game,
  'name',c.canonical_name,'set',c.set_name,'number',c.collector_number,
  'language',c.language,'condition',canonical_condition(l.condition),
  'finish',canonical_finish(l.finish),'kind',c.kind,'treatment',c.treatment)
 from listings l join card_printings c on c.id=l.card_printing_id where l.id=p_listing
$$;

create function price_update_readiness(p_proposal uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p price_proposals; l listings; c card_printings; e market_prices; s operation_settings;
 code text; message text; next_action text; expires timestamptz; ref jsonb; minimum numeric;
begin
 perform require_role(array['owner','reviewer','stock']);
 select * into p from price_proposals where id=p_proposal;
 select * into l from listings where id=p.listing_id;
 select * into c from card_printings where id=l.card_printing_id;
 select * into e from market_prices where id=p.evidence_id;
 select * into s from operation_settings;
 if l.cost_confirmed then
  minimum=ceil((l.acquisition_cost+(s.policy->>'handlingCrc')::numeric+(s.policy->>'fixedFeeCrc')::numeric)
   /(1-(s.policy->>'variableFee')::numeric-(s.policy->>'targetMargin')::numeric));
 end if;
 if e.id is not null then
  expires=coalesce(e.provider_updated_at,e.fetched_at)+make_interval(hours=>(s.policy->>'maxAgeHours')::integer);
  if e.currency='USD' and s.fx_at is not null then expires=least(expires,s.fx_at+interval '7 days'); end if;
 end if;
 if p.id is null or l.id is null or l.archived_at is not null then
  code='unavailable'; message='Esta carta ya no está disponible para actualizar.'; next_action='none';
 elsif p.status<>'pending' then
  code=p.status; message=case p.status when 'approved' then 'Este cambio ya se guardó en la tienda.' when 'rejected' then 'Esta propuesta se descartó.' else 'Otra propuesta reemplazó este cambio.' end; next_action='refresh';
 elsif e.id is null or p.expected_revision is null or p.policy_revision is null then
  code='legacy'; message='Propuesta antigua sin una referencia verificable. Consulta el mercado para preparar un nuevo precio.'; next_action='refresh';
 elsif not c.identity_verified then
  code='confirm_card'; message='Falta confirmar que la carta física coincide con su ficha. Puedes hacerlo al actualizar esta carta.'; next_action='confirm';
 elsif l.price_locked_until>now() then
  code='locked'; message='Hay un bloqueo manual de precio. Revisa el bloqueo antes de guardar un cambio.'; next_action='inventory';
 elsif p.expected_revision is distinct from l.price_revision or p.current_price_crc is distinct from l.approved_price_crc then
  code='card_changed'; message='El precio o costo de la carta cambió desde este cálculo. Consulta de nuevo para recalcular.'; next_action='refresh';
 elsif p.policy_revision is distinct from s.revision then
  code='policy_changed'; message='El tipo de cambio o las reglas de precios cambiaron. Recalcula con los valores actuales.'; next_action='refresh';
 elsif not e.exact_variant or e.language is distinct from c.language or e.condition is distinct from l.condition or e.finish is distinct from l.finish then
  code='variant_changed'; message='La referencia ya no coincide con el idioma, condición o acabado de esta carta.'; next_action='refresh';
 elsif coalesce(e.provider_updated_at,e.fetched_at) is null or coalesce(e.provider_updated_at,e.fetched_at)<now()-make_interval(hours=>(s.policy->>'maxAgeHours')::integer) or coalesce(e.provider_updated_at,e.fetched_at)>now()+interval '1 hour' then
  code='expired'; message='El precio de mercado venció o no tiene una fecha válida. Consulta un precio actualizado.'; next_action='refresh';
 elsif e.currency='USD' and (s.fx is null or s.fx_at is null or s.fx_at<now()-interval '7 days' or s.fx_at>now()+interval '1 hour') then
  code='exchange'; message='Configura un tipo de cambio USD/CRC vigente y vuelve a calcular este precio.'; next_action='exchange';
 else
  code='ready'; message='Referencia vigente. Puedes editar el precio final y guardar el cambio.'; next_action='edit';
  if p.calculation ? 'priceCheck' then
   begin
    if p.calculation#>'{priceCheck,variantSnapshot}' is distinct from price_variant_snapshot(l.id) then
     raise exception 'Los datos de la carta cambiaron. Consulta el precio de nuevo.';
    end if;
    ref=checked_price_reference(l.id,(p.calculation#>>'{priceCheck,jobId}')::uuid,p.calculation#>>'{priceCheck,referenceId}');
    if ref is distinct from p.calculation#>'{priceCheck,reference}' then raise exception 'La referencia cambió. Consulta el precio de nuevo.'; end if;
   exception when others then
    code='reference_changed'; message='La referencia ya no es válida para esta carta. Vuelve a consultar el mercado.'; next_action='refresh';
   end;
  end if;
 end if;
 return jsonb_build_object('code',code,'canApprove',code='ready','message',message,'action',next_action,
  'expiresAt',expires,'minimumPriceCrc',minimum,'currentPriceCrc',l.approved_price_crc,'checkedAt',now());
end $$;

create function list_price_updates(p_status text default 'pending',p_group text default 'all',p_page integer default 0,p_proposal uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform require_role(array['owner','reviewer','stock']);
 if p_status not in ('pending','approved','rejected','superseded') or p_group not in ('all','ready','blocked') or p_page<0 or p_page>100000 then raise exception 'Filtro de precios inválido'; end if;
 with items as materialized (
  select p.id,p.created_at,p.suggested_price_crc,price_update_readiness(p.id) readiness,
   to_jsonb(p)||jsonb_build_object('listings',jsonb_build_object('condition',canonical_condition(l.condition),'finish',canonical_finish(l.finish),
    'card_printings',jsonb_build_object('canonical_name',c.canonical_name,'set_name',c.set_name,'collector_number',c.collector_number,'language',c.language,'stock_image_url',c.stock_image_url))) item
  from price_proposals p join listings l on l.id=p.listing_id join card_printings c on c.id=l.card_printing_id
  where (p_proposal is not null and p.id=p_proposal) or (p_proposal is null and p.status=p_status)
 ), filtered as (
  select * from items where p_proposal is not null or p_group='all' or (p_group='ready' and (readiness->>'canApprove')::boolean) or (p_group='blocked' and not (readiness->>'canApprove')::boolean)
 ), page as (
  select item||jsonb_build_object('readiness',readiness) item from filtered order by suggested_price_crc desc,created_at desc,id offset p_page*10 limit 10
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(item) from page),'[]'::jsonb),'total',(select count(*) from filtered),
  'readyCount',(select count(*) from items where (readiness->>'canApprove')::boolean),'blockedCount',(select count(*) from items where not (readiness->>'canApprove')::boolean),
  'page',p_page,'pageSize',10) into result;
 return result;
end $$;

create function confirm_pricing_card(p_listing uuid,p_expected jsonb,p_key uuid,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l listings; c card_printings; receipt operation_receipts; payload jsonb; result jsonb; snapshot jsonb;
begin
 perform require_role(array['owner','reviewer']);
 if p_key is null or p_confirmed is not true then raise exception 'Compara la ficha con la carta física y confirma los datos'; end if;
 payload=jsonb_build_object('listing',p_listing,'expected',p_expected,'confirmed',p_confirmed);
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into receipt from operation_receipts where key=p_key;
 if found then
  if receipt.actor is distinct from auth.uid() or receipt.action<>'confirm_pricing_card' or receipt.payload<>payload then raise exception 'Clave reutilizada con otra operación'; end if;
  return receipt.result;
 end if;
 select * into l from listings where id=p_listing for update;
 select * into c from card_printings where id=l.card_printing_id for update;
 if l.id is null or l.archived_at is not null then raise exception 'Carta no disponible'; end if;
 snapshot=pricing_card_snapshot(p_listing);
 if snapshot is distinct from p_expected then raise exception 'La ficha cambió. Recarga la carta antes de confirmar'; end if;
 if coalesce(trim(c.canonical_name),'')='' or coalesce(trim(c.set_name),'')='' or (c.kind='single' and coalesce(trim(c.collector_number),'')='')
  or canonical_language(c.language) not in ('en','es','ja','zh','fr','de','it','pt','ko')
  or canonical_condition(l.condition) not in ('Mint','Near Mint','Lightly Played','Moderately Played','Heavily Played','Damaged','Sealed Product')
  or coalesce(trim(l.finish),'')='' or lower(l.finish)='unknown' then raise exception 'Completa nombre, set, número, idioma, condición y acabado en Inventario'; end if;
 update card_printings set identity_verified=true,metadata=metadata||jsonb_build_object('verification_reason','Carta física confirmada en el flujo de precios','verified_by',auth.uid(),'verified_at',now()),updated_at=now() where id=c.id;
 perform log_operation('confirm_pricing_card',l.id,jsonb_build_object('snapshot',snapshot));
 result=jsonb_build_object('id',l.id,'message','Carta confirmada. Ya puedes consultar el mercado.');
 insert into operation_receipts(key,actor,action,payload,result) values(p_key,auth.uid(),'confirm_pricing_card',payload,result);
 return result;
end $$;

create function approve_price_update(p_proposal uuid,p_price integer,p_expected_price integer,p_reason text,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p price_proposals; receipt operation_receipts; payload jsonb; result jsonb; readiness jsonb; lid uuid; why text;
begin
 perform require_role(array['owner','reviewer']);
 why=trim(p_reason);
 if p_key is null or p_price is null or p_price<=0 or p_expected_price is null or coalesce(length(why),0) not between 3 and 500 then raise exception 'Indica un precio positivo y un motivo de al menos 3 caracteres'; end if;
 payload=jsonb_build_object('proposal',p_proposal,'price',p_price,'expectedPrice',p_expected_price,'reason',why);
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into receipt from operation_receipts where key=p_key;
 if found then
  if receipt.actor is distinct from auth.uid() or receipt.action<>'approve_price_update' or receipt.payload<>payload then raise exception 'Clave reutilizada con otra operación'; end if;
  return receipt.result;
 end if;
 select listing_id into lid from price_proposals where id=p_proposal;
 perform 1 from listings where id=lid for update;
 select * into p from price_proposals where id=p_proposal for update;
 perform 1 from operation_settings for share;
 perform 1 from card_printings where id=(select card_printing_id from listings where id=lid) for update;
 if p.id is null or p.status<>'pending' then raise exception 'Este cambio ya fue revisado. Recarga los precios pendientes'; end if;
 if p.suggested_price_crc is distinct from p_expected_price then raise exception 'La propuesta cambió. Revísala de nuevo antes de guardar'; end if;
 readiness=price_update_readiness(p.id);
 if (readiness->>'canApprove')::boolean is not true then raise exception '%',readiness->>'message'; end if;
 if (readiness->>'minimumPriceCrc') is not null and p_price<(readiness->>'minimumPriceCrc')::numeric then raise exception 'El precio final está por debajo del mínimo según costo y margen: % CRC',readiness->>'minimumPriceCrc'; end if;
 update price_proposals set suggested_price_crc=p_price,calculation=calculation||jsonb_build_object('priceDecision',jsonb_build_object('calculatedPriceCrc',p.suggested_price_crc,'finalPriceCrc',p_price,'reason',why,'actor',auth.uid(),'at',now())) where id=p.id;
 perform admin_command('review_price',jsonb_build_object('id',p.id,'approve',true,'reason',why),gen_random_uuid());
 perform log_operation('approve_price_update',lid,payload);
 result=jsonb_build_object('id',p.id,'listingId',lid,'priceCrc',p_price,'message','Precio actualizado en la tienda.');
 insert into operation_receipts(key,actor,action,payload,result) values(p_key,auth.uid(),'approve_price_update',payload,result);
 return result;
end $$;

create function set_pricing_exchange(p_fx numeric,p_at timestamptz,p_source text,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt operation_receipts; payload jsonb; result jsonb;
begin
 perform require_role(array['owner']);
 if p_key is null or p_fx is null or p_fx not between 1 and 10000 or p_at is null or p_at<now()-interval '7 days' or p_at>now()+interval '1 hour' or coalesce(p_source,'') not like 'https://%' then raise exception 'Indica un cambio válido, una fecha vigente y una fuente HTTPS'; end if;
 payload=jsonb_build_object('fx',p_fx,'at',p_at,'source',p_source);
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into receipt from operation_receipts where key=p_key;
 if found then
  if receipt.actor is distinct from auth.uid() or receipt.action<>'set_pricing_exchange' or receipt.payload<>payload then raise exception 'Clave reutilizada con otra operación'; end if;
  return receipt.result;
 end if;
 update operation_settings set fx=p_fx,fx_at=p_at,fx_source=p_source,revision=revision+1,updated_at=now();
 if not found then raise exception 'La configuración de precios no está disponible'; end if;
 perform log_operation('set_pricing_exchange',null,payload);
 result=jsonb_build_object('message','Tipo de cambio guardado. Calcula los precios con el cambio actualizado.');
 insert into operation_receipts(key,actor,action,payload,result) values(p_key,auth.uid(),'set_pricing_exchange',payload,result);
 return result;
end $$;

revoke all on function pricing_card_snapshot(uuid),price_update_readiness(uuid),list_price_updates(text,text,integer,uuid),confirm_pricing_card(uuid,jsonb,uuid,boolean),approve_price_update(uuid,integer,integer,text,uuid),set_pricing_exchange(numeric,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function price_update_readiness(uuid),list_price_updates(text,text,integer,uuid),confirm_pricing_card(uuid,jsonb,uuid,boolean),approve_price_update(uuid,integer,integer,text,uuid),set_pricing_exchange(numeric,timestamptz,text,uuid) to authenticated,service_role;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610080001','feature','price_workflow'));
notify pgrst,'reload schema';
commit;
