-- Run in the Supabase SQL Editor before the operations migration. Read-only.
begin transaction read only;
select count(*) as published_listings from public.listings where published;
select count(*) as visible_legacy_listings from public.public_listings;
select count(*) as listings_without_stock from public.listings l where published and not exists(select 1 from public.stock_lots s where s.listing_id=l.id and s.quantity>0);
select location_code,sum(quantity) as copies from public.stock_lots group by location_code order by location_code;
select language,count(*) as printings from public.card_printings group by language order by language;
select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('listings','stock_lots','price_proposals','market_prices') order by table_name,ordinal_position;
select pg_get_viewdef('public.public_listings'::regclass,true) as current_public_view;
select to_regclass('public.admin_memberships') as existing_membership_table,to_regclass('public.operation_settings') as existing_operations_settings;
rollback;
