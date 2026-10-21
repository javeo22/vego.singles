begin;

-- The queue spans every update. The most recent result for each listing wins.
create function store_review_queue(p_listing uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare items jsonb; selected jsonb;
begin
 perform require_role(array['owner','reviewer','stock']);
 with latest as (
  select distinct on(i.listing_id) i.* from store_update_items i join store_update_runs r on r.id=i.run_id
  order by i.listing_id,r.created_at desc,r.id desc,i.created_at desc,i.id desc
 ) select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'listingId',l.id,'name',c.canonical_name) order by lower(c.canonical_name),l.id),'[]') into items
 from latest i join listings l on l.id=i.listing_id join card_printings c on c.id=l.card_printing_id
 where i.status='review' and l.archived_at is null;
 if p_listing is not null then
  select jsonb_build_object('id',i.id,'listingId',l.id,'status',i.status,'name',c.canonical_name,'set',c.set_name,'number',c.collector_number,
   'imageUrl',coalesce(c.stock_image_url,nullif(i.result#>>'{proof,product,imageUrl}','')),'language',c.language,'condition',l.condition,'finish',l.finish,'game',c.game,
   'before',l.approved_price_crc,'after',i.result->'after','reason',i.result->>'reason',
   'canAccept',coalesce((i.result->>'canAccept')::boolean,false),'sourceUrl',coalesce(i.result->>'sourceUrl',i.result#>>'{proof,reference,sourceUrl}'),
   'expected',store_card_snapshot(l.id),'published',l.published,'locked',coalesce(l.price_locked_until>now(),false),
   'minimumPrice',case when l.cost_confirmed then ceil((l.acquisition_cost+(s.policy->>'handlingCrc')::numeric+(s.policy->>'fixedFeeCrc')::numeric)/(1-(s.policy->>'variableFee')::numeric-(s.policy->>'targetMargin')::numeric)) else 1 end)
   into selected from store_update_items i join store_update_runs r on r.id=i.run_id join listings l on l.id=i.listing_id
   join card_printings c on c.id=l.card_printing_id cross join operation_settings s
   where i.listing_id=p_listing and l.archived_at is null order by r.created_at desc,r.id desc,i.created_at desc,i.id desc limit 1;
 end if;
 return jsonb_build_object('items',items,'selected',selected,'running',exists(select 1 from store_update_runs where status='running'));
end $$;
revoke all on function store_review_queue(uuid) from public,anon,authenticated;
grant execute on function store_review_queue(uuid) to authenticated,service_role;

-- Explicit seller price decisions have their own audit trail. They never create
-- a verified market quote, invent a language, or claim a physical inspection.
create function resolve_store_review(p_item uuid,p_expected jsonb,p_price integer,p_source text,p_note text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item store_update_items; latest uuid; l listings; c card_printings; s operation_settings;
 answer jsonb; proposal uuid; trusted boolean; lot_quantity integer; minimum numeric; note text; source text;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 if p_actor is not null and not exists(select 1 from admin_memberships where user_id=p_actor and role in ('owner','reviewer')) then raise exception 'Sin permiso' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('store_update',0));
 if exists(select 1 from store_update_runs where status='running') then raise exception 'Espera a que termine la actualización automática.'; end if;
 select * into item from store_update_items where id=p_item for update;
 if item.id is null then raise exception 'Carta no encontrada'; end if;
 if item.status in ('updated','unchanged') then return item.result; end if;
 select i.id into latest from store_update_items i join store_update_runs r on r.id=i.run_id where i.listing_id=item.listing_id order by r.created_at desc,r.id desc,i.created_at desc,i.id desc limit 1;
 if item.status<>'review' or item.id<>latest then raise exception 'La revisión cambió. Recarga esta carta.'; end if;
 select * into l from listings where id=item.listing_id for update;
 select * into c from card_printings where id=l.card_printing_id for update;
 select * into s from operation_settings for share;
 if p_expected is distinct from store_card_snapshot(l.id) then raise exception 'El precio o los datos cambiaron. Recarga esta carta.'; end if;
 if p_price is null then return finish_store_update(p_item,null,null,true,p_actor); end if;
 if p_price not between 1 and 100000000 then raise exception 'Indica un precio positivo en colones.'; end if;
 if l.archived_at is not null or l.price_locked_until>now() then raise exception 'Esta carta está archivada o tiene un bloqueo manual de precio.'; end if;
 trusted=is_collectr_printing(c.id);
 if (not trusted and not c.identity_verified) or (canonical_language(c.language)='unknown' and not trusted) then raise exception 'Esta ficha necesita completar sus datos de catálogo.'; end if;
 source=nullif(trim(p_source),''); note=coalesce(nullif(trim(p_note),''),'Precio decidido en revisión guiada');
 if length(note)>500 or (source is not null and (source!~'^https://' or length(source)>1000)) then raise exception 'Revisa la nota o el enlace HTTPS.'; end if;
 if l.cost_confirmed then
  minimum=ceil((l.acquisition_cost+(s.policy->>'handlingCrc')::numeric+(s.policy->>'fixedFeeCrc')::numeric)/(1-(s.policy->>'variableFee')::numeric-(s.policy->>'targetMargin')::numeric));
  if p_price<minimum then raise exception 'El precio está por debajo del mínimo según costo: ₡%',minimum; end if;
 end if;
 if trusted then
  update card_printings set identity_verified=true,metadata=metadata||jsonb_build_object('identity_source','collectr','identity_accepted_at',now()),updated_at=now() where id=c.id;
  select coalesce(sum(quantity),0) into lot_quantity from stock_lots where listing_id=l.id;
  update stock_lots lot set quarantined=false,collectr_released_at=now(),updated_at=now()
   where listing_id=l.id and quarantined and collectr_released_at is null
   and (source_reference=c.metadata->>'source_import_batch_id' or exists(select 1 from operation_import_rows r where r.batch_id::text=lot.source_reference and r.listing_id=l.id and r.status='committed' and r.raw ?& array['Portfolio Name','Product Name','Variance']))
   and not exists(select 1 from inventory_events e where e.listing_id=l.id and e.details ? 'quarantined' and e.created_at>=lot.created_at
    and not coalesce(e.reference_number=lot.source_reference and e.reason='Recepción CSV provisional: solo variantes ausentes' and e.details->>'source_file_sha256'=c.metadata->>'source_file_sha256' and e.quantity_change>0 and e.previous_quantity=0,false));
  if found then
   update listings set stock_revision=stock_revision+1 where id=l.id;
   insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,created_by,details)
    values(l.id,0,lot_quantity,lot_quantity,'Stock Collectr listo para publicar',item.run_id::text,p_actor,jsonb_build_object('automaticInitialRelease',true,'guidedReview',true));
  end if;
 end if;
 if free_stock(l.id)<=0 then raise exception 'Sin stock disponible. Conservamos las reservas y retenciones manuales.'; end if;
 update price_proposals set status='superseded' where listing_id=l.id and status='pending';
 insert into price_proposals(listing_id,current_price_crc,suggested_price_crc,status,reviewed_by,reviewed_at,expected_revision,policy_revision,calculation,review_reason)
 values(l.id,l.approved_price_crc,p_price,'approved',p_actor,now(),l.price_revision,s.revision,
  jsonb_build_object('manualSellerDecision',true,'guidedReview',true,'sourceUrl',source,'languageUnconfirmed',c.language='unknown','marketQuoteVerified',false),note) returning id into proposal;
 update listings set approved_price_crc=p_price,price_verified=true,published=true where id=l.id;
 answer=jsonb_build_object('name',c.canonical_name,'set',c.set_name,'number',c.collector_number,'before',l.approved_price_crc,'after',p_price,'published',true,'manualDecision',true,'note',note,'sourceUrl',source,'proposal',proposal);
 update store_update_items set status='updated',result=answer,updated_at=now() where id=item.id;
 insert into activity_log(actor,action,entity_id,details) values(p_actor,'resolve_store_review',l.id,answer||jsonb_build_object('item',item.id,'run',item.run_id));
 return answer;
end $$;
revoke all on function resolve_store_review(uuid,jsonb,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function resolve_store_review(uuid,jsonb,integer,text,text,uuid) to service_role;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610210006','feature','guided_review_queue'));
notify pgrst,'reload schema';
commit;
