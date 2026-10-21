begin;

-- Collectr is the owner's trusted inventory source. This is source trust,
-- never a claim that staff physically inspected each copy.
create function is_collectr_printing(p_printing uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from card_printings c where c.id=p_printing
  and ((c.metadata->'original_data' ?& array['Portfolio Name','Product Name','Category','Variance'])
   or exists(select 1 from operation_import_rows r where r.card_printing_id=c.id and r.status in ('committed','skipped') and r.raw ?& array['Portfolio Name','Product Name','Variance'])))
$$;

update locations set active=true,label='Sin ubicación asignada' where code='UNASSIGNED';

-- Location is optional. Unknown language is allowed only for trusted Collectr
-- inventory and remains unknown in every public response.
do $patch$
declare definition text;
begin
 definition=pg_get_functiondef('public.admin_command(text,jsonb,uuid)'::regprocedure);
 if position('or exists(select 1 from stock_lots where listing_id=l.id and not quarantined and quantity>0 and location_code=''UNASSIGNED'')' in definition)=0 then raise exception 'Review changed publication guard'; end if;
 definition=replace(definition,'or exists(select 1 from stock_lots where listing_id=l.id and not quarantined and quantity>0 and location_code=''UNASSIGNED'')','');
 definition=replace(definition,'not c.identity_verified or c.language=''unknown'' or l.condition=''unknown''','not c.identity_verified or (c.language=''unknown'' and not is_collectr_printing(c.id)) or l.condition=''unknown''');
 definition=replace(definition,'Falta identidad, precio, stock o ubicación verificados','Falta un precio aprobado o stock disponible');
 execute definition;
end $patch$;

alter table stock_lots add column collectr_released_at timestamptz;

create table store_update_runs(
 id uuid primary key default gen_random_uuid(), actor uuid references auth.users(id), mode text not null check(mode in ('prices','import','review')),
 batch_id uuid references operation_import_batches(id), status text not null default 'running' check(status in ('running','completed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index store_update_one_active on store_update_runs((true)) where status='running';
create table store_update_items(
 id uuid primary key default gen_random_uuid(),run_id uuid not null references store_update_runs(id),listing_id uuid not null references listings(id),
 status text not null default 'pending' check(status in ('pending','processing','updated','unchanged','review')),
 lease_token uuid,lease_until timestamptz,attempts integer not null default 0, result jsonb not null default '{}',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(run_id,listing_id)
);
create index store_update_pending on store_update_items(run_id,status,created_at,id);
alter table store_update_runs enable row level security;
alter table store_update_items enable row level security;
create policy admin_read on store_update_runs for select to authenticated using(is_admin());
create policy admin_read on store_update_items for select to authenticated using(is_admin());
revoke all on store_update_runs,store_update_items from anon,authenticated;
grant select on store_update_runs,store_update_items to authenticated;
grant all on store_update_runs,store_update_items to service_role;

create function store_card_snapshot(p_listing uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select price_variant_snapshot(l.id)||jsonb_build_object('priceRevision',l.price_revision,'priceCrc',l.approved_price_crc,'policyRevision',s.revision)
 from listings l cross join operation_settings s where l.id=p_listing
$$;

create function coalesce_collectr_printings() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare duplicate record; canonical uuid; n integer=0;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 for duplicate in
  select c.* from card_printings c where not c.identity_verified and is_collectr_printing(c.id) and exists(select 1 from listings where card_printing_id=c.id)
  order by c.created_at,c.id
 loop
  select other.id into canonical from card_printings other where other.id<>duplicate.id and is_collectr_printing(other.id)
   and other.game=duplicate.game and lower(other.set_name)=lower(duplicate.set_name) and lower(other.collector_number)=lower(duplicate.collector_number)
   and lower(other.language)=lower(duplicate.language) and other.treatment=duplicate.treatment and other.kind=duplicate.kind and lower(other.canonical_name)=lower(duplicate.canonical_name)
   and exists(select 1 from listings where card_printing_id=other.id)
   and (other.identity_verified or (other.created_at,other.id)<(duplicate.created_at,duplicate.id))
   order by other.identity_verified desc,other.created_at,other.id limit 1;
  if canonical is null then continue; end if;
  if exists(select 1 from listings a join listings b on canonical_condition(a.condition)=canonical_condition(b.condition) and canonical_finish(a.finish)=canonical_finish(b.finish) where a.card_printing_id=canonical and b.card_printing_id=duplicate.id) then continue; end if;
  perform 1 from card_printings where id in(canonical,duplicate.id) order by id for update;
  update listings set card_printing_id=canonical where card_printing_id=duplicate.id;
  update operation_import_rows set card_printing_id=canonical where card_printing_id=duplicate.id;
  update external_references set card_printing_id=canonical where card_printing_id=duplicate.id;
  update card_printings set metadata=metadata||jsonb_build_object('merged_printing_ids',coalesce(metadata->'merged_printing_ids','[]')||to_jsonb(duplicate.id)) where id=canonical;
  update card_printings set metadata=metadata||jsonb_build_object('merged_into',canonical,'merged_at',now()) where id=duplicate.id;
  insert into activity_log(action,entity_id,details) values('collectr_printing_consolidated',duplicate.id,jsonb_build_object('canonical',canonical,'stockPreserved',true));
  n=n+1;
 end loop;
 return n;
end $$;
revoke all on function coalesce_collectr_printings() from public,anon,authenticated;
grant execute on function coalesce_collectr_printings() to service_role;

create function start_store_update(p_mode text,p_batch uuid,p_actor uuid,p_key uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare run store_update_runs; rid uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 if p_mode not in ('prices','import','review') or p_key is null then raise exception 'Proceso inválido'; end if;
 if p_actor is not null and not exists(select 1 from admin_memberships where user_id=p_actor and role in ('owner','reviewer')) then raise exception 'Sin permiso' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('store_update',0));
 select * into run from store_update_runs where id=p_key;
 if found then
  if run.mode<>p_mode or run.batch_id is distinct from p_batch or run.actor is distinct from p_actor then raise exception 'Clave de proceso reutilizada'; end if;
  return run.id;
 end if;
 select * into run from store_update_runs where status='running';
 if found then return run.id; end if;
 perform coalesce_collectr_printings();
 if p_mode='import' and not exists(select 1 from operation_import_batches where id=p_batch) then raise exception 'Importación no encontrada'; end if;
 insert into store_update_runs(id,actor,mode,batch_id) values(p_key,p_actor,p_mode,p_batch) returning id into rid;
 insert into store_update_items(run_id,listing_id)
 select rid,l.id from listings l join card_printings c on c.id=l.card_printing_id
 where l.archived_at is null and exists(select 1 from stock_lots s where s.listing_id=l.id and quantity>0)
 and (is_collectr_printing(c.id) or c.identity_verified)
 and (p_mode<>'import' or exists(select 1 from operation_import_rows r where r.batch_id=p_batch and r.listing_id=l.id and r.status in ('committed','skipped')) or exists(select 1 from stock_lots s where s.listing_id=l.id and s.source_reference=p_batch::text))
 and (p_mode<>'review' or exists(select 1 from store_update_items old where old.listing_id=l.id and old.status='review' and old.run_id=(select id from store_update_runs where id<>rid order by created_at desc limit 1)));
 if not exists(select 1 from store_update_items where run_id=rid) then update store_update_runs set status='completed' where id=rid; end if;
 insert into activity_log(actor,action,entity_id,details) values(p_actor,'start_store_update',rid,jsonb_build_object('mode',p_mode,'batch',p_batch));
 return rid;
end $$;

create function claim_store_updates(p_run uuid,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 with claim as (
  select id from store_update_items where run_id=p_run and (status='pending' or (status='processing' and lease_until<now()))
  order by created_at,id for update skip locked limit greatest(1,least(100,p_limit))
 ), items as (
  update store_update_items i set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
  from claim where i.id=claim.id returning i.*
 ) select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('printing',to_jsonb(c),'listing',to_jsonb(l),'trustedCollectr',is_collectr_printing(c.id),'expected',store_card_snapshot(l.id))),'[]') into result
 from items i join listings l on l.id=i.listing_id join card_printings c on c.id=l.card_printing_id;
 return result;
end $$;

create function refresh_store_exchange(p_run uuid,p_fx numeric,p_at timestamptz,p_source text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 if not exists(select 1 from store_update_runs where id=p_run) or p_fx is null or p_fx not between 1 and 10000 or p_at is null or p_at<now()-interval '7 days' or p_at>now()+interval '1 hour' or p_source<>'https://api.hacienda.go.cr/indicadores/tc/dolar' then raise exception 'Tipo de cambio oficial no vigente'; end if;
 select actor into who from store_update_runs where id=p_run;
 update operation_settings set fx=p_fx,fx_at=p_at,fx_source=p_source,revision=revision+1,updated_at=now()
 where fx is distinct from p_fx or fx_at is distinct from p_at or fx_source is distinct from p_source;
 if found then insert into activity_log(actor,action,details) values(who,'automatic_exchange',jsonb_build_object('fx',p_fx,'at',p_at,'source',p_source)); end if;
end $$;

create function finish_store_update(p_item uuid,p_token uuid,p_proof jsonb,p_force boolean default false,p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item store_update_items; run store_update_runs; l listings; c card_printings; s operation_settings;
 proof jsonb; ref jsonb; reason text; target numeric; floor_price numeric; step integer; price integer; evidence uuid; proposal uuid; was_published boolean; old_price integer; answer jsonb; initial_release boolean; current_qty integer; trusted boolean;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 select * into item from store_update_items where id=p_item for update;
 if item.id is null then raise exception 'Carta no encontrada'; end if;
 if item.status in ('updated','unchanged') then return item.result; end if;
 select * into run from store_update_runs where id=item.run_id;
 if p_force then
  if item.status<>'review' or coalesce((item.result->>'canAccept')::boolean,false) is not true then raise exception 'La excepción requiere un precio manual'; end if;
  if p_actor is not null and not exists(select 1 from admin_memberships where user_id=p_actor and role in ('owner','reviewer')) then raise exception 'Sin permiso' using errcode='42501'; end if;
  proof=item.result->'proof';
 else
  if item.status<>'processing' or item.lease_token is distinct from p_token or item.lease_until<now() then raise exception 'Turno vencido; continúa la actualización'; end if;
  proof=p_proof;
 end if;
 select * into l from listings where id=item.listing_id for update;
 select * into c from card_printings where id=l.card_printing_id for update;
 select * into s from operation_settings for share;
 trusted=is_collectr_printing(c.id);
 old_price=l.approved_price_crc; was_published=l.published; ref=proof->'reference';
 reason=nullif(proof->>'reason','');
 if reason is null and (proof->'expected' is distinct from store_card_snapshot(l.id)) then
  if c.metadata->>'automation_touch_run'=run.id::text and (c.metadata->>'automation_touch_at')::timestamptz=c.updated_at
   and ((proof->'expected')-array['provider','externalId','tcgplayerId','identityVerified'])=(store_card_snapshot(l.id)-array['provider','externalId','tcgplayerId','identityVerified']) then
   proof=jsonb_set(proof,'{expected}',store_card_snapshot(l.id));
  else reason='La carta, el precio o las reglas cambiaron. Vuelve a actualizar.'; end if;
 end if;
 if reason is null and (l.archived_at is not null or l.price_locked_until>now()) then reason='Precio bloqueado o carta archivada.'; end if;
 if reason is null and (not trusted and (not c.identity_verified or canonical_language(c.language)<>'en')) then reason='Esta ficha necesita datos de catálogo antes de automatizar.'; end if;
 if reason is null and canonical_language(c.language) not in ('en','unknown') then reason='Necesita un precio del mismo idioma; conservamos el idioma indicado en Collectr.'; end if;
 if reason is null and ((c.kind='single' and canonical_condition(l.condition)<>'Near Mint') or (c.kind='sealed' and canonical_condition(l.condition)<>'Sealed Product')) then reason='Necesita un precio para esta condición.'; end if;
 if reason is null and (s.fx is null or s.fx_at is null or s.fx_at<now()-interval '7 days' or s.fx_at>now()+interval '1 hour') then reason='No se pudo actualizar el cambio oficial. Reintenta o registra uno en Ajustes.'; end if;
 if reason is null and (coalesce(proof->>'matched','false')<>'true' or ref is null or ref->>'currency'<>'USD' or ref->>'feed'<>'tcgcsv'
  or ref->>'sourceUrl' is distinct from 'https://www.tcgplayer.com/product/'||(proof#>>'{product,productId}')
  or ref->>'productId' is distinct from proof#>>'{product,productId}'
  or canonical_finish(ref->>'finish') is distinct from canonical_finish(l.finish)
  or (ref->>'amount')::numeric<=0 or ref->>'providerUpdatedAt' is null
  or (ref->>'providerUpdatedAt')::timestamptz<now()-make_interval(hours=>(s.policy->>'maxAgeHours')::integer)
  or (ref->>'providerUpdatedAt')::timestamptz>now()+interval '1 hour') then reason='No hay una referencia vigente del producto y acabado exactos.'; end if;
 -- Accept Collectr identity even when only its price needs review.
 if trusted and not c.identity_verified and (c.kind='sealed' or length(trim(c.collector_number))>0) then
  if exists(select 1 from card_printings other where other.id<>c.id and other.identity_verified and other.game=c.game and lower(other.set_name)=lower(c.set_name) and lower(other.collector_number)=lower(c.collector_number) and lower(other.language)=lower(c.language) and other.treatment=c.treatment and other.kind=c.kind and (c.kind<>'sealed' or lower(other.canonical_name)=lower(c.canonical_name))) then
   reason='Hay fichas duplicadas de la misma variante. Revisa esta excepción.';
  else
   update card_printings set identity_verified=true,metadata=metadata||jsonb_build_object('identity_source','collectr','identity_accepted_at',now(),'automation_touch_run',run.id,'automation_touch_at',now()),updated_at=now() where id=c.id;
   proof=jsonb_set(proof,'{expected}',store_card_snapshot(l.id));
  end if;
 end if;
 if reason is null then
  target=(ref->>'amount')::numeric*s.fx*(s.policy->>'marketFactor')::numeric;
  if l.cost_confirmed then floor_price=(l.acquisition_cost+(s.policy->>'handlingCrc')::numeric+(s.policy->>'fixedFeeCrc')::numeric)/(1-(s.policy->>'variableFee')::numeric-(s.policy->>'targetMargin')::numeric); end if;
  step=case when target<10000 then 100 else 500 end;
  price=greatest(step,round(target/step)*step,coalesce(ceil(floor_price/step)*step,0));
  if not p_force and (price>=50000 or (old_price>0 and abs(price::numeric/old_price-1)>0.1) or floor_price>target) then
   reason=case when price>=50000 then 'Carta de alto valor: acepta el precio una vez.' when floor_price>target then 'El mínimo de costo supera el mercado: revisa este precio.' else 'El cambio supera 10%: acepta el precio una vez.' end;
   answer=jsonb_build_object('name',c.canonical_name,'set',c.set_name,'number',c.collector_number,'before',old_price,'after',price,'reason',reason,'canAccept',true,'proof',proof);
  end if;
 end if;
 if reason is null then
  -- Source trust does not overwrite language. Unnumbered products receive the exact catalog reference.
  update card_printings set identity_verified=true,catalog_source=case when coalesce(catalog_source,'')='' then 'tcgcsv' else catalog_source end,
   external_card_id=case when coalesce(external_card_id,'')='' then proof#>>'{product,productId}' else external_card_id end,
   tcgplayer_product_id=proof#>>'{product,productId}',
   stock_image_url=coalesce(stock_image_url,nullif(proof#>>'{product,imageUrl}','')),
   metadata=metadata||jsonb_build_object('identity_source',case when trusted then 'collectr' else 'verified_catalog' end,'automated_price_source',ref,'automated_price_at',now(),'automation_touch_run',run.id,'automation_touch_at',now()),updated_at=now()
   where id=c.id;
  initial_release=trusted;
  if initial_release then
   select coalesce(sum(quantity),0) into current_qty from stock_lots where listing_id=l.id;
   update stock_lots lot set quarantined=false,collectr_released_at=now(),updated_at=now() where listing_id=l.id and quarantined and collectr_released_at is null
    and (source_reference=c.metadata->>'source_import_batch_id' or exists(select 1 from operation_import_rows r where r.batch_id::text=lot.source_reference and r.listing_id=l.id and r.status='committed' and r.raw ?& array['Portfolio Name','Product Name','Variance']))
    and not exists(select 1 from inventory_events e where e.listing_id=l.id and e.details ? 'quarantined' and e.created_at>=lot.created_at);
   if found then
    update listings set stock_revision=stock_revision+1 where id=l.id;
    insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,created_by,details)
     values(l.id,0,current_qty,current_qty,'Stock Collectr listo para publicar',run.id::text,coalesce(p_actor,run.actor),jsonb_build_object('automaticInitialRelease',true));
   end if;
   update card_printings set metadata=metadata||jsonb_build_object('collectr_intake_released_at',now()) where id=c.id;
  end if;
  if free_stock(l.id)<=0 then raise exception 'Sin stock disponible; revisa la cuarentena o las reservas'; end if;
  insert into market_prices(listing_id,provider,market_price_usd,amount,currency,source_url,market_subtype,condition,finish,language,exact_variant,match_confidence,provider_updated_at)
   values(l.id,'tcgplayer-via-tcgcsv',(ref->>'amount')::numeric,(ref->>'amount')::numeric,'USD',ref->>'sourceUrl','market_reference',l.condition,l.finish,c.language,false,'trusted_collectr_product',(ref->>'providerUpdatedAt')::timestamptz) returning id into evidence;
  update price_proposals set status='superseded' where listing_id=l.id and status='pending';
  insert into price_proposals(listing_id,current_price_crc,suggested_price_crc,market_price_usd,status,reviewed_by,reviewed_at,evidence_id,expected_revision,policy_revision,calculation,review_reason)
   values(l.id,old_price,price,(ref->>'amount')::numeric,'approved',coalesce(p_actor,run.actor),now(),evidence,l.price_revision,s.revision,
    jsonb_build_object('collectrAutomation',true,'sourceReference',ref,'languageUnconfirmed',c.language='unknown','fx',s.fx,'fxAt',s.fx_at,'fxSource',s.fx_source,'policy',s.policy,'marketTargetCrc',round(target),'floorCrc',ceil(floor_price),'explicitExceptionAccepted',p_force),
    case when p_force then 'Excepción aceptada en actualización rápida' else 'Regla automática: Collectr, producto y acabado exactos, referencia vigente' end) returning id into proposal;
  update listings set approved_price_crc=price,price_verified=true,published=true where id=l.id;
  answer=jsonb_build_object('name',c.canonical_name,'set',c.set_name,'number',c.collector_number,'before',old_price,'after',price,'published',true,'language',c.language,'sourceUrl',ref->>'sourceUrl','proposal',proposal);
  update store_update_items set status=case when old_price=price and was_published then 'unchanged' else 'updated' end,result=answer,updated_at=now() where id=item.id;
  insert into activity_log(actor,action,entity_id,details) values(coalesce(p_actor,run.actor),'automatic_collectr_price',l.id,answer||jsonb_build_object('run',run.id,'item',item.id));
 else
  answer=coalesce(answer,jsonb_build_object('name',c.canonical_name,'set',c.set_name,'number',c.collector_number,'before',old_price,'after',null,'reason',reason,'canAccept',false,'proof',proof));
  update store_update_items set status='review',result=answer,updated_at=now() where id=item.id;
 end if;
 if not exists(select 1 from store_update_items where run_id=run.id and status in ('pending','processing')) then update store_update_runs set status='completed',updated_at=now() where id=run.id; end if;
 return answer;
end $$;

create function finish_store_updates(p_items jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare entry jsonb; result jsonb='[]'; answer jsonb; current_item store_update_items;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Lote inválido'; end if;
 for entry in select value from jsonb_array_elements(p_items) loop
  begin
   answer=finish_store_update((entry->>'id')::uuid,(entry->>'token')::uuid,entry->'proof');
  exception when others then
   select * into current_item from store_update_items where id=(entry->>'id')::uuid for update;
   if current_item.status='processing' and current_item.lease_token=(entry->>'token')::uuid and current_item.lease_until>now() then
    answer=jsonb_build_object('name',entry#>>'{proof,expected,name}','set',entry#>>'{proof,expected,set}','number',entry#>>'{proof,expected,number}','reason','Hay stock retenido o datos modificados. Reintenta o revisa esta carta.','canAccept',false);
    update store_update_items set status='review',result=answer,updated_at=now() where id=current_item.id;
   else answer=jsonb_build_object('message','Otra ejecución continúa esta carta.'); end if;
  end;
  result=result||jsonb_build_array(answer);
 end loop;
 update store_update_runs r set status='completed',updated_at=now() where status='running' and not exists(select 1 from store_update_items i where i.run_id=r.id and i.status in ('pending','processing'));
 return result;
end $$;
revoke all on function finish_store_updates(jsonb) from public,anon,authenticated;
grant execute on function finish_store_updates(jsonb) to service_role;

-- JSON summary serves the whole flow; implementation details stay in audit records.
create function store_update_summary(p_run uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare run store_update_runs; result jsonb;
begin
 perform require_role(array['owner','reviewer','stock']);
 select * into run from store_update_runs where (p_run is null or id=p_run) order by created_at desc limit 1;
 if run.id is null then return jsonb_build_object('run',null,'total',0,'done',0,'updated',0,'unchanged',0,'review',0,'exceptions','[]'::jsonb); end if;
 select jsonb_build_object('run',to_jsonb(run),'total',count(*),'done',count(*) filter(where status not in ('pending','processing')),
 'updated',count(*) filter(where status='updated'),'unchanged',count(*) filter(where status='unchanged'),'review',count(*) filter(where status='review'),
 'importExceptions',coalesce((select jsonb_agg(jsonb_build_object('row',r.row_number,'name',r.normalized->>'name','reason',r.errors)) from operation_import_rows r where r.batch_id=run.batch_id and r.status in ('invalid','needs_review')),'[]'),'exceptions',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'listingId',i.listing_id,'name',i.result->>'name','set',i.result->>'set','number',i.result->>'number','before',i.result->'before','after',i.result->'after','reason',i.result->>'reason','canAccept',coalesce((i.result->>'canAccept')::boolean,false)) order by i.result->>'name',i.id) from store_update_items i where i.run_id=run.id and i.status='review'),'[]')) into result
 from store_update_items where run_id=run.id;
 return result;
end $$;

revoke all on function is_collectr_printing(uuid),store_card_snapshot(uuid),start_store_update(text,uuid,uuid,uuid),claim_store_updates(uuid,integer),refresh_store_exchange(uuid,numeric,timestamptz,text),finish_store_update(uuid,uuid,jsonb,boolean,uuid),store_update_summary(uuid) from public,anon,authenticated;
grant execute on function is_collectr_printing(uuid),store_card_snapshot(uuid),start_store_update(text,uuid,uuid,uuid),claim_store_updates(uuid,integer),refresh_store_exchange(uuid,numeric,timestamptz,text),finish_store_update(uuid,uuid,jsonb,boolean,uuid) to service_role;
grant execute on function store_update_summary(uuid) to authenticated,service_role;
create function begin_collectr_import(p_name text,p_hash text,p_actor uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare bid uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 if p_hash !~ '^[a-f0-9]{64}$' or length(p_name) not between 1 and 120 then raise exception 'Archivo inválido'; end if;
 insert into operation_import_batches(name,file_hash,mode,created_by,receipt_reference) values(p_name,p_hash,'receipt',p_actor,'missing-only/'||p_hash)
 on conflict(file_hash,mode,receipt_reference) do nothing;
 select id into bid from operation_import_batches where file_hash=p_hash and mode='receipt' and receipt_reference='missing-only/'||p_hash;
 return bid;
end $$;

create function save_collectr_rows(p_batch uuid,p_rows jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; lid uuid; pid uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 if jsonb_array_length(p_rows) not between 1 and 100 or not exists(select 1 from operation_import_batches where id=p_batch) then raise exception 'Filas inválidas'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_batch::text,3));
 for item in select value from jsonb_array_elements(p_rows) loop
  lid=null;pid=null;
  if item->>'decision'='existing' and jsonb_array_length(item->'existingIds')=1 then
   lid=(item#>>'{existingIds,0}')::uuid; select card_printing_id into pid from listings where id=lid;
  end if;
  insert into operation_import_rows(batch_id,row_number,raw,normalized,status,errors,card_printing_id,listing_id)
  values(p_batch,(item#>>'{row,rowNumber}')::integer,item#>'{row,raw}',item->'row',
   case when item->>'decision' in ('excluded','existing') then 'skipped' when item->>'decision'='review' then 'needs_review' else 'ready' end,
   case when item->>'decision'='review' then jsonb_build_array(item->>'reason') else coalesce(item#>'{row,errors}','[]') end,pid,lid)
  on conflict(batch_id,row_number) do nothing;
 end loop;
end $$;

create function receive_collectr_groups(p_batch uuid,p_groups jsonb,p_actor uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare g jsonb; row jsonb; pid uuid; lid uuid; quantity integer; received integer=0; hash text; made boolean;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 if jsonb_array_length(p_groups) not between 1 and 100 then raise exception 'Grupo inválido'; end if;
 select file_hash into hash from operation_import_batches where id=p_batch;
 if hash is null then raise exception 'Lote no encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended('receive_collectr',0));
 for g in select value from jsonb_array_elements(p_groups) loop
  row=g->'row'; quantity=(g->>'quantity')::integer; pid=null;lid=null;made=false;
  if quantity not between 1 and 100000 or not row->'raw' ?& array['Portfolio Name','Product Name','Category','Variance'] then raise exception 'Fila Collectr inválida'; end if;
  if exists(select 1 from operation_import_rows where batch_id=p_batch and row_number=(g#>>'{rows,0}')::integer and status='committed') then continue; end if;
  -- Recheck after taking the global intake lock, including source descriptions.
  select l.id,c.id into lid,pid from listings l join card_printings c on c.id=l.card_printing_id where c.game=row->>'game'
   and (lower(c.set_name)=lower(row->>'setName') or lower(c.metadata#>>'{original_data,Set}')=lower(row->>'setName'))
   and (lower(c.canonical_name)=lower(row->>'name') or c.metadata#>>'{original_data,Product Name}'=row#>>'{raw,Product Name}')
   and lower(c.collector_number)=lower(row->>'collectorNumber') and canonical_condition(l.condition)=row->>'condition' and canonical_finish(l.finish)=row->>'finish'
   and (row->>'language'='unknown' or canonical_language(c.language)='unknown' or canonical_language(c.language)=row->>'language')
   and c.treatment=row->>'treatment' and c.kind=row->>'kind' order by l.id limit 1;
  if lid is null then
   pid=(g->>'printingId')::uuid;lid=(g->>'listingId')::uuid;
   insert into card_printings(id,game,canonical_name,set_name,collector_number,language,treatment,kind,identity_verified,metadata)
   values(pid,row->>'game',row->>'name',row->>'setName',row->>'collectorNumber',row->>'language',row->>'treatment',row->>'kind',false,
    jsonb_build_object('source_format','collectr','original_data',row->'raw','identity_source','collectr','provisional_receipt',true,'source_import_batch_id',p_batch,'source_file_sha256',hash,'source_row_numbers',g->'rows'));
   insert into listings(id,card_printing_id,condition,finish,acquisition_cost,cost_confirmed,approved_price_crc,published)
   values(lid,pid,row->>'condition',row->>'finish',(row->>'acquisitionCostCrc')::numeric,row->>'acquisitionCostCrc' is not null,0,false);
   insert into stock_lots(listing_id,location_code,quantity,quarantined,unit_cost_crc,cost_verified,source_reference)
   values(lid,'UNASSIGNED',quantity,true,(row->>'acquisitionCostCrc')::numeric,row->>'acquisitionCostCrc' is not null,p_batch::text);
   insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,created_by)
   values(lid,quantity,0,quantity,'Recepción Collectr automática',p_batch::text,p_actor);
   received=received+1;made=true;
  end if;
  update operation_import_rows set status=case when made then 'committed' else 'skipped' end,card_printing_id=pid,listing_id=lid,committed_at=now() where batch_id=p_batch and row_number in(select value::text::integer from jsonb_array_elements(g->'rows')) and status not in ('committed','skipped');
 end loop;
 return received;
end $$;
revoke all on function begin_collectr_import(text,text,uuid),save_collectr_rows(uuid,jsonb),receive_collectr_groups(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function begin_collectr_import(text,text,uuid),save_collectr_rows(uuid,jsonb),receive_collectr_groups(uuid,jsonb,uuid) to service_role;

insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610210003','feature','simple_collectr_workflow','trustCollectr',true,'requireLocation',false,'allowUnknownLanguage',true));
notify pgrst,'reload schema';
commit;
