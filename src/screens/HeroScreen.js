import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Animated,
    ImageBackground,
    StatusBar,
    Platform,
} from 'react-native';
import { LinearGradient } from '../components/LinearGradient';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { hasSavedPlan, loadSavedPlan, clearSavedPlan, savedAgoLabel } from '../services/persistence';

const { width, height } = Dimensions.get('window');

// ─── Hero Logo Component ────────────────────────────────────────────────────
const AcreLogicLogo = () => (
    <View style={styles.logoContainer}>
        {/* Leaf icon SVG-inspired using nested views */}
        <View style={styles.logoIconRow}>
            <View style={styles.leafLeft} />
            <View style={styles.leafStem} />
            <View style={styles.leafRight} />
        </View>
        <View style={styles.logoTextRow}>
            <Text style={styles.logoAcre}>ACRE</Text>
            <Text style={styles.logoLogic}>LOGIC</Text>
        </View>
    </View>
);

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function HeroScreen({ navigation }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const buttonScale = useRef(new Animated.Value(1)).current;

    const [savedPlan, setSavedPlan] = useState(null);
    const [saveLabel, setSaveLabel] = useState(null);

    useEffect(() => {
        // On web, check for a previously saved plan
        if (Platform.OS === 'web' && hasSavedPlan()) {
            const plan = loadSavedPlan();
            if (plan) {
                setSavedPlan(plan);
                setSaveLabel(savedAgoLabel());
            }
        }

        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 8, useNativeDriver: true }),
        ]).start();
    }, []);

    const handlePressIn = () => {
        Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
    };
    const handlePressOut = () => {
        Animated.spring(buttonScale, { toValue: 1, friction: 3, useNativeDriver: true }).start();
    };

    const handleContinue = () => {
        if (!savedPlan) return;
        const { farmProfile, bedSuccessions, planId } = savedPlan;
        // Jump straight to BedWorkspace with the restored data
        navigation.navigate('BedWorkspace', {
            farmProfile,
            planId: planId ?? null,
            bedSuccessions,
        });
    };

    const handleViewDashboard = () => {
        if (!savedPlan) return;
        const { farmProfile, bedSuccessions } = savedPlan;
        navigation.navigate('Dashboard', { farmProfile, bedSuccessions });
    };

    const handleStartFresh = () => {
        clearSavedPlan();
        setSavedPlan(null);
        navigation.navigate('ModeSelector');
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Background hero image */}
            <ImageBackground
                source={require('../../assets/hero-garden.jpg')}
                style={styles.bg}
                resizeMode="cover"
            >
                {/* Top vignette */}
                <LinearGradient
                    colors={['rgba(20,38,12,0.82)', 'rgba(20,38,12,0.0)']}
                    style={styles.vignetteTop}
                />

                {/* Bottom vignette */}
                <LinearGradient
                    colors={['rgba(20,38,12,0.0)', 'rgba(20,38,12,0.88)']}
                    style={styles.vignetteBottom}
                />

                {/* Content */}
                <Animated.View
                    style={[
                        styles.content,
                        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {/* Logo — upper area */}
                    <View style={styles.logoArea}>
                        <AcreLogicLogo />
                    </View>

                    {/* CTA area — lower area */}
                    <View style={styles.ctaArea}>

                        {/* ── Continue saved plan banner ── */}
                        {savedPlan && (
                            <View style={[styles.savedBanner, Shadows.card]}>
                                <View style={styles.savedBannerContent}>
                                    <Text style={styles.savedBannerTitle}>Plan in Progress</Text>
                                    <Text style={styles.savedBannerFarm} numberOfLines={1}>
                                        {savedPlan.farmProfile?.farmName ?? savedPlan.farmProfile?.address ?? 'Your Farm'}
                                    </Text>
                                    {saveLabel && (
                                        <Text style={styles.savedBannerTime}>{saveLabel}</Text>
                                    )}
                                </View>
                                <View style={styles.savedBannerActions}>
                                     <TouchableOpacity
                                        style={styles.dashboardBtn}
                                        onPress={handleViewDashboard}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={styles.dashboardBtnText}>📊 Dashboard</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.continueBtn}
                                        onPress={handleContinue}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={styles.continueBtnText}>Beds →</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.discardBtn}
                                        onPress={handleStartFresh}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={styles.discardBtnText}>Start Fresh</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* ── Begin button ── */}
                        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                            <TouchableOpacity
                                style={[styles.beginButton, Shadows.button]}
                                onPress={() => navigation.navigate('ModeSelector')}
                                onPressIn={handlePressIn}
                                onPressOut={handlePressOut}
                                activeOpacity={0.9}
                            >
                                <Text style={styles.beginButtonText}>
                                    {savedPlan ? 'START NEW PLAN' : 'BEGIN HERE'}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>


                    </View>
                </Animated.View>
            </ImageBackground>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.primaryGreen },
    bg: { flex: 1, width, height },
    vignetteTop: { position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.38, zIndex: 1 },
    vignetteBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.52, zIndex: 1 },
    content: {
        flex: 1, zIndex: 2, justifyContent: 'space-between',
        paddingTop: 60, paddingBottom: 64, paddingHorizontal: Spacing.xl,
    },

    // ── Logo ──────────────────────────────────────────────────────────────────
    logoArea: { alignItems: 'center', marginTop: Spacing.lg },
    logoContainer: { alignItems: 'center' },
    logoIconRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6, gap: 3 },
    leafLeft: { width: 18, height: 26, borderRadius: 18, backgroundColor: Colors.warmTan, transform: [{ rotate: '-20deg' }] },
    leafStem: { width: 4, height: 30, backgroundColor: Colors.cream, borderRadius: 4, marginBottom: -4 },
    leafRight: { width: 18, height: 26, borderRadius: 18, backgroundColor: Colors.primaryGreen, borderWidth: 2, borderColor: Colors.warmTan, transform: [{ rotate: '20deg' }] },
    logoTextRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    logoAcre: { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 3 },
    logoLogic: { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.cream, letterSpacing: 3 },

    // ── CTA ───────────────────────────────────────────────────────────────────
    ctaArea: { alignItems: 'center', gap: Spacing.md },

    // ── Saved Plan Banner ──────────────────────────────────────────────────────
    savedBanner: {
        width: '100%',
        backgroundColor: 'rgba(245,240,225,0.97)',
        borderRadius: Radius.lg,
        padding: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.15)',
    },
    savedBannerContent: { flex: 1, gap: 2 },
    savedBannerTitle: { fontSize: 10, fontWeight: Typography.bold, color: Colors.primaryGreen, letterSpacing: 1, textTransform: 'uppercase' },
    savedBannerFarm: { fontSize: Typography.sm, fontWeight: Typography.semiBold, color: Colors.darkText },
    savedBannerTime: { fontSize: 10, color: Colors.mutedText },
    savedBannerActions: { gap: Spacing.xs },
    continueBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 8, paddingHorizontal: 14,
        borderRadius: Radius.sm, alignItems: 'center',
    },
    continueBtnText: { color: Colors.cream, fontSize: Typography.xs, fontWeight: Typography.bold },
    dashboardBtn: {
        backgroundColor: 'rgba(45,79,30,0.12)',
        paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: Radius.sm, alignItems: 'center',
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)',
    },
    dashboardBtnText: { color: Colors.primaryGreen, fontSize: Typography.xs, fontWeight: Typography.bold },
    discardBtn: { alignItems: 'center', paddingVertical: 4 },
    discardBtnText: { fontSize: 10, color: Colors.mutedText, textDecorationLine: 'underline' },

    // ── Begin Button ──────────────────────────────────────────────────────────
    beginButton: {
        backgroundColor: Colors.primaryGreen, paddingVertical: 18, paddingHorizontal: 64,
        borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(245,245,220,0.25)',
        alignItems: 'center', minWidth: width * 0.72,
    },
    beginButtonText: { color: Colors.cream, fontSize: Typography.md, fontWeight: Typography.bold, letterSpacing: 3.5 },


});
