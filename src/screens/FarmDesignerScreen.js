/**
 * FarmDesignerScreen.js
 * ══════════════════════
 * Hub for the multi-block Farm Designer:
 *   • 3×3 north-aligned grid showing block positions
 *   • Block list cards with summary stats
 *   • "New Block" CTA → BlockSetupWizard
 *   • Tap block → BlockDetailScreen
 *   • Total farm stats footer (total beds, total sq ft, total CSA capacity estimate)
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Animated, Platform, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadBlocks, deleteBlock } from '../services/persistence';
import { blockSummaryLine, totalPlantedSqFt, GRID_POSITIONS, FAMILY_OPTIONS } from '../services/farmUtils';

// Header height (approx) — used to bound the ScrollView on web
// Increased from 100 to 120 to account for the two-row header in practice
const HEADER_H = 120;
const SCROLL_ID = 'farm-designer-scrollview';

// Family assignment colors
const FAMILY_COLORS = {
    'Brassica & Chicories': { bg: '#C8E6C9', text: '#1B5E20' },
    'Alliums': { bg: '#FFF9C4', text: '#F57F17' },
    'Nightshades': { bg: '#FFCCBC', text: '#BF360C' },
    'Cucurbits': { bg: '#B2EBF2', text: '#006064' },
    'Legumes': { bg: '#DCEDC8', text: '#33691E' },
    'Root Crops': { bg: '#F5CBA7', text: '#784212' },
    'Greens & Herbs': { bg: '#C8F7C5', text: '#145A32' },
    'Cover Crop / Fallow': { bg: '#D5DBDB', text: '#2C3E50' },
};

function familyColor(assignment) {
    return FAMILY_COLORS[assignment] ?? { bg: 'rgba(45,79,30,0.07)', text: Colors.primaryGreen };
}

// ─── Farm grid with block positions ───────────────────────────────────────────
const FarmGrid = ({ blocks, onSelect, onAddAtPosition }) => {
    const byPos = {};
    for (const b of blocks) {
        if (b.gridPosition) {
            const key = `${b.gridPosition.col}_${b.gridPosition.row}`;
            byPos[key] = b;
        }
    }

    return (
        <View style={gridStyles.container}>
            <View style={gridStyles.compassRow}>
                <Text style={gridStyles.compass}>↑ N</Text>
            </View>
            <View style={gridStyles.grid}>
                {[0, 1, 2].map(row => (
                    <View key={row} style={gridStyles.gridRow}>
                        {[0, 1, 2].map(col => {
                            const block = byPos[`${col}_${row}`];
                            const fc = block ? familyColor(block.familyAssignment) : null;
                            const pos = GRID_POSITIONS.find(p => p.col === col && p.row === row);
                            const posLabel = pos?.label ?? '';
                            return (
                                <TouchableOpacity
                                    key={col}
                                    style={[
                                        gridStyles.cell,
                                        block
                                            ? { backgroundColor: fc.bg, borderColor: fc.text + '55' }
                                            : gridStyles.cellTappable,
                                    ]}
                                    onPress={() => block ? onSelect(block) : onAddAtPosition(pos)}
                                    activeOpacity={0.75}
                                >
                                    {block ? (
                                        <>
                                            <Text style={[gridStyles.cellName, { color: fc.text }]} numberOfLines={1}>{block.name}</Text>
                                            <Text style={[gridStyles.cellBeds, { color: fc.text + 'AA' }]}>{block.bedCount} beds</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={gridStyles.cellEmpty}>{posLabel}</Text>
                                            <Text style={gridStyles.cellAdd}>＋</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ))}
            </View>
        </View>
    );
};

const gridStyles = StyleSheet.create({
    container: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    compassRow: { alignItems: 'center', marginBottom: 2 },
    compass: { fontSize: 10, fontWeight: '700', color: Colors.mutedText, letterSpacing: 1 },
    grid: { gap: 4 },
    gridRow: { flexDirection: 'row', gap: 4 },
    cell: {
        flex: 1, aspectRatio: 3, borderRadius: Radius.sm,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.12)',
        backgroundColor: 'rgba(45,79,30,0.04)',
        alignItems: 'center', justifyContent: 'center', padding: 4,
    },
    cellTappable: {
        borderStyle: 'dashed', borderColor: 'rgba(45,79,30,0.2)',
        backgroundColor: 'rgba(45,79,30,0.02)',
    },
    cellName: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
    cellBeds: { fontSize: 8, textAlign: 'center' },
    cellEmpty: { fontSize: 8, color: Colors.mutedText, fontStyle: 'italic' },
    cellAdd: { fontSize: 11, color: 'rgba(45,79,30,0.3)', marginTop: 1 },
});

// ─── Block card ───────────────────────────────────────────────────────────────
const BlockCard = ({ block, onPress, onLongPress }) => {
    const fc = familyColor(block.familyAssignment);
    const posLabel = GRID_POSITIONS.find(p => p.col === block.gridPosition?.col && p.row === block.gridPosition?.row)?.label ?? '—';
    return (
        <TouchableOpacity
            style={[styles.blockCard, Shadows.card, { borderLeftColor: fc.text, borderLeftWidth: 4 }]}
            onPress={() => onPress(block)}
            onLongPress={() => onLongPress(block)}
            delayLongPress={600}
            activeOpacity={0.78}
        >
            <View style={styles.blockCardTop}>
                <View>
                    <Text style={styles.blockName}>{block.name}</Text>
                    <Text style={styles.blockPos}>{posLabel} · {block.bedCount} beds × {block.bedLengthFt}ft</Text>
                </View>
                <View style={[styles.familyBadge, { backgroundColor: fc.bg }]}>
                    <Text style={[styles.familyBadgeText, { color: fc.text }]}>
                        {block.familyAssignment?.replace('Mixed (no restriction)', 'Mixed') ?? 'Mixed'}
                    </Text>
                </View>
            </View>
            <Text style={styles.blockStat}>{blockSummaryLine(block)}</Text>
        </TouchableOpacity>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FarmDesignerScreen({ navigation, route }) {
    const farmProfile = route?.params?.farmProfile ?? null;
    const [blocks, setBlocks] = useState([]);

    // ── Web scroll fix (injected stylesheet) ────────────────────────────────────
    // RNW's flex layout expands the ScrollView div to full content height, so
    // setting overflowY: 'scroll' does nothing — there's no overflow to scroll.
    // Fix: inject a <style> tag that forces max-height + overflow-y via CSS
    // !important, which wins over RNW's flex expansion.
    useFocusEffect(useCallback(() => {
        if (Platform.OS !== 'web') return;
        const styleId = 'farm-scroll-fix';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            #${SCROLL_ID} {
                max-height: calc(100dvh - ${HEADER_H}px) !important;
                overflow-y: scroll !important;
                -webkit-overflow-scrolling: touch !important;
            }
        `;
        return () => {
            const el = document.getElementById(styleId);
            if (el) el.remove();
        };
    }, []));

    useFocusEffect(useCallback(() => {
        setBlocks(loadBlocks());
    }, []));

    const totalBeds = blocks.reduce((sum, b) => sum + (b.bedCount ?? 0), 0);
    const totalSqFt = blocks.reduce((sum, b) => sum + totalPlantedSqFt(b), 0);
    const totalAcres = (totalSqFt / 43560).toFixed(2);
    // Rough CSA estimate: ~1500 sq ft per 20-member share; scale accordingly
    const estimatedShares = Math.floor(totalSqFt / 75);

    const handleLongPress = (block) => {
        if (Platform.OS === 'web') {
            if (!window.confirm(`Delete "${block.name}"? This cannot be undone.`)) return;
            deleteBlock(block.id);
            setBlocks(loadBlocks());
        } else {
            // Could add an Alert here for native
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>FARM DESIGNER</Text>
                    <Text style={styles.heading}>My Farm</Text>
                </View>
                <TouchableOpacity
                    style={[styles.addBtn, { marginRight: 4 }]}
                    onPress={() => navigation.navigate('FarmSatellite', { farmProfile })}
                >
                    <Text style={styles.addBtnText}>🛰 Satellite</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.addBtn, { marginRight: 4 }]}
                    onPress={() => navigation.navigate('FarmCanvas', { farmProfile })}
                >
                    <Text style={styles.addBtnText}>🗺 Canvas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => navigation.navigate('BlockSetupWizard', { farmProfile })}
                >
                    <Text style={styles.addBtnText}>+ Block</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                nativeID={SCROLL_ID}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                style={{ flex: 1 }}
            >
                {/* Farm grid — capped height on web so block list is reachable */}
                <View style={Platform.OS === 'web' ? { maxHeight: 340 } : {}}>
                    <FarmGrid
                        blocks={blocks}
                        onSelect={block => navigation.navigate('BlockDetail', { block, farmProfile })}
                        onAddAtPosition={pos => navigation.navigate('BlockSetupWizard', { farmProfile, defaultGridPos: pos })}
                    />
                </View>

                {/* Empty state */}
                {blocks.length === 0 && (
                    <View style={styles.emptyView}>
                        <Text style={styles.emptyIcon}>🌱</Text>
                        <Text style={styles.emptyTitle}>No blocks yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Divide your farm into named blocks — "Block A", "North Field", "Hoop House" —
                            then assign crops, track rotation, and plan at scale.
                        </Text>
                        <TouchableOpacity
                            style={styles.emptyBtn}
                            onPress={() => navigation.navigate('BlockSetupWizard', { farmProfile })}
                        >
                            <Text style={styles.emptyBtnText}>+ Create First Block</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Block list */}
                {blocks.length > 0 && (
                    <>
                        <Text style={styles.sectionHeader}>Blocks ({blocks.length})</Text>
                        <View style={styles.blockList}>
                            {blocks.map(b => (
                                <BlockCard
                                    key={b.id}
                                    block={b}
                                    onPress={block => navigation.navigate('BlockDetail', { block, farmProfile })}
                                    onLongPress={handleLongPress}
                                />
                            ))}
                            {/* Add another block */}
                            <TouchableOpacity
                                style={styles.addBlockRow}
                                onPress={() => navigation.navigate('BlockSetupWizard', { farmProfile })}
                            >
                                <Text style={styles.addBlockRowText}>+ Add Another Block</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Farm totals */}
                        <View style={styles.totalsCard}>
                            <Text style={styles.totalsTitle}>Farm Totals</Text>
                            <View style={styles.totalsGrid}>
                                <TotalStat label="Beds" value={totalBeds} />
                                <TotalStat label="Sq ft" value={totalSqFt.toLocaleString()} />
                                <TotalStat label="Acres" value={totalAcres} />
                                <TotalStat label="Est. shares" value={estimatedShares} />
                            </View>
                            <Text style={styles.totalsNote}>
                                Share estimate based on ~75 sq ft planted area per weekly CSA share
                            </Text>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const TotalStat = ({ label, value }) => (
    <View style={styles.totalStat}>
        <Text style={styles.totalStatValue}>{value}</Text>
        <Text style={styles.totalStatLabel}>{label}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0EDE6',
    },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    addBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    addBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.xs },

    sectionHeader: { fontSize: Typography.xs, fontWeight: '800', color: Colors.primaryGreen, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 6 },

    blockList: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
    blockCard: {
        backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.md,
        padding: Spacing.md, gap: 4,
    },
    blockCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    blockName: { fontSize: Typography.md, fontWeight: '800', color: Colors.primaryGreen },
    blockPos: { fontSize: Typography.xs, color: Colors.mutedText, marginTop: 1 },
    familyBadge: { borderRadius: Radius.full, paddingVertical: 3, paddingHorizontal: 8 },
    familyBadgeText: { fontSize: 9, fontWeight: '800' },
    blockStat: { fontSize: Typography.xs, color: Colors.mutedText },

    addBlockRow: { borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
    addBlockRowText: { fontSize: Typography.sm, fontWeight: '700', color: 'rgba(45,79,30,0.5)' },

    emptyView: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 10 },
    emptyIcon: { fontSize: 52 },
    emptyTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.primaryGreen },
    emptySubtitle: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center', lineHeight: 20 },
    emptyBtn: { marginTop: 4, backgroundColor: Colors.primaryGreen, paddingVertical: 14, paddingHorizontal: 28, borderRadius: Radius.md },
    emptyBtnText: { color: Colors.cream, fontWeight: '800', fontSize: Typography.sm },

    totalsCard: { margin: Spacing.lg, backgroundColor: Colors.primaryGreen, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
    totalsTitle: { fontSize: Typography.xs, fontWeight: '800', color: Colors.warmTan, letterSpacing: 2, textTransform: 'uppercase' },
    totalsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    totalStat: { alignItems: 'center', gap: 2 },
    totalStatValue: { fontSize: 22, fontWeight: '900', color: Colors.cream },
    totalStatLabel: { fontSize: 9, fontWeight: '700', color: Colors.warmTan, textTransform: 'uppercase', letterSpacing: 0.5 },
    totalsNote: { fontSize: 10, color: Colors.warmTan, opacity: 0.7, fontStyle: 'italic' },
});
