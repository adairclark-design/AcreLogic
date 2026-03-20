/**
 * FamilyPlannerScreen.js
 * ══════════════════════
 * Two-step wizard for the "Feed My Family" free-tier flow.
 *
 * Step 1 — Setup
 *   • Optional location bar (zip / address → frost-free days, last frost, USDA zone)
 *   • Family size stepper (1–10+)
 *   • Crop selection grid — responsive up to 9 columns on wide monitors
 *   • Paywall gate: > 4 people OR > 10 crops → UpgradeModal
 *
 * Step 2 — Report (rendered in same screen, no new nav entry)
 *   • Per-crop card: goal lbs, row-ft, plants, spacing, harvest style,
 *     calendar dates (when location provided), yield range
 *   • Summary bar: total row-ft, total beds, crops selected
 *   • Two export options: free compact PDF and $7 full plan PDF
 *   • "✏️ Edit" returns to Step 1
 */
import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, ScrollView, TextInput, Image,
    Animated, Platform, useWindowDimensions, Alert,
    ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { checkFamilyGate, LIMITS, TIER, getActiveTier, HARD_FAMILY_CAP } from '../services/tierLimits';
import { calculateGardenPlan } from '../services/homeGardenCalculator';
import { fetchFarmProfile } from '../services/climateService';
import UpgradeModal from '../components/UpgradeModal';
import CROP_IMAGES from '../data/cropImages';
import { exportFamilyPlan } from '../services/planExporter';
import MegaMenuBar from '../components/MegaMenuBar';
import SharedCropCard from '../components/SharedCropCard';
import ActionCalendar from '../components/ActionCalendar';
import { formatCropDisplayName, formatVarietyLabel } from '../utils/cropDisplay';

// ─── Full PDF monthly cap ────────────────────────────────────────────────────
const FULL_PDF_MONTHLY_LIMIT = 10;
const PDF_USAGE_KEY = 'acrelogic_pdf_usage';

// Returns { count, remaining } for the current calendar month, and increments
// the counter. Returns null if localStorage is unavailable.
function getPdfUsage() {
    try {
        const monthKey = new Date().toISOString().slice(0, 7); // e.g. "2026-03"
        const raw = localStorage.getItem(PDF_USAGE_KEY);
        const saved = raw ? JSON.parse(raw) : {};
        // Reset counter when the month rolls over
        const count = saved.month === monthKey ? (saved.count ?? 0) : 0;
        return { count, remaining: FULL_PDF_MONTHLY_LIMIT - count, monthKey };
    } catch {
        return null; // storage unavailable — treat generously
    }
}
function incrementPdfUsage(monthKey, currentCount) {
    try {
        localStorage.setItem(PDF_USAGE_KEY, JSON.stringify({
            month: monthKey,
            count: currentCount + 1,
        }));
    } catch {}
}

// ─── Crop Data ────────────────────────────────────────────────────────────────
import CROPS_DATA from '../data/crops.json';
const CROPS = CROPS_DATA.crops ?? [];

// Filter out cover crops — not relevant to family planting
const PLANTABLE_CROPS = CROPS; // Cover Crops included — visible under the "Cover Crops" MegaMenuBar tab

// ─── CropCard (compact grid card — mirrors Market Farm layout) ───────────────
// CropCard is now SharedCropCard — see src/components/SharedCropCard.js
const CropCard = SharedCropCard;


// ─── Compact Settings Bar (location + family size in one row) ────────────────
function SettingsBar({ gardenProfile, onProfileFetched, familySize, onAdjustFamily, onSetFamily, limits, selectedCount }) {
    const [modalVisible, setModalVisible] = useState(false);
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);
    // Local draft for the numeric text input so user can type freely before committing
    const [familyDraft, setFamilyDraft] = useState(String(familySize));
    // Keep draft in sync when parent changes size (e.g. via +/- buttons)
    React.useEffect(() => { setFamilyDraft(String(familySize)); }, [familySize]);

    const handleAnalyze = async () => {
        if (address.trim().length < 3) return;
        setLoading(true);
        setError(null);
        try {
            const raw = await fetchFarmProfile(address.trim());
            onProfileFetched({
                address: raw.address ?? address,
                frostFreeDays:   raw.frost_free_days,
                lastFrostDate:   raw.last_frost_date,
                firstFrostDate:  raw.first_frost_date,
                usdaZone:        raw.usda_zone,
                _raw: raw,
            });
            setModalVisible(false);
            setAddress('');
        } catch {
            setError('Could not fetch climate data. Try a different zip.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* ── Compact single-row bar ── */}
            <View style={styles.settingsBar}>
                {/* Location pill */}
                <TouchableOpacity
                    style={styles.settingsLocationPill}
                    onPress={() => setModalVisible(true)}
                >
                    <Text style={styles.settingsIcon}>📍</Text>
                    <Text style={styles.settingsLocationText} numberOfLines={1}>
                        {gardenProfile ? (gardenProfile.address ?? 'Location set') : 'Add location'}
                    </Text>
                </TouchableOpacity>

                <View style={styles.settingsDivider} />

                {/* Family size stepper — +/- buttons plus direct type-in */}
                <View style={styles.settingsFamilyRow}>
                    <Text style={styles.settingsFamilyLabel}>👨‍👩‍👧</Text>
                    <TouchableOpacity style={styles.settingsStepBtn} onPress={() => onAdjustFamily(-1)}>
                        <Text style={styles.settingsStepText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                        style={styles.settingsStepInput}
                        value={familyDraft}
                        onChangeText={txt => setFamilyDraft(txt.replace(/[^0-9]/g, ''))}
                        onBlur={() => {
                            const n = parseInt(familyDraft, 10);
                            const clamped = Number.isFinite(n) && n >= 1 ? n : familySize;
                            setFamilyDraft(String(clamped));
                            if (clamped !== familySize) onSetFamily(clamped);
                        }}
                        keyboardType="number-pad"
                        maxLength={3}
                        selectTextOnFocus
                        textAlign="center"
                    />
                    <TouchableOpacity style={styles.settingsStepBtn} onPress={() => onAdjustFamily(+1)}>
                        <Text style={styles.settingsStepText}>+</Text>
                    </TouchableOpacity>
                </View>


                <View style={styles.settingsDivider} />

                {/* Crop count */}
                <Text style={styles.settingsCropCount}>
                    {selectedCount}/{limits.maxCropsSelected} crops
                </Text>
            </View>

            {/* ── Location Modal ── */}
            {modalVisible && (
                <View style={styles.locationModalScrim}>
                    <View style={styles.locationModal}>
                        <Text style={styles.locationModalTitle}>📍 Where is your garden?</Text>
                        <Text style={styles.locationModalHint}>Enter zip or address for exact planting dates</Text>
                        <View style={styles.locationInputRow}>
                            <TextInput
                                style={styles.locationInput}
                                value={address}
                                onChangeText={setAddress}
                                placeholder="e.g. 97201 or Portland, OR"
                                placeholderTextColor={Colors.mutedText}
                                onSubmitEditing={handleAnalyze}
                                returnKeyType="search"
                                autoCapitalize="words"
                                autoFocus
                            />
                            <TouchableOpacity
                                style={[styles.locationBtn, (address.length < 3 || loading) && styles.locationBtnDisabled]}
                                onPress={handleAnalyze}
                                disabled={address.length < 3 || loading}
                            >
                                {loading
                                    ? <ActivityIndicator size="small" color={Colors.cream} />
                                    : <Text style={styles.locationBtnText}>Look up →</Text>
                                }
                            </TouchableOpacity>
                        </View>
                        {error && <Text style={styles.locationError}>{error}</Text>}
                        <TouchableOpacity
                            style={styles.locationModalCancel}
                            onPress={() => { setModalVisible(false); setError(null); }}
                        >
                            <Text style={styles.locationModalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </>
    );
}

// ─── Report Card (one per crop in Step 2) ────────────────────────────────────
function ReportCard({ item, cardWidth }) {
    const isFlower = item.isFlower;
    const GAP = 8; // matches Spacing.sm
    return (
        <View style={[
            styles.reportCard,
            Shadows.card,
            cardWidth ? {
                width: cardWidth,
                maxWidth: cardWidth,
                flexShrink: 0,
                flexGrow: 0,
                marginRight: GAP,
                marginBottom: GAP,
            } : null,
        ]}>
            {/* Header row */}
            <View style={styles.reportCardHeader}>
                {CROP_IMAGES[item.cropId] ? (
                    <Image
                        source={CROP_IMAGES[item.cropId]}
                        style={{ width: 36, height: 36, borderRadius: 6 }}
                        resizeMode="cover"
                    />
                ) : (
                    <Text style={styles.reportEmoji}>{item.emoji}</Text>
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
                        <MetricPill icon="🌿" label={item.seedType === 'TP' ? 'Transplants' : 'Plants'} value={`${item.seedsToStart}`} />
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
                                ? `Ideal: ${item.directSowDate}  ·  (today is ${item.isLateStart ? 'past ideal — ' : ''}${item.todayDirectSowDate})`
                                : item.directSowDate
                        }
                        highlight={!item.isLateStart}
                    />
                ) : null}
                {item.lateStartCaveat && !item.indoorSeedDate && item.directSowDate ? (
                    <FactRow icon="⏳" label="Note" value={item.lateStartCaveat} />
                ) : null}
                {/* Spacing */}
                {item.inRowSpacingIn ? (
                    <FactRow icon="↔️" label="In-row spacing" value={`${item.inRowSpacingIn}"`} />
                ) : null}
                  {/* Harvest info */}
                {item.harvestStyle ? (
                    <FactRow icon="✂️" label="Harvest" value={item.harvestStyle} />
                ) : item.harvestMethod ? (
                    <FactRow icon="✂️" label="Harvest method" value={item.harvestMethod} />
                ) : null}
                {/* Yield range — includes head count for heading crops */}
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
                    <FactRow icon="🗓" label="Season" value={item.season} />
                ) : null}
            </View>

            {/* Succession callout — only for bolt-prone / quick-finish crops */}
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

// ─── Crop grid column count (Step 1 — compact, matches Market Farm) ──────────
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

// ─── Plan results column count (Step 2 — fewer, richer cards) ────────────────
function getPlanColumns(viewportWidth) {
    if (viewportWidth >= 2200) return 8;
    if (viewportWidth >= 1800) return 6;
    if (viewportWidth >= 1400) return 5;
    if (viewportWidth >= 1100) return 4;
    if (viewportWidth >= 768)  return 3;
    if (viewportWidth >= 480)  return 2;
    return 1;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function FamilyPlannerScreen({ navigation }) {
    const GAP = Spacing.sm; // 8px
    const { width } = useWindowDimensions();
    // Step 1 crop grid — compact (matches Market Farm)
    const cropNumColumns = getCropGridColumns(width);
    const cropCardWidth  = Math.floor((width - Spacing.lg * 2 - GAP * (cropNumColumns - 1)) / cropNumColumns);
    // Step 2 plan results — fewer, richer cards
    const numColumns = getPlanColumns(width);
    const cardWidth  = Math.floor((width - 48 - GAP * (numColumns - 1)) / numColumns);

    // ── Persistence keys ───────────────────────────────────────────────────
    const STORAGE_KEY_FAMILY = 'acrelogic_family_planner_familySize';
    const STORAGE_KEY_CROPS  = 'acrelogic_family_planner_selectedIds';

    // ── State ──────────────────────────────────────────────────────────────
    const [step, setStep]               = useState(1);
    // familySize: restored from localStorage so it survives back-navigation
    const [familySize, setFamilySize]   = useState(() => {
        try {
            const saved = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_FAMILY);
            const n = saved ? parseInt(saved, 10) : 2;
            return Number.isFinite(n) && n >= 1 ? n : 2;
        } catch { return 2; }
    });
    // selectedIds: restored from localStorage so crop picks survive back-navigation
    const [selectedIds, setSelectedIds] = useState(() => {
        try {
            const saved = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_CROPS);
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });
    const [filterFn, setFilterFn]           = useState(() => () => true);  // from MegaMenuBar
    const [searchQuery, setSearchQuery]     = useState('');
    const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
    const [upgradeBlockedBy, setUpgradeBlockedBy]       = useState(null);
    const [gardenProfile, setGardenProfile] = useState(null); // location data
    const [planResult, setPlanResult]       = useState(null);
    const [viewMode, setViewMode]           = useState('cards'); // 'cards' | 'calendar'
    const [pdfRemaining, setPdfRemaining] = useState(() => {
        if (Platform.OS !== 'web') return FULL_PDF_MONTHLY_LIMIT;
        const u = getPdfUsage();
        return u ? u.remaining : FULL_PDF_MONTHLY_LIMIT;
    });

    const listRef  = useRef(null);
    const gridRef  = useRef(null);  // grid container for web DOM ref
    const slideAnim = useRef(new Animated.Value(0)).current;

    // ── Persist selections on every change ────────────────────────────────
    useEffect(() => {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY_FAMILY, String(familySize));
            }
        } catch {}
    }, [familySize]);

    useEffect(() => {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY_CROPS, JSON.stringify([...selectedIds]));
            }
        } catch {}
    }, [selectedIds]);

    // (Stripe ?paid=1 flow removed — Full PDF is now a subscriber benefit)

    // ── Post-payment tier refresh ──────────────────────────────────────────
    // Read the persisted tier on every mount so a purchase from SuccessScreen
    // is immediately reflected without a hard reload.
    const [activeTier, setActiveTierLocal] = useState(() => getActiveTier());
    useEffect(() => {
        setActiveTierLocal(getActiveTier());
    }, []);


    // ── CSS Grid via injected <style> tag ─────────────────────────────────────
    // RN Web's style pipeline (inline styles AND DOM ref) gets transformed by
    // the Metro/Webpack build, stripping complex CSS grid values. Injecting a
    // real <style> element into document.head is fully outside that pipeline.
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const STYLE_ID = 'acrelogic-crop-grid-style';
        let el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            document.head.appendChild(el);
        }
        el.textContent = [
            `.acrelogic-crop-grid {`,
            `  display: grid !important;`,
            `  grid-template-columns: repeat(${cropNumColumns}, 1fr) !important;`,
            `  gap: 8px !important;`,
            `  width: 100% !important;`,
            `}`,
        ].join('\n');
        return () => {
            const existing = document.getElementById(STYLE_ID);
            if (existing) existing.remove();
        };
    }, [cropNumColumns]);


    const limits = LIMITS[activeTier] ?? LIMITS[TIER.FREE];

    const filteredCrops = PLANTABLE_CROPS
        .filter(filterFn)
        .filter(c => !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.variety ?? '').toLowerCase().includes(searchQuery.toLowerCase()));

    // ── Family size stepper ────────────────────────────────────────────────
    const adjustFamily = (delta) => {
        const next = Math.max(1, familySize + delta);
        const gate = checkFamilyGate({ familySize: next, cropCount: selectedIds.size });
        if (!gate.allowed) {
            if (gate.blockedBy === 'csaSize') {
                // Hard ceiling — 60+ people is a CSA, redirect to Market Farm
                setUpgradeBlockedBy('csaSize');
                setUpgradeModalVisible(true);
            } else if (gate.blockedBy === 'familySize') {
                setUpgradeBlockedBy('familySize');
                setUpgradeModalVisible(true);
            }
            return;
        }
        setFamilySize(next);
    };

    // Direct type-in version — same gate logic but takes an absolute value (not delta)
    const setFamily = (n) => {
        const next = Math.max(1, n);
        const gate = checkFamilyGate({ familySize: next, cropCount: selectedIds.size });
        if (!gate.allowed) {
            if (gate.blockedBy === 'csaSize') {
                setUpgradeBlockedBy('csaSize');
                setUpgradeModalVisible(true);
            } else if (gate.blockedBy === 'familySize') {
                setUpgradeBlockedBy('familySize');
                setUpgradeModalVisible(true);
            }
            return;
        }
        setFamilySize(next);
    };


    // ── Crop toggle with gate ──────────────────────────────────────────────
    const toggleCrop = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
            setSelectedIds(next);
            return;
        }
        const gate = checkFamilyGate({ familySize, cropCount: next.size + 1 });
        if (!gate.allowed && gate.blockedBy === 'cropCount') {
            setUpgradeBlockedBy('cropCount');
            setUpgradeModalVisible(true);
            return;
        }
        next.add(id);
        setSelectedIds(next);
    };

    // ── Generate plan and advance to Step 2 ───────────────────────────────
    const generatePlan = () => {
        const selectedCrops = CROPS.filter(c => selectedIds.has(c.id));
        const result = calculateGardenPlan(selectedCrops, familySize, gardenProfile?._raw ?? null);
        setPlanResult(result);
        Animated.sequence([
            Animated.timing(slideAnim, { toValue: -width, duration: 220, useNativeDriver: true }),
        ]).start(() => {
            setStep(2);
            slideAnim.setValue(width);
            Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }).start();
        });
    };

    // ── Return to Step 1 ──────────────────────────────────────────────────
    const goBack = () => {
        if (step === 2) {
            Animated.sequence([
                Animated.timing(slideAnim, { toValue: width, duration: 200, useNativeDriver: true }),
            ]).start(() => {
                setStep(1);
                slideAnim.setValue(0);
            });
        } else {
            navigation.goBack();
        }
    };

    // ── PDF export — free compact version ────────────────────────────────
    const handleExport = () => {
        if (!planResult) return;
        exportFamilyPlan(planResult, familySize).catch(err =>
            Alert.alert('Export failed', String(err?.message ?? err))
        );
    };

    // ── Full PDF — subscriber benefit with 10/month cap ───────────────────
    const handleFullExport = () => {
        // Must be a subscriber
        if (activeTier === TIER.FREE) {
            setUpgradeBlockedBy('fullPdf');
            setUpgradeModalVisible(true);
            return;
        }

        // Check monthly cap
        const usage = Platform.OS === 'web' ? getPdfUsage() : null;
        if (usage && usage.remaining <= 0) {
            Alert.alert(
                'Monthly limit reached',
                `You've generated ${FULL_PDF_MONTHLY_LIMIT} Full PDFs this month. Your limit resets on the 1st.`,
                [{ text: 'OK' }]
            );
            return;
        }

        // Increment counter then export
        if (usage) {
            incrementPdfUsage(usage.monthKey, usage.count);
            setPdfRemaining(r => Math.max(0, r - 1));
        }

        exportFamilyPlan(planResult, familySize).catch(err =>
            Alert.alert('Export failed', String(err?.message ?? err))
        );
    };

    // ─── Render ────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>
                        {step === 1 ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}
                    </Text>
                    <Text style={styles.heading}>
                        {step === 1 ? 'Feed My Family' : 'Your Planting Plan'}
                    </Text>
                </View>
                {selectedIds.size > 0 && step === 1 && (
                    <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{selectedIds.size}</Text>
                    </View>
                )}
            </View>

            {/* ── Animated body ── */}
            <Animated.View style={[styles.body, { transform: [{ translateX: slideAnim }] }]}>

                {/* ════════ STEP 1 ════════ */}
                {step === 1 && (
                    <View style={{ flex: 1 }}>
                        {/* Compact settings bar: location + family size + crop count */}
                        <SettingsBar
                            gardenProfile={gardenProfile}
                            onProfileFetched={setGardenProfile}
                            familySize={familySize}
                            onAdjustFamily={adjustFamily}
                            onSetFamily={setFamily}
                            limits={limits}
                            selectedCount={selectedIds.size}
                        />

                        {/* Mega category menu */}
                        <MegaMenuBar
                            onFilterChange={({ filterFn }) =>
                                setFilterFn(() => filterFn)
                            }
                        />

                        {/* Search bar \u2014 always visible below mega menu */}
                        <View style={styles.searchRow}>
                            <Text style={styles.searchIcon}>🔍</Text>
                            <TextInput
                                style={styles.searchInput}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search crops\u2026"
                                placeholderTextColor={Colors.mutedText}
                                clearButtonMode="while-editing"
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ paddingHorizontal: 8 }}>
                                    <Text style={{ color: Colors.mutedText, fontSize: 16 }}>✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Crop grid */}
                        <FlatList
                            ref={listRef}
                            data={filteredCrops}
                            keyExtractor={item => item.id}
                            numColumns={cropNumColumns}
                            key={cropNumColumns}
                            contentContainerStyle={[styles.grid, { paddingBottom: 120 }]}
                            columnWrapperStyle={cropNumColumns > 1 ? { gap: Spacing.sm, marginBottom: Spacing.sm } : undefined}
                            showsVerticalScrollIndicator={false}
                            style={Platform.OS === 'web' ? { overflowY: 'scroll', flex: 1 } : { flex: 1 }}
                            renderItem={({ item }) => (
                                <View style={{ width: cropCardWidth }}>
                                    <CropCard
                                        crop={item}
                                        selected={selectedIds.has(item.id)}
                                        onPress={toggleCrop}
                                        cardWidth={cropCardWidth}
                                    />
                                </View>
                            )}
                        />

                        {/* Sticky footer */}
                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[
                                    styles.nextBtn,
                                    Shadows.button,
                                    selectedIds.size === 0 && styles.nextBtnDisabled,
                                ]}
                                onPress={generatePlan}
                                disabled={selectedIds.size === 0}
                            >
                                <Text style={styles.nextBtnText}>
                                    {selectedIds.size === 0
                                        ? 'Select at least 1 crop'
                                        : `See My Plan for ${selectedIds.size} Crop${selectedIds.size !== 1 ? 's' : ''} →`}
                                </Text>
                            </TouchableOpacity>
                            {selectedIds.size > 0 && (
                                <TouchableOpacity
                                    style={styles.clearAllBtn}
                                    onPress={() => {
                                        setSelectedIds(new Set());
                                        try {
                                            if (typeof localStorage !== 'undefined')
                                                localStorage.removeItem(STORAGE_KEY_CROPS);
                                        } catch {}
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.clearAllText}>Clear all {selectedIds.size} selections</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                    </View>
                )}

                {/* ════════ STEP 2 — REPORT ════════ */}
                {step === 2 && planResult && (
                    <View style={{ flex: 1 }}>
                        {/* Summary bar */}
                        <View style={styles.summaryBar}>
                            <SumStat label="Crops" value={planResult.supported.length} />
                            <View style={styles.summaryDivider} />
                            <SumStat label="Family of" value={planResult.familySize} />
                        </View>




                        {!gardenProfile && (
                            <View style={styles.dateTipBar}>
                                <Text style={styles.dateTipText}>
                                    📍 Go back and add your location to see exact planting dates for each crop.
                                </Text>
                            </View>
                        )}

                        {/* ── View mode tab bar ── */}
                        <View style={styles.viewTabBar}>
                            <TouchableOpacity
                                style={[styles.viewTab, viewMode === 'cards' && styles.viewTabActive]}
                                onPress={() => setViewMode('cards')}
                            >
                                <Text style={[styles.viewTabText, viewMode === 'cards' && styles.viewTabTextActive]}>
                                    📋  Crop Cards
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.viewTab, viewMode === 'calendar' && styles.viewTabActive]}
                                onPress={() => setViewMode('calendar')}
                            >
                                <Text style={[styles.viewTabText, viewMode === 'calendar' && styles.viewTabTextActive]}>
                                    📅  Action Calendar
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Unsupported crops warning */}
                        {planResult.unsupportedCrops.length > 0 && (
                            <View style={styles.warnBar}>
                                <Text style={styles.warnText}>
                                    ⚠️ No quantity data for: {planResult.unsupportedCrops.join(', ')}
                                </Text>
                            </View>
                        )}

                        {/* Report cards — responsive multi-column grid
                            Strategy: manual row chunking (pure RN flex).
                            Chunk cards into rows of numColumns, render each
                            row as flexDirection:'row'. Each cell is flex:1
                            so columns split width evenly — works everywhere. */}
                        {/* Report cards OR Action Calendar based on view mode */}
                        {viewMode === 'calendar' ? (
                            <ActionCalendar
                                crops={planResult.supported}
                                gardenProfile={gardenProfile?._raw ?? null}
                            />
                        ) : (
                        (() => {
                            const cards = planResult.supported;
                            const rows = [];
                            for (let i = 0; i < cards.length; i += numColumns) {
                                rows.push(cards.slice(i, i + numColumns));
                            }
                            return (
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 180 }}
                                    style={{ flex: 1 }}
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
                                    <View style={styles.disclaimer}>
                                        <Text style={styles.disclaimerText}>
                                            📊 <Text style={{ fontWeight: '600' }}>Estimates, not guarantees.</Text> Quantities are based on average household consumption and typical backyard yields. Your results will vary based on sun exposure, soil quality, seed age, climate, and how your family eats. Some crops marked [est.] use values from similar varieties. Treat these numbers as a helpful starting point — not a precise prescription.
                                        </Text>
                                    </View>

                                    <View style={styles.goodLuck}>
                                        <Text style={styles.goodLuckEmoji}>🥬</Text>
                                        <Text style={styles.goodLuckTitle}>Good Luck Gardening!</Text>
                                        <Text style={styles.goodLuckSub}>Happy planting this season.</Text>
                                    </View>
                                </ScrollView>
                            );
                        })()
                        )}


                        {/* Report footer — edit + dual export */}
                        <View style={styles.footer}>
                            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                                <TouchableOpacity
                                    style={[styles.editBtn, { flex: 1 }]}
                                    onPress={goBack}
                                >
                                    <Text style={styles.editBtnText}>✏️  Edit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.exportBtn, Shadows.button, { flex: 2 }]}
                                    onPress={handleExport}
                                >
                                    <Text style={styles.exportBtnText}>📄 Quick PDF (free)</Text>
                                </TouchableOpacity>
                            </View>
                            {activeTier === TIER.FREE ? (
                                // Free users — upgrade prompt
                                <TouchableOpacity
                                    style={[styles.paidExportBtn, Shadows.button]}
                                    onPress={() => {
                                        setUpgradeBlockedBy('fullPdf');
                                        setUpgradeModalVisible(true);
                                    }}
                                >
                                    <Text style={styles.paidExportBtnText}>🔒 Full Planting Plan PDF — Subscribers Only</Text>
                                    <Text style={styles.paidExportBtnSub}>Included with any subscription · Upgrade to unlock</Text>
                                </TouchableOpacity>
                            ) : pdfRemaining <= 0 ? (
                                // Cap reached
                                <View style={[styles.paidExportBtn, { opacity: 0.5 }]}>
                                    <Text style={styles.paidExportBtnText}>📄 Full Planting Plan PDF — Limit Reached</Text>
                                    <Text style={styles.paidExportBtnSub}>You've used all {FULL_PDF_MONTHLY_LIMIT} Full PDFs this month · Resets on the 1st</Text>
                                </View>
                            ) : (
                                // Subscriber with uses remaining
                                <TouchableOpacity
                                    style={[styles.paidExportBtn, Shadows.button]}
                                    onPress={handleFullExport}
                                >
                                    <Text style={styles.paidExportBtnText}>📄 Full Planting Plan PDF</Text>
                                    <Text style={styles.paidExportBtnSub}>Printable · exact dates · all crops · {pdfRemaining} of {FULL_PDF_MONTHLY_LIMIT} remaining this month</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}
            </Animated.View>

            {/* ── Upgrade Modal ── */}
            <UpgradeModal
                visible={upgradeModalVisible}
                blockedBy={upgradeBlockedBy}
                onDismiss={() => setUpgradeModalVisible(false)}
                onUpgrade={() => {
                    setUpgradeModalVisible(false);
                    if (upgradeBlockedBy === 'csaSize') {
                        // Send them to Market Farm mode
                        navigation.navigate('ModeSelect');
                    } else {
                        navigation.navigate('Pricing');
                    }
                }}
            />

        </View>
    );
}

// ─── Summary stat component ────────────────────────────────────────────────
function SumStat({ label, value }) {
    return (
        <View style={styles.sumStat}>
            <Text style={styles.sumStatValue}>{value}</Text>
            <Text style={styles.sumStatLabel}>{label}</Text>
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
    stepLabel: {
        fontSize: Typography.xs, fontWeight: Typography.bold,
        color: Colors.warmTan, letterSpacing: 2,
    },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    countBadge: {
        backgroundColor: Colors.burntOrange,
        width: 28, height: 28, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    countBadgeText: { color: Colors.white, fontSize: Typography.xs, fontWeight: Typography.bold },

    // ── Body ──────────────────────────────────────────────────────────────────
    body: { flex: 1 },

    // ── Compact Settings Bar ──────────────────────────────────────────────────
    settingsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.white,
        paddingHorizontal: Spacing.lg,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.1)',
        gap: 10,
    },
    settingsLocationPill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
        minWidth: 0,
    },
    settingsIcon: { fontSize: 13 },
    settingsLocationText: {
        flex: 1, fontSize: 11, color: Colors.primaryGreen,
        fontWeight: Typography.medium,
    },
    settingsDivider: {
        width: 1, height: 20, backgroundColor: 'rgba(45,79,30,0.15)',
    },
    settingsFamilyRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    settingsFamilyLabel: { fontSize: 14 },
    settingsStepBtn: {
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: Colors.primaryGreen,
        alignItems: 'center', justifyContent: 'center',
    },
    settingsStepText: {
        color: Colors.cream, fontSize: 16, lineHeight: 18, fontWeight: Typography.bold,
    },
    settingsStepValue: {
        fontSize: 15, fontWeight: Typography.bold,
        color: Colors.primaryGreen, minWidth: 22, textAlign: 'center',
    },
    settingsStepInput: {
        fontSize: 15, fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        minWidth: 32, maxWidth: 44,
        textAlign: 'center',
        borderBottomWidth: 1.5,
        borderBottomColor: Colors.primaryGreen,
        paddingHorizontal: 2, paddingVertical: 1,
        ...Platform.select({ web: { outline: 'none' } }),
    },

    settingsCropCount: {
        fontSize: 11, color: Colors.mutedText, fontWeight: Typography.medium,
        whiteSpace: 'nowrap',
    },

    // ── Location Modal ────────────────────────────────────────────────────────
    locationModalScrim: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    locationModal: {
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.xl,
        width: '90%',
        maxWidth: 480,
        gap: 10,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    locationModalTitle: {
        fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.primaryGreen,
    },
    locationModalHint: { fontSize: Typography.xs, color: Colors.mutedText },
    locationModalCancel: { alignItems: 'center', paddingVertical: 8 },
    locationModalCancelText: { color: Colors.mutedText, fontSize: Typography.sm },

    // ── Filter + Search row ───────────────────────────────────────────────────
    filterSearchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
    },
    filterSearchIcon: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    chipsContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
    chip: {
        paddingVertical: 6, paddingHorizontal: 14,
        borderRadius: Radius.full,
        backgroundColor: Colors.white,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
    },
    chipActive: { backgroundColor: Colors.primaryGreen },
    chipText: { fontSize: Typography.sm, color: Colors.primaryGreen, fontWeight: Typography.medium },
    chipTextActive: { color: Colors.cream },

    // ── Search ────────────────────────────────────────────────────────────────
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
        borderRadius: Radius.md,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
    },
    searchIcon: { paddingLeft: 12, fontSize: 15 },
    searchInput: {
        flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: 10,
        fontSize: Typography.sm, color: Colors.primaryGreen,
    },

    // ── Crop grid ─────────────────────────────────────────────────────────────
    grid: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

    cropCard: {
        backgroundColor: Colors.white,
        borderRadius: Radius.md,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(181,126,220,0.3)',
        alignItems: 'center',
        paddingBottom: Spacing.xs,
    },
    cropCardSelected: {
        borderColor: Colors.primaryGreen,
        borderWidth: 2.5,
    },
    cropCardImg: { width: '100%' },   // height is now dynamic (cardWidth * 0.85)
    cropCardImgFaded: { opacity: 0.35 },
    cropCheckOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropCheckMark: {
        fontSize: 22, color: Colors.primaryGreen, fontWeight: Typography.bold,
    },
    cropCardName: {
        fontSize: 10, fontWeight: Typography.semiBold,
        color: Colors.primaryGreen, textAlign: 'center',
        paddingHorizontal: 3, paddingTop: 3,
    },

    // ── Quick-scan data badges ─────────────────────────────────────────────────
    cropBadgeRow: {
        flexDirection: 'row', flexWrap: 'wrap',
        justifyContent: 'center', alignItems: 'center',
        gap: 3, paddingHorizontal: 4, paddingBottom: 5, minHeight: 18,
    },
    dtmPill: {
        backgroundColor: 'rgba(45,79,30,0.10)', borderRadius: 4,
        paddingVertical: 1, paddingHorizontal: 5,
    },
    dtmPillText: { fontSize: 8, fontWeight: '800', color: Colors.primaryGreen },
    seasonPill: { borderRadius: 4, paddingVertical: 1, paddingHorizontal: 4 },
    seasonPillCool: { backgroundColor: '#dff0fa' },
    seasonPillWarm: { backgroundColor: '#fff0e0' },
    seasonPillText: { fontSize: 8, fontWeight: '700', color: Colors.darkText },
    typePill: {
        backgroundColor: 'rgba(45,79,30,0.06)', borderRadius: 4,
        paddingVertical: 1, paddingHorizontal: 4,
    },
    typePillText: { fontSize: 8, fontWeight: '700', color: Colors.mutedText },

    // ── Footer (shared) ───────────────────────────────────────────────────────
    footer: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: Spacing.md,
        backgroundColor: Colors.backgroundGrey,
        borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.12)',
        ...Platform.select({
            web: { paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' },
            default: { paddingBottom: Spacing.lg },
        }),
    },
    nextBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 17, borderRadius: Radius.md, alignItems: 'center',
    },
    nextBtnDisabled: { opacity: 0.45, backgroundColor: Colors.mutedText },
    nextBtnText: {
        color: Colors.cream, fontSize: Typography.md,
        fontWeight: Typography.bold, letterSpacing: 1,
    },
    clearAllBtn: { alignItems: 'center', paddingVertical: 8 },
    clearAllText: { fontSize: 12, color: Colors.mutedText, textDecorationLine: 'underline' },

    editBtn: {
        borderWidth: 1.5, borderColor: Colors.primaryGreen,
        paddingVertical: 15, borderRadius: Radius.md, alignItems: 'center',
    },
    editBtnText: { color: Colors.primaryGreen, fontSize: Typography.base, fontWeight: Typography.semiBold },
    exportBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 15, borderRadius: Radius.md, alignItems: 'center',
    },
    exportBtnText: { color: Colors.cream, fontSize: Typography.base, fontWeight: Typography.bold },

    // ── $7 paid export button ─────────────────────────────────────────────────
    paidExportBtn: {
        backgroundColor: Colors.burntOrange,
        paddingVertical: 13, paddingHorizontal: Spacing.md,
        borderRadius: Radius.md, alignItems: 'center', gap: 3,
    },
    paidExportBtnText: {
        color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold,
    },
    paidExportBtnSub: {
        color: 'rgba(255,255,255,0.8)', fontSize: 10, letterSpacing: 0.3,
    },

    // ── Post-payment success banner ───────────────────────────────────────────
    paidSuccessBanner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#1A5C2A',
        paddingHorizontal: Spacing.lg, paddingVertical: 14,
        gap: Spacing.md,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)',
    },
    paidSuccessLeft: { flex: 1, gap: 2 },
    paidSuccessTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFFFFF' },
    paidSuccessBody: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.8)' },
    paidSuccessBtn: {
        backgroundColor: Colors.cream,
        paddingVertical: 10, paddingHorizontal: 14,
        borderRadius: Radius.md, alignItems: 'center',
    },
    paidSuccessBtnText: {
        fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen,
    },


    // ── Step 2 Summary Bar ────────────────────────────────────────────────────
    summaryBar: {
        flexDirection: 'row',
        backgroundColor: Colors.primaryGreen,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    sumStat: { alignItems: 'center', flex: 1 },
    sumStatValue: {
        fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.cream,
    },
    sumStatLabel: { fontSize: 9, color: Colors.warmTan, letterSpacing: 0.5, textTransform: 'uppercase' },
    summaryDivider: { width: 1, height: 28, backgroundColor: 'rgba(245,245,220,0.2)' },

    // ── Date tip bar ──────────────────────────────────────────────────────────
    dateTipBar: {
        backgroundColor: 'rgba(45,79,30,0.07)',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.1)',
    },
    dateTipText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontStyle: 'italic' },

    warnBar: {
        backgroundColor: 'rgba(204,85,0,0.1)',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs,
        borderBottomWidth: 1, borderBottomColor: 'rgba(204,85,0,0.2)',
    },
    warnText: { fontSize: Typography.xs, color: Colors.burntOrange },

    // ── View mode tab bar ─────────────────────────────────────────────────────
    viewTabBar: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        paddingTop: 10,
        paddingBottom: 4,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.1)',
        backgroundColor: Colors.cream ?? '#FAFAF7',
    },
    viewTab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: Radius.md,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.2)',
        backgroundColor: 'transparent',
    },
    viewTabActive: {
        backgroundColor: Colors.primaryGreen,
        borderColor: Colors.primaryGreen,
    },
    viewTabText: {
        fontSize: Typography.sm,
        fontWeight: Typography.semiBold,
        color: Colors.primaryGreen,
    },
    viewTabTextActive: {
        color: '#fff',
    },

    // ── Report cards ──────────────────────────────────────────────────────────
    reportGrid: {
        padding: Spacing.lg,
        paddingBottom: 180,
    },
    reportGridRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        // Note: gap is not used here — cards manage their own marginRight/marginBottom
    },
    reportList: { padding: Spacing.lg, paddingBottom: 180, gap: Spacing.md },

    reportCard: {
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
    },
    reportCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.primaryGreen,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
    },
    reportEmoji: { fontSize: 32 },
    reportCropName: {
        fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.cream,
    },
    reportVariety: { fontSize: Typography.xs, color: Colors.warmTan, marginTop: 1 },

    reportMetrics: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
        paddingHorizontal: Spacing.sm,
        backgroundColor: 'rgba(45,79,30,0.04)',
    },
    metricPill: {
        alignItems: 'center',
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 5,
    },
    metricIcon: { fontSize: 14 },
    metricValue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    metricLabel: { fontSize: 8, color: Colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },

    reportDivider: { height: 1, backgroundColor: 'rgba(45,79,30,0.08)', marginHorizontal: Spacing.md },

    reportFacts: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
    factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    factIcon: { width: 16, textAlign: 'center', fontSize: 11, paddingTop: 1 },
    factLabel: { fontSize: 10, color: Colors.mutedText, flex: 1, fontWeight: Typography.medium },
    factValue: { fontSize: 10, color: Colors.darkText, fontWeight: Typography.semiBold, textAlign: 'right', flexShrink: 1, maxWidth: '55%' },
    factValueHighlight: { color: Colors.primaryGreen },

    reportNote: {
        fontSize: 9, color: Colors.mutedText,
        fontStyle: 'italic', lineHeight: 13,
        paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    },

    successionCallout: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        backgroundColor: 'rgba(204,120,0,0.08)',
        borderLeftWidth: 3, borderLeftColor: '#CC7800',
        marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
        borderRadius: 4, paddingVertical: 7, paddingRight: Spacing.sm, paddingLeft: 8,
    },
    successionIcon: { fontSize: 12, lineHeight: 16, flexShrink: 0 },
    successionText: { flex: 1, fontSize: Typography.xs, color: '#8B5000', lineHeight: 15 },


    // ── Good Luck banner ──────────────────────────────────────────────────────
    goodLuck: {
        alignItems: 'center',
        paddingVertical: Spacing.xl,
        gap: Spacing.sm,
    },
    goodLuckEmoji: { fontSize: 48, marginBottom: Spacing.xs },
    goodLuckTitle: {
        fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.primaryGreen,
    },
    goodLuckSub: { fontSize: Typography.sm, color: Colors.mutedText },

    disclaimer: {
        marginBottom: Spacing.lg,
        padding: Spacing.md,
        backgroundColor: 'rgba(45,79,30,0.05)',
        borderRadius: Spacing.sm,
        borderLeftWidth: 3,
        borderLeftColor: Colors.primaryGreen,
    },
    disclaimerText: {
        fontSize: Typography.xs,
        color: Colors.mutedText,
        lineHeight: 18,
    },
});
