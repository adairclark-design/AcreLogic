/**
 * SeedOrderScreen.js
 * ══════════════════
 * Seed & Supply Ordering List
 *
 * Reads all bed successions → aggregates seed requirements per crop →
 * groups into monthly "Purchase Waves" so farmers can stagger seed
 * purchases throughout the season.
 *
 * Features:
 *   - Purchase wave grouping by order-by month
 *   - Packet size guidance (maps oz needed → realistic commercial pkts)
 *   - "Need Soon" banner for crops due within 14 days
 *   - Copy-to-clipboard for the full order list
 *   - Expandable planting-day breakdown per crop
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Platform, Clipboard,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import cropData from '../data/crops.json';

const CROPS_MAP = Object.fromEntries(cropData.crops.map(c => [c.id, c]));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMonthYear(iso) {
    if (!iso) return 'Undated';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function daysDiff(isoDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(isoDate + 'T12:00:00');
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/**
 * recommendPackets
 * Maps raw oz needed → human-friendly packet recommendation.
 * Packet sizes: ¼oz, ½oz, 1oz, ¼lb (4oz), ½lb (8oz)
 */
function recommendPackets(totalOz) {
    if (totalOz <= 0) return null;
    if (totalOz <= 0.2) return '1 × ¼oz packet';
    if (totalOz <= 0.5) return '1 × ½oz packet';
    if (totalOz <= 1.0) return '1 × 1oz packet';
    if (totalOz <= 2.0) return `2 × 1oz packets`;
    if (totalOz <= 4.0) return '1 × ¼lb bag';
    if (totalOz <= 8.0) return '1 × ½lb bag';
    return `${Math.ceil(totalOz / 8)} × ½lb bags`;
}

function fmtOz(oz) {
    if (oz < 0.5) return `${Math.round(oz * 100) / 100}oz`;
    return `${Math.round(oz * 10) / 10}oz`;
}

// ─── Seed aggregation ─────────────────────────────────────────────────────────

function computeSeedOz(succession, bedLengthFt = 30) {
    const meta = CROPS_MAP[succession.crop_id];
    if (!meta) return null;
    const fraction = succession.coverage_fraction ?? 1.0;
    const rows = meta.rows_per_30in_bed ?? 4;
    const linearFt = bedLengthFt * rows * fraction;
    const ozPer100ft = meta.seed_oz_per_100ft ?? 0;
    if (!ozPer100ft) return null;
    const rawOz = (linearFt / 100) * ozPer100ft;
    const buffer = 1 + (meta.loss_buffer_pct ?? 20) / 100;
    return rawOz * buffer;
}

async function buildSeedList() {
    try {
        if (typeof localStorage === 'undefined') return [];
        const seedMap = {};

        // Source 1 — 8-Bed Workspace flat store
        const flatRaw = localStorage.getItem('acrelogic_bed_successions');
        if (flatRaw) {
            try {
                const flatData = JSON.parse(flatRaw);
                for (const [bedNum, successions] of Object.entries(flatData)) {
                    if (Array.isArray(successions))
                        accumulateSeeds(seedMap, successions, bedNum, '8-Bed Plan');
                }
            } catch {}
        }

        // Source 2 — Farm Designer per-block stores
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith('acrelogic_block_beds_')) continue;
            const shortName = key.replace('acrelogic_block_beds_', '').slice(0, 8);
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const blockData = JSON.parse(raw);
                for (const [bedNum, successions] of Object.entries(blockData)) {
                    if (Array.isArray(successions))
                        accumulateSeeds(seedMap, successions, bedNum, `Block ${shortName}`);
                }
            } catch {}
        }

        return Object.values(seedMap).sort((a, b) =>
            (a.earliestBuyDate ?? 'zzzz').localeCompare(b.earliestBuyDate ?? 'zzzz')
        );
    } catch (e) {
        console.warn('SeedOrderScreen buildSeedList error:', e);
        return [];
    }
}

function accumulateSeeds(seedMap, successions, bedNum, sourceName) {
    for (const s of successions) {
        if (!s.crop_id) continue;
        const meta = CROPS_MAP[s.crop_id];
        if (!meta) continue;

        const oz = computeSeedOz(s, 30);
        if (!oz || oz <= 0) continue;

        if (!seedMap[s.crop_id]) {
            seedMap[s.crop_id] = {
                cropId: s.crop_id,
                name: s.crop_name ?? meta.name,
                variety: meta.variety,
                emoji: meta.emoji,
                category: meta.category,
                seedType: meta.seed_type ?? 'DS',
                totalOz: 0,
                earliestBuyDate: null,
                earliestDate: null,
                plantingDays: [],
            };
        }

        const entry = seedMap[s.crop_id];
        entry.totalOz += oz;

        const weeksOut = meta.seed_type === 'TP' ? 6 : 2;
        const plantDate = s.start_date ? new Date(s.start_date + 'T12:00:00') : null;
        if (plantDate) {
            const buyDate = new Date(plantDate);
            buyDate.setDate(buyDate.getDate() - weeksOut * 7);
            const buyIso = buyDate.toISOString().slice(0, 10);

            if (!entry.earliestBuyDate || buyIso < entry.earliestBuyDate) {
                entry.earliestBuyDate = buyIso;
                entry.earliestDate = s.start_date;
            }

            entry.plantingDays.push({
                date: s.start_date,
                buyDate: buyIso,
                oz,
                blockName: sourceName,
                bedNum,
            });
        }
    }
}

/**
 * groupIntoWaves — buckets seed items into monthly purchase waves.
 * Returns: [{ monthLabel: 'February 2026', isoKey: '2026-02', items: [...] }]
 */
function groupIntoWaves(seedList) {
    const waveMap = {};
    for (const item of seedList) {
        const key = item.earliestBuyDate
            ? item.earliestBuyDate.slice(0, 7)  // 'YYYY-MM'
            : 'zzzz-no-date';
        const label = item.earliestBuyDate
            ? fmtMonthYear(item.earliestBuyDate)
            : 'No Date Set';
        if (!waveMap[key]) waveMap[key] = { monthLabel: label, isoKey: key, items: [] };
        waveMap[key].items.push(item);
    }
    return Object.values(waveMap).sort((a, b) => a.isoKey.localeCompare(b.isoKey));
}

// ─── Copy formatter ───────────────────────────────────────────────────────────

function formatOrderForCopy(waves, totalCrops, totalOzAll) {
    const now = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const lines = [`=== SEED ORDER — ${now} ===`, `${totalCrops} crops · ${Math.round(totalOzAll * 10) / 10}oz total`, ''];
    for (const wave of waves) {
        lines.push(`ORDER WAVE — ${wave.monthLabel.toUpperCase()}`);
        for (const item of wave.items) {
            const pkt = recommendPackets(item.totalOz) ?? '';
            const tp = item.seedType === 'TP' ? ' [TP]' : '';
            lines.push(`• ${item.name}${item.variety ? ` (${item.variety})` : ''}${tp} — ${fmtOz(item.totalOz)} — ${pkt}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const NeedSoonBanner = ({ urgentItems }) => {
    if (!urgentItems.length) return null;
    return (
        <View style={styles.urgentBanner}>
            <Text style={styles.urgentTitle}>⚡ Order Soon</Text>
            <Text style={styles.urgentBody}>
                {urgentItems.map(i => i.name).join(', ')} — buy by{' '}
                {urgentItems.map(i => fmtDate(i.earliestBuyDate)).join(' / ')}
            </Text>
        </View>
    );
};

const WaveHeader = ({ label, waveNum, itemCount }) => (
    <View style={styles.waveHeader}>
        <View style={styles.waveHeaderLeft}>
            <Text style={styles.waveNum}>Wave {waveNum}</Text>
            <Text style={styles.waveLabel}>{label}</Text>
        </View>
        <Text style={styles.waveCount}>{itemCount} crop{itemCount !== 1 ? 's' : ''}</Text>
    </View>
);

const SeedRow = ({ item, expanded, onToggle }) => {
    const packets = recommendPackets(item.totalOz);
    const daysUntilBuy = item.earliestBuyDate ? daysDiff(item.earliestBuyDate) : null;
    const isUrgent = daysUntilBuy !== null && daysUntilBuy <= 14;

    return (
        <TouchableOpacity
            style={[styles.seedRow, isUrgent && styles.seedRowUrgent]}
            onPress={onToggle}
            activeOpacity={0.8}
        >
            <Text style={styles.seedEmoji}>{item.emoji}</Text>
            <View style={styles.seedInfo}>
                <View style={styles.seedTopRow}>
                    <Text style={styles.seedName}>{item.name}</Text>
                    <View style={[styles.seedTypeBadge, item.seedType === 'TP' && styles.seedTypeBadgeTP]}>
                        <Text style={styles.seedTypeText}>{item.seedType}</Text>
                    </View>
                </View>
                {item.variety && <Text style={styles.seedVariety}>{item.variety}</Text>}

                <View style={styles.seedMetaRow}>
                    {/* Oz needed */}
                    <View style={styles.seedOzBadge}>
                        <Text style={styles.seedOzText}>🌱 {fmtOz(item.totalOz)}</Text>
                    </View>
                    {/* Packet recommendation */}
                    {packets && (
                        <View style={styles.packetBadge}>
                            <Text style={styles.packetText}>📦 {packets}</Text>
                        </View>
                    )}
                </View>

                {item.earliestBuyDate && (
                    <Text style={[styles.seedBuyDate, isUrgent && styles.seedBuyDateUrgent]}>
                        {isUrgent ? '⚡' : '📅'} Order by {fmtDate(item.earliestBuyDate)}
                        {daysUntilBuy !== null && daysUntilBuy >= 0
                            ? ` (${daysUntilBuy === 0 ? 'today!' : `${daysUntilBuy}d`})`
                            : daysUntilBuy < 0 ? ' — overdue' : ''}
                    </Text>
                )}

                {expanded && item.plantingDays.length > 0 && (
                    <View style={styles.plantingBreakdown}>
                        <Text style={styles.breakdownTitle}>Planting schedule:</Text>
                        {item.plantingDays
                            .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
                            .map((pd, i) => (
                                <View key={i} style={styles.breakdownRow}>
                                    <Text style={styles.breakdownDate}>{fmtDate(pd.date)}</Text>
                                    <Text style={styles.breakdownBlock}>{pd.blockName} · Bed {pd.bedNum}</Text>
                                    <Text style={styles.breakdownOz}>{fmtOz(pd.oz)}</Text>
                                </View>
                            ))}
                    </View>
                )}
            </View>
            <Text style={styles.chevron}>{expanded ? '∧' : '›'}</Text>
        </TouchableOpacity>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SeedOrderScreen({ navigation, route }) {
    const { farmProfile } = route?.params ?? {};
    const [seedList, setSeedList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        buildSeedList().then(list => {
            setSeedList(list);
            setLoading(false);
        });
    }, []);

    const totalCrops = seedList.length;
    const totalOzAll = seedList.reduce((s, r) => s + r.totalOz, 0);
    const waves = groupIntoWaves(seedList);

    const today = new Date().toISOString().slice(0, 10);
    const urgentItems = seedList.filter(
        i => i.earliestBuyDate && daysDiff(i.earliestBuyDate) <= 14 && daysDiff(i.earliestBuyDate) >= -3
    );

    const handleCopy = useCallback(() => {
        const text = formatOrderForCopy(waves, totalCrops, totalOzAll);
        if (Platform.OS === 'web') {
            navigator.clipboard?.writeText(text).catch(() => {});
        } else {
            Clipboard.setString(text);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    }, [waves, totalCrops, totalOzAll]);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>FARM TOOLS</Text>
                    <Text style={styles.heading}>Seed Order List</Text>
                </View>
                {seedList.length > 0 && (
                    <TouchableOpacity style={[styles.copyBtn, copied && styles.copyBtnDone]} onPress={handleCopy}>
                        <Text style={styles.copyBtnText}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Summary bar */}
            <View style={styles.summaryBar}>
                <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipNum}>{totalCrops}</Text>
                    <Text style={styles.summaryChipLabel}>Crops</Text>
                </View>
                <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipNum}>{Math.round(totalOzAll * 10) / 10}oz</Text>
                    <Text style={styles.summaryChipLabel}>Total Seed</Text>
                </View>
                <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipNum}>{waves.length}</Text>
                    <Text style={styles.summaryChipLabel}>Order Waves</Text>
                </View>
                <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipNum}>
                        {seedList.filter(s => s.seedType === 'DS').length}DS / {seedList.filter(s => s.seedType !== 'DS').length}TP
                    </Text>
                    <Text style={styles.summaryChipLabel}>Direct / Transplant</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator color={Colors.primaryGreen} size="large" />
                    <Text style={styles.loadingText}>Calculating seed requirements…</Text>
                </View>
            ) : seedList.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <Text style={styles.emptyEmoji}>🌾</Text>
                    <Text style={styles.emptyTitle}>No seed data yet</Text>
                    <Text style={styles.emptyBody}>
                        Plan crops in your beds first. Your seed order list builds automatically from your planting plan.
                    </Text>
                    <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.emptyBtnText}>← Back to Plan</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Need-soon banner */}
                    <NeedSoonBanner urgentItems={urgentItems} />

                    <Text style={styles.sectionHint}>
                        Crops grouped by purchase month. Tap a row to see the planting-day breakdown and per-bed split.
                    </Text>

                    {waves.map((wave, waveIdx) => (
                        <View key={wave.isoKey} style={styles.waveBlock}>
                            <WaveHeader
                                label={wave.monthLabel}
                                waveNum={waveIdx + 1}
                                itemCount={wave.items.length}
                            />
                            {wave.items.map(item => (
                                <SeedRow
                                    key={item.cropId}
                                    item={item}
                                    expanded={expandedId === item.cropId}
                                    onToggle={() => setExpandedId(prev => prev === item.cropId ? null : item.cropId)}
                                />
                            ))}
                        </View>
                    ))}

                    <View style={{ height: 60 }} />
                </ScrollView>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0EDE6' },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    stepLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 2 },
    heading: { fontSize: 22, fontWeight: '800', color: Colors.cream },
    copyBtn: {
        backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: Radius.full,
        paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    copyBtnDone: { backgroundColor: 'rgba(255,255,255,0.32)' },
    copyBtnText: { fontSize: Typography.xs, fontWeight: '800', color: Colors.cream },

    summaryBar: {
        flexDirection: 'row', backgroundColor: 'rgba(45,79,30,0.08)',
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 0,
    },
    summaryChip: { flex: 1, alignItems: 'center', gap: 2 },
    summaryChipNum: { fontSize: Typography.sm, fontWeight: '800', color: Colors.primaryGreen },
    summaryChipLabel: { fontSize: 8, fontWeight: '600', color: Colors.mutedText, textAlign: 'center' },

    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
    loadingText: { fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic' },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
    emptyEmoji: { fontSize: 48 },
    emptyTitle: { fontSize: Typography.lg, fontWeight: '800', color: Colors.primaryGreen },
    emptyBody: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center', lineHeight: 20 },
    emptyBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radius.full },
    emptyBtnText: { color: Colors.cream, fontWeight: '800', fontSize: Typography.sm },

    listContent: { padding: Spacing.lg, gap: Spacing.md },
    sectionHint: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic', marginBottom: 4, lineHeight: 16 },

    // ── Need Soon Banner ──────────────────────────────────────────────────────
    urgentBanner: {
        backgroundColor: '#FFF3CD', borderRadius: Radius.md, padding: Spacing.md,
        borderWidth: 1.5, borderColor: '#F59E0B', gap: 4, marginBottom: 4,
    },
    urgentTitle: { fontSize: Typography.sm, fontWeight: '800', color: '#92400E' },
    urgentBody: { fontSize: Typography.xs, color: '#92400E', lineHeight: 16 },

    // ── Wave Grouping ─────────────────────────────────────────────────────────
    waveBlock: { gap: Spacing.xs },
    waveHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.primaryGreen, borderRadius: Radius.sm,
        paddingVertical: 10, paddingHorizontal: Spacing.md,
    },
    waveHeaderLeft: { gap: 1 },
    waveNum: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.5 },
    waveLabel: { fontSize: Typography.base, fontWeight: '800', color: Colors.cream },
    waveCount: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

    // ── Seed Row ──────────────────────────────────────────────────────────────
    seedRow: {
        backgroundColor: '#FAFAF7', borderRadius: Radius.md, padding: Spacing.md,
        flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
    },
    seedRowUrgent: { borderColor: '#F59E0B', backgroundColor: '#FFFBF0' },
    seedEmoji: { fontSize: 26, marginTop: 2 },
    seedInfo: { flex: 1, gap: 4 },
    seedTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    seedName: { fontSize: Typography.base, fontWeight: '800', color: Colors.primaryGreen, flex: 1 },
    seedTypeBadge: {
        backgroundColor: 'rgba(45,79,30,0.12)', paddingHorizontal: 7,
        paddingVertical: 2, borderRadius: Radius.full,
    },
    seedTypeBadgeTP: { backgroundColor: 'rgba(100,60,200,0.13)' },
    seedTypeText: { fontSize: 9, fontWeight: '800', color: Colors.primaryGreen },
    seedVariety: { fontSize: Typography.xs, color: Colors.mutedText },
    seedMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },

    seedOzBadge: { backgroundColor: Colors.primaryGreen, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
    seedOzText: { fontSize: 10, fontWeight: '800', color: Colors.cream },

    packetBadge: {
        backgroundColor: 'rgba(255,165,0,0.12)', paddingHorizontal: 8,
        paddingVertical: 3, borderRadius: Radius.full,
        borderWidth: 1, borderColor: 'rgba(255,165,0,0.3)',
    },
    packetText: { fontSize: 10, fontWeight: '700', color: '#92400E' },

    seedBuyDate: { fontSize: 10, color: Colors.mutedText, fontWeight: '600', marginTop: 1 },
    seedBuyDateUrgent: { color: '#B45309', fontWeight: '800' },

    chevron: { fontSize: 18, color: Colors.mutedText, marginTop: 2 },

    // ── Planting Breakdown ────────────────────────────────────────────────────
    plantingBreakdown: {
        marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.1)',
        paddingTop: 6, gap: 4,
    },
    breakdownTitle: {
        fontSize: 9, fontWeight: '800', color: Colors.primaryGreen,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
    },
    breakdownRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    breakdownDate: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen, width: 40 },
    breakdownBlock: { fontSize: 10, color: Colors.mutedText, flex: 1 },
    breakdownOz: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen },
});
