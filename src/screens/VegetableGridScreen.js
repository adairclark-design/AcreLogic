import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    Animated,
    ScrollView,
    FlatList,
    Modal,
    Platform,
    Image,
} from 'react-native';

import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import cropDbRaw from '../data/crops.json';
import CROP_IMAGES from '../data/cropImages';

// ─── Responsive breakpoints ───────────────────────────────────────────────────
function getBreakpoint(width) {
    if (width < 600) {
        return { numColumns: 3, imageHeight: 100, nameFontSize: 12 };
    } else if (width < 1024) {
        return { numColumns: 4, imageHeight: 110, nameFontSize: 12 };
    } else if (width < 1400) {
        return { numColumns: 5, imageHeight: 110, nameFontSize: 13 };
    } else if (width < 1800) {
        return { numColumns: 6, imageHeight: 100, nameFontSize: 12 };
    } else {
        return { numColumns: 7, imageHeight: 90, nameFontSize: 12 };
    }
}

// ─── Crop Data — sourced from crops.json ─────────────────────────────────────
// Exclude Cover Crops from the selection screen (they're auto-managed by the planner)
const CROPS = cropDbRaw.crops
    .filter(c => c.category !== 'Cover Crop')
    .map(c => ({
        id: c.id,
        name: c.name,
        variety: c.variety,
        emoji: c.emoji ?? '🌱',
        dtm: c.dtm ? `${c.dtm}d` : '—',
        spacing: c.in_row_spacing_in ? `${c.in_row_spacing_in}"` : '—',
        rowSpacing: c.row_spacing_in ? `${c.row_spacing_in}"` : '—',
        type: c.seed_type,
        category: c.category,
        season: c.season,
        feedClass: c.feed_class,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

const CATEGORIES = [
    'All',
    'Vegetables',
    'Fruits & Melons',
    'Tomatoes',
    'Peppers',
    'Greens',
    'Brassica',
    'Root & Tuber',
    'Allium',
    'Beans & Peas',
    'Herbs',
    'Squash',
    'Cucumbers',
    'Melons',
    'Flowers',
    'Grains',
    'Cover Crops',
    'Specialty',
    'Nightshade',
    'Fruits & Berries',
];

// Super-category mappings
const VEGETABLE_CATEGORIES   = new Set(['Greens', 'Brassica', 'Root', 'Tuber', 'Allium', 'Legume']);
const FRUIT_MELON_CATEGORIES = new Set(['Cucurbit', 'Nightshade', 'Fruit']);
const GRAIN_CATEGORIES       = new Set(['Grain']);
const COVER_CROP_CATEGORIES  = new Set(['Cover Crop']);
const SQUASH_IDS_PATTERN     = ['squash', 'pumpkin', 'zucchini'];
const CUCUMBER_IDS_PATTERN   = ['cucumber'];
const MELON_IDS_PATTERN      = ['melon', 'watermelon', 'cantaloupe'];
const TOMATO_IDS_PATTERN     = ['tomato', 'tomatillo', 'ground_cherry'];
const PEPPER_IDS_PATTERN     = ['pepper'];


// ─── Frequency tracking (localStorage) ───────────────────────────────────────
const FREQ_KEY = 'acrelogic_crop_frequency';
function loadFrequency() {
    try { return JSON.parse(localStorage.getItem(FREQ_KEY) ?? '{}'); } catch { return {}; }
}
function bumpFrequency(ids) {
    try {
        const freq = loadFrequency();
        for (const id of ids) freq[id] = (freq[id] ?? 0) + 1;
        localStorage.setItem(FREQ_KEY, JSON.stringify(freq));
    } catch { }
}

// ─── Crop Card ────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
    'Greens':     { bg: '#E8F5E9', text: '#1B5E20' },
    'Brassica':   { bg: '#E8F5E9', text: '#2E7D32' },
    'Root':       { bg: '#FFF3E0', text: '#E65100' },
    'Tuber':      { bg: '#FFF3E0', text: '#BF360C' },
    'Allium':     { bg: '#F3E5F5', text: '#6A1B9A' },
    'Legume':     { bg: '#E3F2FD', text: '#0D47A1' },
    'Herb':       { bg: '#F1F8E9', text: '#33691E' },
    'Nightshade': { bg: '#FCE4EC', text: '#880E4F' },
    'Cucurbit':   { bg: '#E0F2F1', text: '#004D40' },
    'Flower':     { bg: '#F8BBD0', text: '#880E4F' },
    'Specialty':  { bg: '#FFF8E1', text: '#BF360C' },
    'Grain':      { bg: '#FFF9C4', text: '#F57F17' },
    'Fruit':      { bg: '#FCE4EC', text: '#C62828' },
    'Cover Crop': { bg: '#DCEDC8', text: '#33691E' },
};


const CropCard = ({ crop, selected, onPress, onLongPress, cardWidth }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const imgHeight = Math.round(cardWidth * 0.85); // square-ish photo

    const handlePress = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 50 }),
            Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 4 }),
        ]).start();
        onPress(crop.id);
    };

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
                style={[
                    styles.cropCard,
                    Shadows.card,
                    selected && styles.cropCardChosen,
                ]}
                onPress={handlePress}
                onLongPress={() => selected && onLongPress(crop)}
                delayLongPress={1500}
                activeOpacity={selected ? 1 : 0.85}
            >
                {/* Crop photo */}
                {CROP_IMAGES[crop.id]
                    ? <Image
                        source={CROP_IMAGES[crop.id]}
                        style={[styles.cropImage, { height: imgHeight }]}
                        resizeMode="cover"
                    />
                    : <View style={[styles.cropEmojiBox, { height: imgHeight }]}>
                        <Text style={styles.cropEmoji}>{crop.emoji}</Text>
                    </View>
                }

                {/* Crop name only — no badge/meta */}
                <Text
                    style={[styles.cropName, selected && styles.cropNameChosen]}
                    numberOfLines={1}
                >
                    {crop.name}
                </Text>

                {/* Selected overlay */}
                {selected && (
                    <View style={styles.chosenOverlay}>
                        <Text style={styles.chosenCheckmark}>✓</Text>
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
};


// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function VegetableGridScreen({ navigation, route }) {
    const farmProfile = route?.params?.farmProfile ?? null;
    const planId = route?.params?.planId ?? null;
    // Restore previously selected crops when returning from workspace (back nav)
    const restoredIds = route?.params?.selectedCropIds ?? [];
    const [selectedCrops, setSelectedCrops] = useState(() => new Set(restoredIds));
    const [activeCategory, setActiveCategory] = useState('All');
    const [contextMenuCrop, setContextMenuCrop] = useState(null); // crop shown in remove menu
    const [searchQuery, setSearchQuery] = useState('');

    const flatListRef = useRef(null);

    // Load frequency on mount + scroll FlatList to top
    const [cropFrequency, setCropFrequency] = useState({});
    React.useEffect(() => {
        setCropFrequency(loadFrequency());
        // Scroll to top on every mount (fixes "starts mid-list" issue)
        setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: false }), 50);
    }, []);

    // Reactive screen width — updates on resize & orientation change
    const { width } = useWindowDimensions();
    const layout = getBreakpoint(width);
    const { numColumns } = layout;

    const toggleCrop = (id) => {
        setSelectedCrops((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
        // No scroll — keep the grid stable so the user stays where they were
    };

    const removeCrop = (id) => {
        setSelectedCrops((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setContextMenuCrop(null);
    };

    const baseFiltered = (() => {
        const idMatch = (patterns) => CROPS.filter(c => patterns.some(p => c.id.includes(p)));
        switch (activeCategory) {
            case 'All':           return CROPS;
            case 'Vegetables':    return CROPS.filter(c => VEGETABLE_CATEGORIES.has(c.category));
            case 'Fruits & Melons': return CROPS.filter(c => FRUIT_MELON_CATEGORIES.has(c.category));
            case 'Tomatoes':      return idMatch(TOMATO_IDS_PATTERN);
            case 'Peppers':       return idMatch(PEPPER_IDS_PATTERN);
            case 'Greens':        return CROPS.filter(c => c.category === 'Greens');
            case 'Brassica':      return CROPS.filter(c => c.category === 'Brassica');
            case 'Root & Tuber':  return CROPS.filter(c => c.category === 'Root' || c.category === 'Tuber');
            case 'Allium':        return CROPS.filter(c => c.category === 'Allium');
            case 'Beans & Peas':  return CROPS.filter(c => c.category === 'Legume');
            case 'Herbs':         return CROPS.filter(c => c.category === 'Herb');
            case 'Squash':        return idMatch(SQUASH_IDS_PATTERN);
            case 'Cucumbers':     return idMatch(CUCUMBER_IDS_PATTERN);
            case 'Melons':        return idMatch(MELON_IDS_PATTERN);
            case 'Flowers':       return CROPS.filter(c => c.category === 'Flower');
            case 'Grains':        return CROPS.filter(c => GRAIN_CATEGORIES.has(c.category));
            case 'Cover Crops':   return CROPS.filter(c => COVER_CROP_CATEGORIES.has(c.category));
            case 'Specialty':     return CROPS.filter(c => c.category === 'Specialty');
            case 'Nightshade':    return CROPS.filter(c => c.category === 'Nightshade');
            case 'Fruits & Berries': return CROPS.filter(c => c.category === 'Fruit');
            default:              return CROPS.filter(c => c.category === activeCategory);
        }
    })().filter(c => !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) || (c.variety ?? '').toLowerCase().includes(searchQuery.trim().toLowerCase()));


    // Stable frequency-sorted list — never reorders when you tap, so the grid
    // doesn't jump. Checkmark overlay shows what's selected in-place.
    const filteredCrops = baseFiltered
        .sort((a, b) => (cropFrequency[b.id] ?? 0) - (cropFrequency[a.id] ?? 0) || a.name.localeCompare(b.name));

    const cardWidth = (width - Spacing.lg * 2 - Spacing.sm * (numColumns - 1)) / numColumns;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.stepLabel}>PHASE 2 OF 3</Text>
                    <Text style={styles.heading}>Select Your Crops</Text>
                </View>
                {selectedCrops.size > 0 && (
                    <View style={styles.selectionBadge}>
                        <Text style={styles.selectionCount}>{selectedCrops.size}</Text>
                    </View>
                )}
            </View>

            {/* Subtitle */}
            <Text style={styles.subheading}>
                Tap crops to add them to your planning queue. Seeds will populate your beds.
            </Text>

            {/* Category Filters */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filtersRow}
                contentContainerStyle={styles.filtersContent}
            >
                {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                        key={cat}
                        style={[styles.filterChip, activeCategory === cat && styles.filterChipActive]}
                        onPress={() => setActiveCategory(cat)}
                    >
                        <Text style={[styles.filterChipText, activeCategory === cat && styles.filterChipTextActive]}>
                            {cat}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Search bar */}
            <View style={styles.searchRow}>
                <Text style={{ paddingLeft: 12, color: Colors.mutedText, fontSize: 16 }}>🔍</Text>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search crops..."
                    placeholderTextColor={Colors.mutedText}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    clearButtonMode="while-editing"
                />
            </View>

            {/* Grid */}
            <FlatList
                ref={flatListRef}
                data={filteredCrops}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                key={numColumns}
                contentContainerStyle={[styles.grid, { paddingBottom: 140 }]}
                columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
                showsVerticalScrollIndicator={false}
                style={Platform.OS === 'web' ? { overflowY: 'scroll', flex: 1 } : { flex: 1 }}
                renderItem={({ item }) => (
                    <View style={{ width: cardWidth }}>
                        <CropCard
                            crop={item}
                            selected={selectedCrops.has(item.id)}
                            onPress={toggleCrop}
                            onLongPress={setContextMenuCrop}
                            cardWidth={cardWidth}
                        />
                    </View>
                )}
            />

            {/* Sticky bottom bar — always visible Plan Crops button */}
            <View style={styles.stickyFooter}>
                <TouchableOpacity
                    style={[
                        styles.continueBtn,
                        Shadows.button,
                        selectedCrops.size === 0 && styles.continueBtnDisabled,
                    ]}
                    onPress={() => {
                        if (selectedCrops.size === 0) return;
                        bumpFrequency(Array.from(selectedCrops));
                        setCropFrequency(loadFrequency());
                        navigation.navigate('BedWorkspace', {
                            farmProfile,
                            planId,
                            selectedCropIds: Array.from(selectedCrops),
                        });
                    }}
                    disabled={selectedCrops.size === 0}
                >
                    <Text style={styles.continueBtnText}>
                        {selectedCrops.size === 0
                            ? 'Select at least 1 crop'
                            : `Plan ${selectedCrops.size} Crop${selectedCrops.size > 1 ? 's' : ''} →`}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Context Menu Modal — long press / right click to remove */}
            <Modal
                visible={!!contextMenuCrop}
                transparent
                animationType="fade"
                onRequestClose={() => setContextMenuCrop(null)}
            >
                <TouchableOpacity
                    style={styles.contextScrim}
                    activeOpacity={1}
                    onPress={() => setContextMenuCrop(null)}
                >
                    <View style={styles.contextMenu}>
                        <Text style={styles.contextMenuTitle}>{contextMenuCrop?.name}</Text>
                        <Text style={styles.contextMenuSub}>What would you like to do?</Text>
                        <TouchableOpacity
                            style={styles.contextMenuRemoveBtn}
                            onPress={() => removeCrop(contextMenuCrop?.id)}
                        >
                            <Text style={styles.contextMenuRemoveText}>✕  Remove from selection</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.contextMenuCancelBtn}
                            onPress={() => setContextMenuCrop(null)}
                        >
                            <Text style={styles.contextMenuCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>


        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundGrey,
        // overflow must stay visible/auto so the absolutely-positioned footer
        // isn't clipped. On web we still constrain height to the viewport height
        // but use dvh (dynamic viewport height) so iOS Safari's browser chrome
        // doesn't eat into it. Falls back gracefully on older browsers.
        ...Platform.select({
            web: {
                maxHeight: '100dvh',
                // Do NOT set overflow: hidden — that would clip the sticky footer
            },
        }),
    },

    // ── Header ────────────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 56,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.sm,
        backgroundColor: Colors.primaryGreen,
        gap: Spacing.sm,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    headerText: { flex: 1, gap: 2 },
    stepLabel: {
        fontSize: Typography.xs,
        fontWeight: Typography.bold,
        color: Colors.warmTan,
        letterSpacing: 2,
    },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    selectionBadge: {
        backgroundColor: Colors.burntOrange,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectionCount: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.bold },

    // ── Subheading ────────────────────────────────────────────────────────────
    subheading: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        lineHeight: 18,
    },

    // ── Filters ───────────────────────────────────────────────────────────────
    filtersRow: { marginTop: Spacing.sm, flexGrow: 0, flexShrink: 0 },
    filtersContent: {
        paddingHorizontal: Spacing.lg,
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
    },
    filterChip: {
        paddingVertical: 7,
        paddingHorizontal: 16,
        borderRadius: Radius.full,
        backgroundColor: Colors.white,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.18)',
    },
    filterChipActive: {
        backgroundColor: Colors.primaryGreen,
        borderColor: Colors.primaryGreen,
    },
    filterChipText: { fontSize: Typography.sm, color: Colors.primaryGreen, fontWeight: Typography.medium },
    filterChipTextActive: { color: Colors.cream },

    // ── Grid ──────────────────────────────────────────────────────────────────
    grid: { paddingHorizontal: Spacing.lg, paddingBottom: 100, paddingTop: Spacing.sm },
    gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },

    // ── Crop Card ─────────────────────────────────────────────────────────────
    searchRow: {
        marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
        borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.9)',
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
        flexDirection: 'row', alignItems: 'center',
    },
    searchInput: {
        flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 10,
        fontSize: Typography.sm, color: Colors.primaryGreen,
    },
    freqHint: {
        fontSize: 10, color: Colors.mutedText, fontStyle: 'italic',
        marginHorizontal: Spacing.lg, marginBottom: 4,
    },
    cropEmojiBox: {
        width: '100%',
        borderRadius: Radius.sm,
        marginBottom: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropEmoji: {
        fontSize: 52,
        textAlign: 'center',
        textAlignVertical: 'center',
        lineHeight: 115,
    },
    catBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: Radius.full,
        marginBottom: 2,
    },
    catBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    cropCard: {
        backgroundColor: Colors.white,
        borderRadius: Radius.md,
        paddingBottom: Spacing.sm,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.15)',
        overflow: 'hidden',
        gap: 4,
    },
    cropCardChosen: {
        borderColor: Colors.primaryGreen,
        borderWidth: 2,
        backgroundColor: 'rgba(45,79,30,0.04)',
    },

    // ── Chosen overlay ─────────────────────────────────────────────────
    cropImageChosen: { opacity: 0.35 },
    cropNameChosen: { color: Colors.primaryGreen, fontWeight: Typography.bold },
    cropTextChosen: { color: 'rgba(0,0,0,0.3)' },
    chosenOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(45,79,30,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    chosenCheckmark: { fontSize: 26, color: Colors.primaryGreen, fontWeight: Typography.bold },
    chosenLabel: { fontSize: 11, fontWeight: Typography.bold, color: Colors.primaryGreen, letterSpacing: 0.5 },
    chosenHint: { fontSize: 9, color: Colors.mutedText, fontStyle: 'italic' },
    cropImage: {
        width: '100%',
        borderRadius: 0,
        marginBottom: 0,
    },
    cropName: {
        fontSize: 12,
        fontWeight: Typography.semiBold,
        color: Colors.darkText,
        textAlign: 'center',
        paddingHorizontal: 4,
    },
    cropMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    cropMetaText: { fontSize: 11, color: Colors.mutedText },
    cropMetaDot: { fontSize: 11, color: Colors.mutedText },
    cropSpacingRow: { marginTop: 2 },
    cropSpacing: { fontSize: 11, color: Colors.softLavender, fontWeight: Typography.medium },

    // ── Context menu modal ──────────────────────────────────────────────
    contextScrim: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    contextMenu: {
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.xl,
        alignItems: 'center',
        minWidth: 280,
        gap: Spacing.sm,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    contextMenuTitle: { fontSize: 18, fontWeight: Typography.bold, color: Colors.primaryGreen },
    contextMenuSub: { fontSize: 13, color: Colors.mutedText, marginBottom: Spacing.sm },
    contextMenuRemoveBtn: {
        backgroundColor: '#FFF0F0',
        borderWidth: 1,
        borderColor: '#FFCDD2',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: Radius.md,
        width: '100%',
        alignItems: 'center',
    },
    contextMenuRemoveText: { color: '#D32F2F', fontWeight: Typography.semiBold, fontSize: 14 },
    contextMenuCancelBtn: { paddingVertical: 10, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
    contextMenuCancelText: { color: Colors.mutedText, fontSize: 13 },

    // ── Footer ────────────────────────────────────────────────────────────────
    footer: {
        padding: Spacing.lg,
        paddingBottom: 60,
        backgroundColor: Colors.backgroundGrey,
        borderTopWidth: 1,
        borderTopColor: 'rgba(45,79,30,0.1)',
    },
    stickyFooter: {
        // Absolutely pin the footer to the bottom of the screen so it is always
        // visible regardless of browser chrome (iOS Safari toolbar, Android nav bar).
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: Spacing.md,
        // env(safe-area-inset-bottom) keeps the button above the iOS home
        // indicator on notched / Dynamic Island phones (web only).
        ...Platform.select({
            web: {
                paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
            },
            default: {
                paddingBottom: Spacing.lg,
            },
        }),
        backgroundColor: Colors.backgroundGrey,
        borderTopWidth: 1,
        borderTopColor: 'rgba(45,79,30,0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.07,
        shadowRadius: 6,
        elevation: 8,
    },
    continueBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 17,
        borderRadius: Radius.md,
        alignItems: 'center',
    },
    continueBtnDisabled: { backgroundColor: Colors.mutedText, opacity: 0.5 },
    continueBtnText: {
        color: Colors.cream,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        letterSpacing: 1.5,
    },
});
