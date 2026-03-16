/**
 * PricingScreen.js
 * ═════════════════
 * Full-screen pricing comparison: Free · Basic · Premium
 *
 * Reachable from:
 *   - UpgradeModal "See Plans →" button
 *   - (future) Account / Settings screen
 *
 * Stripe Payment Link URLs are marked with TODO — swap in real links
 * from your Stripe dashboard when billing goes live.
 */
import React, { useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Animated, Platform, Linking,
    useWindowDimensions,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

// ─── Stripe Payment Links ─────────────────────────────────────────────────────
// TODO: Replace with real Stripe Payment Link URLs
const STRIPE_BASIC_URL   = 'https://buy.stripe.com/test_dRmaEX3nTb9A8wqgWkgMw00';
const STRIPE_PREMIUM_URL = 'https://buy.stripe.com/test_00wdR9gaFb9A5kefSggMw01';

// ─── Feature rows shown in the comparison table ───────────────────────────────
const FEATURES = [
    { label: 'Family size',              free: 'Up to 4',      basic: 'Up to 10',    premium: 'Unlimited' },
    { label: 'Crops per plan',           free: 'Up to 10',     basic: 'Up to 25',    premium: 'Unlimited' },
    { label: 'Garden space',             free: '1/10 acre max', basic: '¼ acre max',  premium: 'Unlimited' },
    { label: 'Planting quantities',      free: '✅',            basic: '✅',          premium: '✅' },
    { label: 'Soil volume calculator',   free: '✅',            basic: '✅',          premium: '✅' },
    { label: 'PDF / print export',       free: '✅',            basic: '✅',          premium: '✅' },
    { label: 'Succession scheduling',    free: '🔒',           basic: '🔒',          premium: '✅' },
    { label: 'AI bed layout',            free: '🔒',           basic: '🔒',          premium: '✅' },
    { label: 'Satellite mapping',        free: '🔒',           basic: '🔒',          premium: '✅' },
    { label: 'Revenue & yield tracking', free: '🔒',           basic: '🔒',          premium: '✅' },
    { label: 'Unlimited acreage',        free: '🔒',           basic: '🔒',          premium: '✅' },
    { label: 'Full Farm Designer',       free: '🔒',           basic: '🔒',          premium: '✅' },
];

// ─── Tier definitions ─────────────────────────────────────────────────────────
const TIERS = [
    {
        key: 'free',
        name: 'Free',
        price: null,
        priceSub: 'Always free',
        tagline: 'Get started with no commitment.',
        highlight: false,
        cta: "You're on this plan",
        ctaDisabled: true,
        onPress: null,
        featureKey: 'free',
        accentColor: Colors.mutedText,
    },
    {
        key: 'basic',
        name: 'Basic',
        price: '$4.99',
        priceSub: 'per month',
        tagline: 'Perfect for serious home gardeners.',
        highlight: false,
        cta: 'Subscribe →',
        ctaDisabled: false,
        onPress: () => Linking.openURL(STRIPE_BASIC_URL),
        featureKey: 'basic',
        accentColor: '#4CAF50',
    },
    {
        key: 'premium',
        name: 'Premium',
        price: '$12.99',
        priceSub: 'per month',
        tagline: 'Everything for market farmers.',
        highlight: true,   // shown with a "MOST POPULAR" badge
        cta: 'Subscribe →',
        ctaDisabled: false,
        onPress: () => Linking.openURL(STRIPE_PREMIUM_URL),
        featureKey: 'premium',
        accentColor: Colors.primaryGreen,
    },
];

// ─── Desktop: side-by-side tier card component ───────────────────────────────
function TierCard({ tier, delay }) {
    const fadeAnim  = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(24)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, delay, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.View
            style={[
                styles.tierCard,
                tier.highlight && styles.tierCardHighlight,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
        >
            {tier.highlight && (
                <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
                </View>
            )}

            {/* Price block */}
            <Text style={[styles.tierName, tier.highlight && styles.tierNameHL]}>{tier.name}</Text>
            {tier.price ? (
                <View style={styles.priceRow}>
                    <Text style={[styles.priceAmount, tier.highlight && styles.priceAmountHL]}>{tier.price}</Text>
                    <Text style={styles.priceSub}>{tier.priceSub}</Text>
                </View>
            ) : (
                <Text style={styles.priceFreeLbl}>{tier.priceSub}</Text>
            )}
            <Text style={styles.tierTagline}>{tier.tagline}</Text>

            {/* CTA */}
            <TouchableOpacity
                style={[
                    styles.tierCta,
                    tier.highlight ? styles.tierCtaHighlight : styles.tierCtaDefault,
                    tier.ctaDisabled && styles.tierCtaDisabled,
                ]}
                onPress={tier.onPress ?? undefined}
                disabled={tier.ctaDisabled}
                activeOpacity={tier.ctaDisabled ? 1 : 0.85}
            >
                <Text style={[
                    styles.tierCtaText,
                    tier.highlight ? styles.tierCtaTextHL : null,
                    tier.ctaDisabled && styles.tierCtaTextDisabled,
                ]}>
                    {tier.cta}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Mobile: compact stacked card component ────────────────────────────────────
function MobileTierCard({ tier, index }) {
    return (
        <View style={[styles.mobileTierCard, tier.highlight && styles.mobileTierCardHL]}>
            <View style={styles.mobileTierLeft}>
                {tier.highlight && (
                    <View style={[styles.popularBadge, { position: 'relative', top: 0, right: 0, marginBottom: 6, alignSelf: 'flex-start' }]}>
                        <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
                    </View>
                )}
                <Text style={[styles.tierName, tier.highlight && styles.tierNameHL, { fontSize: Typography.md }]}>{tier.name}</Text>
                {tier.price
                    ? <Text style={[styles.priceAmount, tier.highlight && styles.priceAmountHL, { fontSize: Typography.lg }]}>{tier.price}<Text style={styles.priceSub}>/mo</Text></Text>
                    : <Text style={styles.priceFreeLbl}>{tier.priceSub}</Text>
                }
            </View>
            <TouchableOpacity
                style={[
                    styles.tierCta,
                    tier.highlight ? styles.tierCtaHighlight : styles.tierCtaDefault,
                    tier.ctaDisabled && styles.tierCtaDisabled,
                    { paddingHorizontal: Spacing.md, paddingVertical: 12 },
                ]}
                onPress={tier.onPress ?? undefined}
                disabled={tier.ctaDisabled}
                activeOpacity={tier.ctaDisabled ? 1 : 0.85}
            >
                <Text style={[
                    styles.tierCtaText,
                    tier.highlight ? styles.tierCtaTextHL : null,
                    tier.ctaDisabled && styles.tierCtaTextDisabled,
                ]}>
                    {tier.cta}
                </Text>
            </TouchableOpacity>
        </View>
    );
}

// ─── Feature comparison row ────────────────────────────────────────────────────
function FeatureRow({ feature, isDesktop }) {
    const cell = (val) => {
        const isLock   = val === '🔒';
        const isCheck  = val === '✅';
        return (
            <Text style={[
                styles.featureCell,
                isDesktop ? styles.featureCellDesktop : styles.featureCellMobile,
                isLock && styles.featureCellLocked,
                isCheck && styles.featureCellCheck,
            ]}>
                {val}
            </Text>
        );
    };

    return (
        <View style={[styles.featureRow, isDesktop && styles.featureRowDesktop]}>
            <Text style={[styles.featureLabel, isDesktop && styles.featureLabelDesktop]}>{feature.label}</Text>
            {cell(feature.free)}
            {cell(feature.basic)}
            {cell(feature.premium)}
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PricingScreen({ navigation }) {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 900;

    const headerFade  = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(headerFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(headerSlide, { toValue: 0, tension: 45, friction: 8, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <View style={styles.container}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <Animated.View style={[styles.headerContent, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
                    <Text style={styles.superLabel}>ACRELOGIC</Text>
                    <Text style={styles.headerTitle}>Choose Your Plan</Text>
                    <Text style={styles.headerSub}>Start free. Upgrade whenever your garden grows.</Text>
                </Animated.View>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
                showsVerticalScrollIndicator={false}
                style={Platform.OS === 'web' ? { overflowY: 'auto' } : {}}
            >

                {/* ── Tier cards ── */}
                {isDesktop ? (
                    <View style={styles.cardsRowDesktop}>
                        {TIERS.map((t, i) => <TierCard key={t.key} tier={t} delay={i * 80} />)}
                    </View>
                ) : (
                    <View style={styles.cardsColMobile}>
                        {TIERS.map((t, i) => <MobileTierCard key={t.key} tier={t} index={i} />)}
                    </View>
                )}

                {/* ── Feature comparison ── */}
                <View style={styles.compareSection}>
                    <Text style={styles.compareTitle}>Full Feature Comparison</Text>

                    {/* Column headers */}
                    <View style={[styles.featureRow, isDesktop && styles.featureRowDesktop, styles.featureHeaderRow]}>
                        <Text style={[styles.featureLabel, isDesktop && styles.featureLabelDesktop, styles.featureHeaderLabel]}>Feature</Text>
                        {TIERS.map(t => (
                            <Text key={t.key} style={[
                                styles.featureCell,
                                isDesktop ? styles.featureCellDesktop : styles.featureCellMobile,
                                styles.featureHeaderCell,
                            ]}>
                                {t.name}
                            </Text>
                        ))}
                    </View>

                    {/* Feature rows */}
                    {FEATURES.map((f, i) => (
                        <FeatureRow key={i} feature={f} isDesktop={isDesktop} />
                    ))}
                </View>

                {/* ── Fine print ── */}
                <View style={styles.finePrint}>
                    <Text style={styles.finePrintText}>
                        Cancel anytime · No long-term contracts · Billed monthly{'\n'}
                        Secure payment processing via{' '}
                        <Text style={styles.stripeLogo}>Stripe</Text>
                    </Text>
                    <View style={styles.stripeBadge}>
                        <Text style={styles.stripeBadgeLogo}>🔒</Text>
                        <Text style={styles.stripeBadgeText}>Secured by Stripe</Text>
                    </View>
                </View>

                <View style={{ height: Spacing.xxl }} />
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundGrey,
        ...Platform.select({ web: { maxHeight: '100dvh' } }),
    },

    // ── Header ───────────────────────────────────────────────────────────────
    header: {
        backgroundColor: Colors.primaryGreen,
        paddingTop: 54,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xl,
    },
    backBtn: { padding: 4, marginBottom: Spacing.sm },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    headerContent: { gap: 4 },
    superLabel: {
        fontSize: Typography.xs, fontWeight: Typography.bold,
        color: Colors.warmTan, letterSpacing: 3,
    },
    headerTitle: {
        fontSize: Typography.xxl, fontWeight: Typography.bold,
        color: Colors.cream, marginTop: 2,
    },
    headerSub: {
        fontSize: Typography.sm, color: 'rgba(245,245,220,0.75)', lineHeight: 18,
    },

    // ── Scroll ───────────────────────────────────────────────────────────────
    scroll: { padding: Spacing.lg },
    scrollDesktop: { maxWidth: 1000, alignSelf: 'center', width: '100%' },

    // ── Desktop tier cards ────────────────────────────────────────────────────
    cardsRowDesktop: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
    tierCard: {
        flex: 1, backgroundColor: Colors.white,
        borderRadius: Radius.lg, padding: Spacing.lg,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.12)',
        gap: Spacing.sm,
        ...Shadows.card,
    },
    tierCardHighlight: {
        borderColor: Colors.primaryGreen,
        borderWidth: 2,
        backgroundColor: 'rgba(45,79,30,0.03)',
    },

    popularBadge: {
        position: 'absolute', top: -11, right: 16,
        backgroundColor: Colors.burntOrange,
        paddingVertical: 3, paddingHorizontal: 10,
        borderRadius: Radius.full,
    },
    popularBadgeText: {
        fontSize: 9, fontWeight: Typography.bold,
        color: Colors.white, letterSpacing: 1,
    },

    tierName: {
        fontSize: Typography.lg, fontWeight: Typography.bold,
        color: Colors.mutedText,
    },
    tierNameHL: { color: Colors.primaryGreen },

    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    priceAmount: {
        fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.darkText,
    },
    priceAmountHL: { color: Colors.primaryGreen },
    priceSub: { fontSize: Typography.xs, color: Colors.mutedText },
    priceFreeLbl: { fontSize: Typography.md, color: Colors.mutedText },

    tierTagline: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 16 },

    tierCta: {
        paddingVertical: 14, paddingHorizontal: Spacing.md,
        borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.xs,
    },
    tierCtaDefault:   { borderWidth: 1.5, borderColor: Colors.primaryGreen },
    tierCtaHighlight: { backgroundColor: Colors.primaryGreen, ...Shadows.button },
    tierCtaDisabled:  { borderColor: 'rgba(107,107,107,0.3)', backgroundColor: 'rgba(107,107,107,0.06)' },
    tierCtaText:     { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.primaryGreen },
    tierCtaTextHL:   { color: Colors.cream },
    tierCtaTextDisabled: { color: Colors.mutedText },

    // ── Mobile tier cards ─────────────────────────────────────────────────────
    cardsColMobile: { gap: Spacing.sm, marginBottom: Spacing.xl },
    mobileTierCard: {
        backgroundColor: Colors.white, borderRadius: Radius.lg,
        padding: Spacing.md, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.12)',
        ...Shadows.card,
    },
    mobileTierCardHL: { borderColor: Colors.primaryGreen, borderWidth: 2 },
    mobileTierLeft: { gap: 4, flex: 1 },

    // ── Feature comparison ────────────────────────────────────────────────────
    compareSection: { gap: 0 },
    compareTitle: {
        fontSize: Typography.sm, fontWeight: Typography.bold,
        color: Colors.primaryGreen, letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: Spacing.md,
    },

    featureHeaderRow: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.sm, marginBottom: 2 },
    featureHeaderLabel: { color: Colors.cream, fontWeight: Typography.bold },
    featureHeaderCell: { color: Colors.cream, fontWeight: Typography.bold },

    featureRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 10, paddingHorizontal: Spacing.sm,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.07)',
        backgroundColor: Colors.white,
    },
    featureRowDesktop: { paddingVertical: 12 },
    featureLabel: {
        flex: 2, fontSize: Typography.xs, color: Colors.darkText, fontWeight: Typography.medium,
    },
    featureLabelDesktop: { fontSize: Typography.sm },
    featureCell: { flex: 1, textAlign: 'center', fontSize: Typography.xs },
    featureCellDesktop: { fontSize: Typography.sm },
    featureCellMobile: { fontSize: 12 },
    featureCellLocked: { color: Colors.mutedText },
    featureCellCheck:  { color: '#4CAF50' },

    // ── Fine print ────────────────────────────────────────────────────────────
    finePrint: { marginTop: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
    finePrintText: {
        fontSize: Typography.xs, color: Colors.mutedText,
        textAlign: 'center', lineHeight: 18,
    },
    stripeLogo: { fontWeight: Typography.bold, color: '#635BFF' },
    stripeBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F6F8FA', borderRadius: Radius.full,
        paddingVertical: 6, paddingHorizontal: 14, gap: Spacing.xs,
        borderWidth: 1, borderColor: '#E0E0E0',
    },
    stripeBadgeLogo: { fontSize: 13 },
    stripeBadgeText: { fontSize: 11, fontWeight: Typography.semiBold, color: '#635BFF' },
});
