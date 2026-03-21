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
// Category baselines — used when no crop-specific override is present.
// Sources: USDA AMS Market News, national average retail 2023-2025.
const RETAIL_PRICE_PER_LB = {
    'Greens':     3.00,
    'Brassica':   2.50,
    'Root':       1.50,
    'Tuber':      1.00,
    'Allium':     1.75,   // updated: garlic & shallots skew higher than plain onion
    'Legume':     3.00,
    'Herb':       8.00,   // category median — overrides below handle wide spread
    'Nightshade': 2.75,
    'Cucurbit':   1.50,
    'Specialty':  3.00,
    'Grain':      1.00,
    'Fruit':      4.00,
    'Cover Crop': null,   // not harvested for food
    'Flower':     null,   // priced per stem, not weight
};

// ─── Crop-specific retail price overrides ─────────────────────────────────────
// Applied when a crop's real retail price diverges significantly from its
// category average. All values are national USDA AMS avg retail $/lb.
const CROP_RETAIL_OVERRIDES = {
    // ── Herbs: widest spread of any category ──────────────────────────────────
    cilantro_santo:        4.00,  // abundant, sold by bunch at grocery scale
    cilantro_slow_bolt:    4.00,
    parsley_flat_leaf:     6.00,
    parsley_root:          5.00,
    dill_fernleaf:         8.00,
    basil_genovese:       10.00,
    basil_thai:            8.00,
    basil_purple:          8.00,
    basil_lemon:           8.00,
    mint_spearmint:        8.00,
    mint_peppermint:       8.00,
    mint_apple:            7.00,
    chives_standard:       9.00,
    tarragon_french:      18.00,  // specialty, rarely sold in volume
    thyme_english:        16.00,
    lemon_thyme:          14.00,
    oregano_greek:        14.00,
    marjoram_standard:    14.00,
    sage_garden:          18.00,
    rosemary_tuscan_blue: 14.00,
    winter_savory:        14.00,
    summer_savory:        12.00,
    chamomile_german:     12.00,  // fresh weight; dried commands much more
    lemon_balm:            8.00,
    lovage_standard:      10.00,
    borage_standard:       8.00,
    stevia_standard:      12.00,
    korean_mint:           8.00,
    lemon_verbena:        14.00,
    fenugreek_standard:    5.00,
    caraway_standard:      6.00,
    epazote_standard:      5.00,
    vietnamese_coriander:  7.00,
    culantro:              6.00,
    echinacea_purpurea:   10.00,
    ashwagandha_standard:  8.00,
    // ── Root outliers (much higher than $1.50 category avg) ───────────────────
    ginger_rhizome:        6.00,  // fresh ginger retail avg
    turmeric_standard:     7.00,  // fresh turmeric root retail avg
    // ── Allium: garlic & shallots command premium over plain onion ────────────
    garlic_music:          8.00,  // fresh garlic, store avg
    shallots_ambition:     5.00,
    cipollini_onion:       3.00,
    // ── Nightshade: cherry tomatoes and sweet peppers fetch more ──────────────
    cherry_tomato_sungold: 5.00,  // cherry/grape tomatoes retail premium
    tomato_yellow_pear:    5.00,
    tomato_black_cherry:   5.00,
    tomato_large_red_cherry: 4.50,
    tomato_juliet:         4.50,
    pepper_shishito:       5.00,
    pepper_padron:         5.00,
    pepper_mini_sweet:     4.00,
    // ── Specialty crops ───────────────────────────────────────────────────────
    asparagus_millennium:  5.00,  // USDA avg fresh asparagus ~$4.50–$5.50/lb
    asparagus_purple:      5.50,
    asparagus_mary_washington: 5.00,
    artichoke_imperial:    4.00,  // per-head retail premium
    artichoke_violetto:    4.00,
    lemongrass_standard:   5.00,
    // ── Fruits & Berries ──────────────────────────────────────────────────────
    strawberry_seascape:   5.00,
    strawberry_alpine:     7.00,
    raspberry_everbearing: 8.00,
    blackberry_thornless:  6.00,
    currant_red:           6.00,
    currant_black:         6.00,
    elderberry_standard:   8.00,
    honeyberry_standard:   7.00,
    aronia_chokeberry:     5.00,
    goji_berry:            8.00,
};

const DEFAULT_RETAIL = 2.00;

// Look up retail price: crop-specific override first, then category baseline.
function priceFor(category, cropId) {
    if (cropId && CROP_RETAIL_OVERRIDES[cropId] != null) {
        return CROP_RETAIL_OVERRIDES[cropId];
    }
    const p = RETAIL_PRICE_PER_LB[category];
    return (p == null) ? null : p;
}

function fmt(n) { return `$${n.toFixed(2)}`; }
function fmtRange(lo, hi) { return `${lo}–${hi} lbs`; }

// ─── Bar chart helpers ────────────────────────────────────────────────────────

function BarRow({ crop, maxYield, barColor }) {
    const pct = maxYield > 0 ? (crop.yieldHigh ?? 0) / maxYield : 0;
    const barW = `${Math.max(4, Math.round(pct * 100))}%`;
    const price = priceFor(crop.category, crop.cropId);
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
    const price = priceFor(crop.category, crop.cropId);
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

    // Retail value totals — use crop-specific overrides where available
    const valueLow  = produceCrops.reduce((s, c) => {
        const p = priceFor(c.category, c.cropId);
        return s + (p != null ? (c.yieldLow ?? 0) * p : 0);
    }, 0);
    const valueHigh = produceCrops.reduce((s, c) => {
        const p = priceFor(c.category, c.cropId);
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
                    <Text style={styles.heroLabel}>seasonal goal (lbs)</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                    <Text style={styles.heroValue}>{fmt(valueLow)}–{fmt(valueHigh)}</Text>
                    <Text style={styles.heroLabel}>estimated retail value</Text>
                </View>
            </View>

            {/* ── Hero subtext — clarifies what the numbers mean ── */}
            <View style={styles.heroNote}>
                <Text style={styles.heroNoteText}>
                    Planting sized to your family's seasonal targets · retail value at USDA avg prices
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
                    📊 These numbers represent your planting targets, not guaranteed harvest yields.
                    "Seasonal goal" = lbs sized to your family's consumption needs (±20% range).
                    Retail values use USDA avg prices by crop — actual prices vary by region, season, and market.
                    True harvest depends on weather, soil quality, pest pressure, and growing experience.
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
