/**
 * AcreLogic Succession Engine
 * ===========================
 * The agronomic brain of the app. Given a bed's history and the frost window,
 * it determines what crops can follow, ranks them by rotation quality,
 * and can auto-generate full farm block plans.
 *
 * Sources:
 *   - JM Fortier, The Market Gardener
 *   - Eliot Coleman, Four-Season Harvest
 *   - Daniel Mays, The No-Till Organic Vegetable Farm
 *   - Jesse Frost, The No-Till Growers Handbook
 */

import {
    getCropById,
    getCropsForWindow,
    getSuccessionCandidates,
} from './database';
import {
    addDays,
    getSeasonClass,
    getRemainingFrostFreeDays,
    getIdealStartDate,
} from './climateService';
import { getPeakCoverageInWindow } from './farmUtils';


// ─── Safe Array Parser ────────────────────────────────────────────────────────
// SQLite stores array fields as JSON strings; the webDB returns raw JS arrays.
// This handles both cases without throwing.
function safeParseArray(value, fallback = []) {
    if (Array.isArray(value)) return value;
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

// ─── Agronomic Viability Windows ──────────────────────────────────────────────
export function checkAgronomicViability(cropSeason, plantDateStr, shelterType = 'uncovered') {
    const d = new Date(plantDateStr + 'T12:00:00');
    const month = d.getMonth() + 1; // 1-12
    const day = d.getDate();        // 1-31
    const md = month + (day / 100); // e.g., 4.15 = April 15, 6.30 = June 30

    if (shelterType === 'greenhouse') {
        if (cropSeason === 'cool') return { fits: true, reason: 'Greenhouse: Cool crops permitted all year' };
        if (cropSeason === 'warm') {
            const fits = md >= 3.01 && md <= 8.31; // Mar 1 - Aug 31
            return { fits, reason: fits ? 'Greenhouse: Warm crop in window (Mar-Aug)' : 'Greenhouse: Warm crop outside window (Mar-Aug)' };
        }
    } else if (shelterType === 'rowCover') {
        if (cropSeason === 'cool') {
            const fits = md >= 4.01 && md <= 10.31; // Apr 1 - Oct 31
            return { fits, reason: fits ? 'Row Cover: Cool crop in window (Early Apr-Oct)' : 'Row Cover: Cool crop outside window (Early Apr-Oct)' };
        }
        if (cropSeason === 'warm') {
            const fits = md >= 4.20 && md <= 7.10; // Apr 20 - Jul 10
            return { fits, reason: fits ? 'Row Cover: Warm crop in window (Late Apr-Early Jul)' : 'Row Cover: Warm crop outside window (Late Apr-Early Jul)' };
        }
    } else { // 'uncovered'
        if (cropSeason === 'cool') {
            const fits = md >= 4.20 && md <= 9.15; // Apr 20 - Sep 15
            return { fits, reason: fits ? 'Uncovered: Cool crop in window (Late Apr-Mid Sep)' : 'Uncovered: Cool crop outside window (Late Apr-Mid Sep)' };
        }
        if (cropSeason === 'warm') {
            const fits = md >= 5.15 && md <= 6.30; // May 15 - Jun 30
            return { fits, reason: fits ? 'Uncovered: Warm crop in window (Mid May-Late Jun)' : 'Uncovered: Warm crop outside window (Mid May-Late Jun)' };
        }
    }
    
    return { fits: true, reason: 'Allowed by default' };
}

// ─── Scoring Constants (Fortier-aligned rotation principles) ──────────────────

const ROTATION_SCORES = {
    legume_after_heavy: 25,       // Nitrogen restoration
    light_after_heavy: 15,        // Reduces nutrient depletion
    cover_after_heavy: 20,        // Best soil restoration
    cover_at_season_end: 18,      // End-of-season soil health
    same_family_penalty: -40,     // Never same family twice in row
    same_crop_penalty: -60,       // Never literally same crop
    diverse_family_bonus: 10,     // Crop family rotation diversity
    cool_season_fit: 8,           // Correct season class
    warm_season_fit: 8,
    max_dtm_fit: 12,              // Crop finishes well within frost window
    tight_window_penalty: -15,    // Crop dtm + harvest barely fits
    interplant_synergy: 5,        // Compatible interplanting available
};

// ─── Auto-Fill Strategy Presets ───────────────────────────────────────────────
// Exported so the UI can render labels/descriptions without duplicating data.
export const AUTOFILL_STRATEGIES = [
    {
        id: 'profit',
        label: '💰 Pure Profit',
        description: 'Pack beds with fast, high-value crops — lettuce, radish, spinach, scallions. Maximum harvest cycles.',
        profitWeight: 1.0,
        diversityWeight: 0.0,
        maxRepeat: 4,  // same crop can appear in up to 4 beds
        bar: 10,
    },
    {
        id: 'profit_lean',
        label: '📈 Profit-Leaning',
        description: '80% revenue focus with light variety. High-value crops lead, different families fill the rest.',
        profitWeight: 0.8,
        diversityWeight: 0.2,
        maxRepeat: 3,  // same crop max 3 beds
        bar: 8,
    },
    {
        id: 'balanced',
        label: '⚖️ Balanced',
        description: 'Equal weight on revenue and rotation health. No crop in more than 2 beds.',
        profitWeight: 0.6,
        diversityWeight: 0.4,
        maxRepeat: 2,  // same crop max 2 beds
        bar: 6,
    },
    {
        id: 'diversity',
        label: '🌿 Pure Diversity',
        description: 'Every bed gets a unique crop. Maximum rotation health — no single crop repeated across any bed.',
        profitWeight: 0.0,
        diversityWeight: 1.0,
        maxRepeat: 1,  // strictly no repeats
        bar: 0,
    },
];

// Default strategy (used when none specified)
const DEFAULT_STRATEGY = AUTOFILL_STRATEGIES[2]; // balanced

// ─── Profit sub-score proxy ───────────────────────────────────────────────────
// No revenue_per_bed field exists in the DB, so we proxy profitability:
//   • Faster DTM = more harvest cycles per season = higher revenue potential
//   • feed_class 'heavy' crops (tomato, pepper) tend to be high-value
//   • Cover crops score 0 — they're soil-builders, not revenue generators
function profitSubScore(crop) {
    if (crop.feed_class === 'cover_crop') return 0;
    const dtmScore = crop.dtm > 0 ? Math.max(0, 30 - crop.dtm * 0.3) : 0; // faster = higher
    const feedBonus = crop.feed_class === 'heavy' ? 8 : crop.feed_class === 'legume' ? 4 : 2;
    return dtmScore + feedBonus;
}

// ─── Diversity sub-score ──────────────────────────────────────────────────────
// Rewards crop families not yet used anywhere on the farm.
// New family = large bonus; same family used elsewhere = 0.
function diversitySubScore(crop, farmUsedCategories) {
    if (!farmUsedCategories || farmUsedCategories.size === 0) return 30; // all novel on empty farm
    return farmUsedCategories.has(crop.category) ? 0 : 50; // strong signal for genuinely new family
}

// ─── Farm-wide repeat penalty ─────────────────────────────────────────────────
// Returns a negative score based on how many beds already have this exact crop.
// The penalty scales with the strategy's diversityWeight so Pure Profit ignores it.
function repeatPenalty(crop, farmCropCount, diversityWeight) {
    const count = farmCropCount?.[crop.id] ?? 0;
    if (count === 0) return 0;
    return -(count * 25 * diversityWeight); // -25 per bed already using this crop × diversity weighting
}

// ─── Main API ──────────────────────────────────────────────────────────────────

/**
 * Get ranked successor crops for a given bed state.
 *
 * @param {object} bedState - Current state of the bed
 *   bedState.successions: array of { crop_id, start_date, end_date } in order
 * @param {object} farmProfile - { frost_free_days, last_frost_date, first_frost_date, lat }
 * @param {object} options
 *   options.forceSeasonClass: 'cool' | 'warm' (override auto-detection)
 *   options.includeCovers: boolean (default true)
 *   options.maxResults: number (default 8)
 *
 * @returns {Array} Ranked array of { crop, score, reason, start_date, end_date, fits, warning }
 */
export async function getSuccessionCandidatesRanked(bedState, farmProfile, options = {}) {
    const { successions = [] } = bedState;
    const { lat = 45.5, first_frost_date } = farmProfile;
    const { forceSeasonClass, includeCovers = true, maxResults = 8, strategy, farmUsedCategories, farmCropCount, shelterType = 'none' } = options;

    // Resolve strategy weights
    const strat = AUTOFILL_STRATEGIES.find(s => s.id === strategy) ?? DEFAULT_STRATEGY;

    // Determine the next start date
    // If the last planted crop didn't completely fill the bed, we should suggest planting NEXT TO IT
    // in the exact same timeframe, rather than shifting purely to the chronological end.
    const lastSuccession = successions[successions.length - 1] ?? null;
    
    // Evaluate spring offset based on shelter
    let shelterSpringOffsetDays = 0;
    if (shelterType === 'rowCover') shelterSpringOffsetDays = -7;
    else if (shelterType === 'greenhouse') shelterSpringOffsetDays = -21;

    let nextStartDate = addDays(farmProfile.last_frost_date, shelterSpringOffsetDays); // Start from effective last frost if bed is empty

    if (lastSuccession) {
        const currentPeak = getPeakCoverageInWindow(successions, lastSuccession.start_date, lastSuccession.end_date ?? '9999-12-31');
        if (currentPeak < 0.99) {
            nextStartDate = lastSuccession.start_date;
        } else if (lastSuccession.end_date) {
            // Add 1 day to prevent overlapping crops on the exact same chronological day
            nextStartDate = addDays(lastSuccession.end_date, 1);
        }
    }

    // Remaining frost-free days from nextStartDate
    let remainingDays = getRemainingFrostFreeDays(farmProfile, new Date(nextStartDate));
    if (shelterType === 'rowCover') remainingDays += 7;
    else if (shelterType === 'greenhouse') remainingDays += 21;

    // Detect season class for this window
    const seasonClass = forceSeasonClass ?? getSeasonClass(nextStartDate, lat);

    // What seasons are viable? If warm window, warm+cool both might work
    // We intentionally unlock both to let the DTM / Frost engine penalize out of season crops
    // naturally, rather than hard-filtering them via UI, so Farmers can push boundaries if they want.
    let viableSeasons = ['warm', 'cool'];

    // Get all agronomically eligible crops
    const excludeCategories = includeCovers ? [] : ['Cover Crop'];
    // Hard-filter limiters removed per user request so all crops are available for manual override.
    const queryDays = 365;
    const candidates = await getCropsForWindow(queryDays, viableSeasons, excludeCategories);

    // Score each candidate
    const previousCrop = lastSuccession
        ? await getCropById(lastSuccession.crop_id)
        : null;

    const scored = await Promise.all(
        candidates.map(async (crop) => scoreCrop(
            crop, previousCrop, successions, farmProfile, nextStartDate, remainingDays,
            strat, farmUsedCategories ?? new Set(), farmCropCount ?? {},
            options.priorYearCrops ?? [], options
        ))
    );

    // Sort by score descending (hard-filters removed per user request so farmers can force manual overrides)
    const ranked = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

    return ranked;
}

/**
 * Score a single crop candidate against the bed's rotation history.
 * @param {Array} priorYearCrops  — [{ crop_id, crop_name, category }] from prior season
 */
async function scoreCrop(crop, previousCrop, successions, farmProfile, nextStartDate, remainingDays, strategy = DEFAULT_STRATEGY, farmUsedCategories = new Set(), farmCropCount = {}, priorYearCrops = [], options = {}) {
    let score = 0;
    const reasons = [];
    const warnings = [];

    // ── 1. Rotation rule violations (hard constraints) ──────────────────────
    if (previousCrop) {
        const cannotFollow = safeParseArray(crop.rotation_cannot_follow);
        const prevCategory = previousCrop.category?.toLowerCase();

        const isSameCrop = crop.id === previousCrop.id;
        const isFastLightFeeder = crop.feed_class === 'light' && crop.dtm <= 60;
        const successionRepeatAllowed = isSameCrop && isFastLightFeeder;

        if (!successionRepeatAllowed &&
            (cannotFollow.includes(prevCategory) || cannotFollow.includes(previousCrop.id))) {
            score += ROTATION_SCORES.same_family_penalty;
            warnings.push(`Cannot follow ${previousCrop.category} (rotation violation)`);
        }

        if (successionRepeatAllowed) {
            score += 6;
            reasons.push('Succession planting — same fast crop ✓');
        }

        // ── 2. Positive rotation incentives ──────────────────────────────────
        if (crop.feed_class === 'legume' && previousCrop.feed_class === 'heavy') {
            score += ROTATION_SCORES.legume_after_heavy;
            reasons.push('Restores nitrogen after heavy feeder ✓');
        } else if (crop.feed_class === 'light' && previousCrop.feed_class === 'heavy') {
            score += ROTATION_SCORES.light_after_heavy;
            reasons.push('Light feeder follows heavy — good rotation ✓');
        } else if (crop.feed_class === 'cover_crop' && previousCrop.feed_class === 'heavy') {
            score += ROTATION_SCORES.cover_after_heavy;
            reasons.push('Cover crop restores soil after heavy feeder ✓');
        }
    }

    // ── 2b. Prior-year rotation scoring ─────────────────────────────────────
    if (priorYearCrops.length > 0) {
        const priorIds = priorYearCrops.map(p => p.crop_id).filter(Boolean);
        const priorCategories = priorYearCrops.map(p => p.category).filter(Boolean);
        const cropCat = crop.category?.toLowerCase();

        if (priorIds.includes(crop.id)) {
            // Exact same crop planted last year in this bed
            score -= 40;
            const priorCropName = priorYearCrops.find(p => p.crop_id === crop.id)?.crop_name ?? crop.name;
            warnings.push(`⚠️ Same crop as last year (${priorCropName}) — disease pressure risk`);
        } else if (priorCategories.some(c => c?.toLowerCase() === cropCat)) {
            // Same family as last year
            score -= 20;
            const matchedPrior = priorYearCrops.find(p => p.category?.toLowerCase() === cropCat);
            warnings.push(`⚠️ Same family as last year (${matchedPrior?.crop_name ?? cropCat}) — rotate for soil health`);
        } else {
            // Different family — positive rotation
            score += 8;
            reasons.push('Good family rotation from last year ✓');
        }

        // Legume after last year's heavy feeder
        const priorHeavyFeeder = priorYearCrops.some(p =>
            ['nightshade', 'cucurbit', 'brassica'].includes(p.category?.toLowerCase())
        );
        if (crop.feed_class === 'legume' && priorHeavyFeeder) {
            score += 15;
            reasons.push('Legume recovery after last year\'s heavy feeder ✓');
        }
    }

    const preferCoverCrop = farmProfile?.frost_free_days <= 130;
    if (crop.feed_class === 'cover_crop' && remainingDays <= 45 && preferCoverCrop) {
        score += ROTATION_SCORES.cover_at_season_end;
        reasons.push(`${remainingDays} days left — cover crop ideal`);
    }

    // ── evaluate specific crop start dates ──────────────────────────────────────
    let shelterSpringOffsetDays = 0;
    if (options && options.shelterType) {
        if (options.shelterType === 'rowCover') shelterSpringOffsetDays = -7;
        else if (options.shelterType === 'greenhouse') shelterSpringOffsetDays = -21;
    }
    const effectiveLastFrost = addDays(farmProfile.last_frost_date, shelterSpringOffsetDays);

    let idealStart = getIdealStartDate(crop, effectiveLastFrost);
    let cropStartDate = nextStartDate;
    
    // Only jump forward to the ideal biological start date if the bed is completely empty.
    // If a previous crop exists, snap the new succession directly after the previous crop with no artificial gap.
    if (!previousCrop && idealStart && new Date(idealStart) > new Date(nextStartDate)) {
        cropStartDate = idealStart;
    }

    let actualRemainingDays = getRemainingFrostFreeDays(farmProfile, new Date(cropStartDate));
    // Re-add shelter offsets to actual timeline
    if (options && options.shelterType) {
        if (options.shelterType === 'rowCover') actualRemainingDays += 7;
        else if (options.shelterType === 'greenhouse') actualRemainingDays += 21;
    }

    // ── 4. Season class fit ─────────────────────────────────────────────────
    const seasonClass = getSeasonClass(cropStartDate, farmProfile.lat ?? 45);
    if (crop.season === seasonClass) {
        score += ROTATION_SCORES.cool_season_fit;
        reasons.push(`${seasonClass === 'cool' ? 'Cool' : 'Warm'} season match ✓`);
    }

    // ── 4b. Agronomic Viability Window Check ────────────────────────────────
    // Use the explicit planting window schedules instead of arbitrary math penalties
    const viability = checkAgronomicViability(crop.season, cropStartDate, options?.shelterType || 'uncovered');
    
    if (!viability.fits) {
        score -= 40; // Soft penalty to put it at the bottom, but the crop is never "locked out"
        warnings.push(`⚠️ ${viability.reason}`);
    }

    // ── 5. Family diversity bonus (check entire bed history) ─────────────────
    const usedCategories = new Set(successions.map(s => s.category).filter(Boolean));
    const prevCropId = successions[successions.length - 1]?.crop_id;
    const isFastRepeat = crop.feed_class === 'light' && crop.dtm <= 60 && crop.id === prevCropId;
    if (!usedCategories.has(crop.category) || isFastRepeat) {
        score += ROTATION_SCORES.diverse_family_bonus;
        if (!usedCategories.has(crop.category)) reasons.push('New crop family in this bed ✓');
    }

    // ── 6. Overwinter capabilities & Grace logic ──────────────────────────────
    // Determine overwinter survivability from deep contextual hints to counteract database limitations
    const noteHint = ((crop.frost_note || '') + ' ' + (crop.notes || '') + ' ' + (crop.description || '')).toLowerCase();
    const isExplicitOverwinter = crop.overwinter_cover === true || 
        noteHint.includes('overwinter') ||
        (crop.season === 'cool' && (noteHint.includes('winter') || crop.name.toLowerCase().includes('chicory')));

    const isMassiveHardyCrop = crop.dtm >= 180 && crop.hard_frost === true;
    const canOverwinter = crop.feed_class === 'cover_crop' || isExplicitOverwinter || isMassiveHardyCrop;
    
    // Evaluate length of grow against remaining days (purely suggestive now)
    const totalDaysNeeded = crop.dtm + (crop.harvest_window_days ?? 0);
    
    if (canOverwinter && actualRemainingDays <= 60) {
        score += 20; // Massive scoring bonus to explicitly favor true overwinter crops in the fall
        reasons.push(`Overwinter capability ✓`);
    } else if (totalDaysNeeded <= actualRemainingDays * 0.85) {
        score += ROTATION_SCORES.max_dtm_fit;
        reasons.push(`Fits well in ${actualRemainingDays} remaining days ✓`);
    } else if (totalDaysNeeded <= actualRemainingDays) {
        score += 4;
        warnings.push(`Tight window — single harvest only`);
    } else if (crop.dtm <= actualRemainingDays) {
        score -= 5;
        warnings.push(`DTM fits but harvest window extends past frost`);
    }

    // ── 7. Interplanting synergy ────────────────────────────────────────────
    const interplantCompat = safeParseArray(crop.interplant_compatible);
    if (interplantCompat.length > 0) {
        score += ROTATION_SCORES.interplant_synergy;
        reasons.push(`Interplant with ${interplantCompat[0]} for density`);
    }

    // Compute end date for this crop
    let endDate;
    if (canOverwinter && actualRemainingDays <= 60) {
        if (crop.feed_class === 'cover_crop') {
            // Only trigger the hard overwinter jump for actual cover crops to cleanly terminate in spring
            const plantYear = new Date(cropStartDate).getFullYear();
            endDate = `${plantYear + 1}-04-01`;
        } else {
            // For biological overwinter crops (Garlic, Leeks, Salsify, Chicory), trust their actual biological DTM
            // but apply the 1.8x winter DTM multiplier to account for the Persephone period.
            const winterDtm = Math.round((crop.dtm ?? 0) * 1.8);
            endDate = addDays(cropStartDate, winterDtm + (crop.harvest_window_days ?? 0));
        }
    } else {
        let hw = crop.harvest_window_days ?? 0;
        if (options?.shelterType === 'greenhouse' && crop.season === 'warm' && hw >= 45) {
            hw += 21; // Dynamically stretch indeterminate fruiting limits into the greenhouse frost-extension window
        }
        endDate = addDays(cropStartDate, (crop.dtm ?? 0) + hw);
    }

    // ── 8. Strategy-weighted profit / diversity boost ──────────────────────────
    const profit = profitSubScore(crop);
    const diversity = diversitySubScore(crop, farmUsedCategories);
    const strategyBoost = (strategy.profitWeight * profit) + (strategy.diversityWeight * diversity);
    score += Math.round(strategyBoost);
    if (strategy.profitWeight > 0 && profit > 10) reasons.push(`High revenue potential ✓`);
    if (strategy.diversityWeight > 0 && diversity > 0) reasons.push(`New family on farm ✓`);

    // ── 9. Farm-wide repeat penalty (prevents same crop dominating every bed) ──
    // Only applied when diversityWeight > 0 — Pure Profit intentionally repeats crops.
    const penalty = repeatPenalty(crop, farmCropCount, strategy.diversityWeight);
    if (penalty < 0) {
        score += penalty;
        warnings.push(`Already in ${farmCropCount[crop.id]} other bed(s)`);
    }

    return {
        crop,
        score,
        reasons,
        warnings,
        start_date: cropStartDate,
        end_date: endDate,
        remaining_days_after: canOverwinter ? 0 : Math.max(0, actualRemainingDays - (crop.dtm + (crop.harvest_window_days ?? 0))),
        fits: canOverwinter ? true : viability.fits,
        season_class: seasonClass,
    };
}

// ─── Auto-Generate Full Bed Plans ─────────────────────────────────────────────

/**
 * For a bed that has its primary crop set, auto-generate all subsequent
 * successions until the frost date.
 *
 * @param {object} primaryAssignment - { crop_id, start_date, end_date }
 * @param {object} farmProfile
 * @returns {Array} Array of succession assignments (slot 2, 3, 4…)
 */
export async function autoGenerateSuccessions(primaryAssignment, farmProfile, farmCropCount = {}, maxRepeat = 9) {
    const successions = [primaryAssignment];
    const maxSlots = 4; // Maximum successions per bed

    // Track what this bed uses so slots within the same bed don't repeat farm-wide unnecessarily
    const localCount = { ...farmCropCount };
    if (primaryAssignment.crop_id) {
        localCount[primaryAssignment.crop_id] = (localCount[primaryAssignment.crop_id] ?? 0) + 1;
    }

    // Build used categories from what's already on the farm
    const farmUsedCategories = new Set(
        Object.keys(localCount)
            .filter(id => localCount[id] > 0)
            // We don't have category info from counts alone, so use successions already in this bed
            .concat([])
    );

    for (let slot = 2; slot <= maxSlots; slot++) {
        const lastSucc = successions[successions.length - 1];
        const remainingDays = getRemainingFrostFreeDays(farmProfile, new Date(lastSucc.end_date));

        if (remainingDays <= 10) break;

        const rawCandidates = await getSuccessionCandidatesRanked(
            { successions },
            farmProfile,
            {
                maxResults: 24, // fetch more so hard-filter still leaves good options
                includeCovers: remainingDays <= 45,
                farmCropCount: localCount, // pass farm-wide counts so slot picks avoid repeats
            }
        );

        // Hard-cap: respect maxRepeat — same rule applied by autoFillRemainingBeds at the bed level
        // This prevents Pure Diversity from placing the same crop in successive slots
        const candidates = rawCandidates.filter(c => (localCount[c.crop.id] ?? 0) < maxRepeat);

        if (candidates.length === 0) break;

        const best = candidates.find(c => c.fits) ?? candidates[0];
        if (!best || best.score < -20) break;

        // Update local count so next slot in this bed also avoids already-placed crops
        localCount[best.crop.id] = (localCount[best.crop.id] ?? 0) + 1;

        const newSuccession = {
            crop_id: best.crop.id,
            crop_name: best.crop.name,
            variety: best.crop.variety,
            category: best.crop.category,
            feed_class: best.crop.feed_class,
            dtm: best.crop.dtm,
            start_date: best.start_date,
            end_date: best.end_date,
            is_auto_generated: true,
            auto_score: best.score,
            auto_reasons: best.reasons,
        };

        successions.push(newSuccession);

        if (best.crop.feed_class === 'cover_crop' && (farmProfile?.frost_free_days ?? 180) <= 120) break;
    }

    return successions.slice(1); // Return only the auto-generated ones (slot 2+)
}

/**
 * Auto-fill remaining empty beds given the beds that are already planned.
 * Respects farm-wide rotation diversity (don't repeat same crop in too many beds).
 *
 * @param {Array} filledBeds - Array of { bed_number, successions }
 * @param {number[]} emptyBedNumbers - e.g. [3, 5, 7]
 * @param {object} farmProfile
 * @returns {object} { [bedNumber]: suggestedSuccessions }
 */
export async function autoFillRemainingBeds(filledBeds, emptyBedNumbers, farmProfile, strategyId, filters = {}) {
    // Resolve strategy
    const strategy = AUTOFILL_STRATEGIES.find(s => s.id === strategyId) ?? DEFAULT_STRATEGY;

    // ── Category / DTM filter (from UI toggles) ────────────────────────────────
    // Maps toggle keys → which crop categories/dtm ranges to EXCLUDE when toggle is OFF.
    const VEGETABLE_CATEGORIES = new Set(['Brassica', 'Allium', 'Cucurbit', 'Greens', 'Legume', 'Nightshade', 'Root', 'Tuber', 'Herb', 'Grain']);
    const FLOWER_CATEGORIES    = new Set(['Flower']);
    const SPECIALTY_CATEGORIES = new Set(['Specialty']);
    const BERRY_CATEGORIES     = new Set(['Fruit']);
    const SHORT_DTM_MAX = 60; // ≤ 60 days = "short"

    function cropPassesFilters(crop) {
        const cat = crop.category ?? '';
        const dtm = crop.dtm ?? 0;
        // Cover crops always excluded from this filter (they have feed_class cover_crop)
        if (crop.feed_class === 'cover_crop') return true;
        if (filters.flowers   === false && FLOWER_CATEGORIES.has(cat))    return false;
        if (filters.specialty === false && SPECIALTY_CATEGORIES.has(cat)) return false;
        if (filters.berries   === false && BERRY_CATEGORIES.has(cat))     return false;
        if (filters.vegetables === false && VEGETABLE_CATEGORIES.has(cat)) return false;
        if (filters.shortDtm  === false && dtm > 0 && dtm <= SHORT_DTM_MAX) return false;
        if (filters.longDtm   === false && dtm > SHORT_DTM_MAX)             return false;
        return true;
    }

    // Tally ALL crops AND families already on the farm (every succession slot, not just primary)
    const farmCropCount = {};
    const farmUsedCategories = new Set();
    for (const bed of filledBeds) {
        for (const s of bed.successions ?? []) {
            if (s.crop_id) {
                farmCropCount[s.crop_id] = (farmCropCount[s.crop_id] ?? 0) + 1;
            }
            if (s.category) farmUsedCategories.add(s.category);
        }
    }

    const result = {};
    const totalBeds = filledBeds.length + emptyBedNumbers.length;
    const maxRepeat = strategy.maxRepeat ?? Math.ceil(totalBeds / 3);

    for (const bedNum of emptyBedNumbers) {
        // Get top succession candidates for this bed, applying strategy weights and farm-wide counts
        const candidates = await getSuccessionCandidatesRanked(
            { successions: [] },
            farmProfile,
            {
                maxResults: 32, // fetch more so filter still leaves good options
                includeCovers: false,
                strategy: strategy.id,
                farmUsedCategories,
                farmCropCount, // new: pass repeat counts so scoring applies penalty
            }
        );

        // Apply user category/DTM filters, then hard-cap by maxRepeat
        const filtered = candidates
            .filter(c => cropPassesFilters(c.crop))
            .filter(c => (farmCropCount[c.crop.id] ?? 0) < maxRepeat);
        const best = filtered[0];

        // Auto-generator must still respect hard limits (don't auto-fill rotation violations)
        if (!best || best.score < -20) {
            result[bedNum] = [];
            continue;
        }

        // Update farm-wide counts immediately so next bed doesn't pick the same crop
        farmCropCount[best.crop.id] = (farmCropCount[best.crop.id] ?? 0) + 1;
        farmUsedCategories.add(best.crop.category);

        const primaryAssignment = {
            crop_id: best.crop.id,
            crop_name: best.crop.name,
            variety: best.crop.variety,
            category: best.crop.category,
            feed_class: best.crop.feed_class,
            dtm: best.crop.dtm,
            start_date: best.start_date,
            end_date: best.end_date,
            is_auto_generated: true,
        };

        // Generate successive slots — pass current farmCropCount and maxRepeat so they also avoid repeating
        const autoSuccessions = await autoGenerateSuccessions(primaryAssignment, farmProfile, { ...farmCropCount }, maxRepeat);

        // Update farmCropCount for every crop placed in successive slots
        for (const s of autoSuccessions) {
            if (s.crop_id) farmCropCount[s.crop_id] = (farmCropCount[s.crop_id] ?? 0) + 1;
            if (s.category) farmUsedCategories.add(s.category);
        }

        result[bedNum] = [primaryAssignment, ...autoSuccessions];
    }

    return result;
}

// ─── Rotation Validation Helpers ──────────────────────────────────────────────

/**
 * Check if placing a specific crop in a bed violates rotation rules
 * given the bed's existing history.
 */
export async function validateRotation(cropId, bedSuccessions) {
    const crop = await getCropById(cropId);
    if (!crop) return { valid: false, reason: 'Unknown crop' };

    const lastSucc = bedSuccessions[bedSuccessions.length - 1];
    if (!lastSucc) return { valid: true };

    const previousCrop = await getCropById(lastSucc.crop_id);
    if (!previousCrop) return { valid: true };

    const cannotFollow = JSON.parse(crop.rotation_cannot_follow || '[]');
    const prevCategory = previousCrop.category?.toLowerCase();

    if (cannotFollow.includes(prevCategory) || cannotFollow.includes(previousCrop.id)) {
        return {
            valid: false,
            reason: `${crop.name} should not follow ${previousCrop.name} (${previousCrop.category}) — rotation violation per Fortier's principles`,
        };
    }

    return { valid: true };
}

/**
 * Generate a plain-language rotation summary for a bed's full succession plan.
 * e.g.: "Tomato (heavy) → Peas (legume) → Spinach (light) → Cover Crop"
 */
export function getRotationSummary(successions) {
    return successions
        .map(s => `${s.crop_name} (${s.feed_class ?? '?'})`)
        .join(' → ');
}
