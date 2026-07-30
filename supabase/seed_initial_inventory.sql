begin;

with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Slowbro','Abyss Eye','087/081','Art Rare','unknown','{"import_row":1}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',6000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',11.69,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Banette','Ascended Heroes','234/217','Illustration Rare','unknown','{"import_row":2}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',6000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',11.8,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Erika''s Tangela','Ascended Heroes','218/217','Illustration Rare','unknown','{"import_row":3}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',10500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',20.69,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Ethan''s Magcargo','Ascended Heroes','222/217','Illustration Rare','unknown','{"import_row":4}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',3500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',6.92,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Larry''s Staraptor','Ascended Heroes','249/217','Illustration Rare','unknown','{"import_row":5}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',4.23,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Mega Scrafty ex','Ascended Heroes','285/217','Special Illustration Rare','unknown','{"import_row":6}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',33500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',65.8,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Mightyena','Ascended Heroes','243/217','Illustration Rare','unknown','{"import_row":7}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',8.18,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Steven''s Metagross ex','Ascended Heroes','289/217','Special Illustration Rare','unknown','{"import_row":8}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',49500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',97.02,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Team Rocket''s Dugtrio','Ascended Heroes','239/217','Illustration Rare','unknown','{"import_row":9}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',9.26,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Swinub (JP)','Battle Partners','106/100','Art Rare','unknown','{"import_row":10}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.91,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Pidove (JP)','Black Bolt','153/086','Art Rare','unknown','{"import_row":11}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',6500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',12.57,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Scolipede','Black Bolt','134/086','Illustration Rare','unknown','{"import_row":12}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',15500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',29.98,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Chespin','Chaos Rising','087/086','Illustration Rare','unknown','{"import_row":13}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',4.16,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Claydol','Chaos Rising','092/086','Illustration Rare','unknown','{"import_row":14}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',1.86,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Crobat','Chaos Rising','093/086','Illustration Rare','unknown','{"import_row":15}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',3.23,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Froakie','Chaos Rising','088/086','Illustration Rare','unknown','{"import_row":16}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',5000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',10.28,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Tauros','Chaos Rising','096/086','Illustration Rare','unknown','{"import_row":17}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',3.38,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Probopass (JP)','Crimson Haze','076/066','Art Rare','unknown','{"import_row":18}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.89,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Absol','Crown Zenith: Galarian Gallery','GG16/GG70','Holo Rare','unknown','{"import_row":19}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Moderately Played','Holofoil',3500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',7.13,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Arceus VSTAR (Secret)','Crown Zenith: Galarian Gallery','GG70/GG70','Secret Rare','unknown','{"import_row":20}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Lightly Played','Holofoil',96000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',188.4,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Electivire','Crown Zenith: Galarian Gallery','GG08/GG70','Holo Rare','unknown','{"import_row":21}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',8.28,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Magmortar','Crown Zenith: Galarian Gallery','GG03/GG70','Holo Rare','unknown','{"import_row":22}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',5500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',11.13,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Solrock','Crown Zenith: Galarian Gallery','GG15/GG70','Holo Rare','unknown','{"import_row":23}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',3500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',7.14,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Kangaskhan','Destined Rivals','204/182','Illustration Rare','unknown','{"import_row":24}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',6000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',11.42,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Team Rocket''s Houndoom','Destined Rivals','191/182','Illustration Rare','unknown','{"import_row":25}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',7000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',13.34,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Team Rocket''s Spidops','Destined Rivals','187/182','Illustration Rare','unknown','{"import_row":26}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',3000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',6.35,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Cubone (Full Art) (CN)','Gem Pack Vol. 3','0407/07','Art Rare','unknown','{"import_row":27}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',124000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',243.26,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Yanmega ex (JP)','Hot Air Arena','085/063','Secret Art Rare','unknown','{"import_row":28}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',5500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',11.03,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Wailord','Journey Together','162/159','Illustration Rare','unknown','{"import_row":29}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',8500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',16.9,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Gengar','Lost Origin Trainer Gallery','TG06/TG30','Ultra Rare','unknown','{"import_row":30}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Moderately Played','Holofoil',22000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',42.65,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Snorlax','Lost Origin Trainer Gallery','TG10/TG30','Ultra Rare','unknown','{"import_row":31}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Moderately Played','Holofoil',8500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',16.78,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Exeggutor','Mega Evolution','135/132','Illustration Rare','unknown','{"import_row":32}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',5.35,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Mega Lucario ex','Mega Evolution','179/132','Special Illustration Rare','unknown','{"import_row":33}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',111500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',218.17,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Snover','Mega Evolution','140/132','Illustration Rare','unknown','{"import_row":34}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.52,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Spiritomb','Mega Evolution','148/132','Illustration Rare','unknown','{"import_row":35}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.64,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Steelix','Mega Evolution','150/132','Illustration Rare','unknown','{"import_row":36}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',8.22,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Fennekin','Mega Evolution Promos','080','Promo','unknown','{"import_row":37}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.44,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Oricorio ex','Mega Evolution Promos','024','Promo','unknown','{"import_row":38}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',6000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',11.58,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Riolu','Mega Evolution Promos','010','Promo','unknown','{"import_row":39}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',5000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',9.7,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Shuckle (JP)','Mega Symphonia','064/063','Art Rare','unknown','{"import_row":40}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',4.04,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Pidgeot ex','Obsidian Flames','225/197','Special Illustration Rare','unknown','{"import_row":41}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',11000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',21.45,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Pidgeotto','Obsidian Flames','208/197','Illustration Rare','unknown','{"import_row":42}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',6000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',11.64,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Scizor','Obsidian Flames','205/197','Illustration Rare','unknown','{"import_row":43}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',8500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',16.56,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Arctibax','Paldea Evolved','209/193','Illustration Rare','unknown','{"import_row":44}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',9500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',18.63,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Baxcalibur','Paldea Evolved','210/193','Illustration Rare','unknown','{"import_row":45}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',19500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',38.08,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Frigibax','Paldea Evolved','208/193','Illustration Rare','unknown','{"import_row":46}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',12500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',24.9,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Brute Bonnet','Paradox Rift','207/182','Illustration Rare','unknown','{"import_row":47}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',9000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',17.98,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Mantyke','Paradox Rift','189/182','Illustration Rare','unknown','{"import_row":48}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',20000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',39.09,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Porygon-Z','Paradox Rift','214/182','Illustration Rare','unknown','{"import_row":49}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',8000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',15.23,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Sandy Shocks ex','Paradox Rift','250/182','Special Illustration Rare','unknown','{"import_row":50}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',8.08,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Mega Sharpedo ex','Phantasmal Flames','127/094','Special Illustration Rare','unknown','{"import_row":51}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',11000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',21.49,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Paldean Wooper','Phantasmal Flames','102/094','Illustration Rare','unknown','{"import_row":52}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',4.48,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Iron Hands ex','Prismatic Evolutions','154/131','Special Illustration Rare','unknown','{"import_row":53}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',17000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',33.68,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Houndour (JP)','Ruler of the Black Flame','115/108','Art Rare','unknown','{"import_row":54}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',5.0,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Pidgey (JP)','Ruler of the Black Flame','118/108','Art Rare','unknown','{"import_row":55}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',7.79,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Iron Treads ex','Scarlet & Violet Base Set','248/198','Special Illustration Rare','unknown','{"import_row":56}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',3000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',5.62,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Starly','Scarlet & Violet Base Set','221/198','Illustration Rare','unknown','{"import_row":57}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',7500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',14.55,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Eevee','Scarlet & Violet Promo','173','Promo','unknown','{"import_row":58}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',7500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',14.7,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Iron Thorns','Scarlet & Violet Promo','098','Promo','unknown','{"import_row":59}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.44,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Kingambit','Scarlet & Violet Promo','130','Promo','unknown','{"import_row":60}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',4.49,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Kingdra ex','Scarlet & Violet Promo','131','Promo','unknown','{"import_row":61}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',42500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',83.67,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Magneton','Scarlet & Violet Promo','159','Promo','unknown','{"import_row":62}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',7.63,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Reuniclus','Scarlet & Violet Promo','212','Promo','unknown','{"import_row":63}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.53,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Steven''s Beldum','Scarlet & Violet Promo','207','Promo','unknown','{"import_row":64}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',17000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',32.9,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Malamar','Silver Tempest Trainer Gallery','TG06/TG30','Ultra Rare','unknown','{"import_row":65}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',1.64,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Phanpy (JP)','Super Electric Breaker','115/106','Art Rare','unknown','{"import_row":66}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',4.24,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Cetitan','Surging Sparks','201/191','Illustration Rare','unknown','{"import_row":67}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.93,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Exeggcute','Surging Sparks','192/191','Illustration Rare','unknown','{"import_row":68}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',9.15,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Shiinotic','Surging Sparks','194/191','Illustration Rare','unknown','{"import_row":69}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',3.82,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Skarmory','Surging Sparks','209/191','Illustration Rare','unknown','{"import_row":70}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',5000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',9.8,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Galarian Moltres','Sword & Shield Promo','SWSH284','Promo','unknown','{"import_row":71}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',7500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',14.72,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Iron Valiant ex (JP)','Terastal Festival ex','213/187','Special Art Rare','unknown','{"import_row":72}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',4500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',8.53,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Glaceon ex (CN)','Terastal Gathering','227/208','SAR','unknown','{"import_row":73}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',19000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',37.59,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Abomasnow (JP)','VMAX Climax','185/184','Secret Rare','unknown','{"import_row":74}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',2.91,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Octillery (JP)','VMAX Climax','191/184','Secret Rare','unknown','{"import_row":75}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',3.74,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Charizard VSTAR (JP)','VSTAR Universe','212/172','Secret Rare','unknown','{"import_row":76}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',40000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',78.65,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Deoxys VSTAR (JP)','VSTAR Universe','223/172','Secret Rare','unknown','{"import_row":77}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',18000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',34.92,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Hisuian Voltorb (JP)','VSTAR Universe','173/172','Secret Rare','unknown','{"import_row":78}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',2000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',3.65,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Keldeo (JP)','VSTAR Universe','179/172','Secret Rare','unknown','{"import_row":79}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',5000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',9.97,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Leafeon VSTAR (JP)','VSTAR Universe','210/172','Secret Rare','unknown','{"import_row":80}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',25000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',49.23,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Lumineon V (JP)','VSTAR Universe','216/172','Secret Rare','unknown','{"import_row":81}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',8000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',16.11,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Manaphy (JP)','VSTAR Universe','178/172','Secret Rare','unknown','{"import_row":82}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',3500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',6.82,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Mew (JP)','VSTAR Universe','183/172','Secret Rare','unknown','{"import_row":83}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',27500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',53.56,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Jellicent ex','White Flare','168/086','Special Illustration Rare','unknown','{"import_row":84}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',15000,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',29.38,'Holofoil','unverified','2026-07-30'::timestamptz from li;


with cp as (
 insert into card_printings(game,catalog_source,canonical_name,set_name,collector_number,rarity,language,metadata)
 values ('pokemon','csv_import','Flutter Mane (JP)','Wild Force','076/071','Art Rare','unknown','{"import_row":85}'::jsonb)
 returning id
), li as (
 insert into listings(card_printing_id,condition,finish,approved_price_crc,acquisition_cost,published,public_notes)
 select id,'Near Mint','Holofoil',1500,0.0,false,'Imported from Collectr CSV; catalog match and language pending.' from cp
 returning id
), sl as (
 insert into stock_lots(listing_id,location_code,quantity) select id,'UNASSIGNED',1 from li
)
insert into market_prices(listing_id,provider,market_price_usd,market_subtype,match_confidence,provider_updated_at)
select id,'csv_import',3.24,'Holofoil','unverified','2026-07-30'::timestamptz from li;

commit;