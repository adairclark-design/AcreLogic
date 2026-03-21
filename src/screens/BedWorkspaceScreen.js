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
    TextInput,
    Alert,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { getSuccessionCandidatesRanked, autoGenerateSuccessions, AUTOFILL_STRATEGIES } from '../services/successionEngine';
import { saveBedAssignment, getBedSuccessions, getCropById } from '../services/database';
import { saveBedSuccessions, saveSeasonSnapshot, getPriorYearBedCrops, loadRotationHistory, loadSavedPlan, saveFarmProfile } from '../services/persistence';
import { checkBedCompanions, checkBlockNeighborWarnings } from '../services/companionService';
import cropData from '../data/crops.json';
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
const BedRow = ({ bedNumber, successions, onPress, seasonStart, seasonEnd, firstFrostDate, priorCrops, shelterType }) => {
    const hasSuccessions = successions?.length > 0;
    const seasonDays = seasonStart && seasonEnd ? daysBetween(seasonStart, seasonEnd) : 0;
    const showGantt = hasSuccessions && seasonDays > 10 &&
        successions.some(s => s.start_date && s.end_date);

    // IN / OUT / remaining days computation
    const firstIn   = hasSuccessions ? successions.reduce((min, s) => !s.start_date ? min : (!min || s.start_date < min ? s.start_date : min), null) : null;
    const lastOut   = hasSuccessions ? successions.reduce((max, s) => !s.end_date   ? max : (!max || s.end_date   > max ? s.end_date   : max), null) : null;
    const frostDate = firstFrostDate ?? seasonEnd;
    const daysRemaining = (lastOut && frostDate) ? Math.max(0, daysBetween(lastOut, frostDate)) : null;
    const remainingColor = daysRemaining === null ? null : daysRemaining >= 45 ? '#2E7D32' : daysRemaining >= 15 ? '#E65100' : '#C62828';
    const remainingBg    = daysRemaining === null ? null : daysRemaining >= 45 ? '#E8F5E9' : daysRemaining >= 15 ? '#FFF3E0' : '#FFEBEE';


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
                {/* Shelter badge */}
                {shelterType && shelterType !== 'none' && (
                    <Text style={styles.shelterBadge}>
                        {shelterType === 'greenhouse' ? '🏡' : '☔'}
                    </Text>
                )}
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

            {/* IN / OUT / remaining strip */}
            {hasSuccessions && (firstIn || lastOut || daysRemaining !== null) && (
                <View style={styles.seasonStrip}>
                    {firstIn && (
                        <Text style={styles.seasonStripItem}>
                            <Text style={styles.seasonStripLabel}>IN </Text>
                            <Text style={styles.seasonStripValue}>{fmtShortDate(firstIn)}</Text>
                        </Text>
                    )}
                    {lastOut && (
                        <Text style={styles.seasonStripItem}>
                            <Text style={styles.seasonStripLabel}> OUT </Text>
                            <Text style={styles.seasonStripValue}>{fmtShortDate(lastOut)}</Text>
                        </Text>
                    )}
                    {daysRemaining !== null && (
                        <View style={[styles.seasonStripRemaining, { backgroundColor: remainingBg }]}>
                            <Text style={[styles.seasonStripRemainingText, { color: remainingColor }]}>
                                {daysRemaining > 0 ? `🟢 ${daysRemaining}d left` : '🔴 Season full'}
                            </Text>
                        </View>
                    )}
                </View>
            )}

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
const SuccessionDrawer = ({ visible, bedNumber, currentSuccessions, allBedSuccessions, candidates, loading, frostFreeDays, onClose, onPlant, onPlantOutOfSeason, onRemoveSuccession, fillRemainingDtm, onEditCoverage, bedShelterType, onSetShelter }) => {
    const [frostFilter, setFrostFilter] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [coverageFraction, setCoverageFraction] = React.useState(1.0);
    const [editingIdx, setEditingIdx] = React.useState(null); // index of current-plan row being edited
    const translateY = useRef(new Animated.Value(height)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    // Reset search & fraction when drawer closes or bed changes
    React.useEffect(() => {
        if (!visible) {
            setSearchQuery('');
            setEditingIdx(null);
        }
        if (visible) setCoverageFraction(1.0);
    }, [visible, bedNumber]);

    // When entering fill-remaining mode, snap coverageFraction to the largest fraction that fits.
    // This prevents it being stuck at a previous value that's now out of range or auto-selected.
    React.useEffect(() => {
        if (fillRemainingDtm != null) {
            // remainingCoverage is computed below, but we can derive it directly here
            const total = (currentSuccessions ?? []).reduce((sum, s) => sum + (s.coverage_fraction ?? 1.0), 0);
            const remaining = Math.max(0, 1.0 - total);
            // Pick the largest fraction that fits (prefer full remaining if it's a clean step)
            const STEPS = [1.0, 0.75, 0.5, 0.25];
            const best = STEPS.find(v => v <= remaining + 0.01) ?? 0.25;
            setCoverageFraction(best);
        }
    }, [fillRemainingDtm]);

    // Animation open/close
    React.useEffect(() => {
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

    // Derived coverage state
    const currentTotal = (currentSuccessions ?? []).reduce((sum, s) => sum + (s.coverage_fraction ?? 1.0), 0);
    const remainingCoverage = Math.max(0, 1.0 - currentTotal);
    const isFillRemainingMode = fillRemainingDtm != null && remainingCoverage > 0 && remainingCoverage < 1.0;

    // Filter + sort candidates for display
    const displayedCandidates = React.useMemo(() => {
        let list = frostFilter ? candidates.filter(c => c.crop.frost_tolerant) : candidates;
        if (searchQuery.trim().length >= 2) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(c =>
                `${c.crop.name} ${c.crop.variety ?? ''} ${c.crop.category}`.toLowerCase().includes(q)
            );
        }
        if (isFillRemainingMode && fillRemainingDtm) {
            const similar = list.filter(c => Math.abs((c.crop.dtm ?? 0) - fillRemainingDtm) <= 25);
            const others = list.filter(c => Math.abs((c.crop.dtm ?? 0) - fillRemainingDtm) > 25);
            return [...similar, ...others];
        }
        return list;
    }, [candidates, frostFilter, searchQuery, isFillRemainingMode, fillRemainingDtm]);

    // Compute at component level so FlatList renderItem can access it
    // (was previously scoped inside the coverage-picker IIFE — caused ReferenceError on crop tap)
    const _coverageSteps = [0.25, 0.5, 0.75, 1.0];
    const _validSteps = isFillRemainingMode
        ? _coverageSteps.filter(v => v <= remainingCoverage + 0.01)
        : _coverageSteps;
    const effectiveFraction = _validSteps.some(v => Math.abs(v - coverageFraction) < 0.01)
        ? coverageFraction
        : (_validSteps[_validSteps.length - 1] ?? 1.0);

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
                    <View style={{ flex: 1 }}>
                        <Text style={styles.drawerTitle}>
                            {isFillRemainingMode
                                ? `What fills the rest of Bed ${bedNumber}?`
                                : 'Succession Planner'}
                        </Text>
                        <Text style={styles.drawerSubtitle}>
                            {isFillRemainingMode
                                ? `${Math.round(remainingCoverage * 100)}% of the bed still open · similar DTM shown first`
                                : `Bed ${bedNumber} · ${frostFreeDays ?? '—'} Frost-Free Days Available`}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.drawerCloseBtn} onPress={onClose}>
                        <Text style={styles.drawerCloseText}>✕</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Shelter toggle ── */}
                <View style={styles.shelterToggleWrap}>
                    <Text style={styles.shelterToggleLabel}>Bed protection:</Text>
                    <View style={styles.shelterToggleRow}>
                        {[
                            { key: 'none',       label: '🌿 Open',        ext: 0  },
                            { key: 'rowCover',   label: '☔ Row Cover',  ext: 14 },
                            { key: 'greenhouse', label: '🏡 Greenhouse', ext: 42 },
                        ].map(opt => {
                            const active = (bedShelterType ?? 'none') === opt.key;
                            return (
                                <TouchableOpacity
                                    key={opt.key}
                                    style={[styles.shelterBtn, active && styles.shelterBtnActive]}
                                    onPress={() => onSetShelter?.(opt.key)}
                                >
                                    <Text style={[styles.shelterBtnText, active && styles.shelterBtnTextActive]}>
                                        {opt.label}
                                    </Text>
                                    {opt.ext > 0 && (
                                        <Text style={[styles.shelterBtnExt, active && { color: 'rgba(255,248,240,0.8)' }]}>
                                            +{opt.ext}d season
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* ── Remaining days banner ── */}
                {frostFreeDays != null && frostFreeDays <= 60 && (
                    <View style={[styles.seasonBanner, frostFreeDays < 20 && styles.seasonBannerUrgent]}>
                        <Text style={[styles.seasonBannerText, frostFreeDays < 20 && styles.seasonBannerTextUrgent]}>
                            {frostFreeDays < 20
                                ? `🔴 Only ${frostFreeDays} days left — cool-season crops recommended`
                                : `⚠️ ${frostFreeDays} frost-free days remaining — cool crops prioritized`}
                        </Text>
                    </View>
                )}

                {/* Current bed plan — tap a row to edit coverage, tap ✕ to remove */}
                {currentSuccessions?.length > 0 && (
                    <View style={styles.drawerCurrentPlan}>
                        <Text style={styles.drawerCurrentPlanTitle}>Current Plan — tap to edit coverage</Text>
                        {currentSuccessions.map((s, idx) => {
                            const dateRange = fmtDateRange(s.start_date, s.end_date);
                            const isEditing = editingIdx === idx;
                            const FRACTIONS = [
                                { value: 0.25, label: '¼' },
                                { value: 0.5,  label: '½' },
                                { value: 0.75, label: '¾' },
                                { value: 1.0,  label: 'Full' },
                            ];
                            const currentFrac = s.coverage_fraction ?? 1.0;
                            const fracLabel = FRACTIONS.find(f => Math.abs(f.value - currentFrac) < 0.01)?.label ?? `${Math.round(currentFrac * 100)}%`;
                            return (
                                <View key={idx}>
                                    <TouchableOpacity
                                        style={[styles.drawerCurrentRow, isEditing && styles.drawerCurrentRowEditing]}
                                        onPress={() => setEditingIdx(isEditing ? null : idx)}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={styles.drawerCurrentEmoji}>{s.emoji ?? '🌱'}</Text>
                                        <View style={styles.drawerCurrentInfo}>
                                            <Text style={styles.drawerCurrentName}>{s.crop_name ?? s.name}</Text>
                                            <Text style={styles.drawerCurrentVariety}>{s.variety}</Text>
                                            {dateRange && (
                                                <Text style={styles.drawerCurrentDateRange}>{dateRange}</Text>
                                            )}
                                        </View>
                                        {/* Coverage badge */}
                                        <View style={styles.drawerCoverageBadge}>
                                            <Text style={styles.drawerCoverageBadgeText}>{fracLabel}</Text>
                                        </View>
                                        <View style={styles.drawerCurrentDtm}>
                                            <Text style={styles.drawerCurrentDtmText}>
                                                {s.dtm > 0 ? `${s.dtm}d` : 'CC'}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.drawerRemoveBtn}
                                            onPress={() => { setEditingIdx(null); onRemoveSuccession(idx); }}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <Text style={styles.drawerRemoveBtnText}>✕</Text>
                                        </TouchableOpacity>
                                    </TouchableOpacity>

                                    {/* Inline fraction editor */}
                                    {isEditing && (
                                        <View style={styles.drawerInlineEditor}>
                                            <Text style={styles.drawerInlineEditorLabel}>Adjust coverage:</Text>
                                            <View style={styles.drawerInlineEditorRow}>
                                                {FRACTIONS.map(f => {
                                                    const active = Math.abs(f.value - currentFrac) < 0.01;
                                                    return (
                                                        <TouchableOpacity
                                                            key={f.value}
                                                            style={[styles.drawerInlineFracBtn, active && styles.drawerInlineFracBtnActive]}
                                                            onPress={() => {
                                                                onEditCoverage(idx, f.value);
                                                                setEditingIdx(null);
                                                            }}
                                                        >
                                                            <Text style={[styles.drawerInlineFracText, active && styles.drawerInlineFracTextActive]}>{f.label}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                        <View style={styles.drawerDivider} />
                        <Text style={styles.drawerAddMoreLabel}>Add another crop:</Text>
                    </View>
                )}

                {/* 🔍 Search bar */}
                <View style={styles.drawerSearchWrap}>
                    <Text style={styles.drawerSearchIcon}>🔍</Text>
                    <TextInput
                        style={styles.drawerSearchInput}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search crops…"
                        placeholderTextColor={Colors.mutedText}
                        autoCorrect={false}
                        clearButtonMode="while-editing"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                            <Text style={{ fontSize: 13, color: Colors.mutedText }}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* 📏 Bed Coverage Fraction selector */}
                {(() => {
                    const FRACTIONS = [
                        { value: 0.25, label: '¼ Bed' },
                        { value: 0.5,  label: '½ Bed' },
                        { value: 0.75, label: '¾ Bed' },
                        { value: 1.0,  label: 'Full' },
                    ];
                    // Only show if there's still room in the bed
                    // Use remainingCoverage (already computed above) to avoid stale currentTotal
                    if (remainingCoverage <= 0.01) return null;
                    // In fill-remaining mode, only show fractions that fit
                    const validFractions = isFillRemainingMode
                        ? FRACTIONS.filter(f => f.value <= remainingCoverage + 0.01)
                        : FRACTIONS;
                    // effectiveFraction computed at component level above (in scope for FlatList renderItem)
                    return (
                        <View style={styles.coveragePickerWrap}>
                            <Text style={styles.coveragePickerLabel}>🌱 Bed Coverage</Text>
                            <View style={styles.coveragePickerRow}>
                                {validFractions.map(f => (
                                    <TouchableOpacity
                                        key={f.value}
                                        style={[styles.coverageBtn, Math.abs(effectiveFraction - f.value) < 0.01 && styles.coverageBtnActive]}
                                        onPress={() => setCoverageFraction(f.value)}
                                    >
                                        <Text style={[styles.coverageBtnText, Math.abs(effectiveFraction - f.value) < 0.01 && styles.coverageBtnTextActive]}>{f.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {effectiveFraction < 1.0 && (
                                <Text style={styles.coveragePickerNote}>
                                    Plan {Math.round(effectiveFraction * 100)}% of this bed.{' '}
                                    {Math.round(Math.max(0, remainingCoverage - effectiveFraction) * 100) > 0
                                        ? `${Math.round(Math.max(0, remainingCoverage - effectiveFraction) * 100)}% still open.`
                                        : 'Bed will be full.'}
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
                        style={{ flex: 1 }}
                        data={displayedCandidates}
                        keyExtractor={(item) => item.crop.id}
                        numColumns={4}
                        columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 2 }}
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
                                    style={[
                                        styles.drawerCropBox,
                                        !item.fits && styles.drawerCropBoxDim,
                                        hasCompanionConflict && styles.drawerCropBoxConflict
                                    ]}
                                    onPress={() => {
                                        if (item.fits) {
                                            onPlant({ ...item, coverage_fraction: effectiveFraction });
                                        } else {
                                            // Out-of-season: offer force-add with protection warning
                                            onPlantOutOfSeason({ ...item, coverage_fraction: effectiveFraction });
                                        }
                                    }}
                                    activeOpacity={0.8}
                                >
                                    {CROP_IMAGES[item.crop.id]
                                        ? <Image
                                            source={CROP_IMAGES[item.crop.id]}
                                            style={styles.drawerCropBoxImg}
                                            resizeMode="cover"
                                        />
                                        : <Text style={styles.drawerCropBoxEmoji}>{item.crop.emoji}</Text>
                                    }
                                    <Text style={styles.drawerCropBoxName} numberOfLines={2}>
                                        {item.crop.name}{item.crop.variety ? `\n${item.crop.variety}` : ''}
                                    </Text>
                                    <Text style={styles.drawerCropBoxMeta} numberOfLines={1}>
                                        {item.crop.dtm > 0 ? `${item.crop.dtm}d` : 'Cover'} · {item.crop.season === 'cool' ? '❄️' : '☀️'}
                                    </Text>

                                    {/* Badges overlay */}
                                    {item.score > 20 && (
                                        <View style={styles.drawerCropBoxBestBadge}><Text style={{fontSize: 8, color: '#FFF'}}>★</Text></View>
                                    )}
                                    {hasCompanionConflict && (
                                        <View style={styles.drawerCropBoxWarnBadge}><Text style={{fontSize: 8, color: '#FFF'}}>⚠️</Text></View>
                                    )}
                                    {!item.fits && !hasCompanionConflict && (
                                        <View style={styles.drawerCropBoxWarnBadge}><Text style={{fontSize: 8, color: '#FFF'}}>🚫</Text></View>
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
    const [bedSuccessions, setBedSuccessions] = useState(() => {
        const params = route?.params ?? {};

        // VegetableGrid ALWAYS passes 'bedSuccessions' as a param key:
        //   {}           → fresh start (new farm or zip change)
        //   {1:[...], …} → same-session Crops↔BedWorkspace round-trip
        // HeroScreen also passes it when restoring a saved plan (non-empty).
        //
        // If the key is present, trust the param value entirely — no localStorage.
        if ('bedSuccessions' in params) {
            const fromParams = params.bedSuccessions;
            if (fromParams && Object.keys(fromParams).length > 0) return fromParams;
            return {}; // explicit empty = fresh start
        }

        // Key absent = arrived via DashboardScreen, page refresh, or deep-link.
        // Restore from localStorage so the user doesn't lose work on refresh.
        const saved = loadSavedPlan();
        return saved?.bedSuccessions ?? {};
    });
    // ── Per-bed shelter type (Phase 2) ────────────────────────────────────────
    // 'none' | 'rowCover' | 'greenhouse'  — persisted in state, saved alongside successions
    const [bedShelter, setBedShelter] = useState({});

    // Extension in days (net gain on each end of season) per shelter type
    const SHELTER_EXT = { none: 0, rowCover: 7, greenhouse: 21 };

    function buildEffectiveProfile(profile, shelterType) {
        const ext = SHELTER_EXT[shelterType ?? 'none'] ?? 0;
        if (!ext || !profile) return profile;
        const shiftDate = (iso, days) => {
            if (!iso) return iso;
            const d = new Date(iso + 'T12:00:00');
            d.setDate(d.getDate() + days);
            return d.toISOString().split('T')[0];
        };
        return {
            ...profile,
            frost_free_days: (profile.frost_free_days ?? 170) + ext * 2,
            last_frost_date:  shiftDate(profile.last_frost_date,  -ext),
            first_frost_date: shiftDate(profile.first_frost_date,  ext),
        };
    }
    const [drawerCandidates, setDrawerCandidates] = useState([]);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [showStrategyPicker, setShowStrategyPicker] = useState(false);
    const [autoFillStrategy, setAutoFillStrategy] = useState('balanced');
    const [autoFillFilters, setAutoFillFilters] = useState({
        flowers: true,
        specialty: true,
        berries: true,
        vegetables: true,
        longDtm: true,
        shortDtm: true,
    });
    const toggleFilter = (key) => setAutoFillFilters(prev => ({ ...prev, [key]: !prev[key] }));
    const [preAutoFillSnapshot, setPreAutoFillSnapshot] = useState(null); // snapshot before last auto-fill
    const [rotationHistory, setRotationHistory] = useState(() => loadRotationHistory());
    // fillRemainingDtm: set when the last-added crop used < 100% coverage.
    // Signals the drawer to stay open in “fill the rest” mode, DTM-sorted.
    const [fillRemainingDtm, setFillRemainingDtm] = useState(null);

    // Season range from farmProfile (for Gantt timeline)
    const seasonStart = farmProfile?.last_frost_date ?? null;
    const seasonEnd = farmProfile?.first_frost_date ?? null;

    // Auto-save bedSuccessions + farmProfile to localStorage on every change (web only)
    // farmProfile is saved alongside so future sessions can detect a location change
    // and avoid restoring stale bed data from a different farm.
    useEffect(() => {
        saveBedSuccessions(bedSuccessions);
        saveSeasonSnapshot(bedSuccessions);
        if (farmProfile) saveFarmProfile(farmProfile);
        setRotationHistory(loadRotationHistory()); // re-read so bed cards update
    }, [bedSuccessions]);

    const handleBedLongPress = useCallback((bedNumber) => {
        // Long-press → show inline BedNoteModal — no navigation away from this screen
        setNoteBed(bedNumber);
    }, []);

    const openBed = useCallback(async (bedNumber, shelterOverride) => {
        setActiveBed(bedNumber);
        setDrawerOpen(true);
        setDrawerLoading(true);
        setDrawerCandidates([]);

        try {
            const currentSuccessions = bedSuccessions[bedNumber] ?? [];
            const rawProfile = farmProfile ?? { frost_free_days: 170, last_frost_date: `${new Date().getFullYear()}-04-15`, first_frost_date: `${new Date().getFullYear()}-10-15`, lat: 45.5 };
            const currentShelter = shelterOverride !== undefined ? shelterOverride : (bedShelter[bedNumber] ?? 'none');
            const profile = buildEffectiveProfile(rawProfile, currentShelter);

            // ── Find the earliest unfilled window ─────────────────────────────────────
            // After deleting a crop, remaining crops may have a gap at the start or middle.
            // The engine always anchors to the LAST succession's end_date, so we must
            // only pass it the contiguous block before the first open window.
            //
            // Cases:
            //   [empty]                              → pass [] → engine starts at last_frost_date
            //   [crop2: Jul-Sep] (crop1 deleted)     → gap before first crop → pass [] → engine starts at last_frost_date
            //   [crop1: Apr-Jun, gap, crop2: Aug-Sep]→ internal gap → pass [crop1] → engine starts at Jun+1
            //   [crop1, crop2, crop3] (contiguous)   → no gap → pass all → engine starts at crop3.end+1

            let successionsForEngine = currentSuccessions;

            if (currentSuccessions.length > 0) {
                // Sort by start_date so gap detection works regardless of insertion order
                const sorted = [...currentSuccessions].sort(
                    (a, b) => new Date(a.start_date) - new Date(b.start_date)
                );

                const seasonStart = new Date(profile.last_frost_date);

                // Check for a gap at the BEGINNING (first crop doesn't start at season start)
                const firstCropStart = new Date(sorted[0].start_date);
                const daysBeforeFirst = Math.round((firstCropStart - seasonStart) / 86400000);

                if (daysBeforeFirst > 5) {
                    // There's a meaningful open window before the first crop — offer season start
                    successionsForEngine = [];
                } else {
                    // Walk consecutive crops and find first internal gap (>7 days)
                    let gapAfterIdx = null;
                    for (let i = 0; i < sorted.length - 1; i++) {
                        const endMs  = new Date(sorted[i].end_date).getTime();
                        const startMs = new Date(sorted[i + 1].start_date).getTime();
                        const gapDays = Math.round((startMs - endMs) / 86400000);
                        if (gapDays > 7) {
                            gapAfterIdx = i;
                            break;
                        }
                    }
                    successionsForEngine = gapAfterIdx !== null
                        ? sorted.slice(0, gapAfterIdx + 1)  // only crops before the gap
                        : sorted;                            // no gap — normal tail append
                }
            }

            // Pass prior-year crops for this bed so engine applies rotation penalties/bonuses
            const priorYearCrops = getPriorYearBedCrops(bedNumber);

            // ── Pass 1: normal engine run (respects season / DTM filters) ─────────────
            const engineCandidates = await getSuccessionCandidatesRanked(
                { successions: successionsForEngine },
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
    }, [bedSuccessions, farmProfile, selectedCropIds, bedShelter]);


    const closeDrawer = useCallback(() => {
        setDrawerOpen(false);
        setFillRemainingDtm(null);
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
            // Out-of-season protection flag — persisted so rotation history captures it
            requires_protection: candidateItem.requires_protection ?? false,
            notes: candidateItem.requires_protection ? '🌿 Planned with row cover / greenhouse protection' : undefined,
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

        setBedSuccessions(prev => {
            const updated = { ...prev, [activeBed]: [...(prev[activeBed] ?? []), newSuccession] };

            // ── Partial-coverage: stay open and prompt for the rest ──────────────
            const addedCoverage = candidateItem.coverage_fraction ?? 1.0;
            const priorTotal = (prev[activeBed] ?? []).reduce((sum, s) => sum + (s.coverage_fraction ?? 1.0), 0);
            const newTotal = priorTotal + addedCoverage;

            if (newTotal < 0.99) {
                // Bed still has capacity — keep drawer open in fill-remaining mode.
                // Re-query using the SAME succession list (engine will use same start date
                // since coverage doesn’t advance the clock — the bed shares its time window).
                setFillRemainingDtm(crop.dtm ?? null);
                // Re-run candidate loading with the updated successions
                setTimeout(() => {
                    openBed(activeBed);
                    // Restore drawer open (openBed sets it, but let's be explicit)
                    setDrawerOpen(true);
                }, 50);
            } else {
                // Bed is fully covered (or overflow) — close the drawer
                setFillRemainingDtm(null);
                closeDrawer();
            }

            return updated;
        });
    }, [activeBed, bedSuccessions, planId, closeDrawer, openBed]);

    // Remove a succession by index from the active bed (called from drawer)
    const removeSuccessionFromBed = useCallback((idx) => {
        setBedSuccessions(prev => {
            const updated = [...(prev[activeBed] ?? [])];
            updated.splice(idx, 1);
            return { ...prev, [activeBed]: updated };
        });
    }, [activeBed]);


    const handleAutoFill = useCallback(async (strategyId, filters) => {
        // Split beds into three buckets:
        //  (A) empty          → full auto-fill (pick primary + generate chain)
        //  (B) partial/manual → append auto-successions after the last existing crop
        //  (C) fully-planned  → skip entirely (don't overwrite user's complete plan)
        const hasManualCrops = (n) => (bedSuccessions[n] ?? []).some(s => !s.is_auto_generated);

        const emptyBedsToFill = Array.from({ length: NUM_BEDS }, (_, i) => i + 1)
            .filter(n => (bedSuccessions[n] ?? []).length === 0);

        const partialBedsToComplete = Array.from({ length: NUM_BEDS }, (_, i) => i + 1)
            .filter(n => hasManualCrops(n)); // has manual crops → complete the rest

        if (emptyBedsToFill.length === 0 && partialBedsToComplete.length === 0) return;

        // Snapshot so user can revert
        setPreAutoFillSnapshot({ ...bedSuccessions });

        const profile = farmProfile ?? {
            frost_free_days: 170,
            last_frost_date:  `${new Date().getFullYear()}-04-15`,
            first_frost_date: `${new Date().getFullYear()}-10-15`,
            lat: 45.5,
        };

        const { autoFillRemainingBeds } = await import('../services/successionEngine');

        // Beds that already have a full plan (not empty, not partial)
        const alreadyFullBeds = Array.from({ length: NUM_BEDS }, (_, i) => i + 1)
            .filter(n => !emptyBedsToFill.includes(n) && !partialBedsToComplete.includes(n))
            .map(n => ({ bed_number: n, successions: bedSuccessions[n] ?? [] }));

        // ── Step 1: auto-fill empty beds (existing logic) ────────────────────
        const autoFilled = await autoFillRemainingBeds(
            alreadyFullBeds, emptyBedsToFill, profile, strategyId, filters ?? autoFillFilters
        );

        const updatedSuccessions = { ...bedSuccessions };
        for (const [bedNum, succs] of Object.entries(autoFilled)) {
            updatedSuccessions[bedNum] = succs;
        }

        // ── Step 2: complete partial/manual beds ─────────────────────────────
        // Build farm-wide crop count from everything placed so far (including step 1)
        const farmCropCount = {};
        for (const [, succs] of Object.entries(updatedSuccessions)) {
            for (const s of succs ?? []) {
                if (s.crop_id) farmCropCount[s.crop_id] = (farmCropCount[s.crop_id] ?? 0) + 1;
            }
        }

        const strat = AUTOFILL_STRATEGIES.find(s => s.id === strategyId) ?? AUTOFILL_STRATEGIES[2];
        const maxRepeat = strat.maxRepeat ?? 3;

        for (const bedNum of partialBedsToComplete) {
            const existingSuccs = bedSuccessions[bedNum] ?? [];
            const lastSucc = existingSuccs[existingSuccs.length - 1];
            if (!lastSucc?.end_date) continue;

            // Check if there's meaningful season window remaining
            const daysLeft = Math.round(
                (new Date(profile.first_frost_date) - new Date(lastSucc.end_date)) / 86400000
            );
            if (daysLeft <= 10) continue; // effectively full — skip

            // Generate successions that follow the last crop in this bed
            const addedSuccessions = await autoGenerateSuccessions(
                lastSucc, profile, { ...farmCropCount }, maxRepeat
            );

            if (addedSuccessions.length > 0) {
                updatedSuccessions[bedNum] = [...existingSuccs, ...addedSuccessions];
                // Update farm count so subsequent partial beds avoid the same crops
                for (const s of addedSuccessions) {
                    if (s.crop_id) farmCropCount[s.crop_id] = (farmCropCount[s.crop_id] ?? 0) + 1;
                }
            }
        }

        setBedSuccessions(updatedSuccessions);
        setShowStrategyPicker(false);
    }, [bedSuccessions, farmProfile, autoFillFilters]);

    const handleRevertAutoFill = useCallback(() => {
        if (!preAutoFillSnapshot) return;
        setBedSuccessions(preAutoFillSnapshot);
        setPreAutoFillSnapshot(null);
    }, [preAutoFillSnapshot]);

    // Edit the coverage_fraction of an existing succession in the active bed
    const editSuccessionCoverage = useCallback((idx, newFraction) => {
        setBedSuccessions(prev => {
            const updated = [...(prev[activeBed] ?? [])];
            if (!updated[idx]) return prev;
            updated[idx] = { ...updated[idx], coverage_fraction: newFraction };
            return { ...prev, [activeBed]: updated };
        });
    }, [activeBed]);

    // Plant an out-of-season crop with a row-cover/greenhouse protection warning.
    // Uses Alert.alert (native on iOS/Android, browser confirm() on web via Expo polyfill).
    const handlePlantOutOfSeason = useCallback((candidateItem) => {
        const cropName = candidateItem.crop.name;
        const protectedMsg =
            `“${cropName}” is outside the current frost-free window.\n\n` +
            `It won’t perform well without a row cover or greenhouse.\n\n` +
            `Add it anyway? It will be saved and counted in next year’s rotation history.`;

        Alert.alert(
            '🌿 Outside Growing Window',
            protectedMsg,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Yes, Add with Protection',
                    onPress: () => {
                        // Compute end_date from start_date + dtm if engine returned null
                        const profile = farmProfile ?? {};
                        const startDate = candidateItem.start_date ?? profile.first_frost_date ?? new Date().toISOString().slice(0, 10);
                        let endDate = candidateItem.end_date;
                        if (!endDate) {
                            const dtm = candidateItem.crop.dtm ?? 60;
                            const start = new Date(startDate);
                            start.setDate(start.getDate() + dtm);
                            endDate = start.toISOString().slice(0, 10);
                        }
                        plantCrop({ ...candidateItem, start_date: startDate, end_date: endDate, requires_protection: true });
                    },
                },
            ],
            { cancelable: true }
        );
    }, [farmProfile, plantCrop]);

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
                        <Text style={styles.heading} numberOfLines={1}>Farm Block</Text>
                    </View>
                    <View style={styles.progressPill}>
                        <Text style={styles.progressText}>{plannedCount}/{NUM_BEDS}</Text>
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
                        onPress={() => navigation.navigate('VegetableGrid', {
                            farmProfile, planId, selectedCropIds,
                            bedSuccessions, // thread through so Plan Crops returns with same beds
                            fromWorkspace: true,
                        })}
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
                        onPress={() => {
                            // Build a sandbox canvas that matches the block's plot.
                            // 8 beds (4×8 ft) in 2 rows × 4 columns with 2 ft pathways
                            // → 28 ft wide × 24 ft long plot.
                            // isSandbox:true = starts empty, user adds beds; boundary is drawn.
                            const bedW = 4, bedH = 8, pathW = 2, cols = 4, rows = 2;
                            const plotW = cols * bedW + (cols - 1) * pathW + pathW * 2; // 28 ft
                            const plotH = rows * bedH + (rows - 1) * pathW + pathW * 2; // 24 ft
                            const spaceJson = JSON.stringify({
                                spaceLengthFt:   plotH,
                                spaceWidthFt:    plotW,
                                bedLengthFt:     bedH,
                                bedWidthFt:      bedW,
                                pathwayWidthFt:  pathW,
                                bedsAcrossWidth: cols,
                                bedsAlongLength: rows,
                                nsPathwayCount:  0,
                                ewPathwayCount:  0,
                                mainPathWidthFt: 0,
                                isSandbox:       true,
                            });
                            navigation.navigate('VisualBedLayout', { farmProfile, spaceJson });
                        }}
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

            {/* ── Crop Queue Confirmation Panel ─────────────────────────────────── */}
            {selectedCropIds.length > 0 && (
                <View style={[styles.cropQueueBanner, Platform.OS === 'web' && { paddingBottom: 16 }]}>
                    <Text style={styles.cropQueueTitle}>
                        🌱 Your Selected Crops ({selectedCropIds.length}) — confirm before assigning beds
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={true}
                        contentContainerStyle={styles.cropQueueScroll}
                    >
                        {selectedCropIds.map(id => {
                            const crop = cropData.crops.find(c => c.id === id);
                            if (!crop) return null;
                            const isCool = crop.season === 'cool';
                            const isWarm = crop.season === 'warm';
                            return (
                                <View key={id} style={styles.cropQueueChip}>
                                    <Text style={styles.cropQueueChipEmoji}>
                                        {crop.emoji ?? '🌱'}
                                    </Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cropQueueChipName} numberOfLines={1}>
                                            {crop.name}{crop.variety ? ` — ${crop.variety}` : ''}
                                        </Text>
                                        <View style={styles.cropQueueChipBadges}>
                                            {crop.dtm != null && (
                                                <View style={styles.queueBadge}>
                                                    <Text style={styles.queueBadgeText}>{crop.dtm}d</Text>
                                                </View>
                                            )}
                                            {isCool && (
                                                <View style={[styles.queueBadge, styles.queueBadgeCool]}>
                                                    <Text style={[styles.queueBadgeText, styles.queueBadgeCoolText]}>❄️ Cool</Text>
                                                </View>
                                            )}
                                            {isWarm && (
                                                <View style={[styles.queueBadge, styles.queueBadgeWarm]}>
                                                    <Text style={[styles.queueBadgeText, styles.queueBadgeWarmText]}>☀️ Warm</Text>
                                                </View>
                                            )}
                                            {crop.seed_type && (
                                                <View style={styles.queueBadge}>
                                                    <Text style={styles.queueBadgeText}>{crop.seed_type}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

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
                        firstFrostDate={seasonEnd}
                        shelterType={bedShelter[bedNum] ?? 'none'}
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

                                                {/* ── Crop Filters (shown on selected card only) ────────────────────────────── */}
                                                {selected && (
                                                    <View style={styles.filterSection}>
                                                        <Text style={styles.filterSectionLabel}>Crop Filters</Text>
                                                        <View style={styles.filterGrid}>
                                                            {[
                                                                { key: 'vegetables', emoji: '🥦', label: 'Vegetables' },
                                                                { key: 'berries',    emoji: '🍓', label: 'Berries' },
                                                                { key: 'flowers',    emoji: '🏵', label: 'Flowers' },
                                                                { key: 'specialty',  emoji: '✨', label: 'Specialty' },
                                                                { key: 'shortDtm',  emoji: '⚡', label: 'Short DTM' },
                                                                { key: 'longDtm',   emoji: '📅', label: 'Long DTM' },
                                                            ].map(f => {
                                                                const on = autoFillFilters[f.key];
                                                                return (
                                                                    <TouchableOpacity
                                                                        key={f.key}
                                                                        style={[styles.filterChip, on && styles.filterChipOn]}
                                                                        onPress={() => toggleFilter(f.key)}
                                                                        activeOpacity={0.75}
                                                                    >
                                                                        <Text style={styles.filterChipEmoji}>{f.emoji}</Text>
                                                                        <Text style={[styles.filterChipLabel, on && styles.filterChipLabelOn]}>{f.label}</Text>
                                                                        <View style={[styles.filterChipBadge, on && styles.filterChipBadgeOn]}>
                                                                            <Text style={[styles.filterChipBadgeText, on && styles.filterChipBadgeTextOn]}>{on ? 'Y' : 'N'}</Text>
                                                                        </View>
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                    <TouchableOpacity
                                        style={styles.strategyConfirmBtn}
                                        onPress={() => handleAutoFill(autoFillStrategy, autoFillFilters)}
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
                frostFreeDays={activeBed
                    ? (buildEffectiveProfile(
                        farmProfile ?? { frost_free_days: 170 },
                        bedShelter[activeBed] ?? 'none'
                      ).frost_free_days)
                    : frostFreeDays}
                onClose={closeDrawer}
                onPlant={plantCrop}
                onPlantOutOfSeason={handlePlantOutOfSeason}
                onRemoveSuccession={removeSuccessionFromBed}
                onEditCoverage={editSuccessionCoverage}
                fillRemainingDtm={fillRemainingDtm}
                bedShelterType={activeBed ? (bedShelter[activeBed] ?? 'none') : 'none'}
                onSetShelter={(shelterType) => {
                    if (!activeBed) return;
                    setBedShelter(prev => ({ ...prev, [activeBed]: shelterType }));
                    // Re-run candidate fetch with new effective profile immediately using override
                    openBed(activeBed, shelterType);
                }}
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

    // ── Crop Queue Confirmation Panel ─────────────────────────────────────────
    cropQueueBanner: {
        backgroundColor: 'rgba(45,79,30,0.05)',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(45,79,30,0.13)',
        paddingTop: 10,
        paddingBottom: 12,
        paddingLeft: Spacing.lg,
        marginBottom: 2,
    },
    cropQueueTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: Colors.primaryGreen,
        letterSpacing: 0.4,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    cropQueueScroll: {
        gap: 8,
        paddingRight: Spacing.lg,
    },
    cropQueueChip: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        backgroundColor: Colors.white,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.15)',
        minWidth: 130,
        maxWidth: 200,
        ...Shadows.card,
    },
    cropQueueChipEmoji: {
        fontSize: 20,
        lineHeight: 24,
    },
    cropQueueChipName: {
        fontSize: 11,
        fontWeight: '800',
        color: Colors.primaryGreen,
        marginBottom: 4,
        flexWrap: 'wrap',
    },
    cropQueueChipBadges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 3,
    },
    queueBadge: {
        backgroundColor: 'rgba(45,79,30,0.09)',
        borderRadius: 4,
        paddingVertical: 1,
        paddingHorizontal: 5,
    },
    queueBadgeText: {
        fontSize: 8,
        fontWeight: '800',
        color: Colors.primaryGreen,
    },
    queueBadgeCool: { backgroundColor: '#dff0fa' },
    queueBadgeCoolText: { color: '#005f80' },
    queueBadgeWarm: { backgroundColor: '#fff0e0' },
    queueBadgeWarmText: { color: '#bf5400' },

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

    // ── Season strip (IN / OUT / days remaining) ────────────────────────────
    seasonStrip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: Spacing.sm, paddingBottom: 6, flexWrap: 'wrap',
    },
    seasonStripItem: { fontSize: 10, color: Colors.mutedText },
    seasonStripLabel: { fontWeight: '700', color: Colors.mutedText, opacity: 0.7 },
    seasonStripValue: { fontWeight: '800', color: Colors.primaryGreen },
    seasonStripRemaining: {
        borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2,
        marginLeft: 2,
    },
    seasonStripRemainingText: { fontSize: 10, fontWeight: '800' },

    // ── Shelter badge (on bed label) ────────────────────────────────────────
    shelterBadge: { fontSize: 14, marginLeft: 4 },

    // ── Shelter toggle (in drawer header) ───────────────────────────────────
    shelterToggleWrap: {
        paddingHorizontal: Spacing.lg, paddingVertical: 8,
        borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.08)',
    },
    shelterToggleLabel: { fontSize: 10, fontWeight: '700', color: Colors.mutedText, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' },
    shelterToggleRow: { flexDirection: 'row', gap: 8 },
    shelterBtn: {
        flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4,
        borderRadius: Radius.md, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
        backgroundColor: '#F5F3EE', gap: 2,
    },
    shelterBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    shelterBtnText: { fontSize: 11, fontWeight: '800', color: Colors.primaryGreen, textAlign: 'center' },
    shelterBtnTextActive: { color: '#FFF8F0' },
    shelterBtnExt: { fontSize: 9, color: Colors.mutedText, fontWeight: '600' },

    // ── Season remaining warning banner ─────────────────────────────────────
    seasonBanner: {
        marginHorizontal: Spacing.lg, marginTop: 8, borderRadius: Radius.md,
        paddingVertical: 8, paddingHorizontal: 12,
        backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: 'rgba(230,81,0,0.2)',
    },
    seasonBannerUrgent: { backgroundColor: '#FFEBEE', borderColor: 'rgba(198,40,40,0.25)' },
    seasonBannerText: { fontSize: 12, fontWeight: '700', color: '#E65100' },
    seasonBannerTextUrgent: { color: '#C62828' },

    // ── Season chip on crop candidate card ──────────────────────────────────
    seasonChip: {
        borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4,
    },
    seasonChipCool: { backgroundColor: '#E3F2FD' },
    seasonChipWarm: { backgroundColor: '#FFF8E1' },
    seasonChipText: { fontSize: 9, fontWeight: '800', color: Colors.mutedText },

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

    // ── Auto-Fill crop filters ─────────────────────────────────────────────────
    filterSection: {
        marginTop: Spacing.sm, paddingTop: Spacing.sm,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)',
    },
    filterSectionLabel: {
        fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.7)',
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
    },
    filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    filterChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingVertical: 5, paddingHorizontal: 8, borderRadius: Radius.sm,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    },
    filterChipOn: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.5)' },
    filterChipEmoji: { fontSize: 11 },
    filterChipLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
    filterChipLabelOn: { color: Colors.cream },
    filterChipBadge: {
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    },
    filterChipBadgeOn: { backgroundColor: Colors.warmTan },
    filterChipBadgeText: { fontSize: 8, fontWeight: '900', color: 'rgba(255,255,255,0.5)' },
    filterChipBadgeTextOn: { color: Colors.primaryGreen },

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
    drawerCropBox: {
        width: '23.5%', aspectRatio: 0.95, borderRadius: Radius.sm,
        backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(45,79,30,0.15)',
        alignItems: 'center', justifyContent: 'center', padding: 4,
        marginBottom: 8, gap: 2,
    },
    drawerCropBoxDim: { opacity: 0.45 },
    drawerCropBoxConflict: { borderColor: '#EF5350', backgroundColor: 'rgba(183,28,28,0.04)' },
    drawerCropBoxImg: { width: 44, height: 44, borderRadius: 6, marginBottom: 2 },
    drawerCropBoxEmoji: { fontSize: 26, marginBottom: 2 },
    drawerCropBoxName: { fontSize: 9, fontWeight: '800', color: Colors.primaryGreen, textAlign: 'center', lineHeight: 11 },
    drawerCropBoxMeta: { fontSize: 8, color: Colors.mutedText, textAlign: 'center' },
    drawerCropBoxBestBadge: { position: 'absolute', top: 4, left: 4, backgroundColor: Colors.burntOrange, borderRadius: Radius.full, paddingHorizontal: 4, paddingVertical: 2, zIndex: 2 },
    drawerCropBoxWarnBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#EF5350', borderRadius: Radius.full, paddingHorizontal: 4, paddingVertical: 2, zIndex: 2 },

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

    // ── Inline coverage editor ─────────────────────────────────────────────────
    drawerCurrentRowEditing: { backgroundColor: 'rgba(45,79,30,0.06)', borderRadius: Radius.sm },
    drawerCoverageBadge: {
        backgroundColor: 'rgba(45,79,30,0.12)', paddingVertical: 2, paddingHorizontal: 7,
        borderRadius: Radius.full, marginRight: 2,
    },
    drawerCoverageBadgeText: { fontSize: 10, color: Colors.primaryGreen, fontWeight: '800' },
    drawerInlineEditor: {
        marginHorizontal: Spacing.sm, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 10,
        backgroundColor: 'rgba(45,79,30,0.06)', borderRadius: Radius.sm,
        borderLeftWidth: 3, borderLeftColor: Colors.primaryGreen,
    },
    drawerInlineEditorLabel: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    drawerInlineEditorRow: { flexDirection: 'row', gap: 8 },
    drawerInlineFracBtn: {
        flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)',
        backgroundColor: Colors.white,
    },
    drawerInlineFracBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    drawerInlineFracText: { fontSize: 12, fontWeight: '700', color: Colors.primaryGreen },
    drawerInlineFracTextActive: { color: Colors.cream },
    drawerNoFitBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
    drawerNoFitText: { fontSize: 14, color: Colors.mutedText },
    // Force-add button for out-of-season crops
    drawerForceAddBtn: {
        paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.sm,
        backgroundColor: 'rgba(180,120,30,0.12)', borderWidth: 1.5, borderColor: 'rgba(180,120,30,0.4)',
    },
    drawerForceAddText: { fontSize: 11, fontWeight: '800', color: '#A0620A' },
    drawerCropDateRange: { fontSize: 10, color: Colors.burntOrange, fontWeight: '600', marginBottom: 1 },

    // ── Frost filter toggle ──────────────────────────────────────────────
    frostFilterBtn: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'rgba(1,87,155,0.3)', backgroundColor: 'rgba(179,229,252,0.25)', alignSelf: 'flex-start' },
    frostFilterBtnActive: { backgroundColor: '#B3E5FC', borderColor: '#01579B' },
    frostFilterText: { fontSize: Typography.xs, fontWeight: '700', color: '#01579B' },
    frostFilterTextActive: { color: '#01579B' },
    frostFilterNote: { marginHorizontal: Spacing.lg, marginTop: 4, fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic', lineHeight: 16 },

    // ── Search bar ─────────────────────────────────────────────────────────────
    drawerSearchWrap: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
        backgroundColor: 'rgba(45,79,30,0.06)',
        borderRadius: Radius.sm, borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.15)', paddingHorizontal: 10, height: 38,
    },
    drawerSearchIcon: { fontSize: 13, marginRight: 6, color: Colors.mutedText },
    drawerSearchInput: { flex: 1, fontSize: Typography.sm, color: Colors.primaryGreen, padding: 0 },

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
