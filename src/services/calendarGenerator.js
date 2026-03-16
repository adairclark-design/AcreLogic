/**
 * AcreLogic Seeding Calendar Generator
 * =====================================
 * Given a complete bed succession plan + farm profile, generates precise
 * calendar entries for each bed across the season.
 *
 * Action types: direct_seed (DS), transplant (TP), seed_start (Tray), cover_crop (CC)
 * IGD (In Ground Days) = DTM + harvest_window_days
 */

import { getCropById } from './database';
import { addDays, getSeedStartDate, formatDateDisplay } from './climateService';

const BED_LENGTH_FT = 50;

// ─── Shorthand labels ─────────────────────────────────────────────────────────
export function actionShort(action) {
    switch (action) {
        case 'direct_seed': return 'DS';
        case 'transplant': return 'TP';
        case 'seed_start': return 'Tray';
        case 'cover_crop': return 'CC';
        default: return action;
    }
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Generate all calendar entries for a single bed.
 */
export async function generateBedCalendar(bedNumber, successions, farmProfile) {
    const entries = [];
    const bedLabel = `Bed ${bedNumber}`;

    for (const succ of successions) {
        if (!succ.crop_id) continue;

        const crop = await getCropById(succ.crop_id);
        if (!crop) continue;

        const isCoverCrop = crop.feed_class === 'cover_crop';
        const isTransplant = crop.seed_type === 'TP';
        const startDate = succ.start_date;

        // Seed-start weeks: support both field name variants
        const seedStartWeeks = crop.seed_start_weeks_before_transplant ?? crop.seed_start_weeks ?? null;

        // IGD = DTM + harvest window (how many days the crop actually occupies the bed)
        const harvestWindow = crop.harvest_window_days ?? defaultHarvestWindow(crop);
        const igd = (crop.dtm ?? 0) + harvestWindow;

        // Tray date for TP crops
        let trayDate = null;
        if (isTransplant && seedStartWeeks) {
            trayDate = getSeedStartDate(startDate, seedStartWeeks);

            // ── Seed-start (tray) entry ──────────────────────────────────────
            entries.push({
                plan_entry_type: 'seed_start',
                bed_number: bedNumber,
                bed_label: bedLabel,
                entry_date: trayDate,
                action: 'seed_start',
                action_short: 'Tray',
                crop_id: crop.id,
                crop_name: crop.name,
                crop_variety: crop.variety,
                dtm: crop.dtm,
                igd,
                harvest_window_days: harvestWindow,
                seed_amount_label: formatSeedAmount(crop, BED_LENGTH_FT, true),
                plant_count: computePlantCount(crop, BED_LENGTH_FT),
                row_count: crop.rows_per_30in_bed,
                spacing_label: formatSpacing(crop),
                jang_config_label: null,
                special_notes: `Sow indoors ${seedStartWeeks} wks before ${formatDateDisplay(startDate)} transplant`,
                transplant_date: startDate,
            });
        }

        // ── Main action entry (DS, Transplant, Cover Crop) ───────────────────
        const action = isCoverCrop ? 'cover_crop' : (isTransplant ? 'transplant' : 'direct_seed');
        const plantCount = computePlantCount(crop, BED_LENGTH_FT);
        const seedAmountLabel = formatSeedAmount(crop, BED_LENGTH_FT, false);
        const jangLabel = buildJangLabel(crop);
        const specialNotes = buildSpecialNotes(crop);

        entries.push({
            plan_entry_type: action,
            bed_number: bedNumber,
            bed_label: bedLabel,
            entry_date: startDate,
            action,
            action_short: actionShort(action),
            crop_id: crop.id,
            crop_name: crop.name,
            crop_variety: crop.variety,
            dtm: crop.dtm,
            igd,
            harvest_window_days: harvestWindow,
            seed_amount_label: seedAmountLabel,
            plant_count: isTransplant ? plantCount : null,
            row_count: isCoverCrop ? null : crop.rows_per_30in_bed,
            spacing_label: formatSpacing(crop),
            jang_config_label: jangLabel,
            special_notes: specialNotes,
            estimated_harvest_date: addDays(startDate, crop.dtm),
            end_date: succ.end_date,
            tray_date: trayDate,       // non-null for TP crops
            is_auto_generated: succ.is_auto_generated ?? false,
        });
    }

    entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    return entries;
}

/**
 * Generate the full crop calendar for all beds, sorted by date then bed.
 */
export async function generateFullCalendar(allBedSuccessions, farmProfile) {
    const allEntries = [];
    for (const bed of allBedSuccessions) {
        const bedEntries = await generateBedCalendar(bed.bed_number, bed.successions, farmProfile);
        allEntries.push(...bedEntries);
    }
    allEntries.sort((a, b) => {
        const d = a.entry_date.localeCompare(b.entry_date);
        return d !== 0 ? d : a.bed_number - b.bed_number;
    });
    return allEntries;
}

// ─── Computation Helpers ──────────────────────────────────────────────────────

function computePlantCount(crop, bedLengthFt) {
    const spacingIn = crop.in_row_spacing_in ?? 12;
    const rows = crop.rows_per_30in_bed ?? 1;
    return Math.floor((bedLengthFt * 12) / spacingIn) * rows;
}

/**
 * Default harvest window when not set in DB, by crop category.
 */
function defaultHarvestWindow(crop) {
    if (crop.feed_class === 'cover_crop') return 0;
    if (crop.category === 'Root') return 14;        // roots harvested over ~2 weeks
    if (crop.category === 'Greens') return 14;      // greens harvested over ~2 weeks
    if (crop.category === 'Brassica') return 14;
    if (crop.category === 'Legume') return 21;      // beans/peas picked over 3 weeks
    return 14;
}

/**
 * Format seed quantity with clear unit context.
 * #1: Always append "seed/bed" or "seed/tray" so it's never ambiguous.
 */
function formatSeedAmount(crop, bedLengthFt, forSeedStart = false) {
    if (crop.feed_class === 'cover_crop') {
        const rawOz = (crop.seed_oz_per_100ft ?? 80) * (bedLengthFt / 100);
        const rawLbs = rawOz / 16;
        const withBuffer = rawLbs * (1 + (crop.loss_buffer_pct ?? 10) / 100);
        return `${withBuffer.toFixed(1)} lbs seed/bed (broadcast)`;
    }

    const seedOz = (crop.seed_oz_per_100ft ?? 1) * (bedLengthFt / 100);
    const withBuffer = seedOz * (1 + (crop.loss_buffer_pct ?? 20) / 100);

    let qty;
    if (withBuffer >= 16) qty = `${(withBuffer / 16).toFixed(2)} lbs`;
    else if (withBuffer >= 8) qty = `${(withBuffer / 16).toFixed(2)} lb`;
    else if (withBuffer >= 4) qty = '1/4 lb';
    else if (withBuffer >= 2) qty = '1/8 lb';
    else if (withBuffer >= 1) qty = `${Math.round(withBuffer)} oz`;
    else qty = `${withBuffer.toFixed(1)} oz`;

    // #1: clear context suffix
    return forSeedStart ? `${qty} seed/tray` : `${qty} seed/bed`;
}

function buildJangLabel(crop) {
    if (!crop.jang_model) return null;
    if (crop.jang_model === 'broadcast') return 'Broadcast Seeder';
    const parts = [crop.jang_model ?? ''];
    if (crop.jang_wheel) parts.push(crop.jang_wheel);
    const fp = crop.jang_finger ? `F${crop.jang_finger.replace('F', '')}` : '';
    const bp = crop.jang_brush ? `B${crop.jang_brush.replace('B', '')}` : '';
    if (fp || bp) parts.push(`${fp}${bp}`);
    return parts.filter(Boolean).join(' ');
}

function formatSpacing(crop) {
    if (!crop.rows_per_30in_bed) return null;
    return `${crop.rows_per_30in_bed} rows × ${crop.in_row_spacing_in}" in-row`;
}

/**
 * Build special notes — trellised, interplanting only. No book references.
 * #2: Excludes jang_seeder.notes which contained Fortier page refs.
 */
function buildSpecialNotes(crop, interplantLine = null) {
    const notes = [];
    if (crop.notes?.includes('Trellised') || crop.notes?.includes('rellised')) {
        notes.push('Trellised');
    }
    if (interplantLine) notes.push(interplantLine);
    // Note: intentionally excluding crop.jang_seeder?.notes (contained book references)
    return notes.join(' | ') || null;
}
