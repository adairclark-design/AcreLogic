/**
 * AcreLogic Yield Summary Screen
 * ================================
 * Farm revenue breakdown aggregating all blocks and beds:
 *   - Season revenue card (low / mid / high)
 *   - Revenue by block (stacked bar)
 *   - Per-bed succession breakdown automatically sorted by block assignment
 */
import React, { useCallback, useState, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, TextInput, StyleSheet, ScrollView,
    TouchableOpacity, Animated, ActivityIndicator, Alert, Platform, useWindowDimensions
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { calculateFarmYield, buildWeeklyBoxSchedule, CSA_BOX_SLOTS, harvestTerm } from '../services/yieldCalculator';
import { generateFullCalendar } from '../services/calendarGenerator';
import { exportPDF, exportCalendarCSV, exportYieldCSV, exportExcel } from '../services/exportService';
import { fetchOrganicPrice } from '../services/climateService';
import { loadBlocks, loadBlockBeds, loadActualHarvests, loadRevenueGoal, saveRevenueGoal, saveSeasonSnapshot } from '../services/persistence';
import GlobalNavBar from '../components/GlobalNavBar';
import AIAdvisorWidget from '../components/AIAdvisorWidget';

export default function YieldSummaryScreen({ navigation, route }) {
    const { farmProfile = {}, planId, bedSuccessions: routeSuccs = null } = route?.params ?? {};

    const [yieldData, setYieldData] = useState(null);
    const [calendarEntries, setCalendarEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [csaMemberCount, setCsaMemberCount] = useState(20);
    const [csaStartDate, setCsaStartDate] = useState('');
    const [livePrices, setLivePrices] = useState({});
    const [actualHarvests, setActualHarvests] = useState([]);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useFocusEffect(useCallback(() => {
        setLoading(true);
        computeYield();
    }, [planId]));

    const computeYield = async () => {
        try {
            // MULTI-BLOCK AGGREGATION
            let baseBlocks = loadBlocks().filter(b => b.planId === planId);
            if (!baseBlocks.length) baseBlocks = loadBlocks(); // fallback

            let allBeds = [];
            if (routeSuccs && Object.keys(routeSuccs).length > 0) {
                // Legacy Handle
                allBeds = Object.entries(routeSuccs).map(([num, succs]) => ({
                    bed_number: parseInt(num),
                    block_id: 'legacy_workspace',
                    block_name: 'Workspace',
                    global_id: `Workspace - Bed ${num}`,
                    bed_label: `Bed ${num}`,
                    successions: succs,
                }));
            } else {
                // Aggregate every block's beds
                baseBlocks.forEach(block => {
                    const blockBeds = loadBlockBeds(block.id);
                    Object.entries(blockBeds).forEach(([bedNum, bData]) => {
                        const succs = Array.isArray(bData) ? bData : (bData.successions ?? []);
                        if (succs.length > 0) {
                            allBeds.push({
                                bed_number: parseInt(bedNum),
                                block_id: block.id,
                                block_name: block.name,
                                global_id: `${block.name} - Bed ${bedNum}`,
                                bed_label: `Bed ${bedNum}`,
                                successions: succs,
                            });
                        }
                    });
                });
            }

            const [yields, calendar] = await Promise.all([
                calculateFarmYield(allBeds, farmProfile),
                generateFullCalendar(allBeds, farmProfile),
            ]);

            setYieldData(yields);
            setCalendarEntries(calendar);

            setActualHarvests(loadActualHarvests());

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
                } catch { /* ignore network error */ }
            })
        );
        if (Object.keys(results).length > 0) setLivePrices(results);
    };

    const handleExportPDF = async () => { if (!yieldData) return; setExporting(true); try { await exportPDF(farmProfile, calendarEntries, yieldData, routeSuccs || {}); } catch (e) { Alert.alert('Export Failed', e.message); } finally { setExporting(false); } };
    const handleExportCalendarCSV = async () => { setExporting(true); try { await exportCalendarCSV(calendarEntries); } catch (e) { Alert.alert('Export Failed', e.message); } finally { setExporting(false); } };
    const handleExportYieldCSV = async () => { if (!yieldData) return; setExporting(true); try { await exportYieldCSV(yieldData); } catch (e) { Alert.alert('Export Failed', e.message); } finally { setExporting(false); } };
    const handleExportExcel = async () => { if (!yieldData) return; setExporting(true); try { await exportExcel(farmProfile, calendarEntries, yieldData, routeSuccs || {}); } catch (e) { Alert.alert('Export Failed', e.message); } finally { setExporting(false); } };

    const totals = yieldData?.totals ?? {};
    const topCrops = totals.top_crops_by_revenue ?? [];
    const byBed = yieldData?.byBed ?? {};
    const byCrop = yieldData?.byCrop ?? {};

    // Group revenues by Block Name
    const blockRevenues = {};
    if (yieldData?.byBed) {
        Object.values(yieldData.byBed).forEach(bedEstimates => {
            if (!bedEstimates.length) return;
            const bName = bedEstimates[0].block_name || 'My Farm';
            const bRev = bedEstimates.reduce((s, e) => s + (e.gross_revenue_mid ?? 0), 0);
            blockRevenues[bName] = (blockRevenues[bName] || 0) + bRev;
        });
    }
    const sortedBlocks = Object.entries(blockRevenues).sort((a,b)=>b[1]-a[1]);
    const maxBlockRevenue = Math.max(...sortedBlocks.map(b => b[1]), 1);

    const allEstimates = Object.values(byBed).flat();
    const weeklySchedule = buildWeeklyBoxSchedule(allEstimates, csaMemberCount, csaStartDate || null);

    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768; // Tablet & Web breakpoint

    return (
        <View style={styles.container}>
            <GlobalNavBar 
                navigation={navigation} 
                farmProfile={farmProfile} 
                planId={planId} 
                activeRoute="YieldSummary" 
                rightAction={
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <TouchableOpacity style={styles.headerActionBtn} onPress={() => navigation.navigate('HarvestForecast', { farmProfile, planId })}>
                            <Text style={styles.headerActionText}>📅</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerActionBtn} onPress={() => navigation.navigate('FieldJournal', { farmProfile, planId })}>
                            <Text style={styles.headerActionText}>📓</Text>
                        </TouchableOpacity>
                    </View>
                }
            />

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={Colors.primaryGreen} size="large" />
                    <Text style={styles.loadingText}>Calculating full farm yields…</Text>
                </View>
            ) : (
                <Animated.ScrollView
                    style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, Platform.OS === 'web' && { overflowY: 'scroll' }]}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Top Level Stats ─────────────────────────────────────── */}
                    <View style={isLargeScreen ? styles.rowWrapHero : undefined}>
                        <View style={[styles.revenueHeroCard, Shadows.card, isLargeScreen && styles.flexHalf]}>
                            <Text style={styles.revenueHeroLabel}>ESTIMATED SEASON REVENUE</Text>
                            <Text style={styles.revenueHeroRange}>${fmtNum(totals.total_revenue_low)} – ${fmtNum(totals.total_revenue_high)}</Text>
                            <Text style={styles.revenueHeroMid}>~${fmtNum(totals.total_revenue_mid)} organic wholesale</Text>
                            <View style={styles.revenueHeroStats}>
                                <StatPill icon="📦" label={`${fmtNum(totals.total_yield_lbs)} lbs est.`} />
                                <StatPill icon="📅" label={`${calendarEntries.length} actions`} />
                                <StatPill icon="🏠" label={`est. ${fmtNum(totals.total_households_served ?? 0)} families/harvest`} />
                            </View>
                        </View>

                        <View style={isLargeScreen && styles.flexHalf}>
                            <SectionHeader title="Revenue by Block" subtitle="Comparing profitability across your fields" style={isLargeScreen ? { marginTop: 0 } : undefined} />
                            <View style={[styles.barChartCard, Shadows.card]}>
                                {sortedBlocks.map(([blockName, bTotal]) => {
                                    const barWidth = maxBlockRevenue > 0 ? (bTotal / maxBlockRevenue) * 100 : 0;
                                    return (
                                        <View key={blockName} style={styles.barRow}>
                                            <Text style={styles.barLabel} numberOfLines={1}>{blockName}</Text>
                                            <View style={styles.barTrack}>
                                                <View style={[styles.barFill, { width: `${barWidth}%` }]} />
                                            </View>
                                            <Text style={styles.barValue}>{bTotal > 0 ? `$${fmtNum(bTotal)}` : '—'}</Text>
                                        </View>
                                    );
                                })}
                                {sortedBlocks.length === 0 && <Text style={styles.emptyText}>No crops assigned yet</Text>}
                            </View>
                        </View>
                    </View>

                    {/* ── Top Crops ────────────────────────────────────────────────────── */}
                    <SectionHeader title="Top Crops globally" subtitle="Most profitable varieties farm-wide" />
                    <View style={isLargeScreen ? styles.gridWrapRow : undefined}>
                        {topCrops.length === 0 ? (
                            <View style={[styles.topCropsCard, Shadows.card, styles.flexFull]}>
                                <Text style={styles.emptyText}>No yield data yet. Plant crops first.</Text>
                            </View>
                        ) : (
                            topCrops.map((crop, i) => (
                                <View key={crop.crop_id} style={[styles.topCropsCard, Shadows.card, isLargeScreen && styles.gridItemHalf, styles.topCropRowMinimal]}>
                                    <View style={styles.topCropRank}><Text style={styles.topCropRankText}>#{i + 1}</Text></View>
                                    <View style={styles.topCropInfo}>
                                        <Text style={styles.topCropName}>{crop.crop_name}</Text>
                                        <Text style={styles.topCropVariety}>{crop.crop_variety}</Text>
                                        <Text style={styles.topCropDetail}>
                                            {(() => {
                                                const bedEsts = Object.values(byBed ?? {}).flat().filter(e => e.crop_id === crop.crop_id);
                                                const sumLow = bedEsts.reduce((s, e) => s + (e.yield_lbs_low ?? e.estimated_yield_lbs ?? 0), 0);
                                                const sumHigh = bedEsts.reduce((s, e) => s + (e.yield_lbs_high ?? e.estimated_yield_lbs ?? 0), 0);
                                                const yieldStr = sumLow === sumHigh ? `${fmtNum(sumHigh)} lbs` : `${fmtNum(sumLow)}–${fmtNum(sumHigh)} lbs`;
                                                const priceStr = livePrices[crop.crop_name]
                                                    ? `$${livePrices[crop.crop_name].price_per_lb.toFixed(2)}/lb 📈`
                                                    : `$${(crop.price_per_lb ?? 0).toFixed(2)}/lb est.`;
                                                return `${yieldStr} · ${crop.bed_slots} beds · ${priceStr}`;
                                            })()}
                                        </Text>
                                    </View>
                                    <View style={styles.topCropRevenue}>
                                        <Text style={styles.topCropRevenueAmount}>${fmtNum(Math.round(crop.total_revenue_mid ?? 0))}</Text>
                                        <Text style={styles.topCropRevenueRange}>${fmtNum(Math.round(crop.total_revenue_low ?? 0))}–${fmtNum(Math.round(crop.total_revenue_high ?? 0))}</Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>

                    {/* ── Per-Bed Breakdown ────────────────────────────────────────────── */}
                    <SectionHeader title="Harvest Plan by Bed" subtitle="All succession yields calculated" />
                    <View style={isLargeScreen ? styles.gridWrapRow : undefined}>
                        {Object.entries(yieldData?.byBed ?? {})
                            .sort((a,b) => {
                                // Basic string sort is ok since global_id is like "Block A - Bed 1"
                                // Though numeric bed suffix sorting would be cleaner if it scales to Bed 10+
                                return a[0].localeCompare(b[0], undefined, {numeric: true});
                            })
                            .map(([globalId, bedEstimates]) => {
                                if (bedEstimates.length === 0) return null;
                                const bedTotal = bedEstimates.reduce((s, e) => s + (e.gross_revenue_mid ?? 0), 0);
                                return (
                                    <View key={globalId} style={[styles.bedBreakdownCard, Shadows.card, isLargeScreen && styles.gridItemHalf]}>
                                        <View style={styles.bedBreakdownHeader}>
                                            <Text style={styles.bedBreakdownTitle}>{globalId}</Text>
                                            <Text style={styles.bedBreakdownTotal}>${fmtNum(Math.round(bedTotal))}</Text>
                                        </View>
                                        {bedEstimates.map((est, i) => (
                                            <View key={i} style={[styles.bedEstRow, i < bedEstimates.length - 1 && styles.bedEstBorder]}>
                                                <Text style={styles.bedEstCrop}>{est.crop_name}</Text>
                                                <Text style={styles.bedEstDetail}>
                                                    {est.yield_lbs_low != null && est.yield_lbs_high != null
                                                        ? est.yield_lbs_low === est.yield_lbs_high ? `${est.yield_lbs_high} lbs` : `${est.yield_lbs_low}–${est.yield_lbs_high} lbs`
                                                        : est.estimated_yield_lbs ? `${Math.round(est.estimated_yield_lbs)} lbs` : ''
                                                    }
                                                    {est.estimated_yield_bunches ? ` / ${Math.round(est.estimated_yield_bunches)} bunches` : ''}
                                                    {` per harvest`}
                                                    {(est.harvest_count ?? 1) > 1 ? ` · ${est.harvest_count} ${harvestTerm(est.category, est.harvest_count)}` : ''}
                                                </Text>
                                                <Text style={styles.bedEstRevenue}>${fmtNum(Math.round(est.gross_revenue_mid ?? 0))}</Text>
                                            </View>
                                        ))}
                                    </View>
                                );
                            })}
                    </View>

                    {/* ── Export ───────────────────────────────────────────────── */}
                    <SectionHeader title="Export Farm Documentation" subtitle="Generate files directly to device" />
                    <View style={isLargeScreen ? styles.exportRowWrap : styles.exportSection}>
                        <ExportButton icon="📄" label="Export as PDF" subtitle="Cover page & summary" onPress={handleExportPDF} disabled={exporting} primary isLargeScreen={isLargeScreen} />
                        <ExportButton icon="📊" label="Export to Excel" subtitle="Aggregated fields" onPress={handleExportExcel} disabled={exporting} isLargeScreen={isLargeScreen} />
                        <ExportButton icon="📋" label="Export Tasks (CSV)" subtitle="Seeding actions" onPress={handleExportCalendarCSV} disabled={exporting} isLargeScreen={isLargeScreen} />
                    </View>

                    {exporting && (
                        <View style={styles.exportingRow}>
                            <ActivityIndicator color={Colors.primaryGreen} size="small" />
                            <Text style={styles.exportingText}>Preparing export…</Text>
                        </View>
                    )}
                </Animated.ScrollView>
            )}

            <AIAdvisorWidget farmProfile={farmProfile} selectedCrops={Object.keys(byCrop ?? {}).map(id => byCrop[id]?.crop_name).filter(Boolean)} bedSuccessions={routeSuccs} />
        </View>
    );
}

const SectionHeader = ({ title, subtitle, style }) => (
    <View style={[styles.sectionHeader, style]}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
);

const StatPill = ({ icon, label }) => (
    <View style={styles.statPill}><Text style={styles.statPillText}>{icon} {label}</Text></View>
);

const ExportButton = ({ icon, label, subtitle, onPress, disabled, primary, isLargeScreen }) => (
    <TouchableOpacity style={[styles.exportBtn, primary && styles.exportBtnPrimary, Shadows.card, isLargeScreen && styles.exportBtnLarge]} onPress={onPress} disabled={disabled} activeOpacity={0.82}>
        <Text style={styles.exportBtnIcon}>{icon}</Text>
        <View style={styles.exportBtnText}>
            <Text style={[styles.exportBtnLabel, primary && styles.exportBtnLabelPrimary]}>{label}</Text>
            <Text style={styles.exportBtnSubtitle}>{subtitle}</Text>
        </View>
        {!isLargeScreen && <Text style={[styles.exportBtnArrow, primary && styles.exportBtnArrowPrimary]}>›</Text>}
    </TouchableOpacity>
);

function fmtNum(n) { return Math.round(n ?? 0).toLocaleString(); }

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.backgroundGrey, ...Platform.select({ web: { maxHeight: '100vh', overflow: 'hidden' } }) },
    headerActionBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    headerActionText: { fontSize: 18 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
    loadingText: { fontSize: Typography.sm, color: Colors.mutedText },
    scrollContent: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 48 },

    flexFull: { flex: 1, width: '100%' },
    gridWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, paddingBottom: Spacing.md },
    gridItemHalf: { flex: 1, minWidth: 320, marginBottom: 0 },
    rowWrapHero: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
    flexHalf: { flex: 1, minWidth: 300 },

    revenueHeroCard: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
    revenueHeroLabel: { fontSize: Typography.xs, color: Colors.warmTan, letterSpacing: 2, fontWeight: Typography.bold },
    revenueHeroRange: { fontSize: 34, fontWeight: Typography.bold, color: Colors.cream, lineHeight: 38 },
    revenueHeroMid: { fontSize: Typography.sm, color: Colors.warmTan },
    revenueHeroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
    statPill: { backgroundColor: 'rgba(245,245,220,0.12)', borderRadius: Radius.full, paddingVertical: 5, paddingHorizontal: 12 },
    statPillText: { fontSize: Typography.xs, color: Colors.cream, fontWeight: Typography.medium },

    sectionHeader: { marginTop: Spacing.md, marginBottom: Spacing.sm, gap: 2 },
    sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.primaryGreen },
    sectionSubtitle: { fontSize: Typography.xs, color: Colors.mutedText },

    barChartCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    barLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.burntOrange, width: 85 },
    barTrack: { flex: 1, height: 20, backgroundColor: 'rgba(45,79,30,0.08)', borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: Colors.primaryGreen, borderRadius: 4 },
    barValue: { fontSize: 10, fontWeight: Typography.bold, color: Colors.burntOrange, width: 48, textAlign: 'right' },
    emptyText: { padding: Spacing.md, fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic' },

    topCropsCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.sm },
    topCropRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
    topCropRowMinimal: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm, marginBottom: 0 },
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

    bedBreakdownCard: { flex: 1, minWidth: 320, maxWidth: 500, backgroundColor: Colors.cardBg, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.sm },
    bedBreakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, backgroundColor: 'rgba(45,79,30,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.08)' },
    bedBreakdownTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    bedBreakdownTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.burntOrange },
    bedEstRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
    bedEstBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.05)' },
    bedEstCrop: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    bedEstDetail: { fontSize: 10, color: Colors.mutedText },
    bedEstRevenue: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },

    exportSection: { gap: Spacing.sm },
    exportRowWrap: { flexDirection: 'row', gap: Spacing.md },
    exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBg, padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.md },
    exportBtnLarge: { flex: 1, paddingVertical: Spacing.lg },
    exportBtnPrimary: { backgroundColor: Colors.primaryGreen },
    exportBtnIcon: { fontSize: 24 },
    exportBtnText: { flex: 1, gap: 2 },
    exportBtnLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    exportBtnLabelPrimary: { color: Colors.cream },
    exportBtnSubtitle: { fontSize: Typography.xs, color: Colors.mutedText },
    exportBtnArrow: { fontSize: 24, color: Colors.mutedText },
    exportBtnArrowPrimary: { color: 'rgba(255,255,255,0.5)' },
    exportingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md },
    exportingText: { fontSize: Typography.sm, color: Colors.primaryGreen, fontStyle: 'italic', fontWeight: Typography.bold }
});
