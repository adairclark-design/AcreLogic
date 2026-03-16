/**
 * AcreLogic Persistence Service
 * ================================
 * localStorage-backed save/restore for web.
 * On native, all operations are no-ops (SQLite handles persistence there).
 *
 * Saved keys:
 *   acrelogic_farm_profile   — farmProfile object
 *   acrelogic_bed_successions — { [bedNum]: [{crop_id, start_date, ...}] }
 *   acrelogic_plan_id        — planId string
 *   acrelogic_saved_at       — ISO timestamp of last save
 */

import { Platform } from 'react-native';

const KEYS = {
    JOURNAL_ENTRIES:    'acrelogic_journal_entries',
    ACTUAL_HARVESTS:    'acrelogic_actual_harvests',
    REVENUE_GOAL:       'acrelogic_revenue_goal',
    ROTATION_HISTORY:   'acrelogic_rotation_history',
    FARM_PROFILE: 'acrelogic_farm_profile',
    BED_SUCCESSIONS: 'acrelogic_bed_successions',
    PLAN_ID: 'acrelogic_plan_id',
    SAVED_AT: 'acrelogic_saved_at',
    BED_LAYOUT: 'acrelogic_bed_layout',
};

const isWeb = Platform.OS === 'web';

// ─── Save ─────────────────────────────────────────────────────────────────────

export function saveFarmProfile(farmProfile) {
    if (!isWeb) return;
    try {
        localStorage.setItem(KEYS.FARM_PROFILE, JSON.stringify(farmProfile));
        localStorage.setItem(KEYS.SAVED_AT, new Date().toISOString());
    } catch (e) {
        console.warn('[Persistence] Failed to save farmProfile:', e);
    }
}

export function saveBedSuccessions(bedSuccessions) {
    if (!isWeb) return;
    try {
        localStorage.setItem(KEYS.BED_SUCCESSIONS, JSON.stringify(bedSuccessions));
        localStorage.setItem(KEYS.SAVED_AT, new Date().toISOString());
    } catch (e) {
        console.warn('[Persistence] Failed to save bedSuccessions:', e);
    }
}

export function savePlanId(planId) {
    if (!isWeb) return;
    try {
        if (planId) localStorage.setItem(KEYS.PLAN_ID, planId);
    } catch (e) {
        console.warn('[Persistence] Failed to save planId:', e);
    }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export function loadSavedPlan() {
    if (!isWeb) return null;
    try {
        const farmProfile = JSON.parse(localStorage.getItem(KEYS.FARM_PROFILE) ?? 'null');
        const bedSuccessions = JSON.parse(localStorage.getItem(KEYS.BED_SUCCESSIONS) ?? 'null');
        const planId = localStorage.getItem(KEYS.PLAN_ID);
        const savedAt = localStorage.getItem(KEYS.SAVED_AT);

        if (!farmProfile) return null;

        return { farmProfile, bedSuccessions: bedSuccessions ?? {}, planId, savedAt };
    } catch (e) {
        console.warn('[Persistence] Failed to load saved plan:', e);
        return null;
    }
}

export function hasSavedPlan() {
    if (!isWeb) return false;
    try {
        return !!localStorage.getItem(KEYS.FARM_PROFILE);
    } catch {
        return false;
    }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export function clearSavedPlan() {
    if (!isWeb) return;
    try {
        Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    } catch (e) {
        console.warn('[Persistence] Failed to clear plan:', e);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable "Saved X minutes ago" string.
 */
export function savedAgoLabel() {
    if (!isWeb) return null;
    try {
        const savedAt = localStorage.getItem(KEYS.SAVED_AT);
        if (!savedAt) return null;
        const mins = Math.round((Date.now() - new Date(savedAt).getTime()) / 60000);
        if (mins < 1) return 'Saved just now';
        if (mins === 1) return 'Saved 1 min ago';
        if (mins < 60) return `Saved ${mins} mins ago`;
        const hrs = Math.floor(mins / 60);
        return hrs === 1 ? 'Saved 1 hr ago' : `Saved ${hrs} hrs ago`;
    } catch {
        return null;
    }
}

// ─── Field Journal ────────────────────────────────────────────────────────────

/**
 * Load journal entries from localStorage.
 * @returns {Array} [{ id, date, bedTag, text, createdAt }]
 */
export function loadJournalEntries() {
    try {
        if (typeof localStorage === 'undefined') return [];
        return JSON.parse(localStorage.getItem(KEYS.JOURNAL_ENTRIES) ?? '[]');
    } catch { return []; }
}

/**
 * Save a new journal entry.
 * @param {{ bedTag: string|null, text: string }} entry
 */
export function saveJournalEntry(entry) {
    try {
        if (typeof localStorage === 'undefined') return;
        const existing = loadJournalEntries();
        const newEntry = {
            id: `je_${Date.now()}`,
            date: new Date().toISOString(),
            bedTag: entry.bedTag ?? null,
            text: entry.text,
            createdAt: Date.now(),
        };
        localStorage.setItem(KEYS.JOURNAL_ENTRIES, JSON.stringify([newEntry, ...existing]));
        return newEntry;
    } catch { return null; }
}

/**
 * Delete a journal entry by id.
 */
export function deleteJournalEntry(id) {
    try {
        if (typeof localStorage === 'undefined') return;
        const existing = loadJournalEntries().filter(e => e.id !== id);
        localStorage.setItem(KEYS.JOURNAL_ENTRIES, JSON.stringify(existing));
    } catch {}
}

// ─── Visual Bed Layout ─────────────────────────────────────────────────────────
/**
 * Save the visual bed layout (positions, rotations, crop assignments).
 * @param {{ beds: Array }} layout
 */
export function saveBedLayout(layout) {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(KEYS.BED_LAYOUT, JSON.stringify(layout));
    } catch (e) {
        console.warn('[Persistence] Failed to save bed layout:', e);
    }
}

/**
 * Load the visual bed layout.
 * @returns {{ beds: Array } | null}
 */
export function loadBedLayout() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(KEYS.BED_LAYOUT);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

// ─── Actual Harvest Log ──────────────────────────────────────────────────────

export function loadActualHarvests() {
    try { return JSON.parse(localStorage.getItem(KEYS.ACTUAL_HARVESTS) ?? '[]'); }
    catch { return []; }
}

/**
 * saveActualHarvest
 * ─────────────────
 * Logs a real harvest alongside an optional issue attribution so the system
 * can distinguish a pest problem from a genuine yield baseline miss.
 *
 * Schema:
 * {
 *   id: string,
 *   date: ISO string,
 *   bedNum: number,
 *   cropId: string | null,
 *   cropName: string,
 *   actualLbs: number,
 *   hasIssue: boolean,           // Was there a problem this season?
 *   issueCategories: string[],   // ['Fungus', 'Insect', 'Poor Germination', 'Irrigation', 'Heat']
 *   issueNote: string,           // Free-text explanation (optional)
 * }
 */
export function saveActualHarvest({ bedNum, cropId, cropName, actualLbs, hasIssue = false, issueCategories = [], issueNote = '' }) {
    try {
        const existing = loadActualHarvests();
        const entry = {
            id: `ah_${Date.now()}`,
            date: new Date().toISOString(),
            bedNum,
            cropId: cropId ?? null,
            cropName,
            actualLbs: parseFloat(actualLbs) || 0,
            hasIssue: Boolean(hasIssue),
            issueCategories: Array.isArray(issueCategories) ? issueCategories : [],
            issueNote: issueNote?.trim() ?? '',
        };
        localStorage.setItem(KEYS.ACTUAL_HARVESTS, JSON.stringify([entry, ...existing]));
        return entry;
    } catch { return null; }
}


export function deleteActualHarvest(id) {
    try {
        const updated = loadActualHarvests().filter(h => h.id !== id);
        localStorage.setItem(KEYS.ACTUAL_HARVESTS, JSON.stringify(updated));
    } catch {}
}

// ─── Revenue Goal ─────────────────────────────────────────────────────────────

export function saveRevenueGoal(amount) {
    try { localStorage.setItem(KEYS.REVENUE_GOAL, String(amount)); }
    catch {}
}

export function loadRevenueGoal() {
    try { return parseFloat(localStorage.getItem(KEYS.REVENUE_GOAL) ?? '0') || 0; }
    catch { return 0; }
}

// ─── Bed Rotation History ─────────────────────────────────────────────────────
//
// Schema (keyed by year string):
// {
//   "2024": {
//     "1": {                               // bed number as string key
//       successions: [
//         { crop_id, crop_name, category, start_date, end_date }
//       ],
//       savedAt: ISO string
//     }
//   }
// }

export function loadRotationHistory() {
    try { return JSON.parse(localStorage.getItem(KEYS.ROTATION_HISTORY) ?? '{}'); }
    catch { return {}; }
}

/**
 * saveSeasonSnapshot
 * ──────────────────
 * Captures all successions for every bed, keyed by season year.
 * Includes crop_name, crop_id, category for rotation scoring.
 * Called every time bedSuccessions changes so history is always current.
 *
 * @param {Object} bedSuccessions  — { [bedNum]: [{ crop_id, crop_name, category, start_date, end_date }] }
 * @param {number|string} year     — Season year (default = current year)
 */
export function saveSeasonSnapshot(bedSuccessions, year) {
    if (!isWeb) return;
    const seasonYear = String(year ?? new Date().getFullYear());
    try {
        const history = loadRotationHistory();
        const snapshot = {};
        for (const [bedNum, succs] of Object.entries(bedSuccessions)) {
            if (!Array.isArray(succs) || succs.length === 0) continue;
            snapshot[bedNum] = {
                successions: succs.map(s => ({
                    crop_id:    s.crop_id    ?? null,
                    crop_name:  s.crop_name  ?? null,
                    category:   s.category   ?? null,   // e.g. 'Nightshade', 'Root', 'Legume'
                    start_date: s.start_date ?? null,
                    end_date:   s.end_date   ?? null,
                })).filter(s => s.crop_id),
                savedAt: new Date().toISOString(),
            };
        }
        history[seasonYear] = snapshot;
        localStorage.setItem(KEYS.ROTATION_HISTORY, JSON.stringify(history));
        return snapshot;
    } catch (e) {
        console.warn('[Persistence] saveSeasonSnapshot failed:', e);
        return {};
    }
}

/**
 * getBedRotationHistory
 * ─────────────────────
 * Returns the history for a single bed across all saved seasons.
 * Returns [ { year, successions: [{ crop_id, crop_name, category }] } ] sorted newest first.
 */
export function getBedRotationHistory(bedNum) {
    const history = loadRotationHistory();
    const bedKey = String(bedNum);
    return Object.entries(history)
        .filter(([, snap]) => snap[bedKey])
        .map(([year, snap]) => ({ year, ...snap[bedKey] }))
        .sort((a, b) => Number(b.year) - Number(a.year));
}

/**
 * getPriorYearBedCrops
 * ─────────────────────
 * Returns the list of { crop_id, crop_name, category } that were in a given bed
 * during the most recent prior year (year - 1). Used by the succession engine.
 */
export function getPriorYearBedCrops(bedNum, currentYear) {
    const history = loadRotationHistory();
    const priorYear = String((currentYear ?? new Date().getFullYear()) - 1);
    const snap = history[priorYear];
    if (!snap) return [];
    const bedSnap = snap[String(bedNum)];
    if (!bedSnap) return [];
    // Support both new schema ({successions: []}) and old schema ({crop_id, crop_name})
    if (bedSnap.successions) return bedSnap.successions;
    if (bedSnap.crop_id) return [{ crop_id: bedSnap.crop_id, crop_name: bedSnap.crop_name, category: null }];
    return [];
}

export function clearRotationHistory() {
    if (!isWeb) return;
    try { localStorage.removeItem(KEYS.ROTATION_HISTORY); } catch {}
}


// ─── Multi-Block Farm Designer ────────────────────────────────────────────────
const BLOCKS_KEY = 'acrelogic_farm_blocks';

/**
 * Block schema:
 * {
 *   id: string (uuid),
 *   name: string,           // "Block A", "North Field", etc.
 *   inputMode: 'beds' | 'dimensions',
 *
 *   // beds mode
 *   bedCount: number,
 *   bedLengthFt: number,
 *
 *   // dimensions mode
 *   blockLengthFt: number,
 *   blockWidthFt: number,
 *   // (bedCount auto-calculated)
 *
 *   bedWidthFt: number,     // default 2.5ft (30in)
 *   pathwayWidthFt: number, // default 4ft
 *   bisectingRoad: {
 *     enabled: boolean,
 *     orientation: 'NS' | 'EW',
 *     widthFt: number,
 *   },
 *   familyAssignment: string,  // "Brassica", "Allium", "Mixed", etc.
 *   gridPosition: { col: number, row: number }, // for farm map arrangement
 *   createdAt: string,
 *   updatedAt: string,
 * }
 */

export function loadBlocks() {
    try {
        const raw = localStorage.getItem(BLOCKS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function _saveBlocks(blocks) {
    localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
}

export function saveBlock(block) {
    const blocks = loadBlocks();
    const now = new Date().toISOString();
    const existing = blocks.findIndex(b => b.id === block.id);
    const updated = { ...block, updatedAt: now };
    if (existing >= 0) {
        blocks[existing] = updated;
    } else {
        blocks.push({ ...updated, createdAt: now });
    }
    _saveBlocks(blocks);
    return updated;
}

export function deleteBlock(blockId) {
    const blocks = loadBlocks().filter(b => b.id !== blockId);
    _saveBlocks(blocks);
    // Also clean up bed successions for this block
    try { localStorage.removeItem(`acrelogic_block_beds_${blockId}`); } catch {}
}

export function updateBlockGridPosition(blockId, col, row) {
    const blocks = loadBlocks();
    const idx = blocks.findIndex(b => b.id === blockId);
    if (idx >= 0) {
        blocks[idx].gridPosition = { col, row };
        blocks[idx].updatedAt = new Date().toISOString();
        _saveBlocks(blocks);
    }
}

// ─── Per-block bed succession storage ─────────────────────────────────────────
export function loadBlockBeds(blockId) {
    try {
        const raw = localStorage.getItem(`acrelogic_block_beds_${blockId}`);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

export function saveBlockBeds(blockId, bedSuccessions) {
    localStorage.setItem(`acrelogic_block_beds_${blockId}`, JSON.stringify(bedSuccessions));
}
