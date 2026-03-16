/**
 * CropCalendarScreen
 * Shows all beds grouped as single rows, each with planting segments.
 * Changes (#1-#7): DS/TP shorthand, IGD, tray dates, seed/bed labels, no book refs.
 */
import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Platform, Modal, Animated,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { generateFullCalendar } from '../services/calendarGenerator';
import { calculateFarmYield } from '../services/yieldCalculator';
import cropData from '../data/crops.json';

// Matches yieldCalculator.js BED_LENGTH_FT constant
const BED_LENGTH_FT = 50;
// Matches yieldCalculator.js YIELD_VARIANCE — kept in sync
const YIELD_VARIANCE = {
    'Greens': { low: 0.65, high: 1.00 },
    'Herb': { low: 0.70, high: 1.00 },
    'Brassica': { low: 0.70, high: 0.95 },
    'Nightshade': { low: 0.55, high: 1.00 },
    'Cucurbit': { low: 0.60, high: 1.00 },
    'Root': { low: 0.75, high: 0.95 },
    'Allium': { low: 0.75, high: 0.95 },
    'Legume': { low: 0.70, high: 0.95 },
    'Flower': { low: 0.65, high: 1.00 },
    'Specialty': { low: 0.65, high: 0.95 },
};
const DEFAULT_VARIANCE = { low: 0.70, high: 1.00 };

// ─── Colors per action ────────────────────────────────────────────────────────
const ACTION_COLOR = {
    direct_seed: Colors.primaryGreen,
    transplant: Colors.burntOrange,
    seed_start: Colors.softLavender,
    cover_crop: Colors.mutedText,
};

// ─── Short labels (#4) ────────────────────────────────────────────────────────
const ACTION_SHORT = {
    direct_seed: 'DS',
    transplant: 'TP',
    seed_start: 'Tray',
    cover_crop: 'CC',
};

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Single planting segment inside a bed row (#3) ───────────────────────────
// ─── Harvest Detail Modal ────────────────────────────────────────────────────
function HarvestDetailModal({ entry, visible, onClose }) {
    if (!entry) return null;
    // Look up harvest metadata from crops.json
    const cropMeta = cropData.crops.find(c =>
        c.name?.toLowerCase() === entry.crop_name?.toLowerCase() ||
        c.id === entry.crop_id
    );
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={hdStyles.backdrop} activeOpacity={1} onPress={onClose}>
                <View style={hdStyles.card} onStartShouldSetResponder={() => true}>
                    {/* Header */}
                    <View style={hdStyles.header}>
                        <Text style={hdStyles.emoji}>{cropMeta?.emoji ?? '🌱'}</Text>
                        <View style={hdStyles.headerText}>
                            <Text style={hdStyles.title}>{entry.crop_name}</Text>
                            {entry.crop_variety ? <Text style={hdStyles.variety}>{entry.crop_variety}</Text> : null}
                        </View>
                        <TouchableOpacity style={hdStyles.closeBtn} onPress={onClose}>
                            <Text style={hdStyles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={hdStyles.divider} />

                    {/* Harvest Frequency */}
                    <View style={hdStyles.row}>
                        <Text style={hdStyles.rowLabel}>⏱ Harvest Frequency</Text>
                        <Text style={hdStyles.rowValue}>{cropMeta?.harvest_frequency ?? 'See notes'}</Text>
                    </View>
                    {/* Harvest Method */}
                    <View style={hdStyles.row}>
                        <Text style={hdStyles.rowLabel}>✂️ Method</Text>
                        <Text style={hdStyles.rowValue}>{cropMeta?.harvest_method ?? cropMeta?.harvest_notes ?? '—'}</Text>
                    </View>
                    {/* Yield (lbs) — label matches crops.json source unit: per 100ft row */}
                    <View style={hdStyles.row}>
                        <Text style={hdStyles.rowLabel}>📦 Expected yield (per 100ft row)</Text>
                        <Text style={hdStyles.rowValue}>
                            {(() => {
                                if (cropMeta?.harvest_expectation) return cropMeta.harvest_expectation;
                                const raw100ft = cropMeta?.yield_lbs_per_100ft;
                                if (!raw100ft) return '—';
                                const baseLbs = raw100ft * (BED_LENGTH_FT / 100);
                                const v = YIELD_VARIANCE[cropMeta?.category] ?? DEFAULT_VARIANCE;
                                const low = Math.round(baseLbs * v.low);
                                const high = Math.round(baseLbs * v.high);
                                return low === high ? `${high} lbs` : `${low}–${high} lbs`;
                            })()}
                        </Text>
                    </View>
                    {/* Bunches yield — only shown when crop has bunch data */}
                    {cropMeta?.yield_bunches_per_100ft ? (
                        <View style={hdStyles.row}>
                            <Text style={hdStyles.rowLabel}>🫙 Expected bunches (per 100ft row)</Text>
                            <Text style={hdStyles.rowValue}>
                                {(() => {
                                    const raw = cropMeta.yield_bunches_per_100ft;
                                    const v = YIELD_VARIANCE[cropMeta?.category] ?? DEFAULT_VARIANCE;
                                    const low = Math.round(raw * v.low);
                                    const high = Math.round(raw * v.high);
                                    return low === high ? `~${high} bunches` : `${low}–${high} bunches`;
                                })()}
                            </Text>
                        </View>
                    ) : null}
                    {/* DTM reminder */}
                    <View style={hdStyles.row}>
                        <Text style={hdStyles.rowLabel}>📅 Days to maturity</Text>
                        <Text style={hdStyles.rowValue}>{entry.dtm ?? cropMeta?.dtm ?? '?'} days</Text>
                    </View>
                    {cropMeta?.notes ? (
                        <View style={[hdStyles.row, hdStyles.noteRow]}>
                            <Text style={hdStyles.noteText}>{cropMeta.notes}</Text>
                        </View>
                    ) : null}

                    <TouchableOpacity style={hdStyles.doneBtn} onPress={onClose}>
                        <Text style={hdStyles.doneBtnText}>Got it</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const hdStyles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    card: { backgroundColor: '#FAFAF7', borderRadius: 20, padding: 20, width: '100%', maxWidth: 420, gap: 8 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    emoji: { fontSize: 36 },
    headerText: { flex: 1 },
    title: { fontSize: 18, fontWeight: '800', color: '#2D4F1E' },
    variety: { fontSize: 11, color: '#757575' },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(45,79,30,0.08)', alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 12, color: '#2D4F1E', fontWeight: '700' },
    divider: { height: 1, backgroundColor: 'rgba(45,79,30,0.1)', marginVertical: 4 },
    row: { gap: 2 },
    rowLabel: { fontSize: 10, fontWeight: '800', color: '#2D4F1E', letterSpacing: 0.5, textTransform: 'uppercase' },
    rowValue: { fontSize: 13, color: '#3D3D3D', lineHeight: 18 },
    noteRow: { backgroundColor: 'rgba(45,79,30,0.05)', borderRadius: 8, padding: 8, marginTop: 2 },
    noteText: { fontSize: 11, color: '#757575', fontStyle: 'italic', lineHeight: 16 },
    doneBtn: { marginTop: 6, backgroundColor: '#2D4F1E', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    doneBtnText: { color: '#F5F0E1', fontWeight: '800', fontSize: 14 },
});

// ─── Planting Segment ─────────────────────────────────────────────────────────
function PlantingSegment({ entry, isLast }) {
    const color = ACTION_COLOR[entry.action] ?? Colors.primaryGreen;
    const short = ACTION_SHORT[entry.action] ?? 'DS';
    const igd = entry.igd ?? entry.dtm;
    const [showDetail, setShowDetail] = React.useState(false);

    return (
        <View style={styles.segmentWrapper}>
            <HarvestDetailModal entry={entry} visible={showDetail} onClose={() => setShowDetail(false)} />
            <TouchableOpacity
                style={[styles.segment, { borderColor: color + '40' }]}
                onLongPress={() => setShowDetail(true)}
                delayLongPress={600}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' ? {
                    onMouseEnter: undefined, // hover handled via title tooltip on web
                } : {})}
            >
                {/* #4: Action shorthand pill */}
                <View style={[styles.segPill, { backgroundColor: color }]}>
                    <Text style={styles.segPillText}>{short}</Text>
                </View>

                <Text style={styles.segCrop} numberOfLines={1}>{entry.crop_name}</Text>
                <Text style={styles.segVariety} numberOfLines={1}>{entry.crop_variety}</Text>
                <Text style={styles.segDate}>{fmtDate(entry.entry_date)}</Text>

                {/* #5: DTM · IGD */}
                {entry.dtm > 0 && (
                    <Text style={styles.segDtm}>
                        DTM: {entry.dtm}d · IGD: {igd}d
                    </Text>
                )}

                {/* #7: Tray date for TP crops */}
                {entry.action === 'transplant' && entry.tray_date && (
                    <Text style={styles.segTray}>
                        Tray: {fmtDate(entry.tray_date)}
                    </Text>
                )}

                {/* #1: Seed amount with context */}
                {entry.seed_amount_label && entry.action !== 'transplant' && (
                    <Text style={styles.segSeed}>{entry.seed_amount_label}</Text>
                )}

                {/* Plant count for TP */}
                {entry.action === 'transplant' && entry.plant_count && (
                    <Text style={styles.segSeed}>{entry.plant_count} plants</Text>
                )}

                {/* Spacing */}
                {entry.spacing_label && (
                    <Text style={styles.segSpacing}>{entry.spacing_label}</Text>
                )}

                {/* JANG config */}
                {entry.jang_config_label && (
                    <Text style={styles.segJang}>{entry.jang_config_label}</Text>
                )}

                {/* Special notes (trellised, interplant — no book refs) */}
                {entry.special_notes && (
                    <Text style={styles.segNotes}>{entry.special_notes}</Text>
                )}
            </TouchableOpacity>
            {!isLast && (
                <View style={styles.segArrowWrap}>
                    <Text style={styles.segArrow}>›</Text>
                </View>
            )}
        </View>
    );
}

// ─── One bed row containing all its segments (#3) ────────────────────────────
function BedRow({ bedNumber, entries }) {
    // Filter out seed_start entries — their info is embedded in the TP segment
    const mainEntries = entries.filter(e => e.action !== 'seed_start');

    return (
        <View style={[styles.bedRow, Shadows.card]}>
            <View style={styles.bedLabelCol}>
                <Text style={styles.bedLabel}>Bed</Text>
                <Text style={styles.bedNum}>{bedNumber}</Text>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bedScrollContent}
            >
                {mainEntries.map((entry, idx) => (
                    <PlantingSegment
                        key={idx}
                        entry={entry}
                        isLast={idx === mainEntries.length - 1}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CropCalendarScreen({ navigation, route }) {
    const { farmProfile = {}, planId, bedSuccessions = {} } = route?.params ?? {};
    const [bedGroups, setBedGroups] = useState([]); // [{bedNumber, entries}]
    const [yieldSummary, setYieldSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { generatePlan(); }, []);

    const generatePlan = async () => {
        try {
            const allBedSuccessions = Object.entries(bedSuccessions).map(([num, succs]) => ({
                bed_number: parseInt(num),
                successions: succs,
            }));

            const [entries, yields] = await Promise.all([
                generateFullCalendar(allBedSuccessions, farmProfile),
                calculateFarmYield(allBedSuccessions, farmProfile),
            ]);

            // #3: Group entries by bed number
            const grouped = {};
            for (const entry of entries) {
                if (!grouped[entry.bed_number]) grouped[entry.bed_number] = [];
                grouped[entry.bed_number].push(entry);
            }
            const sortedGroups = Object.entries(grouped)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([bedNum, bedEntries]) => ({
                    bedNumber: parseInt(bedNum),
                    entries: bedEntries,
                }));

            setBedGroups(sortedGroups);
            setYieldSummary(yields.totals);
        } catch (err) {
            console.error('[CropCalendar] Error generating plan:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.stepLabel}>YOUR PLAN</Text>
                    <Text style={styles.heading}>Crop Calendar</Text>
                </View>
                {Platform.OS === 'web' && (
                    <TouchableOpacity style={styles.printBtn} onPress={() => window.print()}>
                        <Text style={styles.printBtnText}>🖨️</Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={Colors.primaryGreen} size="large" />
                    <Text style={styles.loadingText}>Generating your crop calendar…</Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    style={Platform.OS === 'web' ? { overflowY: 'scroll' } : undefined}
                >
                    {/* Revenue Summary */}
                    {yieldSummary && (
                        <View style={[styles.revenueCard, Shadows.card]}>
                            <Text style={styles.revenueLabel}>Estimated Season Revenue</Text>
                            <Text style={styles.revenueRange}>
                                ${yieldSummary.total_revenue_low.toLocaleString()} – ${yieldSummary.total_revenue_high.toLocaleString()}
                            </Text>
                            <Text style={styles.revenueMid}>
                                ~${yieldSummary.total_revenue_mid.toLocaleString()} organic wholesale
                            </Text>
                            <Text style={styles.revenueDetail}>
                                {yieldSummary.total_yield_lbs?.toLocaleString()} lbs estimated
                            </Text>
                        </View>
                    )}

                    {/* Legend */}
                    <View style={styles.legend}>
                        {[['DS', Colors.primaryGreen, 'Direct Seed'],
                        ['TP', Colors.burntOrange, 'Transplant'],
                        ['Tray', Colors.softLavender, 'Seed to Tray'],
                        ['CC', Colors.mutedText, 'Cover Crop']].map(([lbl, color, full]) => (
                            <View key={lbl} style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: color }]} />
                                <Text style={styles.legendText}>{lbl} = {full}</Text>
                            </View>
                        ))}
                    </View>

                    {/* One row per bed (#3) */}
                    {bedGroups.map(({ bedNumber, entries }) => (
                        <BedRow key={bedNumber} bedNumber={bedNumber} entries={entries} />
                    ))}

                    <View style={{ height: 60 }} />
                </ScrollView>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundGrey,
        ...Platform.select({ web: { maxHeight: '100vh', overflow: 'hidden' } }),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 56,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen,
        gap: Spacing.sm,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    headerText: { flex: 1, gap: 2 },
    printBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    printBtnText: { fontSize: 20 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
    loadingText: { fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic' },
    scrollContent: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 80 },

    // Revenue card
    revenueCard: {
        backgroundColor: Colors.primaryGreen,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.sm,
        gap: 4,
    },
    revenueLabel: { fontSize: Typography.xs, color: Colors.warmTan, letterSpacing: 1, fontWeight: Typography.bold },
    revenueRange: { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.cream },
    revenueMid: { fontSize: Typography.sm, color: Colors.warmTan },
    revenueDetail: { fontSize: Typography.xs, color: 'rgba(245,245,220,0.6)', marginTop: 4 },

    // Legend
    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
        paddingHorizontal: Spacing.xs,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 10, color: Colors.mutedText },

    // Bed row (#3)
    bedRow: {
        backgroundColor: Colors.cardBg,
        borderRadius: Radius.md,
        flexDirection: 'row',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.12)',
        minHeight: 60,
    },
    bedLabelCol: {
        width: 40,
        backgroundColor: Colors.primaryGreen,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.sm,
    },
    bedLabel: { fontSize: 9, color: Colors.warmTan, fontWeight: Typography.bold, letterSpacing: 0.5 },
    bedNum: { fontSize: 16, color: Colors.cream, fontWeight: Typography.bold },
    bedScrollContent: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs },

    // Planting segment
    segmentWrapper: { flexDirection: 'row', alignItems: 'center' },
    segment: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: Radius.sm,
        borderWidth: 1,
        minWidth: 120,
        maxWidth: 160,
        gap: 2,
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    segPill: {
        alignSelf: 'flex-start',
        paddingVertical: 2,
        paddingHorizontal: 7,
        borderRadius: Radius.full,
        marginBottom: 3,
    },
    segPillText: { fontSize: 9, color: Colors.white, fontWeight: Typography.bold, letterSpacing: 0.5 },
    segCrop: { fontSize: 12, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    segVariety: { fontSize: 10, color: Colors.mutedText },
    segDate: { fontSize: 11, fontWeight: Typography.bold, color: Colors.darkText, marginTop: 2 },
    segDtm: { fontSize: 10, color: Colors.primaryGreen, opacity: 0.85 },   // #5: DTM·IGD
    segTray: { fontSize: 10, color: Colors.softLavender, fontWeight: Typography.semiBold }, // #7: tray date
    segSeed: { fontSize: 10, color: Colors.mutedText },                     // #1: seed/bed label
    segSpacing: { fontSize: 9, color: Colors.mutedText, opacity: 0.8 },
    segJang: { fontSize: 9, color: Colors.mutedText },
    segNotes: { fontSize: 9, color: Colors.burntOrange, fontStyle: 'italic' },
    segArrowWrap: { paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
    segArrow: { fontSize: 20, color: Colors.mutedText, opacity: 0.5 },
});
