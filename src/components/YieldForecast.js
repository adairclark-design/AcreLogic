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
import { View, Text, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { getRetailPrice, getRegionName } from '../services/cropPricing';

function fmt(n) { return `$${n.toFixed(2)}`; }
function fmtRange(lo, hi) { return `${lo}–${hi} lbs`; }

// ─── Compact yield chip (10-across grid) ─────────────────────────────────────

function YieldChip({ crop, maxYield, zipCode, chipWidth }) {
    const pct = maxYield > 0 ? (crop.yieldHigh ?? 0) / maxYield : 0;
    const barW = `${Math.max(6, Math.round(pct * 100))}%`;
    const price = getRetailPrice(crop.cropId, crop.category, zipCode);
    const valueHigh = price != null ? Math.round((crop.yieldHigh ?? 0) * price) : null;
    const CAT_COLORS = {
        'Greens':'#2E7D32','Brassica':'#388E3C','Root':'#E65100',
        'Tuber':'#BF360C','Allium':'#6A1B9A','Legume':'#1565C0',
        'Herb':'#33691E','Nightshade':'#880E4F','Cucurbit':'#00695C',
        'Specialty':'#F57F17','Grain':'#F9A825','Fruit':'#C62828',
    };
    const accent = CAT_COLORS[crop.category] ?? '#2D4F1E';
    return (
        <View style={[styles.yChip, { borderColor: accent + '44', width: chipWidth }]}>
            <Text style={styles.yChipEmoji}>{crop.emoji ?? '🌿'}</Text>
            <Text style={[styles.yChipName, { color: accent }]} numberOfLines={2}>{crop.cropName}</Text>
            {crop.variety ? (
                <Text style={[styles.yChipName, { color: accent, fontSize: 8, opacity: 0.7, fontWeight: '400', marginTop: 0 }]} numberOfLines={1}>{crop.variety}</Text>
            ) : null}
            {/* Mini bar */}
            <View style={styles.yChipTrack}>
                <View style={[styles.yChipFill, { width: barW, backgroundColor: accent }]} />
            </View>
            <Text style={styles.yChipYield}>{crop.yieldLow ?? 0}–{crop.yieldHigh ?? 0} lbs</Text>
            {valueHigh != null ? (
                <Text style={[styles.yChipValue, { color: accent }]}>{fmt(valueHigh)}</Text>
            ) : null}
        </View>
    );
}

// ─── Breakdown table row ──────────────────────────────────────────────────────

function TableRow({ crop, isAlt, zipCode }) {
    const price = getRetailPrice(crop.cropId, crop.category, zipCode);
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

export default function YieldForecast({ crops, gardenProfile }) {
    const { width } = useWindowDimensions();
    const COLS     = width > 1100 ? 12 : width > 700 ? 8 : 5;
    const GAP      = 5;
    const HPAD     = 32;
    const chipWidth = Math.floor((width - HPAD - GAP * (COLS - 1)) / COLS);

    // Extract zip from gardenProfile — try explicit fields first, then regex on user input / address
    const _extractZip = (profile) => {
        if (!profile) return null;
        if (profile.zip)     return String(profile.zip);
        if (profile.zipCode) return String(profile.zipCode);
        if (profile._raw?.zip)     return String(profile._raw.zip);
        if (profile._raw?.zipCode) return String(profile._raw.zipCode);
        // Try regex on the original typed input (embedded by LocationStep)
        const inputMatch = profile._userInput?.match(/\b(\d{5})(?:-\d{4})?\b/);
        if (inputMatch) return inputMatch[1];
        // Try regex on the address string (may contain zip after geocoding)
        const addrMatch = profile.address?.match(/\b(\d{5})(?:-\d{4})?\b/);
        if (addrMatch) return addrMatch[1];
        return null;
    };
    const zipCode = _extractZip(gardenProfile);
    const regionName = getRegionName(zipCode);
    const hasRegion = zipCode && regionName !== 'National';
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

    // Retail value totals — use full crop-specific prices with regional adjustment
    const valueLow  = produceCrops.reduce((s, c) => {
        const p = getRetailPrice(c.cropId, c.category, zipCode);
        return s + (p != null ? (c.yieldLow ?? 0) * p : 0);
    }, 0);
    const valueHigh = produceCrops.reduce((s, c) => {
        const p = getRetailPrice(c.cropId, c.category, zipCode);
        return s + (p != null ? (c.yieldHigh ?? 0) * p : 0);
    }, 0);

    // Sort by yieldHigh descending for chip grid and table
    const sortedByYield = [...produceCrops].sort((a, b) => (b.yieldHigh ?? 0) - (a.yieldHigh ?? 0));
    const maxYield = sortedByYield[0]?.yieldHigh ?? 1;

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.container}
        >
            {/* ── Disclaimer banner — prominent, top of section ── */}
            <View style={styles.disclaimerCard}>
                <Text style={styles.disclaimerTitle}>⚠️ Estimates Only</Text>
                <Text style={styles.disclaimerBody}>
                    These are rough projections, not guarantees. Actual harvest depends on soil
                    quality, light, nutrients, pest pressure, water, and growing experience.
                    Yields may be significantly more or less than shown. All figures should be
                    used for planning purposes only.
                </Text>
            </View>

            {/* ── Hero metrics ── */}
            <View style={styles.hero}>
                <View style={styles.heroStat}>
                    <Text style={styles.heroValue}>{totalLow}–{totalHigh}</Text>
                    <Text style={styles.heroLabel}>seasonal goal (lbs)</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                    <Text style={styles.heroValue}>{fmt(valueLow)}–{fmt(valueHigh)}</Text>
                    <Text style={styles.heroLabel}>estimated retail value</Text>
                </View>
            </View>

            {/* ── Hero subtext ── */}
            <View style={styles.heroNote}>
                <Text style={styles.heroNoteText}>
                    Planting sized to your family's seasonal targets
                    {hasRegion ? ` · ${regionName} regional prices` : ' · national avg retail prices'}
                </Text>
            </View>

            {/* ── Context pill ── */}
            <View style={styles.contextRow}>
                <View style={styles.contextPill}>
                    <Text style={styles.contextText}>
                        🎯 {Math.round(totalTarget)} lbs targeted · {produceCrops.length} crops · {crops.length - specialCrops.length} producing
                    </Text>
                </View>
            </View>

            {/* ── Yield chip grid: 10-across ── */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Yield by Crop</Text>
                <Text style={styles.sectionSub}>Tap to see retail value · sorted by projected harvest</Text>
                <View style={styles.yChipGrid}>
                    {sortedByYield.map(c => (
                        <YieldChip
                            key={c.cropId}
                            crop={c}
                            maxYield={maxYield}
                            zipCode={zipCode}
                            chipWidth={chipWidth}
                        />
                    ))}
                </View>
            </View>

            {/* ── Full breakdown table ── */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Estimated Retail Value</Text>
                <Text style={styles.sectionSub}>USDA avg retail $/lb · crop-specific where available, category avg otherwise</Text>
                <View style={[styles.tableCard, Shadows.card]}>
                    {/* Header */}
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.tdCrop, styles.thText]}>Crop</Text>
                        <Text style={[styles.tdLbs, styles.thText]}>Yield</Text>
                        <Text style={[styles.tdPrice, styles.thText]}>$/lb</Text>
                        <Text style={[styles.tdValue, styles.thText]}>Est. Value</Text>
                    </View>
                    {sortedByYield.map((c, i) => (
                        <TableRow key={c.cropId} crop={c} isAlt={i % 2 === 1} zipCode={zipCode} />
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

    // ── Hero subtext ──────────────────────────────────────────────────────────
    heroNote: {
        alignItems: 'center',
        marginTop: 6,
        marginBottom: 2,
    },
    heroNoteText: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        fontStyle: 'italic',
        textAlign: 'center',
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

    // ── Table ────────────────────────────────────────────────────────────────────
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

    // ── Disclaimer card (top) ─────────────────────────────────────────────────
    disclaimerCard: {
        backgroundColor: '#FFF8E1',
        borderRadius: Radius.md,
        borderLeftWidth: 4,
        borderLeftColor: '#F9A825',
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: Spacing.md,
    },
    disclaimerTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#E65100',
        marginBottom: 4,
        letterSpacing: 0.3,
    },
    disclaimerBody: {
        fontSize: 10,
        color: '#795548',
        lineHeight: 15,
    },

    // ── Yield chip grid ───────────────────────────────────────────────────────
    yChipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5,
    },
    yChip: {
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        padding: 6,
        alignItems: 'center',
        ...Shadows.card,
    },
    yChipEmoji: { fontSize: 16, marginBottom: 2 },
    yChipName: {
        fontSize: 9,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 11,
        marginBottom: 3,
    },
    yChipTrack: {
        width: '100%',
        height: 4,
        backgroundColor: 'rgba(45,79,30,0.12)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 3,
    },
    yChipFill: {
        height: '100%',
        borderRadius: 2,
        opacity: 0.8,
    },
    yChipYield: {
        fontSize: 9,
        color: '#555',
        textAlign: 'center',
        lineHeight: 11,
    },
    yChipValue: {
        fontSize: 9,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 11,
        marginTop: 1,
    },

    // ── Notice ────────────────────────────────────────────────────────────────
    noticeCard: {
        backgroundColor: 'rgba(232,117,17,0.08)',
        borderRadius: Radius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    noticeText: { fontSize: Typography.xs, color: Colors.burntOrange ?? '#E65100' },

    // ── Disclaimer (bottom - now removed/replaced by top card) ─────────────────
    disclaimer: { paddingBottom: Spacing.sm },
    disclaimerText: { display: 'none' }, // kept for safety, actual display is disclaimerCard

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
