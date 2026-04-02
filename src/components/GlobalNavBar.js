import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing } from '../theme';
import HomeLogoButton from './HomeLogoButton';

const NAV_TABS = [
    { label: 'Farm Layout', route: 'FarmDesigner' },
    { label: 'Crops', route: 'VegetableGrid' },
    { label: 'Seeds', route: 'SeedOrder' },
    { label: 'Calendar', route: 'CropCalendar' },
    { label: 'Journal', route: 'FieldJournal' },
    { label: 'Yield', route: 'YieldSummary' },
];

export default function GlobalNavBar({ navigation, farmProfile, planId, activeRoute, rightAction }) {
    return (
        <View style={styles.topNavContainer}>
            {/* Left — back chevron drops back to Main Dashboard */}
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Dashboard')}>
                <Text style={styles.backArrow}>‹</Text>
            </TouchableOpacity>

            {/* Center logo */}
            <HomeLogoButton navigation={navigation} />

            {/* Page title */}
            <Text style={styles.navTitle}>Farm Management</Text>

            {/* Nav links */}
            <View style={styles.topNavLinks}>
                {NAV_TABS.map((tab) => {
                    const isActive = tab.route === activeRoute;
                    return (
                        <TouchableOpacity
                            key={tab.label}
                            style={[styles.navLinkWrap, isActive && styles.navLinkActive]}
                            onPress={() => {
                                if (!isActive) {
                                    navigation.replace(tab.route, { farmProfile, planId });
                                }
                            }}
                            activeOpacity={isActive ? 1 : 0.7}
                        >
                            <Text style={[styles.navLinkText, isActive && styles.navLinkTextActive]}>{tab.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Right Action slot (e.g. Print Button) or default Drone Icon */}
            {rightAction ? rightAction : (
                <Text style={styles.droneIcon}>🛰</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    topNavContainer: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Spacing.xl, paddingTop: 44, paddingBottom: Spacing.sm,
        backgroundColor: Colors.primaryGreen,
        gap: 16,
        zIndex: 100,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, fontWeight: 'bold', color: Colors.cream, lineHeight: 30 },
    navTitle: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.5 },

    topNavLinks: { flex: 1, flexDirection: 'row', gap: 28, justifyContent: 'center' },
    navLinkWrap: { paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    navLinkActive: { borderBottomColor: Colors.cream },
    navLinkText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
    navLinkTextActive: { color: Colors.cream },

    droneIcon: { fontSize: 18, color: Colors.cream },
});
