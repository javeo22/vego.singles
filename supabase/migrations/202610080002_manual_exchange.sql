-- Allow manually entered USD/CRC rates without a source URL.
-- Existing exchange settings, prices, stock and pending proposals are preserved.
begin;

create or replace function set_pricing_exchange(p_fx numeric,p_at timestamptz,p_source text,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt operation_receipts; payload jsonb; result jsonb; source text;
begin
 perform require_role(array['owner']);
 source=nullif(btrim(p_source),'');
 if p_key is null or p_fx is null or p_fx not between 1 and 10000 or p_at is null or p_at<now()-interval '7 days' or p_at>now()+interval '1 hour' then
  raise exception 'Indica un tipo de cambio válido y una fecha de los últimos 7 días';
 end if;
 if source is not null and source not like 'https://%' then raise exception 'El enlace es opcional; si lo agregas, debe usar HTTPS'; end if;
 payload=jsonb_build_object('fx',p_fx,'at',p_at,'source',source);
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into receipt from operation_receipts where key=p_key;
 if found then
  if receipt.actor is distinct from auth.uid() or receipt.action<>'set_pricing_exchange' or receipt.payload<>payload then raise exception 'Clave reutilizada con otra operación'; end if;
  return receipt.result;
 end if;
 update operation_settings set fx=p_fx,fx_at=p_at,fx_source=source,revision=revision+1,updated_at=now();
 if not found then raise exception 'La configuración de precios no está disponible'; end if;
 perform log_operation('set_pricing_exchange',null,payload);
 result=jsonb_build_object('message','Tipo de cambio guardado. Calcula los precios con el cambio actualizado.');
 insert into operation_receipts(key,actor,action,payload,result) values(p_key,auth.uid(),'set_pricing_exchange',payload,result);
 return result;
end $$;

-- The full settings form must accept the same optional source. Patch only that
-- validation and assignment, preserving all other commands and their guards.
do $patch$
declare definition text;
 old_rule text=$old$if p_payload->>'fx' is not null and ((p_payload->>'fx')::numeric not between 1 and 10000 or p_payload->>'fxAt' is null or p_payload->>'fxSource' is null) then raise exception 'Tipo de cambio inválido'; end if;$old$;
 new_rule text=$new$if p_payload->>'fx' is not null and ((p_payload->>'fx')::numeric not between 1 and 10000 or p_payload->>'fxAt' is null) then raise exception 'Tipo de cambio inválido'; end if;
  if nullif(btrim(p_payload->>'fxSource'),'') is not null and btrim(p_payload->>'fxSource') not like 'https://%' then raise exception 'El enlace es opcional; si lo agregas, debe usar HTTPS'; end if;$new$;
 old_assignment text=$old$fx_source=p_payload->>'fxSource'$old$;
 new_assignment text=$new$fx_source=nullif(btrim(p_payload->>'fxSource'),'')$new$;
begin
 definition=pg_get_functiondef('public.admin_command(text,jsonb,uuid)'::regprocedure);
 if position(old_rule in definition)=0 or position(old_assignment in definition)=0 then
  raise exception 'La función de ajustes cambió. Revisa la migración antes de aplicarla';
 end if;
 execute replace(replace(definition,old_rule,new_rule),old_assignment,new_assignment);
end $patch$;

revoke all on function set_pricing_exchange(numeric,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function set_pricing_exchange(numeric,timestamptz,text,uuid) to authenticated,service_role;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610080002','feature','manual_exchange'));
notify pgrst,'reload schema';
commit;
