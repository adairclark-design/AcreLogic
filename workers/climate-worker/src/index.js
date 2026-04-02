/**
 * AcreLogic Climate API — Cloudflare Worker
 *
 * Single endpoint consolidates:
 *   1. Geocoding (Nominatim / OpenStreetMap — free, no key)
 *   2. Frost dates (Open-Meteo Historical — free, no key)
 *   3. USDA Plant Hardiness Zone (planthardiness.ars.usda.gov — free)
 *   4. Soil type (USDA Web Soil Survey — free REST)
 *   5. Elevation (Open-Elevation — free, no key)
 *   6. Solar irradiance class (NASA POWER API — free, no key)
 *
 * Usage: GET /farm-profile?address=Portland%2C%20Oregon
 *    or: GET /farm-profile?lat=45.52&lon=-122.68
 *
 * Cache: Results are cached by rounded lat/lon (2 decimal places = ~1km grid)
 * CORS:  Open for the mobile app
 */

export default {
    async fetch(request, env, ctx) {
        // ── CORS preflight ──────────────────────────────────────────────────────
        if (request.method === 'OPTIONS') {
            return corsResponse('', 204);
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            if (path === '/farm-profile') {
                return await handleFarmProfile(url, env, ctx);
            }
            if (path === '/pricing') {
                return await handlePricing(url, env, ctx);
            }
            if (path === '/ai-advisor') {
                return await handleAiAdvisor(request, env);
            }
            if (path === '/ai-plan-generator') {
                return await handleAiPlanGenerator(request, env);
            }
            if (path === '/ai-vision') {
                return await handleAiVision(request, env);
            }
            return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
        } catch (err) {
            console.error('[Worker] Error:', err.message);
            return corsResponse(JSON.stringify({ error: err.message }), 500);
        }
    },
};

// ─── /ai-advisor Handler (Gemini 1.5 Flash) ────────────────────────────────────
async function handleAiAdvisor(request, env) {
    if (request.method !== 'POST') {
        return corsResponse(JSON.stringify({ error: 'POST required' }), 405);
    }

    const apiKey = env.GOOGLE_API_KEY;
    if (!apiKey) {
        return corsResponse(JSON.stringify({ error: 'AI advisor not configured' }), 503);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
    }

    const { messages = [], farmContext = {} } = body;

    // Build the system prompt with rich farm context
    const systemPrompt = buildFarmingSystemPrompt(farmContext);

    // Format messages for Gemini API (user/model turns)
    const geminiContents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
    }));

    const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiContents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
            topP: 0.9,
        },
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const err = await res.text();
        console.error('[AI Advisor] Gemini error:', err);
        return corsResponse(JSON.stringify({ error: 'AI service unavailable', detail: err }), 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Sorry, I could not generate a response.';

    return corsResponse(JSON.stringify({ reply: text }), 200);
}

function buildFarmingSystemPrompt(ctx) {
    const { farmProfile = {}, selectedCrops = [], bedSuccessions = {}, bedCount = 8 } = ctx;

    const location = farmProfile.address
        ? `Farm location: ${farmProfile.address}`
        : farmProfile.lat
            ? `Farm coordinates: ${farmProfile.lat}, ${farmProfile.lon}`
            : 'Location: not specified';

    const frostInfo = farmProfile.last_frost_date
        ? `Last frost: ${farmProfile.last_frost_date} | First frost: ${farmProfile.first_frost_date} | Frost-free days: ${farmProfile.frost_free_days}`
        : 'Frost dates: unknown';

    const zone = farmProfile.usda_zone ? `USDA Zone: ${farmProfile.usda_zone}` : '';
    const soil = farmProfile.soil_type ? `Soil type: ${farmProfile.soil_type}` : '';

    const cropList = selectedCrops.length > 0
        ? `Crops selected for this season: ${selectedCrops.join(', ')}`
        : 'No crops selected yet';

    const bedSummary = Object.entries(bedSuccessions)
        .filter(([, succs]) => succs?.length > 0)
        .map(([num, succs]) => `  Bed ${num}: ${succs.map(s => s.crop_name ?? s.name).join(' → ')}`)
        .join('\n');

    const bedInfo = bedSummary
        ? `Current bed plan (${bedCount} beds total):\n${bedSummary}`
        : `${bedCount} beds in planning — none assigned yet`;

    return `You are Max, a friendly and expert market garden advisor for AcreLogic. You specialize in small-scale organic market gardening, CSA farming, and intensive vegetable production. You have deep knowledge of succession planting, crop rotation, pest management, soil health, and farm economics.

IMPORTANT — This is the farmer's actual plan. Use this context in every answer:
${location}
${frostInfo}
${zone ? zone + '\n' : ''}${soil ? soil + '\n' : ''}
${cropList}
${bedInfo}

Guidelines:
- Be concise and practical. Farmers are busy — give direct answers.
- When you don't know something specific to their location, say so and give general guidance.
- Use the farmer's own crops and bed plan when giving advice.
- Keep responses under 4 sentences unless a detailed explanation is truly needed.
- You can ask one clarifying question at a time if needed.
- Speak like a knowledgeable farming neighbor, not a textbook.`;
}

// ─── /farm-profile Handler ─────────────────────────────────────────────────────
async function handleFarmProfile(url, env, ctx) {
    let lat = url.searchParams.get('lat');
    let lon = url.searchParams.get('lon');
    const address = url.searchParams.get('address');

    // Step 1: Geocode if address given instead of coords
    if (!lat || !lon) {
        if (!address) {
            return corsResponse(JSON.stringify({ error: 'Provide address or lat/lon' }), 400);
        }
        const geo = await geocodeAddress(address);
        lat = geo.lat;
        lon = geo.lon;
    }

    lat = parseFloat(lat);
    lon = parseFloat(lon);

    // Step 2: Cache key (1km grid) — fp3 busts stale zone-Unknown entries from fp2
    const cacheKey = `fp3_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (env.ACRELOGIC_CACHE) {
        const cached = await env.ACRELOGIC_CACHE.get(cacheKey);
        if (cached) {
            return corsResponse(cached, 200, { 'X-Cache': 'HIT' });
        }
    }

    // Step 3: Fetch all data in parallel
    let zipCode = null;
    if (address && /^\d{5}$/.test(address.trim())) {
        zipCode = address.trim();
    }

    const [frostData, soilData, elevationData, solarData, zoneData] = await Promise.allSettled([
        getFrostDates(lat, lon),
        getSoilType(lat, lon),
        getElevation(lat, lon),
        getSolarClass(lat, lon),
        getHardinessZone(lat, lon, zipCode),
    ]);

    const frost = frostData.status === 'fulfilled' ? frostData.value : {};
    const soil = soilData.status === 'fulfilled' ? soilData.value : { soil_type: 'Unknown' };
    const elev = elevationData.status === 'fulfilled' ? elevationData.value : { elevation_ft: null };
    const solar = solarData.status === 'fulfilled' ? solarData.value : { sun_exposure: 'Unknown' };
    const zone = zoneData.status === 'fulfilled' ? zoneData.value : { zone: 'Unknown' };

    const profile = {
        lat,
        lon,
        frost_free_days: frost.frost_free_days ?? null,
        last_frost_date: frost.last_frost_date ?? null,
        first_frost_date: frost.first_frost_date ?? null,
        usda_zone: zone.zone ?? null,
        soil_type: soil.soil_type ?? 'Unknown',
        elevation_ft: elev.elevation_ft ?? null,
        sun_exposure: solar.sun_exposure ?? 'Unknown',
        fetched_at: new Date().toISOString(),
    };

    const body = JSON.stringify(profile);

    // Cache for 7 days (climate data doesn't change rapidly)
    if (env.ACRELOGIC_CACHE) {
        ctx.waitUntil(env.ACRELOGIC_CACHE.put(cacheKey, body, { expirationTtl: 60 * 60 * 24 * 7 }));
    }

    return corsResponse(body, 200);
}

// ─── Geocoding (Nominatim) ────────────────────────────────────────────────────
async function geocodeAddress(address) {
    const trimmed = address.trim();
    const isUsZip = /^\d{5}$/.test(trimmed);

    // For US zip codes, use the structured postalcode query with countrycodes=us
    // This prevents Nominatim from returning foreign locations for US zips.
    const queryUrl = isUsZip
        ? `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(trimmed)}&countrycodes=us&format=json&limit=1`
        : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`;

    const res = await fetch(queryUrl, {
        headers: { 'User-Agent': 'AcreLogic/1.0 (farm planning app)' },
    });
    const data = await res.json();
    if (!data || data.length === 0) throw new Error(`Could not geocode address: ${address}`);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// ─── Frost Dates (Open-Meteo Historical) ─────────────────────────────────────
async function getFrostDates(lat, lon) {
    // Use last 10 years of historical daily min temp to compute frost dates
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 10;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${currentYear - 1}-12-31&daily=temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.daily || !data.daily.time) {
        throw new Error('Open-Meteo returned no frost data');
    }

    const temps = data.daily.temperature_2m_min;
    const dates = data.daily.time;

    // For each year, find last spring frost (<= 32°F) and first fall frost (<= 32°F)
    const yearlyLastFrost = [];
    const yearlyFirstFrost = [];

    for (let year = startYear; year < currentYear; year++) {
        const yearIndices = [];
        for (let i = 0; i < dates.length; i++) {
            if (dates[i].startsWith(`${year}`)) yearIndices.push(i);
        }
        const yearData = yearIndices.map(i => ({ date: dates[i], temp: temps[i] }));

        const springFrosts = yearData.filter(r => {
            const month = parseInt(r.date.split('-')[1]);
            return month <= 6 && r.temp !== null && r.temp <= 32;
        });
        const fallFrosts = yearData.filter(r => {
            const month = parseInt(r.date.split('-')[1]);
            return month >= 7 && r.temp !== null && r.temp <= 32;
        });

        if (springFrosts.length > 0 && fallFrosts.length > 0) {
            yearlyLastFrost.push(springFrosts[springFrosts.length - 1].date);
            yearlyFirstFrost.push(fallFrosts[0].date);
        }
        // Years with NO spring frost are legitimately frost-free — skip them
        // This prevents mild years from pulling the average too early
    }

    if (yearlyLastFrost.length === 0) {
        // Frost-free region (tropical/mild) — return full year
        return {
            frost_free_days: 365,
            last_frost_date: `${currentYear}-01-15`,
            first_frost_date: `${currentYear}-12-15`,
        };
    }

    // Use 75th percentile for last spring frost (conservative / safe-to-plant date)
    // i.e. "by this date, 75% of years had their last frost" — safer than the mean
    const p75LastFrost = percentileMonthDay(yearlyLastFrost, 0.75, currentYear);
    // Use 25th percentile for first fall frost (conservative — earlier side)
    const p25FirstFrost = percentileMonthDay(yearlyFirstFrost, 0.25, currentYear);

    // Frost-free days from the percentile dates
    const frostFreeDays = Math.round(
        (new Date(`${p25FirstFrost}T00:00:00`) - new Date(`${p75LastFrost}T00:00:00`)) / (1000 * 60 * 60 * 24)
    );

    return {
        frost_free_days: Math.max(0, frostFreeDays),
        last_frost_date: p75LastFrost,
        first_frost_date: p25FirstFrost,
    };
}

/**
 * Given an array of date strings (YYYY-MM-DD from different years),
 * return a percentile date (using only month+day, mapped to a shared year).
 *
 * percentile = 0.75 → 75th percentile (conservative last-frost date)
 */
function percentileMonthDay(dateStrings, percentile, year) {
    // Convert to day-of-year for sorting
    const doys = dateStrings.map(d => {
        const parts = d.split('-');
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        // Approximate day-of-year (ignoring leap year differences, close enough)
        return (month - 1) * 30.44 + day;
    });

    doys.sort((a, b) => a - b);
    const idx = Math.min(Math.floor(doys.length * percentile), doys.length - 1);
    const targetDoy = doys[idx];

    // Convert day-of-year back to month/day
    const month = Math.min(12, Math.max(1, Math.ceil(targetDoy / 30.44)));
    const day = Math.min(28, Math.max(1, Math.round(targetDoy - (month - 1) * 30.44)));
    const m = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${m}-${dd}`;
}

// ─── USDA Hardiness Zone ──────────────────────────────────────────────────────

/**
 * Approximate USDA hardiness zone from lat/lon using mean annual minimum temp.
 * Uses a simplified model based on latitude bands. Better than returning 'Unknown'.
 */
function approximateZoneFromLatLon(lat, lon) {
    // Very rough approximation based on US latitude/longitude bands
    // Pacific coast (west of -115°) runs warmer than inland at same lat
    const isPacificCoast = lon < -115;
    const isSouthernUS = lat < 32;
    const isDeepSouth = lat < 28;

    if (isDeepSouth) return '10a';          // FL/TX gulf coast
    if (isSouthernUS && isPacificCoast) return '9b'; // Southern CA
    if (isSouthernUS) return '8b';           // TX/GA/SC
    if (lat < 36 && isPacificCoast) return '9a'; // Central CA
    if (lat < 36) return '7b';              // Mid-South (NC/TN/OK)
    if (lat < 38 && isPacificCoast) return '9a';
    if (lat < 38) return '6b';             // VA/KY/MO
    if (lat < 40 && isPacificCoast) return '8b'; // OR coast
    if (lat < 40) return '6a';             // OH/PA/NJ
    if (lat < 42 && isPacificCoast) return '8a'; // OR/WA coast
    if (lat < 42) return '5b';             // NY/MI/WI
    if (lat < 44 && isPacificCoast) return '8a';
    if (lat < 44) return '5a';             // VT/MN
    if (lat < 46 && isPacificCoast) return '7b'; // WA coast
    if (lat < 46) return '4b';             // Northern MN/ME
    if (lat < 48 && isPacificCoast) return '7a'; // WA coast
    if (lat < 48) return '4a';
    return '3b';                            // Canada border areas
}

async function getZipCode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AcreLogic/1.0 (farm planning app)' } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.address?.postcode?.split('-')[0] ?? null;
}

async function getHardinessZone(lat, lon, knownZip = null) {
    let zipCode = knownZip;
    if (!zipCode) {
        zipCode = await getZipCode(lat, lon);
    }

    // Try phzmapi.org (free USDA hardiness zone API by zip code)
    if (zipCode && /^\d{5}$/.test(zipCode)) {
        try {
            const url = `https://phzmapi.org/${zipCode}.json`;
            const res = await fetch(url);
            if (res.ok) {
                const text = await res.text();
                // phzmapi.org sometimes returns XML error pages — guard against that
                if (text.trim().startsWith('{')) {
                    const data = JSON.parse(text);
                    if (data.zone && data.zone !== 'Unknown') {
                        return { zone: data.zone };
                    }
                }
            }
        } catch (_) { }
    }

    // Fallback: derive zone from lat/lon using a simplified latitude model
    // Only applies to locations within the continental US (lat 24-49, lon -125 to -66)
    const isContiguousUS = lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
    if (isContiguousUS) {
        return { zone: approximateZoneFromLatLon(lat, lon) };
    }

    return { zone: 'Unknown' };
}

// ─── USDA Web Soil Survey ─────────────────────────────────────────────────────
async function getSoilType(lat, lon) {
    // SoilWeb API — returns soil series name at point
    const url = `https://casoilresource.lawr.ucdavis.edu/api/wsss/get_series_from_point/?lon=${lon}&lat=${lat}`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'AcreLogic/1.0' },
    });
    if (!res.ok) return { soil_type: 'Unknown' };
    const data = await res.json();
    // Returns array of series, use highest confidence
    if (data && data.length > 0) {
        const top = data[0];
        return {
            soil_type: top.series_name ? capitalizeWords(top.series_name) : 'Unknown',
            soil_texture: top.taxorder ?? null,
        };
    }
    return { soil_type: 'Unknown' };
}

// ─── Open-Elevation ───────────────────────────────────────────────────────────
async function getElevation(lat, lon) {
    const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
    const res = await fetch(url);
    if (!res.ok) return { elevation_ft: null };
    const data = await res.json();
    const elevMeters = data?.results?.[0]?.elevation ?? null;
    return {
        elevation_ft: elevMeters !== null ? Math.round(elevMeters * 3.28084) : null,
        elevation_m: elevMeters,
    };
}

// ─── NASA POWER Solar ─────────────────────────────────────────────────────────
async function getSolarClass(lat, lon) {
    // Annual mean daily solar irradiance (kWh/m²/day)
    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN&community=AG&longitude=${lon}&latitude=${lat}&format=JSON&header=true`;
    const res = await fetch(url);
    if (!res.ok) return { sun_exposure: 'Unknown' };
    const data = await res.json();
    const annual = data?.properties?.parameter?.ALLSKY_SFC_SW_DWN?.ANN ?? null;

    let exposure = 'Unknown';
    if (annual !== null) {
        if (annual >= 5.5) exposure = 'High (South-Facing)';
        else if (annual >= 4.0) exposure = 'Moderate';
        else exposure = 'Low (Shaded / North-Facing)';
    }
    return { sun_exposure: exposure, solar_kwh_per_m2_day: annual };
}

// ─── /pricing Handler (USDA AMS) ──────────────────────────────────────────────
async function handlePricing(url, env, ctx) {
    const crop = url.searchParams.get('crop') ?? 'tomatoes';
    const region = url.searchParams.get('region') ?? 'Pacific-Northwest';

    const cacheKey = `price_${crop}_${region}`;
    if (env.ACRELOGIC_CACHE) {
        const cached = await env.ACRELOGIC_CACHE.get(cacheKey);
        if (cached) return corsResponse(cached, 200, { 'X-Cache': 'HIT' });
    }

    // USDA AMS Farmers Market Report — organic specialty crops
    // Example endpoint: https://marsapi.ams.usda.gov/services/v1.2/reports/3160
    // Note: requires a free AMS API key (stored in env.USDA_AMS_KEY)
    let priceData = { crop, region, source: 'static_fallback', price_per_lb: null };

    try {
        const apiKey = env.USDA_AMS_KEY ?? '';
        // AMS Specialty Crops Market News — Pacific Northwest
        const amsUrl = `https://marsapi.ams.usda.gov/services/v1.2/reports/3160?q=${encodeURIComponent(crop)}&report_begin_date=${nDaysAgo(14)}&api_key=${apiKey}`;
        const res = await fetch(amsUrl);
        if (res.ok) {
            const data = await res.json();
            const organic = data?.results?.filter(r => r.organic === 'Organic') ?? [];
            if (organic.length > 0) {
                priceData.price_per_lb = parseFloat(organic[0].avg_price) ?? null;
                priceData.source = 'usda_ams';
                priceData.report_date = organic[0].report_date;
            }
        }
    } catch (_) {
        // Fall back to static database prices if AMS unavailable
    }

    const body = JSON.stringify(priceData);
    if (env.ACRELOGIC_CACHE) {
        ctx.waitUntil(env.ACRELOGIC_CACHE.put(cacheKey, body, { expirationTtl: 60 * 60 * 24 })); // 24hr cache
    }
    return corsResponse(body, 200);
}

// ─── /ai-plan-generator Handler ────────────────────────────────────────────────
async function handleAiPlanGenerator(request, env) {
    if (request.method !== 'POST') {
        return corsResponse(JSON.stringify({ error: 'POST required' }), 405);
    }
    const apiKey = env.GOOGLE_API_KEY;
    if (!apiKey) {
        return corsResponse(JSON.stringify({ error: 'AI not configured' }), 503);
    }

    let body;
    try { body = await request.json(); } catch (e) {
        console.error('[ai-plan-generator] JSON parse error:', e.message);
        return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
    }

    const { farmProfile = {}, memberCount = 10, availableCrops = [] } = body;
    // Allow as few as 1 member — scale beds accordingly
    const effectiveMembers = Math.max(1, parseInt(memberCount) || 10);

    const location = farmProfile.address ?? `Zone ${farmProfile.usda_zone ?? 'unknown'}`;
    const frostInfo = farmProfile.frost_free_days
        ? `${farmProfile.frost_free_days} frost-free days, last frost ${farmProfile.last_frost_date}, first frost ${farmProfile.first_frost_date}`
        : 'Growing season not specified';
    const cropList = availableCrops.map(c => `${c.name} (${c.dtm}d DTM, $${c.price}/lb, ${c.yield_lbs} lbs/bed)`).join(', ');

    const prompt = `You are an expert market garden planner. Create the best possible 8-bed CSA plan for a small market garden with these details:

Location: ${location}
Season: ${frostInfo}
CSA Members: ${effectiveMembers} (scale yields accordingly — even 1-10 members is valid for a micro-CSA)
Available crops: ${cropList || 'diverse market garden vegetables'}

Your task: Select and prioritize the best crops for exactly 8 beds to maximize CSA variety and member satisfaction for ${memberCount} members.

Rules:
1. Each bed should have 2-4 succession crops to fill the season
2. Prioritize high-yield, high-value crops, and CSA staples
3. Include a mix of fast crops (salad greens, radishes) and anchor crops (tomatoes, squash)
4. For ${memberCount} members, calculate how many beds of each crop are needed
5. Avoid repeating the same crop more than 2 beds unless it's a staple

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "beds": [
    {"bed": 1, "crops": ["Arugula", "Spinach", "Cover Crop"]},
    {"bed": 2, "crops": ["Kale", "Swiss Chard"]},
    ...8 beds total...
  ],
  "csa_notes": "Brief 1-2 sentence note on why this plan works for ${memberCount} members"
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        return corsResponse(JSON.stringify({ error: 'AI service error', detail: err }), 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

    let plan;
    try {
        plan = JSON.parse(text);
    } catch {
        // Try to extract JSON from text
        const match = text.match(/\{[\s\S]*\}/);
        plan = match ? JSON.parse(match[0]) : { beds: [], csa_notes: 'Could not generate plan' };
    }

    return corsResponse(JSON.stringify({ plan }), 200);
}

// ─── /ai-vision Handler (Gemini Vision — Pest/Disease ID) ───────────────────
async function handleAiVision(request, env) {
    if (request.method !== 'POST') return corsResponse(JSON.stringify({ error: 'POST required' }), 405);
    const apiKey = env.GOOGLE_API_KEY;
    if (!apiKey) return corsResponse(JSON.stringify({ error: 'AI not configured' }), 503);

    let body;
    try { body = await request.json(); } catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400); }

    const { imageBase64, mimeType = 'image/jpeg', farmContext = {} } = body;
    if (!imageBase64) return corsResponse(JSON.stringify({ error: 'imageBase64 required' }), 400);

    const { cropNames = [], location = 'unknown location', farmProfile = {} } = farmContext;
    const cropList = cropNames.length ? cropNames.join(', ') : 'unknown crops';

    const systemText = `You are a certified crop specialist and plant pathologist helping a market gardener diagnose plant health issues.

Farm context:
- Location: ${location}
- Crops growing: ${cropList}
- Season: ${farmProfile.last_frost_date ? `After last frost (${farmProfile.last_frost_date})` : 'Growing season'}

Analyze the image and provide:
1. **Diagnosis** — what you see (disease, pest, deficiency, or healthy)
2. **Cause** — likely cause and conditions that created it
3. **Severity** — mild / moderate / severe
4. **Action** — 2-3 specific organic-approved treatment steps
5. **Prevention** — how to prevent recurrence

Be specific and practical. If it looks healthy, say so clearly.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                role: 'user',
                parts: [
                    { text: systemText },
                    { inline_data: { mime_type: mimeType, data: imageBase64 } },
                    { text: 'Please diagnose what you see in this photo.' },
                ],
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        return corsResponse(JSON.stringify({ error: 'AI vision error', detail: err }), 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Could not analyze image';
    return corsResponse(JSON.stringify({ diagnosis: text }), 200);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function corsResponse(body, status = 200, extraHeaders = {}) {
    return new Response(body, {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            ...extraHeaders,
        },
    });
}

function capitalizeWords(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

function nDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}
