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
import { inferZoneFromFrostDates } from './farmUtils';

const BUY_STARTS_LEAD_DAYS = 7;

function isoDate(d) {
    if (!d) return null;
    return new Date(d).toISOString().split('T')[0];
}

function diffDays(isoA, isoB) {
    if (!isoA || !isoB) return 0;
    return Math.round((new Date(isoA) - new Date(isoB)) / 86400000);
}

function isSuccessionCrop(c) {
    const successionCats = new Set(['Greens', 'Herb']);
    return c.needsSuccession === true || successionCats.has(c.category ?? '');
}

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
export async function generateBedCalendar(bedNumber, successions, farmProfile, bedLengthFt = 50) {
    const entries = [];
    const bedLabel = `Bed ${bedNumber}`;
    const todayISO = isoDate(new Date());
    const firstFrost = farmProfile?.first_frost_date ?? null;

    for (const succ of successions) {
        if (!succ.crop_id) continue;

        const crop = await getCropById(succ.crop_id);
        if (!crop) continue;

        const isCoverCrop = crop.feed_class === 'cover_crop';
        const isTransplant = crop.seed_type === 'TP';
        let startDate = succ.start_date;

        // Seed-start weeks: support both field name variants
        const seedStartWeeks = crop.seed_start_weeks_before_transplant ?? crop.seed_start_weeks ?? null;

        // Tray date for TP crops
        let trayDate = null;
        if (isTransplant && seedStartWeeks) {
            trayDate = getSeedStartDate(startDate, seedStartWeeks);
        }

        // ─── AUDIT / SHIFT LOGIC (Parity with ActionCalendar) ─────
        let anchorRaw = trayDate ?? startDate;
        let wasRebased = false;
        let mute = false;
        let rescuedViaNursery = false;
        let buyStartsDate = null;
        let buyTransplantDate = null;

        if (anchorRaw && isoDate(anchorRaw) < todayISO) {
            const shiftDays = diffDays(todayISO, anchorRaw);
            
            // Shift dates
            trayDate = trayDate ? addDays(trayDate, shiftDays) : null;
            startDate = addDays(startDate, shiftDays);
            wasRebased = true;
            
            // Viability check against frost
            const harvestWindow = crop.harvest_window_days ?? defaultHarvestWindow(crop);
            const rebasedHarvestStartDate = addDays(startDate, crop.dtm ?? 0);
            
            const tooLateFromSeed = !succ.is_winter_override && (firstFrost && isoDate(rebasedHarvestStartDate) > firstFrost);
            
            let forceRescue = false;
            if (isTransplant) {
                const origTP = succ.start_date; // pre-rebase transplant
                const daysToOrigTP = diffDays(origTP, todayISO);
                if (daysToOrigTP <= 21 && !succ.is_winter_override) forceRescue = true;
            }
            
            if ((tooLateFromSeed || forceRescue) && !isCoverCrop && !isSuccessionCrop(crop)) {
                if (isTransplant) {
                    const origTP = succ.start_date; // pre-rebase transplant
                    const daysToOrigTP = diffDays(origTP, todayISO);
                    
                    if (daysToOrigTP >= -30) {
                        // Rescue
                        buyTransplantDate = daysToOrigTP >= 0 ? origTP : todayISO;
                        buyStartsDate = daysToOrigTP >= BUY_STARTS_LEAD_DAYS
                            ? addDays(buyTransplantDate, -BUY_STARTS_LEAD_DAYS)
                            : todayISO;
                            
                        startDate = buyTransplantDate;
                        trayDate = null; // No tray, we bought starts
                        rescuedViaNursery = true;
                    } else {
                        mute = true;
                    }
                } else {
                    mute = true; // direct sow that is too late
                }
            }
        }
        
        if (mute) continue; // Skip crop entirely if it's too late

        // IGD = DTM + harvest window
        const harvestWindow = crop.harvest_window_days ?? defaultHarvestWindow(crop);
        const igd = (crop.dtm ?? 0) + harvestWindow;

        // ── Seed-start (tray) or Nursery-rescue entry ─────────────────────────
        if (rescuedViaNursery && buyStartsDate) {
            entries.push({
                plan_entry_type: 'buy_starts',
                bed_number: bedNumber,
                bed_label: bedLabel,
                entry_date: buyStartsDate,
                action: 'buy_starts',
                action_short: 'Buy',
                crop_id: crop.id,
                crop_name: crop.name,
                crop_variety: crop.variety,
                dtm: crop.dtm,
                igd,
                harvest_window_days: harvestWindow,
                plant_count: computePlantCount(crop, bedLengthFt),
                rescuedViaNursery: true,
                wasRebased: true,
                special_notes: (!crop.late_transplant_tolerant)
                    ? `Strongly suggest purchasing starts for ${formatDateDisplay(buyTransplantDate)}. Seed start window passed.`
                    : `Seed window passed. Buy starts for ${formatDateDisplay(buyTransplantDate)} to stay on schedule.`,
                transplant_date: buyTransplantDate,
                is_auto_generated: succ.is_auto_generated ?? false,
            });
        }
        else if (isTransplant && trayDate) {
            // ── Normal Seed-start (tray) entry ──────────────────────────────────────
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
                crop_category: crop.category,
                dtm: crop.dtm,
                igd,
                harvest_window_days: harvestWindow,
                seed_amount_label: formatSeedAmount(crop, bedLengthFt, true),
                seed_amount_oz: computeSeedOz(crop, bedLengthFt),
                plant_count: computePlantCount(crop, bedLengthFt),
                row_count: crop.rows_per_30in_bed,
                spacing_label: formatSpacing(crop),
                jang_config_label: null,
                special_notes: `Sow indoors ${seedStartWeeks} wks before ${formatDateDisplay(startDate)} transplant`,
                transplant_date: startDate,
                wasRebased,
            });
        }

        // ── Main action entry (DS, Transplant, Cover Crop) ───────────────────
        const action = isCoverCrop ? 'cover_crop' : (isTransplant ? 'transplant' : 'direct_seed');
        const plantCount = computePlantCount(crop, bedLengthFt);
        const seedAmountLabel = formatSeedAmount(crop, bedLengthFt, false);
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
            crop_category: crop.category,
            dtm: crop.dtm,
            igd,
            harvest_window_days: harvestWindow,
            seed_amount_label: seedAmountLabel,
            seed_amount_oz: computeSeedOz(crop, bedLengthFt),
            plant_count: isTransplant ? plantCount : null,
            row_count: isCoverCrop ? null : crop.rows_per_30in_bed,
            spacing_label: formatSpacing(crop),
            jang_config_label: jangLabel,
            special_notes: specialNotes,
            estimated_harvest_date: addDays(startDate, crop.dtm),
            end_date: succ.end_date,
            tray_date: trayDate,       // non-null for TP crops
            is_auto_generated: succ.is_auto_generated ?? false,
            wasRebased,
            rescuedViaNursery,
        });
        
        // ── NEW: Explicit Harvest Event ──────────────────────────────────────
        entries.push({
            plan_entry_type: 'harvest',
            bed_number: bedNumber,
            bed_label: bedLabel,
            entry_date: addDays(startDate, crop.dtm),
            action: 'harvest',
            action_short: 'Harv',
            crop_id: crop.id,
            crop_name: crop.name,
            crop_variety: crop.variety,
            dtm: crop.dtm,
            igd,
            harvest_window_days: harvestWindow,
            wasRebased,
            rescuedViaNursery,
        });
        
        // ── NEW: IPM Scouting Events ─────────────────────────────────────────
        const userZone = inferZoneFromFrostDates(farmProfile?.first_frost_date, farmProfile?.last_frost_date);
        
        ['pests', 'diseases'].forEach(type => {
            (crop[type] || []).forEach(item => {
                if (item.zone_relevance && !item.zone_relevance.includes('all') && !item.zone_relevance.includes(userZone) && !item.zone_relevance.includes('pacific_northwest')) return;
                
                // Calculate scout date: 14 days after planting
                const scoutDate = addDays(startDate, 14);
                const scoutMonth = new Date(scoutDate).getMonth() + 1; // 1-12
                
                let isActive = false;
                if (!item.season || item.season === 'all') isActive = true;
                else if (item.season === 'spring' && [3,4,5,6].includes(scoutMonth)) isActive = true;
                else if (item.season === 'summer' && [6,7,8,9].includes(scoutMonth)) isActive = true;
                else if (item.season === 'fall' && [9,10,11].includes(scoutMonth)) isActive = true;
                else if (item.season === 'cool_wet' && [3,4,5,9,10,11].includes(scoutMonth)) isActive = true;
                else if (item.season === 'hot_dry' && [6,7,8,9].includes(scoutMonth)) isActive = true;
                else if (item.season === 'winter' && [12,1,2].includes(scoutMonth)) isActive = true;
                
                if (isActive) {
                    entries.push({
                        plan_entry_type: 'scout',
                        bed_number: bedNumber,
                        bed_label: bedLabel,
                        entry_date: scoutDate,
                        action: 'scout',
                        action_short: 'IPM',
                        crop_id: crop.id,
                        crop_name: crop.name,
                        scout_title: `Look out for ${item.name}`,
                        special_notes: `${item.name} activity is elevated during this season. Consider checking ${crop.name} this week or tracking ${item.organic_treatment}.`,
                        is_auto_generated: true,
                    });
                }
            });
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
        const bedEntries = await generateBedCalendar(bed.bed_number, bed.successions, farmProfile, bed.bedLengthFt || 50);
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
 * Returns the raw seed weight in ounces (with germination/loss buffer)
 * for use by the volume converter. Mirrors the math in formatSeedAmount
 * but returns a plain number rather than a formatted string.
 */
export function computeSeedOz(crop, bedLengthFt = 50) {
    if (crop.feed_class === 'cover_crop') return null; // volume not applicable to broadcast cover crops
    const seedOz = (crop.seed_oz_per_100ft ?? 1) * (bedLengthFt / 100);
    return seedOz * (1 + (crop.loss_buffer_pct ?? 20) / 100);
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
