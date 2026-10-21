begin;

-- Some TCGPlayer products identify Japanese alternate art explicitly. Accept
-- that source only when both the stored language and returned product agree.
do $patch$
declare definition text; old_guard text; new_guard text;
begin
 old_guard=$guard$canonical_language(c.language) not in ('en','unknown') then reason='Necesita un precio del mismo idioma; conservamos el idioma indicado en Collectr.';$guard$;
 new_guard=$guard$canonical_language(c.language) not in ('en','unknown')
  and not (canonical_language(c.language)='ja' and c.game='magic'
   and coalesce(ref->>'sourceLanguage','')='ja'
   and coalesce(proof#>>'{product,name}','') ~* '\mJP Alternate Art\M'
   and coalesce(c.metadata#>>'{original_data,Product Name}','') ~* '\mJP Alternate Art\M')
  then reason='Necesita un precio del mismo idioma; conservamos el idioma indicado en Collectr.';$guard$;
 definition=pg_get_functiondef('public.finish_store_update(uuid,uuid,jsonb,boolean,uuid)'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'Review changed language guard'; end if;
 execute replace(definition,old_guard,new_guard);
end $patch$;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610210008','feature','explicit_japanese_alternate_art_prices'));
notify pgrst,'reload schema';
commit;
