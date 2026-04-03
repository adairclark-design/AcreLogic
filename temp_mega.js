/**
 * MegaMenuBar.js
 * ══════════════
 * Johnny Seeds-style mega menu for crop category navigation.
 * - Hover (web) or tap (mobile) a top-level tab to open the panel
 * - Panel shows subcategories as clickable chips
 * - Calls onFilterChange({ label, filterFn }) when selection changes
 * - "All" resets to show every crop
 */

import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, Platform, Animated, Pressable,
} from 'react-native';


// ─── Taxonomy ─────────────────────────────────────────────────────────────────
// Each top-level entry has: label, emoji, subcategories[]
// Each subcategory has: label, filter(crop) → bool
const MEGA_CATEGORIES = [
    // ── All ───────────────────────────────────────────────────────────────────
    {
        label: 'All',
        emoji: '🌱',
        subcategories: [],
        filter: () => true,
    },

    // ── Leafy & Salad (was buried inside "Vegetables") ────────────────────────
    {
        label: 'Leafy & Salad',
        emoji: '🥬',
        subcategories: [
            { label: 'Lettuce',              filter: c => c.id.startsWith('lettuce_') },
            { label: 'Spinach & Chard',      filter: c => ['spinach_space','chard','chard_rainbow','perpetual_spinach','new_zealand_spinach','malabar_spinach'].includes(c.id) },
            { label: 'Chicory & Endive',     filter: c => ['belgian_endive','radicchio_rossa','fris_e','chicory_catalogna','endive_frisee'].includes(c.id) },
            { label: 'Wild & Specialty',     filter: c => ['sorrel_french','mache_vit','amaranth_greens','orach_red','purslane_golden','watercress_standard','claytonia','glasswort','sea_purslane','good_king_henry','agretti','dandelion_greens','celtuce','samphire'].includes(c.id) },
        ],
        filter: c => c.category === 'Greens',
    },

    // ── Brassicas ─────────────────────────────────────────────────────────────
    {
        label: 'Brassicas',
        emoji: '🥦',
        subcategories: [
            { label: 'Broccoli',             filter: c => c.id.startsWith('broccoli_') || c.id === 'nine_star_broccoli' || c.id === 'romanesco' || c.id === 'gai_lan' },
            { label: 'Cabbage',              filter: c => c.id.startsWith('cabbage_') || c.id.includes('cabbage') },
            { label: 'Kale & Collards',      filter: c => c.id.includes('kale') || c.id.includes('collard') || c.id === 'kalettes' || c.id === 'tyfon' },
            { label: 'Cauliflower',          filter: c => c.id.startsWith('cauliflower_') },
            { label: 'Kohlrabi',             filter: c => c.id.includes('kohlrabi') },
            { label: 'Brussels Sprouts',     filter: c => c.id === 'brussels_sprouts' },
            { label: 'Asian Greens & Choys', filter: c => c.subcategory === 'Asian Greens' || c.id.startsWith('pak_choi') || c.id.startsWith('pac_choi') || c.id.includes('tatsoi') || c.id.includes('bok_choy') || c.id === 'yu_choy' || c.id.includes('chinese_cabbage') || ['komatsuna','mizuna_standard','asian_mix'].includes(c.id) },
            { label: 'Forage & Cover',       filter: c => c.id === 'forage_rape' },
        ],
        filter: c => c.category === 'Brassica',
    },

    // ── Roots & Tubers ────────────────────────────────────────────────────────
    {
        label: 'Roots & Tubers',
        emoji: '🥕',
        subcategories: [
            { label: 'Carrots & Parsnips',   filter: c => c.id.startsWith('carrot_') || c.id.startsWith('carrots_') || c.id.startsWith('parsnip_') },
            { label: 'Beets',                filter: c => c.id.startsWith('beet_') },
            { label: 'Potatoes',             filter: c => ['potato_red_norland','potato_russet','potato_purple_majesty','potato_fingerling','potato_german_butterball'].includes(c.id) },
            { label: 'Sweet Potato',         filter: c => c.id.includes('sweet_potato') },
            { label: 'Turnips & Radishes',   filter: c => ['radish_french_breakfast','black_radish','watermelon_radish','turnip_purple_top','turnip_hakurei','daikon_miyashige','purple_daikon','rutabaga_laurentian','swede'].includes(c.id) },
            { label: 'Unusual Roots',        filter: c => ['salsify_mammoth','scorzonera_standard','skirret','arracacha','parsley_root','burdock_gobo','celeriac_monarch','horseradish_standard','maca','sunchoke_stampede'].includes(c.id) },
            { label: 'Exotic Tubers',        filter: c => ['yacon','oca_standard','ulluco','mashua','taro_standard','tiger_nut','jicama_standard'].includes(c.id) },
        ],
        filter: c => c.category === 'Root' || c.category === 'Tuber',
    },

    // ── Alliums ───────────────────────────────────────────────────────────────
    {
        label: 'Alliums',
        emoji: '🧅',
        subcategories: [
            { label: 'Onions',               filter: c => c.id.includes('onion') || c.id.includes('shallot') },
            { label: 'Garlic',               filter: c => c.id.includes('garlic') },
            { label: 'Leeks & Chives',       filter: c => c.id.includes('leek') || c.id.includes('chive') },
        ],
        filter: c => c.category === 'Allium',
    },

    // ── Tomatoes ─────────────────────────────────────────────────────────────
    {
        label: 'Tomatoes',
        emoji: '🍅',
        subcategories: [
            { label: 'Slicing Tomatoes',     filter: c => ['tomato_celebrity','tomato_early_girl'].includes(c.id) },
            { label: 'Cherry & Grape',       filter: c => ['cherry_tomato_sungold','tomato_yellow_pear','tomato_black_cherry','tomato_juliet','tomato_large_red_cherry'].includes(c.id) },
            { label: 'Heirloom',             filter: c => ['tomato_cherokee_purple','tomato_yellow_brandywine','tomato_green_zebra','tomato_black_krim','tomato_mortgage_lifter','tomato_heirloom_beefsteak'].includes(c.id) },
            { label: 'Paste & Sauce',        filter: c => ['tomato_roma','tomato_san_marzano','tomato_amish_paste'].includes(c.id) },
            { label: 'Tomatillos & Ground Cherry', filter: c => ['tomatillo_grande','ground_cherry_cossack','husk_cherry'].includes(c.id) },
        ],
        filter: c => c.category === 'Nightshade' && !c.id.startsWith('pepper_') && !c.id.startsWith('hot_pepper_') && !c.id.includes('eggplant') && c.id !== 'japanese_eggplant',
    },

    // ── Peppers ───────────────────────────────────────────────────────────────
    {
        label: 'Peppers',
        emoji: '🌶️',
        subcategories: [
            { label: 'Sweet Peppers',        filter: c => ['pepper_sweet','pepper_banana','pepper_shishito','pepper_padron','pepper_cubanelle','pepper_mini_sweet','pepper_chocolate_bell','pepper_pepperoncini'].includes(c.id) },
            { label: 'Mild / Roasting',      filter: c => ['pepper_anaheim','pepper_poblano','pepper_aji_amarillo'].includes(c.id) },
            { label: 'Hot Peppers',          filter: c => ['pepper_jalapeño','hot_pepper_habanero','pepper_serrano','pepper_cayenne','pepper_ghost','pepper_fresno','pepper_thai_bird'].includes(c.id) },
        ],
        filter: c => c.category === 'Nightshade' && (c.id.startsWith('pepper_') || c.id.startsWith('hot_pepper_')),
    },

    // ── Eggplant (own tab — no longer buried in Tomatoes & Peppers) ───────────
    {
        label: 'Eggplant',
        emoji: '🍆',
        subcategories: [
            { label: 'Asian Eggplant',       filter: c => ['eggplant_ichiban','eggplant_thai','japanese_eggplant','eggplant_ping_tung_long','eggplant_little_fingers'].includes(c.id) },
            { label: 'Italian & Heritage',   filter: c => ['eggplant_white','eggplant_rosa_bianca','eggplant_listada_de_gandia','eggplant_prosperosa','eggplant_fairy_tale'].includes(c.id) },
            { label: 'Standard Varieties',   filter: c => c.id === 'eggplant_black_beauty' },
        ],
        filter: c => c.category === 'Nightshade' && (c.id.includes('eggplant') || c.id === 'japanese_eggplant'),
    },

    // ── Cucurbits ─────────────────────────────────────────────────────────────
    {
        label: 'Cucurbits',
        emoji: '🥒',
        subcategories: [
            { label: 'Cucumbers',            filter: c => c.id.startsWith('cucumber_') },
            { label: 'Zucchini',             filter: c => c.id.startsWith('zucchini_') || c.id.includes('round_zucchini') || c.id.includes('tromboncino') || c.id.includes('cousa') },
            { label: 'Summer Squash',        filter: c => c.id.includes('pattypan') || c.id.includes('crookneck') || (c.id.includes('squash_lemon') && !c.id.startsWith('cucumber')) },
            { label: 'Winter Squash',        filter: c => c.category === 'Cucurbit' && (c.id.includes('butternut') || c.id.includes('kabocha') || c.id.includes('delicata') || c.id.includes('acorn') || c.id.includes('kuri') || c.id.includes('hubbard') || c.id.includes('spaghetti') || c.id.includes('dumpling') || c.id.includes('marina') || c.id.includes('galeux') || c.id.includes('queensland') || c.id.includes('tetsukabuto') || c.id.includes('crown_prince') || c.id.includes('black_futsu')) && !c.id.includes('pumpkin') },
            { label: 'Pumpkins',             filter: c => c.id.includes('pumpkin') || c.id === 'squash_cinderella' },
            { label: 'Muskmelons/ Honeydews', filter: c => (c.id.startsWith('melon_') || c.id.includes('cantaloupe') || c.id.includes('honeydew') || c.id.includes('crenshaw') || c.id.includes('galia') || c.id.includes('charentais') || c.id.includes('canary')) && !c.id.includes('watermelon') },
            { label: 'Watermelons',          filter: c => c.id.startsWith('watermelon_') && c.category === 'Cucurbit' },
            { label: 'Gourds & Luffa',       filter: c => ['luffa_gourd','bitter_melon'].includes(c.id) || c.id.includes('gourd') },
        ],
        filter: c => c.category === 'Cucurbit',
    },

    // ── Legumes ───────────────────────────────────────────────────────────────
    {
        label: 'Legumes',
        emoji: '🫘',
        subcategories: [
            { label: 'Bush Beans',           filter: c => c.category === 'Legume' && (c.id.includes('bush') || ['beans_green_bush','bean_haricot_vert','bean_yellow_wax','bean_purple_wax','bean_dragon_tongue'].includes(c.id)) },
            { label: 'Pole & Runner Beans',  filter: c => c.category === 'Legume' && (c.id.startsWith('bean_pole') || c.id.includes('runner_bean') || c.id.includes('scarlet_runner') || c.id.includes('yard_long') || c.id.includes('hyacinth')) },
            { label: 'Dry & Shell Beans',    filter: c => c.category === 'Legume' && (c.id.startsWith('bean_black') || c.id.startsWith('bean_pinto') || c.id.startsWith('bean_kidney') || c.id.startsWith('bean_cannellini') || c.id.startsWith('bean_navy') || ['tepary_bean','adzuki_bean','fava_beans','fababean','mung_bean','lupin'].includes(c.id)) },
            { label: 'Lima Beans',           filter: c => c.id.includes('lima') },
            { label: 'Peas',                 filter: c => c.category === 'Legume' && (c.id.includes('pea') || c.id.includes('snap_pea') || c.id.includes('snow_pea') || c.id.includes('field_pea') || c.id === 'field_peas') && !c.id.includes('chickpea') && !c.id.includes('cowpea') },
            { label: 'Field & Cowpeas',      filter: c => c.category === 'Legume' && (c.id.includes('cowpea') || c.id === 'field_peas' || c.id.includes('black_eyed_pea') || c.id.includes('purple_hull') || c.id.includes('pigeon_pea')) },
            { label: 'Edamame & Soybeans',   filter: c => c.id.includes('edamame') || c.id.includes('soybean') || c.id === 'soybeans_midori' },
            { label: 'Lentils & Chickpeas',  filter: c => c.id.includes('chickpea') || c.id.includes('lentil') },
        ],
        filter: c => c.category === 'Legume',
    },

    // ── Herbs ─────────────────────────────────────────────────────────────────
    {
        label: 'Herbs',
        emoji: '🌿',
        subcategories: [
            { label: 'Basil',                filter: c => c.id.includes('basil') },
            { label: 'Mint',                 filter: c => c.id.startsWith('mint_') || ['lemon_balm','lemon_verbena','korean_mint','mountain_mint'].includes(c.id) },
            { label: 'Cilantro & Parsley',   filter: c => c.id.includes('cilantro') || c.id.includes('parsley') || ['culantro','vietnamese_coriander'].includes(c.id) },
            { label: 'Mediterranean',        filter: c => c.id.includes('thyme') || c.id.includes('oregano') || c.id.includes('sage_') || c.id.includes('rosemary') || c.id.includes('tarragon') || c.id.includes('marjoram') || c.id.includes('savory') },
            { label: 'Dill, Fennel & Anise', filter: c => c.id.includes('dill') || c.id.includes('fennel') || ['chervil_curled','caraway_standard','anise_hyssop'].includes(c.id) },
            { label: 'Medicinal',            filter: c => ['lavender_hidcote','chamomile_german','echinacea_purpurea','ashwagandha_standard','valerian','st_johns_wort','skullcap','milk_thistle','motherwort','comfrey','nettle','goldenseal','ginseng','astragalus','rhodiola','elecampane','feverfew','wood_betony','passionflower','spilanthes','blue_vervain'].includes(c.id) },
            { label: 'Specialty Herbs',      filter: c => ['fenugreek_standard','borage_standard','lovage_standard','stevia_standard','epazote_standard','shiso_standard','shungiku_standard','salad_burnet','sweet_cicely','wormwood','rue_standard','licorice_root'].includes(c.id) },
        ],
        filter: c => c.category === 'Herb',
    },

    // ── Flowers ───────────────────────────────────────────────────────────────
    {
        label: 'Flowers',
        emoji: '🌸',
        subcategories: [
            { label: 'Sunflowers',           filter: c => ['sunflower_holiday','mexican_sunflower','rudbeckia_standard'].includes(c.id) },
            { label: 'Zinnias',              filter: c => c.id.startsWith('zinnia_') },
            { label: 'Dahlias & Ranunculus', filter: c => ['dahlia_dinner_plate','ranunculus_standard','anemone_standard'].includes(c.id) },
            { label: 'Calendula & Marigold', filter: c => ['calendula_erfurter','marigold_french','nasturtium_jewel'].includes(c.id) },
            { label: 'Cosmos',               filter: c => c.id.startsWith('cosmos_') },
            { label: 'Snapdragons & Larkspur', filter: c => ['snapdragon_rocket','larkspur_giant','delphinium_standard','bachelor_button'].includes(c.id) },
            { label: 'Dried & Everlastings', filter: c => ['statice_QIS','statice_sinuata','strawflower_apricot','celosia_cockscomb','celosia_plume','gomphrena','craspedia','xeranthemum','ammobium'].includes(c.id) },
            { label: 'Sweet Pea & Foxglove', filter: c => ['sweet_pea_standard','foxglove_standard','scabiosa_pincushion','lisianthus_echo'].includes(c.id) },
            { label: 'Cottage & Wildflower', filter: c => ['hollyhock','clarkia','agrostemma','cynoglossum','phacelia','saponaria','digitalis'].includes(c.id) },
            { label: 'Specialty Cut',        filter: c => ['bupleurum','orlaya','ammi','eryngium','asclepias','atriplex','crocus','saffron_crocus'].includes(c.id) },
        ],
        filter: c => c.category === 'Flower',
    },

    // ── Fruits & Berries ──────────────────────────────────────────────────────
    {
        label: 'Fruits & Berries',
        emoji: '🍓',
        subcategories: [
            { label: 'Strawberries',         filter: c => c.id.startsWith('strawberry_') || c.id.includes('strawberry') },
            { label: 'Wild & Native',        filter: c => ['serviceberry','wolfberry','autumn_olive'].includes(c.id) },
        ],
        filter: c => c.category === 'Fruit',
    },

    // ── Fruit Trees ───────────────────────────────────────────────────────────
    {
        label: 'Fruit Trees',
        emoji: '🌳',
        subcategories: [
            { label: 'Apples',          filter: c => c.id.startsWith('apple_') },
            { label: 'Pears & Quince',  filter: c => c.id.startsWith('pear_') || c.id.startsWith('quince_') },
            { label: 'Peaches & Nectarines', filter: c => c.id.startsWith('peach_') || c.id.startsWith('nectarine_') },
            { label: 'Plums & Apricots', filter: c => c.id.startsWith('plum_') || c.id.startsWith('apricot_') },
            { label: 'Cherries & Pluots', filter: c => c.id.startsWith('cherry_') || c.id.startsWith('pluot_') },
            { label: 'Citrus',          filter: c => ['lemon_eureka','lemon_meyer','orange_navel','orange_valencia','mandarin_satsuma','lime_persian','grapefruit_ruby_red','kumquat_nagami'].includes(c.id) },
            { label: 'Specialty Trees', filter: c => ['fig_brown_turkey','fig_chicago_hardy','persimmon_fuyu','persimmon_hachiya','mulberry_illinois','pawpaw_shenandoah','jujube_li'].includes(c.id) },
            { label: 'Subtropical',     filter: c => ['avocado_hass','mango_tommy_atkins','olive_arbequina','pomegranate_wonderful','loquat_big_jim'].includes(c.id) },
        ],
        filter: c => c.category === 'Fruit Tree',
    },

    // ── Fruiting Shrubs ───────────────────────────────────────────────────────
    {
        label: 'Fruiting Shrubs',
        emoji: '🫐',
        subcategories: [
            { label: 'Blueberries',              filter: c => c.subcategory === 'Blueberry' },
            { label: 'Raspberries',              filter: c => c.subcategory === 'Raspberry' },
            { label: 'Blackberries',             filter: c => c.subcategory === 'Blackberry' },
            { label: 'Hybrid Cane Berries',      filter: c => c.subcategory === 'Hybrid Berry' },
            { label: 'Currants & Gooseberries',  filter: c => c.subcategory === 'Currant' || c.subcategory === 'Gooseberry' },
            { label: 'Elderberries & Honeyberries', filter: c => c.subcategory === 'Elderberry' || c.subcategory === 'Honeyberry' },
            { label: 'Specialty Shrubs',         filter: c => c.subcategory === 'Specialty Shrub' },
        ],
        filter: c => c.category === 'Fruiting Shrub',
    },

    // ── Grains & Corn (+ Quinoa moved here from Specialty) ────────────────────
    {
        label: 'Grains & Corn',
        emoji: '🌾',
        subcategories: [
            { label: 'Sweet Corn',           filter: c => ['corn_sweet_peaches','corn_sweet_silver_queen'].includes(c.id) },
            { label: 'Popcorn & Flint Corn', filter: c => ['popcorn_robust','corn_glass_gem','corn_bloody_butcher'].includes(c.id) },
            { label: 'Wheat & Rye',          filter: c => ['wheat_hard_red','spelt_standard','einkorn_standard','triticale','winter_wheat','winter_rye'].includes(c.id) },
            { label: 'Oats & Barley',        filter: c => ['barley_hulless','oats_naked','spring_barley'].includes(c.id) },
            { label: 'Ancient & Specialty',  filter: c => ['teff_standard','sorghum_sweet','pearl_millet','buckwheat_grain','milo'].includes(c.id) },
            { label: 'Quinoa & Amaranth',    filter: c => ['quinoa_brightest','amaranth_grain'].includes(c.id) },
            { label: 'Oil & Fiber',          filter: c => ['flax','safflower','mustard_seed','canola'].includes(c.id) },
        ],
        filter: c => c.category === 'Grain' || c.id === 'quinoa_brightest',
    },

    // ── Specialty & Exotic ────────────────────────────────────────────────────
    {
        label: 'Specialty & Exotic',
        emoji: '✨',
        subcategories: [
            { label: 'Asparagus',            filter: c => c.id.startsWith('asparagus_') },
            { label: 'Artichoke & Cardoon',  filter: c => c.id.startsWith('artichoke_') || c.id === 'artichoke' || c.id === 'cardoon' },
            { label: 'Celery & Okra',        filter: c => ['celery_utah','celery_par_cel','okra_clemson','okra_red'].includes(c.id) },
            { label: 'Aquatic Vegetables',   filter: c => ['lotus_root','water_chestnut','wakame','wasabi'].includes(c.id) },
            { label: 'Tropical & Ginger',    filter: c => ['ginger_rhizome','turmeric_standard','lemongrass_standard'].includes(c.id) },
            { label: 'Rhubarb',              filter: c => c.id === 'rhubarb_victoria' },
        ],
        filter: c => c.category === 'Specialty' && c.id !== 'quinoa_brightest',
    },

    // ── Cover Crops (new — was previously hidden with no tab) ─────────────────
    {
        label: 'Cover Crops',
        emoji: '🌿',
        subcategories: [
            { label: 'Legume Covers',        filter: c => c.category === 'Cover Crop' && (c.id.includes('vetch') || c.id.includes('clover') || c.id.includes('pea') || c.id.includes('bean') || c.id.includes('cowpeas') || c.id.includes('lupin')) },
            { label: 'Grass Covers',         filter: c => c.category === 'Cover Crop' && (c.id.includes('rye') || c.id.includes('grass') || c.id.includes('oat') || c.id.includes('wheat') || c.id.includes('barley') || c.id.includes('millet') || c.id.includes('sorghum')) },
            { label: 'Brassica Covers',      filter: c => c.category === 'Cover Crop' && (c.id.includes('radish') || c.id.includes('mustard') || c.id.includes('turnip') || c.id.includes('rape')) },
        ],
        filter: c => c.category === 'Cover Crop',
    },
];

// ─── Component ────────────────────────────────────────────────────────────────

    const [openIndex, setOpenIndex] = useState(null);   // which top tab is open
    const [activeLabel, setActiveLabel] = useState('All');
    const panelAnim = useRef(new Animated.Value(0)).current;
    const closeTimer = useRef(null);

    const openPanel = useCallback((idx) => {
        clearTimeout(closeTimer.current);
        setOpenIndex(idx);
        Animated.spring(panelAnim, {
            toValue: 1, tension: 200, friction: 20, useNativeDriver: true,
        }).start();
    }, [panelAnim]);

    const closePanel = useCallback((delay = 0) => {
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => {
            Animated.timing(panelAnim, {
                toValue: 0, duration: 120, useNativeDriver: true,
            }).start(() => setOpenIndex(null));
        }, delay);
    }, [panelAnim]);

    useEffect(() => () => clearTimeout(closeTimer.current), []);

    const selectTop = (cat, idx) => {
        if (cat.subcategories.length === 0) {
            // "All" — direct select
            setActiveLabel('All');
            setOpenIndex(null);
            onFilterChange({ label: 'All', filterFn: () => true });
            return;
        }
        if (openIndex === idx) {
            closePanel();
        } else {
            openPanel(idx);
        }
    };

    const selectSub = (topCat, sub) => {
        setActiveLabel(sub.label);
        closePanel();
        onFilterChange({ label: sub.label, filterFn: sub.filter });
    };

    const selectTopAll = (topCat) => {
        setActiveLabel(topCat.label);
        closePanel();
        onFilterChange({ label: topCat.label, filterFn: topCat.filter });
    };

    const openCat = openIndex != null ? MEGA_CATEGORIES[openIndex] : null;

    return (
        <View style={styles.wrapper}>
            {/* ── Tab bar ── */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabBar}
                contentContainerStyle={styles.tabBarContent}
            >
                {MEGA_CATEGORIES.map((cat, idx) => {
                    const isActive = activeLabel === 'All' ? cat.label === 'All' : activeLabel === cat.label || cat.subcategories.some(s => s.label === activeLabel);
                    const isOpen = openIndex === idx;
                    return (
                        <Pressable
                            key={cat.label}
                            style={[styles.tab, isActive && styles.tabActive, isOpen && styles.tabOpen]}
                            onPress={() => selectTop(cat, idx)}
                            // Web: hover opens panel
                            {...(Platform.OS === 'web' ? {
                                onMouseEnter: () => cat.subcategories.length > 0 && openPanel(idx),
                                onMouseLeave: () => closePanel(150),
                            } : {})}
                        >
                            <Text style={styles.tabEmoji}>{cat.emoji}</Text>
                            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                {cat.label}
                            </Text>
                            {cat.subcategories.length > 0 && (
                                <Text style={[styles.tabChevron, isOpen && styles.tabChevronOpen]}>›</Text>
                            )}
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* ── Mega panel dropdown ── */}
            {openCat && openCat.subcategories.length > 0 && (
                <Animated.View
                    style={[
                        styles.panel,
                        Shadows.card,
                        {
                            opacity: panelAnim,
                            transform: [{
                                translateY: panelAnim.interpolate({
                                    inputRange: [0, 1], outputRange: [-8, 0],
                                }),
                            }],
                        },
                    ]}
                    {...(Platform.OS === 'web' ? {
                        onMouseEnter: () => clearTimeout(closeTimer.current),
                        onMouseLeave: () => closePanel(80),
                    } : {})}
                >
                    {/* Panel header — "View All X" */}
                    <TouchableOpacity
                        style={styles.panelHeader}
                        onPress={() => selectTopAll(openCat)}
                    >
                        <Text style={styles.panelHeaderEmoji}>{openCat.emoji}</Text>
                        <Text style={styles.panelHeaderTitle}>{openCat.label}</Text>
                        <Text style={styles.panelHeaderViewAll}>View All →</Text>
                    </TouchableOpacity>

                    {/* Subcategory chips */}
                    <View style={styles.panelSubcats}>
                        {openCat.subcategories.map(sub => {
                            const isActiveSub = activeLabel === sub.label;
                            return (
                                <TouchableOpacity
                                    key={sub.label}
                                    style={[styles.subChip, isActiveSub && styles.subChipActive]}
                                    onPress={() => selectSub(openCat, sub)}
                                >
                                    <Text style={[styles.subChipText, isActiveSub && styles.subChipTextActive]}>
                                        {sub.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    wrapper: {
        position: 'relative',
        zIndex: 50,
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.1)',
    },

    // ── Tab bar ───────────────────────────────────────────────────────────────
    tabBar: { flexShrink: 0 },
    tabBarContent: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: 6,
        gap: 4,
        alignItems: 'center',
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: Radius.full,
        borderWidth: 1.5,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    },
    tabActive: {
        backgroundColor: Colors.primaryGreen,
        borderColor: Colors.primaryGreen,
    },
    tabOpen: {
        backgroundColor: 'rgba(45,79,30,0.08)',
        borderColor: 'rgba(45,79,30,0.25)',
    },
    tabEmoji: { fontSize: 13 },
    tabText: {
        fontSize: 12,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
        whiteSpace: 'nowrap',
    },
    tabTextActive: { color: Colors.cream },
    tabChevron: {
        fontSize: 14,
        color: Colors.mutedText,
        transform: [{ rotate: '90deg' }],
        lineHeight: 16,
    },
    tabChevronOpen: {
        transform: [{ rotate: '270deg' }],
    },

    // ── Dropdown panel ────────────────────────────────────────────────────────
    panel: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: Colors.white,
        borderBottomWidth: 2,
        borderBottomColor: Colors.primaryGreen,
        borderTopWidth: 0,
        paddingBottom: Spacing.md,
        zIndex: 99,
        ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' } : {}),
    },
    panelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: Spacing.lg,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.08)',
    },
    panelHeaderEmoji: { fontSize: 16 },
    panelHeaderTitle: {
        flex: 1,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
    },
    panelHeaderViewAll: {
        fontSize: Typography.xs,
        color: Colors.burntOrange,
        fontWeight: Typography.semiBold,
    },
    panelSubcats: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.sm,
        gap: 8,
    },
    subChip: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(45,79,30,0.06)',
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.18)',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    },
    subChipActive: {
        backgroundColor: Colors.primaryGreen,
        borderColor: Colors.primaryGreen,
    },
    subChipText: {
        fontSize: 12,
        fontWeight: Typography.medium,
        color: Colors.primaryGreen,
    },
    subChipTextActive: { color: Colors.cream },
});

module.exports = MEGA_CATEGORIES;
