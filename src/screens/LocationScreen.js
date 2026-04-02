import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Animated,
    ImageBackground,
    TextInput,
    ScrollView,
    KeyboardAvoidingView,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { LinearGradient } from '../components/LinearGradient';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { fetchFarmProfile } from '../services/climateService';
import { createFarmPlan as createDbFarmPlan } from '../services/database';
import { saveFarmProfile, savePlanId, clearAllFarmData, createFarmPlan as createLocalPlan } from '../services/persistence';
import HomeLogoButton from '../components/HomeLogoButton';

const { width, height } = Dimensions.get('window');



// ─── Site Profile Card ────────────────────────────────────────────────────────
const SiteProfileCard = ({ profile, visible }) => {
    const slideAnim = useRef(new Animated.Value(30)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        }
    }, [visible]);

    const rows = [
        { label: 'USDA Zone',       value: profile.usdaZone ? `Zone ${profile.usdaZone.toUpperCase()}` : '--', icon: '🌡️' },
        { label: 'Last Frost',      value: profile.lastFrostDate  ? formatDate(profile.lastFrostDate)  : '--', icon: '❄️' },
        { label: 'First Frost',     value: profile.firstFrostDate ? formatDate(profile.firstFrostDate) : '--', icon: '🍂' },
        { label: 'Frost-Free Days', value: profile.frostFreeDays ? `${profile.frostFreeDays} days` : '--', icon: '☀️' },
        { label: 'Soil Type',       value: (profile.soilType && profile.soilType !== 'Unknown') ? profile.soilType : '--', icon: '🌱' },
        { label: 'Elevation',       value: profile.elevationFt ? `${profile.elevationFt} ft` : '--', icon: '⛰️' },
    ];

    return (
        <Animated.View
            style={[
                styles.profileCard,
                Shadows.card,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
        >
            <View style={styles.profileCardHeader}>
                <View style={styles.profilePulse} />
                <Text style={styles.profileCardTitle}>Site Profile</Text>
                <Text style={styles.profileCardSubtitle} numberOfLines={1}>{profile.address ?? ''}</Text>
            </View>

            {rows.map((row, i) => (
                <View key={i} style={[styles.profileRow, i < rows.length - 1 && styles.profileRowBorder]}>
                    <View style={styles.profileRowLeft}>
                        <Text style={styles.profileIcon}>{row.icon}</Text>
                        <Text style={styles.profileLabel}>{row.label}</Text>
                    </View>
                    <Text style={styles.profileValue}>{row.value}</Text>
                </View>
            ))}
        </Animated.View>
    );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LocationScreen({ navigation }) {
    const [address, setAddress] = useState('');
    const [farmProfile, setFarmProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [inputFocused, setInputFocused] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    }, []);

    const handleAnalyze = async () => {
        if (address.trim().length < 3) return;
        setLoading(true);
        setError(null);
        setFarmProfile(null);
        try {
            const raw = await fetchFarmProfile(address.trim());
            setFarmProfile({
                address: raw.address ?? address,
                frostFreeDays: raw.frost_free_days,
                lastFrostDate: raw.last_frost_date,
                firstFrostDate: raw.first_frost_date,
                usdaZone: raw.usda_zone,
                soilType: raw.soil_type,
                elevationFt: raw.elevation_ft,
                sunExposure: raw.sun_exposure,
                lat: raw.lat,
                lon: raw.lon,
                _raw: raw,
            });
        } catch (err) {
            setError('Unable to retrieve climate data. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleContinue = async () => {
        // Wipe any existing plan (blocks, bed data, successions) so the new
        // farm plan starts from a completely clean slate.
        clearAllFarmData();

        // Persist the new farmProfile for web refresh recovery
        saveFarmProfile(farmProfile._raw);

        // Derive a friendly plan name from the address/city
        const cityName = farmProfile.address?.split(',')[0]?.trim() ?? 'My Farm';
        const planName = `${cityName} Farm Plan`;

        // Register plan in local persistence so FarmPlanList picks it up immediately
        const localPlan = createLocalPlan(planName, farmProfile._raw);
        const localPlanId = localPlan?.id ?? null;

        try {
            const dbPlanId = await createDbFarmPlan({
                name: planName,
                address: farmProfile.address,
                lat: farmProfile.lat,
                lon: farmProfile.lon,
                frost_free_days: farmProfile.frostFreeDays,
                last_frost_date: farmProfile.lastFrostDate,
                first_frost_date: farmProfile.firstFrostDate,
                usda_zone: farmProfile.usdaZone,
                soil_type: farmProfile.soilType,
                elevation_ft: farmProfile.elevationFt,
                sun_exposure: farmProfile.sunExposure,
                num_beds: 8,
            });
            savePlanId(dbPlanId);
            navigation.navigate('FarmDesigner', { farmProfile: farmProfile._raw, planId: localPlanId, planName });
        } catch (err) {
            navigation.navigate('FarmDesigner', { farmProfile: farmProfile._raw, planId: localPlanId, planName });
        }
    };

    return (
        <View style={styles.rootContainer}>
            {/* Solid deep green background */}
            <View style={StyleSheet.absoluteFillObject} />

            {/* Scrollable content */}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.scrollView}
                bounces
            >
                <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                    {/* Back arrow */}
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backArrow}>‹</Text>
                        <Text style={styles.backText}>Back</Text>
                    </TouchableOpacity>

                    {/* Centered card */}
                    <View style={styles.card}>
                        {/* Farm image — shrunk, brown border */}
                        <View style={styles.imageFrame}>
                            <ImageBackground
                                source={require('../../assets/market-farm-hero.png')}
                                style={styles.heroImage}
                                resizeMode="cover"
                                imageStyle={{ borderRadius: 10 }}
                            >
                                {/* Subtle gradient tint at bottom */}
                                <LinearGradient
                                    colors={['transparent', 'rgba(30,55,20,0.45)']}
                                    style={StyleSheet.absoluteFillObject}
                                />
                            </ImageBackground>
                        </View>

                        {/* Heading */}
                        <View style={styles.headingBlock}>
                            <Text style={styles.heading}>Where is your farm?</Text>
                            <Text style={styles.subheading}>
                                We'll pull your local climate data to build an accurate growing calendar.
                            </Text>
                        </View>

                        {/* Address Input */}
                        <View style={[styles.inputWrapper, inputFocused && styles.inputWrapperFocused, Shadows.card]}>
                            <Text style={styles.inputIcon}>📍</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter farm address or zip code"
                                placeholderTextColor={Colors.mutedText}
                                value={address}
                                onChangeText={(t) => { setAddress(t); setFarmProfile(null); setError(null); }}
                                onFocus={() => setInputFocused(true)}
                                onBlur={() => setInputFocused(false)}
                                onSubmitEditing={handleAnalyze}
                                returnKeyType="search"
                                autoCapitalize="words"
                            />
                        </View>

                        {address.length > 3 && !farmProfile && !loading && (
                            <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze}>
                                <Text style={styles.analyzeBtnText}>Analyze Location →</Text>
                            </TouchableOpacity>
                        )}

                        {loading && (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color={Colors.primaryGreen} size="small" />
                                <Text style={styles.loadingText}>Fetching climate data…</Text>
                            </View>
                        )}

                        {error && (
                            <View style={styles.errorCard}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        {/* Site profile card — shown BEFORE continue so user can verify data */}
                        {farmProfile && <SiteProfileCard profile={farmProfile} visible={!!farmProfile} />}

                        {farmProfile && (
                            <TouchableOpacity
                                style={[styles.continueBtn, Shadows.button]}
                                onPress={handleContinue}
                            >
                                <Text style={styles.continueBtnText}>Continue →</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    rootContainer: {
        flex: 1,
        width: '100%',
        backgroundColor: '#2D4F1E', // deep farm green
        ...Platform.select({ web: { height: '100dvh' } }),
    },
    scrollView: {
        flex: 1,
        ...Platform.select({ web: { overflowY: 'auto', maxHeight: '100dvh' } }),
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 16,
    },
    content: {
        width: '100%',
        maxWidth: 540,
        gap: Spacing.lg,
    },

    // Main card
    card: {
        backgroundColor: '#fff',
        borderRadius: 20,
        overflow: 'hidden',
        gap: Spacing.md,
        paddingBottom: Spacing.lg,
        ...Shadows.card,
    },

    // Hero image with brown border frame
    imageFrame: {
        margin: 14,
        borderRadius: 12,
        borderWidth: 4,
        borderColor: '#7B4F2E', // warm brown
        overflow: 'hidden',
    },
    heroImage: {
        width: '100%',
        height: 200,
    },

    // Heading — padded inside card
    headingBlock: {
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
    },

    stickyFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        paddingTop: 12,
        backgroundColor: 'rgba(245,241,232,0.92)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(45,79,30,0.08)',
        ...Platform.select({ web: { backdropFilter: 'blur(8px)' } }),
    },

    // ── Nav ───────────────────────────────────────────────────────────────────
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 4,
    },
    backArrow: {
        fontSize: 28,
        color: Colors.cream,
        lineHeight: 30,
    },
    backText: {
        fontSize: Typography.base,
        color: Colors.cream,
        fontWeight: Typography.medium,
    },

    // ── Heading ───────────────────────────────────────────────────────────────
    stepLabel: {
        fontSize: Typography.xs,
        fontWeight: Typography.bold,
        color: Colors.burntOrange,
        letterSpacing: 2,
    },
    heading: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        lineHeight: 30,
    },
    subheading: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        lineHeight: 19,
    },

    // ── Input ─────────────────────────────────────────────────────────────────
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F5F0',
        borderRadius: Radius.md,
        borderWidth: 2,
        borderColor: 'transparent',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        gap: Spacing.sm,
        marginHorizontal: Spacing.lg,
    },
    inputWrapperFocused: {
        borderColor: Colors.primaryGreen,
    },
    inputIcon: { fontSize: 18 },
    input: {
        flex: 1,
        fontSize: Typography.md,
        color: Colors.darkText,
        paddingVertical: 12,
    },

    // ── Analyze btn ───────────────────────────────────────────────────────────
    analyzeBtn: {
        alignSelf: 'flex-end',
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 10,
        paddingHorizontal: Spacing.lg,
        borderRadius: Radius.full,
        marginHorizontal: Spacing.lg,
    },
    analyzeBtnText: {
        color: Colors.cream,
        fontWeight: Typography.bold,
        fontSize: Typography.sm,
        letterSpacing: 1,
    },

    // ── Profile Card ──────────────────────────────────────────────────────────
    profileCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: Radius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.15)',
        marginHorizontal: Spacing.lg,
    },
    profileCardHeader: {
        backgroundColor: Colors.primaryGreen,
        padding: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    profilePulse: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#7DFF6B',
    },
    profileCardTitle: {
        color: Colors.cream,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        letterSpacing: 1,
    },
    profileCardSubtitle: {
        color: Colors.warmTan,
        fontSize: Typography.sm,
        marginLeft: 'auto',
    },
    profileRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.md,
    },
    profileRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.08)',
    },
    profileRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    profileIcon: { fontSize: 16 },
    profileLabel: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
    },
    profileValue: {
        fontSize: Typography.sm,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
    },

    // ── Loading / Error ───────────────────────────────────────────────────────
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
        marginHorizontal: Spacing.lg,
    },
    loadingText: {
        fontSize: Typography.sm,
        color: Colors.primaryGreen,
        fontStyle: 'italic',
    },
    errorCard: {
        backgroundColor: 'rgba(204,85,0,0.1)',
        borderRadius: Radius.sm,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.burntOrange,
        marginHorizontal: Spacing.lg,
    },
    errorText: {
        fontSize: Typography.sm,
        color: Colors.burntOrange,
        lineHeight: 18,
    },

    // ── Continue ──────────────────────────────────────────────────────────────
    continueBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 18,
        borderRadius: Radius.md,
        alignItems: 'center',
        marginHorizontal: Spacing.lg,
    },
    continueBtnText: {
        color: Colors.cream,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        letterSpacing: 2,
    },
});
