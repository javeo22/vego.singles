begin;
-- The first missing-stock receipt predates the automatic workflow. Its audit
-- event records initial quarantine, rather than a subsequent manual stock hold.
do $patch$
declare definition text; old_guard text; new_guard text;
begin
 old_guard=$old$and not exists(select 1 from inventory_events e where e.listing_id=l.id and e.details ? 'quarantined' and e.created_at>=lot.created_at)$old$;
 new_guard=$new$and not exists(select 1 from inventory_events e where e.listing_id=l.id and e.details ? 'quarantined' and e.created_at>=lot.created_at
     and not coalesce(e.reference_number=lot.source_reference and e.reason='Recepción CSV provisional: solo variantes ausentes'
      and e.details->>'source_file_sha256'=c.metadata->>'source_file_sha256' and e.quantity_change>0 and e.previous_quantity=0,false))$new$;
 definition=pg_get_functiondef('public.finish_store_update(uuid,uuid,jsonb,boolean,uuid)'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'Review changed quarantine release guard'; end if;
 execute replace(definition,old_guard,new_guard);
end $patch$;
insert into activity_log(action,details) values('schema_migration',jsonb_build_object('version','202610210004','feature','collectr_initial_receipt_release'));
notify pgrst,'reload schema';
commit;
