/**
 * homeGardenCalculator.js
 * ════════════════════════
 * Core math engine for the Home Garden (free tier) flows.
 *
 * Three primary calculators:
 *   1. calculatePlantsNeeded  — how much to plant to feed a family
 *   2. calculateSoilVolume    — cubic yards of soil for raised beds
 *   3. calculateBedsInSpace   — how many beds fit in a given area
 *
 * All functions are pure (no side effects) and work in both React Native
 * and Node.js (for testing) because they import only from data files.
 */

import HOME_CONSUMPTION from '../data/homeConsumption';
import {
    getSeedStartDate,
    addDays,
    formatDateDisplay,
} from './climateService';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Standard bed dimensions used when not explicitly provided */
const DEFAULTS = {
    BED_WIDTH_FT: 4,           // standard wide bed width
    BED_LENGTH_FT: 8,          // default raised bed length
    PATHWAY_WIDTH_FT: 2,       // minimum path between beds
    WHEELBARROW_PATH_FT: 4,    // wider main access path
    LOSS_BUFFER: 0.85,         // 15% germination/pest loss buffer
};

// ─── 1. PLANTS NEEDED CALCULATOR ─────────────────────────────────────────────

/**
 * calculatePlantsNeeded
 * ─────────────────────
 * Given a crop from crops.json and a family size, returns everything needed
 * to size the planting correctly:
 *
 *   - targetLbs        — seasonal lbs the family will actually eat
 *   - linearFeetNeeded — how many row-feet to plant
 *   - plantsNeeded     — individual transplants or seeds to start
 *   - seedsToStart     — adjusted upward for loss buffer
 *   - report           — human-readable summary string for the UI
 *
 * @param {object} crop         — A crop object from crops.json
 * @param {number} familySize   — Number of people (1–20)
 * @returns {object}
 */
export function calculatePlantsNeeded(crop, familySize, gardenProfile = null) {
    const consumption = HOME_CONSUMPTION[crop.id];

    // ── Flowers & cover crops use a different path ──
    if (!consumption || consumption.lbs_per_person_season === null) {
        // Flower: use stem-based calculation instead of weight
        if (consumption?.stems_per_week != null) {
            return calculateFlowerNeed(crop, familySize, consumption, gardenProfile);
        }
        // Cover crop or unknown: no recommendation
        return {
            cropId: crop.id,
            cropName: crop.name,
            isSupported: false,
            reason: 'No household consumption target for this crop type.',
        };
    }

    const targetLbs = consumption.lbs_per_person_season * familySize;

    // Yield from crops.json is per 100 linear feet — scale to what we need
    const yieldPer100ft = crop.yield_lbs_per_100ft ?? 0;
    if (yieldPer100ft === 0) {
        return {
            cropId: crop.id,
            cropName: crop.name,
            isSupported: false,
            reason: 'Yield data not available for this crop.',
        };
    }

    // How many linear feet of row do we need?
    const linearFeetNeeded = Math.ceil((targetLbs / yieldPer100ft) * 100);

    // How many individual plants or seeds?
    // In-row spacing gives us plants-per-foot
    const inRowSpacingIn = crop.in_row_spacing_in ?? 6;
    const plantsPerFoot = 12 / inRowSpacingIn;
    const plantsNeeded = Math.ceil(linearFeetNeeded * plantsPerFoot);

    // Adjust upward for germination/pest losses
    const seedsToStart = Math.ceil(plantsNeeded / DEFAULTS.LOSS_BUFFER);

    // How many standard 4×8 raised beds does this work out to?
    // Using the rows_per_30in_bed or assuming a 4ft wide bed with row spacing
    const rowsPerBed = crop.rows_per_30in_bed
        ? Math.round(crop.rows_per_30in_bed * (DEFAULTS.BED_WIDTH_FT / 2.5))
        : Math.floor((DEFAULTS.BED_WIDTH_FT * 12) / (crop.row_spacing_in ?? 12));
    const bedFeetPerRow = DEFAULTS.BED_LENGTH_FT;
    const totalBedRowFt = rowsPerBed * bedFeetPerRow;
    const bedsNeeded = totalBedRowFt > 0
        ? Math.ceil(linearFeetNeeded / totalBedRowFt)
        : Math.ceil(linearFeetNeeded / DEFAULTS.BED_LENGTH_FT);

    // Generate a human-readable range for expected yield
    const yieldLow = Math.round(targetLbs * 0.8);
    const yieldHigh = Math.round(targetLbs * 1.2);

    // ── Harvest style: precise language for each harvest pattern ──
    const CUT_AND_COME_AGAIN_CATEGORIES = new Set(['Greens', 'Herb']);
    // Heading crops (broccoli, cabbage, cauliflower) produce one head then side shoots
    const HEADING_CROPS = new Set(['broccoli_belstar','cauliflower_snowball','cabbage_storage',
        'napa_cabbage','romanesco','brussels_sprouts','kohlrabi_kolibri']);
    // Indeterminate fruiting crops — pick repeatedly all season
    const INDETERMINATE_CROPS = new Set(['tomato_heirloom_beefsteak','cherry_tomato_sungold',
        'pepper_sweet','pepper_jalapeño','hot_pepper_habanero','eggplant_ichiban',
        'cucumber_marketmore','zucchini_black_beauty','summer_squash_pattypan',
        'tomatillo_grande','ground_cherry_cossack','beans_green_bush','runner_beans',
        'peas_sugar_snap','snap_peas_cascadia','okra_clemson']);
    let harvestStyle;
    if (CUT_AND_COME_AGAIN_CATEGORIES.has(crop.category)) {
        harvestStyle = 'Cut-and-come-again — harvest outer leaves weekly, plant keeps producing';
    } else if (HEADING_CROPS.has(crop.id)) {
        harvestStyle = 'Harvest main head when ready, then pick side shoots over several weeks';
    } else if (INDETERMINATE_CROPS.has(crop.id)) {
        harvestStyle = 'Pick fruit repeatedly as it ripens — plant produces all season';
    } else if (crop.harvest_count && crop.harvest_count <= 1) {
        harvestStyle = 'Harvest once when ready, then pull plant';
    } else {
        harvestStyle = crop.harvest_frequency ?? null;
    }

    // ── In-ground days: total bed commitment (DTM + harvest window) ──
    const inGroundDays = (crop.dtm ?? 0) + (crop.harvest_window_days ?? 0);

    // ── Succession flag: quick-finish crops that need replanting for continuous supply ──
    // True when harvest window < 35 days (plant finishes fast — need multiple sowings)
    const needsSuccession = (crop.harvest_window_days ?? 60) < 35
        && CUT_AND_COME_AGAIN_CATEGORIES.has(crop.category);
    const successionNote = needsSuccession
        ? `Sow every 2–3 weeks for a continuous supply — each sowing lasts ~${crop.harvest_window_days ?? 21} days before bolting`
        : null;

    // ── Calendar dates (only when gardenProfile is available) ──
    let indoorSeedDate = null;
    let directSowDate  = null;
    let transplantDate = null;
    const lastFrost    = gardenProfile?.last_frost_date ?? null;
    const frostFreeDays = gardenProfile?.frost_free_days ?? null;

    if (lastFrost) {
        if (crop.seed_type === 'TP') {
            // Transplant crop: start seeds indoors X weeks before last frost
            if (crop.seed_start_weeks_before_transplant) {
                indoorSeedDate = formatDateDisplay(
                    getSeedStartDate(lastFrost, crop.seed_start_weeks_before_transplant)
                );
            }
            // Transplant date = last frost date (or +2 weeks for heat-lovers)
            const warmCrop = crop.season === 'warm';
            transplantDate = formatDateDisplay(warmCrop ? addDays(lastFrost, 14) : lastFrost);
        } else {
            // Direct sow crop
            const warmCrop = crop.season === 'warm';
            directSowDate = formatDateDisplay(warmCrop ? addDays(lastFrost, 0) : addDays(lastFrost, -28));
        }
    }

    return {
        cropId: crop.id,
        cropName: crop.name,
        variety: crop.variety,
        emoji: crop.emoji,
        isSupported: true,
        isFlower: false,

        // Core numbers
        familySize,
        targetLbs: Math.round(targetLbs),
        linearFeetNeeded,
        plantsNeeded,
        seedsToStart,
        bedsNeeded,
        inRowSpacingIn,
        rowsPerBed,

        // Rich metadata from the crop record
        dtm: crop.dtm,
        harvestWindowDays: crop.harvest_window_days,
        inGroundDays: inGroundDays > 0 ? inGroundDays : null,
        seedType: crop.seed_type,               // 'DS' or 'TP'
        seedStartWeeks: crop.seed_start_weeks_before_transplant,
        harvestStyle,                           // plain-English harvest cadence
        harvestCount: crop.harvest_count,
        rowSpacingIn: crop.row_spacing_in,      // row spacing (30"-bed basis)
        rowsPer30inBed: crop.rows_per_30in_bed, // rows per 30" bed
        season: crop.season,
        minFrostFreeDays: crop.min_frost_free_days,
        frostFreeDays,                          // from gardenProfile
        notes: crop.notes,
        needsSuccession,                        // true = bolt-prone, succession-plant
        successionNote,                         // human-readable succession callout

        // Computed calendar dates (null if no gardenProfile)
        indoorSeedDate,
        directSowDate,
        transplantDate,

        // Yield expectation range
        yieldLow,
        yieldHigh,
        yieldUnit: consumption.unit_label,
        consumptionNotes: consumption.notes,

        // Report string
        report: buildPlantReport({
            crop, familySize, targetLbs, linearFeetNeeded,
            plantsNeeded, seedsToStart, seedType: crop.seed_type,
        }),
    };
}

/**
 * calculateFlowerNeed
 * ────────────────────
 * Calculates bouquet / stem targets for flower crops.
 * Returns a result in the same shape as calculatePlantsNeeded for UI consistency.
 */
function calculateFlowerNeed(crop, familySize, consumption, gardenProfile = null) {
    const stemsPerWeek = consumption.stems_per_week ?? 5;
    const weeksSeason = consumption.weeks_season ?? 10;
    const totalStemsNeeded = stemsPerWeek * weeksSeason * familySize;

    // Rough planting math: most cut flowers yield 2–4 stems per plant per week
    const stemsPerPlantPerWeek = 2.5;
    const plantsNeeded = Math.ceil(totalStemsNeeded / (stemsPerPlantPerWeek * weeksSeason));
    const seedsToStart = Math.ceil(plantsNeeded / DEFAULTS.LOSS_BUFFER);

    // Estimate linear feet: 6-inch spacing is typical for cut flowers
    const inRowSpacingIn = crop.in_row_spacing_in ?? 6;
    const linearFeetNeeded = Math.ceil(plantsNeeded / (12 / inRowSpacingIn));

    // Calendar dates
    let indoorSeedDate = null;
    let transplantDate = null;
    const lastFrost = gardenProfile?.last_frost_date ?? null;
    if (lastFrost && crop.seed_type === 'TP' && crop.seed_start_weeks_before_transplant) {
        indoorSeedDate = formatDateDisplay(getSeedStartDate(lastFrost, crop.seed_start_weeks_before_transplant));
        transplantDate = formatDateDisplay(lastFrost);
    }

    return {
        cropId: crop.id,
        cropName: crop.name,
        variety: crop.variety,
        emoji: crop.emoji,
        isSupported: true,
        isFlower: true,

        familySize,
        targetLbs: null,
        stemsPerWeek,
        weeksSeason,
        totalStemsNeeded,
        plantsNeeded,
        seedsToStart,
        linearFeetNeeded,
        bedsNeeded: Math.ceil(linearFeetNeeded / (DEFAULTS.BED_LENGTH_FT * 2)),

        dtm: crop.dtm,
        seedType: crop.seed_type,
        harvestMethod: crop.harvest_method,
        harvestStyle: 'Weekly harvest (cut stems at bud stage to encourage more blooms)',
        season: crop.season,
        notes: crop.notes,
        indoorSeedDate,
        transplantDate,

        yieldUnit: 'bouquets',
        consumptionNotes: consumption.notes,

        report: `Plant ${plantsNeeded} ${crop.name} plants (${linearFeetNeeded} row-ft) to harvest `
            + `~${stemsPerWeek} stems/week for ${weeksSeason} weeks.`,
    };
}

/**
 * buildPlantReport
 * ─────────────────
 * Returns a single-sentence human-readable string used in the export PDF.
 */
function buildPlantReport({ crop, familySize, targetLbs, linearFeetNeeded, plantsNeeded, seedsToStart, seedType }) {
    const qty = seedType === 'TP'
        ? `${seedsToStart} transplants`
        : `seed for ${linearFeetNeeded} row-ft`;
    return `To harvest ~${Math.round(targetLbs)} lbs of ${crop.name} for ${familySize} `
        + `person${familySize !== 1 ? 's' : ''}: plant ${qty} (${linearFeetNeeded} row-ft).`;
}

// ─── 2. SOIL VOLUME CALCULATOR ────────────────────────────────────────────────

/**
 * calculateSoilVolume
 * ────────────────────
 * Returns the amount of soil needed to fill one raised bed.
 *
 * @param {number} lengthFt   — bed length in feet
 * @param {number} widthFt    — bed width in feet
 * @param {number} heightIn   — bed height in inches
 * @returns {{ cubicFeet: number, cubicYards: number, displayYards: string }}
 */
export function calculateSoilVolume(lengthFt, widthFt, heightIn) {
    const heightFt = heightIn / 12;
    const cubicFeet = lengthFt * widthFt * heightFt;
    const cubicYards = cubicFeet / 27;

    return {
        cubicFeet: +cubicFeet.toFixed(2),
        cubicYards: +cubicYards.toFixed(2),
        // Bags of soil: 2 cubic foot bags (most common size)
        standardBags2cuFt: Math.ceil(cubicFeet / 2),
        standardBags1cuFt: Math.ceil(cubicFeet),
        displayYards: `${cubicYards.toFixed(1)} cu yd`,
        displayBags: `${Math.ceil(cubicFeet / 2)} × 2 cu ft bags`,
    };
}

/**
 * calculateTotalSoilVolume
 * ─────────────────────────
 * Sums soil volume across all beds in a layout.
 *
 * @param {number}  bedCount  — number of raised beds in the garden
 * @param {number}  lengthFt
 * @param {number}  widthFt
 * @param {number}  heightIn
 * @returns {object}         — same shape as calculateSoilVolume, plus perBed
 */
export function calculateTotalSoilVolume(bedCount, lengthFt, widthFt, heightIn) {
    const perBed = calculateSoilVolume(lengthFt, widthFt, heightIn);
    const total = {
        cubicFeet: +(perBed.cubicFeet * bedCount).toFixed(2),
        cubicYards: +(perBed.cubicYards * bedCount).toFixed(2),
        standardBags2cuFt: perBed.standardBags2cuFt * bedCount,
        standardBags1cuFt: perBed.standardBags1cuFt * bedCount,
    };
    return {
        perBed,
        total: {
            ...total,
            displayYards: `${total.cubicYards.toFixed(1)} cu yd`,
            displayBags: `${total.standardBags2cuFt} × 2 cu ft bags`,
        },
        bedCount,
    };
}

// ─── 3. BEDS-IN-SPACE CALCULATOR ─────────────────────────────────────────────

/**
 * calculateBedsInSpace
 * ─────────────────────
 * Given a total garden area, calculates how many raised beds fit,
 * area efficiency, and multi-pathway groupings for the visual.
 *
 * Pathway model:
 *   nsPathwayCount — vertical strips running N→S (consume width)
 *   ewPathwayCount — horizontal strips running E→W (consume length)
 *   mainPathWidthFt — shared width for all access paths (default 4ft)
 *   equidistant — true: paths divide space equally; false: paths at edges
 *
 * Legacy: passing wheelbarrowPathFt is treated as 1 N/S path at that width.
 *
 * @param {object} params
 * @param {number} params.spaceLengthFt
 * @param {number} params.spaceWidthFt
 * @param {number} params.bedLengthFt          (default 8)
 * @param {number} params.bedWidthFt           (default 4)
 * @param {number} params.pathwayWidthFt       between beds (default 2)
 * @param {number} params.nsPathwayCount       N/S access paths (default 0)
 * @param {number} params.ewPathwayCount       E/W access paths (default 0)
 * @param {number} params.mainPathWidthFt      wheelbarrow-path width (default 4)
 * @param {boolean} params.equidistant         true = divide evenly; false = edge
 * @param {number|null} params.wheelbarrowPathFt  legacy single-path compat
 * @param {boolean} params.isRaisedBed
 * @param {number} params.bedHeightIn
 * @returns {object}
 */
export function calculateBedsInSpace({
    spaceLengthFt,
    spaceWidthFt,
    bedLengthFt       = DEFAULTS.BED_LENGTH_FT,
    bedWidthFt        = DEFAULTS.BED_WIDTH_FT,
    pathwayWidthFt    = DEFAULTS.PATHWAY_WIDTH_FT,
    nsPathwayCount    = 0,
    ewPathwayCount    = 0,
    mainPathWidthFt   = DEFAULTS.WHEELBARROW_PATH_FT,
    equidistant       = false,
    // Legacy compat — if caller passes wheelbarrowPathFt, treat as 1 N/S path
    wheelbarrowPathFt = null,
    isRaisedBed       = false,
    bedHeightIn       = 12,
} = {}) {
    // Resolve legacy param
    const _nsCount     = wheelbarrowPathFt != null && wheelbarrowPathFt > 0
        ? 1 : Math.max(0, nsPathwayCount);
    const _ewCount     = Math.max(0, ewPathwayCount);
    const _mainWidth   = wheelbarrowPathFt != null ? wheelbarrowPathFt : Math.max(0, mainPathWidthFt);

    // How many beds fit after reserving space for access paths?
    const effectiveWidth  = spaceWidthFt  - _nsCount * _mainWidth;
    const effectiveLength = spaceLengthFt - _ewCount * _mainWidth;

    const bedsAcrossWidth  = Math.max(0, Math.floor(effectiveWidth  / (bedWidthFt  + pathwayWidthFt)));
    const bedsAlongLength  = Math.max(0, Math.floor(effectiveLength / (bedLengthFt + pathwayWidthFt)));

    const totalBeds = bedsAcrossWidth * bedsAlongLength;

    // ── Compute bed-group arrays for the visual ───────────────────────────────
    // colGroups: how many beds in each column-block (separated by N/S paths)
    // rowGroups: how many beds in each row-block (separated by E/W paths)
    function makeGroups(total, pathCount, evenSplit) {
        if (pathCount === 0 || total === 0) return [total];
        if (!evenSplit) return [total]; // edge mode: one group, path at border
        const n = pathCount + 1;
        const base = Math.floor(total / n);
        const extra = total % n;
        return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
    }
    const colGroups = makeGroups(bedsAcrossWidth, _nsCount, equidistant);
    const rowGroups = makeGroups(bedsAlongLength, _ewCount, equidistant);

    // Areas
    const totalSpaceSqFt  = spaceLengthFt * spaceWidthFt;
    const bedAreaSqFt     = totalBeds * bedLengthFt * bedWidthFt;
    const efficiency      = totalSpaceSqFt > 0
        ? +(bedAreaSqFt / totalSpaceSqFt * 100).toFixed(1) : 0;

    // Soil volume if raised beds
    const soilInfo = isRaisedBed && totalBeds > 0
        ? calculateTotalSoilVolume(totalBeds, bedLengthFt, bedWidthFt, bedHeightIn)
        : null;

    return {
        totalBeds,
        bedsAcrossWidth,
        bedsAlongLength,

        bedLengthFt,
        bedWidthFt,
        pathwayWidthFt,
        wheelbarrowPathFt,

        totalSpaceSqFt,
        bedAreaSqFt,
        pathwayAreaSqFt,
        efficiency,

        isRaisedBed,
        soilInfo,

        // Friendly summary for the UI
        summary: totalBeds > 0
            ? `${totalBeds} beds (${bedsAcrossWidth} across × ${bedsAlongLength} deep), `
              + `${efficiency}% growing area.`
            : 'Space is too small for even one bed with current settings. Try narrower pathways.',
    };
}

// ─── 4. FULL GARDEN PLAN ─────────────────────────────────────────────────────

/**
 * calculateGardenPlan
 * ────────────────────
 * Combines plantsNeeded calculations for a list of crops to produce a
 * complete family garden plan object ready to render or export.
 *
 * @param {object[]} selectedCrops  — crop objects from crops.json
 * @param {number}   familySize
 * @returns {{
 *   items:        object[],     — one result per crop
 *   totalLinearFt: number,
 *   totalBedsNeeded: number,
 *   unsupportedCrops: string[],
 * }}
 */
export function calculateGardenPlan(selectedCrops, familySize, gardenProfile = null) {
    const items = selectedCrops.map(crop => calculatePlantsNeeded(crop, familySize, gardenProfile));
    const supported = items.filter(i => i.isSupported);
    const unsupported = items.filter(i => !i.isSupported).map(i => i.cropName);

    const totalLinearFt = supported.reduce((sum, i) => sum + (i.linearFeetNeeded ?? 0), 0);
    const totalBedsNeeded = supported.reduce((sum, i) => sum + (i.bedsNeeded ?? 0), 0);

    return {
        items,
        supported,
        unsupportedCrops: unsupported,
        totalLinearFt,
        totalBedsNeeded,
        familySize,
        gardenProfile,
    };
}
