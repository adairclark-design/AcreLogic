/**
 * growthStageService.js
 * ══════════════════════
 * Given a crop succession (crop_id, start_date, dtm) and today's date,
 * computes how far into the growth cycle the crop is and returns a
 * contextual "what to do now" tip for the farmer.
 *
 * Stage thresholds (% of DTM elapsed):
 *   0–15%:  Germination
 *   15–30%: Seedling / True Leaf
 *   30–60%: Vegetative
 *   60–85%: Flowering / Fruiting
 *   85–100%: Pre-harvest
 *   > 100%: Harvest now (overdue flag)
 */

// ─── Generic stage tips by category ─────────────────────────────────────────
// Key order matters — matched top-to-bottom
const STAGE_TIPS = [
    {
        pctMin: 101, pctMax: Infinity,
        tip: (crop) => `🚨 ${crop.name || 'This crop'} is past peak — harvest immediately before quality drops.`,
        badge: '🚨 Harvest Now',
        urgent: true,
    },
    {
        pctMin: 85, pctMax: 100,
        tip: (crop) => `Your ${crop.name || 'crop'} is approaching peak. Check daily and harvest at first readiness.`,
        badge: '🔜 Almost Ready',
        urgent: false,
    },
    {
        pctMin: 60, pctMax: 85,
        tip: (crop, category) => {
            if (isFruiting(category)) return `Flowers forming — remove any suckers, stake/trellis if needed, and foliar-feed with fish emulsion (2 tbsp/gal, early morning).`;
            if (isLeafy(category)) return `Heads forming — ensure consistent moisture. Watch for bolting if nights are short.`;
            if (isRoot(category)) return `Roots bulking up — stop overhead watering if possible; water deeply at the base.`;
            return `Flowering or ripening phase underway. Maintain consistent irrigation and watch closely for pest pressure.`;
        },
        badge: '🌸 Flowering / Fruiting',
        urgent: false,
    },
    {
        pctMin: 30, pctMax: 60,
        tip: (crop, category) => {
            if (isLeafy(category)) return `Vegetative growth — side-dress with high-nitrogen fertilizer (blood meal or fish emulsion). Scout for aphids under leaves.`;
            if (isFruiting(category)) return `Strong vegetative growth. Pinch suckers on indeterminate tomatoes. Side-dress with balanced 4-4-4 fertilizer.`;
            if (isRoot(category)) return `Tops growing well — thin to final spacing now if you haven't already to allow roots to expand.`;
            if (isLegume(category)) return `Climbing/vining phase — ensure trellising is in place. Don't fertilize with nitrogen; nodules are fixing their own.`;
            return `Active vegetative growth. Side-dress with balanced fertilizer and scout for pest pressure.`;
        },
        badge: '🌿 Growing Strong',
        urgent: false,
    },
    {
        pctMin: 15, pctMax: 30,
        tip: (crop, category) => {
            if (isRoot(category)) return `First true leaves visible — thin to ${crop.in_row_spacing_in ?? 3}" in-row now. Crowded roots will be stunted.`;
            if (isLeafy(category)) return `Seedlings emerging — thin to proper spacing. Apply a light kelp foliar spray to boost early growth.`;
            return `First true leaves visible! Thin to recommended spacing and ensure consistent moisture for establishment.`;
        },
        badge: '🌱 Thin / Establish',
        urgent: false,
    },
    {
        pctMin: 0, pctMax: 15,
        tip: (crop) => `Seeds germinating — keep soil evenly moist but not waterlogged. Don't let the surface crust over. No fertilizer yet.`,
        badge: '🫘 Germinating',
        urgent: false,
    },
];

function isFruiting(cat) { return ['Nightshade', 'Cucurbit', 'Cucurbits','Nightshades'].includes(cat) || /tomato|pepper|squash|cucumber|melon|eggplant/i.test(cat ?? ''); }
function isLeafy(cat) { return ['Greens', 'Brassica', 'Brassicas', 'Herb', 'Herbs'].includes(cat) || /lettuce|kale|chard|spinach|basil|herb/i.test(cat ?? ''); }
function isRoot(cat) { return ['Root', 'Root Crops'].includes(cat) || /radish|carrot|beet|turnip|parsnip|onion|garlic/i.test(cat ?? ''); }
function isLegume(cat) { return ['Legume', 'Legumes'].includes(cat) || /bean|pea|soy/i.test(cat ?? ''); }

// ─── Crop-specific tip overrides ─────────────────────────────────────────────
const CROP_OVERRIDES = {
    tomato_heirloom_beefsteak: {
        60: 'Flowers forming on tomatoes — remove suckers below first flower cluster, then foliar-feed fish emulsion weekly. Stake or cage now before plants get heavy.',
        85: 'Tomatoes approaching ripeness — stop deep watering to concentrate sugars. Watch for blossom-end rot (calcium deficiency).',
    },
    cherry_tomato_sungold: {
        60: 'Cherry tomato clusters forming — thin to 1–2 fruit clusters per stem. Consistent watering prevents blossom drop.',
        85: 'SunGold cherries start to soften before they look ripe — taste-test daily. They split quickly after peak.',
    },
    fennel_bronze: {
        30: 'Bronze fennel growing fast — pinch flower buds to encourage bushy foliage. Do not plant near dill (cross-pollination).',
    },
    radish_french_breakfast: {
        15: '🌱 Thin radishes NOW to 2" apart — this is the single most important step. Crowding = forked, small roots.',
        60: 'Radishes maturing fast — check by pressing soil aside. Harvest when shoulder diameter reaches 1".',
    },
    lettuce_mix: {
        60: 'Lettuce ready to cut-and-come-again. Cut outer leaves 1" above the crown. In warm weather, look for bolting signs (elongating center stem).',
    },
    peas_sugar_snap: {
        60: 'Snap peas in flower — harvest regularly to keep plants producing. Pick when pods plump but before they get starchy.',
    },
    kale_red_russian: {
        30: 'Kale growing strong — strip lower yellow leaves. Side-dress with blood meal (2 tbsp per plant). Scout for cabbage worms.',
    },
    summer_squash_pattypan: {
        60: '⚠️ Squash grows FAST now. Check daily — harvest at 3–4" for best flavor. Overmature squash signals plant to stop producing.',
    },
    cucumber_marketmore: {
        60: 'Cucumbers in active flower — train vines onto trellis. Remove male flowers if you want seedless fruit. Consistent water prevents bitter cucumbers.',
    },
};

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * getGrowthStage
 * ─────────────────
 * @param {{ crop_id: string, start_date: string, dtm: number, category?: string, name?: string, in_row_spacing_in?: number }} succession
 * @param {Date} today
 * @returns {{ pct: number, daysInGround: number, badge: string, tip: string, urgent: boolean }}
 */
export function getGrowthStage(succession, today = new Date()) {
    const { crop_id, start_date, dtm, category, name, in_row_spacing_in } = succession;
    if (!start_date || !dtm) return null;

    const startDate = new Date(start_date);
    const daysInGround = Math.max(0, Math.floor((today - startDate) / 86400000));
    const pct = dtm > 0 ? (daysInGround / dtm) * 100 : 0;

    // Find applicable stage
    const stage = STAGE_TIPS.find(s => pct >= s.pctMin && pct < s.pctMax)
        ?? STAGE_TIPS[STAGE_TIPS.length - 1];

    // Check crop-specific override first
    const overrides = crop_id ? CROP_OVERRIDES[crop_id] : null;
    let tip = null;
    if (overrides) {
        // Find the highest override threshold the crop has passed
        const thresholds = Object.keys(overrides).map(Number).sort((a, b) => b - a);
        for (const threshold of thresholds) {
            if (pct >= threshold) {
                tip = overrides[threshold];
                break;
            }
        }
    }

    if (!tip) {
        const mock = { name, in_row_spacing_in };
        tip = typeof stage.tip === 'function' ? stage.tip(mock, category) : stage.tip;
    }

    return {
        pct: Math.min(pct, 110),
        daysInGround,
        daysRemaining: Math.max(0, dtm - daysInGround),
        badge: stage.badge,
        tip,
        urgent: stage.urgent || pct > 100,
    };
}

/**
 * getActiveCrops
 * ───────────────
 * From a bedSuccessions map, return all crops currently in-ground today.
 * Returns array of { bedNum, succession, stage } sorted by urgency then dtm pct.
 */
export function getActiveCrops(bedSuccessions = {}, today = new Date()) {
    const results = [];

    for (const [bedNum, successions] of Object.entries(bedSuccessions)) {
        if (!Array.isArray(successions)) continue;
        for (const s of successions) {
            if (!s.start_date) continue;
            const startDate = new Date(s.start_date);
            const endDate = s.end_date ? new Date(s.end_date) : null;

            // In-ground = started but not yet ended (or no end date set)
            if (startDate > today) continue;
            if (endDate && endDate < today) continue;

            const stage = getGrowthStage(s, today);
            if (stage) {
                results.push({ bedNum: parseInt(bedNum), succession: s, stage });
            }
        }
    }

    // Sort: urgent first, then by % complete desc
    return results.sort((a, b) => {
        if (a.stage.urgent !== b.stage.urgent) return a.stage.urgent ? -1 : 1;
        return b.stage.pct - a.stage.pct;
    });
}
