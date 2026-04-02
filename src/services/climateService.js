/**
 * AcreLogic Climate Service — Mobile App
 * Calls the Cloudflare Worker and normalizes the response.
 * Falls back to cached local data if offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── USDA Zone → Frost Date Estimates (Conservative / 75th Percentile) ────────
// These use the conservative 75th-percentile last-frost date across US stations
// for each zone — meaning 75% of locations in that zone have had their last frost
// by this date. Zone picker is for rough planning only; use address lookup for
// regional precision (e.g. PNW 8b ≈ April 1, Gulf Coast 8b ≈ Feb 1).
const Y = new Date().getFullYear();

const USDA_ZONE_FROST_MAP = {
    '3a': { last_frost: `${Y}-06-01`, first_frost: `${Y}-09-10`, frost_free: 101 },
    '3b': { last_frost: `${Y}-05-20`, first_frost: `${Y}-09-20`, frost_free: 122 },
    '4a': { last_frost: `${Y}-05-10`, first_frost: `${Y}-10-01`, frost_free: 143 },
    '4b': { last_frost: `${Y}-05-01`, first_frost: `${Y}-10-08`, frost_free: 159 },
    '5a': { last_frost: `${Y}-04-20`, first_frost: `${Y}-10-15`, frost_free: 177 },
    '5b': { last_frost: `${Y}-04-10`, first_frost: `${Y}-10-20`, frost_free: 192 },
    '6a': { last_frost: `${Y}-04-01`, first_frost: `${Y}-10-28`, frost_free: 209 },
    '6b': { last_frost: `${Y}-03-22`, first_frost: `${Y}-11-05`, frost_free: 227 },
    '7a': { last_frost: `${Y}-03-15`, first_frost: `${Y}-11-15`, frost_free: 244 },
    '7b': { last_frost: `${Y}-03-05`, first_frost: `${Y}-11-25`, frost_free: 264 },
    '8a': { last_frost: `${Y}-03-01`, first_frost: `${Y}-12-01`, frost_free: 274 },
    '8b': { last_frost: `${Y}-03-15`, first_frost: `${Y}-12-10`, frost_free: 269 },
    '9a': { last_frost: `${Y}-02-15`, first_frost: `${Y}-12-15`, frost_free: 302 },
    '9b': { last_frost: `${Y}-01-25`, first_frost: `${Y}-12-25`, frost_free: 333 },
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
    const cacheKey = `@acrelogic_profile_v2_${address.toLowerCase().replace(/\s+/g, '_')}`;

    // Check AsyncStorage cache first — skip if zone is 'Unknown' (stale bad geocode data)
    try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            const ageMs = Date.now() - new Date(parsed.fetched_at).getTime();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            const hasGoodZone = parsed.usda_zone && parsed.usda_zone !== 'Unknown';
            if (ageMs < sevenDays && hasGoodZone) {
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
 * SOIL_TEMP_OFFSET_DAYS
 * ─────────────────────
 * Days AFTER last frost before soil is warm enough for safe outdoor planting
 * (bare ground, no greenhouse or row cover).
 *
 * Modified for PNW Market realities — Basil and tender herbs need 35+ days.
 */
export const SOIL_TEMP_OFFSET_DAYS = {
    'Nightshade':  35,   // tomato, pepper, eggplant — soil 60 °F+
    'Cucurbit':    21,   // squash, cucumber, melon — soil 55 °F+
    'Legume':      14,   // beans, warm-season legumes — soil 50 °F+
    'Grain':       14,   // corn — soil 50 °F+
    'Herb':        35,   // basil, lemon verbena etc. — HIGH cold sensitivity
    'Flower':      21,   // annual warm flowers (zinnia, marigold)
    'Tuber':       28,   // sweet potato slips — warm soil critical
    'Fruit':       21,   // strawberry runners etc.
    'Specialty':   21,   // okra, celery etc.
    '_default':    21,   // safe fallback for any other warm category
};

/**
 * Returns the integer days offset from last frost for safe planting.
 * Nightshades/Warm crops get massive delays to let soil warm.
 * Cool-season direct sown crops are actively planted -28 days BEFORE last frost.
 * Cool-season transplants are planted exactly on or close to the frost-free date.
 */
export function getIdealOffsetDays(crop) {
    const isWarm = crop.season === 'warm';
    
    if (isWarm) {
        const nameFilter = (crop.name || '').toLowerCase();
        const noteFilter = ((crop.notes || '') + ' ' + (crop.description || '')).toLowerCase();

        // ── Tier 3: The Absolute Divas (+60 Days) ──
        // Goal: Eggplant and Basil demand 65°F+ soil. In a greenhouse, that's "First Week of May"
        // (If LFD=Apr 15, greenhouse shift=-42 days -> Mar 4. Mar 4 + 60 days = May 3)
        const isDiva = 
            crop.category === 'Herb' ||                         // Basil, Lemon Verbena, Stevia
            nameFilter.includes('eggplant');                    // Eggplants

        if (isDiva) {
            return 60;
        }

        // ── Tier 2: The Heat Seekers (+50 Days) ──
        // Goal: Peppers & Winter Squash need "Late April to Early May" in a greenhouse
        // Mar 4 + 50 days = April 23
        const isHeatSeeker = 
            nameFilter.includes('pepper') ||                    // Hot & Sweet Peppers
            nameFilter.includes('sweet potato') ||              // Sweet Potatoes
            nameFilter.includes('okra') ||                      // Okra
            nameFilter.includes('melon') ||                     // Watermelons/Cantaloupe
            nameFilter.includes('tomatillo') ||                 // Tomatillos
            nameFilter.includes('winter squash') ||             // Winter Squash explicit name
            noteFilter.includes('winter squash');               // Winter Squash via description
            
        if (isHeatSeeker) {
            return 50; 
        }

        // ── Tier 1: Standard Warm Weather Crops (+35 Days) ──
        // Goal: Tomatoes & Zucchini/Summer Squash need "Mid-April" in a greenhouse
        // Mar 4 + 35 days = April 8
        const isStandardWarm =
            crop.category === 'Nightshade' ||                   // Tomatoes
            crop.category === 'Cucurbit';                       // Remaining Squash/Cucumbers

        if (isStandardWarm) {
            return 35;
        }

        // ── 55°F Soil: Mild Warm Crops ──
        // Requires ~14-21 days (Beans, Corn, Sunflowers)
        return SOIL_TEMP_OFFSET_DAYS[crop.category] ?? SOIL_TEMP_OFFSET_DAYS._default;
    } else {
        // Cool season crops: if Direct Sow, they go in 4 weeks BEFORE last frost.
        if (crop.seed_type !== 'TP') return -28;
        return crop.hard_frost ? -14 : 0;
    }
}

/**
 * Returns the exact ideal chronological date a crop should safely go into the ground.
 */
export function getIdealStartDate(crop, lastFrostDateStr) {
    if (!lastFrostDateStr) return null;
    return addDays(lastFrostDateStr, getIdealOffsetDays(crop));
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
    // ── Microclimate Overrides ──
    // The 2023 USDA map shifted parts of Lake Oswego to 9a, but practical farming there remains 8b.
    const addrLower = (address || '').toLowerCase();
    const isLakeOswego = addrLower.includes('97035') || 
                         addrLower.includes('97034') || 
                         addrLower.includes('lake oswego');
    
    const finalZone = isLakeOswego ? '8b' : (raw.usda_zone ?? 'Unknown');

    return {
        address: address ?? null,
        lat: raw.lat ?? null,
        lon: raw.lon ?? null,
        frost_free_days: raw.frost_free_days ?? 170,
        last_frost_date: raw.last_frost_date ?? `${new Date().getFullYear()}-04-15`,
        first_frost_date: raw.first_frost_date ?? `${new Date().getFullYear()}-10-15`,
        usda_zone: finalZone,
        soil_type: raw.soil_type ?? 'Unknown',
        elevation_ft: raw.elevation_ft ?? null,
        sun_exposure: raw.sun_exposure ?? 'Unknown',
        fetched_at: raw.fetched_at ?? new Date().toISOString(),
    };
}
