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
import { checkFamilyGate, LIMITS, TIER, getActiveTier } from '../services/tierLimits';
import { calculateGardenPlan } from '../services/homeGardenCalculator';
import { fetchFarmProfile } from '../services/climateService';
import UpgradeModal from '../components/UpgradeModal';
import CROP_IMAGES from '../data/cropImages';
import { exportFamilyPlan } from '../services/planExporter';

// ─── Stripe $4.99 PDF product link ──────────────────────────────────────────
const STRIPE_FULL_PLAN_LINK = 'https://buy.stripe.com/test_9B66oH5b17Nn4Qgc9d0sU00'; // ← swap for live link before launch

// ─── Crop Data ────────────────────────────────────────────────────────────────
import CROPS_DATA from '../data/crops.json';
const CROPS = CROPS_DATA.crops ?? [];

// Filter out cover crops — not relevant to family planting
const PLANTABLE_CROPS = CROPS.filter(c => c.category !== 'Cover Crop');

// ─── Responsive Grid Breakpoints ──────────────────────────────────────────────
function getColumns(width) {
    if (width >= 2000) return 9;
    if (width >= 1600) return 8;
    if (width >= 1280) return 7;
    if (width >= 1024) return 6;
    if (width >= 720)  return 4;
    if (width >= 480)  return 3;
    return 2;
}

const CATEGORIES = ['All', 'Vegetables', 'Herbs', 'Flowers', 'Specialty'];
const VEGETABLE_CATS = new Set(['Greens', 'Brassica', 'Root', 'Allium', 'Legume', 'Nightshade', 'Cucurbit']);

function filterByCategory(cat, query) {
    let list = PLANTABLE_CROPS;
    if (cat === 'Vegetables') list = list.filter(c => VEGETABLE_CATS.has(c.category));
    else if (cat === 'Herbs')    list = list.filter(c => c.category === 'Herb');
    else if (cat === 'Flowers')  list = list.filter(c => c.category === 'Flower');
    else if (cat === 'Specialty') list = list.filter(c => c.category === 'Specialty');
    if (query.trim()) list = list.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
    return list;
}

// ─── CropCard (compact grid card) ────────────────────────────────────────────
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

// ─── Location Bar (optional) ─────────────────────────────────────────────────
function LocationBar({ gardenProfile, onProfileFetched }) {
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);
    const [expanded, setExpanded] = useState(!gardenProfile);

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
            setExpanded(false);
        } catch {
            setError('Could not fetch climate data. Try a different zip or address.');
        } finally {
            setLoading(false);
        }
    };

    if (gardenProfile && !expanded) {
        return (
            <TouchableOpacity style={styles.locationChip} onPress={() => setExpanded(true)}>
                <Text style={styles.locationChipIcon}>📍</Text>
                <Text style={styles.locationChipText} numberOfLines={1}>
                    {gardenProfile.address ?? 'Location set'} · {gardenProfile.frostFreeDays} frost-free days · Zone {gardenProfile.usdaZone}
                </Text>
                <Text style={styles.locationChipEdit}>Edit</Text>
            </TouchableOpacity>
        );
    }

    return (
        <View style={styles.locationBar}>
            <Text style={styles.locationBarTitle}>📍 Where is your garden? <Text style={styles.locationBarOptional}>(optional)</Text></Text>
            <Text style={styles.locationBarHint}>Enter your zip or address to get exact planting and seed-start dates.</Text>
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
            {gardenProfile && (
                <TouchableOpacity onPress={() => setExpanded(false)}>
                    <Text style={styles.locationSkip}>Skip</Text>
                </TouchableOpacity>
            )}
        </View>
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
                <Text style={styles.reportEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.reportCropName}>{item.cropName}</Text>
                    {item.variety ? <Text style={styles.reportVariety}>{item.variety}</Text> : null}
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
                        <MetricPill icon="📏" label="Row feet" value={`${item.linearFeetNeeded} ft`} />
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
                {/* Calendar dates (only if gardenProfile was set) */}
                {item.indoorSeedDate ? (
                    <FactRow icon="🗓" label="Start seeds indoors" value={item.indoorSeedDate} highlight />
                ) : item.seedType === 'TP' && item.seedStartWeeks ? (
                    <FactRow icon="🗓" label="Start seeds indoors" value={`${item.seedStartWeeks} wks before last frost`} />
                ) : null}
                {item.transplantDate ? (
                    <FactRow icon="🌤" label="Transplant date" value={item.transplantDate} highlight />
                ) : null}
                {item.directSowDate ? (
                    <FactRow icon="🌱" label="Direct sow date" value={item.directSowDate} highlight />
                ) : null}
                {/* Spacing */}
                {item.inRowSpacingIn ? (
                    <FactRow icon="↔️" label="In-row spacing" value={`${item.inRowSpacingIn}"`} />
                ) : null}
                {item.rowSpacingIn ? (
                    <FactRow icon="↕️" label="Row spacing (30’ bed)" value={`${item.rowSpacingIn}"`} />
                ) : null}
                {item.rowsPer30inBed ? (
                    <FactRow icon="🛀" label="Rows per 30″ bed" value={`${item.rowsPer30inBed}`} />
                ) : null}
                {/* Harvest info */}
                {item.harvestStyle ? (
                    <FactRow icon="✂️" label="Harvest" value={item.harvestStyle} />
                ) : item.harvestMethod ? (
                    <FactRow icon="✂️" label="Harvest method" value={item.harvestMethod} />
                ) : null}
                {/* Yield range */}
                {item.yieldLow != null && item.yieldHigh != null ? (
                    <FactRow icon="📊" label="Expected yield" value={`${item.yieldLow}–${item.yieldHigh} lbs`} />
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

// ─── Plan results column count (Step 2 — fewer, richer cards) ────────────────
function getPlanColumns(viewportWidth) {
    if (viewportWidth >= 2200) return 8;
    if (viewportWidth >= 1800) return 6;
    if (viewportWidth >= 1400) return 5;
    if (viewportWidth >= 1100) return 4;
    if (viewportWidth >= 768)  return 3;
    if (viewportWidth >= 540)  return 2;
    return 1;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function FamilyPlannerScreen({ navigation }) {
    const GAP = 8; // Spacing.sm
    const { width } = useWindowDimensions();
    const numColumns = getPlanColumns(width);
    // Account for outer padding (2 × Spacing.lg = 48) and inter-card gaps
    const cardWidth = Math.floor((width - 48 - GAP * (numColumns - 1)) / numColumns);

    // ── State ──────────────────────────────────────────────────────────────
    const [step, setStep]                   = useState(1);
    const [familySize, setFamilySize]       = useState(2);
    const [selectedIds, setSelectedIds]     = useState(new Set());
    const [category, setCategory]           = useState('All');
    const [searchQuery, setSearchQuery]     = useState('');
    const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
    const [upgradeBlockedBy, setUpgradeBlockedBy]       = useState(null);
    const [gardenProfile, setGardenProfile] = useState(null); // location data
    const [planResult, setPlanResult]       = useState(null);
    const [postPaymentReady, setPostPaymentReady] = useState(false); // true when returning from Stripe

    const listRef  = useRef(null);
    const gridRef  = useRef(null);  // grid container for web DOM ref
    const slideAnim = useRef(new Animated.Value(0)).current;

    // ── Detect return from Stripe (?paid=1) ───────────────────────────────────
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const params = new URLSearchParams(window.location.search);
        if (!params.get('paid')) return;

        // Remove the flag from the URL without triggering a reload
        window.history.replaceState({}, '', window.location.pathname);

        // Restore saved plan and show the download banner
        // (We don't auto-trigger the PDF — popup blockers block it from useEffect.
        //  Instead we show a button so the export fires from a real user gesture.)
        try {
            const saved = localStorage.getItem('acrelogic_pending_pdf');
            if (saved) {
                const { planResult: pr, familySize: fs } = JSON.parse(saved);
                localStorage.removeItem('acrelogic_pending_pdf');
                if (pr) {
                    setPlanResult(pr);
                    setFamilySize(fs ?? 2);
                    setStep(2);
                    setPostPaymentReady(true);
                }
            }
        } catch {}
    }, []);

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
            `  grid-template-columns: repeat(${numColumns}, 1fr) !important;`,
            `  gap: 8px !important;`,
            `  width: 100% !important;`,
            `}`,
        ].join('\n');
        return () => {
            const existing = document.getElementById(STYLE_ID);
            if (existing) existing.remove();
        };
    }, [numColumns]);


    const limits = LIMITS[activeTier] ?? LIMITS[TIER.FREE];

    const filteredCrops = filterByCategory(category, searchQuery);

    // ── Family size stepper ────────────────────────────────────────────────
    const adjustFamily = (delta) => {
        const next = Math.max(1, familySize + delta);
        const gate = checkFamilyGate({ familySize: next, cropCount: selectedIds.size });
        if (!gate.allowed && gate.blockedBy === 'familySize') {
            setUpgradeBlockedBy('familySize');
            setUpgradeModalVisible(true);
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

    // ── $4.99 full plan PDF — Stripe payment link ─────────────────────────
    const handlePaidExport = () => {
        // Persist the plan so we can restore it after the Stripe redirect
        if (Platform.OS === 'web' && planResult) {
            try {
                localStorage.setItem('acrelogic_pending_pdf', JSON.stringify({
                    planResult,
                    familySize,
                }));
            } catch {}
        }

        // Build success redirect URL — Stripe appends &payment_intent=… automatically
        const successUrl = Platform.OS === 'web'
            ? `${window.location.origin}/?paid=1`
            : null;

        // Append ?success_url only if supported (Stripe payment links accept it)
        const stripeUrl = successUrl
            ? `${STRIPE_FULL_PLAN_LINK}?success_url=${encodeURIComponent(successUrl)}`
            : STRIPE_FULL_PLAN_LINK;

        if (Platform.OS === 'web') {
            window.location.href = stripeUrl; // same-tab so we come back via redirect
        } else {
            import('expo-linking').then(Linking => {
                Linking.openURL(STRIPE_FULL_PLAN_LINK);
            });
        }
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
                        {/* Location bar */}
                        <LocationBar
                            gardenProfile={gardenProfile}
                            onProfileFetched={setGardenProfile}
                        />

                        {/* Family size row */}
                        <View style={styles.familyRow}>
                            <View style={styles.familyLabel}>
                                <Text style={styles.familyTitle}>Family Size</Text>
                                <Text style={styles.familyHint}>
                                    We'll size planting quantities to feed everyone.
                                </Text>
                            </View>
                            <View style={styles.stepper}>
                                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustFamily(-1)}>
                                    <Text style={styles.stepperBtnText}>−</Text>
                                </TouchableOpacity>
                                <Text style={styles.stepperValue}>
                                    {familySize >= limits.maxFamilyMembers ? `${limits.maxFamilyMembers}+` : familySize}
                                </Text>
                                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustFamily(+1)}>
                                    <Text style={styles.stepperBtnText}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Free-tier info bar */}
                        {getActiveTier() === TIER.FREE && (
                            <View style={styles.tierBar}>
                                <Text style={styles.tierBarText}>
                                    🌱 Free plan · up to {limits.maxFamilyMembers} people · {limits.maxCropsSelected} crops
                                </Text>
                                <Text style={styles.tierBarSelected}>
                                    {selectedIds.size}/{limits.maxCropsSelected} crops
                                </Text>
                            </View>
                        )}

                        {/* Category chips */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.chipsRow}
                            contentContainerStyle={styles.chipsContent}
                        >
                            {CATEGORIES.map(cat => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[styles.chip, category === cat && styles.chipActive]}
                                    onPress={() => setCategory(cat)}
                                >
                                    <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                                        {cat}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Search */}
                        <View style={styles.searchRow}>
                            <Text style={styles.searchIcon}>🔍</Text>
                            <TextInput
                                style={styles.searchInput}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search crops..."
                                placeholderTextColor={Colors.mutedText}
                                clearButtonMode="while-editing"
                            />
                        </View>

                        {/* Crop grid */}
                        <FlatList
                            ref={listRef}
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
                            <SumStat label="Total row-ft" value={`${planResult.totalLinearFt} ft`} />
                            <View style={styles.summaryDivider} />
                            <SumStat label="Est. 4×8 beds" value={`~${planResult.totalBedsNeeded}`} />
                            <View style={styles.summaryDivider} />
                            <SumStat label="Family of" value={planResult.familySize} />
                        </View>
                        {/* ━ Post-payment success banner ━━━━━━━━━━━━━━━━━━━━━ */}
                        {postPaymentReady && (
                            <View style={styles.paidSuccessBanner}>
                                <View style={styles.paidSuccessLeft}>
                                    <Text style={styles.paidSuccessTitle}>✅ Payment successful!</Text>
                                    <Text style={styles.paidSuccessBody}>Your Full Planting Plan PDF is ready to download.</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.paidSuccessBtn}
                                    onPress={() => {
                                        setPostPaymentReady(false);
                                        exportFamilyPlan(planResult, familySize).catch(() => {});
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.paidSuccessBtnText}>📄 Download PDF</Text>
                                </TouchableOpacity>
                            </View>
                        )}


                        {!gardenProfile && (
                            <View style={styles.dateTipBar}>
                                <Text style={styles.dateTipText}>
                                    📍 Go back and add your location to see exact planting dates for each crop.
                                </Text>
                            </View>
                        )}

                        {/* Unsupported crops warning */}
                        {planResult.unsupportedCrops.length > 0 && (
                            <View style={styles.warnBar}>
                                <Text style={styles.warnText}>
                                    ⚠️ No quantity data for: {planResult.unsupportedCrops.join(', ')}
                                </Text>
                            </View>
                        )}

                        {/* Report cards — responsive multi-column grid */}
                        {Platform.OS === 'web' ? (
                            // Web: CSS Grid bypasses RN Web flex — cards fill grid cells automatically
                            <ScrollView
                                style={{ flex: 1, overflowY: 'scroll' }}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 180 }}
                            >
                                <View
                                    ref={gridRef}
                                    className="acrelogic-crop-grid"
                                    style={{ width: '100%' }}
                                >
                                    {planResult.supported.map(item => (
                                        <ReportCard key={item.cropId} item={item} />
                                    ))}
                                </View>

                                <View style={styles.goodLuck}>
                                    <Text style={styles.goodLuckEmoji}>🥬</Text>
                                    <Text style={styles.goodLuckTitle}>Good Luck Gardening!</Text>
                                    <Text style={styles.goodLuckSub}>Happy planting this season.</Text>
                                </View>
                            </ScrollView>
                        ) : (
                            // Native: FlatList with numColumns
                            <FlatList
                                data={planResult.supported}
                                keyExtractor={item => item.cropId}
                                numColumns={numColumns}
                                key={numColumns}
                                contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 180 }}
                                columnWrapperStyle={numColumns > 1 ? { gap: 8, marginBottom: 8 } : null}
                                showsVerticalScrollIndicator={false}
                                style={{ flex: 1 }}
                                ListFooterComponent={() => (
                                    <View style={styles.goodLuck}>
                                        <Text style={styles.goodLuckEmoji}>🥬</Text>
                                        <Text style={styles.goodLuckTitle}>Good Luck Gardening!</Text>
                                        <Text style={styles.goodLuckSub}>Happy planting this season.</Text>
                                    </View>
                                )}
                                renderItem={({ item }) => <ReportCard item={item} cardWidth={cardWidth} />}
                            />
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
                            <TouchableOpacity
                                style={[styles.paidExportBtn, Shadows.button]}
                                onPress={handlePaidExport}
                            >
                                <Text style={styles.paidExportBtnText}>💳 Full Planting Plan PDF — $4.99</Text>
                                <Text style={styles.paidExportBtnSub}>Printable, Excel-style · exact dates · all crops on one page</Text>
                            </TouchableOpacity>
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
                    navigation.navigate('Pricing');
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

    // ── Location Bar ──────────────────────────────────────────────────────────
    locationBar: {
        backgroundColor: Colors.white,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.1)',
        gap: 8,
    },
    locationBarTitle: {
        fontSize: Typography.sm, fontWeight: Typography.semiBold, color: Colors.primaryGreen,
    },
    locationBarOptional: {
        fontWeight: Typography.regular, color: Colors.mutedText,
    },
    locationBarHint: { fontSize: Typography.xs, color: Colors.mutedText },
    locationInputRow: {
        flexDirection: 'row', gap: Spacing.sm, alignItems: 'center',
    },
    locationInput: {
        flex: 1,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)',
        borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 9,
        fontSize: Typography.sm, color: Colors.darkText,
        backgroundColor: Colors.backgroundGrey,
    },
    locationBtn: {
        backgroundColor: Colors.primaryGreen,
        paddingHorizontal: Spacing.md, paddingVertical: 10,
        borderRadius: Radius.sm, minWidth: 90, alignItems: 'center',
    },
    locationBtnDisabled: { opacity: 0.45 },
    locationBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.xs },
    locationSkip: {
        fontSize: Typography.xs, color: Colors.mutedText, textAlign: 'right',
        textDecorationLine: 'underline', marginTop: 2,
    },
    locationError: { fontSize: Typography.xs, color: Colors.burntOrange, marginTop: 2 },

    // ── Location chip (collapsed) ─────────────────────────────────────────────
    locationChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(45,79,30,0.07)',
        paddingHorizontal: Spacing.lg, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.1)',
    },
    locationChipIcon: { fontSize: 13 },
    locationChipText: { flex: 1, fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.medium },
    locationChipEdit: { fontSize: Typography.xs, color: Colors.burntOrange, fontWeight: Typography.semiBold },

    // ── Family stepper ────────────────────────────────────────────────────────
    familyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.1)',
        gap: Spacing.sm,
    },
    familyLabel: { flex: 1 },
    familyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.primaryGreen },
    familyHint: { fontSize: Typography.xs, color: Colors.mutedText, marginTop: 2 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    stepperBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.primaryGreen,
        alignItems: 'center', justifyContent: 'center',
    },
    stepperBtnText: { color: Colors.cream, fontSize: 20, lineHeight: 22, fontWeight: Typography.bold },
    stepperValue: {
        fontSize: Typography.xl, fontWeight: Typography.bold,
        color: Colors.primaryGreen, minWidth: 44, textAlign: 'center',
    },

    // ── Tier bar ──────────────────────────────────────────────────────────────
    tierBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(45,79,30,0.07)',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.08)',
    },
    tierBarText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.medium },
    tierBarSelected: { fontSize: Typography.xs, color: Colors.mutedText },

    // ── Category chips ────────────────────────────────────────────────────────
    chipsRow: { flexGrow: 0, flexShrink: 0 },
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
    cropCardImg: { width: '100%', height: 70 },           // reduced from 90
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
        gap: Spacing.md,
        backgroundColor: Colors.primaryGreen,
        padding: Spacing.md,
    },
    reportEmoji: { fontSize: 32 },
    reportCropName: {
        fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.cream,
    },
    reportVariety: { fontSize: Typography.xs, color: Colors.warmTan, marginTop: 1 },

    reportMetrics: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.sm,
        backgroundColor: 'rgba(45,79,30,0.04)',
    },
    metricPill: { alignItems: 'center', flex: 1 },
    metricIcon: { fontSize: 18, marginBottom: 2 },
    metricValue: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.primaryGreen },
    metricLabel: { fontSize: 9, color: Colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

    reportDivider: { height: 1, backgroundColor: 'rgba(45,79,30,0.08)', marginHorizontal: Spacing.md },

    reportFacts: { padding: Spacing.md, gap: 6 },
    factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    factIcon: { width: 20, textAlign: 'center', fontSize: 13, paddingTop: 1 },
    factLabel: { fontSize: Typography.xs, color: Colors.mutedText, flex: 1, fontWeight: Typography.medium },
    factValue: { fontSize: Typography.xs, color: Colors.darkText, fontWeight: Typography.semiBold, textAlign: 'right', flexShrink: 1, maxWidth: '55%' },
    factValueHighlight: { color: Colors.primaryGreen },

    reportNote: {
        fontSize: Typography.xs, color: Colors.mutedText,
        fontStyle: 'italic', lineHeight: 15,
        paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
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
});
