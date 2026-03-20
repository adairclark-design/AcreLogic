/**
 * ActionCalendar.js
 * ══════════════════
 * Chronological action calendar for the "Your Planting Plan" Step 2.
 * Groups all planting events by month → week and renders them in date order.
 *
 * Events extracted per crop:
 *   🌱 Start seeds indoors  — indoorSeedDateRaw
 *   💧 Direct sow           — directSowDateRaw
 *   🌤 Transplant outdoors  — transplantDateRaw
 *   ✂️  Harvest begins       — harvestStartDateRaw
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

function parseISO(dateStr) {
    // Handles "2026-04-15" or Date objects
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Returns "Week of Apr 7" label for a given JS Date */
function weekLabel(date) {
    const month = MONTH_NAMES[date.getMonth()].slice(0, 3);
    const day   = date.getDate();
    return `Week of ${month} ${day}`;
}

/** Returns the Monday of the week containing `date` */
function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sun
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // back to Monday
    return d;
}

function isoDate(date) {
    return date.toISOString().split('T')[0];
}

// ─── Event extraction ─────────────────────────────────────────────────────────

const EVENT_TYPES = {
    indoor:    { emoji: '🌱', label: 'Start seeds indoors', color: '#2E7D32', bg: '#E8F5E9' },
    sow:       { emoji: '💧', label: 'Direct sow outdoors',  color: '#1565C0', bg: '#E3F2FD' },
    transplant:{ emoji: '🌤', label: 'Transplant outdoors',  color: '#F57F17', bg: '#FFF9C4' },
    harvest:   { emoji: '✂️', label: 'Harvest begins',       color: '#BF360C', bg: '#FBE9E7' },
};

/**
 * Extracts all calendar events from a list of crop plan items.
 * Returns a flat array of { date, weekKey, cropName, variety, type, roundLabel? }
 */
function extractEvents(crops) {
    const events = [];

    for (const c of crops) {
        const name = c.variety
            ? `${c.cropName} (${c.variety})`
            : c.cropName;

        const push = (dateRaw, type, roundLabel = null) => {
            const date = parseISO(dateRaw);
            if (!date) return;
            const weekStart = startOfWeek(date);
            events.push({
                date,
                weekStart,
                weekKey: isoDate(weekStart), // "2026-04-06" for sorting
                monthKey: `${date.getFullYear()}-${String(date.getMonth()).padStart(2,'0')}`,
                monthLabel: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
                weekLabel: weekLabel(weekStart),
                cropName: c.cropName,
                variety: c.variety,
                displayName: name,
                type,
                roundLabel,   // e.g. "Round 2" for succession events
            });
        };

        push(c.indoorSeedDateRaw,  'indoor');
        // Round 1 direct sow (label it only if there are succession rounds)
        push(c.directSowDateRaw,   'sow', c.successionDates?.length > 0 ? 'Round 1' : null);
        push(c.transplantDateRaw,  'transplant');
        push(c.harvestStartDateRaw,'harvest');

        // Succession rounds (Round 2, 3, …)
        if (c.successionDates?.length > 0) {
            for (const succ of c.successionDates) {
                push(succ.dateRaw, 'sow', `Round ${succ.round}`);
            }
        }
    }

    // Sort by date ascending
    events.sort((a, b) => a.date - b.date);
    return events;
}

/**
 * Groups events into { monthLabel, weeks: [{ weekLabel, weekKey, events[] }] }[]
 */
function groupEvents(events) {
    const monthMap = new Map(); // monthKey → { monthLabel, weekMap }

    for (const ev of events) {
        if (!monthMap.has(ev.monthKey)) {
            monthMap.set(ev.monthKey, { monthLabel: ev.monthLabel, weekMap: new Map() });
        }
        const month = monthMap.get(ev.monthKey);
        if (!month.weekMap.has(ev.weekKey)) {
            month.weekMap.set(ev.weekKey, { weekLabel: ev.weekLabel, weekKey: ev.weekKey, events: [] });
        }
        month.weekMap.get(ev.weekKey).events.push(ev);
    }

    // Convert maps to arrays, sorted by key
    return [...monthMap.entries()]
        .sort(([a],[b]) => a.localeCompare(b))
        .map(([, month]) => ({
            monthLabel: month.monthLabel,
            weeks: [...month.weekMap.values()].sort((a,b) => a.weekKey.localeCompare(b.weekKey)),
        }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventRow({ ev }) {
    const t = EVENT_TYPES[ev.type];
    const actionLabel = ev.roundLabel
        ? `${t.label} — ${ev.roundLabel}`
        : t.label;
    return (
        <View style={[styles.eventRow, { backgroundColor: t.bg }]}>
            <Text style={styles.eventEmoji}>{t.emoji}</Text>
            <View style={{ flex: 1 }}>
                <Text style={[styles.eventCrop, { color: t.color }]} numberOfLines={1}>
                    {ev.displayName}
                </Text>
                <Text style={styles.eventAction}>{actionLabel}</Text>
            </View>
        </View>
    );
}

function WeekSection({ week }) {
    return (
        <View style={styles.weekSection}>
            <Text style={styles.weekLabel}>{week.weekLabel}</Text>
            {week.events.map((ev, i) => (
                <EventRow key={`${ev.weekKey}-${ev.displayName}-${ev.type}-${i}`} ev={ev} />
            ))}
        </View>
    );
}

function MonthSection({ month }) {
    return (
        <View style={styles.monthSection}>
            <Text style={styles.monthLabel}>{month.monthLabel.toUpperCase()}</Text>
            <View style={styles.monthDivider} />
            {month.weeks.map(week => (
                <WeekSection key={week.weekKey} week={week} />
            ))}
        </View>
    );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
    return (
        <View style={styles.legend}>
            {Object.entries(EVENT_TYPES).map(([key, t]) => (
                <View key={key} style={[styles.legendItem, { backgroundColor: t.bg }]}>
                    <Text style={styles.legendEmoji}>{t.emoji}</Text>
                    <Text style={[styles.legendText, { color: t.color }]}>{t.label}</Text>
                </View>
            ))}
        </View>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActionCalendar({ crops, gardenProfile }) {
    // No-location fallback
    if (!gardenProfile) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📍</Text>
                <Text style={styles.emptyTitle}>Add your location to unlock the calendar</Text>
                <Text style={styles.emptySub}>
                    We need your frost dates to calculate exact seeding, transplanting, and harvest dates.
                    Go back and enter your zip code or city.
                </Text>
            </View>
        );
    }

    const events = extractEvents(crops);

    if (events.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🗓</Text>
                <Text style={styles.emptyTitle}>No calendar events found</Text>
                <Text style={styles.emptySub}>
                    Try selecting crops with planting date data to populate the calendar.
                </Text>
            </View>
        );
    }

    const grouped = groupEvents(events);

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.container}
        >
            {/* Frost date banner */}
            <View style={styles.frostBanner}>
                <Text style={styles.frostText}>
                    🗓 Based on last frost {gardenProfile.last_frost_date ?? 'date'} · {gardenProfile.address ?? 'your location'}
                </Text>
            </View>

            {/* Legend */}
            <Legend />

            {/* Event timeline */}
            {grouped.map(month => (
                <MonthSection key={month.monthLabel} month={month} />
            ))}

            {/* Footer */}
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
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: 180,
    },

    // ── Frost banner ─────────────────────────────────────────────────────────
    frostBanner: {
        backgroundColor: Colors.primaryGreen,
        borderRadius: Radius.md,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginBottom: Spacing.md,
    },
    frostText: {
        color: '#fff',
        fontSize: Typography.sm,
        fontWeight: Typography.medium,
        textAlign: 'center',
    },

    // ── Legend ────────────────────────────────────────────────────────────────
    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: Spacing.lg,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: Radius.full,
    },
    legendEmoji: { fontSize: 11 },
    legendText: { fontSize: 11, fontWeight: Typography.medium },

    // ── Month section ─────────────────────────────────────────────────────────
    monthSection: {
        marginBottom: Spacing.xl,
    },
    monthLabel: {
        fontSize: Typography.lg,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    monthDivider: {
        height: 2,
        backgroundColor: Colors.primaryGreen,
        borderRadius: 1,
        marginBottom: Spacing.md,
        opacity: 0.25,
    },

    // ── Week section ──────────────────────────────────────────────────────────
    weekSection: {
        marginBottom: Spacing.md,
    },
    weekLabel: {
        fontSize: Typography.xs,
        fontWeight: Typography.semiBold,
        color: Colors.mutedText,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
        paddingLeft: 2,
    },

    // ── Event row ─────────────────────────────────────────────────────────────
    eventRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: Radius.sm,
        marginBottom: 4,
    },
    eventEmoji: { fontSize: 18 },
    eventCrop: {
        fontSize: Typography.sm,
        fontWeight: Typography.semiBold,
    },
    eventAction: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        marginTop: 1,
    },

    // ── Empty state ───────────────────────────────────────────────────────────
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl * 2,
    },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyTitle: {
        fontSize: Typography.lg,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        textAlign: 'center',
        marginBottom: 10,
    },
    emptySub: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        textAlign: 'center',
        lineHeight: 20,
    },

    // ── Footer ────────────────────────────────────────────────────────────────
    footer: {
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
    },
    footerText: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});
