-- Drop Club price store. MySQL 8.0.19+ (needs INSERT ... AS alias).
-- Apply once: node scripts/price-store.mjs --init
-- Connection: MYSQL_URL=mysql://USER:PASSWORD@HOST:3306/dropclub
--
-- products.sku is the catalogue id (see scripts/sku.mjs). It is ours, like an ISIN we issue.
-- products.gtin is the barcode when we have one: the same product at every retailer.
-- listings.retailer_sku is the shop's own stock code. It is unique only inside that shop,
-- so prices are never joined on it and never joined on a title.

CREATE TABLE IF NOT EXISTS products (
  sku CHAR(12) NOT NULL,
  gtin CHAR(14) NULL,
  title VARCHAR(200) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (sku),
  UNIQUE KEY uq_products_gtin (gtin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS listings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku CHAR(12) NULL,
  source VARCHAR(32) NOT NULL,
  retailer VARCHAR(80) NOT NULL,
  retailer_sku VARCHAR(64) NULL,
  external_id VARCHAR(80) NOT NULL,
  url VARCHAR(500) NOT NULL,
  title VARCHAR(200) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_listing (source, external_id),
  KEY ix_listings_sku (sku),
  CONSTRAINT fk_listings_sku FOREIGN KEY (sku) REFERENCES products (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_observations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku CHAR(12) NULL,
  listing_id BIGINT UNSIGNED NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  price_pence INT UNSIGNED NULL,
  delivery_pence INT UNSIGNED NULL,
  currency CHAR(3) NOT NULL,
  in_stock TINYINT(1) NULL,
  confidence DECIMAL(3,2) NOT NULL,
  error_state ENUM('ok', 'not_found', 'blocked', 'changed') NOT NULL,
  offer_ref VARCHAR(80) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_obs (listing_id, observed_at),
  KEY ix_obs_sku_time (sku, observed_at),
  CONSTRAINT fk_obs_listing FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_obs_sku FOREIGN KEY (sku) REFERENCES products (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
