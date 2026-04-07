import 'react-native-gesture-handler';
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { getActiveTier, resetTierForTesting, setActiveTier, TIER } from './src/services/tierLimits';
import ErrorBoundary from './src/components/ErrorBoundary';

// ─── Dev-only: detect ?dev=1 in URL (web only) ───────────────────────────────
const IS_DEV_MODE = Platform.OS === 'web' && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('dev') === '1';

function DevResetBanner() {
    const [tier, setTier] = useState(getActiveTier());
    if (!IS_DEV_MODE) return null;

    const handleReset = () => {
        resetTierForTesting();
        setTier(getActiveTier());
        // Reload without the dev param to get a clean re-init
        if (typeof window !== 'undefined') {
            window.location.href = window.location.pathname + '?dev=1';
        }
    };

    const handleSetPremium = () => {
        setActiveTier(TIER.PREMIUM);
        setTier(getActiveTier());
    };

    return (
        <View style={devStyles.banner}>
            <Text style={devStyles.label}>🛠 DEV  |  tier: <Text style={devStyles.tier}>{tier}</Text></Text>
            <View style={devStyles.btnRow}>
                <TouchableOpacity style={devStyles.btn} onPress={handleReset}>
                    <Text style={devStyles.btnText}>Reset → FREE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[devStyles.btn, { backgroundColor: '#1a6b2f' }]} onPress={handleSetPremium}>
                    <Text style={devStyles.btnText}>Set PREMIUM</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const devStyles = StyleSheet.create({
    banner: {
        backgroundColor: '#1a1a1a',
        paddingTop: Platform.OS === 'web' ? 6 : 44,
        paddingBottom: 6,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 9999,
        gap: 8,
    },
    label:   { color: '#aaa', fontSize: 11, fontFamily: 'monospace' },
    tier:    { color: '#7fff7f', fontWeight: '700' },
    btnRow:  { flexDirection: 'row', gap: 6 },
    btn:     { backgroundColor: '#c0392b', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
    btnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

export default function App() {
    return (
        <ErrorBoundary>
            <StatusBar style="light" />
            <DevResetBanner />
            <AppNavigator />
        </ErrorBoundary>
    );
}
