import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    useWindowDimensions,
    Animated,
    FlatList,
    Modal,
    Platform,
    Image,
} from 'react-native';

import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import cropDbRaw from '../data/crops.json';
import CROP_IMAGES from '../data/cropImages';
import CategorySidebar from '../components/CategorySidebar';
import { formatCropDisplayName } from '../utils/cropDisplay';
import { getCropEarliestActionOffset } from '../services/homeGardenCalculator';
import GlobalNavBar from '../components/GlobalNavBar';
// ─── Responsive breakpoints ───────────────────────────────────────────────────
function getBreakpoint(width) {
    if (width < 480) {
        return { numColumns: 3, imageHeight: 80, nameFontSize: 10 };
    } else if (width < 768) {
        return { numColumns: 4, imageHeight: 72, nameFontSize: 10 };
    } else if (width < 1024) {
        return { numColumns: 6, imageHeight: 68, nameFontSize: 10 };
    } else if (width < 1280) {
        return { numColumns: 8, imageHeight: 60, nameFontSize: 9 };
    } else if (width < 1600) {
        return { numColumns: 10, imageHeight: 54, nameFontSize: 9 };
    } else if (width < 1920) {
        return { numColumns: 11, imageHeight: 50, nameFontSize: 9 };
    } else {
        return { numColumns: 12, imageHeight: 48, nameFontSize: 9 };
    }
}

// ─── Crop Data — sourced from crops.json ─────────────────────────────────────
// All crops including cover crops — visible under the "Cover Crops" MegaMenuBar tab
const CROPS = cropDbRaw.crops
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

// ─── Frequency tracking (localStorage) ───────────────────────────────────────
const FREQ_KEY = 'acrelogic_crop_frequency';
function loadFrequency() {
    try { 
        const parsed = JSON.parse(localStorage.getItem(FREQ_KEY) ?? '{}'); 
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch { return {}; }
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


const CropCard = ({ crop, cardWidth }) => {
    const imgHeight = Math.round(cardWidth * 0.85); // square-ish photo

    return (
        <View style={[styles.cropCard, Shadows.card]}>
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

            <Text
                style={styles.cropName}
                numberOfLines={2}
            >
                {formatCropDisplayName(crop.name, crop.variety)}
            </Text>

            {/* ── Quick-scan data badges ───────────────────────────────── */}
            <View style={styles.cropBadgeRow}>
                {crop.dtm !== '—' && (
                    <View style={styles.dtmPill}>
                        <Text style={styles.dtmPillText}>{crop.dtm}</Text>
                    </View>
                )}
                {crop.season === 'cool' && (
                    <View style={[styles.seasonPill, styles.seasonPillCool]}>
                        <Text style={styles.seasonPillText}>❄️ Cool</Text>
                    </View>
                )}
                {crop.season === 'warm' && (
                    <View style={[styles.seasonPill, styles.seasonPillWarm]}>
                        <Text style={styles.seasonPillText}>☀️ Warm</Text>
                    </View>
                )}
                {crop.type && (
                    <View style={styles.typePill}>
                        <Text style={styles.typePillText}>{crop.type}</Text>
                    </View>
                )}
            </View>
        </View>
    );
};


class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorMessage: '', errorStack: '' };
    }
    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            errorMessage: error?.message ?? String(error),
            errorStack: error?.stack ?? '',
        };
    }
    componentDidCatch(error, errorInfo) {
        console.error('[VegetableGridScreen] Error caught by boundary:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', backgroundColor: '#1a1a1a', padding: Spacing.xl }}>
                    <Text style={{ fontSize: Typography.md, fontWeight: Typography.bold, color: '#FF6B6B', marginBottom: Spacing.sm }}>⚠ Component Crashed</Text>
                    <Text style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFD93D', marginBottom: 4 }}>Error:</Text>
                    <Text selectable style={{ fontSize: 12, color: '#FF6B6B', fontFamily: 'monospace', marginBottom: Spacing.md, backgroundColor: '#2a2a2a', padding: 10, borderRadius: 6, width: '100%' }}>
                        {this.state.errorMessage}
                    </Text>
                    <Text style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFD93D', marginBottom: 4 }}>Stack:</Text>
                    <Text selectable style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', marginBottom: Spacing.xl, backgroundColor: '#2a2a2a', padding: 10, borderRadius: 6, width: '100%' }}>
                        {this.state.errorStack}
                    </Text>
                    <TouchableOpacity onPress={() => this.setState({ hasError: false, errorMessage: '', errorStack: '' })} style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: Colors.primaryGreen, borderRadius: Radius.md }}>
                        <Text style={{ color: Colors.white, fontWeight: Typography.semiBold }}>Restart View</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        return this.props.children;
    }
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
function VegetableGridScreenInner({ navigation, route }) {
    const farmProfile = route?.params?.farmProfile ?? null;
    const planId = route?.params?.planId ?? null;
    
    // IMPORTANT: filterFn is stored as { fn: Function } — NOT as a raw function.
    // React treats any function passed to setState() as a functional updater (calling it with
    // the previous state), which would silently corrupt the stored filter function on every
    // category change and eventually crash the filteredCrops sort. The object wrapper prevents this.
    const [filterObj, setFilterObj] = useState({ fn: () => true });  // driven by CategorySidebar
    const [searchQuery, setSearchQuery] = useState('');

    // Load frequency on mount + scroll FlatList to top
    const [cropFrequency, setCropFrequency] = useState({});
    React.useEffect(() => {
        setCropFrequency(loadFrequency());
        // Scroll to top removed to safely avoid React Native Web VirtualizedList layout race condition
        // Setting it blindly with a 50ms timeout was intermittently corrupting layout state and blanking the grid.
    }, []);



    // Reactive screen width — updates on resize & orientation change
    const { width } = useWindowDimensions();
    const layout = getBreakpoint(width);
    const { numColumns } = layout;
    const isDesktop = width >= 1024;
    
    // Add an active label tracker for the sidebar
    const [activeFilterLabel, setActiveFilterLabel] = useState('All');



    const filteredCrops = CROPS
        .filter(filterObj.fn)
        .filter(c => !searchQuery.trim() ||
            c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
            (c.variety ?? '').toLowerCase().includes(searchQuery.trim().toLowerCase())
        )
        .sort((a, b) => {
            try {
                const offsetA = getCropEarliestActionOffset(a);
                const offsetB = getCropEarliestActionOffset(b);
                if (offsetA !== offsetB) return offsetA - offsetB;
            } catch { /* defensive: never let sort throw */ }
            return (cropFrequency[b.id] ?? 0) - (cropFrequency[a.id] ?? 0) || a.name.localeCompare(b.name);
        });

    return (
        <View style={styles.container}>
            <GlobalNavBar 
                navigation={navigation} 
                farmProfile={farmProfile} 
                planId={planId} 
                activeRoute="VegetableGrid" 
            />

            {isDesktop ? (
                // ── Desktop Layout: Sidebar + Main Content ──
                <View style={styles.desktopRow}>
                    <CategorySidebar 
                        isMobile={false}
                        activeLabel={activeFilterLabel}
                        onFilterChange={({ label, filterFn }) => {
                            setActiveFilterLabel(label);
                            setFilterObj({ fn: filterFn });
                        }}
                    />
                    <View style={styles.desktopMainContent}>
                        {/* Subtitle */}
                        <Text style={[styles.subheading, { paddingHorizontal: Spacing.md }]}>
                            Browse the agronomic catalog to view crop spacings and harvest details.
                        </Text>
            
                        {/* Search bar */}
                        <View style={[styles.searchRow, { marginHorizontal: Spacing.md }]}>
                            <Text style={{ paddingLeft: 12, color: Colors.mutedText, fontSize: 16 }}>🔍</Text>
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search crops..."
                                placeholderTextColor={Colors.mutedText}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                clearButtonMode="while-editing"
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ paddingHorizontal: 8 }}>
                                    <Text style={{ color: Colors.mutedText, fontSize: 16 }}>✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>
            
                        {/* Grid */}
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            style={Platform.OS === 'web' ? { overflowY: 'auto', flex: 1 } : { flex: 1 }}
                            contentContainerStyle={[styles.grid, { paddingBottom: 60, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }]}
                        >
                            {filteredCrops.map(item => (
                                <View key={item.id} style={{ width: 160 }}>
                                    <CropCard crop={item} cardWidth={160} />
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            ) : (
                // ── Mobile Layout: Stacked ──
                <View style={{ flex: 1 }}>
                    {/* Subtitle */}
                    <Text style={styles.subheading}>
                        Browse the agronomic catalog to view crop spacings and harvest details.
                    </Text>
        
                    {/* Wrapping Mobile Filter Bar */}
                    <CategorySidebar 
                        isMobile={true}
                        activeLabel={activeFilterLabel}
                        onFilterChange={({ label, filterFn }) => {
                            setActiveFilterLabel(label);
                            setFilterObj({ fn: filterFn });
                        }}
                    />
        
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
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ paddingHorizontal: 8 }}>
                                <Text style={{ color: Colors.mutedText, fontSize: 16 }}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
        
                    {/* Grid */}
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={Platform.OS === 'web' ? { overflowY: 'auto', flex: 1 } : { flex: 1 }}
                        contentContainerStyle={[styles.grid, { paddingBottom: 60, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }]}
                    >
                        {filteredCrops.map(item => (
                            <View key={item.id} style={{ width: 140 }}>
                                <CropCard crop={item} cardWidth={140} />
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

export default function VegetableGridScreen(props) {
    return (
        <ErrorBoundary>
            <VegetableGridScreenInner {...props} />
        </ErrorBoundary>
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
        paddingBottom: Spacing.sm,
        lineHeight: 18,
    },
    
    // ── Layout Modifiers ───────────────────────────────────────────────────────
    desktopRow: {
        flex: 1,
        flexDirection: 'row',
    },
    desktopMainContent: {
        flex: 1,
        // The main content area also manages its own scroll state inherently via FlatList
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

    // ── Search & Grid ──────────────────────────────────────────────────────────────────
    grid: { paddingHorizontal: Spacing.lg, paddingBottom: 100, paddingTop: Spacing.md },
    gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },

    // ── Crop Card ─────────────────────────────────────────────────────────────
    searchRow: {
        marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, marginTop: Spacing.sm,
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

    // ── Quick-scan crop badges ─────────────────────────────────────────────
    cropBadgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 4,
        paddingBottom: 5,
        minHeight: 18,
    },
    dtmPill: {
        backgroundColor: 'rgba(45,79,30,0.10)',
        borderRadius: 4,
        paddingVertical: 1,
        paddingHorizontal: 5,
    },
    dtmPillText: {
        fontSize: 8,
        fontWeight: '800',
        color: Colors.primaryGreen,
    },
    seasonPill: {
        borderRadius: 4,
        paddingVertical: 1,
        paddingHorizontal: 4,
    },
    seasonPillCool: { backgroundColor: '#dff0fa' },
    seasonPillWarm: { backgroundColor: '#fff0e0' },
    seasonPillText: {
        fontSize: 8,
        fontWeight: '700',
        color: Colors.darkText,
    },
    typePill: {
        backgroundColor: 'rgba(45,79,30,0.06)',
        borderRadius: 4,
        paddingVertical: 1,
        paddingHorizontal: 4,
    },
    typePillText: {
        fontSize: 8,
        fontWeight: '700',
        color: Colors.mutedText,
    },

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
    compactSelectionBox: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
        borderRadius: Radius.full, paddingLeft: 6, paddingRight: 8, paddingVertical: 4,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.15)', gap: 6,
        ...Shadows.card
    },
    compactSelectionText: { fontSize: 12, fontWeight: '700', color: Colors.primaryGreen },
    compactSelectionRemove: {
        width: 16, height: 16, borderRadius: 8, backgroundColor: '#B71C1C',
        alignItems: 'center', justifyContent: 'center', marginLeft: 2
    },
});
