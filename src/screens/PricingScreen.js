/**
 * PricingScreen.js
 * ═════════════════
 * Full-screen pricing comparison: Free · Basic · Premium
 * with a Monthly / Season Pass billing toggle.
 *
 * Season Pass: one-time $39.99 payment for 12 months of Premium access.
 * Designed for seasonal gardeners who only need 6 months/year and don't
 * want a recurring monthly subscription.
 *
 * Reachable from:
 *   - UpgradeModal "See Plans →" button
 *   - (future) Account / Settings screen
 */
import React, { useRef, useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Animated, Platform, Linking,
    useWindowDimensions,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

// ─── Stripe Payment Links ─────────────────────────────────────────────────────
const STRIPE_BASIC_URL       = 'https://buy.stripe.com/test_cNi8wPbzp0kV3Mc1uz0sU02';
const STRIPE_PREMIUM_URL     = 'https://buy.stripe.com/test_00w6oH0ULd7H96wc9d0sU03';
const STRIPE_SEASON_PASS_URL = 'https://buy.stripe.com/test_8x23cvfPF9VvciI8X10sU01';

// Monthly savings: 12 × $6.49 = $77.88 → round to $77.94 for messaging
const MONTHLY_EQUIV = (39.99 / 12).toFixed(2); // ~$3.33/mo
const MONTHLY_SAVINGS = ((12.99 * 6) - 39.99).toFixed(2); // vs 6 months premium

// ─── Feature rows ──────────────────────────────────────────────────────────────
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

// ─── Billing toggle ────────────────────────────────────────────────────────────
function BillingToggle({ mode, onChange }) {
    const slideAnim = useRef(new Animated.Value(mode === 'monthly' ? 0 : 1)).current;

    useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: mode === 'monthly' ? 0 : 1,
            tension: 60, friction: 12,
            useNativeDriver: false,
        }).start();
    }, [mode]);

    const translateX = slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [2, 142], // slides between the two tabs
    });

    return (
        <View style={toggle.wrap}>
            {/* Sliding pill */}
            <Animated.View style={[toggle.pill, { transform: [{ translateX }] }]} />

            <TouchableOpacity style={toggle.tab} onPress={() => onChange('monthly')} activeOpacity={0.8}>
                <Text style={[toggle.tabText, mode === 'monthly' && toggle.tabTextActive]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity style={toggle.tab} onPress={() => onChange('season')} activeOpacity={0.8}>
                <Text style={[toggle.tabText, mode === 'season' && toggle.tabTextActive]}>
                    🎟 Season Pass
                </Text>
            </TouchableOpacity>
        </View>
    );
}

const toggle = StyleSheet.create({
    wrap: {
        flexDirection: 'row', alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: Radius.full,
        padding: 2, position: 'relative', marginTop: Spacing.sm,
    },
    pill: {
        position: 'absolute', top: 2, left: 0,
        width: 140, height: 36, borderRadius: Radius.full,
        backgroundColor: Colors.cream,
    },
    tab: { width: 140, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full },
    tabText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: 'rgba(255,255,255,0.65)' },
    tabTextActive: { color: Colors.primaryGreen },
});

// ─── Season Pass savings callout ───────────────────────────────────────────────
function SavingsCallout() {
    return (
        <View style={styles.savingsCallout}>
            <Text style={styles.savingsIcon}>💡</Text>
            <Text style={styles.savingsText}>
                <Text style={styles.savingsBold}>Save ${MONTHLY_SAVINGS}</Text>
                {' '}vs. 6 months of Premium · No auto-renew · Full year access
            </Text>
        </View>
    );
}

// ─── Desktop: tier card ────────────────────────────────────────────────────────
function TierCard({ tier, delay, billingMode }) {
    const fadeAnim  = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(24)).current;
    const scaleAnim = useRef(new Animated.Value(0.97)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, delay, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 9, delay, useNativeDriver: true }),
        ]).start();
    }, []);

    // Determine display values
    const isSeasonMode = billingMode === 'season';
    const isPremium = tier.key === 'premium';
    const isBasic = tier.key === 'basic';

    let displayPrice = tier.price;
    let displayPriceSub = tier.priceSub;
    let displayCta = tier.cta;
    let displayOnPress = tier.onPress;
    let displayDisabled = tier.ctaDisabled;
    let badge = tier.highlight ? 'MOST POPULAR' : null;
    let badgeColor = Colors.burntOrange;
    let extraNote = null;
    let dimmed = false;

    if (isSeasonMode) {
        if (isPremium) {
            displayPrice = '$39.99';
            displayPriceSub = `one-time · full year · ($${MONTHLY_EQUIV}/mo)`;
            displayCta = 'Get Season Pass →';
            displayOnPress = () => Linking.openURL(STRIPE_SEASON_PASS_URL);
            displayDisabled = false;
            badge = 'BEST VALUE';
            badgeColor = '#F59E0B';
            extraNote = <SavingsCallout />;
        } else if (isBasic) {
            displayCta = 'Monthly only';
            displayDisabled = true;
            dimmed = true;
        }
    }

    return (
        <Animated.View style={[
            styles.tierCard,
            tier.highlight && styles.tierCardHighlight,
            dimmed && styles.tierCardDimmed,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] },
        ]}>
            {badge && (
                <View style={[styles.popularBadge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.popularBadgeText}>{badge}</Text>
                </View>
            )}

            <Text style={[styles.tierName, tier.highlight && styles.tierNameHL, dimmed && styles.tierNameDimmed]}>
                {isPremium && isSeasonMode ? '🎟 Season Pass' : tier.name}
            </Text>
            {displayPrice ? (
                <View style={styles.priceRow}>
                    <Text style={[styles.priceAmount, tier.highlight && styles.priceAmountHL]}>
                        {displayPrice}
                    </Text>
                    <Text style={styles.priceSub}>{displayPriceSub}</Text>
                </View>
            ) : (
                <Text style={styles.priceFreeLbl}>{displayPriceSub}</Text>
            )}
            <Text style={[styles.tierTagline, dimmed && { color: Colors.mutedText }]}>
                {isPremium && isSeasonMode
                    ? 'All Premium features. Pay once, grow all season.'
                    : isBasic && isSeasonMode
                        ? 'Season Pass not available on Basic.'
                        : tier.tagline}
            </Text>

            {extraNote}

            <TouchableOpacity
                style={[
                    styles.tierCta,
                    tier.highlight && !dimmed ? styles.tierCtaHighlight : styles.tierCtaDefault,
                    displayDisabled && styles.tierCtaDisabled,
                ]}
                onPress={displayOnPress ?? undefined}
                disabled={displayDisabled}
                activeOpacity={displayDisabled ? 1 : 0.85}
            >
                <Text style={[
                    styles.tierCtaText,
                    tier.highlight && !dimmed ? styles.tierCtaTextHL : null,
                    displayDisabled && styles.tierCtaTextDisabled,
                ]}>
                    {displayCta}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Mobile: compact tier card ─────────────────────────────────────────────────
function MobileTierCard({ tier, billingMode }) {
    const isSeasonMode = billingMode === 'season';
    const isPremium = tier.key === 'premium';
    const isBasic = tier.key === 'basic';

    let displayPrice = tier.price;
    let displayPriceSub = '/mo';
    let displayCta = tier.cta;
    let displayOnPress = tier.onPress;
    let displayDisabled = tier.ctaDisabled;
    let badge = tier.highlight ? 'MOST POPULAR' : null;
    let badgeColor = Colors.burntOrange;
    let dimmed = false;

    if (isSeasonMode) {
        if (isPremium) {
            displayPrice = '$39.99';
            displayPriceSub = 'one-time';
            displayCta = 'Get Season Pass →';
            displayOnPress = () => Linking.openURL(STRIPE_SEASON_PASS_URL);
            displayDisabled = false;
            badge = 'BEST VALUE';
            badgeColor = '#F59E0B';
        } else if (isBasic) {
            displayCta = 'Monthly only';
            displayDisabled = true;
            dimmed = true;
        }
    }

    return (
        <View style={[styles.mobileTierCard, tier.highlight && styles.mobileTierCardHL, dimmed && styles.mobileTierCardDimmed]}>
            <View style={styles.mobileTierLeft}>
                {badge && (
                    <View style={[styles.popularBadge, { position: 'relative', top: 0, right: 0, marginBottom: 6, alignSelf: 'flex-start', backgroundColor: badgeColor }]}>
                        <Text style={styles.popularBadgeText}>{badge}</Text>
                    </View>
                )}
                <Text style={[styles.tierName, tier.highlight && styles.tierNameHL, { fontSize: Typography.md }, dimmed && styles.tierNameDimmed]}>
                    {isPremium && isSeasonMode ? '🎟 Season Pass' : tier.name}
                </Text>
                {displayPrice
                    ? <Text style={[styles.priceAmount, tier.highlight && styles.priceAmountHL, { fontSize: Typography.lg }]}>
                        {displayPrice}<Text style={styles.priceSub}>{displayPriceSub}</Text>
                      </Text>
                    : <Text style={styles.priceFreeLbl}>{tier.priceSub}</Text>
                }
                {isPremium && isSeasonMode && (
                    <Text style={styles.mobileSeasonNote}>
                        💡 Save ${MONTHLY_SAVINGS} vs. 6 months · No auto-renew
                    </Text>
                )}
            </View>
            <TouchableOpacity
                style={[
                    styles.tierCta,
                    tier.highlight && !dimmed ? styles.tierCtaHighlight : styles.tierCtaDefault,
                    displayDisabled && styles.tierCtaDisabled,
                    { paddingHorizontal: Spacing.md, paddingVertical: 12 },
                ]}
                onPress={displayOnPress ?? undefined}
                disabled={displayDisabled}
                activeOpacity={displayDisabled ? 1 : 0.85}
            >
                <Text style={[
                    styles.tierCtaText,
                    tier.highlight && !dimmed ? styles.tierCtaTextHL : null,
                    displayDisabled && styles.tierCtaTextDisabled,
                ]}>
                    {displayCta}
                </Text>
            </TouchableOpacity>
        </View>
    );
}

// ─── Feature row ───────────────────────────────────────────────────────────────
function FeatureRow({ feature, isDesktop }) {
    const cell = (val) => {
        const isLock  = val === '🔒';
        const isCheck = val === '✅';
        return (
            <Text style={[
                styles.featureCell,
                isDesktop ? styles.featureCellDesktop : styles.featureCellMobile,
                isLock  && styles.featureCellLocked,
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

// ─── Tier definitions ──────────────────────────────────────────────────────────
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
    },
    {
        key: 'premium',
        name: 'Premium',
        price: '$12.99',
        priceSub: 'per month',
        tagline: 'Everything for market farmers.',
        highlight: true,
        cta: 'Subscribe →',
        ctaDisabled: false,
        onPress: () => Linking.openURL(STRIPE_PREMIUM_URL),
    },
];

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function PricingScreen({ navigation }) {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 900;

    const [billingMode, setBillingMode] = useState('monthly'); // 'monthly' | 'season'

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
                    {/* Billing toggle lives in header so it's always visible */}
                    <BillingToggle mode={billingMode} onChange={setBillingMode} />
                </Animated.View>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
                showsVerticalScrollIndicator={false}
                style={Platform.OS === 'web' ? { overflowY: 'auto' } : {}}
            >
                {/* Season Pass mode explanation pill */}
                {billingMode === 'season' && (
                    <View style={styles.seasonBanner}>
                        <Text style={styles.seasonBannerText}>
                            🎟 <Text style={{ fontWeight: '800' }}>Season Pass</Text> — pay once, use all year. Perfect if you only garden for part of the year.
                        </Text>
                    </View>
                )}

                {/* ── Tier cards ── */}
                {isDesktop ? (
                    <View style={styles.cardsRowDesktop}>
                        {TIERS.map((t, i) => (
                            <TierCard key={t.key} tier={t} delay={i * 80} billingMode={billingMode} />
                        ))}
                    </View>
                ) : (
                    <View style={styles.cardsColMobile}>
                        {TIERS.map((t, i) => (
                            <MobileTierCard key={t.key} tier={t} billingMode={billingMode} />
                        ))}
                    </View>
                )}

                {/* ── Feature comparison ── */}
                <View style={styles.compareSection}>
                    <Text style={styles.compareTitle}>Full Feature Comparison</Text>
                    <View style={[styles.featureRow, isDesktop && styles.featureRowDesktop, styles.featureHeaderRow]}>
                        <Text style={[styles.featureLabel, isDesktop && styles.featureLabelDesktop, styles.featureHeaderLabel]}>Feature</Text>
                        {TIERS.map(t => (
                            <Text key={t.key} style={[
                                styles.featureCell,
                                isDesktop ? styles.featureCellDesktop : styles.featureCellMobile,
                                styles.featureHeaderCell,
                            ]}>
                                {t.key === 'premium' && billingMode === 'season' ? '🎟 Season' : t.name}
                            </Text>
                        ))}
                    </View>
                    {FEATURES.map((f, i) => (
                        <FeatureRow key={i} feature={f} isDesktop={isDesktop} />
                    ))}
                </View>

                {/* ── Fine print ── */}
                <View style={styles.finePrint}>
                    <Text style={styles.finePrintText}>
                        {billingMode === 'season'
                            ? 'Season Pass: one-time payment · no auto-renew · 12-month access · Secure checkout via Stripe'
                            : 'Cancel anytime · No long-term contracts · Billed monthly\nSecure payment processing via Stripe'
                        }
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

    header: {
        backgroundColor: Colors.primaryGreen,
        paddingTop: 54,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xl,
    },
    backBtn: { padding: 4, marginBottom: Spacing.sm },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    headerContent: { gap: 4 },
    superLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 3 },
    headerTitle: { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.cream, marginTop: 2 },
    headerSub: { fontSize: Typography.sm, color: 'rgba(245,245,220,0.75)', lineHeight: 18 },

    scroll: { padding: Spacing.lg },
    scrollDesktop: { maxWidth: 1000, alignSelf: 'center', width: '100%' },

    // Season banner
    seasonBanner: {
        backgroundColor: '#FEF3C7', borderRadius: Radius.md,
        padding: Spacing.md, marginBottom: Spacing.md,
        borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    },
    seasonBannerText: { fontSize: Typography.xs, color: '#92400E', lineHeight: 18 },

    // Savings callout (inside card)
    savingsCallout: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        backgroundColor: '#FEF3C7', borderRadius: Radius.sm,
        padding: 8, marginTop: 4,
    },
    savingsIcon: { fontSize: 14 },
    savingsText: { fontSize: Typography.xs, color: '#92400E', lineHeight: 16, flex: 1 },
    savingsBold: { fontWeight: '800', color: '#92400E' },

    // Desktop tier cards
    cardsRowDesktop: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
    tierCard: {
        flex: 1, backgroundColor: Colors.white,
        borderRadius: Radius.lg, padding: Spacing.lg,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.12)',
        gap: Spacing.sm,
        ...Shadows.card,
    },
    tierCardHighlight: { borderColor: Colors.primaryGreen, borderWidth: 2, backgroundColor: 'rgba(45,79,30,0.03)' },
    tierCardDimmed: { opacity: 0.55 },

    popularBadge: {
        position: 'absolute', top: -11, right: 16,
        backgroundColor: Colors.burntOrange,
        paddingVertical: 3, paddingHorizontal: 10,
        borderRadius: Radius.full,
    },
    popularBadgeText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.white, letterSpacing: 1 },

    tierName: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.mutedText },
    tierNameHL: { color: Colors.primaryGreen },
    tierNameDimmed: { color: Colors.mutedText },

    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
    priceAmount: { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.darkText },
    priceAmountHL: { color: Colors.primaryGreen },
    priceSub: { fontSize: Typography.xs, color: Colors.mutedText },
    priceFreeLbl: { fontSize: Typography.md, color: Colors.mutedText },
    tierTagline: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 16 },

    tierCta: { paddingVertical: 14, paddingHorizontal: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.xs },
    tierCtaDefault:   { borderWidth: 1.5, borderColor: Colors.primaryGreen },
    tierCtaHighlight: { backgroundColor: Colors.primaryGreen, ...Shadows.button },
    tierCtaDisabled:  { borderColor: 'rgba(107,107,107,0.3)', backgroundColor: 'rgba(107,107,107,0.06)' },
    tierCtaText:      { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.primaryGreen },
    tierCtaTextHL:    { color: Colors.cream },
    tierCtaTextDisabled: { color: Colors.mutedText },

    // Mobile tier cards
    cardsColMobile: { gap: Spacing.sm, marginBottom: Spacing.xl },
    mobileTierCard: {
        backgroundColor: Colors.white, borderRadius: Radius.lg,
        padding: Spacing.md, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.12)',
        ...Shadows.card,
    },
    mobileTierCardHL: { borderColor: Colors.primaryGreen, borderWidth: 2 },
    mobileTierCardDimmed: { opacity: 0.5 },
    mobileTierLeft: { gap: 4, flex: 1 },
    mobileSeasonNote: { fontSize: 10, color: '#92400E', marginTop: 2 },

    // Feature comparison
    compareSection: { gap: 0 },
    compareTitle: {
        fontSize: Typography.sm, fontWeight: Typography.bold,
        color: Colors.primaryGreen, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: Spacing.md,
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
    featureLabel: { flex: 2, fontSize: Typography.xs, color: Colors.darkText, fontWeight: Typography.medium },
    featureLabelDesktop: { fontSize: Typography.sm },
    featureCell: { flex: 1, textAlign: 'center', fontSize: Typography.xs },
    featureCellDesktop: { fontSize: Typography.sm },
    featureCellMobile: { fontSize: 12 },
    featureCellLocked: { color: Colors.mutedText },
    featureCellCheck:  { color: '#4CAF50' },

    // Fine print
    finePrint: { marginTop: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
    finePrintText: { fontSize: Typography.xs, color: Colors.mutedText, textAlign: 'center', lineHeight: 18 },
    stripeBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F6F8FA', borderRadius: Radius.full,
        paddingVertical: 6, paddingHorizontal: 14, gap: Spacing.xs,
        borderWidth: 1, borderColor: '#E0E0E0',
    },
    stripeBadgeLogo: { fontSize: 13 },
    stripeBadgeText: { fontSize: 11, fontWeight: Typography.semiBold, color: '#635BFF' },
});
