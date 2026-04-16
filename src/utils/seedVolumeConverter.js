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
    // Peas ~9 oz/cup → (9 * 28.3495) / 48 ≈ 5.32; bush beans ~8 oz/cup → 4.72
    pea_sugar_snap:           5.3,
    pea_oregon_sugar_pod:     5.3,
    pea_little_marvel:        5.1,
    pea_maestro:              5.1,
    pea_cascadia:             5.3,
    pea_early_alaska:         4.9,
    pea_green_arrow:          5.1,
    pea_progress_no9:         4.9,
    bean_blue_lake:           4.7,
    bean_provider:            4.7,
    bean_dragon_tongue:       4.7,
    bean_rattlesnake:         4.9,
    bean_kentucky_wonder:     4.9,
    bean_romano:              4.7,
    bean_lima:                5.9,   // large flat seed ~10 oz/cup
    bean_edamame:             4.5,
    bean_fava:                9.5,   // very large seed ~16 oz/cup
    bean_scarlet_runner:      7.1,   // ~12 oz/cup
    // ── Brassicas (small, round seeds) ───────────────────────────────────────
    // Brassica seeds ~3.5–4 oz/cup → (3.75 * 28.3495) / 48 ≈ 2.22
    broccoli_standard:        2.2,
    broccoli_di_ciccio:       2.2,
    broccoli_romanesco:       2.1,
    cabbage_red:              2.2,
    cabbage_green:            2.2,
    cabbage_savoy:            2.1,
    kale_lacinato:            2.4,
    kale_red_russian:         2.4,
    kale_dwarf_blue_curled:   2.4,
    kohlrabi_standard:        2.2,
    mustard_scarlet_frills:   1.7,
    mustard_mizuna:           1.7,
    turnip_hakurei:           2.1,
    turnip_purple_top:        2.1,
    radish_french_breakfast:  3.25,  // ~5.5 oz/cup → (5.5 * 28.3495) / 48 = 3.25
    radish_cherry_belle:      3.15,  // ~5.3 oz/cup
    radish_daikon_miyashige:  2.95,  // slightly lighter, elongated seed
    radish_watermelon:        3.10,  // ~5.25 oz/cup
    arugula_standard:         1.30,  // ~2.2 oz/cup
    arugula_wild:             1.10,  // finer seed, ~1.9 oz/cup
    // ── Roots (medium seeds) ─────────────────────────────────────────────────
    // Carrot seed ~1 oz/cup → (1.0 * 28.3495) / 48 ≈ 0.59
    carrot_nantes:            0.59,
    carrot_chantenay:         0.59,
    carrot_bolero:            0.59,
    carrot_danvers:           0.59,
    carrot_rainbow:           0.59,
    carrot_scarlet_nantes:    0.59,
    beet_detroit_dark_red:    2.36,  // seed clusters ~4 oz/cup → (4 * 28.3495) / 48
    beet_chioggia:            2.36,
    beet_cylindra:            2.36,
    beet_golden:              2.36,
    parsnip_harris_model:     0.71,  // ~1.2 oz/cup
    parsnip_hollow_crown:     0.71,
    celeriac_giant_prague:    0.24,  // tiny seed ~0.4 oz/cup
    salsify_standard:         0.89,  // ~1.5 oz/cup
    scorzonera_standard:      0.83,  // ~1.4 oz/cup
    // ── Greens (tiny/fine seeds) ──────────────────────────────────────────────
    // Spinach ~2.5 oz/cup → (2.5 * 28.3495) / 48 ≈ 1.48
    spinach_bloomsdale:       1.48,
    spinach_space:            1.48,
    spinach_tyee:             1.48,
    chard_fordhook_giant:     2.36,  // seed clusters similar to beet ~4 oz/cup
    chard_rainbow:            2.36,
    lettuce_red_sails:        0.47,  // ~0.8 oz/cup
    lettuce_romaine:          0.47,
    lettuce_butterhead:       0.47,
    lettuce_green_oakleaf:    0.47,
    lettuce_iceberg:          0.47,
    lettuce_misc:             0.47,
    mache_verte:              0.59,  // ~1.0 oz/cup
    claytonia_standard:       0.42,  // ~0.7 oz/cup
    purslane_standard:        0.30,  // very fine seed ~0.5 oz/cup
    // ── Alliums (medium seeds) ────────────────────────────────────────────────
    // Onion seed ~1.6 oz/cup → (1.6 * 28.3495) / 48 ≈ 0.94
    onion_red_wing:           0.94,
    onion_candy:              0.94,
    onion_walla_walla:        0.94,
    onion_copra:              0.94,
    onion_sweet_spanish:      0.94,
    scallions_evergreen:      0.89,  // slightly smaller seed
    leek_giant_musselburgh:   1.00,  // ~1.7 oz/cup
    chives_standard:          0.71,  // fine seed ~1.2 oz/cup
    // ── Cucurbits (large flat seeds) ──────────────────────────────────────────
    // Cucumber ~3.5 oz/cup → (3.5 * 28.3495) / 48 ≈ 2.07
    cucumber_marketmore:      2.07,
    cucumber_straight_eight:  2.07,
    cucumber_lemon:           2.07,
    cucumber_persian:         2.07,
    zucchini_black_beauty:    3.25,  // ~5.5 oz/cup
    zucchini_raven:           3.25,
    squash_delicata:          2.95,  // ~5.0 oz/cup
    squash_butternut:         2.95,
    squash_acorn:             3.25,
    squash_spaghetti:         2.95,
    watermelon_sugar_baby:    2.66,  // ~4.5 oz/cup
    melon_hale_best:          2.36,  // ~4.0 oz/cup
    cantaloupe_standard:      2.36,
    pumpkin_small_sugar:      3.54,  // ~6.0 oz/cup
    // ── Corn (large, heavy seeds) ─────────────────────────────────────────────
    // Sweet corn ~8 oz/cup → (8 * 28.3495) / 48 ≈ 4.72
    corn_golden_bantam:       4.72,
    corn_peaches_and_cream:   4.72,
    corn_bloody_butcher:      4.72,
    corn_glass_gem:           4.72,
    corn_sweet:               4.72,
    // ── Herbs (very fine / dense seeds) ──────────────────────────────────────
    // Dill ~1.0 oz/cup → 0.59; cilantro (whole coriander) ~3.8 oz/cup → 2.25
    dill_fernleaf:            0.59,
    cilantro_santo:           2.25,  // whole coriander seed is surprisingly dense
    cilantro_slow_bolt:       2.25,
    parsley_flat_leaf:        0.65,  // ~1.1 oz/cup
    basil_genovese:           0.53,  // ~0.9 oz/cup
    // ── Flowers / Specialty ───────────────────────────────────────────────────
    sunflower_mammoth:        3.84,  // ~6.5 oz/cup, large striped seed
    nasturtium_dwarf:         3.54,  // ~6.0 oz/cup, large round seed
    zinnia_benary_giant:      0.83,  // ~1.4 oz/cup
    amaranth_triple_red:      0.35,  // very fine seed ~0.6 oz/cup
    // ── Cover Crops (handled separately, but include for completeness) ─────────
    buckwheat_standard:       2.66,  // ~4.5 oz/cup
    winter_rye_standard:      2.95,  // ~5.0 oz/cup
    crimson_clover:           0.89,  // small round seed ~1.5 oz/cup
    winter_vetch:             3.54,  // ~6.0 oz/cup, pea-like seed
    phacelia_standard:        0.47,  // fine seed ~0.8 oz/cup
};

// ─── Category fallback densities (g/tsp) ─────────────────────────────────────
// Calibrated to match the crop-level averages above.
const CATEGORY_DENSITY = {
    'Legume':    5.1,  // peas & beans avg ~9 oz/cup
    'Brassica':  2.2,  // cabbage family ~3.75 oz/cup
    'Root':      1.2,  // carrots, beets, parsnips (beet clusters skew up)
    'Greens':    0.9,  // lettuce, spinach, chard (lettuce skews down)
    'Allium':    0.9,  // onions, leeks ~1.6 oz/cup
    'Cucurbit':  2.8,  // cucumbers, squash ~4.7 oz/cup avg
    'Grain':     4.7,  // corn ~8 oz/cup
    'Herb':      0.9,  // basil, dill, parsley (cilantro/coriander is an outlier)
    'Flower':    1.5,  // mix of fine (zinnia) and large (nasturtium, sunflower)
    'Specialty': 1.8,
    'Cover Crop':2.3,
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
