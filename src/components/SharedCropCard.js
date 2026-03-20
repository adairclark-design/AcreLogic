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

/** ─── Props ────────────────────────────────────────────────────────────────
 *  crop        — crop object from crops.json (or farm-store format)
 *  selected    — boolean
 *  onPress     — (cropId: string) => void
 *  cardWidth   — pixel width of the card (used to derive image height)
 *  onLongPress — optional; called with the full crop object when selected card
 *                is long-pressed (used by Market Farm for context menu)
 */
export default function SharedCropCard({
    crop,
    selected,
    onPress,
    cardWidth,
    onLongPress,
}) {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const imgHeight = cardWidth ? Math.round(cardWidth * 0.85) : 90;

    // ── Field normalisation: VegetableGridScreen uses crop.type,
    //    crops.json uses crop.seed_type — support both.
    const seedType = crop.type ?? crop.seed_type;

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
                    : <View style={[styles.cropEmojiBox, { height: imgHeight }]}>
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
                    {crop.dtm != null && crop.dtm !== '—' && (
                        <View style={styles.dtmPill}>
                            <Text style={styles.dtmPillText}>{crop.dtm}d</Text>
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
                    {seedType && (
                        <View style={styles.typePill}>
                            <Text style={styles.typePillText}>{seedType}</Text>
                        </View>
                    )}
                </View>

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
