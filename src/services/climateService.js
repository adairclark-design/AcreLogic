/**
 * AcreLogic Climate Service — Mobile App
 * Calls the Cloudflare Worker and normalizes the response.
 * Falls back to cached local data if offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── USDA Zone → Average Frost Dates ──────────────────────────────────────────
// Average last/first frost dates for each USDA hardiness zone (continental US).
// Dates use the current calendar year so math stays consistent.
const Y = new Date().getFullYear();

const USDA_ZONE_FROST_MAP = {
    '3a': { last_frost: `${Y}-05-28`, first_frost: `${Y}-09-15`, frost_free: 109 },
    '3b': { last_frost: `${Y}-05-15`, first_frost: `${Y}-09-25`, frost_free: 132 },
    '4a': { last_frost: `${Y}-05-05`, first_frost: `${Y}-10-05`, frost_free: 152 },
    '4b': { last_frost: `${Y}-04-25`, first_frost: `${Y}-10-12`, frost_free: 169 },
    '5a': { last_frost: `${Y}-04-15`, first_frost: `${Y}-10-15`, frost_free: 182 },
    '5b': { last_frost: `${Y}-04-05`, first_frost: `${Y}-10-25`, frost_free: 202 },
    '6a': { last_frost: `${Y}-03-25`, first_frost: `${Y}-11-01`, frost_free: 220 },
    '6b': { last_frost: `${Y}-03-15`, first_frost: `${Y}-11-10`, frost_free: 239 },
    '7a': { last_frost: `${Y}-03-05`, first_frost: `${Y}-11-20`, frost_free: 259 },
    '7b': { last_frost: `${Y}-02-22`, first_frost: `${Y}-11-30`, frost_free: 280 },
    '8a': { last_frost: `${Y}-02-10`, first_frost: `${Y}-12-05`, frost_free: 297 },
    '8b': { last_frost: `${Y}-02-01`, first_frost: `${Y}-12-15`, frost_free: 317 },
    '9a': { last_frost: `${Y}-01-20`, first_frost: `${Y}-12-20`, frost_free: 333 },
    '9b': { last_frost: `${Y}-01-10`, first_frost: `${Y}-12-28`, frost_free: 351 },
    '10a': { last_frost: null,        first_frost: null,          frost_free: 365 },
    '10b': { last_frost: null,        first_frost: null,          frost_free: 365 },
    '11a': { last_frost: null,        first_frost: null,          frost_free: 365 },
    '11b': { last_frost: null,        first_frost: null,          frost_free: 365 },
};

/** Ordered list of all USDA zones for the picker UI. */
export const USDA_ZONES = Object.keys(USDA_ZONE_FROST_MAP);

/**
 * Build a minimal farmProfile object from a USDA zone string.
 * Returns null if zone is unknown.
 */
export function getProfileFromZone(zone) {
    const entry = USDA_ZONE_FROST_MAP[zone?.toLowerCase()];
    if (!entry) return null;
    return {
        usda_zone: zone,
        last_frost_date:  entry.last_frost,
        first_frost_date: entry.first_frost,
        frost_free_days:  entry.frost_free,
        // No lat/lon/soil — zone-only profile
        _source: 'zone_picker',
    };
}

// ── Replace with your deployed Worker URL after `wrangler deploy` ────────────
const WORKER_BASE_URL = 'https://acrelogic-climate-worker.adair-clark.workers.dev';

const PORTLAND_OR_FALLBACK = {
    lat: 45.5231,
    lon: -122.6765,
    frost_free_days: 210,          // Willamette Valley average (zone 8b) — ~Apr 2 to Oct 30
    last_frost_date: `${new Date().getFullYear()}-04-02`,
    first_frost_date: `${new Date().getFullYear()}-10-30`,
    usda_zone: '8b',
    soil_type: 'Silty Loam',
    elevation_ft: 50,
    sun_exposure: 'High (South-Facing)',
    fetched_at: new Date().toISOString(),
    _is_fallback: true,
};

// ─── Fetch Farm Profile ────────────────────────────────────────────────────────
/**
 * Given an address string, returns a normalized FarmProfile object.
 * Caches to AsyncStorage for 7 days keyed by address.
 *
 * Returns:
 *   { lat, lon, frost_free_days, last_frost_date, first_frost_date,
 *     usda_zone, soil_type, elevation_ft, sun_exposure, fetched_at }
 */
export async function fetchFarmProfile(address) {
    const cacheKey = `@acrelogic_profile_${address.toLowerCase().replace(/\s+/g, '_')}`;

    // Check AsyncStorage cache first
    try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            const ageMs = Date.now() - new Date(parsed.fetched_at).getTime();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (ageMs < sevenDays) {
                console.log('[ClimateService] Returning cached profile for:', address);
                return { ...parsed, _from_cache: true };
            }
        }
    } catch (_) { }

    // Fetch from Worker — in its own try/catch so storage failures can't discard good data
    let normalized = null;
    try {
        const url = `${WORKER_BASE_URL}/farm-profile?address=${encodeURIComponent(address)}`;
        const res = await fetch(url);   // Note: timeout option is not supported by fetch API
        if (!res.ok) throw new Error(`Worker returned ${res.status}`);
        const profile = await res.json();
        normalized = normalizeFarmProfile(profile, address);
    } catch (err) {
        console.warn('[ClimateService] Worker fetch failed:', err.message);
    }

    // If we got a good result, cache it separately so storage failure never discards it
    if (normalized) {
        try {
            await AsyncStorage.setItem(cacheKey, JSON.stringify(normalized));
        } catch (_) { }
        return normalized;
    }

    // Try stale cache as a fallback before returning the region default
    try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) return { ...JSON.parse(cached), _stale: true };
    } catch (_) { }

    // Last resort: Portland, OR / Willamette Valley region defaults
    console.warn('[ClimateService] Returning static fallback data');
    return PORTLAND_OR_FALLBACK;
}

/**
 * Fetch farm profile by coordinates (for GPS-based location).
 */
export async function fetchFarmProfileByCoords(lat, lon) {
    try {
        const url = `${WORKER_BASE_URL}/farm-profile?lat=${lat}&lon=${lon}`;
        const res = await fetch(url, { timeout: 12000 });
        if (!res.ok) throw new Error(`Worker returned ${res.status}`);
        return normalizeFarmProfile(await res.json(), `${lat},${lon}`);
    } catch (err) {
        console.warn('[ClimateService] Coord fetch failed:', err.message);
        return PORTLAND_OR_FALLBACK;
    }
}

// ─── Frost Date Utilities ──────────────────────────────────────────────────────

/**
 * Given a farm profile, compute how many frost-free days remain
 * starting from a given planning date.
 */
export function getRemainingFrostFreeDays(profile, fromDate = new Date()) {
    const firstFrost = new Date(`${profile.first_frost_date}T00:00:00`);
    const from = new Date(fromDate);
    const remainingMs = firstFrost - from;
    return Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60 * 24)));
}

/**
 * Determine whether a date falls in the cool or warm season.
 * Cool: temps < 70°F avg (spring, fall)
 * Warm: temps > 70°F avg (summer)
 */
export function getSeasonClass(dateStr, lat) {
    const month = new Date(dateStr).getMonth() + 1; // 1-12

    // Northern hemisphere: cool = Mar-May, Sep-Nov; warm = Jun-Aug
    if (lat >= 0) {
        if ((month >= 3 && month <= 5) || (month >= 9 && month <= 11)) return 'cool';
        if (month >= 6 && month <= 8) return 'warm';
        return 'cool'; // Dec, Jan, Feb — still cool crops viable with row cover
    }
    // Southern hemisphere (flip)
    if ((month >= 9 && month <= 11) || (month >= 3 && month <= 5)) return 'warm';
    return 'cool';
}

/**
 * Given a last frost date string (YYYY-MM-DD), compute seed-start dates
 * for transplant crops that need X weeks indoors before transplanting.
 */
export function getSeedStartDate(lastFrostDateStr, weeksBeforeLastFrost) {
    const lastFrost = new Date(`${lastFrostDateStr}T00:00:00`);
    const seedStart = new Date(lastFrost);
    seedStart.setDate(seedStart.getDate() - weeksBeforeLastFrost * 7);
    return seedStart.toISOString().split('T')[0];
}

/**
 * Add days to a date string, return ISO date string.
 */
export function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

/**
 * Format date for display: "April 15" or "Sep 28"
 */
export function formatDateDisplay(dateStr) {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export async function fetchOrganicPrice(cropName, region = 'Pacific-Northwest') {
    try {
        const url = `${WORKER_BASE_URL}/pricing?crop=${encodeURIComponent(cropName)}&region=${encodeURIComponent(region)}`;
        const res = await fetch(url, { timeout: 8000 });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeFarmProfile(raw, address) {
    return {
        address: address ?? null,
        lat: raw.lat ?? null,
        lon: raw.lon ?? null,
        frost_free_days: raw.frost_free_days ?? 170,
        last_frost_date: raw.last_frost_date ?? `${new Date().getFullYear()}-04-15`,
        first_frost_date: raw.first_frost_date ?? `${new Date().getFullYear()}-10-15`,
        usda_zone: raw.usda_zone ?? 'Unknown',
        soil_type: raw.soil_type ?? 'Unknown',
        elevation_ft: raw.elevation_ft ?? null,
        sun_exposure: raw.sun_exposure ?? 'Unknown',
        fetched_at: raw.fetched_at ?? new Date().toISOString(),
    };
}
