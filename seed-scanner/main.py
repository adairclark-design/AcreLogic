"""
main.py — Seed Scanner Worker (Railway)
════════════════════════════════════════
FastAPI service that:
  1. Serves cached vendor prices via GET /api/seeds/prices
  2. Triggers nightly full scan via APScheduler (2am UTC)
  3. Exposes POST /api/seeds/scan for manual/admin trigger

Shared cache in Neon Postgres — all 100 users read the same data.
Price TTL: 24 hours. Fallback: 200 with is_cached=false if scan running.

Deploy on Railway as a background worker.
Set env vars: DATABASE_URL, GEMINI_API_KEY, ADMIN_SECRET, PORT (default 8080)
"""

import os
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
import psycopg2
import psycopg2.extras

from scanner import run_full_scan, scan_varieties

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ["DATABASE_URL"]
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "change-me-in-railway")
PORT         = int(os.environ.get("PORT", 8000))

# ─── DB Connection ────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def init_db():
    """Create price_cache table if it doesn't exist."""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS seed_price_cache (
                    variety_key   TEXT NOT NULL,
                    vendor        TEXT NOT NULL,
                    raw_price     NUMERIC(8,2),
                    raw_unit      TEXT,
                    price_per_100 NUMERIC(10,4),
                    stock         BOOLEAN DEFAULT TRUE,
                    confidence    NUMERIC(4,2),
                    product_url   TEXT,
                    scanned_at    TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (variety_key, vendor)
                );

                CREATE TABLE IF NOT EXISTS scan_runs (
                    id          SERIAL PRIMARY KEY,
                    started_at  TIMESTAMPTZ DEFAULT NOW(),
                    finished_at TIMESTAMPTZ,
                    varieties   INTEGER DEFAULT 0,
                    errors      INTEGER DEFAULT 0,
                    status      TEXT DEFAULT 'running'
                );
            """)
    conn.close()
    log.info("DB initialized.")


# ─── Scheduler ────────────────────────────────────────────────────────────────

scheduler = BackgroundScheduler()

def nightly_scan_job():
    log.info("⏰ Nightly scan triggered by scheduler")
    try:
        run_full_scan(DATABASE_URL)
        log.info("✅ Nightly scan complete")
    except Exception as e:
        log.error(f"❌ Nightly scan failed: {e}")

# ─── App Lifespan ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🌱 Seed Scanner Worker starting up")
    init_db()
    # Run scan immediately on boot in a background thread to prevent Railway 502s
    import threading
    log.info("Triggering background cache warm on boot...")
    t = threading.Thread(target=run_full_scan, args=(DATABASE_URL,), daemon=True)
    t.start()
    # Schedule nightly at 2am UTC
    scheduler.add_job(nightly_scan_job, "cron", hour=2, minute=0)
    scheduler.start()
    log.info("📅 Nightly scanner scheduled at 02:00 UTC")
    yield
    scheduler.shutdown()
    log.info("Seed Scanner Worker shut down")

# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(title="AcreLogic Seed Price Scanner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten to your domain in production
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/seeds/prices")
def get_prices(varieties: str = Query(..., description="Comma-separated variety names")):
    """
    Return cached vendor prices for the requested varieties.
    Response format matches priceData[] expected by seedCostOptimizer.js.
    """
    variety_list = [v.strip() for v in varieties.split(",") if v.strip()]
    if not variety_list:
        raise HTTPException(400, "No varieties provided")
    if len(variety_list) > 60:
        raise HTTPException(400, "Max 60 varieties per request")

    conn = get_conn()
    result = []
    uncached = []

    try:
        with conn.cursor() as cur:
            for variety in variety_list:
                key = _variety_key(variety)
                cur.execute("""
                    SELECT vendor, raw_price, raw_unit, price_per_100, stock, confidence, product_url, scanned_at
                    FROM seed_price_cache
                    WHERE variety_key = %s
                      AND scanned_at > NOW() - INTERVAL '24 hours'
                """, (key,))
                rows = cur.fetchall()

                if not rows:
                    uncached.append(variety)
                    result.append(_mock_price_item(variety))
                    continue

                vendors = {}
                for row in rows:
                    vendors[row["vendor"]] = {
                        "price":    float(row["raw_price"] or 0),
                        "stock":    bool(row["stock"]),
                        "rawUnit":  row["raw_unit"] or "",
                        "price_per_100": float(row["price_per_100"] or 0),
                        "url":      row["product_url"],
                    }

                result.append({
                    "variety":   variety,
                    "cropId":    key,
                    "vendors":   vendors,
                    "cached":    True,
                    "cachedAt":  rows[0]["scanned_at"].isoformat() if rows else None,
                })
    finally:
        conn.close()

    # Trigger background scan for anything uncached (fire-and-forget)
    if uncached:
        import threading
        log.info(f"Background scan triggered for {len(uncached)} uncached varieties")
        t = threading.Thread(target=scan_varieties, args=(DATABASE_URL, uncached), daemon=True)
        t.start()

    return {
        "prices":   result,
        "cached":   len(variety_list) - len(uncached),
        "uncached": len(uncached),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/seeds/scan")
def trigger_scan(x_admin_secret: str = Header(None)):
    """Admin endpoint to trigger a full scan immediately."""
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Forbidden")
    import threading
    t = threading.Thread(target=run_full_scan, args=(DATABASE_URL,), daemon=True)
    t.start()
    return {"status": "scan_started", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/seeds/cache-status")
def cache_status():
    """Return info on how many varieties are cached and when last scanned."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(DISTINCT variety_key) AS varieties,
                    COUNT(*) AS records,
                    MAX(scanned_at) AS last_scan,
                    MIN(scanned_at) AS oldest_entry
                FROM seed_price_cache
                WHERE scanned_at > NOW() - INTERVAL '24 hours'
            """)
            row = cur.fetchone()
            cur.execute("SELECT * FROM scan_runs ORDER BY id DESC LIMIT 5")
            runs = cur.fetchall()
        return {
            "fresh_varieties": int(row["varieties"] or 0),
            "fresh_records":   int(row["records"] or 0),
            "last_scan":       row["last_scan"].isoformat() if row["last_scan"] else None,
            "oldest_entry":    row["oldest_entry"].isoformat() if row["oldest_entry"] else None,
            "recent_runs":     [dict(r) for r in runs],
        }
    finally:
        conn.close()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _variety_key(name: str) -> str:
    """Normalize variety name to a stable cache key."""
    import re
    return re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")


# Category-based mock prices (returned for uncached varieties while background scan runs)
_MOCK_BASE = {
    "greens": 3.75, "kale": 3.95, "lettuce": 3.75, "spinach": 3.75,
    "carrot": 3.95, "beet": 3.50, "radish": 3.50, "root": 3.95,
    "basil": 3.95, "herb": 3.95, "tomato": 4.95, "pepper": 4.95,
    "cucumber": 4.50, "squash": 4.25, "bean": 4.25, "pea": 4.25,
    "default": 4.25,
}

def _mock_price_item(variety: str) -> dict:
    name_lower = variety.lower()
    base = next((v for k, v in _MOCK_BASE.items() if k in name_lower), _MOCK_BASE["default"])
    return {
        "variety": variety,
        "cropId":  _variety_key(variety),
        "cached":  False,
        "vendors": {
            "Johnnys":     {"price": round(base * 1.05, 2), "stock": True, "rawUnit": "est.", "price_per_100": 0},
            "BakerCreek":  {"price": round(base * 0.94, 2), "stock": True, "rawUnit": "est.", "price_per_100": 0},
            "Territorial": {"price": round(base * 1.08, 2), "stock": True, "rawUnit": "est.", "price_per_100": 0},
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
