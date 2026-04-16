import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Platform, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadBlocks, loadBlocksForPlan, deleteBlock, loadBlockBeds, loadFarmPlans, loadPlanCrops } from '../services/persistence';
import { totalPlantedSqFt } from '../services/farmUtils';
import GlobalNavBar from '../components/GlobalNavBar';

const HEADER_H = 120;
const SCROLL_ID = 'farm-designer-scrollview';

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

const DYNAMIC_GANTT_COLORS = [
    '#3A6328', '#527940', '#6A8E59', '#2E4C1D', '#466C32', '#7CA06B', '#1A3B0F'
];



// ─── Block Tile (compact grid card) ──────────────────────────────────────────
const BlockTile = ({ block, onPress, onLongPress }) => {
    const bedsData = loadBlockBeds(block.id);
    const cropCounts = {};
    Object.values(bedsData).forEach(bed => {
        if (bed?.successions) {
            bed.successions.forEach(succ => {
                const name = succ.crop_name ?? succ.name ?? 'Unknown';
                cropCounts[name] = (cropCounts[name] || 0) + 1;
            });
        }
    });

    const activeBedsCount = Object.values(bedsData).filter(b => b?.successions?.length > 0).length;
    const occupancyPct = block.bedCount > 0 ? Math.round((activeBedsCount / block.bedCount) * 100) : 0;
    const sqFt = (block.bedCount * block.bedLengthFt * 2.5);
    const acres = (sqFt / 43560).toFixed(2);
    const familyShort = (block.familyAssignment ?? 'Mixed').replace('Mixed (no restriction)', 'Mixed').replace('Brassica & Chicories', 'Brassica').replace('Cover Crop / Fallow', 'Cover');
    const varietiesCount = Object.keys(cropCounts).length;

    return (
        <TouchableOpacity
            style={[styles.blockTile, Shadows.card]}
            onPress={() => onPress(block)}
            onLongPress={() => onLongPress(block)}
            delayLongPress={600}
            activeOpacity={0.88}
        >
            {/* Occupancy fill bar at top */}
            {occupancyPct > 0 && (
                <View style={[styles.tileOccupancyBar, { width: `${occupancyPct}%` }]} />
            )}

            {/* Icon + Name row */}
            <View style={styles.tileHeaderRow}>
                <View style={styles.tileIconBg} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.tileName} numberOfLines={2}>
                        {block.name}
                        {block.gridPosition?.label && (
                            <Text style={styles.tileLocation}> · {block.gridPosition.label}</Text>
                        )}
                    </Text>
                    <Text style={styles.tileFamily}>{familyShort}</Text>
                </View>
                {occupancyPct > 0 && (
                    <Text style={styles.tilePct}>{occupancyPct}%</Text>
                )}
            </View>

            {/* Stats */}
            <View style={[styles.tileStats, { paddingBottom: 16 }]}>
                <Text style={styles.tileStat}>{block.bedCount} beds</Text>
                <Text style={styles.tileStatDot}>·</Text>
                <Text style={styles.tileStat}>{sqFt.toLocaleString()} ft²</Text>
                <Text style={styles.tileStatDot}>·</Text>
                <Text style={styles.tileStat}>{acres} ac</Text>
                {varietiesCount > 0 ? (
                    <>
                        <Text style={styles.tileStatDot}>·</Text>
                        <Text style={styles.tileStat}>{varietiesCount} {varietiesCount === 1 ? 'variety' : 'varieties'}</Text>
                    </>
                ) : (
                    <>
                        <Text style={styles.tileStatDot}>·</Text>
                        <Text style={[styles.tileStat, { fontStyle: 'italic', opacity: 0.6 }]}>Tap to plan</Text>
                    </>
                )}
            </View>
        </TouchableOpacity>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FarmDesignerScreen({ navigation, route }) {
    const farmProfile = route?.params?.farmProfile ?? null;
    
    // Get planId explicitly from route, or fallback to the most recent / default created plan
    const [planId] = useState(() => {
        if (route?.params?.planId) return route.params.planId;
        const plans = loadFarmPlans();
        return plans.length > 0 ? plans[0].id : null;
    });

    const [blocks, setBlocks] = useState([]);
    const [selectedCropIds, setSelectedCropIds] = useState([]);

    useFocusEffect(useCallback(() => {
        setSelectedCropIds(loadPlanCrops(planId) ?? []);
    }, [planId]));

    // ── Web scroll fix (injected stylesheet) ────────────────────────────────────
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
                overflow-y: auto !important;
                -webkit-overflow-scrolling: touch !important;
            }
        `;
        return () => {
            const el = document.getElementById(styleId);
            if (el) el.remove();
        };
    }, []));

    useFocusEffect(useCallback(() => {
        setBlocks(loadBlocksForPlan(planId));
    }, [planId]));

    const totalBeds = blocks.reduce((sum, b) => sum + (b.bedCount ?? 0), 0);
    const totalSqFt = blocks.reduce((sum, b) => sum + totalPlantedSqFt(b), 0);
    const totalAcres = (totalSqFt / 43560).toFixed(2);
    // Biointensive market farming standard: ~350-400 sq ft of intensively planted bed space per CSA share
    // (A typical 30"x50' bed is 125 sq ft. So 3 full beds per family/share).
    const estimatedShares = Math.floor(totalSqFt / 350);

    const handleLongPress = (block) => {
        if (Platform.OS === 'web') {
            if (!window.confirm(`Delete "${block.name}"? This cannot be undone.`)) return;
            deleteBlock(block.id);
            setBlocks(loadBlocksForPlan(planId));
        }
    };

    return (
        <View style={styles.container}>
            <GlobalNavBar navigation={navigation} farmProfile={farmProfile} planId={planId} activeRoute="FarmDesigner" />

            <ScrollView
                nativeID={SCROLL_ID}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                style={{ flex: 1 }}
            >
                <View style={styles.contentLayout}>
                    {/* Left Column: Main Content */}
                    <View style={styles.mainCol}>
                        {/* Page Header */}
                        <View style={styles.pageHeader}>
                            <View>
                                <Text style={styles.superTitle}>FARM DESIGNER</Text>
                                <Text style={styles.pageTitle}>My Farm</Text>
                                {/* Stat Badges */}
                                <View style={styles.statBadgesRow}>
                                    <View style={styles.statBadge}><Text style={styles.statBadgeText}>{totalBeds} beds</Text></View>
                                    <View style={styles.statBadge}><Text style={styles.statBadgeText}>{totalSqFt.toLocaleString()} ft²</Text></View>
                                    <View style={styles.statBadge}><Text style={styles.statBadgeText}>{totalAcres} acres</Text></View>
                                </View>
                            </View>
                            <View style={styles.headerButtons}>
                                <TouchableOpacity style={styles.resetBtn} activeOpacity={0.7} onPress={() => {}}>
                                    <Text style={styles.resetBtnText}>⟲ Reset</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.newBlockBtn}
                                    onPress={() => navigation.navigate('BlockSetupWizard', { farmProfile, planId })}
                                    activeOpacity={0.9}
                                >
                                    <Text style={styles.newBlockBtnText}>+ New Block</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Block Grid */}
                        <View style={styles.blockGrid}>
                            {blocks.length === 0 ? (
                                <View style={styles.emptyView}>
                                    <Text style={styles.emptyIcon}>🌱</Text>
                                    <Text style={styles.emptyTitle}>No blocks yet</Text>
                                    <Text style={styles.emptySubtitle}>Divide your farm into named blocks to start planning.</Text>
                                </View>
                            ) : (
                                blocks.map(b => (
                                    <BlockTile
                                        key={b.id}
                                        block={b}
                                        onPress={block => navigation.navigate('BlockDetail', {
                                        block,
                                        farmProfile,
                                        planId,
                                    })}
                                        onLongPress={handleLongPress}
                                    />
                                ))
                            )}

                            {blocks.length > 0 && (
                                <TouchableOpacity
                                    style={styles.addTileBtn}
                                    onPress={() => navigation.navigate('BlockSetupWizard', { farmProfile, planId })}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.addTilePlus}>+</Text>
                                    <Text style={styles.addTileText}>New Block</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Tools FAB */}
            <TouchableOpacity style={styles.fabBtn} activeOpacity={0.9}>
                <Text style={styles.fabBtnText}>🛠 Tools</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAF7' }, // Very light off-white bg
    scrollContent: { padding: Spacing.xl },



    // ── Layout ───────────────────────────────────────────────────────────
    contentLayout: { flexDirection: 'row', gap: 32, alignItems: 'flex-start', maxWidth: 1200, alignSelf: 'center', width: '100%' },
    mainCol: { flex: 1, minWidth: 0 },

    // ── Page Header ──────────────────────────────────────────────────────
    pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    superTitle: { fontSize: 10, fontWeight: '800', color: Colors.mutedText, letterSpacing: 2, marginBottom: 4 },
    pageTitle: { fontSize: 32, fontWeight: '900', color: Colors.primaryGreen, marginBottom: 12 },
    statBadgesRow: { flexDirection: 'row', gap: 8 },
    statBadge: { backgroundColor: '#D8EDAA', paddingVertical: 4, paddingHorizontal: 12, borderRadius: Radius.sm },
    statBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.primaryGreen },

    headerButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
    resetBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.full, borderWidth: 1, borderColor: '#CCC', backgroundColor: '#FFF' },
    resetBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primaryGreen },
    newBlockBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.full, backgroundColor: '#1A3B0F' },
    newBlockBtnText: { fontSize: 12, fontWeight: '800', color: Colors.cream },

    // ── Block Grid ────────────────────────────────────────────
    blockGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    blockTile: {
        // 3-column grid using flexBasis (avoids calc() which crashes RN)
        flexBasis: '31%',
        flexGrow: 1,
        maxWidth: '33%',
        minWidth: 200,
        backgroundColor: '#FFF',
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: '#F0F0F0',
        overflow: 'hidden',
        padding: 16,
        gap: 8,
    },
    tileOccupancyBar: {
        height: 3,
        backgroundColor: Colors.primaryGreen,
        borderRadius: 2,
        position: 'absolute',
        top: 0, left: 0,
        opacity: 0.45,
    },
    tileHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingTop: 6,
    },
    tileIconBg: {
        width: 28, height: 28,
        backgroundColor: Colors.primaryGreen,
        borderRadius: 7,
        opacity: 0.9,
    },
    tileName: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.darkText,
        lineHeight: 18,
    },
    tileFamily: {
        fontSize: 10,
        color: Colors.mutedText,
        marginTop: 1,
    },
    tileLocation: {
        fontSize: 13,
        color: Colors.primaryGreen,
        opacity: 0.6,
        fontWeight: '700',
    },
    tilePct: {
        fontSize: 11,
        fontWeight: '800',
        color: Colors.primaryGreen,
    },
    tileStats: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap',
    },
    tileStat: {
        fontSize: 11,
        color: Colors.mutedText,
        fontWeight: '600',
    },
    tileStatDot: {
        fontSize: 10,
        color: Colors.mutedText,
        opacity: 0.5,
    },

    addTileBtn: {
        flexBasis: '31%',
        flexGrow: 1,
        maxWidth: '33%',
        minWidth: 200,
        minHeight: 120,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: '#DADADA',
        borderRadius: Radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    addTilePlus: {
        fontSize: 28,
        color: '#B0B0B0',
        lineHeight: 32,
    },
    addTileText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#B0B0B0',
    },

    // ── Right Sidebar ─────────────────────────────────────────
    totalsCard: { backgroundColor: '#1A3B0F', borderRadius: Radius.lg, padding: 20 },
    totalsHeader: { color: '#BDE561', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
    totalsInner: { gap: 12 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { color: '#A0B994', fontSize: 12, fontWeight: '600' },
    totalVal: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    totalDiv: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },

    satBtn: { backgroundColor: '#FAFAF7', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
    satBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primaryGreen },

    // ── Floating Action Button ───────────────────────────────────
    fabBtn: { position: 'absolute', bottom: 32, right: 32, backgroundColor: '#1A3B0F', paddingVertical: 12, paddingHorizontal: 20, borderRadius: Radius.full, ...Shadows.card },
    fabBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },

    // ── Empty State ───────────────────────────────────────────
    emptyView: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, width: '100%' },
    emptyIcon: { fontSize: 52 },
    emptyTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.primaryGreen },
    emptySubtitle: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center' },
});
