/**
 * tierLimits.js
 * ══════════════
 * Single source of truth for all Free vs. Premium tier restrictions.
 *
 * Every paywall check in the app should call a function from this file
 * so that limits are updated in one place when pricing changes.
 *
 * Tier definitions:
 *   FREE      — anonymous/unauthenticated or no active subscription
 *   BASIC     — low-cost monthly (home gardener)
 *   PREMIUM   — full market farmer subscription
 *
 * To change a limit: edit the LIMITS object only. All derived functions
 * pick up the change automatically.
 */

// ─── Hard CSA ceiling — above this is a commercial CSA, push to Market Farm ───
export const HARD_FAMILY_CAP = 35;

// ─── Tier identifiers ─────────────────────────────────────────────────────────
export const TIER = {
    FREE:    'free',
    BASIC:   'basic',    // future low-cost tier
    PREMIUM: 'premium',  // current full Farm Designer
};

// ─── Limit definitions ────────────────────────────────────────────────────────
export const LIMITS = {
    [TIER.FREE]: {
        // "Just Planting Info" flow
        maxFamilyMembers:   HARD_FAMILY_CAP, // capped at 35 -> suggest Market Farm
        maxCropsSelected:   10,     // > 10 → suggest upgrade

        // "Build Garden Space" flow
        maxAcrePlot:        1 / 10, // 0.10 acres = 4,356 sq ft
        maxSqFtPlot:        4356,   // derived from 1/10 acre for direct comparison

        // Features disabled
        aiLayoutEnabled:        false,
        satelliteMappingEnabled: false,
        revenueTrackingEnabled:  false,
        successionPlanningEnabled: false,
        exportEnabled:           true,   // basic PDF export is free
    },

    [TIER.BASIC]: {
        // Raised limits for a low-cost monthly subscriber
        maxFamilyMembers:   HARD_FAMILY_CAP,
        maxCropsSelected:   25,
        maxAcrePlot:        1 / 4,   // 0.25 acres
        maxSqFtPlot:        10890,

        aiLayoutEnabled:        false,  // still premium
        satelliteMappingEnabled: false,
        revenueTrackingEnabled:  false,
        successionPlanningEnabled: false,
        exportEnabled:           true,
    },

    [TIER.PREMIUM]: {
        // Family planner capped at HARD_FAMILY_CAP — above that is a CSA
        maxFamilyMembers:   HARD_FAMILY_CAP,  // 60 — push larger groups to Market Farm
        maxCropsSelected:   Infinity,
        maxAcrePlot:        Infinity,
        maxSqFtPlot:        Infinity,

        aiLayoutEnabled:        true,
        satelliteMappingEnabled: true,
        revenueTrackingEnabled:  true,
        successionPlanningEnabled: true,
        exportEnabled:           true,
    },
};

// ─── Active tier (replace with auth/subscription lookup when billing is live) ─
// Persisted to localStorage so upgrades survive navigation resets & refreshes.
const TIER_STORAGE_KEY = 'acrelogic_active_tier';

function _readPersistedTier() {
    try {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(TIER_STORAGE_KEY);
            if (saved && Object.values(TIER).includes(saved)) return saved;
        }
    } catch {}
    return TIER.FREE;
}

let _activeTier = _readPersistedTier();

export function getActiveTier()     { return _activeTier; }
export function setActiveTier(tier) {
    _activeTier = tier;
    try {
        if (typeof localStorage !== 'undefined') {
            if (tier === TIER.FREE) {
                localStorage.removeItem(TIER_STORAGE_KEY);
            } else {
                localStorage.setItem(TIER_STORAGE_KEY, tier);
            }
        }
    } catch {}
}

/**
 * DEV ONLY — wipes all persisted tier + planner state and resets to free tier.
 * Called by the ?dev=1 reset banner. Never shown to real users.
 */
export function resetTierForTesting() {
    _activeTier = TIER.FREE;
    try {
        if (typeof localStorage !== 'undefined') {
            // Clear tier
            localStorage.removeItem(TIER_STORAGE_KEY);
            // Clear FamilyPlanner saved state
            localStorage.removeItem('acrelogic_family_size');
            localStorage.removeItem('acrelogic_selected_crops');
            // Clear any other acrelogic keys
            const toRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('acrelogic_')) toRemove.push(key);
            }
            toRemove.forEach(k => localStorage.removeItem(k));
        }
    } catch {}
}

export function getLimits(tier = _activeTier) { return LIMITS[tier] ?? LIMITS[TIER.FREE]; }

// ─── Gate check helpers ───────────────────────────────────────────────────────

/**
 * isWithinFreeTier
 * ─────────────────
 * Quick all-in-one check: are all parameters within the free tier limits?
 * Used by the "Just Planting Info" flow before the paywall modal fires.
 *
 * @param {{ familySize?: number, cropCount?: number }} params
 * @param {string} tier  — defaults to active tier
 * @returns {{ allowed: boolean, blockedBy: string|null, limit: number|null }}
 */
export function checkFamilyGate({ familySize = 0, cropCount = 0 }, tier = _activeTier) {
    // Hard CSA ceiling — above HARD_FAMILY_CAP (60) on any tier → redirect to Market Farm
    if (familySize > HARD_FAMILY_CAP) {
        return {
            allowed: false,
            blockedBy: 'csaSize',
            limit: HARD_FAMILY_CAP,
            message: `At ${HARD_FAMILY_CAP}+ people you\'re running a CSA. Switch to Market Farm for commercial planning tools.`,
        };
    }

    const limits = getLimits(tier);

    if (familySize > limits.maxFamilyMembers) {
        return {
            allowed: false,
            blockedBy: 'familySize',
            limit: limits.maxFamilyMembers,
            message: `Family plans for more than ${limits.maxFamilyMembers} people require a Premium account.`,
        };
    }
    if (cropCount > limits.maxCropsSelected) {
        return {
            allowed: false,
            blockedBy: 'cropCount',
            limit: limits.maxCropsSelected,
            message: `Calculating for more than ${limits.maxCropsSelected} crops at once requires a Premium account.`,
        };
    }
    return { allowed: true, blockedBy: null, limit: null, message: null };
}

/**
 * checkSpaceGate
 * ──────────────
 * For the "Build Garden Space" flow.
 *
 * @param {{ sqFt?: number, acres?: number }} params
 * @param {string} tier
 * @returns {{ allowed: boolean, blockedBy: string|null, limit: number|null }}
 */
export function checkSpaceGate({ sqFt = 0, acres = 0 }, tier = _activeTier) {
    const limits = getLimits(tier);
    const effectiveSqFt = sqFt || (acres * 43560);

    if (effectiveSqFt > limits.maxSqFtPlot) {
        const limitAcres = (limits.maxSqFtPlot / 43560).toFixed(3);
        return {
            allowed: false,
            blockedBy: 'plotSize',
            limit: limits.maxSqFtPlot,
            limitAcres: +limitAcres,
            message: `Garden spaces larger than ${limitAcres} acres (${limits.maxSqFtPlot.toLocaleString()} sq ft) require a Premium account.`,
        };
    }
    return { allowed: true, blockedBy: null, limit: null, message: null };
}

/**
 * checkFeatureGate
 * ─────────────────
 * Check whether a named feature is available on the current tier.
 *
 * @param {'aiLayout'|'satellite'|'revenue'|'succession'|'export'} featureName
 * @param {string} tier
 * @returns {{ allowed: boolean, message: string|null }}
 */
export function checkFeatureGate(featureName, tier = _activeTier) {
    const limits = getLimits(tier);
    const KEY_MAP = {
        aiLayout:    'aiLayoutEnabled',
        satellite:   'satelliteMappingEnabled',
        revenue:     'revenueTrackingEnabled',
        succession:  'successionPlanningEnabled',
        export:      'exportEnabled',
    };
    const key = KEY_MAP[featureName];
    if (!key) return { allowed: false, message: `Unknown feature: ${featureName}` };

    const allowed = !!limits[key];
    return {
        allowed,
        message: allowed
            ? null
            : `${featureName} is a Premium feature. Upgrade to unlock it.`,
    };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

/**
 * getUpgradePrompt
 * ─────────────────
 * Returns a friendly, specific upgrade prompt string for the paywall modal.
 * Keeps messaging consistent across screens.
 */
export function getUpgradePrompt(blockedBy) {
    const prompts = {
        csaSize: {
            headline: 'Sounds like you\'re running a CSA! 🌱',
            body: `At ${HARD_FAMILY_CAP}+ people, Feed My Family isn\'t the right tool — you need Market Farm mode. It\'s built for commercial-scale planning, revenue tracking, and succession scheduling.`,
            cta: 'Switch to Market Farm',
        },
        familySize: {
            headline: 'Growing for a bigger family?',
            body: `Upgrade to Premium to plan for up to ${HARD_FAMILY_CAP} people, plus unlock AI garden layout, succession scheduling, and full market tools.`,
            cta: 'See Premium Plans',
        },
        cropCount: {
            headline: 'Want to grow more varieties?',
            body: 'Premium lets you plan for unlimited crops at once, with an AI that prioritizes your favourites when space is tight.',
            cta: 'Unlock All Crops',
        },
        plotSize: {
            headline: 'Got more land to work with?',
            body: 'Premium unlocks unlimited acreage, satellite mapping for irregular plots, and the full Farm Designer suite.',
            cta: 'Upgrade for Larger Gardens',
        },
        aiLayout: {
            headline: 'Let AI design your beds for you',
            body: 'Premium\'s AI layout tool places your priority crops intelligently, fills gaps automatically, and adapts to your exact space.',
            cta: 'Try Premium AI Layout',
        },
        satellite: {
            headline: 'Map your land from satellite',
            body: 'Draw your exact plot boundaries from satellite imagery — perfect for irregular shapes, slopes, and partial shade mapping.',
            cta: 'Unlock Satellite Mapping',
        },
    };
    return prompts[blockedBy] ?? {
        headline: 'Upgrade to Premium',
        body: 'Unlock unlimited planning, AI layout, satellite mapping, and commercial market tools.',
        cta: 'See Plans',
    };
}

// ─── Convenience: currently on free plan? ────────────────────────────────────
export const isFreeTier    = () => _activeTier === TIER.FREE;
export const isPremiumTier = () => _activeTier === TIER.PREMIUM;
