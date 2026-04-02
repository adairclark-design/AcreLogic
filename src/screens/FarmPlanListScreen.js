/**
 * FarmPlanListScreen.js
 * ═════════════════════
 * Market Farmer entry hub.
 *
 *  Top half  — two large square cards:
 *      [  Preexisting Farm Plans  ]  [  New Farm Plan  ]
 *
 *  Bottom half (when plans exist) — scrollable plan list:
 *      Each card: name, location, block count, last active date
 *      Long-press → delete with confirm
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Animated, Platform, Dimensions, StatusBar, ImageBackground, Image
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from '../components/LinearGradient';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import HomeLogoButton from '../components/HomeLogoButton';
import {
    loadFarmPlans, deleteFarmPlan, createFarmPlan, loadBlocksForPlan,
} from '../services/persistence';

const { width } = Dimensions.get('window');
const CARD_W = Math.min((width - Spacing.lg * 2 - 12) / 2, 200);

// ─── Animated entry card ──────────────────────────────────────────────────────
function ActionCard({ icon, title, subtitle, accent, onPress, delay }) {
    const fade  = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0.88)).current;
    const press = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade,  { toValue: 1, duration: 380, delay, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, tension: 55, friction: 9, delay, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ opacity: fade, transform: [{ scale: Animated.multiply(scale, press) }] }}>
            <TouchableOpacity
                style={[styles.actionCard, { borderColor: accent + '55' }, Shadows.card]}
                onPress={onPress}
                onPressIn={() => Animated.spring(press, { toValue: 0.94, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(press, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
                activeOpacity={1}
            >
                <View style={[styles.actionStrip, { backgroundColor: accent }]} />
                <View style={[styles.actionIconWrap, { backgroundColor: accent + '18' }]}>
                    <Text style={styles.actionIcon}>{icon}</Text>
                </View>
                <Text style={[styles.actionTitle, { color: accent }]}>{title}</Text>
                <Text style={styles.actionSubtitle}>{subtitle}</Text>
                <View style={[styles.actionPill, { backgroundColor: accent }]}>
                    <Text style={styles.actionPillText}>›</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, onPress, onDelete }) {
    const fade   = useRef(new Animated.Value(0)).current;
    const slideY = useRef(new Animated.Value(16)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade,   { toValue: 1, duration: 320, useNativeDriver: true }),
            Animated.spring(slideY, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
        ]).start();
    }, []);

    const dateStr = plan.lastActivity
        ? new Date(plan.lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';

    const loc = plan.farmProfile?.address ?? plan.farmProfile?.city ?? plan.farmProfile?._userInput ?? null;

    return (
        <Animated.View style={[{ width: Platform.OS === 'web' ? 'calc(50% - 6px)' : '48%', marginBottom: Spacing.sm }, { opacity: fade, transform: [{ translateY: slideY }] }]}>
            <TouchableOpacity
                style={[styles.planCard, Shadows.card]}
                onPress={() => onPress(plan)}
                onLongPress={() => onDelete(plan)}
                delayLongPress={600}
                activeOpacity={0.82}
            >
                <View style={styles.planCardTop}>
                    <Text style={styles.planCardName} numberOfLines={1}>{plan.name}</Text>
                    {plan.isDefault && (
                        <View style={styles.planDefaultBadge}>
                            <Text style={styles.planDefaultBadgeText}>DEFAULT</Text>
                        </View>
                    )}
                </View>
                <View style={styles.planCardBottom}>
                    <Text style={styles.planCardLoc} numberOfLines={1}>{loc ? `📍 ${loc}` : ' '}</Text>
                    <Text style={styles.planCardMeta}>
                        {plan.blockCount > 0 ? `${plan.blockCount} blocks` : 'No blocks'}
                    </Text>
                    <Text style={styles.planCardDate}>{dateStr}</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function FarmPlanListScreen({ navigation }) {
    const [plans, setPlans] = useState([]);
    const headerFade  = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-20)).current;

    useFocusEffect(useCallback(() => {
        setPlans(loadFarmPlans());
    }, []));

    useEffect(() => {
        Animated.parallel([
            Animated.timing(headerFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(headerSlide, { toValue: 0, tension: 45, friction: 8, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleOpenPlan = (plan) => {
        const planBlocks = loadBlocksForPlan(plan.id);
        navigation.navigate('FarmDesigner', {
            farmProfile: plan.farmProfile,
            planId: plan.id,
            planName: plan.name,
        });
    };

    const handleNewPlan = () => {
        // Navigate to Location → when Location completes, it will land in FarmDesigner
        // We pass a flag so LocationScreen knows to create a new plan after completion
        navigation.navigate('Location', { createNewPlan: true });
    };

    const handleDeletePlan = (plan) => {
        if (Platform.OS === 'web') {
            if (!window.confirm(`Delete "${plan.name}"?\n\nThis will remove all ${plan.blockCount} blocks and crop plans inside it. This cannot be undone.`)) return;
        }
        deleteFarmPlan(plan.id);
        setPlans(loadFarmPlans());
    };

    return (
        <View style={[styles.container, Platform.OS === 'web' && { height: '100vh', overflow: 'hidden' }]}>
            <Image 
                source={require('../../assets/greenhouse-rows.jpg')}
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

                    {/* Nav row */}
                <View style={styles.navRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <HomeLogoButton navigation={navigation} />
                    <View style={{ width: 36 }} />
                </View>

                {/* Title */}
                <Animated.View style={[styles.titleBlock, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
                    <Text style={styles.superLabel}>MARKET FARMER</Text>
                    <Text style={styles.title}>Farm Plans</Text>
                    <Text style={styles.subtitle}>Start a new plan or continue an existing one.</Text>
                </Animated.View>

                {/* Two action cards */}
                <View style={styles.cardRow}>
                    <ActionCard
                        icon="📋"
                        title="Existing Plans"
                        subtitle={plans.length > 0 ? `${plans.length} plan${plans.length !== 1 ? 's' : ''} saved` : 'None yet'}
                        accent="#D4A017"
                        delay={60}
                        onPress={() => {
                            // Scroll to plan list — just a visual cue, the list is below
                            // On mobile, the list is the bottom half of the screen
                        }}
                    />
                    <ActionCard
                        icon="🌱"
                        title="New Farm Plan"
                        subtitle="Set location, build blocks, plan crops"
                        accent={Colors.primaryGreen}
                        delay={140}
                        onPress={handleNewPlan}
                    />
                </View>
                </View>

                {/* Plan list */}
                <View style={styles.listContent}>
                    {plans.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>🌾</Text>
                            <Text style={styles.emptyTitle}>No farm plans yet</Text>
                            <Text style={styles.emptySubtitle}>
                                Tap "New Farm Plan" above to get started.
                            </Text>
                        </View>
                ) : (
                    <>
                        <Text style={styles.listHeader}>YOUR PLANS</Text>
                        <View style={styles.planGrid}>
                            {plans.map(plan => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    onPress={handleOpenPlan}
                                    onDelete={handleDeletePlan}
                                />
                            ))}
                        </View>
                        <Text style={styles.listHint}>Long-press a plan to delete it.</Text>
                    </>
                )}
                </View>
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.primaryGreen, ...Platform.select({ web: { height: '100dvh' } }) },

    scrollContent: {
        flexGrow: 1,
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

    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 56,
        paddingHorizontal: Spacing.lg,
        marginBottom: 60, // Exposes more of the background image before the text starts
    },
    backBtn:  { width: 36, padding: 4 },
    backArrow: { fontSize: 30, color: Colors.cream, lineHeight: 32 },

    titleBlock: {
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    superLabel: {
        fontSize: Typography.xs,
        fontWeight: '800',
        color: Colors.warmTan ?? '#D4B896',
        letterSpacing: 2.5,
        marginBottom: 4,
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: Colors.cream,
        marginBottom: 6,
    },
    subtitle: {
        fontSize: Typography.sm,
        color: 'rgba(245,245,220,0.72)',
        textAlign: 'center',
    },

    // ── Action cards ─────────────────────────────────────────────────────────
    cardRow: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        gap: 12,
        justifyContent: 'center',
    },
    actionCard: {
        width: CARD_W,
        backgroundColor: 'rgba(250,248,242,0.97)',
        borderRadius: 18,
        borderWidth: 2,
        overflow: 'hidden',
        alignItems: 'center',
        paddingBottom: Spacing.md,
    },
    actionStrip: { width: '100%', height: 5 },
    actionIconWrap: {
        marginTop: 14,
        marginBottom: 8,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionIcon: { fontSize: 28 },
    actionTitle: {
        fontSize: Typography.sm,
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 4,
        paddingHorizontal: 10,
    },
    actionSubtitle: {
        fontSize: 10,
        color: Colors.mutedText,
        textAlign: 'center',
        paddingHorizontal: 8,
        lineHeight: 14,
        marginBottom: 12,
        flex: 1,
    },
    actionPill: {
        paddingVertical: 5,
        paddingHorizontal: 20,
        borderRadius: Radius.full,
    },
    actionPillText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '800',
        lineHeight: 19,
    },

    listContent: {
        padding: Spacing.lg,
        paddingBottom: 60,
    },
    listHeader: {
        fontSize: Typography.xs,
        fontWeight: '800',
        color: Colors.warmTan ?? '#D4B896',
        letterSpacing: 1.5,
        marginBottom: Spacing.sm,
    },

    planGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        width: '100%',
    },

    planCard: {
        backgroundColor: '#FAFAF7',
        borderRadius: Radius.md,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.1)',
        borderLeftWidth: 4,
        borderLeftColor: Colors.primaryGreen,
        minHeight: 110,
    },
    planCardTop: { width: '100%', gap: 4, marginBottom: 8 },
    planCardBottom: { width: '100%', gap: 2 },
    
    planCardName: {
        fontSize: Typography.sm,
        fontWeight: '800',
        color: Colors.primaryGreen,
    },
    planCardLoc: {
        fontSize: 10,
        color: Colors.mutedText,
    },
    planCardMeta: {
        fontSize: 10,
        fontWeight: '600',
        color: Colors.primaryGreen,
    },
    planCardDate: { 
        fontSize: 10,
        fontStyle: 'italic',
        color: Colors.mutedText, 
    },
    
    planDefaultBadge: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(45,79,30,0.1)',
        paddingVertical: 2,
        paddingHorizontal: 7,
        borderRadius: Radius.full,
    },
    planDefaultBadgeText: {
        fontSize: 8,
        fontWeight: '800',
        color: Colors.primaryGreen,
        letterSpacing: 0.8,
    },

    // ── Empty state ──────────────────────────────────────────────────────────
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
        gap: 8,
    },
    emptyIcon: { fontSize: 48 },
    emptyTitle: {
        fontSize: Typography.lg,
        fontWeight: '800',
        color: Colors.cream,
    },
    emptySubtitle: {
        fontSize: Typography.sm,
        color: 'rgba(245,245,220,0.72)',
        textAlign: 'center',
        lineHeight: 20,
    },
    listHint: {
        textAlign: 'center',
        fontSize: 10,
        color: 'rgba(245,245,220,0.55)',
        marginTop: Spacing.sm,
        fontStyle: 'italic',
    },
});
