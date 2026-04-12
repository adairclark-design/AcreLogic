/**
 * seedVolumeConverter.js
 * ──────────────────────
 * Converts seed weight (in ounces) to a human-readable volume
 * estimate (teaspoons, tablespoons, cups) for direct-seeded crops.
 *
 * Seed density table (grams per teaspoon) is derived from standard
 * horticultural references (Johnny's Selected Seeds, Oregon State
 * Extension, and USDA AMS seed rate tables).
 *
 * Priority (most-specific wins):
 *   1. CROP_DENSITY_TABLE  — per crop-ID entry
 *   2. CATEGORY_DENSITY    — category-level fallback
 *   3. DEFAULT_DENSITY     — absolute fallback (~2 g/tsp)
 *
 * Volume units returned:
 *   <  0.50 tsp  → "¼ tsp"  or "<¼ tsp"
 *   0.50–2.99 tsp → "X tsp"
 *   3.00–11.99 tsp → "X tbsp"  (1 tbsp = 3 tsp)
 *   12.00–47.99 tsp → "X cup"  (1 cup = 48 tsp)
 *   ≥ 48.00 tsp   → "X pints" (1 pint = 96 tsp)
 */

// ─── Grams per US teaspoon by crop ID ────────────────────────────────────────
// Sources: seed weight tables from Johnny's, Territorial, OSU Extension.
// Values represent WHOLE SEED density (not powder).
const CROP_DENSITY_TABLE = {
    // ── Legumes (large, heavy seeds) ─────────────────────────────────────────
    pea_sugar_snap:           4.5,
    pea_oregon_sugar_pod:     4.5,
    pea_little_marvel:        4.2,
    pea_maestro:              4.2,
    pea_cascadia:             4.5,
    pea_early_alaska:         4.0,
    pea_green_arrow:          4.2,
    pea_progress_no9:         4.0,
    bean_blue_lake:           4.0,
    bean_provider:            4.0,
    bean_dragon_tongue:       4.0,
    bean_rattlesnake:         4.2,
    bean_kentucky_wonder:     4.2,
    bean_romano:              4.0,
    bean_lima:                5.0,
    bean_edamame:             3.8,
    bean_fava:                8.5,   // much larger seed
    bean_scarlet_runner:      6.0,
    // ── Brassicas (small, round seeds) ───────────────────────────────────────
    broccoli_standard:        1.2,
    broccoli_di_ciccio:       1.2,
    broccoli_romanesco:       1.1,
    cabbage_red:              1.2,
    cabbage_green:            1.2,
    cabbage_savoy:            1.1,
    kale_lacinato:            1.3,
    kale_red_russian:         1.3,
    kale_dwarf_blue_curled:   1.3,
    kohlrabi_standard:        1.2,
    mustard_scarlet_frills:   0.9,
    mustard_mizuna:           0.9,
    turnip_hakurei:           1.1,
    turnip_purple_top:        1.1,
    radish_french_breakfast:  1.1,
    radish_cherry_belle:      1.1,
    radish_daikon_miyashige:  1.2,
    radish_watermelon:        1.1,
    arugula_standard:         0.8,
    arugula_wild:             0.7,
    // ── Roots (medium seeds) ─────────────────────────────────────────────────
    carrot_nantes:            0.5,
    carrot_chantenay:         0.5,
    carrot_bolero:            0.5,
    carrot_danvers:           0.5,
    carrot_rainbow:           0.5,
    carrot_scarlet_nantes:    0.5,
    beet_detroit_dark_red:    1.8,   // beet "seeds" are actually seed clusters
    beet_chioggia:            1.8,
    beet_cylindra:            1.8,
    beet_golden:              1.8,
    parsnip_harris_model:     0.6,
    parsnip_hollow_crown:     0.6,
    celeriac_giant_prague:    0.3,
    salsify_standard:         0.8,
    scorzonera_standard:      0.8,
    // ── Greens (tiny/fine seeds) ──────────────────────────────────────────────
    spinach_bloomsdale:       1.4,
    spinach_space:            1.4,
    spinach_tyee:             1.4,
    chard_fordhook_giant:     1.8,
    chard_rainbow:            1.8,
    lettuce_red_sails:        0.4,
    lettuce_romaine:          0.4,
    lettuce_butterhead:       0.4,
    lettuce_green_oakleaf:    0.4,
    lettuce_iceberg:          0.4,
    lettuce_misc:             0.4,
    mache_verte:              0.5,
    claytonia_standard:       0.4,
    purslane_standard:        0.3,
    // ── Alliums (medium seeds) ────────────────────────────────────────────────
    onion_red_wing:           1.0,
    onion_candy:              1.0,
    onion_walla_walla:        1.0,
    onion_copra:              1.0,
    onion_sweet_spanish:      1.0,
    scallions_evergreen:      1.0,
    leek_giant_musselburgh:   1.1,
    chives_standard:          0.8,
    // ── Cucurbits (large flat seeds) ──────────────────────────────────────────
    cucumber_marketmore:      1.5,
    cucumber_straight_eight:  1.5,
    cucumber_lemon:           1.5,
    cucumber_persian:         1.5,
    zucchini_black_beauty:    2.2,
    zucchini_raven:           2.2,
    squash_delicata:          2.0,
    squash_butternut:         2.0,
    squash_acorn:             2.2,
    squash_spaghetti:         2.0,
    watermelon_sugar_baby:    1.8,
    melon_hale_best:          1.6,
    cantaloupe_standard:      1.6,
    pumpkin_small_sugar:      2.5,
    // ── Corn (large, heavy seeds) ─────────────────────────────────────────────
    corn_golden_bantam:       5.0,
    corn_peaches_and_cream:   5.0,
    corn_bloody_butcher:      5.0,
    corn_glass_gem:           5.0,
    corn_sweet:               5.0,
    // ── Herbs (very fine - dense seeds) ──────────────────────────────────────
    dill_fernleaf:            0.6,
    cilantro_santo:           0.9,
    cilantro_slow_bolt:       0.9,
    parsley_flat_leaf:        0.7,
    basil_genovese:           0.7,
    // ── Flowers / Specialty ───────────────────────────────────────────────────
    sunflower_mammoth:        3.5,
    nasturtium_dwarf:         2.8,
    zinnia_benary_giant:      0.9,
    amaranth_triple_red:      0.4,
    // ── Cover Crops (handled separately, but include for completeness) ─────────
    buckwheat_standard:       2.0,
    winter_rye_standard:      2.2,
    crimson_clover:           1.0,
    winter_vetch:             2.5,
    phacelia_standard:        0.5,
};

// ─── Category fallback densities (g/tsp) ─────────────────────────────────────
const CATEGORY_DENSITY = {
    'Legume':    4.5,  // peas, beans
    'Brassica':  1.2,  // cabbage family
    'Root':      1.0,  // carrots, beets, parsnips
    'Greens':    0.8,  // lettuce, spinach, chard
    'Allium':    1.0,  // onions, leeks
    'Cucurbit':  2.0,  // cucumbers, squash
    'Grain':     3.5,  // corn, grain
    'Herb':      0.7,  // basil, dill, parsley
    'Flower':    1.0,  // edible/cut flowers seeded direct
    'Specialty': 1.5,
    'Cover Crop':2.0,
};

const DEFAULT_DENSITY = 2.0; // grams per teaspoon — safe middle-ground

// ─── Unit constants ───────────────────────────────────────────────────────────
const GRAMS_PER_OZ   = 28.3495;
const TSP_PER_TBSP   = 3;
const TSP_PER_CUP    = 48;
const TSP_PER_PINT   = 96;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function densityFor(cropId, category) {
    return CROP_DENSITY_TABLE[cropId]
        ?? CATEGORY_DENSITY[category]
        ?? DEFAULT_DENSITY;
}

const C_FRACTIONS = [
    { max: 0.25, label: '¼' },
    { max: 0.3334, label: '⅓' },
    { max: 0.50, label: '½' },
    { max: 0.6667, label: '⅔' },
    { max: 0.75, label: '¾' },
    { max: 1.0, label: '' }
];

function getCupFractionLabel(cups) {
    const whole = Math.floor(cups);
    const remainder = cups - whole;

    if (remainder <= 0.01) {
        if (whole === 0) return '¼'; // minimum 1/4 C
        return `${whole}`;
    }

    let fracLabel = '';
    let nextWhole = false;
    for (const f of C_FRACTIONS) {
        if (remainder <= f.max) {
            if (f.label === '') { 
                nextWhole = true; 
            } else {
                fracLabel = f.label;
            }
            break;
        }
    }

    if (nextWhole) {
        return `${whole + 1}`;
    }

    if (whole > 0) return `${whole} ${fracLabel}`.trim();
    return fracLabel;
}

function fractionLabel(tsp) {
    if (tsp < 0.20) return '⅛ tsp';
    if (tsp < 0.38) return '¼ tsp';
    if (tsp < 0.60) return '⅓ tsp';
    if (tsp < 0.88) return '½ tsp';
    if (tsp < 1.10) return '1 tsp';
    return null; // handled by numeric branch
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Convert seed weight (in ounces) to a practical volume string.
 *
 * @param {number}      weightOz  - Seed weight in ounces (with buffer already applied)
 * @param {string}      cropId    - Crop ID (e.g. "carrot_nantes") for density lookup
 * @param {string}      category  - Crop category (e.g. "Root") as fallback
 * @returns {string|null}         - Formatted volume string, or null if not applicable
 */
export function formatSeedVolume(weightOz, cropId, category) {
    if (!weightOz || weightOz <= 0) return null;

    // 1. Resolve density
    const density = densityFor(cropId, category); // g/tsp

    // 2. Convert: oz → grams → teaspoons
    const grams = weightOz * GRAMS_PER_OZ;
    const tsp   = grams / density;

    // 3. Format into the most appropriate unit
    if (tsp < TSP_PER_TBSP) {
        if (tsp < 1.10) {
            const frac = fractionLabel(tsp);
            if (frac) return `≈ ${frac}`;
        }
        return `≈ ${tsp.toFixed(1)} tsp`;
    }

    if (tsp <= TSP_PER_TBSP * 3) {
        // Between 1 Tbsp and 3 Tbsp (3 to 9 tsp) -> use Tablespoons
        const tbsp = tsp / TSP_PER_TBSP;
        const roundedTbsp = Math.round(tbsp * 2) / 2;
        return `≈ ${roundedTbsp} Tbsp`;
    }

    // Over 9 tsp -> force to cups, rounding up
    const cups = tsp / TSP_PER_CUP;
    const cupsLabel = getCupFractionLabel(cups);
    return `≈ ${cupsLabel} C`;
}

/**
 * Same as formatSeedVolume but accepts weight in pounds.
 * Convenience wrapper for cover crop calculations.
 */
export function formatSeedVolumeLbs(weightLbs, cropId, category) {
    return formatSeedVolume(weightLbs * 16, cropId, category);
}
