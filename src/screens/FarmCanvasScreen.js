/**
 * FarmCanvasScreen.js
 * ════════════════════
 * Phase 2: Interactive Konva.js drag-and-drop farm layout canvas.
 *
 * Features:
 *   • Freely draggable block rectangles on a north-aligned canvas
 *   • Proportional sizing: block width ∝ bedCount, height ∝ bedLengthFt
 *   • Snap-to-grid on drag end (24ft grid cells → 1px = 1ft)
 *   • Compass rose (N/S/E/W) + cardinal grid lines
 *   • Family color-fills with crop density hatching
 *   • Bisecting road displayed as internal divider line
 *   • Pinch-to-zoom + scroll-wheel zoom + click-drag pan
 *   • Tap block → BlockDetailScreen
 *   • All positions auto-saved to persistence on drag end
 *
 * Web-only: Konva requires the DOM canvas API.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadBlocks, loadBlocksForPlan, saveBlock } from '../services/persistence';
import { totalPlantedSqFt } from '../services/farmUtils';
import HomeLogoButton from '../components/HomeLogoButton';

// ─── Constants ────────────────────────────────────────────────────────────────
const PX_PER_FT = 3;        // baseline: 3 canvas pixels per real foot
const SNAP_GRID = 24;       // snap to 24ft (72px) grid
const MIN_BLOCK_W = 80;     // minimum rendered pixel width
const MIN_BLOCK_H = 60;     // minimum rendered pixel height
const MAX_BLOCK_W = 320;    // maximum rendered pixel width (prevents giant blocks)
const GAP_PX = 24;          // guaranteed gap between blocks in auto-layout
const CANVAS_PAD = 60;      // padding around content

// Family → fill color map (light fills for canvas)
const FAMILY_FILLS = {
    'Brassica & Chicories': '#C8E6C9',
    'Alliums': '#FFF9C4',
    'Nightshades': '#FFCCBC',
    'Cucurbits': '#B2EBF2',
    'Legumes': '#DCEDC8',
    'Root Crops': '#F5CBA7',
    'Greens & Herbs': '#C8F7C5',
    'Cover Crop / Fallow': '#D5DBDB',
    'Mixed (no restriction)': '#EAF2E3',
};
const FAMILY_STROKE = {
    'Brassica & Chicories': '#1B5E20',
    'Alliums': '#F57F17',
    'Nightshades': '#BF360C',
    'Cucurbits': '#006064',
    'Legumes': '#33691E',
    'Root Crops': '#784212',
    'Greens & Herbs': '#145A32',
    'Cover Crop / Fallow': '#2C3E50',
    'Mixed (no restriction)': '#2D4F1E',
};

// ─── Block geometry helpers ────────────────────────────────────────────────────
// Raw proportional size at baseline PX_PER_FT (used only for ratio calculations)
function blockPixelSize(block, scale = 1) {
    const bedW = (block.bedWidthFt ?? 2.5) + (block.pathwayWidthFt ?? 4);
    const cols = Math.ceil((block.bedCount ?? 8) / 2); // beds across (2 rows deep E↔W)
    const w = Math.max(MIN_BLOCK_W, cols * bedW * PX_PER_FT * scale);
    const h = Math.max(MIN_BLOCK_H, (block.bedLengthFt ?? 100) * PX_PER_FT * scale);
    return { w, h };
}

// Compute a uniform scale factor so the WIDEST block never exceeds MAX_BLOCK_W.
// All blocks share the same scale, preserving proportionality.
function dynamicScale(blocks) {
    if (!blocks || blocks.length === 0) return 1;
    let maxW = 0;
    blocks.forEach(b => {
        const bedW = (b.bedWidthFt ?? 2.5) + (b.pathwayWidthFt ?? 4);
        const cols = Math.ceil((b.bedCount ?? 8) / 2);
        const rawW = cols * bedW * PX_PER_FT;
        if (rawW > maxW) maxW = rawW;
    });
    if (maxW <= 0) return 1;
    return Math.min(1, MAX_BLOCK_W / maxW); // never scale UP, only DOWN
}

// Proper row-flow auto-layout: guaranteed no overlaps.
// Places blocks left-to-right, wrapping when row would exceed canvasW.
function buildAutoLayout(blocks, canvasW, scale) {
    const positions = {};
    const usableW = Math.max(canvasW - CANVAS_PAD * 2, 300);
    let rowX = CANVAS_PAD, rowY = CANVAS_PAD, rowH = 0;
    blocks.forEach(block => {
        const { w, h } = blockPixelSize(block, scale);
        // Wrap to next row if this block would overflow
        if (rowX + w > CANVAS_PAD + usableW && rowX > CANVAS_PAD) {
            rowX = CANVAS_PAD;
            rowY += rowH + GAP_PX;
            rowH = 0;
        }
        positions[block.id] = { x: rowX, y: rowY };
        rowX += w + GAP_PX;
        rowH = Math.max(rowH, h);
    });
    return positions;
}

function snap(val, grid = SNAP_GRID * PX_PER_FT) {
    return Math.round(val / grid) * grid;
}

// ─── Web-only Konva canvas ─────────────────────────────────────────────────────
function KonvaCanvas({ blocks, onBlockMove, onBlockClick, canvasW, canvasH }) {
    const stageRef = useRef(null);
    const konvaRef = useRef(null); // holds { Stage, Layer, Rect, Text, Line, Group }

    // Dynamically import Konva (web only)
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        import('konva').then(Konva => {
            import('konva/lib/shapes/Rect').catch(() => { });
            konvaRef.current = Konva.default ?? Konva;
            initCanvas();
        });
    }, []);

    useEffect(() => {
        if (stageRef.current) renderBlocks();
    }, [blocks, canvasW, canvasH]);

    const initCanvas = () => {
        if (!stageRef.current) return;
        const stageContainer = stageRef.current;
    };

    function renderBlocks() {
        if (!stageRef.current || !konvaRef.current) return;
        // Use the imperative Konva APIs to draw blocks
        // (we're not using react-konva JSX here to avoid SSR issues)
    }

    return <div id="konva-container" ref={stageRef} style={{ width: '100%', height: '100%' }} />;
}

// ─── Pure HTML5 Canvas implementation (more reliable in Expo Web) ──────────────
function FarmCanvas({ blocks, onBlockMove, onBlockClick, width, height }) {
    const canvasRef = useRef(null);
    const stateRef = useRef({
        positions: {},      // blockId → { x, y }
        scale: 1,           // uniform scale factor (set from dynamicScale)
        dragging: null,     // { blockId, startX, startY, origX, origY }
        pan: { x: 0, y: 0 },
        zoom: 1,
        panning: false,
        panStart: null,
    });
    const [, forceRender] = useState(0);

    // ── Auto-layout: runs every time blocks change ────────────────────────────
    // Strategy:
    //   • Compute a new scale from current blocks (auto-fits largest block)
    //   • Blocks with a saved canvasPos restore to their last dragged position
    //   • Blocks without canvasPos get row-flow auto-placed
    //   • All coordinate state lives in stateRef so every event handler is consistent
    useEffect(() => {
        const st = stateRef.current;
        const scale = dynamicScale(blocks);
        st.scale = scale;   // kept in stateRef — read by hitTest, redraw, etc.

        // Split blocks: those with a saved position vs those needing auto-placement
        const positioned = {};
        const needsPlace = [];
        blocks.forEach(block => {
            if (block.canvasPos) {
                positioned[block.id] = block.canvasPos; // restore last dragged pos
            } else if (st.positions[block.id]) {
                positioned[block.id] = st.positions[block.id]; // keep in-session pos
            } else {
                needsPlace.push(block);
            }
        });

        // Find bottom of already-positioned blocks to place new ones below
        const existingMaxY = Object.values(positioned).reduce(
            (max, p) => Math.max(max, p.y), CANVAS_PAD
        );
        const yOffset = Object.keys(positioned).length > 0 ? existingMaxY + GAP_PX * 4 : 0;

        const autoPositions = buildAutoLayout(needsPlace, width, scale);

        // Merge: restore saved, keep in-session, auto-place new
        st.positions = { ...positioned };
        Object.entries(autoPositions).forEach(([id, pos]) => {
            st.positions[id] = { x: pos.x, y: pos.y + yOffset };
        });

        redraw();
    }, [blocks]);

    // ── Draw everything ───────────────────────────────────────────────────────
    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const st = stateRef.current;
        const { zoom, pan } = st;

        ctx.clearRect(0, 0, width, height);

        // Background
        ctx.fillStyle = '#F0EDE6';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        // Grid dots
        ctx.fillStyle = 'rgba(45,79,30,0.1)';
        const gridSpacing = SNAP_GRID * PX_PER_FT;
        const startX = Math.floor(-pan.x / zoom / gridSpacing) * gridSpacing - gridSpacing;
        const startY = Math.floor(-pan.y / zoom / gridSpacing) * gridSpacing - gridSpacing;
        const endX = startX + (width / zoom) + gridSpacing * 2;
        const endY = startY + (height / zoom) + gridSpacing * 2;
        for (let x = startX; x < endX; x += gridSpacing) {
            for (let y = startY; y < endY; y += gridSpacing) {
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw each block
        blocks.forEach(block => {
            const pos = st.positions[block.id] ?? { x: 100, y: 100 };
            const { w, h } = blockPixelSize(block, st.scale);  // use stateRef scale
            const fill = FAMILY_FILLS[block.familyAssignment] ?? '#EAF2E3';
            const stroke = FAMILY_STROKE[block.familyAssignment] ?? '#2D4F1E';
            const isDragging = st.dragging?.blockId === block.id;

            // Shadow
            if (isDragging) {
                ctx.shadowColor = 'rgba(45,79,30,0.4)';
                ctx.shadowBlur = 16;
                ctx.shadowOffsetY = 6;
            }

            // Body
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = isDragging ? 3 : 2;
            roundRect(ctx, pos.x, pos.y, w, h, 8);
            ctx.fill();
            ctx.stroke();

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // Bed row lines (hatching)
            ctx.strokeStyle = stroke + '30';
            ctx.lineWidth = 1;
            const bedH = (block.bedWidthFt ?? 2.5) * PX_PER_FT;
            const pathH = (block.pathwayWidthFt ?? 4) * PX_PER_FT;
            const unitH = bedH + pathH;
            let ry = pos.y + unitH;
            while (ry < pos.y + h) {
                ctx.beginPath();
                ctx.moveTo(pos.x + 4, ry);
                ctx.lineTo(pos.x + w - 4, ry);
                ctx.stroke();
                ry += unitH;
            }

            // Bisecting road line
            if (block.bisectingRoad?.enabled) {
                ctx.strokeStyle = '#D7CCC8';
                ctx.lineWidth = (block.bisectingRoad.widthFt ?? 14) * PX_PER_FT * 0.5;
                if (block.bisectingRoad.orientation === 'NS') {
                    ctx.beginPath();
                    ctx.moveTo(pos.x + w / 2, pos.y);
                    ctx.lineTo(pos.x + w / 2, pos.y + h);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(pos.x, pos.y + h / 2);
                    ctx.lineTo(pos.x + w, pos.y + h / 2);
                    ctx.stroke();
                }
            }

            // Block name
            ctx.fillStyle = stroke;
            ctx.font = `bold ${Math.max(11, Math.min(15, w / 8))}px -apple-system, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(block.name, pos.x + w / 2, pos.y + 8);

            // Bed count + length
            ctx.font = `${Math.max(9, Math.min(12, w / 10))}px -apple-system, system-ui, sans-serif`;
            ctx.fillStyle = stroke + 'CC';
            ctx.fillText(`${block.bedCount} beds × ${block.bedLengthFt}ft`, pos.x + w / 2, pos.y + 24);

            // Sq ft
            const sqFt = totalPlantedSqFt(block);
            ctx.font = `9px -apple-system, system-ui, sans-serif`;
            ctx.fillStyle = stroke + '88';
            ctx.fillText(`${sqFt.toLocaleString()} sq ft`, pos.x + w / 2, pos.y + h - 14);

            // Drag hint
            if (isDragging) {
                ctx.font = 'bold 9px sans-serif';
                ctx.fillStyle = stroke;
                ctx.fillText('◉ dragging', pos.x + w / 2, pos.y + 38);
            }
        });

        // Compass rose (fixed, top-right)
        ctx.restore();
        drawCompass(ctx, width - 50, 50, 30);
    }, [blocks, width, height]);

    useEffect(() => { redraw(); }, [blocks, redraw]);

    // ── Compass ───────────────────────────────────────────────────────────────
    function drawCompass(ctx, cx, cy, r) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(45,79,30,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();

        const dirs = [
            { l: 'N', a: -Math.PI / 2, c: '#C62828' },
            { l: 'S', a: Math.PI / 2, c: '#2D4F1E' },
            { l: 'E', a: 0, c: '#2D4F1E' },
            { l: 'W', a: Math.PI, c: '#2D4F1E' },
        ];
        dirs.forEach(({ l, a, c }) => {
            const tx = cx + Math.cos(a) * (r - 4);
            const ty = cy + Math.sin(a) * (r - 4);
            ctx.fillStyle = c;
            ctx.font = `bold ${l === 'N' ? 13 : 11}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(l, tx, ty);
        });
        ctx.restore();
    }

    // ── RoundRect helper ──────────────────────────────────────────────────────
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ── Hit test ──────────────────────────────────────────────────────────────
    function hitTest(canvasX, canvasY) {
        const st = stateRef.current;
        const wx = (canvasX - st.pan.x) / st.zoom;
        const wy = (canvasY - st.pan.y) / st.zoom;
        // Iterate in reverse so top-most block wins
        for (let i = blocks.length - 1; i >= 0; i--) {
            const block = blocks[i];
            const pos = st.positions[block.id];
            if (!pos) continue;
            const { w, h } = blockPixelSize(block, st.scale); // same scale as render
            if (wx >= pos.x && wx <= pos.x + w && wy >= pos.y && wy <= pos.y + h) {
                return block;
            }
        }
        return null;
    }

    // ── Pointer events ────────────────────────────────────────────────────────
    const getXY = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        if (e.touches) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        }
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e) => {
        const { x, y } = getXY(e);
        const st = stateRef.current;
        const block = hitTest(x, y);
        if (block) {
            const pos = st.positions[block.id] ?? { x: 0, y: 0 };
            st.dragging = { blockId: block.id, startX: x, startY: y, origX: pos.x, origY: pos.y, moved: false };
        } else {
            st.panning = true;
            st.panStart = { x: x - st.pan.x, y: y - st.pan.y };
        }
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        const { x, y } = getXY(e);
        const st = stateRef.current;
        if (st.dragging) {
            const dx = (x - st.dragging.startX) / st.zoom;
            const dy = (y - st.dragging.startY) / st.zoom;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) st.dragging.moved = true;
            st.positions[st.dragging.blockId] = {
                x: st.dragging.origX + dx,
                y: st.dragging.origY + dy,
            };
            redraw();
        } else if (st.panning && st.panStart) {
            st.pan = { x: x - st.panStart.x, y: y - st.panStart.y };
            redraw();
        }
        e.preventDefault();
    };

    const onPointerUp = (e) => {
        const st = stateRef.current;
        if (st.dragging) {
            const { blockId, moved } = st.dragging;
            if (!moved) {
                // Click — navigate to detail
                const block = blocks.find(b => b.id === blockId);
                if (block) onBlockClick(block);
            } else {
                // Snap + save
                const pos = st.positions[blockId];
                const snapped = { x: snap(pos.x), y: snap(pos.y) };
                st.positions[blockId] = snapped;
                onBlockMove(blockId, snapped);
                redraw();
            }
            st.dragging = null;
        }
        st.panning = false;
        st.panStart = null;
    };

    const onWheel = (e) => {
        const st = stateRef.current;
        const { x, y } = getXY(e);
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(3, Math.max(0.3, st.zoom * factor));
        // Zoom toward cursor
        st.pan.x = x - (x - st.pan.x) * (newZoom / st.zoom);
        st.pan.y = y - (y - st.pan.y) * (newZoom / st.zoom);
        st.zoom = newZoom;
        redraw();
        e.preventDefault();
    };

    // Zoom reset
    const resetView = () => {
        stateRef.current.pan = { x: 0, y: 0 };
        stateRef.current.zoom = 1;
        redraw();
    };

    if (Platform.OS !== 'web') {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: Colors.mutedText, fontStyle: 'italic', textAlign: 'center', padding: 32 }}>
                    The visual canvas is available in the web app.{'\n'}Use the list view on mobile.
                </Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{ display: 'block', cursor: 'grab', touchAction: 'none' }}
                onMouseDown={onPointerDown}
                onMouseMove={onPointerMove}
                onMouseUp={onPointerUp}
                onMouseLeave={onPointerUp}
                onTouchStart={onPointerDown}
                onTouchMove={onPointerMove}
                onTouchEnd={onPointerUp}
                onWheel={onWheel}
            />
            {/* Toolbar */}
            <View style={styles.toolbar}>
                <TouchableOpacity style={styles.toolBtn} onPress={resetView}>
                    <Text style={styles.toolBtnText}>⌂ Reset</Text>
                </TouchableOpacity>
                <Text style={styles.toolHint}>Drag blocks to arrange • scroll to zoom • click block to open</Text>
            </View>
        </View>
    );
}

// ─── Screen wrapper ──────────────────────────────────────────────────────────
export default function FarmCanvasScreen({ navigation, route }) {
    const farmProfile = route?.params?.farmProfile ?? null;
    const [blocks, setBlocks] = useState([]);
    const [dimensions, setDimensions] = useState({ w: 800, h: 600 });

    const planId = route?.params?.planId;

    useFocusEffect(useCallback(() => {
        setBlocks(loadBlocksForPlan(planId));
    }, [planId]));

    const handleMoveSave = useCallback((blockId, pos) => {
        // Save canvas position as gridPosition approximation
        const col = Math.round(pos.x / (SNAP_GRID * PX_PER_FT * 3));
        const row = Math.round(pos.y / (SNAP_GRID * PX_PER_FT * 3));
        const block = loadBlocksForPlan(planId).find(b => b.id === blockId);
        if (block) {
            saveBlock({ ...block, canvasPos: pos, gridPosition: { col: Math.min(2, Math.max(0, col)), row: Math.min(2, Math.max(0, row)), label: '' } });
        }
    }, []);

    const handleBlockClick = useCallback((block) => {
        navigation.navigate('BlockDetail', { block, farmProfile });
    }, [navigation, farmProfile]);

    const onLayout = (e) => {
        const { width, height } = e.nativeEvent.layout;
        setDimensions({ w: width, h: height });
    };

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
                    <Text style={styles.heading}>Visual Layout</Text>
                </View>
                <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => navigation.navigate('BlockSetupWizard', { farmProfile })}
                >
                    <Text style={styles.addBtnText}>+ Block</Text>
                </TouchableOpacity>
            </View>

            {/* Legend */}
            <View style={styles.legend}>
                <Text style={styles.legendText}>
                    {blocks.length} block{blocks.length !== 1 ? 's' : ''} ·{' '}
                    {blocks.reduce((s, b) => s + (b.bedCount ?? 0), 0)} total beds
                </Text>
                <Text style={styles.legendHint}>Drag ↔↕ to arrange • Scroll to zoom</Text>
            </View>

            {/* Canvas fill */}
            {blocks.length === 0 ? (
                <View style={styles.emptyView}>
                    <Text style={styles.emptyIcon}>🗺</Text>
                    <Text style={styles.emptyTitle}>No blocks yet</Text>
                    <Text style={styles.emptySubtitle}>Create blocks in the Farm Designer to visualize your layout.</Text>
                    <TouchableOpacity style={styles.emptyBtn}
                        onPress={() => navigation.navigate('BlockSetupWizard', { farmProfile })}>
                        <Text style={styles.emptyBtnText}>+ Create First Block</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={{ flex: 1 }} onLayout={onLayout}>
                    <FarmCanvas
                        blocks={blocks}
                        onBlockMove={handleMoveSave}
                        onBlockClick={handleBlockClick}
                        width={dimensions.w}
                        height={dimensions.h}
                    />
                </View>
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
    addBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    addBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.xs },

    legend: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 8, backgroundColor: 'rgba(45,79,30,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.1)' },
    legendText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primaryGreen },
    legendHint: { fontSize: 10, color: Colors.mutedText, fontStyle: 'italic' },

    toolbar: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
    toolBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.sm, paddingVertical: 8, paddingHorizontal: 14 },
    toolBtnText: { color: Colors.cream, fontWeight: '700', fontSize: Typography.xs },
    toolHint: { fontSize: 10, color: Colors.mutedText, fontStyle: 'italic', flex: 1 },

    emptyView: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
    emptyIcon: { fontSize: 52 },
    emptyTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.primaryGreen },
    emptySubtitle: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center', lineHeight: 20 },
    emptyBtn: { marginTop: 4, backgroundColor: Colors.primaryGreen, paddingVertical: 14, paddingHorizontal: 28, borderRadius: Radius.md },
    emptyBtnText: { color: Colors.cream, fontWeight: '800', fontSize: Typography.sm },
});
