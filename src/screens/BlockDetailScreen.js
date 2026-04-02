/**
 * BlockDetailScreen.js
 * ═════════════════════
 * Per-block bed browsing + crop planning:
 *   • E / W side selector (compass orientation)
 *   • Scrollable vertical bed list
 *   • Tap bed → crop detail modal (succession stack, DTM, notes)
 *   • Quick journal entry from any bed
 *   • Edit block / add beds buttons
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Modal, TextInput, Platform, Alert, Animated, Image,
    FlatList, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadBlockBeds, saveBlockBeds, saveJournalEntry, loadJournalEntries, loadPlanCrops } from '../services/persistence';
import { blockSummaryLine } from '../services/farmUtils';
import cropData from '../data/crops.json';
import { getSuccessionCandidatesRanked } from '../services/successionEngine';
import { addDays } from '../services/climateService';
import CROP_IMAGES from '../data/cropImages';
import HomeLogoButton from '../components/HomeLogoButton';

const BLOCK_DETAIL_SCROLL_ID = 'block-detail-scrollview';

// ─── Color helpers (mirrored from BedMapScreen) ───────────────────────────────
const BED_PALETTE = [
    { bg: '#C8E6C9', text: '#1B5E20' }, { bg: '#FFF9C4', text: '#F57F17' },
    { bg: '#FFCCBC', text: '#BF360C' }, { bg: '#B2EBF2', text: '#006064' },
    { bg: '#D7CCC8', text: '#4E342E' }, { bg: '#F8BBD0', text: '#880E4F' },
    { bg: '#DCEDC8', text: '#33691E' }, { bg: '#FFE082', text: '#E65100' },
    { bg: '#B3E5FC', text: '#01579B' }, { bg: '#E1BEE7', text: '#4A148C' },
    { bg: '#F0F4C3', text: '#827717' }, { bg: '#C8F7C5', text: '#145A32' },
    { bg: '#F5CBA7', text: '#784212' }, { bg: '#D5DBDB', text: '#2C3E50' },
    { bg: '#FFDCE5', text: '#880E4F' }, { bg: '#E8D5C4', text: '#5D4037' },
];
function bedColor(bedNum) {
    return BED_PALETTE[(bedNum - 1) % BED_PALETTE.length];
}
function cropMeta(cropId) {
    return cropData.crops.find(c => c.id === cropId);
}

// Shelter extension constants
const SHELTER_EXTENSION = {
    none:       { days: 0,  label: '🌿 Open',       ext: '' },
    rowCover:   { days: 14, label: '☔️ Row Cover',  ext: '+14d' },
    greenhouse: { days: 42, label: '🏡 Greenhouse', ext: '+42d' },
};

function buildShelterProfile(farmProfile, shelterType) {
    if (!farmProfile) return farmProfile;
    const ext = SHELTER_EXTENSION[shelterType]?.days ?? 0;
    if (ext === 0) return farmProfile;
    return {
        ...farmProfile,
        frost_free_days: (farmProfile.frost_free_days ?? 180) + ext * 2,
        last_frost_date: farmProfile.last_frost_date
            ? addDays(farmProfile.last_frost_date, -ext) : farmProfile.last_frost_date,
        first_frost_date: farmProfile.first_frost_date
            ? addDays(farmProfile.first_frost_date, ext) : farmProfile.first_frost_date,
    };
}

function fmtShortDate(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return (d.getMonth() + 1) + '/' + String(d.getDate()).padStart(2, '0');
}

// ─── Bed Row ─────────────────────────────────────────────────────────────────
function cropColor(cropId) {
    if (!cropId) return BED_PALETTE[0];
    let hash = 0; const s = String(cropId);
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) & 0xffff;
    return BED_PALETTE[hash % BED_PALETTE.length];
}
const BedRow = ({ block, bedNum, successions, shelterType, farmProfile, onPress, onLongPress }) => {
    const bc = bedColor(bedNum);
    const hasCrops = successions && successions.length > 0;

    return (
        <TouchableOpacity
            style={[styles.bedRow, { borderLeftColor: bc.text, borderLeftWidth: 3 }]}
            onPress={() => onPress(bedNum)}
            onLongPress={() => onLongPress?.(bedNum)}
            delayLongPress={600}
            activeOpacity={0.78}
        >
            {/* Bed number + shelter badge */}
            <View style={[styles.bedNumBadge, { backgroundColor: bc.bg }]}>
                <Text style={[styles.bedNumText, { color: bc.text }]}>{bedNum}</Text>
                {shelterType && shelterType !== 'none' && (
                    <Text style={styles.shelterBadge}>
                        {shelterType === 'greenhouse' ? '🏡' : '☔️'}
                    </Text>
                )}
            </View>

            {/* Compact crop chips */}
            <View style={styles.bedRowContent}>
                {hasCrops ? (
                    <View style={styles.chipsWrap}>
                        {(() => {
                            const sorted = [...successions].sort((a, b) => (a.start_date || '2099').localeCompare(b.start_date || '2099'));
                            const lanes = [];
                            const laneOf = [];
                            sorted.forEach((s) => {
                                const startStr = s.start_date || '2099-01-01';
                                let assignedLane = -1;
                                for (let i = 0; i < lanes.length; i++) {
                                    // If this crop starts on or after the end of the last crop in the lane
                                    if (startStr >= lanes[i]) {
                                        assignedLane = i;
                                        lanes[i] = s.end_date || '2099-12-31';
                                        break;
                                    }
                                }
                                if (assignedLane === -1) {
                                    assignedLane = lanes.length;
                                    lanes.push(s.end_date || '2099-12-31');
                                }
                                laneOf.push(assignedLane);
                            });

                            const lanesList = Array.from({ length: lanes.length }, () => []);
                            sorted.forEach((s, idx) => {
                                lanesList[laneOf[idx]].push(s);
                            });

                            return lanesList.map((rowItems, rIdx) => (
                                <View key={rIdx} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 2 }}>
                                    {rowItems.map((s, si) => {
                                        const meta = cropMeta(s.crop_id);
                                        const frac = s.coverage ?? s.coverage_fraction ?? 1;
                                        const fracLabel = frac >= 0.99 ? 'Full' : frac >= 0.74 ? '¾' : frac >= 0.49 ? '½' : '¼';
                                        
                                        let igd = null;
                                        if (s.start_date && s.end_date) {
                                            igd = Math.round((new Date(s.end_date + 'T12:00:00') - new Date(s.start_date + 'T12:00:00')) / 86400000);
                                        } else {
                                            igd = (meta?.dtm ?? s.dtm ?? 0) + (meta?.harvest_window_days ?? 14);
                                        }

                                        const startStr = s.start_date ? fmtShortDate(s.start_date) : null;
                                        const endStr   = s.end_date   ? fmtShortDate(s.end_date)   : null;
                                        const dateRange = startStr && endStr ? ` ${startStr}–${endStr}` : startStr ? ` from ${startStr}` : '';
                                        const igdStr   = igd ? ` ${igd}IGD` : '';
                                        const label    = `[${fracLabel}] ${s.crop_name ?? s.name ?? '—'}${igdStr}${dateRange}`;
                                        const cc = cropColor(s.crop_id);
                                        
                                        return (
                                            <View key={si} style={[styles.bedDiagramRow, { backgroundColor: cc.bg }]}>
                                                <Text style={[styles.bedDiagramRowName, { color: cc.text }]}>
                                                    {label}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            ));
                        })()}
                    </View>
                ) : (
                    <Text style={styles.bedEmpty}>Empty — tap to plan</Text>
                )}
            </View>

            <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
    );
};



// ─── Crop Detail Modal ─────────────────────────────────────────────────────────
// Shows crop info AND past field notes for this bed.
const CropDetailModal = ({
    visible, blockId, bedNum, bedLengthFt,
    successions, shelterType = 'none',
    onClose, onSaveNote,
    onAddCrop, onRemoveCrop, onSetShelter,
    isPickerMode = false, onPickCrop,
    selectedCropIds = []
}) => {
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [savedNotes, setSavedNotes] = useState([]);
    const [cropSearch, setCropSearch] = useState('');
    const [pendingCrop, setPendingCrop] = useState(null);

    const filteredCrops = useMemo(() => {
        const q = cropSearch.toLowerCase().trim();
        let list = cropData.crops;
        if (selectedCropIds && selectedCropIds.length > 0) {
            list = list.filter(c => selectedCropIds.includes(c.id));
        }
        return q
            ? list.filter(c => c.name.toLowerCase().includes(q))
            : list;
    }, [cropSearch, selectedCropIds]);

    React.useEffect(() => {
        if (!visible) return;
        setSaved(false);
        setNote('');
        setCropSearch('');
        const bedTag = `${blockId} Bed ${bedNum}`;
        const all = loadJournalEntries();
        setSavedNotes(all.filter(e => e.bedTag === bedTag).slice(0, 5));
    }, [visible, blockId, bedNum]);

    const handleSaveNote = () => {
        if (!note.trim()) return;
        setSaving(true);
        const bedTag = `${blockId} Bed ${bedNum}`;
        const entry = saveJournalEntry({ bedTag, text: note.trim() });
        setSavedNotes(prev => [entry, ...prev].slice(0, 5));
        setSaved(true);
        setNote('');
        setSaving(false);
        onSaveNote?.();
        setTimeout(() => setSaved(false), 2000);
    };

    const SHELTER_OPTS = [
        { key: 'none',       label: '🌿 Open',       },
        { key: 'rowCover',   label: '☔️ Row Cover', },
        { key: 'greenhouse', label: '🏡 Greenhouse', },
    ];

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={modStyles.modalContainer}>
                <TouchableOpacity style={modStyles.backdrop} activeOpacity={1} onPress={onClose} />
                <View style={modStyles.sheet}>
                    <View style={modStyles.handle} />

                    {/* ─── Header ───────────────────────────────────────── */}
                    <Text style={modStyles.titleRow}>
                        Bed {bedNum}
                        <Text style={modStyles.titleSub}> · {bedLengthFt}ft</Text>
                    </Text>

                    {/* ─── Shelter toggle ─────────────────────────────── */}
                    <View style={modStyles.shelterRow}>
                        {SHELTER_OPTS.map(opt => (
                            <TouchableOpacity
                                key={opt.key}
                                style={[modStyles.shelterBtn, shelterType === opt.key && modStyles.shelterBtnActive]}
                                onPress={() => onSetShelter?.(opt.key)}
                            >
                                <Text style={[modStyles.shelterBtnText, shelterType === opt.key && modStyles.shelterBtnTextActive]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* ─── Crop picker (isPickerMode) ─────────────────── */}
                    {isPickerMode ? (
                        <>
                            <Text style={modStyles.noteLabel}>🌱 Choose a Crop</Text>
                            <TextInput
                                style={modStyles.noteInput}
                                value={cropSearch}
                                onChangeText={setCropSearch}
                                placeholder="Search crops…"
                                placeholderTextColor={Colors.mutedText}
                            />
                            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={modStyles.cropGrid}
                                showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                {filteredCrops.map(crop => {
                                    const img = CROP_IMAGES[crop.id];
                                    return (
                                        <TouchableOpacity
                                            key={crop.id}
                                            style={modStyles.cropCard}
                                            onPress={() => setPendingCrop(crop)}
                                        >
                                            {img
                                                ? <Image source={img} style={modStyles.cropImg} resizeMode="cover" />
                                                : <Text style={{ fontSize: 28 }}>{crop.emoji ?? '🌱'}</Text>
                                            }
                                            <Text style={modStyles.cropCardName} numberOfLines={2}>{crop.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    ) : (
                        /* ─── Normal view: successions list + notes ─── */
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}
                            keyboardShouldPersistTaps="handled">

                            {/* Successions */}
                            {(!successions || successions.length === 0) ? (
                                <Text style={modStyles.emptyText}>No crops planned yet for this bed.</Text>
                            ) : (
                                successions.map((s, i) => {
                                    const meta = cropMeta(s.crop_id);
                                    const frac = s.coverage ?? s.coverage_fraction ?? 1;
                                    return (
                                        <View key={i} style={modStyles.successionCard}>
                                            <View style={modStyles.successionHeader}>
                                                <Text style={modStyles.successionEmoji}>{meta?.emoji ?? '🌱'}</Text>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={modStyles.successionName}>{s.crop_name ?? s.name}</Text>
                                                    <Text style={modStyles.successionVariety}>{meta?.variety ?? s.variety ?? ''}</Text>
                                                </View>
                                                {meta?.dtm && <Text style={modStyles.dtmBadge}>{meta.dtm}d</Text>}
                                                {/* Remove button */}
                                                <TouchableOpacity
                                                    style={modStyles.removeBtn}
                                                    onPress={() => onRemoveCrop?.(i)}
                                                >
                                                    <Text style={modStyles.removeBtnText}>✕</Text>
                                                </TouchableOpacity>
                                            </View>

                                            {/* ½ / Full coverage toggle */}
                                            <View style={modStyles.coverageRow}>
                                                <Text style={modStyles.coverageLabel}>Coverage:</Text>
                                                {[{ v: 0.5, l: '½ Bed' }, { v: 1, l: 'Full' }].map(opt => (
                                                    <TouchableOpacity
                                                        key={opt.v}
                                                        style={[modStyles.coverageBtn, Math.abs(frac - opt.v) < 0.1 && modStyles.coverageBtnActive]}
                                                        onPress={() => {
                                                            /* patch coverage inline via remove+re-add trick */
                                                            onRemoveCrop?.(i);
                                                            setTimeout(() => onAddCrop?.({ ...s, coverage: opt.v }), 50);
                                                        }}
                                                    >
                                                        <Text style={[modStyles.coverageBtnText, Math.abs(frac - opt.v) < 0.1 && modStyles.coverageBtnTextActive]}>
                                                            {opt.l}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>

                                            {meta?.harvest_notes && (
                                                <Text style={modStyles.harvestNote}>{meta.harvest_notes}</Text>
                                            )}
                                        </View>
                                    );
                                })
                            )}

                            {/* Add Crop button */}
                            <TouchableOpacity style={modStyles.addCropBtn} onPress={onAddCrop}>
                                <Text style={modStyles.addCropBtnText}>＋ Add Crop</Text>
                            </TouchableOpacity>

                            {/* Past notes */}
                            {savedNotes.length > 0 && (
                                <View style={modStyles.pastNotesSection}>
                                    <Text style={modStyles.noteLabel}>📓 Previous Notes</Text>
                                    {savedNotes.map(n => (
                                        <View key={n.id} style={modStyles.pastNoteCard}>
                                            <Text style={modStyles.pastNoteDate}>
                                                {new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </Text>
                                            <Text style={modStyles.pastNoteText}>{n.text}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    )}

                    {/* Save confirmation banner */}
                    {saved && (
                        <View style={modStyles.savedBanner}>
                            <Text style={modStyles.savedBannerText}>✓ Note saved</Text>
                        </View>
                    )}

                    {/* Quick field note (hidden in picker mode) */}
                    {!isPickerMode && (
                        <View style={modStyles.noteSection}>
                            <Text style={modStyles.noteLabel}>📓 Add Field Note</Text>
                            <TextInput
                                style={modStyles.noteInput}
                                value={note}
                                onChangeText={setNote}
                                placeholder="Observations, pests, weather, soil…"
                                placeholderTextColor={Colors.mutedText}
                                multiline
                                maxLength={400}
                            />
                            <TouchableOpacity
                                style={[modStyles.saveBtn, (!note.trim() || saving) && modStyles.saveBtnDisabled]}
                                onPress={handleSaveNote}
                                disabled={!note.trim() || saving}
                            >
                                <Text style={modStyles.saveBtnText}>Save Note</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <TouchableOpacity style={modStyles.closeBtn} onPress={onClose}>
                        <Text style={modStyles.closeBtnText}>Done</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Contextual Coverage Picker Modal */}
            <Modal
                visible={!!pendingCrop}
                transparent
                animationType="fade"
                onRequestClose={() => setPendingCrop(null)}
            >
                <View style={modStyles.modalContainer}>
                    <View style={[modStyles.sheet, { minHeight: 0, paddingBottom: 24, paddingHorizontal: 20 }]}>
                        <Text style={[modStyles.titleRow, { textAlign: 'center', marginTop: 10 }]}>
                            What bed % should {pendingCrop?.name} fill?
                        </Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, gap: 10 }}>
                            {[
                                { value: 0.25, label: '¼' },
                                { value: 0.5,  label: '½' },
                                { value: 0.75, label: '¾' },
                                { value: 1.0,  label: 'Full' },
                            ].map(f => (
                                <TouchableOpacity
                                    key={f.value}
                                    style={{ flex: 1, paddingVertical: 14, backgroundColor: '#F4F5F0', borderRadius: 8, borderWidth: 1, borderColor: '#D7D6CB', alignItems: 'center' }}
                                    onPress={() => {
                                        const c = pendingCrop;
                                        setPendingCrop(null);
                                        onPickCrop?.({
                                            crop_id: c.id,
                                            crop_name: c.name,
                                            coverage: f.value,
                                            start_date: null, end_date: null,
                                        });
                                    }}
                                >
                                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#1B3B1A' }}>{f.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={{ marginTop: 20, paddingVertical: 12, alignItems: 'center' }} onPress={() => setPendingCrop(null)}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#9CA3AF' }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </Modal>
    );
};

const modStyles = StyleSheet.create({
    modalContainer: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: '#FAFAF7', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 40 },
    handle: { width: 36, height: 4, backgroundColor: 'rgba(45,79,30,0.2)', borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
    titleRow: { fontSize: 20, fontWeight: '800', color: Colors.primaryGreen },
    titleSub: { fontSize: 14, fontWeight: '400', color: Colors.mutedText },

    emptyText: { fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic', paddingVertical: Spacing.md, textAlign: 'center' },

    successionCard: { backgroundColor: 'rgba(45,79,30,0.05)', borderRadius: Radius.sm, padding: Spacing.sm, gap: 4, marginBottom: 6 },
    successionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    successionEmoji: { fontSize: 26 },
    successionName: { fontSize: Typography.sm, fontWeight: '800', color: Colors.primaryGreen },
    successionVariety: { fontSize: Typography.xs, color: Colors.mutedText },
    dtmBadge: { fontSize: Typography.xs, fontWeight: '800', color: Colors.primaryGreen, backgroundColor: 'rgba(45,79,30,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    harvestNote: { fontSize: Typography.xs, color: Colors.darkText, lineHeight: 16 },
    metaLine: { fontSize: Typography.xs, color: Colors.mutedText, lineHeight: 16 },

    noteSection: { gap: Spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.1)', paddingTop: Spacing.sm },
    noteLabel: { fontSize: Typography.xs, fontWeight: '800', color: Colors.primaryGreen, textTransform: 'uppercase', letterSpacing: 0.5 },
    noteInput: { borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)', borderRadius: Radius.sm, padding: 10, fontSize: Typography.sm, color: Colors.darkText, minHeight: 72, textAlignVertical: 'top', backgroundColor: '#FFF' },
    saveBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.sm, paddingVertical: 10, alignItems: 'center' },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: Colors.cream, fontWeight: '800', fontSize: Typography.sm },

    savedBanner: { backgroundColor: '#E8F5E9', borderRadius: Radius.sm, paddingVertical: 8, alignItems: 'center', marginBottom: 4 },
    savedBannerText: { color: '#2e7d32', fontWeight: '800', fontSize: Typography.sm },

    pastNotesSection: { marginTop: Spacing.sm, gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.08)', paddingTop: Spacing.sm },
    pastNoteCard: { backgroundColor: 'rgba(45,79,30,0.04)', borderRadius: Radius.xs, padding: 8, gap: 2 },
    pastNoteDate: { fontSize: 9, color: Colors.mutedText, fontWeight: '700' },
    pastNoteText: { fontSize: Typography.xs, color: Colors.darkText, lineHeight: 16 },

    closeBtn: { borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center' },
    closeBtnText: { fontWeight: '700', color: Colors.mutedText },

    // Shelter row
    shelterRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
    shelterBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)', alignItems: 'center' },
    shelterBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    shelterBtnText: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen },
    shelterBtnTextActive: { color: Colors.cream },

    // Remove crop button
    removeBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(183,28,28,0.1)', alignItems: 'center', justifyContent: 'center' },
    removeBtnText: { fontSize: 11, fontWeight: '800', color: '#B71C1C' },

    // Coverage toggle
    coverageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    coverageLabel: { fontSize: 10, color: Colors.mutedText, fontWeight: '600' },
    coverageBtn: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)' },
    coverageBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    coverageBtnText: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen },
    coverageBtnTextActive: { color: Colors.cream },

    // Add Crop button
    addCropBtn: { marginTop: 8, borderWidth: 1.5, borderColor: Colors.primaryGreen, borderRadius: Radius.sm, paddingVertical: 10, alignItems: 'center' },
    addCropBtnText: { fontSize: Typography.sm, fontWeight: '800', color: Colors.primaryGreen },

    // Crop picker grid
    cropGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
    cropCard: { width: 72, alignItems: 'center', padding: 6, borderRadius: Radius.sm, backgroundColor: 'rgba(45,79,30,0.05)', borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)' },
    cropImg: { width: 48, height: 48, borderRadius: 6, marginBottom: 3 },
    cropCardName: { fontSize: 9, fontWeight: '700', color: Colors.primaryGreen, textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BlockDetailScreen({ navigation, route }) {
    const { block, farmProfile, planId: routePlanId } = route?.params ?? {};
    const planId = routePlanId ?? block?.planId;

    const [selectedCropIds, setSelectedCropIds] = useState([]);
    useFocusEffect(useCallback(() => {
        setSelectedCropIds(loadPlanCrops(planId) ?? []);
    }, [planId]));
    const [side, setSide] = useState('W');
    const [bedData, setBedData] = useState({}); // { [bedNum]: { successions, shelterType } }
    const [modalBed, setModalBed] = useState(null);
    const [pickerBed, setPickerBed] = useState(null);

    const getBedSuccessions = (bedNum) => bedData[bedNum]?.successions ?? [];
    const getBedShelter     = (bedNum) => bedData[bedNum]?.shelterType ?? 'none';

    const handleAddCrop = (bedNum, cropEntry) => {
        setBedData(prev => {
            const existing = prev[bedNum] ?? { successions: [], shelterType: 'none' };
            const updated = { ...prev, [bedNum]: { ...existing, successions: [...existing.successions, cropEntry] } };
            saveBlockBeds(block.id, updated);
            return updated;
        });
    };

    const handleRemoveCrop = (bedNum, idx) => {
        setBedData(prev => {
            const existing = prev[bedNum] ?? { successions: [], shelterType: 'none' };
            const succs = [...existing.successions]; succs.splice(idx, 1);
            const updated = { ...prev, [bedNum]: { ...existing, successions: succs } };
            saveBlockBeds(block.id, updated);
            return updated;
        });
    };

    const handleSetShelter = (bedNum, shelterType) => {
        setBedData(prev => {
            const existing = prev[bedNum] ?? { successions: [], shelterType: 'none' };
            const updated = { ...prev, [bedNum]: { ...existing, shelterType } };
            saveBlockBeds(block.id, updated);
            return updated;
        });
    };


    // Web scroll fix: inject CSS to force max-height + overflow-y on the bed list ScrollView
    useFocusEffect(useCallback(() => {
        if (Platform.OS !== 'web') return;
        const styleId = 'block-detail-scroll-fix';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        // Estimate header (header + summary + side picker) height ~220px
        styleEl.textContent = `
            #${BLOCK_DETAIL_SCROLL_ID} {
                max-height: calc(100dvh - 220px) !important;
                overflow-y: scroll !important;
                -webkit-overflow-scrolling: touch !important;
            }
        `;
        return () => {
            const el = document.getElementById(styleId);
            if (el) el.remove();
        };
    }, []));

    useFocusEffect(useCallback(() => {
        setBedData(loadBlockBeds(block?.id ?? ''));
    }, [block?.id]));

    const bedCount = block?.bedCount ?? 0;
    const half = Math.ceil(bedCount / 2);

    // West side = beds 1..half, East side = beds (half+1)..bedCount
    const westBeds = Array.from({ length: half }, (_, i) => i + 1);
    const eastBeds = Array.from({ length: bedCount - half }, (_, i) => half + i + 1);
    const displayedBeds = side === 'W' ? westBeds : eastBeds;

    const handleLongPress = (bedNum) => {
        // Quick shortcut: long-press opens Field Journal pre-tagged to this bed
        navigation.navigate('FieldJournal', {
            farmProfile,
            initialBedTag: `${block.name} Bed ${bedNum}`,
        });
    };

    if (!block) return null;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <HomeLogoButton navigation={navigation} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>FARM DESIGNER</Text>
                    <Text style={styles.heading}>{block.name}</Text>
                </View>
                <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => navigation.navigate('BlockSetupWizard', { block, farmProfile, planId, selectedCropIds })}
                >
                    <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
            </View>

            {/* Block summary */}
            <View style={styles.summaryBar}>
                {block.familyAssignment && block.familyAssignment !== 'Mixed (no restriction)' && (
                    <Text style={styles.familyLabel}>{block.familyAssignment} — {block.name}</Text>
                )}
                <Text style={styles.summaryText}>{blockSummaryLine(block)}</Text>
                <Text style={styles.summarySubText}>
                    {block.bedWidthFt ?? 2.5}ft × {block.bedLengthFt ?? 100}ft beds
                    {block.bedWidthFt && block.bedLengthFt && block.bedCount
                        ? ` · ${((block.bedCount * (block.bedWidthFt ?? 2.5) * (block.bedLengthFt ?? 100)) / 43560).toFixed(3)} ac`
                        : ''}
                </Text>
            </View>

            {/* E / W side picker */}
            <View style={styles.sideRow}>
                <Text style={styles.sideLabel}>↑ N</Text>
                <View style={styles.sidePicker}>
                    {['W', 'E'].map(s => (
                        <TouchableOpacity
                            key={s}
                            style={[styles.sideBtn, side === s && styles.sideBtnActive]}
                            onPress={() => setSide(s)}
                        >
                            <Text style={[styles.sideBtnText, side === s && styles.sideBtnTextActive]}>
                                {s} Side ({s === 'W' ? westBeds.length : eastBeds.length} beds)
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Bed list */}
            <ScrollView
                nativeID={BLOCK_DETAIL_SCROLL_ID}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40, gap: 8, padding: Spacing.lg }}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
            >
                {displayedBeds.map(bedNum => (
                    <BedRow
                        key={bedNum}
                        block={block}
                        bedNum={bedNum}
                        successions={getBedSuccessions(bedNum)}
                        shelterType={getBedShelter(bedNum)}
                        farmProfile={farmProfile}
                        onPress={num => {
                            navigation.navigate('BedWorkspace', {
                                block,
                                farmProfile,
                                planId,
                                initialBed: num,
                                singleBedMode: true,
                                // Pass existing bed data so BedWorkspaceScreen can
                                // load it from BlockDetail's persistence layer
                                initialBedData: bedData,
                            });
                        }}
                        onLongPress={handleLongPress}
                    />
                ))}
                {displayedBeds.length === 0 && (
                    <Text style={styles.noBedsText}>No beds on {side} side.</Text>
                )}
            </ScrollView>

            {/* Crop detail modal */}
            <CropDetailModal
                visible={modalBed !== null}
                blockId={block.id}
                bedNum={modalBed}
                bedLengthFt={block.bedLengthFt}
                successions={modalBed !== null ? getBedSuccessions(modalBed) : []}
                shelterType={modalBed !== null ? getBedShelter(modalBed) : 'none'}
                onClose={() => setModalBed(null)}
                onSaveNote={() => {}}
                onAddCrop={() => {
                    const bedNum = modalBed;
                    setModalBed(null);
                    setTimeout(() => setPickerBed(bedNum), 300);
                }}
                onRemoveCrop={(idx) => { handleRemoveCrop(modalBed, idx); }}
                onSetShelter={(s) => { if (modalBed !== null) handleSetShelter(modalBed, s); }}
            />

            {/* Crop Picker Modal */}
            {pickerBed !== null && (
                <CropDetailModal
                    visible={true}
                    blockId={block.id}
                    bedNum={pickerBed}
                    bedLengthFt={block.bedLengthFt}
                    successions={[]}
                    shelterType={getBedShelter(pickerBed)}
                    onClose={() => setPickerBed(null)}
                    onSaveNote={() => {}}
                    onAddCrop={() => {}}
                    onRemoveCrop={() => {}}
                    onSetShelter={(s) => handleSetShelter(pickerBed, s)}
                    isPickerMode={true}
                    selectedCropIds={selectedCropIds}
                    onPickCrop={(cropEntry) => { handleAddCrop(pickerBed, cropEntry); setPickerBed(null); }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0EDE6' },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    editBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    editBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.xs },

    summaryBar: { backgroundColor: 'rgba(45,79,30,0.06)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: 2 },
    summaryText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: '700' },
    familyBadge: { fontSize: 9, fontWeight: '700', color: Colors.burntOrange },
    familyLabel: { fontSize: 13, fontWeight: '900', color: Colors.burntOrange ?? '#C0622B', letterSpacing: 0.3 },
    summarySubText: { fontSize: Typography.xs, color: Colors.mutedText, marginTop: 1 },

    sideRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
    sideLabel: { fontSize: 10, fontWeight: '700', color: Colors.mutedText, width: 28 },
    sidePicker: { flex: 1, flexDirection: 'row', gap: 6 },
    sideBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', alignItems: 'center' },
    sideBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    sideBtnText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primaryGreen },
    sideBtnTextActive: { color: Colors.cream },

    coverageStackGroup: { gap: 2, marginBottom: 4 },
    stackDateLabel: { fontSize: 8, fontWeight: '700', color: Colors.mutedText, marginBottom: 1 },
    coverageBarRow: { height: 20, backgroundColor: 'rgba(45,79,30,0.06)', borderRadius: 4, overflow: 'hidden', width: '100%', marginBottom: 2 },
    coverageBarFill: { height: '100%', borderRadius: 4, minWidth: 40, paddingHorizontal: 5, justifyContent: 'center' },
    coverageBarText: { fontSize: 9, fontWeight: '800', lineHeight: 20 },
    shelterBadge: { fontSize: 9, marginTop: 2 },
    seasonStrip: { alignItems: 'flex-end', gap: 2 },
    seasonItem: { fontSize: 9, color: Colors.mutedText },
    seasonLabel: { fontWeight: '800', color: Colors.primaryGreen },
    seasonRemaining: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
    seasonRemainingText: { fontSize: 9, fontWeight: '800' },
    bedRow: {
        backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.md,
        padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    },
    bedNumBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    bedNumText: { fontSize: Typography.sm, fontWeight: '800' },
    bedRowContent: { flex: 1, gap: 3 },
    chipsWrap: { flexDirection: 'column', gap: 4 }, // stacked vertically like Gantt chart
    bedDiagramRow: {
        flexDirection: 'column',
        justifyContent: 'center', alignItems: 'flex-start',
        paddingHorizontal: 8, paddingVertical: 4,
        overflow: 'hidden', borderRadius:Radius.sm ?? 6, 
    },
    bedDiagramRowName: { fontSize: 10, fontWeight: '800', lineHeight: 14 },
    successionChip: {
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: Radius.full ?? 999,
        borderWidth: 1,
    },
    successionChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.1 },
    bedChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    miniChip: { backgroundColor: 'rgba(45,79,30,0.08)', borderRadius: Radius.full, paddingVertical: 2, paddingHorizontal: 7 },
    miniChipText: { fontSize: 9, fontWeight: '700', color: Colors.primaryGreen },
    bedSubtext: { fontSize: 9, color: Colors.mutedText },
    bedSuccessionLine: { fontSize: 9, color: Colors.primaryGreen, fontWeight: '700', lineHeight: 13 },
    bedEmpty: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic' },
    chevron: { fontSize: 18, color: Colors.mutedText },

    noBedsText: { fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic', textAlign: 'center', paddingVertical: 32 },
});

