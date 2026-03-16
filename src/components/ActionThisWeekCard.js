/**
 * ActionThisWeekCard
 * ══════════════════
 * Dismissible banner shown at the top of BedWorkspaceScreen that shows
 * farm tasks due in the next 7 days, derived from calendarEntries.
 *
 * Actions are grouped by day and color-coded by type:
 *   SEED → 🌱  TRANSPLANT → 🪴  HARVEST → ✂️  TURN → 🔄
 */
import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Animated, Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

const ACTION_META = {
    SEED: { icon: '🌱', color: '#C8E6C9', text: '#1B5E20', label: 'Seed' },
    TRANSPLANT: { icon: '🪴', color: '#FFF9C4', text: '#F57F17', label: 'Transplant' },
    HARVEST: { icon: '✂️', color: '#FFCCBC', text: '#BF360C', label: 'Harvest' },
    TURN: { icon: '🔄', color: '#B2EBF2', text: '#006064', label: 'Bed Turn' },
    DEFAULT: { icon: '📋', color: '#E0E0E0', text: '#424242', label: 'Task' },
};

const DISMISS_KEY = 'acrelogic_week_card_dismissed';

function getDismissedWeek() {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(DISMISS_KEY);
    } catch { return null; }
}

function setDismissedWeek(weekStart) {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(DISMISS_KEY, weekStart);
    } catch { }
}

function getThisWeekStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Roll back to Monday
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().split('T')[0];
}

function formatDayLabel(iso) {
    const d = new Date(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ActionThisWeekCard({ calendarEntries = [] }) {
    const [visible, setVisible] = useState(false);
    const slideAnim = useRef(new Animated.Value(-200)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    // Filter entries for the next 7 days
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);

    const weekActions = calendarEntries
        .filter(e => {
            if (!e.action_date) return false;
            const d = new Date(e.action_date);
            return d >= now && d <= weekEnd;
        })
        .sort((a, b) => new Date(a.action_date) - new Date(b.action_date));

    // Group by date
    const byDay = {};
    for (const e of weekActions) {
        const d = e.action_date.split('T')[0];
        if (!byDay[d]) byDay[d] = [];
        byDay[d].push(e);
    }
    const days = Object.entries(byDay).slice(0, 5); // max 5 days

    const weekStart = getThisWeekStart();
    const dismissed = getDismissedWeek() === weekStart;

    useEffect(() => {
        if (weekActions.length === 0 || dismissed) {
            setVisible(false);
            return;
        }
        setVisible(true);
        Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 11, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        ]).start();
    }, [calendarEntries]);

    const handleDismiss = () => {
        setDismissedWeek(weekStart);
        Animated.parallel([
            Animated.timing(slideAnim, { toValue: -200, duration: 260, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
        ]).start(() => setVisible(false));
    };

    if (!visible || days.length === 0) return null;

    return (
        <Animated.View style={[
            styles.card, Shadows.card,
            { opacity: opacityAnim, transform: [{ translateY: slideAnim }] },
        ]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>📅 This Week on the Farm</Text>
                <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss}>
                    <Text style={styles.dismissText}>Done ✓</Text>
                </TouchableOpacity>
            </View>

            {/* Task scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {days.map(([dateStr, entries]) => (
                    <View key={dateStr} style={styles.dayCol}>
                        <Text style={styles.dayLabel}>{formatDayLabel(dateStr)}</Text>
                        {entries.slice(0, 4).map((entry, i) => {
                            const meta = ACTION_META[entry.action_type] ?? ACTION_META.DEFAULT;
                            return (
                                <View key={i} style={[styles.taskPill, { backgroundColor: meta.color }]}>
                                    <Text style={styles.taskIcon}>{meta.icon}</Text>
                                    <View style={styles.taskText}>
                                        <Text style={[styles.taskType, { color: meta.text }]}>{meta.label}</Text>
                                        <Text style={styles.taskCrop} numberOfLines={1}>{entry.crop_name ?? ''}</Text>
                                        {entry.bed_number && (
                                            <Text style={styles.taskBed}>Bed {entry.bed_number}</Text>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                        {entries.length > 4 && (
                            <Text style={styles.moreText}>+{entries.length - 4} more</Text>
                        )}
                    </View>
                ))}
                {/* Week summary at the end */}
                <View style={styles.summaryCol}>
                    <Text style={styles.summaryNum}>{weekActions.length}</Text>
                    <Text style={styles.summaryLabel}>tasks{'\n'}this week</Text>
                </View>
            </ScrollView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.cardBg ?? '#FAFAF7',
        borderRadius: Radius.md, marginHorizontal: Spacing.md,
        marginTop: Spacing.sm, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.12)',
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.08)',
    },
    headerTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    dismissBtn: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: Radius.full, backgroundColor: 'rgba(45,79,30,0.1)' },
    dismissText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.bold },

    scrollContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },

    dayCol: { gap: 5, minWidth: 110, maxWidth: 130 },
    dayLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen, marginBottom: 2 },

    taskPill: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 5,
        borderRadius: Radius.sm, padding: 6,
    },
    taskIcon: { fontSize: 14, marginTop: 1 },
    taskText: { flex: 1, gap: 1 },
    taskType: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
    taskCrop: { fontSize: Typography.xs, fontWeight: Typography.semiBold ?? '600', color: Colors.darkText },
    taskBed: { fontSize: 9, color: Colors.mutedText },

    moreText: { fontSize: 9, color: Colors.mutedText, fontStyle: 'italic', paddingLeft: 6 },

    summaryCol: {
        minWidth: 70, alignItems: 'center', justifyContent: 'center',
        backgroundColor: Colors.primaryGreen, borderRadius: Radius.sm, padding: Spacing.sm,
    },
    summaryNum: { fontSize: 28, fontWeight: '900', color: Colors.cream, lineHeight: 30 },
    summaryLabel: { fontSize: 9, color: Colors.warmTan, textAlign: 'center', lineHeight: 13 },
});
