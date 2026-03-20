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
    Modal, TextInput, Platform, Alert, Animated,
    FlatList, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadBlockBeds, saveBlockBeds, saveJournalEntry, loadJournalEntries } from '../services/persistence';
import { blockSummaryLine } from '../services/farmUtils';
import cropData from '../data/crops.json';
import { getSuccessionCandidatesRanked } from '../services/successionEngine';
import { addDays } from '../services/climateService';
import CROP_IMAGES from '../data/cropImages';

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

    const firstIn = hasCrops ? successions.reduce((m, s) => !s.start_date ? m : (!m || s.start_date < m ? s.start_date : m), null) : null;
    const lastOut = hasCrops ? successions.reduce((m, s) => !s.end_date   ? m : (!m || s.end_date   > m ? s.end_date   : m), null) : null;
    const frostDate = farmProfile?.first_frost_date ?? null;
    const daysRem = (lastOut && frostDate) ? Math.max(0, Math.round((new Date(frostDate) - new Date(lastOut)) / 86400000)) : null;
    const remClr = daysRem === null ? null : daysRem >= 45 ? '#2E7D32' : daysRem >= 15 ? '#E65100' : '#C62828';
    const remBg  = daysRem === null ? null : daysRem >= 45 ? '#E8F5E9' : daysRem >= 15 ? '#FFF3E0' : '#FFEBEE';
    const groups = [];
    const used = new Set();
    if (hasCrops) {
        successions.forEach((s, i) => {
            if (used.has(i)) return;
            const g = [s]; used.add(i);
            successions.forEach((s2, j) => {
                if (i === j || used.has(j) || !s.start_date || !s2.start_date) return;
                if (Math.abs(new Date(s.start_date) - new Date(s2.start_date)) / 86400000 <= 7) { g.push(s2); used.add(j); }
            });
            groups.push(g);
        });
    }

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

            {/* Coverage bars or empty state */}
            <View style={styles.bedRowContent}>
                {hasCrops ? (
                    <>
                        {groups.map((group, gi) => (
                            <View key={gi} style={styles.coverageStackGroup}>
                                {group[0].start_date && (
                                    <Text style={styles.stackDateLabel}>
                                        {fmtShortDate(group[0].start_date)}{group[0].end_date ? ' – ' + fmtShortDate(group[0].end_date) : ''}
                                    </Text>
                                )}
                                {group.map((s, si) => {
                                    const frac = s.coverage ?? s.coverage_fraction ?? 1;
                                    const cc = cropColor(s.crop_id);
                                    const meta = cropMeta(s.crop_id);
                                    return (
                                        <View key={si} style={styles.coverageBarRow}>
                                            <View style={[styles.coverageBarFill, { width: Math.round(frac * 100) + '%', backgroundColor: cc.bg }]}>
                                                <Text style={[styles.coverageBarText, { color: cc.text }]} numberOfLines={1}>
                                                    {meta?.emoji ?? '🌱'} {s.crop_name ?? s.name}{frac < 0.99 ? ' · ' + Math.round(frac * 100) + '%' : ''}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        ))}
                        <Text style={styles.bedSubtext}>
                            {successions.length} crop{successions.length > 1 ? 's' : ''} · {block.bedLengthFt}ft · tap to manage
                        </Text>
                    </>
                ) : (
                    <Text style={styles.bedEmpty}>Empty — tap to plan</Text>
                )}
            </View>

            {/* IN / OUT / remaining strip */}
            {hasCrops && (firstIn || lastOut) && (
                <View style={styles.seasonStrip}>
                    {firstIn && <Text style={styles.seasonItem}><Text style={styles.seasonLabel}>IN </Text>{fmtShortDate(firstIn)}</Text>}
                    {lastOut && <Text style={styles.seasonItem}><Text style={styles.seasonLabel}> OUT </Text>{fmtShortDate(lastOut)}</Text>}
                    {daysRem !== null && (
                        <View style={[styles.seasonRemaining, { backgroundColor: remBg }]}>
                            <Text style={[styles.seasonRemainingText, { color: remClr }]}>
                                {daysRem > 0 ? '🟢 ' + daysRem + 'd' : '🔴 Full'}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
    );
};


// ─── Crop Detail Modal ─────────────────────────────────────────────────────────
// Shows crop info AND past field notes for this bed.
const CropDetailModal = ({ visible, blockId, bedNum, bedLengthFt, successions, onClose, onSaveNote }) => {
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [savedNotes, setSavedNotes] = useState([]);

    // Load existing notes for this specific bed every time the modal opens
    React.useEffect(() => {
        if (!visible) return;
        setSaved(false);
        setNote('');
        const bedTag = `${blockId} Bed ${bedNum}`;
        const all = loadJournalEntries();
        setSavedNotes(all.filter(e => e.bedTag === bedTag).slice(0, 5));
    }, [visible, blockId, bedNum]);

    const handleSaveNote = () => {
        if (!note.trim()) return;
        setSaving(true);
        const bedTag = `${blockId} Bed ${bedNum}`;
        const entry = saveJournalEntry({ bedTag, text: note.trim() });
        // Immediately show the new note in the list
        setSavedNotes(prev => [entry, ...prev].slice(0, 5));
        setSaved(true);
        setNote('');
        setSaving(false);
        onSaveNote?.();
        // Reset confirmation banner after 2s
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            {/* Backdrop and sheet are siblings so the backdrop cannot intercept events inside the sheet */}
            <View style={modStyles.modalContainer}>
                <TouchableOpacity style={modStyles.backdrop} activeOpacity={1} onPress={onClose} />
                <View style={modStyles.sheet}>
                    <View style={modStyles.handle} />
                    <Text style={modStyles.titleRow}>
                        Bed {bedNum}
                        <Text style={modStyles.titleSub}> · {bedLengthFt}ft</Text>
                    </Text>

                    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                        {(!successions || successions.length === 0) ? (
                            <Text style={modStyles.emptyText}>No crops planned yet for this bed.</Text>
                        ) : (
                            successions.map((s, i) => {
                                const meta = cropMeta(s.crop_id);
                                return (
                                    <View key={i} style={modStyles.successionCard}>
                                        <View style={modStyles.successionHeader}>
                                            <Text style={modStyles.successionEmoji}>{meta?.emoji ?? '🌱'}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={modStyles.successionName}>{s.crop_name ?? s.name}</Text>
                                                <Text style={modStyles.successionVariety}>{meta?.variety ?? s.variety ?? ''}</Text>
                                            </View>
                                            {meta?.dtm && <Text style={modStyles.dtmBadge}>{meta.dtm}d</Text>}
                                        </View>
                                        {meta?.harvest_notes && (
                                            <Text style={modStyles.harvestNote}>{meta.harvest_notes}</Text>
                                        )}
                                        {meta?.harvest_frequency && (
                                            <Text style={modStyles.metaLine}>⏱ Harvest Frequency: {meta.harvest_frequency}</Text>
                                        )}
                                        {meta?.harvest_method && (
                                            <Text style={modStyles.metaLine}>✂️ {meta.harvest_method}</Text>
                                        )}
                                    </View>
                                );
                            })
                        )}

                        {/* Past notes for this bed */}
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

                    {/* Save confirmation banner */}
                    {saved && (
                        <View style={modStyles.savedBanner}>
                            <Text style={modStyles.savedBannerText}>✓ Note saved</Text>
                        </View>
                    )}

                    {/* Quick field note */}
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

                    <TouchableOpacity style={modStyles.closeBtn} onPress={onClose}>
                        <Text style={modStyles.closeBtnText}>Done</Text>
                    </TouchableOpacity>
                </View>
            </View>
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
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BlockDetailScreen({ navigation, route }) {
    const { block, farmProfile } = route?.params ?? {};
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
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>FARM DESIGNER</Text>
                    <Text style={styles.heading}>{block.name}</Text>
                </View>
                <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => navigation.navigate('BlockSetupWizard', { block, farmProfile })}
                >
                    <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
            </View>

            {/* Block summary */}
            <View style={styles.summaryBar}>
                <Text style={styles.summaryText}>{blockSummaryLine(block)}</Text>
                {block.familyAssignment && block.familyAssignment !== 'Mixed (no restriction)' && (
                    <Text style={styles.familyBadge}>{block.familyAssignment}</Text>
                )}
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
                            const succs = getBedSuccessions(num);
                            if (succs.length === 0) setPickerBed(num);
                            else setModalBed(num);
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
    bedChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    miniChip: { backgroundColor: 'rgba(45,79,30,0.08)', borderRadius: Radius.full, paddingVertical: 2, paddingHorizontal: 7 },
    miniChipText: { fontSize: 9, fontWeight: '700', color: Colors.primaryGreen },
    bedSubtext: { fontSize: 9, color: Colors.mutedText },
    bedEmpty: { fontSize: Typography.xs, color: Colors.mutedText, fontStyle: 'italic' },
    chevron: { fontSize: 18, color: Colors.mutedText },

    noBedsText: { fontSize: Typography.sm, color: Colors.mutedText, fontStyle: 'italic', textAlign: 'center', paddingVertical: 32 },
});
