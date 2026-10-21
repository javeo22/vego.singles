begin;
alter table operation_settings add column fx_mode text not null default 'automatic' check(fx_mode in ('automatic','fixed'));

create function pricing_fx_ready(p_fx numeric,p_at timestamptz,p_mode text) returns boolean
language sql stable set search_path=public,pg_temp as $$
 select coalesce(p_fx between 1 and 10000 and (p_mode='fixed' or (p_at is not null and p_at>=now()-interval '7 days' and p_at<=now()+interval '1 hour')),false)
$$;
revoke all on function pricing_fx_ready(numeric,timestamptz,text) from public,anon;
grant execute on function pricing_fx_ready(numeric,timestamptz,text) to authenticated,service_role;

do $patch$
declare signature text; definition text;
 old_guard text=$old$(s.fx is null or s.fx_at is null or s.fx_at<now()-interval '7 days' or s.fx_at>now()+interval '1 hour')$old$;
 old_review text=$old$(s.fx_at is null or s.fx_at<now()-interval '7 days')$old$;
begin
 foreach signature in array array['public.finish_store_update(uuid,uuid,jsonb,boolean,uuid)','public.propose_price(uuid,uuid)','public.price_update_readiness(uuid)'] loop
  definition=pg_get_functiondef(signature::regprocedure);
  if position(old_guard in definition)=0 then raise exception 'Review changed FX guard: %',signature; end if;
  definition=replace(definition,old_guard,'not pricing_fx_ready(s.fx,s.fx_at,s.fx_mode)');
  definition=replace(definition,'''fxAt'',s.fx_at','''fxMode'',s.fx_mode,''fxAt'',s.fx_at');
  definition=replace(definition,'if e.currency=''USD'' and s.fx_at is not null then','if e.currency=''USD'' and s.fx_mode<>''fixed'' and s.fx_at is not null then');
  execute definition;
 end loop;
 definition=pg_get_functiondef('public.admin_command(text,jsonb,uuid)'::regprocedure);
 if position(old_review in definition)=0 then raise exception 'Review changed approval FX guard'; end if;
 execute replace(definition,old_review,'not pricing_fx_ready(s.fx,s.fx_at,s.fx_mode)');
 definition=pg_get_functiondef('public.refresh_store_exchange(uuid,numeric,timestamptz,text)'::regprocedure);
 if position('if not exists(select 1 from store_update_runs' in definition)=0 then raise exception 'Review changed automatic FX updater'; end if;
 execute replace(definition,'if not exists(select 1 from store_update_runs','if exists(select 1 from operation_settings where fx_mode=''fixed'') then return; end if;'||chr(10)||' if not exists(select 1 from store_update_runs');
end $patch$;

-- Recalculate current queued proposals after the owner changes the store rate.
-- This edits review suggestions only; it never approves or publishes a price.
create function recalculate_exchange_reviews(p_previous_revision integer) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; s operation_settings; expected jsonb; proof jsonb; ref jsonb; target numeric; floor_price numeric; step integer; price integer; changed integer=0;
begin
 if auth.role()<>'service_role' then raise exception 'Solo el servidor' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('store_update',0));
 if exists(select 1 from store_update_runs where status='running') then raise exception 'Espera la actualización en curso'; end if;
 select * into s from operation_settings for share;
 if not pricing_fx_ready(s.fx,s.fx_at,s.fx_mode) then raise exception 'Tipo de cambio inválido'; end if;
 for item in select i.id,i.listing_id,i.result,l.acquisition_cost,l.cost_confirmed from store_update_items i join listings l on l.id=i.listing_id
  where i.status='review' and coalesce((i.result->>'canAccept')::boolean,false)
  and i.id=(select newer.id from store_update_items newer join store_update_runs r on r.id=newer.run_id where newer.listing_id=i.listing_id order by r.created_at desc,r.id desc,newer.created_at desc,newer.id desc limit 1)
  for update of i
 loop
  proof=item.result->'proof'; ref=proof->'reference';expected=store_card_snapshot(item.listing_id);
  if proof#>>'{expected,policyRevision}' is distinct from p_previous_revision::text or ((proof->'expected')-'policyRevision') is distinct from (expected-'policyRevision') then continue; end if;
  if coalesce(proof->>'matched','false')<>'true' or ref is null or ref->>'currency' is distinct from 'USD' or ref->>'feed' is distinct from 'tcgcsv' or ref->>'amount' is null or (ref->>'amount')::numeric<=0 or ref->>'providerUpdatedAt' is null or (ref->>'providerUpdatedAt')::timestamptz<now()-make_interval(hours=>(s.policy->>'maxAgeHours')::integer) or (ref->>'providerUpdatedAt')::timestamptz>now()+interval '1 hour' then continue; end if;
  target=(ref->>'amount')::numeric*s.fx*(s.policy->>'marketFactor')::numeric;floor_price=null;
  if item.cost_confirmed then floor_price=(item.acquisition_cost+(s.policy->>'handlingCrc')::numeric+(s.policy->>'fixedFeeCrc')::numeric)/(1-(s.policy->>'variableFee')::numeric-(s.policy->>'targetMargin')::numeric); end if;
  step=case when target<10000 then 100 else 500 end;
  price=greatest(step,round(target/step)*step,coalesce(ceil(floor_price/step)*step,0));
  proof=jsonb_set(proof,'{expected}',expected);
  update store_update_items set result=result||jsonb_build_object('after',price,'proof',proof,'reason',concat(item.result->>'reason',' Propuesta recalculada con el tipo de cambio de la tienda.')),updated_at=now() where id=item.id;
  changed=changed+1;
 end loop;
 insert into activity_log(action,details) values('recalculate_exchange_reviews',jsonb_build_object('count',changed,'fx',s.fx,'mode',s.fx_mode));
 return changed;
end $$;
revoke all on function recalculate_exchange_reviews(integer) from public,anon,authenticated;
grant execute on function recalculate_exchange_reviews(integer) to service_role;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610210007','feature','fixed_store_exchange'));
notify pgrst,'reload schema';
commit;
