/**
 * YieldForecast.js
 * ════════════════
 * Season-level yield + retail market value forecast for "Your Planting Plan".
 *
 * Shows:
 *  - Grand total projected yield (lbs range)
 *  - Estimated retail value (based on USDA avg prices by category)
 *  - Visual horizontal bar chart: top-producing crops scaled proportionally
 *  - Full breakdown table: crop | target | yield range | $/lb | est value
 *
 * Flowers and Cover Crops are excluded from lbs math but noted separately.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

// ─── Retail price reference (USDA avg retail, $/lb) ─────────────────────────
const RETAIL_PRICE_PER_LB = {
    'Greens':     3.00,
    'Brassica':   2.50,
    'Root':       1.50,
    'Tuber':      1.00,
    'Allium':     1.25,
    'Legume':     3.00,
    'Herb':      10.00,
    'Nightshade': 2.75,
    'Cucurbit':   1.50,
    'Specialty':  3.00,
    'Grain':      1.00,
    'Fruit':      4.00,
    'Cover Crop': null,   // not harvested for food
    'Flower':     null,   // priced per stem, not weight
};

const DEFAULT_RETAIL = 2.00;

function priceFor(category) {
    const p = RETAIL_PRICE_PER_LB[category];
    return (p == null) ? null : p;
}

function fmt(n) { return `$${n.toFixed(2)}`; }
function fmtRange(lo, hi) { return `${lo}–${hi} lbs`; }

// ─── Bar chart helpers ────────────────────────────────────────────────────────

function BarRow({ crop, maxYield, barColor }) {
    const pct = maxYield > 0 ? (crop.yieldHigh ?? 0) / maxYield : 0;
    const barW = `${Math.max(4, Math.round(pct * 100))}%`;
    const price = priceFor(crop.category);
    const valueLow  = price != null ? Math.round((crop.yieldLow  ?? 0) * price) : null;
    const valueHigh = price != null ? Math.round((crop.yieldHigh ?? 0) * price) : null;

    return (
        <View style={styles.barRow}>
            <Text style={styles.barCropName} numberOfLines={1}>
                {crop.emoji ? `${crop.emoji}  ` : ''}{crop.cropName}
                {crop.variety ? <Text style={styles.barVariety}> · {crop.variety}</Text> : null}
            </Text>
            <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: barW, backgroundColor: barColor }]} />
            </View>
            <View style={styles.barStats}>
                <Text style={styles.barLbs}>{fmtRange(crop.yieldLow ?? 0, crop.yieldHigh ?? 0)}</Text>
                {valueLow != null && (
                    <Text style={styles.barValue}>{fmt(valueLow)}–{fmt(valueHigh)}</Text>
                )}
            </View>
        </View>
    );
}

// ─── Breakdown table row ──────────────────────────────────────────────────────

function TableRow({ crop, isAlt }) {
    const price = priceFor(crop.category);
    const valueLow  = price != null ? Math.round((crop.yieldLow  ?? 0) * price) : null;
    const valueHigh = price != null ? Math.round((crop.yieldHigh ?? 0) * price) : null;

    return (
        <View style={[styles.tableRow, isAlt && styles.tableRowAlt]}>
            <Text style={styles.tdCrop} numberOfLines={1}>
                {crop.cropName}{crop.variety ? ` (${crop.variety})` : ''}
            </Text>
            <Text style={styles.tdLbs}>{fmtRange(crop.yieldLow ?? 0, crop.yieldHigh ?? 0)}</Text>
            <Text style={[styles.tdPrice, price == null && styles.tdPriceMuted]}>
                {price != null ? `${fmt(price)}/lb` : '—'}
            </Text>
            <Text style={styles.tdValue}>
                {valueLow != null ? `${fmt(valueLow)}–${fmt(valueHigh)}` : '—'}
            </Text>
        </View>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function YieldForecast({ crops }) {
    // Separate produce crops from flowers / cover crops
    const produceCrops = crops.filter(c =>
        !c.isFlower && c.yieldLow != null && c.yieldHigh != null && c.yieldHigh > 0
    );
    const specialCrops = crops.filter(c =>
        c.isFlower || !c.yieldLow || c.yieldHigh === 0
    );

    if (produceCrops.length === 0) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📊</Text>
                <Text style={styles.emptyTitle}>No yield data available</Text>
                <Text style={styles.emptySub}>
                    Select produce crops (vegetables, herbs, fruit) to see your yield forecast.
                </Text>
            </View>
        );
    }

    // Aggregate totals
    const totalLow  = produceCrops.reduce((s, c) => s + (c.yieldLow  ?? 0), 0);
    const totalHigh = produceCrops.reduce((s, c) => s + (c.yieldHigh ?? 0), 0);
    const totalTarget = produceCrops.reduce((s, c) => s + (c.targetLbs ?? 0), 0);

    // Retail value totals
    const valueLow  = produceCrops.reduce((s, c) => {
        const p = priceFor(c.category);
        return s + (p != null ? (c.yieldLow ?? 0) * p : 0);
    }, 0);
    const valueHigh = produceCrops.reduce((s, c) => {
        const p = priceFor(c.category);
        return s + (p != null ? (c.yieldHigh ?? 0) * p : 0);
    }, 0);

    // Sort by yieldHigh descending for bar chart
    const sortedByYield = [...produceCrops].sort((a, b) => (b.yieldHigh ?? 0) - (a.yieldHigh ?? 0));
    const maxYield = sortedByYield[0]?.yieldHigh ?? 1;

    // Category color palette for bar chart
    const CAT_COLORS = {
        'Greens': '#2E7D32', 'Brassica': '#388E3C', 'Root': '#E65100',
        'Tuber': '#BF360C', 'Allium': '#6A1B9A', 'Legume': '#1565C0',
        'Herb': '#33691E', 'Nightshade': '#880E4F', 'Cucurbit': '#00695C',
        'Specialty': '#F57F17', 'Grain': '#F9A825', 'Fruit': '#C62828',
    };
    function barColor(cat) { return CAT_COLORS[cat] ?? Colors.primaryGreen; }

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.container}
        >
            {/* ── Hero metrics ── */}
            <View style={styles.hero}>
                <View style={styles.heroStat}>
                    <Text style={styles.heroValue}>{totalLow}–{totalHigh}</Text>
                    <Text style={styles.heroLabel}>lbs of food</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                    <Text style={styles.heroValue}>{fmt(valueLow)}–{fmt(valueHigh)}</Text>
                    <Text style={styles.heroLabel}>retail market value</Text>
                </View>
            </View>

            {/* ── Context pill ── */}
            <View style={styles.contextRow}>
                <View style={styles.contextPill}>
                    <Text style={styles.contextText}>
                        🎯 {Math.round(totalTarget)} lbs goal · {produceCrops.length} crops · {crops.length - specialCrops.length} producing
                    </Text>
                </View>
            </View>

            {/* ── Bar chart: yield by crop ── */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Yield by Crop</Text>
                <Text style={styles.sectionSub}>Sorted by projected harvest (high estimate)</Text>
                <View style={[styles.card, Shadows.card]}>
                    {sortedByYield.map(c => (
                        <BarRow
                            key={c.cropId}
                            crop={c}
                            maxYield={maxYield}
                            barColor={barColor(c.category)}
                        />
                    ))}
                </View>
            </View>

            {/* ── Full breakdown table ── */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Retail Value Breakdown</Text>
                <Text style={styles.sectionSub}>Based on USDA avg retail prices by crop type</Text>
                <View style={[styles.tableCard, Shadows.card]}>
                    {/* Header */}
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.tdCrop, styles.thText]}>Crop</Text>
                        <Text style={[styles.tdLbs, styles.thText]}>Yield</Text>
                        <Text style={[styles.tdPrice, styles.thText]}>$/lb</Text>
                        <Text style={[styles.tdValue, styles.thText]}>Est. Value</Text>
                    </View>
                    {sortedByYield.map((c, i) => (
                        <TableRow key={c.cropId} crop={c} isAlt={i % 2 === 1} />
                    ))}
                    {/* Total row */}
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total</Text>
                        <Text style={styles.totalLbs}>{fmtRange(totalLow, totalHigh)}</Text>
                        <Text style={styles.totalPrice}> </Text>
                        <Text style={styles.totalValue}>{fmt(valueLow)}–{fmt(valueHigh)}</Text>
                    </View>
                </View>
            </View>

            {/* ── Flowers / non-food note ── */}
            {specialCrops.length > 0 && (
                <View style={styles.noticeCard}>
                    <Text style={styles.noticeText}>
                        🌸 {specialCrops.length} crop{specialCrops.length !== 1 ? 's' : ''} not included in yield totals:
                        {' '}{specialCrops.map(c => c.cropName).join(', ')}.
                        Flowers and cover crops are tracked separately.
                    </Text>
                </View>
            )}

            {/* ── Disclaimer ── */}
            <View style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                    📊 Yields are estimates based on a ±20% range of your family's seasonal goals.
                    Retail prices reflect USDA averages and vary by region and season.
                    Actual harvests depend on weather, soil quality, and growing conditions.
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

    // ── Hero ──────────────────────────────────────────────────────────────────
    hero: {
        flexDirection: 'row',
        backgroundColor: Colors.primaryGreen,
        borderRadius: Radius.lg,
        paddingVertical: 18,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroStat: { alignItems: 'center', flex: 1 },
    heroValue: {
        fontSize: 20,
        fontWeight: Typography.bold,
        color: '#fff',
        textAlign: 'center',
    },
    heroLabel: {
        fontSize: Typography.xs,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 3,
        textAlign: 'center',
    },
    heroDivider: {
        width: 1, height: 40,
        backgroundColor: 'rgba(255,255,255,0.25)',
        marginHorizontal: Spacing.lg,
    },

    // ── Context row ───────────────────────────────────────────────────────────
    contextRow: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    contextPill: {
        backgroundColor: 'rgba(45,79,30,0.08)',
        borderRadius: Radius.full,
        paddingVertical: 5,
        paddingHorizontal: 14,
    },
    contextText: {
        fontSize: Typography.xs,
        color: Colors.primaryGreen,
        fontWeight: Typography.medium,
    },

    // ── Sections ──────────────────────────────────────────────────────────────
    section: { marginBottom: Spacing.xl },
    sectionTitle: {
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        marginBottom: 2,
    },
    sectionSub: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        marginBottom: Spacing.sm,
    },

    // ── Bar chart card ────────────────────────────────────────────────────────
    card: {
        backgroundColor: '#fff',
        borderRadius: Radius.md,
        padding: Spacing.md,
        gap: 12,
    },
    barRow: { gap: 4 },
    barCropName: {
        fontSize: Typography.sm,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
    },
    barVariety: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        fontWeight: Typography.regular ?? '400',
    },
    barTrack: {
        height: 10,
        backgroundColor: 'rgba(45,79,30,0.1)',
        borderRadius: Radius.full,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: Radius.full,
        opacity: 0.85,
    },
    barStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    barLbs: { fontSize: Typography.xs, color: Colors.mutedText },
    barValue: {
        fontSize: Typography.xs,
        color: Colors.burntOrange ?? '#BF360C',
        fontWeight: Typography.semiBold,
    },

    // ── Table ─────────────────────────────────────────────────────────────────
    tableCard: {
        backgroundColor: '#fff',
        borderRadius: Radius.md,
        overflow: 'hidden',
    },
    tableHeader: { backgroundColor: Colors.primaryGreen },
    thText: {
        fontSize: Typography.xs,
        color: '#fff',
        fontWeight: Typography.semiBold,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    tableRowAlt: { backgroundColor: 'rgba(45,79,30,0.04)' },
    tdCrop: { flex: 2, fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.medium },
    tdLbs:  { flex: 2, fontSize: Typography.xs, color: Colors.mutedText, textAlign: 'center' },
    tdPrice:{ flex: 1, fontSize: Typography.xs, color: Colors.mutedText, textAlign: 'center' },
    tdPriceMuted: { opacity: 0.5 },
    tdValue:{ flex: 2, fontSize: Typography.xs, color: Colors.burntOrange ?? '#BF360C', textAlign: 'right', fontWeight: Typography.semiBold },
    totalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderTopWidth: 2,
        borderTopColor: Colors.primaryGreen,
    },
    totalLabel: { flex: 2, fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    totalLbs:   { flex: 2, fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen, textAlign: 'center' },
    totalPrice: { flex: 1 },
    totalValue: { flex: 2, fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen, textAlign: 'right' },

    // ── Notice ────────────────────────────────────────────────────────────────
    noticeCard: {
        backgroundColor: 'rgba(232,117,17,0.08)',
        borderRadius: Radius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    noticeText: { fontSize: Typography.xs, color: Colors.burntOrange ?? '#E65100' },

    // ── Disclaimer ────────────────────────────────────────────────────────────
    disclaimer: { paddingBottom: Spacing.sm },
    disclaimerText: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        textAlign: 'center',
        fontStyle: 'italic',
        lineHeight: 18,
    },

    // ── Empty ─────────────────────────────────────────────────────────────────
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl * 2 },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyTitle: {
        fontSize: Typography.lg,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        textAlign: 'center',
        marginBottom: 10,
    },
    emptySub: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center', lineHeight: 20 },
});
