/**
 * RoleSelectScreen.js
 * ════════════════════
 * Second screen after the Hero. Two large square cards side-by-side:
 *
 *   🚜 Market Farmer  ←→  🌱 Home Gardener
 *
 * Market Farmer → Location (existing premium flow)
 * Home Gardener → ModeSelector (3 sub-options: Feed Family / Plan Garden / Design Garden)
 */
import React, { useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, Image, ScrollView, Platform, Dimensions, StatusBar, ImageBackground
} from 'react-native';
import { LinearGradient } from '../components/LinearGradient';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import HomeLogoButton from '../components/HomeLogoButton';

const { width, height } = Dimensions.get('window');
const CARD_SIZE = Math.min((width - Spacing.lg * 2 - 12) / 2, 220);

// ─── Role Card ────────────────────────────────────────────────────────────────
function RoleCard({ icon, title, subtitle, badge, badgeColor, onPress, delay, accent }) {
    const fadeAnim  = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.88)).current;
    const pressScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, tension: 55, friction: 9, delay, useNativeDriver: true }),
        ]).start();
    }, []);

    const handlePressIn  = () => Animated.spring(pressScale, { toValue: 0.95, useNativeDriver: true }).start();
    const handlePressOut = () => Animated.spring(pressScale, { toValue: 1, friction: 4, useNativeDriver: true }).start();

    return (
        <Animated.View style={{
            opacity: fadeAnim,
            transform: [{ scale: Animated.multiply(scaleAnim, pressScale) }],
        }}>
            <TouchableOpacity
                style={[styles.card, { borderColor: accent + '44' }, Shadows.card]}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
            >
                {/* Badge */}
                {badge ? (
                    <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                        <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                ) : null}

                {/* Colored accent strip at top */}
                <View style={[styles.cardStrip, { backgroundColor: accent }]} />

                {/* Icon area */}
                <View style={styles.cardIconWrap}>
                    <Text style={styles.cardIcon}>{icon}</Text>
                </View>

                {/* Text */}
                <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, { color: accent }]}>{title}</Text>
                    <Text style={styles.cardSubtitle}>{subtitle}</Text>
                </View>

                {/* Arrow pill */}
                <View style={[styles.arrowPill, { backgroundColor: accent }]}>
                    <Text style={styles.arrowText}>›</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RoleSelectScreen({ navigation }) {
    const headerFade  = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-24)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(headerFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(headerSlide, { toValue: 0, tension: 45, friction: 8, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <View style={[styles.container, Platform.OS === 'web' && { height: '100vh', overflow: 'hidden' }]}>
            <Image 
                source={require('../../assets/hero-garden-v3.png')}
                style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
                resizeMode="cover"
            />
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <LinearGradient 
                colors={['rgba(28,52,21,0.4)', 'rgba(15,35,10,0.7)']}
                style={StyleSheet.absoluteFillObject}
            />

            <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                style={{ flex: 1 }}
            >
                {/* Hero header */}
                <View style={styles.heroBg}>

                    {/* Header row: back + logo */}
                    <View style={styles.headerRow}>
                        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                            <Text style={styles.backArrow}>‹</Text>
                        </TouchableOpacity>
                        <HomeLogoButton navigation={navigation} />
                        <View style={{ width: 36 }} />
                    </View>

                {/* Title block */}
                <Animated.View style={[styles.titleBlock, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
                    <Text style={styles.superLabel}>STEP 1 OF 2</Text>
                    <Text style={styles.title}>Who are you planning for?</Text>
                    <Text style={styles.subtitle}>
                        Choose your planning mode. You can always switch later.
                    </Text>
                </Animated.View>

                {/* Two square role cards side by side */}
                <View style={styles.cardRow}>
                    <RoleCard
                        icon="🚜"
                        title="Market Farmer"
                        subtitle="Blocks, successions, revenue tracking & full farm planning suite."
                        badge="PRO"
                        badgeColor={Colors.burntOrange}
                        accent={Colors.burntOrange ?? '#BF360C'}
                        delay={80}
                        onPress={() => navigation.navigate('FarmPlanList')}
                    />
                    <RoleCard
                        icon="🌱"
                        title="Home Gardener"
                        subtitle="Feed your family, design raised beds, and plan your garden plot."
                        badge="FREE"
                        badgeColor="#4CAF50"
                        accent={Colors.primaryGreen}
                        delay={160}
                        onPress={() => navigation.navigate('ModeSelector')}
                    />
                    </View>
                </View>

                {/* Footer note */}
                <Text style={styles.footerNote}>
                    All plans start free · Upgrade to Pro anytime
                </Text>
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.primaryGreen, ...Platform.select({ web: { height: '100dvh' } }) },
    
    // ── Background & Scroll Settings ──────────────────────────────────────────
    scrollContent: {
        flexGrow: 1,
        // Remove center alignment so the header sets the flow naturally
        paddingBottom: 40,
    },

    // ── Hero header ──────────────────────────────────────────────────────────
    heroBg: {
        width: '100%',
        paddingBottom: Spacing.xl,
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },

    // ── Header ────────────────────────────────────────────────────────────────
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 56,
        paddingHorizontal: Spacing.lg,
        marginBottom: 60, // Exposes more of the background image before the text starts
    },
    backBtn: { padding: 4, width: 36 },
    backArrow: {
        fontSize: 30,
        color: Colors.cream,
        lineHeight: 32,
    },

    // ── Title ─────────────────────────────────────────────────────────────────
    titleBlock: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
        paddingHorizontal: Spacing.sm,
    },
    superLabel: {
        fontSize: Typography.xs,
        fontWeight: '800',
        color: Colors.warmTan ?? '#D4B896',
        letterSpacing: 2.5,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: Colors.cream,
        textAlign: 'center',
        lineHeight: 34,
        marginBottom: 10,
    },
    subtitle: {
        fontSize: Typography.sm,
        color: 'rgba(245,245,220,0.72)',
        textAlign: 'center',
        lineHeight: 20,
    },

    // ── Card Row ──────────────────────────────────────────────────────────────
    cardRow: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'center',
        marginBottom: Spacing.xl,
    },

    card: {
        width: CARD_SIZE,
        backgroundColor: 'rgba(250,248,242,0.97)',
        borderRadius: 18,
        borderWidth: 2,
        overflow: 'hidden',
        alignItems: 'center',
        paddingBottom: Spacing.md,
    },

    // Top color strip
    cardStrip: {
        width: '100%',
        height: 5,
        marginBottom: 0,
    },

    badge: {
        position: 'absolute',
        top: 10,
        right: 10,
        paddingVertical: 3,
        paddingHorizontal: 9,
        borderRadius: Radius.full,
        zIndex: 2,
    },
    badgeText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 0.8,
    },

    cardIconWrap: {
        marginTop: 16,
        marginBottom: 10,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(45,79,30,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardIcon: { fontSize: 34 },

    cardBody: {
        paddingHorizontal: 12,
        gap: 5,
        alignItems: 'center',
        flex: 1,
        marginBottom: 14,
    },
    cardTitle: {
        fontSize: Typography.md,
        fontWeight: '900',
        textAlign: 'center',
        letterSpacing: 0.2,
    },
    cardSubtitle: {
        fontSize: 11,
        color: Colors.mutedText,
        textAlign: 'center',
        lineHeight: 15,
    },

    arrowPill: {
        paddingVertical: 6,
        paddingHorizontal: 22,
        borderRadius: Radius.full,
    },
    arrowText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '800',
        lineHeight: 20,
        textAlign: 'center',
    },

    // ── Footer ────────────────────────────────────────────────────────────────
    footerNote: {
        textAlign: 'center',
        fontSize: 11,
        color: 'rgba(245,245,220,0.55)',
        letterSpacing: 0.5,
    },
});
