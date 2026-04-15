"""
scanner.py — Vendor Price Scraping Engine
══════════════════════════════════════════
Called by main.py's scheduler and admin endpoint.

Fetches product pages from Johnny's, Baker Creek, Territorial using
requests (with polite retry + caching) and normalizes prices via
Gemini 1.5 Flash structured output.

Writes results directly to Neon Postgres seed_price_cache table.
"""

import os
import re
import json
import time
import logging
import hashlib
from pathlib import Path
from typing import Optional

import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

GEMINI_API_KEY   = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_GEMINI_API_KEY")
GEMINI_URL       = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

CACHE_DIR = Path(".tmp/html_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

VENDOR_SEARCH_URLS = {
    "Johnnys": {
        "search": "https://www.johnnyseeds.com/search?q={q}&prefn1=catalogSection&prefv1=Vegetable+%26+Herb",
        "base":   "https://www.johnnyseeds.com",
    },
    "BakerCreek": {
        "search": "https://www.rareseeds.com/catalogsearch/result/?q={q}",
        "base":   "https://www.rareseeds.com",
    },
    "Territorial": {
        "search": "https://territorialseed.com/search?type=product&q={q}",
        "base":   "https://territorialseed.com",
    },
}

# Known varieties from seedVendorSKUs.json — loaded as baseline scan list
KNOWN_VARIETIES_PATH = Path(__file__).parent.parent / "src/data/seedVendorSKUs.json"

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# ─── HTTP Fetch (disk-cached, 6h TTL) ────────────────────────────────────────

def _fetch(url: str, ttl_hours: float = 6.0) -> Optional[str]:
    key = hashlib.md5(url.encode()).hexdigest()
    cache_file = CACHE_DIR / f"{key}.txt"
    if cache_file.exists():
        age = (time.time() - cache_file.stat().st_mtime) / 3600
        if age < ttl_hours:
            return cache_file.read_text(encoding="utf-8", errors="replace")
    try:
        r = requests.get(url, headers=HTTP_HEADERS, timeout=18, allow_redirects=True)
        r.raise_for_status()
        text = r.text
        cache_file.write_text(text, encoding="utf-8")
        time.sleep(1.5)  # polite rate limit
        return text
    except Exception as e:
        log.warning(f"Fetch failed {url}: {e}")
        return None


def _clean_html(html: str, max_chars: int = 10_000) -> str:
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()[:max_chars]


# ─── Gemini Price Extraction ──────────────────────────────────────────────────

PROMPT = """You are a seed catalog parser. From the text below (scraped from a seed vendor's page), extract the FIRST listing that best matches the crop variety "{variety}".

Return ONLY valid JSON with these fields:
- variety_name: string
- raw_price: float (USD)
- raw_unit: string (e.g. "250 seeds", "1/4 oz", "1 gram")
- seeds_per_unit: integer or null
- oz_per_unit: float or null
- stock: boolean
- product_url_path: string or null (relative path, e.g. "/products/kale-lacinato")
- confidence: float 0–1

If no match found, return {{"not_found": true}}

Page text:
---
{text}
---

Return ONLY the JSON."""


def _gemini_extract(variety: str, page_text: str) -> Optional[dict]:
    if not GEMINI_API_KEY:
        log.error("GEMINI_API_KEY not set")
        return None
    prompt = PROMPT.format(variety=variety, text=page_text)
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.05,
            "maxOutputTokens": 400,
            "responseMimeType": "application/json",
        },
    }
    try:
        r = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json=payload, timeout=25,
        )
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except Exception as e:
        log.warning(f"Gemini extract failed for {variety}: {e}")
        return None


# ─── Unit Normalization → price_per_100_seeds ─────────────────────────────────

SEEDS_PER_OZ = {
    "lettuce": 25000, "spinach": 4000, "kale": 8000, "chard": 1500, "arugula": 10000,
    "carrot": 20000, "beet": 6000, "radish": 8000, "turnip": 10000,
    "basil": 18000, "cilantro": 2500, "dill": 10000, "parsley": 10000,
    "tomato": 8000, "pepper": 5000, "eggplant": 5000,
    "cucumber": 1000, "squash": 200, "zucchini": 200,
    "bean": 100, "pea": 200,
    "default": 10000,
}

def _price_per_100(raw: dict, variety: str) -> Optional[float]:
    if not raw or raw.get("not_found") or not raw.get("raw_price"):
        return None
    price = float(raw["raw_price"])
    seeds = raw.get("seeds_per_unit")
    if seeds and seeds > 0:
        return round((price / seeds) * 100, 4)
    oz = raw.get("oz_per_unit")
    if not oz:
        unit = (raw.get("raw_unit") or "").lower()
        m = re.search(r"([\d./]+)\s*oz", unit)
        if m:
            try:
                s = m.group(1)
                oz = float(s.split("/")[0]) / float(s.split("/")[1]) if "/" in s else float(s)
            except Exception:
                pass
        g = re.search(r"([\d.]+)\s*g(?:ram)?", unit)
        if g and not oz:
            oz = float(g.group(1)) * 0.03527
    if oz and oz > 0:
        vl = variety.lower()
        spo = next((v for k, v in SEEDS_PER_OZ.items() if k in vl), SEEDS_PER_OZ["default"])
        return round((price / (oz * spo)) * 100, 4)
    return None


# ─── Per-Variety Scan ─────────────────────────────────────────────────────────

def _scan_one(variety: str) -> list[dict]:
    """Scan all 3 vendors for one variety. Returns list of DB row dicts."""
    rows = []
    for vendor, cfg in VENDOR_SEARCH_URLS.items():
        q = requests.utils.quote(variety)
        url = cfg["search"].format(q=q)
        html = _fetch(url)
        if not html:
            continue
        text = _clean_html(html)
        raw = _gemini_extract(variety, text)
        if not raw or raw.get("not_found"):
            rows.append({
                "variety_key":   re.sub(r"[^a-z0-9]+", "_", variety.lower()).strip("_"),
                "vendor":        vendor,
                "raw_price":     None,
                "raw_unit":      None,
                "price_per_100": None,
                "stock":         False,
                "confidence":    1.0,
                "product_url":   url,
            })
            continue
        ppu = _price_per_100(raw, variety)
        product_url = (cfg["base"] + raw["product_url_path"]) if raw.get("product_url_path") else url
        rows.append({
            "variety_key":   re.sub(r"[^a-z0-9]+", "_", variety.lower()).strip("_"),
            "vendor":        vendor,
            "raw_price":     raw.get("raw_price"),
            "raw_unit":      raw.get("raw_unit"),
            "price_per_100": ppu,
            "stock":         bool(raw.get("stock", True)),
            "confidence":    raw.get("confidence", 0.5),
            "product_url":   product_url,
        })
        log.info(f"  ✓ {vendor}/{variety} → ${raw.get('raw_price')} ({raw.get('raw_unit')})")
    return rows


# ─── DB Write ─────────────────────────────────────────────────────────────────

def _upsert_rows(conn, rows: list[dict]):
    with conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, """
                INSERT INTO seed_price_cache
                    (variety_key, vendor, raw_price, raw_unit, price_per_100, stock, confidence, product_url, scanned_at)
                VALUES
                    (%(variety_key)s, %(vendor)s, %(raw_price)s, %(raw_unit)s,
                     %(price_per_100)s, %(stock)s, %(confidence)s, %(product_url)s, NOW())
                ON CONFLICT (variety_key, vendor) DO UPDATE SET
                    raw_price     = EXCLUDED.raw_price,
                    raw_unit      = EXCLUDED.raw_unit,
                    price_per_100 = EXCLUDED.price_per_100,
                    stock         = EXCLUDED.stock,
                    confidence    = EXCLUDED.confidence,
                    product_url   = EXCLUDED.product_url,
                    scanned_at    = NOW()
            """, rows)


# ─── Public API ───────────────────────────────────────────────────────────────

def scan_varieties(database_url: str, varieties: list[str]):
    """Scan a specific list of varieties and cache results."""
    conn = psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
    total_rows = 0
    for variety in varieties:
        try:
            rows = _scan_one(variety)
            if rows:
                _upsert_rows(conn, rows)
                total_rows += len(rows)
        except Exception as e:
            log.error(f"scan_varieties error for {variety}: {e}")
    conn.close()
    log.info(f"scan_varieties: wrote {total_rows} rows for {len(varieties)} varieties")


def run_full_scan(database_url: str):
    """
    Full nightly scan — reads all known varieties from seedVendorSKUs.json
    and scans all 3 vendors. Writes a scan_runs record on completion.
    """
    conn = psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)

    # Load known variety display names from SKU file
    varieties = []
    if KNOWN_VARIETIES_PATH.exists():
        try:
            sku_db = json.loads(KNOWN_VARIETIES_PATH.read_text())
            # Convert crop_id keys to human-readable names (spaces, title case)
            for key in sku_db.get("crops", {}):
                name = key.replace("_", " ").title()
                varieties.append(name)
        except Exception as e:
            log.warning(f"Could not load SKU file: {e}")

    if not varieties:
        varieties = [
            "Lettuce Butterhead", "Kale Lacinato", "Kale Red Russian",
            "Spinach Regiment", "Arugula", "Chard Rainbow",
            "Carrot Nelson", "Carrot Danvers", "Radish French Breakfast",
            "Beet Chioggia", "Basil Genovese", "Cilantro Santo",
            "Tomato Sungold", "Tomato Cherokee Purple",
            "Pepper California Wonder", "Cucumber Marketmore",
            "Zucchini Black Beauty", "Bean Provider", "Pea Sugar Snap",
        ]

    log.info(f"Full scan: {len(varieties)} varieties × 3 vendors starting")

    # Record scan run
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO scan_runs (varieties, status) VALUES (%s, %s) RETURNING id",
                (len(varieties), "running")
            )
            run_id = cur.fetchone()["id"]

    errors = 0
    total_rows = 0
    for variety in varieties:
        try:
            rows = _scan_one(variety)
            if rows:
                _upsert_rows(conn, rows)
                total_rows += len(rows)
        except Exception as e:
            log.error(f"Full scan error [{variety}]: {e}")
            errors += 1

    # Mark scan complete
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE scan_runs SET finished_at=NOW(), errors=%s, status=%s WHERE id=%s",
                (errors, "complete" if errors == 0 else "partial", run_id)
            )

    conn.close()
    log.info(f"Full scan done: {total_rows} rows, {errors} errors")
