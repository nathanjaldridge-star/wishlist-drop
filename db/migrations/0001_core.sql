-- Drop Club price store, migration 0001: core tables.
-- Postgres 15+ (Supabase free tier, or any Postgres). Applied by scripts/db/migrate.mjs, which records it in schema_migrations.
-- Money is integer minor units (pence / cents). Every timestamp is timestamptz (stored as UTC).
-- Nothing here is example data. Example rows live only in db/seed/example.sql and carry is_example = true.

-- Markets we serve. Adding one is a deliberate migration, not a free-text value.
create table markets (
  code char(2) primary key check (code in ('GB', 'US')),
  currency char(3) not null unique check (currency ~ '^[A-Z]{3}$'),
  name text not null
);
insert into markets (code, currency, name) values ('GB', 'GBP', 'United Kingdom'), ('US', 'USD', 'United States');

-- Where a price came from, and what its licence lets us do with it. Code reads these flags; it never hard-codes a source.
create table sources (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null,
  enabled boolean not null default false,          -- false = ingest skips it (no approval / permission yet)
  may_use_for_baseline boolean not null,           -- may rows feed the 30-day low and drop maths
  may_alert boolean not null,                      -- may a price from this source trigger a user alert
  max_display_age interval,                        -- older than this: the export marks it not fresh and gives its age
  retain_for interval,                             -- ingest refuses, and prune_observations() deletes, rows older than this; null = keep
  may_resell boolean not null default false,       -- may the data be sold on (data-product plans)
  notes text not null
);
-- Conservative defaults. Changing a flag is a one-line UPDATE once Nathan has the approval in writing.
insert into sources (id, name, enabled, may_use_for_baseline, may_alert, max_display_age, retain_for, may_resell, notes) values
  ('ebay_browse', 'eBay Browse API', true, false, true, interval '6 hours', interval '24 hours', false,
   'eBay API Licence: displayed listing data no more than 6 hours older than eBay (other content 24 hours); no using eBay content to model or suggest prices without written consent; no AI training; no resale. Baseline off and 24-hour retention are our own conservative choices, pending a decision.'),
  ('hukd_rss', 'HotUKDeals RSS', false, false, false, interval '48 hours', interval '48 hours', false,
   'HotUKDeals terms Part A 7.1: third-party use needs consent. Off until HotUKDeals agrees in writing.'),
  ('awin_feed', 'Awin product feeds', false, true, true, interval '24 hours', null, false,
   'Off until the Awin publisher account and each advertiser programme are approved. Check each advertiser''s feed terms before turning on.'),
  ('awin_promotions', 'Awin promotions', false, false, false, interval '24 hours', null, false,
   'Vouchers are never called working.'),
  ('keepa', 'Keepa API', false, false, false, null, null, false,
   'Paid (from EUR 49/month); its terms (section 18(7)) need written consent to display. Not used.'),
  ('amazon_creators_api', 'Amazon Creators API', false, true, false, interval '1 hour', interval '24 hours', false,
   'Needs 10 qualifying sales in 30 days. Amazon price alerts also need Amazon''s consent (Associates UK clause 6(y)). Check the API content-caching rules before turning on.'),
  ('user_capture', 'Captured by a user from a page they had open', false, true, true, null, null, false,
   'Bookmarklet / iOS Shortcut, not built yet (there is no server endpoint for it). Amazon retailers keep price_alerts_enabled = false.'),
  ('manual', 'Entered by the user', false, false, true, null, null, false,
   'A user''s own typed price. Lives in their browser today; never feeds the shared baseline.');

-- Shops, one row per shop per market. The composite key (id, market) lets listings prove their market matches.
create table retailers (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,47}-(uk|us)$'),
  market char(2) not null references markets (code),
  name text not null,
  price_alerts_enabled boolean not null default true,  -- the Amazon switch: false until Amazon consents
  unique (id, market)
);
insert into retailers (id, market, name, price_alerts_enabled) values
  ('amazon-uk', 'GB', 'Amazon UK', false), ('amazon-us', 'US', 'Amazon US', false),
  ('ebay-uk', 'GB', 'eBay UK', true), ('ebay-us', 'US', 'eBay US', true),
  ('argos-uk', 'GB', 'Argos', true), ('currys-uk', 'GB', 'Currys', true),
  ('john-lewis-uk', 'GB', 'John Lewis', true), ('ao-uk', 'GB', 'AO', true);

-- The catalogue. catalogue_id is minted once at random (scripts/db/catalogue-id.mjs) and never derived from a mutable key,
-- so adding a barcode later, renaming a watch-list id, or merging duplicates never changes a product's id or splits its history.
create table products (
  id bigint generated always as identity primary key,
  catalogue_id char(12) not null unique check (catalogue_id ~ '^DC[0-9A-HJKMNP-TV-Z]{10}$'),
  title text not null check (length(title) between 1 and 300),
  brand text check (brand is null or length(brand) between 1 and 80),
  merged_into bigint references products (id),        -- set by merge_products(); readers follow it once
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  check (merged_into is null or merged_into <> id)
);

-- Every way the outside world names a product. One identifier points at one product; a product can have many.
-- scope makes identifiers that are only unique somewhere unique here: ASIN per market, a shop SKU per retailer, an MPN per brand.
create table product_identifiers (
  product_id bigint not null references products (id) on delete cascade,
  scheme text not null check (scheme in ('gtin', 'asin', 'ebay_epid', 'mpn', 'retailer_sku', 'watch')),
  scope text not null default '',
  value text not null check (length(value) between 1 and 120),
  added_by text references sources (id),
  created_at timestamptz not null default now(),
  primary key (scheme, scope, value),
  check (scheme <> 'gtin' or (scope = '' and value ~ '^[0-9]{14}$')),
  check (scheme <> 'asin' or (scope in ('GB', 'US') and value ~ '^[A-Z0-9]{10}$')),
  check (scheme <> 'ebay_epid' or (scope in ('GB', 'US') and value ~ '^[0-9]{1,20}$')),
  check (scheme <> 'watch' or (scope = '' and value ~ '^[a-z0-9][a-z0-9-]{0,79}$')),
  check (scheme not in ('mpn', 'retailer_sku') or scope <> '')
);
create index product_identifiers_product on product_identifiers (product_id);

-- One thing we read a price from: a shop's product page, a feed row, or (eBay) the cheapest match of a search.
create table listings (
  id bigint generated always as identity primary key,
  product_id bigint references products (id),          -- null until identified; never guessed from a title
  source text not null references sources (id),
  retailer_id text not null,
  market char(2) not null,
  external_id text not null check (length(external_id) between 1 and 200),
  kind text not null default 'offer' check (kind in ('offer', 'search_aggregate', 'deal_post')),
  url text not null check (url ~ '^https://' and length(url) <= 2048),
  title text not null check (length(title) <= 300),
  is_example boolean not null default false,
  first_seen_at timestamptz not null default now(),
  unique (source, market, external_id),
  foreign key (retailer_id, market) references retailers (id, market)
);
create index listings_product on listings (product_id);

-- Append-only price history. Re-ingesting the same log line is a no-op (ingest_key).
create table price_observations (
  id bigint generated always as identity primary key,
  listing_id bigint not null references listings (id) on delete cascade,
  observed_at timestamptz not null check (observed_at > '2020-01-01'),
  currency char(3) not null references markets (currency),
  price_minor integer check (price_minor > 0),
  delivery_minor integer check (delivery_minor >= 0),
  was_minor integer check (was_minor > 0),               -- the shop's "was" price, stored but never used as a baseline
  typical_minor integer check (typical_minor > 0),       -- eBay median of matching listings (display only, never an RRP)
  sample_count integer check (sample_count > 0),
  in_stock boolean,
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  error_state text not null check (error_state in ('ok', 'not_found', 'blocked', 'changed')),
  offer_ref text check (length(offer_ref) <= 200),       -- e.g. the eBay item id behind a search_aggregate price
  ingest_key text not null unique,
  ingested_at timestamptz not null default now(),
  check ((error_state = 'ok') = (price_minor is not null))
);
-- "Latest price" and "lowest in the prior 30 days" both walk this index for one listing.
create index price_obs_listing_time on price_observations (listing_id, observed_at desc) include (price_minor) where error_state = 'ok';
create index price_obs_time on price_observations (observed_at);  -- retention pruning

-- A row's currency must be its listing's market currency (no GBP rows on a US listing, no mixed-currency minimums).
create function price_obs_currency_matches() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from listings l join markets m on m.code = l.market
                 where l.id = new.listing_id and m.currency = new.currency) then
    raise exception 'currency % does not match the market of listing %', new.currency, new.listing_id;
  end if;
  return new;
end $$;
create trigger price_obs_currency before insert or update on price_observations
  for each row execute function price_obs_currency_matches();

-- Supabase exposes tables to the browser's anon key unless RLS is on. On, with no policies: nothing is readable from a browser
-- until we add a deliberate read policy or view. The ingest job connects as the owner and is unaffected.
alter table markets enable row level security;
alter table sources enable row level security;
alter table retailers enable row level security;
alter table products enable row level security;
alter table product_identifiers enable row level security;
alter table listings enable row level security;
alter table price_observations enable row level security;
