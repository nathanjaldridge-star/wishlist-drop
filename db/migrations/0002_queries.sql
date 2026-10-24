-- Migration 0002: the queries the app needs, as database functions so every caller gets the same rules.

-- Per listing, as of a moment:
--   current = latest ok price at or before as_of
--   low_30d = lowest ok price at the SAME listing (so the same retailer, market and currency) in [as_of - 30 days, current)
--   building_history = fewer than 30 days since the first ok price; no "% below the 30-day low" claims until then
-- Sources whose licence forbids baseline maths (eBay, manual) get current price only: low_30d and drop_pct are null.
create function price_baseline(as_of timestamptz default now())
returns table (
  listing_id bigint, catalogue_id char(12), source text, retailer_id text, market char(2), currency char(3),
  current_minor integer, current_at timestamptz, low_30d_minor integer, prior_obs integer,
  history_days integer, baseline_allowed boolean, building_history boolean, drop_pct numeric, fresh boolean, may_alert boolean, retailer_name text
) language sql stable as $$
  with cur as (
    select distinct on (o.listing_id) o.listing_id, o.price_minor, o.observed_at, o.currency
    from price_observations o
    where o.error_state = 'ok' and o.observed_at <= $1
    order by o.listing_id, o.observed_at desc
  ), prior as (
    select c.listing_id, min(o.price_minor) as low, count(*) as n
    from cur c join price_observations o
      on o.listing_id = c.listing_id and o.error_state = 'ok' and o.currency = c.currency
     and o.observed_at >= $1 - interval '30 days' and o.observed_at < c.observed_at
    group by c.listing_id
  ), first_seen as (
    select o.listing_id, min(o.observed_at) as at
    from price_observations o where o.error_state = 'ok' and o.observed_at <= $1
    group by o.listing_id
  )
  select l.id, coalesce(m.catalogue_id, p.catalogue_id), l.source, l.retailer_id, l.market, c.currency,
    c.price_minor, c.observed_at,
    case when s.may_use_for_baseline then pr.low end,
    case when s.may_use_for_baseline then coalesce(pr.n, 0)::integer else 0 end,
    floor(extract(epoch from ($1 - f.at)) / 86400)::integer,
    s.may_use_for_baseline,
    (not s.may_use_for_baseline) or ($1 - f.at) < interval '30 days',
    case when s.may_use_for_baseline and pr.low > 0 and ($1 - f.at) >= interval '30 days'
         then round(100.0 * (pr.low - c.price_minor) / pr.low, 1) end,
    s.max_display_age is null or ($1 - c.observed_at) <= s.max_display_age,
    s.enabled and s.may_alert and r.price_alerts_enabled,
    r.name
  from cur c
  join listings l on l.id = c.listing_id
  join sources s on s.id = l.source
  join retailers r on r.id = l.retailer_id
  left join products p on p.id = l.product_id
  left join products m on m.id = p.merged_into
  left join prior pr on pr.listing_id = c.listing_id
  left join first_seen f on f.listing_id = c.listing_id
$$;

-- Fold a duplicate product into the one we keep. Its identifiers and listings move across; its row stays as a pointer
-- so old catalogue ids in share links still resolve. Chains are flattened so readers follow at most one hop.
create function merge_products(dup bigint, keep bigint) returns void language plpgsql as $$
begin
  if dup = keep then raise exception 'cannot merge a product into itself'; end if;
  if exists (select 1 from products where id = keep and merged_into is not null) then
    raise exception 'product % is itself merged; merge into its target instead', keep;
  end if;
  update product_identifiers set product_id = keep where product_id = dup;
  update listings set product_id = keep where product_id = dup;
  update products set merged_into = keep where id = dup or merged_into = dup;
end $$;

-- Delete history a source's licence does not let us keep. Run after each ingest.
create function prune_observations(as_of timestamptz default now()) returns bigint language sql as $$
  with gone as (
    delete from price_observations o
    using listings l, sources s
    where l.id = o.listing_id and s.id = l.source and s.retain_for is not null and o.observed_at < $1 - s.retain_for
    returning 1
  ) select count(*) from gone
$$;

-- Postgres lets every role run new functions, and Supabase also grants them to its anon and authenticated roles and
-- publishes them as RPC endpoints. Only the database owner (the ingest job) may run these.
do $$
declare fn text; who text;
begin
  foreach fn in array array['price_baseline(timestamptz)', 'merge_products(bigint, bigint)', 'prune_observations(timestamptz)', 'price_obs_currency_matches()'] loop
    execute format('revoke execute on function %s from public', fn);
    foreach who in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = who) then execute format('revoke execute on function %s from %I', fn, who); end if;
    end loop;
  end loop;
end $$;
