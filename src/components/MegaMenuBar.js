/**
 * MegaMenuBar.js
 * ══════════════
 * Johnny Seeds-style mega menu for crop category navigation.
 * - Hover (web) or tap (mobile) a top-level tab to open the panel
 * - Panel shows subcategories as clickable chips
 * - Calls onFilterChange({ label, filterFn }) when selection changes
 * - "All" resets to show every crop
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, Platform, Animated, Pressable,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

// ─── Taxonomy ─────────────────────────────────────────────────────────────────
// Each top-level entry has: label, emoji, subcategories[]
// Each subcategory has: label, filter(crop) → bool
export const MEGA_CATEGORIES = [
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
            // Mizuna filter uses name check (not id) since ids are mizuna_red / mizuna_green
            { label: 'Asian Greens',         filter: c => c.category === 'Brassica' && (c.id.includes('choi') || c.id.includes('choy') || c.id.includes('tatsoi') || c.id.includes('komatsuna') || (c.name && c.name.toLowerCase().includes('mizuna')) || c.id.includes('asian_mix')) && !c.id.includes('cabbage') },
            { label: 'Other Brassicas',      filter: c => c.category === 'Brassica' && !c.id.includes('broccoli') && !c.id.includes('romanesco') && !c.id.includes('cabbage') && !c.id.includes('kale') && !c.id.includes('collard') && !c.id.includes('kalettes') && !c.id.includes('cauliflower') && !c.id.includes('kohlrabi') && !c.id.includes('brussels') && !c.id.includes('choi') && !c.id.includes('choy') && !c.id.includes('tatsoi') && !c.id.includes('komatsuna') && !(c.name && c.name.toLowerCase().includes('mizuna')) && !c.id.includes('asian_mix') },
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
            { label: 'Cherry & Grape',       filter: c => c.category === 'Nightshade' && (c.id.includes('tomato') || c.id.includes('cherry')) && (c.id.includes('cherry') || c.id.includes('grape') || c.id.includes('pear') || c.id.includes('juliet')) && !c.id.includes('ground') && !c.id.includes('husk') },
            { label: 'Paste & Sauce',        filter: c => c.category === 'Nightshade' && (c.id.includes('roma') || c.id.includes('san_marzano') || c.id.includes('paste')) },
            { label: 'Tomatillos / Ground',  filter: c => c.category === 'Nightshade' && (c.id.includes('tomatillo') || c.id.includes('ground_cherry') || c.id.includes('husk')) },
            { label: 'Other Tomatoes',       filter: c => c.category === 'Nightshade' && c.id.includes('tomato') && !c.id.includes('cherry') && !c.id.includes('grape') && !c.id.includes('pear') && !c.id.includes('juliet') && !c.id.includes('roma') && !c.id.includes('san_marzano') && !c.id.includes('paste') && !c.id.includes('tomatillo') && !c.id.includes('ground') && !c.id.includes('husk') },
        ],
        filter: c => c.category === 'Nightshade' && !c.id.includes('pepper') && !c.id.includes('eggplant'),
    },

    // ── Peppers & Eggplant ────────────────────────────────────────────────────
    // (Merged from two tabs — eggplant promoted to a subcategory)
    {
        label: 'Peppers & Eggplant',
        emoji: '🌶️',
        subcategories: [
            { label: 'Sweet & Bell',         filter: c => c.id.includes('pepper') && (c.id.includes('sweet') || c.id.includes('bell') || c.id.includes('shishito') || c.id.includes('padron') || c.id.includes('cubanelle') || c.id.includes('banana') || c.id.includes('pepperoncini')) },
            { label: 'Hot & Roasting',       filter: c => (c.id.includes('pepper') || c.id.includes('jalapeño') || c.id.includes('jalape') || c.id.includes('habanero') || c.id.includes('cayenne') || c.id.includes('serrano') || c.id.includes('ghost') || c.id.includes('thai') || c.id.includes('fresno') || c.id.includes('aji')) && !c.id.includes('sweet') && !c.id.includes('bell') && !c.id.includes('shishito') && !c.id.includes('padron') && !c.id.includes('cubanelle') && !c.id.includes('banana') && !c.id.includes('pepperoncini') && !c.id.includes('eggplant') },
            { label: 'Eggplant',             filter: c => c.id.includes('eggplant') },
        ],
        filter: c => c.category === 'Nightshade' && (c.id.includes('pepper') || c.id.includes('jalapeño') || c.id.includes('jalape') || c.id.includes('habanero') || c.id.includes('cayenne') || c.id.includes('serrano') || c.id.includes('ghost') || c.id.includes('thai') || c.id.includes('fresno') || c.id.includes('aji') || c.id.includes('eggplant')),
    },

    // ── Cucurbits ─────────────────────────────────────────────────────────────
    {
        label: 'Cucurbits',
        emoji: '🥒',
        subcategories: [
            { label: 'Cucumbers',            filter: c => c.category === 'Cucurbit' && c.id.includes('cucumber') },
            { label: 'Zucchini & Summer',    filter: c => c.category === 'Cucurbit' && (c.id.includes('zucchini') || c.id.includes('summer_squash') || c.id.includes('pattypan') || c.id.includes('crookneck') || c.id.includes('lebanese')) },
            { label: 'Winter Squash',        filter: c => c.category === 'Cucurbit' && (c.id.includes('squash') || c.id.includes('kabocha') || c.id.includes('delicata') || c.id.includes('acorn') || c.id.includes('hubbard')) && !c.id.includes('summer') && !c.id.includes('zucchini') && !c.id.includes('pattypan') && !c.id.includes('lebanese') },
            { label: 'Pumpkins',             filter: c => c.category === 'Cucurbit' && (c.id.includes('pumpkin') || c.id.includes('gourd')) },
            { label: 'Melons & Watermelons', filter: c => c.category === 'Cucurbit' && (c.id.includes('melon') || c.id.includes('cantaloupe') || c.id.includes('honeydew') || c.id.includes('casaba')) },
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
            { label: 'Cilantro, Parsley & Dill', filter: c => c.id.includes('cilantro') || c.id.includes('parsley') || c.id.includes('culantro') || c.id.includes('coriander') || c.id.includes('dill') },
            { label: 'Mint & Lemon Herbs',   filter: c => c.id.includes('mint') || c.id.includes('lemon_balm') || c.id.includes('lemon_verbena') || c.id.includes('lemon_thyme') || c.id.includes('lemon_basil') },
            { label: 'Mediterranean',        filter: c => c.category === 'Herb' && (c.id.includes('oregano') || c.id.includes('thyme') || c.id.includes('rosemary') || c.id.includes('sage') || c.id.includes('savory') || c.id.includes('marjoram') || c.id.includes('tarragon') || c.id.includes('fennel') || c.id.includes('chervil') || c.id.includes('lovage')) },
            { label: 'Tea Herbs',            filter: c => c.category === 'Herb' && (c.id.includes('chamomile') || c.id.includes('lemongrass') || c.id.includes('tulsi') || c.id.includes('holy_basil') || c.id.includes('stevia') || c.id.includes('anise_hyssop') || c.id.includes('korean_mint') || c.id.includes('catnip')) },
            { label: 'Medicinal & Botanical', filter: c => c.category === 'Herb' && (c.id.includes('echinacea') || c.id.includes('valerian') || c.id.includes('st_john') || c.id.includes('skullcap') || c.id.includes('rhodiola') || c.id.includes('milk_thistle') || c.id.includes('goldenseal') || c.id.includes('motherwort') || c.id.includes('wood_betony') || c.id.includes('spilanthes') || c.id.includes('ginseng') || c.id.includes('marshmallow') || c.id.includes('licorice') || c.id.includes('passionflower') || c.id.includes('wormwood') || c.id.includes('feverfew') || c.id.includes('rue') || c.id.includes('plantain_herb') || c.id.includes('nettle') || c.id.includes('mountain_mint') || c.id.includes('mad_monk')) },
            { label: 'Other Herbs',          filter: c => c.category === 'Herb' && !c.id.includes('basil') && !c.id.includes('cilantro') && !c.id.includes('parsley') && !c.id.includes('culantro') && !c.id.includes('coriander') && !c.id.includes('dill') && !c.id.includes('mint') && !c.id.includes('lemon_balm') && !c.id.includes('lemon_verbena') && !c.id.includes('lemon_thyme') && !c.id.includes('lemon_basil') && !c.id.includes('oregano') && !c.id.includes('thyme') && !c.id.includes('rosemary') && !c.id.includes('sage') && !c.id.includes('savory') && !c.id.includes('marjoram') && !c.id.includes('tarragon') && !c.id.includes('fennel') && !c.id.includes('chervil') && !c.id.includes('lovage') && !c.id.includes('chamomile') && !c.id.includes('lemongrass') && !c.id.includes('tulsi') && !c.id.includes('holy_basil') && !c.id.includes('stevia') && !c.id.includes('anise_hyssop') && !c.id.includes('korean_mint') && !c.id.includes('catnip') && !c.id.includes('echinacea') && !c.id.includes('valerian') && !c.id.includes('st_john') && !c.id.includes('skullcap') && !c.id.includes('rhodiola') && !c.id.includes('milk_thistle') && !c.id.includes('goldenseal') && !c.id.includes('motherwort') && !c.id.includes('wood_betony') && !c.id.includes('spilanthes') && !c.id.includes('ginseng') && !c.id.includes('marshmallow') && !c.id.includes('licorice') && !c.id.includes('passionflower') && !c.id.includes('wormwood') && !c.id.includes('feverfew') && !c.id.includes('rue') && !c.id.includes('plantain_herb') && !c.id.includes('nettle') && !c.id.includes('mountain_mint') },
        ],
        filter: c => c.category === 'Herb',
    },

    // ── Flowers ───────────────────────────────────────────────────────────────
    {
        label: 'Flowers',
        emoji: '🌸',
        subcategories: [
            { label: 'Sunflowers',           filter: c => c.id.includes('sunflower') },
            { label: 'Zinnias',              filter: c => c.id.includes('zinnia') },
            { label: 'Dahlias',              filter: c => c.id.includes('dahlia') },
            { label: 'Cosmos & Amaranth',    filter: c => c.id.includes('cosmos') || (c.id.includes('amaranth') && c.category === 'Flower') },
            { label: 'Spring Bulbs',         filter: c => c.category === 'Flower' && (c.id.includes('ranunculus') || c.id.includes('tulip') || c.id.includes('crocus') || c.id.includes('anemone') || c.id.includes('lisianthus')) },
            { label: 'Fillers & Texture',    filter: c => c.category === 'Flower' && (c.id.includes('scabiosa') || c.id.includes('gypsophila') || c.id.includes('ammi') || c.id.includes('statice') || c.id.includes('limonium') || c.id.includes('gomphrena') || c.id.includes('celosia') || c.id.includes('craspedia') || c.id.includes('xeranthemum') || c.id.includes('strawflower') || c.id.includes('helichrysum') || c.id.includes('helipterum')) },
            { label: 'Foliage & Accents',    filter: c => c.category === 'Flower' && (c.id.includes('eucalyptus') || c.id.includes('bupleurum') || c.id.includes('bells_of_ireland') || c.id.includes('daucus') || c.id.includes('orlaya') || c.id.includes('atriplex') || c.id.includes('cerinthe')) },
            { label: 'Spring Cuts',          filter: c => c.category === 'Flower' && (c.id.includes('sweet_pea') || c.id.includes('snapdragon') || c.id.includes('stock') || c.id.includes('larkspur') || c.id.includes('phlox') || c.id.includes('digitalis') || c.id.includes('poppy')) },
            { label: 'Other Flowers',        filter: c => c.category === 'Flower' && !c.id.includes('sunflower') && !c.id.includes('zinnia') && !c.id.includes('dahlia') && !c.id.includes('cosmos') && !(c.id.includes('amaranth') && c.category === 'Flower') && !c.id.includes('ranunculus') && !c.id.includes('tulip') && !c.id.includes('crocus') && !c.id.includes('anemone') && !c.id.includes('lisianthus') && !c.id.includes('scabiosa') && !c.id.includes('gypsophila') && !c.id.includes('ammi') && !c.id.includes('statice') && !c.id.includes('limonium') && !c.id.includes('gomphrena') && !c.id.includes('celosia') && !c.id.includes('craspedia') && !c.id.includes('xeranthemum') && !c.id.includes('strawflower') && !c.id.includes('helichrysum') && !c.id.includes('helipterum') && !c.id.includes('eucalyptus') && !c.id.includes('bupleurum') && !c.id.includes('bells_of_ireland') && !c.id.includes('daucus') && !c.id.includes('orlaya') && !c.id.includes('atriplex') && !c.id.includes('cerinthe') && !c.id.includes('sweet_pea') && !c.id.includes('snapdragon') && !c.id.includes('stock') && !c.id.includes('larkspur') && !c.id.includes('phlox') && !c.id.includes('digitalis') && !c.id.includes('poppy') },
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
            { label: 'Corn & Popcorn',       filter: c => c.category === 'Grain' && (c.id.includes('corn') || c.id.includes('popcorn')) },
            { label: 'Grains & Amaranth',    filter: c => (c.category === 'Grain' || c.id.includes('quinoa')) && !(c.id.includes('corn') || c.id.includes('popcorn')) },
        ],
        filter: c => c.category === 'Grain' || c.id.includes('quinoa'),
    },

    // ── Specialty & Exotic ────────────────────────────────────────────────────
    {
        label: 'Specialty & Exotic',
        emoji: '✨',
        subcategories: [
            { label: 'Perennial Vegetables', filter: c => c.id.includes('asparagus') || c.id.includes('artichoke') || c.id.includes('rhubarb') || c.id.includes('cardoon') },
            { label: 'Warm-Season Specialty', filter: c => c.category === 'Specialty' && (c.id.includes('okra') || c.id.includes('lemongrass') || c.id.includes('turmeric') || c.id.includes('ginger') || c.id.includes('celery') || c.id.includes('amaranth')) },
            { label: 'Exotic & Aquatic',     filter: c => c.category === 'Specialty' && (c.id.includes('lotus') || c.id.includes('wasabi') || c.id.includes('water_chestnut') || c.id.includes('wakame')) },
            { label: 'Other Specialty',      filter: c => c.category === 'Specialty' && !c.id.includes('asparagus') && !c.id.includes('artichoke') && !c.id.includes('rhubarb') && !c.id.includes('cardoon') && !c.id.includes('okra') && !c.id.includes('lemongrass') && !c.id.includes('turmeric') && !c.id.includes('ginger') && !c.id.includes('celery') && !c.id.includes('amaranth') && !c.id.includes('lotus') && !c.id.includes('wasabi') && !c.id.includes('water_chestnut') && !c.id.includes('wakame') },
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
export default function MegaMenuBar({ onFilterChange }) {
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
        ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : {}),
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
