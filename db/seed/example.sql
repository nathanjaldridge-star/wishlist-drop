-- EXAMPLE DATA ONLY. Not real prices, not real observations. Every row is flagged is_example = true and titled [EXAMPLE].
-- Load into a local or test database only: psql "$DATABASE_URL" -f db/seed/example.sql  (never into production).
-- Remove: delete from listings where is_example; delete from products where is_example; delete from retailers where id = 'example-shop-us';
-- The example rows use the user_capture source, which ships switched off. To see them in price_baseline() or the export on a
-- LOCAL database: update sources set enabled = true where id = 'user_capture';

insert into retailers (id, market, name, price_alerts_enabled) values ('example-shop-us', 'US', '[EXAMPLE] US shop', true) on conflict do nothing;

insert into products (catalogue_id, title, brand, is_example) values
  ('DCN9623GZFGS', '[EXAMPLE] Over-ear noise-cancelling headphones', '[EXAMPLE] Brand A', true),
  ('DCEQDXTVAT5E', '[EXAMPLE] 1,000-piece building set', '[EXAMPLE] Brand B', true);

insert into product_identifiers (product_id, scheme, scope, value)
select id, 'gtin', '', '04006381333931' from products where catalogue_id = 'DCEQDXTVAT5E';

insert into listings (product_id, source, retailer_id, market, external_id, kind, url, title, is_example)
select p.id, v.source, v.retailer, v.market, v.ext, 'offer', v.url, v.title, true
from (values
  ('DCN9623GZFGS', 'user_capture', 'argos-uk', 'GB', 'example:argos:1', 'https://www.argos.co.uk/product/example-1', '[EXAMPLE] Headphones at Argos'),
  ('DCN9623GZFGS', 'user_capture', 'example-shop-us', 'US', 'example:us-shop:1', 'https://shop.example.com/example-1', '[EXAMPLE] Headphones at a US shop'),
  ('DCN9623GZFGS', 'user_capture', 'amazon-uk', 'GB', 'example:amazon:1', 'https://www.amazon.co.uk/dp/B000000000', '[EXAMPLE] Headphones at Amazon UK'),
  ('DCEQDXTVAT5E', 'user_capture', 'john-lewis-uk', 'GB', 'example:jl:1', 'https://www.johnlewis.com/example-1/p1', '[EXAMPLE] Building set at John Lewis')
) as v (cid, source, retailer, market, ext, url, title)
join products p on p.catalogue_id = v.cid;

-- 40 days of daily example prices per listing, then a drop on the last day.
insert into price_observations (listing_id, observed_at, currency, price_minor, confidence, error_state, ingest_key)
select l.id, timestamptz '2026-09-15 12:00:00+00' + (d || ' days')::interval,
  case l.market when 'US' then 'USD' else 'GBP' end,
  case when d = 40 then 22900 else 27900 + (d % 3) * 500 end,
  0.80, 'ok', 'example:' || l.external_id || ':' || d
from listings l cross join generate_series(0, 40) as d
where l.is_example;
