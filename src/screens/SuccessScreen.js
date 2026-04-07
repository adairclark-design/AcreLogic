/**
 * SuccessScreen.js
 * ═════════════════
 * The landing page for successful Stripe checkouts.
 * In a real app with a backend, Stripe webhooks would upgrade the database.
 * Since this is client-only demo, we read the `?tier=basic` or `?tier=premium`
 * param, force the upgrade in `tierLimits.js` (memory), and celebrate.
 */
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { setActiveTier, TIER } from '../services/tierLimits';

export default function SuccessScreen({ route, navigation }) {
    // React Navigation exposes URL search params if deep linking is set up.
    // However, expo web passes them in window.location.search automatically.
    const [tierName, setTierName] = useState('Premium');

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        // 1. Parse which tier they bought.
        //    Priority: ?tier= URL param (if Stripe has a custom success_url set)
        //    Fallback:  acrelogic_pending_tier (set by PricingScreen before opening Stripe)
        let boughtTier = TIER.PREMIUM;
        let pName = 'Premium';

        if (typeof window !== 'undefined' && window.location) {
            const params = new URLSearchParams(window.location.search);
            const urlTier = params.get('tier');
            if (urlTier === 'basic') {
                boughtTier = TIER.BASIC;
                pName = 'Basic';
            } else if (urlTier === 'premium') {
                boughtTier = TIER.PREMIUM;
                pName = 'Premium';
            } else {
                // No ?tier= param — check the localStorage pending flag
                try {
                    const pending = localStorage.getItem('acrelogic_pending_tier');
                    if (pending === 'basic') {
                        boughtTier = TIER.BASIC;
                        pName = 'Basic';
                    } else if (pending === 'premium') {
                        boughtTier = TIER.PREMIUM;
                        pName = 'Premium';
                    }
                } catch {}
            }
            // Always clear the pending flag — it has been consumed
            try { localStorage.removeItem('acrelogic_pending_tier'); } catch {}
        }

        setTierName(pName);

        // 2. Upgrade them — persisted to localStorage so it survives refreshes
        setActiveTier(boughtTier);

        // 3. Animate the success message
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 8, useNativeDriver: true }),
        ]).start();

    }, []);

    const handleContinue = () => {
        // Pop back to the root of the app
        navigation.reset({ index: 0, routes: [{ name: 'ModeSelector' }] });
    };

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                <View style={styles.iconCircle}>
                    <Text style={styles.iconText}>🎉</Text>
                </View>
                
                <Text style={styles.title}>You're Upgraded!</Text>
                <Text style={styles.subtitle}>
                    Welcome to <Text style={{ fontWeight: '700', color: Colors.primaryGreen }}>AcreLogic {tierName}</Text>.
                    All limits have been lifted, and new features are unlocked.
                </Text>

                <View style={styles.divider} />

                <Text style={styles.featuresTitle}>What's unlocked:</Text>
                <View style={styles.featuresList}>
                    <Text style={styles.featureItem}>✓ Unlimited family size</Text>
                    <Text style={styles.featureItem}>✓ Unlimited crops</Text>
                    <Text style={styles.featureItem}>
                        ✓ {tierName === 'Premium' ? 'Unlimited acreage' : '¼ acre limit'}
                    </Text>
                </View>

                <TouchableOpacity style={[styles.btn, Shadows.button]} onPress={handleContinue}>
                    <Text style={styles.btnText}>Let's go build a garden →</Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: Colors.backgroundGrey,
        alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
    },
    card: {
        backgroundColor: Colors.white, borderRadius: Radius.xl,
        padding: Spacing.xl, maxWidth: 440, width: '100%',
        alignItems: 'center', ...Shadows.card,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
    },
    iconCircle: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(76,175,80,0.15)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    iconText: { fontSize: 40 },
    title: {
        fontSize: Typography.xxl, fontWeight: Typography.bold,
        color: Colors.darkText, marginBottom: Spacing.xs, textAlign: 'center',
    },
    subtitle: {
        fontSize: Typography.md, color: Colors.mutedText, textAlign: 'center', lineHeight: 22,
    },
    divider: {
        height: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.06)',
        marginVertical: Spacing.lg,
    },
    featuresTitle: {
        fontSize: Typography.sm, fontWeight: Typography.bold,
        color: Colors.primaryGreen, textTransform: 'uppercase', letterSpacing: 1,
        alignSelf: 'flex-start', marginBottom: Spacing.sm,
    },
    featuresList: { alignSelf: 'flex-start', gap: 6, marginBottom: Spacing.xl },
    featureItem: { fontSize: Typography.sm, color: Colors.darkText },
    
    btn: {
        backgroundColor: Colors.primaryGreen, paddingVertical: 16, paddingHorizontal: 32,
        borderRadius: Radius.lg, width: '100%', alignItems: 'center',
    },
    btnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.cream },
});
