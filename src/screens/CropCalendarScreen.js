import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Platform
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { generateBedCalendar } from '../services/calendarGenerator';
import { loadBlocks, loadBlocksForPlan, loadBlockBeds } from '../services/persistence';
import GlobalNavBar from '../components/GlobalNavBar';
import cropData from '../data/crops.json';
import { formatSeedVolume } from '../utils/seedVolumeConverter';

// ─── Event type config (Same as ActionCalendar with slight Farm tweaks) ──────
const EVENT_TYPES = {
    seed_start: { emoji: '🌱', label: 'Start indoors',  color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' },
    direct_seed:{ emoji: '💧', label: 'Direct sow',     color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' },
    buy_starts: { emoji: '🛍️', label: 'Buy starts',    color: '#6A1B9A', bg: '#F3E5F5', border: '#CE93D8' },
    transplant: { emoji: '🌤', label: 'Transplant out', color: '#E65100', bg: '#FFF3E0', border: '#FFCC80' },
    harvest:    { emoji: '✂️', label: 'Harvest',        color: '#BF360C', bg: '#FBE9E7', border: '#FFAB91' },
    cover_crop: { emoji: '🌾', label: 'Sow Cover',      color: '#4E342E', bg: '#EFEBE9', border: '#BCAAA4' },
    scout:      { emoji: '🛡️', label: 'IPM Scout',      color: '#6A1B9A', bg: '#F3E5F5', border: '#CE93D8' },
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function parseISO(d) {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (d.length <= 10) {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m - 1, day);
    }
    return new Date(d); // for full ISO strings
}

function startOfWeek(d) {
    const x = new Date(d), day = x.getDay();
    x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
    return x;
}

function isoDate(d) { return d.toISOString().split('T')[0]; }
function weekLabel(d) { return `Week of ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`; }

function groupEvents(events) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 1000 * 60 * 60 * 24;

    const mm = new Map();

    for (const ev of events) {
        if (!ev.date) continue;
        const diffDaysVal = Math.round((ev.date - today) / msPerDay);

        let sectionKey, sectionLabel, weekKey, weekLbl;

        if (diffDaysVal < 0) {
            sectionKey   = '00_overdue';
            sectionLabel = '⚠️ OVERDUE / ACT NOW';
            weekKey      = '00_w';
            weekLbl      = 'Past Due Events';
        } else if (diffDaysVal <= 7) {
            sectionKey   = '01_this_week';
            sectionLabel = '📍 THIS WEEK';
            weekKey      = '01_w';
            weekLbl      = 'Next 7 days';
        } else if (diffDaysVal <= 14) {
            sectionKey   = '02_next_week';
            sectionLabel = '🗓 NEXT WEEK';
            weekKey      = '02_w';
            weekLbl      = '8 to 14 days out';
        } else {
            sectionKey   = ev.monthKey;
            sectionLabel = ev.monthLabel;
            weekKey      = ev.weekKey;
            weekLbl      = ev.weekLabel;
        }

        if (!mm.has(sectionKey)) {
            mm.set(sectionKey, { monthLabel: sectionLabel, sectionKey, wm: new Map() });
        }
        const m = mm.get(sectionKey);
        if (!m.wm.has(weekKey)) {
            m.wm.set(weekKey, { weekLabel: weekLbl, weekKey, events: [] });
        }
        m.wm.get(weekKey).events.push(ev);
    }

    return [...mm.values()]
        .sort((a, b) => a.sectionKey.localeCompare(b.sectionKey))
        .map(m => ({
            monthLabel:  m.monthLabel,
            isHighlight: m.sectionKey.startsWith('0'),
            weeks: [...m.wm.values()].sort((a, b) => a.weekKey.localeCompare(b.weekKey)),
        }));
}

// ─── Farm Trays ───────────────────────────────────────────────────────────────
function recommendTrayFarm(cropData) {
    if (!cropData) return null;
    const cat = cropData.category ?? '';
    if (cat === 'Cucurbit')
        return { type: 'tray', cells: 50, label: '50-cell flat' };
    if (['Nightshade', 'Specialty', 'Fruit'].includes(cat))
        return { type: 'tray', cells: 72, label: '72-cell flat' };
    if (['Allium'].includes(cat))
        return { type: 'tray', cells: 288, label: '288-cell flat' };
    return { type: 'tray', cells: 128, label: '128-cell flat' };
}

function traysNeeded(plants, tray) {
    const seedsToSow = Math.ceil(plants * 1.20); // 20% buffer for germ and pest loss
    return tray.type === 'pot' ? seedsToSow : Math.ceil(seedsToSow / (tray.cells ?? 128));
}

/**
 * consolidateWeeklyEvents
 * ───────────────────────────────────────────────────────────────────
 * Merges events that share the same week + event type + crop name + variety
 * into a single consolidated card with summed seed/plant counts.
 * Preserves a `mergedBeds` array so the card can list all source locations.
 */
function consolidateWeeklyEvents(events) {
    // Key: weekKey || type || cropName || variety (all 4 must match)
    const keyFor = ev =>
        `${ev.weekKey}||${ev.type}||${ev.cropName}||${ev.cropVariety ?? ''}`;

    const groups = new Map();

    for (const ev of events) {
        const key = keyFor(ev);
        if (!groups.has(key)) {
            // First occurrence — seed the group with a copy and start mergedBeds list
            groups.set(key, {
                ...ev,
                mergedBeds: [{ blockName: ev.blockName, bed_label: ev.bed_label }],
            });
        } else {
            const g = groups.get(key);
            // Sum numeric fields
            g.plants         = (g.plants ?? 0)         + (ev.plants ?? 0);
            g.totalSeeds     = (g.totalSeeds ?? 0)     + (ev.totalSeeds ?? 0);
            g.seed_amount_oz = (g.seed_amount_oz ?? 0) + (ev.seed_amount_oz ?? 0);
            // Use the earliest event date so the card sorts to the right slot
            if (ev.date < g.date) g.date = ev.date;
            // Propagate boolean flags with OR
            g.wasRebased        = g.wasRebased        || ev.wasRebased;
            g.rescuedViaNursery = g.rescuedViaNursery || ev.rescuedViaNursery;
            // Track each source bed
            g.mergedBeds.push({ blockName: ev.blockName, bed_label: ev.bed_label });
        }
    }

    // After merging, recalculate tray counts with the summed plant count
    return [...groups.values()].map(ev => {
        if (ev.type === 'seed_start' && ev.tray && ev.plants) {
            ev.traysCount = traysNeeded(ev.plants, ev.tray);
        }
        return ev;
    });
}

// ─── Tray Options (full commercial market garden menu) ────────────────────────
const TRAY_OPTIONS = [
    { type: 'pot',   cells: 1,   label: '4" Pots',                 emoji: '🪴', note: 'Tomatoes, peppers, cucurbits' },
    { type: 'tray',  cells: 32,  label: '32-cell flat',             emoji: '📦', note: 'Large starts, brassicas' },
    { type: 'tray',  cells: 50,  label: '50-cell flat',             emoji: '📦', note: 'Cucurbits, squash' },
    { type: 'tray',  cells: 72,  label: '72-cell flat',             emoji: '📦', note: 'Nightshades, standard' },
    { type: 'tray',  cells: 98,  label: '98-cell flat',             emoji: '📦', note: 'Mid-size brassicas, kale' },
    { type: 'tray',  cells: 128, label: '128-cell flat',            emoji: '📦', note: 'Lettuce, most crops' },
    { type: 'tray',  cells: 144, label: '144-cell flat',            emoji: '📦', note: 'Herbs, medium crops' },
    { type: 'tray',  cells: 200, label: '200-cell flat',            emoji: '📦', note: 'Basil, specialty greens' },
    { type: 'tray',  cells: 288, label: '288-cell flat',            emoji: '📦', note: 'Alliums, onions, leeks' },
    { type: 'tray',  cells: 512, label: '512-cell flat',            emoji: '📦', note: 'Micro starts, fine seeding' },
    { type: 'paper', cells: 264, label: 'Paper Pot (2" spacing)',   emoji: '📜', note: 'Onions, scallions, spinach' },
    { type: 'paper', cells: 132, label: 'Paper Pot (4" spacing)',   emoji: '📜', note: 'Salanova, beets, chard' },
    { type: 'paper', cells: 88,  label: 'Paper Pot (6" spacing)',   emoji: '📜', note: 'Turnips, kohlrabi, larger' },
];

// ─── Components ───────────────────────────────────────────────────────────────
function EventChip({ ev, selectedTray, onTrayChange }) {
    const t = EVENT_TYPES[ev.type] ?? EVENT_TYPES.direct_seed;

    // ── Tray Picker open/close state stays local (UI-only, safe to reset) ──────
    const [trayPickerOpen, setTrayPickerOpen] = useState(false);

    const seedsNeeded = ev.plants ? Math.ceil(ev.plants * 1.2) : 0;
    const computedTraysCount = selectedTray
        ? selectedTray.type === 'pot'
            ? seedsNeeded
            : Math.ceil(seedsNeeded / selectedTray.cells)
        : ev.traysCount;
    const trayUnit = selectedTray?.type === 'pot' ? 'pot' : 'tray';
    const trayUnitPlural = selectedTray?.type === 'pot' ? 'pots' : 'trays';

    return (
        <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
            <View style={styles.chipTop}>
                <Text style={styles.chipEmoji}>{t.emoji}</Text>
                <Text style={[styles.chipType, { color: t.color }]} numberOfLines={1}>
                    {t.label}
                </Text>
            </View>
            <Text style={[styles.chipCrop, { color: t.color }]} numberOfLines={2}>
                {ev.cropName}{ev.cropVariety ? ` · ${ev.cropVariety}` : ''}
            </Text>
            
            {/* Location badge — shows all merged beds when consolidated */}
            {ev.mergedBeds && ev.mergedBeds.length > 1 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 4, marginTop: 2 }}>
                    {ev.mergedBeds.map((b, i) => (
                        <View key={i} style={styles.locationBadge}>
                            <Text style={styles.locationText}>
                                {b.blockName.toUpperCase()} · {(b.bed_label || '').replace('Bed ', 'BED ')}
                            </Text>
                        </View>
                    ))}
                    <View style={styles.consolidatedBadge}>
                        <Text style={styles.consolidatedText}>✦ Consolidated</Text>
                    </View>
                </View>
            ) : (
                <View style={styles.locationBadge}>
                    <Text style={styles.locationText}>BLOCK {ev.blockName.toUpperCase()} · BED {(ev.bed_label || '').replace('Bed ', '')}</Text>
                </View>
            )}

            {/* Nursery-rescue / Rebased badges */}
            {ev.rescuedViaNursery && ev.type === 'buy_starts' ? (
                <View style={styles.nurseryBadge}>
                    <Text style={styles.nurseryText}>🌿 Nursery only (late)</Text>
                </View>
            ) : ev.wasRebased && (ev.type === 'direct_seed' || ev.type === 'seed_start') ? (
                <View style={styles.rebasedBadge}>
                    <Text style={styles.rebasedText}>⏩ Shifted to today</Text>
                </View>
            ) : null}

            {/* Volume/Weight of seeds requirement rendering */}
            {ev.type === 'direct_seed' && ev.seed_amount_label && (
                <>
                    <Text style={styles.chipExtra}>⚖️ {ev.seed_amount_label}</Text>
                    {ev.seed_amount_oz != null && (
                        <Text style={styles.chipVolume}>
                            {formatSeedVolume(ev.seed_amount_oz, ev.crop_id, ev.crop_category)}
                        </Text>
                    )}
                </>
            )}

            {ev.plants != null && ev.plants > 0 && ev.type !== 'seed_start' && ev.type !== 'harvest' && (
                <Text style={styles.chipExtra}>🪴 {ev.plants} plants</Text>
            )}

            {/* ── Seed Start: Tray Info + Interactive Picker ── */}
            {ev.type === 'seed_start' && selectedTray ? (
                <View style={styles.chipExpanded}>
                    <Text style={styles.chipDetail}>🌱 {seedsNeeded} seeds required</Text>

                    {/* Tray selector row — tap to open picker */}
                    <TouchableOpacity
                        onPress={() => setTrayPickerOpen(o => !o)}
                        style={styles.trayPickerRow}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.trayPickerLabel}>
                            {selectedTray.emoji ?? '📦'} {selectedTray.label}
                        </Text>
                        <Text style={styles.trayPickerCaret}>
                            {trayPickerOpen ? '▲' : '▼'}
                        </Text>
                    </TouchableOpacity>

                    {/* Inline dropdown — scrollable, shows 3 options before scrolling */}
                    {trayPickerOpen && (
                        <View style={styles.trayDropdown}>
                            <ScrollView
                                style={styles.trayDropdownScroll}
                                showsVerticalScrollIndicator={true}
                                nestedScrollEnabled={true}
                                keyboardShouldPersistTaps="handled"
                            >
                                {TRAY_OPTIONS.map(opt => {
                                    const isActive = opt.label === selectedTray.label;
                                    return (
                                        <TouchableOpacity
                                            key={opt.label}
                                            onPress={() => { onTrayChange(opt); setTrayPickerOpen(false); }}
                                            style={[styles.trayOption, isActive && styles.trayOptionActive]}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={[styles.trayOptionText, isActive && styles.trayOptionTextActive]}>
                                                {opt.emoji} {opt.label}
                                            </Text>
                                            <Text style={styles.trayOptionNote}>{opt.note}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    )}

                    {computedTraysCount != null && (
                        <Text style={styles.chipDetail}>
                            🔢 sow {computedTraysCount} {computedTraysCount === 1 ? trayUnit : trayUnitPlural}
                        </Text>
                    )}
                </View>
            ) : null}
            
            {/* If Harvest entry, show DTM */}
            {ev.type === 'harvest' && ev.dtm && (
                <Text style={styles.chipExtra}>⏱ {ev.dtm} DTM</Text>
            )}

            {/* Spacing info — direct seed and transplant only */}
            {(ev.type === 'direct_seed' || ev.type === 'transplant') && (() => {
                const crop = cropData.crops?.find(c => c.id === ev.crop_id);
                if (!crop) return null;
                const rows = crop.rows_per_30in_bed;
                const inRow = crop.in_row_spacing_in;
                const rowSpacing = crop.row_spacing_in;
                if (rows == null && inRow == null && rowSpacing == null) return null;
                const parts = [];
                if (rows != null) parts.push(`${rows} rows`);
                if (inRow != null) parts.push(`${inRow}" in-row`);
                if (rowSpacing != null) parts.push(`${rowSpacing}" row-spacing`);
                return (
                    <Text style={styles.chipDetail}>📐 {parts.join(' • ')}</Text>
                );
            })()}
        </View>
    );
}

function WeekSection({ week, traySelections, onTrayChange }) {
    return (
        <View style={styles.weekSection}>
            <Text style={styles.weekLabel}>{week.weekLabel}</Text>
            <View style={styles.chipGrid}>
                {week.events.map((ev, i) => {
                    const trayKey = `${ev.weekKey}||${ev.cropName}||${ev.type}||${ev.cropVariety ?? ''}`;
                    return (
                        <EventChip
                            key={trayKey}
                            ev={ev}
                            selectedTray={traySelections[trayKey] ?? ev.tray ?? null}
                            onTrayChange={(tray) => onTrayChange(trayKey, tray)}
                        />
                    );
                })}
            </View>
        </View>
    );
}

function MonthSection({ month, traySelections, onTrayChange }) {
    return (
        <View style={styles.monthSection}>
            <Text style={[styles.monthLabel, month.isHighlight && { color: '#E65100' }]}>
                {month.isHighlight ? month.monthLabel : month.monthLabel.toUpperCase()}
            </Text>
            <View style={[styles.monthDivider, month.isHighlight && { backgroundColor: '#E65100', opacity: 0.4 }]} />
            {month.weeks.map(w => (
                <WeekSection
                    key={w.weekKey}
                    week={w}
                    traySelections={traySelections}
                    onTrayChange={onTrayChange}
                />
            ))}
        </View>
    );
}

export default function CropCalendarScreen({ navigation, route }) {
    const { farmProfile = {}, planId, bedSuccessions, fromWorkspace } = route?.params ?? {};
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('planting'); // 'planting' | 'harvests'
    // ── Lifted tray selections: keyed by weekKey||cropName||type||variety ──────
    const [traySelections, setTraySelections] = useState({});
    const handleTrayChange = useCallback((key, tray) => {
        setTraySelections(prev => ({ ...prev, [key]: tray }));
    }, []);

    useFocusEffect(useCallback(() => {
        loadAndProcessEvents();
    }, [planId]));

    const loadAndProcessEvents = async () => {
        try {
            let allSuccessionsData = [];

            if (fromWorkspace && bedSuccessions) {
                // Called from generic workspace or older component
                allSuccessionsData = Object.entries(bedSuccessions).map(([bedNum, succs]) => ({
                    blockName: route?.params?.blockName || 'Current Block',
                    bed_number: parseInt(bedNum),
                    successions: succs
                }));
            } else {
                // The intended path via MegaMenuBar. Load all blocks!
                const allBlocks = loadBlocksForPlan(planId);
                const activeBlocks = planId ? allBlocks.filter(b => b.planId === planId) : allBlocks;
                
                for (const block of activeBlocks) {
                    const blockBeds = loadBlockBeds(block.id);
                    if (!blockBeds) continue;
                    
                    for (const [bedNumStr, bedData] of Object.entries(blockBeds)) {
                        if (bedData && Array.isArray(bedData.successions)) {
                            allSuccessionsData.push({
                                blockName: block.name || `Block ${block.id.slice(0, 4)}`,
                                bed_number: parseInt(bedNumStr),
                                successions: bedData.successions
                            });
                        }
                    }
                }
            }

            // Standardize and generate event fragments
            let fullEventsList = [];
            for (const item of allSuccessionsData) {
                // Pass dynamic bedLengthFt into the generator for accurate plant count/seed weight math
                const entries = await generateBedCalendar(item.bed_number, item.successions, farmProfile, item.bedLengthFt || 50);
                
                for (const entry of entries) {
                    const dateObj = parseISO(entry.entry_date);
                    if (!dateObj) continue;
                    
                    const ws = startOfWeek(dateObj);
                    
                    fullEventsList.push({
                        ...entry,
                        date: dateObj,
                        type: entry.plan_entry_type,
                        blockName: item.blockName,
                        weekKey: isoDate(ws),
                        monthKey: `${ws.getFullYear()}-${String(ws.getMonth()).padStart(2, '0')}`,
                        monthLabel: `${MONTH_NAMES[ws.getMonth()]} ${ws.getFullYear()}`,
                        weekLabel: weekLabel(ws),
                        plants: entry.plant_count,
                        cropName: entry.crop_name,
                        cropVariety: entry.crop_variety,
                        dtm: entry.dtm || null,
                        seed_amount_label: entry.seed_amount_label,
                    });
                }
            }

            // Post-process Tray calculations on fullEventsList
            
            fullEventsList.forEach(ev => {
                if (ev.type === 'seed_start') {
                    const dbCrop = cropData.crops?.find(c => c.id === ev.crop_id);
                    if (dbCrop) {
                        ev.tray = recommendTrayFarm(dbCrop);
                        if (ev.plants && ev.tray) ev.traysCount = traysNeeded(ev.plants, ev.tray);
                    }
                }
            });

            // ─ Consolidate same-crop, same-week events into one card ───────────
            fullEventsList = consolidateWeeklyEvents(fullEventsList);

            fullEventsList.sort((a, b) => a.date - b.date);
            setEvents(fullEventsList);
        } catch (e) {
            console.error('CropCalendar load error', e);
        } finally {
            setLoading(false);
        }
    };

    // Filter by active tab BEFORE grouping week/month
    const filteredEvents = events.filter(e => {
        if (activeTab === 'harvests') {
            return e.type === 'harvest';
        } else if (activeTab === 'planting') {
            // Include starting, transplanting, direct sow, and cover crop
            return ['seed_start', 'direct_seed', 'buy_starts', 'transplant', 'cover_crop'].includes(e.type);
        }
        return true; 
    });

    const groupedEvents = groupEvents(filteredEvents);

    return (
        <View style={screenStyles.container}>
            <GlobalNavBar 
                navigation={navigation} 
                farmProfile={farmProfile} 
                planId={planId} 
                activeRoute="CropCalendar" 
                rightAction={
                    Platform.OS === 'web' ? (
                        <TouchableOpacity style={screenStyles.printBtn} onPress={() => window.print()}>
                            <Text style={screenStyles.printBtnText}>🖨️</Text>
                        </TouchableOpacity>
                    ) : null
                }
            />

            {/* In-Page Navigation Tabs */}
            <View style={screenStyles.tabRow}>
                <TouchableOpacity 
                    style={[screenStyles.tabBtn, activeTab === 'planting' && screenStyles.tabBtnActive]} 
                    onPress={() => setActiveTab('planting')}
                >
                    <Text style={[screenStyles.tabText, activeTab === 'planting' && screenStyles.tabTextActive]}>Planting (TP / DS)</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[screenStyles.tabBtn, activeTab === 'harvests' && screenStyles.tabBtnActive]} 
                    onPress={() => setActiveTab('harvests')}
                >
                    <Text style={[screenStyles.tabText, activeTab === 'harvests' && screenStyles.tabTextActive]}>Harvests</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={screenStyles.loadingContainer}>
                    <ActivityIndicator color={Colors.primaryGreen} size="large" />
                    <Text style={screenStyles.loadingText}>Loading timeline events...</Text>
                </View>
            ) : groupedEvents.length === 0 ? (
                <View style={screenStyles.loadingContainer}>
                    <Text style={{ fontSize: 40, marginBottom: 10 }}>🗓</Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: Colors.primaryGreen }}>No Schedule Found</Text>
                    <Text style={screenStyles.loadingText}>Start laying out blocks to populate your timeline.</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                    {/* Banners */}
                    {events.some(e => e.wasRebased) && (
                        <View style={styles.rebaseBanner}>
                            <Text style={styles.rebaseBannerText}>
                                ⏩ Some planting windows were in the past. Dates have been shifted to start today — harvest and succession rounds adjusted accordingly.
                            </Text>
                        </View>
                    )}
                    
                    {events.some(e => e.rescuedViaNursery) && (
                        <View style={styles.nurseryBanner}>
                            <Text style={styles.nurseryBannerText}>
                                🛍 One or more crops can no longer be started from seed because the window has closed before frost. Seed tasks have been replaced with "Buy Starts" timed to your transplant date.
                            </Text>
                        </View>
                    )}

                    {groupedEvents.map(m => (
                        <MonthSection
                            key={m.sectionKey}
                            month={m}
                            traySelections={traySelections}
                            onTrayChange={handleTrayChange}
                        />
                    ))}
                    <View style={{ height: 100 }} />
                </ScrollView>
            )}
        </View>
    );
}

// ─── Shared Styles from ActionCalendar ───
const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.lg,
        paddingBottom: 180,
        ...Platform.select({ web: { maxHeight: '100vh', overflowY: 'scroll' } }) // Fix Expo Web scrolling issue
    },
    monthSection: { marginBottom: Spacing.xl },
    monthLabel: {
        fontSize: Typography.lg,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        letterSpacing: 1.5,
        marginBottom: 5,
    },
    monthDivider: {
        height: 2,
        backgroundColor: Colors.primaryGreen,
        borderRadius: 1,
        marginBottom: Spacing.sm,
        opacity: 0.25,
    },
    weekSection: { marginBottom: Spacing.sm },
    weekLabel: {
        fontSize: Typography.xs,
        fontWeight: Typography.semiBold,
        color: Colors.mutedText,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 5,
        paddingLeft: 2,
    },
    chipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    chip: {
        width: Platform.OS === 'web' ? 'calc(16.66% - 5px)' : '15.5%',
        minWidth: 100, // wider for detailed market text
        borderRadius: 6,
        borderWidth: 1,
        padding: 8,
    },
    chipTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 2,
    },
    chipEmoji: { fontSize: 14 },
    chipType: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        flex: 1,
    },
    chipCrop: {
        fontSize: 13,
        fontWeight: '800',
        lineHeight: 16,
        marginBottom: 4,
    },
    locationBadge: {
        backgroundColor: '#2E7D32',
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        marginBottom: 6,
        marginTop: 2,
    },
    locationText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    chipExtra: {
        fontSize: 15,
        fontWeight: '600',
        color: 'rgba(0,0,0,0.6)',
        marginTop: 2,
    },
    chipVolume: {
        fontSize: 14,
        fontWeight: '500',
        color: '#1565C0',
        fontStyle: 'italic',
        marginTop: 1,
    },
    chipExpanded: { marginTop: 4, gap: 2 },
    chipDetail: { fontSize: 11, fontWeight: '700', color: 'rgba(0,0,0,0.7)' },

    // ── Tray Picker ──────────────────────────────────────────────────────────
    trayPickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
        paddingHorizontal: 6,
        backgroundColor: 'rgba(0,0,0,0.05)',
        borderRadius: 5,
        marginTop: 3,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },
    trayPickerLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(0,0,0,0.75)',
        flex: 1,
    },
    trayPickerCaret: {
        fontSize: 8,
        color: 'rgba(0,0,0,0.4)',
        fontWeight: '900',
        marginLeft: 4,
    },
    trayDropdown: {
        backgroundColor: '#FFFFFF',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(46,125,50,0.2)',
        marginTop: 3,
        overflow: 'hidden',
        ...Platform.select({ web: { boxShadow: '0 4px 16px rgba(0,0,0,0.14)' } }),
    },
    // maxHeight = 3 rows × ~40px each (paddingVertical 6+6 + label ~11px + note ~10px + border ~1px)
    trayDropdownScroll: {
        maxHeight: 120,
    },
    trayOption: {
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.04)',
    },
    trayOptionActive: {
        backgroundColor: '#E8F5E9',
    },
    trayOptionText: {
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(0,0,0,0.72)',
    },
    trayOptionTextActive: {
        fontWeight: '900',
        color: '#2E7D32',
    },
    trayOptionNote: {
        fontSize: 9,
        color: 'rgba(0,0,0,0.38)',
        marginTop: 1,
        fontStyle: 'italic',
    },
    nurseryBadge: {
        backgroundColor: '#EDE7F6',
        borderRadius: 3,
        paddingHorizontal: 4,
        paddingVertical: 2,
        marginBottom: 3,
        alignSelf: 'flex-start',
    },
    nurseryText: { fontSize: 9, color: '#4A0072', fontWeight: '700' },
    rebasedBadge: {
        backgroundColor: '#FFF3CD',
        borderRadius: 3,
        paddingHorizontal: 4,
        paddingVertical: 2,
        marginBottom: 3,
        alignSelf: 'flex-start',
    },
    rebasedText: { fontSize: 13, color: '#856404', fontWeight: '700' },
    consolidatedBadge: {
        backgroundColor: 'rgba(46,125,50,0.12)',
        borderRadius: 3,
        paddingHorizontal: 5,
        paddingVertical: 2,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(46,125,50,0.25)',
    },
    consolidatedText: { fontSize: 9, color: '#2E7D32', fontWeight: '800', letterSpacing: 0.3 },
    rebaseBanner: {
        backgroundColor: '#FFF8E1',
        borderRadius: Radius.sm,
        borderLeftWidth: 3,
        borderLeftColor: '#F9A825',
        paddingVertical: 7,
        paddingHorizontal: 10,
        marginBottom: 6,
    },
    rebaseBannerText: { fontSize: 10, color: '#6D4C00', lineHeight: 15, fontStyle: 'italic' },
    nurseryBanner: {
        backgroundColor: '#F3E5F5',
        borderRadius: Radius.sm,
        borderLeftWidth: 3,
        borderLeftColor: '#6A1B9A',
        paddingVertical: 7,
        paddingHorizontal: 10,
        marginBottom: 16,
    },
    nurseryBannerText: { fontSize: 10, color: '#4A0072', lineHeight: 15, fontStyle: 'italic' },
});

const screenStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundGrey,
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
    tabRow: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen,
        gap: Spacing.sm,
    },
    tabBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    tabBtnActive: {
        backgroundColor: Colors.cream,
    },
    tabText: {
        fontSize: Typography.sm,
        fontWeight: Typography.bold,
        color: 'rgba(255,255,255,0.8)',
    },
    tabTextActive: {
        color: Colors.primaryGreen,
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
});
