-- Additive operations layer. Existing views and approved prices are retained.
begin;
create table public.admin_memberships(user_id uuid primary key references auth.users(id), role text not null check(role in ('owner','reviewer','stock')), created_at timestamptz not null default now());
insert into public.admin_memberships(user_id,role) select id,'owner' from auth.users where lower(email) in ('jav22vega@gmail.com','alevegaodio@gmail.com') on conflict do nothing;
create or replace function public.current_admin_role() returns text language sql stable security definer set search_path=public,pg_temp as $$ select case when auth.role()='service_role' then 'owner' else (select role from admin_memberships where user_id=auth.uid()) end $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select current_admin_role() is not null $$;
create function public.require_role(allowed text[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin if coalesce(current_admin_role(),'')<>all(allowed) then raise exception 'No tienes permiso para esta operación' using errcode='42501'; end if; end $$;

alter table card_printings drop constraint if exists card_printings_game_check;
alter table card_printings add constraint card_printings_game_check check(game in ('pokemon','magic','lorcana','star-wars'));
alter table card_printings add column identity_verified boolean not null default false, add column treatment text not null default 'standard', add column kind text not null default 'single' check(kind in ('single','sealed'));
alter table listings add column price_verified boolean not null default false, add column cost_confirmed boolean not null default false, add column price_revision integer not null default 0, add column stock_revision integer not null default 0, add column price_locked_until timestamptz;
alter table listings add column if not exists archived_at timestamptz;
-- Preserve existing merchandising decisions; new publication commands enforce full readiness.
update listings set price_verified=true where published and approved_price_crc>0;
alter table stock_lots add column quarantined boolean not null default false, add column unit_cost_crc numeric(12,2), add column cost_verified boolean not null default false, add column source_reference text;
alter table market_prices add column currency text not null default 'USD' check(currency in ('USD','CRC')), add column amount numeric(14,2), add column if not exists source_url text, add column condition text, add column finish text, add column language text, add column exact_variant boolean not null default false;
update market_prices set amount=market_price_usd;
alter table price_proposals drop constraint if exists price_proposals_status_check;
alter table price_proposals add constraint price_proposals_status_check check(status in ('pending','approved','rejected','superseded'));
alter table price_proposals add column evidence_id uuid references market_prices(id), add column expected_revision integer, add column calculation jsonb not null default '{}', add column review_reason text, add column policy_revision integer;
alter table inventory_events add column location_code text, add column details jsonb not null default '{}';
alter table purchase_requests add column customer_note text, add column client_key uuid unique, add column fingerprint text;
alter table purchase_request_items add column variant_snapshot jsonb not null default '{}', add column price_revision integer not null default 0;

create table locations(code text primary key check(code ~ '^[A-Z0-9_-]{1,32}$'),label text not null,active boolean not null default true);
insert into locations values ('SHELF1','Estante 1',true),('UNASSIGNED','Por ubicar',false);
create table operation_receipts(key uuid primary key, actor uuid, action text not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now());
create table activity_log(id uuid primary key default gen_random_uuid(),actor uuid,action text not null,entity_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now());
create table operation_settings(id boolean primary key default true check(id), revision integer not null default 1, policy jsonb not null default '{"marketFactor":1,"targetMargin":0.2,"variableFee":0,"handlingCrc":0,"fixedFeeCrc":0,"maxAgeHours":72}', fx numeric(12,4),fx_at timestamptz,fx_source text,daily_job_limit integer not null default 100 check(daily_job_limit between 1 and 1000),delivery_fee_crc integer not null default 500 check(delivery_fee_crc>=0),updated_at timestamptz not null default now());
insert into operation_settings(id) values(true);
create table catalog_aliases(id uuid primary key default gen_random_uuid(),game text not null,language text not null,input_set text not null,canonical_set text not null,unique(game,language,input_set));
create table external_references(provider text not null,external_id text not null,language text not null,treatment text not null default 'standard',card_printing_id uuid not null references card_printings(id),primary key(provider,external_id,language,treatment));
create unique index verified_printing_identity on card_printings(game,lower(set_name),lower(collector_number),lower(language),treatment,kind,(case when kind='sealed' then lower(canonical_name) else '' end)) where identity_verified;
create table import_batches(id uuid primary key default gen_random_uuid(),name text not null,file_hash text not null,mode text not null check(mode in ('receipt','snapshot')),created_by uuid,created_at timestamptz not null default now(),receipt_reference text not null default '',unique(file_hash,mode,receipt_reference));
create table import_rows(id uuid primary key default gen_random_uuid(),batch_id uuid not null references import_batches(id),row_number integer not null,raw jsonb not null,normalized jsonb not null,status text not null default 'needs_review' check(status in ('invalid','needs_review','ready','committed','skipped')),errors jsonb not null default '[]',candidates jsonb not null default '[]',card_printing_id uuid references card_printings(id),listing_id uuid references listings(id),expected_stock_revision integer,committed_at timestamptz,unique(batch_id,row_number));
create table reservations(id uuid primary key default gen_random_uuid(),request_id uuid not null references purchase_requests(id),listing_id uuid not null references listings(id),quantity integer not null check(quantity>0),status text not null default 'held' check(status in ('held','released','converted')),expires_at timestamptz not null,unique(request_id,listing_id));
create table operation_jobs(id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('match_import','refresh_price')),entity_id uuid not null,status text not null default 'pending' check(status in ('pending','running','succeeded','needs_review','failed')),attempts integer not null default 0,next_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,error text,result jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index active_job on operation_jobs(kind,entity_id) where status in ('pending','running');
create index stock_listing on stock_lots(listing_id);
create index market_listing_date on market_prices(listing_id,fetched_at desc);
create index proposals_pending on price_proposals(status,created_at desc);
create index import_row_batch on import_rows(batch_id,status);
create index held_reservations on reservations(listing_id,expires_at) where status='held';
create index jobs_ready on operation_jobs(status,next_at);
create index inquiry_fingerprint on purchase_requests(fingerprint,created_at);

-- All operational tables are private. Only RPC commands can mutate balances/decisions.
do $$ declare t text; p record; begin
 foreach t in array array['card_printings','listings','stock_lots','market_prices','price_proposals','purchase_requests','purchase_request_items','inventory_events','admin_memberships','locations','operation_receipts','activity_log','operation_settings','catalog_aliases','external_references','import_batches','import_rows','reservations','operation_jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop;
  execute format('create policy admin_read on public.%I for select to authenticated using(public.is_admin())',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function log_operation(a text,e uuid,d jsonb) returns void language sql security definer set search_path=public,pg_temp as $$ insert into activity_log(actor,action,entity_id,details) values(auth.uid(),a,e,d) $$;
create function touch_listing() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin new.updated_at=now(); if new.approved_price_crc is distinct from old.approved_price_crc or new.acquisition_cost is distinct from old.acquisition_cost or new.cost_confirmed is distinct from old.cost_confirmed or new.card_printing_id<>old.card_printing_id or new.condition<>old.condition or new.finish<>old.finish then new.price_revision=old.price_revision+1; end if; return new; end $$;
create trigger listing_revision before update on listings for each row execute function touch_listing();
create function free_stock(p_listing uuid) returns integer language plpgsql stable security definer set search_path=public,pg_temp as $$ begin perform require_role(array['owner','reviewer','stock']); return (coalesce((select sum(quantity) from stock_lots where listing_id=p_listing and not quarantined),0)-coalesce((select sum(quantity) from reservations where listing_id=p_listing and status='held' and expires_at>now()),0))::integer; end $$;
create function stock_change(p_listing uuid,p_delta integer,p_location text,p_reason text,p_reference text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare lot stock_lots; prev integer; l listings; remaining integer; removed integer; begin
 select * into l from listings where id=p_listing for update; if not found then raise exception 'Listado no encontrado'; end if;
 if length(trim(p_reason))<3 then raise exception 'Indica un motivo'; end if;
 if not exists(select 1 from locations where code=p_location and active) then raise exception 'Ubicación no válida'; end if;
 select coalesce(sum(quantity),0) into prev from stock_lots where listing_id=p_listing;
 if p_delta>=0 then
  -- New copies have no confirmed acquisition cost until explicitly supplied.
  insert into stock_lots(listing_id,location_code,quantity) values(p_listing,p_location,p_delta) returning * into lot;
 else
  if free_stock(p_listing)+p_delta<0 then raise exception 'Existencias insuficientes o reservadas'; end if;
  remaining=-p_delta;
  for lot in select * from stock_lots where listing_id=p_listing and location_code=p_location and not quarantined and quantity>0 order by created_at,id for update loop
   removed=least(remaining,lot.quantity);
   update stock_lots set quantity=quantity-removed,updated_at=now() where id=lot.id;
   remaining=remaining-removed; exit when remaining=0;
  end loop;
  if remaining>0 then raise exception 'Existencias insuficientes en la ubicación'; end if;
 end if;
 update listings set stock_revision=stock_revision+1 where id=p_listing;
 insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,created_by,location_code) values(p_listing,p_delta,prev,prev+p_delta,p_reason,p_reference,auth.uid(),p_location);
 perform refresh_listing_cost(p_listing); return lot.id;
end $$;

create view storefront_inventory with (security_barrier=true) as
 select l.id,l.approved_price_crc,l.condition,l.finish,c.kind,greatest(coalesce(st.quantity,0)-coalesce(rs.quantity,0),0)::integer quantity,
 jsonb_build_object('canonical_name',c.canonical_name,'set_name',c.set_name,'collector_number',c.collector_number,'language',c.language,'game',c.game,'stock_image_url',c.stock_image_url) card_printings
 from listings l join card_printings c on c.id=l.card_printing_id left join (select listing_id,sum(quantity) quantity from stock_lots where not quarantined group by listing_id) st on st.listing_id=l.id left join (select listing_id,sum(quantity) quantity from reservations where status='held' and expires_at>now() group by listing_id) rs on rs.listing_id=l.id where l.published and l.archived_at is null and l.approved_price_crc>0 and coalesce(st.quantity,0)-coalesce(rs.quantity,0)>0;
grant select on storefront_inventory to anon,authenticated;
create view operations_inventory with (security_invoker=true) as
 select l.id listing_id,c.id card_printing_id,c.canonical_name,c.set_name,c.collector_number,c.language,c.game,c.stock_image_url,c.catalog_source,c.external_card_id,c.tcgplayer_product_id,c.identity_verified,c.treatment,c.kind,l.condition,l.finish,l.published,l.archived_at,l.approved_price_crc,l.acquisition_cost,l.cost_confirmed,l.price_verified,l.price_revision,l.stock_revision,l.price_locked_until,
 coalesce((select sum(quantity) from stock_lots where listing_id=l.id),0)::integer quantity,free_stock(l.id) available_quantity,
 (select count(*) from price_proposals p where p.listing_id=l.id and p.status='pending') pending_prices
 from listings l join card_printings c on c.id=l.card_printing_id;
grant select on operations_inventory to authenticated,service_role;

create function propose_price(p_listing uuid,p_evidence uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare l listings; c card_printings; e market_prices; s operation_settings; target numeric; floor_price numeric; step integer; suggested integer; flags jsonb='[]'; result uuid; begin
 select * into l from listings where id=p_listing for update;
 select * into c from card_printings where id=l.card_printing_id;
 select * into e from market_prices where id=p_evidence and listing_id=p_listing;
 select * into s from operation_settings;
 if l.archived_at is not null then raise exception 'Listado archivado'; end if;
 if l.id is null or e.id is null then raise exception 'Referencia no encontrada'; end if;
 if not c.identity_verified or not e.exact_variant or e.amount is null or e.amount<=0 or e.condition<>l.condition or e.finish<>l.finish or e.language<>c.language then raise exception 'Confirma identidad y variante exacta'; end if;
 if l.price_locked_until>now() then raise exception 'Precio bloqueado por decisión manual'; end if;
 if coalesce(e.provider_updated_at,e.fetched_at)<now()-make_interval(hours=>(s.policy->>'maxAgeHours')::integer) or coalesce(e.provider_updated_at,e.fetched_at)>now()+interval '1 hour' then raise exception 'Referencia vencida o fecha inválida'; end if;
 if e.currency='USD' and (s.fx is null or s.fx_at is null or s.fx_at<now()-interval '7 days' or s.fx_at>now()+interval '1 hour') then raise exception 'Actualiza el tipo de cambio'; end if;
 target=e.amount*(case when e.currency='USD' then s.fx else 1 end)*(s.policy->>'marketFactor')::numeric;
 if l.cost_confirmed then floor_price=(l.acquisition_cost+(s.policy->>'handlingCrc')::numeric+(s.policy->>'fixedFeeCrc')::numeric)/(1-(s.policy->>'variableFee')::numeric-(s.policy->>'targetMargin')::numeric); else flags=flags||'"Costo por confirmar"'::jsonb; end if;
 step=case when target<10000 then 100 else 500 end;
 suggested=greatest(step,round(target/step)*step,coalesce(ceil(floor_price/step)*step,0));
 if floor_price>target then flags=flags||'"Margen mínimo supera referencia de mercado"'::jsonb; end if;
 if suggested>=50000 then flags=flags||'"Carta de alto valor"'::jsonb; end if;
 if l.approved_price_crc>0 and abs(suggested::numeric/l.approved_price_crc-1)>0.1 then flags=flags||'"Cambio mayor al 10%"'::jsonb; end if;
 if e.market_subtype='asking_price' then flags=flags||'"Precio anunciado: confirma comparabilidad"'::jsonb; end if;
 update price_proposals set status='superseded' where listing_id=l.id and status='pending';
 insert into price_proposals(listing_id,current_price_crc,suggested_price_crc,market_price_usd,evidence_id,expected_revision,policy_revision,calculation)
 values(l.id,l.approved_price_crc,suggested,e.market_price_usd,e.id,l.price_revision,s.revision,jsonb_build_object('marketTargetCrc',round(target),'floorCrc',ceil(floor_price),'step',step,'warnings',flags,'policy',s.policy,'fx',s.fx,'fxAt',s.fx_at,'fxSource',s.fx_source,'sourceUrl',e.source_url)) returning id into result;
 return result;
end $$;

create function admin_command(p_action text,p_payload jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; receipt operation_receipts; bid uuid; rid uuid; pid uuid; lid uuid; r import_rows; b import_batches; c card_printings; l listings; e market_prices; proposal price_proposals; s operation_settings; req purchase_requests; job operation_jobs; item jsonb; norm jsonb; prev integer; target integer; delta integer; left_to_remove integer; qty integer; lot stock_lots; candidate jsonb; lang text; cond text; fin text; why text; src text; old_location text;
begin
 perform require_role(array['owner','reviewer','stock']);
 if p_key is null then raise exception 'Falta clave de operación'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into receipt from operation_receipts where key=p_key;
 if found then
  if receipt.actor is distinct from auth.uid() or receipt.action<>p_action or receipt.payload<>p_payload then raise exception 'Clave reutilizada con otra operación'; end if;
  return receipt.result;
 end if;
 case p_action
 when 'stage_import' then
  perform require_role(array['owner','stock','reviewer']);
  if jsonb_array_length(p_payload->'rows') not between 1 and 1000 or length(p_payload->>'name') not between 1 and 120 or p_payload->>'mode' not in ('receipt','snapshot') then raise exception 'Lote inválido'; end if;
  select id into bid from import_batches where file_hash=p_payload->>'hash' and mode=p_payload->>'mode' and receipt_reference=coalesce(p_payload->>'reference','');
  if bid is null then
   insert into import_batches(name,file_hash,mode,created_by,receipt_reference) values(p_payload->>'name',p_payload->>'hash',p_payload->>'mode',auth.uid(),coalesce(p_payload->>'reference','')) returning id into bid;
   for item in select value from jsonb_array_elements(p_payload->'rows') loop
    insert into import_rows(batch_id,row_number,raw,normalized,status,errors) values(bid,(item->>'rowNumber')::integer,item->'raw',item,case when jsonb_array_length(item->'errors')>0 then 'invalid' else 'needs_review' end,item->'errors') returning id into rid;
    if jsonb_array_length(item->'errors')=0 then insert into operation_jobs(kind,entity_id) values('match_import',rid) on conflict do nothing; end if;
   end loop;
   perform log_operation(p_action,bid,jsonb_build_object('rows',jsonb_array_length(p_payload->'rows'),'mode',p_payload->>'mode'));
  end if;
  result=jsonb_build_object('id',bid,'message','Lote guardado. Revisa las coincidencias.');
 when 'skip_import' then
  update import_rows set status='skipped' where id=(p_payload->>'id')::uuid and status not in ('committed','skipped');
  result=jsonb_build_object('message','Fila omitida');
 when 'resolve_import' then
  perform require_role(array['owner','reviewer']);
  select * into r from import_rows where id=(p_payload->>'id')::uuid for update;
  if r.id is null or r.status in ('committed','skipped','invalid') then raise exception 'Fila no editable'; end if;
  lang=p_payload->>'language'; cond=p_payload->>'condition'; fin=p_payload->>'finish'; why=trim(p_payload->>'reason');
  if lang not in ('en','es','ja','zh','fr','de','it','pt','ko') or cond not in ('Near Mint','Lightly Played','Moderately Played','Heavily Played','Damaged','Sealed Product') or coalesce(length(fin),0)=0 or coalesce(length(why),0)<3 then raise exception 'Confirma idioma, condición, acabado y motivo'; end if;
  if p_payload->>'card_printing_id' is not null then select * into c from card_printings where id=(p_payload->>'card_printing_id')::uuid for update; end if;
  if c.id is null then
   candidate=p_payload->'candidate';
   if candidate is not null and candidate->>'provider'<>'manual' and canonical_language(candidate->>'language')<>lang then raise exception 'El idioma del proveedor no coincide con la variante confirmada'; end if;
   if candidate is null or length(candidate->>'name')=0 or length(candidate->>'setName')=0 or candidate->>'game'<>r.normalized->>'game' then raise exception 'Selecciona una coincidencia'; end if;
   select * into c from card_printings where game=candidate->>'game' and lower(set_name)=lower(candidate->>'setName') and same_collector_number(collector_number,candidate->>'collectorNumber') and language=lang and treatment=coalesce(candidate->>'treatment','standard') and kind=coalesce(candidate->>'kind','single') and (kind<>'sealed' or lower(canonical_name)=lower(candidate->>'name')) and identity_verified for update;
   if c.id is null then
    insert into card_printings(game,canonical_name,set_name,collector_number,language,catalog_source,external_card_id,stock_image_url,treatment,kind,identity_verified,metadata)
    values(candidate->>'game',candidate->>'name',candidate->>'setName',coalesce(candidate->>'collectorNumber',''),lang,coalesce(candidate->>'provider','manual'),nullif(candidate->>'externalId',''),nullif(candidate->>'imageUrl',''),coalesce(candidate->>'treatment','standard'),coalesce(candidate->>'kind','single'),true,jsonb_build_object('verification_reason',why)) returning * into c;
   end if;
  end if;
  if c.kind<>r.normalized->>'kind' then raise exception 'El tipo de producto no coincide'; end if;
  if c.game<>r.normalized->>'game' then raise exception 'El juego no coincide'; end if;
  if c.language<>'unknown' and canonical_language(c.language)<>lang then raise exception 'No cambies el idioma de otra impresión; crea la variante correcta'; end if;
  update card_printings set language=lang,identity_verified=true,metadata=metadata||jsonb_build_object('verification_reason',why),updated_at=now() where id=c.id;
  if c.external_card_id is not null then insert into external_references(provider,external_id,language,treatment,card_printing_id) values(coalesce(c.catalog_source,'manual'),c.external_card_id,lang,c.treatment,c.id) on conflict do nothing; end if;
  insert into catalog_aliases(game,language,input_set,canonical_set) values(c.game,lang,lower(r.normalized->>'setName'),c.set_name) on conflict(game,language,input_set) do update set canonical_set=excluded.canonical_set;
  select * into l from listings where card_printing_id=c.id and condition=cond and finish=fin for update;
  norm=r.normalized||jsonb_build_object('language',lang,'condition',cond,'finish',fin);
  update import_rows set normalized=norm,card_printing_id=c.id,listing_id=l.id,expected_stock_revision=coalesce(l.stock_revision,0),status='ready',errors='[]' where id=r.id;
  perform log_operation(p_action,r.id,jsonb_build_object('printing',c.id,'reason',why));
  result=jsonb_build_object('message','Coincidencia verificada');
 when 'commit_import' then
  perform require_role(array['owner','stock']);
  select * into b from import_batches where id=(p_payload->>'id')::uuid for update;
  if b.id is null then raise exception 'Lote no encontrado'; end if;
  if not exists(select 1 from locations where code=p_payload->>'location' and active) then raise exception 'Selecciona ubicación'; end if;
  if b.mode='snapshot' and exists(select 1 from import_rows where batch_id=b.id and status in ('invalid','needs_review')) then raise exception 'Resuelve u omite todas las filas antes de reconciliar un snapshot'; end if;
  if b.mode='snapshot' and exists(select 1 from import_rows where batch_id=b.id and status='ready' group by card_printing_id,normalized->>'condition',normalized->>'finish' having count(*)>1) then raise exception 'Combina las filas duplicadas de cada variante en el snapshot'; end if;
  -- Stable SKU order prevents deadlocks when two overlapping batches commit.
  for r in select * from import_rows where batch_id=b.id and status='ready' order by card_printing_id,normalized->>'condition',normalized->>'finish',id for update loop
   select * into c from card_printings where id=r.card_printing_id for update;
   if not c.identity_verified or c.language='unknown' then raise exception 'Identidad pendiente'; end if;
   insert into listings(card_printing_id,condition,finish,acquisition_cost,cost_confirmed) values(c.id,r.normalized->>'condition',r.normalized->>'finish',(r.normalized->>'acquisitionCostCrc')::numeric,r.normalized->>'acquisitionCostCrc' is not null) on conflict(card_printing_id,condition,finish) do nothing;
   select * into l from listings where card_printing_id=c.id and condition=r.normalized->>'condition' and finish=r.normalized->>'finish' for update;
   qty=(r.normalized->>'quantity')::integer;
   if qty not between 0 and 100000 then raise exception 'Cantidad inválida'; end if;
   if b.mode='receipt' then
    pid=stock_change(l.id,qty,p_payload->>'location','Recepción de importación',b.id::text);
    update stock_lots set unit_cost_crc=(r.normalized->>'acquisitionCostCrc')::numeric,cost_verified=r.normalized->>'acquisitionCostCrc' is not null,source_reference=b.id::text where id=pid;
    perform refresh_listing_cost(l.id);
   else
    if l.stock_revision<>r.expected_stock_revision then raise exception 'El stock cambió desde la revisión. Revisa de nuevo el snapshot'; end if;
    select coalesce(sum(quantity),0) into prev from stock_lots where listing_id=l.id;
    delta=qty-prev;
    if delta<0 then
     if free_stock(l.id)+delta<0 then raise exception 'El snapshot eliminaría stock reservado'; end if;
     left_to_remove=-delta;
     for lot in select * from stock_lots where listing_id=l.id and not quarantined and quantity>0 order by created_at,id for update loop
      target=least(left_to_remove,lot.quantity);
      update stock_lots set quantity=quantity-target,updated_at=now() where id=lot.id;
      left_to_remove=left_to_remove-target; exit when left_to_remove=0;
     end loop;
     if left_to_remove>0 then raise exception 'Revisa el stock en cuarentena antes de reconciliar'; end if;
     update listings set stock_revision=stock_revision+1 where id=l.id;
     insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,created_by) values(l.id,delta,prev,qty,'Reconciliación de snapshot',b.id::text,auth.uid());
    elsif delta>0 then perform stock_change(l.id,delta,p_payload->>'location','Reconciliación de snapshot',b.id::text); end if;
    perform refresh_listing_cost(l.id);
   end if;
   update import_rows set status='committed',listing_id=l.id,committed_at=now() where id=r.id;
  end loop;
  perform log_operation(p_action,b.id,jsonb_build_object('mode',b.mode,'location',p_payload->>'location'));
  result=jsonb_build_object('message','Filas listas incorporadas al inventario');
 when 'verify_listing' then
  perform require_role(array['owner','reviewer']);
  select * into l from listings where id=(p_payload->>'id')::uuid for update;
  select * into c from card_printings where id=l.card_printing_id for update;
  if c.id is null then raise exception 'Listado no encontrado'; end if;
  lang=p_payload->>'language'; why=trim(p_payload->>'reason');
  if lang not in ('en','es','ja','zh','fr','de','it','pt','ko') or coalesce(length(why),0)<3 then raise exception 'Confirma idioma y motivo'; end if;
  if canonical_language(c.language)<>lang then update listings set price_revision=price_revision+1,price_verified=false,published=false where card_printing_id=c.id; end if;
  update card_printings set language=lang,identity_verified=true,stock_image_url=coalesce(nullif(p_payload->>'imageUrl',''),stock_image_url),catalog_source=coalesce(nullif(p_payload->>'provider',''),catalog_source),external_card_id=coalesce(nullif(p_payload->>'externalId',''),external_card_id),metadata=metadata||jsonb_build_object('verification_reason',why),updated_at=now() where id=c.id;
  if p_payload ? 'acquisitionCostCrc' and p_payload->>'acquisitionCostCrc' is not null then
   if (p_payload->>'acquisitionCostCrc')::numeric<0 then raise exception 'Costo inválido'; end if;
   update stock_lots set unit_cost_crc=(p_payload->>'acquisitionCostCrc')::numeric,cost_verified=true where listing_id=l.id and not cost_verified;
   update listings set acquisition_cost=(p_payload->>'acquisitionCostCrc')::numeric,cost_confirmed=true where id=l.id;
   perform refresh_listing_cost(l.id);
  end if;
  if p_payload ? 'condition' or p_payload ? 'finish' then
   update listings set condition=coalesce(p_payload->>'condition',condition),finish=coalesce(p_payload->>'finish',finish),price_verified=case when coalesce(p_payload->>'condition',condition)<>condition or coalesce(p_payload->>'finish',finish)<>finish then false else price_verified end,published=case when coalesce(p_payload->>'condition',condition)<>condition or coalesce(p_payload->>'finish',finish)<>finish then false else published end where id=l.id;
  end if;
  perform log_operation(p_action,l.id,p_payload-'id');
  result=jsonb_build_object('message','Identidad y costo actualizados');
 when 'stock_adjust' then
  perform require_role(array['owner','stock']);
  delta=(p_payload->>'delta')::integer;
  if abs(delta)>100000 or delta=0 then raise exception 'Cantidad inválida'; end if;
  perform stock_change((p_payload->>'id')::uuid,delta,p_payload->>'location',p_payload->>'reason',p_key::text);
  result=jsonb_build_object('message','Movimiento registrado');
 when 'stock_transfer' then
  perform require_role(array['owner','stock']);
  lid=(p_payload->>'id')::uuid; qty=(p_payload->>'quantity')::integer;
  old_location=p_payload->>'from'; src=p_payload->>'to'; why=trim(p_payload->>'reason');
  perform 1 from listings where id=lid for update;
  if qty<=0 or old_location=src or coalesce(length(why),0)<3 or not exists(select 1 from locations where code=src and active) then raise exception 'Traslado inválido'; end if;
  if (select coalesce(sum(quantity),0) from stock_lots where listing_id=lid and location_code=old_location and not quarantined)<qty then raise exception 'Cantidad insuficiente en origen'; end if;
  select coalesce(sum(quantity),0) into prev from stock_lots where listing_id=lid;
  left_to_remove=qty;
  for lot in select * from stock_lots where listing_id=lid and location_code=old_location and not quarantined and quantity>0 order by created_at,id for update loop
   target=least(left_to_remove,lot.quantity);
   update stock_lots set quantity=quantity-target,updated_at=now() where id=lot.id;
   insert into stock_lots(listing_id,location_code,quantity,unit_cost_crc,cost_verified,source_reference,created_at) values(lid,src,target,lot.unit_cost_crc,lot.cost_verified,lot.source_reference,lot.created_at);
   left_to_remove=left_to_remove-target; exit when left_to_remove=0;
  end loop;

  update listings set stock_revision=stock_revision+1 where id=lid;
  insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,created_by,location_code,details) values(lid,0,prev,prev,why,p_key::text,auth.uid(),src,jsonb_build_object('from',old_location,'to',src,'quantity',qty));
  result=jsonb_build_object('message','Traslado registrado');
 when 'lot_cost' then
  perform require_role(array['owner','reviewer']);
  select listing_id into lid from stock_lots where id=(p_payload->>'id')::uuid;
  perform 1 from listings where id=lid for update;
  if lid is null or (p_payload->>'cost')::numeric<0 or coalesce(length(trim(p_payload->>'reason')),0)<3 then raise exception 'Costo o motivo inválido'; end if;
  update stock_lots set unit_cost_crc=(p_payload->>'cost')::numeric,cost_verified=true where id=(p_payload->>'id')::uuid;
  perform refresh_listing_cost(lid); perform log_operation(p_action,lid,p_payload);
  result=jsonb_build_object('message','Costo del lote confirmado');
 when 'quarantine_lot' then
  perform require_role(array['owner','stock']);
  select listing_id into lid from stock_lots where id=(p_payload->>'id')::uuid;
  perform 1 from listings where id=lid for update;
  select * into lot from stock_lots where id=(p_payload->>'id')::uuid for update;
  if lot.id is null or coalesce(length(trim(p_payload->>'reason')),0)<3 then raise exception 'Lote o motivo inválido'; end if;
  if (p_payload->>'quarantined')::boolean and not lot.quarantined and free_stock(lid)<lot.quantity then raise exception 'El lote tiene stock reservado'; end if;
  update stock_lots set quarantined=(p_payload->>'quarantined')::boolean where id=lot.id;
  update listings set stock_revision=stock_revision+1 where id=lid;
  select coalesce(sum(quantity),0) into prev from stock_lots where listing_id=lid;
  insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,created_by,location_code,details) values(lid,0,prev,prev,p_payload->>'reason',p_key::text,auth.uid(),lot.location_code,jsonb_build_object('quarantined',p_payload->'quarantined'));
  perform refresh_listing_cost(lid);perform log_operation(p_action,lid,p_payload);
  result=jsonb_build_object('message','Estado del lote actualizado');
 when 'evidence' then
  perform require_role(array['owner','reviewer']);
  select * into l from listings where id=(p_payload->>'id')::uuid for update;
  select * into c from card_printings where id=l.card_printing_id;
  if not c.identity_verified or (p_payload->>'amount')::numeric<=0 or p_payload->>'currency' not in ('USD','CRC') or (p_payload->>'exactVariant')::boolean is not true then raise exception 'Verifica impresión y precio exacto'; end if;
  insert into market_prices(listing_id,provider,market_price_usd,amount,currency,source_url,market_subtype,condition,finish,language,exact_variant,match_confidence,provider_updated_at)
  values(l.id,p_payload->>'provider',case when p_payload->>'currency'='USD' then (p_payload->>'amount')::numeric end,(p_payload->>'amount')::numeric,p_payload->>'currency',p_payload->>'sourceUrl',p_payload->>'priceType',l.condition,l.finish,c.language,true,'verified',(p_payload->>'observedAt')::timestamptz) returning id into pid;
  rid=propose_price(l.id,pid);
  update operation_jobs set status='succeeded',updated_at=now() where kind='refresh_price' and entity_id=l.id and status='needs_review';
  perform log_operation(p_action,l.id,jsonb_build_object('evidence',pid,'proposal',rid));
  result=jsonb_build_object('id',rid,'message','Referencia guardada y propuesta calculada');
 when 'bulk_price' then
  perform require_role(array['owner','reviewer']);
  if jsonb_array_length(p_payload->'ids') not between 1 and 50 then raise exception 'Selecciona de 1 a 50 propuestas'; end if;
  perform 1 from listings where id in (select listing_id from price_proposals where id in (select value::text::uuid from jsonb_array_elements_text(p_payload->'ids'))) order by id for update;
  for item in select value from jsonb_array_elements(p_payload->'ids') loop perform admin_command('review_price',jsonb_build_object('id',item,'approve',p_payload->'approve','reason',p_payload->>'reason'),gen_random_uuid()); end loop;
  result=jsonb_build_object('message','Revisiones guardadas');
 when 'review_price' then
  perform require_role(array['owner','reviewer']);
  select listing_id into lid from price_proposals where id=(p_payload->>'id')::uuid;
  select * into l from listings where id=lid for update;
  select * into proposal from price_proposals where id=(p_payload->>'id')::uuid for update;
  select * into s from operation_settings;
  if proposal.id is null or proposal.status<>'pending' then raise exception 'Propuesta ya revisada'; end if;
  why=trim(p_payload->>'reason');
  if coalesce(length(why),0)<3 then raise exception 'Indica motivo de revisión'; end if;
  if (p_payload->>'approve')::boolean then
   if l.archived_at is not null then raise exception 'Listado archivado'; end if;
   select * into e from market_prices where id=proposal.evidence_id;
   select * into c from card_printings where id=l.card_printing_id;
   if proposal.expected_revision is distinct from l.price_revision or proposal.policy_revision is distinct from s.revision or proposal.current_price_crc<>l.approved_price_crc then raise exception 'Propuesta vencida: precio o política cambió'; end if;
   if not c.identity_verified or not e.exact_variant or e.language<>c.language or e.condition<>l.condition or e.finish<>l.finish then raise exception 'Identidad o variante cambió'; end if;
   if l.price_locked_until>now() then raise exception 'Precio bloqueado'; end if;
   if coalesce(e.provider_updated_at,e.fetched_at)<now()-make_interval(hours=>(s.policy->>'maxAgeHours')::integer) then raise exception 'Referencia vencida'; end if;
   if e.currency='USD' and (s.fx_at is null or s.fx_at<now()-interval '7 days') then raise exception 'Tipo de cambio vencido'; end if;
   update listings set approved_price_crc=proposal.suggested_price_crc,price_verified=true where id=l.id;
   update price_proposals set status='superseded' where listing_id=l.id and status='pending' and id<>proposal.id;
  end if;
  update price_proposals set status=case when (p_payload->>'approve')::boolean then 'approved' else 'rejected' end,review_reason=why,reviewed_by=auth.uid(),reviewed_at=now() where id=proposal.id;
  perform log_operation(p_action,l.id,p_payload);
  result=jsonb_build_object('message','Revisión guardada');
 when 'price_lock' then
  perform require_role(array['owner','reviewer']);
  if coalesce(length(trim(p_payload->>'reason')),0)<3 then raise exception 'Indica un motivo'; end if;
  update listings set price_locked_until=(p_payload->>'until')::timestamptz where id=(p_payload->>'id')::uuid;
  if not found then raise exception 'Listado no encontrado'; end if;
  perform log_operation(p_action,(p_payload->>'id')::uuid,p_payload);
  result=jsonb_build_object('message','Bloqueo actualizado');
 when 'publish' then
  perform require_role(array['owner','reviewer']);
  select * into l from listings where id=(p_payload->>'id')::uuid for update;
  if l.id is null then raise exception 'Listado no encontrado'; end if;
  select * into c from card_printings where id=l.card_printing_id;
  if (p_payload->>'published')::boolean and l.archived_at is not null then raise exception 'Listado archivado'; end if;
  if (p_payload->>'published')::boolean and (not c.identity_verified or c.language='unknown' or l.condition='unknown' or length(l.finish)=0 or not l.price_verified or l.approved_price_crc<=0 or free_stock(l.id)<=0 or exists(select 1 from stock_lots where listing_id=l.id and not quarantined and quantity>0 and location_code='UNASSIGNED')) then raise exception 'Falta identidad, precio, stock o ubicación verificados'; end if;
  update listings set published=(p_payload->>'published')::boolean where id=l.id;
  perform log_operation(p_action,l.id,p_payload);
  result=jsonb_build_object('message','Publicación actualizada');
 when 'settings' then
  perform require_role(array['owner']);
  item=p_payload->'policy';
  if item is null or not (item ?& array['marketFactor','targetMargin','variableFee','handlingCrc','fixedFeeCrc','maxAgeHours']) then raise exception 'Política incompleta'; end if;
  if (item->>'marketFactor')::numeric not between 0.5 and 2 or (item->>'targetMargin')::numeric not between 0 and 0.8 or (item->>'variableFee')::numeric not between 0 and 0.3 or (item->>'targetMargin')::numeric+(item->>'variableFee')::numeric>=1 or (item->>'handlingCrc')::integer not between 0 and 10000 or (item->>'fixedFeeCrc')::integer not between 0 and 10000 or (item->>'maxAgeHours')::integer not between 1 and 720 then raise exception 'Política inválida'; end if;
  if p_payload->>'fx' is not null and ((p_payload->>'fx')::numeric not between 1 and 10000 or p_payload->>'fxAt' is null or p_payload->>'fxSource' is null) then raise exception 'Tipo de cambio inválido'; end if;
  update operation_settings set daily_job_limit=coalesce((p_payload->>'dailyJobLimit')::integer,100),policy=item,fx=(p_payload->>'fx')::numeric,fx_at=(p_payload->>'fxAt')::timestamptz,fx_source=p_payload->>'fxSource',delivery_fee_crc=(p_payload->>'deliveryFeeCrc')::integer,revision=revision+1,updated_at=now();
  perform log_operation(p_action,null,p_payload);
  result=jsonb_build_object('message','Política guardada; recalcula propuestas pendientes');
 when 'location' then
  perform require_role(array['owner']);
  insert into locations(code,label) values(p_payload->>'code',p_payload->>'label') on conflict(code) do update set label=excluded.label,active=true;
  result=jsonb_build_object('message','Ubicación guardada');
 when 'revoke_membership' then
  perform require_role(array['owner']);
  select id into rid from auth.users where lower(email)=lower(p_payload->>'email');
  if rid is null or rid=auth.uid() then raise exception 'No puedes quitar tu propio acceso'; end if;
  delete from admin_memberships where user_id=rid;
  perform log_operation(p_action,rid,'{}');
  result=jsonb_build_object('message','Acceso revocado');
 when 'membership' then
  perform require_role(array['owner']);
  select id into rid from auth.users where lower(email)=lower(p_payload->>'email');
  if rid is null then raise exception 'La persona debe iniciar sesión primero'; end if;
  if rid=auth.uid() and p_payload->>'role'<>'owner' then raise exception 'No cambies tu propio rol de propietario'; end if;
  insert into admin_memberships(user_id,role) values(rid,p_payload->>'role') on conflict(user_id) do update set role=excluded.role;
  perform log_operation(p_action,rid,jsonb_build_object('role',p_payload->>'role'));
  result=jsonb_build_object('message','Rol guardado');
 when 'enqueue_refresh' then
  perform require_role(array['owner','reviewer']);
  insert into operation_jobs(kind,entity_id) select 'refresh_price',l.id from listings l join card_printings c on c.id=l.card_printing_id where l.archived_at is null and c.identity_verified and free_stock(l.id)>0 and (l.price_locked_until is null or l.price_locked_until<=now()) and not exists(select 1 from operation_jobs j where j.kind='refresh_price' and j.entity_id=l.id and (j.status in ('pending','running') or j.updated_at>now()-interval '24 hours')) order by l.id limit 50 on conflict do nothing;
  result=jsonb_build_object('message','Hasta 50 cartas verificadas agregadas a la cola de mercado');
 when 'enqueue' then
  perform require_role(array['owner','reviewer']);
  insert into operation_jobs(kind,entity_id) values(p_payload->>'kind',(p_payload->>'id')::uuid) on conflict do nothing;
  result=jsonb_build_object('message','Trabajo en cola');
 when 'claim_job' then
  perform require_role(array['owner','reviewer']);
  if (select count(*) from activity_log where action='worker_claim' and created_at>now()-interval '24 hours')>=(select daily_job_limit from operation_settings) then raise exception 'Límite diario de trabajos alcanzado. Revisa Ajustes'; end if;
  update operation_jobs set status='failed',error='Se agotaron los reintentos',updated_at=now() where status='running' and lease_until<now() and attempts>=5;
  select * into job from operation_jobs where attempts<5 and ((status='pending' and next_at<=now()) or (status='running' and lease_until<now())) order by created_at for update skip locked limit 1;
  if job.id is not null then update operation_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',updated_at=now() where id=job.id returning * into job; perform log_operation('worker_claim',job.id,'{}'); end if;
  result=case when job.id is null then 'null'::jsonb else to_jsonb(job) end;
 when 'finish_job' then
  perform require_role(array['owner','reviewer']);
  select * into job from operation_jobs where id=(p_payload->>'id')::uuid for update;
  if job.status<>'running' or job.lease_token is distinct from (p_payload->>'token')::uuid or job.lease_until<now() then raise exception 'El trabajo perdió su turno'; end if;
  if p_payload->>'status' not in ('succeeded','needs_review','failed','pending') then raise exception 'Resultado inválido'; end if;
  if job.kind='match_import' and p_payload->>'automatic' is not null then
   select * into r from import_rows where id=job.entity_id for update;
   select * into c from card_printings where id=(p_payload->>'automatic')::uuid;
   if r.status='needs_review' then
    if not c.identity_verified or canonical_language(c.language)<>r.normalized->>'language' or c.game<>r.normalized->>'game' or not same_collector_number(c.collector_number,r.normalized->>'collectorNumber') or c.kind<>r.normalized->>'kind' or lower(c.set_name)<>lower(coalesce((select canonical_set from catalog_aliases where game=r.normalized->>'game' and language=r.normalized->>'language' and input_set=lower(r.normalized->>'setName') limit 1),r.normalized->>'setName')) or c.treatment<>r.normalized->>'treatment' then raise exception 'La coincidencia exacta cambió'; end if;
    perform admin_command('resolve_import',jsonb_build_object('id',r.id,'card_printing_id',c.id,'language',r.normalized->>'language','condition',r.normalized->>'condition','finish',r.normalized->>'finish','reason','Coincidencia exacta con impresión previamente verificada'),gen_random_uuid());
   end if;
  end if;
  update operation_jobs set status=case when p_payload->>'status'='pending' and attempts>=5 then 'failed' else p_payload->>'status' end,error=left(p_payload->>'error',500),result=p_payload->'result',lease_until=null,next_at=now()+make_interval(secs=>least(3600,30*power(2,job.attempts)::integer)),updated_at=now() where id=job.id;
  if job.kind='match_import' and p_payload->'candidates' is not null then update import_rows set candidates=p_payload->'candidates' where id=job.entity_id and status='needs_review'; end if;
  result=jsonb_build_object('message','Trabajo actualizado');
 when 'retry_job' then
  perform require_role(array['owner','reviewer']);
  update operation_jobs set status='pending',attempts=0,error=null,next_at=now() where id=(p_payload->>'id')::uuid and status in ('failed','needs_review');
  result=jsonb_build_object('message','Trabajo listo para reintentar');
 when 'reserve_request' then
  perform require_role(array['owner','stock']);
  select * into req from purchase_requests where id=(p_payload->>'id')::uuid for update;
  if req.id is null or req.status<>'inquiry' then raise exception 'Solo se reservan consultas abiertas'; end if;
  qty=(p_payload->>'hours')::integer;
  if qty not between 1 and 72 then raise exception 'Reserva entre 1 y 72 horas'; end if;
  for item in select to_jsonb(i) from purchase_request_items i where purchase_request_id=req.id order by listing_id loop
   select * into l from listings where id=(item->>'listing_id')::uuid for update;
   if l.approved_price_crc<>(item->>'price_snapshot_crc')::integer or l.price_revision<>(item->>'price_revision')::integer then raise exception 'Precio cambió. Actualiza la cotización antes de reservar'; end if;
   if free_stock(l.id)<(item->>'requested_quantity')::integer then raise exception 'Stock insuficiente para reservar'; end if;
   insert into reservations(request_id,listing_id,quantity,expires_at) values(req.id,l.id,(item->>'requested_quantity')::integer,now()+make_interval(hours=>qty)) on conflict(request_id,listing_id) do update set quantity=excluded.quantity,status='held',expires_at=excluded.expires_at;
  end loop;
  update purchase_requests set status='reserved',confirmed_by=auth.uid(),confirmed_at=now() where id=req.id;
  perform log_operation(p_action,req.id,p_payload);
  result=jsonb_build_object('message','Reserva confirmada');
 when 'refresh_request' then
  perform require_role(array['owner','stock']);
  select * into req from purchase_requests where id=(p_payload->>'id')::uuid for update;
  if req.id is null or req.status<>'inquiry' then raise exception 'Solo se actualizan consultas abiertas'; end if;
  update purchase_request_items i set price_snapshot_crc=l.approved_price_crc,price_revision=l.price_revision from listings l where i.purchase_request_id=req.id and l.id=i.listing_id;
  select sum(requested_quantity*price_snapshot_crc) into prev from purchase_request_items where purchase_request_id=req.id;
  update purchase_requests set subtotal_crc=prev,total_crc=prev+delivery_fee_crc where id=req.id;
  perform log_operation(p_action,req.id,'{}');
  result=jsonb_build_object('message','Cotización actualizada. Confirma el nuevo total con el cliente.');
 when 'cancel_request' then
  perform require_role(array['owner','stock']);
  select * into req from purchase_requests where id=(p_payload->>'id')::uuid for update;
  if req.id is null or req.status not in ('inquiry','reserved') then raise exception 'Solicitud no cancelable'; end if;
  if coalesce(length(trim(p_payload->>'reason')),0)<3 then raise exception 'Indica motivo'; end if;
  -- Serialize reservation release with sales and stock adjustments.
  perform 1 from listings where id in (select listing_id from purchase_request_items where purchase_request_id=req.id) order by id for update;
  update reservations set status='released' where request_id=req.id and status='held';
  update purchase_requests set status='cancelled' where id=req.id;
  perform log_operation(p_action,req.id,p_payload);
  result=jsonb_build_object('message','Solicitud cancelada y reserva liberada');
 when 'sell_request' then
  perform require_role(array['owner','stock']);
  select * into req from purchase_requests where id=(p_payload->>'id')::uuid for update;
  if req.id is null or req.status<>'reserved' then raise exception 'Confirma la reserva antes de registrar la venta'; end if;
  perform 1 from listings where id in (select listing_id from purchase_request_items where purchase_request_id=req.id) order by id for update;
  if exists(select 1 from reservations where request_id=req.id and (status<>'held' or expires_at<=now())) or (select count(*) from reservations where request_id=req.id)<>(select count(*) from purchase_request_items where purchase_request_id=req.id) then raise exception 'Reserva vencida. Cancela y confirma una nueva solicitud'; end if;
  update reservations set status='converted' where request_id=req.id;
  for item in select to_jsonb(i) from purchase_request_items i where purchase_request_id=req.id order by listing_id loop
   lid=(item->>'listing_id')::uuid; left_to_remove=(item->>'requested_quantity')::integer;
   for lot in select * from stock_lots where listing_id=lid and not quarantined and quantity>0 order by created_at,id for update loop
    target=least(left_to_remove,lot.quantity);
    -- Legacy unassigned locations are not saleable until physically located.
    perform stock_change(lid,-target,lot.location_code,'Venta confirmada',req.request_number);
    left_to_remove=left_to_remove-target; exit when left_to_remove=0;
   end loop;
   if left_to_remove>0 then raise exception 'Stock insuficiente'; end if;
  end loop;
  update purchase_requests set status='sold' where id=req.id;
  perform log_operation(p_action,req.id,'{}');
  result=jsonb_build_object('message','Venta registrada y stock descontado');
 when 'fulfill_request' then
  perform require_role(array['owner','stock']);
  update purchase_requests set status='fulfilled' where id=(p_payload->>'id')::uuid and status='sold';
  if not found then raise exception 'Registra la venta antes de marcar entrega'; end if;
  perform log_operation(p_action,(p_payload->>'id')::uuid,'{}');
  result=jsonb_build_object('message','Entrega registrada');
 else raise exception 'Operación desconocida';
 end case;
 insert into operation_receipts(key,actor,action,payload,result) values(p_key,auth.uid(),p_action,p_payload,coalesce(result,'null'));
 return result;
end $$;

-- Public request creation runs only through the server service role. No anonymous table writes.
create function create_purchase_inquiry(p_items jsonb,p_fulfillment text,p_note text,p_key uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare req purchase_requests; l listings; c card_printings; s operation_settings; item jsonb; subtotal integer=0; delivery integer; response jsonb; lines jsonb='[]'; normalized_items jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor puede crear solicitudes' using errcode='42501'; end if;
 if p_key is null or coalesce(length(p_fingerprint),0)<16 then raise exception 'Solicitud inválida'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 or p_fulfillment not in ('duelist','pickup') or length(coalesce(p_note,''))>500 then raise exception 'Solicitud inválida'; end if;
 select jsonb_agg(value order by value->>'id') into normalized_items from jsonb_array_elements(p_items);
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,1));
 select * into req from purchase_requests where client_key=p_key;
 if req.id is not null then
  if req.fulfillment_method<>p_fulfillment or coalesce(req.customer_note,'')<>coalesce(p_note,'') or (select jsonb_agg(jsonb_build_object('id',listing_id,'quantity',requested_quantity) order by listing_id::text) from purchase_request_items where purchase_request_id=req.id)<>normalized_items then raise exception 'Clave reutilizada para otra solicitud'; end if;
  select jsonb_agg(jsonb_build_object('id',listing_id,'quantity',requested_quantity,'price',price_snapshot_crc,'variant',variant_snapshot) order by listing_id) into lines from purchase_request_items where purchase_request_id=req.id;
  return jsonb_build_object('number',req.request_number,'subtotal',req.subtotal_crc,'delivery',req.delivery_fee_crc,'total',req.total_crc,'items',lines);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,2));
 if (select count(*) from purchase_requests where fingerprint=p_fingerprint and created_at>now()-interval '1 hour')>=10 then raise exception 'Demasiadas solicitudes. Intenta más tarde'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) group by value->>'id' having count(*)>1) then raise exception 'Combina los artículos repetidos'; end if;
 select * into s from operation_settings;
 delivery=case when p_fulfillment='duelist' then s.delivery_fee_crc else 0 end;
 insert into purchase_requests(request_number,fulfillment_method,delivery_fee_crc,subtotal_crc,total_crc,customer_note,client_key,fingerprint) values('VEG-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),p_fulfillment,delivery,0,0,p_note,p_key,p_fingerprint) returning * into req;
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  select * into l from listings where id=(item->>'id')::uuid for update;
  select * into c from card_printings where id=l.card_printing_id;
  if l.id is null or not l.published or l.archived_at is not null or l.approved_price_crc<=0 or (item->>'quantity')::integer not between 1 and 100 or free_stock(l.id)<(item->>'quantity')::integer then raise exception 'Una carta cambió de disponibilidad. Actualiza el catálogo'; end if;
  insert into purchase_request_items(purchase_request_id,listing_id,requested_quantity,price_snapshot_crc,price_revision,variant_snapshot) values(req.id,l.id,(item->>'quantity')::integer,l.approved_price_crc,l.price_revision,jsonb_build_object('name',c.canonical_name,'set',c.set_name,'number',c.collector_number,'language',c.language,'condition',l.condition,'finish',l.finish));
  subtotal=subtotal+l.approved_price_crc*(item->>'quantity')::integer;
  lines=lines||jsonb_build_object('id',l.id,'quantity',(item->>'quantity')::integer,'price',l.approved_price_crc,'variant',jsonb_build_object('name',c.canonical_name,'set',c.set_name,'number',c.collector_number,'language',c.language,'condition',l.condition,'finish',l.finish));
 end loop;
 update purchase_requests set subtotal_crc=subtotal,total_crc=subtotal+delivery where id=req.id;
 return jsonb_build_object('number',req.request_number,'subtotal',subtotal,'delivery',delivery,'total',subtotal+delivery,'items',lines);
end $$;

-- Privileges must be explicit: helpers cannot be called as public PostgREST RPCs.
revoke all on function require_role(text[]),log_operation(text,uuid,jsonb),stock_change(uuid,integer,text,text,text),propose_price(uuid,uuid),free_stock(uuid),admin_command(text,jsonb,uuid),create_purchase_inquiry(jsonb,text,text,uuid,text) from public,anon,authenticated;
grant execute on function current_admin_role(),is_admin(),free_stock(uuid),admin_command(text,jsonb,uuid) to authenticated,service_role;
grant execute on function create_purchase_inquiry(jsonb,text,text,uuid,text) to service_role;
-- Membership RLS never reveals the owner list to an unauthenticated client.
revoke all on admin_memberships from anon;

create function canonical_language(v text) returns text language sql immutable as $$ select case lower(v) when 'english' then 'en' when 'spanish' then 'es' when 'japanese' then 'ja' when 'chinese' then 'zh' else lower(v) end $$;
create function search_operations_inventory(p_search text default '',p_status text default 'all',p_stock text default 'all',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; begin
 perform require_role(array['owner','reviewer','stock']);
 if p_page<0 or p_page>100000 then raise exception 'Página inválida'; end if;
 with filtered as (select * from operations_inventory where archived_at is null and (length(p_search)=0 or position(lower(p_search) in lower(canonical_name||' '||set_name||' '||collector_number||' '||listing_id::text))>0) and (p_status='all' or (p_status='draft' and not published) or (p_status='published' and published) or (p_status='unverified' and not identity_verified)) and (p_stock='all' or (p_stock='in' and available_quantity>0) or (p_stock='out' and available_quantity<=0)))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from (select * from filtered order by case when p_status='unverified' then approved_price_crc end desc nulls last,canonical_name,listing_id offset p_page*50 limit 50) page),'[]'::jsonb),'total',(select count(*) from filtered),'page',p_page) into result;
 return result;
end $$;
create function operation_counts() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform require_role(array['owner','reviewer','stock']);
 return jsonb_build_object('listings',(select count(*) from listings where archived_at is null),'drafts',(select count(*) from listings where not published and archived_at is null),'identity',(select count(*) from card_printings c where not identity_verified and exists(select 1 from listings l where l.card_printing_id=c.id and l.archived_at is null)),'proposals',(select count(*) from price_proposals where status='pending'),'imports',(select count(*) from import_rows where status in ('needs_review','invalid')),'requests',(select count(*) from purchase_requests where status in ('inquiry','reserved','sold')),'jobs',(select count(*) from operation_jobs where status in ('pending','running')));
end $$;
grant execute on function search_operations_inventory(text,text,text,integer),operation_counts() to authenticated,service_role;
revoke execute on function search_operations_inventory(text,text,text,integer),operation_counts() from public,anon;
create function storefront_settings() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$ select jsonb_build_object('deliveryFeeCrc',delivery_fee_crc) from operation_settings $$;
grant execute on function storefront_settings() to anon,authenticated,service_role;

create function refresh_listing_cost(p_listing uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare units numeric;unknown_units numeric;cost numeric;begin
 select sum(quantity),sum(case when not cost_verified or unit_cost_crc is null then quantity else 0 end),sum(quantity*unit_cost_crc) into units,unknown_units,cost from stock_lots where listing_id=p_listing and not quarantined and quantity>0;
 if units>0 then update listings set acquisition_cost=case when unknown_units=0 then round(cost/units,2) else null end,cost_confirmed=unknown_units=0 where id=p_listing; end if;
end $$;
revoke execute on function refresh_listing_cost(uuid) from public,anon,authenticated;

create view operations_jobs with(security_invoker=true) as select j.*,coalesce(c.canonical_name,r.normalized->>'name') card_name,r.batch_id from operation_jobs j left join import_rows r on j.kind='match_import' and r.id=j.entity_id left join listings l on j.kind='refresh_price' and l.id=j.entity_id left join card_printings c on c.id=l.card_printing_id;
grant select on operations_jobs to authenticated,service_role;
create function admin_team() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ declare result jsonb; begin perform require_role(array['owner']);select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('email',u.email,'role',m.role,'created_at',m.created_at) order by u.email),'[]'::jsonb),'total',count(*)) into result from admin_memberships m join auth.users u on u.id=m.user_id;return result;end $$;
revoke execute on function admin_team() from public,anon;
grant execute on function admin_team() to authenticated,service_role;

create function collector_part(v text) returns text language sql immutable as $$ select case when btrim(v) ~ '^[0-9]+$' then coalesce(nullif(ltrim(btrim(v),'0'),''),'0') else upper(btrim(v)) end $$;
create function same_collector_number(a text,b text) returns boolean language sql immutable as $$ select collector_part(split_part(a,'/',1))=collector_part(split_part(b,'/',1)) and (position('/' in a)=0 or position('/' in b)=0 or collector_part(split_part(a,'/',2))=collector_part(split_part(b,'/',2))) $$;
create function catalog_candidates(p_game text,p_set text,p_number text,p_provider text default '',p_external_id text default '') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ declare result jsonb;begin
 perform require_role(array['owner','reviewer','stock']);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.canonical_name,'setName',c.set_name,'collectorNumber',c.collector_number,'game',c.game,'language',canonical_language(c.language),'provider',coalesce(c.catalog_source,'manual'),'externalId',coalesce(c.external_card_id,''),'imageUrl',c.stock_image_url,'verified',c.identity_verified,'treatment',c.treatment,'kind',c.kind)),'[]'::jsonb) into result
 from (select c.* from card_printings c where c.game=p_game and ((lower(c.set_name)=lower(p_set) and same_collector_number(c.collector_number,p_number)) or (p_external_id<>'' and exists(select 1 from external_references x where x.card_printing_id=c.id and x.provider=p_provider and x.external_id=p_external_id))) order by c.identity_verified desc,c.id limit 50) c;
 return result;
end $$;
revoke execute on function catalog_candidates(text,text,text,text,text) from public,anon;
grant execute on function catalog_candidates(text,text,text,text,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
