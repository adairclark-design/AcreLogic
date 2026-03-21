/**
 * LocationStep.js
 * ───────────────
 * Full-screen location entry step shared by FamilyPlannerScreen (Feed My Family)
 * and GardenSpacePlannerScreen (Plan My Garden).
 *
 * Props
 *   title      — main heading, e.g. "Where is your garden?"
 *   subtitle   — subheading shown below the title
 *   onDone(profile|null) — called with fetched profile OR null when user skips
 *   onBack()   — back button handler
 */
import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, ActivityIndicator,
    Animated, Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { fetchFarmProfile } from '../services/climateService';

// ─── Site Profile Card (mirrors LocationScreen.js) ───────────────────────────
function SiteProfileCard({ profile }) {
    const slideAnim = useRef(new Animated.Value(24)).current;
    const fadeAnim  = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
        ]).start();
    }, []);

    const rows = [
        { label: 'USDA Zone',        value: profile.usda_zone   ? `Zone ${profile.usda_zone.toUpperCase()}` : '--', icon: '🌡️' },
        { label: 'Last Frost',        value: profile.last_frost_date  ?? '--', icon: '❄️' },
        { label: 'First Frost',       value: profile.first_frost_date ?? '--', icon: '🍂' },
        { label: 'Frost-Free Days',   value: profile.frost_free_days  ? `${profile.frost_free_days} days` : '--', icon: '☀️' },
    ];

    return (
        <Animated.View
            style={[
                ls.profileCard,
                Shadows.card,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
        >
            <View style={ls.profileCardHeader}>
                <View style={ls.profilePulse} />
                <Text style={ls.profileCardTitle}>Site Profile</Text>
                <Text style={ls.profileCardSubtitle} numberOfLines={1}>
                    {profile.address ?? profile.city ?? ''}
                </Text>
            </View>
            {rows.map((row, i) => (
                <View key={i} style={[ls.profileRow, i < rows.length - 1 && ls.profileRowBorder]}>
                    <View style={ls.profileRowLeft}>
                        <Text style={ls.profileIcon}>{row.icon}</Text>
                        <Text style={ls.profileLabel}>{row.label}</Text>
                    </View>
                    <Text style={ls.profileValue}>{row.value}</Text>
                </View>
            ))}
        </Animated.View>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LocationStep({
    title    = 'Where is your garden?',
    subtitle = "We'll pull your local frost dates to calculate exact planting, seeding, and harvest dates.",
    onDone,
    onBack,
}) {
    const [address,      setAddress]      = useState('');
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState(null);
    const [profile,      setProfile]      = useState(null);
    const [inputFocused, setInputFocused] = useState(false);

    const handleAnalyze = async () => {
        if (address.trim().length < 3) return;
        setLoading(true);
        setError(null);
        setProfile(null);
        try {
            const raw = await fetchFarmProfile(address.trim());
            setProfile(raw);
        } catch {
            setError('Unable to retrieve climate data. Check your connection or try a different zip code.');
        } finally {
            setLoading(false);
        }
    };

    const handleContinue = () => {
        onDone(profile);
    };

    const handleSkip = () => {
        onDone(null);
    };

    return (
        <ScrollView
            contentContainerStyle={ls.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={Platform.OS === 'web' ? { overflowY: 'auto', flex: 1 } : { flex: 1 }}
        >
            {/* Heading */}
            <View style={ls.headingBlock}>
                <Text style={ls.stepTag}>📍 LOCATION</Text>
                <Text style={ls.title}>{title}</Text>
                <Text style={ls.subtitle}>{subtitle}</Text>
            </View>

            {/* Address input */}
            <View style={[ls.inputWrapper, inputFocused && ls.inputWrapperFocused, Shadows.card]}>
                <Text style={ls.inputIcon}>🔍</Text>
                <TextInput
                    style={ls.input}
                    placeholder="Enter zip code or city, state"
                    placeholderTextColor={Colors.mutedText}
                    value={address}
                    onChangeText={t => { setAddress(t); setProfile(null); setError(null); }}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    onSubmitEditing={handleAnalyze}
                    returnKeyType="search"
                    autoCapitalize="words"
                />
            </View>

            {/* Analyze button */}
            {address.length >= 3 && !profile && !loading && (
                <TouchableOpacity style={ls.analyzeBtn} onPress={handleAnalyze}>
                    <Text style={ls.analyzeBtnText}>Analyze Location →</Text>
                </TouchableOpacity>
            )}

            {/* Loading */}
            {loading && (
                <View style={ls.loadingRow}>
                    <ActivityIndicator color={Colors.primaryGreen} size="small" />
                    <Text style={ls.loadingText}>Fetching climate data…</Text>
                </View>
            )}

            {/* Error */}
            {error && (
                <View style={ls.errorCard}>
                    <Text style={ls.errorText}>{error}</Text>
                </View>
            )}

            {/* Profile card */}
            {profile && <SiteProfileCard profile={profile} />}

            {/* Continue (after profile loaded) */}
            {profile && (
                <TouchableOpacity style={[ls.continueBtn, Shadows.button]} onPress={handleContinue}>
                    <Text style={ls.continueBtnText}>Continue →</Text>
                </TouchableOpacity>
            )}

            {/* Skip */}
            <TouchableOpacity style={ls.skipBtn} onPress={handleSkip}>
                <Text style={ls.skipText}>Skip for now →</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ls = StyleSheet.create({
    scroll: {
        flexGrow: 1,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingBottom: 48,
        gap: Spacing.md,
    },

    // Heading
    headingBlock: { gap: Spacing.sm, marginBottom: 4 },
    stepTag: {
        fontSize: Typography.xs,
        fontWeight: Typography.bold,
        color: Colors.burntOrange,
        letterSpacing: 2,
    },
    title: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        lineHeight: 30,
    },
    subtitle: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        lineHeight: 20,
    },

    // Input
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.white,
        borderRadius: Radius.md,
        borderWidth: 2,
        borderColor: 'transparent',
        paddingHorizontal: Spacing.md,
        paddingVertical: 4,
        gap: Spacing.sm,
    },
    inputWrapperFocused: { borderColor: Colors.primaryGreen },
    inputIcon: { fontSize: 16 },
    input: {
        flex: 1,
        fontSize: Typography.md,
        color: Colors.darkText,
        paddingVertical: 12,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },

    // Analyze
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

    // Loading / Error
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.xs ?? 4,
    },
    loadingText: { fontSize: Typography.sm, color: Colors.primaryGreen, fontStyle: 'italic' },
    errorCard: {
        backgroundColor: 'rgba(204,85,0,0.08)',
        borderRadius: Radius.sm,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.burntOrange,
    },
    errorText: { fontSize: Typography.sm, color: Colors.burntOrange, lineHeight: 18 },

    // Site profile card
    profileCard: {
        backgroundColor: Colors.cardBg ?? '#FAFAF7',
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
    profilePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7DFF6B' },
    profileCardTitle: {
        color: Colors.cream,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        letterSpacing: 1,
    },
    profileCardSubtitle: {
        color: Colors.warmTan ?? '#D4B896',
        fontSize: Typography.sm,
        marginLeft: 'auto',
        maxWidth: 180,
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
    profileRowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    profileIcon: { fontSize: 15 },
    profileLabel: { fontSize: Typography.sm, color: Colors.mutedText },
    profileValue: { fontSize: Typography.sm, fontWeight: Typography.semiBold, color: Colors.primaryGreen },

    // Continue
    continueBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 16,
        borderRadius: Radius.md,
        alignItems: 'center',
    },
    continueBtnText: {
        color: Colors.cream,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        letterSpacing: 2,
    },

    // Skip
    skipBtn: {
        alignItems: 'center',
        paddingVertical: 14,
    },
    skipText: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        fontWeight: Typography.medium,
        letterSpacing: 0.5,
    },
});
