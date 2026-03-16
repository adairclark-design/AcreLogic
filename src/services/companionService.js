/**
 * companionService.js
 * ═══════════════════
 * Companion planting knowledge base + check utilities.
 *
 * BAD_COMPANIONS maps crop IDs → array of incompatible crop IDs
 * with a reason string for each pairing.
 *
 * Sources: Rodale's Ultimate Encyclopedia of Organic Gardening,
 *          Carrots Love Tomatoes (L. Riotte), JM Fortier field notes.
 */

// ─── Bad companion pairings ───────────────────────────────────────────────────
// Keyed by crop ID (must match crops.json "id" field).
// Each entry: { with: cropId, reason: string }
const BAD_COMPANIONS_RAW = [
    // Fennel — allelopathic, stunts almost everything
    { a: 'fennel_bronze',      b: 'tomato_heirloom_beefsteak', reason: 'Fennel root exudates stunt tomato growth and reduce fruit set.' },
    { a: 'fennel_bronze',      b: 'cherry_tomato_sungold',     reason: 'Fennel root exudates stunt tomato growth and reduce fruit set.' },
    { a: 'fennel_bronze',      b: 'pepper_sweet',              reason: 'Fennel inhibits pepper growth.' },
    { a: 'fennel_bronze',      b: 'pepper_jalapeño',           reason: 'Fennel inhibits pepper growth.' },
    { a: 'fennel_bronze',      b: 'hot_pepper_habanero',       reason: 'Fennel inhibits pepper growth.' },
    { a: 'fennel_bronze',      b: 'kohlrabi_kolibri',          reason: 'Fennel stunts kohlrabi and most brassicas.' },
    { a: 'fennel_bronze',      b: 'lettuce_mix',               reason: 'Fennel compounds inhibit lettuce germination.' },
    { a: 'fennel_bronze',      b: 'peas_sugar_snap',           reason: 'Fennel is incompatible with most legumes.' },
    { a: 'fennel_bronze',      b: 'runner_beans',              reason: 'Fennel is incompatible with beans.' },

    // Onion family ↔ beans/peas
    { a: 'onion_candy',        b: 'peas_sugar_snap',           reason: 'Onions inhibit pea growth when grown in close proximity.' },
    { a: 'onion_candy',        b: 'snap_peas_cascadia',        reason: 'Onions inhibit pea growth when grown in close proximity.' },
    { a: 'onion_candy',        b: 'runner_beans',              reason: 'Alliums suppress bean growth — keep in separate beds.' },
    { a: 'onion_candy',        b: 'fava_beans',                reason: 'Alliums suppress bean growth — keep in separate beds.' },
    { a: 'onion_candy',        b: 'edamame_besweet',           reason: 'Alliums suppress soybean/edamame growth.' },
    { a: 'leek_giant_musselburgh', b: 'peas_sugar_snap',       reason: 'Leeks suppress pea root nodule formation.' },
    { a: 'leek_giant_musselburgh', b: 'runner_beans',          reason: 'Leeks suppress bean growth.' },
    { a: 'garlic_music',       b: 'peas_sugar_snap',           reason: 'Garlic root exudates suppress pea growth.' },
    { a: 'garlic_music',       b: 'snap_peas_cascadia',        reason: 'Garlic root exudates suppress pea growth.' },
    { a: 'garlic_music',       b: 'runner_beans',              reason: 'Garlic suppresses bean growth.' },
    { a: 'garlic_music',       b: 'fava_beans',                reason: 'Garlic suppresses legume growth.' },
    { a: 'shallots_ambition',  b: 'peas_sugar_snap',           reason: 'Shallots inhibit pea root nodules.' },
    { a: 'shallots_ambition',  b: 'runner_beans',              reason: 'Alliums suppress bean growth.' },
    { a: 'scallions_evergreen', b: 'peas_sugar_snap',          reason: 'Alliums inhibit peas.' },
    { a: 'scallions_evergreen', b: 'runner_beans',             reason: 'Alliums suppress bean growth.' },
    { a: 'cipollini_onion',    b: 'peas_sugar_snap',           reason: 'Onions inhibit pea growth.' },
    { a: 'cipollini_onion',    b: 'runner_beans',              reason: 'Alliums suppress bean growth.' },

    // Brassicas ↔ strawberries / tomatoes
    { a: 'cabbage_storage',    b: 'tomato_heirloom_beefsteak', reason: 'Brassicas and tomatoes compete aggressively; brassicas may inhibit tomato growth.' },
    { a: 'cabbage_storage',    b: 'cherry_tomato_sungold',     reason: 'Brassicas compete with tomatoes for nutrients.' },
    { a: 'kale_red_russian',   b: 'tomato_heirloom_beefsteak', reason: 'Brassicas can inhibit nightshade crops.' },
    { a: 'broccoli_di_ciccio', b: 'tomato_heirloom_beefsteak', reason: 'Brassicas and nightshades are poor together.' },
    { a: 'cauliflower_snowball', b: 'tomato_heirloom_beefsteak', reason: 'Brassicas compete with tomatoes.' },

    // Potatoes ↔ tomatoes (same family — disease transfer)
    { a: 'potato_red_norland', b: 'tomato_heirloom_beefsteak', reason: '⚠️ Same family (Solanaceae) — sharing a bed spreads blight rapidly between them.' },
    { a: 'potato_red_norland', b: 'cherry_tomato_sungold',     reason: '⚠️ Same family (Solanaceae) — blight spreads easily between tomatoes and potatoes.' },
    { a: 'potato_red_norland', b: 'pepper_sweet',              reason: 'Potatoes and peppers share diseases; keep separated.' },
    { a: 'potato_red_norland', b: 'eggplant_ichiban',          reason: 'Potatoes and eggplant share blight and pests.' },

    // Cucumbers ↔ sage / aromatic herbs (growth inhibition)
    { a: 'cucumber_marketmore', b: 'sage_garden',              reason: 'Sage can inhibit cucumber growth when planted very closely.' },
    { a: 'cucumber_marketmore', b: 'rosemary_tuscan_blue',     reason: 'Rosemary can suppress cucumbers in close quarters.' },

    // Sunflowers ↔ potatoes / beans
    { a: 'sunflower_holiday',  b: 'potato_red_norland',        reason: 'Sunflowers exude allelopathic compounds that can stunt potato tuber development.' },
    { a: 'sunflower_holiday',  b: 'runner_beans',              reason: 'Sunflowers can inhibit beans planted directly adjacent.' },

    // Mint ↔ almost everything (invasive allelopathy when roots mingle)
    { a: 'mint_spearmint', b: 'chamomile_german', reason: 'Mint spreads aggressively and can outcompete chamomile in shared beds.' },
];

// ─── Build a fast O(1) lookup map ────────────────────────────────────────────
const _pairingMap = new Map(); // key: `${sortedIdA}__${sortedIdB}` → reason

for (const { a, b, reason } of BAD_COMPANIONS_RAW) {
    const key = [a, b].sort().join('__');
    _pairingMap.set(key, reason);
}

/**
 * getBadCompanionWarning
 * ──────────────────────
 * Check if two crop IDs are known bad companions.
 *
 * @param {string} cropIdA
 * @param {string} cropIdB
 * @returns {string|null}  reason string if bad, null if compatible
 */
export function getBadCompanionWarning(cropIdA, cropIdB) {
    if (!cropIdA || !cropIdB || cropIdA === cropIdB) return null;
    const key = [cropIdA, cropIdB].sort().join('__');
    return _pairingMap.get(key) ?? null;
}

/**
 * checkBedCompanions
 * ──────────────────
 * Given the existing succession list for a bed and a candidate crop ID,
 * return any companion conflict warnings.
 *
 * @param {string}   candidateId        — crop being considered
 * @param {string[]} existingCropIds    — crop IDs already planned in the same bed
 * @returns {{ hasConflict: boolean, warnings: string[] }}
 */
export function checkBedCompanions(candidateId, existingCropIds = []) {
    const warnings = [];
    for (const existingId of existingCropIds) {
        const reason = getBadCompanionWarning(candidateId, existingId);
        if (reason) warnings.push(reason);
    }
    return { hasConflict: warnings.length > 0, warnings };
}

/**
 * checkBlockNeighborWarnings
 * ──────────────────────────
 * Check a candidate crop against ALL crops in adjacent beds of the same block.
 * (Adjacent = beds within ±1 bed number)
 *
 * @param {string} candidateId
 * @param {number} bedNum
 * @param {Object} allBedSuccessions   — { [bedNum]: successionArray }
 * @returns {{ hasConflict: boolean, warnings: Array<{bedNum:number, reason:string}> }}
 */
export function checkBlockNeighborWarnings(candidateId, bedNum, allBedSuccessions = {}) {
    const adjacentNums = [bedNum - 1, bedNum + 1];
    const warnings = [];

    for (const adjNum of adjacentNums) {
        const adjSuccessions = allBedSuccessions[adjNum];
        if (!adjSuccessions?.length) continue;
        for (const s of adjSuccessions) {
            const reason = getBadCompanionWarning(candidateId, s.crop_id);
            if (reason) warnings.push({ bedNum: adjNum, reason });
        }
    }

    return { hasConflict: warnings.length > 0, warnings };
}

/**
 * checkLayoutConflicts
 * ─────────────────────
 * Scan all beds in a visual layout for bad companion pairs across the
 * entire set (every bed vs. every other bed).
 *
 * @param {Array<{ cropId: string|null }>} beds
 * @returns {{ hasConflict: boolean, warnings: string[] }}
 */
export function checkLayoutConflicts(beds = []) {
    const warnings = [];
    const planted = beds.filter(b => b.cropId);
    for (let i = 0; i < planted.length; i++) {
        for (let j = i + 1; j < planted.length; j++) {
            const reason = getBadCompanionWarning(planted[i].cropId, planted[j].cropId);
            if (reason && !warnings.includes(reason)) warnings.push(reason);
        }
    }
    return { hasConflict: warnings.length > 0, warnings };
}
