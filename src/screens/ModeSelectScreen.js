/**
 * ModeSelectScreen.js
 * ═══════════════════
 * The new entry hub between HeroScreen and the three main flows.
 *
 * Three cards:
 *   🌱 Feed My Family      → FamilyPlanner (free tier)
 *   🏡 Plan My Garden      → GardenSpacePlanner (Phase 3 — stub)
 *   🚜 Market Farm         → Location (existing premium flow)
 */
import React, { useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, ImageBackground, Platform, ScrollView,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import HomeLogoButton from '../components/HomeLogoButton';

const MODES = [
    {
        key: 'family',
        icon: '🌱',
        title: 'Feed My Family',
        subtitle: 'For gardeners comfortable in the dirt who want to scale up for a growing family. No guesswork. No hassle.',
        badge: 'FREE',
        badgeColor: '#4CAF50',
        route: 'FamilyPlanner',
        enabled: true,
    },
    {
        key: 'garden',
        icon: '🏡',
        title: 'Plan My Garden',
        subtitle: 'Helping you understand the space you have and letting the creativity flow.',
        badge: 'FREE',
        badgeColor: '#4CAF50',
        route: 'GardenSpacePlanner',
        enabled: true,
    },
    {
        key: 'design',
        icon: '🗺️',
        title: 'Design My Garden',
        subtitle: 'Mapping out specifics for beginners and lovers of organization.',
        badge: 'FREE',
        badgeColor: '#4CAF50',
        route: 'BedDesignerSetup',
        enabled: true,
    },

];

// ─── Single Mode Card ─────────────────────────────────────────────────────────
function ModeCard({ mode, onPress, delay }) {
    const fadeAnim  = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(32)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, delay, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <TouchableOpacity
                style={[styles.card, Shadows.card, !mode.enabled && styles.cardDisabled]}
                onPress={() => mode.enabled && onPress(mode)}
                activeOpacity={mode.enabled ? 0.82 : 1}
            >
                {/* Badge */}
                <View style={[styles.badge, { backgroundColor: mode.badgeColor }]}>
                    <Text style={styles.badgeText}>{mode.badge}</Text>
                </View>

                {/* Icon */}
                <Text style={[styles.cardIcon, !mode.enabled && styles.cardIconDimmed]}>
                    {mode.icon}
                </Text>

                {/* Copy */}
                <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, !mode.enabled && styles.cardTitleDimmed]}>
                        {mode.title}
                    </Text>
                    <Text style={styles.cardSubtitle}>{mode.subtitle}</Text>
                </View>

                {/* Arrow */}
                {mode.enabled && (
                    <Text style={styles.cardArrow}>›</Text>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ModeSelectScreen({ navigation }) {
    const headerFade  = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(headerFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(headerSlide, { toValue: 0, tension: 45, friction: 8, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleCardPress = (mode) => {
        // When starting Feed My Family, wipe any saved state so the new plan starts fresh.
        if (mode.key === 'family' && typeof localStorage !== 'undefined') {
            [
                'acrelogic_family_planner_selectedIds',
                'acrelogic_family_planner_planResult',
                'acrelogic_family_planner_excludedIds',
                'acrelogic_family_planner_familySize',
                'acrelogic_family_planner_gardenProfile',
            ].forEach(key => { try { localStorage.removeItem(key); } catch {} });
        }
        navigation.navigate(mode.route);
    };

    return (
        <View style={styles.container}>
            {/* Green header band */}
            <View style={styles.header}>
                {/* Back + centered logo row */}
                <View style={styles.headerTopRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <HomeLogoButton navigation={navigation} />
                    <View style={{ width: 36 }} />
                </View>
                <Animated.View style={{ opacity: headerFade, transform: [{ translateY: headerSlide }] }}>
                    <Text style={styles.headerTitle}>How can we help?</Text>
                    <Text style={styles.headerSub}>Choose the planning mode that fits your goal.</Text>
                </Animated.View>
            </View>

            {/* Cards */}
            <ScrollView
                contentContainerStyle={styles.cards}
                showsVerticalScrollIndicator={false}
                style={Platform.OS === 'web' ? { overflowY: 'auto' } : {}}
            >
                {MODES.map((mode, i) => (
                    <ModeCard
                        key={mode.key}
                        mode={mode}
                        onPress={handleCardPress}
                        delay={i * 80}
                    />
                ))}

                <Text style={styles.footerNote}>
                    All plans start free. Upgrade anytime to unlock the full suite.
                </Text>

                {/* ── DEV ONLY: remove before launch ── */}
                {Platform.OS === 'web' && (
                    <TouchableOpacity
                        style={styles.devLink}
                        onPress={() => {
                            if (typeof window !== 'undefined') {
                                window.location.href = window.location.pathname + '?dev=1';
                            }
                        }}
                    >
                        <Text style={styles.devLinkText}>🛠 Dev Testing Tools</Text>
                    </TouchableOpacity>
                )}

            </ScrollView>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundGrey,
        ...Platform.select({ web: { maxHeight: '100dvh' } }),
    },

    // ── Header ────────────────────────────────────────────────────────────────
    header: {
        backgroundColor: Colors.primaryGreen,
        paddingTop: 54,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xl,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
    },
    backBtn: { padding: 4, width: 36 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    superLabel: {
        fontSize: Typography.xs,
        fontWeight: Typography.bold,
        color: Colors.warmTan,
        letterSpacing: 3,
        marginBottom: 4,
    },
    headerTitle: {
        fontSize: Typography.xxl,
        fontWeight: Typography.bold,
        color: Colors.cream,
        marginBottom: Spacing.xs,
    },
    headerSub: {
        fontSize: Typography.sm,
        color: 'rgba(245,245,220,0.75)',
        lineHeight: 18,
    },

    // ── Cards ─────────────────────────────────────────────────────────────────
    cards: {
        padding: Spacing.lg,
        gap: Spacing.md,
    },

    card: {
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.1)',
    },
    cardDisabled: {
        opacity: 0.55,
        borderStyle: 'dashed',
    },

    badge: {
        position: 'absolute',
        top: 12, right: 12,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: Radius.full,
    },
    badgeText: {
        fontSize: 9,
        fontWeight: Typography.bold,
        color: Colors.white,
        letterSpacing: 0.8,
    },

    cardIcon: { fontSize: 40 },
    cardIconDimmed: { opacity: 0.5 },

    cardBody: { flex: 1, gap: 4, paddingRight: 24 },
    cardTitle: {
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
    },
    cardTitleDimmed: { color: Colors.mutedText },
    cardSubtitle: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        lineHeight: 18,
    },

    cardArrow: {
        fontSize: 28,
        color: Colors.primaryGreen,
        fontWeight: Typography.bold,
        lineHeight: 30,
    },

    // ── Footer ────────────────────────────────────────────────────────────────
    footerNote: {
        textAlign: 'center',
        fontSize: Typography.xs,
        color: Colors.mutedText,
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
        lineHeight: 16,
    },

    // ── DEV ONLY — remove before launch ──────────────────────────────────────
    devLink: {
        alignSelf: 'center',
        marginBottom: Spacing.xl,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.12)',
        backgroundColor: 'rgba(0,0,0,0.03)',
    },
    devLinkText: {
        fontSize: 11,
        color: Colors.mutedText,
        fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    },
});

