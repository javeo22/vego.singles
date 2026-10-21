begin;

alter table purchase_requests add column if not exists delivery_fee_pending boolean not null default false;

create or replace function create_purchase_inquiry(p_items jsonb,p_fulfillment text,p_note text,p_key uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare req purchase_requests; l listings; c card_printings; s operation_settings; item jsonb; subtotal integer=0; delivery integer; response jsonb; lines jsonb='[]'; normalized_items jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor puede crear solicitudes' using errcode='42501'; end if;
 if p_key is null or coalesce(length(p_fingerprint),0)<16 then raise exception 'Solicitud inválida'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 or p_fulfillment is null or p_fulfillment not in ('delivery','express','pickup','duelist') or length(coalesce(p_note,''))>500 then raise exception 'Solicitud inválida'; end if;
 select jsonb_agg(value order by value->>'id') into normalized_items from jsonb_array_elements(p_items);
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,1));
 select * into req from purchase_requests where client_key=p_key;
 if req.id is not null then
  if req.fulfillment_method<>p_fulfillment or coalesce(req.customer_note,'')<>coalesce(p_note,'') or (select jsonb_agg(jsonb_build_object('id',listing_id,'quantity',requested_quantity) order by listing_id::text) from purchase_request_items where purchase_request_id=req.id)<>normalized_items then raise exception 'Clave reutilizada para otra solicitud'; end if;
  select jsonb_agg(jsonb_build_object('id',listing_id,'quantity',requested_quantity,'price',price_snapshot_crc,'variant',variant_snapshot) order by listing_id) into lines from purchase_request_items where purchase_request_id=req.id;
  return jsonb_build_object('number',req.request_number,'subtotal',req.subtotal_crc,'delivery',req.delivery_fee_crc,'deliveryPending',req.delivery_fee_pending,'total',req.total_crc,'items',lines);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,2));
 if (select count(*) from purchase_requests where fingerprint=p_fingerprint and created_at>now()-interval '1 hour')>=10 then raise exception 'Demasiadas solicitudes. Intenta más tarde'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) group by value->>'id' having count(*)>1) then raise exception 'Combina los artículos repetidos'; end if;
 select * into s from operation_settings;
 -- Support checkout pages opened before the release; new clients no longer offer duelist.
 delivery=case when p_fulfillment='duelist' then s.delivery_fee_crc else 0 end;
 insert into purchase_requests(request_number,fulfillment_method,delivery_fee_crc,delivery_fee_pending,subtotal_crc,total_crc,customer_note,client_key,fingerprint) values('VEG-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),p_fulfillment,delivery,p_fulfillment in ('delivery','express'),0,0,p_note,p_key,p_fingerprint) returning * into req;
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  select * into l from listings where id=(item->>'id')::uuid for update;
  select * into c from card_printings where id=l.card_printing_id;
  if l.id is null or not l.published or l.archived_at is not null or l.approved_price_crc<=0 or (item->>'quantity')::integer not between 1 and 100 or free_stock(l.id)<(item->>'quantity')::integer then raise exception 'Una carta cambió de disponibilidad. Actualiza el catálogo'; end if;
  insert into purchase_request_items(purchase_request_id,listing_id,requested_quantity,price_snapshot_crc,price_revision,variant_snapshot) values(req.id,l.id,(item->>'quantity')::integer,l.approved_price_crc,l.price_revision,jsonb_build_object('name',c.canonical_name,'set',c.set_name,'number',c.collector_number,'language',c.language,'condition',l.condition,'finish',l.finish,'treatment',c.treatment));
  subtotal=subtotal+l.approved_price_crc*(item->>'quantity')::integer;
  lines=lines||jsonb_build_object('id',l.id,'quantity',(item->>'quantity')::integer,'price',l.approved_price_crc,'variant',jsonb_build_object('name',c.canonical_name,'set',c.set_name,'number',c.collector_number,'language',c.language,'condition',l.condition,'finish',l.finish,'treatment',c.treatment));
 end loop;
 update purchase_requests set subtotal_crc=subtotal,total_crc=subtotal+delivery where id=req.id;
 return jsonb_build_object('number',req.request_number,'subtotal',subtotal,'delivery',delivery,'deliveryPending',p_fulfillment in ('delivery','express'),'total',subtotal+delivery,'items',lines);
end $$;

-- Expose the public printing's edition without changing inventory visibility or grants.
do $view$
declare definition text;
begin
 definition=pg_get_viewdef('public.storefront_inventory'::regclass,true);
 if position('''stock_image_url'', c.stock_image_url' in definition)=0 then
  raise exception 'The public inventory view changed; review the edition field before applying';
 end if;
 execute 'create or replace view public.storefront_inventory with (security_barrier=true) as '||replace(definition,'''stock_image_url'', c.stock_image_url','''stock_image_url'', c.stock_image_url, ''treatment'', c.treatment');
end $view$;

-- Preserve the existing audited/idempotent command dispatcher and its grants.
do $patch$
declare definition text;
begin
 definition=pg_get_functiondef('public.admin_command(text,jsonb,uuid)'::regprocedure);
 if position('jsonb_array_length(p_payload->''rows'') not between 1 and 1000' in definition)=0
    or position('when ''settings'' then' in definition)=0 then
  raise exception 'The operation dispatcher changed; review the delivery/import migration before applying';
 end if;
 definition=replace(definition,'jsonb_array_length(p_payload->''rows'') not between 1 and 1000','jsonb_array_length(p_payload->''rows'') not between 1 and 5000');
 definition=replace(definition,'when ''settings'' then',$command$
 when 'quote_delivery' then
  perform require_role(array['owner','stock']);
  select * into req from purchase_requests where id=(p_payload->>'id')::uuid for update;
  if req.id is null or req.status not in ('inquiry','reserved') then raise exception 'Solo cotiza envíos de solicitudes abiertas'; end if;
  target=(p_payload->>'amountCrc')::integer;
  if target is null or target not between 0 and 100000 or coalesce(length(trim(p_payload->>'reason')),0)<3 then raise exception 'Indica costo de envío y motivo válidos'; end if;
  if req.fulfillment_method='pickup' and target<>0 then raise exception 'El retiro no tiene costo de envío'; end if;
  update purchase_requests set delivery_fee_crc=target,delivery_fee_pending=false,total_crc=subtotal_crc+target where id=req.id;
  perform log_operation(p_action,req.id,p_payload);
  result=jsonb_build_object('message','Costo de envío confirmado');
 when 'settings' then
 $command$);
 execute definition;
end $patch$;

create function require_delivery_quote_before_sale() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status in ('sold','fulfilled','completed') and new.delivery_fee_pending then
  raise exception 'Confirma el costo de envío acordado por WhatsApp antes de registrar la venta';
 end if;
 return new;
end $$;
create trigger delivery_quote_before_sale before update of status on purchase_requests
 for each row execute function require_delivery_quote_before_sale();

revoke all on function require_delivery_quote_before_sale() from public,anon,authenticated;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610210001','feature','delivery_and_collectr'));
notify pgrst,'reload schema';
commit;

