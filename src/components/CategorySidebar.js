import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { MEGA_CATEGORIES } from './MegaMenuBar';

export default function CategorySidebar({ activeLabel, onFilterChange, isMobile }) {
    const [openIndex, setOpenIndex] = useState(null);

    const toggleOpen = (idx) => {
        setOpenIndex(prev => prev === idx ? null : idx);
    };

    const selectTop = (cat, idx) => {
        if (cat.subcategories.length === 0) {
            onFilterChange({ label: 'All', filterFn: () => true });
            setOpenIndex(null);
            return;
        }
        toggleOpen(idx);
    };

    const selectSub = (topCat, sub) => {
        onFilterChange({ label: sub.label, filterFn: sub.filter });
    };

    const selectTopAll = (topCat) => {
        onFilterChange({ label: topCat.label, filterFn: topCat.filter });
    };

    // Mobile: Wrapping Pills Layout + Inline Expandable Dropdown
    if (isMobile) {
        return (
            <View style={styles.mobileContainerOuter}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobilePillsRow}>
                    {MEGA_CATEGORIES.map((cat, idx) => {
                        const isActive = activeLabel === 'All' ? cat.label === 'All' : activeLabel === cat.label || cat.subcategories.some(s => s.label === activeLabel);
                        const isOpen = openIndex === idx;
                        return (
                            <TouchableOpacity
                                key={cat.label}
                                style={[styles.mobilePill, isActive && styles.mobilePillActive, isOpen && styles.mobilePillOpen]}
                                onPress={() => selectTop(cat, idx)}
                            >
                                <Text style={styles.mobilePillEmoji}>{cat.emoji}</Text>
                                <Text style={[styles.mobilePillText, isActive && styles.mobilePillTextActive]}>
                                    {cat.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Render the open subcategories BELOW the scrolling pills */}
                {openIndex != null && MEGA_CATEGORIES[openIndex].subcategories.length > 0 && (
                    <View style={styles.mobileSubTrayOuter}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileSubTray}>
                            <TouchableOpacity 
                            style={[styles.mobileSubChip, activeLabel === MEGA_CATEGORIES[openIndex].label && styles.mobileSubChipActive]} 
                            onPress={() => selectTopAll(MEGA_CATEGORIES[openIndex])}
                        >
                            <Text style={[styles.mobileSubChipText, activeLabel === MEGA_CATEGORIES[openIndex].label && styles.mobileSubChipTextActive]}>
                                All {MEGA_CATEGORIES[openIndex].label} →
                            </Text>
                        </TouchableOpacity>
                        {MEGA_CATEGORIES[openIndex].subcategories.map(sub => (
                            <TouchableOpacity
                                key={sub.label}
                                style={[styles.mobileSubChip, activeLabel === sub.label && styles.mobileSubChipActive]}
                                onPress={() => selectSub(MEGA_CATEGORIES[openIndex], sub)}
                            >
                                <Text style={[styles.mobileSubChipText, activeLabel === sub.label && styles.mobileSubChipTextActive]}>
                                    {sub.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                        </ScrollView>
                    </View>
                )}
            </View>
        );
    }

    // Desktop: Left Accordion Sidebar
    return (
        <ScrollView style={styles.desktopSidebar} showsVerticalScrollIndicator={false}>
            <Text style={styles.sidebarTitle}>Categories</Text>
            {MEGA_CATEGORIES.map((cat, idx) => {
                const isGroupActive = activeLabel === cat.label || cat.subcategories.some(s => s.label === activeLabel);
                const isAllButton = cat.label === 'All';
                const isActiveAll = activeLabel === 'All';
                const isOpen = openIndex === idx;

                return (
                    <View key={cat.label} style={styles.sidebarGroup}>
                        <TouchableOpacity
                            style={[
                                styles.desktopNavRow,
                                (isAllButton && isActiveAll) ? styles.desktopNavRowActive : undefined,
                                (isGroupActive && !isAllButton) ? styles.desktopNavRowGroupActive : undefined,
                            ]}
                            onPress={() => selectTop(cat, idx)}
                        >
                            <View style={styles.navHeaderLeft}>
                                <Text style={styles.emoji}>{cat.emoji}</Text>
                                <Text style={[styles.desktopNavTitle, isGroupActive && !isAllButton && styles.desktopNavTitleActive, isAllButton && isActiveAll && styles.desktopNavTitleActive]}>
                                    {cat.label}
                                </Text>
                            </View>
                            {cat.subcategories.length > 0 && (
                                <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
                            )}
                        </TouchableOpacity>

                        {isOpen && cat.subcategories.length > 0 && (
                            <View style={styles.desktopSubList}>
                                <TouchableOpacity
                                    style={[styles.desktopSubItem, activeLabel === cat.label && styles.desktopSubItemActive]}
                                    onPress={() => selectTopAll(cat)}
                                >
                                    <Text style={[styles.desktopSubText, activeLabel === cat.label && styles.desktopSubTextActive]}>
                                        View All {cat.label}
                                    </Text>
                                </TouchableOpacity>
                                {cat.subcategories.map(sub => (
                                    <TouchableOpacity
                                        key={sub.label}
                                        style={[styles.desktopSubItem, activeLabel === sub.label && styles.desktopSubItemActive]}
                                        onPress={() => selectSub(cat, sub)}
                                    >
                                        <Text style={[styles.desktopSubText, activeLabel === sub.label && styles.desktopSubTextActive]}>
                                            {sub.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                );
            })}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    emoji: { fontSize: 16, marginRight: 8, width: 22, textAlign: 'center' },
    
    // --- Mobile Wrappable Pills ---
    mobileContainerOuter: {
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.1)',
        paddingVertical: 8,
    },
    mobilePillsRow: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.md,
        gap: 6,
        alignItems: 'center',
    },
    mobilePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: Radius.full,
        backgroundColor: '#f9f9fa',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    mobilePillActive: {
        backgroundColor: Colors.primaryGreen,
        borderColor: Colors.primaryGreen,
    },
    mobilePillOpen: {
        backgroundColor: 'rgba(45,79,30,0.08)',
        borderColor: 'rgba(45,79,30,0.3)',
    },
    mobilePillEmoji: { fontSize: 11, marginRight: 4 },
    mobilePillText: {
        fontSize: 11,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
    },
    mobilePillTextActive: { color: Colors.cream },
    
    mobileSubTrayOuter: {
        backgroundColor: 'rgba(45,79,30,0.03)',
        marginTop: 8,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(45,79,30,0.1)',
    },
    mobileSubTray: {
        paddingVertical: 10,
        paddingHorizontal: Spacing.md,
        flexDirection: 'row',
        gap: 6,
    },
    mobileSubChip: {
        backgroundColor: Colors.white,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.15)',
    },
    mobileSubChipActive: {
        backgroundColor: Colors.primaryGreen,
        borderColor: Colors.primaryGreen,
    },
    mobileSubChipText: {
        fontSize: 11,
        color: Colors.primaryGreen,
        fontWeight: Typography.medium,
    },
    mobileSubChipTextActive: { color: Colors.cream },

    // --- Desktop Accordion Sidebar ---
    desktopSidebar: {
        width: 260,
        backgroundColor: Colors.white,
        borderRightWidth: 1,
        borderRightColor: 'rgba(45,79,30,0.12)',
        height: '100%',
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.sm,
    },
    sidebarTitle: {
        fontSize: Typography.xs,
        fontWeight: Typography.bold,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: Colors.mutedText,
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.md,
    },
    sidebarGroup: {
        marginBottom: 2,
    },
    desktopNavRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: Spacing.sm,
        borderRadius: Radius.md,
        ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s' } : {}),
    },
    desktopNavRowActive: {
        backgroundColor: 'rgba(45,79,30,0.08)',
    },
    desktopNavRowGroupActive: {
        backgroundColor: 'rgba(45,79,30,0.03)',
    },
    navHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    desktopNavTitle: {
        fontSize: 14,
        fontWeight: Typography.medium,
        color: Colors.darkText,
    },
    desktopNavTitleActive: {
        color: Colors.primaryGreen,
        fontWeight: Typography.bold,
    },
    chevron: {
        fontSize: 18,
        color: Colors.mutedText,
        lineHeight: 20,
    },
    chevronOpen: {
        transform: [{ rotate: '90deg' }],
        color: Colors.primaryGreen,
    },
    desktopSubList: {
        paddingLeft: 38,
        paddingTop: 4,
        paddingBottom: 8,
        gap: 2,
    },
    desktopSubItem: {
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 6,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    },
    desktopSubItemActive: {
        backgroundColor: Colors.primaryGreen,
    },
    desktopSubText: {
        fontSize: 13,
        color: Colors.mutedText,
        fontWeight: Typography.medium,
    },
    desktopSubTextActive: {
        color: Colors.cream,
        fontWeight: Typography.bold,
    },
});
