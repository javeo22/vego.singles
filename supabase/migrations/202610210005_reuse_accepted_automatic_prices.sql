begin;
-- A fresh source quote that preserves an already approved, published price
-- does not require the owner to accept the same exception on every run.
do $patch$
declare definition text; old_guard text;
begin
 old_guard='if not p_force and (price>=50000 or (old_price>0 and abs(price::numeric/old_price-1)>0.1) or floor_price>target) then';
 definition=pg_get_functiondef('public.finish_store_update(uuid,uuid,jsonb,boolean,uuid)'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'Review changed price exception guard'; end if;
 execute replace(definition,old_guard,'if not p_force and (not l.price_verified or not was_published or price<>old_price) and (price>=50000 or (old_price>0 and abs(price::numeric/old_price-1)>0.1) or floor_price>target) then');
end $patch$;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610210005','feature','reuse_accepted_automatic_prices'));
notify pgrst,'reload schema';
commit;
