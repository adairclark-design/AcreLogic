
const fs = require('fs');
const cropsData = JSON.parse(fs.readFileSync('src/data/crops.json', 'utf8'));
const crops = cropsData.crops;

const MEGA_CATEGORIES = [
    // ── All ───────────────────────────────────────────────────────────────────
    {
        label: 'All',
        emoji: '🌱',
        subcategories: [],
        filter: () => true,
    },

    // ── Leafy & Salad ─────────────────────────────────────────────────────────
    {
        label: 'Leafy & Salad',
        emoji: '🥬',
        subcategories: [
            { label: 'Lettuce',              filter: c => c.id.includes('lettuce') },
            { label: 'Arugula',              filter: c => c.id.includes('arugula') },
            { label: 'Spinach & Chard',      filter: c => c.id.includes('spinach') || c.id.includes('chard') },
            { label: 'Chicory & Endive',     filter: c => c.id.includes('endive') || c.id.includes('radicchio') || c.id.includes('chicory') },
            { label: 'Wild & Specialty',     filter: c => c.category === 'Greens' && !c.id.includes('lettuce') && !c.id.includes('arugula') && !c.id.includes('spinach') && !c.id.includes('chard') && !c.id.includes('endive') && !c.id.includes('radicchio') && !c.id.includes('chicory') },
        ],
        filter: c => c.category === 'Greens',
    },

    // ── Brassicas ─────────────────────────────────────────────────────────────
    {
        label: 'Brassicas',
        emoji: '🥦',
        subcategories: [
            { label: 'Broccoli',             filter: c => c.id.includes('broccoli') || c.id.includes('romanesco') },
            { label: 'Cabbage',              filter: c => c.id.includes('cabbage') },
            { label: 'Kale & Collards',      filter: c => c.id.includes('kale') || c.id.includes('collard') || c.id.includes('kalettes') },
            { label: 'Cauliflower',          filter: c => c.id.includes('cauliflower') },
            { label: 'Kohlrabi',             filter: c => c.id.includes('kohlrabi') },
            { label: 'Brussels Sprouts',     filter: c => c.id.includes('brussels') },
            { label: 'Asian Greens',         filter: c => c.category === 'Brassica' && (c.id.includes('choi') || c.id.includes('choy') || c.id.includes('tatsoi') || c.id.includes('komatsuna') || c.id.includes('mizuna') || c.id.includes('asian_mix')) && !c.id.includes('cabbage') },
            { label: 'Other Brassicas',      filter: c => c.category === 'Brassica' && !c.id.includes('broccoli') && !c.id.includes('romanesco') && !c.id.includes('cabbage') && !c.id.includes('kale') && !c.id.includes('collard') && !c.id.includes('kalettes') && !c.id.includes('cauliflower') && !c.id.includes('kohlrabi') && !c.id.includes('brussels') && !c.id.includes('choi') && !c.id.includes('choy') && !c.id.includes('tatsoi') && !c.id.includes('komatsuna') && !c.id.includes('mizuna') && !c.id.includes('asian_mix') },
        ],
        filter: c => c.category === 'Brassica',
    },

    // ── Roots & Tubers ────────────────────────────────────────────────────────
    {
        label: 'Roots & Tubers',
        emoji: '🥕',
        subcategories: [
            { label: 'Carrots & Parsnips',   filter: c => c.id.includes('carrot') || c.id.includes('parsnip') },
            { label: 'Beets',                filter: c => c.id.includes('beet') && !c.id.includes('beetle') },
            { label: 'Potatoes',             filter: c => c.id.includes('potato') && !c.id.includes('sweet_potato') },
            { label: 'Sweet Potato',         filter: c => c.id.includes('sweet_potato') },
            { label: 'Turnips & Radishes',   filter: c => c.id.includes('radish') || c.id.includes('turnip') || c.id.includes('daikon') || c.id.includes('rutabaga') || c.id.includes('swede') },
            { label: 'Other Roots',          filter: c => (c.category === 'Root' || c.category === 'Tuber') && !c.id.includes('carrot') && !c.id.includes('parsnip') && !c.id.includes('beet') && !c.id.includes('potato') && !c.id.includes('radish') && !c.id.includes('turnip') && !c.id.includes('daikon') && !c.id.includes('rutabaga') && !c.id.includes('swede') },
        ],
        filter: c => c.category === 'Root' || c.category === 'Tuber',
    },

    // ── Alliums ───────────────────────────────────────────────────────────────
    {
        label: 'Alliums',
        emoji: '🧅',
        subcategories: [
            { label: 'Onions & Scallions',   filter: c => c.id.includes('onion') || c.id.includes('shallot') || c.id.includes('scallion') || c.id.includes('ramp') },
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
            { label: 'Cherry & Grape',       filter: c => (c.id.includes('tomato') || c.id.includes('cherry')) && (c.id.includes('cherry') || c.id.includes('grape') || c.id.includes('pear') || c.id.includes('juliet')) && !c.id.includes('ground') && !c.id.includes('husk') },
            { label: 'Paste & Sauce',        filter: c => c.id.includes('roma') || c.id.includes('san_marzano') || c.id.includes('paste') },
            { label: 'Tomatillos / Ground',  filter: c => c.id.includes('tomatillo') || c.id.includes('ground_cherry') || c.id.includes('husk') },
            { label: 'Other Tomatoes',       filter: c => c.id.includes('tomato') && !c.id.includes('cherry') && !c.id.includes('grape') && !c.id.includes('pear') && !c.id.includes('juliet') && !c.id.includes('roma') && !c.id.includes('san_marzano') && !c.id.includes('paste') && !c.id.includes('tomatillo') && !c.id.includes('ground') && !c.id.includes('husk') },
        ],
        filter: c => c.category === 'Nightshade' && !c.id.includes('pepper') && !c.id.includes('eggplant'),
    },

    // ── Peppers ───────────────────────────────────────────────────────────────
    {
        label: 'Peppers',
        emoji: '🌶️',
        subcategories: [
            { label: 'Sweet & Bell',         filter: c => c.id.includes('pepper') && (c.id.includes('sweet') || c.id.includes('bell') || c.id.includes('shishito') || c.id.includes('padron') || c.id.includes('cubanelle') || c.id.includes('banana') || c.id.includes('pepperoncini')) },
            { label: 'Hot & Roasting',       filter: c => (c.id.includes('pepper') || c.id.includes('jalapeño') || c.id.includes('habanero')) && !c.id.includes('sweet') && !c.id.includes('bell') && !c.id.includes('shishito') && !c.id.includes('padron') && !c.id.includes('cubanelle') && !c.id.includes('banana') && !c.id.includes('pepperoncini') },
        ],
        filter: c => c.category === 'Nightshade' && (c.id.includes('pepper') || c.id.includes('jalapeño') || c.id.includes('habanero')),
    },

    // ── Eggplant ──────────────────────────────────────────────────────────────
    {
        label: 'Eggplant',
        emoji: '🍆',
        subcategories: [
            { label: 'All Eggplant',         filter: c => c.id.includes('eggplant') },
        ],
        filter: c => c.category === 'Nightshade' && c.id.includes('eggplant'),
    },

    // ── Cucurbits ─────────────────────────────────────────────────────────────
    {
        label: 'Cucurbits',
        emoji: '🥒',
        subcategories: [
            { label: 'Cucumbers',            filter: c => c.id.includes('cucumber') },
            { label: 'Zucchini & Summer',    filter: c => c.id.includes('zucchini') || c.id.includes('summer_squash') || c.id.includes('pattypan') || c.id.includes('crookneck') || c.id.includes('lebanese') },
            { label: 'Winter Squash',        filter: c => c.category === 'Cucurbit' && (c.id.includes('squash') || c.id.includes('kabocha') || c.id.includes('delicata') || c.id.includes('acorn') || c.id.includes('hubbard')) && !c.id.includes('summer') && !c.id.includes('zucchini') && !c.id.includes('pattypan') && !c.id.includes('lebanese') },
            { label: 'Pumpkins',             filter: c => c.id.includes('pumpkin') || c.id.includes('gourd') },
            { label: 'Melons & Watermelons', filter: c => c.id.includes('melon') || c.id.includes('cantaloupe') || c.id.includes('honeydew') || c.id.includes('casaba') },
            { label: 'Other Cucurbits',      filter: c => c.category === 'Cucurbit' && !c.id.includes('cucumber') && !c.id.includes('zucchini') && !c.id.includes('summer_squash') && !c.id.includes('pattypan') && !c.id.includes('crookneck') && !c.id.includes('lebanese') && !c.id.includes('squash') && !c.id.includes('kabocha') && !c.id.includes('delicata') && !c.id.includes('acorn') && !c.id.includes('hubbard') && !c.id.includes('pumpkin') && !c.id.includes('gourd') && !c.id.includes('melon') && !c.id.includes('cantaloupe') && !c.id.includes('honeydew') && !c.id.includes('casaba') },
        ],
        filter: c => c.category === 'Cucurbit',
    },

    // ── Legumes ───────────────────────────────────────────────────────────────
    {
        label: 'Legumes',
        emoji: '🫘',
        subcategories: [
            { label: 'Bush Beans',           filter: c => c.category === 'Legume' && c.id.includes('bean') && (c.id.includes('bush') || c.id.includes('wax') || c.id.includes('french') || c.id.includes('green') || c.id.includes('pinto') || c.id.includes('kidney') || c.id.includes('black')) && !c.id.includes('pole') },
            { label: 'Pole & Runner Beans',  filter: c => c.category === 'Legume' && c.id.includes('bean') && (c.id.includes('pole') || c.id.includes('runner') || c.id.includes('yard')) },
            { label: 'Peas & Cowpeas',       filter: c => c.category === 'Legume' && (c.id.includes('pea') || c.id === 'field_peas') && !c.id.includes('chickpea') },
            { label: 'Other Legumes',        filter: c => c.category === 'Legume' && !(c.id.includes('bean') && (c.id.includes('bush') || c.id.includes('wax') || c.id.includes('french') || c.id.includes('green') || c.id.includes('pinto') || c.id.includes('kidney') || c.id.includes('black') || c.id.includes('pole') || c.id.includes('runner') || c.id.includes('yard'))) && !(c.id.includes('pea') && !c.id.includes('chickpea')) },
        ],
        filter: c => c.category === 'Legume',
    },

    // ── Herbs ─────────────────────────────────────────────────────────────────
    {
        label: 'Herbs',
        emoji: '🌿',
        subcategories: [
            { label: 'Basil',                filter: c => c.id.includes('basil') },
            { label: 'Mint & Lemon',         filter: c => c.id.includes('mint') || c.id.includes('lemon_balm') || c.id.includes('lemon_verbena') },
            { label: 'Cilantro & Parsley',   filter: c => c.id.includes('cilantro') || c.id.includes('parsley') || c.id.includes('culantro') || c.id.includes('coriander') },
            { label: 'Other Herbs',          filter: c => c.category === 'Herb' && !c.id.includes('basil') && !c.id.includes('mint') && !c.id.includes('lemon_balm') && !c.id.includes('lemon_verbena') && !c.id.includes('cilantro') && !c.id.includes('parsley') && !c.id.includes('culantro') && !c.id.includes('coriander') },
        ],
        filter: c => c.category === 'Herb',
    },

    // ── Flowers ───────────────────────────────────────────────────────────────
    {
        label: 'Flowers',
        emoji: '🌸',
        subcategories: [
            { label: 'Sunflowers & Zinnias', filter: c => c.id.includes('sunflower') || c.id.includes('zinnia') },
            { label: 'Dahlias & Cosmos',     filter: c => c.id.includes('dahlia') || c.id.includes('cosmos') },
            { label: 'Other Flowers',        filter: c => c.category === 'Flower' && !c.id.includes('sunflower') && !c.id.includes('zinnia') && !c.id.includes('dahlia') && !c.id.includes('cosmos') },
        ],
        filter: c => c.category === 'Flower',
    },

    // ── Fruits & Berries ──────────────────────────────────────────────────────
    {
        label: 'Fruits & Berries',
        emoji: '🍓',
        subcategories: [
            { label: 'Strawberries',         filter: c => c.id.includes('strawberry') },
            { label: 'Fruiting Shrubs',      filter: c => c.category === 'Fruiting Shrub' || (c.category === 'Fruit' && (c.id.includes('berry') || c.id.includes('currant')) && !c.id.includes('strawberry')) },
            { label: 'Fruit Trees',          filter: c => c.category === 'Fruit Tree' || (c.category === 'Fruit' && !c.id.includes('berry') && !c.id.includes('currant')) },
        ],
        filter: c => c.category === 'Fruit' || c.category === 'Fruiting Shrub' || c.category === 'Fruit Tree',
    },

    // ── Grains & Corn ─────────────────────────────────────────────────────────
    {
        label: 'Grains & Corn',
        emoji: '🌾',
        subcategories: [
            { label: 'Corn & Popcorn',       filter: c => c.id.includes('corn') },
            { label: 'Grains & Amaranth',    filter: c => (c.category === 'Grain' || c.id.includes('quinoa')) && !c.id.includes('corn') },
        ],
        filter: c => c.category === 'Grain' || c.id === 'quinoa_brightest',
    },

    // ── Specialty & Exotic ────────────────────────────────────────────────────
    {
        label: 'Specialty & Exotic',
        emoji: '✨',
        subcategories: [
            { label: 'Asparagus',            filter: c => c.id.includes('asparagus') },
            { label: 'Artichoke & Celery',   filter: c => c.id.includes('artichoke') || c.id.includes('celery') || c.id.includes('cardoon') },
            { label: 'Other Specialty',      filter: c => c.category === 'Specialty' && !c.id.includes('asparagus') && !c.id.includes('artichoke') && !c.id.includes('celery') && !c.id.includes('cardoon') },
        ],
        filter: c => c.category === 'Specialty' && c.id !== 'quinoa_brightest',
    },

    // ── Cover Crops ───────────────────────────────────────────────────────────
    {
        label: 'Cover Crops',
        emoji: '🌿',
        subcategories: [
            { label: 'All Covers',           filter: c => c.category === 'Cover Crop' },
        ],
        filter: c => c.category === 'Cover Crop',
    },
];

// ─── Component ────────────────────────────────────────────────────────────────


let unmapped = [];
let sub_unmapped = [];

for (const c of crops) {
    let topLevels = MEGA_CATEGORIES.filter(cat => cat.label !== 'All' && cat.filter(c));
    if (topLevels.length === 0) {
        unmapped.push(c);
        continue;
    }
    
    let hasSub = false;
    for (const topCat of topLevels) {
        if (topCat.subcategories.some(sub => sub.filter(c))) {
            hasSub = true;
            break;
        }
    }
    if (!hasSub) {
        sub_unmapped.push({ crop: c, topCat: topLevels.map(v => v.label).join(', ') });
    }
}

if (unmapped.length > 0) {
    console.log('=== COMPLETELY ORPHANED CROPS ===');
    console.log(unmapped.map(c => c.id + ' (Cat: ' + c.category + ')').join('\n'));
} else {
    console.log('All crops belong to at least one top-level tab.');
}
console.log('');
if (sub_unmapped.length > 0) {
    console.log('=== ORPHANED FROM SUB-TABS ===');
    sub_unmapped.forEach(item => {
        console.log(item.crop.id + ' (In ' + item.topCat + ')');
    });
} else {
    console.log('All categorized crops belong to at least one sub-tab.');
}
