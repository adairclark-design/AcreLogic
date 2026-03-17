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
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'You are harvesting outer leaves weekly — the same plant keeps going. But spinach bolts (goes to seed) after ~20 warm days, so plan 2–3 succession sowings spaced 2–3 weeks apart. 2 lbs/person = ~4–5 ft of row per sowing for a family of 4 — a realistic fresh-salad target for a short bolt-prone season.',
    },
    lettuce_mix: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'You are harvesting outer leaves weekly from the same plant (cut-and-come-again). Each planting lasts ~3 weeks before bolting in heat. Succession plant every 3 weeks for a continuous salad supply. 5 lbs/person for a family of 4 — roughly 1 salad bowl per week per person across the season.',
    },
    arugula_standard: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Harvest outer leaves weekly (same plant, keeps growing). Bolt-prone in heat — succession plant every 2–3 weeks. Used as a peppery accent, not primary salad base, so quantities stay low.',
    },
    chard_rainbow: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Harvest outer stalks weekly — the same plant keeps producing all season (does not bolt in heat like spinach). One planting lasts the whole season. 3 lbs/person ≈ side dish every 2 weeks for a family of 4.',
    },
    mizuna_standard: {
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Harvest outer leaves weekly (cut-and-come-again). Mild bolt resistance — one planting lasts longer than spinach. Used as a salad accent alongside primary greens.',
    },
    tatsoi_standard:  { lbs_per_person_season: 2,   unit_label: 'lbs', notes: 'Similar to mizuna; used in stir-fries and salads' },
    mustard_red_giant: { lbs_per_person_season: 1.5, unit_label: 'lbs', notes: 'Strong flavour limits volume — used as accent only' },
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
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Harvest outer leaves weekly all season — kale is cold-hardy, does not bolt, and one planting lasts from spring through winter frost. 4 lbs/person = roughly 1 large bunch per month, which is realistic for most families without becoming a kale farm.',
    },
    broccoli_belstar: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Each plant gives one main head (~1 lb) then side shoots for several weeks. 5 lbs/person = 4–6 plants per person — a realistic target for a dedicated bed.',
    },
    cabbage_storage: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Each plant produces one head (2–3 lbs). 4 lbs/person = 1–2 heads per person for fresh use. Double if making sauerkraut.',
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
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'One plant = one head (~1.5–2 lbs). 4 lbs/person = 2–3 heads per person — modest and realistic.',
    },
    brussels_sprouts: {
        lbs_per_person_season: 3,
        unit_label: 'lbs',
        notes: 'Long-season crop; each plant produces 1–2 lbs of sprouts over fall. 3 lbs/person is generous for most families.',
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
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'One of the most-eaten backyard vegetables. 8 lbs/person = ~2 lbs/month through the season, covering raw snacking, cooked dishes, and some storage.',
    },
    beet_chioggia: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Fresh, roasted, and pickled. 4 lbs/person covers regular use; greens are also edible and add to yield.',
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
        lbs_per_person_season: 15,
        unit_label: 'lbs',
        notes: 'USDA annual avg is 50 lbs but that includes all commercial sources. Backyard growers realistically harvest 10–20 lbs per person from a 4×8 bed. 15 lbs/person is a solid target without sizing a field.',
    },
    sweet_potato_beauregard: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: '3–5 slips per person yields ~5 lbs; more if you have the space. Good for baking and storage.',
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
        lbs_per_person_season: 2,
        unit_label: 'lbs',
        notes: 'Cut the tops weekly (leave ~1" above soil — they regrow). Succession sow every 3–4 weeks for a continuous garnish supply. 2 lbs/person covers constant cooking use for a family of 4.',
    },
    leek_giant_musselburgh: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Soups, quiches; moderate volume',
    },
    onion_candy: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'USDA annual avg is ~20 lbs but most comes from grocery stores. 8 lbs/person from the garden = 1–2 onions per week through the harvest window — enough to cover fresh cooking without a full-scale operation.',
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
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Short spring season — peas are done in 6–8 weeks. 4 lbs/person is a generous fresh-eating target; mostly eaten straight off the vine.',
    },
    beans_green_bush: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Fresh eating through summer. 8 lbs/person for a family of 4 = 32 lbs total — enough for regular side dishes and a small batch of canning without needing a massive planting.',
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
    runner_beans: { lbs_per_person_season: 6,  unit_label: 'lbs', notes: 'Prolific climbing producer. 6 lbs/person is realistic for regular fresh eating.' },
    snap_peas_cascadia: { lbs_per_person_season: 4,  unit_label: 'lbs', notes: 'Similar to sugar snap; short spring season, fresh eating.' },
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
        lbs_per_person_season: 15,
        unit_label: 'lbs',
        notes: 'Fresh slicing all summer. 15 lbs/person = 2–3 plants per person — enough for daily fresh eating without becoming a sauce factory. Double if you plan to can.',
    },
    cherry_tomato_sungold: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Snacking tomato — 1 plant per person is usually plenty. 6 lbs/person accounts for the kid factor and grazing straight off the vine.',
    },
    pepper_sweet: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Fresh eating, stuffed peppers, roasting. 6 lbs/person = 2–3 plants per person.',
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
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'Fresh slicing + pickling. 6 lbs/person = 1–2 plants per person; cucumbers are prolific so resist over-planting.',
    },
    zucchini_black_beauty: {
        lbs_per_person_season: 6,
        unit_label: 'lbs',
        notes: 'The most prolific plant in the garden — 1 plant easily feeds 2 people all season. 6 lbs/person is the realistic consumption target before zucchini fatigue sets in.',
    },
    summer_squash_pattypan: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Similar in output to zucchini. If growing both, halve quantities of each.',
    },
    butternut_squash: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Storage crop; roasting and soup through winter. 8 lbs/person = 2–3 large squash per person.',
    },
    kabocha_squash: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Dense sweet flesh. 5 lbs/person = 1–2 fruits per person for seasonal use.',
    },
    delicata_squash: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'No-peel thin skin; popular quick-roasting variety. 4 lbs/person = 2–3 fruit per person.',
    },
    pumpkin_jack: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Cooking pumpkin + decorative. 5 lbs/person = 1–2 fruits per person for autumn use.',
    },
    cantaloupe_ambrosia: {
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: 'Summer fruit. 8 lbs/person = 2–4 melons per person across the season.',
    },
    watermelon_sugar_baby: {
        lbs_per_person_season: 5,
        unit_label: 'lbs',
        notes: 'Space-hungry vine. Each fruit is 6–10 lbs — 1–2 per person for the season is realistic. 5 lbs/person keeps the planting to a manageable 1–2 plants per family of 4.',
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
        lbs_per_person_season: 8,
        unit_label: 'lbs',
        notes: '~12–16 ears per person per season (each ear ~0.5 lb of kernels). Space-hungry but worth it for the fresh-off-the-stalk experience.',
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
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Mostly used diced in cooking rather than as a snack vegetable. 4 lbs/person covers regular use without a celery-intensive household.',
    },
    okra_clemson: {
        lbs_per_person_season: 4,
        unit_label: 'lbs',
        notes: 'Prolific in heat; 1–2 plants per person can easily yield 4 lbs. Freezes well for Southern dishes.',
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
