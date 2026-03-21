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
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    FlatList, TextInput, Image, Switch, Animated,
    Platform, useWindowDimensions, Alert, ActivityIndicator,
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
import ActionCalendar from '../components/ActionCalendar';
import SeedShoppingList from '../components/SeedShoppingList';
import YieldForecast from '../components/YieldForecast';
import CROP_IMAGES from '../data/cropImages';
import CROPS_DATA from '../data/crops.json';
import { exportGardenPlan } from '../services/planExporter';
import { loadSavedPlan } from '../services/persistence';
import {
    fetchFarmProfile,
    USDA_ZONES,
    getProfileFromZone,
    formatDateDisplay,
} from '../services/climateService';
import { formatCropDisplayName, formatVarietyLabel } from '../utils/cropDisplay';
import { useFocusEffect } from '@react-navigation/native';
import MegaMenuBar from '../components/MegaMenuBar';
import SharedCropCard from '../components/SharedCropCard';

const ALL_CROPS = CROPS_DATA.crops ?? [];
const PLANTABLE_CROPS = ALL_CROPS; // Cover Crops included — visible under the "Cover Crops" MegaMenuBar tab

// Garden space flow: family size is always capped at 4 regardless of tier.
// (The Family Feed// ── Crop selection grid — compact, many columns (matches FamilyPlannerScreen) ────────────────
function getCropGridColumns(viewportWidth) {
    // Identical to VegetableGridScreen getBreakpoint() breakpoints
    if (viewportWidth < 480)  return 3;
    if (viewportWidth < 768)  return 4;
    if (viewportWidth < 1024) return 6;
    if (viewportWidth < 1280) return 8;
    if (viewportWidth < 1600) return 10;
    if (viewportWidth < 1920) return 11;
    return 12;
}

// ── Plan results — fewer, richer cards (matches FamilyPlannerScreen) ────────────────────
function getPlanColumns(viewportWidth) {
    if (viewportWidth >= 2200) return 8;
    if (viewportWidth >= 1800) return 6;
    if (viewportWidth >= 1400) return 5;
    if (viewportWidth >= 1100) return 4;
    if (viewportWidth >= 768)  return 3;
    if (viewportWidth >= 480)  return 2;
    return 1;
}

// (The FamilyPlannerScreen scales with upgrades; the property planner doesn't.)
const MAX_GARDEN_FAMILY = 4;

// ─── Responsive columns (same as FamilyPlannerScreen) ────────────────────────
function getColumns(width) {
    if (width < 480)  return 3;
    if (width < 768)  return 4;
    if (width < 1024) return 5;
    return 5; // Default for larger screens, as this function is for a specific layout
}

const CROP_CATEGORIES = [
    'All', 'Vegetables', 'Tomatoes', 'Peppers', 'Eggplant', 'Greens',
    'Brassica', 'Root & Tuber', 'Beans & Peas', 'Herbs',
    'Squash', 'Cucumbers', 'Melons', 'Flowers', 'Grains',
    'Fruits & Berries', 'Cover Crops', 'Specialty',
];
const VEG_CATS = new Set(['Greens', 'Brassica', 'Root', 'Tuber', 'Allium', 'Legume', 'Nightshade', 'Cucurbit']);

function filterCrops(cat, query) {
    let list = PLANTABLE_CROPS;
    const idHas = (patterns) => list.filter(c => patterns.some(p => c.id.includes(p)));
    switch (cat) {
        case 'Vegetables':      list = list.filter(c => VEG_CATS.has(c.category)); break;
        case 'Tomatoes':        list = list.filter(c => c.category === 'Nightshade' && (c.id.includes('tomato') || c.id.includes('tomatillo') || c.id.includes('ground_cherry'))); break;
        case 'Peppers':         list = list.filter(c => c.category === 'Nightshade' && c.id.includes('pepper')); break;
        case 'Eggplant':        list = list.filter(c => c.category === 'Nightshade' && c.id.includes('eggplant')); break;
        case 'Greens':          list = list.filter(c => c.category === 'Greens'); break;
        case 'Brassica':        list = list.filter(c => c.category === 'Brassica'); break;
        case 'Root & Tuber':    list = list.filter(c => c.category === 'Root' || c.category === 'Tuber'); break;
        case 'Beans & Peas':    list = list.filter(c => c.category === 'Legume'); break;
        case 'Herbs':           list = list.filter(c => c.category === 'Herb'); break;
        case 'Squash':          list = list.filter(c => c.category === 'Cucurbit' && (c.id.includes('squash') || c.id.includes('pumpkin') || c.id.includes('zucchini'))); break;
        case 'Cucumbers':       list = list.filter(c => c.category === 'Cucurbit' && c.id.includes('cucumber')); break;
        case 'Melons':          list = list.filter(c => c.category === 'Cucurbit' && (c.id.includes('melon') || c.id.includes('watermelon') || c.id.includes('cantaloupe'))); break;
        case 'Flowers':         list = list.filter(c => c.category === 'Flower'); break;
        case 'Grains':          list = list.filter(c => c.category === 'Grain'); break;
        case 'Fruits & Berries':list = list.filter(c => c.category === 'Fruit'); break;
        case 'Cover Crops':     list = list.filter(c => c.category === 'Cover Crop'); break;
        case 'Specialty':       list = list.filter(c => c.category === 'Specialty'); break;
        default: break;
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (c.variety ?? '').toLowerCase().includes(q));
    return list;
}


// CropCard is now SharedCropCard — see src/components/SharedCropCard.js
const CropCard = SharedCropCard;


// ─── Report card — matches FamilyPlannerScreen exactly ───────────────────────────────────
function ReportCard({ item }) {
    if (!item.isSupported) return null;
    const isFlower = item.isFlower;
    const GAP = 8;
    return (
        <View style={[styles.reportCard, Shadows.card]}>
            {/* Header row */}
            <View style={styles.reportCardHeader}>
                {CROP_IMAGES[item.cropId] ? (
                    <Image
                        source={CROP_IMAGES[item.cropId]}
                        style={{ width: 36, height: 36, borderRadius: 6 }}
                        resizeMode="cover"
                    />
                ) : (
                    <Text style={styles.reportEmoji}>{item.emoji ?? '🌿'}</Text>
                )}
                <View style={{ flex: 1 }}>
                    <Text style={styles.reportCropName}>{item.cropName}</Text>
                    {formatVarietyLabel(item.variety) ? <Text style={styles.reportVariety}>{formatVarietyLabel(item.variety)}</Text> : null}
                </View>
            </View>

            {/* Key metrics */}
            <View style={styles.reportMetrics}>
                {isFlower ? (
                    <>
                        <MetricPill icon="💐" label="Stems/week" value={`${item.stemsPerWeek}`} />
                        <MetricPill icon="📅" label="Season" value={`${item.weeksSeason} wks`} />
                        <MetricPill icon="🌿" label="Plants to start" value={`${item.seedsToStart}`} />
                    </>
                ) : (
                    <>
                        <MetricPill icon="🎯" label="Season goal" value={`${item.targetLbs} lbs`} />
                        <MetricPill icon="🌿" label={item.seedType === 'TP' ? 'Transplants' : 'Plants'} value={`${item.plantsNeeded ?? item.seedsToStart}`} />
                    </>
                )}
            </View>

            {/* Divider */}
            <View style={styles.reportDivider} />

            {/* Growing facts */}
            <View style={styles.reportFacts}>
                {item.dtm ? (
                    <FactRow icon="⏱" label="Days to maturity" value={`${item.dtm} days`} />
                ) : null}
                {item.inGroundDays && item.inGroundDays > item.dtm ? (
                    <FactRow icon="🗓" label="In-ground window" value={`${item.inGroundDays} days total`} />
                ) : null}
                {item.seedType ? (
                    <FactRow icon="🌱" label="Starting method" value={item.seedType === 'DS' ? 'Direct Sow' : 'Transplant'} />
                ) : null}
                {/* Calendar dates — Ideal vs Today scenario */}
                {item.indoorSeedDate ? (
                    <>
                        <FactRow
                            icon="🗓"
                            label="Start seeds indoors"
                            value={
                                item.todayIndoorDate && item.todayIndoorDate !== item.indoorSeedDate
                                    ? `${item.indoorSeedDate}  ·  (${item.todayIndoorDate} if starting today)`
                                    : item.indoorSeedDate
                            }
                            highlight
                        />
                        {item.transplantDate ? (
                            <FactRow
                                icon="🌤"
                                label="Transplant date"
                                value={
                                    item.todayTransplantDate && item.todayTransplantDate !== item.transplantDate
                                        ? `${item.transplantDate}  ·  (${item.todayTransplantDate} if starting today)`
                                        : item.transplantDate
                                }
                                highlight={!item.isLateStart}
                            />
                        ) : null}
                        {item.lateStartCaveat ? (
                            <FactRow icon="⏳" label="Note" value={item.lateStartCaveat} />
                        ) : null}
                    </>
                ) : item.seedType === 'TP' && item.seedStartWeeks ? (
                    <FactRow icon="🗓" label="Start seeds indoors" value={`${item.seedStartWeeks} wks before last frost`} />
                ) : null}
                {item.directSowDate ? (
                    <FactRow
                        icon="🌱"
                        label="Direct sow date"
                        value={
                            item.todayDirectSowDate && item.todayDirectSowDate !== item.directSowDate
                                ? `Ideal: ${item.directSowDate}  ·  (${item.isLateStart ? 'past ideal — ' : ''}${item.todayDirectSowDate} if starting today)`
                                : item.directSowDate
                        }
                        highlight={!item.isLateStart}
                    />
                ) : null}
                {item.lateStartCaveat && !item.indoorSeedDate && item.directSowDate ? (
                    <FactRow icon="⏳" label="Note" value={item.lateStartCaveat} />
                ) : null}
                {item.inRowSpacingIn ? (
                    <FactRow icon="↔️" label="In-row spacing" value={`${item.inRowSpacingIn}"`} />
                ) : null}
                {item.harvestStyle ? (
                    <FactRow icon="✂️" label="Harvest" value={item.harvestStyle} />
                ) : item.harvestMethod ? (
                    <FactRow icon="✂️" label="Harvest method" value={item.harvestMethod} />
                ) : null}
                {item.yieldLow != null && item.yieldHigh != null ? (
                    <FactRow
                        icon="📊"
                        label="Expected yield"
                        value={
                            item.headCountLow != null
                                ? `${item.yieldLow}–${item.yieldHigh} lbs · ${item.headCountLow}–${item.headCountHigh} heads (${item.headWeightLb} lb avg)`
                                : `${item.yieldLow}–${item.yieldHigh} lbs`
                        }
                    />
                ) : null}
                {item.season ? (
                    <FactRow icon="📅" label="Season" value={item.season} />
                ) : null}
            </View>

            {/* Succession callout */}
            {item.needsSuccession && item.successionNote ? (
                <View style={styles.successionCallout}>
                    <Text style={styles.successionIcon}>⚡</Text>
                    <Text style={styles.successionText}>{item.successionNote}</Text>
                </View>
            ) : null}

            {/* Consumption note */}
            {item.consumptionNotes ? (
                <Text style={styles.reportNote}>💡 {item.consumptionNotes}</Text>
            ) : null}
        </View>
    );
}
function MetricPill({ icon, label, value }) {
    return (
        <View style={styles.metricPill}>
            <Text style={styles.metricIcon}>{icon}</Text>
            <Text style={styles.metricValue}>{value}</Text>
            <Text style={styles.metricLabel}>{label}</Text>
        </View>
    );
}
function FactRow({ icon, label, value, highlight }) {
    return (
        <View style={styles.factRow}>
            <Text style={styles.factIcon}>{icon}</Text>
            <Text style={styles.factLabel}>{label}</Text>
            <Text style={[styles.factValue, highlight && styles.factValueHighlight]}>{value}</Text>
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
        orientation = 'NS',
    } = spaceResult;

    const ratio       = containerWidth / (spaceWidthFt || 1);
    // When E/W is selected the bed's LONG axis runs horizontally:
    //   scaledBedW = the horizontal extent of one bed in pixels
    //   scaledBedH = the vertical extent of one bed in pixels
    const scaledBedW  = (orientation === 'EW' ? bedLengthFt : bedWidthFt)  * ratio;
    const scaledBedH  = (orientation === 'EW' ? bedWidthFt  : bedLengthFt) * ratio;
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
    const GAP = Spacing.sm; // 8px
    const { width } = useWindowDimensions();
    // Crop selection grid — compact (matches FamilyPlannerScreen)
    const numColumns   = getCropGridColumns(width);
    const cardWidth    = Math.floor((width - Spacing.lg * 2 - GAP * (numColumns - 1)) / numColumns);
    // Plan results — fewer, richer cards
    const planColumns  = getPlanColumns(width);
    const planCardWidth = Math.floor((width - 48 - GAP * (planColumns - 1)) / planColumns);

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
    const [dimError,    setDimError]    = useState(null);  // inline validation error (web-safe)

    // ── Step 3: Crops ─────────────────────────────────────────────────────────
    const [familySize, setFamilySize]   = useState(2);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [filterFn, setFilterFn]       = useState(() => () => true);  // from MegaMenuBar
    const [cropSearch, setCropSearch]   = useState('');
    const [planResult, setPlanResult]   = useState(null);
    const [showReport, setShowReport]   = useState(false);   // within step 3
    const [viewMode, setViewMode]       = useState('cards'); // 'cards' | 'calendar' | 'seeds' | 'yield'

    // ── Upgrade modal ─────────────────────────────────────────────────────────
    const [upgradeVisible, setUpgradeVisible]   = useState(false);
    const [upgradeBlockedBy, setUpgradeBlockedBy] = useState(null);

    // ── Growing zone / location ────────────────────────────────────────────────
    const [locationQuery, setLocationQuery]     = useState('');
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationError, setLocationError]     = useState(null);
    const [selectedZone, setSelectedZone]       = useState(null);   // manual picker
    const [resolvedProfile, setResolvedProfile] = useState(null);   // from address lookup

    // Farm profile (for calendar dates in crop plan) ──────────────────────────
    // Priority: address lookup > manual zone > saved main-flow plan
    const [gardenFarmProfile, setGardenFarmProfile] = useState(null);

    // ── Reset to Step 1 every time the screen gains focus ────────────────────
    // React Navigation keeps screens mounted; without this, navigating away
    // and back would re-show the old results/beds from the last session.
    useFocusEffect(
        useCallback(() => {
            setStep(1);
            setSpaceResult(null);
            setSoilResult(null);
            setPlanResult(null);
            setShowReport(false);
            setDimError(null);
        }, [])
    );

    useEffect(() => {
        // Seed from main farm plan if user has already set up a location there
        const saved = loadSavedPlan();
        if (saved?.farmProfile) setGardenFarmProfile(saved.farmProfile);
    }, []);

    // Whenever the user resolves a zone/location, update the active profile
    useEffect(() => {
        if (resolvedProfile) {
            setGardenFarmProfile(resolvedProfile);
        } else if (selectedZone) {
            setGardenFarmProfile(getProfileFromZone(selectedZone));
        }
        // If neither is set, keep whatever was loaded from the saved plan
    }, [resolvedProfile, selectedZone]);

    // ── Live preview result (Step 1 form) ────────────────────────────────────
    // Computed from live form values so BedLayoutVisual updates without pressing Calculate.
    const previewResult = useMemo(() => {
        const l = parseFloat(lengthFt);
        const w = parseFloat(widthFt);
        if (!l || !w || l <= 0 || w <= 0) return null;
        const spaceLengthFt = orientation === 'EW' ? w : l;
        const spaceWidthFt  = orientation === 'EW' ? l : w;
        try {
            const r = calculateBedsInSpace({
                spaceLengthFt,
                spaceWidthFt,
                bedLengthFt:     parseFloat(bedLengthFt) || 8,
                bedWidthFt:      parseFloat(bedWidthFt)  || 4,
                pathwayWidthFt:  parseFloat(pathwayFt)   || 2,
                nsPathwayCount:  nsPathCount,
                ewPathwayCount:  ewPathCount,
                mainPathWidthFt: parseFloat(mainPathWidthFt) || 4,
                equidistant,
                isRaisedBed,
                bedHeightIn:     parseFloat(bedHeightIn) || 12,
            });
            r.spaceLengthFt = spaceLengthFt;
            r.spaceWidthFt  = spaceWidthFt;
            r.orientation   = orientation;
            return r;
        } catch {
            return null;
        }
    }, [lengthFt, widthFt, bedLengthFt, bedWidthFt, pathwayFt, orientation,
        nsPathCount, ewPathCount, mainPathWidthFt, equidistant, isRaisedBed, bedHeightIn]);

    // ── Location lookup handler ───────────────────────────────────────────────
    const handleLocationLookup = async () => {
        const q = locationQuery.trim();
        if (!q) return;
        setLocationLoading(true);
        setLocationError(null);
        setResolvedProfile(null);
        try {
            const raw = await fetchFarmProfile(q);
            setResolvedProfile(raw);
            if (raw.usda_zone) setSelectedZone(raw.usda_zone.toLowerCase());
        } catch (err) {
            setLocationError('Could not fetch climate data. Try a zip code.');
        } finally {
            setLocationLoading(false);
        }
    };

    const handleZonePick = (zone) => {
        setSelectedZone(zone);
        setResolvedProfile(null);   // clear address result; manual pick takes over
        setLocationQuery('');
        setLocationError(null);
    };

    // Derive a friendly "Zone X · last frost Date" label for badges
    const activeZoneLabel = (() => {
        const profile = gardenFarmProfile;
        if (!profile) return null;
        const zone = profile.usda_zone ?? selectedZone;
        if (!zone) return null;
        if (!profile.last_frost_date) return `Zone ${zone.toUpperCase()} · Frost-free`;
        return `Zone ${zone.toUpperCase()} · Last frost ${formatDateDisplay(profile.last_frost_date)}`;
    })();



    const slideAnim = useRef(new Animated.Value(0)).current;
    const limits = LIMITS[getActiveTier()] ?? LIMITS[TIER.FREE];

    const q = cropSearch.trim().toLowerCase();
    const filteredCrops = PLANTABLE_CROPS
        .filter(filterFn)
        .filter(c => !q || c.name.toLowerCase().includes(q) || (c.variety ?? '').toLowerCase().includes(q));

    // ─── Navigation helpers ───────────────────────────────────────────────────
    // NOTE: Animated.timing callbacks are unreliable on React Native Web.
    // Navigation uses direct setStep() — animation is purely cosmetic on enter.
    const goForward = (toStep) => {
        slideAnim.setValue(width);          // start off-screen right
        setStep(toStep);                    // guaranteed state update
        Animated.spring(slideAnim, {        // spring in from right (visual only)
            toValue: 0, tension: 50, friction: 9, useNativeDriver: false,
        }).start();
    };
    const goBackward = (toStep) => {
        slideAnim.setValue(-width * 0.3);   // start slightly left
        setStep(toStep);
        Animated.spring(slideAnim, {
            toValue: 0, tension: 50, friction: 9, useNativeDriver: false,
        }).start();
    };
    const handleBack = () => {
        if (showReport) { setShowReport(false); return; }
        if (step > 1) goBackward(step - 1);
        else navigation.goBack();
    };

    // ─── Step 1 → Step 2: calculate & gate ───────────────────────────────────
    const handleCalculate = () => {
        setDimError(null); // Clear any previous errors
        const l = parseFloat(lengthFt) || 0;
        const w = parseFloat(widthFt)  || 0;
        if (l <= 0 || w <= 0) {
            setDimError('Please enter both a length and a width for your space.');
            return;
        }
        const sqFt = l * w;
        const gate = checkSpaceGate({ sqFt });
        if (!gate.allowed) {
            setDimError(`Space exceeds the free-tier limit of ${limits.maxSqFtPlot.toLocaleString()} sq ft. Upgrade to plan larger spaces.`);
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

                        {/* ── Growing Zone section ─────────────────────────────── */}
                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>🌡 Growing Zone <Text style={styles.optionalTag}>(optional)</Text></Text>
                        <Text style={styles.sectionHint}>
                            Add your location so planting dates (transplant &amp; seed-start) appear on your crop plan.
                        </Text>

                        {/* Address / zip lookup row */}
                        <View style={styles.locationRow}>
                            <View style={[styles.locationInput, locationError && { borderColor: Colors.burntOrange }]}>
                                <Text style={{ fontSize: 15 }}>📍</Text>
                                <TextInput
                                    style={styles.locationTextInput}
                                    value={locationQuery}
                                    onChangeText={setLocationQuery}
                                    placeholder="Zip code or city, state"
                                    placeholderTextColor={Colors.mutedText}
                                    onSubmitEditing={handleLocationLookup}
                                    returnKeyType="search"
                                    autoCapitalize="words"
                                    selectTextOnFocus
                                />
                                {locationLoading
                                    ? <ActivityIndicator size="small" color={Colors.primaryGreen} />
                                    : (
                                        <TouchableOpacity onPress={handleLocationLookup} style={styles.locationGoBtn}>
                                            <Text style={styles.locationGoBtnText}>→</Text>
                                        </TouchableOpacity>
                                    )
                                }
                            </View>
                        </View>

                        {locationError && (
                            <Text style={styles.locationError}>{locationError}</Text>
                        )}

                        {/* Resolved zone badge */}
                        {activeZoneLabel && (
                            <View style={styles.zoneBadge}>
                                <Text style={styles.zoneBadgeText}>✅ {activeZoneLabel}</Text>
                            </View>
                        )}

                        {/* Manual zone chip picker */}
                        <Text style={styles.zonePickerLabel}>— or pick your USDA zone —</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.zoneChipsContent}
                        >
                            {USDA_ZONES.map(zone => (
                                <TouchableOpacity
                                    key={zone}
                                    style={[styles.zoneChip, selectedZone === zone && styles.zoneChipActive]}
                                    onPress={() => handleZonePick(zone)}
                                >
                                    <Text style={[styles.zoneChipText, selectedZone === zone && styles.zoneChipTextActive]}>
                                        {zone.toUpperCase()}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* ── Quick summary (replaces live graphic preview) ─ */}
                        {previewResult && previewResult.totalBeds > 0 && (
                            <View style={styles.previewSummaryCard}>
                                <View style={styles.previewSummaryRow}>
                                    <View style={styles.previewSumStat}>
                                        <Text style={styles.previewSumVal}>{previewResult.totalBeds}</Text>
                                        <Text style={styles.previewSumLbl}>beds</Text>
                                    </View>
                                    <View style={styles.previewSumDivider} />
                                    <View style={styles.previewSumStat}>
                                        <Text style={styles.previewSumVal}>{previewResult.bedAreaSqFt?.toLocaleString?.() ?? '—'} ft²</Text>
                                        <Text style={styles.previewSumLbl}>growing area</Text>
                                    </View>
                                    <View style={styles.previewSumDivider} />
                                    <View style={styles.previewSumStat}>
                                        <Text style={styles.previewSumVal}>{previewResult.efficiency}%</Text>
                                        <Text style={styles.previewSumLbl}>efficiency</Text>
                                    </View>
                                </View>
                                <Text style={styles.previewSumHint}>
                                    {previewResult.bedsAcrossWidth} × {previewResult.bedsAlongLength} grid · hit Calculate to continue
                                </Text>
                            </View>
                        )}
                        {previewResult && previewResult.totalBeds === 0 && (
                            <View style={[styles.previewSummaryCard, { borderColor: Colors.burntOrange }]}>
                                <Text style={{ color: Colors.burntOrange, fontSize: Typography.sm, textAlign: 'center' }}>
                                    ⚠ No beds fit at these dimensions — try narrower pathways or smaller beds
                                </Text>
                            </View>
                        )}


                        {/* Inline validation error */}
                        {dimError && (
                            <View style={styles.dimErrorBanner}>
                                <Text style={styles.dimErrorText}>⚠️ {dimError}</Text>
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


                        {/* Actions */}
                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => goBackward(1)}>
                            <Text style={styles.secondaryBtnText}>← Adjust Space</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.primaryBtn, Shadows.button, { marginTop: Spacing.sm }]}
                            onPress={() => goForward(3)}
                        >
                            <Text style={styles.primaryBtnText}>Plan My Crops →</Text>
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

                        {/* Zone badge — visible when zone was set in Step 1 */}
                        {activeZoneLabel ? (
                            <View style={styles.zoneBadgeStep3}>
                                <Text style={styles.zoneBadgeStep3Text}>📍 {activeZoneLabel} · planting dates included</Text>
                            </View>
                        ) : (
                            <View style={styles.zoneBadgeStep3Absent}>
                                <Text style={styles.zoneBadgeStep3AbsentText}>
                                    💡 No growing zone set — go back to Step 1 to add planting dates
                                </Text>
                            </View>
                        )}

                        {/* Free-tier bar */}
                        {getActiveTier() === TIER.FREE && (
                            <View style={styles.tierBar}>
                                <Text style={styles.tierBarText}>
                                    🌱 Free · up to {limits.maxFamilyMembers} people · {limits.maxCropsSelected} crops
                                </Text>
                                <Text style={styles.tierBarCount}>{selectedIds.size}/{limits.maxCropsSelected}</Text>
                            </View>
                        )}

                        {/* MegaMenuBar — identical to FamilyPlannerScreen */}
                        <MegaMenuBar
                            onFilterChange={({ filterFn }) =>
                                setFilterFn(() => filterFn)
                            }
                        />

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
                            {cropSearch.length > 0 && (
                                <TouchableOpacity onPress={() => setCropSearch('')} style={{ paddingHorizontal: 8 }}>
                                    <Text style={{ color: Colors.mutedText, fontSize: 16 }}>✕</Text>
                                </TouchableOpacity>
                            )}
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
                                        cardWidth={cardWidth}
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

                        {/* —— View mode tab bar (4 tabs) —— */}
                        <View style={styles.viewTabBar}>
                            <TouchableOpacity
                                style={[styles.viewTab, viewMode === 'cards' && styles.viewTabActive]}
                                onPress={() => setViewMode('cards')}
                            >
                                <Text style={[styles.viewTabText, viewMode === 'cards' && styles.viewTabTextActive]}>
                                    📋  Cards
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.viewTab, viewMode === 'calendar' && styles.viewTabActive]}
                                onPress={() => setViewMode('calendar')}
                            >
                                <Text style={[styles.viewTabText, viewMode === 'calendar' && styles.viewTabTextActive]}>
                                    📅  Calendar
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.viewTab, viewMode === 'seeds' && styles.viewTabActive]}
                                onPress={() => setViewMode('seeds')}
                            >
                                <Text style={[styles.viewTabText, viewMode === 'seeds' && styles.viewTabTextActive]}>
                                    🛒  Seeds
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.viewTab, viewMode === 'yield' && styles.viewTabActive]}
                                onPress={() => setViewMode('yield')}
                            >
                                <Text style={[styles.viewTabText, viewMode === 'yield' && styles.viewTabTextActive]}>
                                    📊  Yield
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Conditional content based on tab */}
                        {viewMode === 'calendar' ? (
                            <ActionCalendar
                                crops={planResult.supported}
                                gardenProfile={gardenFarmProfile}
                            />
                        ) : viewMode === 'seeds' ? (
                            <SeedShoppingList crops={planResult.supported} />
                        ) : viewMode === 'yield' ? (
                            <YieldForecast crops={planResult.supported} />
                        ) : (
                        // —— Default: cards grid ——
                        (() => {
                            const cards = planResult.supported;
                            const rows = [];
                            for (let i = 0; i < cards.length; i += planColumns) {
                                rows.push(cards.slice(i, i + planColumns));
                            }
                            return (
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 180 }}
                                    style={Platform.OS === 'web' ? { overflowY: 'auto', flex: 1 } : { flex: 1 }}
                                >
                                    {rows.map((rowItems, rowIdx) => (
                                        <View
                                            key={rowIdx}
                                            style={{ flexDirection: 'row', marginBottom: 8 }}
                                        >
                                            {rowItems.map((item, colIdx) => (
                                                <View
                                                    key={item.cropId}
                                                    style={{
                                                        flex: 1,
                                                        marginRight: colIdx < rowItems.length - 1 ? 8 : 0,
                                                    }}
                                                >
                                                    <ReportCard item={item} />
                                                </View>
                                            ))}
                                        </View>
                                    ))}

                                    {/* Estimates disclaimer */}
                                    <View style={styles.compatNote}>
                                        <Text style={styles.compatNoteText}>
                                            📊 <Text style={{ fontWeight: '600' }}>Estimates, not guarantees.</Text> Quantities are based on average household consumption and typical backyard yields. Your results will vary based on sun exposure, soil quality, seed age, climate, and how your family eats.
                                        </Text>
                                    </View>

                                    <View style={styles.goodLuck}>
                                        <Text style={{ fontSize: 48, marginBottom: Spacing.sm }}>🥬</Text>
                                        <Text style={styles.goodLuckTitle}>Good Luck Gardening!</Text>
                                        <Text style={styles.goodLuckSub}>Happy planting this season.</Text>
                                    </View>
                                </ScrollView>
                            );
                        })()
                        )}

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

    // Inline validation error (web-safe — Alert.alert is no-op on web)
    dimErrorBanner: {
        backgroundColor: '#FFF0F0',
        borderRadius: Radius.sm,
        borderLeftWidth: 3,
        borderLeftColor: '#D32F2F',
        padding: Spacing.sm,
        marginTop: Spacing.sm,
    },
    dimErrorText: { fontSize: Typography.sm, color: '#D32F2F', lineHeight: 18 },

    previewContainer: {
        marginTop: Spacing.lg,
        borderRadius: Radius.md,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.18)',
        backgroundColor: Colors.white,
    },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        backgroundColor: 'rgba(45,79,30,0.05)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.1)',
    },
    previewTitle: {
        fontSize: Typography.xs,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    previewBadge: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
    },

    // ── Compact live summary card (replaces graphic preview) ──────────────────
    previewSummaryCard: {
        marginTop: Spacing.md,
        borderRadius: Radius.md,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.18)',
        backgroundColor: Colors.white,
        padding: Spacing.md,
    },
    previewSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    previewSumStat: {
        flex: 1,
        alignItems: 'center',
        gap: 2,
    },
    previewSumVal: {
        fontSize: Typography.lg,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
    },
    previewSumLbl: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    previewSumDivider: {
        width: 1,
        height: 36,
        backgroundColor: 'rgba(45,79,30,0.12)',
    },
    previewSumHint: {
        marginTop: Spacing.sm,
        fontSize: Typography.xs,
        color: Colors.mutedText,
        textAlign: 'center',
    },


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

    // Badge row (DTM / season / type) — mirrors FamilyPlannerScreen exactly
    cropBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 2, paddingHorizontal: 2, paddingBottom: 4 },
    dtmPill:      { backgroundColor: 'rgba(45,79,30,0.10)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
    dtmPillText:  { fontSize: 9, fontWeight: '700', color: Colors.primaryGreen },
    seasonPill:      { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
    seasonPillCool:  { backgroundColor: 'rgba(100,160,255,0.15)' },
    seasonPillWarm:  { backgroundColor: 'rgba(255,160,40,0.15)' },
    seasonPillText:  { fontSize: 9, fontWeight: '600', color: Colors.darkText },
    typePill:      { backgroundColor: 'rgba(130,60,200,0.10)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
    typePillText:  { fontSize: 9, fontWeight: '700', color: 'rgba(100,40,180,0.85)' },

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

    // ── Report card — mirrors FamilyPlannerScreen exactly ────────────────────
    reportCard: {
        backgroundColor: Colors.white, borderRadius: Radius.lg,
        overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
    },
    reportCardHeader: {
        flexDirection: 'row', alignItems: 'center',
        gap: Spacing.md, backgroundColor: Colors.primaryGreen, padding: Spacing.md,
    },
    reportEmoji:    { fontSize: 32 },
    reportCropName: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.cream },
    reportVariety:  { fontSize: Typography.xs, color: Colors.warmTan, marginTop: 1 },

    reportMetrics: {
        flexDirection: 'row', justifyContent: 'space-around',
        paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
        backgroundColor: 'rgba(45,79,30,0.04)',
    },
    metricPill:  { alignItems: 'center', flex: 1 },
    metricIcon:  { fontSize: 18, marginBottom: 2 },
    metricValue: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.primaryGreen },
    metricLabel: { fontSize: 9, color: Colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

    reportDivider: { height: 1, backgroundColor: 'rgba(45,79,30,0.08)', marginHorizontal: Spacing.md },
    reportFacts:   { padding: Spacing.md, gap: 6 },
    factRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    factIcon:  { width: 20, textAlign: 'center', fontSize: 13 },
    factLabel: { fontSize: Typography.xs, color: Colors.mutedText, flex: 1, fontWeight: Typography.medium },
    factValue: { fontSize: Typography.xs, color: Colors.darkText, fontWeight: Typography.semiBold, textAlign: 'right' },
    factValueHighlight: { color: Colors.primaryGreen, fontWeight: Typography.bold },
    reportNote: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic', lineHeight: 15, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
    successionCallout: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        backgroundColor: 'rgba(180,120,0,0.08)', borderRadius: Radius.sm,
        marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
        paddingHorizontal: 10, paddingVertical: 7,
    },
    successionIcon: { fontSize: 13, lineHeight: 18 },
    successionText: { flex: 1, fontSize: Typography.xs, color: '#7a5800', lineHeight: 16 },


    // ── Plan view tab bar (Cards / Calendar / Seeds / Yield) ─────────────────
    viewTabBar: {
        flexDirection: 'row',
        backgroundColor: Colors.white,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.sm,
        marginBottom: Spacing.sm,
        borderRadius: Radius.full,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.15)',
        overflow: 'hidden',
    },
    viewTab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewTabActive: {
        backgroundColor: Colors.primaryGreen,
    },
    viewTabText: {
        fontSize: Typography.xs,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
    },
    viewTabTextActive: {
        color: '#fff',
    },

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

    // ── Growing Zone styles ───────────────────────────────────────────────────
    optionalTag: {
        fontSize: Typography.sm,
        fontWeight: Typography.regular ?? '400',
        color: Colors.mutedText,
    },
    sectionHint: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        marginTop: -Spacing.sm,
        marginBottom: Spacing.sm,
        lineHeight: 18,
    },
    locationRow: {
        marginBottom: Spacing.sm,
    },
    locationInput: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.white ?? '#fff',
        borderRadius: Radius.md,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.2)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 6,
        gap: 6,
    },
    locationTextInput: {
        flex: 1,
        fontSize: Typography.base,
        color: Colors.darkText,
        paddingVertical: 8,
    },
    locationGoBtn: {
        backgroundColor: Colors.primaryGreen,
        borderRadius: Radius.sm,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    locationGoBtnText: {
        color: Colors.cream,
        fontWeight: Typography.bold,
        fontSize: Typography.md,
    },
    locationError: {
        fontSize: Typography.xs,
        color: Colors.burntOrange,
        marginBottom: Spacing.sm,
    },
    zoneBadge: {
        backgroundColor: 'rgba(45,79,30,0.1)',
        borderRadius: Radius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 8,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.2)',
    },
    zoneBadgeText: {
        fontSize: Typography.sm,
        color: Colors.primaryGreen,
        fontWeight: Typography.semiBold,
    },
    zonePickerLabel: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        textAlign: 'center',
        marginBottom: Spacing.sm,
        letterSpacing: 0.5,
    },
    zoneChipsContent: {
        paddingHorizontal: Spacing.lg,
        gap: 6,
        paddingBottom: 4,
    },
    zoneChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: Radius.sm,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.25)',
        backgroundColor: Colors.white ?? '#fff',
    },
    zoneChipActive: {
        backgroundColor: Colors.primaryGreen,
        borderColor: Colors.primaryGreen,
    },
    zoneChipText: {
        fontSize: Typography.xs,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
        letterSpacing: 0.5,
    },
    zoneChipTextActive: {
        color: Colors.cream,
    },

    // Step 3 zone badges
    zoneBadgeStep3: {
        marginHorizontal: Spacing.md,
        marginBottom: 4,
        backgroundColor: 'rgba(45,79,30,0.09)',
        borderRadius: Radius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.18)',
    },
    zoneBadgeStep3Text: {
        fontSize: Typography.xs,
        color: Colors.primaryGreen,
        fontWeight: Typography.semiBold,
        letterSpacing: 0.2,
    },
    zoneBadgeStep3Absent: {
        marginHorizontal: Spacing.md,
        marginBottom: 4,
        backgroundColor: 'rgba(204,85,0,0.06)',
        borderRadius: Radius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: 'rgba(204,85,0,0.18)',
    },
    zoneBadgeStep3AbsentText: {
        fontSize: Typography.xs,
        color: Colors.burntOrange,
        letterSpacing: 0.2,
    },
});

