/**
 * seedProcurementService.js — V2 (Affiliate WebView Model)
 * ══════════════════════════════════════════════════════════
 * Provides mock/live price data for the Seed Savant price comparison panel.
 * Does NOT autonomously purchase — generates affiliate cart URLs only.
 *
 * Phase 1: Mock price data (realistic variance across 3 vendors)
 * Phase 2: Replace fetchVendorPrices() with real Railway API call
 */

// ─── Vendor reference prices by crop category ─────────────────────────────────
// Sourced from Jan 2026 catalog averages: Johnny's, Baker Creek, Territorial.
const CATEGORY_BASE_PRICES = {
    Greens:    { Johnnys: 3.75, BakerCreek: 3.25, Territorial: 3.95 },
    Brassica:  { Johnnys: 4.25, BakerCreek: 3.75, Territorial: 4.50 },
    Root:      { Johnnys: 3.95, BakerCreek: 3.49, Territorial: 3.99 },
    Allium:    { Johnnys: 3.95, BakerCreek: 3.25, Territorial: 4.25 },
    Legume:    { Johnnys: 4.50, BakerCreek: 3.99, Territorial: 4.75 },
    Herb:      { Johnnys: 3.95, BakerCreek: 3.49, Territorial: 3.99 },
    Nightshade:{ Johnnys: 4.95, BakerCreek: 4.25, Territorial: 5.25 },
    Cucurbit:  { Johnnys: 4.50, BakerCreek: 3.95, Territorial: 4.75 },
    Flower:    { Johnnys: 4.25, BakerCreek: 3.75, Territorial: 4.50 },
    Specialty: { Johnnys: 5.25, BakerCreek: 4.75, Territorial: 5.50 },
    default:   { Johnnys: 4.25, BakerCreek: 3.75, Territorial: 4.50 },
};

// Simulate realistic out-of-stock patterns (some vendors run out of specific crops)
const MOCK_OOS_PATTERNS = {
    // BakerCreek tends to sell out of popular hybrid varieties
    Nightshade: { BakerCreek: 0.2 }, // 20% chance OOS
    Cucurbit:   { BakerCreek: 0.15 },
    // Territorial runs out of specialty items more
    Specialty:  { Territorial: 0.25 },
};

/**
 * Build mock price data for a seed list.
 * Returns the priceData array consumed by solveOptimalCart().
 *
 * Format per item:
 * {
 *   cropId, name, emoji, category,
 *   vendors: {
 *     Johnnys:     { price: 3.95, stock: true, rawUnit: '500 seeds' },
 *     BakerCreek:  { price: 3.25, stock: true, rawUnit: '1/4 oz' },
 *     Territorial: { price: 4.25, stock: false, rawUnit: null },
 *   }
 * }
 */
export function buildMockPriceData(seedList) {
    return seedList.map((item, idx) => {
        const basePrices = CATEGORY_BASE_PRICES[item.category] || CATEGORY_BASE_PRICES.default;
        const oosPct = MOCK_OOS_PATTERNS[item.category] || {};

        const vendors = {};
        for (const [vendor, basePrice] of Object.entries(basePrices)) {
            // Add ±12% variance seeded by cropId+vendor to keep results stable
            const seed = hashStr(item.cropId + vendor);
            const variance = 1 + ((seed % 25) - 12) / 100;
            const price = parseFloat((basePrice * variance).toFixed(2));

            // Determine stock status
            const oosProbability = oosPct[vendor] || 0;
            const stockSeed = hashStr(item.cropId + vendor + 'stock');
            const stock = (stockSeed % 100) / 100 > oosProbability;

            const rawUnit = item.reqType === 'seeds'
                ? `${Math.round(200 + (seed % 300))}-seed packet`
                : ['1/4 oz packet', '1/2 oz packet', '1 oz packet'][(seed % 3)];

            vendors[vendor] = { price, stock, rawUnit };
        }

        return {
            cropId: item.cropId,
            name: item.name,
            emoji: item.emoji || '🌱',
            category: item.category,
            vendors,
        };
    });
}

/** Deterministic string hash (no randomness — prices stay stable across renders) */
function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }
    return Math.abs(h);
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'acrelogic_seed_scan_v2';

export function saveScanResult(priceData, cartPlan) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                priceData,
                cartPlan,
                savedAt: new Date().toISOString(),
            }));
        }
    } catch { /* silent */ }
}

export function loadSavedScanResult() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const { priceData, cartPlan, savedAt } = JSON.parse(raw);
        const ageHours = (Date.now() - new Date(savedAt).getTime()) / 3_600_000;
        if (ageHours > 6) return null; // prices stale after 6h
        return { priceData, cartPlan };
    } catch { return null; }
}

export function clearScanResult() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* silent */ }
}

// ─── Phase 2: Real API Call ────────────────────────────────────────────────────
// Set EXPO_PUBLIC_SEED_SCANNER_URL in .env to activate live prices.
// When not set, this throws and the caller falls back to buildMockPriceData().

const SCANNER_URL = typeof process !== 'undefined'
    ? (process.env.EXPO_PUBLIC_SEED_SCANNER_URL || 'https://acrelogic-production.up.railway.app')
    : 'https://acrelogic-production.up.railway.app';

/**
 * Fetch live vendor prices from the Railway seed-scanner worker.
 * Returns priceData[] in the same format as buildMockPriceData().
 * Throws if worker URL not configured or request fails.
 */
export async function fetchVendorPrices(seedList) {
    if (!SCANNER_URL) throw new Error('EXPO_PUBLIC_SEED_SCANNER_URL not set');

    const varieties = seedList.map(item => item.name).join(',');
    const url = `${SCANNER_URL}/api/seeds/prices?varieties=${encodeURIComponent(varieties)}`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) throw new Error(`Scanner API ${resp.status}`);

    const data = await resp.json();

    // Normalize worker response → priceData[] format for seedCostOptimizer
    return (data.prices || []).map(item => ({
        cropId:   item.cropId,
        name:     item.variety,
        emoji:    seedList.find(s => s.name === item.variety)?.emoji || '🌱',
        category: seedList.find(s => s.name === item.variety)?.category || 'default',
        vendors:  _normalizeVendors(item.vendors),
        cached:   item.cached,
    }));
}

function _normalizeVendors(vendors) {
    const out = {};
    for (const [vendor, v] of Object.entries(vendors || {})) {
        out[vendor] = {
            price:    v.price   || 0,
            stock:    v.stock   !== false,
            rawUnit:  v.rawUnit || '',
        };
    }
    return out;
}
