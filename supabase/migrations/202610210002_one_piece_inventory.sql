begin;

alter table card_printings drop constraint card_printings_game_check;
alter table card_printings add constraint card_printings_game_check
 check(game in ('pokemon','magic','lorcana','star-wars','one-piece'));

-- Provisional description-only stock is allowed. Verified printings need a
-- collector number or an exact catalog reference, including unnumbered DON!!.
alter table card_printings add constraint one_piece_verified_identity_reference
 check(game<>'one-piece' or not identity_verified or kind='sealed'
  or length(btrim(collector_number))>0
  or (length(btrim(coalesce(external_card_id,'')))>0 and length(btrim(coalesce(catalog_source,'')))>0));

insert into activity_log(action,details)
 values('schema_migration',jsonb_build_object('version','202610210002','feature','one_piece_inventory'));
notify pgrst,'reload schema';
commit;
