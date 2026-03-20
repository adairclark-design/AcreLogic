/**
 * VisualBedLayoutScreen.js
 * ════════════════════════
 * Interactive top-down canvas where you drag, rotate, and assign crops to
 * individual garden beds.
 *
 * Features:
 *   • Add beds (4×8 default, customisable) via toolbar
 *   • Drag beds freely on canvas; snap to 12" grid on release
 *   • Tap/click a bed to select it → rotate (90°), delete, or assign a crop
 *   • Crop picker slides up showing photorealistic images from CROP_IMAGES
 *   • Crop image + name rendered inside each bed rect
 *   • North compass rose + ruler grid dots
 *   • Scroll-wheel zoom + click-drag pan
 *   • Full undo stack (10 steps, Cmd+Z / button)
 *   • Layout saved to localStorage on every change
 *   • Can be launched from BedWorkspaceScreen or GardenSpacePlanner Step 2
 *
 * Web-only canvas: on native, we show an upgrade message.
 */
import React, {
    useEffect, useRef, useState, useCallback, useMemo,
} from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Platform, Modal,
    ScrollView, Image, TextInput, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { saveBedLayout, loadBedLayout } from '../services/persistence';
import { getBadCompanionWarning } from '../services/companionService';
import CompanionAlertBanner from '../components/CompanionAlertBanner';
import CROP_IMAGES from '../data/cropImages';
import CROPS_DATA from '../data/crops.json';

const ALL_CROPS = (CROPS_DATA.crops ?? []).filter(c => c.category !== 'Cover Crop');

// ─── Constants ────────────────────────────────────────────────────────────────
const PX_PER_FT = 8;          // 8 canvas pixels per foot
const MIN_ZOOM  = 0.6;
const MAX_ZOOM  = 4.0;
const UNDO_LIMIT = 10;

// Snap grid presets (feet). User scrolls through these in the sidebar.
const SNAP_PRESETS = [
    { label: '10 ft', ft: 10 },
    { label: '5 ft',  ft: 5  },
    { label: '2 ft',  ft: 2  },
    { label: '1 ft',  ft: 1  },
    { label: '6 in',  ft: 0.5 },
];
const DEFAULT_SNAP_FT = 1;
const SNAP_PX = DEFAULT_SNAP_FT * PX_PER_FT; // 8 px — 1 foot in canvas pixels (used by grid and row-count calculations)

// Dynamic snap helper: rounds val to the nearest multiple of snapFt in canvas pixels
function snapTo(val, snapFt) {
    const snapPx = Math.max(1, snapFt * PX_PER_FT);
    return Math.round(val / snapPx) * snapPx;
}

const BED_DEFAULT_W_FT = 4;
const BED_DEFAULT_H_FT = 8;

const GROUND_COLOR   = '#E8E0D0';
const GRID_COLOR     = 'rgba(45,79,30,0.12)';
const PATH_COLOR     = '#C9B99A';   // access-path strip colour
const BOUNDARY_COLOR = '#2D4F1E';   // space boundary outline
const BED_FILL       = '#D4E9C8';
const BED_STROKE     = '#2D4F1E';
const SELECT_STROKE  = '#F97316';
const TEXT_COLOR     = '#2D4F1E';

// Per-row crop strip colours (up to 8 rows; repeats)
const ROW_COLORS = [
    '#A8D08D', // light green
    '#F4C97D', // golden
    '#F08080', // coral
    '#85C1E9', // sky blue
    '#C39BD3', // lavender
    '#82E0AA', // mint
    '#F0B27A', // peach
    '#AED6F1', // pale blue
];

// Backwards-compat alias at 1-ft granularity (used in initial bed placement only)
function snap(val) { return snapTo(val, DEFAULT_SNAP_FT); }

// ─── Overlap resolver ─────────────────────────────────────────────────────────
// Nudges a moved bed away from any overlapping beds, respecting the minGapFt
// margin and clamping to the space boundary. Returns the resolved { x, y }.
function resolveOverlap(movedId, rawX, rawY, beds, spaceInfo, minGapFt = 1) {
    const movedBed = beds.find(b => b.id === movedId);
    if (!movedBed) return { x: rawX, y: rawY };
    const gapPx = minGapFt * PX_PER_FT;
    let x = rawX, y = rawY;
    const { w: mw, h: mh } = bedPx(movedBed);
    // Clamp to space boundary first
    if (spaceInfo) {
        x = Math.max(0, Math.min(x, spaceInfo.wPx - mw));
        y = Math.max(0, Math.min(y, spaceInfo.hPx - mh));
    }
    // AABB collision + nudge against every other bed
    for (const other of beds) {
        if (other.id === movedId) continue;
        const { w: ow, h: oh } = bedPx(other);
        const ox = other.x ?? 0, oy = other.y ?? 0;
        const overlapX = x < ox + ow + gapPx && x + mw + gapPx > ox;
        const overlapY = y < oy + oh + gapPx && y + mh + gapPx > oy;
        if (!overlapX || !overlapY) continue;
        // Nudge in the axis that requires least movement
        const pushRight = ox + ow + gapPx - x;
        const pushLeft  = x + mw + gapPx - ox;
        const pushDown  = oy + oh + gapPx - y;
        const pushUp    = y + mh + gapPx - oy;
        const minH = Math.min(pushRight, pushLeft);
        const minV = Math.min(pushDown, pushUp);
        if (minH <= minV) {
            x = pushRight <= pushLeft ? ox + ow + gapPx : ox - mw - gapPx;
        } else {
            y = pushDown <= pushUp ? oy + oh + gapPx : oy - mh - gapPx;
        }
        // Re-clamp after nudge
        if (spaceInfo) {
            x = Math.max(0, Math.min(x, spaceInfo.wPx - mw));
            y = Math.max(0, Math.min(y, spaceInfo.hPx - mh));
        }
    }
    return { x, y };
}

function bedPx(bed) {
    return {
        w: (bed.wFt ?? BED_DEFAULT_W_FT) * PX_PER_FT,
        h: (bed.hFt ?? BED_DEFAULT_H_FT) * PX_PER_FT,
    };
}

function roundRect(ctx, x, y, w, h, r = 6) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function makeId() {
    return `bed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
// Cell colour palette (shared by canvas draw + CellGridOverlay)
const CELL_COLORS = [
    '#A8D08D','#F4C97D','#F08080','#85C1E9',
    '#C39BD3','#82E0AA','#F0B27A','#AED6F1',
    '#FFD54F','#CE93D8','#80DEEA','#FFAB91',
];
// Deterministic colour per cropId — same crop always gets same colour
function cropColor(cropId) {
    if (!cropId) return null;
    let h = 0;
    for (let i = 0; i < cropId.length; i++) h = (h * 31 + cropId.charCodeAt(i)) >>> 0;
    return CELL_COLORS[h % CELL_COLORS.length];
}

// ─── Cell-Grid Crop Overlay ───────────────────────────────────────────────────
// Modal that shows a 1ft×1ft grid over the selected bed for crop-cell painting.
function CellGridOverlay({ visible, bed, onAssignCell, onClose }) {
    const [pickingCell, setPickingCell] = useState(null);
    const [search, setSearch] = useState('');
    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return q ? ALL_CROPS.filter(c => c.name.toLowerCase().includes(q)) : ALL_CROPS;
    }, [search]);

    if (!bed) return null;
    const cols  = Math.max(1, Math.round(bed.wFt ?? BED_DEFAULT_W_FT));
    const rows  = Math.max(1, Math.round(bed.hFt ?? BED_DEFAULT_H_FT));
    const cells = bed.cells ?? {};
    const CELL_PX = Math.min(58, Math.floor(280 / Math.max(cols, rows)));

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={cgo.backdrop}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
                <View style={cgo.panel}>
                    <View style={cgo.panelHeader}>
                        <Text style={cgo.panelTitle}>🛏 Bed {bed.label} — {bed.wFt ?? 4}×{bed.hFt ?? 8} ft</Text>
                        <TouchableOpacity onPress={onClose}><Text style={cgo.closeBtn}>×</Text></TouchableOpacity>
                    </View>
                    {pickingCell === null ? (
                        <>
                            <Text style={cgo.hint}>Tap any 1ft×1ft cell to assign a crop · N is top</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <View>
                                        <View style={{ flexDirection: 'row', marginLeft: 24, marginBottom: 2 }}>
                                            {Array.from({ length: cols }, (_, c) => (
                                                <Text key={c} style={[cgo.axisLabel, { width: CELL_PX }]}>{c + 1}′</Text>
                                            ))}
                                        </View>
                                        {Array.from({ length: rows }, (_, r) => (
                                            <View key={r} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                                <Text style={cgo.axisLabel}>{r + 1}′</Text>
                                                {Array.from({ length: cols }, (_, c) => {
                                                    const key   = `${c}_${r}`;
                                                    const cropId = cells[key];
                                                    const crop  = ALL_CROPS.find(x => x.id === cropId);
                                                    const img   = crop ? CROP_IMAGES[crop.id] : null;
                                                    const bg    = cropColor(cropId) ?? '#EEE8DC';
                                                    return (
                                                        <TouchableOpacity
                                                            key={c}
                                                            style={[cgo.cell, { width: CELL_PX, height: CELL_PX, backgroundColor: bg }]}
                                                            onPress={() => { setSearch(''); setPickingCell({ col: c, row: r }); }}
                                                        >
                                                            {img
                                                                ? <Image source={img} style={{ width: CELL_PX - 10, height: CELL_PX - 10, borderRadius: 4 }} resizeMode="cover" />
                                                                : crop ? <Text style={{ fontSize: Math.max(12, CELL_PX / 4) }}>{crop.emoji ?? '🌱'}</Text>
                                                                : null
                                                            }
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            </ScrollView>
                            {Object.keys(cells).length > 0 && (
                                <View style={cgo.legend}>
                                    {[...new Set(Object.values(cells).filter(Boolean))].map(cId => {
                                        const crop = ALL_CROPS.find(x => x.id === cId);
                                        if (!crop) return null;
                                        return (
                                            <View key={cId} style={cgo.legendItem}>
                                                <View style={[cgo.legendSwatch, { backgroundColor: cropColor(cId) }]} />
                                                <Text style={cgo.legendLabel}>{crop.emoji ?? '🌱'} {crop.name}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                                <TouchableOpacity style={cgo.clearBtn} onPress={() => onAssignCell('__clear__', null)}>
                                    <Text style={cgo.clearBtnText}>Clear all</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={cgo.doneBtn} onPress={onClose}>
                                    <Text style={cgo.doneBtnText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <>
                            <TouchableOpacity onPress={() => setPickingCell(null)} style={{ marginBottom: 8 }}>
                                <Text style={{ color: Colors.primaryGreen, fontWeight: '700', fontSize: 14 }}>‹ Back to grid</Text>
                            </TouchableOpacity>
                            <Text style={cgo.panelTitle}>
                                Cell ({pickingCell.col + 1}ft, {pickingCell.row + 1}ft) — pick a crop
                            </Text>
                            <TextInput
                                style={cgo.search} value={search} onChangeText={setSearch}
                                placeholder="Search crops…" placeholderTextColor={Colors.mutedText}
                                clearButtonMode="while-editing"
                            />
                            <ScrollView style={{ flex: 1 }} contentContainerStyle={cgo.cropGrid}>
                                <TouchableOpacity style={cgo.cropCard} onPress={() => { onAssignCell(`${pickingCell.col}_${pickingCell.row}`, null); setPickingCell(null); }}>
                                    <View style={cgo.clearIcon}><Text style={{ fontSize: 26 }}>🚫</Text></View>
                                    <Text style={cgo.cropName}>Clear</Text>
                                </TouchableOpacity>
                                {filtered.map(crop => {
                                    const img    = CROP_IMAGES[crop.id];
                                    const curKey = `${pickingCell.col}_${pickingCell.row}`;
                                    const isSel  = cells[curKey] === crop.id;
                                    return (
                                        <TouchableOpacity
                                            key={crop.id}
                                            style={[cgo.cropCard, isSel && cgo.cropCardSel]}
                                            onPress={() => { onAssignCell(`${pickingCell.col}_${pickingCell.row}`, crop.id); setPickingCell(null); }}
                                        >
                                            {img ? <Image source={img} style={cgo.cropImg} resizeMode="cover" /> : <Text style={{ fontSize: 26 }}>{crop.emoji ?? '🌱'}</Text>}
                                            <Text style={cgo.cropName} numberOfLines={1}>{crop.name}</Text>
                                            {isSel && <View style={cgo.check}><Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>✓</Text></View>}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const cgo = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 12 },
    panel: { backgroundColor: '#FAFAF7', borderRadius: 20, padding: 18, width: '100%', maxWidth: 500, maxHeight: '92%' },
    panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    panelTitle: { fontSize: 15, fontWeight: '800', color: Colors.primaryGreen, flex: 1, marginRight: 8 },
    closeBtn: { fontSize: 26, color: Colors.mutedText, lineHeight: 28 },
    hint: { fontSize: 11, color: Colors.mutedText, marginBottom: 10, fontStyle: 'italic' },
    axisLabel: { width: 24, fontSize: 8, color: Colors.mutedText, textAlign: 'center' },
    cell: { borderWidth: 1, borderColor: 'rgba(45,79,30,0.18)', borderRadius: 4, margin: 1, alignItems: 'center', justifyContent: 'center' },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendSwatch: { width: 10, height: 10, borderRadius: 3 },
    legendLabel: { fontSize: 11, color: Colors.primaryGreen, fontWeight: '600' },
    clearBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#C62828', alignItems: 'center' },
    clearBtnText: { fontSize: 13, fontWeight: '700', color: '#C62828' },
    doneBtn: { flex: 2, padding: 10, borderRadius: 8, backgroundColor: Colors.primaryGreen, alignItems: 'center' },
    doneBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF8F0' },
    search: { borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: 8, padding: 10, fontSize: 14, color: Colors.darkText, marginBottom: 10, backgroundColor: '#FFF' },
    cropGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 20 },
    cropCard: { width: 74, alignItems: 'center', padding: 6, borderRadius: 8, backgroundColor: 'rgba(45,79,30,0.05)', borderWidth: 1.5, borderColor: 'transparent' },
    cropCardSel: { borderColor: Colors.primaryGreen, backgroundColor: 'rgba(45,79,30,0.1)' },
    cropImg: { width: 50, height: 50, borderRadius: 6, marginBottom: 4 },
    clearIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    cropName: { fontSize: 9, fontWeight: '700', color: Colors.primaryGreen, textAlign: 'center' },
    check: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.primaryGreen, alignItems: 'center', justifyContent: 'center' },
});

// ─── Add-Bed Sidebar ──────────────────────────────────────────────────────────
// Fixed left panel on web/tablet with Create Bed form + selected bed actions.
function AddBedSidebar({ onAdd, selectedBed, selectedCount = 1, onRotate, onDelete, onDeleteSelected, onAssignCrops, undoStack, onUndo, snapFt, onSnapChange, minGapFt, onMinGapChange }) {
    const [wFt, setWFt] = useState('4');
    const [hFt, setHFt] = useState('8');
    const [bedOri, setBedOri] = useState('NS');
    const [open, setOpen] = useState(true);

    function handleCreate() {
        const w = parseFloat(wFt) || 4;
        const h = parseFloat(hFt) || 8;
        onAdd({ wFt: Math.max(1, w), hFt: Math.max(1, h), ori: bedOri });
    }

    return (
        <View style={sb.sidebar}>
            <TouchableOpacity style={sb.sectionHeader} onPress={() => setOpen(o => !o)}>
                <Text style={sb.sectionTitle}>＋ Add Bed</Text>
                <Text style={sb.chevron}>{open ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {open && (
                <View style={sb.form}>
                    <Text style={sb.fieldLabel}>Length (ft)</Text>
                    <TextInput
                        style={sb.input}
                        value={hFt}
                        onChangeText={setHFt}
                        keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                        inputMode="decimal"
                        selectTextOnFocus
                        placeholder="e.g. 8"
                        placeholderTextColor="rgba(45,79,30,0.3)"
                    />
                    <Text style={sb.fieldLabel}>Width (ft)</Text>
                    <TextInput
                        style={sb.input}
                        value={wFt}
                        onChangeText={setWFt}
                        keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                        inputMode="decimal"
                        selectTextOnFocus
                        placeholder="e.g. 4"
                        placeholderTextColor="rgba(45,79,30,0.3)"
                    />
                    <Text style={sb.fieldLabel}>Orientation</Text>
                    <View style={sb.segRow}>
                        {['NS', 'EW'].map(opt => (
                            <TouchableOpacity
                                key={opt} style={[sb.segBtn, bedOri === opt && sb.segBtnActive]}
                                onPress={() => setBedOri(opt)}
                            >
                                <Text style={[sb.segBtnTxt, bedOri === opt && sb.segBtnTxtActive]}>
                                    {opt === 'NS' ? '↕ N/S' : '↔ E/W'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TouchableOpacity style={sb.createBtn} onPress={handleCreate}>
                        <Text style={sb.createBtnTxt}>Create</Text>
                    </TouchableOpacity>
                </View>
            )}
            <View style={sb.divider} />
            <Text style={sb.actionsLabel}>
                {selectedCount > 1
                    ? `${selectedCount} beds selected`
                    : selectedBed
                        ? `Bed ${selectedBed.label} — ${selectedBed.wFt ?? 4}×${selectedBed.hFt ?? 8}ft`
                        : 'Select a bed'}
            </Text>
            {selectedCount > 1 ? (
                <TouchableOpacity style={[sb.actionBtn, sb.delBtn]} onPress={onDeleteSelected}>
                    <Text style={[sb.actionTxt, { color: '#C62828' }]}>🗑 Delete {selectedCount} Beds</Text>
                </TouchableOpacity>
            ) : (
                <>
                    <TouchableOpacity style={[sb.actionBtn, !selectedBed && sb.dim]} onPress={onAssignCrops} disabled={!selectedBed}>
                        <Text style={sb.actionTxt}>🌱 Assign Crops</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[sb.actionBtn, !selectedBed && sb.dim]} onPress={onRotate} disabled={!selectedBed}>
                        <Text style={sb.actionTxt}>↻ Rotate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[sb.actionBtn, sb.delBtn, !selectedBed && sb.dim]} onPress={onDelete} disabled={!selectedBed}>
                        <Text style={[sb.actionTxt, { color: '#C62828' }]}>🗑 Delete</Text>
                    </TouchableOpacity>
                </>
            )}
            <View style={sb.divider} />
            <TouchableOpacity style={[sb.actionBtn, !undoStack.length && sb.dim]} onPress={onUndo} disabled={!undoStack.length}>
                <Text style={sb.actionTxt}>↩ Undo</Text>
            </TouchableOpacity>
            <View style={sb.divider} />
            {/* Snap grid picker */}
            <Text style={sb.fieldLabel}>Snap Grid</Text>
            <View style={sb.snapRow}>
                {SNAP_PRESETS.map(p => (
                    <TouchableOpacity
                        key={p.ft}
                        style={[sb.snapBtn, snapFt === p.ft && sb.snapBtnActive]}
                        onPress={() => onSnapChange(p.ft)}
                    >
                        <Text style={[sb.snapBtnTxt, snapFt === p.ft && sb.snapBtnTxtActive]}>
                            {p.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            {/* Min spacing picker */}
            <View style={sb.divider} />
            <Text style={sb.fieldLabel}>Min. Spacing</Text>
            <View style={sb.snapRow}>
                {[0, 0.5, 1, 2, 4].map(v => (
                    <TouchableOpacity
                        key={v}
                        style={[sb.snapBtn, minGapFt === v && sb.snapBtnActive]}
                        onPress={() => onMinGapChange(v)}
                    >
                        <Text style={[sb.snapBtnTxt, minGapFt === v && sb.snapBtnTxtActive]}>
                            {v === 0 ? 'None' : v < 1 ? '6in' : `${v}ft`}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={[sb.fieldLabel, { fontSize: 8, marginTop: 2 }]}>
                ↑↓←→ nudge · Del delete · ⇧+click multi
            </Text>
        </View>
    );
}

const sb = StyleSheet.create({
    sidebar: { width: 176, backgroundColor: '#FAFAF7', borderRightWidth: 1, borderRightColor: 'rgba(45,79,30,0.12)', paddingVertical: 12, paddingHorizontal: 10, gap: 6 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: Colors.primaryGreen },
    chevron: { fontSize: 10, color: Colors.mutedText },
    form: { gap: 6 },
    fieldLabel: { fontSize: 9, fontWeight: '700', color: Colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: 6, padding: 8, fontSize: 16, fontWeight: '700', color: Colors.primaryGreen, textAlign: 'center', backgroundColor: '#FFF' },
    segRow: { flexDirection: 'row', gap: 4 },
    segBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', alignItems: 'center' },
    segBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    segBtnTxt: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen },
    segBtnTxtActive: { color: '#FFF8F0' },
    createBtn: { backgroundColor: Colors.primaryGreen, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 2 },
    createBtnTxt: { color: '#FFF8F0', fontWeight: '800', fontSize: 13 },
    divider: { height: 1, backgroundColor: 'rgba(45,79,30,0.1)', marginVertical: 4 },
    actionsLabel: { fontSize: 10, fontWeight: '700', color: Colors.mutedText, lineHeight: 14 },
    actionBtn: { paddingVertical: 9, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(45,79,30,0.06)', alignItems: 'center' },
    delBtn: { backgroundColor: 'rgba(183,28,28,0.06)' },
    actionTxt: { fontSize: 12, fontWeight: '700', color: Colors.primaryGreen },
    dim: { opacity: 0.3 },
    // Snap grid picker
    snapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    snapBtn: { paddingVertical: 4, paddingHorizontal: 5, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', backgroundColor: '#F7F5F0' },
    snapBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    snapBtnTxt: { fontSize: 9, fontWeight: '700', color: Colors.primaryGreen },
    snapBtnTxtActive: { color: '#FFF8F0' },
});

// ─── Crop picker ──────────────────────────────────────────────────────────────
// conflictCropIds: set of cropIds already planted in OTHER beds (for badge display)
function CropPickerModal({ visible, onSelect, onClose, currentCropId, conflictCropIds = new Set() }) {
    const [search, setSearch] = useState('');
    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return q ? ALL_CROPS.filter(c => c.name.toLowerCase().includes(q)) : ALL_CROPS;
    }, [search]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={picker.overlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
                <View style={picker.sheet}>
                    <View style={picker.handle} />
                    <Text style={picker.title}>🌱 Assign Crop to Bed</Text>
                    <TextInput
                        style={picker.search}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search crops…"
                        placeholderTextColor={Colors.mutedText}
                        clearButtonMode="while-editing"
                    />
                    <ScrollView style={picker.scroll} contentContainerStyle={picker.grid} showsVerticalScrollIndicator={false}>
                        {/* Clear option */}
                        <TouchableOpacity style={[picker.cropCard, !currentCropId && picker.cropCardSelected]} onPress={() => onSelect(null)}>
                            <View style={picker.clearIcon}><Text style={{ fontSize: 28 }}>🚫</Text></View>
                            <Text style={picker.cropName} numberOfLines={1}>None</Text>
                        </TouchableOpacity>
                        {filtered.map(crop => {
                            const img = CROP_IMAGES[crop.id];
                            const isSelected = crop.id === currentCropId;
                            const hasConflict = conflictCropIds.has(crop.id)
                                ? false // same crop, no cross-check needed
                                : Array.from(conflictCropIds).some(otherId => getBadCompanionWarning(crop.id, otherId));
                            return (
                                <TouchableOpacity
                                    key={crop.id}
                                    style={[
                                        picker.cropCard,
                                        isSelected && picker.cropCardSelected,
                                        hasConflict && picker.cropCardConflict,
                                    ]}
                                    onPress={() => onSelect(crop.id)}
                                >
                                    {img
                                        ? <Image source={img} style={picker.cropImg} resizeMode="cover" />
                                        : <Text style={{ fontSize: 28 }}>{crop.emoji ?? '🌱'}</Text>
                                    }
                                    <Text style={picker.cropName} numberOfLines={1}>{crop.name}</Text>
                                    {isSelected && <View style={picker.checkBadge}><Text style={picker.checkText}>✓</Text></View>}
                                    {hasConflict && !isSelected && (
                                        <View style={picker.conflictBadge}>
                                            <Text style={picker.conflictBadgeText}>⚠️</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─── Row Assignment Sheet ─────────────────────────────────────────────────────
// Shows all rows within a selected bed; lets user assign a different crop to each.
function BedRowSheet({ visible, bed, onAssignRow, onClose, allCropIds }) {
    const [pickingRow, setPickingRow] = useState(null); // index of row being assigned
    const [search, setSearch] = useState('');
    const rows = bed?.rows ?? [];
    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return q ? ALL_CROPS.filter(c => c.name.toLowerCase().includes(q)) : ALL_CROPS;
    }, [search]);

    if (!bed) return null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={rowSheet.overlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
                <View style={rowSheet.sheet}>
                    <View style={rowSheet.handle} />
                    {pickingRow === null ? (
                        // ── Row list view ─────────────────────────────────────
                        <>
                            <Text style={rowSheet.title}>🛏 Bed {bed.label} — {bed.wFt ?? 4}×{bed.hFt ?? 8} ft</Text>
                            <Text style={rowSheet.sub}>Assign a crop to each planting row</Text>
                            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                                {rows.map((cropId, idx) => {
                                    const crop = ALL_CROPS.find(c => c.id === cropId);
                                    const img  = crop ? CROP_IMAGES[crop.id] : null;
                                    return (
                                        <TouchableOpacity
                                            key={idx}
                                            style={rowSheet.rowItem}
                                            onPress={() => { setSearch(''); setPickingRow(idx); }}
                                        >
                                            <View style={[rowSheet.rowSwatch, { backgroundColor: ROW_COLORS[idx % ROW_COLORS.length] }]} />
                                            <Text style={rowSheet.rowLabel}>Row {idx + 1}</Text>
                                            {crop ? (
                                                <>
                                                    {img
                                                        ? <Image source={img} style={rowSheet.rowImg} />
                                                        : <Text style={{ fontSize: 18 }}>{crop.emoji ?? '🌱'}</Text>
                                                    }
                                                    <Text style={rowSheet.rowCrop} numberOfLines={1}>{crop.name}</Text>
                                                </>
                                            ) : (
                                                <Text style={[rowSheet.rowCrop, { color: Colors.mutedText }]}>— empty —</Text>
                                            )}
                                            <Text style={rowSheet.rowEdit}>›</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                            <TouchableOpacity style={rowSheet.doneBtn} onPress={onClose}>
                                <Text style={rowSheet.doneBtnText}>Done</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        // ── Crop picker for a specific row ────────────────────
                        <>
                            <TouchableOpacity onPress={() => setPickingRow(null)} style={{ marginBottom: 8 }}>
                                <Text style={{ color: Colors.primaryGreen, fontWeight: '700', fontSize: 14 }}>‹ Back to rows</Text>
                            </TouchableOpacity>
                            <Text style={rowSheet.title}>Row {pickingRow + 1} — choose a crop</Text>
                            <TextInput
                                style={rowSheet.search}
                                value={search}
                                onChangeText={setSearch}
                                placeholder="Search crops…"
                                placeholderTextColor={Colors.mutedText}
                                clearButtonMode="while-editing"
                            />
                            <ScrollView style={rowSheet.scroll} contentContainerStyle={rowSheet.grid} showsVerticalScrollIndicator={false}>
                                <TouchableOpacity style={rowSheet.cropCard} onPress={() => { onAssignRow(pickingRow, null); setPickingRow(null); }}>
                                    <View style={rowSheet.clearIcon}><Text style={{ fontSize: 28 }}>🚫</Text></View>
                                    <Text style={rowSheet.cropName}>None</Text>
                                </TouchableOpacity>
                                {filtered.map(crop => {
                                    const img = CROP_IMAGES[crop.id];
                                    const isSel = crop.id === rows[pickingRow];
                                    return (
                                        <TouchableOpacity
                                            key={crop.id}
                                            style={[rowSheet.cropCard, isSel && rowSheet.cropCardSelected]}
                                            onPress={() => { onAssignRow(pickingRow, crop.id); setPickingRow(null); }}
                                        >
                                            {img
                                                ? <Image source={img} style={rowSheet.cropImg} resizeMode="cover" />
                                                : <Text style={{ fontSize: 28 }}>{crop.emoji ?? '🌱'}</Text>
                                            }
                                            <Text style={rowSheet.cropName} numberOfLines={1}>{crop.name}</Text>
                                            {isSel && <View style={rowSheet.checkBadge}><Text style={rowSheet.checkText}>✓</Text></View>}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ─── Add-bed panel ────────────────────────────────────────────────────────────
function AddBedSheet({ visible, onAdd, onClose }) {
    const [wFt, setWFt] = useState('4');
    const [hFt, setHFt] = useState('8');
    const PRESETS = [{ w: 4, h: 8 }, { w: 4, h: 12 }, { w: 4, h: 16 }, { w: 3, h: 6 }, { w: 2, h: 8 }];
    const handleAdd = () => {
        const w = parseFloat(wFt) || 4;
        const h = parseFloat(hFt) || 8;
        onAdd({ wFt: Math.max(1, w), hFt: Math.max(1, h) });
        onClose();
    };
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={addSheet.overlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
                <View style={addSheet.sheet}>
                    <View style={addSheet.handle} />
                    <Text style={addSheet.title}>Add Garden Bed</Text>
                    <Text style={addSheet.sub}>Choose a preset or set custom dimensions (feet)</Text>
                    <View style={addSheet.presets}>
                        {PRESETS.map(p => (
                            <TouchableOpacity
                                key={`${p.w}x${p.h}`}
                                style={addSheet.preset}
                                onPress={() => { setWFt(String(p.w)); setHFt(String(p.h)); }}
                            >
                                <Text style={addSheet.presetText}>{p.w}×{p.h} ft</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={addSheet.dimRow}>
                        <View style={addSheet.dimField}>
                            <Text style={addSheet.dimLabel}>Width (ft)</Text>
                            <TextInput style={addSheet.dimInput} value={wFt} onChangeText={setWFt} keyboardType="decimal-pad" selectTextOnFocus />
                        </View>
                        <Text style={addSheet.dimX}>×</Text>
                        <View style={addSheet.dimField}>
                            <Text style={addSheet.dimLabel}>Length (ft)</Text>
                            <TextInput style={addSheet.dimInput} value={hFt} onChangeText={setHFt} keyboardType="decimal-pad" selectTextOnFocus />
                        </View>
                    </View>
                    <TouchableOpacity style={addSheet.addBtn} onPress={handleAdd}>
                        <Text style={addSheet.addBtnText}>+ Add Bed to Canvas</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// ─── Main Canvas Component ────────────────────────────────────────────────────
function BedLayoutCanvas({ beds, selectedIds, onBedDrop, onBedClick, width, height, spaceInfo, snapFt, minGapFt = 1 }) {
    const canvasRef = useRef(null);
    const stateRef  = useRef({
        beds,
        selectedIds: selectedIds ?? [],
        zoom: 1,
        pan: { x: 20, y: 20 },
        drag: null,
        panning: false,
        panStart: null,
        cropImages: {},
        spaceInfo: spaceInfo ?? null,
        snapFt: (snapFt !== undefined && snapFt !== null) ? snapFt : DEFAULT_SNAP_FT,
        minGapFt: minGapFt ?? 1,
    });

    // ── Sync props into stateRef ───────────────────────────────────────────────
    useEffect(() => {
        stateRef.current.beds = beds;
        stateRef.current.selectedIds = selectedIds ?? [];
        stateRef.current.spaceInfo = spaceInfo ?? null;
        stateRef.current.snapFt = (snapFt !== undefined && snapFt !== null) ? snapFt : DEFAULT_SNAP_FT;
        stateRef.current.minGapFt = minGapFt ?? 1;
        // Auto-fit: lock zoom+pan so the boundary fills the canvas
        const si = stateRef.current.spaceInfo;
        if (si && si.wPx > 0 && si.hPx > 0 && width > 0 && height > 0) {
            const PAD = 28;
            const scaleX = (width  - PAD * 2) / si.wPx;
            const scaleY = (height - PAD * 2) / si.hPx;
            const z = Math.min(scaleX, scaleY);
            stateRef.current.zoom = z;
            stateRef.current.pan  = {
                x: (width  - si.wPx * z) / 2,
                y: (height - si.hPx * z) / 2,
            };
        }
        redraw();
    }, [beds, selectedIds, spaceInfo, snapFt, minGapFt, width, height]);

    // ── Draw ──────────────────────────────────────────────────────────────────
    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { zoom, pan, beds: bs, selectedIds: selIdsArr, spaceInfo: si } = stateRef.current;
        const selIdSet = new Set(selIdsArr);

        ctx.clearRect(0, 0, width, height);

        // Ground
        ctx.fillStyle = GROUND_COLOR;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        // ── Space boundary + access path strips ───────────────────────────────
        if (si) {
            const { wPx, hPx, pathStrips } = si;

            // Outer space (slightly lighter ground)
            ctx.fillStyle = '#EDE4D0';
            ctx.fillRect(0, 0, wPx, hPx);

            // Access path strips (rendered as darker soil)
            ctx.fillStyle = PATH_COLOR;
            for (const s of (pathStrips ?? [])) {
                ctx.fillRect(s.x, s.y, s.w, s.h);
            }

            // Dashed boundary outline
            ctx.strokeStyle = BOUNDARY_COLOR;
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([8 / zoom, 4 / zoom]);
            ctx.strokeRect(0, 0, wPx, hPx);
            ctx.setLineDash([]);

            // Boundary label
            ctx.fillStyle = 'rgba(45,79,30,0.5)';
            ctx.font = `bold ${Math.max(8, 11 / zoom)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(si.label ?? '', 4 / zoom, hPx - 4 / zoom);
        }

        // Grid dots
        ctx.fillStyle = GRID_COLOR;
        const gs = SNAP_PX;
        const gStep = Math.max(gs, gs * Math.round(12 / zoom));
        const sx = Math.floor(-pan.x / zoom / gStep) * gStep - gStep;
        const sy = Math.floor(-pan.y / zoom / gStep) * gStep - gStep;
        const ex = sx + width / zoom + gStep * 2;
        const ey = sy + height / zoom + gStep * 2;
        for (let x = sx; x < ex; x += gStep) {
            for (let y = sy; y < ey; y += gStep) {
                ctx.beginPath();
                ctx.arc(x, y, 1.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw each bed
        for (const bed of bs) {
            const { w, h } = bedPx(bed);
            const isSelected = selIdSet.has(bed.id);
            const cx = bed.x ?? 60;
            const cy = bed.y ?? 60;

            ctx.save();
            ctx.translate(cx + w / 2, cy + h / 2);
            ctx.rotate(((bed.rotation ?? 0) * Math.PI) / 180);
            ctx.translate(-w / 2, -h / 2);

            // Shadow
            ctx.shadowColor = isSelected ? 'rgba(249,115,22,0.35)' : 'rgba(45,79,30,0.2)';
            ctx.shadowBlur = isSelected ? 14 : 8;
            ctx.shadowOffsetY = 3;

            // Body
            ctx.fillStyle = BED_FILL;
            roundRect(ctx, 0, 0, w, h, 8);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // ── Cell-grid crop draw (bed.cells{} model) ───────────────────────
            const cells  = bed.cells ?? {};
            const cellKeys = Object.keys(cells).filter(k => cells[k]);
            const cols   = Math.max(1, Math.round(bed.wFt ?? BED_DEFAULT_W_FT));
            const rowsFt = Math.max(1, Math.round(bed.hFt ?? BED_DEFAULT_H_FT));
            const cellW  = w / cols;
            const cellH  = h / rowsFt;

            if (cellKeys.length > 0) {
                // Draw every painted cell
                for (const key of cellKeys) {
                    const [c, r] = key.split('_').map(Number);
                    const cropId = cells[key];
                    const color  = cropColor(cropId);
                    if (!color) continue;
                    ctx.fillStyle = color + 'CC';
                    ctx.fillRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
                    const crop = ALL_CROPS.find(x => x.id === cropId);
                    if (crop) {
                        ctx.fillStyle = TEXT_COLOR;
                        ctx.font = `${Math.max(6, Math.min(9, cellH / 2.5))}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${crop.emoji ?? '🌱'}`, c * cellW + cellW / 2, r * cellH + cellH / 2);
                    }
                }
            } else {
                // Fallback: show dimension label for empty beds
                ctx.fillStyle = 'rgba(45,79,30,0.4)';
                ctx.font = `${Math.max(9, Math.min(12, w / 5))}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${bed.wFt ?? 4}×${bed.hFt ?? 8}ft`, w / 2, h / 2);
            }

            // Planting row divider lines
            ctx.strokeStyle = 'rgba(45,79,30,0.18)';
            ctx.lineWidth = 1;
            const lineRows = Math.floor(h / SNAP_PX);
            for (let r = 1; r < lineRows; r++) {
                const ry = r * SNAP_PX;
                ctx.beginPath();
                ctx.moveTo(4, ry);
                ctx.lineTo(w - 4, ry);
                ctx.stroke();
            }

            // Border
            ctx.strokeStyle = isSelected ? SELECT_STROKE : BED_STROKE;
            ctx.lineWidth = isSelected ? 3 : 2;
            roundRect(ctx, 0, 0, w, h, 8);
            ctx.stroke();

            // Bed number badge
            ctx.fillStyle = isSelected ? SELECT_STROKE : BED_STROKE;
            ctx.beginPath();
            ctx.arc(14, 14, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(bed.label ?? '?'), 14, 14);

            ctx.restore();
        }

        // North compass rose (top-right, screen-space)
        drawCompass(ctx, width - 50, 50, zoom);
        // Scale ruler (bottom-left, screen-space)
        drawRuler(ctx, width, height, zoom);

        ctx.restore();
    }, [width, height]);

    function drawCompass(ctx, x, y, zoom) {
        // Draw in screen space (fixed position)
        const r = 20;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to screen coords
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = BED_STROKE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Arrow up = North
        ctx.fillStyle = BED_STROKE;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x - 5, y + 2);
        ctx.lineTo(x, y - 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(45,79,30,0.3)';
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.lineTo(x + 5, y - 2);
        ctx.lineTo(x, y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = BED_STROKE;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('N', x, y - r - 14);
        ctx.restore();
    }

    function drawRuler(ctx, canvasW, canvasH, zoom) {
        // Pick a round ruler length that represents a sensible real-world distance
        const targetPx = 80; // target pixel width of the bar
        const ftOptions = [1, 2, 5, 10, 20, 25, 50];
        let rulerFt = ftOptions[0];
        for (const f of ftOptions) {
            if (f * PX_PER_FT * zoom <= targetPx) rulerFt = f;
        }
        const barPx = rulerFt * PX_PER_FT * zoom;
        const bx = 16, by = canvasH - 30;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Background pill
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.roundRect(bx - 6, by - 8, barPx + 36, 24, 6);
        ctx.fill();
        // Ruler bar
        ctx.strokeStyle = BED_STROKE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by + 4); ctx.lineTo(bx, by);
        ctx.lineTo(bx + barPx, by);
        ctx.lineTo(bx + barPx, by + 4);
        ctx.stroke();
        // Label
        ctx.fillStyle = BED_STROKE;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${rulerFt} ft`, bx + barPx + 5, by - 3);
        ctx.restore();
    }

    // ── Hit test: returns bed at canvas coords (before zoom/pan) ──────────────
    function hitTest(cx, cy) {
        const { beds: bs, zoom, pan } = stateRef.current;
        const wx = (cx - pan.x) / zoom;
        const wy = (cy - pan.y) / zoom;
        // Iterate in reverse so top-rendered bed gets priority
        for (let i = bs.length - 1; i >= 0; i--) {
            const bed = bs[i];
            const { w, h } = bedPx(bed);
            const bx = bed.x ?? 60;
            const by = bed.y ?? 60;
            // Rotate point into bed-local space
            const angle = -((bed.rotation ?? 0) * Math.PI) / 180;
            const cx2 = bx + w / 2;
            const cy2 = by + h / 2;
            const dx = wx - cx2;
            const dy = wy - cy2;
            const rx = dx * Math.cos(angle) - dy * Math.sin(angle) + w / 2;
            const ry = dx * Math.sin(angle) + dy * Math.cos(angle) + h / 2;
            if (rx >= 0 && rx <= w && ry >= 0 && ry <= h) return bed;
        }
        return null;
    }

    // ── Preload crop images on bed list change ─────────────────────────────────
    useEffect(() => {
        const st = stateRef.current;
        for (const bed of beds) {
            if (bed.cropId && !st.cropImages[bed.cropId]) {
                const src = CROP_IMAGES[bed.cropId];
                if (src) {
                    const img = new window.Image();
                    img.onload = () => {
                        st.cropImages[bed.cropId] = img;
                        redraw();
                    };
                    // Expo asset: resolve source uri
                    img.src = typeof src === 'number'
                        ? undefined // bundled require — can't easily get URI, use emoji fallback
                        : (src?.uri ?? src);
                    if (!img.src) delete st.cropImages[bed.cropId];
                }
            }
        }
    }, [beds]);

    // ── Mouse / touch events ──────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || Platform.OS !== 'web') return;

        let clickStart = { x: 0, y: 0, t: 0 };

        function toCanvas(e) {
            const rect = canvas.getBoundingClientRect();
            const src = e.touches ? e.touches[0] : e;
            return { x: src.clientX - rect.left, y: src.clientY - rect.top };
        }

        function onDown(e) {
            const pos = toCanvas(e);
            clickStart = { x: pos.x, y: pos.y, t: Date.now() };
            // Steal focus from sidebar inputs so keyboard Delete/arrow shortcuts work
            canvasRef.current?.focus();
            const st = stateRef.current;
            const hit = hitTest(pos.x, pos.y);
            if (hit) {
                st.drag = {
                    bedId: hit.id,
                    startX: pos.x,
                    startY: pos.y,
                    origX: hit.x ?? 60,
                    origY: hit.y ?? 60,
                };
            }
        }

        function onMove(e) {
            const pos = toCanvas(e);
            const st = stateRef.current;
            if (st.drag) {
                const dx = pos.x - st.drag.startX;
                const dy = pos.y - st.drag.startY;
                const newX = st.drag.origX + dx / st.zoom;
                const newY = st.drag.origY + dy / st.zoom;
                // Optimistic local update for smooth drag
                const bed = st.beds.find(b => b.id === st.drag.bedId);
                if (bed) { bed.x = newX; bed.y = newY; }
                redraw();
            }
        }

        function onUp(e) {
            const pos = toCanvas(e);
            const st = stateRef.current;
            if (st.drag) {
                const dx = pos.x - st.drag.startX;
                const dy = pos.y - st.drag.startY;
                const moved = Math.sqrt(dx * dx + dy * dy) > 4;
                if (moved) {
                    let rawX = st.drag.origX + dx / st.zoom;
                    let rawY = st.drag.origY + dy / st.zoom;
                    // ── Clamp to space boundary ───────────────────────────────
                    if (st.spaceInfo) {
                        const bed = st.beds.find(b => b.id === st.drag.bedId);
                        if (bed) {
                            const { w, h } = bedPx(bed);
                            rawX = Math.max(0, Math.min(rawX, st.spaceInfo.wPx - w));
                            rawY = Math.max(0, Math.min(rawY, st.spaceInfo.hPx - h));
                        }
                    }
                    const snappedX = snapTo(rawX, st.snapFt);
                    const snappedY = snapTo(rawY, st.snapFt);
                    // ── Resolve overlaps with other beds ─────────────────────
                    const resolved = resolveOverlap(st.drag.bedId, snappedX, snappedY, st.beds, st.spaceInfo, st.minGapFt);
                    onBedDrop(st.drag.bedId, resolved.x, resolved.y);
                } else {
                    onBedClick(st.drag.bedId, e.shiftKey || false);
                }
                st.drag = null;
            } else {
                // Click on empty canvas — deselect
                const dt  = Date.now() - clickStart.t;
                const ddx = pos.x - clickStart.x;
                const ddy = pos.y - clickStart.y;
                if (dt < 250 && Math.sqrt(ddx * ddx + ddy * ddy) < 5) {
                    onBedClick(null, false);
                }
            }
        }

        // Zoom/pan intentionally removed — canvas uses auto-fit (static viewport)

        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseup', onUp);
        canvas.addEventListener('touchstart', onDown, { passive: true });
        canvas.addEventListener('touchmove', onMove, { passive: true });
        canvas.addEventListener('touchend', onUp);

        return () => {
            canvas.removeEventListener('mousedown', onDown);
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('mouseup', onUp);
            canvas.removeEventListener('touchstart', onDown);
            canvas.removeEventListener('touchmove', onMove);
            canvas.removeEventListener('touchend', onUp);
        };
    }, [onBedDrop, onBedClick, redraw]);

    // Redraw handled by main sync useEffect (which now includes width/height deps)

    if (Platform.OS !== 'web') {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <Text style={{ fontSize: 40, marginBottom: 16 }}>🗺️</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.primaryGreen, textAlign: 'center' }}>
                    Available on Web
                </Text>
                <Text style={{ color: Colors.mutedText, textAlign: 'center', marginTop: 8 }}>
                    Open AcreLogic in your browser to use the visual bed layout designer.
                </Text>
            </View>
        );
    }

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            tabIndex={0}
            style={{ display: 'block', cursor: 'default', outline: 'none' }}
        />
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VisualBedLayoutScreen({ navigation, route }) {
    const { width, height } = useWindowDimensions();
    const HEADER_H = 56;
    const TOOLBAR_H = 60;
    // Web has no bottom toolbar — use full remaining height
    const canvasH = Platform.OS === 'web' ? height - HEADER_H : height - HEADER_H - TOOLBAR_H;

    // State
    const [beds, setBeds] = useState([]);
    // Multi-select: array of selected bed IDs. Primary = [0]. Extra = rest.
    const [selectedIds, setSelectedIds]         = useState([]);
    const [extraSelectedIds, setExtraSelectedIds] = useState(new Set());
    const [undoStack, setUndoStack] = useState([]);
    const [showCropPicker, setShowCropPicker] = useState(false);
    const [showAddBed, setShowAddBed] = useState(false);
    const [showCellGrid, setShowCellGrid] = useState(false);
    const [companionAlert, setCompanionAlert] = useState(null);
    const [spaceInfo, setSpaceInfo] = useState(null);  // canvas boundary + path strips
    const [minGapFt, setMinGapFt] = useState(1);       // minimum bed-to-bed spacing (ft)
    const bedCounter = useRef(1);
    // Guards against useFocusEffect re-clearing beds when browser focus cycles
    const sandboxInitialized = useRef(false);
    // Configurable snap grid (feet). Shown as pill buttons in the sidebar.
    const [snapFt, setSnapFt] = useState(DEFAULT_SNAP_FT);
    const snapFtRef = useRef(DEFAULT_SNAP_FT);
    useEffect(() => { snapFtRef.current = snapFt; }, [snapFt]);

    // Derived: primary selected ID + bed object (for single-bed sidebar ops)
    const selectedId  = selectedIds[0] ?? null;
    const selectedBed = beds.find(b => b.id === selectedId);
    // Full selection set for canvas highlighting and multi-delete
    const allSelectedIds = selectedId
        ? [selectedId, ...Array.from(extraSelectedIds).filter(id => id !== selectedId)]
        : [];
    const selectedCount = allSelectedIds.length;

    // ── Load from persistence ────────────────────────────────────────────────
    useFocusEffect(useCallback(() => {
        const saved = loadBedLayout();

        // ── Parse space context from route (new format) ────────────────────
        let sp = null;
        try {
            sp = route?.params?.spaceJson ? JSON.parse(route.params.spaceJson) : null;
        } catch {}

        const orientation = route?.params?.orientation ?? 'NS';
        const isEW = orientation === 'EW';

        if (sp) {
            // Build spaceInfo for the canvas boundary + path strips
            const {
                spaceLengthFt, spaceWidthFt,
                bedLengthFt, bedWidthFt, pathwayWidthFt,
                nsPathwayCount = 0, ewPathwayCount = 0,
                mainPathWidthFt = 0, equidistant = false,
                colGroups, rowGroups,
            } = sp;

            // In EW orientation the length/width axes are swapped for the canvas
            const canvasW = spaceWidthFt  * PX_PER_FT;
            const canvasH = spaceLengthFt * PX_PER_FT;

            // Build access-path strip rects in canvas space
            const pathStrips = [];
            const pathPx = mainPathWidthFt * PX_PER_FT;
            const bedWPx  = bedWidthFt  * PX_PER_FT;
            const bedHPx  = bedLengthFt * PX_PER_FT;
            const pathWPx = pathwayWidthFt * PX_PER_FT;
            const cGroups = colGroups?.length ? colGroups : [sp.bedsAcrossWidth];
            const rGroups = rowGroups?.length ? rowGroups : [sp.bedsAlongLength];

            if (nsPathwayCount > 0 && pathPx > 0) {
                if (!equidistant) {
                    pathStrips.push({ x: canvasW - pathPx, y: 0, w: pathPx, h: canvasH });
                } else {
                    let curX = 0;
                    for (let cg = 0; cg < cGroups.length; cg++) {
                        curX += cGroups[cg] * (bedWPx + pathWPx);
                        if (cg < cGroups.length - 1) {
                            pathStrips.push({ x: curX, y: 0, w: pathPx, h: canvasH });
                            curX += pathPx;
                        }
                    }
                }
            }
            if (ewPathwayCount > 0 && pathPx > 0) {
                if (!equidistant) {
                    pathStrips.push({ x: 0, y: canvasH - pathPx, w: canvasW, h: pathPx });
                } else {
                    let curY = 0;
                    for (let rg = 0; rg < rGroups.length; rg++) {
                        curY += rGroups[rg] * (bedHPx + pathWPx);
                        if (rg < rGroups.length - 1) {
                            pathStrips.push({ x: 0, y: curY, w: canvasW, h: pathPx });
                            curY += pathPx;
                        }
                    }
                }
            }

            setSpaceInfo({
                wPx: canvasW, hPx: canvasH,
                pathStrips,
                label: `${spaceWidthFt}\u2032 \u00d7 ${spaceLengthFt}\u2032`,
            });

            // ── Sandbox mode: start with empty canvas — user adds beds manually ──
            if (sp.isSandbox) {
                if (!sandboxInitialized.current) {
                    sandboxInitialized.current = true;
                    // Restore any previously saved sandbox layout, or start empty
                    if (saved?.beds?.length) {
                        setBeds(saved.beds);
                        const maxLabel = saved.beds.reduce((m, b) => Math.max(m, b.label ?? 0), 0);
                        bedCounter.current = maxLabel + 1;
                    }
                    // else: stay empty — sidebar "Add Bed" is the entry point
                }
                return;
            }

            // Pre-populate beds only if no saved layout, but skip if clearOnLoad requested
            const clearOnLoad = !!(route?.params?.clearOnLoad);
            if (!clearOnLoad && saved?.beds?.length) {
                setBeds(saved.beds);
                const maxLabel = saved.beds.reduce((m, b) => Math.max(m, b.label ?? 0), 0);
                bedCounter.current = maxLabel + 1;
            } else if (!saved?.beds?.length) {
                const rotation = isEW ? 90 : 0;
                const rowCount = Math.max(1, Math.floor(bedWPx / SNAP_PX));

                const initBeds = [];
                let label = 1;
                let curY = pathWPx / 2;

                for (let rg = 0; rg < rGroups.length; rg++) {
                    if (rg > 0) curY += equidistant ? pathPx : 0;
                    for (let r = 0; r < rGroups[rg]; r++) {
                        let curX = pathWPx / 2;
                        for (let cg = 0; cg < cGroups.length; cg++) {
                            if (cg > 0) curX += equidistant ? pathPx : 0;
                            for (let c = 0; c < cGroups[cg]; c++) {
                                initBeds.push({
                                    id: makeId(),
                                    label: label++,
                                    x: snap(curX),
                                    y: snap(curY),
                                    rotation,
                                    wFt: bedWidthFt,
                                    hFt: bedLengthFt,
                                    rows: Array(rowCount).fill(null),
                                });
                                curX += bedWPx + pathWPx;
                            }
                        }
                        curY += bedHPx + pathWPx;
                    }
                }
                bedCounter.current = label;
                setBeds(initBeds);
            }

            return;
        }

        // ── Legacy: old route format (initialBedCount) ─────────────────────
        const clearOnLoad = !!(route?.params?.clearOnLoad);
        if (!clearOnLoad && saved?.beds?.length) {
            setBeds(saved.beds);
            const maxLabel = saved.beds.reduce((m, b) => Math.max(m, b.label ?? 0), 0);
            bedCounter.current = maxLabel + 1;
        } else if (route?.params?.initialBedCount) {
            const { initialBedCount, wFt = 4, hFt = 8 } = route.params;
            const cols = Math.min(4, initialBedCount);
            const rowCount = Math.max(1, Math.floor((wFt * PX_PER_FT) / SNAP_PX));
            const initBeds = Array.from({ length: initialBedCount }, (_, i) => ({
                id: makeId(),
                label: i + 1,
                x: (i % cols) * (wFt * PX_PER_FT + 24) + 40,
                y: Math.floor(i / cols) * (hFt * PX_PER_FT + 24) + 40,
                rotation: 0,
                wFt,
                hFt,
                rows: Array(rowCount).fill(null),
            }));
            bedCounter.current = initialBedCount + 1;
            setBeds(initBeds);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route?.params?.spaceJson, route?.params?.initialBedCount, route?.params?.clearOnLoad]));

    // ── Persist on every change ───────────────────────────────────────────────
    useEffect(() => {
        if (beds.length > 0) saveBedLayout({ beds });
    }, [beds]);

    // ── Undo helpers ──────────────────────────────────────────────────────────
    function pushUndo(prev) {
        setUndoStack(s => [...s.slice(-UNDO_LIMIT + 1), prev]);
    }

    function undo() {
        setUndoStack(s => {
            if (!s.length) return s;
            const prev = s[s.length - 1];
            setBeds(prev);
            return s.slice(0, -1);
        });
    }

    // Keyboard shortcuts (web only)
    // • Cmd/Ctrl+Z  → undo
    // • Delete / Backspace → delete selected bed (when no text input is focused)
    // • Arrow keys → nudge selected bed one snap unit in that direction
    const selectedIdRef = useRef(selectedId);
    const allSelectedIdsRef = useRef(allSelectedIds);
    useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
    useEffect(() => { allSelectedIdsRef.current = allSelectedIds; }, [allSelectedIds]);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const handler = (e) => {
            const el = document.activeElement;
            // If canvas has focus, always allow shortcuts.
            // Only block if a text input/textarea is genuinely being edited.
            const canvasHasFocus = el && el.tagName === 'CANVAS';
            const isTyping = !canvasHasFocus && el && (
                (el.tagName === 'INPUT' && el.type !== 'range') ||
                el.tagName === 'TEXTAREA' ||
                el.isContentEditable
            );
            if (isTyping) return;

            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                undo();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                // Select all beds
                e.preventDefault();
                setBeds(prev => {
                    if (prev.length === 0) return prev;
                    setSelectedIds([prev[0].id]);
                    setExtraSelectedIds(new Set(prev.slice(1).map(b => b.id)));
                    return prev;
                });
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && allSelectedIdsRef.current.length > 0) {
                e.preventDefault();
                // Inline deletion using refs — avoids stale closure over allSelectedIds
                const toDelete = new Set(allSelectedIdsRef.current);
                setBeds(prev => {
                    pushUndo(prev);
                    return prev.filter(b => !toDelete.has(b.id));
                });
                setSelectedIds([]);
                setExtraSelectedIds(new Set());
            } else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && selectedIdRef.current) {
                e.preventDefault();
                const stepPx = snapFtRef.current * PX_PER_FT;
                const dx = e.key === 'ArrowLeft' ? -stepPx : e.key === 'ArrowRight' ? stepPx : 0;
                const dy = e.key === 'ArrowUp'   ? -stepPx : e.key === 'ArrowDown'  ? stepPx : 0;
                setBeds(prev => prev.map(b =>
                    allSelectedIdsRef.current.includes(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b
                ));
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // ── Bed actions ───────────────────────────────────────────────────────────
    const handleBedDrop = useCallback((bedId, x, y) => {
        setBeds(prev => {
            pushUndo(prev);
            return prev.map(b => b.id === bedId ? { ...b, x, y } : b);
        });
    }, []);

    const handleBedClick = useCallback((bedId, shiftKey = false) => {
        if (shiftKey && bedId) {
            // Shift+click: toggle bed in/out of extra selection
            setExtraSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(bedId)) {
                    next.delete(bedId);
                } else {
                    next.add(bedId);
                }
                return next;
            });
        } else {
            // Normal click: single selection
            setSelectedIds(bedId ? [bedId] : []);
            setExtraSelectedIds(new Set());
        }
    }, []);

    function addBed({ wFt, hFt, ori = 'NS' }) {
        const label = bedCounter.current++;
        const rotation = ori === 'EW' ? 90 : 0;
        // Effective footprint on the canvas (accounting for 90° rotation)
        const footW = ori === 'EW' ? hFt * PX_PER_FT : wFt * PX_PER_FT;
        const footH = ori === 'EW' ? wFt * PX_PER_FT : hFt * PX_PER_FT;
        const gapPx = minGapFt * PX_PER_FT;
        // Place new bed inside boundary if available, else 1ft from top-left
        let baseX = snap(PX_PER_FT);
        let baseY = snap(PX_PER_FT);
        if (spaceInfo) {
            // Stack beds vertically inside the boundary with spacing
            const placed = beds.length;
            const stride = footH + gapPx;
            const col = spaceInfo.wPx > 0 ? Math.floor((placed * stride) / spaceInfo.hPx) : 0;
            const row = placed - col * Math.max(1, Math.floor(spaceInfo.hPx / stride));
            baseX = snap(col * (footW + gapPx));
            baseY = snap(row * stride);
            // Clamp so bed stays inside boundary
            baseX = Math.max(0, Math.min(baseX, spaceInfo.wPx - footW));
            baseY = Math.max(0, Math.min(baseY, spaceInfo.hPx - footH));
        }
        const rowCount = Math.max(1, Math.floor((wFt * PX_PER_FT) / (DEFAULT_SNAP_FT * PX_PER_FT)));
        const newBed = {
            id: makeId(),
            label,
            x: baseX,
            y: baseY,
            rotation,
            wFt,
            hFt,
            rows: Array(rowCount).fill(null),
        };
        setBeds(prev => { pushUndo(prev); return [...prev, newBed]; });
        setSelectedIds([newBed.id]);
        setExtraSelectedIds(new Set());
    }

    function rotateBed() {
        if (!selectedId) return;
        setBeds(prev => {
            pushUndo(prev);
            return prev.map(b =>
                b.id === selectedId
                    ? { ...b, rotation: ((b.rotation ?? 0) + 90) % 360 }
                    : b
            );
        });
    }

    function deleteBed() {
        if (!selectedId) return;
        setBeds(prev => { pushUndo(prev); return prev.filter(b => b.id !== selectedId); });
        setSelectedIds([]);
        setExtraSelectedIds(new Set());
    }

    function deleteSelected() {
        const toDelete = new Set(allSelectedIds);
        if (toDelete.size === 0) return;
        setBeds(prev => { pushUndo(prev); return prev.filter(b => !toDelete.has(b.id)); });
        setSelectedIds([]);
        setExtraSelectedIds(new Set());
    }

    function assignCrop(cropId) {
        if (!selectedId) return;
        setBeds(prev => {
            pushUndo(prev);
            return prev.map(b => b.id === selectedId ? { ...b, cropId } : b);
        });
        setShowCropPicker(false); // eslint-disable-line

        // companion check vs all other beds (first non-null row)
        if (cropId) {
            const otherCropIds = beds
                .filter(b => b.id !== selectedId)
                .flatMap(b => (b.rows ?? []).filter(Boolean));
            const warnings = [...new Set(otherCropIds)]
                .map(otherId => getBadCompanionWarning(cropId, otherId))
                .filter(Boolean)
                .filter((w, i, arr) => arr.indexOf(w) === i);
            if (warnings.length > 0) setCompanionAlert({ warnings });
        }
    }

    function assignRowCrop(rowIdx, cropId) {
        if (!selectedId) return;
        setBeds(prev => {
            pushUndo(prev);
            return prev.map(b => {
                if (b.id !== selectedId) return b;
                const newRows = [...(b.rows ?? [])];
                newRows[rowIdx] = cropId;
                return { ...b, rows: newRows };
            });
        });
        if (cropId) {
            const otherCropIds = beds
                .filter(b => b.id !== selectedId)
                .flatMap(b => (b.rows ?? []).filter(Boolean));
            const warnings = [...new Set(otherCropIds)]
                .map(otherId => getBadCompanionWarning(cropId, otherId))
                .filter(Boolean)
                .filter((w, i, arr) => arr.indexOf(w) === i);
            if (warnings.length > 0) setCompanionAlert({ warnings });
        }
    }

    // Assign a crop to a specific 1ft cell in the selected bed.
    // key = "col_row" string, or '__clear__' to wipe all cells.
    function assignCell(key, cropId) {
        if (!selectedId) return;
        setBeds(prev => {
            pushUndo(prev);
            return prev.map(b => {
                if (b.id !== selectedId) return b;
                if (key === '__clear__') return { ...b, cells: {} };
                const newCells = { ...(b.cells ?? {}) };
                if (cropId) newCells[key] = cropId;
                else delete newCells[key];
                return { ...b, cells: newCells };
            });
        });
        if (cropId && cropId !== '__clear__') {
            const otherCropIds = beds
                .filter(b => b.id !== selectedId)
                .flatMap(b => Object.values(b.cells ?? {}).filter(Boolean));
            const warnings = [...new Set(otherCropIds)]
                .map(otherId => getBadCompanionWarning(cropId, otherId))
                .filter(Boolean)
                .filter((w, i, arr) => arr.indexOf(w) === i);
            if (warnings.length > 0) setCompanionAlert({ warnings });
        }
    }

    function clearAll() {
        pushUndo(beds);
        setBeds([]);
        setSelectedIds([]);
        setExtraSelectedIds(new Set());
        bedCounter.current = 1;
    }

    // Conflict crop IDs across all OTHER beds (for picker badges)
    const conflictCropIds = useMemo(() => {
        return new Set(
            beds
                .filter(b => b.id !== selectedId && b.cropId)
                .map(b => b.cropId)
        );
    }, [beds, selectedId]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View style={[styles.container, Platform.OS === 'web' && { overflow: 'hidden', maxHeight: '100dvh' }]}>
            {/* Companion conflict flash banner */}
            {companionAlert && (
                <CompanionAlertBanner
                    warnings={companionAlert.warnings}
                    onDismiss={() => setCompanionAlert(null)}
                />
            )}
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerLabel}>FARM DESIGNER</Text>
                    <Text style={styles.headerTitle}>Visual Bed Layout</Text>
                </View>
                <Text style={styles.bedCount}>{beds.length} bed{beds.length !== 1 ? 's' : ''}</Text>
            </View>

            {/* Canvas row: sidebar (web) + canvas */}
            <View style={{ flex: 1, flexDirection: 'row' }}>
                {/* Left sidebar — web/tablet only */}
                {Platform.OS === 'web' && (
                    <AddBedSidebar
                        onAdd={addBed}
                        selectedBed={selectedBed}
                        selectedCount={selectedCount}
                        onRotate={rotateBed}
                        onDelete={deleteBed}
                        onDeleteSelected={deleteSelected}
                        onAssignCrops={() => setShowCellGrid(true)}
                        undoStack={undoStack}
                        onUndo={undo}
                        snapFt={snapFt}
                        onSnapChange={setSnapFt}
                        minGapFt={minGapFt}
                        onMinGapChange={setMinGapFt}
                    />
                )}
                <View style={{ flex: 1, height: canvasH }}>
                    <BedLayoutCanvas
                        beds={beds}
                        selectedIds={allSelectedIds}
                        onBedDrop={handleBedDrop}
                        onBedClick={handleBedClick}
                        width={Platform.OS === 'web' ? width - 176 : width}
                        height={canvasH}
                        spaceInfo={spaceInfo}
                        snapFt={snapFt}
                        minGapFt={minGapFt}
                    />
                </View>
            </View>

            {/* Toolbar — mobile only (sidebar handles web) */}
            {Platform.OS !== 'web' && (
                <View style={styles.toolbar}>
                    <TouchableOpacity style={styles.toolBtn} onPress={() => setShowAddBed(true)}>
                        <Text style={styles.toolBtnIcon}>＋</Text>
                        <Text style={styles.toolBtnLabel}>Add Bed</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toolBtn, !selectedId && styles.toolBtnDisabled]}
                        onPress={() => setShowCellGrid(true)} disabled={!selectedId}
                    >
                        <Text style={styles.toolBtnIcon}>🌱</Text>
                        <Text style={styles.toolBtnLabel}>Crops</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toolBtn, !selectedId && styles.toolBtnDisabled]}
                        onPress={rotateBed} disabled={!selectedId}
                    >
                        <Text style={styles.toolBtnIcon}>↻</Text>
                        <Text style={styles.toolBtnLabel}>Rotate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toolBtn, !selectedId && styles.toolBtnDisabled]}
                        onPress={deleteBed} disabled={!selectedId}
                    >
                        <Text style={[styles.toolBtnIcon, { color: '#C62828' }]}>🗑</Text>
                        <Text style={styles.toolBtnLabel}>Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toolBtn, !undoStack.length && styles.toolBtnDisabled]}
                        onPress={undo} disabled={!undoStack.length}
                    >
                        <Text style={styles.toolBtnIcon}>↩</Text>
                        <Text style={styles.toolBtnLabel}>Undo</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Tip when canvas is empty */}
            {beds.length === 0 && (
                <View style={styles.emptyOverlay} pointerEvents="none">
                    <Text style={styles.emptyIcon}>🗺️</Text>
                    <Text style={styles.emptyTitle}>Start Designing</Text>
                    <Text style={styles.emptyBody}>
                        {Platform.OS === 'web'
                            ? 'Drag a bed to reposition it. Tap to select, then use the sidebar to rotate or delete.'
                            : 'Use the ＋ Add Bed panel on the left to place your first bed, then drag it into position.'}
                    </Text>
                </View>
            )}

            {/* Modals */}
            <CellGridOverlay
                visible={showCellGrid}
                bed={selectedBed}
                onAssignCell={assignCell}
                onClose={() => setShowCellGrid(false)}
            />
            <AddBedSheet
                visible={showAddBed}
                onAdd={addBed}
                onClose={() => setShowAddBed(false)}
            />
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: GROUND_COLOR },

    header: {
        height: 56, flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.deepForest ?? '#1A2E0F',
        paddingHorizontal: Spacing.md, gap: Spacing.sm,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backArrow: { fontSize: 28, color: '#FFF8F0', lineHeight: 32 },
    headerLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,248,240,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFF8F0' },
    bedCount: { fontSize: 13, color: 'rgba(255,248,240,0.7)', fontWeight: '600' },

    toolbar: {
        height: 60, flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFF8F0', borderTopWidth: 1,
        borderTopColor: 'rgba(45,79,30,0.12)', paddingHorizontal: 8, gap: 4,
    },
    toolBtn: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingVertical: 8, borderRadius: Radius.sm,
    },
    toolBtnDisabled: { opacity: 0.3 },
    toolBtnIcon: { fontSize: 20, color: Colors.primaryGreen },
    toolBtnLabel: { fontSize: 9, color: Colors.primaryGreen, fontWeight: '700', marginTop: 2, textAlign: 'center' },

    emptyOverlay: {
        position: 'absolute', top: 56, left: 0, right: 0,
        bottom: 60, alignItems: 'center', justifyContent: 'center',
        padding: 40, pointerEvents: 'none',
    },
    emptyIcon: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: Colors.primaryGreen, marginBottom: 10 },
    emptyBody: { fontSize: 14, color: Colors.mutedText, textAlign: 'center', lineHeight: 22 },
});

const picker = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
        backgroundColor: '#FAFAF7', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: Spacing.lg, paddingBottom: 36, maxHeight: '80%',
    },
    handle: { width: 36, height: 4, backgroundColor: 'rgba(45,79,30,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 10 },
    title: { fontSize: 18, fontWeight: '800', color: Colors.primaryGreen, marginBottom: Spacing.sm },
    search: {
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: Radius.sm,
        padding: 10, fontSize: 14, color: Colors.darkText, marginBottom: Spacing.sm,
        backgroundColor: '#FFF',
    },
    scroll: { flex: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 24 },
    cropCard: {
        width: 80, alignItems: 'center', padding: 8, borderRadius: Radius.sm,
        backgroundColor: 'rgba(45,79,30,0.05)', borderWidth: 1.5, borderColor: 'transparent',
    },
    cropCardSelected: { borderColor: Colors.primaryGreen, backgroundColor: 'rgba(45,79,30,0.08)' },
    cropCardConflict: { borderColor: '#EF5350', backgroundColor: 'rgba(183,28,28,0.04)' },
    cropImg: { width: 56, height: 56, borderRadius: 8, marginBottom: 4 },
    clearIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    cropName: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen, textAlign: 'center' },
    checkBadge: {
        position: 'absolute', top: 4, right: 4, width: 18, height: 18,
        borderRadius: 9, backgroundColor: Colors.primaryGreen, alignItems: 'center', justifyContent: 'center',
    },
    checkText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
    conflictBadge: {
        position: 'absolute', top: 4, right: 4, width: 20, height: 20,
        borderRadius: 10, backgroundColor: '#B71C1C', alignItems: 'center', justifyContent: 'center',
    },
    conflictBadgeText: { fontSize: 11, lineHeight: 14 },
});

const addSheet = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
        backgroundColor: '#FAFAF7', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: Spacing.lg, paddingBottom: 40,
    },
    handle: { width: 36, height: 4, backgroundColor: 'rgba(45,79,30,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 10 },
    title: { fontSize: 18, fontWeight: '800', color: Colors.primaryGreen, marginBottom: 4 },
    sub: { fontSize: 12, color: Colors.mutedText, marginBottom: Spacing.md },
    presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.lg },
    preset: {
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm,
        backgroundColor: 'rgba(45,79,30,0.07)', borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.15)',
    },
    presetText: { fontSize: 13, fontWeight: '700', color: Colors.primaryGreen },
    dimRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.lg },
    dimField: { flex: 1, gap: 4 },
    dimLabel: { fontSize: 12, color: Colors.mutedText, fontWeight: '600' },
    dimInput: {
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: Radius.sm,
        padding: 10, fontSize: 18, fontWeight: '700', color: Colors.primaryGreen,
        textAlign: 'center', backgroundColor: '#FFF',
    },
    dimX: { fontSize: 22, color: Colors.mutedText, fontWeight: '300', marginTop: 18 },
    addBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.md, paddingVertical: 15, alignItems: 'center' },
    addBtnText: { color: '#FFF8F0', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
});

// ─── BedRowSheet Styles ────────────────────────────────────────────────────────
const rowSheet = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
        backgroundColor: '#FAFAF7', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: Spacing.lg, paddingBottom: 36, maxHeight: '80%',
    },
    handle: { width: 36, height: 4, backgroundColor: 'rgba(45,79,30,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 10 },
    title: { fontSize: 18, fontWeight: '800', color: Colors.primaryGreen, marginBottom: 4 },
    sub: { fontSize: 12, color: Colors.mutedText, marginBottom: Spacing.md },
    // Row list item
    rowItem: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.08)',
    },
    rowSwatch: { width: 12, height: 36, borderRadius: 4 },
    rowLabel: { width: 48, fontSize: 12, fontWeight: '700', color: Colors.mutedText },
    rowImg: { width: 32, height: 32, borderRadius: 6 },
    rowCrop: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.primaryGreen },
    rowEdit: { fontSize: 20, color: Colors.mutedText },
    // Done button
    doneBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md },
    doneBtnText: { color: '#FFF8F0', fontWeight: '800', fontSize: 16 },
    // Crop picker (inline in row picker sub-view)
    search: {
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: Radius.sm,
        padding: 10, fontSize: 14, color: Colors.darkText, marginBottom: Spacing.sm,
        backgroundColor: '#FFF',
    },
    scroll: { flex: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 24 },
    cropCard: {
        width: 80, alignItems: 'center', padding: 8, borderRadius: Radius.sm,
        backgroundColor: 'rgba(45,79,30,0.05)', borderWidth: 1.5, borderColor: 'transparent',
    },
    cropCardSelected: { borderColor: Colors.primaryGreen, backgroundColor: 'rgba(45,79,30,0.08)' },
    cropImg: { width: 56, height: 56, borderRadius: 8, marginBottom: 4 },
    clearIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    cropName: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen, textAlign: 'center' },
    checkBadge: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.primaryGreen, alignItems: 'center', justifyContent: 'center' },
    checkText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
});
