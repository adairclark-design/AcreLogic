/**
 * UpgradeModal.js
 * ════════════════
 * Reusable paywall bottom-sheet modal.
 * Slides up from the bottom whenever a free-tier gate is hit.
 *
 * Props:
 *   visible    {bool}    — controls Modal visibility
 *   blockedBy  {string}  — key passed to getUpgradePrompt() in tierLimits.js
 *   onDismiss  {fn}      — called when user taps "Maybe Later" or the scrim
 *   onUpgrade  {fn}      — called when user taps the CTA (stub until Stripe is live)
 */
import React, { useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Modal, Animated, ScrollView, Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { getUpgradePrompt } from '../services/tierLimits';

// Premium features listed in the modal body
const PREMIUM_BULLETS = [
    { icon: '👨‍👩‍👧‍👦', text: 'Unlimited family size & crop count' },
    { icon: '🌾', text: 'Unlimited acreage & garden space' },
    { icon: '🤖', text: 'AI bed layout — auto-plans your space' },
    { icon: '🛰️', text: 'Satellite mapping for irregular plots' },
    { icon: '📅', text: 'Succession & multi-season scheduling' },
    { icon: '💰', text: 'Revenue & yield tracking for market farms' },
];

export default function UpgradeModal({ visible, blockedBy, onDismiss, onUpgrade }) {
    const slideAnim = useRef(new Animated.Value(400)).current;
    const fadeAnim  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 400, duration: 180, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    const prompt = getUpgradePrompt(blockedBy);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onDismiss}
        >
            {/* Scrim */}
            <Animated.View style={[styles.scrim, { opacity: fadeAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
            </Animated.View>

            {/* Sheet */}
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                {/* Handle bar */}
                <View style={styles.handle} />

                {/* Header */}
                <View style={styles.headerBand}>
                    <Text style={styles.lockIcon}>🔒</Text>
                    <Text style={styles.headline}>{prompt.headline}</Text>
                    <Text style={styles.body}>{prompt.body}</Text>
                </View>

                {/* Premium bullets */}
                <ScrollView
                    style={styles.bulletsScroll}
                    contentContainerStyle={styles.bulletsInner}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.bulletHeader}>WHAT YOU UNLOCK WITH PREMIUM</Text>
                    {PREMIUM_BULLETS.map((b, i) => (
                        <View key={i} style={styles.bulletRow}>
                            <Text style={styles.bulletIcon}>{b.icon}</Text>
                            <Text style={styles.bulletText}>{b.text}</Text>
                        </View>
                    ))}
                </ScrollView>

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.upgradeCta, Shadows.button]}
                        onPress={onUpgrade ?? onDismiss}
                        activeOpacity={0.88}
                    >
                        <Text style={styles.upgradeCtaText}>{prompt.cta} →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
                        <Text style={styles.dismissText}>Maybe Later</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10,20,5,0.55)',
    },

    sheet: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        backgroundColor: Colors.cardBg,
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        maxHeight: '85%',
        ...Shadows.drawer,
        ...Platform.select({
            web: { paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))' },
            default: { paddingBottom: 32 },
        }),
    },

    handle: {
        width: 40, height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(45,79,30,0.2)',
        alignSelf: 'center',
        marginTop: 12, marginBottom: 4,
    },

    // ── Header band ────────────────────────────────────────────────────────
    headerBand: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.1)',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    lockIcon: { fontSize: 32, marginBottom: Spacing.xs },
    headline: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        textAlign: 'center',
    },
    body: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        textAlign: 'center',
        lineHeight: 20,
        maxWidth: 320,
    },

    // ── Bullets ───────────────────────────────────────────────────────────
    bulletsScroll: { maxHeight: 220 },
    bulletsInner: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        gap: Spacing.sm,
    },
    bulletHeader: {
        fontSize: Typography.xs,
        fontWeight: Typography.bold,
        color: Colors.mutedText,
        letterSpacing: 1.5,
        marginBottom: Spacing.xs,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: 6,
        paddingHorizontal: Spacing.sm,
        backgroundColor: 'rgba(45,79,30,0.05)',
        borderRadius: Radius.sm,
    },
    bulletIcon: { fontSize: 18, width: 28, textAlign: 'center' },
    bulletText: { fontSize: Typography.sm, color: Colors.darkText, flex: 1 },

    // ── Actions ───────────────────────────────────────────────────────────
    actions: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        gap: Spacing.sm,
    },
    upgradeCta: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 16,
        borderRadius: Radius.md,
        alignItems: 'center',
    },
    upgradeCtaText: {
        color: Colors.cream,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        letterSpacing: 0.5,
    },
    dismissBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
    dismissText: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        textDecorationLine: 'underline',
    },
});
