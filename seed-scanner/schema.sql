-- AcreLogic Seed Price Cache Schema
-- Run once on your Neon Postgres instance:
--   psql $DATABASE_URL -f schema.sql
-- (main.py also auto-creates these via init_db() on first boot)

CREATE TABLE IF NOT EXISTS seed_price_cache (
    variety_key   TEXT        NOT NULL,
    vendor        TEXT        NOT NULL,
    raw_price     NUMERIC(8,2),
    raw_unit      TEXT,
    price_per_100 NUMERIC(10,4),
    stock         BOOLEAN     DEFAULT TRUE,
    confidence    NUMERIC(4,2),
    product_url   TEXT,
    scanned_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (variety_key, vendor)
);

-- Index for fast variety lookups (hot path on GET /api/seeds/prices)
CREATE INDEX IF NOT EXISTS idx_price_cache_variety ON seed_price_cache (variety_key);
CREATE INDEX IF NOT EXISTS idx_price_cache_scanned ON seed_price_cache (scanned_at DESC);

CREATE TABLE IF NOT EXISTS scan_runs (
    id          SERIAL      PRIMARY KEY,
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    varieties   INTEGER     DEFAULT 0,
    errors      INTEGER     DEFAULT 0,
    status      TEXT        DEFAULT 'running'
            CHECK (status IN ('running', 'complete', 'partial', 'failed'))
);
