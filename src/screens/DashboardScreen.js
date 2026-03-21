/**
 * DashboardScreen.js
 * ══════════════════
 * "Current Season" dashboard — shows the farmer exactly what to do
 * this week based on their planted beds, today's date, and real
 * growing-stage milestones.
 *
 * Three sections:
 *   1. 📅 This Week    — seeding/transplant/harvest calendar events
 *   2. 🌿 Growing Now  — crops in-ground with progress bar + stage tip
 *   3. 📆 Coming Up    — next 14 days calendar events
 *
 * Entry points:
 *   • HeroScreen  → "View Dashboard" (when saved plan exists)
 *   • BedWorkspaceScreen → 📊 nav button
 */
import React, {
    useState, useEffect, useCallback, useRef,
} from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, Animated, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadSavedPlan } from '../services/persistence';
import { generateFullCalendar } from '../services/calendarGenerator';
import { getActiveCrops } from '../services/growthStageService';
import CROP_IMAGES from '../data/cropImages';

// ─── Constants ────────────────────────────────────────────────────────────────
const ACTION_META = {
    direct_seed:  { icon: '🌱', color: '#C8E6C9', textColor: '#1B5E20', label: 'Seed' },
    seed_start:   { icon: '🪴', color: '#DCEDC8', textColor: '#33691E', label: 'Seed Indoors' },
    transplant:   { icon: '🌿', color: '#FFF9C4', textColor: '#F57F17', label: 'Transplant' },
    harvest:      { icon: '✂️', color: '#FFCCBC', textColor: '#BF360C', label: 'Harvest' },
    cover_crop:   { icon: '🌾', color: '#F5CBA7', textColor: '#784212', label: 'Cover Crop' },
    DEFAULT:      { icon: '📋', color: '#E0E0E0', textColor: '#424242', label: 'Task' },
};

function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatDayLabel(iso) {
    const d = new Date(iso);
    const diff = Math.round((d - today()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatShortDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Stage Progress Bar ────────────────────────────────────────────────────────
function StageBar({ pct, urgent }) {
    const clamped = Math.min(pct, 100);
    const color = urgent ? '#C62828' : pct > 85 ? '#F57F17' : pct > 60 ? '#388E3C' : Colors.primaryGreen;
    return (
        <View style={bar.track}>
            <View style={[bar.fill, { width: `${clamped}%`, backgroundColor: color }]} />
        </View>
    );
}

const bar = StyleSheet.create({
    track: { height: 6, backgroundColor: 'rgba(45,79,30,0.1)', borderRadius: 3, overflow: 'hidden', marginTop: 6 },
    fill: { height: 6, borderRadius: 3 },
});

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, count }) {
    return (
        <View style={s.sectionHeader}>
            <Text style={s.sectionIcon}>{icon}</Text>
            <Text style={s.sectionTitle}>{title}</Text>
            {count != null && (
                <View style={s.countBadge}>
                    <Text style={s.countText}>{count}</Text>
                </View>
            )}
        </View>
    );
}

// ─── Growing Now Card ─────────────────────────────────────────────────────────
function GrowingNowCard({ item }) {
    const { bedNum, succession, stage } = item;
    const img = CROP_IMAGES[succession.crop_id];
    return (
        <View style={[s.growCard, stage.urgent && s.growCardUrgent]}>
            {img
                ? <Image source={img} style={s.growImg} resizeMode="cover" />
                : <View style={s.growImgPlaceholder}><Text style={{ fontSize: 28 }}>{succession.emoji ?? '🌱'}</Text></View>
            }
            <View style={s.growBody}>
                <View style={s.growTopRow}>
                    <Text style={s.growName} numberOfLines={1}>{succession.crop_name ?? succession.crop_id}</Text>
                    <View style={[s.stageBadge, stage.urgent && s.stageBadgeUrgent]}>
                        <Text style={[s.stageBadgeText, stage.urgent && s.stageBadgeTextUrgent]}>
                            {stage.badge}
                        </Text>
                    </View>
                </View>
                <Text style={s.growBed}>Bed {bedNum} · Day {stage.daysInGround} of {succession.dtm}d</Text>
                <StageBar pct={stage.pct} urgent={stage.urgent} />
                <Text style={s.growTip} numberOfLines={3}>{stage.tip}</Text>
            </View>
        </View>
    );
}

// ─── Week Task Pill ───────────────────────────────────────────────────────────
function WeekTaskPill({ entry }) {
    const meta = ACTION_META[entry.action] ?? ACTION_META[entry.plan_entry_type] ?? ACTION_META.DEFAULT;
    return (
        <View style={[s.weekPill, { backgroundColor: meta.color }]}>
            <Text style={s.weekPillIcon}>{meta.icon}</Text>
            <View style={s.weekPillBody}>
                <Text style={[s.weekPillLabel, { color: meta.textColor }]}>{meta.label}</Text>
                <Text style={s.weekPillCrop} numberOfLines={1}>{entry.crop_name}</Text>
                <Text style={s.weekPillDate}>{formatDayLabel(entry.entry_date)} · Bed {entry.bed_number}</Text>
            </View>
        </View>
    );
}

// ─── Coming Up Row ────────────────────────────────────────────────────────────
function ComingUpRow({ entry }) {
    const meta = ACTION_META[entry.action] ?? ACTION_META[entry.plan_entry_type] ?? ACTION_META.DEFAULT;
    return (
        <View style={s.upRow}>
            <Text style={s.upIcon}>{meta.icon}</Text>
            <View style={s.upBody}>
                <Text style={s.upCrop} numberOfLines={1}>{entry.crop_name}</Text>
                <Text style={s.upSub}>{meta.label} · Bed {entry.bed_number}</Text>
            </View>
            <Text style={s.upDate}>{formatShortDate(entry.entry_date)}</Text>
        </View>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptySection({ icon, message }) {
    return (
        <View style={s.emptySection}>
            <Text style={s.emptyIcon}>{icon}</Text>
            <Text style={s.emptyMsg}>{message}</Text>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation, route }) {
    // params OR loaded from persistence
    const [farmProfile, setFarmProfile] = useState(route?.params?.farmProfile ?? null);
    const [bedSuccessions, setBedSuccessions] = useState(route?.params?.bedSuccessions ?? null);
    const [calendarEntries, setCalendarEntries] = useState([]);
    const [activeCrops, setActiveCrops] = useState([]);
    const [loading, setLoading] = useState(true);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useFocusEffect(useCallback(() => {
        // If not passed as params, try loading from persistence
        let fp = farmProfile;
        let bs = bedSuccessions;
        if (!fp || !bs) {
            const saved = loadSavedPlan();
            if (saved) {
                fp = saved.farmProfile;
                bs = saved.bedSuccessions;
                setFarmProfile(fp);
                setBedSuccessions(bs);
            }
        }

        if (!bs || Object.keys(bs).length === 0) {
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const allBeds = Object.entries(bs).map(([num, succs]) => ({
                    bed_number: parseInt(num),
                    successions: succs ?? [],
                }));
                const entries = await generateFullCalendar(allBeds, fp);
                setCalendarEntries(entries);
                setActiveCrops(getActiveCrops(bs, today()));
            } catch (e) {
                console.warn('[Dashboard] Calendar generation failed:', e);
            } finally {
                setLoading(false);
                Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
            }
        })();
    }, []));

    // ── Derived data ──────────────────────────────────────────────────────────
    const now = today();
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    const twoWeekEnd = new Date(now); twoWeekEnd.setDate(now.getDate() + 14);

    const thisWeekEntries = calendarEntries.filter(e => {
        if (!e.entry_date) return false;
        const d = new Date(e.entry_date);
        return d >= now && d <= weekEnd;
    }).slice(0, 8);

    const comingUpEntries = calendarEntries.filter(e => {
        if (!e.entry_date) return false;
        const d = new Date(e.entry_date);
        return d > weekEnd && d <= twoWeekEnd;
    }).slice(0, 10);

    const farmName = farmProfile?.farmName ?? farmProfile?.address ?? 'Your Farm';
    const todayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={s.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={s.headerText}>
                    <Text style={s.headerSub}>{todayLabel.toUpperCase()}</Text>
                    <Text style={s.headerTitle} numberOfLines={1}>{farmName}</Text>
                </View>
                <TouchableOpacity
                    style={s.workspaceBtn}
                    onPress={() => navigation.navigate('BedWorkspace', {
                        farmProfile,
                        bedSuccessions,
                    })}
                >
                    <Text style={s.workspaceBtnText}>Beds →</Text>
                </TouchableOpacity>
            </View>

            <Animated.ScrollView
                style={{ opacity: fadeAnim, flex: 1 }}
                contentContainerStyle={s.scroll}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={s.loadingWrap}>
                        <Text style={s.loadingText}>Loading your season…</Text>
                    </View>
                ) : (
                    <>
                        {/* ── Section 1: This Week ─────────────────────────── */}
                        <SectionHeader icon="📅" title="This Week" count={thisWeekEntries.length} />
                        {thisWeekEntries.length > 0 ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.weekScroll}>
                                {thisWeekEntries.map((e, i) => <WeekTaskPill key={i} entry={e} />)}
                            </ScrollView>
                        ) : (
                            <EmptySection icon="🌤️" message="No seeding or transplanting tasks this week. Keep up the great work!" />
                        )}

                        {/* ── Section 2: Growing Now ───────────────────────── */}
                        <SectionHeader icon="🌿" title="Growing Now" count={activeCrops.length} />
                        {activeCrops.length > 0 ? (
                            <View style={s.growList}>
                                {activeCrops.slice(0, 12).map((item, i) => (
                                    <GrowingNowCard key={i} item={item} />
                                ))}
                            </View>
                        ) : (
                            <EmptySection icon="🌱" message="No crops currently in-ground. Head to Bed Workspace to start planting!" />
                        )}

                        {/* ── Section 3: Coming Up ─────────────────────────── */}
                        {comingUpEntries.length > 0 && (
                            <>
                                <SectionHeader icon="📆" title="Coming Up (Next 2 Weeks)" count={comingUpEntries.length} />
                                <View style={s.upList}>
                                    {comingUpEntries.map((e, i) => <ComingUpRow key={i} entry={e} />)}
                                </View>
                            </>
                        )}

                        {/* ── Footer spacer ── */}
                        <View style={{ height: 40 }} />
                    </>
                )}
            </Animated.ScrollView>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F2EA' },

    // Header
    header: {
        backgroundColor: Colors.deepForest ?? '#1A2E0F',
        flexDirection: 'row', alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 54 : 16,
        paddingBottom: 14, paddingHorizontal: Spacing.md, gap: Spacing.sm,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backArrow: { fontSize: 28, color: '#FFF8F0', lineHeight: 32 },
    headerText: { flex: 1 },
    headerSub: { fontSize: 9, fontWeight: '700', color: 'rgba(255,248,240,0.55)', letterSpacing: 1.5 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFF8F0', marginTop: 1 },
    workspaceBtn: {
        backgroundColor: 'rgba(255,248,240,0.15)',
        borderRadius: Radius.full, paddingVertical: 7, paddingHorizontal: 14,
        borderWidth: 1, borderColor: 'rgba(255,248,240,0.25)',
    },
    workspaceBtnText: { fontSize: 12, color: '#FFF8F0', fontWeight: '700' },

    scroll: { paddingTop: Spacing.md, paddingBottom: Spacing.xl },

    // Section header
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: Spacing.md, marginTop: Spacing.lg, marginBottom: Spacing.sm, gap: 6,
    },
    sectionIcon: { fontSize: 17 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.primaryGreen, flex: 1 },
    countBadge: {
        backgroundColor: Colors.primaryGreen, borderRadius: Radius.full,
        paddingHorizontal: 8, paddingVertical: 2,
    },
    countText: { fontSize: 11, color: '#FFF8F0', fontWeight: '800' },

    // Week pills (horizontal scroll)
    weekScroll: { paddingHorizontal: Spacing.md, gap: 10, paddingBottom: 4 },
    weekPill: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        borderRadius: Radius.md, padding: 10, minWidth: 140, maxWidth: 180,
    },
    weekPillIcon: { fontSize: 20, marginTop: 1 },
    weekPillBody: { flex: 1, gap: 2 },
    weekPillLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    weekPillCrop: { fontSize: 13, fontWeight: '700', color: Colors.darkText },
    weekPillDate: { fontSize: 10, color: Colors.mutedText },

    // Growing now
    growList: { marginHorizontal: Spacing.md, gap: 10 },
    growCard: {
        flexDirection: 'row', gap: 12, backgroundColor: '#FAFAF7',
        borderRadius: Radius.md, padding: 12,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
        ...Shadows.card,
    },
    growCardUrgent: {
        borderColor: '#EF5350', backgroundColor: '#FFF8F8',
    },
    growImg: { width: 60, height: 60, borderRadius: 10 },
    growImgPlaceholder: {
        width: 60, height: 60, borderRadius: 10,
        backgroundColor: 'rgba(45,79,30,0.07)',
        alignItems: 'center', justifyContent: 'center',
    },
    growBody: { flex: 1, gap: 2 },
    growTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    growName: { fontSize: 14, fontWeight: '800', color: Colors.primaryGreen, flex: 1 },
    stageBadge: {
        backgroundColor: 'rgba(45,79,30,0.08)', borderRadius: Radius.full,
        paddingHorizontal: 7, paddingVertical: 2,
    },
    stageBadgeUrgent: { backgroundColor: '#FFCDD2' },
    stageBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.primaryGreen },
    stageBadgeTextUrgent: { color: '#C62828' },
    growBed: { fontSize: 10, color: Colors.mutedText },
    growTip: { fontSize: 11.5, color: Colors.darkText, lineHeight: 16, marginTop: 6 },

    // Coming up
    upList: {
        marginHorizontal: Spacing.md, backgroundColor: '#FAFAF7',
        borderRadius: Radius.md, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
    },
    upRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 10, paddingHorizontal: 14,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.06)',
    },
    upIcon: { fontSize: 18, width: 24, textAlign: 'center' },
    upBody: { flex: 1 },
    upCrop: { fontSize: 13, fontWeight: '700', color: Colors.darkText },
    upSub: { fontSize: 10, color: Colors.mutedText, marginTop: 1 },
    upDate: { fontSize: 12, fontWeight: '700', color: Colors.primaryGreen },

    // Empty state
    emptySection: {
        marginHorizontal: Spacing.md, alignItems: 'center', paddingVertical: 20,
        backgroundColor: 'rgba(45,79,30,0.04)', borderRadius: Radius.md,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.08)', gap: 6,
    },
    emptyIcon: { fontSize: 28 },
    emptyMsg: { fontSize: 12, color: Colors.mutedText, textAlign: 'center', paddingHorizontal: 20, lineHeight: 18 },

    // Loading
    loadingWrap: { marginTop: 80, alignItems: 'center' },
    loadingText: { fontSize: 14, color: Colors.mutedText },
});
