-- Expose only public card attributes, never the private import metadata.
do $$
declare definition text;
begin
 definition=pg_get_viewdef('public.storefront_inventory'::regclass,true);
 if position('''stock_image_url'', c.stock_image_url' in definition)=0 then
  raise exception 'Unexpected storefront definition';
 end if;
 execute 'create or replace view public.storefront_inventory with (security_barrier=true) as '||replace(
  definition,'''stock_image_url'', c.stock_image_url',
  '''stock_image_url'', c.stock_image_url, ''rarity'', coalesce(nullif(c.metadata#>>''{original_data,Rarity}'',''''),c.rarity), ''colors'', coalesce(c.metadata#>''{catalog_attributes,colors}'',c.metadata->''colors''), ''type_line'', coalesce(c.metadata#>>''{catalog_attributes,type_line}'',c.metadata->>''type_line'')');
end $$;

-- Service-only enrichment, tied to an already accepted exact product ID.
create function save_catalog_attributes(p_printing uuid,p_product text,p_attributes jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.role()<>'service_role' then raise exception 'No autorizado'; end if;
 if p_product !~ '^[0-9]+$'
  or p_attributes->>'provider' is distinct from 'scryfall'
  or jsonb_typeof(p_attributes->'colors') is distinct from 'array'
  or length(coalesce(p_attributes->>'type_line','')) not between 1 and 2000
  or exists(select 1 from jsonb_array_elements_text(p_attributes->'colors') color where color is null or color not in('W','U','B','R','G'))
 then raise exception 'Invalid catalog attributes'; end if;
 update card_printings set metadata=jsonb_set(metadata,'{catalog_attributes}',p_attributes),updated_at=now()
 where id=p_printing and game='magic' and kind='single' and tcgplayer_product_id=p_product
  and identity_verified and metadata->'catalog_attributes' is distinct from p_attributes;
 return found;
end $$;
revoke all on function save_catalog_attributes(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function save_catalog_attributes(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
