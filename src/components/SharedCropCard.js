/**
 * SharedCropCard.js
 *
 * Canonical CropCard used by ALL crop-selection screens:
 *   - VegetableGridScreen (Market Farm)  ← source of truth
 *   - FamilyPlannerScreen
 *   - GardenSpacePlannerScreen
 *
 * Mirrors VegetableGridScreen's card exactly so every screen looks identical.
 */

import React, { useRef } from 'react';
import {
    Animated,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Colors, Radius, Shadows, Spacing, Typography } from '../theme';
import CROP_IMAGES from '../data/cropImages';
import { formatCropDisplayName } from '../utils/cropDisplay';
import { useSeedPrices } from '../services/seedPriceStore';

// ── Category color accents ────────────────────────────────────────────────────
// Subtle top-border hue per crop family — improves at-a-glance scannability.
const CATEGORY_COLORS = {
    Greens:     '#4CAF78',  // fresh green
    Brassica:   '#5B9BD5',  // cool blue
    Allium:     '#9C73B5',  // soft purple
    Nightshade: '#E05C5C',  // warm red
    Cucurbit:   '#E8A838',  // amber
    Legume:     '#5EB8C4',  // sky teal
    Root:       '#C47A3A',  // earthy orange
    Tuber:      '#B05E3A',  // terra cotta
    Herb:       '#6BAE75',  // herb green
    Flower:     '#D97DC4',  // florist pink
    Fruit:      '#E0633A',  // berry orange
    Grain:      '#C4A857',  // golden wheat
    Specialty:  '#8B9E70',  // sage
    'Cover Crop': '#7BAE8C', // muted green
};

// ── DTM speed indicator ───────────────────────────────────────────────────────
function getDtmSpeed(dtm) {
    if (!dtm || dtm > 365) return null;   // perennials / no data
    if (dtm <= 45)  return { dot: '🟢', label: `${dtm}d`, title: 'Fast crop' };
    if (dtm <= 80)  return { dot: '🟡', label: `${dtm}d`, title: 'Medium crop' };
    return           { dot: '🔴', label: `${dtm}d`, title: 'Slow crop' };
}

// ── Seed type display ─────────────────────────────────────────────────────────
function getSeedTypeLabel(seedType, friendlyMode) {
    if (!seedType) return null;
    if (!friendlyMode) return seedType;   // Market Farm: keep TP / DS
    if (seedType === 'TP') return '🏠 Indoors';
    if (seedType === 'DS') return '🌱 Direct Sow';
    return seedType;
}

/** ─── Props ────────────────────────────────────────────────────────────────
 *  crop        — crop object from crops.json (or farm-store format)
 *  selected    — boolean
 *  onPress     — (cropId: string) => void
 *  cardWidth   — pixel width of the card (used to derive image height)
 *  onLongPress — optional; called with the full crop object when selected card
 *                is long-pressed (used by Market Farm for context menu)
 *  friendlyMode — optional; when true (Feed My Family), translates TP/DS to
 *                 plain-language labels for non-professional users
 *  onShopPress  — optional; called with (crop, priceData) when the price pill is tapped
 */
export default function SharedCropCard({
    crop,
    selected,
    onPress,
    cardWidth,
    onLongPress,
    friendlyMode = false,
    onShopPress,
}) {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const imgHeight = cardWidth ? Math.round(cardWidth * 0.85) : 90;

    // ── Field normalisation: VegetableGridScreen uses crop.type,
    //    crops.json uses crop.seed_type — support both.
    const seedType     = crop.type ?? crop.seed_type;
    const categoryColor = CATEGORY_COLORS[crop.category] ?? Colors.primaryGreen;
    const dtmSpeed     = getDtmSpeed(crop.dtm);
    const seedTypeLabel = getSeedTypeLabel(seedType, friendlyMode);

    // Grab cached prices for this specific crop
    const allPrices = useSeedPrices();
    const priceData = allPrices?.[crop.id];

    const handlePress = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 50 }),
            Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, friction: 4 }),
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
                    // Category color accent — subtle top border
                    { borderTopColor: categoryColor, borderTopWidth: 3 },
                ]}
                onPress={handlePress}
                onLongPress={onLongPress ? () => selected && onLongPress(crop) : undefined}
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
                    : <View style={[styles.cropEmojiBox, { height: imgHeight, borderTopColor: categoryColor, borderTopWidth: 0 }]}>
                        <Text style={styles.cropEmoji}>{crop.emoji ?? '🌿'}</Text>
                    </View>
                }

                <Text
                    style={[styles.cropName, selected && styles.cropNameChosen]}
                    numberOfLines={2}
                >
                    {formatCropDisplayName(crop.name, crop.variety)}
                </Text>

                {/* ── Quick-scan data badges ───────────────────────────── */}
                <View style={styles.cropBadgeRow}>
                    {/* Color-coded DTM speed */}
                    {dtmSpeed && (
                        <View style={[styles.dtmPill, { borderLeftColor: categoryColor, borderLeftWidth: 2 }]}>
                            <Text style={styles.dtmDot}>{dtmSpeed.dot}</Text>
                            <Text style={styles.dtmPillText}>{dtmSpeed.label}</Text>
                        </View>
                    )}
                    {crop.season === 'cool' && (
                        <View style={[styles.seasonPill, styles.seasonPillCool]}>
                            <Text style={styles.seasonPillText}>❌️ Cool</Text>
                        </View>
                    )}
                    {crop.season === 'warm' && (
                        <View style={[styles.seasonPill, styles.seasonPillWarm]}>
                            <Text style={styles.seasonPillText}>☀️ Warm</Text>
                        </View>
                    )}
                    {seedTypeLabel && (
                        <View style={styles.typePill}>
                            <Text style={styles.typePillText}>{seedTypeLabel}</Text>
                        </View>
                    )}
                </View>

                {/* Inline Seed Shopping Pill */}
                {onShopPress && priceData && priceData.lowestPrice !== null && (
                    <TouchableOpacity 
                        style={styles.pricePillWrapper} 
                        onPress={() => onShopPress(crop, priceData)}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.pricePill, { borderColor: categoryColor }]}>
                            <Text style={[styles.pricePillText, { color: categoryColor }]}>
                                🛒 ${priceData.lowestPrice.toFixed(2)}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* Selected overlay */}
                {selected && (
                    <View style={styles.chosenOverlay}>
                        <Text style={styles.chosenCheckmark}>✓</Text>
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Styles (identical to VegetableGridScreen) ────────────────────────────────
const styles = StyleSheet.create({
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

    // ── Image ────────────────────────────────────────────────────────────────
    cropImage: {
        width: '100%',
        borderRadius: 0,
        marginBottom: 0,
    },
    cropEmojiBox: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(45,79,30,0.06)',
    },
    cropEmoji: { fontSize: 32 },

    // ── Name ────────────────────────────────────────────────────────────────
    cropName: {
        fontSize: 12,
        fontWeight: Typography.semiBold,
        color: Colors.darkText,
        textAlign: 'center',
        paddingHorizontal: 4,
    },
    cropNameChosen: {
        color: Colors.primaryGreen,
        fontWeight: Typography.bold,
    },

    // ── Badges ──────────────────────────────────────────────────────────────
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    dtmDot: {
        fontSize: 7,
        lineHeight: 10,
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

    // ── Inline Pre-fetched Prices ──────────────────────────────────────────
    pricePillWrapper: {
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingBottom: 4,
    },
    pricePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: Radius.full,
        borderWidth: 1,
        backgroundColor: '#FFF',
    },
    pricePillText: {
        fontSize: 9,
        fontWeight: Typography.bold,
    },

    // ── Selected overlay ─────────────────────────────────────────────────────
    chosenOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(45,79,30,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    chosenCheckmark: {
        fontSize: 26,
        color: Colors.primaryGreen,
        fontWeight: Typography.bold,
    },
});
