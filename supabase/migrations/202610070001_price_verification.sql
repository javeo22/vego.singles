-- Bind provider evidence to the checked printing. Does not reprice existing inventory.
begin;
create function price_variant_snapshot(p_listing uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'listingId',l.id,'printingId',c.id,'game',c.game,
  'name',nullif(c.canonical_name,''),'set',nullif(c.set_name,''),'number',nullif(c.collector_number,''),
  'language',canonical_language(c.language),'condition',canonical_condition(l.condition),'finish',canonical_finish(l.finish),
  'treatment',c.treatment,'kind',c.kind,'provider',nullif(c.catalog_source,''),
  'externalId',nullif(c.external_card_id,''),'tcgplayerId',nullif(c.tcgplayer_product_id,''),'identityVerified',c.identity_verified)
 from listings l join card_printings c on c.id=l.card_printing_id where l.id=p_listing
$$;

-- Reassess saved references under today's policy, never the time they were fetched.
create function checked_price_reference(p_listing uuid,p_check uuid,p_reference text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare report jsonb; selected jsonb; latest text; max_age integer; disagreement boolean;
begin
 select result->'verification' into report from operation_jobs
 where id=p_check and entity_id=p_listing and kind='refresh_price' and status in ('needs_review','succeeded');
 if report is null or report->>'version'<>'1' or report->'variantSnapshot' is distinct from price_variant_snapshot(p_listing) then
  raise exception 'La impresión o su vínculo al proveedor cambió. Consulta el precio de nuevo.';
 end if;
 if report#>>'{variantSnapshot,identityVerified}'<>'true' or report#>>'{variantSnapshot,language}'<>'en'
  or report#>>'{variantSnapshot,treatment}'<>'standard'
  or (report#>>'{variantSnapshot,kind}'='single' and report#>>'{variantSnapshot,condition}'<>'Near Mint')
  or (report#>>'{variantSnapshot,kind}'='sealed' and report#>>'{variantSnapshot,condition}'<>'Sealed Product') then
  raise exception 'La variante necesita revisión manual';
 end if;
 if coalesce(report#>>'{variantSnapshot,name}','')='' or coalesce(report#>>'{variantSnapshot,set}','')=''
  or (report#>>'{variantSnapshot,kind}'<>'sealed' and coalesce(report#>>'{variantSnapshot,number}','')='') then
  raise exception 'Faltan datos de la impresión';
 end if;
 select greatest(1,least(720,(policy->>'maxAgeHours')::integer)) into max_age from operation_settings;
 with fresh as (
  select r from jsonb_array_elements(report->'references') r
  where r->>'providerUpdatedAt' is not null and r->>'currency' in ('USD','EUR')
   and (r->>'providerUpdatedAt')::timestamptz between now()-make_interval(hours=>max_age) and now()+interval '1 hour'
   and (r->>'amount')::numeric>0
 ) select exists(select 1 from fresh group by r->>'currency' having max((r->>'amount')::numeric)/min((r->>'amount')::numeric)>1.15)
 into disagreement;
 if disagreement then raise exception 'Las referencias difieren más de 15%%. Registra evidencia revisada manualmente.'; end if;
 select r->>'id' into latest from jsonb_array_elements(report->'references') with ordinality as refs(r,ordinal)
 where r->>'currency'='USD' and r->>'providerUpdatedAt' is not null and (r->>'amount')::numeric>0
  and (r->>'providerUpdatedAt')::timestamptz between now()-make_interval(hours=>max_age) and now()+interval '1 hour'
 order by (r->>'providerUpdatedAt')::timestamptz desc,ordinal limit 1;
 select r into selected from jsonb_array_elements(report->'references') r where r->>'id'=p_reference;
 if latest is null or latest is distinct from p_reference or selected->>'currency'<>'USD'
  or selected->>'marketplace'<>'tcgplayer' or selected->>'sourceUrl' not like 'https://%'
  or selected->>'finish' is distinct from report#>>'{variantSnapshot,finish}' then
  raise exception 'Referencia no vigente o no comparable. Consulta el precio de nuevo.';
 end if;
 return selected;
end $$;

create function create_price_proposal_from_check(p_listing uuid,p_check uuid,p_reference_id text,p_key uuid,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l listings; c card_printings; ref jsonb; receipt operation_receipts; payload jsonb; result jsonb; evidence uuid; proposal uuid;
begin
 perform require_role(array['owner','reviewer']);
 if p_key is null or p_confirmed is not true then raise exception 'Confirma la variante y la clave de operación'; end if;
 payload=jsonb_build_object('listing',p_listing,'check',p_check,'reference',p_reference_id,'confirmed',p_confirmed);
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into receipt from operation_receipts where key=p_key;
 if found then
  if receipt.actor is distinct from auth.uid() or receipt.action<>'checked_price' or receipt.payload<>payload then raise exception 'Clave reutilizada con otra operación'; end if;
  return receipt.result;
 end if;
 select * into l from listings where id=p_listing for update;
 if not found or l.archived_at is not null then raise exception 'Listado no disponible'; end if;
 select * into c from card_printings where id=l.card_printing_id for update;
 ref=checked_price_reference(p_listing,p_check,p_reference_id);
 insert into market_prices(listing_id,provider,market_price_usd,amount,currency,source_url,market_subtype,condition,finish,language,exact_variant,match_confidence,provider_updated_at)
 values(l.id,(ref->>'marketplace')||'-via-'||(ref->>'feed'),(ref->>'amount')::numeric,(ref->>'amount')::numeric,'USD',ref->>'sourceUrl','market_reference',l.condition,l.finish,c.language,true,'verified',(ref->>'providerUpdatedAt')::timestamptz)
 returning id into evidence;
 proposal=propose_price(l.id,evidence);
 update price_proposals set calculation=calculation||jsonb_build_object('priceCheck',jsonb_build_object(
  'jobId',p_check,'referenceId',p_reference_id,'reference',ref,'variantSnapshot',price_variant_snapshot(l.id),
  'warnings',(select j.result#>'{verification,warnings}' from operation_jobs j where j.id=p_check))) where id=proposal;
 update operation_jobs set status='succeeded',updated_at=now() where id=p_check;
 perform log_operation('checked_price',l.id,jsonb_build_object('evidence',evidence,'proposal',proposal,'check',p_check,'reference',p_reference_id));
 result=jsonb_build_object('id',proposal,'message','Referencia verificada guardada y propuesta calculada');
 insert into operation_receipts(key,actor,action,payload,result) values(p_key,auth.uid(),'checked_price',payload,result);
 return result;
end $$;

create function guard_checked_price_approval() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare ref jsonb;
begin
 if new.status='approved' and old.status='pending' and old.calculation ? 'priceCheck' then
  -- Hold the printing lock until the approving transaction finishes.
  perform 1 from card_printings where id=(select card_printing_id from listings where id=old.listing_id) for update;
  if old.calculation#>'{priceCheck,variantSnapshot}' is distinct from price_variant_snapshot(old.listing_id) then
   raise exception 'Propuesta vencida: la impresión o su vínculo al proveedor cambió';
  end if;
  ref=checked_price_reference(old.listing_id,(old.calculation#>>'{priceCheck,jobId}')::uuid,old.calculation#>>'{priceCheck,referenceId}');
  if ref is distinct from old.calculation#>'{priceCheck,reference}' then
   raise exception 'Propuesta vencida: la referencia del proveedor cambió';
  end if;
 end if;
 return new;
end $$;
create trigger checked_price_approval before update of status on price_proposals
 for each row execute function guard_checked_price_approval();
revoke all on function price_variant_snapshot(uuid),checked_price_reference(uuid,uuid,text),guard_checked_price_approval(),create_price_proposal_from_check(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function create_price_proposal_from_check(uuid,uuid,text,uuid,boolean) to authenticated,service_role;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610070001','feature','price_verification'));
notify pgrst,'reload schema';
commit;
