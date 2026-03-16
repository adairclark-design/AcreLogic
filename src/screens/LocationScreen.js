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
import { createFarmPlan } from '../services/database';
import { saveFarmProfile, savePlanId } from '../services/persistence';

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
        { label: 'Frost-Free Days', value: profile.frostFreeDays ? `${profile.frostFreeDays} Days` : '--', icon: '❄️' },
        { label: 'Soil Type', value: profile.soilType ?? '--', icon: '🌱' },
        { label: 'Elevation', value: profile.elevationFt ? `${profile.elevationFt} ft` : '--', icon: '⛰️' },
        { label: 'Sun Exposure', value: profile.sunExposure ?? '--', icon: '☀️' },
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
                <Text style={styles.profileCardSubtitle}>{profile.city}</Text>
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
        // Persist farmProfile for web refresh recovery
        saveFarmProfile(farmProfile._raw);
        try {
            const planId = await createFarmPlan({
                name: 'My Farm',
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
            savePlanId(planId);
            navigation.navigate('VegetableGrid', { farmProfile: farmProfile._raw, planId });
        } catch (err) {
            navigation.navigate('VegetableGrid', { farmProfile: farmProfile._raw });
        }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ImageBackground
                source={require('../../assets/greenhouse-rows.jpg')}
                style={styles.bg}
                resizeMode="cover"
            >
                <LinearGradient
                    colors={['rgba(245,241,232,0.92)', 'rgba(210,180,140,0.88)', 'rgba(245,241,232,0.96)']}
                    style={StyleSheet.absoluteFillObject}
                />

                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    style={Platform.OS === 'web' ? { overflowY: 'scroll' } : undefined}
                >
                    <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                        {/* Back arrow */}
                        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                            <Text style={styles.backArrow}>‹</Text>
                            <Text style={styles.backText}>Back</Text>
                        </TouchableOpacity>

                        {/* Heading */}
                        <View style={styles.headingBlock}>
                            <Text style={styles.stepLabel}>PHASE 1 OF 3</Text>
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
                                onChangeText={(t) => { setAddress(t); setShowProfile(false); }}
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

                        {farmProfile && <SiteProfileCard profile={farmProfile} visible={!!farmProfile} />}

                        {farmProfile && (
                            <Animated.View style={{ opacity: fadeAnim }}>
                                <TouchableOpacity
                                    style={[styles.continueBtn, Shadows.button]}
                                    onPress={handleContinue}
                                >
                                    <Text style={styles.continueBtnText}>Continue →</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    </Animated.View>
                </ScrollView>
            </ImageBackground>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    bg: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 40,
    },
    content: {
        flex: 1,
        paddingHorizontal: Spacing.lg,
        paddingTop: 60,
        gap: Spacing.lg,
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
        color: Colors.primaryGreen,
        lineHeight: 30,
    },
    backText: {
        fontSize: Typography.base,
        color: Colors.primaryGreen,
        fontWeight: Typography.medium,
    },

    // ── Heading ───────────────────────────────────────────────────────────────
    headingBlock: { gap: Spacing.sm },
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
        backgroundColor: Colors.white,
        borderRadius: Radius.md,
        borderWidth: 2,
        borderColor: 'transparent',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        gap: Spacing.sm,
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
    },
    continueBtnText: {
        color: Colors.cream,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        letterSpacing: 2,
    },
});
