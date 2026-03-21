/**
 * SeedShoppingList.js
 * ════════════════════
 * Renders a categorized seed shopping list for "Your Planting Plan" Step 2.
 *
 * Groups crops into:
 *   🌱 Direct Sow     — seeds planted straight in the ground
 *   🪴 Start Indoors  — seeds germinated inside (or buy as nursery transplants)
 *   🛒 Special Purchase — tubers, rhizomes, bare-root plants (not from seed)
 *
 * Uses category-level seeds-per-packet and price references to calculate:
 *   packets = Math.ceil(seedsToStart / seedsPerPacket)
 *   line total = packets × pricePerPacket
 */
import React from 'react';
import {
    View, Text, ScrollView, StyleSheet, Image,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import CROP_IMAGES from '../data/cropImages';

// ─── Reference tables ─────────────────────────────────────────────────────────

/**
 * Approximate seeds per standard retail packet and avg retail price.
 * Sources: Johnny's, Baker Creek, High Mowings' average packet specs.
 */
const CATEGORY_SPECS = {
    'Greens':     { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    'Brassica':   { seedsPerPacket: 150, price: 3.99, unit: 'seeds' },
    'Root':       { seedsPerPacket: 300, price: 3.49, unit: 'seeds' },
    'Tuber':      { seedsPerPacket:   1, price: 4.99, unit: 'starts', isSpecial: true },
    // Allium: leeks, scallions, chives sold as seeds (~200–500/pkt).
    // Garlic and shallots handled by CROP_SPECS_OVERRIDE below.
    'Allium':     { seedsPerPacket: 300, price: 3.49, unit: 'seeds' },
    'Legume':     { seedsPerPacket:  60, price: 3.99, unit: 'seeds' },
    // Herb median: coarse herbs ~75–100/pkt, fine herbs ~200–500/pkt → 150 is a fair middle
    'Herb':       { seedsPerPacket: 150, price: 3.99, unit: 'seeds' },
    'Nightshade': { seedsPerPacket:  25, price: 4.99, unit: 'seeds' },
    'Cucurbit':   { seedsPerPacket:  20, price: 4.49, unit: 'seeds' },
    'Flower':     { seedsPerPacket:  50, price: 4.49, unit: 'seeds' },
    'Specialty':  { seedsPerPacket:  40, price: 4.99, unit: 'seeds' },
    'Grain':      { seedsPerPacket: 200, price: 3.49, unit: 'seeds' },
    'Fruit':      { seedsPerPacket:   1, price: 6.99, unit: 'plants', isSpecial: true },
    'Cover Crop': { seedsPerPacket: 500, price: 3.99, unit: 'seeds' },
};

/**
 * Per-crop overrides — used when a specific crop diverges significantly
 * from its category average in packet size, price, or purchase type.
 *
 * isSpecial = true  →  crop goes in the "Buy as Starts" section
 *                       (sold as bulbs, sets, slips, roots — not from seed)
 */
const CROP_SPECS_OVERRIDE = {
    // ── Garlic ── sold as individual cloves/bulbs, never from seed ────────────
    garlic_music:          { seedsPerPacket: 1, price:  8.99, unit: 'bulbs', isSpecial: true },
    rocambole_garlic:      { seedsPerPacket: 1, price:  8.99, unit: 'bulbs', isSpecial: true },
    elephant_garlic:       { seedsPerPacket: 1, price:  9.99, unit: 'bulbs', isSpecial: true },
    // ── Shallots & specialty alliums ── sold as sets or bare-root ─────────────
    shallots_ambition:     { seedsPerPacket: 1, price:  5.99, unit: 'sets',  isSpecial: true },
    shallot:               { seedsPerPacket: 1, price:  5.99, unit: 'sets',  isSpecial: true },
    walking_onion:         { seedsPerPacket: 1, price:  5.99, unit: 'sets',  isSpecial: true },
    potato_onion:          { seedsPerPacket: 1, price:  5.99, unit: 'sets',  isSpecial: true },
    ramps_wild:            { seedsPerPacket: 1, price:  7.99, unit: 'roots', isSpecial: true },
    // garlic_chives IS grown from seed, stays in normal Allium flow
    // ── Fine herbs ── small-count packets ($4–6, 50–100 seeds) ────────────────
    lavender_hidcote:      { seedsPerPacket:  50, price: 5.99, unit: 'seeds' },
    rosemary_tuscan_blue:  { seedsPerPacket:  75, price: 4.99, unit: 'seeds' },
    sage_garden:           { seedsPerPacket:  75, price: 4.49, unit: 'seeds' },
    thyme_english:         { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    lemon_thyme:           { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    tarragon_french:       { seedsPerPacket:  50, price: 5.99, unit: 'seeds' },
    winter_savory:         { seedsPerPacket:  75, price: 4.49, unit: 'seeds' },
    summer_savory:         { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    marjoram_standard:     { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    oregano_greek:         { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    chamomile_german:      { seedsPerPacket: 200, price: 3.99, unit: 'seeds' },
    stevia_standard:       { seedsPerPacket:  75, price: 5.49, unit: 'seeds' },
    echinacea_purpurea:    { seedsPerPacket:  50, price: 4.99, unit: 'seeds' },
    ashwagandha_standard:  { seedsPerPacket:  50, price: 5.49, unit: 'seeds' },
    // ── High-count herbs ── large packets ($3–4, 300–500 seeds) ──────────────
    basil_genovese:        { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    basil_thai:            { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    basil_purple:          { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    basil_lemon:           { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    cilantro_santo:        { seedsPerPacket: 500, price: 3.49, unit: 'seeds' },
    cilantro_slow_bolt:    { seedsPerPacket: 500, price: 3.49, unit: 'seeds' },
    parsley_flat_leaf:     { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    parsley_root:          { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    dill_fernleaf:         { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    chives_standard:       { seedsPerPacket: 200, price: 3.49, unit: 'seeds' },
    mint_spearmint:        { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    mint_peppermint:       { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    mint_apple:            { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    lemon_balm:            { seedsPerPacket: 200, price: 3.99, unit: 'seeds' },
    // ── Nightshade: fine-scale corrections ───────────────────────────────────
    pepper_ghost:          { seedsPerPacket:  10, price: 5.99, unit: 'seeds' },  // rare peppers: tiny packets
    pepper_aji_amarillo:   { seedsPerPacket:  15, price: 5.49, unit: 'seeds' },
    pepper_shishito:       { seedsPerPacket:  25, price: 4.99, unit: 'seeds' },
    pepper_padron:         { seedsPerPacket:  25, price: 4.99, unit: 'seeds' },
    // ── Specialty alliums grown from seed at higher counts ────────────────────
    leek_giant_musselburgh:{ seedsPerPacket: 300, price: 3.49, unit: 'seeds' },
    scallions_evergreen:   { seedsPerPacket: 500, price: 3.49, unit: 'seeds' },
    japanese_bunching_onion:{ seedsPerPacket: 300, price: 3.99, unit: 'seeds' },
    welsh_onion:           { seedsPerPacket: 300, price: 3.99, unit: 'seeds' },
    cipollini_onion:       { seedsPerPacket: 200, price: 3.99, unit: 'seeds' },
    pickling_onion:        { seedsPerPacket: 200, price: 3.49, unit: 'seeds' },
};

const DEFAULT_SPECS = { seedsPerPacket: 50, price: 4.99, unit: 'seeds' };

// Check crop-specific override first, then fall back to category average.
function specsFor(crop) {
    return CROP_SPECS_OVERRIDE[crop.cropId] ?? CATEGORY_SPECS[crop.category] ?? DEFAULT_SPECS;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
    return `$${n.toFixed(2)}`;
}

function packetsLabel(n) {
    return n === 1 ? '1 packet' : `${n} packets`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ emoji, title, subtitle }) {
    return (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionEmoji}>{emoji}</Text>
            <View>
                <Text style={styles.sectionTitle}>{title}</Text>
                {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
            </View>
        </View>
    );
}

function ShoppingRow({ crop }) {
    const specs = specsFor(crop);
    const qty   = crop.seedsToStart ?? crop.plantsNeeded ?? crop.seedsToStart ?? 1;

    // For special-purchase crops (tubers, bare root) show individual unit count
    if (specs.isSpecial) {
        const lineTotal = qty * specs.price;
        return (
            <View style={[styles.row, Shadows.card]}>
                <View style={styles.rowImage}>
                    {CROP_IMAGES[crop.cropId]
                        ? <Image source={CROP_IMAGES[crop.cropId]} style={styles.rowImg} resizeMode="cover" />
                        : <Text style={styles.rowEmoji}>{crop.emoji ?? '🌱'}</Text>
                    }
                </View>
                <View style={styles.rowMain}>
                    <Text style={styles.rowName} numberOfLines={1}>
                        {crop.cropName}{crop.variety ? ` · ${crop.variety}` : ''}
                    </Text>
                    <Text style={styles.rowDetail}>
                        {qty} {specs.unit}  ·  {fmt(specs.price)}/ea
                    </Text>
                </View>
                <View style={styles.rowRight}>
                    <Text style={styles.rowPackets}>{qty} {specs.unit}</Text>
                    <Text style={styles.rowPrice}>{fmt(lineTotal)}</Text>
                </View>
            </View>
        );
    }

    const packets   = Math.max(1, Math.ceil(qty / specs.seedsPerPacket));
    const lineTotal = packets * specs.price;

    return (
        <View style={[styles.row, Shadows.card]}>
            <View style={styles.rowImage}>
                {CROP_IMAGES[crop.cropId]
                    ? <Image source={CROP_IMAGES[crop.cropId]} style={styles.rowImg} resizeMode="cover" />
                    : <Text style={styles.rowEmoji}>{crop.emoji ?? '🌱'}</Text>
                }
            </View>
            <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>
                    {crop.cropName}{crop.variety ? ` · ${crop.variety}` : ''}
                </Text>
                <Text style={styles.rowDetail}>
                    {qty} seeds needed  ·  ~{specs.seedsPerPacket}/packet
                </Text>
            </View>
            <View style={styles.rowRight}>
                <Text style={styles.rowPackets}>{packetsLabel(packets)}</Text>
                <Text style={styles.rowPrice}>{fmt(lineTotal)}</Text>
            </View>
        </View>
    );
}

function Subtotal({ label, crops }) {
    const total = crops.reduce((sum, c) => {
        const specs = specsFor(c);
        if (specs.isSpecial) {
            const qty = c.seedsToStart ?? c.plantsNeeded ?? 1;
            return sum + qty * specs.price;
        }
        const qty     = c.seedsToStart ?? 1;
        const packets = Math.max(1, Math.ceil(qty / specs.seedsPerPacket));
        return sum + packets * specs.price;
    }, 0);

    if (total === 0) return null;
    return (
        <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>{label} subtotal</Text>
            <Text style={styles.subtotalValue}>{fmt(total)}</Text>
        </View>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SeedShoppingList({ crops }) {
    // Partition into three groups
    const directSow = crops.filter(c => c.seedType === 'DS' && !specsFor(c).isSpecial);
    const startIndoors = crops.filter(c => c.seedType === 'TP' && !specsFor(c).isSpecial);
    const specialPurchase = crops.filter(c => specsFor(c).isSpecial);

    // Grand total
    const all = [...directSow, ...startIndoors, ...specialPurchase];
    const grandTotal = all.reduce((sum, c) => {
        const specs = specsFor(c);
        if (specs.isSpecial) {
            const qty = c.seedsToStart ?? c.plantsNeeded ?? 1;
            return sum + qty * specs.price;
        }
        const qty     = c.seedsToStart ?? 1;
        const packets = Math.max(1, Math.ceil(qty / specs.seedsPerPacket));
        return sum + packets * specs.price;
    }, 0);
    const grandLow  = grandTotal * 0.8;
    const grandHigh = grandTotal * 1.2;
    const totalPackets = [...directSow, ...startIndoors].reduce((sum, c) => {
        const specs = specsFor(c);
        const qty = c.seedsToStart ?? 1;
        return sum + Math.max(1, Math.ceil(qty / specs.seedsPerPacket));
    }, 0);

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.container}
        >
            {/* Summary banner */}
            <View style={styles.banner}>
                <View style={styles.bannerStat}>
                    <Text style={styles.bannerValue}>{totalPackets}</Text>
                    <Text style={styles.bannerLabel}>Seed Packets</Text>
                </View>
                <View style={styles.bannerDivider} />
                <View style={styles.bannerStat}>
                    <Text style={styles.bannerValue}>{fmt(grandLow)}–{fmt(grandHigh)}</Text>
                    <Text style={styles.bannerLabel}>Est. Seed Cost</Text>
                </View>
            </View>

            {/* ── Direct Sow ── */}
            {directSow.length > 0 && (
                <View style={styles.section}>
                    <SectionHeader
                        emoji="💧"
                        title="Direct Sow Seeds"
                        subtitle="Plant these seeds directly in the ground"
                    />
                    {directSow.map(c => <ShoppingRow key={c.cropId} crop={c} />)}
                    <Subtotal label="Direct Sow" crops={directSow} />
                </View>
            )}

            {/* ── Start Indoors ── */}
            {startIndoors.length > 0 && (
                <View style={styles.section}>
                    <SectionHeader
                        emoji="🪴"
                        title="Start Indoors / Transplant"
                        subtitle="Germinate inside 4–8 weeks before last frost, or buy as nursery transplants"
                    />
                    {startIndoors.map(c => <ShoppingRow key={c.cropId} crop={c} />)}
                    <Subtotal label="Transplant Seeds" crops={startIndoors} />
                </View>
            )}

            {/* ── Special Purchase ── */}
            {specialPurchase.length > 0 && (
                <View style={styles.section}>
                    <SectionHeader
                        emoji="🛒"
                        title="Buy as Starts / Tubers"
                        subtitle="These aren't grown from seed — purchase as tubers, slips, or bare-root plants"
                    />
                    {specialPurchase.map(c => <ShoppingRow key={c.cropId} crop={c} />)}
                    <Subtotal label="Starts & Tubers" crops={specialPurchase} />
                </View>
            )}

            {/* Grand total */}
            <View style={styles.grandTotalCard}>
                <Text style={styles.grandTotalLabel}>Estimated Total</Text>
                <Text style={styles.grandTotalValue}>{fmt(grandLow)} – {fmt(grandHigh)}</Text>
                <Text style={styles.grandTotalNote}>
                    Based on {totalPackets} seed packet{totalPackets !== 1 ? 's' : ''}
                    {specialPurchase.length > 0 ? ` + ${specialPurchase.length} specialty start${specialPurchase.length !== 1 ? 's' : ''}` : ''}
                </Text>
            </View>

            {/* Disclaimer */}
            <View style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                    💡 Packet sizes and prices are based on Johnny's, Baker Creek, and High Mowing averages.
                    Garlic, shallots, and propagated alliums appear under "Buy as Starts" since they're sold as bulbs or sets, not seeds.
                    Germination buffer already factored into seed quantities. Your actual cost will vary.
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

    // ── Banner ────────────────────────────────────────────────────────────────
    banner: {
        flexDirection: 'row',
        backgroundColor: Colors.primaryGreen,
        borderRadius: Radius.lg,
        paddingVertical: 14,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bannerStat: { alignItems: 'center', flex: 1 },
    bannerValue: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: '#fff',
    },
    bannerLabel: {
        fontSize: Typography.xs,
        color: 'rgba(255,255,255,0.75)',
        marginTop: 2,
    },
    bannerDivider: {
        width: 1,
        height: 36,
        backgroundColor: 'rgba(255,255,255,0.25)',
        marginHorizontal: Spacing.lg,
    },

    // ── Section ───────────────────────────────────────────────────────────────
    section: { marginBottom: Spacing.xl },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: Spacing.sm,
        paddingBottom: 8,
        borderBottomWidth: 2,
        borderBottomColor: Colors.primaryGreen,
    },
    sectionEmoji: { fontSize: 20, marginTop: 1 },
    sectionTitle: {
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
    },
    sectionSub: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        marginTop: 2,
    },

    // ── Row ───────────────────────────────────────────────────────────────────
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: Radius.md,
        marginBottom: 6,
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 10,
    },
    rowImage: {
        width: 36, height: 36,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: 'rgba(45,79,30,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    rowImg: { width: 36, height: 36 },
    rowEmoji: { fontSize: 18 },
    rowMain: { flex: 1, minWidth: 0 },
    rowName: {
        fontSize: Typography.sm,
        fontWeight: Typography.semiBold,
        color: Colors.darkGreen ?? Colors.primaryGreen,
    },
    rowDetail: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        marginTop: 2,
    },
    rowRight: { alignItems: 'flex-end', flexShrink: 0 },
    rowPackets: {
        fontSize: Typography.sm,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
    },
    rowPrice: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        marginTop: 2,
    },

    // ── Subtotal ──────────────────────────────────────────────────────────────
    subtotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingTop: 8,
        marginTop: 2,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.08)',
    },
    subtotalLabel: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        fontStyle: 'italic',
    },
    subtotalValue: {
        fontSize: Typography.sm,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
    },

    // ── Grand Total ───────────────────────────────────────────────────────────
    grandTotalCard: {
        backgroundColor: Colors.primaryGreen,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    grandTotalLabel: {
        fontSize: Typography.sm,
        color: 'rgba(255,255,255,0.75)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 6,
    },
    grandTotalValue: {
        fontSize: 28,
        fontWeight: Typography.bold,
        color: '#fff',
    },
    grandTotalNote: {
        fontSize: Typography.xs,
        color: 'rgba(255,255,255,0.65)',
        marginTop: 6,
        textAlign: 'center',
    },

    // ── Disclaimer ────────────────────────────────────────────────────────────
    disclaimer: {
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
    },
    disclaimerText: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        textAlign: 'center',
        fontStyle: 'italic',
        lineHeight: 18,
    },
});
