/**
 * cropDisplay.js
 * ──────────────
 * Shared utility for formatting crop names in the UI.
 *
 * When a crop has a meaningful variety, show it as "Family - Variety"
 * so duplicates (like 11 types of Lettuce) are clear and scannable.
 *
 * Examples:
 *   name="Lettuce"  variety="Green Oakleaf"  → "Lettuce - Green Oakleaf"
 *   name="Potato"   variety="Purple Majesty" → "Potato - Purple Majesty"
 *   name="Tomato"   variety="Primary"        → "Tomato"   (suppressed — placeholder)
 *   name="Tomato"   variety=null             → "Tomato"
 */

/**
 * Variety values that are database-generation artifacts and should
 * never appear as visible labels in the UI.
 */
const PLACEHOLDER_VARIETIES = new Set([
    'Primary',
    'Standard',
    'Heirloom',
    'Hybrid',
    // add others here if they appear in the future
]);

/**
 * Returns the display name for a crop card.
 * @param {string} name     - crop.name from crops.json
 * @param {string|null} variety - crop.variety from crops.json
 * @returns {string}
 */
export function formatCropDisplayName(name, variety) {
    if (!variety || PLACEHOLDER_VARIETIES.has(variety)) return name;
    return `${name} - ${variety}`;
}

/**
 * Returns just the variety string for display, or null if it's a placeholder.
 * Use this for subtitle/badge displays (e.g. the plan report card variety label).
 * @param {string|null} variety
 * @returns {string|null}
 */
export function formatVarietyLabel(variety) {
    if (!variety || PLACEHOLDER_VARIETIES.has(variety)) return null;
    return variety;
}
