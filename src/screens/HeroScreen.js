import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Animated,
    Image,
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

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 8, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleStartNewPlan = () => {
        // Always wipe existing data so the new plan starts fresh
        clearSavedPlan();
        navigation.navigate('RoleSelector');
    };

    const handleLogIn = () => {
        // No automatic jumping! The user wants to see the full flow every time.
        // Therefore, we just proceed to the RoleSelector where they can click "Market Farm".
        // Localstorage is preserved so their existing Farm layout loads when they reach the farm sheet.
        navigation.navigate('RoleSelector');
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Background hero image */}
            <Image
                source={require('../../assets/hero-garden-v3.png')}
                style={styles.bg}
                resizeMode="cover"
            />

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

                    {/* ── Begin / entry CTA ── */}
                    <Animated.View style={[styles.ctaStack, { transform: [{ scale: buttonScale }] }]}>
                        {/* Primary: Start New Plan */}
                        <TouchableOpacity
                            style={[styles.createAccountBtn, Shadows.button]}
                            onPress={handleStartNewPlan}
                            onPressIn={() => Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start()}
                            onPressOut={() => Animated.spring(buttonScale, { toValue: 1, friction: 3, useNativeDriver: true }).start()}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.createAccountText}>START NEW PLAN</Text>
                        </TouchableOpacity>

                        {/* Secondary: Log In */}
                        <TouchableOpacity
                            style={styles.loginBtn}
                            onPress={handleLogIn}
                            activeOpacity={0.75}
                        >
                            <Text style={styles.loginBtnText}>LOG IN</Text>
                        </TouchableOpacity>
                    </Animated.View>

                </View>
            </Animated.View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.primaryGreen, ...Platform.select({ web: { height: '100dvh' } }) },
    bg: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, width: '100%', height: '100%' },
    vignetteTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%', zIndex: 1 },
    vignetteBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '52%', zIndex: 1 },
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

    // ── CTA Stack ────────────────────────────────────────────────────────────
    ctaStack: { alignItems: 'center', gap: Spacing.md, width: '100%' },

    createAccountBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 18, paddingHorizontal: 52,
        borderRadius: 15, borderWidth: 1.5,
        borderColor: 'rgba(245,245,220,0.25)',
        alignItems: 'center', minWidth: width * 0.72,
    },
    createAccountText: {
        color: Colors.cream, fontSize: Typography.md,
        fontWeight: Typography.bold, letterSpacing: 2.5,
    },

    loginBtn: {
        paddingVertical: 12, paddingHorizontal: 32,
        borderRadius: 12, borderWidth: 1.5,
        borderColor: 'rgba(245,245,220,0.35)',
        alignItems: 'center', minWidth: width * 0.72,
    },
    loginBtnText: {
        color: 'rgba(245,245,220,0.88)', fontSize: Typography.sm,
        fontWeight: '700', letterSpacing: 2,
    },

});
