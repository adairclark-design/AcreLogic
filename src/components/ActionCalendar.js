/**
 * ActionCalendar.js
 * ══════════════════
 * Chronological action calendar. Groups planting events by month → week,
 * rendered as compact 6-column chips.
 *
 * ─── TODAY-REBASE LOGIC ──────────────────────────────────────────────────────
 * If a crop's first sowing/indoor-start date is in the past, we shift it to
 * today and recompute ALL downstream dates (transplant, harvest, succession
 * rounds) from that new anchor.
 *
 * ─── VIABILITY FILTER ────────────────────────────────────────────────────────
 * After rebasing, we check whether the crop can still realistically mature
 * before first frost:
 *
 *   • Succession / cut-and-come-again crops (lettuce, arugula, herbs…)
 *     → Always keep: short DTM means at least one round is usually still viable.
 *       All dates shift forward from today. No muting.
 *
 *   • Single-harvest TP crops (onions, peppers, tomatoes…) where seeding
 *     from scratch TODAY would push transplant too late:
 *     → If the ORIGINAL transplant date is still upcoming (≥ today):
 *         Drop "Start indoors" chip; replace with "Buy starts" 7 days before
 *         original transplant date. Harvest date computed from ORIGINAL transplant.
 *     → If the original transplant is also in the past, but there's still
 *         enough frost-free time from today:
 *         Emit a "Buy starts NOW" chip dated today + transplant immediately.
 *     → If there is genuinely not enough season left (daysToFrost < DTM):
 *         MUTE the crop — emit nothing.
 *
 *   • Single-harvest DS crops whose shifted harvest would fall after first frost:
 *     → MUTE the crop — emit nothing.
 *
 * ─── DEDUPLICATION ───────────────────────────────────────────────────────────
 * Succession rounds that land within MIN_SUCCESSION_GAP_DAYS of each other
 * are dropped.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ─── Event type config ────────────────────────────────────────────────────────
const EVENT_TYPES = {
    indoor:    { emoji: '🌱', label: 'Start indoors',  color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' },
    sow:       { emoji: '💧', label: 'Direct sow',     color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' },
    buy_starts:{ emoji: '🛍️', label: 'Buy starts',    color: '#6A1B9A', bg: '#F3E5F5', border: '#CE93D8' },
    transplant:{ emoji: '🌤', label: 'Transplant out', color: '#E65100', bg: '#FFF3E0', border: '#FFCC80' },
    harvest:   { emoji: '✂️', label: 'Harvest',        color: '#BF360C', bg: '#FBE9E7', border: '#FFAB91' },
};

// ─── Start method badges ──────────────────────────────────────────────────────
const START_METHOD = {
    direct_sow:          { label: 'Direct Seed',        short: 'DS',  color: '#1565C0', bg: '#DDEEFF' },
    indoor_recommended:  { label: 'Indoors Recommended', short: 'Rec', color: '#6A1B9A', bg: '#F3E5F5' },
    indoor_essential:    { label: 'Indoors Essential',  short: 'Must', color: '#BF360C', bg: '#FBE9E7' },
};

// ─── Seed/tray helpers ────────────────────────────────────────────────────────
function recommendTray(category, familySize = 0) {
    const isLarge = familySize >= 20;

    if (category === 'Cucurbit')
        return { type: 'tray', cells: 50, label: '50-cell flat' };
    if (!isLarge && ['Nightshade', 'Specialty', 'Fruit'].includes(category))
        return { type: 'pot', cells: 1, label: '3" pot' };
    if (['Nightshade', 'Specialty', 'Fruit'].includes(category))
        return { type: 'tray', cells: 72, label: '72-cell flat' };
    if (['Root', 'Herb', 'Flower'].includes(category))
        return { type: 'tray', cells: 128, label: '128-cell flat' };
    if (['Allium', 'Brassica', 'Greens', 'Legume'].includes(category))
        return isLarge 
            ? { type: 'tray', cells: 200, label: '200-cell flat' }
            : { type: 'tray', cells: 72, label: '72-cell flat' };
    return { type: 'tray', cells: 128, label: '128-cell flat' };
}

function seedsPerCell(germRate) {
    if (germRate >= 0.85) return 1;
    if (germRate >= 0.70) return 2;
    return 3;
}

/**
 * Unified seed quantity formula — single source of truth.
 * target_plants = ceil(plantsNeeded * 1.20)  — 20% attrition buffer
 * seeds_needed  = ceil(target_plants / germRate) — germination loss
 * This is used identically in SeedShoppingList to ensure both tabs agree.
 */
function seedsNeeded(plantsNeeded, germRate) {
    const targetPlants = Math.ceil((plantsNeeded ?? 0) * 1.20);
    return Math.ceil(targetPlants / Math.max(germRate ?? 0.75, 0.01));
}

function traysNeeded(seeds, tray) {
    return tray.type === 'pot' ? seeds : Math.ceil(seeds / (tray.cells ?? 72));
}

function thinningNote(cropName, germRate) {
    const name = (cropName ?? '').toLowerCase();
    if (name.includes('beet') || name.includes('chard')) {
        return '⚑ Beet/chard = cluster — thin to 1–2 plants';
    }
    if (seedsPerCell(germRate) > 1) {
        return `⚑ Sow ${seedsPerCell(germRate)}/cell, thin to 1`;
    }
    return null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function parseISO(d) {
    if (!d) return null;
    if (d instanceof Date) return d;
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
}
function startOfWeek(d) {
    const x = new Date(d), day = x.getDay();
    x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
    return x;
}
function isoDate(d) { return d.toISOString().split('T')[0]; }
function weekLabel(d) { return `Week of ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`; }

/** Add `days` to an ISO date string and return an ISO date string. */
function addDaysISO(isoStr, days) {
    const d = parseISO(isoStr);
    d.setDate(d.getDate() + days);
    return isoDate(d);
}

/** Signed day difference: dateA − dateB (positive = A is later). */
function diffDays(isoA, isoB) {
    return Math.round((parseISO(isoA) - parseISO(isoB)) / 86400000);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_SUCCESSION_GAP_DAYS = 5; // successions closer than this are merged/dropped
const BUY_STARTS_LEAD_DAYS    = 7; // "Buy starts" notice goes out this many days before transplant

// ─── Crop classification helpers ──────────────────────────────────────────────
/**
 * Returns true for short-cycle succession crops where some harvest is still
 * worth having even if the first sow is delayed.  These are NEVER muted.
 */
function isSuccessionCrop(c) {
    const successionCats = new Set(['Greens', 'Herb']);
    return c.needsSuccession === true || successionCats.has(c.category ?? '');
}

// ─── Core: rebase + viability logic ──────────────────────────────────────────
/**
 * auditCrop
 * ─────────
 * 1. If the crop's first action date is past, shift ALL dates forward by the
 *    same offset so the anchor lands on today.
 * 2. Run viability check against first frost:
 *    - Succession crops: shift and keep.
 *    - TP single-harvest: if seeding today would miss the season, convert to
 *      "buy starts" events.  If even that's hopeless, mute entirely.
 *    - DS single-harvest: if shifted harvest > first frost, mute entirely.
 * 3. Returns an augmented crop object with audit flags:
 *    _wasRebased       — dates were shifted
 *    _mute             — emit no calendar events for this crop
 *    _buyStartsDate    — ISO date when the "Buy starts" chip should appear
 *    _buyTransplantDate— ISO date to use for transplant after buying starts
 */
function auditCrop(c, firstFrost) {
    const todayISO   = isoDate(new Date());
    const anchorRaw  = c.indoorSeedDateRaw ?? c.directSowDateRaw;

    // ── No calendar data: nothing to do ───────────────────────────────────
    if (!anchorRaw) return c;

    const anchorDate = parseISO(anchorRaw);
    const today      = parseISO(todayISO);

    // ── Case A: anchor is today or future — no rebase needed ──────────────
    if (anchorDate >= today) return c;

    // ── Compute shift offset ──────────────────────────────────────────────
    const shiftDays = diffDays(todayISO, anchorRaw); // positive integer
    const shift = (raw) => raw ? addDaysISO(raw, shiftDays) : null;

    // Shifted dates (assuming "start today")
    const newIndoorSeedDateRaw   = shift(c.indoorSeedDateRaw);
    const newDirectSowDateRaw    = shift(c.directSowDateRaw);
    const newTransplantDateRaw   = shift(c.transplantDateRaw);
    const newHarvestStartDateRaw = shift(c.harvestStartDateRaw);
    const newHarvestEndDateRaw   = shift(c.harvestEndDateRaw);

    // ── Succession rounds (rebased from new first-sow date) ───────────────
    let newSuccessionDates = [];
    if (c.successionDates?.length > 0 && newDirectSowDateRaw) {
        const interval = c.successionDates.length > 0
            ? diffDays(c.successionDates[0].dateRaw, c.directSowDateRaw)
            : (c.harvestWindowDays ?? 14);

        const kept = [];
        for (const s of c.successionDates) {
            const newSowRaw = addDaysISO(newDirectSowDateRaw, (s.round - 1) * interval);
            if (newSowRaw < todayISO) continue;
            // Dedup: too close to first sow
            if (kept.length === 0 && diffDays(newSowRaw, newDirectSowDateRaw) < MIN_SUCCESSION_GAP_DAYS) continue;
            // Dedup: too close to previous round
            if (kept.length > 0 && diffDays(newSowRaw, kept[kept.length - 1].dateRaw) < MIN_SUCCESSION_GAP_DAYS) continue;
            // Viability: also drop rounds that would mature after first frost
            if (firstFrost) {
                const maturityDate = addDaysISO(newSowRaw, c.dtm ?? 30);
                if (maturityDate > firstFrost) continue;
            }
            kept.push({ ...s, dateRaw: newSowRaw });
        }
        newSuccessionDates = kept;
    }

    // ── Viability check ───────────────────────────────────────────────────
    // Would the crop mature (from the rebased/shifted start) before first frost?
    const rebasedHarvest = newHarvestStartDateRaw;
    const tooLateFromSeed = firstFrost && rebasedHarvest && rebasedHarvest > firstFrost;

    // Succession crops: keep and shift regardless
    if (isSuccessionCrop(c)) {
        return {
            ...c,
            indoorSeedDateRaw:   newIndoorSeedDateRaw,
            directSowDateRaw:    newDirectSowDateRaw,
            transplantDateRaw:   newTransplantDateRaw,
            harvestStartDateRaw: newHarvestStartDateRaw,
            harvestEndDateRaw:   newHarvestEndDateRaw,
            successionDates:     newSuccessionDates,
            _wasRebased: true,
        };
    }

    // Non-succession crops: run viability gate
    if (tooLateFromSeed) {
        // TP crop: can we still rescue via nursery starts?
        if (c.seedType === 'TP') {
            // Original transplant date (as computed by the calculator from last frost)
            const origTP = c.transplantDateRaw; // ORIGINAL (pre-rebase)

            if (origTP) {
                // Days until the original transplant window
                const daysToOrigTP = diffDays(origTP, todayISO);

                // Is the original transplant still upcoming (or within 30 days past)?
                // We allow 30 days grace — a nursery transplant a month late may still work
                // for some crops, but the code will push transplant to today if it's past.
                if (daysToOrigTP >= -30) {
                    // Rescue: "Buy starts" for the original transplant window
                    const actualTransplantDate = daysToOrigTP >= 0 ? origTP : todayISO;
                    const buyStartsDate = daysToOrigTP >= BUY_STARTS_LEAD_DAYS
                        ? addDaysISO(actualTransplantDate, -BUY_STARTS_LEAD_DAYS)
                        : todayISO; // if transplant is < 1 week away, buy NOW

                    // Harvest from this transplant date
                    const rescuedHarvest = c.dtm ? addDaysISO(actualTransplantDate, c.dtm) : null;
                    const rescuedHarvestEnd = rescuedHarvest && c.harvestWindowDays
                        ? addDaysISO(rescuedHarvest, c.harvestWindowDays)
                        : null;

                    return {
                        ...c,
                        // Suppress indoor seeding; let extractEvents see buy-starts path
                        indoorSeedDateRaw:   null,
                        directSowDateRaw:    null,
                        transplantDateRaw:   actualTransplantDate,
                        harvestStartDateRaw: rescuedHarvest,
                        harvestEndDateRaw:   rescuedHarvestEnd,
                        successionDates:     [],
                        recommendBuyStarts:  true,
                        _buyStartsDate:      buyStartsDate,
                        _buyTransplantDate:  actualTransplantDate,
                        _wasRebased:         true,
                        _rescuedViaNursery:  true,
                    };
                }
            }

            // No viable transplant window remaining → mute
            return { ...c, _mute: true };
        }

        // DS crop that's now too late → mute
        return { ...c, _mute: true };
    }

    // ── Crop is viable: return normally shifted dates ──────────────────────
    return {
        ...c,
        indoorSeedDateRaw:   newIndoorSeedDateRaw,
        directSowDateRaw:    newDirectSowDateRaw,
        transplantDateRaw:   newTransplantDateRaw,
        harvestStartDateRaw: newHarvestStartDateRaw,
        harvestEndDateRaw:   newHarvestEndDateRaw,
        successionDates:     newSuccessionDates,
        _wasRebased: true,
    };
}

// ─── Event extraction ─────────────────────────────────────────────────────────
function extractEvents(crops, firstFrost) {
    const events = [];

    for (const rawCrop of crops) {
        const c = auditCrop(rawCrop, firstFrost);

        // Crop was determined to be entirely infeasible for this season — skip it
        if (c._mute) continue;

        const germRate    = c.germRate ?? 0.75;
        const category    = c.category ?? '';

        // ── Unified formula (matches SeedShoppingList exactly) ────────────
        // seeds = ceil(plantsNeeded * 1.20 / germRate)
        const plantsNeededBase = c.plantsNeeded ?? 0;
        const seeds       = c.seedType && !c._isSpecial ? seedsNeeded(plantsNeededBase, germRate) : 0;
        const plantsToGrow = Math.ceil(plantsNeededBase * 1.20); // for tray sizing
        const perCell     = c.seedType === 'TP' ? seedsPerCell(germRate) : null; // cosmetic thinning hint only

        const tray        = c.seedType === 'TP' ? recommendTray(category, c.familySize) : null;
        const traysCount  = tray && plantsToGrow > 0 ? traysNeeded(plantsToGrow, tray) : null;
        const thin        = (c.seedType === 'TP') ? thinningNote(c.cropName, germRate) : null;
        const methodKey   = c.startMethod ?? 'direct_sow';
        const displayName = c.variety ? `${c.cropName} · ${c.variety}` : c.cropName;

        const push = (dateRaw, type, roundLabel = null, extraProps = {}) => {
            const date = parseISO(dateRaw);
            if (!date) return;
            const ws = startOfWeek(date);
            const hasSeedInfo = (type === 'indoor' || type === 'sow') && seeds > 0;
            events.push({
                date,
                weekKey:    isoDate(ws),
                monthKey:   `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`,
                monthLabel: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
                weekLabel:  weekLabel(ws),
                cropName:   c.cropName,
                displayName,
                type,
                roundLabel,
                methodKey,
                wasRebased:       c._wasRebased ?? false,
                rescuedViaNursery: c._rescuedViaNursery ?? false,
                seeds:       hasSeedInfo ? seeds : null,
                plants:      type === 'buy_starts' ? (c.plantsNeeded ?? 0) : null,
                tray:        type === 'indoor' && tray      ? tray       : null,
                traysCount:  type === 'indoor' && traysCount ? traysCount : null,
                perCell:     type === 'indoor' && perCell   ? perCell    : null,
                thinning:    type === 'indoor' ? thin : null,
                ...extraProps,
            });
        };

        // ── Decide which starting events to emit ──────────────────────────
        if (c.recommendBuyStarts || c._rescuedViaNursery) {
            // "Buy starts" chip: use the audit-computed date if present, else 7 days before transplant
            const buyDate = c._buyStartsDate
                ?? (c.transplantDateRaw ? addDaysISO(c.transplantDateRaw, -BUY_STARTS_LEAD_DAYS) : null);
            push(buyDate, 'buy_starts');
        } else {
            // Normal: indoor start or direct sow
            push(c.indoorSeedDateRaw, 'indoor');
        }

        push(c.directSowDateRaw,    'sow', c.successionDates?.length > 0 ? 'Round 1' : null);
        push(c.transplantDateRaw,   'transplant');
        push(c.harvestStartDateRaw, 'harvest');

        if (c.successionDates?.length > 0) {
            for (const s of c.successionDates) push(s.dateRaw, 'sow', `Round ${s.round}`);
        }
    }

    events.sort((a, b) => a.date - b.date);
    return events;
}

function groupEvents(events) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 1000 * 60 * 60 * 24;

    const mm = new Map();

    for (const ev of events) {
        const diffDaysVal = Math.round((ev.date - today) / msPerDay);

        // Safety net: drop stale events that slipped through
        if (diffDaysVal < -21 && ev.type !== 'harvest') continue;
        if (diffDaysVal < -45 && ev.type === 'harvest') continue;

        let sectionKey, sectionLabel, weekKey, weekLbl;

        if (diffDaysVal < 0) {
            sectionKey   = '00_overdue';
            sectionLabel = '⚠️ OVERDUE / ACT NOW';
            weekKey      = '00_w';
            weekLbl      = 'Missed within the last 3 weeks';
        } else if (diffDaysVal <= 7) {
            sectionKey   = '01_this_week';
            sectionLabel = '📍 THIS WEEK';
            weekKey      = '01_w';
            weekLbl      = 'Next 7 days';
        } else if (diffDaysVal <= 14) {
            sectionKey   = '02_next_week';
            sectionLabel = '🗓 NEXT WEEK';
            weekKey      = '02_w';
            weekLbl      = '8 to 14 days out';
        } else {
            sectionKey   = ev.monthKey;
            sectionLabel = ev.monthLabel;
            weekKey      = ev.weekKey;
            weekLbl      = ev.weekLabel;
        }

        if (!mm.has(sectionKey)) {
            mm.set(sectionKey, { monthLabel: sectionLabel, sectionKey, wm: new Map() });
        }
        const m = mm.get(sectionKey);
        if (!m.wm.has(weekKey)) {
            m.wm.set(weekKey, { weekLabel: weekLbl, weekKey, events: [] });
        }
        m.wm.get(weekKey).events.push(ev);
    }

    return [...mm.values()]
        .sort((a, b) => a.sectionKey.localeCompare(b.sectionKey))
        .map(m => ({
            monthLabel:  m.monthLabel,
            isHighlight: m.sectionKey.startsWith('0'),
            weeks: [...m.wm.values()].sort((a, b) => a.weekKey.localeCompare(b.weekKey)),
        }));
}

// ─── Chip component ───────────────────────────────────────────────────────────
function EventChip({ ev }) {
    const t  = EVENT_TYPES[ev.type] ?? EVENT_TYPES.sow;
    const sm = START_METHOD[ev.methodKey] ?? START_METHOD.direct_sow;

    return (
        <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
            {/* Top row: emoji + action label */}
            <View style={styles.chipTop}>
                <Text style={styles.chipEmoji}>{t.emoji}</Text>
                <Text style={[styles.chipType, { color: t.color }]} numberOfLines={1}>
                    {ev.roundLabel ? `${t.label} · ${ev.roundLabel}` : t.label}
                </Text>
            </View>

            {/* Crop name */}
            <Text style={[styles.chipCrop, { color: t.color }]} numberOfLines={2}>
                {ev.displayName}
            </Text>

            {ev.rescuedViaNursery && ev.type === 'buy_starts' ? (
                <View style={styles.nurseryBadge}>
                    <Text style={styles.nurseryText}>🌿 Nursery only — seed start window passed</Text>
                </View>
            ) : ev.wasRebased && (ev.type === 'sow' || ev.type === 'indoor') ? (
                <View style={styles.rebasedBadge}>
                    <Text style={styles.rebasedText}>⏩ Shifted to today</Text>
                </View>
            ) : null}

            {/* Seed count */}
            {ev.seeds != null && ev.seeds > 0 ? (
                <Text style={styles.chipSeeds}>🌾 {ev.seeds} seeds</Text>
            ) : null}

            {/* Plant count */}
            {ev.plants != null && ev.plants > 0 ? (
                <Text style={styles.chipSeeds}>🪴 {ev.plants} plants</Text>
            ) : null}

            {/* Tray / seeds-per-cell / thinning */}
            {ev.seeds != null ? (
                <View style={styles.chipExpanded}>
                    {ev.tray ? (
                        <Text style={styles.chipDetail}>
                            📦 {ev.tray.label}
                            {ev.traysCount != null
                                ? ` · ${ev.traysCount} ${ev.tray.type === 'pot'
                                    ? (ev.traysCount === 1 ? 'pot' : 'pots')
                                    : (ev.traysCount === 1 ? 'tray' : 'trays')}`
                                : ''}
                        </Text>
                    ) : null}
                    {ev.perCell != null ? (
                        <Text style={styles.chipDetail}>🔢 {ev.perCell}/cell</Text>
                    ) : null}
                    {ev.thinning ? (
                        <Text style={[styles.chipDetail, { color: '#7A4500', fontStyle: 'italic' }]}>
                            {ev.thinning}
                        </Text>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

// ─── Week and Month sections ──────────────────────────────────────────────────
function WeekSection({ week }) {
    return (
        <View style={styles.weekSection}>
            <Text style={styles.weekLabel}>{week.weekLabel}</Text>
            <View style={styles.chipGrid}>
                {week.events.map((ev, i) => (
                    <EventChip key={`${ev.weekKey}-${ev.displayName}-${ev.type}-${i}`} ev={ev} />
                ))}
            </View>
        </View>
    );
}

function MonthSection({ month }) {
    return (
        <View style={styles.monthSection}>
            <Text style={[styles.monthLabel, month.isHighlight && { color: '#E65100' }]}>
                {month.isHighlight ? month.monthLabel : month.monthLabel.toUpperCase()}
            </Text>
            <View style={[styles.monthDivider, month.isHighlight && { backgroundColor: '#E65100', opacity: 0.4 }]} />
            {month.weeks.map(w => <WeekSection key={w.weekKey} week={w} />)}
        </View>
    );
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
    return (
        <View>
            <View style={[styles.legend, { marginBottom: Spacing.md }]}>
                {Object.entries(EVENT_TYPES).map(([k, t]) => (
                    <View key={k} style={[styles.legendItem, { backgroundColor: t.bg, borderColor: t.border }]}>
                        <Text style={styles.legendEmoji}>{t.emoji}</Text>
                        <Text style={[styles.legendText, { color: t.color }]}>{t.label}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ActionCalendar({ crops, gardenProfile }) {
    if (!gardenProfile) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📍</Text>
                <Text style={styles.emptyTitle}>Add your location to unlock the calendar</Text>
                <Text style={styles.emptySub}>We need frost dates to calculate seeding and transplant dates.</Text>
            </View>
        );
    }

    // first_frost_date comes from gardenProfile (the raw API object)
    const firstFrost = gardenProfile.first_frost_date ?? null;

    const events = extractEvents(crops, firstFrost);

    if (events.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🗓</Text>
                <Text style={styles.emptyTitle}>No calendar events found</Text>
                <Text style={styles.emptySub}>Select crops with planting date data to populate the calendar.</Text>
            </View>
        );
    }

    const grouped = groupEvents(events);

    // Compute banner states
    const todayISO = isoDate(new Date());
    const hasRebased  = (crops ?? []).some(c => {
        const a = c.indoorSeedDateRaw ?? c.directSowDateRaw;
        return a && a < todayISO;
    });
    const hasMuted    = (crops ?? []).some(c => c._mute);
    const hasNursery  = (crops ?? []).some(c => c._rescuedViaNursery);

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
            {/* Frost date banner */}
            <View style={styles.frostBanner}>
                <Text style={styles.frostText}>
                    🗓 Based on last frost {gardenProfile.last_frost_date ?? 'date'} · {gardenProfile.address ?? 'your location'}
                    {firstFrost ? `  ·  First frost ${firstFrost}` : ''}
                </Text>
            </View>

            {/* Rebase notice */}
            {hasRebased ? (
                <View style={styles.rebaseBanner}>
                    <Text style={styles.rebaseBannerText}>
                        ⏩ Some planting windows were in the past. Dates have been shifted to start today — harvest and succession rounds adjusted accordingly.
                    </Text>
                </View>
            ) : null}

            {/* Nursery-rescue notice */}
            {hasNursery ? (
                <View style={styles.nurseryBanner}>
                    <Text style={styles.nurseryBannerText}>
                        🛍 One or more crops can no longer be started from seed in time. Their indoor-start chips have been replaced with "Buy Starts" reminders timed to your transplant window.
                    </Text>
                </View>
            ) : null}

            {/* Seed quantity disclaimer */}
            <View style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                    📊 Seed quantities include a 20% buffer for pest pressure, poor germination, and seasonal losses.
                </Text>
            </View>

            <Legend />

            {grouped.map(m => <MonthSection key={m.monthLabel} month={m} />)}

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    🌱 Dates are estimates based on your local frost calendar. Adjust based on real-time weather.
                </Text>
            </View>
        </ScrollView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.md,
        paddingBottom: 180,
    },

    frostBanner: {
        backgroundColor: Colors.primaryGreen,
        borderRadius: Radius.md,
        paddingVertical: 7,
        paddingHorizontal: 12,
        marginBottom: 6,
    },
    frostText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },

    rebaseBanner: {
        backgroundColor: '#FFF8E1',
        borderRadius: Radius.sm,
        borderLeftWidth: 3,
        borderLeftColor: '#F9A825',
        paddingVertical: 7,
        paddingHorizontal: 10,
        marginBottom: 6,
    },
    rebaseBannerText: {
        fontSize: 12,
        color: '#6D4C00',
        lineHeight: 16,
        fontStyle: 'italic',
    },

    nurseryBanner: {
        backgroundColor: '#F3E5F5',
        borderRadius: Radius.sm,
        borderLeftWidth: 3,
        borderLeftColor: '#6A1B9A',
        paddingVertical: 7,
        paddingHorizontal: 10,
        marginBottom: 6,
    },
    nurseryBannerText: {
        fontSize: 12,
        color: '#4A0072',
        lineHeight: 16,
        fontStyle: 'italic',
    },

    disclaimer: {
        backgroundColor: 'rgba(45,79,30,0.07)',
        borderRadius: Radius.sm,
        borderLeftWidth: 3,
        borderLeftColor: Colors.primaryGreen,
        paddingVertical: 6,
        paddingHorizontal: 10,
        marginBottom: Spacing.md,
    },
    disclaimerText: {
        fontSize: 12,
        color: Colors.primaryGreen,
        lineHeight: 16,
        fontStyle: 'italic',
    },

    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5,
        marginBottom: 6,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 3,
        paddingHorizontal: 7,
        borderRadius: Radius.full,
        borderWidth: 1,
    },
    legendEmoji: { fontSize: 11 },
    legendText:  { fontSize: 11, fontWeight: '500' },

    monthSection: { marginBottom: Spacing.xl },
    monthLabel: {
        fontSize: Typography.lg,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        letterSpacing: 1.5,
        marginBottom: 5,
    },
    monthDivider: {
        height: 2,
        backgroundColor: Colors.primaryGreen,
        borderRadius: 1,
        marginBottom: Spacing.sm,
        opacity: 0.25,
    },

    weekSection: { marginBottom: Spacing.sm },
    weekLabel: {
        fontSize: Typography.xs,
        fontWeight: Typography.semiBold,
        color: Colors.mutedText,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 5,
        paddingLeft: 2,
    },

    chipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    chip: {
        width: Platform.OS === 'web' ? 'calc(16.66% - 3.34px)' : '15.5%',
        minWidth: 52,
        borderRadius: 6,
        borderWidth: 1,
        padding: 5,
    },
    chipTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginBottom: 2,
    },
    chipEmoji:  { fontSize: 11 },
    chipType: {
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        flex: 1,
    },
    chipCrop: {
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 13,
        marginBottom: 3,
    },

    nurseryBadge: {
        backgroundColor: '#EDE7F6',
        borderRadius: 3,
        paddingHorizontal: 3,
        paddingVertical: 1,
        marginBottom: 2,
        alignSelf: 'flex-start',
    },
    nurseryText: {
        fontSize: 8,
        color: '#4A0072',
        fontWeight: '700',
    },
    rebasedBadge: {
        backgroundColor: '#FFF3CD',
        borderRadius: 3,
        paddingHorizontal: 3,
        paddingVertical: 1,
        marginBottom: 2,
        alignSelf: 'flex-start',
    },
    rebasedText: {
        fontSize: 10,
        color: '#7A4500',
        fontWeight: '700',
    },

    methodBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 3,
        marginBottom: 2,
    },
    methodText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    chipSeeds: {
        fontSize: 10,
        color: '#333',
        lineHeight: 13,
    },
    chipExpanded: {
        marginTop: 4,
        paddingTop: 4,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0,0,0,0.1)',
        gap: 2,
    },
    chipDetail: {
        fontSize: 10,
        color: '#444',
        lineHeight: 13,
    },

    emptyState: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        padding: Spacing.xl * 2,
    },
    emptyEmoji:  { fontSize: 48, marginBottom: 16 },
    emptyTitle: {
        fontSize: Typography.lg, fontWeight: Typography.bold,
        color: Colors.primaryGreen, textAlign: 'center', marginBottom: 10,
    },
    emptySub: {
        fontSize: Typography.sm, color: Colors.mutedText,
        textAlign: 'center', lineHeight: 20,
    },

    footer:     { paddingTop: Spacing.md, paddingBottom: Spacing.sm },
    footerText: {
        fontSize: Typography.xs, color: Colors.mutedText,
        textAlign: 'center', fontStyle: 'italic',
    },
});
