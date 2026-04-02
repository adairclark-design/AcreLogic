/**
 * farmUtils.js
 * ════════════
 * Deterministic farm geometry calculations.
 * No state — pure functions for block layout math.
 */

const DEFAULT_BED_WIDTH_FT = 2.5;   // 30-inch beds
const DEFAULT_ROW_SPACING_BEDS = 4; // rows per 30-inch bed

/**
 * Given block dimensions + path config, calculate how many beds fit.
 * Accounts for a bisecting road by splitting the block into halves.
 */
export function calculateBedsFromDimensions({
    blockLengthFt,
    blockWidthFt,
    bedWidthFt = DEFAULT_BED_WIDTH_FT,
    pathwayWidthFt = 4,
    bisectingRoad = { enabled: false, orientation: 'EW', widthFt: 0 },
}) {
    if (!blockLengthFt || !blockWidthFt || blockLengthFt <= 0 || blockWidthFt <= 0) return 0;

    // Bed + one pathway = one unit of width
    const bedPlusPath = bedWidthFt + pathwayWidthFt;

    if (bisectingRoad.enabled) {
        // Road splits the block into two halves along its orientation
        const roadW = bisectingRoad.widthFt ?? 14;
        if (bisectingRoad.orientation === 'NS') {
            // Road runs N-S → splits the LENGTH axis
            const halfLen = (blockLengthFt - roadW) / 2;
            const bedsPerHalf = Math.floor(halfLen / bedPlusPath);
            return bedsPerHalf * 2; // both halves × # bed rows across full width
        } else {
            // Road runs E-W → splits the WIDTH axis
            const halfWidth = (blockWidthFt - roadW) / 2;
            const bedsAcross = Math.floor(halfWidth / bedPlusPath);
            return bedsAcross * 2;
        }
    }

    // No bisecting road — simple fill
    const bedsAlongWidth = Math.floor(blockWidthFt / bedPlusPath);
    return Math.max(1, bedsAlongWidth);
}

/**
 * Calculate total planted area in sq ft for a block.
 */
export function totalPlantedSqFt(block) {
    const bedCount = block.bedCount ?? 0;
    const bedLen = block.bedLengthFt ?? 100;
    const bedW = block.bedWidthFt ?? DEFAULT_BED_WIDTH_FT;
    return bedCount * bedLen * bedW;
}

/**
 * Calculate total linear row feet for a block.
 */
export function totalRowFeet(block) {
    const bedCount = block.bedCount ?? 0;
    const bedLen = block.bedLengthFt ?? 100;
    const rowsPerBed = DEFAULT_ROW_SPACING_BEDS;
    return bedCount * bedLen * rowsPerBed;
}

/**
 * Generate a human-readable summary line for a block.
 */
export function blockSummaryLine(block) {
    const area = (totalPlantedSqFt(block) / 43560).toFixed(2);
    return `${block.bedCount} beds × ${block.bedLengthFt}ft — ${totalPlantedSqFt(block).toLocaleString()} sq ft (${area} acre)`;
}

/**
 * Generate a unique short ID for a new block.
 */
export function generateBlockId() {
    return `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Calculates the maximum concurrent coverage fraction (0.0 to 1.0+) of all successions
 * that overlap the given [startDate, endDate] window.
 */
export function getPeakCoverageInWindow(successions, startDate, endDate) {
    if (!successions || successions.length === 0) return 0;
    
    // We only care about successions that overlap the [startDate, endDate] window
    // Overlap condition: s.start_date < endDate && s.end_date > startDate
    const overlapping = successions.filter(s => 
        (s.start_date ?? '') < endDate && (s.end_date ?? '') > startDate
    );
    
    if (overlapping.length === 0) return 0;
    
    // Collect all interesting dates within the window where coverage might change
    const events = new Set([startDate, endDate]);
    for (const s of overlapping) {
        if (s.start_date && s.start_date >= startDate && s.start_date <= endDate) events.add(s.start_date);
        if (s.end_date && s.end_date >= startDate && s.end_date <= endDate) events.add(s.end_date);
    }
    
    const sortedDates = Array.from(events).sort();
    let maxCoverage = 0;
    
    // For each segment between interesting dates, calculate total coverage
    for (let i = 0; i < sortedDates.length - 1; i++) {
        const segStart = sortedDates[i];
        const segEnd = sortedDates[i+1];
        if (segStart === segEnd) continue;
        
        let sum = 0;
        for (const s of overlapping) {
            // If the crop overlapping this specific segment
            // A crop overlaps a segment if its start is <= segStart AND its end is >= segEnd
            if ((s.start_date ?? '') <= segStart && (s.end_date ?? '9999-12-31') >= segEnd) {
                sum += (s.coverage_fraction ?? 1.0);
            }
        }
        maxCoverage = Math.max(maxCoverage, sum);
    }
    
    if (sortedDates.length === 1) {
         let sum = 0;
         for (const s of overlapping) {
             if ((s.start_date ?? '') <= sortedDates[0] && (s.end_date ?? '9999-12-31') >= sortedDates[0]) {
                 sum += (s.coverage_fraction ?? 1.0);
             }
         }
         maxCoverage = sum;
    }
    
    return maxCoverage;
}

/**
 * Default grid positions — assign blocks to a named slot on a 3-column farm map.
 * Slots: ['NW','N','NE','W','Center','E','SW','S','SE']
 */
export const GRID_POSITIONS = [
    { label: 'NW', col: 0, row: 0 }, { label: 'N', col: 1, row: 0 }, { label: 'NE', col: 2, row: 0 },
    { label: 'W', col: 0, row: 1 }, { label: 'Center', col: 1, row: 1 }, { label: 'E', col: 2, row: 1 },
    { label: 'SW', col: 0, row: 2 }, { label: 'S', col: 1, row: 2 }, { label: 'SE', col: 2, row: 2 },
];

export const FAMILY_OPTIONS = [
    'Mixed (no restriction)',
    'Brassica & Chicories',
    'Alliums',
    'Nightshades',
    'Cucurbits',
    'Legumes',
    'Root Crops',
    'Greens & Herbs',
    'Cover Crop / Fallow',
];

/**
 * Infer a generic geographic region based on the farm's frost-free days.
 * Maps frost dates to regions: northeast, midwest, east, south, pacific_northwest.
 * Used for filtering pest and disease relevance.
 */
export function inferZoneFromFrostDates(firstFrostDate, lastFrostDate) {
    if (!firstFrostDate || !lastFrostDate) return 'all';
    
    try {
        const d1 = new Date(firstFrostDate);
        const d2 = new Date(lastFrostDate);
        // Add one year to first frost if it's earlier in the year than last frost (e.g., Southern Hemisphere, though unlikely here)
        if (d1 < d2) d1.setFullYear(d1.getFullYear() + 1);
        
        const frostFreeDays = Math.round((d1 - d2) / 86400000);
        
        // Very rough proxy for USDA hardiness zones mapping to regions used in our IPM data
        if (frostFreeDays < 130) return 'northeast';
        if (frostFreeDays >= 130 && frostFreeDays < 160) return 'midwest';
        if (frostFreeDays >= 160 && frostFreeDays < 200) return 'east';
        if (frostFreeDays >= 200 && frostFreeDays < 280) return 'south';
        if (frostFreeDays >= 280) return 'pacific_northwest';
    } catch (e) {
        return 'all';
    }
    return 'all';
}
