/**
 * homeConsumption.js
 * ══════════════════
 * Annual household consumption estimates per person, per growing season.
 * Used by the Home Garden Calculator (free tier) to size plantings for families.
 *
 * Sources & methodology:
 *  - USDA ERS Per-Capita Consumption data (average American adult, fresh + preserved)
 *  - "How Much to Plant" charts from Rodale, Cornell Cooperative Extension, and Mother Earth News
 *  - Adjusted for backyard context: assumes some preservation (canning, freezing) for high-yield crops
 *
 * Schema per entry:
 *   lbs_per_person_season  — how many lbs a single adult eats in one growing season
 *   unit_label             — friendly string used in the report UI
 *   notes                  — optional context for why the number was chosen
 *
 * For Flower crops: `lbs_per_person_season` is null; we instead store
 *   `stems_per_week` and `weeks_season` so the calculator can produce a
 *   "weekly bouquets" recommendation instead of a weight target.
 */

const HOME_CONSUMPTION = {

    // ─── Greens ──────────────────────────────────────────────────────────────
    radish_french_breakfast: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Pull-and-replant — the whole root is harvested at once (not cut-and-come-again). Ready in 30 days; plan 2–3 successive sowings 3 weeks apart. 3 lbs/person is 2–3 rounds for a family of 4.',
    },
    spinach_space: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'You are harvesting outer leaves weekly — the same plant keeps going. But spinach bolts (goes to seed) after ~20 warm days, so plan 2–3 succession sowings spaced 2–3 weeks apart. 5 lbs/person = ~10–12 ft of row per sowing for a family of 4.',
    },
    lettuce_mix: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'You are harvesting outer leaves weekly from the same plant (cut-and-come-again). Each planting lasts ~3 weeks before bolting in heat. Succession plant every 3 weeks for a continuous salad supply. 8 lbs/person ≈ 1–2 salads/week through the season for a family of 4.',
    },
    arugula_standard: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Harvest outer leaves weekly (same plant, keeps growing). Bolt-prone in heat — succession plant every 2–3 weeks. Used as a peppery accent, not primary salad base, so quantities stay low.',
    },
    chard_rainbow: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Harvest outer stalks weekly — the same plant keeps producing all season (does not bolt in heat like spinach). One planting lasts the whole season. 8 lbs/person covers regular side-dish use for a family of 4.',
    },
    mizuna_standard: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Harvest outer leaves weekly (cut-and-come-again). Mild bolt resistance — one planting lasts longer than spinach. Used as a salad accent alongside primary greens.',
    },
    tatsoi_standard: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Similar to mizuna; used in stir-fries and salads',
    },
    mustard_red_giant: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Usually grown as a flavour accent; strong taste limits volume',
    },
    mache_vit: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Specialty green; small servings',
    },
    sorrel_french: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Used in soups and sauces; perennial so lower seasonal need',
    },
    radicchio_rossa: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Bitter; used in small amounts for salads',
    },
    endive_frisee: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Specialty salad green',
    },
    asian_mix: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Mix of fast greens; higher volume for stir-fry households',
    },
    watercress_standard: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Garnish / salad accent; low volume crop',
    },
    purslane_golden: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Foraged-style green; low regular consumption',
    },

    // ─── Brassica ────────────────────────────────────────────────────────────
    kale_red_russian: {
        lbs_per_person_season: 10,
        unit_label: 'lbs',
        notes: 'Harvest outer leaves weekly all season — kale is cold-hardy, does not bolt, and one planting lasts from spring through winter frost. 10 lbs/person covers regular fresh, frozen, and juiced use for a family of 4.',
    },
    broccoli_belstar: {
        lbs_per_person_season: 12,
        unit_label: 'lbs',
        notes: 'USDA avg: ~12 lbs/yr. Side shoots add to initial harvest',
    },
    cabbage_storage: {
        lbs_per_person_season: 10,
        unit_label: 'lbs',
        notes: 'Includes sauerkraut/fermentation target for preservation-minded households',
    },
    pac_choi_joi: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Quick cook; popular in Asian cuisines',
    },
    kohlrabi_kolibri: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Specialty veg; novelty and snacking',
    },
    cauliflower_snowball: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Popular as rice substitute; higher demand in low-carb households',
    },
    brussels_sprouts: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Seasonal fall crop; moderate household consumption',
    },
    collards_champion: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Southern staple; braised slow, cooks way down',
    },
    napa_cabbage: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Kimchi-makers may want more; base figure for average household',
    },
    romanesco: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Specialty / premium crop; limited regular consumption',
    },

    // ─── Root ─────────────────────────────────────────────────────────────────
    carrot_nantes: {
        lbs_per_person_season: 15,
        unit_label: 'lbs',
        notes: 'USDA avg: ~15 lbs/yr fresh + cooked. High demand across all age groups',
    },
    beet_chioggia: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Fresh, roasted, and pickled use. Greens also edible',
    },
    turnip_hakurei: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Salad turnips eaten raw; higher consumption than storage types',
    },
    parsnip_harris: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Autumn / winter root; lower fresh consumption',
    },
    celeriac_monarch: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Specialty root; used in soups and remoulade',
    },
    daikon_miyashige: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Popular in Asian households; can double for pickling families',
    },
    rutabaga_laurentian: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Storage root; moderate consumption',
    },
    potato_red_norland: {
        lbs_per_person_season: 50,
        unit_label: 'lbs',
        notes: 'USDA avg: ~50 lbs/yr. One of the highest-volume crops to size correctly',
    },
    sweet_potato_beauregard: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Growing in popularity; assumes some storage/baking use',
    },
    sunchoke_stampede: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Digestive considerations limit volume; perennial',
    },
    parsley_root: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Specialty ingredient; low standalone consumption',
    },
    salsify_mammoth: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Rare in most households; grow for novelty',
    },

    // ─── Allium ──────────────────────────────────────────────────────────────
    scallions_evergreen: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Cut the tops weekly (leave ~1" above soil — they regrow). Succession sow every 3–4 weeks for a continuous garnish supply. 4 lbs/person covers constant cooking use for a family of 4.',
    },
    leek_giant_musselburgh: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Soups, quiches; moderate volume',
    },
    onion_candy: {
        lbs_per_person_season: 20,
        unit_label: 'lbs',
        notes: 'USDA avg: ~20 lbs/yr. Used in almost every savoury dish',
    },
    cipollini_onion: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Specialty onion; roasting and pickling',
    },
    garlic_music: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Avg American: ~3 lbs; culinary households easily hit 5+',
    },
    shallots_ambition: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'French cooking staple; specialty households want more',
    },
    chives_standard: {
        lbs_per_person_season: 1,
        unit_label: 'lbs',
        notes: 'Garnish herb; small volume but succession-harvest all season',
    },
    ramps_wild: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Seasonal specialty; short harvest window',
    },

    // ─── Legume ──────────────────────────────────────────────────────────────
    peas_sugar_snap: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'High fresh-eat volume; short season means targeted planting',
    },
    beans_green_bush: {
        lbs_per_person_season: 15,
        unit_label: 'lbs',
        notes: 'Core summer vegetable; 15 lbs/person covers fresh eating + a round or two of canning for most households. USDA avg is 20 lbs but backyard gardens skew toward fresh use.',
    },
    edamame_besweet: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Popular frozen/fresh snack',
    },
    fava_beans: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Spring crop; moderate consumption',
    },
    cowpeas_iron_clay: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Southern peas; can also be used as a cover crop',
    },
    runner_beans: {
        lbs_per_person_season: 10,
        unit_label: 'lbs',
        notes: 'Prolific producer; British gardening staple',
    },
    snap_peas_cascadia: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Similar to sugar snap; fresh eating',
    },
    soybeans_midori: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Specialty edamame style',
    },

    // ─── Herb ────────────────────────────────────────────────────────────────
    cilantro_santo: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Bolts fast; succession plant. High-use households (salsa, curries) want more',
    },
    basil_genovese: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Fresh use + pesto; 2 lbs is 6–8 large batches of pesto',
    },
    parsley_flat_leaf: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Year-round use as garnish and in cooking',
    },
    dill_fernleaf: {
        lbs_per_person_season: 1,
        unit_label: 'lbs',
        notes: 'Pickling season plus fresh use; compact demand',
    },
    thyme_english: {
        lbs_per_person_season: 0.5,
        unit_label: 'lbs',
        notes: 'A little goes a long way; perennial so minimal planting needed',
    },
    oregano_greek: {
        lbs_per_person_season: 0.5,
        unit_label: 'lbs',
        notes: 'Dried and fresh; perennial',
    },
    sage_garden: {
        lbs_per_person_season: 0.3,
        unit_label: 'lbs',
        notes: 'Intense flavour; very small volume needed',
    },
    rosemary_tuscan_blue: {
        lbs_per_person_season: 0.3,
        unit_label: 'lbs',
        notes: 'Perennial shrub; once established, barely needs replanting',
    },
    mint_spearmint: {
        lbs_per_person_season: 1,
        unit_label: 'lbs',
        notes: 'Tea, cocktails, and cooking. Invasive — contain to pots',
    },
    lemon_balm: {
        lbs_per_person_season: 0.5,
        unit_label: 'lbs',
        notes: 'Tea herb; light usage',
    },
    tarragon_french: {
        lbs_per_person_season: 0.3,
        unit_label: 'lbs',
        notes: 'French cooking accent; very small volumes',
    },
    fennel_bronze: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Bulb + fronds used; 4 lbs ≈ 6–8 bulbs for roasting, salads',
    },
    chervil_curled: {
        lbs_per_person_season: 1,
        unit_label: 'lbs',
        notes: 'Rarely grown in US; specialty French herb',
    },
    lavender_hidcote: {
        lbs_per_person_season: null, // flowers; use stems
        unit_label: 'stems',
        stems_per_week: 5,
        weeks_season: 6,
        notes: 'Culinary and ornamental; stems_per_week × weeks gives bunching target',
    },
    chamomile_german: {
        lbs_per_person_season: 0.3,
        unit_label: 'lbs',
        notes: 'Dried flowers for tea; very small volume',
    },

    // ─── Nightshade ──────────────────────────────────────────────────────────
    tomato_heirloom_beefsteak: {
        lbs_per_person_season: 30,
        unit_label: 'lbs',
        notes: 'USDA avg ~25–30 lbs fresh/yr. Significant if canning sauce (double for canners)',
    },
    cherry_tomato_sungold: {
        lbs_per_person_season: 15,
        unit_label: 'lbs',
        notes: 'Snacking tomato; kids eat a lot. Lower than slicers because used as accent',
    },
    pepper_sweet: {
        lbs_per_person_season: 10,
        unit_label: 'lbs',
        notes: 'Fresh eating, stuffed peppers, roasting',
    },
    pepper_jalapeño: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Spicy households may want more; 3 lbs fills a year of pickling',
    },
    eggplant_ichiban: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Roasting, baba ganoush; moderate consumption',
    },
    tomatillo_grande: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Salsa verde use; SW cuisine households want more',
    },
    ground_cherry_cossack: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Novelty fruit; snacking and jam',
    },
    hot_pepper_habanero: {
        lbs_per_person_season: 1,
        unit_label: 'lbs',
        notes: 'Very hot; 1 lb is a substantial supply for most households',
    },

    // ─── Cucurbit ────────────────────────────────────────────────────────────
    cucumber_marketmore: {
        lbs_per_person_season: 12,
        unit_label: 'lbs',
        notes: 'Fresh slicing + pickling; core summer vegetable',
    },
    zucchini_black_beauty: {
        lbs_per_person_season: 20,
        unit_label: 'lbs',
        notes: 'Prolific producer — WARNING: one plant is often enough for 2 people',
    },
    summer_squash_pattypan: {
        lbs_per_person_season: 12,
        unit_label: 'lbs',
        notes: 'Similar to zucchini; variety eating',
    },
    butternut_squash: {
        lbs_per_person_season: 15,
        unit_label: 'lbs',
        notes: 'Storage crop; canned soup and roasting through winter',
    },
    kabocha_squash: {
        lbs_per_person_season: 10,
        unit_label: 'lbs',
        notes: 'Asian cuisine staple; sweet and dense',
    },
    delicata_squash: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'No-peel thin skin; popular roasting variety',
    },
    pumpkin_jack: {
        lbs_per_person_season: 10,
        unit_label: 'lbs',
        notes: 'Cooking pumpkin + decorative; autumn family tradition',
    },
    cantaloupe_ambrosia: {
        lbs_per_person_season: 15,
        unit_label: 'lbs',
        notes: 'USDA avg: ~15 lbs/yr; summer fruit staple',
    },
    watermelon_sugar_baby: {
        lbs_per_person_season: 20,
        unit_label: 'lbs',
        notes: 'USDA avg: ~20 lbs/yr; space-heavy but high-reward',
    },
    bitter_melon: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Cultural staple in SE Asian households; lower general demand',
    },

    // ─── Flowers ─────────────────────────────────────────────────────────────
    // Flowers are measured in stems/week × season length, not by weight.
    // The calculator will use stems_per_week × weeks_season instead of lbs.
    sunflower_holiday: {
        lbs_per_person_season: null,
        unit_label: 'bouquets',
        stems_per_week: 3,
        weeks_season: 8,
        notes: 'Succession planting recommended for continuous harvest',
    },
    zinnia_benary_giant: {
        lbs_per_person_season: null,
        unit_label: 'bouquets',
        stems_per_week: 10,
        weeks_season: 12,
        notes: 'Prolific; pinch early for more stems',
    },
    snapdragon_rocket: {
        lbs_per_person_season: null,
        unit_label: 'bouquets',
        stems_per_week: 6,
        weeks_season: 10,
        notes: 'Cool-season; succession for spring and fall harvests',
    },
    calendula_erfurter: {
        lbs_per_person_season: null,
        unit_label: 'bouquets',
        stems_per_week: 8,
        weeks_season: 14,
        notes: 'Edible and medicinal; long season',
    },
    statice_QIS: {
        lbs_per_person_season: null,
        unit_label: 'bouquets',
        stems_per_week: 5,
        weeks_season: 10,
        notes: 'Dried flower; low-maintenance',
    },
    strawflower_apricot: {
        lbs_per_person_season: null,
        unit_label: 'bouquets',
        stems_per_week: 6,
        weeks_season: 12,
        notes: 'Everlasting; great for dried arrangements',
    },
    lisianthus_echo: {
        lbs_per_person_season: null,
        unit_label: 'bouquets',
        stems_per_week: 3,
        weeks_season: 8,
        notes: 'Slow-growing premium cut flower; higher value per stem',
    },
    marigold_french: {
        lbs_per_person_season: null,
        unit_label: 'bouquets',
        stems_per_week: 10,
        weeks_season: 16,
        notes: 'Also a companion plant; dual purpose',
    },
    nasturtium_jewel: {
        lbs_per_person_season: 1, // edible petals — give lbs for salad use
        unit_label: 'lbs',
        stems_per_week: 8,
        weeks_season: 14,
        notes: 'Edible petals and leaves; both weight and bouquet metrics apply',
    },

    // ─── Specialty ───────────────────────────────────────────────────────────
    amaranth_grain: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Grain crop; also edible greens when young',
    },
    quinoa_brightest: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Grain substitute; 5 lbs ≈ 3–4 months of weekly use',
    },
    corn_sweet_peaches: {
        lbs_per_person_season: 15,
        unit_label: 'lbs',
        notes: '≈ 25–30 ears per person per season; space-hungry but loved',
    },
    asparagus_millennium: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Perennial; 3-yr establishment. Once producing, 1 year = ~5 lbs/person',
    },
    artichoke_imperial: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: '≈ 10–12 heads per person; perennial in mild climates',
    },
    celery_utah: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Diced for cooking, raw snacking; high water content means moderate weight',
    },
    okra_clemson: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Southern dishes, pickling, freezing; prolific in heat',
    },
    rhubarb_victoria: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Pies and jam; perennial. 4 lbs = a lot of pie',
    },

    // ─── Cover Crops (excluded — no consumption target) ──────────────────────
    cover_crop_rye_vetch:  { lbs_per_person_season: null, unit_label: null, notes: 'Soil improvement only' },
    cover_crop_buckwheat:  { lbs_per_person_season: null, unit_label: null, notes: 'Soil improvement only' },
    cover_crop_clover:     { lbs_per_person_season: null, unit_label: null, notes: 'Soil improvement only' },
    cover_crop_oats:       { lbs_per_person_season: null, unit_label: null, notes: 'Soil improvement only' },
};

export default HOME_CONSUMPTION;
