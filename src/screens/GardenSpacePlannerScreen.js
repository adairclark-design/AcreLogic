/**
 * GardenSpacePlannerScreen.js
 * ════════════════════════════
 * Three-step wizard for the "Plan My Garden Space" free-tier flow.
 *
 * Step 1 — Space Dimensions
 *   • Length × Width inputs (feet)
 *   • Raised Bed toggle (shows height input when on)
 *   • Bed size: standard 4×8, or custom
 *   • Pathway width between beds
 *   • Paywall gate: > 1/10 acre (4,356 sq ft) → UpgradeModal
 *
 * Step 2 — Space Results
 *   • Visual bed-layout grid (rows of coloured rectangles)
 *   • Stats: total beds · growing area · efficiency %
 *   • Soil volume if raised beds (cu yd + bag count)
 *
 * Step 3 — Crop Plan
 *   • Family size stepper (same paywall gate as FamilyPlannerScreen)
 *   • Crop selection grid (same grid, same gates)
 *   • Report cards driven by calculateGardenPlan()
 *   • "Good Luck Gardening!" footer + Export stub
 */
import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    FlatList, TextInput, Image, Switch, Animated,
    Platform, useWindowDimensions, Alert,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import {
    checkSpaceGate, checkFamilyGate,
    LIMITS, TIER, getActiveTier, getUpgradePrompt,
} from '../services/tierLimits';
import {
    calculateBedsInSpace, calculateTotalSoilVolume,
    calculateGardenPlan,
} from '../services/homeGardenCalculator';
import UpgradeModal from '../components/UpgradeModal';
import CROP_IMAGES from '../data/cropImages';
import CROPS_DATA from '../data/crops.json';
import { exportGardenPlan } from '../services/planExporter';
import { loadSavedPlan } from '../services/persistence';

const ALL_CROPS = CROPS_DATA.crops ?? [];
const PLANTABLE_CROPS = ALL_CROPS.filter(c => c.category !== 'Cover Crop');

// Garden space flow: family size is always capped at 4 regardless of tier.
// (The Family Feeder flow scales with upgrades; the property planner doesn't.)
const MAX_GARDEN_FAMILY = 4;

// ─── Responsive columns (same as FamilyPlannerScreen) ────────────────────────
function getColumns(width) {
    if (width >= 1800) return 6;
    if (width >= 1400) return 5;
    if (width >= 1024) return 4;
    if (width >= 600)  return 3;
    return 2;
}

const CROP_CATEGORIES = ['All', 'Vegetables', 'Herbs', 'Flowers', 'Specialty'];
const VEG_CATS = new Set(['Greens', 'Brassica', 'Root', 'Allium', 'Legume', 'Nightshade', 'Cucurbit']);

function filterCrops(cat, query) {
    let list = PLANTABLE_CROPS;
    if (cat === 'Vegetables') list = list.filter(c => VEG_CATS.has(c.category));
    else if (cat === 'Herbs')     list = list.filter(c => c.category === 'Herb');
    else if (cat === 'Flowers')   list = list.filter(c => c.category === 'Flower');
    else if (cat === 'Specialty') list = list.filter(c => c.category === 'Specialty');
    if (query.trim()) list = list.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
    return list;
}

// ─── Compact CropCard (duplicated from FamilyPlannerScreen pattern) ────────
function CropCard({ crop, selected, onPress }) {
    return (
        <TouchableOpacity
            style={[styles.cropCard, selected && styles.cropCardSelected]}
            onPress={() => onPress(crop.id)}
            activeOpacity={0.8}
        >
            <Image
                source={CROP_IMAGES[crop.id]}
                style={[styles.cropCardImg, selected && styles.cropCardImgFaded]}
                resizeMode="cover"
            />
            {selected && (
                <View style={styles.cropCheckOverlay}>
                    <Text style={styles.cropCheckMark}>✓</Text>
                </View>
            )}
            <Text style={styles.cropCardName} numberOfLines={1}>{crop.name}</Text>
        </TouchableOpacity>
    );
}

// ─── Mini report card (same data as FamilyPlannerScreen ReportCard) ────────
function ReportCard({ item }) {
    if (!item.isSupported) return null;
    return (
        <View style={[styles.reportCard, Shadows.card]}>
            <View style={styles.reportHeader}>
                <Text style={styles.reportEmoji}>{item.emoji ?? '🌿'}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.reportName}>{item.cropName}</Text>
                    {item.variety ? <Text style={styles.reportVariety}>{item.variety}</Text> : null}
                </View>
            </View>

            <View style={styles.reportMetrics}>
                {item.isFlower ? (
                    <>
                        <MiniPill icon="💐" label="Stems/wk" value={`${item.stemsPerWeek}`} />
                        <MiniPill icon="📅" label="Season" value={`${item.weeksSeason} wks`} />
                        <MiniPill icon="🌿" label="Plants" value={`${item.seedsToStart}`} />
                    </>
                ) : (
                    <>
                        <MiniPill icon="🎯" label="Goal" value={`${item.targetLbs} lbs`} />
                        <MiniPill icon="📏" label="Row-ft" value={`${item.linearFeetNeeded} ft`} />
                        <MiniPill icon="🌿" label={item.seedType === 'TP' ? 'Transplants' : 'Plants'} value={`${item.seedsToStart}`} />
                    </>
                )}
            </View>

            <View style={styles.reportDivider} />
            <View style={styles.reportFacts}>
                {item.dtm      && <FactRow icon="⏱" label="Days to maturity"  value={`${item.dtm} days`} />}
                {item.seedType && <FactRow icon="🌱" label="Starting method"   value={item.seedType === 'DS' ? 'Direct Sow' : 'Transplant'} />}
                {/* Calendar dates — only when farmProfile was loaded */}
                {item.indoorSeedDate  && <FactRow icon="📅" label="Start seeds indoors" value={item.indoorSeedDate} />}
                {item.directSowDate   && <FactRow icon="📅" label="Direct sow date"     value={item.directSowDate} />}
                {item.transplantDate  && <FactRow icon="📅" label="Transplant date"     value={item.transplantDate} />}
                {/* Fallback if no profile: show relative weeks */}
                {!item.indoorSeedDate && item.seedType === 'TP' && item.seedStartWeeks
                               && <FactRow icon="📅" label="Start seeds"        value={`${item.seedStartWeeks} wks before last frost`} />}
                {item.harvestMethod    && <FactRow icon="✂️" label="Harvest method"  value={item.harvestMethod} />}
                {item.harvestFrequency && <FactRow icon="🔁" label="Frequency"       value={item.harvestFrequency} />}
                {item.season   && <FactRow icon="🗓" label="Season"            value={item.season} />}
            </View>
            {item.consumptionNotes && (
                <Text style={styles.reportNote}>💡 {item.consumptionNotes}</Text>
            )}
        </View>
    );
}
function MiniPill({ icon, label, value }) {
    return (
        <View style={styles.miniPill}>
            <Text style={styles.miniIcon}>{icon}</Text>
            <Text style={styles.miniValue}>{value}</Text>
            <Text style={styles.miniLabel}>{label}</Text>
        </View>
    );
}
function FactRow({ icon, label, value }) {
    return (
        <View style={styles.factRow}>
            <Text style={styles.factIcon}>{icon}</Text>
            <Text style={styles.factLabel}>{label}</Text>
            <Text style={styles.factValue}>{value}</Text>
        </View>
    );
}

// ─── Visual Bed Grid ─────────────────────────────────────────────────────────
/**
 * Renders a simple top-down schematic of the beds in the space.
 * Bed rectangles are drawn using proportional Views inside a ScrollView.
 */
function BedLayoutVisual({ spaceResult, containerWidth }) {
    if (!spaceResult || spaceResult.totalBeds === 0) return null;

    const {
        bedsAcrossWidth, bedsAlongLength,
        bedWidthFt, bedLengthFt, pathwayWidthFt,
        spaceLengthFt, spaceWidthFt,
        nsPathwayCount = 0, ewPathwayCount = 0,
        mainPathWidthFt = 0, equidistant = false,
        colGroups, rowGroups,
    } = spaceResult;

    const ratio       = containerWidth / (spaceWidthFt || 1);
    const scaledBedW  = bedWidthFt    * ratio;
    const scaledBedH  = bedLengthFt   * ratio;
    const scaledPathW = pathwayWidthFt * ratio;   // small bed-to-bed path
    const scaledMainW = mainPathWidthFt * ratio;  // wide wheelbarrow path
    const padding     = Math.max(scaledPathW / 2, 4);

    // Resolve groups (fallback if calculator hasn't populated them yet)
    const cGroups = (colGroups && colGroups.length) ? colGroups : [bedsAcrossWidth];
    const rGroups = (rowGroups && rowGroups.length) ? rowGroups : [bedsAlongLength];

    // In edge mode, paths live OUTSIDE the bed groups (east / south border)
    const showEastPath  = !equidistant && nsPathwayCount > 0 && scaledMainW > 0;
    const showSouthPath = !equidistant && ewPathwayCount > 0 && scaledMainW > 0;

    // Total height: sum of all row-group heights + E/W path gaps between groups
    // (in equidistant mode, ewPathwayCount gaps between rGroups.length groups)
    const totalBedRowH = bedsAlongLength * (scaledBedH + scaledPathW) - scaledPathW;
    const ewGapCount   = equidistant ? Math.max(0, rGroups.length - 1) : 0;
    const drawHeight   = padding * 2 + totalBedRowH + ewGapCount * scaledMainW
                         + (showSouthPath ? scaledMainW : 0);

    // Build all row-group and column-group positions
    const rowEls = [];
    let curRowIdx = 0;

    for (let rg = 0; rg < rGroups.length; rg++) {
        const rgSize = rGroups[rg];
        for (let r = 0; r < rgSize; r++) {
            const rowTop = padding
                + curRowIdx * (scaledBedH + scaledPathW)
                + (equidistant ? rg * scaledMainW : 0);

            // Build columns for this row
            const colEls = [];
            let curColIdx = 0;

            for (let cg = 0; cg < cGroups.length; cg++) {
                const cgSize = cGroups[cg];
                for (let c = 0; c < cgSize; c++) {
                    const isFirst = curColIdx === 0;
                    const isFirstInGroup = c === 0 && cg > 0;
                    const marginLeft = isFirst
                        ? padding
                        : isFirstInGroup && equidistant
                            ? scaledMainW    // wide path between equidistant groups
                            : scaledPathW;   // normal bed-to-bed path

                    colEls.push(
                        <View
                            key={curColIdx}
                            style={[styles.visualBed, {
                                width: scaledBedW,
                                height: scaledBedH,
                                marginLeft,
                            }]}
                        >
                            {scaledBedH > 20 && [0.25, 0.5, 0.75].map((frac, li) => (
                                <View key={li} style={[styles.visualBedRow, { top: `${frac * 100}%` }]} />
                            ))}
                        </View>
                    );
                    curColIdx++;
                }
            }

            // East-edge N/S path strip (edge mode only)
            if (showEastPath) {
                colEls.push(
                    <View key="east-path" style={{
                        width: scaledMainW, height: scaledBedH,
                        backgroundColor: '#B8A888', marginLeft: scaledPathW,
                    }} />
                );
            }

            rowEls.push(
                <View key={`rg${rg}_r${r}`} style={[styles.visualRow, { top: rowTop }]}>
                    {colEls}
                </View>
            );
            curRowIdx++;
        }
    }

    return (
        <View style={[styles.visual, { height: drawHeight, width: containerWidth }]}>
            {/* Background = pathway / ground */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#D4C5A9' }]} />

            {rowEls}

            {/* South E/W path strip (edge mode only) */}
            {showSouthPath && (
                <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: scaledMainW, backgroundColor: '#B8A888',
                }} />
            )}

            {/* Dimension labels */}
            <View style={styles.visualLabel}>
                <Text style={styles.visualLabelText}>
                    {spaceLengthFt}′ × {spaceWidthFt}′
                </Text>
            </View>

            {/* N/S Compass */}
            <View style={{
                position: 'absolute', top: 8, right: 8,
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.82)',
                borderRadius: 20, width: 36, height: 36,
                justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(45,79,30,0.25)',
            }}>
                <Text style={{ fontSize: 7, fontWeight: '800', color: '#2D4F1E', letterSpacing: 0.5, marginBottom: 1 }}>N</Text>
                <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderLeftColor: 'transparent', borderRightWidth: 4, borderRightColor: 'transparent', borderBottomWidth: 7, borderBottomColor: '#2D4F1E' }} />
                <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderLeftColor: 'transparent', borderRightWidth: 4, borderRightColor: 'transparent', borderTopWidth: 7, borderTopColor: 'rgba(45,79,30,0.3)' }} />
                <Text style={{ fontSize: 7, fontWeight: '800', color: 'rgba(45,79,30,0.5)', letterSpacing: 0.5, marginTop: 1 }}>S</Text>
            </View>
        </View>
    );
}

// ─── Labelled number input ────────────────────────────────────────────────────
function DimInput({ label, hint, value, onChangeText, suffix = 'ft', keyboardType = 'decimal-pad' }) {
    return (
        <View style={styles.dimRow}>
            <View style={styles.dimLabel}>
                <Text style={styles.dimLabelText}>{label}</Text>
                {hint ? <Text style={styles.dimHint}>{hint}</Text> : null}
            </View>
            <View style={styles.dimField}>
                <TextInput
                    style={styles.dimInput}
                    value={value}
                    onChangeText={onChangeText}
                    keyboardType={keyboardType}
                    placeholder="0"
                    placeholderTextColor={Colors.mutedText}
                    selectTextOnFocus
                />
                <Text style={styles.dimSuffix}>{suffix}</Text>
            </View>
        </View>
    );
}

// ─── Stat tiles ──────────────────────────────────────────────────────────────
function StatTile({ icon, label, value, sub, wide }) {
    return (
        <View style={[styles.statTile, wide && styles.statTileWide]}>
            <Text style={styles.statIcon}>{icon}</Text>
            <Text style={styles.statValue}>{value}</Text>
            {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GardenSpacePlannerScreen({ navigation }) {
    const { width } = useWindowDimensions();
    const numColumns = getColumns(width);
    const cardWidth = (width - Spacing.lg * 2 - Spacing.sm * (numColumns - 1)) / numColumns;

    // ── Step state ────────────────────────────────────────────────────────────
    const [step, setStep] = useState(1);   // 1 Dimensions | 2 Results | 3 Crops

    // ── Step 1: Dimension inputs ──────────────────────────────────────────────
    const [lengthFt, setLengthFt]       = useState('');
    const [widthFt, setWidthFt]         = useState('');
    const [isRaisedBed, setIsRaisedBed] = useState(false);
    const [bedHeightIn, setBedHeightIn] = useState('12');
    const [bedLengthFt, setBedLengthFt] = useState('8');
    const [bedWidthFt, setBedWidthFt]   = useState('4');
    const [pathwayFt, setPathwayFt]     = useState('2');
    // Orientation: NS = beds run north–south (default), EW = east–west
    const [orientation, setOrientation] = useState('NS');
    // Multi-pathway access aisles
    const [nsPathCount, setNsPathCount]       = useState(1);   // N/S vertical strips
    const [ewPathCount, setEwPathCount]       = useState(0);   // E/W horizontal strips
    const [mainPathWidthFt, setMainPathWidthFt] = useState('4'); // shared width
    const [equidistant, setEquidistant]       = useState(false); // false = edge, true = divided

    // ── Step 2: Calculated results ────────────────────────────────────────────
    const [spaceResult, setSpaceResult] = useState(null);
    const [soilResult,  setSoilResult]  = useState(null);

    // ── Step 3: Crops ─────────────────────────────────────────────────────────
    const [familySize, setFamilySize]   = useState(2);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [cropCategory, setCropCategory] = useState('All');
    const [cropSearch, setCropSearch]   = useState('');
    const [planResult, setPlanResult]   = useState(null);
    const [showReport, setShowReport]   = useState(false);   // within step 3

    // ── Upgrade modal ─────────────────────────────────────────────────────────
    const [upgradeVisible, setUpgradeVisible]   = useState(false);
    const [upgradeBlockedBy, setUpgradeBlockedBy] = useState(null);

    // ── Farm profile (for calendar dates in crop plan) ────────────────────────
    const [gardenFarmProfile, setGardenFarmProfile] = useState(null);
    useEffect(() => {
        const saved = loadSavedPlan();
        if (saved?.farmProfile) setGardenFarmProfile(saved.farmProfile);
    }, []);

    const slideAnim = useRef(new Animated.Value(0)).current;
    const limits = LIMITS[getActiveTier()] ?? LIMITS[TIER.FREE];

    const filteredCrops = filterCrops(cropCategory, cropSearch);

    // ─── Navigation helpers ───────────────────────────────────────────────────
    const goForward = (toStep) => {
        Animated.timing(slideAnim, { toValue: -width, duration: 200, useNativeDriver: true }).start(() => {
            setStep(toStep);
            slideAnim.setValue(width);
            Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }).start();
        });
    };
    const goBackward = (toStep) => {
        Animated.timing(slideAnim, { toValue: width, duration: 200, useNativeDriver: true }).start(() => {
            setStep(toStep);
            slideAnim.setValue(0);
        });
    };
    const handleBack = () => {
        if (showReport) { setShowReport(false); return; }
        if (step > 1) goBackward(step - 1);
        else navigation.goBack();
    };

    // ─── Step 1 → Step 2: calculate & gate ───────────────────────────────────
    const handleCalculate = () => {
        const l = parseFloat(lengthFt) || 0;
        const w = parseFloat(widthFt)  || 0;
        if (l <= 0 || w <= 0) {
            Alert.alert('Missing Dimensions', 'Please enter both a length and a width for your space.');
            return;
        }
        const sqFt = l * w;
        const gate = checkSpaceGate({ sqFt });
        if (!gate.allowed) {
            setUpgradeBlockedBy('plotSize');
            setUpgradeVisible(true);
            return;
        }

        // Apply orientation: EW swaps length ↔ width so beds run across the east–west axis
        const spaceLengthFt = orientation === 'EW' ? w : l;
        const spaceWidthFt  = orientation === 'EW' ? l : w;

        const result = calculateBedsInSpace({
            spaceLengthFt,
            spaceWidthFt,
            bedLengthFt:      parseFloat(bedLengthFt) || 8,
            bedWidthFt:       parseFloat(bedWidthFt)  || 4,
            pathwayWidthFt:   parseFloat(pathwayFt)   || 2,
            nsPathwayCount:   nsPathCount,
            ewPathwayCount:   ewPathCount,
            mainPathWidthFt:  parseFloat(mainPathWidthFt) || 4,
            equidistant,
            isRaisedBed,
            bedHeightIn:      parseFloat(bedHeightIn) || 12,
        });
        // Attach raw input for the visual
        result.spaceLengthFt = spaceLengthFt;
        result.spaceWidthFt  = spaceWidthFt;
        result.orientation   = orientation;

        setSpaceResult(result);

        if (isRaisedBed && result.totalBeds > 0) {
            const soil = calculateTotalSoilVolume(
                result.totalBeds,
                parseFloat(bedLengthFt) || 8,
                parseFloat(bedWidthFt)  || 4,
                parseFloat(bedHeightIn) || 12
            );
            setSoilResult(soil);
        } else {
            setSoilResult(null);
        }

        goForward(2);
    };

    // ─── Step 3: family & crop gates ─────────────────────────────────────────
    const adjustFamily = (delta) => {
        const next = Math.max(1, familySize + delta);
        if (next > MAX_GARDEN_FAMILY) {
            // Garden space planner is hard-capped at 4 — show upgrade modal
            setUpgradeBlockedBy('familySize');
            setUpgradeVisible(true);
            return;
        }
        setFamilySize(next);
    };

    const toggleCrop = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) { next.delete(id); setSelectedIds(next); return; }
        const gate = checkFamilyGate({ familySize, cropCount: next.size + 1 });
        if (!gate.allowed && gate.blockedBy === 'cropCount') {
            setUpgradeBlockedBy('cropCount');
            setUpgradeVisible(true);
            return;
        }
        next.add(id);
        setSelectedIds(next);
    };

    const generatePlan = () => {
        const crops = ALL_CROPS.filter(c => selectedIds.has(c.id));
        const result = calculateGardenPlan(crops, familySize, gardenFarmProfile);
        setPlanResult(result);
        setShowReport(true);
    };

    const handleExport = () => {
        if (!planResult || !spaceResult) return;
        exportGardenPlan(planResult, spaceResult, familySize).catch(err =>
            Alert.alert('Export failed', String(err?.message ?? err))
        );
    };

    // ─── Heading text ─────────────────────────────────────────────────────────
    const HEADINGS = {
        1: { step: 'STEP 1 OF 3', title: 'Your Garden Space' },
        2: { step: 'STEP 2 OF 3', title: 'Space Results' },
        3: { step: 'STEP 3 OF 3', title: showReport ? 'Your Planting Plan' : 'Crops & Family' },
    };

    return (
        <View style={styles.container}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>{HEADINGS[step].step}</Text>
                    <Text style={styles.heading}>{HEADINGS[step].title}</Text>
                </View>
                {step === 3 && selectedIds.size > 0 && !showReport && (
                    <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{selectedIds.size}</Text>
                    </View>
                )}
            </View>

            {/* ── Animated body ── */}
            <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: slideAnim }] }]}>

                {/* ══════ STEP 1: DIMENSIONS ══════ */}
                {step === 1 && (
                    <ScrollView
                        contentContainerStyle={styles.formScroll}
                        showsVerticalScrollIndicator={false}
                        style={Platform.OS === 'web' ? { overflowY: 'auto' } : {}}
                    >
                        <Text style={styles.sectionTitle}>Space Dimensions</Text>

                        <DimInput
                            label="Length"
                            hint="The longest side of your space"
                            value={lengthFt}
                            onChangeText={setLengthFt}
                        />
                        <DimInput
                            label="Width"
                            hint="The shorter side of your space"
                            value={widthFt}
                            onChangeText={setWidthFt}
                        />

                        {/* Area preview */}
                        {!!lengthFt && !!widthFt && parseFloat(lengthFt) > 0 && parseFloat(widthFt) > 0 && (
                            <View style={styles.areaPreview}>
                                <Text style={styles.areaPreviewText}>
                                    📐 {(parseFloat(lengthFt) * parseFloat(widthFt)).toLocaleString()} sq ft
                                    {' '}·{' '}
                                    {((parseFloat(lengthFt) * parseFloat(widthFt)) / 43560).toFixed(4)} acres
                                    {(parseFloat(lengthFt) * parseFloat(widthFt)) > limits.maxSqFtPlot && (
                                        <Text style={styles.areaOverLimit}> ⚠ over free-tier limit</Text>
                                    )}
                                </Text>
                            </View>
                        )}

                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>Bed Configuration</Text>

                        {/* Raised bed toggle */}
                        <View style={styles.toggleRow}>
                            <View style={styles.dimLabel}>
                                <Text style={styles.dimLabelText}>Raised Beds?</Text>
                                <Text style={styles.dimHint}>Toggle on if using raised bed frames</Text>
                            </View>
                            <Switch
                                value={isRaisedBed}
                                onValueChange={setIsRaisedBed}
                                trackColor={{ true: Colors.primaryGreen, false: '#ccc' }}
                                thumbColor={isRaisedBed ? Colors.warmTan : '#f4f3f4'}
                            />
                        </View>

                        {isRaisedBed && (
                            <DimInput
                                label="Bed Height"
                                hint="Height of your raised bed frame"
                                value={bedHeightIn}
                                onChangeText={setBedHeightIn}
                                suffix="in"
                            />
                        )}

                        <DimInput
                            label="Bed Length"
                            hint="Length of each individual bed"
                            value={bedLengthFt}
                            onChangeText={setBedLengthFt}
                        />
                        <DimInput
                            label="Bed Width"
                            hint='4ft is standard (reachable from both sides)'
                            value={bedWidthFt}
                            onChangeText={setBedWidthFt}
                        />

                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>Orientation</Text>

                        {/* N/S vs E/W toggle */}
                        <View style={styles.dimRow}>
                            <View style={styles.dimLabel}>
                                <Text style={styles.dimLabelText}>Bed Orientation</Text>
                                <Text style={styles.dimHint}>N/S maximises sun; E/W suits slope drainage</Text>
                            </View>
                            <View style={styles.segRow}>
                                {['NS', 'EW'].map(opt => (
                                    <TouchableOpacity
                                        key={opt}
                                        style={[styles.segBtn, orientation === opt && styles.segBtnActive]}
                                        onPress={() => setOrientation(opt)}
                                    >
                                        <Text style={[styles.segBtnText, orientation === opt && styles.segBtnTextActive]}>
                                            {opt === 'NS' ? '↕ N/S' : '↔ E/W'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>Pathways</Text>

                        <DimInput
                            label="Path Width"
                            hint="Space between beds (min 2ft for comfort)"
                            value={pathwayFt}
                            onChangeText={setPathwayFt}
                        />

                        {/* ── Multi-pathway access aisles ─────────────────── */}
                        <View style={styles.sectionSubheader}>
                            <Text style={styles.dimLabelText}>Access Pathways (Wheelbarrow / UTV)</Text>
                            <Text style={styles.dimHint}>Wider aisles for equipment · 4ft fits a wheelbarrow · 6ft fits a UTV</Text>
                        </View>

                        {/* N/S path stepper */}
                        <View style={styles.stepperRow}>
                            <View style={styles.dimLabel}>
                                <Text style={styles.dimLabelText}>↕ N/S Paths</Text>
                                <Text style={styles.dimHint}>Vertical strips running north to south</Text>
                            </View>
                            <View style={styles.stepper}>
                                <TouchableOpacity
                                    style={styles.stepperBtn}
                                    onPress={() => setNsPathCount(c => Math.max(0, c - 1))}
                                >
                                    <Text style={styles.stepperBtnText}>−</Text>
                                </TouchableOpacity>
                                <Text style={styles.stepperVal}>{nsPathCount}</Text>
                                <TouchableOpacity
                                    style={styles.stepperBtn}
                                    onPress={() => setNsPathCount(c => Math.min(6, c + 1))}
                                >
                                    <Text style={styles.stepperBtnText}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* E/W path stepper */}
                        <View style={styles.stepperRow}>
                            <View style={styles.dimLabel}>
                                <Text style={styles.dimLabelText}>↔ E/W Paths</Text>
                                <Text style={styles.dimHint}>Horizontal strips running east to west</Text>
                            </View>
                            <View style={styles.stepper}>
                                <TouchableOpacity
                                    style={styles.stepperBtn}
                                    onPress={() => setEwPathCount(c => Math.max(0, c - 1))}
                                >
                                    <Text style={styles.stepperBtnText}>−</Text>
                                </TouchableOpacity>
                                <Text style={styles.stepperVal}>{ewPathCount}</Text>
                                <TouchableOpacity
                                    style={styles.stepperBtn}
                                    onPress={() => setEwPathCount(c => Math.min(6, c + 1))}
                                >
                                    <Text style={styles.stepperBtnText}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Width + placement (only shown if any paths) */}
                        {(nsPathCount > 0 || ewPathCount > 0) && (
                            <>
                                <DimInput
                                    label="Path Width"
                                    hint="Shared width for all access paths"
                                    value={mainPathWidthFt}
                                    onChangeText={setMainPathWidthFt}
                                />
                                <View style={styles.dimRow}>
                                    <View style={styles.dimLabel}>
                                        <Text style={styles.dimLabelText}>Placement</Text>
                                        <Text style={styles.dimHint}>Edge = path at border · Even = paths divide space equally</Text>
                                    </View>
                                    <View style={styles.segRow}>
                                        {[false, true].map(opt => (
                                            <TouchableOpacity
                                                key={String(opt)}
                                                style={[styles.segBtn, equidistant === opt && styles.segBtnActive]}
                                                onPress={() => setEquidistant(opt)}
                                            >
                                                <Text style={[styles.segBtnText, equidistant === opt && styles.segBtnTextActive]}>
                                                    {opt ? 'Even' : 'Edge'}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </>
                        )}

                        {/* Free-tier note */}
                        {getActiveTier() === TIER.FREE && (
                            <View style={styles.tierNote}>
                                <Text style={styles.tierNoteText}>
                                    🌱 Free plan supports spaces up to {(limits.maxSqFtPlot).toLocaleString()} sq ft (1/10 acre).
                                    Upgrade for unlimited acreage.
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.primaryBtn, Shadows.button, { marginTop: Spacing.lg }]}
                            onPress={handleCalculate}
                        >
                            <Text style={styles.primaryBtnText}>Calculate My Space →</Text>
                        </TouchableOpacity>

                        <View style={{ height: Spacing.xl }} />
                    </ScrollView>
                )}

                {/* ══════ STEP 2: RESULTS ══════ */}
                {step === 2 && spaceResult && (
                    <ScrollView
                        contentContainerStyle={styles.resultsScroll}
                        showsVerticalScrollIndicator={false}
                        style={Platform.OS === 'web' ? { overflowY: 'auto' } : {}}
                    >
                        {/* Bed layout visual */}
                        <View style={styles.visualContainer}>
                            <Text style={styles.visualTitle}>Your Space Layout</Text>
                            <BedLayoutVisual
                                spaceResult={spaceResult}
                                containerWidth={width - Spacing.lg * 2}
                            />
                            {spaceResult.totalBeds === 0 && (
                                <View style={styles.noBedsBanner}>
                                    <Text style={styles.noBedsText}>
                                        ⚠️ No beds fit with current settings. Try narrower pathways or smaller beds.
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Stat tiles row 1 */}
                        <View style={styles.statsRow}>
                            <StatTile
                                icon="🛏"
                                label="Total Beds"
                                value={spaceResult.totalBeds}
                                sub={`${spaceResult.bedsAcrossWidth} × ${spaceResult.bedsAlongLength}`}
                            />
                            <StatTile
                                icon="🌿"
                                label="Growing Area"
                                value={`${spaceResult.bedAreaSqFt.toLocaleString()} sq ft`}
                            />
                            <StatTile
                                icon="📊"
                                label="Efficiency"
                                value={`${spaceResult.efficiency}%`}
                                sub="of total space"
                            />
                        </View>

                        {/* Bed size detail */}
                        <View style={styles.infoCard}>
                            <Text style={styles.infoCardTitle}>📐 Bed Specifications</Text>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Individual bed size</Text>
                                <Text style={styles.infoValue}>
                                    {spaceResult.bedLengthFt}′ × {spaceResult.bedWidthFt}′
                                    ({(spaceResult.bedLengthFt * spaceResult.bedWidthFt)} sq ft)
                                </Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Orientation</Text>
                                <Text style={styles.infoValue}>
                                    {spaceResult.orientation === 'EW' ? '↔ East–West' : '↕ North–South'}
                                </Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Path between beds</Text>
                                <Text style={styles.infoValue}>{spaceResult.pathwayWidthFt}′</Text>
                            </View>
                            {spaceResult.nsPathwayCount > 0 && (
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>↕ N/S access paths</Text>
                                    <Text style={styles.infoValue}>
                                        {spaceResult.nsPathwayCount} × {spaceResult.mainPathWidthFt}′
                                        {spaceResult.equidistant ? ' (equidistant)' : ' (edge)'}
                                    </Text>
                                </View>
                            )}
                            {spaceResult.ewPathwayCount > 0 && (
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>↔ E/W access paths</Text>
                                    <Text style={styles.infoValue}>
                                        {spaceResult.ewPathwayCount} × {spaceResult.mainPathWidthFt}′
                                        {spaceResult.equidistant ? ' (equidistant)' : ' (edge)'}
                                    </Text>
                                </View>
                            )}
                            {spaceResult.nsPathwayCount === 0 && spaceResult.ewPathwayCount === 0 && (
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Access paths</Text>
                                    <Text style={[styles.infoValue, { color: Colors.mutedText }]}>None</Text>
                                </View>
                            )}
                        </View>

                        {/* Soil volume card (raised beds only) */}
                        {isRaisedBed && soilResult && (
                            <View style={[styles.infoCard, styles.soilCard]}>
                                <Text style={styles.infoCardTitle}>🌱 Soil Required</Text>
                                <View style={styles.soilRow}>
                                    <StatTile
                                        icon="🪣"
                                        label="Cubic Yards"
                                        value={soilResult.total.displayYards}
                                        wide
                                    />
                                    <StatTile
                                        icon="🛍"
                                        label="Standard Bags"
                                        value={soilResult.total.displayBags}
                                        wide
                                    />
                                </View>
                                <Text style={styles.soilNote}>
                                    Based on {spaceResult.totalBeds} beds × {bedLengthFt}′ × {bedWidthFt}′ × {bedHeightIn}″ height.
                                    Bags are 2 cu ft standard size.
                                </Text>
                            </View>
                        )}

                        {/* Note about self-planning */}
                        <View style={styles.plannerNote}>
                            <Text style={styles.plannerNoteTitle}>🖊 Design Your Layout</Text>
                            <Text style={styles.plannerNoteText}>
                                Use the interactive Layout Designer to drag, rotate, and arrange
                                your {spaceResult.totalBeds} beds visually, then assign crops to each one.
                                Or skip straight to crop planning.
                            </Text>
                        </View>

                        {/* Actions */}
                        <View style={styles.actionRow}>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={() => goBackward(1)}>
                                <Text style={styles.secondaryBtnText}>← Adjust Space</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.primaryBtn, Shadows.button, { flex: 1, backgroundColor: '#2D4F1E' }]}
                                onPress={() => navigation.navigate('VisualBedLayout', {
                                    spaceJson: JSON.stringify(spaceResult),
                                    orientation,
                                })}
                            >
                                <Text style={styles.primaryBtnText}>🖊 Design Layout</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            style={[styles.secondaryBtn, { marginTop: 8 }]}
                            onPress={() => goForward(3)}
                        >
                            <Text style={styles.secondaryBtnText}>Plan My Crops → (skip layout)</Text>
                        </TouchableOpacity>


                        <View style={{ height: Spacing.xl }} />
                    </ScrollView>
                )}

                {/* ══════ STEP 3: CROPS ══════ */}
                {step === 3 && !showReport && (
                    <View style={{ flex: 1 }}>
                        {/* Family size row */}
                        <View style={styles.familyRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.familyTitle}>Family Size</Text>
                                <Text style={styles.familyHint}>Quantities are sized to feed everyone.</Text>
                            </View>
                            <View style={styles.stepper}>
                                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustFamily(-1)}>
                                    <Text style={styles.stepperBtnText}>−</Text>
                                </TouchableOpacity>
                                <Text style={styles.stepperValue}>
                                    {familySize >= MAX_GARDEN_FAMILY ? `${MAX_GARDEN_FAMILY}+` : familySize}
                                </Text>
                                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustFamily(+1)}>
                                    <Text style={styles.stepperBtnText}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Space context reminder */}
                        <View style={styles.spaceReminder}>
                            <Text style={styles.spaceReminderText}>
                                🛏 {spaceResult?.totalBeds ?? 0} beds available in your space ·{' '}
                                you'll decide what fits where
                            </Text>
                        </View>

                        {/* Free-tier bar */}
                        {getActiveTier() === TIER.FREE && (
                            <View style={styles.tierBar}>
                                <Text style={styles.tierBarText}>
                                    🌱 Free · up to {limits.maxFamilyMembers} people · {limits.maxCropsSelected} crops
                                </Text>
                                <Text style={styles.tierBarCount}>{selectedIds.size}/{limits.maxCropsSelected}</Text>
                            </View>
                        )}

                        {/* Category chips */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={{ flexGrow: 0, flexShrink: 0 }}
                            contentContainerStyle={styles.chipsContent}
                        >
                            {CROP_CATEGORIES.map(cat => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[styles.chip, cropCategory === cat && styles.chipActive]}
                                    onPress={() => setCropCategory(cat)}
                                >
                                    <Text style={[styles.chipText, cropCategory === cat && styles.chipTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Search */}
                        <View style={styles.searchRow}>
                            <Text style={{ paddingLeft: 12, fontSize: 15 }}>🔍</Text>
                            <TextInput
                                style={styles.searchInput}
                                value={cropSearch}
                                onChangeText={setCropSearch}
                                placeholder="Search crops..."
                                placeholderTextColor={Colors.mutedText}
                                clearButtonMode="while-editing"
                            />
                        </View>

                        {/* Crop grid */}
                        <FlatList
                            data={filteredCrops}
                            keyExtractor={item => item.id}
                            numColumns={numColumns}
                            key={numColumns}
                            contentContainerStyle={[styles.grid, { paddingBottom: 120 }]}
                            columnWrapperStyle={numColumns > 1 ? { gap: Spacing.sm, marginBottom: Spacing.sm } : undefined}
                            showsVerticalScrollIndicator={false}
                            style={Platform.OS === 'web' ? { overflowY: 'scroll', flex: 1 } : { flex: 1 }}
                            renderItem={({ item }) => (
                                <View style={{ width: cardWidth }}>
                                    <CropCard
                                        crop={item}
                                        selected={selectedIds.has(item.id)}
                                        onPress={toggleCrop}
                                    />
                                </View>
                            )}
                        />

                        {/* Sticky footer */}
                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[styles.primaryBtn, Shadows.button,
                                    selectedIds.size === 0 && styles.primaryBtnDisabled]}
                                onPress={generatePlan}
                                disabled={selectedIds.size === 0}
                            >
                                <Text style={styles.primaryBtnText}>
                                    {selectedIds.size === 0
                                        ? 'Select at least 1 crop'
                                        : `See My Plan for ${selectedIds.size} Crop${selectedIds.size !== 1 ? 's' : ''} →`}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* ══════ STEP 3 REPORT ══════ */}
                {step === 3 && showReport && planResult && (
                    <View style={{ flex: 1 }}>
                        {/* Summary bar */}
                        <View style={styles.summaryBar}>
                            <SummaryCell label="Crops" value={planResult.supported.length} />
                            <View style={styles.sumDiv} />
                            <SummaryCell label="Row-ft" value={planResult.totalLinearFt} />
                            <View style={styles.sumDiv} />
                            <SummaryCell label="Beds" value={spaceResult?.totalBeds ?? '—'} />
                            <View style={styles.sumDiv} />
                            <SummaryCell label="Family" value={familySize} />
                        </View>

                        {/* Compatibility note */}
                        <View style={styles.compatNote}>
                            <Text style={styles.compatNoteText}>
                                You have <Text style={{ fontWeight: '700' }}>{spaceResult?.totalBeds ?? 0} beds</Text> available.
                                The plan below tells you how much to grow — organising what fits in each bed is up to you.
                            </Text>
                        </View>

                        <FlatList
                            data={planResult.supported}
                            keyExtractor={item => item.cropId}
                            contentContainerStyle={styles.reportList}
                            showsVerticalScrollIndicator={false}
                            style={Platform.OS === 'web' ? { overflowY: 'scroll', flex: 1 } : { flex: 1 }}
                            ListFooterComponent={() => (
                                <View style={styles.goodLuck}>
                                    <Text style={{ fontSize: 48, marginBottom: Spacing.sm }}>🥬</Text>
                                    <Text style={styles.goodLuckTitle}>Good Luck Gardening!</Text>
                                    <Text style={styles.goodLuckSub}>Happy planting this season.</Text>
                                </View>
                            )}
                            renderItem={({ item }) => <ReportCard item={item} />}
                        />

                        <View style={styles.footer}>
                            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                                <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => setShowReport(false)}>
                                    <Text style={styles.secondaryBtnText}>✏️  Edit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.primaryBtn, Shadows.button, { flex: 2 }]} onPress={handleExport}>
                                    <Text style={styles.primaryBtnText}>Export PDF →</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

            </Animated.View>

            {/* Upgrade modal */}
            <UpgradeModal
                visible={upgradeVisible}
                blockedBy={upgradeBlockedBy}
                onDismiss={() => setUpgradeVisible(false)}
                onUpgrade={() => { setUpgradeVisible(false); navigation.navigate('Pricing'); }}
            />
        </View>
    );
}

// ─── Summary cell ─────────────────────────────────────────────────────────────
function SummaryCell({ label, value }) {
    return (
        <View style={styles.sumCell}>
            <Text style={styles.sumValue}>{value}</Text>
            <Text style={styles.sumLabel}>{label}</Text>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundGrey,
        ...Platform.select({ web: { maxHeight: '100dvh' } }),
    },

    // ── Header ────────────────────────────────────────────────────────────────
    header: {
        backgroundColor: Colors.primaryGreen,
        paddingTop: 54,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading:   { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    countBadge: {
        backgroundColor: Colors.burntOrange,
        width: 28, height: 28, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    countBadgeText: { color: Colors.white, fontSize: Typography.xs, fontWeight: Typography.bold },

    // ── Step 1 form ───────────────────────────────────────────────────────────
    formScroll: { padding: Spacing.lg, gap: Spacing.sm },
    sectionTitle: {
        fontSize: Typography.sm, fontWeight: Typography.bold,
        color: Colors.primaryGreen, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 2,
    },
    divider: { height: 1, backgroundColor: 'rgba(45,79,30,0.12)', marginVertical: Spacing.md },

    dimRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.white, borderRadius: Radius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.12)',
        gap: Spacing.sm,
    },
    dimLabel: { flex: 1 },
    dimLabelText: { fontSize: Typography.base, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    dimHint:      { fontSize: Typography.xs, color: Colors.mutedText, marginTop: 1 },
    dimField:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dimInput: {
        fontSize: Typography.xl, fontWeight: Typography.bold,
        color: Colors.primaryGreen, minWidth: 64, textAlign: 'right',
        paddingVertical: 4,
    },
    dimSuffix: { fontSize: Typography.sm, color: Colors.mutedText, fontWeight: Typography.medium },

    toggleRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.white, borderRadius: Radius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.12)',
        gap: Spacing.sm,
    },

    // Section sub-header (label + hint, no border)
    sectionSubheader: {
        paddingVertical: Spacing.xs,
    },

    // Stepper row (label + –/value/+ control)
    stepperRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.white, borderRadius: Radius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.12)',
        gap: Spacing.sm,
    },
    stepper: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.2)',
        borderRadius: Radius.full, overflow: 'hidden',
    },
    stepperBtn: {
        paddingHorizontal: 14, paddingVertical: 6,
        backgroundColor: Colors.white,
    },
    stepperBtnText: { fontSize: 18, color: Colors.primaryGreen, fontWeight: '600' },
    stepperVal: {
        minWidth: 32, textAlign: 'center',
        fontSize: Typography.md, fontWeight: Typography.bold,
        color: Colors.primaryGreen,
    },


    // Orientation segment
    segRow: { flexDirection: 'row', gap: 6 },
    segBtn: {
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.full,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', backgroundColor: Colors.white,
    },
    segBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    segBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },
    segBtnTextActive: { color: Colors.cream },

    areaPreview: {
        backgroundColor: 'rgba(45,79,30,0.07)',
        borderRadius: Radius.sm, padding: Spacing.sm,
    },
    areaPreviewText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.medium },
    areaOverLimit:   { color: Colors.burntOrange },

    explainer: {
        backgroundColor: 'rgba(210,180,140,0.15)',
        borderRadius: Radius.sm, padding: Spacing.sm,
        borderLeftWidth: 3, borderLeftColor: Colors.warmTan,
    },
    explainerText: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 16 },

    tierNote: {
        backgroundColor: 'rgba(45,79,30,0.07)',
        borderRadius: Radius.sm, padding: Spacing.sm,
    },
    tierNoteText: { fontSize: Typography.xs, color: Colors.primaryGreen, lineHeight: 16 },

    // ── Step 2 results ────────────────────────────────────────────────────────
    resultsScroll: { padding: Spacing.lg, gap: Spacing.lg },

    visualContainer: { gap: Spacing.sm },
    visualTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen, letterSpacing: 0.5 },

    visual: {
        borderRadius: Radius.md,
        overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.2)',
        position: 'relative',
    },
    visualRow: {
        position: 'absolute',
        left: 0,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    visualBed: {
        backgroundColor: '#5A8A3C',
        borderRadius: 3,
        overflow: 'hidden',
        position: 'relative',
    },
    visualBedRow: {
        position: 'absolute',
        left: 4, right: 4,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    visualLabel: {
        position: 'absolute',
        bottom: 4, right: 6,
    },
    visualLabelText: {
        fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: Typography.bold,
    },

    noBedsBanner: {
        backgroundColor: 'rgba(204,85,0,0.1)',
        borderRadius: Radius.sm, padding: Spacing.sm,
        borderLeftWidth: 3, borderLeftColor: Colors.burntOrange,
    },
    noBedsText: { fontSize: Typography.xs, color: Colors.burntOrange, lineHeight: 16 },

    statsRow: { flexDirection: 'row', gap: Spacing.sm },
    statTile: {
        flex: 1, alignItems: 'center',
        backgroundColor: Colors.white,
        borderRadius: Radius.md, padding: Spacing.sm,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
        gap: 2,
    },
    statTileWide: { flex: 2 },
    statIcon:  { fontSize: 22, marginBottom: 2 },
    statValue: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.primaryGreen, textAlign: 'center' },
    statSub:   { fontSize: 9, color: Colors.mutedText, textAlign: 'center' },
    statLabel: { fontSize: 10, color: Colors.mutedText, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },

    infoCard: {
        backgroundColor: Colors.white,
        borderRadius: Radius.lg, padding: Spacing.md,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
        gap: Spacing.xs,
    },
    soilCard: { backgroundColor: 'rgba(45,79,30,0.04)' },
    infoCardTitle: {
        fontSize: Typography.sm, fontWeight: Typography.bold,
        color: Colors.primaryGreen, marginBottom: 4,
    },
    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.06)',
    },
    infoLabel: { fontSize: Typography.xs, color: Colors.mutedText },
    infoValue: { fontSize: Typography.xs, color: Colors.darkText, fontWeight: Typography.semiBold },

    soilRow: { flexDirection: 'row', gap: Spacing.sm },
    soilNote: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 14, marginTop: 4 },

    plannerNote: {
        backgroundColor: 'rgba(181,126,220,0.08)',
        borderRadius: Radius.md, padding: Spacing.md,
        borderLeftWidth: 3, borderLeftColor: Colors.softLavender,
    },
    plannerNoteTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen, marginBottom: 4 },
    plannerNoteText:  { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 16 },

    actionRow: { flexDirection: 'row', gap: Spacing.sm },

    // ── Step 3 crop selection ──────────────────────────────────────────────────
    familyRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        backgroundColor: Colors.white,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.10)',
        gap: Spacing.sm,
    },
    familyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.primaryGreen },
    familyHint:  { fontSize: Typography.xs, color: Colors.mutedText, marginTop: 2 },
    stepper:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    stepperBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryGreen, alignItems: 'center', justifyContent: 'center' },
    stepperBtnText: { color: Colors.cream, fontSize: 20, lineHeight: 22, fontWeight: Typography.bold },
    stepperValue:   { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.primaryGreen, minWidth: 44, textAlign: 'center' },

    spaceReminder: {
        backgroundColor: 'rgba(45,79,30,0.06)',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
    },
    spaceReminderText: { fontSize: Typography.xs, color: Colors.primaryGreen },

    tierBar: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: 'rgba(45,79,30,0.07)',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.08)',
    },
    tierBarText:  { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.medium },
    tierBarCount: { fontSize: Typography.xs, color: Colors.mutedText },

    chipsContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
    chip:         { paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)' },
    chipActive:   { backgroundColor: Colors.primaryGreen },
    chipText:     { fontSize: Typography.sm, color: Colors.primaryGreen, fontWeight: Typography.medium },
    chipTextActive: { color: Colors.cream },

    searchRow: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
        borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.9)',
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
    },
    searchInput: {
        flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: 10,
        fontSize: Typography.sm, color: Colors.primaryGreen,
    },

    grid: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    cropCard: {
        backgroundColor: Colors.white, borderRadius: Radius.md, overflow: 'hidden',
        borderWidth: 2, borderColor: 'rgba(181,126,220,0.3)',
        alignItems: 'center', paddingBottom: Spacing.xs,
    },
    cropCardSelected:  { borderColor: Colors.primaryGreen, borderWidth: 2.5 },
    cropCardImg:       { width: '100%', height: 90 },
    cropCardImgFaded:  { opacity: 0.35 },
    cropCheckOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' },
    cropCheckMark:    { fontSize: 24, color: Colors.primaryGreen, fontWeight: Typography.bold },
    cropCardName:     { fontSize: 11, fontWeight: Typography.semiBold, color: Colors.primaryGreen, textAlign: 'center', paddingHorizontal: 4, paddingTop: 4 },

    // ── Step 3 report ─────────────────────────────────────────────────────────
    summaryBar: {
        flexDirection: 'row', backgroundColor: Colors.primaryGreen,
        paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
        justifyContent: 'space-around', alignItems: 'center',
    },
    sumCell: { alignItems: 'center', flex: 1 },
    sumValue: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.cream },
    sumLabel: { fontSize: 9, color: Colors.warmTan, letterSpacing: 0.5, textTransform: 'uppercase' },
    sumDiv:   { width: 1, height: 28, backgroundColor: 'rgba(245,245,220,0.2)' },

    compatNote: {
        backgroundColor: 'rgba(45,79,30,0.06)',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.08)',
    },
    compatNoteText: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 16 },

    reportList: { padding: Spacing.lg, paddingBottom: 120, gap: Spacing.md },

    reportCard: {
        backgroundColor: Colors.white, borderRadius: Radius.lg,
        overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
    },
    reportHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primaryGreen, padding: Spacing.md },
    reportEmoji:   { fontSize: 32 },
    reportName:    { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.cream },
    reportVariety: { fontSize: Typography.xs, color: Colors.warmTan, marginTop: 1 },

    reportMetrics: {
        flexDirection: 'row', justifyContent: 'space-around',
        paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
        backgroundColor: 'rgba(45,79,30,0.04)',
    },
    miniPill:   { alignItems: 'center', flex: 1 },
    miniIcon:   { fontSize: 18, marginBottom: 2 },
    miniValue:  { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.primaryGreen },
    miniLabel:  { fontSize: 9, color: Colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

    reportDivider: { height: 1, backgroundColor: 'rgba(45,79,30,0.08)', marginHorizontal: Spacing.md },
    reportFacts:   { padding: Spacing.md, gap: 6 },
    factRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    factIcon:  { width: 20, textAlign: 'center', fontSize: 13 },
    factLabel: { fontSize: Typography.xs, color: Colors.mutedText, flex: 1, fontWeight: Typography.medium },
    factValue: { fontSize: Typography.xs, color: Colors.darkText, fontWeight: Typography.semiBold, textAlign: 'right' },
    reportNote: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic', lineHeight: 15, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },

    goodLuck: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
    goodLuckTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.primaryGreen },
    goodLuckSub:   { fontSize: Typography.sm, color: Colors.mutedText },

    // ── Shared buttons & footer ───────────────────────────────────────────────
    footer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: Spacing.md,
        backgroundColor: Colors.backgroundGrey,
        borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.12)',
        ...Platform.select({
            web: { paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' },
            default: { paddingBottom: Spacing.lg },
        }),
    },
    primaryBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 16, borderRadius: Radius.md, alignItems: 'center',
    },
    primaryBtnDisabled: { opacity: 0.45, backgroundColor: Colors.mutedText },
    primaryBtnText: { color: Colors.cream, fontSize: Typography.md, fontWeight: Typography.bold, letterSpacing: 0.8 },
    secondaryBtn: {
        borderWidth: 1.5, borderColor: Colors.primaryGreen,
        paddingVertical: 15, borderRadius: Radius.md, alignItems: 'center',
        paddingHorizontal: Spacing.md,
    },
    secondaryBtnText: { color: Colors.primaryGreen, fontSize: Typography.base, fontWeight: Typography.semiBold },
});
