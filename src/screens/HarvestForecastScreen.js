/**
 * HarvestForecastScreen
 * ══════════════════════
 * Month-by-month harvest timeline showing:
 *   • Total lbs and revenue per month
 *   • Crop-by-crop breakdown with cut counts
 *   • Active weeks within each month
 *   • Revenue bar chart for quick visual comparison
 */
import React, { useEffect, useState, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Animated, ActivityIndicator, Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { calculateFarmYield, buildMonthlyForecast } from '../services/yieldCalculator';

const MONTH_COLORS = [
    '#C8E6C9', '#B2EBF2', '#FFF9C4', '#FFCCBC',
    '#D7CCC8', '#F8BBD0', '#DCEDC8', '#FFE082', '#B3E5FC', '#E1BEE7', '#FFCCBC', '#C8F7C5',
];

function fmtNum(n) {
    return n?.toLocaleString?.() ?? String(n ?? 0);
}

export default function HarvestForecastScreen({ navigation, route }) {
    const { farmProfile = {}, bedSuccessions = {} } = route?.params ?? {};

    const [months, setMonths] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState({});

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(24)).current;

    useEffect(() => {
        buildForecast();
    }, []);

    const buildForecast = async () => {
        try {
            const allBeds = Object.entries(bedSuccessions).map(([num, succs]) => ({
                bed_number: parseInt(num),
                successions: succs,
            }));
            const yieldData = await calculateFarmYield(allBeds, farmProfile);
            const allEstimates = Object.values(yieldData.byBed ?? {}).flat();
            const monthData = buildMonthlyForecast(allEstimates);
            setMonths(monthData);
            // Auto-expand the first month
            if (monthData.length > 0) {
                setExpanded({ [monthData[0].month_key]: true });
            }
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
            ]).start();
        } catch (e) {
            console.error('[HarvestForecast]', e);
        } finally {
            setLoading(false);
        }
    };

    const maxRevenue = Math.max(...months.map(m => m.total_revenue), 1);
    const totalSeasonLbs = months.reduce((s, m) => s + m.total_lbs, 0);
    const totalSeasonRevenue = months.reduce((s, m) => s + m.total_revenue, 0);

    const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.stepLabel}>PLAN SUMMARY</Text>
                    <Text style={styles.heading}>Harvest Forecast</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.centerView}>
                    <ActivityIndicator color={Colors.primaryGreen} size="large" />
                    <Text style={styles.loadingText}>Building your forecast…</Text>
                </View>
            ) : months.length === 0 ? (
                <View style={styles.centerView}>
                    <Text style={styles.emptyIcon}>🌱</Text>
                    <Text style={styles.emptyTitle}>No harvest data yet</Text>
                    <Text style={styles.emptySubtitle}>Assign crops to beds to see your season forecast</Text>
                    <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
                        <Text style={styles.backLinkText}>← Back to Workspace</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <Animated.ScrollView
                    style={[
                        { flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                        Platform.OS === 'web' && { overflowY: 'scroll' },
                    ]}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Season summary pills */}
                    <View style={[styles.seasonCard, Shadows.card]}>
                        <Text style={styles.seasonCardLabel}>FULL SEASON TOTAL</Text>
                        <Text style={styles.seasonRevenue}>${fmtNum(totalSeasonRevenue)}</Text>
                        <View style={styles.seasonPills}>
                            <View style={styles.pill}>
                                <Text style={styles.pillIcon}>📦</Text>
                                <Text style={styles.pillText}>{fmtNum(totalSeasonLbs)} lbs</Text>
                            </View>
                            <View style={styles.pill}>
                                <Text style={styles.pillIcon}>📅</Text>
                                <Text style={styles.pillText}>{months.length} active months</Text>
                            </View>
                            <View style={styles.pill}>
                                <Text style={styles.pillIcon}>🔪</Text>
                                <Text style={styles.pillText}>{months.reduce((s, m) => s + m.harvest_count, 0)} harvests</Text>
                            </View>
                        </View>
                    </View>

                    {/* Revenue bar chart */}
                    <Text style={styles.sectionTitle}>Revenue Timeline</Text>
                    <View style={[styles.chartCard, Shadows.card]}>
                        {months.map((m, i) => {
                            const barPct = (m.total_revenue / maxRevenue) * 100;
                            return (
                                <View key={m.month_key} style={styles.chartRow}>
                                    <Text style={styles.chartLabel}>{m.month_label.split(' ')[0]}</Text>
                                    <View style={styles.chartTrack}>
                                        <View style={[styles.chartBar, { width: `${barPct}%`, backgroundColor: MONTH_COLORS[i % MONTH_COLORS.length] }]} />
                                        <Text style={styles.chartValue}>${fmtNum(m.total_revenue)}</Text>
                                    </View>
                                    <Text style={styles.chartLbs}>{fmtNum(m.total_lbs)} lbs</Text>
                                </View>
                            );
                        })}
                    </View>

                    {/* Month-by-month breakdown */}
                    <Text style={styles.sectionTitle}>Month by Month</Text>
                    {months.map((m, i) => (
                        <View key={m.month_key} style={[styles.monthCard, Shadows.card]}>
                            {/* Month header */}
                            <TouchableOpacity
                                style={styles.monthHeader}
                                onPress={() => toggle(m.month_key)}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.monthBadge, { backgroundColor: MONTH_COLORS[i % MONTH_COLORS.length] }]}>
                                    <Text style={styles.monthBadgeText}>{m.month_label.split(' ')[0]}</Text>
                                </View>
                                <View style={styles.monthHeaderMid}>
                                    <Text style={styles.monthLabel}>{m.month_label}</Text>
                                    <Text style={styles.monthStat}>{fmtNum(m.total_lbs)} lbs · {m.harvest_count} harvests</Text>
                                </View>
                                <View style={styles.monthRevenue}>
                                    <Text style={styles.monthRevenueAmount}>${fmtNum(m.total_revenue)}</Text>
                                </View>
                                <Text style={styles.chevron}>{expanded[m.month_key] ? '▲' : '▼'}</Text>
                            </TouchableOpacity>

                            {/* Expanded crop breakdown */}
                            {expanded[m.month_key] && (
                                <View style={styles.monthBody}>
                                    {m.crop_breakdown.map((crop, ci) => (
                                        <View key={ci} style={styles.cropBreakdownRow}>
                                            <Text style={styles.cropBreakdownName}>{crop.name}</Text>
                                            <Text style={styles.cropBreakdownLbs}>{fmtNum(crop.lbs)} lbs</Text>
                                            <Text style={styles.cropBreakdownCuts}>
                                                {crop.cuts} {crop.cuts === 1 ? 'harvest' : 'harvests'}
                                            </Text>
                                        </View>
                                    ))}

                                    {/* Active weeks this month */}
                                    <View style={styles.weeksRow}>
                                        {m.weeks.map((w, wi) => (
                                            <View key={wi} style={[
                                                styles.weekPill,
                                                w.box_rating === 'Full' && styles.weekPillFull,
                                                w.box_rating === 'Good' && styles.weekPillGood,
                                            ]}>
                                                <Text style={styles.weekPillLabel}>{w.week_label}</Text>
                                                <Text style={styles.weekPillCrops}>{w.items.length} crops</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>
                    ))}

                    <View style={{ height: 48 }} />
                </Animated.ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0EDE6' },

    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen, gap: Spacing.sm,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    headerText: { flex: 1, gap: 2 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },

    centerView: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    loadingText: { color: Colors.mutedText, fontSize: Typography.sm },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.primaryGreen },
    emptySubtitle: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center' },
    backLink: { marginTop: 8 },
    backLinkText: { color: Colors.primaryGreen, fontWeight: Typography.bold },

    scrollContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },
    sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen, letterSpacing: 0.5, marginBottom: -4 },

    // Season summary
    seasonCard: {
        backgroundColor: Colors.primaryGreen, borderRadius: Radius.md,
        padding: Spacing.lg, gap: 6, alignItems: 'center',
    },
    seasonCardLabel: { fontSize: 9, letterSpacing: 2, color: Colors.warmTan, fontWeight: Typography.bold },
    seasonRevenue: { fontSize: 36, fontWeight: '900', color: Colors.cream, letterSpacing: -1 },
    seasonPills: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.full },
    pillIcon: { fontSize: 12 },
    pillText: { fontSize: Typography.xs, color: Colors.cream, fontWeight: Typography.medium },

    // Revenue bar chart
    chartCard: { backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.md, padding: Spacing.md, gap: 8 },
    chartRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    chartLabel: { width: 36, fontSize: Typography.xs, color: Colors.mutedText, fontWeight: Typography.medium },
    chartTrack: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(45,79,30,0.06)', borderRadius: 4, overflow: 'hidden', height: 22 },
    chartBar: { height: '100%', borderRadius: 4, minWidth: 4 },
    chartValue: { position: 'absolute', right: 4, fontSize: 9, fontWeight: Typography.bold, color: Colors.primaryGreen },
    chartLbs: { width: 52, fontSize: 9, color: Colors.mutedText, textAlign: 'right' },

    // Month cards
    monthCard: { backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.md, overflow: 'hidden' },
    monthHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
    monthBadge: { width: 42, height: 42, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
    monthBadgeText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#2C3E50' },
    monthHeaderMid: { flex: 1, gap: 2 },
    monthLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    monthStat: { fontSize: Typography.xs, color: Colors.mutedText },
    monthRevenue: { alignItems: 'flex-end' },
    monthRevenueAmount: { fontSize: Typography.md, fontWeight: '800', color: Colors.burntOrange },
    chevron: { fontSize: Typography.xs, color: Colors.mutedText, width: 14, textAlign: 'center' },

    monthBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.08)' },
    cropBreakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 4 },
    cropBreakdownName: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    cropBreakdownLbs: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.burntOrange, width: 60, textAlign: 'right' },
    cropBreakdownCuts: { fontSize: Typography.xs, color: Colors.mutedText, width: 64, textAlign: 'right' },

    weeksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    weekPill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: Radius.full, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' },
    weekPillFull: { backgroundColor: '#C8E6C9', borderColor: '#A5D6A7' },
    weekPillGood: { backgroundColor: '#FFF9C4', borderColor: '#FFF176' },
    weekPillLabel: { fontSize: 9, fontWeight: Typography.bold, color: '#2C3E50' },
    weekPillCrops: { fontSize: 8, color: Colors.mutedText },
});
