/**
 * AcreLogic Yield Summary Screen
 * ================================
 * Shows the full farm revenue breakdown:
 *   - Season revenue card (low / mid / high)
 *   - Revenue by bed (stacked bar)
 *   - Top crops by revenue
 *   - Per-bed succession breakdown
 *   - Export buttons (PDF + CSV)
 */
import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
    Alert,
    Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { calculateFarmYield, buildWeeklyBoxSchedule, CSA_BOX_SLOTS, harvestTerm } from '../services/yieldCalculator';
import { generateFullCalendar } from '../services/calendarGenerator';
import { exportPDF, exportCalendarCSV, exportYieldCSV, exportExcel } from '../services/exportService';
import AIAdvisorWidget from '../components/AIAdvisorWidget';
import { fetchOrganicPrice } from '../services/climateService';
import { loadActualHarvests, loadRevenueGoal, saveRevenueGoal, saveSeasonSnapshot } from '../services/persistence';

export default function YieldSummaryScreen({ navigation, route }) {
    const { farmProfile = {}, planId, bedSuccessions = {} } = route?.params ?? {};

    const [yieldData, setYieldData] = useState(null);
    const [calendarEntries, setCalendarEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [csaMemberCount, setCsaMemberCount] = useState(20);
    const [csaStartDate, setCsaStartDate] = useState('');  // YYYY-MM-DD or empty
    const [livePrices, setLivePrices] = useState({});
    const [actualHarvests, setActualHarvests] = useState([]);
    const [revenueGoal, setRevenueGoal] = useState(0);
    const [goalInput, setGoalInput] = useState('');
    const [showGoalInput, setShowGoalInput] = useState(false);
    const [archived, setArchived] = useState(false); // { crop_name: { price_per_lb, source } }

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        computeYield();
    }, []);

    const computeYield = async () => {
        try {
            const allBeds = Object.entries(bedSuccessions).map(([num, succs]) => ({
                bed_number: parseInt(num),
                successions: succs,
            }));

            const [yields, calendar] = await Promise.all([
                calculateFarmYield(allBeds, farmProfile),
                generateFullCalendar(allBeds, farmProfile),
            ]);

            setYieldData(yields);
            setCalendarEntries(calendar);

            // Load actual harvest data and revenue goal
            setActualHarvests(loadActualHarvests());
            const goal = loadRevenueGoal();
            setRevenueGoal(goal);
            if (goal > 0) setGoalInput(String(goal));

            // Fetch live prices in background (non-blocking)
            const cropNames = Object.values(yields.byCrop ?? {}).map(c => c.crop_name).filter(Boolean);
            fetchPricesInBackground(cropNames);

            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }),
            ]).start();
        } catch (err) {
            console.error('[YieldSummary] Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPricesInBackground = async (cropNames) => {
        const results = {};
        await Promise.allSettled(
            cropNames.map(async name => {
                try {
                    const data = await fetchOrganicPrice(name);
                    if (data?.price_per_lb) results[name] = data;
                } catch { /* swallow network errors */ }
            })
        );
        if (Object.keys(results).length > 0) setLivePrices(results);
    };

    const handleExportPDF = async () => {
        if (!yieldData) return;
        setExporting(true);
        try {
            await exportPDF(farmProfile, calendarEntries, yieldData, bedSuccessions);
        } catch (err) {
            Alert.alert('Export Failed', err.message);
        } finally {
            setExporting(false);
        }
    };

    const handleExportCalendarCSV = async () => {
        setExporting(true);
        try {
            await exportCalendarCSV(calendarEntries);
        } catch (err) {
            Alert.alert('Export Failed', err.message);
        } finally {
            setExporting(false);
        }
    };

    const handleExportYieldCSV = async () => {
        if (!yieldData) return;
        setExporting(true);
        try {
            await exportYieldCSV(yieldData);
        } catch (err) {
            Alert.alert('Export Failed', err.message);
        } finally {
            setExporting(false);
        }
    };

    const handleExportExcel = async () => {
        if (!yieldData) return;
        setExporting(true);
        try {
            await exportExcel(farmProfile, calendarEntries, yieldData, bedSuccessions);
        } catch (err) {
            Alert.alert('Export Failed', err.message);
        } finally {
            setExporting(false);
        }
    };

    const totals = yieldData?.totals ?? {};
    const topCrops = totals.top_crops_by_revenue ?? [];
    const byBed = yieldData?.byBed ?? {};
    const byCrop = yieldData?.byCrop ?? {};
    const maxBedRevenue = Math.max(...Object.values(byBed).map(b => b.reduce((s, e) => s + (e.gross_revenue_mid ?? 0), 0)), 1);

    // Week-by-week CSA box schedule
    const allEstimates = Object.values(byBed).flat();
    const weeklySchedule = buildWeeklyBoxSchedule(
        allEstimates,
        csaMemberCount,
        csaStartDate || null,
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.stepLabel}>PLAN SUMMARY</Text>
                    <Text style={styles.heading}>Yield & Revenue</Text>
                </View>
                <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={() => navigation.navigate('HarvestForecast', { farmProfile, bedSuccessions })}
                >
                    <Text style={styles.headerActionText}>📅</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={() => navigation.navigate('FieldJournal', { farmProfile, bedSuccessions })}
                >
                    <Text style={styles.headerActionText}>📓</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={Colors.primaryGreen} size="large" />
                    <Text style={styles.loadingText}>Calculating yields…</Text>
                </View>
            ) : (
                <Animated.ScrollView
                    style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, Platform.OS === 'web' && { overflowY: 'scroll' }]}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Season Revenue Card ───────────────────────────────────────────── */}
                    <View style={[styles.revenueHeroCard, Shadows.card]}>
                        <Text style={styles.revenueHeroLabel}>ESTIMATED SEASON REVENUE</Text>
                        <Text style={styles.revenueHeroRange}>
                            ${fmtNum(totals.total_revenue_low)} – ${fmtNum(totals.total_revenue_high)}
                        </Text>
                        <Text style={styles.revenueHeroMid}>
                            ~${fmtNum(totals.total_revenue_mid)} organic wholesale
                        </Text>
                        <View style={styles.revenueHeroStats}>
                            <StatPill icon="📦" label={`${fmtNum(totals.total_yield_lbs)} lbs est.`} />
                            <StatPill icon="📅" label={`${calendarEntries.length} actions`} />
                            <StatPill icon="🏠" label={`est. ${fmtNum(totals.total_households_served ?? 0)} families/harvest`} />
                        </View>
                    </View>

                    {/* ── CSA Impact ──────────────────────────────────────────────────────── */}
                    <SectionHeader
                        title="CSA Impact"
                        subtitle="Households served per harvest · 4-person household assumption"
                    />
                    <View style={[styles.csaCard, Shadows.card]}>
                        <View style={styles.csaHeaderRow}>
                            <Text style={styles.csaHeaderCrop}>Crop</Text>
                            <Text style={styles.csaHeaderYield}>Yield/bed</Text>
                            <Text style={styles.csaHeaderShare}>Per share</Text>
                            <Text style={styles.csaHeaderFam}>Families</Text>
                        </View>
                        {Object.values(byCrop ?? {})
                            .sort((a, b) => (b.total_yield_lbs ?? 0) - (a.total_yield_lbs ?? 0))
                            .map((crop, idx) => {
                                // Get one sample estimate for this crop's CSA data
                                const sample = Object.values(byBed ?? {}).flat()
                                    .find(e => e.crop_id === crop.crop_id);
                                const lbsPerShare = sample?.csa_lbs_per_share ?? 1.0;
                                const shareUnit = sample?.csa_share_unit ?? 'lb';
                                const avgYieldPerBed = crop.bed_slots > 0
                                    ? Math.round(crop.total_yield_lbs / crop.bed_slots)
                                    : 0;
                                const householdsPerBed = Math.round(avgYieldPerBed / lbsPerShare);
                                return (
                                    <View key={crop.crop_id} style={[styles.csaRow, idx % 2 === 1 && styles.csaRowAlt]}>
                                        <Text style={styles.csaCrop} numberOfLines={1}>{crop.crop_name}</Text>
                                        <Text style={styles.csaYield}>{avgYieldPerBed} lbs</Text>
                                        <Text style={styles.csaShare}>{lbsPerShare} lb{shareUnit !== 'lb' ? `/${shareUnit}` : '/share'}</Text>
                                        <Text style={styles.csaFam}>est. {householdsPerBed}</Text>
                                    </View>
                                );
                            })
                        }
                        <View style={styles.csaFooter}>
                            <Text style={styles.csaFooterText}>
                                Share sizes sourced from Growing Washington, JL Green Farm, Main Street Farms, NC State &amp; UC Davis Extension CSA guides.
                            </Text>
                        </View>
                    </View>

                    {/* ── Weekly Box Schedule ───────────────────────────────────────────── */}
                    <SectionHeader
                        title="📦 Weekly Box Schedule"
                        subtitle="Week-by-week harvest · grouped by box slot · proper box = 5 categories"
                    />

                    {/* CSA controls: start date + member count */}
                    <View style={styles.csaControls}>
                        <View style={styles.csaControlRow}>
                            <Text style={styles.memberSelectorLabel}>CSA Deliveries Start:</Text>
                            <TextInput
                                style={styles.csaDateInput}
                                placeholder="YYYY-MM-DD (e.g. 2025-06-01)"
                                placeholderTextColor={Colors.mutedText}
                                value={csaStartDate}
                                onChangeText={setCsaStartDate}
                                maxLength={10}
                            />
                        </View>
                        <View style={styles.memberSelector}>
                            <Text style={styles.memberSelectorLabel}>CSA Members:</Text>
                            {[10, 20, 30, 50, 100].map(n => (
                                <TouchableOpacity
                                    key={n}
                                    style={[styles.memberBtn, csaMemberCount === n && styles.memberBtnActive]}
                                    onPress={() => setCsaMemberCount(n)}
                                >
                                    <Text style={[styles.memberBtnText, csaMemberCount === n && styles.memberBtnTextActive]}>{n}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {weeklySchedule.length === 0 ? (
                        <View style={[styles.barChartCard, Shadows.card, { alignItems: 'center', paddingVertical: 24 }]}>
                            <Text style={styles.emptyWeekText}>
                                {csaStartDate
                                    ? 'No harvests on/after that CSA start date — try an earlier date'
                                    : 'Add crops to beds to see your harvest calendar'}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekScrollContent}>
                            {weeklySchedule.map((week) => {
                                const ratingColor = week.box_rating === 'Full' ? '#2D4F1E'
                                    : week.box_rating === 'Good' ? '#7B5E2A'
                                        : '#888';
                                const ratingBg = week.box_rating === 'Full' ? '#C8E6C9'
                                    : week.box_rating === 'Good' ? '#FFF9C4'
                                        : '#F5F5F5';

                                const SLOT_ICON = {
                                    'Root': '🥕', 'Greens': '🥬',
                                    'Herb/Allium': '🌿', 'Fruit': '🍅', 'Specialty': '⭐',
                                };

                                return (
                                    <View key={week.week_start} style={[styles.weekCard, Shadows.card]}>
                                        {/* Week header */}
                                        <View style={styles.weekCardHeader}>
                                            <Text style={styles.weekCardDate}>{week.week_label}</Text>
                                            <View style={[styles.weekRatingBadge, { backgroundColor: ratingBg }]}>
                                                <Text style={[styles.weekRatingText, { color: ratingColor }]}>
                                                    {week.box_rating}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.weekCardStat}>
                                            {week.total_lbs} lbs · {week.diversity_score}/5 slots
                                        </Text>
                                        <Text style={styles.weekCardStat}>{week.lbs_per_member} lb/member</Text>

                                        <View style={styles.weekDivider} />

                                        {/* Items grouped by box slot */}
                                        {CSA_BOX_SLOTS.map(slot => {
                                            const slotItems = week.box_categories?.[slot] ?? [];
                                            if (slotItems.length === 0) return null;
                                            return (
                                                <View key={slot} style={styles.weekSlotGroup}>
                                                    <Text style={styles.weekSlotLabel}>
                                                        {SLOT_ICON[slot]} {slot}
                                                    </Text>
                                                    {slotItems.map((item, idx) => (
                                                        <View key={idx} style={styles.weekItem}>
                                                            <Text style={styles.weekItemCrop} numberOfLines={1}>
                                                                {item.crop_name}
                                                            </Text>
                                                            <Text style={styles.weekItemLbs}>{item.lbs_this_harvest} lbs</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            );
                                        })}

                                        {/* Missing slot warning */}
                                        {week.missing_slots?.length > 0 && (
                                            <View style={styles.weekMissingRow}>
                                                <Text style={styles.weekMissingText}>
                                                    Missing: {week.missing_slots.join(', ')}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    )}


                    {/* ── Revenue Bar Chart by Bed ─────────────────────────────────────── */}
                    <SectionHeader title="Revenue by Bed" subtitle="Mid-range estimate" />
                    <View style={[styles.barChartCard, Shadows.card]}>
                        {Array.from({ length: 8 }, (_, i) => i + 1).map(bedNum => {
                            const bedEstimates = byBed[bedNum] ?? [];
                            const bedTotal = bedEstimates.reduce((s, e) => s + (e.gross_revenue_mid ?? 0), 0);
                            const barWidth = maxBedRevenue > 0 ? (bedTotal / maxBedRevenue) * 100 : 0;
                            const primaryCrop = bedEstimates[0];

                            return (
                                <View key={bedNum} style={styles.barRow}>
                                    <Text style={styles.barLabel}>Bed {bedNum}</Text>
                                    <View style={styles.barTrack}>
                                        <View style={[styles.barFill, { width: `${barWidth}%` }]} />
                                    </View>
                                    <Text style={styles.barValue}>{bedTotal > 0 ? `$${fmtNum(bedTotal)}` : '—'}</Text>
                                    <Text style={styles.barCrop} numberOfLines={1}>
                                        {primaryCrop?.crop_name ?? 'Empty'}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>

                    {/* ── Top Crops ────────────────────────────────────────────────────── */}
                    <SectionHeader title="Top Crops" subtitle="By total revenue across all beds" />
                    <View style={[styles.topCropsCard, Shadows.card]}>
                        {topCrops.length === 0 ? (
                            <Text style={styles.emptyText}>No yield data yet. Assign crops to beds first.</Text>
                        ) : (
                            topCrops.map((crop, i) => (
                                <View key={crop.crop_id} style={[styles.topCropRow, i < topCrops.length - 1 && styles.topCropBorder]}>
                                    <View style={styles.topCropRank}>
                                        <Text style={styles.topCropRankText}>#{i + 1}</Text>
                                    </View>
                                    <View style={styles.topCropInfo}>
                                        <Text style={styles.topCropName}>{crop.crop_name}</Text>
                                        <Text style={styles.topCropVariety}>{crop.crop_variety}</Text>
                                        <Text style={styles.topCropDetail}>
                                            {(() => {
                                                // Sum low/high across all bed slots for this crop
                                                const bedEsts = Object.values(byBed ?? {}).flat().filter(e => e.crop_id === crop.crop_id);
                                                const sumLow = bedEsts.reduce((s, e) => s + (e.yield_lbs_low ?? e.estimated_yield_lbs ?? 0), 0);
                                                const sumHigh = bedEsts.reduce((s, e) => s + (e.yield_lbs_high ?? e.estimated_yield_lbs ?? 0), 0);
                                                const yieldStr = sumLow === sumHigh ? `${fmtNum(sumHigh)} lbs` : `${fmtNum(sumLow)}–${fmtNum(sumHigh)} lbs`;
                                                const priceStr = livePrices[crop.crop_name]
                                                    ? `$${livePrices[crop.crop_name].price_per_lb.toFixed(2)}/lb 📈 live`
                                                    : `$${(crop.price_per_lb ?? 0).toFixed(2)}/lb organic est.`;
                                                return `${yieldStr} · ${crop.bed_slots} bed slot${crop.bed_slots > 1 ? 's' : ''} · ${priceStr}`;
                                            })()}
                                        </Text>
                                    </View>
                                    <View style={styles.topCropRevenue}>
                                        <Text style={styles.topCropRevenueAmount}>${fmtNum(Math.round(crop.total_revenue_mid ?? 0))}</Text>
                                        <Text style={styles.topCropRevenueRange}>
                                            ${fmtNum(Math.round(crop.total_revenue_low ?? 0))}–${fmtNum(Math.round(crop.total_revenue_high ?? 0))}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>

                    {/* ── Season Performance (Expected vs Actual) ───────────────────────── */}
                    {actualHarvests.length > 0 && (() => {
                        // Group actual harvests by crop name (case-insensitive)
                        const groupedActuals = {};
                        for (const h of actualHarvests) {
                            const key = (h.cropName ?? '').toLowerCase();
                            if (!groupedActuals[key]) groupedActuals[key] = {
                                cropName: h.cropName,
                                totalActualLbs: 0,
                                hasIssue: false,
                                issueCategories: [],
                                entries: [],
                            };
                            groupedActuals[key].totalActualLbs += h.actualLbs ?? 0;
                            if (h.hasIssue) {
                                groupedActuals[key].hasIssue = true;
                                groupedActuals[key].issueCategories = [
                                    ...new Set([...groupedActuals[key].issueCategories, ...(h.issueCategories ?? [])]),
                                ];
                            }
                            groupedActuals[key].entries.push(h);
                        }

                        const ISSUE_ICONS = {
                            Fungus: '🍄', Insect: '🐛',
                            'Poor Germination': '🌱', Irrigation: '💧', Heat: '🌡️',
                        };

                        return (
                            <>
                                <SectionHeader
                                    title="📊 Season Performance"
                                    subtitle="Expected vs actual harvest · issues explain variances without adjusting your baseline"
                                />
                                <View style={[styles.varianceCard, Shadows.card]}>
                                    {Object.values(groupedActuals).map((group, idx) => {
                                        // Find matching expected yield from yieldData
                                        const matchKey = Object.keys(byCrop ?? {}).find(id =>
                                            byCrop[id]?.crop_name?.toLowerCase() === group.cropName.toLowerCase()
                                        );
                                        const expectedLbs = matchKey ? Math.round(byCrop[matchKey]?.total_yield_lbs ?? 0) : null;
                                        const actualLbs = Math.round(group.totalActualLbs);
                                        const delta = expectedLbs != null ? actualLbs - expectedLbs : null;
                                        const deltaPct = expectedLbs ? Math.round((delta / expectedLbs) * 100) : null;

                                        // Only show yield-adjust flag when miss is ≥ 25% AND no issue attributed
                                        const showAdjustFlag = delta != null && deltaPct !== null
                                            && deltaPct <= -25 && !group.hasIssue;

                                        return (
                                            <View key={group.cropName} style={[styles.varianceRow, idx < Object.keys(groupedActuals).length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.07)' }]}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                                    <Text style={styles.varianceCrop}>{group.cropName}</Text>
                                                    {group.hasIssue && group.issueCategories.map(cat => (
                                                        <View key={cat} style={styles.issueAttributeChip}>
                                                            <Text style={styles.issueAttributeChipText}>
                                                                {ISSUE_ICONS[cat] ?? '⚠️'} {cat}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>
                                                <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                                    {expectedLbs != null && (
                                                        <Text style={styles.varianceProjected}>Expected: {fmtNum(expectedLbs)} lbs</Text>
                                                    )}
                                                    <Text style={styles.varianceActual}>Actual: {fmtNum(actualLbs)} lbs</Text>
                                                    {delta != null && (
                                                        <Text style={[styles.varianceDelta, { color: delta >= 0 ? '#2E7D32' : '#C62828' }]}>
                                                            {delta >= 0 ? '+' : ''}{fmtNum(delta)} lbs ({deltaPct > 0 ? '+' : ''}{deltaPct}%)
                                                        </Text>
                                                    )}
                                                </View>
                                                {group.hasIssue && group.issueCategories.length > 0 && (
                                                    <Text style={styles.varianceIssueNote}>
                                                        ℹ️ Yield miss attributed to issue — baseline not adjusted for next season
                                                    </Text>
                                                )}
                                                {showAdjustFlag && (
                                                    <Text style={styles.varianceAdjustFlag}>
                                                        📉 Consider revising expected yield — consistent miss with no issue logged
                                                    </Text>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </>
                        );
                    })()}

                    {/* ── Per-Bed Breakdown ────────────────────────────────────────────── */}
                    <SectionHeader title="Bed-by-Bed Breakdown" subtitle="All successions and their yields" />
                    {Array.from({ length: 8 }, (_, i) => i + 1).map(bedNum => {
                        const bedEstimates = byBed[bedNum] ?? [];
                        if (bedEstimates.length === 0) return (
                            <View key={bedNum} style={[styles.bedBreakdownCard, Shadows.card]}>
                                <Text style={styles.bedBreakdownTitle}>Bed {bedNum}</Text>
                                <Text style={styles.bedEmptyLabel}>No crops assigned</Text>
                            </View>
                        );
                        const bedTotal = bedEstimates.reduce((s, e) => s + (e.gross_revenue_mid ?? 0), 0);
                        return (
                            <View key={bedNum} style={[styles.bedBreakdownCard, Shadows.card]}>
                                <View style={styles.bedBreakdownHeader}>
                                    <Text style={styles.bedBreakdownTitle}>Bed {bedNum}</Text>
                                    <Text style={styles.bedBreakdownTotal}>${fmtNum(Math.round(bedTotal))}</Text>
                                </View>
                                {bedEstimates.map((est, i) => (
                                    <View key={i} style={[styles.bedEstRow, i < bedEstimates.length - 1 && styles.bedEstBorder]}>
                                        <Text style={styles.bedEstCrop}>{est.crop_name}</Text>
                                        <Text style={styles.bedEstDetail}>
                                            {est.yield_lbs_low != null && est.yield_lbs_high != null
                                                ? est.yield_lbs_low === est.yield_lbs_high
                                                    ? `${est.yield_lbs_high} lbs`
                                                    : `${est.yield_lbs_low}–${est.yield_lbs_high} lbs`
                                                : est.estimated_yield_lbs ? `${Math.round(est.estimated_yield_lbs)} lbs` : ''
                                            }
                                            {est.estimated_yield_bunches ? ` / ${Math.round(est.estimated_yield_bunches)} bunches` : ''}
                                            {(est.harvest_count ?? 1) > 1 ? ` · ${est.harvest_count} ${harvestTerm(est.category, est.harvest_count)}` : ''}
                                        </Text>
                                        <Text style={styles.bedEstRevenue}>${fmtNum(Math.round(est.gross_revenue_mid ?? 0))}</Text>
                                    </View>
                                ))}
                            </View>
                        );
                    })}

                    {/* ── Export Buttons ───────────────────────────────────────────────── */}
                    <SectionHeader title="Export Your Plan" subtitle="Save and share your farm plan" />
                    <View style={styles.exportSection}>
                        <ExportButton
                            icon="📄"
                            label="Export as PDF"
                            subtitle="Full plan with cover page + calendar"
                            onPress={handleExportPDF}
                            disabled={exporting}
                            primary
                        />
                        <ExportButton
                            icon="📊"
                            label="Export as Excel / Google Sheets"
                            subtitle="3 tabs: Calendar · Yield by Crop · Bed Plan"
                            onPress={handleExportExcel}
                            disabled={exporting}
                        />
                        <ExportButton
                            icon="📋"
                            label="Export Calendar (CSV)"
                            subtitle="All seeding actions as flat spreadsheet"
                            onPress={handleExportCalendarCSV}
                            disabled={exporting}
                        />
                        <ExportButton
                            icon="💰"
                            label="Export Revenue (CSV)"
                            subtitle="Yield estimates and pricing data"
                            onPress={handleExportYieldCSV}
                            disabled={exporting}
                        />
                    </View>

                    {exporting && (
                        <View style={styles.exportingRow}>
                            <ActivityIndicator color={Colors.primaryGreen} size="small" />
                            <Text style={styles.exportingText}>Preparing export…</Text>
                        </View>
                    )}
                </Animated.ScrollView>
            )}

            {/* ── AI Advisor Floating Widget ── */}
            <AIAdvisorWidget
                farmProfile={farmProfile}
                selectedCrops={Object.keys(byCrop ?? {}).map(id => byCrop[id]?.crop_name).filter(Boolean)}
                bedSuccessions={bedSuccessions}
            />
        </View>
    );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const SectionHeader = ({ title, subtitle }) => (
    <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
);

const StatPill = ({ icon, label }) => (
    <View style={styles.statPill}>
        <Text style={styles.statPillText}>{icon} {label}</Text>
    </View>
);

const ExportButton = ({ icon, label, subtitle, onPress, disabled, primary }) => (
    <TouchableOpacity
        style={[styles.exportBtn, primary && styles.exportBtnPrimary, Shadows.card]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.82}
    >
        <Text style={styles.exportBtnIcon}>{icon}</Text>
        <View style={styles.exportBtnText}>
            <Text style={[styles.exportBtnLabel, primary && styles.exportBtnLabelPrimary]}>{label}</Text>
            <Text style={styles.exportBtnSubtitle}>{subtitle}</Text>
        </View>
        <Text style={[styles.exportBtnArrow, primary && styles.exportBtnArrowPrimary]}>›</Text>
    </TouchableOpacity>
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtNum(n) { return Math.round(n ?? 0).toLocaleString(); }

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundGrey,
        ...Platform.select({ web: { maxHeight: '100vh', overflow: 'hidden' } }),
    },

    headerActionBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    headerActionText: { fontSize: 18 },
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

    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
    loadingText: { fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic' },

    scrollContent: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 48 },

    // ── Revenue Hero Card ────────────────────────────────────────────────────────
    revenueHeroCard: {
        backgroundColor: Colors.primaryGreen, borderRadius: Radius.lg,
        padding: Spacing.lg, gap: Spacing.sm,
    },
    revenueHeroLabel: { fontSize: Typography.xs, color: Colors.warmTan, letterSpacing: 2, fontWeight: Typography.bold },
    revenueHeroRange: { fontSize: 34, fontWeight: Typography.bold, color: Colors.cream, lineHeight: 38 },
    revenueHeroMid: { fontSize: Typography.sm, color: Colors.warmTan },
    revenueHeroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
    statPill: { backgroundColor: 'rgba(245,245,220,0.12)', borderRadius: Radius.full, paddingVertical: 5, paddingHorizontal: 12 },
    statPillText: { fontSize: Typography.xs, color: Colors.cream, fontWeight: Typography.medium },

    // ── Section Headers ──────────────────────────────────────────────────────────
    sectionHeader: { marginTop: Spacing.md, marginBottom: Spacing.sm, gap: 2 },
    sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.primaryGreen },
    sectionSubtitle: { fontSize: Typography.xs, color: Colors.mutedText },

    // ── Bar Chart ────────────────────────────────────────────────────────────────
    barChartCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    barLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.burntOrange, width: 40 },
    barTrack: { flex: 1, height: 20, backgroundColor: 'rgba(45,79,30,0.08)', borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: Colors.primaryGreen, borderRadius: 4 },
    barValue: { fontSize: 10, fontWeight: Typography.bold, color: Colors.burntOrange, width: 48, textAlign: 'right' },
    barCrop: { width: 60, fontSize: 10, color: Colors.mutedText },

    // ── Top Crops ────────────────────────────────────────────────────────────────
    topCropsCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.md, overflow: 'hidden' },
    topCropRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
    topCropBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.08)' },
    topCropRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primaryGreen, alignItems: 'center', justifyContent: 'center' },
    topCropRankText: { fontSize: Typography.xs, color: Colors.cream, fontWeight: Typography.bold },
    topCropInfo: { flex: 1, gap: 2 },
    topCropName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    topCropVariety: { fontSize: Typography.xs, color: Colors.mutedText },
    topCropDetail: { fontSize: 10, color: Colors.mutedText, lineHeight: 14 },
    topCropRevenue: { alignItems: 'flex-end', gap: 2 },
    topCropRevenueAmount: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.burntOrange },
    topCropRevenueRange: { fontSize: 10, color: Colors.mutedText },

    // ── Per-Bed Breakdown ────────────────────────────────────────────────────────
    bedBreakdownCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.sm },
    bedBreakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, backgroundColor: 'rgba(45,79,30,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.08)' },
    bedBreakdownTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    bedBreakdownTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.burntOrange },
    bedEmptyLabel: { padding: Spacing.md, fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic' },
    bedEstRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
    bedEstBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.05)' },
    bedEstCrop: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    bedEstDetail: { fontSize: 10, color: Colors.mutedText },
    bedEstRevenue: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },
    emptyText: { padding: Spacing.md, fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic' },

    // ── CSA Impact Table ─────────────────────────────────────────────────────────
    csaCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.md, overflow: 'hidden' },
    csaHeaderRow: { flexDirection: 'row', backgroundColor: Colors.primaryGreen, paddingVertical: 7, paddingHorizontal: Spacing.md, gap: 4 },
    csaHeaderCrop: { flex: 2, fontSize: 9, fontWeight: Typography.bold, color: Colors.cream, letterSpacing: 0.5 },
    csaHeaderYield: { flex: 1, fontSize: 9, fontWeight: Typography.bold, color: Colors.cream, textAlign: 'right' },
    csaHeaderShare: { flex: 1, fontSize: 9, fontWeight: Typography.bold, color: Colors.cream, textAlign: 'right' },
    csaHeaderFam: { flex: 1, fontSize: 9, fontWeight: Typography.bold, color: Colors.warmTan, textAlign: 'right' },
    csaRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: Spacing.md, alignItems: 'center', gap: 4 },
    csaRowAlt: { backgroundColor: 'rgba(45,79,30,0.04)' },
    csaCrop: { flex: 2, fontSize: Typography.xs, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    csaYield: { flex: 1, fontSize: Typography.xs, color: Colors.darkText, textAlign: 'right' },
    csaShare: { flex: 1, fontSize: 10, color: Colors.mutedText, textAlign: 'right' },
    csaFam: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.burntOrange, textAlign: 'right' },
    csaFooter: { padding: Spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.08)' },
    csaFooterText: { fontSize: 9, color: Colors.mutedText, fontStyle: 'italic', lineHeight: 13 },

    // ── CSA Controls ──────────────────────────────────────────────────────────
    csaControls: { gap: Spacing.xs, marginBottom: Spacing.sm },
    csaControlRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
    csaDateInput: {
        flex: 1, minWidth: 180, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)',
        borderRadius: Radius.sm, paddingVertical: 6, paddingHorizontal: 10,
        fontSize: Typography.xs, color: Colors.primaryGreen,
        backgroundColor: Colors.cardBg,
    },
    memberSelector: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
    memberSelectorLabel: { fontSize: Typography.xs, color: Colors.mutedText, fontWeight: Typography.medium, marginRight: 4 },
    memberBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: Radius.full, backgroundColor: Colors.cardBg, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.15)' },
    memberBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    memberBtnText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.bold },
    memberBtnTextActive: { color: Colors.cream },

    // ── Weekly Box Cards ─────────────────────────────────────────────────────
    weekScrollContent: { paddingBottom: Spacing.sm, gap: Spacing.sm },
    // Wider card to fit category groups comfortably
    weekCard: { width: 180, backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)' },
    weekCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    weekCardDate: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },
    weekRatingBadge: { paddingVertical: 1, paddingHorizontal: 6, borderRadius: Radius.full },
    weekRatingText: { fontSize: 9, fontWeight: Typography.bold },
    weekCardStat: { fontSize: 9, color: Colors.mutedText, lineHeight: 14 },
    weekDivider: { height: 1, backgroundColor: 'rgba(45,79,30,0.1)', marginVertical: 5 },
    // Box slot grouping
    weekSlotGroup: { marginBottom: 4 },
    weekSlotLabel: { fontSize: 8, fontWeight: '800', color: Colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    weekItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2, paddingLeft: 8 },
    weekItemCrop: { flex: 1, fontSize: 10, fontWeight: Typography.semiBold, color: Colors.darkText },
    weekItemLbs: { fontSize: 9, color: Colors.primaryGreen, fontWeight: Typography.bold },
    // Missing slot warning
    weekMissingRow: { marginTop: 4, backgroundColor: '#FFF8E1', borderRadius: 4, padding: 4 },
    weekMissingText: { fontSize: 8, color: '#7B5E2A', fontStyle: 'italic' },
    emptyWeekText: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic' },

    // ── Revenue Goal ──────────────────────────────────────────────────────────
    goalCard: { backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
    goalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    goalBarTrack: { flex: 1, height: 10, backgroundColor: 'rgba(45,79,30,0.1)', borderRadius: 5, overflow: 'hidden' },
    goalBarFill: { height: '100%', backgroundColor: Colors.primaryGreen, borderRadius: 5 },
    goalPct: { fontSize: Typography.sm, fontWeight: '800', color: Colors.primaryGreen, width: 44, textAlign: 'right' },
    goalDetail: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 16 },
    goalChangeBtn: { alignSelf: 'flex-start' },
    goalChangeBtnText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.bold, textDecorationLine: 'underline' },
    goalInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    goalInputLabel: { fontSize: Typography.lg, fontWeight: '700', color: Colors.primaryGreen },
    goalInput: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: Radius.sm, padding: 8, fontSize: Typography.sm, color: Colors.primaryGreen },
    goalSetBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.sm },
    goalSetBtnText: { color: Colors.cream, fontWeight: '700', fontSize: Typography.sm },

    // ── Variance ──────────────────────────────────────────────────────────────
    varianceCard: { backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.md, padding: Spacing.md, gap: 2 },
    varianceRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.07)', gap: 2 },
    varianceCrop: { fontSize: Typography.sm, fontWeight: '700', color: Colors.primaryGreen },
    varianceActual: { fontSize: Typography.xs, color: Colors.darkText },
    varianceProjected: { fontSize: Typography.xs, color: Colors.mutedText },
    varianceDelta: { fontSize: Typography.xs, fontWeight: '700' },
    issueAttributeChip: {
        paddingVertical: 1, paddingHorizontal: 7, borderRadius: Radius.full,
        backgroundColor: '#FFCDD2', borderWidth: 1, borderColor: '#EF9A9A',
    },
    issueAttributeChipText: { fontSize: 9, fontWeight: '800', color: '#B71C1C' },
    varianceIssueNote: { fontSize: 10, color: '#1565C0', fontStyle: 'italic', marginTop: 3, lineHeight: 14 },
    varianceAdjustFlag: { fontSize: 10, color: '#C62828', fontWeight: '700', marginTop: 3, lineHeight: 14 },

    // ── Archive ───────────────────────────────────────────────────────────────
    archiveCard: { backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs, alignItems: 'center' },
    archiveBtn: { backgroundColor: 'rgba(45,79,30,0.08)', borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 20, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)' },
    archiveBtnText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.primaryGreen },
    archiveSuccess: { fontSize: Typography.sm, fontWeight: '700', color: Colors.primaryGreen },
    archiveNote: { fontSize: Typography.xs, color: Colors.mutedText, textAlign: 'center' },

    // ── Live Price Badge ─────────────────────────────────────────────────────
    livePriceBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 2, backgroundColor: '#E8F5E9', borderRadius: 4, paddingVertical: 1, paddingHorizontal: 5, alignSelf: 'flex-start' },
    livePriceBadgeText: { fontSize: 9, color: '#1B5E20', fontWeight: '700' },

    // ── Export ───────────────────────────────────────────────────────────────────
    exportSection: { gap: Spacing.sm },
    exportBtn: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBg,
        borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.md,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.12)',
    },
    exportBtnPrimary: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    exportBtnIcon: { fontSize: 24 },
    exportBtnText: { flex: 1, gap: 2 },
    exportBtnLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    exportBtnLabelPrimary: { color: Colors.cream },
    exportBtnSubtitle: { fontSize: Typography.xs, color: Colors.mutedText },
    exportBtnArrow: { fontSize: 22, color: Colors.primaryGreen, opacity: 0.5 },
    exportBtnArrowPrimary: { color: Colors.cream },
    exportingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
    exportingText: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic' },
});
