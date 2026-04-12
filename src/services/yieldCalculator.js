/**
 * AcreLogic Yield & Revenue Calculator
 * ======================================
 * Given a bed's succession plan, compute estimated yields and gross revenue.
 *
 * Formula basis:
 *   - Per-bed total seasonal yields from USDA and market garden research
 *   - Yield_lbs_per_100ft = TOTAL across all harvests (cut-and-come-again included)
 *   - harvest_count on each crop shows how many cuts/picks make up that total
 *   - Organic premium from USDA AMS Pacific Northwest market data
 *   - Revenue = (yield_lbs × price_per_lb) OR (bunches × price_per_bunch)
 *   - All estimates show a low/high range (±20%)
 *
 * Output example:
 *   Bed 1 — Arugula | 55 lbs · 3 cuts | $5/lb | $275 potential
 *   Bed 1 — Tomato  | 175 lbs · 12 picks | $8/lb | $1,400 potential
 */

import { getCropById, getYieldEstimates } from './database';
import { fetchOrganicPrice } from './climateService';
import { LBS_PER_BUNCH } from '../constants/cropConstants';

const BED_LENGTH_FT = 50;

// ─── Yield variance by crop category ─────────────────────────────────────────
// Real market-garden yields vary significantly by growing conditions, soil
// quality, and harvest timing. These multipliers define the realistic range.
// Low = conservative (new farm, average conditions)
// High = best-case (established soil, optimal timing) = the stated yield_lbs_per_100ft
const YIELD_VARIANCE = {
    'Greens': { low: 0.65, high: 0.85 },
    'Herb': { low: 0.70, high: 0.85 },
    'Brassica': { low: 0.60, high: 0.80 },
    'Nightshade': { low: 0.55, high: 0.85 },
    'Cucurbit': { low: 0.60, high: 0.85 },
    'Root': { low: 0.65, high: 0.80 },
    'Allium': { low: 0.65, high: 0.80 },
    'Legume': { low: 0.60, high: 0.80 },
    'Flower': { low: 0.65, high: 0.85 },
    'Specialty': { low: 0.65, high: 0.80 },
};
const DEFAULT_VARIANCE = { low: 0.65, high: 0.85 };

// ─── Main API ──────────────────────────────────────────────────────────────────

/**
 * Calculate yield and revenue estimates for all successions in a single bed.
 *
 * @param {number} bedNumber
 * @param {Array} successions - [{ crop_id, start_date, end_date }]
 * @param {object} farmProfile
 * @param {object} pricingOverrides - { [crop_id]: { price_per_lb?, price_per_bunch? } }
 * @returns {Array} Array of yield estimate objects
 */
export async function calculateBedYield(bedInfo, successions, farmProfile, pricingOverrides = {}) {
    const estimates = [];

    // Reverse compatibility for integer calls
    const bedNumber = typeof bedInfo === 'object' ? bedInfo.bed_number : bedInfo;
    const globalId = typeof bedInfo === 'object' ? (bedInfo.global_id || bedNumber) : bedNumber;
    const bedLabel = typeof bedInfo === 'object' ? (bedInfo.bed_label || `Bed ${bedNumber}`) : `Bed ${bedNumber}`;
    const blockId = typeof bedInfo === 'object' ? bedInfo.block_id : null;
    const blockName = typeof bedInfo === 'object' ? bedInfo.block_name : null;

    for (let i = 0; i < successions.length; i++) {
        const succ = successions[i];
        if (!succ.crop_id) continue;

        const crop = await getCropById(succ.crop_id);
        if (!crop || crop.feed_class === 'cover_crop') continue;

        // Compute actual bed-days used
        const startDate = new Date(`${succ.start_date}T00:00:00`);
        const endDate = new Date(`${succ.end_date}T00:00:00`);
        const bedDaysUsed = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));

        // Yield calculation based on true linear row-feet
        const bedLengthFt = typeof bedInfo === 'object' && bedInfo.bed_length_ft ? bedInfo.bed_length_ft : BED_LENGTH_FT;
        const fraction = succ.coverage_fraction ?? 1.0;
        const yieldLbs = calcYieldLbs(crop, bedLengthFt, fraction);
        
        let yieldBunches = calcYieldBunches(crop, bedLengthFt, fraction);
        const cropLbsPerBunch = crop.lbs_per_bunch ?? LBS_PER_BUNCH[crop.category] ?? null;
        // Dynamic Bunch logic fallback
        if (yieldBunches === null && cropLbsPerBunch) {
            yieldBunches = yieldLbs / cropLbsPerBunch;
        }

        // Pricing — prefer live pricing override, then crop DB price, then static organic default
        const override = pricingOverrides[crop.id] ?? {};
        let priceLb = override.price_per_lb ?? crop.wholesale_price_per_lb ?? 2.0;
        let priceBunch = override.price_per_bunch ?? crop.wholesale_price_per_bunch ?? null;

        // Apply organic premium
        const organicMultiplier = 1 + (crop.organic_premium_pct ?? 0) / 100;
        const organicPriceLb = priceLb * organicMultiplier;
        const organicPriceBunch = priceBunch ? priceBunch * organicMultiplier : null;

        // Yield range using per-category variance (These represent the TOTAL seasonal yield across all harvests)
        const variance = YIELD_VARIANCE[crop.category] ?? DEFAULT_VARIANCE;
        const yieldLbsLow = Math.round(yieldLbs * variance.low);
        const yieldLbsHigh = Math.round(yieldLbs * variance.high);
        const yieldBunchesLow = yieldBunches ? Math.round(yieldBunches * variance.low) : null;
        const yieldBunchesHigh = yieldBunches ? Math.round(yieldBunches * variance.high) : null;

        // Revenue: Calculate gross revenue natively off the Total Seasonal Yield.
        // DO NOT multiply by harvestCount, as yieldLbs and yieldBunches are already cumulative.
        const harvestCount = crop.harvest_count ?? 1;
        const revenueLow = calculateRevenue(yieldLbsLow, yieldBunchesLow, organicPriceLb, organicPriceBunch);
        const revenueHigh = calculateRevenue(yieldLbsHigh, yieldBunchesHigh, organicPriceLb, organicPriceBunch);
        const revenueMid = Math.round((revenueLow + revenueHigh) / 2);

        const csaLbsPerShare = crop.csa_lbs_per_share ?? 1.0;
        const csaHouseholdsServed = Math.round(yieldLbs / csaLbsPerShare);

        estimates.push({
            global_id: globalId,
            bed_number: bedNumber,
            bed_label: bedLabel,
            block_id: blockId,
            block_name: blockName,
            succession_slot: i + 1,
            crop_id: crop.id,
            crop_name: crop.name,
            crop_variety: crop.variety,
            category: crop.category,
            start_date: succ.start_date,
            end_date: succ.end_date,
            bed_days_used: bedDaysUsed,
            estimated_yield_lbs: Math.round(yieldLbs),  // midpoint for calculations
            yield_lbs_low: yieldLbsLow,
            yield_lbs_high: yieldLbsHigh,
            estimated_yield_bunches: yieldBunches ? Math.round(yieldBunches) : null,
            yield_bunches_low: yieldBunchesLow,
            yield_bunches_high: yieldBunchesHigh,
            yield_unit: crop.yield_unit,
            harvest_count: crop.harvest_count ?? 1,
            harvest_notes: crop.harvest_notes ?? null,
            csa_lbs_per_share: csaLbsPerShare,
            csa_share_unit: crop.csa_share_unit ?? 'lb',
            csa_households_served: csaHouseholdsServed,
            price_per_lb: parseFloat(organicPriceLb.toFixed(2)),
            price_per_bunch: organicPriceBunch ? parseFloat(organicPriceBunch.toFixed(2)) : null,
            gross_revenue_low: Math.round(revenueLow),
            gross_revenue_mid: Math.round(revenueMid),
            gross_revenue_high: Math.round(revenueHigh),
            is_auto_generated: succ.is_auto_generated ?? false,
            display_line: buildYieldDisplayLine(crop, bedNumber, yieldLbsLow, yieldLbsHigh, yieldBunches, organicPriceLb, organicPriceBunch, bedDaysUsed, revenueLow, revenueHigh),
        });
    }

    return estimates;
}


/**
 * Calculate full-farm yield summary across all 8 beds.
 *
 * @param {Array} allBedSuccessions - [{ bed_number, successions }]
 * @param {object} farmProfile
 * @param {object} pricingOverrides
 * @returns {object} { byBed, byCrop, totals }
 */
export async function calculateFarmYield(allBedSuccessions, farmProfile, pricingOverrides = {}) {
    const allEstimates = [];

    for (const bed of allBedSuccessions) {
        const bedEstimates = await calculateBedYield(
            bed, // Pass the entire bed object instead of just bed_number
            bed.successions,
            farmProfile,
            pricingOverrides
        );
        allEstimates.push(...bedEstimates);
    }

    // Group by bed (using global_id so blocks don't collide)
    const byBed = {};
    for (const est of allEstimates) {
        if (!byBed[est.global_id]) byBed[est.global_id] = [];
        byBed[est.global_id].push(est);
    }

    // Group by crop
    const byCrop = {};
    for (const est of allEstimates) {
        if (!byCrop[est.crop_id]) {
            byCrop[est.crop_id] = {
                crop_id: est.crop_id,
                crop_name: est.crop_name,
                crop_variety: est.crop_variety,
                total_yield_lbs: 0,
                total_yield_bunches: 0,
                total_revenue_low: 0,
                total_revenue_mid: 0,
                total_revenue_high: 0,
                bed_slots: 0,
                price_per_lb: est.price_per_lb,
                price_per_bunch: est.price_per_bunch,
            };
        }
        byCrop[est.crop_id].total_yield_lbs += est.estimated_yield_lbs ?? 0;
        byCrop[est.crop_id].total_yield_bunches += est.estimated_yield_bunches ?? 0;
        byCrop[est.crop_id].total_revenue_low += est.gross_revenue_low ?? 0;
        byCrop[est.crop_id].total_revenue_mid += est.gross_revenue_mid ?? 0;
        byCrop[est.crop_id].total_revenue_high += est.gross_revenue_high ?? 0;
        byCrop[est.crop_id].bed_slots += 1;
    }

    // Farm totals
    const totals = {
        total_revenue_low: allEstimates.reduce((s, e) => s + (e.gross_revenue_low ?? 0), 0),
        total_revenue_mid: allEstimates.reduce((s, e) => s + (e.gross_revenue_mid ?? 0), 0),
        total_revenue_high: allEstimates.reduce((s, e) => s + (e.gross_revenue_high ?? 0), 0),
        total_yield_lbs: allEstimates.reduce((s, e) => s + (e.estimated_yield_lbs ?? 0), 0),
        // CSA: max households served in a single week (limited by lowest-yielding crop)
        // Use average across all successions as a practical season metric
        total_households_served: Math.round(
            allEstimates.reduce((s, e) => s + (e.csa_households_served ?? 0), 0) / Math.max(allEstimates.length, 1)
        ),
        total_succession_slots: allEstimates.length,
        top_crops_by_revenue: Object.values(byCrop)
            .sort((a, b) => b.total_revenue_mid - a.total_revenue_mid)
            .slice(0, 5),
    };

    return { byBed, byCrop, totals };
}

/**
 * Update pricing for a crop from USDA AMS live data.
 * Returns the updated pricing or null if unavailable.
 */
export async function refreshLivePricing(cropName, region = 'Pacific-Northwest') {
    const liveData = await fetchOrganicPrice(cropName, region);
    if (!liveData?.price_per_lb) return null;
    return {
        price_per_lb: liveData.price_per_lb,
        source: liveData.source,
        report_date: liveData.report_date,
    };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Build a human-readable revenue display line:
 * "Arugula, Astro: 75–110 lbs · 3 cuts in 35 days | $5.50/lb organic — $413–$605 potential"
 */
function buildYieldDisplayLine(crop, bedNumber, yieldLow, yieldHigh, yieldBunches, priceLb, priceBunch, bedDays, revLow, revHigh) {
    const name = `${crop.name}, ${crop.variety}`;
    const harvestCount = crop.harvest_count ?? 1;
    const term = harvestTerm(crop.category, harvestCount);
    const cutsLabel = harvestCount > 1 ? ` · ${harvestCount} ${term}` : '';

    // Show range if low and high differ meaningfully
    const yieldStr = yieldLow === yieldHigh
        ? `${numberWithCommas(yieldHigh)} lbs total${cutsLabel}`
        : `${numberWithCommas(yieldLow)}–${numberWithCommas(yieldHigh)} lbs total${cutsLabel}`;

    const priceStr = priceBunch
        ? `$${priceLb.toFixed(2)}/lb | $${priceBunch.toFixed(2)}/bunch organic`
        : `$${priceLb.toFixed(2)}/lb organic`;

    const revenueStr = revLow === revHigh
        ? `$${numberWithCommas(Math.round(revHigh))} potential`
        : `$${numberWithCommas(Math.round(revLow))}–$${numberWithCommas(Math.round(revHigh))} potential`;

    return `${name} | ${yieldStr} in ${bedDays} days | ${priceStr} — ${revenueStr}`;
}

export function formatYieldRange(low, high, unit = 'lbs') {
    if (low === high) return `${numberWithCommas(low)} ${unit}`;
    return `${numberWithCommas(low)}–${numberWithCommas(high)} ${unit}`;
}

export function formatRevenueRange(low, high) {
    return `$${numberWithCommas(low)} – $${numberWithCommas(high)}`;
}

export function formatCurrency(amount) {
    return `$${numberWithCommas(Math.round(amount))}`;
}

/**
 * Return the correct harvest action word for a crop category.
 * Greens/Herbs are 'cut', fruiting crops are 'picked', roots are 'harvested'.
 */
export function harvestTerm(category, count = 1) {
    const CUT_CATS = ['Greens', 'Herb', 'Brassica', 'Flower'];
    const PICK_CATS = ['Nightshade', 'Cucurbit', 'Legume'];
    if (CUT_CATS.includes(category)) return count === 1 ? 'cut' : 'cuts';
    if (PICK_CATS.includes(category)) return count === 1 ? 'pick' : 'picks';
    return count === 1 ? 'harvest' : 'harvests';
}

// ─── Calculation Helpers ──────────────────────────────────────────────────────

function calcYieldLbs(crop, bedLengthFt, fraction = 1.0) {
    const linearFt = bedLengthFt * fraction;
    const perFt = (crop.yield_lbs_per_100ft ?? 0) / 100;
    return perFt * linearFt;
}

function calcYieldBunches(crop, bedLengthFt, fraction = 1.0) {
    if (!crop.yield_bunches_per_100ft) return null;
    const linearFt = bedLengthFt * fraction;
    const perFt = crop.yield_bunches_per_100ft / 100;
    return perFt * linearFt;
}

function calculateRevenue(yieldLbs, yieldBunches, priceLb, priceBunch) {
    // Use the higher-revenue unit as the primary
    const revByLb = yieldLbs * priceLb;
    const revByBunch = yieldBunches && priceBunch ? yieldBunches * priceBunch : 0;
    return Math.max(revByLb, revByBunch);
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─── CSA Box Slot Definitions ─────────────────────────────────────────────────
// A proper CSA box should have at least 1 item from each of 5 slots.
// These map crop categories → box slots. Cover crops never go in a box.
export const CSA_BOX_SLOTS = ['Root', 'Greens', 'Herb/Allium', 'Fruit', 'Specialty'];
export const CSA_CATEGORY_MAP = {
    'Root': 'Root',
    'Greens': 'Greens',
    'Herb': 'Herb/Allium',
    'Allium': 'Herb/Allium',
    'Nightshade': 'Fruit',
    'Cucurbit': 'Fruit',
    'Brassica': 'Greens',
    'Legume': 'Specialty',
    'Flower': 'Specialty',
    'Specialty': 'Specialty',
    'Cover Crop': null,
};

/**
 * Build a week-by-week CSA box schedule from all yield estimates.
 *
 * @param {Array}  allEstimates   - flattened array of yield estimate objects
 * @param {number} memberCount    - number of CSA members
 * @param {string} csaStartDate   - ISO date string (YYYY-MM-DD); weeks before this are excluded
 * @returns {Array} Week cards with box_categories, missing_slots, diversity_score
 */
export function buildWeeklyBoxSchedule(allEstimates, memberCount = 20, csaStartDate = null) {
    const validEstimates = allEstimates.filter(e => e.start_date && e.end_date && (e.estimated_yield_lbs ?? 0) > 0);
    if (validEstimates.length === 0) return [];

    const WEEK_MS = 7 * 86400000;
    const csaStart = csaStartDate ? new Date(`${csaStartDate}T00:00:00`) : null;

    const allDates = validEstimates.flatMap(e => [new Date(e.start_date), new Date(e.end_date)]);
    const seasonStart = new Date(Math.min(...allDates.map(d => d.getTime())));
    const seasonEnd = new Date(Math.max(...allDates.map(d => d.getTime())));

    // Align cursor to Monday
    const weekBuckets = [];
    let cursor = new Date(seasonStart);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    while (cursor <= seasonEnd) {
        weekBuckets.push({ start: new Date(cursor), end: new Date(cursor.getTime() + WEEK_MS), items: [] });
        cursor = new Date(cursor.getTime() + WEEK_MS);
    }

    for (const est of validEstimates) {
        const cropStart = new Date(est.start_date);
        const cropEnd = new Date(est.end_date);
        const harvestN = Math.max(1, est.harvest_count ?? 1);
        const totalLbs = est.estimated_yield_lbs;

        // Declining-yield weights: first cut biggest, each cut 25% less
        const rawW = Array.from({ length: harvestN }, (_, i) => Math.max(0.15, 1 - i * 0.25));
        const wSum = rawW.reduce((a, b) => a + b, 0);
        const weights = rawW.map(w => w / wSum);
        const inGroundMs = cropEnd.getTime() - cropStart.getTime();

        for (let h = 0; h < harvestN; h++) {
            const harvestDate = harvestN === 1
                ? cropEnd
                : new Date(cropStart.getTime() + ((h + 0.8) / harvestN) * inGroundMs);

            const lbs = Math.round(totalLbs * weights[h]);
            if (lbs <= 0) continue;

            const bucket = weekBuckets.find(b => harvestDate >= b.start && harvestDate < b.end);
            if (!bucket) continue;

            bucket.items.push({
                crop_id: est.crop_id,
                crop_name: est.crop_name,
                category: est.category ?? 'Specialty',
                box_slot: CSA_CATEGORY_MAP[est.category] ?? 'Specialty',
                lbs_this_harvest: lbs,
                cut_number: h + 1,
                harvest_count: harvestN,
                lbs_per_member: Number((lbs / (memberCount || 1)).toFixed(2)),
                csa_lbs_per_share: est.csa_lbs_per_share ?? 1.0,
                price_per_lb: est.price_per_lb ?? null,
            });
        }
    }

    return weekBuckets
        .filter(b => b.items.length > 0)
        // If CSA start date is set, only show weeks that begin on/after it
        .filter(b => !csaStart || b.start >= csaStart)
        .map((b, i) => {
            const totalLbs = b.items.reduce((s, it) => s + it.lbs_this_harvest, 0);
            const memberLbs = totalLbs / (memberCount || 1);

            // Group items by box slot
            const bySlot = {};
            for (const item of b.items) {
                const slot = item.box_slot;
                if (!slot) continue;
                if (!bySlot[slot]) bySlot[slot] = [];
                bySlot[slot].push(item);
            }

            const coveredSlots = CSA_BOX_SLOTS.filter(s => bySlot[s]?.length > 0);
            const missingSlots = CSA_BOX_SLOTS.filter(s => !bySlot[s]);
            const diversityScore = coveredSlots.length; // 0–5

            // Rating: 5 slots = Full, 3-4 = Good, <3 = Light (was purely cropCount before)
            const box_rating = diversityScore >= 4 ? 'Full'
                : diversityScore >= 3 ? 'Good'
                    : 'Light';

            return {
                week_number: i + 1,
                week_label: b.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                week_start: b.start.toISOString().split('T')[0],
                items: b.items,
                box_categories: bySlot,         // { Root: [...], Greens: [...], ... }
                covered_slots: coveredSlots,
                missing_slots: missingSlots,
                diversity_score: diversityScore,
                total_lbs: Math.round(totalLbs),
                lbs_per_member: Math.round(memberLbs * 10) / 10,
                box_rating,
            };
        });
}

/**
 * Aggregate weekly box schedule into month-by-month harvest forecast.
 * Reuses buildWeeklyBoxSchedule internally.
 *
 * @param {Array}  allEstimates - from calculateBedYield / calculateFarmYield
 * @returns {Array} Month cards: [{ month_label, month_key, weeks, total_lbs, total_revenue, crop_breakdown, harvest_count }]
 */
export function buildMonthlyForecast(allEstimates) {
    const weeks = buildWeeklyBoxSchedule(allEstimates, 1); // memberCount=1 → raw lbs
    if (weeks.length === 0) return [];

    const monthMap = {};

    for (const week of weeks) {
        const d = new Date(week.week_start);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        if (!monthMap[monthKey]) {
            monthMap[monthKey] = {
                month_key: monthKey,
                month_label: monthLabel,
                weeks: [],
                total_lbs: 0,
                total_revenue: 0,
                harvest_count: 0,
                crop_breakdown: {},   // { crop_name: { lbs, cuts } }
            };
        }

        const m = monthMap[monthKey];
        m.weeks.push(week);
        m.total_lbs += week.total_lbs;
        m.harvest_count += week.items.length;

        for (const item of week.items) {
            if (!m.crop_breakdown[item.crop_name]) {
                m.crop_breakdown[item.crop_name] = { lbs: 0, cuts: 0, price_per_lb: item.price_per_lb };
            }
            m.crop_breakdown[item.crop_name].lbs += item.lbs_this_harvest;
            m.crop_breakdown[item.crop_name].cuts += 1;
        }
    }

    // Compute revenue per month (lbs × price_per_lb for each crop)
    for (const m of Object.values(monthMap)) {
        m.total_revenue = Object.values(m.crop_breakdown).reduce((s, c) => {
            return s + (c.lbs * (c.price_per_lb ?? 2.5));
        }, 0);
        m.total_revenue = Math.round(m.total_revenue);
        m.crop_breakdown = Object.entries(m.crop_breakdown)
            .map(([name, d]) => ({ name, lbs: Math.round(d.lbs), cuts: d.cuts }))
            .sort((a, b) => b.lbs - a.lbs);
    }

    return Object.values(monthMap).sort((a, b) => a.month_key.localeCompare(b.month_key));
}
