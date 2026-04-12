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
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Platform, Clipboard, Image, Modal
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import cropData from '../data/crops.json';
import CROP_IMAGES from '../data/cropImages';
import GlobalNavBar from '../components/GlobalNavBar';
import { loadBlocks, loadBlockBeds } from '../services/persistence';

const CROPS_MAP = Object.fromEntries(cropData.crops.map(c => [c.id, c]));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTIMATED_SEEDS_PER_OZ = {
    'Greens': 25000,
    'Root': 12000,
    'Brassica': 8000,
    'Allium': 7000,
    'Fruiting': 8000,
    'Legume': 120, 
    'Herbs': 80000, 
    'Flowers': 10000,
    'Cover': 1000,
    'Tuber': 100
};


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
 * Maps raw oz or seed count needed → human-friendly packet recommendation.
 */
function recommendPackets(item) {
    const meta = item.cropId ? CROPS_MAP[item.cropId] : null;

    if (item.reqType === 'seeds') {
        const basePkt = meta?.seeds_per_packet || 100;
        const total = item.totalSeeds;
        
        // Build out a progression of standard commercial packet sizes
        const rawSteps = [basePkt, 100, 250, 500, 1000, 5000, 10000, 25000];
        const uniqueSteps = [...new Set(rawSteps)].sort((a, b) => a - b);
        
        let targetSize = null;
        let count = 1;

        // Find the most appropriate commercial bulk tier
        for (const size of uniqueSteps) {
            if (total <= size) {
                targetSize = size;
                break;
            }
        }
        
        // Above 25,000 seeds
        if (!targetSize) {
            targetSize = 25000;
            count = Math.ceil(total / 25000);
        }

        let str = '';
        const qtyPrefix = count > 1 ? `${count} × ` : '1 × ';
        if (targetSize >= 5000 && targetSize < 25000) str = `${qtyPrefix}${targetSize.toLocaleString()}-seed bag`;
        else if (targetSize >= 25000) str = `${qtyPrefix}25k-seed bag`;
        else str = `${qtyPrefix}${targetSize.toLocaleString()}-seed pkt`;

        // Conversion logic
        const density = (meta && meta.seeds_per_oz) ? meta.seeds_per_oz : (ESTIMATED_SEEDS_PER_OZ[item.category] || 10000);
        if (density) {
            const ozEq = targetSize / density;
            const ozEqStr = ozEq < 0.25 ? `${Math.round(ozEq * 100) / 100}oz` : `${Math.round(ozEq * 10) / 10}oz`;
            return `${str} (~${ozEqStr} ea)`;
        }
        return str;
    }

    const totalOz = item.totalOz;
    if (totalOz <= 0) return null;

    let targetOz = null;
    let label = '';
    let count = 1;

    if (totalOz <= 0.2) { targetOz = 0.20; label = '¼oz packet'; }
    else if (totalOz <= 0.5) { targetOz = 0.5; label = '½oz packet'; }
    else if (totalOz <= 1.0) { targetOz = 1.0; label = '1oz packet'; }
    else if (totalOz <= 2.0) { targetOz = 1.0; label = '1oz packet'; count = 2; }
    else if (totalOz <= 4.0) { targetOz = 4.0; label = '¼lb bag'; }
    else if (totalOz <= 8.0) { targetOz = 8.0; label = '½lb bag'; }
    else if (totalOz <= 16.0) { targetOz = 16.0; label = '1lb bag'; }
    else if (totalOz <= 80.0) { targetOz = 80.0; label = '5lb bag'; }
    else if (totalOz <= 160.0) { targetOz = 160.0; label = '10lb bag'; }
    else { targetOz = 160.0; label = '10lb bag'; count = Math.ceil(totalOz / 160); }

    const qtyPrefix = count > 1 ? `${count} × ` : '1 × ';
    const str = `${qtyPrefix}${label}${count > 1 ? 's' : ''}`;
    
    const density = (meta && meta.seeds_per_oz) ? meta.seeds_per_oz : (ESTIMATED_SEEDS_PER_OZ[item.category] || 10000);
    if (density) {
        const seedsEq = Math.round(targetOz * density);
        return `${str} (~${seedsEq.toLocaleString()} seeds ea)`;
    }
    return str;
}

function fmtReq(item) {
    const meta = item.cropId ? CROPS_MAP[item.cropId] : null;

    if (item.reqType === 'seeds') {
        const countStr = `${item.totalSeeds} seeds`;
        const density = (meta && meta.seeds_per_oz) ? meta.seeds_per_oz : (ESTIMATED_SEEDS_PER_OZ[item.category] || 10000);
        if (density) {
            const ozEq = item.totalSeeds / density;
            const ozEqStr = ozEq < 0.25 ? `${Math.round(ozEq * 100) / 100}oz` : `${Math.round(ozEq * 10) / 10}oz`;
            return `${countStr} (~${ozEqStr})`;
        }
        return countStr;
    }

    const oz = item.totalOz;
    const ozStr = oz < 0.5 ? `${Math.round(oz * 100) / 100}oz` : `${Math.round(oz * 10) / 10}oz`;
    const density = (meta && meta.seeds_per_oz) ? meta.seeds_per_oz : (ESTIMATED_SEEDS_PER_OZ[item.category] || 10000);
    if (density) {
        const seedsEq = Math.round(oz * density);
        return `${ozStr} (~${seedsEq.toLocaleString()} seeds)`;
    }
    return ozStr;
}

// ─── Seed aggregation ─────────────────────────────────────────────────────────

function computeSeedReq(succession, bedLengthFt = 30) {
    const meta = CROPS_MAP[succession.crop_id];
    if (!meta) return null;
    
    // Check coverage and evaluate total bed length used
    const fraction = succession.coverage_fraction ?? 1.0;
    const rows = meta.rows_per_30in_bed ?? 1;
    const linearFt = bedLengthFt * rows * fraction;
    
    // Standard buffer math
    const buffer = 1 + (meta.loss_buffer_pct ?? 20) / 100;

    // Transplant or Seed Count explicitly (Feed My Family equivalence)
    if (meta.seed_type === 'TP' || !meta.seed_oz_per_100ft) {
        const spacingIn = meta.in_row_spacing_in || 12; // fallback
        const plantCount = (linearFt * 12) / spacingIn;
        const germRate = meta.germination_rate_pct ?? 0.8;
        const totalSeedsNeeded = Math.ceil((plantCount * buffer) / germRate);
        return { type: 'seeds', val: totalSeedsNeeded };
    }

    // Direct Seed (DS) ounces
    const ozPer100ft = meta.seed_oz_per_100ft;
    const rawOz = (linearFt / 100) * ozPer100ft;
    return { type: 'oz', val: rawOz * buffer };
}

async function buildSeedList(planId) {
    try {
        if (typeof localStorage === 'undefined') return [];
        const seedMap = {};



        // Source 2 — Farm Designer per-block stores
        const allBlocks = loadBlocks();
        const activeBlocks = planId ? allBlocks.filter(b => b?.planId === planId) : allBlocks;
        
        for (const block of activeBlocks) {
            const blockData = loadBlockBeds(block.id);
            if (!blockData) continue;
            const bedLengthFt = block.bedLengthFt || block.blockLengthFt || 30; // fallback per block
            
            for (const [bedNum, data] of Object.entries(blockData)) {
                if (data && Array.isArray(data.successions)) {
                    accumulateSeeds(seedMap, data.successions, bedNum, block.name || `Block ${block.id.slice(0, 4)}`, bedLengthFt);
                }
            }
        }

        return Object.values(seedMap).sort((a, b) =>
            (a.earliestBuyDate ?? 'zzzz').localeCompare(b.earliestBuyDate ?? 'zzzz')
        );
    } catch (e) {
        console.warn('SeedOrderScreen buildSeedList error:', e);
        return [];
    }
}

function accumulateSeeds(seedMap, successions, bedNum, sourceName, bedLengthFt) {
    for (const s of successions) {
        if (!s.crop_id) continue;
        const meta = CROPS_MAP[s.crop_id];
        if (!meta) continue;

        const req = computeSeedReq(s, bedLengthFt);
        if (!req || req.val <= 0) continue;

        if (!seedMap[s.crop_id]) {
            seedMap[s.crop_id] = {
                cropId: s.crop_id,
                name: s.crop_name ?? meta.name,
                variety: meta.variety,
                emoji: meta.emoji,
                category: meta.category,
                seedType: meta.seed_type ?? 'DS',
                reqType: req.type,
                totalOz: 0,
                totalSeeds: 0,
                earliestBuyDate: null,
                earliestDate: null,
                plantingDays: [],
            };
        }

        const entry = seedMap[s.crop_id];
        if (req.type === 'oz') entry.totalOz += req.val;
        else entry.totalSeeds += req.val;

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
                req: { type: req.type, val: req.val }, // raw requirement for this single block/bed combo
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

function formatOrderForCopy(waves, totalCrops, totalOzAll, totalSeedsAll) {
    const now = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const ozStr = totalOzAll > 0 ? `${Math.round(totalOzAll * 10) / 10}oz` : '';
    const seedStr = totalSeedsAll > 0 ? `${totalSeedsAll} seeds` : '';
    const divider = (totalOzAll > 0 && totalSeedsAll > 0) ? ' + ' : '';
    
    const lines = [`=== SEED ORDER — ${now} ===`, `${totalCrops} crops · ${ozStr}${divider}${seedStr} total`, ''];
    for (const wave of waves) {
        lines.push(`ORDER WAVE — ${wave.monthLabel.toUpperCase()}`);
        for (const item of wave.items) {
            const pkt = recommendPackets(item) ?? '';
            const tp = item.seedType === 'TP' ? ' [TP]' : '';
            lines.push(`• ${item.name}${item.variety ? ` (${item.variety})` : ''}${tp} — ${fmtReq(item)} — ${pkt}`);
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

const SeedCard = ({ item }) => {
    const packets = recommendPackets(item);
    const daysUntilBuy = item.earliestBuyDate ? daysDiff(item.earliestBuyDate) : null;
    const isUrgent = daysUntilBuy !== null && daysUntilBuy <= 14;

    return (
        <View style={[styles.seedCard, isUrgent && styles.seedCardUrgent]}>
            <View style={styles.cardHeader}>
                {CROP_IMAGES[item.cropId] ? (
                    <Image
                        source={CROP_IMAGES[item.cropId]}
                        style={styles.cardImage}
                        resizeMode="cover"
                    />
                ) : (
                    <Text style={styles.cardEmoji}>{item.emoji}</Text>
                )}
                <View style={styles.cardHeaderInfo}>
                    <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                    {item.variety && <Text style={styles.cardVariety} numberOfLines={1}>Variety: {item.variety}</Text>}
                </View>
            </View>

            <View style={styles.cardBody}>
                <Text style={styles.cardSectionTitle}>SEED REQUIREMENT</Text>
                <View style={styles.cardBadgesRow}>
                    <View style={styles.cardOzBadge}>
                        <Text style={styles.cardOzText}>🌱 {fmtReq(item)}</Text>
                        {item.seedType === 'TP' && <Text style={styles.cardTpText}> (Transplants)</Text>}
                    </View>
                    
                    {packets && (
                        <View style={styles.cardPacketBadge}>
                            <Text style={styles.cardPacketText}>📦 {packets}</Text>
                        </View>
                    )}
                </View>

                {item.earliestBuyDate && (
                    <View style={styles.cardDeadlineRow}>
                        <Text style={styles.cardSectionTitle}>ORDER DEADLINE:</Text>
                        <Text style={[styles.cardDateText, isUrgent && styles.cardDateUrgent]}>
                            {isUrgent ? '⚡ BEST ORDER DATE:' : '📅 BEST ORDER DATE:'} {fmtDate(item.earliestBuyDate)}
                        </Text>
                    </View>
                )}

                {item.plantingDays && item.plantingDays.length > 0 && (
                    <View style={styles.cardBreakdownWrapper}>
                        <Text style={styles.cardSectionTitle}>PLANTING DATES</Text>
                        {item.plantingDays
                            .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
                            .map((pd, i) => (
                                <View key={i} style={styles.cardBreakdownRow}>
                                    <View style={styles.cardBreakdownDot} />
                                    <Text style={styles.cardBreakdownText}>
                                        <Text style={{ fontWeight: '800' }}>Sow {fmtDate(pd.date)}</Text>
                                        <Text style={{ color: Colors.mutedText }}> — {pd.blockName} • Bed {pd.bedNum}</Text>
                                    </Text>
                                    <Text style={styles.cardBreakdownVal}>
                                        {fmtReq({ reqType: pd.req.type, totalOz: pd.req.val, totalSeeds: pd.req.val, cropId: item.cropId })}
                                    </Text>
                                </View>
                            ))}
                    </View>
                )}
            </View>
        </View>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SeedOrderScreen({ navigation, route }) {
    const { farmProfile, planId } = route?.params ?? {};
    const [seedList, setSeedList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useFocusEffect(useCallback(() => {
        setLoading(true);
        buildSeedList(planId).then(list => {
            setSeedList(list);
            setLoading(false);
        });
    }, [planId]));

    const totalCrops = seedList.length;
    const totalOzAll = seedList.reduce((s, r) => s + r.totalOz, 0);
    const totalTPSeedsAll = seedList.reduce((s, r) => s + r.totalSeeds, 0);
    
    // Also compute "Total System Seeds" by adding the transplant seeds to 
    // the approximated seed count derived from the totalOz required. 
    // This gives a truer sense of scale (e.g. 1.2M seeds vs just the 3000 tomato seeds).
    let trueTotalSeeds = totalTPSeedsAll;
    seedList.forEach(item => {
        if (item.totalOz > 0) {
            const density = CROPS_MAP[item.cropId]?.seeds_per_oz || ESTIMATED_SEEDS_PER_OZ[item.category] || 10000;
            trueTotalSeeds += (item.totalOz * density);
        }
    });
    const formattedTrueTotal = trueTotalSeeds > 1000000 
        ? `${(trueTotalSeeds / 1000000).toFixed(1)}M` 
        : `${Math.round(trueTotalSeeds).toLocaleString()}`;


    const waves = groupIntoWaves(seedList);

    const today = new Date().toISOString().slice(0, 10);
    const urgentItems = seedList.filter(
        i => i.earliestBuyDate && daysDiff(i.earliestBuyDate) <= 14 && daysDiff(i.earliestBuyDate) >= -3
    );

    const handleCopy = useCallback(() => {
        const text = formatOrderForCopy(waves, totalCrops, totalOzAll, trueTotalSeeds);
        if (Platform.OS === 'web') {
            navigator.clipboard?.writeText(text).catch(() => {});
        } else {
            Clipboard.setString(text);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    }, [waves, totalCrops, totalOzAll, trueTotalSeeds]);

    return (
        <View style={styles.container}>
            <GlobalNavBar 
                navigation={navigation} 
                farmProfile={farmProfile} 
                planId={planId} 
                activeRoute="SeedOrder" 
                rightAction={
                    seedList.length > 0 ? (
                        <TouchableOpacity style={[styles.copyBtn, copied && styles.copyBtnDone]} onPress={handleCopy}>
                            <Text style={styles.copyBtnText}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
                        </TouchableOpacity>
                    ) : null
                }
            />

            {/* Summary bar */}
            <View style={styles.summaryBar}>
                <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipNum}>{totalCrops}</Text>
                    <Text style={styles.summaryChipLabel}>Crops</Text>
                </View>
                <View style={[styles.summaryChip, { flex: 1.5 }]}>
                    <Text style={[styles.summaryChipNum, { fontSize: Typography.xs }]}>
                        {totalOzAll > 0 ? `${Math.round(totalOzAll * 10) / 10}oz` : ''}
                        {totalOzAll > 0 && totalTPSeedsAll > 0 ? ' / ' : ''}
                        {totalTPSeedsAll > 0 ? `${totalTPSeedsAll.toLocaleString()} TP seeds` : ''}
                        {totalOzAll === 0 && totalTPSeedsAll === 0 ? '0' : ''}
                    </Text>
                    <Text style={styles.summaryChipLabel}>~{formattedTrueTotal} total seeds</Text>
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
                    style={Platform.OS === 'web' ? { overflowY: 'scroll' } : undefined}
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
                            <View style={styles.waveGrid}>
                                {wave.items.map(item => (
                                    <SeedCard
                                        key={item.cropId}
                                        item={item}
                                    />
                                ))}
                            </View>
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
    container: {
        flex: 1,
        backgroundColor: '#F0EDE6',
        ...Platform.select({ web: { maxHeight: '100vh', overflow: 'hidden' } }),
    },

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
    waveGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    waveHeaderLeft: { gap: 1 },
    waveNum: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.5 },
    waveLabel: { fontSize: Typography.base, fontWeight: '800', color: Colors.cream },
    waveCount: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

    // ── Narrower Seed Card (Reduced ~30%) ──────────────────────────────────────────
    seedCard: {
        backgroundColor: '#FCFCF9', 
        borderRadius: Radius.md, 
        padding: 10,
        flex: 1,
        minWidth: 210,
        maxWidth: 320, // Prevents a single card stretching entirely across ultra-wides, maintaining nice columns
        borderWidth: 1.5, 
        borderColor: 'rgba(45,79,30,0.1)',
    },
    seedCardUrgent: { borderColor: '#F59E0B', backgroundColor: '#FFFBF0' },
    
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    cardImage: { width: 40, height: 40, borderRadius: 6, backgroundColor: 'rgba(45,79,30,0.06)' },
    cardEmoji: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
    cardHeaderInfo: { flex: 1, justifyContent: 'center' },
    cardName: { fontSize: 16, fontWeight: '900', color: Colors.primaryGreen },
    cardVariety: { fontSize: 11, color: Colors.mutedText },
    
    cardBody: { gap: 6 },
    cardSectionTitle: { fontSize: 9, fontWeight: '800', color: Colors.mutedText, letterSpacing: 1.2, marginTop: 4 },
    
    cardBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    cardOzBadge: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryGreen, 
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm,
    },
    cardOzText: { fontSize: 12, fontWeight: '900', color: Colors.cream },
    cardTpText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
    
    cardPacketBadge: {
        backgroundColor: 'rgba(255,165,0,0.15)', paddingHorizontal: 8, paddingVertical: 4, 
        borderRadius: Radius.sm, borderWidth: 1, borderColor: 'rgba(255,165,0,0.3)',
    },
    cardPacketText: { fontSize: 11, fontWeight: '800', color: '#92400E' },
    
    cardDeadlineRow: { marginTop: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: Radius.sm },
    cardDateText: { fontSize: 12, color: Colors.primaryGreen, fontWeight: '800', marginTop: 2 },
    cardDateUrgent: { color: '#B45309', fontWeight: '900' },

    cardBreakdownWrapper: { marginTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.06)', paddingTop: 10 },
    cardBreakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 6 },
    cardBreakdownDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primaryGreen, opacity: 0.6 },
    cardBreakdownText: { flex: 1, fontSize: 11, color: Colors.primaryGreen },
    cardBreakdownVal: { fontSize: 11, fontWeight: '800', color: Colors.burntOrange }
});
