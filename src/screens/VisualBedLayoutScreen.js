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
const SNAP_FT   = 1;          // snap to 1-foot grid
const SNAP_PX   = PX_PER_FT * SNAP_FT;
const MIN_ZOOM  = 0.3;
const MAX_ZOOM  = 4.0;
const UNDO_LIMIT = 10;

const BED_DEFAULT_W_FT = 4;
const BED_DEFAULT_H_FT = 8;

const GROUND_COLOR   = '#E8E0D0';
const GRID_COLOR     = 'rgba(45,79,30,0.12)';
const PATH_COLOR     = '#CFC5AE';
const BED_FILL       = '#D4E9C8';
const BED_STROKE     = '#2D4F1E';
const SELECT_STROKE  = '#F97316';
const TEXT_COLOR     = '#2D4F1E';

function snap(val) {
    return Math.round(val / SNAP_PX) * SNAP_PX;
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
function BedLayoutCanvas({ beds, selectedId, onBedDrop, onBedClick, width, height }) {
    const canvasRef = useRef(null);
    const stateRef  = useRef({
        beds,
        selectedId,
        zoom: 1,
        pan: { x: 40, y: 40 },
        drag: null,         // { bedId, startX, startY, origX, origY }
        panning: false,
        panStart: null,
        cropImages: {},     // cropId → HTMLImageElement (cached)
    });

    // ── Sync props into stateRef ───────────────────────────────────────────────
    useEffect(() => {
        stateRef.current.beds = beds;
        stateRef.current.selectedId = selectedId;
        redraw();
    }, [beds, selectedId]);

    // ── Draw ──────────────────────────────────────────────────────────────────
    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { zoom, pan, beds: bs, selectedId: sel } = stateRef.current;

        ctx.clearRect(0, 0, width, height);

        // Ground
        ctx.fillStyle = GROUND_COLOR;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        // Grid dots
        ctx.fillStyle = GRID_COLOR;
        const gs = SNAP_PX; // 1 ft in px
        const gStep = Math.max(gs, gs * Math.round(12 / zoom));  // adaptive density
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
            const isSelected = bed.id === sel;
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

            // Planting row lines
            ctx.strokeStyle = 'rgba(45,79,30,0.15)';
            ctx.lineWidth = 1;
            const rows = Math.floor(h / SNAP_PX);
            for (let r = 1; r < rows; r++) {
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

            // Crop image (if assigned)
            const crop = ALL_CROPS.find(c => c.id === bed.cropId);
            const imgEl = bed.cropId ? stateRef.current.cropImages[bed.cropId] : null;

            if (imgEl) {
                const imgSize = Math.min(w, h) * 0.45;
                const ix = (w - imgSize) / 2;
                const iy = 6;
                ctx.save();
                ctx.beginPath();
                ctx.arc(ix + imgSize / 2, iy + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(imgEl, ix, iy, imgSize, imgSize);
                ctx.restore();

                if (crop?.name) {
                    ctx.fillStyle = TEXT_COLOR;
                    ctx.font = `bold ${Math.max(10, Math.min(14, w / 5))}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(crop.name, w / 2, 8 + imgSize, w - 8);
                }
            } else if (crop) {
                // Emoji fallback
                const emoji = crop.emoji ?? '🌱';
                const fontSize = Math.max(18, Math.min(32, w / 3));
                ctx.font = `${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(emoji, w / 2, h / 2 - 8);
                ctx.fillStyle = TEXT_COLOR;
                ctx.font = `bold ${Math.max(9, Math.min(13, w / 5))}px sans-serif`;
                ctx.fillText(crop.name, w / 2, h / 2 + fontSize / 2 + 2, w - 8);
            } else {
                // Empty bed label
                ctx.fillStyle = 'rgba(45,79,30,0.4)';
                ctx.font = `${Math.max(9, Math.min(12, w / 5))}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${bed.wFt ?? 4}×${bed.hFt ?? 8}ft`, w / 2, h / 2);
            }

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

        // North compass rose (top-right)
        drawCompass(ctx, width - 50, 50, zoom);

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
            } else {
                st.panning = true;
                st.panStart = { px: st.pan.x, py: st.pan.y, mx: pos.x, my: pos.y };
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
            } else if (st.panning && st.panStart) {
                st.pan = {
                    x: st.panStart.px + pos.x - st.panStart.mx,
                    y: st.panStart.py + pos.y - st.panStart.my,
                };
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
                    const rawX = st.drag.origX + dx / st.zoom;
                    const rawY = st.drag.origY + dy / st.zoom;
                    const snappedX = snap(rawX);
                    const snappedY = snap(rawY);
                    onBedDrop(st.drag.bedId, snappedX, snappedY);
                } else {
                    // Click = select
                    onBedClick(st.drag.bedId);
                }
                st.drag = null;
            } else if (st.panning) {
                st.panning = false;
                st.panStart = null;
                // Click on empty canvas = deselect
                const dt = Date.now() - clickStart.t;
                const ddx = pos.x - clickStart.x;
                const ddy = pos.y - clickStart.y;
                if (dt < 250 && Math.sqrt(ddx * ddx + ddy * ddy) < 5) {
                    onBedClick(null);
                }
            }
        }

        function onWheel(e) {
            e.preventDefault();
            const st = stateRef.current;
            const pos = toCanvas(e);
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, st.zoom * factor));
            // Zoom around cursor point
            st.pan.x = pos.x - (pos.x - st.pan.x) * (newZoom / st.zoom);
            st.pan.y = pos.y - (pos.y - st.pan.y) * (newZoom / st.zoom);
            st.zoom = newZoom;
            redraw();
        }

        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseup', onUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('touchstart', onDown, { passive: true });
        canvas.addEventListener('touchmove', onMove, { passive: true });
        canvas.addEventListener('touchend', onUp);

        return () => {
            canvas.removeEventListener('mousedown', onDown);
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('mouseup', onUp);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('touchstart', onDown);
            canvas.removeEventListener('touchmove', onMove);
            canvas.removeEventListener('touchend', onUp);
        };
    }, [onBedDrop, onBedClick, redraw]);

    // Redraw on resize
    useEffect(() => { redraw(); }, [width, height, redraw]);

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
            style={{ display: 'block', cursor: 'crosshair' }}
        />
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VisualBedLayoutScreen({ navigation, route }) {
    const { width, height } = useWindowDimensions();
    const HEADER_H = 56;
    const TOOLBAR_H = 60;
    const canvasH = height - HEADER_H - TOOLBAR_H;

    // State
    const [beds, setBeds] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [undoStack, setUndoStack] = useState([]);
    const [showCropPicker, setShowCropPicker] = useState(false);
    const [showAddBed, setShowAddBed] = useState(false);
    const [companionAlert, setCompanionAlert] = useState(null); // { warnings: string[] }
    const bedCounter = useRef(1);

    const selectedBed = beds.find(b => b.id === selectedId);

    // ── Load from persistence ────────────────────────────────────────────────
    useFocusEffect(useCallback(() => {
        const saved = loadBedLayout();
        if (saved?.beds?.length) {
            setBeds(saved.beds);
            // Set counter above highest existing label
            const maxLabel = saved.beds.reduce((m, b) => Math.max(m, b.label ?? 0), 0);
            bedCounter.current = maxLabel + 1;
        } else if (route?.params?.initialBedCount) {
            // Pre-populated from GardenSpacePlanner
            const { initialBedCount, wFt = 4, hFt = 8 } = route.params;
            const cols = Math.min(4, initialBedCount);
            const initBeds = Array.from({ length: initialBedCount }, (_, i) => ({
                id: makeId(),
                label: i + 1,
                x: (i % cols) * (wFt * PX_PER_FT + 24) + 40,
                y: Math.floor(i / cols) * (hFt * PX_PER_FT + 24) + 40,
                rotation: 0,
                wFt,
                hFt,
                cropId: null,
            }));
            bedCounter.current = initialBedCount + 1;
            setBeds(initBeds);
        }
    }, [route?.params?.initialBedCount]));

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

    // Keyboard undo
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') undo();
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

    const handleBedClick = useCallback((bedId) => {
        setSelectedId(id => id === bedId ? id : bedId);
    }, []);

    function addBed({ wFt, hFt }) {
        const label = bedCounter.current++;
        const newBed = {
            id: makeId(),
            label,
            x: snap(40 + (beds.length % 4) * (wFt * PX_PER_FT + 24)),
            y: snap(40 + Math.floor(beds.length / 4) * (hFt * PX_PER_FT + 24)),
            rotation: 0,
            wFt,
            hFt,
            cropId: null,
        };
        setBeds(prev => { pushUndo(prev); return [...prev, newBed]; });
        setSelectedId(newBed.id);
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
        setSelectedId(null);
    }

    function assignCrop(cropId) {
        if (!selectedId) return;
        setBeds(prev => {
            pushUndo(prev);
            return prev.map(b => b.id === selectedId ? { ...b, cropId } : b);
        });
        setShowCropPicker(false);

        // ── Companion planting flash alert ─────────────────────────────────
        if (cropId) {
            const otherCropIds = beds
                .filter(b => b.id !== selectedId && b.cropId)
                .map(b => b.cropId);
            const warnings = otherCropIds
                .map(otherId => getBadCompanionWarning(cropId, otherId))
                .filter(Boolean)
                // deduplicate
                .filter((w, i, arr) => arr.indexOf(w) === i);
            if (warnings.length > 0) {
                setCompanionAlert({ warnings });
            }
        }
        // ──────────────────────────────────────────────────────────────────
    }

    function clearAll() {
        pushUndo(beds);
        setBeds([]);
        setSelectedId(null);
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
        <View style={styles.container}>
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

            {/* Canvas */}
            <View style={{ width, height: canvasH }}>
                <BedLayoutCanvas
                    beds={beds}
                    selectedId={selectedId}
                    onBedDrop={handleBedDrop}
                    onBedClick={handleBedClick}
                    width={width}
                    height={canvasH}
                />
            </View>

            {/* Toolbar */}
            <View style={styles.toolbar}>
                {/* Add bed */}
                <TouchableOpacity style={styles.toolBtn} onPress={() => setShowAddBed(true)}>
                    <Text style={styles.toolBtnIcon}>＋</Text>
                    <Text style={styles.toolBtnLabel}>Add Bed</Text>
                </TouchableOpacity>

                {/* Rotate (only when selected) */}
                <TouchableOpacity
                    style={[styles.toolBtn, !selectedId && styles.toolBtnDisabled]}
                    onPress={rotateBed}
                    disabled={!selectedId}
                >
                    <Text style={styles.toolBtnIcon}>↻</Text>
                    <Text style={styles.toolBtnLabel}>Rotate</Text>
                </TouchableOpacity>

                {/* Assign crop */}
                <TouchableOpacity
                    style={[styles.toolBtn, !selectedId && styles.toolBtnDisabled]}
                    onPress={() => setShowCropPicker(true)}
                    disabled={!selectedId}
                >
                    <Text style={styles.toolBtnIcon}>🌱</Text>
                    <Text style={styles.toolBtnLabel}>
                        {selectedBed?.cropId
                            ? ALL_CROPS.find(c => c.id === selectedBed.cropId)?.name ?? 'Crop'
                            : 'Assign Crop'}
                    </Text>
                </TouchableOpacity>

                {/* Delete */}
                <TouchableOpacity
                    style={[styles.toolBtn, !selectedId && styles.toolBtnDisabled]}
                    onPress={deleteBed}
                    disabled={!selectedId}
                >
                    <Text style={[styles.toolBtnIcon, { color: '#C62828' }]}>🗑</Text>
                    <Text style={styles.toolBtnLabel}>Delete</Text>
                </TouchableOpacity>

                {/* Undo */}
                <TouchableOpacity
                    style={[styles.toolBtn, !undoStack.length && styles.toolBtnDisabled]}
                    onPress={undo}
                    disabled={!undoStack.length}
                >
                    <Text style={styles.toolBtnIcon}>↩</Text>
                    <Text style={styles.toolBtnLabel}>Undo</Text>
                </TouchableOpacity>
            </View>

            {/* Tip when canvas is empty */}
            {beds.length === 0 && (
                <View style={styles.emptyOverlay} pointerEvents="none">
                    <Text style={styles.emptyIcon}>🗺️</Text>
                    <Text style={styles.emptyTitle}>Start Designing</Text>
                    <Text style={styles.emptyBody}>
                        Tap "+ Add Bed" to place your first garden bed on the canvas.
                        Drag beds to position them, rotate to orient, then assign crops.
                    </Text>
                </View>
            )}

            {/* Modals */}
            <CropPickerModal
                visible={showCropPicker}
                currentCropId={selectedBed?.cropId}
                conflictCropIds={conflictCropIds}
                onSelect={assignCrop}
                onClose={() => setShowCropPicker(false)}
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
