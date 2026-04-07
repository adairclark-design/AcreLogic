/**
 * cropPricing.js
 * ═══════════════
 * Retail price estimates ($/lb) for all 567 food crops in AcreLogic.
 * Used by YieldForecast to calculate estimated retail market value.
 *
 * Two-layer system:
 *   1. CROP_RETAIL_PRICES  — per-crop retail $/lb (national USDA avg)
 *   2. getRegionalMultiplier(zipCode) — adjusts for local cost of living
 *
 * Price methodology:
 *   - ~70 crops: hand-researched USDA AMS national retail averages
 *   - Remaining: wholesale_price_per_lb × category markup factor,
 *     floored at category minimum and capped at category maximum.
 *   Sources: USDA AMS Market News 2023-2025, USDA ERS retail surveys.
 */

// ─── National average retail prices ($/lb) ───────────────────────────────────
export const CROP_RETAIL_PRICES = {
    // ── Greens ──────────────────────────────────────────────
    spinach_space: 6.50,  // Spinach Space
    lettuce_mix: 5.25,  // Lettuce Salanova Mix
    arugula_standard: 10.50,  // Arugula Standard / Roquette
    chard_rainbow: 5.25,  // Swiss Chard Rainbow / Bright Lights
    mizuna_standard: 9.00,  // Mizuna Standard
    tatsoi_standard: 9.00,  // Tatsoi Standard
    mustard_red_giant: 7.75,  // Mustard Greens Red Giant
    mache_vit: 13.00,  // Mâche Vit
    sorrel_french: 10.50,  // Sorrel French
    radicchio_rossa: 6.50,  // Radicchio Rossa di Treviso
    endive_frisee: 5.75,  // Endive/Escarole Frisée / Batavian
    asian_mix: 10.50,  // Asian Greens Mix Tokyo Bekana + Yukina Savoy
    watercress_standard: 13.00,  // Watercress Standard
    purslane_golden: 10.50,  // Purslane Golden
    lettuce_butterhead: 4.00,  // Lettuce Boston Butterhead
    lettuce_bibb: 4.50,  // Lettuce Bibb / Limestone
    lettuce_oakleaf_green: 4.00,  // Lettuce Green Oakleaf
    lettuce_oakleaf_red: 4.50,  // Lettuce Red Oakleaf
    lettuce_romaine_red: 4.50,  // Lettuce Rouge d'Hiver Romaine
    lettuce_little_gem: 4.50,  // Lettuce Little Gem
    lettuce_lolla_rossa: 5.25,  // Lettuce Lolla Rossa
    lettuce_flashy_trout: 5.75,  // Lettuce Forellenschluss
    lettuce_iceberg: 2.50,  // Lettuce Great Lakes Iceberg
    lettuce_deer_tongue: 5.25,  // Lettuce Deer Tongue
    amaranth_greens: 7.75,  // Amaranth Greens Callaloo
    orach_red: 6.50,  // Orach Red Mountain Spinach
    new_zealand_spinach: 7.75,  // New Zealand Spinach Standard
    malabar_spinach: 7.75,  // Malabar Spinach Red Stem / Green
    claytonia: 10.50,  // Claytonia Miner's Lettuce
    dandelion_greens: 6.50,  // Dandelion Ameliore / Catalogna
    chicory_catalogna: 5.25,  // Chicory Catalogna Puntarelle
    komatsuna: 6.50,  // Komatsuna Tendergreen
    perpetual_spinach: 6.50,  // Perpetual Spinach Feuille de Chene
    shoots: 14.00,  // Shoots Primary
    belgian_endive: 5.75,  // Belgian Endive Primary
    fris_e: 5.75,  // Frisée Primary
    chard: 4.50,  // Chard Primary
    celtuce: 5.75,  // Celtuce Primary
    agretti: 14.00,  // Agretti Primary
    samphire: 14.00,  // Samphire Primary
    sea_purslane: 14.00,  // Sea Purslane Primary
    glasswort: 14.00,  // Glasswort Primary
    good_king_henry: 10.50,  // Good King Henry Primary
    lettuce_romaine_parris_island: 4.50,  // Lettuce Romaine Parris Island Cos
    lettuce_buttercrunch: 4.50,  // Lettuce Buttercrunch
    lettuce_black_seeded_simpson: 4.50,  // Lettuce Black Seeded Simpson
    lettuce_red_sails: 4.50,  // Lettuce Red Sails
    lettuce_nevada: 4.50,  // Lettuce Nevada Batavian
    lettuce_magenta: 4.50,  // Lettuce Magenta Batavian
    lettuce_concept: 4.50,  // Lettuce Concept Batavian
    lettuce_sierra: 4.50,  // Lettuce Sierra Batavian
    lettuce_slobolt: 4.50,  // Lettuce Slobolt Leaf
    lettuce_salad_bowl_green: 4.50,  // Lettuce Salad Bowl Green
    lettuce_salad_bowl_red: 4.50,  // Lettuce Salad Bowl Red
    lettuce_tom_thumb: 4.50,  // Lettuce Tom Thumb Butterhead
    lettuce_winter_density: 4.50,  // Lettuce Winter Density Romaine
    bok_choy_joi_choi: 4.00,  // Bok Choy Joi Choi
    bok_choy_ching_chiang: 4.00,  // Bok Choy Ching Chiang
    bok_choy_win_win_choi: 4.00,  // Bok Choy Win-Win Choi
    chinese_cabbage_tokyo_bekana: 2.50,  // Chinese Cabbage Tokyo Bekana
    komatsuna_vitamin_green: 9.00,  // Vitamin Green Standard
    chrysanthemum_greens_shungiku: 9.00,  // Chrysanthemum Greens Shungiku
    senposai_standard: 9.00,  // Senposai Standard
    hon_tai_sai_standard: 9.00,  // Hon Tai Sai Standard
    mustard_purple_osaka: 7.75,  // Mustard Greens Purple Osaka
    mustard_green_wave: 7.75,  // Mustard Greens Green Wave
    mizuna_kyoto: 9.00,  // Mizuna Kyoto
    mizuna_red_kingdom: 9.00,  // Mizuna Red Kingdom
    komatsuna_carlton: 9.00,  // Komatsuna Carlton
    // ── Brassica ────────────────────────────────────────────
    kale_red_russian: 5.50,  // Kale Red Russian
    broccoli_belstar: 6.50,  // Broccoli Belstar
    cabbage_storage: 2.50,  // Cabbage Storage Red/Green
    pac_choi_joi: 5.50,  // Pac Choi Joi Choi / Bok Choy
    kohlrabi_kolibri: 4.75,  // Kohlrabi Kolibri (Purple)
    cauliflower_snowball: 8.00,  // Cauliflower Snowball / Cheddar
    brussels_sprouts: 6.50,  // Brussels Sprouts Jade Cross
    collards_champion: 4.75,  // Collards Champion
    napa_cabbage: 4.00,  // Napa Cabbage Blues / Minuet
    romanesco: 8.00,  // Romanesco Veronica
    pac_choi_green: 6.50,  // Pac Choi Green Boy
    yu_choy: 6.50,  // Yu Choy Standard
    gai_lan: 8.00,  // Gai Lan Chinese Broccoli
    kohlrabi_white_vienna: 3.25,  // Kohlrabi White Vienna
    chinese_cabbage: 2.75,  // Chinese Cabbage Primary
    kalettes: 7.25,  // Kalettes Primary
    broccoli_raab: 5.25,  // Broccoli Raab Rapini / De Cicco
    ethiopian_kale: 6.50,  // Ethiopian Kale Primary
    siberian_kale: 6.50,  // Siberian Kale Primary
    portuguese_kale: 5.50,  // Portuguese Kale Primary
    red_russian_kale: 5.50,  // Red Russian Kale Primary
    lacinato_kale: 4.00,  // Lacinato Kale Primary
    savoy_cabbage: 2.00,  // Savoy Cabbage Primary
    red_cabbage: 2.00,  // Red Cabbage Primary
    bok_choy: 4.75,  // Bok Choy Primary
    tyfon: 2.00,  // Tyfon Primary
    forage_rape: 2.00,  // Forage Rape Primary
    nine_star_broccoli: 3.50,  // Nine Star Broccoli Primary
    perennial_kale: 5.50,  // Perennial Kale Primary
    kale_lacinato: 2.00,  // Kale Lacinato
    kale_winterbor: 2.00,  // Kale Winterbor
    kale_redbor: 2.00,  // Kale Redbor
    kale_scarlet: 2.00,  // Kale Scarlet
    kale_white_russian: 2.00,  // Kale White Russian
    kale_dazzling_blue: 2.00,  // Kale Dazzling Blue
    kale_premier: 2.00,  // Kale Premier
    cabbage_golden_acre: 2.00,  // Cabbage Golden Acre
    cabbage_copenhagen_market: 2.00,  // Cabbage Copenhagen Market
    cabbage_red_express: 2.00,  // Cabbage Red Express
    savoy_cabbage_perfection: 2.00,  // Savoy Cabbage Perfection
    cabbage_late_flat_dutch: 2.00,  // Cabbage Late Flat Dutch
    cabbage_brunswick: 2.00,  // Cabbage Brunswick
    // ── Root ────────────────────────────────────────────────
    radish_french_breakfast: 4.50,  // Radish French Breakfast
    carrot_nantes: 5.50,  // Carrots Nantes (Bolero / Romance)
    beet_chioggia: 5.50,  // Beets Chioggia / Detroit Dark Red
    turnip_hakurei: 4.50,  // Turnips Hakurei (Salad)
    parsnip_harris: 5.50,  // Parsnip Harris Model
    celeriac_monarch: 7.75,  // Celeriac Monarch
    daikon_miyashige: 4.50,  // Daikon Miyashige
    rutabaga_laurentian: 3.25,  // Rutabaga Laurentian
    sunchoke_stampede: 5.50,  // Sunchoke Stampede
    parsley_root: 5.00, // [researched]
    salsify_mammoth: 6.50,  // Salsify Mammoth White
    horseradish_standard: 4.50,  // Horseradish Bohemian
    burdock_gobo: 4.50,  // Burdock Gobo Takinogawa
    scorzonera_standard: 6.50,  // Scorzonera Duplex
    watermelon_radish: 6.50,  // Watermelon Radish Misato Rose
    purple_daikon: 5.50,  // Purple Daikon KN Bravo
    black_radish: 5.50,  // Black Radish Round Black Spanish
    carrot_cosmic_purple: 5.50,  // Carrot Cosmic Purple
    carrot_chantenay: 3.25,  // Carrot Chantenay Red Core
    carrot_white: 5.50,  // Carrot White Satin
    beet_golden: 5.50,  // Golden Beet Touchstone Gold
    turnip_purple_top: 2.25,  // Purple Top Turnip Purple Top White Globe
    rutabaga_american_purple_top: 4.50,  // Rutabaga American Purple Top
    maca: 8.00,  // Maca Primary
    arracacha: 8.00,  // Arracacha Primary
    skirret: 8.00,  // Skirret Primary
    beet_cylindra: 5.50,  // Beet Cylindra / Formanova
    beet_bulls_blood: 5.50,  // Beet Bull's Blood
    beet_early_wonder: 5.50,  // Beet Early Wonder Tall Top
    beet_red_ace: 5.50,  // Beet Red Ace
    beet_avalanche: 5.50,  // Beet Avalanche (White)
    beet_boro: 5.50,  // Beet Boro
    beet_kestrel: 5.50,  // Beet Kestrel
    beet_merlin: 5.50,  // Beet Merlin
    beet_robin: 5.50,  // Beet Robin
    beet_subeto: 5.50,  // Beet Subeto
    beet_boldor: 5.50,  // Beet Boldor (Golden)
    beet_crosby_egyptian: 5.50,  // Beet Crosby's Egyptian
    // ── Tuber ───────────────────────────────────────────────
    potato_red_norland: 3.00,  // Potatoes Red Norland / Yukon Gold
    sweet_potato_beauregard: 3.00,  // Sweet Potato Beauregard
    potato_fingerling: 3.00,  // Fingerling Potato Russian Banana
    potato_purple_majesty: 3.00,  // Purple Potato Purple Majesty
    potato_russet: 1.25,  // Russet Potato Russet Burbank
    potato_german_butterball: 2.50,  // Yellow Potato German Butterball
    jicama_standard: 3.00,  // Jicama Standard
    taro_standard: 2.50,  // Taro / Dasheen Bun Long
    oca_standard: 3.00,  // Oca New Zealand Yam
    artichoke_jerusalem: 3.00,  // Artichoke Jerusalem Primary
    yacon: 3.00,  // Yacon Primary
    mashua: 3.00,  // Mashua Primary
    ulluco: 3.00,  // Ulluco Primary
    tiger_nut: 3.00,  // Tiger Nut Primary
    potato_kennebec: 1.25,  // Potato Kennebec
    potato_katahdin: 1.25,  // Potato Katahdin
    potato_goldrush: 1.25,  // Potato Goldrush
    potato_red_pontiac: 1.25,  // Potato Red Pontiac
    potato_colorado_rose: 1.25,  // Potato Colorado Rose
    potato_magic_molly: 1.25,  // Potato Magic Molly (Purple)
    potato_french_fingerling: 1.25,  // Potato French Fingerling
    potato_rose_finn_apple: 1.25,  // Potato Rose Finn Apple Fingerling
    potato_adirondack_blue: 1.25,  // Potato Adirondack Blue
    potato_adirondack_red: 1.25,  // Potato Adirondack Red
    potato_bintje: 1.25,  // Potato Bintje
    potato_nicola: 1.25,  // Potato Nicola
    // ── Allium ──────────────────────────────────────────────
    scallions_evergreen: 7.25,  // Scallions Evergreen / Parade
    leek_giant_musselburgh: 7.25,  // Leeks Giant Musselburgh
    onion_candy: 2.75,  // Storage Onion Candy / Red Wethersfield
    cipollini_onion: 3.00, // [researched]
    garlic_music: 8.00, // [researched]
    shallots_ambition: 5.00, // [researched]
    chives_standard: 9.00, // [researched]
    ramps_wild: 10.00,  // Ramps Wild Leek
    walking_onion: 5.50,  // Walking Onion Primary
    welsh_onion: 6.25,  // Welsh Onion Primary
    japanese_bunching_onion: 10.00,  // Japanese Bunching Onion Primary
    potato_onion: 5.50,  // Potato Onion Primary
    rocambole_garlic: 10.00,  // Rocambole Garlic Spanish Roja
    elephant_garlic: 10.00,  // Elephant Garlic Primary
    garlic_chives: 10.00,  // Garlic Chives Primary
    shallot: 8.00,  // Shallot Zebrune
    pickling_onion: 5.00,  // Pickling Onion Crystal Wax
    torpedo_onion: 3.50,  // Torpedo Onion Primary
    sweet_onion: 3.50,  // Sweet Onion Walla Walla
    // ── Legume ──────────────────────────────────────────────
    peas_sugar_snap: 8.00,  // Peas Sugar Snap / Oregon Sugar Pod
    beans_green_bush: 5.00,  // Green Beans Provider / Blue Lake Bush
    edamame_besweet: 6.75,  // Edamame Besweet 292
    fava_beans: 6.00,  // Fava Beans Aquadulce
    cowpeas_iron_clay: 5.00,  // Cowpeas Iron & Clay
    runner_beans: 6.00,  // Runner Beans Scarlet Runner
    snap_peas_cascadia: 8.00,  // Snap Peas Cascadia
    soybeans_midori: 5.00,  // Soybeans Midori Giant
    bean_pole_kentucky_wonder: 3.50,  // Pole Bean Kentucky Wonder
    bean_pole_rattlesnake: 3.50,  // Pole Bean Rattlesnake
    bean_dragon_tongue: 4.25,  // Dragon Tongue Bean Wax Dragon Tongue
    bean_yard_long: 4.25,  // Yard-Long Bean Orient Wonder
    bean_lima_henderson: 3.50,  // Lima Bean Henderson Bush
    bean_lima_fordhook: 3.50,  // Lima Bean Fordhook 242
    bean_black: 2.50,  // Black Bean Black Turtle
    bean_pinto: 2.50,  // Pinto Bean Othello
    bean_kidney: 2.50,  // Kidney Bean Dark Red
    bean_cannellini: 2.50,  // Cannellini Bean White Kidney
    bean_navy: 2.50,  // Navy Bean Michelite
    chickpea_standard: 3.50,  // Chickpea Kabuli / Desi
    lentil_red_chief: 3.50,  // Lentil Red Chief
    lentil_beluga: 4.25,  // Lentil Beluga Black
    mung_bean: 3.50,  // Mung Bean Berken
    adzuki_bean: 4.25,  // Adzuki Bean Express
    black_eyed_pea: 3.50,  // Black-Eyed Pea California Blackeye
    purple_hull_pea: 3.50,  // Purple Hull Pea Pinkeye Purple Hull
    bean_haricot_vert: 6.75,  // Haricot Vert Maxibel
    bean_yellow_wax: 4.25,  // Yellow Wax Bean Rocdor
    bean_purple_wax: 4.25,  // Purple Wax Bean Royal Burgundy
    snow_pea_mammoth: 6.00,  // Snow Pea Mammoth Melting Sugar
    pigeon_pea: 4.25,  // Pigeon Pea Red Holstein
    tepary_bean: 3.50,  // Tepary Bean Blue Speckled
    scarlet_runner_bean: 4.25,  // Scarlet Runner Scarlet Emperor
    hyacinth_bean: 3.50,  // Hyacinth Bean Lablab
    field_peas: 2.50,  // Field Peas Primary
    fababean: 3.75,  // Fababean Primary
    soybean: 6.00,  // Soybean Envy
    lupin: 2.50,  // Lupin Primary
    bush_bean_blue_lake_274: 2.50,  // Bush Bean Blue Lake 274
    bush_bean_provider: 2.50,  // Bush Bean Provider
    bush_bean_contender: 2.50,  // Bush Bean Contender
    bush_bean_jade: 2.50,  // Bush Bean Jade
    wax_bean_cherokee_wax: 2.50,  // Wax Bean Cherokee Wax
    bush_bean_royal_burgundy: 2.50,  // Bush Bean Royal Burgundy
    bush_bean_dragon_tongue: 2.50,  // Bush Bean Dragon Tongue
    bush_bean_strike: 2.50,  // Bush Bean Strike
    french_bean_maxibel: 2.50,  // French Bean Maxibel
    french_bean_rocdor: 2.50,  // French Bean Rocdor
    pole_bean_blue_lake_pole: 2.50,  // Pole Bean Blue Lake Pole
    pole_bean_kentucky_blue: 2.50,  // Pole Bean Kentucky Blue
    pole_bean_romano: 2.50,  // Pole Bean Romano
    pole_bean_fortex: 2.50,  // Pole Bean Fortex
    pole_bean_trionfo_violetto: 2.50,  // Pole Bean Trionfo Violetto
    pole_bean_seychelles: 2.50,  // Pole Bean Seychelles
    yardlong_bean_red_noodle: 2.50,  // Yardlong Bean Red Noodle
    lima_bean_king_of_the_garden: 2.50,  // Lima Bean King of the Garden
    pole_bean_lazy_housewife: 2.50,  // Pole Bean Lazy Housewife
    pole_bean_cherokee_trail_of_tears: 2.50,  // Pole Bean Cherokee Trail of Tears
    snow_pea_oregon_sugar_pod_ii: 2.50,  // Snow Pea Oregon Sugar Pod II
    snap_pea_sugar_snap: 2.50,  // Snap Pea Sugar Snap
    snap_pea_super_sugar_snap: 2.50,  // Snap Pea Super Sugar Snap
    snap_pea_cascadia: 2.50,  // Snap Pea Cascadia
    shelling_pea_lincoln: 2.50,  // Shelling Pea Lincoln
    shelling_pea_thomas_laxton: 2.50,  // Shelling Pea Thomas Laxton
    // ── Herb ────────────────────────────────────────────────
    cilantro_santo: 4.00, // [researched]
    basil_genovese: 10.00, // [researched]
    parsley_flat_leaf: 6.00, // [researched]
    dill_fernleaf: 8.00, // [researched]
    thyme_english: 16.00, // [researched]
    oregano_greek: 14.00, // [researched]
    sage_garden: 18.00, // [researched]
    rosemary_tuscan_blue: 14.00, // [researched]
    mint_spearmint: 8.00, // [researched]
    lemon_balm: 8.00, // [researched]
    tarragon_french: 18.00, // [researched]
    fennel_bronze: 6.50,  // Fennel Bronze Leaf
    chervil_curled: 12.75,  // Chervil Curled
    lavender_hidcote: 22.00,  // Lavender Hidcote / Munstead
    chamomile_german: 12.00, // [researched]
    basil_thai: 8.00, // [researched]
    basil_purple: 8.00, // [researched]
    basil_lemon: 8.00, // [researched]
    cilantro_slow_bolt: 4.00, // [researched]
    vietnamese_coriander: 7.00, // [researched]
    culantro: 6.00, // [researched]
    mint_apple: 7.00, // [researched]
    korean_mint: 8.00, // [researched]
    lemon_verbena: 14.00, // [researched]
    lemon_thyme: 14.00, // [researched]
    caraway_standard: 6.00, // [researched]
    fenugreek_standard: 5.00, // [researched]
    marjoram_standard: 14.00, // [researched]
    summer_savory: 12.00, // [researched]
    winter_savory: 14.00, // [researched]
    borage_standard: 8.00, // [researched]
    lovage_standard: 10.00, // [researched]
    stevia_standard: 12.00, // [researched]
    epazote_standard: 5.00, // [researched]
    echinacea_purpurea: 10.00, // [researched]
    ashwagandha_standard: 8.00, // [researched]
    angelica: 16.00,  // Angelica Primary
    anise_hyssop: 16.00,  // Anise Hyssop Primary
    ginseng: 22.00,  // Ginseng Primary
    goldenseal: 22.00,  // Goldenseal Primary
    hyssop: 19.25,  // Hyssop Primary
    mountain_mint: 22.00,  // Mountain Mint Primary
    rue: 22.00,  // Rue Primary
    saffron_crocus: 22.00,  // Saffron Crocus Primary
    salad_burnet: 22.00,  // Salad Burnet Primary
    saltwort: 22.00,  // Saltwort Primary
    savory: 22.00,  // Savory Primary
    shiso: 22.00,  // Shiso Primary
    valerian: 22.00,  // Valerian Primary
    catnip: 22.00,  // Catnip Primary
    mexican_mint_marigold: 22.00,  // Mexican Mint Marigold Primary
    astragalus: 22.00,  // Astragalus Primary
    marshmallow_root: 11.25,  // Marshmallow Root Primary
    motherwort: 22.00,  // Motherwort Primary
    skullcap: 22.00,  // Skullcap Primary
    comfrey: 4.00,  // Comfrey Primary
    wormwood: 20.00,  // Wormwood Primary
    elecampane: 22.00,  // Elecampane Primary
    milk_thistle: 22.00,  // Milk Thistle Primary
    passionflower: 22.00,  // Passionflower Primary
    tulsi: 22.00,  // Tulsi Primary
    shungiku: 10.50,  // Shungiku Primary
    holy_basil: 16.00,  // Holy Basil Primary
    cinnamon_basil: 13.50,  // Cinnamon Basil Primary
    lime_basil: 9.50,  // Lime Basil Primary
    african_blue_basil: 19.25,  // African Blue Basil Primary
    pineapple_sage: 22.00,  // Pineapple Sage Primary
    clary_sage: 19.25,  // Clary Sage Primary
    black_sage: 22.00,  // Black Sage Primary
    roman_chamomile: 22.00,  // Roman Chamomile Primary
    agastache: 22.00,  // Agastache Primary
    bergamot: 22.00,  // Bergamot Primary
    blue_vervain: 19.25,  // Blue Vervain Primary
    licorice_root: 22.00,  // Licorice Root Primary
    spilanthes: 20.00,  // Spilanthes Primary
    wood_sorrel: 19.25,  // Wood Sorrel Primary
    wood_betony: 22.00,  // Wood Betony Primary
    sweet_cicely: 22.00,  // Sweet Cicely Primary
    ground_elder: 9.50,  // Ground Elder Primary
    nettle: 19.25,  // Nettle Primary
    plantain_herb: 19.25,  // Plantain Herb Primary
    feverfew: 20.00,  // Feverfew Primary
    st_john_s_wort: 22.00,  // St John's Wort Primary
    rhodiola: 22.00,  // Rhodiola Primary
    parsley_moss_curled: 4.00,  // Parsley Moss Curled
    parsley_gigante_d_italia: 4.00,  // Parsley Gigante d'Italia
    parsley_krausa: 4.00,  // Parsley Krausa
    root_parsley_hamburg: 4.00,  // Root Parsley Hamburg
    dill_mammoth_long_island: 4.00,  // Dill Mammoth Long Island
    dill_dukat: 4.00,  // Dill Dukat
    dill_hercules: 4.00,  // Dill Hercules
    florence_fennel_orion: 4.00,  // Florence Fennel Orion
    florence_fennel_zefa_fino: 4.00,  // Florence Fennel Zefa Fino
    florence_fennel_perfection: 4.00,  // Florence Fennel Perfection
    sweet_fennel_standard: 4.00,  // Sweet Fennel Standard
    // ── Nightshade ──────────────────────────────────────────
    tomato_heirloom_beefsteak: 7.50,  // Tomato Heirloom Beefsteak
    cherry_tomato_sungold: 5.00, // [researched]
    pepper_sweet: 6.00,  // Pepper Sweet Bell / Corno di Toro
    pepper_jalapeño: 7.50,  // Jalapeño Classic / Mucho Nacho
    eggplant_ichiban: 6.00,  // Eggplant Ichiban / Nadia
    tomatillo_grande: 4.50,  // Tomatillo Grande / Verde
    ground_cherry_cossack: 8.00,  // Ground Cherry Cossack Pineapple
    hot_pepper_habanero: 8.00,  // Habanero Caribbean Red
    tomato_roma: 2.25,  // Tomato Roma
    tomato_san_marzano: 3.75,  // Tomato San Marzano
    tomato_cherokee_purple: 6.00,  // Heirloom Tomato Cherokee Purple
    tomato_yellow_brandywine: 6.00,  // Heirloom Tomato Yellow Brandywine
    tomato_green_zebra: 6.00,  // Heirloom Tomato Green Zebra
    tomato_black_krim: 6.00,  // Heirloom Tomato Black Krim
    tomato_mortgage_lifter: 5.25,  // Heirloom Tomato Mortgage Lifter
    tomato_celebrity: 2.25,  // Tomato Celebrity
    tomato_early_girl: 3.00,  // Tomato Early Girl
    tomato_yellow_pear: 5.00, // [researched]
    tomato_black_cherry: 5.00, // [researched]
    tomato_juliet: 4.50, // [researched]
    tomato_large_red_cherry: 4.50, // [researched]
    tomato_amish_paste: 3.75,  // Tomato Amish Paste
    pepper_anaheim: 3.00,  // Pepper Anaheim
    pepper_poblano: 3.75,  // Pepper Poblano / Ancho
    pepper_serrano: 4.50,  // Pepper Serrano
    pepper_banana: 3.00,  // Banana Pepper Sweet Banana
    pepper_shishito: 5.00, // [researched]
    pepper_padron: 5.00, // [researched]
    pepper_cayenne: 3.75,  // Cayenne Pepper Long Slim
    pepper_ghost: 8.00,  // Ghost Pepper Bhut Jolokia
    pepper_fresno: 4.50,  // Fresno Pepper Flaming Flare
    pepper_cubanelle: 3.75,  // Cubanelle Pepper Biscayne
    pepper_mini_sweet: 4.00, // [researched]
    pepper_aji_amarillo: 7.50,  // Aji Amarillo Standard
    pepper_chocolate_bell: 5.25,  // Bell Pepper Chocolate / Brown Beauty
    pepper_pepperoncini: 3.75,  // Pepperoncini Golden Greek
    pepper_thai_bird: 7.50,  // Thai Bird Pepper Standard
    eggplant_thai: 4.50,  // Thai Eggplant Kermit / Green Thai
    eggplant_white: 5.25,  // White Eggplant Ghostbuster / Clara
    japanese_eggplant: 5.25,  // Japanese Eggplant Primary
    eggplant_black_beauty: 2.00,  // Eggplant Black Beauty
    eggplant_rosa_bianca: 2.00,  // Eggplant Rosa Bianca
    eggplant_ping_tung_long: 2.00,  // Eggplant Ping Tung Long
    eggplant_fairy_tale: 2.00,  // Eggplant Fairy Tale
    eggplant_little_fingers: 2.00,  // Eggplant Little Fingers
    eggplant_listada_de_gandia: 2.00,  // Eggplant Listada de Gandia
    eggplant_prosperosa: 2.00,  // Eggplant Prosperosa
    // ── Cucurbit ────────────────────────────────────────────
    cucumber_marketmore: 4.00,  // Cucumber Marketmore / Diva
    zucchini_black_beauty: 3.50,  // Zucchini Black Beauty / Costata Romanesco
    summer_squash_pattypan: 4.00,  // Patty Pan Squash Sunburst
    butternut_squash: 3.00,  // Butternut Squash Waltham / Puritan
    kabocha_squash: 4.00,  // Kabocha Squash Sunshine
    delicata_squash: 4.00,  // Delicata Squash Sugar Loaf
    pumpkin_jack: 2.00,  // Pumpkin Jack-O-Lantern / Long Island Cheese
    cantaloupe_ambrosia: 4.00,  // Cantaloupe Ambrosia
    watermelon_sugar_baby: 2.00,  // Watermelon Sugar Baby / Crimson Sweet
    bitter_melon: 4.00,  // Bitter Melon Chinese / Indian
    squash_acorn: 2.00,  // Acorn Squash Table Queen
    squash_red_kuri: 3.00,  // Red Kuri Squash Red Kuri
    squash_sugar_pie_pumpkin: 2.00,  // Sugar Pie Pumpkin New England Pie
    squash_cinderella: 3.00,  // Cinderella Pumpkin Rouge Vif d'Etampes
    squash_blue_hubbard: 1.50,  // Blue Hubbard Baby / Standard
    squash_spaghetti: 2.00,  // Spaghetti Squash Vegetable Spaghetti
    squash_sweet_dumpling: 3.00,  // Sweet Dumpling Squash Standard
    squash_delicata_new: 4.00,  // Delicata Squash Cornell Bush
    squash_butternut_new: 2.00,  // Butternut Squash Métis
    squash_kabocha_new: 3.00,  // Kabocha Squash Cha-cha
    squash_round_zucchini: 4.00,  // Round Zucchini Eight Ball
    squash_yellow_crookneck: 3.00,  // Yellow Crookneck Dixie
    squash_tromboncino: 4.00,  // Tromboncino Zucchetta
    squash_lemon: 4.00,  // Lemon Squash Bush Marrow
    squash_cousa: 4.00,  // Cousa Squash Magda
    cucumber_lemon: 4.00,  // Lemon Cucumber Standard
    cucumber_armenian: 4.00,  // Armenian Cucumber Standard
    cucumber_english: 4.00,  // English Cucumber Tasty Green
    cucumber_persian: 4.00,  // Persian Cucumber Mini
    cucumber_boston_pickling: 4.00,  // Pickling Cucumber Boston Pickling
    cucumber_japanese: 4.00,  // Japanese Cucumber Suyo Long
    cucumber_crystal_apple: 4.00,  // Crystal Apple Cucumber Standard
    melon_honeydew: 2.00,  // Honeydew Melon Honey Drop / Earlidew
    melon_honeydew_orange: 3.00,  // Orange-Flesh Honeydew Orange Delight
    melon_galia: 4.00,  // Galia Melon Arava
    melon_canary: 3.00,  // Canary Melon Juan Canary
    melon_charentais: 4.00,  // Charentais Cantaloupe Standard
    melon_hales_best: 3.00,  // Cantaloupe Hale's Best Jumbo
    watermelon_moon_stars: 2.00,  // Watermelon Moon and Stars
    watermelon_yellow_doll: 3.00,  // Watermelon Yellow Doll (icebox)
    melon_crenshaw: 4.00,  // Crenshaw Melon Standard
    luffa_gourd: 4.00,  // Luffa Gourd Standard
    summer_squash_zephyr: 1.00,  // Summer Squash Zephyr
    summer_squash_early_prolific_straightneck: 1.00,  // Summer Squash Early Prolific Straightneck
    summer_squash_pattypan_sunburst: 1.00,  // Summer Squash Pattypan Sunburst
    summer_squash_pattypan_benning_s_green_tint: 1.00,  // Summer Squash Pattypan Benning's Green Tint
    summer_squash_zucchini_gold_rush: 1.00,  // Summer Squash Zucchini Gold Rush
    summer_squash_zucchini_cocozelle: 1.00,  // Summer Squash Zucchini Cocozelle
    zucchini_raven: 1.00,  // Zucchini Raven
    lebanese_squash_magina: 1.00,  // Lebanese Squash Magina
    hubbard_squash_blue_hubbard: 1.00,  // Hubbard Squash Blue Hubbard
    turban_squash_turk_s_turban: 1.00,  // Turban Squash Turk's Turban
    buttercup_squash_burgess: 1.00,  // Buttercup Squash Burgess
    red_kuri_squash_hokkaido: 1.00,  // Red Kuri Squash Hokkaido
    sweet_dumpling_squash_standard: 1.00,  // Sweet Dumpling Squash Standard
    carnival_squash_standard: 1.00,  // Carnival Squash Standard
    banana_squash_pink_jumbo_banana: 1.00,  // Banana Squash Pink Jumbo Banana
    honeynut_squash_standard: 1.00,  // Honeynut Squash Standard
    acorn_squash_table_king: 1.00,  // Acorn Squash Table King
    winter_squash_marina_di_chioggia: 1.00,  // Winter Squash Marina di Chioggia
    winter_squash_galeux_d_eysines: 1.00,  // Winter Squash Galeux d'Eysines
    winter_squash_queensland_blue: 1.00,  // Winter Squash Queensland Blue
    winter_squash_tetsukabuto: 1.00,  // Winter Squash Tetsukabuto
    winter_squash_crown_prince: 1.00,  // Winter Squash Crown Prince
    winter_squash_black_futsu: 1.00,  // Winter Squash Black Futsu
    pumpkin_howden: 1.00,  // Pumpkin Howden
    pumpkin_lumina: 1.00,  // Pumpkin Lumina
    pumpkin_jarrahdale: 1.00,  // Pumpkin Jarrahdale
    pumpkin_musquee_de_provence: 1.00,  // Pumpkin Musquee de Provence
    pumpkin_atlantic_giant: 1.00,  // Pumpkin Atlantic Giant
    pumpkin_baby_pam: 1.00,  // Pumpkin Baby Pam
    pumpkin_connecticut_field: 1.00,  // Pumpkin Connecticut Field
    pumpkin_baby_boo: 1.00,  // Pumpkin Baby Boo
    watermelon_crimson_sweet: 1.00,  // Watermelon Crimson Sweet
    watermelon_charleston_gray: 1.00,  // Watermelon Charleston Gray
    watermelon_black_diamond: 1.00,  // Watermelon Black Diamond
    watermelon_ali_baba: 1.00,  // Watermelon Ali Baba
    watermelon_jubilee: 1.00,  // Watermelon Jubilee
    cantaloupe_athena: 1.00,  // Cantaloupe Athena
    cantaloupe_hearts_of_gold: 1.00,  // Cantaloupe Hearts of Gold
    honeydew_green_flesh: 1.00,  // Honeydew Green Flesh
    casaba_golden_beauty: 1.00,  // Casaba Golden Beauty
    santa_claus_melon_piel_de_sapo: 1.00,  // Santa Claus Melon Piel de Sapo
    sprite_melon_standard: 1.00,  // Sprite Melon Standard
    kajari_melon_standard: 1.00,  // Kajari Melon Standard
    charentais_melon_savor: 1.00,  // Charentais Melon Savor
    korean_melon_chamoe: 1.00,  // Korean Melon Chamoe
    crane_melon_standard: 1.00,  // Crane Melon Standard
    // ── Specialty ───────────────────────────────────────────
    amaranth_grain: 7.25,  // Amaranth Burgundy / Golden Giant
    quinoa_brightest: 9.00,  // Quinoa Brightest Brilliant
    asparagus_millennium: 5.00, // [researched]
    artichoke_imperial: 4.00, // [researched]
    celery_utah: 5.50,  // Celery Utah 52-70
    okra_clemson: 4.50,  // Okra Clemson Spineless
    rhubarb_victoria: 6.25,  // Rhubarb Victoria
    artichoke_violetto: 4.00, // [researched]
    asparagus_purple: 5.50, // [researched]
    asparagus_mary_washington: 5.00, // [researched]
    ginger_rhizome: 6.00, // [researched]
    turmeric_standard: 7.00, // [researched]
    lemongrass_standard: 5.00, // [researched]
    okra_red: 4.50,  // Okra Red Burgundy
    celery_par_cel: 10.75,  // Cutting Celery Par-Cel
    artichoke: 4.50,  // Artichoke Primary
    cardoon: 8.00,  // Cardoon Primary
    lotus_root: 8.00,  // Lotus Root Primary
    water_chestnut: 9.00,  // Water Chestnut Primary
    wasabi: 12.00,  // Wasabi Primary
    wakame: 12.00,  // Wakame Primary
    // ── Grain ───────────────────────────────────────────────
    corn_sweet_peaches: 3.00,  // Sweet Corn Peaches and Cream
    wheat_hard_red: 1.00,  // Hard Red Wheat Redhawk
    spelt_standard: 2.00,  // Spelt Sirtal
    einkorn_standard: 3.00,  // Einkorn Standard
    barley_hulless: 1.50,  // Hulless Barley Falcon
    oats_naked: 1.50,  // Oats Hull-less / Streaker
    corn_glass_gem: 3.00,  // Flint Corn Glass Gem
    corn_bloody_butcher: 3.00,  // Field Corn Bloody Butcher
    popcorn_robust: 3.00,  // Popcorn Robust / Strawberry
    sorghum_sweet: 2.00,  // Sweet Sorghum Mennonite
    pearl_millet: 1.50,  // Pearl Millet Tifleaf / Standard
    teff_standard: 3.00,  // Teff Standard
    buckwheat_grain: 3.00,  // Buckwheat Manisoba / Manor
    corn_sweet_silver_queen: 2.00,  // Sweet Corn Silver Queen
    sorghum: 0.75,  // Sorghum Primary
    milo: 0.75,  // Milo Primary
    triticale: 0.75,  // Triticale Primary
    winter_rye: 1.00,  // Winter Rye Primary
    winter_wheat: 0.75,  // Winter Wheat Primary
    spring_barley: 0.75,  // Spring Barley Primary
    flax: 1.50,  // Flax Primary
    canola: 0.75,  // Canola Primary
    mustard_seed: 3.00,  // Mustard Seed Primary
    safflower: 1.50,  // Safflower Primary
    // ── Fruit ───────────────────────────────────────────────
    strawberry_seascape: 5.00, // [researched]
    strawberry_alpine: 7.00, // [researched]
    raspberry_everbearing: 8.00, // [researched]
    blackberry_thornless: 6.00, // [researched]
    elderberry_standard: 8.00, // [researched]
    honeyberry_standard: 7.00, // [researched]
    currant_red: 6.00, // [researched]
    currant_black: 6.00, // [researched]
    aronia_chokeberry: 5.00, // [researched]
    goji_berry: 8.00, // [researched]
    blackberry: 6.25,  // Blackberry Primary
    blueberry: 8.00,  // Blueberry Primary
    gooseberry: 10.75,  // Gooseberry Primary
    jostaberry: 12.00,  // Jostaberry Primary
    sea_buckthorn: 12.00,  // Sea Buckthorn Primary
    currant: 12.00,  // Currant Primary
    fig: 8.00,  // Fig Primary
    persimmon: 5.00,  // Persimmon Primary
    pawpaw: 12.00,  // Pawpaw Primary
    mulberry: 12.00,  // Mulberry Primary
    quince: 8.00,  // Quince Primary
    medlar: 12.00,  // Medlar Primary
    hardy_kiwi: 12.00,  // Hardy Kiwi Primary
    honeyberry: 12.00,  // Honeyberry Primary
    lingonberry: 12.00,  // Lingonberry Primary
    huckleberry: 12.00,  // Huckleberry Primary
    serviceberry: 11.75,  // Serviceberry Primary
    nanking_cherry: 8.00,  // Nanking Cherry Primary
    beach_plum: 7.25,  // Beach Plum Primary
    autumn_olive: 8.00,  // Autumn Olive Primary
    juneberry: 6.25,  // Juneberry Primary
    cornelian_cherry: 12.00,  // Cornelian Cherry Primary
    wolfberry: 12.00,  // Wolfberry Primary
};

// ─── Category fallbacks (used when cropId not in CROP_RETAIL_PRICES) ───────────
const CATEGORY_RETAIL = {
    Greens: 3.00, Brassica: 2.50, Root: 1.50, Tuber: 1.00, Allium: 1.75,
    Legume: 3.00, Herb: 8.00, Nightshade: 2.75, Cucurbit: 1.50,
    Specialty: 3.00, Grain: 1.00, Fruit: 4.00,
    'Cover Crop': null, Flower: null,
};

// ─── Regional price multipliers ──────────────────────────────────────────────
// Applied on top of national-average prices to reflect local cost of produce.
// Sources: USDA AMS regional price spreads, BLS Consumer Price Index regional data.
const REGIONAL_MULTIPLIERS = {
    'Pacific Northwest': 1.15,  // WA, OR, ID — local specialty/organic premium
    'California':        1.25,  // CA — high cost of living, labor, water
    'Southwest':         1.02,  // AZ, NM, NV, UT, CO
    'Mountain':          0.95,  // MT, WY, ND, SD, NE, KS
    'Midwest':           0.88,  // IL, IN, OH, MI, WI, MN, IA, MO
    'Southeast':         0.85,  // FL, GA, AL, MS, LA, SC, NC, AR, TN
    'Mid-Atlantic':      1.20,  // NY, NJ, PA, MD, DE, VA, DC
    'New England':       1.22,  // MA, CT, RI, VT, NH, ME
    'Texas':             0.90,  // TX, OK
    'Hawaii':            1.40,  // HI — highest food prices in US
    'Alaska':            1.45,  // AK — remote logistics premium
    'National':          1.00,  // default / unknown
};

// ─── State code → USDA region ────────────────────────────────────────────────
const STATE_REGION = {
    WA:'Pacific Northwest', OR:'Pacific Northwest', ID:'Pacific Northwest',
    CA:'California',
    AZ:'Southwest', NM:'Southwest', NV:'Southwest', UT:'Southwest', CO:'Southwest',
    MT:'Mountain', WY:'Mountain', ND:'Mountain', SD:'Mountain', NE:'Mountain', KS:'Mountain',
    IL:'Midwest', IN:'Midwest', OH:'Midwest', MI:'Midwest',
    WI:'Midwest', MN:'Midwest', IA:'Midwest', MO:'Midwest',
    FL:'Southeast', GA:'Southeast', AL:'Southeast', MS:'Southeast',
    LA:'Southeast', SC:'Southeast', NC:'Southeast', AR:'Southeast', TN:'Southeast',
    KY:'Southeast', WV:'Southeast',
    NY:'Mid-Atlantic', NJ:'Mid-Atlantic', PA:'Mid-Atlantic',
    MD:'Mid-Atlantic', DE:'Mid-Atlantic', VA:'Mid-Atlantic', DC:'Mid-Atlantic',
    MA:'New England', CT:'New England', RI:'New England',
    VT:'New England', NH:'New England', ME:'New England',
    TX:'Texas', OK:'Texas',
    HI:'Hawaii', AK:'Alaska',
    // Remaining states default to Mountain/National
};

// ─── 3-digit zip prefix → state code ─────────────────────────────────────────
// Covers all USPS zip prefix ranges. Source: USPS zip range assignments.
const ZIP_PREFIX_STATE = {
    '005':'MA','006':'MA','007':'MA','008':'MA','009':'MA',
    '010':'MA','011':'MA','012':'MA','013':'MA','014':'MA','015':'MA','016':'MA','017':'MA','018':'MA','019':'MA',
    '020':'MA','021':'MA','022':'MA','023':'MA','024':'MA','025':'MA','026':'MA','027':'MA',
    '028':'RI','029':'RI',
    '030':'NH','031':'NH','032':'NH','033':'NH','034':'NH','035':'NH','036':'NH','037':'NH','038':'NH',
    '039':'ME','040':'ME','041':'ME','042':'ME','043':'ME','044':'ME','045':'ME','046':'ME','047':'ME','048':'ME','049':'ME',
    '050':'VT','051':'VT','052':'VT','053':'VT','054':'VT','056':'VT','057':'VT','058':'VT','059':'VT',
    '060':'CT','061':'CT','062':'CT','063':'CT','064':'CT','065':'CT','066':'CT','067':'CT','068':'CT','069':'CT',
    '070':'NJ','071':'NJ','072':'NJ','073':'NJ','074':'NJ','075':'NJ','076':'NJ','077':'NJ','078':'NJ','079':'NJ',
    '080':'NJ','081':'NJ','082':'NJ','083':'NJ','084':'NJ','085':'NJ','086':'NJ','087':'NJ','088':'NJ','089':'NJ',
    '100':'NY','101':'NY','102':'NY','103':'NY','104':'NY','105':'NY','106':'NY','107':'NY','108':'NY','109':'NY',
    '110':'NY','111':'NY','112':'NY','113':'NY','114':'NY','115':'NY','116':'NY','117':'NY','118':'NY','119':'NY',
    '120':'NY','121':'NY','122':'NY','123':'NY','124':'NY','125':'NY','126':'NY','127':'NY','128':'NY','129':'NY',
    '130':'NY','131':'NY','132':'NY','133':'NY','134':'NY','135':'NY','136':'NY','137':'NY','138':'NY','139':'NY',
    '140':'NY','141':'NY','142':'NY','143':'NY','144':'NY','145':'NY','146':'NY','147':'NY','148':'NY','149':'NY',
    '150':'PA','151':'PA','152':'PA','153':'PA','154':'PA','155':'PA','156':'PA','157':'PA','158':'PA','159':'PA',
    '160':'PA','161':'PA','162':'PA','163':'PA','164':'PA','165':'PA','166':'PA','167':'PA','168':'PA','169':'PA',
    '170':'PA','171':'PA','172':'PA','173':'PA','174':'PA','175':'PA','176':'PA','177':'PA','178':'PA','179':'PA',
    '180':'PA','181':'PA','182':'PA','183':'PA','184':'PA','185':'PA','186':'PA','187':'PA','188':'PA','189':'PA',
    '190':'PA','191':'PA','192':'PA','193':'PA','194':'PA','195':'PA','196':'PA',
    '197':'DE','198':'DE','199':'DE',
    '200':'DC','201':'VA','202':'DC','203':'DC','204':'DC','205':'DC',
    '206':'MD','207':'MD','208':'MD','209':'MD','210':'MD','211':'MD','212':'MD','214':'MD','215':'MD','216':'MD','217':'MD','218':'MD','219':'MD',
    '220':'VA','221':'VA','222':'VA','223':'VA','224':'VA','225':'VA','226':'VA','227':'VA','228':'VA','229':'VA',
    '230':'VA','231':'VA','232':'VA','233':'VA','234':'VA','235':'VA','236':'VA','237':'VA','238':'VA','239':'VA',
    '240':'VA','241':'VA','242':'VA','243':'VA','244':'VA','245':'VA','246':'VA',
    '247':'WV','248':'WV','249':'WV','250':'WV','251':'WV','252':'WV','253':'WV','254':'WV','255':'WV','256':'WV','257':'WV','258':'WV','259':'WV',
    '260':'WV','261':'WV','262':'WV','263':'WV','264':'WV','265':'WV','266':'WV','267':'WV','268':'WV',
    '270':'NC','271':'NC','272':'NC','273':'NC','274':'NC','275':'NC','276':'NC','277':'NC','278':'NC','279':'NC',
    '280':'NC','281':'NC','282':'NC','283':'NC','284':'NC','285':'NC','286':'NC','287':'NC','288':'NC','289':'NC',
    '290':'SC','291':'SC','292':'SC','293':'SC','294':'SC','295':'SC','296':'SC','297':'SC','298':'SC','299':'SC',
    '300':'GA','301':'GA','302':'GA','303':'GA','304':'GA','305':'GA','306':'GA','307':'GA','308':'GA','309':'GA',
    '310':'GA','311':'GA','312':'GA','313':'GA','314':'GA','315':'GA','316':'GA','317':'GA','318':'GA','319':'GA',
    '320':'FL','321':'FL','322':'FL','323':'FL','324':'FL','325':'FL','326':'FL','327':'FL','328':'FL','329':'FL',
    '330':'FL','331':'FL','332':'FL','333':'FL','334':'FL','335':'FL','336':'FL','337':'FL','338':'FL',
    '339':'FL','340':'FL','341':'FL','342':'FL','344':'FL','346':'FL','347':'FL','349':'FL',
    '350':'AL','351':'AL','352':'AL','354':'AL','355':'AL','356':'AL','357':'AL','358':'AL','359':'AL',
    '360':'AL','361':'AL','362':'AL','363':'AL','364':'AL','365':'AL','366':'AL','367':'AL','368':'AL','369':'AL',
    '370':'TN','371':'TN','372':'TN','373':'TN','374':'TN','375':'TN','376':'TN','377':'TN','378':'TN','379':'TN',
    '380':'TN','381':'TN','382':'TN','383':'TN','384':'TN','385':'TN',
    '386':'MS','387':'MS','388':'MS','389':'MS','390':'MS','391':'MS','392':'MS','393':'MS','394':'MS','395':'MS','396':'MS','397':'MS',
    '398':'GA','399':'GA',
    '400':'KY','401':'KY','402':'KY','403':'KY','404':'KY','405':'KY','406':'KY','407':'KY','408':'KY','409':'KY',
    '410':'KY','411':'KY','412':'KY','413':'KY','414':'KY','415':'KY','416':'KY','417':'KY','418':'KY',
    '420':'KY','421':'KY','422':'KY','423':'KY','424':'KY','425':'KY','426':'KY','427':'KY',
    '430':'OH','431':'OH','432':'OH','433':'OH','434':'OH','435':'OH','436':'OH','437':'OH','438':'OH','439':'OH',
    '440':'OH','441':'OH','442':'OH','443':'OH','444':'OH','445':'OH','446':'OH','447':'OH','448':'OH','449':'OH',
    '450':'OH','451':'OH','452':'OH','453':'OH','454':'OH','455':'OH','456':'OH','457':'OH','458':'OH',
    '460':'IN','461':'IN','462':'IN','463':'IN','464':'IN','465':'IN','466':'IN','467':'IN','468':'IN','469':'IN',
    '470':'IN','471':'IN','472':'IN','473':'IN','474':'IN','475':'IN','476':'IN','477':'IN','478':'IN','479':'IN',
    '480':'MI','481':'MI','482':'MI','483':'MI','484':'MI','485':'MI','486':'MI','487':'MI','488':'MI','489':'MI',
    '490':'MI','491':'MI','492':'MI','493':'MI','494':'MI','495':'MI','496':'MI','497':'MI','498':'MI','499':'MI',
    '500':'IA','501':'IA','502':'IA','503':'IA','504':'IA','505':'IA','506':'IA','507':'IA','508':'IA','509':'IA',
    '510':'IA','511':'IA','512':'IA','513':'IA','514':'IA','515':'IA','516':'IA',
    '520':'IA','521':'IA','522':'IA','523':'IA','524':'IA','525':'IA','526':'IA','527':'IA','528':'IA',
    '530':'WI','531':'WI','532':'WI','534':'WI','535':'WI','537':'WI','538':'WI','539':'WI',
    '540':'WI','541':'WI','542':'WI','543':'WI','544':'WI','545':'WI','546':'WI','547':'WI','548':'WI','549':'WI',
    '550':'MN','551':'MN','553':'MN','554':'MN','555':'MN','556':'MN','557':'MN','558':'MN','559':'MN',
    '560':'MN','561':'MN','562':'MN','563':'MN','564':'MN','565':'MN','566':'MN','567':'MN',
    '570':'SD','571':'SD','572':'SD','573':'SD','574':'SD','575':'SD','576':'SD','577':'SD',
    '580':'ND','581':'ND','582':'ND','583':'ND','584':'ND','585':'ND','586':'ND','587':'ND','588':'ND',
    '590':'MT','591':'MT','592':'MT','593':'MT','594':'MT','595':'MT','596':'MT','597':'MT','598':'MT','599':'MT',
    '600':'IL','601':'IL','602':'IL','603':'IL','604':'IL','605':'IL','606':'IL','607':'IL','608':'IL','609':'IL',
    '610':'IL','611':'IL','612':'IL','613':'IL','614':'IL','615':'IL','616':'IL','617':'IL','618':'IL','619':'IL',
    '620':'IL','622':'IL','623':'IL','624':'IL','625':'IL','626':'IL','627':'IL','628':'IL','629':'IL',
    '630':'MO','631':'MO','633':'MO','634':'MO','635':'MO','636':'MO','637':'MO','638':'MO','639':'MO',
    '640':'MO','641':'MO','644':'MO','645':'MO','646':'MO','647':'MO','648':'MO',
    '650':'MO','651':'MO','652':'MO','653':'MO','654':'MO','655':'MO','656':'MO','657':'MO','658':'MO',
    '660':'KS','661':'KS','662':'KS','664':'KS','665':'KS','666':'KS','667':'KS','668':'KS','669':'KS',
    '670':'KS','671':'KS','672':'KS','673':'KS','674':'KS','675':'KS','676':'KS','677':'KS','678':'KS','679':'KS',
    '680':'NE','681':'NE','683':'NE','684':'NE','685':'NE','686':'NE','687':'NE','688':'NE','689':'NE',
    '690':'NE','691':'NE','692':'NE','693':'NE',
    '700':'LA','701':'LA','703':'LA','704':'LA','705':'LA','706':'LA','707':'LA','708':'LA',
    '710':'LA','711':'LA','712':'LA','713':'LA','714':'LA',
    '716':'AR','717':'AR','718':'AR','719':'AR','720':'AR','721':'AR','722':'AR','723':'AR','724':'AR','725':'AR','726':'AR','727':'AR','728':'AR','729':'AR',
    '730':'OK','731':'OK','734':'OK','735':'OK','736':'OK','737':'OK','738':'OK','739':'OK',
    '740':'OK','741':'OK','743':'OK','744':'OK','745':'OK','746':'OK','747':'OK','748':'OK','749':'OK',
    '750':'TX','751':'TX','752':'TX','753':'TX','754':'TX','755':'TX','756':'TX','757':'TX','758':'TX','759':'TX',
    '760':'TX','761':'TX','762':'TX','763':'TX','764':'TX','765':'TX','766':'TX','767':'TX','768':'TX','769':'TX',
    '770':'TX','771':'TX','772':'TX','773':'TX','774':'TX','775':'TX','776':'TX','777':'TX','778':'TX','779':'TX',
    '780':'TX','781':'TX','782':'TX','783':'TX','784':'TX','785':'TX','786':'TX','787':'TX','788':'TX','789':'TX',
    '790':'TX','791':'TX','792':'TX','793':'TX','794':'TX','795':'TX','796':'TX','797':'TX','798':'TX','799':'TX',
    '800':'CO','801':'CO','802':'CO','803':'CO','804':'CO','805':'CO','806':'CO','807':'CO','808':'CO','809':'CO',
    '810':'CO','811':'CO','812':'CO','813':'CO','814':'CO','815':'CO','816':'CO',
    '820':'WY','821':'WY','822':'WY','823':'WY','824':'WY','825':'WY','826':'WY','827':'WY','828':'WY','829':'WY',
    '830':'ID','831':'ID','832':'ID','833':'ID','834':'ID','835':'ID','836':'ID','837':'ID','838':'ID',
    '840':'UT','841':'UT','842':'UT','843':'UT','844':'UT','845':'UT','846':'UT','847':'UT',
    '850':'AZ','851':'AZ','852':'AZ','853':'AZ','855':'AZ','856':'AZ','857':'AZ','859':'AZ',
    '860':'AZ','863':'AZ','864':'AZ','865':'AZ',
    '870':'NM','871':'NM','872':'NM','873':'NM','874':'NM','875':'NM','877':'NM','878':'NM','879':'NM',
    '880':'NM','881':'NM','882':'NM','883':'NM','884':'NM',
    '889':'NV','890':'NV','891':'NV','893':'NV','894':'NV','895':'NV','896':'NV','897':'NV','898':'NV',
    '900':'CA','901':'CA','902':'CA','903':'CA','904':'CA','905':'CA','906':'CA','907':'CA','908':'CA',
    '910':'CA','911':'CA','912':'CA','913':'CA','914':'CA','915':'CA','916':'CA','917':'CA','918':'CA','919':'CA',
    '920':'CA','921':'CA','922':'CA','923':'CA','924':'CA','925':'CA','926':'CA','927':'CA','928':'CA',
    '930':'CA','931':'CA','932':'CA','933':'CA','934':'CA','935':'CA','936':'CA','937':'CA','938':'CA','939':'CA',
    '940':'CA','941':'CA','942':'CA','943':'CA','944':'CA','945':'CA','946':'CA','947':'CA','948':'CA','949':'CA',
    '950':'CA','951':'CA','952':'CA','953':'CA','954':'CA','955':'CA','956':'CA','957':'CA','958':'CA','959':'CA',
    '960':'CA','961':'CA',
    '967':'HI','968':'HI',
    '970':'OR','971':'OR','972':'OR','973':'OR','974':'OR','975':'OR','976':'OR','977':'OR','978':'OR','979':'OR',
    '980':'WA','981':'WA','982':'WA','983':'WA','984':'WA','985':'WA','986':'WA','988':'WA','989':'WA',
    '990':'WA','991':'WA','992':'WA','993':'WA','994':'WA',
    '995':'AK','996':'AK','997':'AK','998':'AK','999':'AK',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the regional cost-of-living multiplier for a given zip code.
 * Returns 1.00 (no adjustment) if zip is unknown or not provided.
 */
export function getRegionalMultiplier(zipCode) {
    if (!zipCode) return 1.00;
    const prefix = String(zipCode).trim().substring(0, 3).padStart(3, '0');
    const state = ZIP_PREFIX_STATE[`'${prefix}'`] ?? ZIP_PREFIX_STATE[prefix];
    if (!state) return 1.00;
    const region = STATE_REGION[state];
    if (!region) return 1.00;
    return REGIONAL_MULTIPLIERS[region] ?? 1.00;
}

/**
 * Get estimated retail price per lb for a crop, adjusted for region.
 *
 * @param {string} cropId    — crops.json id
 * @param {string} category  — crop category (used as fallback)
 * @param {string} [zipCode] — user's zip code for regional adjustment
 * @returns {number|null}    — estimated retail $/lb, or null for flowers/cover crops
 */
export function getRetailPrice(cropId, category, zipCode) {
    // Flowers and cover crops don't have a weight-based retail price
    if (category === 'Flower' || category === 'Cover Crop') return null;

    const basePrice = CROP_RETAIL_PRICES[cropId]
        ?? CATEGORY_RETAIL[category]
        ?? 2.00;  // absolute fallback

    const multiplier = getRegionalMultiplier(zipCode);
    // Round to nearest $0.25 for clean display
    const adjusted = basePrice * multiplier;
    return Math.round(adjusted * 4) / 4;
}

/**
 * Returns the name of the USDA region for a given zip code.
 * Useful for displaying to the user.
 */
export function getRegionName(zipCode) {
    if (!zipCode) return 'National';
    const prefix = String(zipCode).trim().substring(0, 3).padStart(3, '0');
    const state = ZIP_PREFIX_STATE[`'${prefix}'`] ?? ZIP_PREFIX_STATE[prefix];
    if (!state) return 'National';
    return STATE_REGION[state] ?? 'National';
}
