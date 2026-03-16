/**
 * BedMapScreen — Visual Field Map
 * ════════════════════════════════
 * Full-screen farm overview with:
 *   • 8 beds rendered as realistic color-coded rectangles
 *   • 2-tap crop assignment: tap a crop in the tray → tap a bed to plant
 *   • Live succession state passed back to BedWorkspaceScreen
 *   • HTML5 drag-and-drop on web (progressive enhancement)
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Animated, Platform, ActivityIndicator, useWindowDimensions, Dimensions, Image,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import CROP_IMAGES from '../data/cropImages';
import { getCropsForWindow } from '../services/database';
import { loadRotationHistory } from '../services/persistence';
import { getSuccessionCandidatesRanked } from '../services/successionEngine';
import BedNoteModal from '../components/BedNoteModal';

// SCREEN_W still used for crop card sizing
const SCREEN_W = Dimensions.get('window').width;
const HEADER_H = 130; // approx header + status bar height in px
const TRAY_H = 160; // approximate crop palette tray height

// ─── Crop color palette (same as BedWorkspaceScreen) ─────────────────────────
// 24 visually-distinct colors — no two crops in this DB will share a color
const CROP_COLORS = [
    { bg: '#C8E6C9', text: '#1B5E20' }, // 0  deep green
    { bg: '#FFF9C4', text: '#F57F17' }, // 1  warm yellow
    { bg: '#FFCCBC', text: '#BF360C' }, // 2  salmon
    { bg: '#B2EBF2', text: '#006064' }, // 3  teal
    { bg: '#D7CCC8', text: '#4E342E' }, // 4  taupe
    { bg: '#F8BBD0', text: '#880E4F' }, // 5  rose
    { bg: '#DCEDC8', text: '#33691E' }, // 6  lime green
    { bg: '#FFE082', text: '#E65100' }, // 7  amber
    { bg: '#B3E5FC', text: '#01579B' }, // 8  sky blue
    { bg: '#E1BEE7', text: '#4A148C' }, // 9  lavender
    { bg: '#F0F4C3', text: '#827717' }, // 10 chartreuse (replaces duplicate salmon)
    { bg: '#C8F7C5', text: '#145A32' }, // 11 mint
    { bg: '#F5CBA7', text: '#784212' }, // 12 peach
    { bg: '#D5DBDB', text: '#2C3E50' }, // 13 silver
    { bg: '#FFDCE5', text: '#880E4F' }, // 14 blush
    { bg: '#E8D5C4', text: '#5D4037' }, // 15 tan
    { bg: '#C5E1A5', text: '#33691E' }, // 16 sage
    { bg: '#80CBC4', text: '#004D40' }, // 17 seafoam
    { bg: '#FFAB91', text: '#BF360C' }, // 18 coral
    { bg: '#CE93D8', text: '#4A148C' }, // 19 purple
    { bg: '#A5D6A7', text: '#1B5E20' }, // 20 forest
    { bg: '#FFF59D', text: '#F57F17' }, // 21 lemon
    { bg: '#90CAF9', text: '#0D47A1' }, // 22 periwinkle
    { bg: '#BCAAA4', text: '#3E2723' }, // 23 mauve
];

function cropColor(cropId) {
    if (!cropId) return CROP_COLORS[0];
    let h = 0;
    const s = String(cropId);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    return CROP_COLORS[h % CROP_COLORS.length];
}

// ─── Bed rectangle ─────────────────────────────────────────────────────────────
const BedTile = ({ bedNum, successions, selected, pendingCrop, lastSeason, onPress, onLongPress, onDrop }) => {
    const primary = successions?.[0];
    const color = primary ? cropColor(primary.crop_id) : null;
    const isPending = selected;

    // Web-only drag events via Platform.select
    const webProps = Platform.OS === 'web' ? {
        onDragOver: (e) => { e.preventDefault(); },
        onDrop: (e) => { e.preventDefault(); const id = e.dataTransfer.getData('cropId'); onDrop?.(bedNum, id); },
    } : {};

    // Compute remaining frost-free days (from last succession's end_date)
    const lastSucc = successions[successions.length - 1];
    const frostFreeRemaining = lastSucc?.end_date
        ? Math.max(0, Math.round((new Date(lastSucc.end_date) - new Date()) / 86400000))
        : null;

    return (
        <TouchableOpacity
            style={[
                styles.bedTile,
                color && { backgroundColor: color.bg + '55', borderColor: color.text + '33' },
                isPending && styles.bedTilePending,
            ]}
            onPress={() => onPress(bedNum)}
            onLongPress={() => onLongPress?.(bedNum)}
            delayLongPress={700}
            activeOpacity={0.75}
            {...webProps}
        >
            {/* Bed number + remaining days */}
            <View style={styles.bedTileHeader}>
                <Text style={[styles.bedTileNum, color && { color: color.text }]}>Bed {bedNum}</Text>
                {frostFreeRemaining !== null && (
                    <Text style={[styles.bedTileRemaining, frostFreeRemaining < 30 && styles.bedTileRemainingLow]}>
                        {frostFreeRemaining}d
                    </Text>
                )}
            </View>
            {/* All succession crops as stacked chips */}
            {successions.length > 0 ? (
                <View style={styles.bedTileChips}>
                    {successions.map((s, idx) => {
                        const c2 = cropColor(s.crop_id);
                        return (
                            <View key={idx} style={[styles.bedChip, { backgroundColor: c2.bg }]}>
                                <Text style={[styles.bedChipName, { color: c2.text }]} numberOfLines={1}>
                                    {s.crop_name}
                                </Text>
                                {s.dtm ? (
                                    <Text style={[styles.bedChipMeta, { color: c2.text + 'BB' }]}>
                                        {s.dtm}d · {s.variety ?? ''}
                                    </Text>
                                ) : null}
                            </View>
                        );
                    })}
                </View>
            ) : (
                <View style={styles.bedTileEmptyBlock}>
                    <Text style={styles.bedTileEmpty}>{isPending ? '⬇ Drop here' : 'Empty'}</Text>
                    {lastSeason && !isPending && (
                        <Text style={styles.bedTileLastSeason}>Last: {lastSeason.crop_name}</Text>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
};

// ─── Crop palette card ────────────────────────────────────────────────────────
const CropCard = ({ crop, selected, onPress, onDragStart }) => {
    const color = cropColor(crop.id);
    const imgSrc = CROP_IMAGES[crop.id];

    const webProps = Platform.OS === 'web' ? {
        draggable: 'true',
        onDragStart: (e) => { e.dataTransfer.setData('cropId', crop.id); onDragStart?.(crop); },
    } : {};

    return (
        <TouchableOpacity
            style={[
                styles.cropCard,
                { backgroundColor: color.bg, borderColor: color.text + '60' },
                selected && styles.cropCardSelected,
            ]}
            onPress={() => onPress(crop)}
            activeOpacity={0.78}
            {...webProps}
        >
            {imgSrc
                ? <Image
                    source={imgSrc}
                    style={styles.cropCardImage}
                    resizeMode="cover"
                />
                : <Text style={styles.cropCardEmoji}>{crop.emoji ?? '🌱'}</Text>
            }
            <Text style={[styles.cropCardName, { color: color.text }]} numberOfLines={2}>{crop.name}</Text>
            <Text style={[styles.cropCardDtm, { color: color.text }]}>{crop.dtm}d</Text>
        </TouchableOpacity>
    );
};


// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BedMapScreen({ navigation, route }) {
    const { farmProfile, bedSuccessions: initialSuccessions = {}, frostFreeDays = 170, selectedCropIds = [] } = route?.params ?? {};

    const [noteBed, setNoteBed] = useState(null); // null = modal closed

    // Web scroll: inject a small CSS override that forces the React Navigation
    // screen wrapper (which has flex-shrink:0) to allow the page to scroll,
    // and fixes the tray using position:fixed viewport anchoring.
    const { height: winH } = useWindowDimensions();
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const style = document.createElement('style');
        style.id = 'bedmap-web-fix';
        style.textContent = `
            /* Fix tray to bottom via CSS (RNW doesn't support position:'fixed' as a JS style) */
            #bedmap-tray { position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; }
        `;
        document.head.appendChild(style);
        return () => { const el = document.getElementById('bedmap-web-fix'); if (el) el.remove(); };
    }, []);

    const [bedSuccessions, setBedSuccessions] = useState(initialSuccessions);
    const [availableCrops, setAvailableCrops] = useState([]);
    const [selectedCrop, setSelectedCrop] = useState(null); // crop selected from tray
    const [loadingCrops, setLoadingCrops] = useState(true);
    const [plantingBed, setPlantingBed] = useState(null);  // bed currently animating plant
    const [statusMsg, setStatusMsg] = useState('Tap a crop, then tap a bed to assign it');
    const [hasChanges, setHasChanges] = useState(false);
    const [rotationHistory, setRotationHistory] = useState({});

    const trayAnim = useRef(new Animated.Value(200)).current;
    const statusOpacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        loadCrops();
        const history = loadRotationHistory();
        // Get the most recent season
        const years = Object.keys(history).sort();
        if (years.length > 0) {
            setRotationHistory(history[years[years.length - 1]] ?? {});
        }
        Animated.spring(trayAnim, {
            toValue: 0, tension: 55, friction: 11,
            useNativeDriver: Platform.OS !== 'web',  // useNativeDriver unsupported on web
        }).start();
    }, []);

    const loadCrops = async () => {
        try {
            const allCrops = await getCropsForWindow(200, ['cool', 'warm'], ['Cover Crop']);
            // Filter to Phase 2 selections — makes the Map tab palette match what user chose.
            // If user skipped Phase 2 (no selections), fall back to showing all crops.
            const filtered = selectedCropIds.length > 0
                ? allCrops.filter(c => selectedCropIds.includes(c.id))
                : allCrops;
            setAvailableCrops(filtered);
        } catch (e) {
            console.error('[BedMap] loadCrops:', e);
        } finally {
            setLoadingCrops(false);
        }
    };

    const flashStatus = (msg) => {
        setStatusMsg(msg);
        Animated.sequence([
            Animated.timing(statusOpacity, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(statusOpacity, { toValue: 0.3, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(statusOpacity, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();
    };

    const handleSelectCrop = useCallback((crop) => {
        setSelectedCrop(prev => prev?.id === crop.id ? null : crop);
        flashStatus(`"${crop.name}" selected — tap a bed to plant it`);
    }, []);

    const handleBedPress = useCallback(async (bedNum) => {
        if (!selectedCrop) {
            flashStatus('Tap a crop card first, then tap a bed');
            return;
        }

        setPlantingBed(bedNum);

        const currentSuccessions = bedSuccessions[bedNum] ?? [];

        // Same crop CAN appear multiple times in a bed (e.g. radish succession rounds)
        // Rotation enforcement happens cross-season via saveSeasonSnapshot

        try {
            // Get a dated succession candidate from the engine
            const candidates = await getSuccessionCandidatesRanked(
                { successions: currentSuccessions },
                farmProfile ?? { frost_free_days: frostFreeDays },
                { maxResults: 20 }
            );

            // Find the matching crop in candidates
            const best = candidates.find(c => c.crop?.id === selectedCrop.id) ?? candidates[0];

            if (!best?.fits) {
                flashStatus(`${selectedCrop.name} doesn't fit — not enough days left in Bed ${bedNum}`);
                setPlantingBed(null);
                return;
            }

            const newSlot = {
                crop_id: best.crop.id,
                crop_name: best.crop.name,
                variety: best.crop.variety,
                emoji: best.crop.emoji,
                dtm: best.crop.dtm,
                harvest_window_days: best.crop.harvest_window_days,
                feed_class: best.crop.feed_class,
                category: best.crop.category,
                start_date: best.start_date,
                end_date: best.end_date,
                succession_slot: currentSuccessions.length + 1,
            };

            setBedSuccessions(prev => ({
                ...prev,
                [bedNum]: [...(prev[bedNum] ?? []), newSlot],
            }));
            setHasChanges(true);
            flashStatus(`✓ ${selectedCrop.name} planted in Bed ${bedNum}`);
            setSelectedCrop(null);

        } catch (err) {
            console.error('[BedMap] plant error:', err);
            flashStatus('Plant failed — try again');
        } finally {
            setPlantingBed(null);
        }
    }, [selectedCrop, bedSuccessions, farmProfile, frostFreeDays]);

    // Web HTML5 drop handler
    const handleDrop = useCallback(async (bedNum, cropId) => {
        const crop = availableCrops.find(c => c.id === cropId);
        if (crop) {
            setSelectedCrop(crop);
            await handleBedPress(bedNum);
        }
    }, [availableCrops, handleBedPress]);

    const handleSaveAndBack = useCallback(() => {
        navigation.navigate('BedWorkspace', {
            farmProfile,
            bedSuccessions,
            planId: route?.params?.planId,
            selectedCropIds: route?.params?.selectedCropIds ?? [],
        });
    }, [bedSuccessions, farmProfile, navigation, route]);

    const handleClearBed = useCallback((bedNum) => {
        setBedSuccessions(prev => ({ ...prev, [bedNum]: [] }));
        setHasChanges(true);
        flashStatus(`Bed ${bedNum} cleared`);
    }, []);

    const beds = Array.from({ length: 8 }, (_, i) => i + 1);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={handleSaveAndBack}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.stepLabel}>FARM MAP</Text>
                    <Text style={styles.heading}>Visual Field Designer</Text>
                </View>
                {hasChanges && (
                    <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndBack}>
                        <Text style={styles.saveBtnText}>Save →</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Status bar */}
            <Animated.View style={[styles.statusBar, { opacity: statusOpacity }]}>
                <Text style={styles.statusText}>{statusMsg}</Text>
            </Animated.View>

            {/* Farm grid — scrollable on all platforms */}
            <ScrollView
                style={styles.mapArea}
                contentContainerStyle={styles.mapContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.pathRow}>
                    <Text style={styles.pathLabel}>← 4 ft path →</Text>
                </View>
                <View style={styles.bedGrid}>
                    {beds.map(bedNum => (
                        <View key={bedNum} style={styles.bedWrapper}>
                            <BedTile
                                bedNum={bedNum}
                                successions={bedSuccessions[bedNum] ?? []}
                                selected={selectedCrop !== null}
                                pendingCrop={selectedCrop}
                                lastSeason={rotationHistory[bedNum]}
                                onPress={handleBedPress}
                                onLongPress={(n) => setNoteBed(n)}
                                onDrop={handleDrop}
                            />
                            {(bedSuccessions[bedNum]?.length ?? 0) > 0 && (
                                <TouchableOpacity style={styles.clearBtn} onPress={() => handleClearBed(bedNum)}>
                                    <Text style={styles.clearBtnText}>✕</Text>
                                </TouchableOpacity>
                            )}
                            {plantingBed === bedNum && (
                                <View style={styles.plantingOverlay}>
                                    <ActivityIndicator color={Colors.primaryGreen} size="small" />
                                </View>
                            )}
                        </View>
                    ))}
                </View>
                <View style={styles.legend}>
                    <Text style={styles.legendText}>● Planned  ○ Empty  {selectedCrop ? `  ✦ Planting: ${selectedCrop.name}` : ''}</Text>
                </View>
            </ScrollView>

            {/* Crop palette tray — nativeID lets CSS inject position:fixed on web */}
            <Animated.View
                nativeID="bedmap-tray"
                style={[
                    styles.tray,
                    Platform.OS !== 'web' && { transform: [{ translateY: trayAnim }] },
                ]}
            >
                <View style={styles.trayHandle} />
                <View style={styles.trayHeader}>
                    <Text style={styles.trayTitle}>🌱 Crop Palette</Text>
                    {selectedCrop && (
                        <TouchableOpacity onPress={() => setSelectedCrop(null)} style={styles.cancelSelect}>
                            <Text style={styles.cancelSelectText}>Cancel</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {loadingCrops ? (
                    <ActivityIndicator color={Colors.primaryGreen} style={{ marginVertical: 16 }} />
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayScroll}>
                        {availableCrops.map(crop => (
                            <CropCard
                                key={crop.id}
                                crop={crop}
                                selected={selectedCrop?.id === crop.id}
                                onPress={handleSelectCrop}
                                onDragStart={handleSelectCrop}
                            />
                        ))}
                    </ScrollView>
                )}
            </Animated.View>

            {/* Bed Note Modal (long-press any bed tile) */}
            <BedNoteModal
                visible={noteBed !== null}
                bedNum={noteBed}
                onClose={() => setNoteBed(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0EDE6',
        // maxHeight (not minHeight) gives flex:1 children a bounded height,
        // so the ScrollView inside actually has something to scroll against.
        ...(Platform.OS === 'web' ? { maxHeight: '100dvh', overflow: 'hidden' } : {}),
    },


    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen, gap: Spacing.sm,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    headerText: { flex: 1, gap: 2 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    saveBtn: { backgroundColor: Colors.burntOrange, paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.full },
    saveBtnText: { color: Colors.white, fontWeight: Typography.bold, fontSize: Typography.sm },

    statusBar: {
        backgroundColor: 'rgba(45,79,30,0.1)', paddingVertical: 6,
        paddingHorizontal: Spacing.lg, alignItems: 'center',
    },
    statusText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.medium },

    mapArea: {
        flex: 1,
        minHeight: 0,
        // On web: explicit overflow+height so React Native Web's ScrollView actually scrolls.
        // paddingBottom reserves space so last bed clears the fixed Crop Palette tray.
        ...(Platform.OS === 'web' ? {
            overflowY: 'scroll',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 0, // padding is on mapContent instead
        } : {}),
    },
    mapContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 240 },

    pathRow: { alignItems: 'center', marginBottom: Spacing.sm },
    pathLabel: { fontSize: 9, color: Colors.mutedText, letterSpacing: 1, fontStyle: 'italic' },

    bedGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
        justifyContent: 'center',
    },

    bedWrapper: { position: 'relative', width: '48%' },

    bedTile: {
        width: '100%',
        // Reduced aspect ratio so more beds fit in the visible area without needing to scroll
        aspectRatio: Platform.OS === 'web' ? 4.5 : 2.2,
        backgroundColor: '#E8E0D5',
        borderRadius: Radius.md, borderWidth: 2.5, borderColor: 'rgba(45,79,30,0.15)',
        padding: Spacing.sm, justifyContent: 'center', gap: 3,
        overflow: 'hidden',
    },
    bedTilePending: {
        borderColor: Colors.primaryGreen, borderWidth: 3,
        borderStyle: 'dashed',
    },
    bedTileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
    bedTileNum: { fontSize: 9, fontWeight: '700', color: Colors.mutedText, letterSpacing: 0.5 },
    bedTileRemaining: { fontSize: 8, fontWeight: '700', color: Colors.primaryGreen, backgroundColor: 'rgba(45,79,30,0.12)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
    bedTileRemainingLow: { color: Colors.burntOrange, backgroundColor: 'rgba(198,101,30,0.12)' },
    bedTileChips: { flex: 1, gap: 2, justifyContent: 'flex-start' },
    bedChip: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginBottom: 1 },
    bedChipName: { fontSize: 9, fontWeight: '800', lineHeight: 11 },
    bedChipMeta: { fontSize: 7, lineHeight: 9 },
    bedTileEmptyBlock: { flex: 1, justifyContent: 'center', gap: 2 },
    bedTileEmpty: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic' },
    bedTileLastSeason: { fontSize: 8, color: Colors.mutedText, fontStyle: 'italic' },
    bedTileCrop: { fontSize: Typography.sm, fontWeight: '700', lineHeight: 16 },
    bedTileMore: { fontSize: 9 },

    clearBtn: {
        position: 'absolute', top: 4, right: 4,
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: 'rgba(198,40,40,0.15)', alignItems: 'center', justifyContent: 'center',
    },
    clearBtnText: { fontSize: 8, color: '#C62828', fontWeight: '900' },

    plantingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.6)',
        alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md,
    },

    legend: { marginTop: Spacing.md, alignItems: 'center' },
    legendText: { fontSize: 9, color: Colors.mutedText },

    // – Crop tray –
    // On web: static flex child at bottom (flexShrink:0) so it's always visible.
    // On native: keep absolute positioning for the slide-up overlay.
    tray: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Colors.cardBg ?? '#FAFAF7',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingBottom: 32, shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.12, shadowRadius: 8, elevation: 12,
    },
    trayStatic: {
        // Web-only tray: sits in normal flow at bottom, always visible
        flexShrink: 0, backgroundColor: Colors.cardBg ?? '#FAFAF7',
        borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.1)',
        paddingBottom: 12,
    },
    trayHandle: { width: 36, height: 4, backgroundColor: 'rgba(45,79,30,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 4 },
    trayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs },
    trayTitle: { fontSize: Typography.sm, fontWeight: '700', color: Colors.primaryGreen },
    cancelSelect: { backgroundColor: 'rgba(45,79,30,0.1)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.full },
    cancelSelectText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: '600' },

    trayScroll: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm },
    cropCard: {
        width: 72, height: 80, borderRadius: Radius.sm,
        borderWidth: 2, padding: Spacing.xs,
        alignItems: 'center', justifyContent: 'center', gap: 2,
    },
    cropCardSelected: { borderWidth: 3, borderColor: Colors.primaryGreen, transform: [{ scale: 1.08 }] },
    cropCardEmoji: { fontSize: 20 },
    cropCardImage: { width: 48, height: 44, borderRadius: Radius.xs, marginBottom: 1 },
    cropCardName: { fontSize: 8, fontWeight: '700', textAlign: 'center', lineHeight: 10 },
    cropCardDtm: { fontSize: 7, opacity: 0.7 },
});
