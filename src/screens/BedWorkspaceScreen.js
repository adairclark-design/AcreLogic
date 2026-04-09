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
    Modal,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { getSuccessionCandidatesRanked, autoGenerateSuccessions, AUTOFILL_STRATEGIES } from '../services/successionEngine';
import { saveBedAssignment, getBedSuccessions, getCropById } from '../services/database';
import { saveBedSuccessions, saveBedShelters, saveSeasonSnapshot, getPriorYearBedCrops, loadRotationHistory, loadSavedPlan, saveFarmProfile, saveBlockBeds, loadBlockBeds, loadPlanCrops, savePlanCrops } from '../services/persistence';
import { checkBedCompanions, checkBlockNeighborWarnings } from '../services/companionService';
import { getIdealStartDate, addDays } from "../services/climateService";
import { inferZoneFromFrostDates, getPeakCoverageInWindow } from '../services/farmUtils';
import cropData from '../data/crops.json';
import { useFocusEffect } from '@react-navigation/native';

import CompanionAlertBanner from '../components/CompanionAlertBanner';
import BedNoteModal from '../components/BedNoteModal';
import AIPlanGeneratorModal from '../components/AIPlanGeneratorModal';
import ActionThisWeekCard from '../components/ActionThisWeekCard';
import CROP_IMAGES from '../data/cropImages';
import AIAdvisorWidget from '../components/AIAdvisorWidget';
import { MEGA_CATEGORIES } from '../components/MegaMenuBar';

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

// ─── Winter Grow Evaluation Helper ──────────────────────────────────────────────
function checkIsWinterGrow(item, hasProtection, isFits, lat = 45, shelterType = 'none') {
    // Greenhouse beds are controlled environments — never flag as "Winter grow".
    // The engine legitimately pushes greenhouse start_dates 42 days earlier (into winter months),
    // but that is an indoor germination offset, NOT a cold-outdoor slow-grow situation.
    if (shelterType === 'greenhouse') return false;

    const dStr = item.start_date;
    if (!dStr) return false;
    const m = new Date(dStr + (dStr.includes('T') ? '' : 'T12:00:00')).getMonth();

    const canOverwinter = item.crop.season === 'cool' || !!item.crop.hard_frost || item.crop.category === 'Cover Crop';
    if (!canOverwinter) return false;

    const isSouthern = lat < 0;
    if (!isSouthern) {
        if (m >= 2 && m <= 7) return false; // March-Aug: never winter grow outdoors
        if (hasProtection && m === 8) return false; // Row cover: Sep not flagged
        return true; // Oct, Nov, Dec, Jan, Feb under no cover or row cover only
    } else {
        if (m >= 8 || m <= 1) return false;
        if (hasProtection && m === 2) return false;
        return true;
    }
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
                            const trueLeft = daysBetween(seasonStart, s.start_date) / seasonDays;
                            const rawW = daysBetween(s.start_date, s.end_date) / seasonDays;
                            const barW = Math.max(0.04, rawW); // Do not clamp to 1-left; allow actual physical length overflow
                            const color = cropColor(s.crop_id);
                            return (
                                <View
                                    key={idx}
                                    style={[
                                        styles.ganttBar,
                                        {
                                            left: `${trueLeft * 100}%`,
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
                const succs = bedSuccessions[String(bedNum)] ?? [];
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
const SuccessionDrawer = ({ visible, bedNumber, blockName, currentSuccessions, allBedSuccessions, candidates, loading, frostFreeDays, onClose, onPlant, onPlantOutOfSeason, onRemoveSuccession, onShiftDates, fillRemainingDtm, onEditCoverage, bedShelterType, onSetShelter, farmProfile, fullPage, selectedCropIds = [], targetGap, onSetTargetGap, activeYear, setActiveYear }) => {
    const [frostFilter, setFrostFilter] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [activeCategory, setActiveCategory] = React.useState('All');
    const [coverageFraction, setCoverageFraction] = React.useState(1.0);

    // Fixed canonical category list — always show all crop families regardless of
    // what candidates are currently loaded. Tabs with 0 matches just filter to empty.
    const cropCategories = MEGA_CATEGORIES.map(m => m.label);


    // Season months bar — auto-updates with effective farmProfile (shelter already applied)
    const seasonMonths = React.useMemo(() => {
        const start = farmProfile?.last_frost_date;
        const end = farmProfile?.first_frost_date;
        if (!start || !end) return [];
        const months = [];
        const d = new Date(start + 'T12:00:00');
        const endD = new Date(end + 'T12:00:00');
        const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        while (d <= endD) {
            const m = MONTH_NAMES[d.getMonth()];
            if (!months.includes(m)) months.push(m);
            d.setMonth(d.getMonth() + 1);
        }
        return months;
    }, [farmProfile]);
    const [pendingPlantItem, setPendingPlantItem] = React.useState(null);
    const [selectedDiagramCrop, setSelectedDiagramCrop] = React.useState(null);
    const [editingIdx, setEditingIdx] = React.useState(null); // index of current-plan row being edited
    const [watchForExpanded, setWatchForExpanded] = React.useState(false); // pest/disease panel

    const gapDatesStr = React.useMemo(() => {
        if (currentSuccessions && currentSuccessions.length > 0) {
            const endDates = Array.from(new Set(currentSuccessions.map(c => c.end_date).filter(Boolean)));
            endDates.sort((a,b) => new Date(a) - new Date(b));
            
            const validDates = [];
            for (const dStr of endDates) {
                const nextDay = addDays(dStr, 1);
                // Check peak coverage for the immediate week following the crop removal
                const peak = getPeakCoverageInWindow(currentSuccessions, nextDay, addDays(nextDay, 7));
                if (peak < 0.99) validDates.push(dStr);
            }
            
            if (validDates.length > 0) {
                return validDates.map(dStr => {
                    const d = new Date(dStr + 'T12:00:00');
                    d.setDate(d.getDate() + 1);
                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }).join(', ');
            }
            
            const finalDate = endDates[endDates.length - 1];
            const df = new Date(finalDate + 'T12:00:00');
            df.setDate(df.getDate() + 1);
            return df.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (farmProfile?.last_frost_date) {
            return new Date(farmProfile.last_frost_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return '—';
    }, [currentSuccessions, farmProfile]);

    // PLANNED DATE — the day after the most recent crop comes out of the ground.
    // This tells the farmer: "Based on your current Timeline Plan, this bed is next
    // available on [date]". Filters out open-ended 9999-12-31 successions.
    const plannedDate = React.useMemo(() => {
        if (!currentSuccessions || currentSuccessions.length === 0) return '—';
        const validEnds = currentSuccessions
            .map(s => s.end_date)
            .filter(d => d && d !== '9999-12-31');
        if (validEnds.length === 0) return '—';
        validEnds.sort((a, b) => new Date(a) - new Date(b));
        const latestEnd = validEnds[validEnds.length - 1];
        const d = new Date(latestEnd + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }, [currentSuccessions]);
    // targetGap is now lifted to BedWorkspaceScreen state

    // Auto-clear target gap when the selected timeframe becomes fully planted
    React.useEffect(() => {
        if (!targetGap) return;
        const peak = getPeakCoverageInWindow(currentSuccessions, targetGap.start_date, targetGap.end_date ?? '9999-12-31');
        if (peak >= 0.99) {
            onSetTargetGap(null);
        }
    }, [currentSuccessions, targetGap]);

    React.useEffect(() => {
        if (Platform.OS !== 'web' || editingIdx === null) return;
        const handleKeyDown = (e) => {
            // Check if user is typing in the search input (don't delete crops if they are backspacing text!)
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
            
            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                const idxToRemove = editingIdx;
                setEditingIdx(null);
                onRemoveSuccession(idxToRemove);
            } else if (e.key === 'Escape') {
                setEditingIdx(null);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const days = e.shiftKey ? -7 : -1;
                if (onShiftDates) onShiftDates(editingIdx, days);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                const days = e.shiftKey ? 7 : 1;
                if (onShiftDates) onShiftDates(editingIdx, days);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingIdx, onRemoveSuccession, onShiftDates]);

    const userZone = React.useMemo(() => {
        return inferZoneFromFrostDates(farmProfile?.first_frost_date, farmProfile?.last_frost_date);
    }, [farmProfile]);

    const activeRisks = React.useMemo(() => {
        if (!currentSuccessions || currentSuccessions.length === 0) return { totalAlerts: 0, groups: [] };
        
        const seasonMap = {
            'spring': 'Active March–June',
            'summer': 'Active June–September',
            'fall': 'Active September–November',
            'cool_wet': 'Active during cool, wet periods',
            'hot_dry': 'Active during hot, dry periods'
        };
        
        // Build a list of all risks mapped to the crops currently planted
        const cropGroups = {};
        let totalAlerts = 0;
        
        currentSuccessions.forEach(succ => {
            const crop = cropData.crops.find(c => c.id === succ.crop_id);
            if (!crop) return;
            
            const cropKey = succ.crop_name || crop.name;
            if (!cropGroups[cropKey]) cropGroups[cropKey] = [];
            
            ['pests', 'diseases'].forEach(type => {
                (crop[type] || []).forEach(item => {
                    // Filter by hardiness zone
                    if (item.zone_relevance && item.zone_relevance.includes('all') === false && item.zone_relevance.includes(userZone) === false) return;
                    
                    // Deduplicate same pest on same crop if multiple successions exist
                    if (cropGroups[cropKey].some(r => r.name === item.name)) return;
                    
                    // Dynamic Impact Sweep
                    const impactedSet = new Set();
                    cropData.crops.forEach(c => {
                        const hasPest = (c.pests || []).some(p => p.name === item.name) || (c.diseases || []).some(d => d.name === item.name);
                        if (hasPest && c.name !== crop.name) impactedSet.add(c.name);
                    });
                    const impactedArray = Array.from(impactedSet);
                    let impactedStr = '';
                    if (impactedArray.length > 0) {
                        impactedStr = `Crops Impacted: ${impactedArray.slice(0, 3).join(', ')}${impactedArray.length > 3 ? ', and others' : ''}.`;
                    }
                    
                    cropGroups[cropKey].push({
                        ...item,
                        type,
                        seasonText: seasonMap[item.season] || item.season,
                        impactedCropsStr: impactedStr
                    });
                    totalAlerts++;
                });
            });
        });
        
        // Convert object to array and sort risks internally
        const mapSeverity = { high: 0, medium: 1, low: 2 };
        return {
            totalAlerts,
            groups: Object.keys(cropGroups).map(k => {
                const risks = cropGroups[k];
                risks.sort((a, b) => (mapSeverity[a.severity] ?? 3) - (mapSeverity[b.severity] ?? 3));
                return { cropName: k, risks };
            }).filter(g => g.risks.length > 0)
        };
    }, [currentSuccessions, userZone, cropData]);

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
            const lastStart = currentSuccessions && currentSuccessions.length > 0
                ? currentSuccessions[currentSuccessions.length - 1].start_date
                : null;
            const slotTotal = (currentSuccessions ?? [])
                .filter(s => s.start_date === lastStart)
                .reduce((sum, s) => sum + (s.coverage_fraction ?? 1.0), 0);
            const remaining = Math.max(0, 1.0 - slotTotal);
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

    // Derived coverage state: available physical space in the time slot we are planning
    const remainingCoverage = (() => {
        if (!currentSuccessions || currentSuccessions.length === 0) return 1.0;
        
        let checkStart, checkEnd;
        if (targetGap) {
            checkStart = targetGap.start_date;
            checkEnd = targetGap.end_date ?? '9999-12-31';
        } else if (fillRemainingDtm != null) {
            const lastCrop = currentSuccessions[currentSuccessions.length - 1];
            checkStart = lastCrop.start_date; 
            checkEnd = lastCrop.end_date ?? '9999-12-31';
        } else {
             return 1.0; 
        }
        
        const peak = getPeakCoverageInWindow(currentSuccessions, checkStart, checkEnd);
        return Math.max(0, 1.0 - peak);
    })();
    const isFillRemainingMode = fillRemainingDtm != null && remainingCoverage > 0 && remainingCoverage < 1.0;

    // Filter + sort candidates for display
    const displayedCandidates = React.useMemo(() => {
        const hasSearch = searchQuery.trim().length >= 2;
        const q = hasSearch ? searchQuery.trim().toLowerCase() : '';

        // Start with the full candidates pool — NEVER filter by selectedCropIds here.
        // selectedCropIds drives visual checkmarks only; hiding crops causes the
        // multi-select regression where only the first selected crop is visible.
        let list = candidates;

        if (hasSearch) {
            // IF SEARCHING: Bypass activeCategory and frostFilter UI toggles.
            // Match text directly to find crops out of window/category.
            list = list.filter(c =>
                `${c.crop.name} ${c.crop.variety ?? ''} ${c.crop.category}`.toLowerCase().includes(q)
            );
        } else {
            // NOT SEARCHING: Apply normal UI toggles
            if (frostFilter) {
                list = list.filter(c => c.crop.frost_tolerant);
            }
            if (activeCategory !== 'All') {
                const megaCat = MEGA_CATEGORIES.find(m => m.label === activeCategory);
                if (megaCat && megaCat.filter) {
                    list = list.filter(c => megaCat.filter(c.crop));
                } else {
                    list = list.filter(c => c.crop?.category === activeCategory);
                }
            }
            // Cap default browse to top 40 so the list stays manageable.
            // ONLY explicitly cap if the user hasn't curated their Phase 2 shortlist.
            if (selectedCropIds.length === 0) {
                list = list.slice(0, 40);
            }
        }

        // Fill-remaining mode 
        if (isFillRemainingMode && fillRemainingDtm) {
            const similar = list.filter(c => Math.abs((c.crop.dtm ?? 0) - fillRemainingDtm) <= 25);
            const others = list.filter(c => Math.abs((c.crop.dtm ?? 0) - fillRemainingDtm) > 25);
            return [...similar, ...others];
        }

        // Sort: alphabetical by name then variety
        return list.slice().sort((a, b) => {
            const n = (a.crop.name ?? '').localeCompare(b.crop.name ?? '');
            if (n !== 0) return n;
            return (a.crop.variety ?? '').localeCompare(b.crop.variety ?? '');
        });
    }, [candidates, frostFilter, searchQuery, isFillRemainingMode, fillRemainingDtm, activeCategory, selectedCropIds]);

    const sharedCoverageModal = (
        <View
            style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]}
            pointerEvents={pendingPlantItem ? 'auto' : 'none'}
        >
            {!!pendingPlantItem && (
                <TouchableOpacity 
                    style={fpStyles.modalOverlay} 
                    activeOpacity={1} 
                    onPress={() => setPendingPlantItem(null)}
                >
                    <TouchableOpacity 
                        style={fpStyles.modalCard}
                        activeOpacity={1}
                    >
                        <Text style={fpStyles.modalTitle}>
                        What fraction should {pendingPlantItem?.item?.crop?.name} fill?
                    </Text>
                    <Text style={fpStyles.modalSubtitle}>
                        {Math.round((pendingPlantItem?.availableFraction ?? remainingCoverage) * 100)}% of this bed is available during this time.
                    </Text>

                    <View style={fpStyles.modalButtonRow}>
                        {[
                            { value: 0.25, label: '¼' },
                            { value: 0.5,  label: '½' },
                            { value: 0.75, label: '¾' },
                            { value: 1.0,  label: 'Full' },
                        ].map(f => {
                            const disabled = f.value > (pendingPlantItem?.availableFraction ?? remainingCoverage) + 0.01;
                            return (
                                <TouchableOpacity
                                    key={f.value}
                                    style={[fpStyles.modalCovBtn, disabled && fpStyles.modalCovBtnDisabled]}
                                    disabled={disabled}
                                    onPress={() => {
                                        const payload = pendingPlantItem;
                                        setPendingPlantItem(null);
                                        const finalPayload = targetGap 
                                            ? { ...payload.item, targetGap } 
                                            : payload.item;

                                        if (payload.fits) {
                                            onPlant({
                                                ...finalPayload,
                                                coverage_fraction: f.value,
                                                is_winter_override: payload.isWinterCandidate,
                                                dtm: payload.isWinterCandidate ? payload.winterDtm : payload.item.crop.dtm,
                                            });
                                        } else {
                                            onPlantOutOfSeason({
                                                ...finalPayload,
                                                coverage_fraction: f.value,
                                                is_winter_override: payload.isWinterCandidate,
                                                dtm: payload.isWinterCandidate ? payload.winterDtm : payload.item.crop.dtm,
                                            });
                                        }
                                    }}
                                >
                                    <Text style={[fpStyles.modalCovBtnText, disabled && fpStyles.modalCovBtnTextDisabled]}>
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    
                        <TouchableOpacity style={fpStyles.modalCancel} onPress={() => setPendingPlantItem(null)}>
                            <Text style={fpStyles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            )}
        </View>
    );

    // (Global coverage steps removed — now handled per-crop via SelectCoverageModal)

    // ── fullPage: Digital Agronomist layout ─────────────────────────────────────
    if (fullPage) {
        // Extension in days from shelter — matches SHELTER_EXT engine constants (×2 for both ends)
        const shelterExt = bedShelterType === 'greenhouse' ? 42 : bedShelterType === 'rowCover' ? 14 : 0;

        // Winter overwintering: crops without protection only; greenhouse/rowCover beds allow override
        const hasProtection = bedShelterType === 'greenhouse' || bedShelterType === 'rowCover';
        const WINTER_DTM_MULTIPLIER = 1.5; // Slow winter growth — Andrew may refine this

        // Gantt chart helpers
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const GANTT_COLORS = [
            { bg: '#C5EFAD', text: '#062100' },
            { bg: '#2D4F1E', text: '#FFFFFF' },
            { bg: '#A9D293', text: '#062100' },
            { bg: '#446733', text: '#FFFFFF' },
            { bg: '#DCEDC8', text: '#33691E' },
            { bg: '#7CB342', text: '#FFFFFF' },
        ];
        const getMonthFraction = (isoDate) => {
            if (!isoDate) return null;
            const d = new Date(isoDate + 'T12:00:00');
            return (d.getMonth() + (d.getDate() - 1) / 31) / 12;
        };

        // Shelter OPTS
        const SHELTER_OPTS = [
            { key: 'none',       label: 'Uncovered',           ext: 0  },
            { key: 'rowCover',   label: 'Row Cover + 14 Days', ext: 14 },
            { key: 'greenhouse', label: 'Greenhouse + 42 Days', ext: 42 },
        ];

        return (
            <View style={fpStyles.wrap}>
                {/* ── Header bar ── */}
                <View style={fpStyles.header}>
                    <TouchableOpacity style={fpStyles.backBtn} onPress={onClose}>
                        <Text style={fpStyles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={fpStyles.headerTitle} numberOfLines={1}>
                            {blockName ? `${blockName} — Bed ${bedNumber}` : `Bed ${bedNumber}`}
                        </Text>
                    </View>
                    <View style={fpStyles.headerBadges}>
                        <View style={fpStyles.growingBadge}>
                            <Text style={fpStyles.growingBadgeText}>Growing Days: {frostFreeDays ?? '—'}</Text>
                        </View>
                        {shelterExt > 0 && (
                            <View style={fpStyles.extBadge}>
                                <Text style={fpStyles.extBadgeText}>Extended: +{shelterExt}</Text>
                            </View>
                        )}
                    </View>
                    <TouchableOpacity style={fpStyles.doneBtn} onPress={onClose}>
                        <Text style={fpStyles.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Fixed body with internal scrolling ── */}
                <View
                    nativeID="succession-full-page-scroll"
                    style={{ flex: 1, paddingBottom: 16 }}
                >
                    {/* ── Gantt / Timeline ── */}
                    <View style={fpStyles.ganttCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B3B1A', letterSpacing: 0.5 }}>TIMELINE PLAN</Text>
                            <Text style={{ fontSize: 10, color: 'blue', maxWidth: 100 }} numberOfLines={2}>DBG: Cnt={currentSuccessions?.length ?? 'none'}, ActYr={activeYear}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
                                <TouchableOpacity onPress={() => setActiveYear(y => y - 1)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                                    <Text style={{ fontSize: 18, color: '#2E7D32', fontWeight: 'bold' }}>‹</Text>
                                </TouchableOpacity>
                                <Text style={{ fontSize: 14, fontWeight: '900', color: '#1B3B1A', width: 44, textAlign: 'center' }}>{activeYear}</Text>
                                <TouchableOpacity onPress={() => setActiveYear(y => y + 1)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                                    <Text style={{ fontSize: 18, color: '#2E7D32', fontWeight: 'bold' }}>›</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Month header */}
                        <View style={fpStyles.ganttMonthRow}>
                            {MONTHS.map(m => (
                                <Text key={m} style={fpStyles.ganttMonthLabel}>{m}</Text>
                            ))}
                        </View>
                        <View style={fpStyles.ganttDivider} />

                        {/* Succession bars — lane-packed Gantt (no stepping for sequential crops) */}
                        {(() => {
                            const MAX_ROWS = 4;
                            const BAR_H = 34;
                            const GAP = 2;

                            // Unbounded year mapping — uses exact ms-based calendar math so bars
                            // align precisely with the month header labels (no fixed /31 approximation).
                            const yearStartMs = new Date(`${activeYear}-01-01T12:00:00`).getTime();
                            const yearMs      = new Date(`${activeYear + 1}-01-01T12:00:00`).getTime() - yearStartMs;

                            const mapToYearFraction = (isoDate) => {
                                if (!isoDate) return null;
                                const d = new Date(isoDate + 'T12:00:00');
                                const year = d.getFullYear();
                                const month = d.getMonth(); // 0-11
                                const day = d.getDate();
                                const daysInMonth = new Date(year, month + 1, 0).getDate(); // Automatically handles leap years
                                
                                const monthFrac = month + (day - 1) / daysInMonth;
                                const yearOffset = (year - activeYear) * 12;
                                
                                return (yearOffset + monthFrac) / 12;
                            };

                            const startOfActiveYear = `${activeYear}-01-01`;
                            const endOfActiveYear = `${activeYear}-12-31`;

                            // Exclude crops that do not intersect with this year whatsoever
                            const successions = (currentSuccessions ?? [])
                                .map((s, i) => ({ ...s, _origIdx: i }))
                                .filter(s => {
                                    if (!s.start_date || !s.end_date) return false;
                                    return s.start_date <= endOfActiveYear && s.end_date >= startOfActiveYear;
                                })
                                .sort((a,b) => (a.start_date||'').localeCompare(b.start_date||''));

                            // ── Lane packing: assign each crop to the lowest lane where
                            //    it doesn't time-overlap with an already-placed crop.
                            //    Sequential crops get lane 0; only truly simultaneous crops
                            //    (two partial plantings at the same time) get different lanes.
                            const laneEndDates = []; // laneEndDates[lane] = last end_date ms in that lane
                            const laneOf = successions.map(s => {
                                const startMs = s.start_date ? new Date(s.start_date + 'T12:00:00').getTime() : 0;
                                const endMs   = s.end_date   ? new Date(s.end_date   + 'T12:00:00').getTime() : startMs;
                                // Find the first lane whose last crop ended before this one starts
                                let lane = laneEndDates.findIndex(laneEnd => laneEnd <= startMs + 1);
                                if (lane === -1) lane = laneEndDates.length; // need a new lane
                                laneEndDates[lane] = endMs;
                                return lane;
                            });

                            const maxLane = laneOf.length > 0 ? Math.max(...laneOf) : 0;
                            // usedRows and CANVAS_H will be calculated AFTER generating interactiveGaps
                            // to ensure the container scales to fit concurrent gap lanes.
                            
                            // Find interactive gaps
                            const interactiveGaps = [];
                            const frostDate = farmProfile?.last_frost_date || `${activeYear}-04-01`;
                            const frostMs = new Date(frostDate + 'T12:00:00').getTime();
                            
                            // 1. Gaps BEFORE and BETWEEN crops in established lanes
                            for (let l = 0; l <= Math.min(maxLane, MAX_ROWS - 1); l++) {
                                const laneCrops = successions
                                    .filter((s, idx) => laneOf[idx] === l)
                                    .sort((a,b) => (a.start_date||'').localeCompare(b.start_date||''));
                                
                                if (laneCrops.length > 0) {
                                    const firstMs = new Date((laneCrops[0].start_date||'') + 'T12:00:00').getTime();
                                    const firstCoverage = laneCrops[0].coverage_fraction ?? 1.0;
                                    if (firstMs > frostMs + 14 * 86400000 && firstCoverage < 0.99) {
                                        interactiveGaps.push({ lane: l, start_date: frostDate, end_date: laneCrops[0].start_date, days: Math.round((firstMs - frostMs)/86400000) });
                                    }
                                }

                                for (let i = 0; i < laneCrops.length - 1; i++) {
                                    const c1 = laneCrops[i];
                                    const c2 = laneCrops[i+1];
                                    if (!c1.end_date || !c2.start_date) continue;
                                    const e1 = new Date(c1.end_date + 'T12:00:00').getTime();
                                    const s2 = new Date(c2.start_date + 'T12:00:00').getTime();
                                    if (s2 > e1 + 14 * 86400000) {
                                        interactiveGaps.push({ lane: l, start_date: c1.end_date, end_date: c2.start_date, days: Math.round((s2 - e1)/86400000) });
                                    }
                                }
                            }

                            // 2. Concurrent Gaps UNDER partial crops (for fractional nestling)
                            successions.forEach((s) => {
                                const start = s.start_date;
                                const end = s.end_date ?? '9999-12-31';
                                if (!start) return;
                                const peak = getPeakCoverageInWindow(successions, start, end);
                                if (peak < 0.99) {
                                    // Find first visually empty lane in this exact timeframe
                                    let emptyLane = 0;
                                    while (emptyLane < MAX_ROWS) {
                                        const occupied = successions.some((cs, cidx) => {
                                            if (laneOf[cidx] !== emptyLane) return false;
                                            const csStart = cs.start_date ?? '';
                                            const csEnd = cs.end_date ?? '9999-12-31';
                                            return csStart < end && csEnd > start;
                                        });
                                        if (!occupied) break;
                                        emptyLane++;
                                    }
                                    if (emptyLane < MAX_ROWS) {
                                        interactiveGaps.push({
                                            lane: emptyLane,
                                            start_date: start,
                                            end_date: s.end_date,
                                            days: Math.round((new Date((s.end_date || `${activeYear}-12-31`) + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000)
                                        });
                                    }
                                }
                            });

                            // De-duplicate gaps (multiple crops spanning same concurrent window)
                            // and run Pre-Flight Check to prevent phantom gaps across full beds.
                            const uniqueGaps = [];
                            const seenGaps = new Set();
                            for (const g of interactiveGaps) {
                                const key = `${g.start_date}_${g.end_date}_${g.lane}`;
                                if (!seenGaps.has(key)) {
                                    seenGaps.add(key);
                                    // Pre-flight check: Make sure this gap doesn't span across a time where the bed
                                    // is actually 100% full chronologically. (Resolves phantom gaps beneath crops).
                                    const peak = getPeakCoverageInWindow(successions, g.start_date, g.end_date);
                                    if (peak < 0.99) {
                                        uniqueGaps.push(g);
                                    }
                                }
                            }
                            
                            let maxGapLane = 0;
                            uniqueGaps.forEach(g => { if (g.lane > maxGapLane) maxGapLane = g.lane; });
                            const effectiveMaxLane = Math.max(maxLane, maxGapLane);
                            const usedRows = Math.min(effectiveMaxLane + 1, MAX_ROWS);
                            const CANVAS_H = usedRows * (BAR_H + GAP);

                            // Crops that land in lane >= MAX_ROWS are hidden; count them
                            const hiddenCount = laneOf.filter(l => l >= MAX_ROWS).length;

                            return (
                                <>
                                    <View style={[fpStyles.ganttBarsWrap, { height: successions.length === 0 ? 56 : CANVAS_H }]}>
                                        {/* Ghost grid lines */}
                                        <View style={fpStyles.ganttGridLines} pointerEvents="none">
                                            {MONTHS.slice(0, 11).map((_, i) => (
                                                <View key={i} style={[fpStyles.ganttGridLine, { left: `${((i + 1) / 12) * 100}%` }]} />
                                            ))}
                                        </View>

                                        {/* Render Interactive Gaps */}
                                        {uniqueGaps.map((gap, gIdx) => {
                                            const startFrac = mapToYearFraction(gap.start_date) ?? 0;
                                            const endFrac = mapToYearFraction(gap.end_date) ?? 1.0;
                                            const activeTarget = targetGap?.start_date === gap.start_date && targetGap?.lane === gap.lane;
                                            
                                            if (endFrac <= startFrac + 0.01) return null;
                                            
                                            return (
                                                <TouchableOpacity
                                                    key={`gap-${gIdx}`}
                                                    style={[fpStyles.ganttBar, {
                                                        position: 'absolute',
                                                        top: gap.lane * (BAR_H + GAP),
                                                        left: `${(startFrac * 100).toFixed(1)}%`,
                                                        width: `${Math.max(4, (endFrac - startFrac) * 100).toFixed(1)}%`,
                                                        height: BAR_H - 4,
                                                        marginTop: 2,
                                                        backgroundColor: editingIdx !== null ? 'rgba(33, 150, 243, 0.1)' : (activeTarget ? 'rgba(76, 175, 80, 0.15)' : 'rgba(0, 0, 0, 0.03)'),
                                                        borderWidth: 1,
                                                        borderStyle: 'dashed',
                                                        borderColor: editingIdx !== null ? '#1976D2' : (activeTarget ? '#4CAF50' : '#CCC'),
                                                        zIndex: -1
                                                    }]}
                                                    activeOpacity={0.6}
                                                    onPress={() => {
                                                        if (editingIdx !== null) {
                                                            const crop = currentSuccessions[editingIdx];
                                                            if (crop && crop.start_date && onShiftDates) {
                                                                const days = Math.round((new Date((gap.start_date || `${activeYear}-05-01`) + 'T12:00:00').getTime() - new Date(crop.start_date + 'T12:00:00').getTime()) / 86400000);
                                                                onShiftDates(editingIdx, days);
                                                                setEditingIdx(null);
                                                            }
                                                        } else {
                                                            onSetTargetGap(activeTarget ? null : gap);
                                                        }
                                                    }}
                                                >
                                                    <Text style={[fpStyles.ganttBarText, { color: editingIdx !== null ? '#1976D2' : (activeTarget ? '#2E7D32' : '#999'), fontSize: 11, fontStyle: 'italic', paddingLeft: 6 }]} numberOfLines={1}>
                                                        {editingIdx !== null ? `🎯 Move to ${mapToYearFraction(gap.start_date) && gap.start_date.slice(5).replace('-','/')}` : (activeTarget ? `🎯 Fill ${gap.days}D gap` : `+ tap to fill ${gap.days}D`)}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}

                                        {successions.length === 0 ? (
                                            <View style={fpStyles.ganttEmpty}>
                                                <Text style={fpStyles.ganttEmptyText}>Empty bed — tap a crop below to plan</Text>
                                            </View>
                                        ) : successions.map((s, idx) => {
                                            const lane = laneOf[idx];
                                            if (lane >= MAX_ROWS) return null; // hidden — counted in hiddenCount

                                            const frac      = s.coverage_fraction ?? 1.0;
                                            const fracLabel = frac >= 0.99 ? '[Full] ' : frac >= 0.74 ? '[¾] ' : frac >= 0.49 ? '[½] ' : '[¼] ';
                                            const method    = s.seed_type ?? (s.dtm < 40 ? 'DS' : 'TP');
                                            const clr       = GANTT_COLORS[lane % GANTT_COLORS.length];

                                            // Format: Crop | Variety | DTMd - Method  M/D-M/D
                                            const rawStart = s.start_date ?? '';
                                            const rawEnd   = s.end_date ?? '';
                                            const startsBefore = parseInt(rawStart.split('-')[0], 10) < activeYear;
                                            const endsAfter    = parseInt(rawEnd.split('-')[0], 10) > activeYear;

                                            const startFrac = mapToYearFraction(s.start_date);
                                            const endFrac   = mapToYearFraction(s.end_date);
                                            
                                            const fmtShortDate = (iso) => {
                                                if (!iso) return '?';
                                                const d = new Date(iso + 'T12:00:00');
                                                const dYear = d.getFullYear();
                                                const displayYear = dYear !== activeYear ? `'${String(dYear).slice(-2)} ` : '';
                                                return `${displayYear}${d.getMonth() + 1}/${d.getDate()}`;
                                            };
                                            const cropLabel = s.crop_name ?? s.name ?? 'Unknown';
                                            const variety   = s.variety ? ` | ${s.variety}` : '';
                                            
                                            const igdDays = (s.start_date && s.end_date && s.end_date !== '9999-12-31') 
                                                ? Math.round((new Date(s.end_date + 'T12:00:00').getTime() - new Date(s.start_date + 'T12:00:00').getTime()) / 86400000)
                                                : 0;
                                            const harvestDays = igdDays - (s.dtm || 0);
                                            const hwStr = harvestDays > 0 ? ` + ${harvestDays}d Harv` : '';
                                            const totalLabel = s.dtm > 0 ? `${igdDays}d Total (${s.dtm}d DTM${hwStr})` : `CC [${igdDays} IGD]`;
                                            
                                            const dateRange = (s.start_date && s.end_date && s.end_date !== '9999-12-31')
                                                ? `  ${fmtShortDate(s.start_date)}-${fmtShortDate(s.end_date)}`
                                                : '';
                                            
                                            const arrowL = startsBefore ? '← ' : '';
                                            const arrowR = endsAfter ? ' →' : '';
                                            const winterPrefix = s.is_winter_override && !startsBefore ? '❄️ ' : '';
                                            const fullLabel = `${arrowL}${winterPrefix}${fracLabel}${cropLabel}${variety} | ${totalLabel} - ${method}${dateRange}${arrowR}`;

                                            const rowTop    = lane * (BAR_H + GAP);
                                            const isEditing = editingIdx === idx;
                                            const bgCol = s.is_winter_override ? 'rgba(255,235,238,0.9)' : clr.bg;
                                            const borderCol = s.is_winter_override ? '#E53935' : (isEditing ? clr.text : 'transparent');
                                            const borderWidth = s.is_winter_override ? 1.5 : (isEditing ? 2 : 0);
                                            const textColor = s.is_winter_override ? '#B71C1C' : clr.text;
                                            
                                            const barLeft  = startFrac != null ? `${(startFrac * 100).toFixed(1)}%` : '0%';
                                            const barWidth = (startFrac != null && endFrac != null)
                                                ? `${Math.max(4, (endFrac - startFrac) * 100).toFixed(1)}%`
                                                : `${Math.max(8, frac * 100).toFixed(1)}%`;

                                            return (
                                                <TouchableOpacity
                                                    key={idx}
                                                    style={[fpStyles.ganttBar, {
                                                        position: 'absolute',
                                                        top: rowTop,
                                                        left: barLeft,
                                                        width: barWidth,
                                                        height: BAR_H,
                                                        backgroundColor: bgCol,
                                                        borderWidth,
                                                        borderColor: borderCol,
                                                        borderTopLeftRadius: startsBefore ? 0 : undefined,
                                                        borderBottomLeftRadius: startsBefore ? 0 : undefined,
                                                        borderTopRightRadius: endsAfter ? 0 : undefined,
                                                        borderBottomRightRadius: endsAfter ? 0 : undefined,
                                                        overflow: 'hidden'
                                                    }]}
                                                    onPress={() => setEditingIdx(isEditing ? null : s._origIdx)}
                                                    activeOpacity={0.8}
                                                >
                                                    {/* DTM Growth Phase Underlay */}
                                                    {(s.dtm > 0 && igdDays > 0) && (
                                                        <View style={{
                                                            position: 'absolute',
                                                            left: 0, top: 0, bottom: 0,
                                                            width: `${Math.min(100, (s.dtm / igdDays) * 100)}%`,
                                                            backgroundColor: 'rgba(0,0,0,0.15)', // Darken growth portion slightly
                                                            borderRightWidth: 1,
                                                            borderRightColor: 'rgba(0,0,0,0.2)'
                                                        }} />
                                                    )}
                                                    <Text style={[fpStyles.ganttBarText, { color: textColor, zIndex: 1 }]} numberOfLines={1}>
                                                        {fullLabel}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}

                                        {/* +N more chip — top-right of canvas */}
                                        {hiddenCount > 0 && (
                                            <View style={fpStyles.ganttMoreChip}>
                                                <Text style={fpStyles.ganttMoreChipText}>+{hiddenCount} more</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Edit actions panel — rendered below canvas, not inline */}
                                    {editingIdx != null && editingIdx < successions.length && (() => {
                                        const s = successions[editingIdx];
                                        const cropLabel = s.crop_name ?? s.name ?? 'Unknown';
                                        
                                        // Standardize seed formatting
                                        const dtMethod = s.seed_type === 'TP' ? 'Transplant (TP)' : 
                                                         s.seed_type === 'DS' ? 'Direct Seed (DS)' : 
                                                         (s.dtm < 40 ? 'Direct Seed (DS)' : 'Transplant (TP)');
                                        
                                        const fmtDate = (iso) => {
                                            if (!iso) return '?';
                                            const d = new Date(iso + 'T12:00:00');
                                            return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
                                        };
                                        const actualIgd = (s.start_date && s.end_date && s.end_date !== '9999-12-31')
                                            ? Math.round((new Date(s.end_date + 'T12:00:00').getTime() - new Date(s.start_date + 'T12:00:00').getTime()) / 86400000)
                                            : 0;
                                        const actualHarvestDays = Math.max(0, actualIgd > 0 ? actualIgd - (s.dtm || 0) : (s.harvest_window_days ?? 0));

                                        return (
                                            <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
                                                {/* Expanded Crop Details Card */}
                                                <View style={{ backgroundColor: '#F9FAFB', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' }}>
                                                    <View style={{ marginBottom: 8 }}>
                                                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1F2937' }}>{cropLabel} {s.variety ? `(${s.variety})` : ''}</Text>
                                                    </View>
                                                    
                                                    <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
                                                        <View>
                                                            <Text style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>Sowing Type</Text>
                                                            <Text style={{ fontSize: 13, color: '#4B5563' }}>{dtMethod}</Text>
                                                        </View>
                                                        <View>
                                                            <Text style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>DTM / Harvest</Text>
                                                            <Text style={{ fontSize: 13, color: '#4B5563' }}>
                                                                {s.dtm ? `${s.dtm}d growing` : '—'}{actualHarvestDays > 0 ? ` + ${actualHarvestDays}d harvest` : ''}
                                                            </Text>
                                                        </View>
                                                        <View>
                                                            <Text style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>In Ground Window</Text>
                                                            <Text style={{ fontSize: 13, color: '#4B5563' }}>
                                                                {fmtDate(s.start_date)} - {fmtDate(s.end_date)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>

                                                <View style={fpStyles.ganttRowActions}>
                                                {[
                                                    { value: 0.25, label: '¼' },
                                                    { value: 0.5,  label: '½' },
                                                    { value: 0.75, label: '¾' },
                                                    { value: 1.0,  label: 'Full' },
                                                ].map(f => {
                                                    const active = Math.abs((s.coverage_fraction ?? 1) - f.value) < 0.01;
                                                    return (
                                                        <TouchableOpacity
                                                            key={f.value}
                                                            style={[fpStyles.ganttFracBtn, active && fpStyles.ganttFracBtnActive]}
                                                            onPress={() => { onEditCoverage(editingIdx, f.value); setEditingIdx(null); }}
                                                        >
                                                            <Text style={[fpStyles.ganttFracText, active && fpStyles.ganttFracTextActive]}>{f.label}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                                <TouchableOpacity
                                                    style={fpStyles.ganttRemoveBtn}
                                                    onPress={() => { setEditingIdx(null); onRemoveSuccession(editingIdx); }}
                                                >
                                                    <Text style={fpStyles.ganttRemoveText}>✕ Remove</Text>
                                                </TouchableOpacity>
                                            </View>
                                            </View>
                                        );
                                    })()}
                                </>
                            );
                        })()}

                    </View>

                    {/* ── Bed Protection Status ── */}
                    <View style={fpStyles.section}>
                        <Text style={fpStyles.sectionLabel}>BED PROTECTION STATUS</Text>
                        <View style={fpStyles.shelterRow}>
                            {SHELTER_OPTS.map(opt => {
                                const active = (bedShelterType ?? 'none') === opt.key;
                                return (
                                    <TouchableOpacity
                                        key={opt.key}
                                        style={[fpStyles.shelterPill, active && fpStyles.shelterPillActive]}
                                        onPress={() => onSetShelter?.(opt.key)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[fpStyles.shelterPillText, active && fpStyles.shelterPillTextActive]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* ── ⚠️ Watch For (IPM Risks) ── */}
                    {activeRisks.totalAlerts > 0 && (
                        <View style={fpStyles.section}>
                            <TouchableOpacity 
                                style={fpStyles.watchForHeader} 
                                onPress={() => setWatchForExpanded(!watchForExpanded)}
                                activeOpacity={0.7}
                            >
                                <Text style={fpStyles.watchForTitle}>⚠️ Watch For (Zone: {userZone === 'all' ? 'All' : userZone.replace('_', ' ')}) — {activeRisks.totalAlerts} {activeRisks.totalAlerts === 1 ? 'alert' : 'alerts'}</Text>
                                <Text style={fpStyles.watchForChevron}>{watchForExpanded ? '▼' : '▶'}</Text>
                            </TouchableOpacity>
                            
                            {watchForExpanded && (
                                <View style={fpStyles.watchForBody}>
                                    {activeRisks.groups.map((group, idx) => (
                                        <View key={idx} style={fpStyles.riskCard}>
                                            <Text style={[fpStyles.riskCropName, { fontSize: 13, marginBottom: 12, color: '#1B3B1A', borderBottomWidth: 1, borderBottomColor: '#E9E8E3', paddingBottom: 6 }]}>
                                                🌿 {group.cropName}
                                            </Text>
                                            
                                            {group.risks.map((risk, rIdx) => {
                                                const colorMap = { high: '#C62828', medium: '#E65100', low: '#2E7D32' };
                                                const dotColor = colorMap[risk.severity] || '#666';
                                                return (
                                                    <View key={rIdx} style={{ marginBottom: rIdx === group.risks.length - 1 ? 0 : 16 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 }}>
                                                            <View style={[fpStyles.severityDot, { backgroundColor: dotColor, marginRight: 6, marginTop: 4 }]} />
                                                            <Text style={[fpStyles.riskName, { fontSize: 13, flex: 1, lineHeight: 16 }]}>
                                                                {risk.name} {risk.seasonText ? `(${risk.seasonText})` : ''}
                                                            </Text>
                                                        </View>
                                                        {risk.impactedCropsStr ? (
                                                            <Text style={[fpStyles.riskDesc, { color: '#8B938A', fontStyle: 'italic', marginBottom: 4, marginLeft: 12 }]}>
                                                                {risk.impactedCropsStr}
                                                            </Text>
                                                        ) : null}
                                                        <Text style={[fpStyles.riskDesc, { marginLeft: 12 }]}>{risk.description}</Text>
                                                        <Text style={[fpStyles.riskTreatment, { marginLeft: 12, marginTop: 2 }]}>Remedy: {risk.organic_treatment}</Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}

                    {/* ── Search + Category chips ── */}
                    {targetGap && (
                        <View style={{ backgroundColor: '#E8F5E9', padding: 12, marginHorizontal: 24, marginBottom: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#C8E6C9' }}>
                            <Text style={{ fontSize: 14, color: '#2E7D32', fontWeight: '500' }}>
                                🎯 Targeting {targetGap.days}D gap ({new Date(targetGap.start_date + 'T12:00:00').toLocaleDateString(undefined, {month:'short',day:'numeric'})} - {new Date(targetGap.end_date + 'T12:00:00').toLocaleDateString(undefined, {month:'short',day:'numeric'})})
                            </Text>
                            <TouchableOpacity onPress={() => onSetTargetGap(null)}>
                                <Text style={{ fontSize: 16, color: '#2E7D32' }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={fpStyles.section}>
                        <View style={fpStyles.searchRow}>
                            <Text style={fpStyles.searchIcon}>🔍</Text>
                            <TextInput
                                style={fpStyles.searchInput}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search Crops"
                                placeholderTextColor="#9CA3AF"
                                autoCorrect={false}
                                clearButtonMode="while-editing"
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Text style={{ color: '#9CA3AF', fontSize: 13 }}>✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        {cropCategories.length > 1 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={fpStyles.chipRow}
                                keyboardShouldPersistTaps="handled"
                            >
                                {cropCategories.map(cat => (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[fpStyles.chip, activeCategory === cat && fpStyles.chipActive]}
                                        onPress={() => setActiveCategory(cat)}
                                    >
                                        <Text style={[fpStyles.chipText, activeCategory === cat && fpStyles.chipTextActive]}>
                                            {cat}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </View>

                    {/* (Global coverage picker removed — handled via contextual SelectCoverageModal instead) */}

                    {/* ── Frost filter ── */}
                    <TouchableOpacity
                        style={[fpStyles.frostBtn, frostFilter && fpStyles.frostBtnActive]}
                        onPress={() => setFrostFilter(f => !f)}
                        activeOpacity={0.8}
                    >
                        <Text style={[fpStyles.frostBtnText, frostFilter && fpStyles.frostBtnTextActive]}>
                            ❄️ {frostFilter ? 'Showing frost-tolerant only' : 'Show winter-tolerant varieties'}
                        </Text>
                    </TouchableOpacity>

                    {/* ── Crop Table ── */}
                    <View style={[fpStyles.tableCard, { flex: 1, minHeight: 150 }]}>
                        {/* Table header */}
                        <View style={fpStyles.tableHeader}>
                            <Text style={[fpStyles.tableHeaderCell, { flex: 2.4, textAlign: 'left' }]}>CROP NAME</Text>
                            <Text style={[fpStyles.tableHeaderCell, { flex: 0.6 }]}>DTM</Text>
                            <Text style={[fpStyles.tableHeaderCell, { flex: 0.6 }]}>IGD</Text>
                            <Text style={[fpStyles.tableHeaderCell, { flex: 1.5 }]}>PLANNED DATE</Text>
                            <Text style={[fpStyles.tableHeaderCell, { flex: 1.6 }]}>OPTIMAL PLANTING DATE</Text>
                            <Text style={[fpStyles.tableHeaderCell, { flex: 2.0 }]}>EARLIEST PLANTING DATE</Text>
                            <Text style={[fpStyles.tableHeaderCell, { flex: 0.5 }]}>RPB</Text>
                            <Text style={[fpStyles.tableHeaderCell, { flex: 0.5 }]}>IRS</Text>
                        </View>

                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
                        {loading ? (
                            <View style={fpStyles.tableLoading}>
                                <ActivityIndicator color="#2D4F1E" />
                                <Text style={fpStyles.tableLoadingText}>Calculating options…</Text>
                            </View>
                        ) : displayedCandidates.length === 0 ? (
                            <Text style={fpStyles.tableEmpty}>
                                {selectedCropIds && selectedCropIds.length === 0
                                    ? 'No crops selected. Go to the Grid to add some.'
                                    : frostFilter
                                        ? 'No frost-tolerant crops fit this window. Try removing the filter.'
                                        : 'No eligible crops for this window. Consider a cover crop.'}
                            </Text>
                        ) : (
                            displayedCandidates.map((item, rowIdx) => {
                                const existingIds = (currentSuccessions ?? []).map(s => s.crop_id).filter(Boolean);
                                const sameBedCheck = checkBedCompanions(item.crop.id, existingIds);
                                const neighborCheck = checkBlockNeighborWarnings(item.crop.id, bedNumber, allBedSuccessions ?? {});
                                const hasConflict = sameBedCheck.warnings.length > 0 || neighborCheck.warnings.length > 0;

                                const dtm = item.crop.dtm > 0 ? item.crop.dtm : '—';
                                const igd = (item.start_date && item.end_date)
                                    ? Math.round((new Date(item.end_date) - new Date(item.start_date)) / 86400000)
                                    : (item.crop.dtm ?? 0) + (item.crop.harvest_window_days ?? 0);
                                const method = item.crop.seed_type ?? (item.crop.dtm < 40 ? 'DS' : 'TP');
                                
                                const idealIso = getIdealStartDate(item.crop, farmProfile?.last_frost_date);
                                const idealPlantDate = idealIso 
                                    ? `${method} ${new Date(idealIso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                    : '—';
                                
                                const rpb = item.crop.rows_per_30in_bed ?? '—';
                                const irs = item.crop.in_row_spacing_in ? `${item.crop.in_row_spacing_in}"` : '—';
                                const rawFits = item.fits ?? true;
                                const dStr = item.start_date || `${activeYear}-05-01`;
                                const m = new Date(dStr + (dStr.includes('T') ? '' : 'T12:00:00')).getMonth();
                                const isSpringWarm = item.crop.season === 'warm' && m >= 2 && m <= 7;
                                // isInFarmWindow: the engine placed this crop at/after the farm's own last_frost_date.
                                // checkAgronomicViability uses hardcoded Apr-20/May-15 thresholds that pre-date
                                // the farm's actual frost profile. If the suggested planting date is within the
                                // farm's real growing season, honour it — don't push it through handlePlantOutOfSeason.
                                const _lfMD = farmProfile?.last_frost_date?.slice(5); // "MM-DD"
                                const _itemMD = item.start_date?.slice(5);
                                const isInFarmWindow = _itemMD && _lfMD ? _itemMD >= _lfMD : false;
                                const fits = rawFits || isSpringWarm || isInFarmWindow;
                                
                                const isWinterCandidate = checkIsWinterGrow(item, hasProtection, fits, farmProfile?.lat, bedShelterType);
                                const winterDtm = isWinterCandidate
                                    ? Math.round((item.crop.dtm ?? 60) * WINTER_DTM_MULTIPLIER)
                                    : null;

                                const cropRemainingCoverage = (() => {
                                    if (!currentSuccessions || currentSuccessions.length === 0) return 1.0;
                                    
                                    const fallbackStartStr = farmProfile?.last_frost_date || `${activeYear}-04-15`;
                                    const fallbackStart = `${activeYear}-${fallbackStartStr.length > 5 ? fallbackStartStr.slice(5) : '04-15'}`;
                                    const computedStartDate = item.start_date || fallbackStart;
                                    
                                    const computedEndDate = item.end_date || (() => {
                                        const dtm = winterDtm ?? item.dtm ?? item.crop?.dtm ?? 60;
                                        const date = new Date(computedStartDate);
                                        if (isNaN(date)) return '9999-12-31';
                                        date.setDate(date.getDate() + dtm);
                                        return date.toISOString().slice(0, 10);
                                    })();

                                    let cStart, cEnd;
                                    if (targetGap) {
                                        // Belt-and-suspenders: if the targetGap window is already at
                                        // 100% coverage, fall back to the crop's own natural dates so
                                        // crops planned for OTHER time windows remain selectable.
                                        const gapPeak = getPeakCoverageInWindow(
                                            currentSuccessions,
                                            targetGap.start_date,
                                            targetGap.end_date ?? computedEndDate
                                        );
                                        if (gapPeak >= 0.99) {
                                            // The targeted gap is full — evaluate against this crop's own window
                                            cStart = computedStartDate;
                                            cEnd = computedEndDate;
                                        } else {
                                            cStart = targetGap.start_date;
                                            cEnd = targetGap.end_date ?? computedEndDate;
                                        }
                                    } else {
                                        cStart = computedStartDate;
                                        cEnd = computedEndDate;
                                    }
                                    const peak = getPeakCoverageInWindow(currentSuccessions, cStart, cEnd);
                                    return Math.max(0, 1.0 - peak);
                                })();

                                const bedFull = cropRemainingCoverage <= 0.01;
                                const effectiveFraction = Math.min(coverageFraction, Math.max(0.25, cropRemainingCoverage));
                                const wouldExceed = effectiveFraction > cropRemainingCoverage + 0.01;

                                const maxSeverity = (() => {
                                    let s = null;
                                    ['pests', 'diseases'].forEach(type => {
                                        (item.crop[type] || []).forEach(risk => {
                                            if (risk.zone_relevance && !risk.zone_relevance.includes('all') && !risk.zone_relevance.includes(userZone)) return;
                                            if (risk.severity === 'high') s = 'high';
                                            else if (risk.severity === 'medium' && s !== 'high') s = 'medium';
                                            else if (risk.severity === 'low' && !s) s = 'low';
                                        });
                                    });
                                    return s;
                                })();

                                return (
                                    <TouchableOpacity
                                        key={item.crop.id}
                                        style={[
                                            fpStyles.tableRow,
                                            rowIdx % 2 === 1 && fpStyles.tableRowAlt,
                                            isWinterCandidate && fpStyles.tableRowWinter,
                                            hasConflict && fpStyles.tableRowConflict,
                                            (bedFull || wouldExceed) && fpStyles.tableRowFull,
                                            !fits && !isWinterCandidate && fpStyles.tableRowWarning,
                                        ]}
                                        onPress={(e) => {
                                            // Stop the event from bubbling to any parent scrim or overlay
                                            // that might intercept it and trigger onClose (the race condition)
                                            e?.stopPropagation?.();
                                            if (bedFull) {
                                                Alert.alert('Bed Full', 'This bed is fully planted during this timeframe. Remove an existing conflicting crop to make room.');
                                                return;
                                            }
                                            setPendingPlantItem({
                                                item,
                                                fits,
                                                isWinterCandidate,
                                                winterDtm,
                                                availableFraction: cropRemainingCoverage
                                            });
                                        }}
                                        activeOpacity={bedFull ? 0.5 : 0.75}
                                    >
                                        <View style={{ flex: 2.4 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                {maxSeverity && (
                                                    <View style={[fpStyles.severityDotTable, { backgroundColor: maxSeverity === 'high' ? '#C62828' : maxSeverity === 'medium' ? '#E65100' : '#2E7D32' }]} />
                                                )}
                                                <Text style={[fpStyles.tableCropName, { flexShrink: 1 }]} numberOfLines={1}>
                                                    {item.crop.name}{item.crop.variety ? ` | ${item.crop.variety}` : ''}
                                                </Text>
                                                {/* ✓ Queued badge: shows the crop is in the active plan queue */}
                                                {selectedCropIds && selectedCropIds.includes(item.crop.id) && (
                                                    <View style={{ marginLeft: 6, backgroundColor: '#2E7D32', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
                                                        <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>✓ Queued</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {hasConflict && (
                                                <Text style={fpStyles.tableConflictNote} numberOfLines={1}>
                                                    ⚠️ Companion conflict
                                                </Text>
                                            )}
                                            {isWinterCandidate && (
                                                <Text style={fpStyles.tableWinterNote} numberOfLines={2}>
                                                    ❄️ Winter grow · est. {winterDtm}D · Very slow growth
                                                </Text>
                                            )}
                                        </View>
                                        <Text style={[fpStyles.tableCell, { flex: 0.6 }]}>{dtm}</Text>
                                        <Text style={[fpStyles.tableCell, { flex: 0.6 }]}>{igd > 0 ? igd : '—'}</Text>
                                        <Text style={[fpStyles.tableCell, { flex: 1.5, color: '#1565C0', fontWeight: '600', fontSize: 12 }]}>{plannedDate}</Text>
                                        <Text style={[fpStyles.tableCell, { flex: 1.6 }]}>{idealPlantDate}</Text>
                                        <Text style={[fpStyles.tableCell, { flex: 2.0, fontSize: 13, color: '#1B5E20', fontWeight: '500' }]}>
                                            {item.start_date ? `${method} ${new Date(item.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : gapDatesStr}
                                        </Text>
                                        <Text style={[fpStyles.tableCell, { flex: 0.5 }]}>{rpb}</Text>
                                        <Text style={[fpStyles.tableCell, { flex: 0.5 }]}>{irs}</Text>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                        </ScrollView>
                    </View>
                </View>
                {sharedCoverageModal}
            </View>
        );
    }

    // ── Non-fullPage (rising drawer) path — unchanged ────────────────────────
    const OuterWrap = ({ children }) => (
        <>
            <Animated.View
                pointerEvents={visible ? 'auto' : 'none'}
                style={[styles.drawerScrim, { opacity }]}
            >
                {/* Guard: never fire onClose while the coverage-fraction modal is active
                    (pendingPlantItem set) — that click belongs to the modal, not the scrim */}
                <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={(e) => {
                        e?.stopPropagation?.();
                        if (!pendingPlantItem) onClose();
                    }}
                />
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
                {children}
            </Animated.View>
        </>
    );

    return (
        <OuterWrap>

                {/* ── Enlarged Bed Diagram ── */}
                <View style={styles.bedDiagramWrap}>
                    <View style={styles.bedDiagramLeft}>
                        <Text style={styles.bedDiagramBedNum}>Bed {bedNumber}</Text>
                        <Text style={styles.bedDiagramCoverage}>
                            {currentSuccessions?.length || 0} {(currentSuccessions?.length === 1) ? 'crop' : 'crops'}
                        </Text>
                    </View>
                    <View style={styles.bedDiagram}>
                        {currentSuccessions?.length > 0 ? (
                            currentSuccessions.map((s, idx) => {
                                const frac = s.coverage_fraction ?? 1.0;
                                const fracLabel = frac >= 0.99 ? 'Full' : frac >= 0.74 ? '¾' : frac >= 0.49 ? '½' : '¼';
                                const method = s.seed_type ?? (s.dtm < 40 ? 'DS' : 'TP');
                                const plantDate = s.start_date
                                    ? new Date(s.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : null;
                                const endDate = s.end_date
                                    ? new Date(s.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : null;
                                const BED_COLORS = [
                                    { bg: '#C8F7C5', text: '#145A32' }, { bg: '#FFF9C4', text: '#F57F17' },
                                    { bg: '#FFCCBC', text: '#BF360C' }, { bg: '#B2EBF2', text: '#006064' },
                                    { bg: '#E1BEE7', text: '#4A148C' }, { bg: '#DCEDC8', text: '#33691E' },
                                ];
                                const clr = BED_COLORS[idx % BED_COLORS.length];
                                const minH = Math.max(32, Math.round(frac * 80));
                                return (
                                    <TouchableOpacity 
                                        key={idx} 
                                        style={[styles.bedDiagramRow, { backgroundColor: clr.bg, minHeight: minH }]}
                                        activeOpacity={0.75}
                                        onPress={() => setSelectedDiagramCrop({ ...s, fracLabel, plantDate, endDate, method, clr })}
                                    >
                                        <Text style={[styles.bedDiagramRowName, { color: clr.text }]} numberOfLines={1}>
                                            {s.crop_name ?? s.name}{s.variety ? ` / ${s.variety}` : ''}{'  '}[{fracLabel}]
                                        </Text>
                                        <Text style={[styles.bedDiagramRowMeta, { color: clr.text + 'CC' }]} numberOfLines={1}>
                                            {s.dtm > 0 ? `${s.dtm}d` : 'CC'}
                                            {plantDate ? `  ${method} ${plantDate}` : ''}
                                            {endDate ? ` → ${endDate}` : ''}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })
                        ) : (
                            <View style={styles.bedDiagramEmpty}>
                                <Text style={styles.bedDiagramEmptyText}>Empty bed — select a crop below to plan</Text>
                            </View>
                        )}
                        {remainingCoverage > 0.01 && currentSuccessions?.length > 0 && (
                            <View style={[styles.bedDiagramRow, { backgroundColor: 'rgba(45,79,30,0.05)', height: Math.max(16, Math.round(remainingCoverage * 60)), borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(45,79,30,0.2)' }]}>
                                <Text style={[styles.bedDiagramRowText, { color: 'rgba(45,79,30,0.4)' }]}>
                                    {Math.round(remainingCoverage * 100)}% open
                                </Text>
                            </View>
                        )}
                    </View>
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

                {/* ── Season months bar ── */}
                {seasonMonths.length > 0 && (
                    <View style={styles.monthsBar}>
                        <Text style={styles.monthsBarLabel}>
                            {bedShelterType === 'greenhouse' ? '🏡 +45d' : bedShelterType === 'rowCover' ? '☔ +25d' : '🌿 Season'}
                        </Text>
                        {seasonMonths.map(m => (
                            <View key={m} style={styles.monthsPill}>
                                <Text style={styles.monthsPillText}>{m}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Category tabs ── */}
                {cropCategories.length > 1 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryTabsRow}
                        keyboardShouldPersistTaps="handled"
                        style={{ overflow: 'visible' }}
                    >
                        {cropCategories.map(cat => (
                            <TouchableOpacity
                                key={cat}
                                style={[styles.categoryTab, activeCategory === cat && styles.categoryTabActive]}
                                onPress={() => setActiveCategory(cat)}
                            >
                                <Text style={[styles.categoryTabText, activeCategory === cat && styles.categoryTabTextActive]}>
                                    {cat}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

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

                {/* Current bed plan */}
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
                                                            onPress={() => { onEditCoverage(idx, f.value); setEditingIdx(null); }}
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


                {/* Coverage picker removed — now inline per-crop (see renderItem below) */}


                {/* ❄️ Frost filter */}
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
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.drawerList}
                        ListEmptyComponent={
                            <Text style={[fpStyles.tableEmpty, { marginTop: 40, paddingHorizontal: 20 }]}>
                                {selectedCropIds && selectedCropIds.length === 0
                                    ? 'No crops selected. Go to the Grid to add some.'
                                    : frostFilter
                                        ? 'No frost-tolerant crops fit this window. Try removing the filter.'
                                        : 'No eligible crops for this window. Consider a cover crop.'}
                            </Text>
                        }
                        renderItem={({ item }) => {
                            const existingIds = (currentSuccessions ?? []).map(s => s.crop_id).filter(Boolean);
                            const sameBedCheck = checkBedCompanions(item.crop.id, existingIds);
                            const neighborCheck = checkBlockNeighborWarnings(item.crop.id, bedNumber, allBedSuccessions ?? {});
                            const hasConflict = sameBedCheck.warnings.length > 0 || neighborCheck.warnings.length > 0;
                            const igd = (item.start_date && item.end_date)
                                ? Math.round((new Date(item.end_date) - new Date(item.start_date)) / 86400000)
                                : (item.crop.dtm ?? 0) + (item.crop.harvest_window_days ?? 0);
                            const method = item.crop.seed_type ?? (item.crop.dtm < 40 ? 'DS' : 'TP');
                            const plantDate = item.start_date
                                ? `${method} ${new Date(item.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                : '—';
                            const rpb = item.crop.rows_per_30in_bed ?? '—';
                            const irs = item.crop.in_row_spacing_in ? `${item.crop.in_row_spacing_in}"` : '—';                            

                            const idealIso = getIdealStartDate(item.crop, farmProfile?.last_frost_date);
                            const idealPlantDate = idealIso 
                                ? `${method} ${new Date(idealIso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                : '—';


                            const rawFits = item.fits ?? false;
                            const dStr = item.start_date || `${activeYear}-05-01`;
                            const m = new Date(dStr + (dStr.includes('T') ? '' : 'T12:00:00')).getMonth();
                            const isSpringWarm = item.crop.season === 'warm' && m >= 2 && m <= 7;
                            // isInFarmWindow: engine placed crop at/after the farm's real last_frost_date.
                            // Hardcoded checkAgronomicViability thresholds don't account for farm-specific frost profiles.
                            const _lfMD2 = farmProfile?.last_frost_date?.slice(5);
                            const _itemMD2 = item.start_date?.slice(5);
                            const isInFarmWindow2 = _itemMD2 && _lfMD2 ? _itemMD2 >= _lfMD2 : false;
                            const effFits = rawFits || isSpringWarm || isInFarmWindow2;
                            
                            const isWinterCandidate = checkIsWinterGrow(item, hasProtection, effFits, farmProfile?.lat, bedShelterType);
                            const winterDtm = isWinterCandidate
                                ? Math.round((item.crop.dtm ?? 60) * WINTER_DTM_MULTIPLIER)
                                : null;

                            const cropRemainingCoverage = (() => {
                                if (!currentSuccessions || currentSuccessions.length === 0) return 1.0;
                                let cStart, cEnd;
                                if (targetGap) {
                                    // Belt-and-suspenders: if the targetGap window is already at
                                    // 100% coverage, fall back to the crop's own natural dates so
                                    // crops planned for OTHER time windows remain selectable.
                                    const gapPeak = getPeakCoverageInWindow(
                                        currentSuccessions,
                                        targetGap.start_date,
                                        targetGap.end_date ?? '9999-12-31'
                                    );
                                    if (gapPeak >= 0.99) {
                                        // The targeted gap is full — evaluate against this crop's own window
                                        cStart = item.start_date ?? farmProfile?.last_frost_date;
                                        cEnd = item.end_date ?? '9999-12-31';
                                    } else {
                                        cStart = targetGap.start_date;
                                        cEnd = targetGap.end_date ?? '9999-12-31';
                                    }
                                } else {
                                    cStart = item.start_date ?? farmProfile?.last_frost_date;
                                    cEnd = item.end_date ?? '9999-12-31';
                                }
                                const peak = getPeakCoverageInWindow(currentSuccessions, cStart, cEnd);
                                return Math.max(0, 1.0 - peak);
                            })();

                            const bedFull = cropRemainingCoverage <= 0.01;

                            return (
                                <View>
                                    <TouchableOpacity
                                        style={[
                                            styles.cropListRow,
                                            !effFits && !isWinterCandidate && styles.cropListRowDim,
                                            isWinterCandidate && styles.cropListRowWinter,
                                            hasConflict && styles.cropListRowConflict,
                                            bedFull && styles.cropListRowFull,
                                        ]}
                                        onPress={(e) => {
                                            // Stop the event from bubbling up to the drawerScrim's
                                            // TouchableOpacity, which would call onClose() and swallow
                                            // the second click (the event-propagation race condition).
                                            e?.stopPropagation?.();
                                            if (bedFull) return; // bed at capacity — do nothing
                                            setPendingPlantItem({
                                                item,
                                                fits: effFits,
                                                isWinterCandidate,
                                                winterDtm,
                                                availableFraction: cropRemainingCoverage
                                            });
                                        }}
                                        activeOpacity={bedFull ? 1 : 0.75}
                                    >
                                        <View style={[styles.cropListCell, { flex: 1.8 }]}>
                                            <Text style={styles.cropListName} numberOfLines={1}>
                                                {remainingCoverage >= 0.99 ? '[Full] ' : ''}{item.crop.name}
                                            </Text>
                                            <Text style={styles.cropListVariety} numberOfLines={1}>{item.crop.variety ?? '—'}</Text>
                                            {isWinterCandidate && (
                                                <Text style={styles.cropListWinterLabel} numberOfLines={2}>
                                                    ❄️ Winter grow · est. {winterDtm}D · Very slow, extra coverage required
                                                </Text>
                                            )}
                                        </View>
                                        <Text style={[styles.cropListCell, { flex: 0.6 }]}>{item.crop.dtm > 0 ? `${item.crop.dtm}d` : 'CC'}</Text>
                                        <Text style={[styles.cropListCell, { flex: 0.6 }]}>{igd > 0 ? `${igd}d` : '—'}</Text>
                                        <Text style={[styles.cropListCell, { flex: 1.3, fontSize: 11, color: '#1565C0', fontWeight: '600' }]}>{plannedDate}</Text>
                                        <Text style={[styles.cropListCell, { flex: 1.2, fontSize: 11 }]}>{idealPlantDate}</Text>
                                        <Text style={[styles.cropListCell, { flex: 2.3, fontSize: 11, color: '#1B5E20', fontWeight: '500' }]}>
                                            {item.start_date ? `${method} ${new Date(item.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : gapDatesStr}
                                        </Text>
                                        <Text style={[styles.cropListCell, { flex: 0.5 }]}>{rpb}</Text>
                                        <Text style={[styles.cropListCell, {
                                            color: bedFull ? '#BF360C' : Colors.mutedText,
                                            fontWeight: '700',
                                            fontSize: bedFull ? 8 : 12,
                                        }]}>
                                            {bedFull ? 'FULL' : '+'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        }}
                    />
                )}

                {/* Removed duplicate Contextual Coverage Modal since it's now shared */}

                {/* ── Gantt Block Crop Details Modal ── */}
                <Modal
                    visible={!!selectedDiagramCrop}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setSelectedDiagramCrop(null)}
                >
                    <TouchableOpacity 
                        style={fpStyles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setSelectedDiagramCrop(null)}
                    >
                        <TouchableOpacity 
                            style={fpStyles.modalCard}
                            activeOpacity={1}
                        >
                            <Text style={fpStyles.modalTitle}>
                                {selectedDiagramCrop?.crop_name ?? selectedDiagramCrop?.name}
                            </Text>
                            <Text style={fpStyles.modalSubtitle}>
                                {selectedDiagramCrop?.variety ? `Variety: ${selectedDiagramCrop.variety}` : 'No variety specified'}
                            </Text>

                            <View style={{ marginBottom: 20, backgroundColor: 'rgba(45,79,30,0.06)', borderRadius: 8, padding: 16, gap: 10 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B3B1A' }}>Coverage</Text>
                                    <View style={{ backgroundColor: selectedDiagramCrop?.clr?.bg ?? '#C8F7C5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '800', color: selectedDiagramCrop?.clr?.text ?? '#145A32' }}>
                                            {selectedDiagramCrop?.fracLabel} Bed
                                        </Text>
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B3B1A' }}>Days to Maturity</Text>
                                    <Text style={{ fontSize: 13, color: '#6B7280' }}>
                                        {selectedDiagramCrop?.dtm > 0 ? `${selectedDiagramCrop.dtm} Days` : 'Cover Crop'}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B3B1A' }}>Planting Date</Text>
                                    <Text style={{ fontSize: 13, color: '#6B7280' }}>
                                        {selectedDiagramCrop?.plantDate ? `${selectedDiagramCrop.method} on ${selectedDiagramCrop.plantDate}` : '—'}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B3B1A' }}>Target Harvest</Text>
                                    <Text style={{ fontSize: 13, color: '#6B7280' }}>
                                        {selectedDiagramCrop?.endDate ?? '—'}
                                    </Text>
                                </View>
                            </View>

                                <TouchableOpacity style={fpStyles.modalCancel} onPress={() => setSelectedDiagramCrop(null)}>
                                    <Text style={[fpStyles.modalCancelText, { color: '#1B3B1A' }]}>Close</Text>
                                </TouchableOpacity>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
        </OuterWrap>
    );
};


// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function BedWorkspaceScreen({ navigation, route }) {
    const farmProfile = route?.params?.farmProfile ?? null;
    const planId = route?.params?.planId ?? route?.params?.block?.planId ?? null;
    
    const [selectedCropIds, setSelectedCropIds] = useState(() => loadPlanCrops(planId) ?? []);
    const [activeYear, setActiveYear] = useState(() => new Date().getFullYear());
    useFocusEffect(useCallback(() => {
        setSelectedCropIds(loadPlanCrops(planId) ?? []);
    }, [planId]));
    const singleBedMode = !!(route?.params?.singleBedMode);  // from BlockDetailScreen
    const blockParam = route?.params?.block ?? null;          // block object when singleBedMode
    const initialBedNum = route?.params?.initialBed ?? null;  // specific bed to open
    const frostFreeDays = farmProfile?.frost_free_days ?? 170;

    const [drawerOpen, setDrawerOpen] = useState(() => singleBedMode ? true : false);
    const [activeBed, setActiveBed] = useState(() => singleBedMode && initialBedNum ? String(initialBedNum) : null);
    const [showGrid, setShowGrid] = useState(false);
    const [showAIPlanModal, setShowAIPlanModal] = useState(false);
    const [calendarEntries, setCalendarEntries] = useState([]);
    const [noteBed, setNoteBed] = useState(null); // bed number being noted (null = modal closed)
    // Restore from localStorage if passed via Continue flow (HeroScreen restore)
    const [bedSuccessions, setBedSuccessions] = useState(() => {
        const params = route?.params ?? {};

        // ── singleBedMode: load from this block's own storage ──────────────────
        // NEVER fall through to loadSavedPlan() in singleBedMode — that contains
        // plan-wide data from the 8-bed workspace (Block A's beds) which would
        // wrongly pre-populate Block B's beds with Block A's crops.
        if (params.singleBedMode && params.block?.id) {
            // Priority 1: initialBedData passed from BlockDetailScreen's live state
            const initial = params.initialBedData;
            if (initial && Object.keys(initial).length > 0) {
                const converted = {};
                for (const [bedNum, val] of Object.entries(initial)) {
                    converted[bedNum] = val?.successions ?? (Array.isArray(val) ? val : []);
                }
                return converted;
            }
            // Priority 2: block-specific localStorage (data saved by cross-save useEffect)
            try {
                const blockBeds = loadBlockBeds(params.block.id);
                if (blockBeds && Object.keys(blockBeds).length > 0) {
                    const converted = {};
                    for (const [bedNum, val] of Object.entries(blockBeds)) {
                        converted[bedNum] = val?.successions ?? (Array.isArray(val) ? val : []);
                    }
                    return converted;
                }
            } catch {}
            return {}; // fresh block — no prior data
        }

        // VegetableGrid ALWAYS passes 'bedSuccessions' as a param key:
        //   {}           → fresh start (new farm or zip change)
        //   {1:[...], …} → same-session Crops↔BedWorkspace round-trip
        // HeroScreen also passes it when restoring a saved plan (non-empty).
        //
        // If the key is present, trust the param value entirely — no localStorage.
        if ('bedSuccessions' in params) {
            const fromParams = params.bedSuccessions;
            if (fromParams && Object.keys(fromParams).length > 0) return fromParams;
            
            // HYDRATION DEFENSE: If a browser refresh serialized the {} stale param from
            // a previous component transition, check if localStorage holds active workspace data
            // before blindly executing the wipe.
            const saved = loadSavedPlan();
            if (saved && saved.bedSuccessions && Object.keys(saved.bedSuccessions).length > 0) {
                return saved.bedSuccessions;
            }
            
            return {}; // explicit empty = fresh start
        }

        // Key absent = arrived via DashboardScreen, page refresh, or deep-link.
        // Restore from localStorage so the user doesn't lose work on refresh.
        const saved = loadSavedPlan();
        return saved?.bedSuccessions ?? {};
    });
    // Ref mirror — always holds the latest bedSuccessions so openBed / reloadDrawer
    // never read a stale closure copy after plantCrop() calls setBedSuccessions().
    const bedSuccessionsRef = useRef({});
    useEffect(() => { bedSuccessionsRef.current = bedSuccessions; }, [bedSuccessions]);
    // ── Per-bed shelter type (Phase 2) ────────────────────────────────────────
    // 'none' | 'rowCover' | 'greenhouse'  — persisted in state, saved alongside successions
    const [bedShelter, setBedShelter] = useState(() => {
        const params = route?.params ?? {};
        if (params.singleBedMode && params.block?.id) {
            // Priority 1: initialBedData passed from BlockDetailScreen's live state
            const initial = params.initialBedData;
            if (initial && Object.keys(initial).length > 0) {
                const converted = {};
                for (const [bedNum, val] of Object.entries(initial)) {
                    if (val?.shelterType && val.shelterType !== 'none') converted[bedNum] = val.shelterType;
                }
                return converted;
            }
            // Priority 2: block-specific localStorage (data saved by cross-save useEffect)
            try {
                const blockBeds = loadBlockBeds(params.block.id);
                if (blockBeds && Object.keys(blockBeds).length > 0) {
                    const converted = {};
                    for (const [bedNum, val] of Object.entries(blockBeds)) {
                        if (val?.shelterType && val.shelterType !== 'none') converted[bedNum] = val.shelterType;
                    }
                    return converted;
                }
            } catch {}
        }
        
        // Priority 3: fallback to global 8-bed saved local storage
        const saved = loadSavedPlan();
        return saved?.bedShelters ?? {};
    });

    const loadedBlockIdRef = useRef(null);

    // Synchronize block bed data on every focus.
    // Strategy: always read from localStorage (authoritative, always fresh), then MERGE
    // with in-memory state. In-memory wins for the active bed so any crops planted in
    // the current session are never evicted by a stale route.params snapshot.
    useFocusEffect(useCallback(() => {
        if (singleBedMode && blockParam?.id) {
            let persistedSuccs = {};
            let persistedShelter = {};
            try {
                // Always read from localStorage — never trust route.params?.initialBedData
                // which is frozen at navigation-call-time and goes stale immediately.
                const source = loadBlockBeds(blockParam.id);
                if (source && Object.keys(source).length > 0) {
                    for (const [bedNum, val] of Object.entries(source)) {
                        persistedSuccs[String(bedNum)] = val?.successions ?? (Array.isArray(val) ? val : []);
                        if (val?.shelterType && val.shelterType !== 'none') {
                            persistedShelter[String(bedNum)] = val.shelterType;
                        }
                    }
                }
            } catch {}

            // Merge: persisted data is the base; in-memory state wins per-bed so that
            // crops planted in this session (not yet written back) are not lost.
            setBedSuccessions(prev => {
                const merged = { ...persistedSuccs };
                // For each bed already in memory, keep the in-memory version if it has
                // more successions than what was persisted (i.e. an unsaved plant just happened).
                for (const [bedNum, inMemSuccs] of Object.entries(prev)) {
                    const key = String(bedNum);
                    if (inMemSuccs.length > (merged[key]?.length ?? 0)) {
                        merged[key] = inMemSuccs;
                    }
                }
                return merged;
            });
            setBedShelter(prev => ({ ...persistedShelter, ...prev }));
            loadedBlockIdRef.current = blockParam.id;
        }
    }, [singleBedMode, blockParam?.id]));

    // ── 8-bed mode shelter save ──────────────────────────────────────────────
    // Save bedShelter to localStorage continuously
    useEffect(() => {
        if (singleBedMode) return;
        saveBedShelters(bedShelter);
    }, [bedShelter, singleBedMode]);

    // ── singleBedMode cross-save ──────────────────────────────────────────────
    // BlockDetailScreen reads from acrelogic_block_beds_<blockId> (saveBlockBeds format).
    // BedWorkspaceScreen normally saves to plan-based storage, which BlockDetail
    // never reads. In singleBedMode, sync both so the bed list refreshes on back.
    useEffect(() => {
        if (!singleBedMode || !blockParam?.id) return;
        // Guard: only skip the cross-save if readback has NOT yet happened for this block.
        // On mount, useFocusEffect runs before this useEffect fires, so loadedBlockIdRef.current
        // is already set to blockParam.id by the time plants are persisted. If it's still null,
        // the screen just mounted and we should allow the first write-back.
        if (loadedBlockIdRef.current !== null && loadedBlockIdRef.current !== blockParam.id) return;
        // Convert { [bedNum]: succession[] } → { [bedNum]: { successions, shelterType } }
        const blockFormat = {};
        for (const [bedNum, succs] of Object.entries(bedSuccessions)) {
            blockFormat[bedNum] = {
                successions: succs,
                shelterType: bedShelter[bedNum] ?? 'none',
            };
        }
        // Also carry over shelter for beds not yet in bedSuccessions
        for (const [bedNum, shelterType] of Object.entries(bedShelter)) {
            if (!blockFormat[bedNum]) {
                blockFormat[bedNum] = { successions: [], shelterType };
            }
        }
        saveBlockBeds(blockParam.id, blockFormat);
    }, [bedSuccessions, bedShelter, singleBedMode, blockParam?.id]);

    // ── Web scroll fix for full-page succession drawer ─────────────────────────
    // RNW expands flex children to full content height, so overflow-y: scroll has
    // no effect without an explicit max-height constraint injected via CSS.
    useEffect(() => {
        if (Platform.OS !== 'web' || !singleBedMode) return;
        const id = 'succession-fullpage-scroll-fix';
        let el = document.getElementById(id);
        if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
        el.textContent = `
            #succession-full-page-scroll {
                max-height: calc(100dvh - 72px) !important;
                overflow-y: scroll !important;
                -webkit-overflow-scrolling: touch !important;
            }
        `;
        return () => { const e = document.getElementById(id); if (e) e.remove(); };
    }, [singleBedMode]);

    // Extension in days (net gain on each end of season) per shelter type
    const SHELTER_EXT = { none: 0, rowCover: 7, greenhouse: 21 };

    function buildEffectiveProfile(profile, shelterType) {
        const ext = SHELTER_EXT[shelterType ?? 'none'] ?? 0;
        if (!profile) return profile;
        const shiftDate = (iso, days) => {
            if (!iso) return iso;
            const baseIso = `${activeYear}-${iso.slice(5)}`;
            const d = new Date(baseIso + 'T12:00:00');
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
    const [targetGap, setTargetGap] = useState(null); // { start_date, end_date, days, lane }

    // Rerender candidates on gap selection
    useEffect(() => {
        if (drawerOpen && activeBed) {
            openBedRef.current?.(activeBed, undefined, targetGap);
        }
    }, [targetGap]);
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

    const openBed = useCallback(async (bedNumber, shelterOverride, forcedSuccessions = null) => {
        const bedKey = String(bedNumber);
        setActiveBed(bedKey);
        setDrawerOpen(true);
        setDrawerLoading(true);
        setDrawerCandidates([]);

        try {
            const currentSuccessions = forcedSuccessions ?? bedSuccessionsRef.current[bedKey] ?? [];
            const rawProfile = farmProfile ?? { frost_free_days: 170, last_frost_date: `${activeYear}-04-15`, first_frost_date: `${activeYear}-10-15`, lat: 45.5 };
            const currentShelter = shelterOverride !== undefined ? shelterOverride : (bedShelter[bedKey] ?? 'none');
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

            if (targetGap) {
                // If a timeline gap is selected, the engine evaluates crops relative to that date
                successionsForEngine = [{ start_date: profile.last_frost_date, end_date: targetGap.start_date }];
            } else if (currentSuccessions.length > 0) {
                // Find the true end of the timeline
                // Sort by end_date so we can anchor to the latest point
                const sortedByEnd = [...currentSuccessions].sort(
                    (a, b) => new Date(a.end_date) - new Date(b.end_date)
                );
                
                // Set the engine to append to the very latest end date in the bed
                successionsForEngine = [sortedByEnd[sortedByEnd.length - 1]];
                
                // Let's also check if there is a massive obvious gap at the front
                const seasonStart = new Date(rawProfile.last_frost_date ?? profile.last_frost_date);
                const firstCropStart = new Date(
                    [...currentSuccessions].sort((a,b) => new Date(a.start_date) - new Date(b.start_date))[0].start_date
                );
                
                if (Math.round((firstCropStart - seasonStart) / 86400000) > 20) {
                    // The whole spring is >20 days empty, let the engine fill spring first
                    successionsForEngine = []; 
                }
            }

            // Pass prior-year crops for this bed so engine applies rotation penalties/bonuses
            const priorYearCrops = getPriorYearBedCrops(bedNumber);

            // ── Pass 1: normal engine run (respects season / DTM filters) ─────────────
            const engineCandidates = await getSuccessionCandidatesRanked(
                { successions: successionsForEngine },
                profile,
                { maxResults: 200, priorYearCrops, shelterType: currentShelter }
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
                                end_date: (() => {
                                    const d = new Date(profile.last_frost_date + 'T12:00:00');
                                    d.setDate(d.getDate() + (crop.dtm || 60) + (crop.harvest_window_days || 0));
                                    return d.toISOString().slice(0, 10);
                                })(),
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
                // Strict Phase 2 Gatekeeping: if the library is empty, do NOT default to 200 dummy crops.
                // Leave the drawer empty so the "No Crops Selected" UI triggers.
                setDrawerCandidates([]);
            }
        } catch (err) {
            console.error('[BedWorkspace] Error loading candidates:', err);
        } finally {
            setDrawerLoading(false);
        }
    }, [farmProfile, selectedCropIds, bedShelter, activeYear]);

    // Keep a ref to openBed that's always current — used by plantCrop and
    // editSuccessionCoverage so calls inside setState updaters always read
    // the latest bedSuccessions without stale-closure issues.
    const openBedRef = useRef(openBed);
    useEffect(() => { openBedRef.current = openBed; }, [openBed]);

    // Auto-open the specified bed immediately when coming from BlockDetail in singleBedMode
    useEffect(() => {
        if (singleBedMode && initialBedNum) {
            openBed(initialBedNum);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally runs once on mount only

    // reloadDrawer: keep drawer open and refresh candidates with latest state
    const reloadDrawer = useCallback((bedNumber, forcedSuccessions = null) => {
        openBedRef.current(bedNumber, undefined, forcedSuccessions);
        setDrawerOpen(true);
    }, []);


    const closeDrawer = useCallback(() => {
        setDrawerOpen(false);
        setFillRemainingDtm(null);
        setTargetGap(null);
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
        let { crop, start_date, end_date, targetGap } = candidateItem;
        const bedKey = String(activeBed);
        const currentSuccessions = bedSuccessions[bedKey] ?? [];
        const requestedCoverage = candidateItem.coverage_fraction ?? 1.0;

        // Fallback: Extremely defensive checks to ensure we never push a date-less crop
        if (!start_date) {
            const baseStr = farmProfile?.last_frost_date || `${activeYear}-04-15`;
            start_date = `${activeYear}-${baseStr.slice(5)}`;
        }
        if (!end_date) {
            const sObj = new Date(start_date);
            sObj.setDate(sObj.getDate() + (candidateItem.dtm ?? crop?.dtm ?? 0) + (crop?.harvest_window_days ?? 0));
            end_date = sObj.toISOString().slice(0, 10);
        }

        // ── Target Gap Override vs Auto-Nestling ──────────────────────────────
        if (targetGap) {
            // User explicitly clicked a dashed gap on the Gantt chart.
            // Snap the crop perfectly to that date!
            start_date = targetGap.start_date;
            if (candidateItem.start_date && candidateItem.end_date && candidateItem.end_date !== '9999-12-31') {
                const durationDays = Math.round((new Date(candidateItem.end_date) - new Date(candidateItem.start_date)) / 86400000);
                const sObj = new Date(start_date);
                sObj.setDate(sObj.getDate() + durationDays);
                end_date = sObj.toISOString().slice(0, 10);
            } else if (candidateItem.dtm) {
                const sObj = new Date(start_date);
                sObj.setDate(sObj.getDate() + candidateItem.dtm + (crop?.harvest_window_days ?? 0));
                end_date = sObj.toISOString().slice(0, 10);
            } else if (crop?.dtm) {
                const sObj = new Date(start_date);
                sObj.setDate(sObj.getDate() + crop.dtm + (crop.harvest_window_days ?? 0));
                end_date = sObj.toISOString().slice(0, 10);
            }
        } else if (start_date && end_date && end_date !== '9999-12-31') {
            // Normal fallback: The engine provides a baseline start_date.
            const startObj = new Date(start_date);
            const endObj = new Date(end_date);
            const durationDays = Math.round((endObj - startObj) / 86400000);
            
            if (durationDays > 0) {
                // Potential nestling start points: 
                // The farm's last frost date (earliest standard date), plus the day AFTER any existing succession ends.
                const candidateDates = [
                    start_date, // The engine's suggested baseline
                    farmProfile?.last_frost_date,
                    ...currentSuccessions.map(s => s.start_date), // Allow concurrent implicit match!
                    ...currentSuccessions.map(s => {
                        if (!s.end_date) return null;
                        const dObj = new Date(s.end_date + 'T12:00:00');
                        dObj.setDate(dObj.getDate() + 1);
                        return dObj.toISOString().slice(0, 10);
                    })
                ];
                
                const sortedDates = [...new Set(candidateDates)]
                    .filter(Boolean)
                    .sort((a,b) => a.localeCompare(b));
                
                let foundBetterDate = null;
                
                // 1. Prioritize the explicitly requested start_date (Engine's chronological suggestion).
                // If it perfectly fits, lock it in so we butt-up perfectly, rather than getting
                // sucked backward into an unrelated early-season gap which creates stranded gaps.
                const originalEndObj = new Date(start_date);
                originalEndObj.setDate(originalEndObj.getDate() + durationDays);
                const originalEnd = originalEndObj.toISOString().slice(0, 10);
                
                if (1.0 - getPeakCoverageInWindow(currentSuccessions, start_date, originalEnd) >= requestedCoverage - 0.001) {
                    foundBetterDate = { start: start_date, end: originalEnd };
                } else {
                    // 2. If blocked, fluidly scan the timeline dates (left-to-right) to find the first valid nest
                    for (const testStart of sortedDates) {
                        const tObj = new Date(testStart);
                        tObj.setDate(tObj.getDate() + durationDays);
                        const testEnd = tObj.toISOString().slice(0, 10);
                        
                        const peak = getPeakCoverageInWindow(currentSuccessions, testStart, testEnd);
                        if (1.0 - peak >= requestedCoverage - 0.001) {
                             foundBetterDate = { start: testStart, end: testEnd };
                             break;
                        }
                    }
                }
                
                // If we found a valid nestling gap that is earlier than the engine's suggestion (backward),
                // or if the engine's suggestion was actually blocked (forward), we snap to the best date!
                if (foundBetterDate && foundBetterDate.start !== start_date) {
                     start_date = foundBetterDate.start;
                     end_date = foundBetterDate.end;
                }
            }
        }

        // ── Enforce strict timeline capacity ─────────────────────────────────
        const priorTotal = getPeakCoverageInWindow(currentSuccessions, start_date, end_date ?? '9999-12-31');

        if (priorTotal >= 0.99) {
            if (Platform.OS === 'web') window.alert(`Cannot plant ${crop.name}. Bed is completely full during this timeframe.`);
            else Alert.alert('Bed Full', `Cannot plant ${crop.name}. Bed is completely full during this timeframe.`);
            return;
        }

        const allowedCoverage = Math.max(0.01, Math.min(requestedCoverage, 1.0 - priorTotal));

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
            coverage_fraction: allowedCoverage,
            is_auto_generated: false,
            // Out-of-season protection flag — persisted so rotation history captures it
            requires_protection: candidateItem.requires_protection ?? false,
            is_winter_override: candidateItem.is_winter_override ?? candidateItem.requires_protection ?? false,
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

        // Add clamped capacity notice to the UI banner
        if (allowedCoverage < requestedCoverage - 0.01) {
            const fracMap = { 0.25: '¼', 0.5: '½', 0.75: '¾', 1: 'Full' };
            const label = fracMap[allowedCoverage] || allowedCoverage.toFixed(2);
            allWarnings.push(`Coverage reduced to ${label} bed to fix an overlap.`);
        }

        if (allWarnings.length > 0) {
            setCompanionAlert({ warnings: allWarnings });
        }
        
        // ── Persist implicit crop selections to library ─────────────────────
        setSelectedCropIds(prev => {
            if (!prev.includes(crop.id)) {
                const newList = [...prev, crop.id];
                savePlanCrops(planId, newList);
                return newList;
            }
            return prev;
        });
        // ───────────────────────────────────────────────────────────────────

        // ── Fix: Evaluate side effects on the projected state FIRST ───────
        const projectedList = [...(currentSuccessions ?? []), newSuccession];
        const currentPeak = getPeakCoverageInWindow(projectedList, start_date, end_date ?? '9999-12-31');

        if (currentPeak < 0.99) {
            // Bed still has capacity — keep drawer open in fill-remaining mode.
            setFillRemainingDtm(crop.dtm ?? null);
        } else {
            setFillRemainingDtm(null);
        }

        // If target gap reaches 100% full, clear it so the drawer re-evaluates
        if (targetGap) {
            const gapPeak = getPeakCoverageInWindow(projectedList, targetGap.start_date, targetGap.end_date ?? '9999-12-31');
            if (gapPeak >= 0.99) {
                setTargetGap(null);
            }
        }

        // Apply state AFTER side effects, preventing React aborted renders
        setBedSuccessions(prev => {
            return { ...prev, [bedKey]: projectedList };
        });

        // Reload drawer with latest state — explicit pass guarantees no stale closures
        reloadDrawer(bedKey, projectedList);
    }, [activeBed, bedSuccessions, planId, reloadDrawer, activeYear]);

    // Remove a succession by index from the active bed (called from drawer)
    const removeSuccessionFromBed = useCallback((idx) => {
        const bedKey = String(activeBed);
        const currentList = bedSuccessionsRef.current[bedKey] ?? [];
        const updatedList = [...currentList];
        updatedList.splice(idx, 1);

        setBedSuccessions(prev => {
            return { ...prev, [bedKey]: updatedList };
        });
        reloadDrawer(bedKey, updatedList);
    }, [activeBed, reloadDrawer]);

    const shiftSuccessionDates = useCallback((idx, days) => {
        const bedKey = String(activeBed);
        const currentList = bedSuccessionsRef.current[bedKey] ?? [];
        if (!currentList[idx]) return;
        
        const updatedList = [...currentList];
        updatedList[idx] = {
            ...updatedList[idx],
            start_date: updatedList[idx].start_date ? addDays(updatedList[idx].start_date, days) : null,
            end_date: updatedList[idx].end_date ? addDays(updatedList[idx].end_date, days) : null,
        };

        setBedSuccessions(prev => {
            return { ...prev, [bedKey]: updatedList };
        });
        reloadDrawer(bedKey, updatedList);
    }, [activeBed, reloadDrawer]);


    const handleAutoFill = useCallback(async (strategyId, filters) => {
        // Split beds into three buckets:
        //  (A) empty          → full auto-fill (pick primary + generate chain)
        //  (B) partial/manual → append auto-successions after the last existing crop
        //  (C) fully-planned  → skip entirely (don't overwrite user's complete plan)
        const hasManualCrops = (n) => (bedSuccessions[String(n)] ?? []).some(s => !s.is_auto_generated);

        const emptyBedsToFill = Array.from({ length: NUM_BEDS }, (_, i) => i + 1)
            .filter(n => (bedSuccessions[String(n)] ?? []).length === 0);

        const partialBedsToComplete = Array.from({ length: NUM_BEDS }, (_, i) => i + 1)
            .filter(n => hasManualCrops(n)); // has manual crops → complete the rest

        if (emptyBedsToFill.length === 0 && partialBedsToComplete.length === 0) return;

        // Snapshot so user can revert
        setPreAutoFillSnapshot({ ...bedSuccessions });

        const profile = farmProfile ?? {
            frost_free_days: 170,
            last_frost_date:  `${activeYear}-04-15`,
            first_frost_date: `${activeYear}-10-15`,
            lat: 45.5,
        };

        const { autoFillRemainingBeds } = await import('../services/successionEngine');

        // Beds that already have a full plan (not empty, not partial)
        const alreadyFullBeds = Array.from({ length: NUM_BEDS }, (_, i) => i + 1)
            .filter(n => !emptyBedsToFill.includes(n) && !partialBedsToComplete.includes(n))
            .map(n => ({ bed_number: n, successions: bedSuccessions[String(n)] ?? [] }));

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
            const existingSuccs = bedSuccessions[String(bedNum)] ?? [];
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
                updatedSuccessions[String(bedNum)] = [...existingSuccs, ...addedSuccessions];
                // Update farm count so subsequent partial beds avoid the same crops
                for (const s of addedSuccessions) {
                    if (s.crop_id) farmCropCount[s.crop_id] = (farmCropCount[s.crop_id] ?? 0) + 1;
                }
            }
        }

        setBedSuccessions(updatedSuccessions);
        setShowStrategyPicker(false);
    }, [bedSuccessions, farmProfile, autoFillFilters, activeYear]);

    const handleRevertAutoFill = useCallback(() => {
        if (!preAutoFillSnapshot) return;
        setBedSuccessions(preAutoFillSnapshot);
        setPreAutoFillSnapshot(null);
    }, [preAutoFillSnapshot]);

    // Edit the coverage_fraction of an existing succession in the active bed.
    // Triggers a drawer reload so the user sees the refreshed "Current Plan".
    const editSuccessionCoverage = useCallback((idx, newFraction) => {
        const bedKey = String(activeBed);
        setBedSuccessions(prev => {
            const updated = [...(prev[bedKey] ?? [])];
            if (!updated[idx]) return prev;
            updated[idx] = { ...updated[idx], coverage_fraction: newFraction };
            return { ...prev, [bedKey]: updated };
        });
        // Reload drawer so updated coverage badge shows immediately
        reloadDrawer(bedKey);
    }, [activeBed, reloadDrawer]);

    // Plant an out-of-season crop with a conditional warning based on current shelter.
    // NOTE: Alert.alert with button-callback arrays is silently dropped on Expo Web.
    // We use window.confirm() on web and Alert.alert on native so the crop always plants.
    const handlePlantOutOfSeason = useCallback((candidateItem) => {
        const cropName = candidateItem.crop?.name || candidateItem.name;
        const currentShelter = bedShelter[activeBed] ?? 'none';
        
        const isProtected = currentShelter === 'greenhouse' || currentShelter === 'rowCover';
        const protectedMsg = isProtected
            ? `“${cropName}” is outside its standard growing window.\n\nAdd it anyway? It will be saved and counted in next year’s rotation history.`
            : `“${cropName}” is outside the current frost-free window.\n\nIt won’t perform well without a row cover or greenhouse.\n\nAdd it anyway? It will be saved and counted in next year’s rotation history.`;

        // Shared plant action — extracted so both web and native paths call the same code
        const doPlantCrop = () => {
            const profile = farmProfile ?? {};
            let startDate = candidateItem.start_date;
            if (!startDate) {
                const baseStr = profile.first_frost_date || profile.last_frost_date || `${activeYear}-04-15`;
                startDate = `${activeYear}-${baseStr.slice(5)}`;
            }
            let endDate = candidateItem.end_date;
            if (!endDate) {
                const dtm = candidateItem.dtm ?? candidateItem.crop?.dtm ?? 60;
                const start = new Date(startDate);
                start.setDate(start.getDate() + dtm);
                endDate = start.toISOString().slice(0, 10);
            }
            plantCrop({
                ...candidateItem,
                start_date: startDate,
                end_date: endDate,
                requires_protection: candidateItem.requires_protection ?? !isProtected,
                is_winter_override: candidateItem.is_winter_override ?? false,
            });
        };

        if (Platform.OS === 'web') {
            // Alert.alert multi-button callbacks are silently dropped on web —
            // window.confirm() is guaranteed to work in all browsers.
            const confirmMsg = `🌿 Outside Growing Window\n\n${protectedMsg}`;
            if (window.confirm(confirmMsg)) {
                doPlantCrop();
            }
        } else {
            Alert.alert(
                '🌿 Outside Growing Window',
                protectedMsg,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: isProtected ? 'Yes, Add Anyhow' : 'Yes, Add with Protection',
                        onPress: doPlantCrop,
                    },
                ],
                { cancelable: true }
            );
        }
    }, [farmProfile, plantCrop, activeBed, bedShelter, activeYear]);

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
            {!singleBedMode && <View style={styles.header}>
                {/* ── Row 1: back + title + progress ── */}
                <View style={styles.headerRow1}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <View style={styles.headerText}>
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
                            farmProfile, planId,
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
                            // Build a sandbox canvas sized for 8 beds (4×8 ft) in 2 rows × 4 cols.
                            // isSandbox:true draws the boundary; bedPlanJson populates all beds
                            // with the current succession plan, color-striped per crop.
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
                            navigation.navigate('VisualBedLayout', {
                                farmProfile,
                                spaceJson,
                                bedPlanJson: JSON.stringify(bedSuccessions),
                            });
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
            </View>}


            {!singleBedMode && <Text style={styles.subheading}>
                Tap a bed to assign crops. The drawer shows only what fits your {frostFreeDays}-day frost window.
            </Text>}

            {/* ── Crop Queue Confirmation Panel ─────────────────────────────────── */}
            {!singleBedMode && selectedCropIds.length > 0 && (
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

            {!singleBedMode && <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${(plannedCount / NUM_BEDS) * 100}%` }]} />
            </View>}

            {!singleBedMode && <ScrollView
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
                        successions={bedSuccessions[String(bedNum)] ?? []}
                        onPress={openBed}
                        onLongPress={() => handleBedLongPress(bedNum)}
                        delayLongPress={600}
                        seasonStart={seasonStart}
                        seasonEnd={seasonEnd}
                        firstFrostDate={seasonEnd}
                        shelterType={bedShelter[String(bedNum)] ?? 'none'}
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
                            <TouchableOpacity style={[styles.autoFillBtn, Shadows.card]} onPress={() => navigation.navigate('SeedOrder', { farmProfile, planId })}>
                                <Text style={styles.autoFillBtnText}>🌱 Seed Order List</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </ScrollView>}

            <SuccessionDrawer
                visible={drawerOpen}
                bedNumber={activeBed}
                blockName={blockParam?.name ?? route?.params?.blockName ?? null}
                currentSuccessions={activeBed ? (bedSuccessions[String(activeBed)] ?? []) : []}
                allBedSuccessions={bedSuccessions}
                candidates={drawerCandidates}
                loading={drawerLoading}
                targetGap={targetGap}
                onSetTargetGap={setTargetGap}
                frostFreeDays={activeBed
                    ? (buildEffectiveProfile(
                        farmProfile ?? { frost_free_days: 170 },
                        bedShelter[activeBed] ?? 'none'
                      ).frost_free_days)
                    : frostFreeDays}
                onClose={singleBedMode ? () => { setTargetGap(null); navigation.goBack(); } : closeDrawer}
                onPlant={plantCrop}
                onPlantOutOfSeason={handlePlantOutOfSeason}
                onRemoveSuccession={removeSuccessionFromBed}
                onShiftDates={shiftSuccessionDates}
                onEditCoverage={editSuccessionCoverage}
                fillRemainingDtm={fillRemainingDtm}
                bedShelterType={activeBed ? (bedShelter[String(activeBed)] ?? 'none') : 'none'}
                onSetShelter={(shelterType) => {
                    if (!activeBed) return;
                    
                    const bedKey = String(activeBed);
                    const prevShelter = bedShelter[bedKey] ?? 'none';
                    if (prevShelter === shelterType) return;
                    
                    // Shelter extensions implicitly define spring offset behavior mapping.
                    const getOffset = (type) => type === 'greenhouse' ? -21 : type === 'rowCover' ? -7 : 0;
                    const delta = getOffset(shelterType) - getOffset(prevShelter);

                    setBedShelter(prev => ({ ...prev, [bedKey]: shelterType }));
                    
                    if (delta !== 0) {
                        setBedSuccessions(prev => {
                            const bedSuccs = prev[bedKey] || [];
                            if (bedSuccs.length === 0) return prev;
                            
                            const updated = bedSuccs.map(succ => ({
                                ...succ,
                                start_date: succ.start_date ? addDays(succ.start_date, delta) : succ.start_date,
                                end_date: succ.end_date ? addDays(succ.end_date, delta) : succ.end_date
                            }));
                            
                            return { ...prev, [bedKey]: updated };
                        });
                    }

                    openBed(activeBed, shelterType);
                }}
                farmProfile={farmProfile}
                fullPage={singleBedMode}
                selectedCropIds={selectedCropIds}
                activeYear={activeYear}
                setActiveYear={setActiveYear}
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
                blockName={route?.params?.blockName ?? null}
                onClose={() => setNoteBed(null)}
            />
        </View>
    );
}

// ─── fpStyles: Digital Agronomist full-page bed detail ───────────────────────
const fpStyles = StyleSheet.create({
    // ── Contextual Coverage Modal ──────────────────────────────────────────
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#1B3B1A', textAlign: 'center', marginBottom: 6 },
    modalSubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 18 },
    modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 8 },
    modalCovBtn: { flex: 1, paddingVertical: 14, backgroundColor: '#F4F5F0', borderRadius: 8, borderWidth: 1, borderColor: '#D7D6CB', alignItems: 'center', justifyContent: 'center' },
    modalCovBtnDisabled: { backgroundColor: '#FAFAFA', borderColor: '#E5E7EB', opacity: 0.4 },
    modalCovBtnText: { fontSize: 16, fontWeight: '800', color: '#1B3B1A' },
    modalCovBtnTextDisabled: { color: '#9CA3AF' },
    modalCancel: { paddingVertical: 12, alignItems: 'center' },
    modalCancelText: { fontSize: 15, fontWeight: '600', color: '#9CA3AF' },

    // Outer wrap
    wrap: {
        flex: 1,
        backgroundColor: '#FAF9F4',
        ...Platform.select({ web: { height: '100dvh', overflow: 'hidden' } }),
    },

    // ── Header bar ──────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingTop: Platform.OS === 'ios' ? 52 : 20,
        paddingBottom: 12,
        paddingHorizontal: 12,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E9E8E3',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    backBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
        backgroundColor: '#F0F0EB',
    },
    backArrow: {
        fontSize: 22,
        color: '#2D4F1E',
        lineHeight: 28,
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#173809',
        letterSpacing: -0.3,
    },
    headerBadges: {
        flexDirection: 'row',
        gap: 6,
    },
    growingBadge: {
        backgroundColor: '#E9E8E3',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    growingBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#43493E',
    },
    extBadge: {
        backgroundColor: '#CCEF60',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    extBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#293500',
    },
    doneBtn: {
        backgroundColor: '#173809',
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
    },
    doneBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },

    // ── Gantt chart ─────────────────────────────────────────────────────────
    ganttCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginHorizontal: 12,
        marginTop: 12,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
    },
    ganttMonthRow: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    ganttMonthLabel: {
        flex: 1,
        textAlign: 'left',
        paddingLeft: 4,
        fontSize: 9,
        fontWeight: '800',
        color: '#73796D',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    ganttDivider: {
        height: 1,
        backgroundColor: '#E3E3DE',
        marginBottom: 8,
    },
    ganttBarsWrap: {
        position: 'relative',
        overflow: 'hidden',
    },
    ganttGridLines: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
    },
    ganttGridLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: 'rgba(195, 200, 187, 0.25)',
        borderStyle: 'dashed',
    },
    ganttRowWrap: {
        marginBottom: 4,
    },
    ganttBar: {
        height: 32,
        borderRadius: 6,
        justifyContent: 'center',
        paddingHorizontal: 8,
        // width and marginLeft are set inline as % strings (web supports this)
        minWidth: 40,
    },
    ganttBarText: {
        fontSize: 10,
        fontWeight: '700',
    },
    ganttEmpty: {
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ganttEmptyText: {
        fontSize: 12,
        color: '#73796D',
        fontStyle: 'italic',
    },
    ganttRowActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
        paddingLeft: 4,
    },
    ganttFracBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#C3C8BB',
        backgroundColor: '#FFFFFF',
    },
    ganttFracBtnActive: {
        backgroundColor: '#2D4F1E',
        borderColor: '#2D4F1E',
    },
    ganttFracText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#43493E',
    },
    ganttFracTextActive: {
        color: '#FFFFFF',
    },
    ganttRemoveBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FFCCBC',
        backgroundColor: '#FFF3EE',
        marginLeft: 'auto',
    },
    ganttRemoveText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#BF360C',
    },
    ganttMoreChip: {
        position: 'absolute',
        bottom: 2,
        right: 0,
        backgroundColor: 'rgba(45,79,30,0.75)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    ganttMoreChipText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#FFF',
    },

    // ── Section wrapper ──────────────────────────────────────────────────────
    section: {
        marginHorizontal: 12,
        marginTop: 14,
        gap: 8,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#73796D',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },

    // ── Bed Protection pills ─────────────────────────────────────────────────
    shelterRow: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    shelterPill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#C3C8BB',
        backgroundColor: '#FFFFFF',
    },
    shelterPillActive: {
        backgroundColor: '#173809',
        borderColor: '#173809',
    },
    shelterPillText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#43493E',
    },
    shelterPillTextActive: {
        color: '#FFFFFF',
    },

    // ── Search ──────────────────────────────────────────────────────────────
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E9E8E3',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 8,
    },
    searchIcon: {
        fontSize: 15,
    },
    searchInput: {
        flex: 1,
        fontSize: 13,
        color: '#1B1C19',
        outlineStyle: 'none',
    },

    // ── Category chips ───────────────────────────────────────────────────────
    chipRow: {
        flexDirection: 'row',
        gap: 6,
        paddingVertical: 2,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: '#C4EBA8',
    },
    chipActive: {
        backgroundColor: '#173809',
    },
    chipText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#4A6B36',
    },
    chipTextActive: {
        color: '#FFFFFF',
    },

    // ── Coverage picker ──────────────────────────────────────────────────────
    coveragePickerWrap: {
        marginHorizontal: 12,
        marginTop: 10,
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E3E3DE',
    },
    coveragePickerLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#43493E',
        marginBottom: 8,
    },
    coveragePickerRow: {
        flexDirection: 'row',
        gap: 8,
    },
    covBtn: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#C3C8BB',
        backgroundColor: '#FFFFFF',
    },
    covBtnActive: {
        backgroundColor: '#2D4F1E',
        borderColor: '#2D4F1E',
    },
    covBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#43493E',
    },
    covBtnTextActive: {
        color: '#FFFFFF',
    },

    // ── Frost button ─────────────────────────────────────────────────────────
    frostBtn: {
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#C3C8BB',
        backgroundColor: '#FFFFFF',
        alignSelf: 'flex-start',
    },
    frostBtnActive: {
        backgroundColor: '#E8F4FD',
        borderColor: '#4FC3F7',
    },
    frostBtnText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#43493E',
    },
    frostBtnTextActive: {
        color: '#01579B',
    },

    // ── Crop table ───────────────────────────────────────────────────────────
    tableCard: {
        marginHorizontal: 'auto',
        marginTop: 12,
        maxWidth: 1000,
        alignSelf: 'center',
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(195,200,187,0.4)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#EFEEE9',
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(195,200,187,0.4)',
    },
    tableHeaderCell: {
        flex: 1,
        fontSize: 10,
        fontWeight: '800',
        color: '#73796D',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 2,
        gap: 2,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(195,200,187,0.2)',
    },
    tableRowAlt: {
        backgroundColor: '#FAFAF7',
    },
    tableRowDim: {
        opacity: 1.0,
    },
    tableRowWarning: {
        backgroundColor: '#FCF9F2',
    },
    tableRowConflict: {
        backgroundColor: '#FFF8EE',
    },
    tableRowWinter: {
        borderLeftWidth: 3,
        borderLeftColor: '#C62828',
        backgroundColor: '#FFF5F5',
    },
    tableRowFull: {
        backgroundColor: '#FBE9E7',
    },
    tableWinterNote: {
        fontSize: 10,
        color: '#C62828',
        marginTop: 2,
        fontWeight: '600',
    },
    tableCropName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#173809',
    },
    tableCell: {
        flex: 1,
        fontSize: 15,
        color: '#43493E',
        textAlign: 'center',
        fontWeight: '500',
    },
    tableConflictNote: {
        fontSize: 11,
        color: '#BF360C',
        marginTop: 1,
    },
    tableLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 10,
    },
    tableLoadingText: {
        fontSize: 12,
        color: '#73796D',
    },
    tableEmpty: {
        textAlign: 'center',
        padding: 24,
        fontSize: 12,
        color: '#73796D',
        fontStyle: 'italic',
    },

    // ── Status badges ────────────────────────────────────────────────────────
    statusBadge: {
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 4,
    },
    statusBadgeReady: {
        backgroundColor: '#CCEF60',
    },
    statusBadgePlanned: {
        backgroundColor: '#E3E3DE',
    },
    statusBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    statusBadgeTextReady: {
        color: '#3C4D00',
    },
    statusBadgeTextPlanned: {
        color: '#73796D',
    },
    // ── IPM Risks (Watch For) ────────────────────────────────────────────────
    watchForHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFF8E1',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FFE082',
    },
    watchForTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#E65100',
    },
    watchForChevron: {
        fontSize: 12,
        color: '#F57C00',
        fontWeight: '800',
    },
    watchForBody: {
        marginTop: 8,
        gap: 8,
    },
    riskCard: {
        backgroundColor: '#FCFCFA',
        borderWidth: 1,
        borderColor: '#EDEEEA',
        borderRadius: 6,
        padding: 12,
    },
    riskHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    severityDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    severityDotTable: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 4,
        marginTop: 1,
    },
    riskCropName: {
        fontSize: 12,
        fontWeight: '700',
        color: '#173809',
    },
    riskName: {
        fontSize: 12,
        fontWeight: '600',
        color: '#43493E',
    },
    riskDesc: {
        fontSize: 11,
        color: '#5C6356',
        lineHeight: 16,
        marginBottom: 4,
    },
    riskTreatment: {
        fontSize: 11,
        fontStyle: 'italic',
        color: '#2E7D32',
        fontWeight: '500',
    },
});

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
        top: 8,
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
    drawerList: { paddingBottom: Spacing.lg },

    // ── Months bar ──────────────────────────────────────────────────────────
    monthsBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 6, flexWrap: 'wrap' },
    monthsBarLabel: { fontSize: 9, fontWeight: '800', color: Colors.primaryGreen, marginRight: 2 },
    monthsPill: { backgroundColor: 'rgba(45,79,30,0.1)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
    monthsPillText: { fontSize: 9, fontWeight: '700', color: Colors.primaryGreen },

    // ── Category tabs ────────────────────────────────────────────────────────
    categoryTabsRow: {
        flexDirection: 'row', gap: 6,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 8, // extra vertical room so pills aren't clipped
    },
    categoryTab: {
        paddingVertical: 6, paddingHorizontal: 14,
        borderRadius: 16, borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.2)',
        backgroundColor: 'transparent',
        // Ensure shadow/border not clipped on web
        ...Platform.select({ web: { overflow: 'visible' } }),
    },
    categoryTabActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    categoryTabText: { fontSize: 11, fontWeight: '700', color: Colors.primaryGreen },
    categoryTabTextActive: { color: Colors.cream },

    // ── Compact crop list ────────────────────────────────────────────────────
    cropListHeader: { flexDirection: 'row', paddingHorizontal: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.12)', backgroundColor: 'rgba(45,79,30,0.04)' },
    cropListHeaderCell: { flex: 1, fontSize: 10, fontWeight: '800', color: Colors.primaryGreen, textTransform: 'uppercase', textAlign: 'center' },
    cropListRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.07)', backgroundColor: '#FAFAF7' },
    cropListRowDim: { opacity: 0.5 },
    cropListRowConflict: { backgroundColor: '#FFF8E7' },
    cropListRowExpanded: { backgroundColor: 'rgba(45,79,30,0.06)', borderBottomWidth: 0 },
    cropListRowFull: { opacity: 0.45 },
    cropListRowWinter: {
        borderLeftWidth: 3,
        borderLeftColor: '#E53935',
        backgroundColor: '#FFF5F5',
    },
    cropListWinterLabel: {
        fontSize: 10,
        color: '#C62828',
        fontWeight: '700',
        marginTop: 2,
        lineHeight: 12,
    },
    cropListCell: { flex: 1, fontSize: 12, color: Colors.darkText, fontWeight: '600', textAlign: 'center' },
    cropListName: { fontSize: 13, fontWeight: '800', color: Colors.primaryGreen },
    cropListVariety: { fontSize: 11, color: Colors.mutedText },

    // ── Inline coverage dropdown ─────────────────────────────────────────────
    inlineCoverageWrap: {
        backgroundColor: 'rgba(45,79,30,0.08)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45,79,30,0.12)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 10,
        gap: 8,
    },
    inlineCoverageLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.primaryGreen,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inlineCoverageRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    inlineCoverageChip: {
        paddingVertical: 8,
        paddingHorizontal: 18,
        borderRadius: 20,
        backgroundColor: Colors.primaryGreen,
    },
    inlineCoverageChipText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '800',
    },

    // ── Bed Diagram (Phase 8) ────────────────────────────────────────────────
    bedDiagramWrap: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.1)' },
    bedDiagramLeft: { justifyContent: 'center', minWidth: 48 },
    bedDiagramBedNum: { fontSize: 14, fontWeight: '900', color: Colors.primaryGreen },
    bedDiagramCoverage: { fontSize: 9, color: Colors.mutedText, fontWeight: '700' },
    bedDiagram: {
        flex: 1, flexDirection: 'column', // explicit column — RNW web defaults to row
        borderRadius: Radius.sm, borderWidth: 2, borderColor: 'rgba(45,79,30,0.25)',
        overflow: 'hidden', minHeight: 48,
    },
    bedDiagramRow: {
        width: '100%', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'flex-start',
        paddingHorizontal: 10, paddingVertical: 4,
        overflow: 'hidden', // keep text inside the colored strip
    },
    bedDiagramRowName: { fontSize: 10, fontWeight: '800', lineHeight: 14 },
    bedDiagramRowMeta: { fontSize: 8.5, fontWeight: '600', lineHeight: 13, marginTop: 1 },
    bedDiagramEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
    bedDiagramEmptyText: { fontSize: 9, color: 'rgba(45,79,30,0.4)', fontStyle: 'italic' },

    // ── Full-page bed screen (Phase 8 — from BlockDetail) ────────────────────
    fullPageWrap: { flex: 1, backgroundColor: '#F0EDE6', ...Platform.select({ web: { maxHeight: '100dvh' } }) },
    fullPageHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: Colors.primaryGreen,
        paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    },
    fullPageBack: { padding: 4 },
    fullPageBackArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    fullPageHeaderTitle: { fontSize: 17, fontWeight: '900', color: Colors.cream },
    fullPageHeaderSub: { fontSize: 10, color: Colors.warmTan, marginTop: 1 },
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
