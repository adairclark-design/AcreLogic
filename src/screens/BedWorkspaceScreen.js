import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Animated,
    ScrollView,
    FlatList,
    ActivityIndicator,
    Image,
    Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { getSuccessionCandidatesRanked, autoGenerateSuccessions, AUTOFILL_STRATEGIES } from '../services/successionEngine';
import { saveBedAssignment, getBedSuccessions, getCropById } from '../services/database';
import { saveBedSuccessions, saveSeasonSnapshot, getPriorYearBedCrops, loadRotationHistory } from '../services/persistence';
import { checkBedCompanions, checkBlockNeighborWarnings } from '../services/companionService';
import CompanionAlertBanner from '../components/CompanionAlertBanner';
import BedNoteModal from '../components/BedNoteModal';
import AIPlanGeneratorModal from '../components/AIPlanGeneratorModal';
import ActionThisWeekCard from '../components/ActionThisWeekCard';
import CROP_IMAGES from '../data/cropImages';
import AIAdvisorWidget from '../components/AIAdvisorWidget';

const { width, height } = Dimensions.get('window');
const NUM_BEDS = 8;

// ─── Crop Color Palette ─────────────────────────────────────────────────────────
// 14 harmonious farm-palette colors; deterministically assigned per crop_id
const CROP_COLORS = [
    { bg: '#C8E6C9', text: '#1B5E20' }, // soft green
    { bg: '#FFF9C4', text: '#F57F17' }, // warm yellow
    { bg: '#FFCCBC', text: '#BF360C' }, // coral
    { bg: '#B2EBF2', text: '#006064' }, // teal
    { bg: '#D7CCC8', text: '#4E342E' }, // warm tan
    { bg: '#F8BBD0', text: '#880E4F' }, // dusty rose
    { bg: '#DCEDC8', text: '#33691E' }, // sage
    { bg: '#FFE082', text: '#E65100' }, // amber
    { bg: '#B3E5FC', text: '#01579B' }, // sky blue
    { bg: '#E1BEE7', text: '#4A148C' }, // lavender
    { bg: '#FFCCBC', text: '#4E342E' }, // terracotta
    { bg: '#C8F7C5', text: '#145A32' }, // mint
    { bg: '#F5CBA7', text: '#784212' }, // peach
    { bg: '#D5DBDB', text: '#2C3E50' }, // silver
];

function cropColor(cropId) {
    if (!cropId) return CROP_COLORS[0];
    // Simple deterministic hash
    let hash = 0;
    const s = String(cropId);
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) & 0xffff;
    return CROP_COLORS[hash % CROP_COLORS.length];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function fmtShortDate(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateRange(start, end) {
    const s = fmtShortDate(start);
    const e = fmtShortDate(end);
    if (s && e) return `${s}–${e}`;
    if (s) return `from ${s}`;
    return null;
}

// ─── Month labels for Gantt x-axis ───────────────────────────────────────────
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Rotation quality colour ─────────────────────────────────────────────────
function rotationChipStyle(priorCrops, currentSuccessions) {
    if (!priorCrops || priorCrops.length === 0) return null;
    const currentCategories = (currentSuccessions ?? []).map(s => s.category?.toLowerCase()).filter(Boolean);
    const priorCategories = priorCrops.map(p => p.category?.toLowerCase()).filter(Boolean);
    const priorIds = priorCrops.map(p => p.crop_id).filter(Boolean);
    const currentIds = (currentSuccessions ?? []).map(s => s.crop_id).filter(Boolean);
    const sameCrop = currentIds.some(id => priorIds.includes(id));
    const sameFamily = !sameCrop && currentCategories.some(c => priorCategories.includes(c));
    if (sameCrop)   return { bg: '#FFCDD2', text: '#C62828', icon: '🔴' }; // red
    if (sameFamily) return { bg: '#FFF9C4', text: '#F57F17', icon: '🟡' }; // amber
    return { bg: '#C8E6C9', text: '#2E7D32', icon: '🟢' };                  // green
}

// ─── Bed Component (with Gantt timeline) ─────────────────────────────────────
const BedRow = ({ bedNumber, successions, onPress, seasonStart, seasonEnd, priorCrops }) => {
    const hasSuccessions = successions?.length > 0;
    const seasonDays = seasonStart && seasonEnd ? daysBetween(seasonStart, seasonEnd) : 0;
    const showGantt = hasSuccessions && seasonDays > 10 &&
        successions.some(s => s.start_date && s.end_date);

    // Month tick marks for the season
    const monthTicks = [];
    if (showGantt && seasonStart && seasonEnd) {
        const start = new Date(seasonStart);
        const end = new Date(seasonEnd);
        let d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        while (d < end) {
            const offset = daysBetween(seasonStart, d.toISOString().split('T')[0]) / seasonDays;
            if (offset > 0.02 && offset < 0.98) {
                monthTicks.push({ offset, label: MONTH_ABBR[d.getMonth()] });
            }
            d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        }
    }

    return (
        <TouchableOpacity
            style={[styles.bedRow, Shadows.card]}
            onPress={() => onPress(bedNumber)}
            onLongPress={() => onLongPress?.(bedNumber)}
            delayLongPress={700}
            activeOpacity={0.82}
        >
            {/* Bed number label */}
            <View style={styles.bedLabel}>
                <Text style={styles.bedLabelNum}>Bed</Text>
                <Text style={styles.bedLabelText}>{bedNumber}</Text>
                {/* Last Year chip */}
                {(() => {
                    const chip = rotationChipStyle(priorCrops, successions);
                    if (!chip || !priorCrops?.length) return null;
                    const priorName = priorCrops[0]?.crop_name;
                    return (
                        <View style={[styles.lastYearChip, { backgroundColor: chip.bg }]}>
                            <Text style={[styles.lastYearChipText, { color: chip.text }]} numberOfLines={1}>
                                {chip.icon} {priorName ?? 'Prior'}
                            </Text>
                        </View>
                    );
                })()}
            </View>

            {/* Interior: Gantt or empty state */}
            <View style={styles.bedInterior}>
                {showGantt ? (
                    <View style={styles.gantt}>
                        {/* Month tick marks */}
                        {monthTicks.map((tick, i) => (
                            <View key={i} style={[styles.ganttTick, { left: `${tick.offset * 100}%` }]}>
                                <Text style={styles.ganttTickLabel}>{tick.label}</Text>
                            </View>
                        ))}
                        {/* Succession bars */}
                        {successions.map((s, idx) => {
                            if (!s.start_date || !s.end_date) return null;
                            const left = Math.max(0, daysBetween(seasonStart, s.start_date) / seasonDays);
                            const rawW = daysBetween(s.start_date, s.end_date) / seasonDays;
                            const barW = Math.max(0.04, Math.min(rawW, 1 - left));
                            const color = cropColor(s.crop_id);
                            return (
                                <View
                                    key={idx}
                                    style={[
                                        styles.ganttBar,
                                        {
                                            left: `${left * 100}%`,
                                            width: `${barW * 100}%`,
                                            backgroundColor: color.bg,
                                        },
                                    ]}
                                >
                                    {/* Always show name — bar clips overflow naturally */}
                                    <Text
                                        style={[styles.ganttBarText, { color: color.text }]}
                                        numberOfLines={1}
                                        ellipsizeMode="clip"
                                    >
                                        {s.crop_name ?? s.name}
                                    </Text>
                                </View>
                            );
                        })}
                        {/* Season track underline */}
                        <View style={styles.ganttTrack} />
                    </View>
                ) : hasSuccessions ? (
                    // Fallback: text chain if no date data
                    <View style={styles.successionChain}>
                        {successions.map((s, idx) => {
                            const dateRange = fmtDateRange(s.start_date, s.end_date);
                            return (
                                <View key={idx} style={styles.successionChainItem}>
                                    {idx > 0 && <Text style={styles.successionArrow}>→</Text>}
                                    <View style={[styles.successionSlot, { backgroundColor: cropColor(s.crop_id).bg }]}>
                                        <Text style={[styles.successionSlotName, { color: cropColor(s.crop_id).text }]} numberOfLines={1}>
                                            {s.crop_name ?? s.name}
                                        </Text>
                                        <View style={styles.bedDtmPill}>
                                            <Text style={styles.bedDtmText}>
                                                {s.dtm > 0 ? `${s.dtm}d` : s.feed_class === 'cover_crop' ? 'CC' : `${s.dtm ?? 0}d`}
                                            </Text>
                                        </View>
                                        {dateRange && (
                                            <Text style={[styles.bedDateRange, { color: cropColor(s.crop_id).text + 'BB' }]}>{dateRange}</Text>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <View style={styles.bedEmpty}>
                        <Text style={styles.bedEmptyHint}>Tap to plan succession</Text>
                    </View>
                )}
            </View>

            <View style={styles.bedArrow}>
                <Text style={styles.bedArrowText}>›</Text>
            </View>
        </TouchableOpacity>
    );
};

// ─── Overhead Grid View ───────────────────────────────────────────────────────
const OverheadGrid = ({ bedSuccessions, onPressBed, onLongPressBed }) => {
    const beds = Array.from({ length: NUM_BEDS }, (_, i) => i + 1);

    const fmtDate = (iso) => {
        if (!iso) return null;
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <View style={styles.grid}>
            {beds.map(bedNum => {
                const succs = bedSuccessions[bedNum] ?? [];
                const primary = succs[0];
                const color = primary ? cropColor(primary.crop_id) : null;
                const extraCount = succs.length > 1 ? succs.length - 1 : 0;

                return (
                    <TouchableOpacity
                        key={bedNum}
                        style={[
                            styles.gridTile,
                            Shadows.card,
                            color && { backgroundColor: color.bg, borderColor: color.text + '40' },
                        ]}
                        onPress={() => onPressBed(bedNum)}
                        onLongPress={() => onLongPressBed?.(bedNum)}
                        delayLongPress={600}
                        activeOpacity={0.78}
                    >
                        {/* Bed number header */}
                        <View style={styles.gridTileHeader}>
                            <Text style={[styles.gridTileNum, color && { color: color.text + 'BB' }]}>
                                BED {bedNum}
                            </Text>
                            {extraCount > 0 && (
                                <View style={[styles.gridExtraBadge, color && { backgroundColor: color.text + '22' }]}>
                                    <Text style={[styles.gridExtraBadgeText, color && { color: color.text }]}>
                                        +{extraCount}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {succs.length > 0 ? (
                            <>
                                {/* Primary crop name */}
                                <Text
                                    style={[styles.gridTileCrop, color && { color: color.text }]}
                                    numberOfLines={2}
                                >
                                    {primary.crop_name ?? primary.name}
                                </Text>

                                {/* DTM pill + transplant method */}
                                <View style={styles.gridTileMeta}>
                                    {primary.dtm > 0 && (
                                        <View style={[styles.gridDtmPill, color && { backgroundColor: color.text + '22' }]}>
                                            <Text style={[styles.gridDtmText, color && { color: color.text }]}>
                                                {primary.dtm}d
                                            </Text>
                                        </View>
                                    )}
                                    {primary.planting_method && (
                                        <View style={[styles.gridMethodPill, color && { backgroundColor: color.text + '15' }]}>
                                            <Text style={[styles.gridMethodText, color && { color: color.text }]}>
                                                {primary.planting_method === 'transplant' ? 'TP' : 'DS'}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Start date */}
                                {primary.start_date && (
                                    <Text style={[styles.gridTileSucc, color && { color: color.text + 'AA' }]}>
                                        ▶ {fmtDate(primary.start_date)}
                                    </Text>
                                )}

                                {/* Succession summary if more than 1 crop */}
                                {succs.length > 1 && (
                                    <Text style={[styles.gridTileSucc, color && { color: color.text + '99' }]} numberOfLines={1}>
                                        → {succs.slice(1).map(s => s.crop_name ?? s.name).join(', ')}
                                    </Text>
                                )}
                            </>
                        ) : (
                            <View style={styles.gridTileEmptyContent}>
                                <Text style={styles.gridTileEmptyIcon}>+</Text>
                                <Text style={styles.gridTileEmpty}>Tap to plan</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};



// ─── Succession Drawer ────────────────────────────────────────────────────────
const SuccessionDrawer = ({ visible, bedNumber, currentSuccessions, allBedSuccessions, candidates, loading, frostFreeDays, onClose, onPlant, onRemoveSuccession }) => {
    const [frostFilter, setFrostFilter] = React.useState(false);
    const [coverageFraction, setCoverageFraction] = React.useState(1.0);  // 0.25 / 0.5 / 0.75 / 1.0
    const translateY = useRef(new Animated.Value(height)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, { toValue: height, duration: 280, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    return (
        <>
            <Animated.View
                pointerEvents={visible ? 'auto' : 'none'}
                style={[styles.drawerScrim, { opacity }]}
            >
                <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
            </Animated.View>

            <Animated.View style={[styles.drawer, Shadows.drawer, { transform: [{ translateY }] }]}>
                <View style={styles.drawerHandle} />

                <View style={styles.drawerHeader}>
                    <View>
                        <Text style={styles.drawerTitle}>Succession Planner</Text>
                        <Text style={styles.drawerSubtitle}>
                            Bed {bedNumber} · {frostFreeDays ?? '—'} Frost-Free Days Available
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.drawerCloseBtn} onPress={onClose}>
                        <Text style={styles.drawerCloseText}>✕</Text>
                    </TouchableOpacity>
                </View>

                {/* Current bed plan — tap ✕ to remove a succession */}
                {currentSuccessions?.length > 0 && (
                    <View style={styles.drawerCurrentPlan}>
                        <Text style={styles.drawerCurrentPlanTitle}>Current Plan — tap ✕ to remove</Text>
                        {currentSuccessions.map((s, idx) => {
                            const dateRange = fmtDateRange(s.start_date, s.end_date);
                            return (
                                <View key={idx} style={styles.drawerCurrentRow}>
                                    <Text style={styles.drawerCurrentEmoji}>{s.emoji ?? '🌱'}</Text>
                                    <View style={styles.drawerCurrentInfo}>
                                        <Text style={styles.drawerCurrentName}>{s.crop_name ?? s.name}</Text>
                                        <Text style={styles.drawerCurrentVariety}>{s.variety}</Text>
                                        {dateRange && (
                                            <Text style={styles.drawerCurrentDateRange}>{dateRange}</Text>
                                        )}
                                    </View>
                                    <View style={styles.drawerCurrentDtm}>
                                        <Text style={styles.drawerCurrentDtmText}>
                                            {s.dtm > 0 ? `${s.dtm}d` : 'CC'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.drawerRemoveBtn}
                                        onPress={() => onRemoveSuccession(idx)}
                                    >
                                        <Text style={styles.drawerRemoveBtnText}>✕</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                        <View style={styles.drawerDivider} />
                        <Text style={styles.drawerAddMoreLabel}>Add another crop:</Text>
                    </View>
                )}

                {/* 📏 Bed Coverage Fraction selector */}
                {(() => {
                    // Only show if the bed already has crops (interplanting) OR if it's the first crop
                    const FRACTIONS = [
                        { value: 0.25, label: '¼ Bed' },
                        { value: 0.5,  label: '½ Bed' },
                        { value: 0.75, label: '¾ Bed' },
                        { value: 1.0,  label: 'Full' },
                    ];
                    const currentTotal = (currentSuccessions ?? []).reduce((sum, s) => sum + (s.coverage_fraction ?? 1.0), 0);
                    // Only show if there's room for interplanting (less than full bed used)
                    if (currentTotal >= 1.0 && currentSuccessions?.length > 0) return null;
                    return (
                        <View style={styles.coveragePickerWrap}>
                            <Text style={styles.coveragePickerLabel}>🌱 Bed Coverage</Text>
                            <View style={styles.coveragePickerRow}>
                                {FRACTIONS.map(f => (
                                    <TouchableOpacity
                                        key={f.value}
                                        style={[styles.coverageBtn, coverageFraction === f.value && styles.coverageBtnActive]}
                                        onPress={() => setCoverageFraction(f.value)}
                                    >
                                        <Text style={[styles.coverageBtnText, coverageFraction === f.value && styles.coverageBtnTextActive]}>{f.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {coverageFraction < 1.0 && (
                                <Text style={styles.coveragePickerNote}>
                                    Plan {Math.round(coverageFraction * 100)}% of this bed. Remaining {Math.round((1 - coverageFraction) * 100)}% can hold another crop.
                                </Text>
                            )}
                        </View>
                    );
                })()}

                {/* ❄️ Frost-tolerant filter */}
                <TouchableOpacity
                    style={[styles.frostFilterBtn, frostFilter && styles.frostFilterBtnActive]}
                    onPress={() => setFrostFilter(f => !f)}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.frostFilterText, frostFilter && styles.frostFilterTextActive]}>
                        ❄️ {frostFilter ? 'Showing frost-tolerant only' : 'Show winter-tolerant varieties'}
                    </Text>
                </TouchableOpacity>
                {frostFilter && (
                    <Text style={styles.frostFilterNote}>
                        💡 These crops survive frost. Extend season with floating row cover or low tunnel.
                    </Text>
                )}

                {loading ? (
                    <View style={styles.drawerLoading}>
                        <ActivityIndicator color={Colors.primaryGreen} />
                        <Text style={styles.drawerLoadingText}>Calculating rotation options…</Text>
                    </View>
                ) : (
                    <FlatList
                        data={frostFilter ? candidates.filter(c => c.crop.frost_tolerant) : candidates}
                        keyExtractor={(item) => item.crop.id}
                        contentContainerStyle={styles.drawerList}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <Text style={styles.drawerEmpty}>
                                {frostFilter
                                    ? 'No frost-tolerant crops fit this window. Try removing the filter.'
                                    : 'No eligible crops for this window. Consider a cover crop.'}
                            </Text>
                        }
                        renderItem={({ item }) => {
                            const dateRange = fmtDateRange(item.start_date, item.end_date);
                            // Companion check: same bed + adjacent beds
                            const existingIds = (currentSuccessions ?? []).map(s => s.crop_id).filter(Boolean);
                            const sameBedCheck = checkBedCompanions(item.crop.id, existingIds);
                            const neighborCheck = checkBlockNeighborWarnings(item.crop.id, bedNumber, allBedSuccessions ?? {});
                            const companionWarnings = [
                                ...sameBedCheck.warnings.map(w => ({ scope: 'bed', reason: w })),
                                ...neighborCheck.warnings.map(w => ({ scope: 'neighbor', bedNum: w.bedNum, reason: w.reason })),
                            ];
                            const hasCompanionConflict = companionWarnings.length > 0;
                            return (
                                <TouchableOpacity
                                    style={[styles.drawerCropRow, !item.fits && styles.drawerCropRowDim, hasCompanionConflict && styles.drawerCropRowConflict]}
                                    onPress={() => item.fits && onPlant({ ...item, coverage_fraction: coverageFraction })}
                                    activeOpacity={item.fits ? 0.8 : 1}
                                >
                                    {CROP_IMAGES[item.crop.id]
                                        ? <Image
                                            source={CROP_IMAGES[item.crop.id]}
                                            style={styles.drawerCropImage}
                                            resizeMode="cover"
                                        />
                                        : <Text style={styles.drawerCropEmoji}>{item.crop.emoji}</Text>
                                    }
                                    <View style={styles.drawerCropInfo}>
                                        <View style={styles.drawerCropTopRow}>
                                            <Text style={[styles.drawerCropName, !item.fits && styles.drawerCropNameDim]}>
                                                {item.crop.name}
                                                {item.crop.frost_tolerant ? ' ❄️' : ''}
                                            </Text>
                                            <View style={[styles.drawerDtmPill, !item.fits && styles.drawerDtmPillDim]}>
                                                <Text style={styles.drawerDtmText}>DTM {item.crop.dtm > 0 ? `${item.crop.dtm}d` : 'Cover'}</Text>
                                            </View>
                                            {item.score > 20 && (
                                                <View style={styles.topPickBadge}>
                                                    <Text style={styles.topPickText}>Best</Text>
                                                </View>
                                            )}
                                        </View>
                                        {dateRange && (
                                            <Text style={styles.drawerCropDateRange}>{dateRange}</Text>
                                        )}
                                        <Text style={[styles.drawerCropReason, !item.fits && styles.drawerCropReasonDim]}>
                                            {item.reasons?.[0] ?? `Fits in remaining window`}
                                        </Text>
                                        {item.fits && item.remaining_days_after !== undefined && (
                                            <Text style={styles.drawerRemainingDays}>
                                                {item.remaining_days_after > 10
                                                    ? `✓ ${item.remaining_days_after}d left for another succession`
                                                    : `⚠ Season nearly full after this crop`
                                                }
                                            </Text>
                                        )}
                                        {item.warnings?.length > 0 && (
                                            <Text style={styles.drawerCropWarning}>⚠ {item.warnings[0]}</Text>
                                        )}
                                        {/* Companion planting conflicts */}
                                        {companionWarnings.map((w, i) => (
                                            <View key={i} style={styles.companionWarningBadge}>
                                                <Text style={styles.companionWarningText}>
                                                    {w.scope === 'neighbor'
                                                        ? `⚠️ Bad neighbor (Bed ${w.bedNum}): ${w.reason}`
                                                        : `⚠️ Companion conflict: ${w.reason}`
                                                    }
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                    {item.fits ? (
                                        <View style={[styles.drawerPlantBtn, hasCompanionConflict && styles.drawerPlantBtnWarn]}>
                                            <Text style={styles.drawerPlantBtnText}>{hasCompanionConflict ? '⚠ Plan' : '+ Plan'}</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.drawerNoFitBadge}>
                                            <Text style={styles.drawerNoFitText}>✗</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        }}
                    />
                )}
            </Animated.View>
        </>
    );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function BedWorkspaceScreen({ navigation, route }) {
    const farmProfile = route?.params?.farmProfile ?? null;
    const planId = route?.params?.planId ?? null;
    const selectedCropIds = route?.params?.selectedCropIds ?? [];
    const frostFreeDays = farmProfile?.frost_free_days ?? 170;

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [activeBed, setActiveBed] = useState(null);
    const [showGrid, setShowGrid] = useState(false);
    const [showAIPlanModal, setShowAIPlanModal] = useState(false);
    const [calendarEntries, setCalendarEntries] = useState([]);
    const [noteBed, setNoteBed] = useState(null); // bed number being noted (null = modal closed)
    // Restore from localStorage if passed via Continue flow (HeroScreen restore)
    const [bedSuccessions, setBedSuccessions] = useState(
        route?.params?.bedSuccessions ?? {}
    );
    const [drawerCandidates, setDrawerCandidates] = useState([]);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [showStrategyPicker, setShowStrategyPicker] = useState(false);
    const [autoFillStrategy, setAutoFillStrategy] = useState('balanced');
    const [preAutoFillSnapshot, setPreAutoFillSnapshot] = useState(null); // snapshot before last auto-fill
    const [rotationHistory, setRotationHistory] = useState(() => loadRotationHistory());

    // Season range from farmProfile (for Gantt timeline)
    const seasonStart = farmProfile?.last_frost_date ?? null;
    const seasonEnd = farmProfile?.first_frost_date ?? null;

    // Auto-save bedSuccessions to localStorage on every change (web only)
    // Also update the season snapshot so crop rotation history is always current.
    useEffect(() => {
        saveBedSuccessions(bedSuccessions);
        saveSeasonSnapshot(bedSuccessions);
        setRotationHistory(loadRotationHistory()); // re-read so bed cards update
    }, [bedSuccessions]);

    const handleBedLongPress = useCallback((bedNumber) => {
        // Long-press → show inline BedNoteModal — no navigation away from this screen
        setNoteBed(bedNumber);
    }, []);

    const openBed = useCallback(async (bedNumber) => {
        setActiveBed(bedNumber);
        setDrawerOpen(true);
        setDrawerLoading(true);
        setDrawerCandidates([]);

        try {
            const currentSuccessions = bedSuccessions[bedNumber] ?? [];
            const profile = farmProfile ?? { frost_free_days: 170, last_frost_date: `${new Date().getFullYear()}-04-15`, first_frost_date: `${new Date().getFullYear()}-10-15`, lat: 45.5 };

            // Pass prior-year crops for this bed so engine applies rotation penalties/bonuses
            const priorYearCrops = getPriorYearBedCrops(bedNumber);

            // ── Pass 1: normal engine run (respects season / DTM filters) ─────────────
            const engineCandidates = await getSuccessionCandidatesRanked(
                { successions: currentSuccessions },
                profile,
                { maxResults: 200, priorYearCrops }
            );

            if (selectedCropIds.length > 0) {
                // Filter engine results to Phase 2 selections
                const matching = engineCandidates.filter(c => selectedCropIds.includes(c.crop?.id));
                const matchingIds = new Set(matching.map(c => c.crop.id));

                // ── Pass 2: fetch any selected crops the engine filtered out ──────────
                // (warm-season crops in a cool window, or crops with DTM > remaining days)
                const missingIds = selectedCropIds.filter(id => !matchingIds.has(id));
                const missingCandidates = (
                    await Promise.all(
                        missingIds.map(async id => {
                            const crop = await getCropById(id);
                            if (!crop) return null;
                            return {
                                crop,
                                score: 0,
                                reasons: [],
                                warnings: ["Outside current frost window — plan for next season or a covered bed"],
                                start_date: profile.last_frost_date,
                                end_date: null,
                                remaining_days_after: 0,
                                fits: false,
                                season_class: 'out-of-season',
                            };
                        })
                    )
                ).filter(Boolean);

                // Fitted crops first, out-of-season crops at bottom
                setDrawerCandidates([...matching, ...missingCandidates]);
            } else {
                // No Phase 2 filter — show normal top 10
                setDrawerCandidates(engineCandidates.slice(0, 10));
            }
        } catch (err) {
            console.error('[BedWorkspace] Error loading candidates:', err);
        } finally {
            setDrawerLoading(false);
        }
    }, [bedSuccessions, farmProfile, selectedCropIds]);


    const closeDrawer = useCallback(() => {
        setDrawerOpen(false);
        setTimeout(() => setActiveBed(null), 300);
    }, []);

    // Generate calendar entries for Action This Week card
    useEffect(() => {
        if (Object.keys(bedSuccessions).length === 0) return;
        import('../services/calendarGenerator').then(({ generateFullCalendar }) => {
            const allBeds = Object.entries(bedSuccessions).map(([num, succs]) => ({
                bed_number: parseInt(num), successions: succs,
            }));
            generateFullCalendar(allBeds, farmProfile)
                .then(entries => setCalendarEntries(entries))
                .catch(() => { });
        });
    }, [bedSuccessions]);

    const handleApplyAIPlan = useCallback((newBedSuccessions) => {
        setBedSuccessions(prev => ({ ...prev, ...newBedSuccessions }));
    }, []);

    const [companionAlert, setCompanionAlert] = useState(null); // { warnings: string[] }

    const plantCrop = useCallback(async (candidateItem) => {
        const { crop, start_date, end_date } = candidateItem;
        const currentSuccessions = bedSuccessions[activeBed] ?? [];

        // Same crop CAN repeat in the same bed within one season (e.g. two rounds of radish).
        // Rotation enforcement only applies across seasons — handled via saveSeasonSnapshot.

        const newSlot = currentSuccessions.length + 1;

        const newSuccession = {
            crop_id: crop.id,
            crop_name: crop.name,
            variety: crop.variety,
            emoji: crop.emoji,
            dtm: crop.dtm,
            feed_class: crop.feed_class,
            category: crop.category,
            start_date,
            end_date,
            coverage_fraction: candidateItem.coverage_fraction ?? 1.0,
            is_auto_generated: false,
        };

        // Save to SQLite if planId available
        if (planId) {
            try {
                await saveBedAssignment(planId, activeBed, newSlot, {
                    crop_id: crop.id,
                    start_date,
                    end_date,
                    action: crop.seed_type === 'TP' ? 'transplant' : 'direct_seed',
                    rows_used: crop.rows_per_30in_bed,
                    is_auto_generated: false,
                });
            } catch (err) {
                console.warn('[BedWorkspace] SQLite save failed:', err);
            }
        }

        // ── Companion planting flash alert ──────────────────────────────────
        const existingIds = currentSuccessions.map(s => s.crop_id).filter(Boolean);
        const sameBedCheck = checkBedCompanions(crop.id, existingIds);
        const neighborCheck = checkBlockNeighborWarnings(crop.id, activeBed, bedSuccessions);
        const allWarnings = [
            ...sameBedCheck.warnings,
            ...neighborCheck.warnings.map(w => `Bad neighbor (Bed ${w.bedNum}): ${w.reason}`),
        ];
        if (allWarnings.length > 0) {
            setCompanionAlert({ warnings: allWarnings });
        }
        // ───────────────────────────────────────────────────────────────────

        setBedSuccessions(prev => ({
            ...prev,
            [activeBed]: [...(prev[activeBed] ?? []), newSuccession],
        }));

        closeDrawer();
    }, [activeBed, bedSuccessions, planId, closeDrawer]);

    // Remove a succession by index from the active bed (called from drawer)
    const removeSuccessionFromBed = useCallback((idx) => {
        setBedSuccessions(prev => {
            const updated = [...(prev[activeBed] ?? [])];
            updated.splice(idx, 1);
            return { ...prev, [activeBed]: updated };
        });
    }, [activeBed]);


    const handleAutoFill = useCallback(async (strategyId) => {
        // Include beds that are empty OR have only 1-2 successions (need more filling).
        // Beds with 3+ successions are considered "done" and skipped.
        const bedsToFill = Array.from({ length: NUM_BEDS }, (_, i) => i + 1)
            .filter(n => (bedSuccessions[n]?.length ?? 0) < 3);

        if (bedsToFill.length === 0) return;


        // Snapshot current state so user can revert if they don't like the result
        setPreAutoFillSnapshot({ ...bedSuccessions });

        const profile = farmProfile ?? { frost_free_days: 170, last_frost_date: `${new Date().getFullYear()}-04-15`, first_frost_date: `${new Date().getFullYear()}-10-15`, lat: 45.5 };

        const { autoFillRemainingBeds } = await import('../services/successionEngine');
        // "filledBeds" = beds with 3+ successions (considered complete, used for farm-wide diversity counting)
        const filledBeds = Object.entries(bedSuccessions)
            .filter(([num]) => (bedSuccessions[parseInt(num)]?.length ?? 0) >= 3)
            .map(([num, succs]) => ({
                bed_number: parseInt(num),
                successions: succs,
            }));

        const autoFilled = await autoFillRemainingBeds(filledBeds, bedsToFill, profile, strategyId);


        const updatedSuccessions = { ...bedSuccessions };
        for (const [bedNum, succs] of Object.entries(autoFilled)) {
            updatedSuccessions[bedNum] = succs;
        }
        setBedSuccessions(updatedSuccessions);
        setShowStrategyPicker(false);
    }, [bedSuccessions, farmProfile]);

    const handleRevertAutoFill = useCallback(() => {
        if (!preAutoFillSnapshot) return;
        setBedSuccessions(preAutoFillSnapshot);
        setPreAutoFillSnapshot(null); // clear snapshot after reverting
    }, [preAutoFillSnapshot]);

    const handleGeneratePlan = () => {
        navigation.navigate('YieldSummary', {
            farmProfile,
            planId,
            bedSuccessions,
        });
    };

    const handleViewCalendar = () => {
        navigation.navigate('CropCalendar', {
            farmProfile,
            planId,
            bedSuccessions,
        });
    };

    const plannedCount = Object.keys(bedSuccessions).filter(k => bedSuccessions[k]?.length > 0).length;

    return (
        <View style={styles.container}>
            {/* Companion conflict flash banner */}
            {companionAlert && (
                <CompanionAlertBanner
                    warnings={companionAlert.warnings}
                    onDismiss={() => setCompanionAlert(null)}
                />
            )}
            <View style={styles.header}>
                {/* ── Row 1: back + title + progress ── */}
                <View style={styles.headerRow1}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <View style={styles.headerText}>
                        <Text style={styles.stepLabel}>PHASE 3 OF 3</Text>
                        <Text style={styles.heading} numberOfLines={1}>Your 8-Bed Workspace</Text>
                    </View>
                    <View style={styles.progressPill}>
                        <Text style={styles.progressText}>{plannedCount}/8</Text>
                    </View>
                </View>

                {/* ── Row 2: nav buttons ── */}
                <View style={styles.headerRow2}>
                    <TouchableOpacity
                        style={styles.viewToggleBtn}
                        onPress={() => navigation.navigate('FarmDesigner', { farmProfile })}
                    >
                        <Text style={styles.viewToggleBtnText}>🌾 Farm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.viewToggleBtn}
                        onPress={() => navigation.navigate('VegetableGrid', { farmProfile, planId, selectedCropIds, fromWorkspace: true })}
                    >
                        <Text style={styles.viewToggleBtnText}>✏️ Crops</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.viewToggleBtn}
                        onPress={() => navigation.navigate('BedMap', {
                            farmProfile, frostFreeDays, planId,
                            bedSuccessions,
                            selectedCropIds,
                        })}
                    >
                        <Text style={styles.viewToggleBtnText}>🗺️ Map</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.viewToggleBtn}
                        onPress={() => navigation.navigate('VisualBedLayout', { farmProfile })}
                    >
                        <Text style={styles.viewToggleBtnText}>🖊 Layout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.viewToggleBtn}
                        onPress={() => navigation.navigate('Dashboard', { farmProfile, bedSuccessions })}
                    >
                        <Text style={styles.viewToggleBtnText}>📊 Tasks</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.viewToggleBtn}
                        onPress={() => setShowGrid(g => !g)}
                    >
                        <Text style={styles.viewToggleBtnText}>{showGrid ? '☰ List' : '⊞ Grid'}</Text>
                    </TouchableOpacity>
                </View>
            </View>


            <Text style={styles.subheading}>
                Tap a bed to assign crops. The drawer shows only what fits your {frostFreeDays}-day frost window.
            </Text>

            <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${(plannedCount / NUM_BEDS) * 100}%` }]} />
            </View>

            <ScrollView
                style={[styles.bedList, Platform.OS === 'web' && { overflowY: 'scroll' }]}
                contentContainerStyle={styles.bedListContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Overhead Grid View ── */}
                {showGrid && (
                    <View style={styles.gridSection}>
                        <Text style={styles.gridSectionLabel}>FARM OVERVIEW</Text>
                        <OverheadGrid bedSuccessions={bedSuccessions} onPressBed={openBed} onLongPressBed={handleBedLongPress} />
                    </View>
                )}

                {/* ── Bed List (with Gantt) ── */}
                {Array.from({ length: NUM_BEDS }, (_, i) => i + 1).map((bedNum) => (
                    <BedRow
                        key={bedNum}
                        bedNumber={bedNum}
                        successions={bedSuccessions[bedNum] ?? []}
                        onPress={openBed}
                        onLongPress={() => handleBedLongPress(bedNum)}
                        delayLongPress={600}
                        seasonStart={seasonStart}
                        seasonEnd={seasonEnd}
                        priorCrops={getPriorYearBedCrops(bedNum)}
                    />
                ))}

                <View style={styles.actionButtons}>
                    <TouchableOpacity style={[styles.aiPlanBtn, Shadows.card]} onPress={() => setShowAIPlanModal(true)}>
                        <Text style={styles.aiPlanBtnText}>🤖 AI Plan Generator</Text>
                    </TouchableOpacity>
                    {plannedCount > 0 && plannedCount < NUM_BEDS && (
                        <View style={styles.strategyPickerWrap}>
                            {/* Toggle button */}
                            <TouchableOpacity
                                style={[styles.autoFillBtn, Shadows.card]}
                                onPress={() => setShowStrategyPicker(p => !p)}
                            >
                                <Text style={styles.autoFillBtnText}>
                                    {showStrategyPicker ? '✕ Cancel Auto-Fill' : '✨ Auto-Fill Remaining Beds'}
                                </Text>
                            </TouchableOpacity>

                            {/* Inline strategy picker */}
                            {showStrategyPicker && (
                                <View style={styles.strategyCards}>
                                    <Text style={styles.strategyPickerLabel}>Choose a filling strategy:</Text>
                                    {AUTOFILL_STRATEGIES.map(s => {
                                        const selected = autoFillStrategy === s.id;
                                        const profitBars = s.bar;
                                        const diversityBars = 10 - profitBars;
                                        return (
                                            <TouchableOpacity
                                                key={s.id}
                                                style={[styles.strategyCard, selected && styles.strategyCardActive]}
                                                onPress={() => setAutoFillStrategy(s.id)}
                                                activeOpacity={0.8}
                                            >
                                                <View style={styles.strategyCardTop}>
                                                    <Text style={[styles.strategyCardLabel, selected && styles.strategyCardLabelActive]}>
                                                        {s.label}
                                                    </Text>
                                                    {selected && (
                                                        <View style={styles.strategySelectedBadge}>
                                                            <Text style={styles.strategySelectedBadgeText}>✓</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={[styles.strategyCardDesc, selected && styles.strategyCardDescActive]}>
                                                    {s.description}
                                                </Text>
                                                {/* Profit / Diversity bar */}
                                                <View style={styles.strategyBar}>
                                                    <View style={[styles.strategyBarSegment, { flex: profitBars || 0.5, backgroundColor: selected ? '#FFD54F' : 'rgba(255,213,79,0.4)' }]} />
                                                    <View style={[styles.strategyBarSegment, { flex: diversityBars || 0.5, backgroundColor: selected ? '#81C784' : 'rgba(129,199,132,0.4)' }]} />
                                                </View>
                                                <View style={styles.strategyBarLabels}>
                                                    <Text style={styles.strategyBarLabel}>💰 Profit</Text>
                                                    <Text style={styles.strategyBarLabel}>🌿 Diversity</Text>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                    <TouchableOpacity
                                        style={styles.strategyConfirmBtn}
                                        onPress={() => handleAutoFill(autoFillStrategy)}
                                    >
                                        <Text style={styles.strategyConfirmBtnText}>✨ Fill Beds with This Strategy</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Revert button — standalone so it shows even when ALL beds are filled */}
                    {preAutoFillSnapshot && (
                        <TouchableOpacity
                            style={[styles.autoFillBtn, styles.revertBtn, Shadows.card]}
                            onPress={handleRevertAutoFill}
                        >
                            <Text style={[styles.autoFillBtnText, styles.revertBtnText]}>↩ Revert Auto-Fill</Text>
                        </TouchableOpacity>
                    )}

                    {plannedCount > 0 && (
                        <>
                            <TouchableOpacity style={[styles.finishBtn, Shadows.button]} onPress={handleGeneratePlan}>
                                <Text style={styles.finishBtnText}>💰 Revenue & Export</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.autoFillBtn, Shadows.card]} onPress={() => navigation.navigate('FieldJournal', { farmProfile, bedSuccessions })}>
                                <Text style={styles.autoFillBtnText}>📓 Field Journal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.autoFillBtn, Shadows.card]} onPress={handleViewCalendar}>
                                <Text style={styles.autoFillBtnText}>📅 View Planting Calendar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.autoFillBtn, Shadows.card]} onPress={() => navigation.navigate('SeedOrder', { farmProfile })}>
                                <Text style={styles.autoFillBtnText}>🌱 Seed Order List</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.autoFillBtn, Shadows.card]} onPress={() => navigation.navigate('SeasonPass', { farmProfile })}>
                                <Text style={styles.autoFillBtnText}>🎟 Season Pass</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </ScrollView>

            <SuccessionDrawer
                visible={drawerOpen}
                bedNumber={activeBed}
                currentSuccessions={activeBed ? (bedSuccessions[activeBed] ?? []) : []}
                allBedSuccessions={bedSuccessions}
                candidates={drawerCandidates}
                loading={drawerLoading}
                frostFreeDays={frostFreeDays}
                onClose={closeDrawer}
                onPlant={plantCrop}
                onRemoveSuccession={removeSuccessionFromBed}
            />

            {/* ── AI Plan Generator Modal ── */}
            <AIPlanGeneratorModal
                visible={showAIPlanModal}
                farmProfile={farmProfile}
                frostFreeDays={frostFreeDays}
                onClose={() => setShowAIPlanModal(false)}
                onApplyPlan={handleApplyAIPlan}
            />

            {/* ── AI Advisor Floating Widget ── */}
            <AIAdvisorWidget
                farmProfile={farmProfile}
                selectedCrops={Object.values(bedSuccessions).flat().map(s => s.crop_name ?? s.name).filter(Boolean)}
                bedSuccessions={bedSuccessions}
            />

            {/* ── Bed Note Modal (long-press) ── */}
            <BedNoteModal
                visible={noteBed !== null}
                bedNum={noteBed}
                onClose={() => setNoteBed(null)}
            />
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
        flexDirection: 'column',
        paddingTop: 52,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.sm,
        backgroundColor: Colors.primaryGreen,
        gap: Spacing.xs,
    },
    headerRow1: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    headerRow2: {
        flexDirection: 'row',
        gap: Spacing.xs,
        paddingBottom: Spacing.xs,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    headerText: { flex: 1, gap: 2 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    progressPill: { backgroundColor: Colors.burntOrange, paddingVertical: 5, paddingHorizontal: 12, borderRadius: Radius.full },
    progressText: { color: Colors.white, fontSize: Typography.xs, fontWeight: Typography.bold },
    viewToggleBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderRadius: Radius.sm,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
    },
    viewToggleBtnText: { color: Colors.cream, fontSize: Typography.xs, fontWeight: Typography.bold },
    viewToggleText: { color: Colors.cream, fontSize: Typography.xs, fontWeight: Typography.bold },

    subheading: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
        lineHeight: 18,
    },

    progressBarTrack: { height: 4, backgroundColor: 'rgba(45,79,30,0.15)', marginHorizontal: Spacing.lg, borderRadius: 2, marginBottom: Spacing.md },
    progressBarFill: { height: 4, backgroundColor: Colors.burntOrange, borderRadius: 2 },

    bedList: { flex: 1 },
    bedListContent: { paddingHorizontal: Spacing.lg, paddingBottom: 160, gap: Spacing.sm },

    bedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.warmTan,
        borderRadius: Radius.sm,
        borderWidth: 2.5,
        borderColor: Colors.primaryGreen,
        overflow: 'hidden',
        minHeight: 64,
    },
    bedLabel: {
        width: 56,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        paddingVertical: Spacing.sm,
        backgroundColor: 'rgba(45,79,30,0.08)',
        borderRightWidth: 1.5,
        borderRightColor: 'rgba(45,79,30,0.2)',
    },
    bedLabelNum: { fontSize: 8, fontWeight: Typography.medium, color: Colors.mutedText, letterSpacing: 0.5 },
    bedLabelText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.burntOrange },
    lastYearChip: {
        marginTop: 4, borderRadius: Radius.full,
        paddingHorizontal: 5, paddingVertical: 2, maxWidth: 52,
    },
    lastYearChipText: { fontSize: 7, fontWeight: '700', textAlign: 'center', lineHeight: 9 },
    bedInterior: { flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, justifyContent: 'center' },

    // ── Gantt Timeline ──────────────────────────────────────────────────────────
    gantt: {
        flex: 1,
        height: 44,
        position: 'relative',
        justifyContent: 'center',
    },
    ganttTrack: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: 'rgba(45,79,30,0.12)',
        borderRadius: 1,
    },
    ganttBar: {
        position: 'absolute',
        height: 28,
        borderRadius: 5,
        justifyContent: 'center',
        paddingHorizontal: 5,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    ganttBarText: {
        fontSize: 9,
        fontWeight: Typography.bold,
        letterSpacing: 0.2,
    },
    ganttTick: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: 'rgba(45,79,30,0.12)',
        alignItems: 'center',
    },
    ganttTickLabel: {
        position: 'absolute',
        top: -1,
        fontSize: 7,
        color: Colors.mutedText,
        left: 2,
        letterSpacing: 0.2,
    },

    // ── Overhead Grid ──────────────────────────────────────────────────────────
    gridSection: { marginBottom: Spacing.md },
    gridSectionLabel: {
        fontSize: 9, fontWeight: Typography.bold, color: Colors.mutedText,
        letterSpacing: 1.5, marginBottom: Spacing.sm, textTransform: 'uppercase',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
    },
    gridTile: {
        width: '22%',
        // Taller aspect ratio = more room for crop details without wasted square space
        aspectRatio: 0.62,
        backgroundColor: Colors.warmTan ?? '#F5EFE6',
        borderRadius: Radius.sm,
        borderWidth: 2,
        borderColor: 'rgba(45,79,30,0.2)',
        padding: Spacing.xs,
        gap: 3,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
    },
    gridTileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 1 },
    gridExtraBadge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(45,79,30,0.12)' },
    gridExtraBadgeText: { fontSize: 7, fontWeight: '800', color: Colors.primaryGreen },
    gridTileNum: { fontSize: 7, fontWeight: Typography.bold, color: Colors.mutedText, letterSpacing: 0.5 },
    gridTileCrop: { fontSize: 9, fontWeight: '800', lineHeight: 12, color: Colors.darkText },
    gridTileSucc: { fontSize: 7, opacity: 0.8, lineHeight: 10, color: Colors.darkText },
    gridTileEmpty: { fontSize: 8, color: Colors.mutedText, fontStyle: 'italic' },
    gridTileEmptyContent: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
    gridTileEmptyIcon: { fontSize: 18, color: 'rgba(45,79,30,0.2)', marginBottom: 2 },
    gridTileMeta: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', marginTop: 1 },
    gridDtmPill: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(45,79,30,0.12)' },
    gridDtmText: { fontSize: 7, fontWeight: '800', color: Colors.primaryGreen },
    gridMethodPill: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(45,79,30,0.08)' },
    gridMethodText: { fontSize: 7, fontWeight: '700', color: Colors.primaryGreen },
    bedPlanted: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    bedCropEmoji: { fontSize: 20 },
    bedCropName: { fontSize: Typography.sm, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    bedCropVariety: { fontSize: 10, color: Colors.mutedText },
    successionCountPill: { backgroundColor: Colors.softLavender, paddingVertical: 2, paddingHorizontal: 6, borderRadius: Radius.full },
    successionCountText: { fontSize: 9, color: Colors.white, fontWeight: Typography.bold },
    bedDtmPill: { backgroundColor: Colors.primaryGreen, paddingVertical: 2, paddingHorizontal: 8, borderRadius: Radius.full, marginLeft: 'auto' },
    bedDtmText: { fontSize: 9, color: Colors.cream, fontWeight: Typography.bold },
    bedDateRange: { fontSize: 8, fontWeight: '600', opacity: 0.85, letterSpacing: 0.1 },
    bedEmpty: { gap: 2 },
    bedEmptyDashes: { fontSize: Typography.xs, color: 'rgba(45,79,30,0.35)', letterSpacing: 2 },
    bedEmptyHint: { fontSize: 10, color: Colors.primaryGreen, fontWeight: Typography.medium, opacity: 0.6 },
    bedArrow: { paddingRight: Spacing.sm },
    bedArrowText: { fontSize: 22, color: Colors.primaryGreen, opacity: 0.4 },

    // ── Succession chain (all slots in a horizontal row) ───────────────────────
    bedRowPlanted: { minHeight: 64 },
    successionChain: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, flex: 1 },
    successionChainItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    successionArrow: { fontSize: 12, color: Colors.burntOrange, opacity: 0.7 },
    successionSlot: {
        backgroundColor: 'rgba(45,79,30,0.08)',
        borderRadius: Radius.sm,
        paddingVertical: 3,
        paddingHorizontal: 7,
        gap: 1,
        minWidth: 60,
    },
    successionSlotEmpty: {
        backgroundColor: 'rgba(45,79,30,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.15)',
        borderStyle: 'dashed',
    },
    successionSlotName: { fontSize: 10, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    successionSlotVariety: { fontSize: 9, color: Colors.mutedText },
    successionSlotAdd: { fontSize: 9, color: Colors.primaryGreen, opacity: 0.5, fontStyle: 'italic' },


    actionButtons: { gap: Spacing.sm, marginTop: Spacing.md },
    finishBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 18, borderRadius: Radius.md, alignItems: 'center' },
    finishBtnText: { color: Colors.cream, fontSize: Typography.md, fontWeight: Typography.bold, letterSpacing: 1.5 },
    aiPlanBtn: { backgroundColor: '#E8F5E9', paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', borderWidth: 2, borderColor: Colors.primaryGreen },
    aiPlanBtnText: { color: Colors.primaryGreen, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1 },
    autoFillBtn: { backgroundColor: Colors.white, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primaryGreen },
    autoFillBtnText: { color: Colors.primaryGreen, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1 },
    revertBtn: { borderColor: '#B45309', backgroundColor: '#FFFBEB' },
    revertBtnText: { color: '#B45309' },

    // ── Strategy Picker ────────────────────────────────────────────────────────
    strategyPickerWrap: { gap: Spacing.sm },
    strategyPickerLabel: { fontSize: Typography.xs, fontWeight: '800', color: Colors.primaryGreen, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
    strategyCards: { gap: Spacing.sm },
    strategyCard: {
        backgroundColor: Colors.white,
        borderRadius: Radius.md,
        padding: Spacing.md,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.15)',
        gap: 6,
    },
    strategyCardActive: {
        borderColor: Colors.primaryGreen,
        backgroundColor: '#F1F8F1',
    },
    strategyCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    strategyCardLabel: { fontSize: Typography.sm, fontWeight: '800', color: Colors.primaryGreen },
    strategyCardLabelActive: { color: Colors.primaryGreen },
    strategyCardDesc: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 16 },
    strategyCardDescActive: { color: Colors.primaryGreen, opacity: 0.8 },
    strategySelectedBadge: { backgroundColor: Colors.primaryGreen, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    strategySelectedBadgeText: { fontSize: 11, color: Colors.cream, fontWeight: '800' },
    strategyBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 },
    strategyBarSegment: { borderRadius: 4 },
    strategyBarLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    strategyBarLabel: { fontSize: 9, color: Colors.mutedText, fontWeight: '700' },
    strategyConfirmBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', marginTop: 4 },
    strategyConfirmBtnText: { color: Colors.cream, fontSize: Typography.sm, fontWeight: '800', letterSpacing: 0.5 },

    drawerScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)', zIndex: 10 },
    drawer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.cardBg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: height * 0.75, zIndex: 11, paddingBottom: 32 },
    drawerHandle: { width: 40, height: 4, backgroundColor: 'rgba(45,79,30,0.25)', borderRadius: 2, alignSelf: 'center', marginTop: Spacing.sm, marginBottom: 4 },
    drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.1)', gap: Spacing.sm },
    drawerTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.primaryGreen },
    drawerSubtitle: { fontSize: Typography.xs, color: Colors.burntOrange, marginTop: 2, fontWeight: Typography.medium },
    drawerCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(45,79,30,0.1)', alignItems: 'center', justifyContent: 'center' },
    drawerCloseText: { fontSize: 14, color: Colors.primaryGreen },
    drawerLoading: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
    drawerLoadingText: { fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic' },
    drawerEmpty: { padding: Spacing.lg, color: Colors.mutedText, fontSize: Typography.sm, textAlign: 'center' },
    drawerList: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    drawerCropRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.07)', gap: Spacing.sm },
    drawerCropRowDim: { opacity: 0.45 },
    drawerCropEmoji: { fontSize: 26 },
    drawerCropImage: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#E8E0D5' },
    drawerCropInfo: { flex: 1, gap: 3 },
    drawerCropTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
    drawerCropName: { fontSize: Typography.base, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    drawerCropNameDim: { color: Colors.mutedText },
    drawerDtmPill: { backgroundColor: 'rgba(45,79,30,0.12)', paddingVertical: 2, paddingHorizontal: 8, borderRadius: Radius.full },
    drawerDtmPillDim: { backgroundColor: 'rgba(0,0,0,0.06)' },
    drawerDtmText: { fontSize: 10, color: Colors.primaryGreen, fontWeight: Typography.medium },
    topPickBadge: { backgroundColor: Colors.burntOrange, paddingVertical: 2, paddingHorizontal: 6, borderRadius: Radius.full },
    topPickText: { fontSize: 9, color: Colors.white, fontWeight: Typography.bold },
    drawerCropReason: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 15 },
    drawerCropReasonDim: { color: 'rgba(0,0,0,0.3)' },
    drawerCropWarning: { fontSize: Typography.xs, color: Colors.burntOrange, lineHeight: 14 },
    drawerRemainingDays: { fontSize: Typography.xs, color: Colors.primaryGreen, opacity: 0.75, lineHeight: 14, marginTop: 1 },
    drawerPlantBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.full },
    drawerPlantBtnText: { color: Colors.cream, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 0.5 },

    // ── Current plan section ──────────────────────────────────────────
    drawerCurrentPlan: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
    drawerCurrentPlanTitle: { fontSize: 11, fontWeight: Typography.semiBold, color: Colors.mutedText, letterSpacing: 0.5, marginBottom: Spacing.xs, textTransform: 'uppercase' },
    drawerCurrentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    drawerCurrentEmoji: { fontSize: 16 },
    drawerCurrentInfo: { flex: 1 },
    drawerCurrentName: { fontSize: 13, fontWeight: Typography.semiBold, color: Colors.primaryGreen },
    drawerCurrentVariety: { fontSize: 11, color: Colors.mutedText },
    drawerCurrentDtm: { backgroundColor: Colors.primaryGreen, paddingVertical: 2, paddingHorizontal: 8, borderRadius: Radius.full },
    drawerCurrentDtmText: { fontSize: 10, color: Colors.cream, fontWeight: Typography.bold },
    drawerCurrentDateRange: { fontSize: 10, color: Colors.burntOrange, fontWeight: '600', marginTop: 1 },
    drawerRemoveBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFEBEE', alignItems: 'center', justifyContent: 'center' },
    drawerRemoveBtnText: { fontSize: 12, color: '#C62828', fontWeight: Typography.bold },
    drawerDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: Spacing.sm },
    drawerAddMoreLabel: { fontSize: 12, fontWeight: Typography.semiBold, color: Colors.primaryGreen, opacity: 0.8 },
    drawerNoFitBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
    drawerNoFitText: { fontSize: 14, color: Colors.mutedText },
    drawerCropDateRange: { fontSize: 10, color: Colors.burntOrange, fontWeight: '600', marginBottom: 1 },

    // ── Frost filter toggle ──────────────────────────────────────────────
    frostFilterBtn: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'rgba(1,87,155,0.3)', backgroundColor: 'rgba(179,229,252,0.25)', alignSelf: 'flex-start' },
    frostFilterBtnActive: { backgroundColor: '#B3E5FC', borderColor: '#01579B' },
    frostFilterText: { fontSize: Typography.xs, fontWeight: '700', color: '#01579B' },
    frostFilterTextActive: { color: '#01579B' },
    frostFilterNote: { marginHorizontal: Spacing.lg, marginTop: 4, fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic', lineHeight: 16 },

    // ── Companion conflict styles ───────────────────────────────────────────────
    drawerCropRowConflict: { backgroundColor: 'rgba(183,28,28,0.04)', borderLeftWidth: 3, borderLeftColor: '#EF9A9A' },
    drawerPlantBtnWarn: { backgroundColor: '#F57F17' },
    companionWarningBadge: { backgroundColor: 'rgba(183,28,28,0.08)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, marginTop: 3, borderLeftWidth: 2, borderLeftColor: '#EF5350' },
    companionWarningText: { fontSize: 10, color: '#B71C1C', lineHeight: 14 },

    // ── Coverage fraction picker ──────────────────────────────────────────────
    coveragePickerWrap: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, backgroundColor: 'rgba(45,79,30,0.04)', borderRadius: Radius.sm, padding: Spacing.sm, gap: 6 },
    coveragePickerLabel: { fontSize: Typography.xs, fontWeight: '800', color: Colors.primaryGreen, letterSpacing: 0.5, textTransform: 'uppercase' },
    coveragePickerRow: { flexDirection: 'row', gap: 6 },
    coveragePickerNote: { fontSize: 10, color: Colors.mutedText, fontStyle: 'italic', lineHeight: 13 },
    coverageBtn: { flex: 1, paddingVertical: 7, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', alignItems: 'center', backgroundColor: Colors.white },
    coverageBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    coverageBtnText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primaryGreen },
    coverageBtnTextActive: { color: Colors.cream },
});
