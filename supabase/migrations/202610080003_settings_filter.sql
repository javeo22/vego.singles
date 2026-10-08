-- PostgREST enables safe updates in production. Even a singleton table needs
-- an explicit WHERE clause. Keep both settings commands scoped to id=true.
begin;

do $patch$
declare signature text; definition text; statement text; matched text[];
begin
 foreach signature in array array[
  'public.set_pricing_exchange(numeric,timestamptz,text,uuid)',
  'public.admin_command(text,jsonb,uuid)'
 ] loop
  definition=pg_get_functiondef(signature::regprocedure);
  matched=regexp_match(definition,$pattern$update operation_settings set [^;]+updated_at=now\(\);$pattern$);
  if matched is null then
   raise exception 'La función % cambió. Revisa la actualización de ajustes antes de aplicar esta migración',signature;
  end if;
  statement=matched[1];
  execute replace(definition,statement,
   replace(statement,'updated_at=now();','updated_at=now() where id=true;'));
 end loop;
end $patch$;

insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610080003','feature','settings_filter'));
notify pgrst,'reload schema';
commit;
