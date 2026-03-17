/**
 * SeasonPassScreen.js
 * ═══════════════════
 * CSA Season Pass Planner — answers the farmer's core question:
 * "How many shares can I sell, what does each box contain, and
 *  will my farm produce enough to fulfill every member all season?"
 *
 * Sections:
 *   1. Pass Setup     — share count, frequency, weeks, price/share
 *   2. Box Contents   — week-by-week what's in each share box
 *   3. Season Summary — gross revenue + crop fulfillment check
 *
 * Data sources:
 *   - localStorage (bedSuccessions from BedWorkspace & FarmDesigner)
 *   - crops.json (csa_lbs_per_share, yield data)
 *   - yieldCalculator (buildMonthlyForecast)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Animated, Platform, Clipboard, TextInput,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import cropData from '../data/crops.json';

const CROPS_MAP = Object.fromEntries(cropData.crops.map(c => [c.id, c]));

const FREQ_OPTIONS = [
    { label: 'Weekly', key: 'weekly', divisor: 1 },
    { label: 'Bi-weekly', key: 'biweekly', divisor: 2 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(n) {
    return n?.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) ?? '$0';
}

function fmtLbs(n) {
    return `${(n ?? 0).toFixed(1)} lbs`;
}

function weekLabel(weekNum, seasonStart) {
    if (!seasonStart) return `Wk ${weekNum}`;
    const d = new Date(seasonStart + 'T12:00:00');
    d.setDate(d.getDate() + (weekNum - 1) * 7);
    const mo = d.toLocaleString('default', { month: 'short' });
    return `${mo} ${d.getDate()}`;
}

// ─── Data loader ─────────────────────────────────────────────────────────────
// Reads all localStorage sources (same pattern as SeedOrderScreen)

function loadAllSuccessions() {
    const allSucc = {}; // { cropId: { name, totalLbs, weeksActive: Set, csaLbsPerShare } }

    function process(successions) {
        if (!successions || typeof successions !== 'object') return;
        Object.values(successions).forEach(bedSuccs => {
            if (!Array.isArray(bedSuccs)) return;
            bedSuccs.forEach(succ => {
                if (!succ?.crop_id) return;
                const crop = CROPS_MAP[succ.crop_id];
                if (!crop) return;

                const start = succ.start_date ? new Date(succ.start_date + 'T12:00:00') : null;
                const end   = succ.end_date   ? new Date(succ.end_date   + 'T12:00:00') : null;
                const bedLengthFt = succ.bed_length_ft ?? 50;
                const yieldPer100ft = crop.yield_lbs_per_100ft ?? 0;
                const totalLbs = (yieldPer100ft * bedLengthFt) / 100;

                if (!allSucc[crop.id]) {
                    allSucc[crop.id] = {
                        id: crop.id,
                        name: crop.name,
                        totalLbs: 0,
                        csaLbsPerShare: crop.csa_lbs_per_share ?? 0.5,
                        csaShareUnit: crop.csa_share_unit ?? 'lb',
                        category: crop.category ?? 'Other',
                        startDates: [],
                        endDates: [],
                    };
                }
                allSucc[crop.id].totalLbs += totalLbs;
                if (start) allSucc[crop.id].startDates.push(start);
                if (end)   allSucc[crop.id].endDates.push(end);
            });
        });
    }

    try {
        // 8-Bed Workspace
        const raw8 = localStorage.getItem('acrelogic_bed_successions');
        if (raw8) process(JSON.parse(raw8));
    } catch { }

    try {
        // Farm Designer blocks
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('acrelogic_block_successions_')) {
                const raw = localStorage.getItem(key);
                if (raw) process(JSON.parse(raw));
            }
        }
    } catch { }

    return Object.values(allSucc).filter(c => c.totalLbs > 0);
}

// Given crop list + pass config, compute week-by-week box contents
function buildWeeklyBoxes(crops, shareCount, frequencyDivisor, seasonWeeks) {
    const deliveryWeeks = Math.ceil(seasonWeeks / frequencyDivisor);
    const weeks = [];

    for (let w = 1; w <= deliveryWeeks; w++) {
        const items = [];
        let totalLbsThisWeek = 0;

        crops.forEach(crop => {
            // Distribute crop's total lbs across the delivery weeks
            const lbsPerDelivery = crop.totalLbs / deliveryWeeks;
            const lbsPerShare = lbsPerDelivery / shareCount;

            if (lbsPerShare >= 0.05) { // Only include if meaningfully present
                items.push({
                    cropId: crop.id,
                    cropName: crop.name,
                    lbsPerShare: Math.round(lbsPerShare * 100) / 100,
                    totalLbsNeeded: Math.round(lbsPerDelivery * 10) / 10,
                    csaShareUnit: crop.csaShareUnit,
                });
                totalLbsThisWeek += lbsPerShare;
            }
        });

        // Sort by lbs desc (most prominent items first)
        items.sort((a, b) => b.lbsPerShare - a.lbsPerShare);

        const boxScore = totalLbsThisWeek >= 6 ? 'Full'
            : totalLbsThisWeek >= 3 ? 'Good' : 'Light';

        weeks.push({ week: w, items, totalLbs: totalLbsThisWeek, boxScore });
    }

    return weeks;
}

// Shortfall check per crop
function buildFulfillmentCheck(crops, shareCount, seasonWeeks, frequencyDivisor) {
    const deliveryWeeks = Math.ceil(seasonWeeks / frequencyDivisor);
    return crops.map(crop => {
        const lbsNeeded = crop.csaLbsPerShare * shareCount * deliveryWeeks;
        const pct = crop.totalLbs > 0 ? crop.totalLbs / lbsNeeded : 0;
        const status = pct >= 1.0 ? 'ok' : pct >= 0.75 ? 'tight' : 'short';
        return {
            cropName: crop.name,
            farmLbs: Math.round(crop.totalLbs),
            neededLbs: Math.round(lbsNeeded),
            pct: pct,
            status,
        };
    }).sort((a, b) => a.pct - b.pct); // worst first
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfigRow({ label, children }) {
    return (
        <View style={styles.configRow}>
            <Text style={styles.configLabel}>{label}</Text>
            <View style={styles.configControl}>{children}</View>
        </View>
    );
}

function BoxScoreBadge({ score }) {
    const bg = score === 'Full' ? '#A5D6A7' : score === 'Good' ? '#FFF176' : '#FFCC80';
    const color = score === 'Full' ? '#1B5E20' : score === 'Good' ? '#5D4037' : '#BF360C';
    return (
        <View style={[styles.boxScoreBadge, { backgroundColor: bg }]}>
            <Text style={[styles.boxScoreText, { color }]}>{score}</Text>
        </View>
    );
}

function FulfillmentBar({ item }) {
    const pct = Math.min(item.pct, 1.0);
    const barColor = item.status === 'ok' ? '#4CAF50' : item.status === 'tight' ? '#FF9800' : '#F44336';
    const icon = item.status === 'ok' ? '✅' : item.status === 'tight' ? '⚠️' : '❌';
    return (
        <View style={styles.fulfillRow}>
            <Text style={styles.fulfillIcon}>{icon}</Text>
            <View style={styles.fulfillMid}>
                <View style={styles.fulfillNameRow}>
                    <Text style={styles.fulfillName}>{item.cropName}</Text>
                    <Text style={styles.fulfillNums}>
                        {item.farmLbs} / {item.neededLbs} lbs
                    </Text>
                </View>
                <View style={styles.fulfillTrack}>
                    <View style={[styles.fulfillFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
                </View>
            </View>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SeasonPassScreen({ navigation, route }) {
    const { farmProfile } = route?.params ?? {};

    const fadeAnim  = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    const [crops, setCrops]             = useState([]);
    const [shareCount, setShareCount]   = useState(20);
    const [shareCountText, setShareCountText] = useState('20');
    const [frequency, setFrequency]     = useState('weekly');
    const [seasonWeeks, setSeasonWeeks] = useState(24);
    const [seasonWeeksText, setSeasonWeeksText] = useState('24');
    const [pricePerShare, setPricePerShare] = useState(500);
    const [priceText, setPriceText]     = useState('500');
    const [expandedWeek, setExpandedWeek] = useState(1);
    const [copied, setCopied]           = useState(false);
    const [activeTab, setActiveTab]     = useState('boxes'); // 'boxes' | 'fulfillment'

    useEffect(() => {
        const loaded = loadAllSuccessions();
        setCrops(loaded);
        Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 450, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
        ]).start();
    }, []);

    const freqObj = FREQ_OPTIONS.find(f => f.key === frequency) ?? FREQ_OPTIONS[0];
    const deliveryWeeks = Math.ceil(seasonWeeks / freqObj.divisor);
    const weeklyBoxes = crops.length > 0
        ? buildWeeklyBoxes(crops, shareCount, freqObj.divisor, seasonWeeks)
        : [];
    const fulfillment = crops.length > 0
        ? buildFulfillmentCheck(crops, shareCount, seasonWeeks, freqObj.divisor)
        : [];

    const grossRevenue = shareCount * pricePerShare;
    const totalLbsNeeded = crops.reduce((s, c) =>
        s + c.csaLbsPerShare * shareCount * deliveryWeeks, 0);
    const shortfallCrops = fulfillment.filter(f => f.status === 'short').length;
    const avgBoxLbs = weeklyBoxes.length > 0
        ? weeklyBoxes.reduce((s, w) => s + w.totalLbs, 0) / weeklyBoxes.length
        : 0;

    const handleCopy = () => {
        const lines = [
            `🎟 Season Pass Plan — ${farmProfile?.farm_name ?? 'My Farm'}`,
            `${shareCount} shares · ${frequency === 'weekly' ? 'Weekly' : 'Bi-weekly'} · ${seasonWeeks} weeks · $${pricePerShare}/share`,
            `Gross Revenue: ${fmtCurrency(grossRevenue)}`,
            '',
            '── Per-Box Weekly Averages ──',
            ...crops.map(c => {
                const lbsPerBox = c.totalLbs / deliveryWeeks / shareCount;
                return `  ${c.name}: ${lbsPerBox.toFixed(2)} lbs/share`;
            }),
            '',
            '── Fulfillment Status ──',
            ...fulfillment.map(f =>
                `  ${f.status === 'ok' ? '✅' : f.status === 'tight' ? '⚠️' : '❌'} ${f.cropName}: ${f.farmLbs} / ${f.neededLbs} lbs`
            ),
        ].join('\n');
        Clipboard.setString(lines);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const empty = crops.length === 0;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>FARM PLANNING · PRO</Text>
                    <Text style={styles.heading}>Season Pass</Text>
                </View>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                    <Text style={styles.copyBtnText}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
                </TouchableOpacity>
            </View>

            <Animated.ScrollView
                style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Section 1: Pass Setup ─────────────────────────────── */}
                <View style={[styles.card, Shadows.card]}>
                    <Text style={styles.cardTitle}>🎟 Pass Configuration</Text>

                    <ConfigRow label="Shares to sell">
                        <TextInput
                            style={styles.numInput}
                            value={shareCountText}
                            onChangeText={t => {
                                setShareCountText(t);
                                const n = parseInt(t);
                                if (!isNaN(n) && n > 0) setShareCount(n);
                            }}
                            keyboardType="numeric"
                            selectTextOnFocus
                        />
                    </ConfigRow>

                    <ConfigRow label="Delivery frequency">
                        <View style={styles.segmentRow}>
                            {FREQ_OPTIONS.map(f => (
                                <TouchableOpacity
                                    key={f.key}
                                    style={[styles.segBtn, frequency === f.key && styles.segBtnActive]}
                                    onPress={() => setFrequency(f.key)}
                                >
                                    <Text style={[styles.segBtnText, frequency === f.key && styles.segBtnTextActive]}>
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ConfigRow>

                    <ConfigRow label="Season length (weeks)">
                        <TextInput
                            style={styles.numInput}
                            value={seasonWeeksText}
                            onChangeText={t => {
                                setSeasonWeeksText(t);
                                const n = parseInt(t);
                                if (!isNaN(n) && n > 0) setSeasonWeeks(n);
                            }}
                            keyboardType="numeric"
                            selectTextOnFocus
                        />
                    </ConfigRow>

                    <ConfigRow label="Price per share ($)">
                        <View style={styles.priceInputRow}>
                            <Text style={styles.dollarSign}>$</Text>
                            <TextInput
                                style={[styles.numInput, { minWidth: 80 }]}
                                value={priceText}
                                onChangeText={t => {
                                    setPriceText(t);
                                    const n = parseFloat(t);
                                    if (!isNaN(n) && n > 0) setPricePerShare(n);
                                }}
                                keyboardType="numeric"
                                selectTextOnFocus
                            />
                        </View>
                    </ConfigRow>
                </View>

                {/* ── Revenue summary banner ────────────────────────────── */}
                <View style={[styles.revenueBanner, Shadows.card]}>
                    <View style={styles.revenueCol}>
                        <Text style={styles.revenueLbl}>Projected Revenue</Text>
                        <Text style={styles.revenueNum}>{fmtCurrency(grossRevenue)}</Text>
                    </View>
                    <View style={styles.revenueDivider} />
                    <View style={styles.revenueCol}>
                        <Text style={styles.revenueLbl}>{deliveryWeeks} Deliveries</Text>
                        <Text style={styles.revenueNum2}>{frequency === 'weekly' ? 'Weekly' : 'Bi-weekly'}</Text>
                    </View>
                    <View style={styles.revenueDivider} />
                    <View style={styles.revenueCol}>
                        <Text style={styles.revenueLbl}>Avg Box Size</Text>
                        <Text style={styles.revenueNum2}>{avgBoxLbs.toFixed(1)} lbs</Text>
                    </View>
                    {shortfallCrops > 0 && (
                        <>
                            <View style={styles.revenueDivider} />
                            <View style={styles.revenueCol}>
                                <Text style={[styles.revenueLbl, { color: '#F44336' }]}>Shortfalls</Text>
                                <Text style={[styles.revenueNum2, { color: '#F44336' }]}>{shortfallCrops} crops</Text>
                            </View>
                        </>
                    )}
                </View>

                {empty ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyIcon}>🌱</Text>
                        <Text style={styles.emptyTitle}>No crops planned yet</Text>
                        <Text style={styles.emptyBody}>
                            Set up crops in your Bed Workspace or Farm Designer first, then come back here to plan your Season Pass.
                        </Text>
                        <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.goBack()}>
                            <Text style={styles.emptyBtnText}>← Back to Workspace</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {/* ── Tab switcher ─────────────────────────────────── */}
                        <View style={styles.tabRow}>
                            <TouchableOpacity
                                style={[styles.tabBtn, activeTab === 'boxes' && styles.tabBtnActive]}
                                onPress={() => setActiveTab('boxes')}
                            >
                                <Text style={[styles.tabBtnText, activeTab === 'boxes' && styles.tabBtnTextActive]}>
                                    📦 Box Contents
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tabBtn, activeTab === 'fulfillment' && styles.tabBtnActive]}
                                onPress={() => setActiveTab('fulfillment')}
                            >
                                <Text style={[styles.tabBtnText, activeTab === 'fulfillment' && styles.tabBtnTextActive]}>
                                    {shortfallCrops > 0 ? `⚠️ Fulfillment (${shortfallCrops})` : '✅ Fulfillment'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── Section 2: Box Contents ───────────────────────── */}
                        {activeTab === 'boxes' && (
                            <View style={styles.boxSection}>
                                <Text style={styles.sectionNote}>
                                    Tap any delivery week to see its full box contents.
                                </Text>
                                {weeklyBoxes.map(w => (
                                    <View key={w.week} style={[styles.weekCard, Shadows.card]}>
                                        <TouchableOpacity
                                            style={styles.weekHeader}
                                            onPress={() => setExpandedWeek(expandedWeek === w.week ? null : w.week)}
                                            activeOpacity={0.8}
                                        >
                                            <View style={[
                                                styles.weekNumBadge,
                                                w.boxScore === 'Full' && styles.weekNumFull,
                                                w.boxScore === 'Good' && styles.weekNumGood,
                                                w.boxScore === 'Light' && styles.weekNumLight,
                                            ]}>
                                                <Text style={styles.weekNumText}>W{w.week}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.weekTitle}>Delivery {w.week}</Text>
                                                <Text style={styles.weekSub}>
                                                    {w.items.length} crops · {w.totalLbs.toFixed(1)} lbs/share
                                                </Text>
                                            </View>
                                            <BoxScoreBadge score={w.boxScore} />
                                            <Text style={styles.chevron}>
                                                {expandedWeek === w.week ? '▲' : '▼'}
                                            </Text>
                                        </TouchableOpacity>

                                        {expandedWeek === w.week && (
                                            <View style={styles.weekBody}>
                                                {w.items.length === 0 ? (
                                                    <Text style={styles.weekEmpty}>
                                                        No crops available this delivery
                                                    </Text>
                                                ) : (
                                                    w.items.map((item, i) => (
                                                        <View key={i} style={styles.boxItemRow}>
                                                            <Text style={styles.boxItemName}>{item.cropName}</Text>
                                                            <Text style={styles.boxItemLbs}>
                                                                {item.lbsPerShare.toFixed(2)} lbs/share
                                                            </Text>
                                                            <Text style={styles.boxItemTotal}>
                                                                {item.totalLbsNeeded} lbs total
                                                            </Text>
                                                        </View>
                                                    ))
                                                )}
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* ── Section 3: Fulfillment Check ─────────────────── */}
                        {activeTab === 'fulfillment' && (
                            <View style={[styles.card, Shadows.card]}>
                                <Text style={styles.cardTitle}>Season Fulfillment Check</Text>
                                <Text style={styles.fulfillSubtitle}>
                                    Can your farm produce enough of each crop to fill {shareCount} shares × {deliveryWeeks} deliveries?
                                </Text>
                                {fulfillment.map((item, i) => (
                                    <FulfillmentBar key={i} item={item} />
                                ))}
                                {shortfallCrops > 0 && (
                                    <View style={styles.shortfallNote}>
                                        <Text style={styles.shortfallNoteText}>
                                            ⚠️ {shortfallCrops} crop{shortfallCrops > 1 ? 's' : ''} may not have enough yield to fill all {shareCount} shares. Consider reducing share count, adding beds, or substituting those crops.
                                        </Text>
                                    </View>
                                )}
                                {shortfallCrops === 0 && (
                                    <View style={styles.successNote}>
                                        <Text style={styles.successNoteText}>
                                            ✅ Your farm plan can fulfill all {shareCount} shares for the full {seasonWeeks}-week season!
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </>
                )}

                <View style={{ height: 48 }} />
            </Animated.ScrollView>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0EDE6' },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen, zIndex: 10,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    copyBtn: {
        backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 7, paddingHorizontal: 13,
        borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    },
    copyBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.xs },

    scroll: { padding: Spacing.lg, gap: Spacing.md },

    // Cards
    card: { backgroundColor: '#FAFAF7', borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
    cardTitle: { fontSize: Typography.sm, fontWeight: '800', color: Colors.primaryGreen, marginBottom: 4 },

    // Config rows
    configRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.07)' },
    configLabel: { fontSize: Typography.sm, color: Colors.darkText, fontWeight: Typography.medium, flex: 1 },
    configControl: { alignItems: 'flex-end' },
    numInput: {
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: Radius.sm,
        paddingVertical: 7, paddingHorizontal: 12, fontSize: Typography.sm,
        color: Colors.primaryGreen, fontWeight: Typography.bold, textAlign: 'right',
        backgroundColor: '#FFF', minWidth: 60,
    },
    segmentRow: { flexDirection: 'row', gap: 6 },
    segBtn: {
        paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.full,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', backgroundColor: '#FFF',
    },
    segBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    segBtnText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.bold },
    segBtnTextActive: { color: Colors.cream },
    priceInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dollarSign: { fontSize: Typography.sm, color: Colors.primaryGreen, fontWeight: Typography.bold },

    // Revenue banner
    revenueBanner: {
        backgroundColor: Colors.primaryGreen, borderRadius: Radius.lg, padding: Spacing.md,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    },
    revenueCol: { alignItems: 'center', gap: 2, flex: 1 },
    revenueDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
    revenueLbl: { fontSize: 9, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
    revenueNum: { fontSize: 22, fontWeight: '900', color: Colors.cream, letterSpacing: -0.5 },
    revenueNum2: { fontSize: Typography.md, fontWeight: '800', color: Colors.cream },

    // Empty state
    emptyCard: { backgroundColor: '#FAFAF7', borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, ...Shadows.card },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.primaryGreen },
    emptyBody: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center', lineHeight: 20 },
    emptyBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radius.md, marginTop: 8 },
    emptyBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.sm },

    // Tabs
    tabRow: { flexDirection: 'row', gap: 8 },
    tabBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: '#FFF', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.15)' },
    tabBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    tabBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },
    tabBtnTextActive: { color: Colors.cream },

    // Box contents
    boxSection: { gap: Spacing.sm },
    sectionNote: { fontSize: Typography.xs, color: Colors.mutedText, textAlign: 'center' },
    weekCard: { backgroundColor: '#FAFAF7', borderRadius: Radius.md, overflow: 'hidden' },
    weekHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
    weekNumBadge: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9' },
    weekNumFull: { backgroundColor: '#A5D6A7' },
    weekNumGood: { backgroundColor: '#FFF176' },
    weekNumLight: { backgroundColor: '#FFCC80' },
    weekNumText: { fontSize: 10, fontWeight: '900', color: Colors.primaryGreen },
    weekTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    weekSub: { fontSize: Typography.xs, color: Colors.mutedText },
    boxScoreBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: Radius.full },
    boxScoreText: { fontSize: 10, fontWeight: '800' },
    chevron: { fontSize: Typography.xs, color: Colors.mutedText, width: 14, textAlign: 'center' },

    weekBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.08)' },
    weekEmpty: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic', textAlign: 'center', padding: 8 },
    boxItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
    boxItemName: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    boxItemLbs: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.burntOrange, width: 90, textAlign: 'right' },
    boxItemTotal: { fontSize: Typography.xs, color: Colors.mutedText, width: 68, textAlign: 'right' },

    // Fulfillment
    fulfillSubtitle: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 18, marginBottom: 8 },
    fulfillRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
    fulfillIcon: { fontSize: 16, width: 22 },
    fulfillMid: { flex: 1, gap: 3 },
    fulfillNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fulfillName: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen, flex: 1 },
    fulfillNums: { fontSize: Typography.xs, color: Colors.mutedText },
    fulfillTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(45,79,30,0.1)', overflow: 'hidden' },
    fulfillFill: { height: '100%', borderRadius: 3 },

    shortfallNote: { marginTop: 8, backgroundColor: '#FFF3E0', borderRadius: Radius.sm, padding: Spacing.sm, borderLeftWidth: 3, borderLeftColor: '#FF9800' },
    shortfallNoteText: { fontSize: Typography.xs, color: '#E65100', lineHeight: 17 },
    successNote: { marginTop: 8, backgroundColor: '#E8F5E9', borderRadius: Radius.sm, padding: Spacing.sm, borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
    successNoteText: { fontSize: Typography.xs, color: '#1B5E20', lineHeight: 17 },
});
