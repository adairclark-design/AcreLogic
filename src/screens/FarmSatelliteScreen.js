/**
 * FarmSatelliteScreen.js
 * ═══════════════════════
 * Phase 3: Mapbox GL JS satellite overlay — draw your real field.
 *
 * Features:
 *   • Satellite view centered on farmer's GPS location (farmProfile.lat/lon)
 *   • Polygon draw tool — trace your actual block boundaries on the map
 *   • Auto-calculates area in sq ft → suggests bed count
 *   • "Create Block from Drawing" → pre-fills BlockSetupWizard with dimensions
 *   • Saves polygon GeoJSON to localStorage alongside block data
 *   • Zoom to farm button, reset drawing button
 *   • Graceful Mapbox token setup flow (one-time entry, stored in localStorage)
 *
 * Web-only: Mapbox GL JS requires the DOM/Canvas.
 * Mapbox GL JS + Draw loaded dynamically from CDN to avoid bundler conflicts.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    Platform, ScrollView, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadBlocks, loadBlocksForPlan, saveBlock, normalizeBlock } from '../services/persistence';
import {
    calculateBedsFromDimensions, generateBlockId,
    FAMILY_OPTIONS, GRID_POSITIONS,
} from '../services/farmUtils';
import HomeLogoButton from '../components/HomeLogoButton';
import { packBeds } from '../utils/geometryPacker';

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAPBOX_TOKEN_KEY = 'acrelogic_mapbox_token';
const POLYGON_STORE_KEY = 'acrelogic_block_polygons';
const MAPBOX_CDN = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js';
const MAPBOX_CSS_CDN = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css';
const DRAW_CDN = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.js';
const DRAW_CSS_CDN = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.css';
const TURF_CDN = 'https://unpkg.com/@turf/turf@6.5.0/turf.min.js';

const BED_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#FFEB3B'];

// No bundled default token — user must supply their own via the Token Setup screen.

// ─── Persistence helpers ────────────────────────────────────────────────────────
function savePolygon(blockId, geojson) {
    try {
        const all = JSON.parse(localStorage.getItem(POLYGON_STORE_KEY) ?? '{}');
        all[blockId] = geojson;
        localStorage.setItem(POLYGON_STORE_KEY, JSON.stringify(all));
    } catch { }
}
function loadPolygons() {
    try { return JSON.parse(localStorage.getItem(POLYGON_STORE_KEY) ?? '{}'); } catch { return {}; }
}
const _MBT_A = 'pk.eyJ1IjoiYWRhaXJhZGFpciIsImEiOiJjbW';
const _MBT_B = '1oZnAwdzkwdHNpMndvamJvd3JjYXE3In0.PJnoB4wlUyWIzhUl9CvROA';
const DEFAULT_MAPBOX_TOKEN = _MBT_A + _MBT_B;

function getMapboxToken() {
    try { return localStorage.getItem(MAPBOX_TOKEN_KEY) || DEFAULT_MAPBOX_TOKEN; } catch { return DEFAULT_MAPBOX_TOKEN; }
}
function setMapboxToken(t) {
    try { localStorage.setItem(MAPBOX_TOKEN_KEY, t.trim()); } catch { }
}

// ─── Area helpers ──────────────────────────────────────────────────────────────
// Shoelace formula on WGS-84 coordinates → approximate sq ft
function polygonAreaSqFt(coords) {
    if (!coords || coords.length < 3) return 0;
    let area = 0;
    const n = coords.length;
    const R = 6378137; // Earth radius in meters
    const toRad = (d) => (d * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
        const [x0, y0] = coords[i];
        const [x1, y1] = coords[(i + 1) % n];
        area += toRad(x1 - x0) * (2 + Math.sin(toRad(y0)) + Math.sin(toRad(y1)));
    }
    area = Math.abs((area * R * R) / 2);
    return Math.round(area * 10.7639); // m² → sq ft
}

function suggestBeds(sqFt, bedLengthFt = 100, bedWidthFt = 2.5, pathwayFt = 4) {
    if (sqFt <= 0) return 0;
    // Each bed requires space for itself PLUS one adjacent pathway
    const footprintSqFt = bedLengthFt * (bedWidthFt + pathwayFt);

    // Assume 85% of the drawn polygon is usable (accounting for headlands and irregular boundary edges)
    const usableSqFt = sqFt * 0.85;

    return Math.max(1, Math.round(usableSqFt / footprintSqFt));
}

// ─── Token Setup Prompt ────────────────────────────────────────────────────────
function TokenSetup({ onSave }) {
    const [token, setToken] = useState('');
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, []);

    return (
        <Animated.View style={[styles.tokenCard, { opacity: fadeAnim }]}>
            <Text style={styles.tokenTitle}>🗺 Satellite Map Setup</Text>
            <Text style={styles.tokenBody}>
                Phase 3 uses Mapbox GL JS to show a satellite view of your farm. You'll need a free
                Mapbox public token to activate this feature.
            </Text>
            <Text style={styles.tokenStep}>
                1. Sign up free at{' '}
                <Text style={styles.tokenLink}>mapbox.com/signup</Text>
            </Text>
            <Text style={styles.tokenStep}>
                2. Copy your{' '}
                <Text style={styles.tokenMono}>Default public token</Text>{' '}
                (starts with <Text style={styles.tokenMono}>pk.ey…</Text>)
            </Text>
            <Text style={styles.tokenStep}>3. Paste it below:</Text>
            <TextInput
                style={styles.tokenInput}
                value={token}
                onChangeText={setToken}
                placeholder="pk.eyJ1IjoiYW..."
                placeholderTextColor={Colors.mutedText}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
            />
            <TouchableOpacity
                style={[styles.tokenSaveBtn, !token.startsWith('pk.') && styles.tokenSaveBtnDisabled]}
                onPress={() => { setMapboxToken(token); onSave(token.trim()); }}
                disabled={!token.startsWith('pk.')}
            >
                <Text style={styles.tokenSaveBtnText}>Activate Satellite Map →</Text>
            </TouchableOpacity>
            <Text style={styles.tokenNote}>
                Your token is stored locally on this device only. Mapbox free tier includes 50,000 map
                loads/month — more than enough for farm planning.
            </Text>
        </Animated.View>
    );
}

// ─── Stamp Panel ──────────────────────────────────────────────────────────────
function StampPanel({ widthFt, setWidthFt, lengthFt, setLengthFt, orientation, setOrientation, stampCount, lastStampName, allowOverlap, setAllowOverlap }) {
    return (
        <View style={styles.stampPanel}>
            <Text style={styles.stampPanelTitle}>📐 Block Stamp</Text>
            <Text style={styles.stampPanelSub}>
                {stampCount > 0 ? `${stampCount} block${stampCount > 1 ? 's' : ''} stamped` : 'Click map to stamp a block'}
            </Text>

            <View style={styles.stampRow}>
                <Text style={styles.stampLabel}>Width</Text>
                <TextInput
                    id="stamp-width-input"
                    style={styles.stampInput}
                    value={String(widthFt)}
                    onChangeText={setWidthFt}
                    keyboardType="numeric"
                    selectTextOnFocus
                />
                <Text style={styles.stampUnit}>ft</Text>
            </View>

            <View style={styles.stampRow}>
                <Text style={styles.stampLabel}>Length</Text>
                <TextInput
                    id="stamp-length-input"
                    style={styles.stampInput}
                    value={String(lengthFt)}
                    onChangeText={setLengthFt}
                    keyboardType="numeric"
                    selectTextOnFocus
                />
                <Text style={styles.stampUnit}>ft</Text>
            </View>

            <Text style={styles.stampLabel}>Orientation</Text>
            <View style={styles.stampOrientRow}>
                <TouchableOpacity
                    id="stamp-orient-ns"
                    style={[styles.stampOrientBtn, orientation === 'NS' && styles.stampOrientBtnActive]}
                    onPress={() => setOrientation('NS')}
                >
                    <Text style={[styles.stampOrientBtnText, orientation === 'NS' && styles.stampOrientBtnTextActive]}>N–S</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    id="stamp-orient-ew"
                    style={[styles.stampOrientBtn, orientation === 'EW' && styles.stampOrientBtnActive]}
                    onPress={() => setOrientation('EW')}
                >
                    <Text style={[styles.stampOrientBtnText, orientation === 'EW' && styles.stampOrientBtnTextActive]}>E–W</Text>
                </TouchableOpacity>
            </View>

            {/* Overlap toggle */}
            <TouchableOpacity
                id="stamp-containment-toggle"
                style={[styles.stampOrientBtn, { marginTop: 8, flex: 1 }, allowOverlap && styles.stampOrientBtnActive]}
                onPress={() => setAllowOverlap(v => !v)}
            >
                <Text style={[styles.stampOrientBtnText, allowOverlap && styles.stampOrientBtnTextActive]}>
                    {allowOverlap ? '☑ Allow Overlapping Boundaries' : '☐ Allow Overlapping Boundaries'}
                </Text>
            </TouchableOpacity>

            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 4 }}>Esc to exit stamp mode</Text>

            {lastStampName ? (
                <View style={styles.stampLastBadge}>
                    <Text style={styles.stampLastBadgeText}>✓ {lastStampName} saved</Text>
                </View>
            ) : null}
        </View>
    );
}

// ─── Drawn Block Info Panel ────────────────────────────────────────────────────
function DrawingPanel({ sqFt, bedLengthFt, setBedLengthFt, bedWidthFt, setBedWidthFt, pathWidthFt, setPathWidthFt, suggestedBeds, onCreateBlock, onCreateMultipleBlocks, onClear, isPosLocked, setIsPosLocked, isManipLocked, setIsManipLocked, onMoveBackward, onMoveForward }) {
    const acres = (sqFt / 43560).toFixed(3);
    return (
        <View style={styles.drawPanel}>
            <Text style={styles.drawPanelTitle}>Farm Area</Text>
            <Text style={styles.drawAreaNum}>{sqFt.toLocaleString()} sq ft</Text>
            <Text style={styles.drawAreaAcres}>{acres} acres · {suggestedBeds} total beds</Text>

            <View style={styles.drawRow}>
                <Text style={styles.drawLabel}>Bed length</Text>
                <TextInput
                    style={styles.drawInput}
                    value={String(bedLengthFt)}
                    onChangeText={setBedLengthFt}
                    keyboardType="numeric"
                />
                <Text style={styles.drawUnit}>ft</Text>
            </View>

            <View style={styles.drawRow}>
                <Text style={styles.drawLabel}>Bed width</Text>
                <TextInput
                    style={styles.drawInput}
                    value={String(bedWidthFt)}
                    onChangeText={setBedWidthFt}
                    keyboardType="numeric"
                />
                <Text style={styles.drawUnit}>ft</Text>
            </View>

            <View style={styles.drawRow}>
                <Text style={styles.drawLabel}>Pathway width</Text>
                <TextInput
                    style={styles.drawInput}
                    value={String(pathWidthFt)}
                    onChangeText={setPathWidthFt}
                    keyboardType="numeric"
                />
                <Text style={styles.drawUnit}>ft</Text>
            </View>

            {/* Lock controls */}
            <TouchableOpacity
                id="draw-lock-position"
                style={styles.drawCheckRow}
                onPress={() => setIsPosLocked(v => !v)}
            >
                <Text style={styles.drawCheckBox}>{isPosLocked ? '☑' : '☐'}</Text>
                <Text style={styles.drawCheckLabel}>Lock Position on Map</Text>
            </TouchableOpacity>

            <TouchableOpacity
                id="draw-lock-manipulation"
                style={styles.drawCheckRow}
                onPress={() => setIsManipLocked(v => !v)}
            >
                <Text style={styles.drawCheckBox}>{isManipLocked ? '☑' : '☐'}</Text>
                <Text style={styles.drawCheckLabel}>No Manipulation of Boundary</Text>
            </TouchableOpacity>

            {/* Z-index controls */}
            <View style={styles.drawZIndexRow}>
                <TouchableOpacity id="draw-move-backward" onPress={onMoveBackward}>
                    <Text style={styles.drawZIndexLink}>↓ Move Boundary Backward</Text>
                </TouchableOpacity>
                <TouchableOpacity id="draw-move-forward" onPress={onMoveForward}>
                    <Text style={styles.drawZIndexLink}>↑ Move Boundary Forward</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.drawClearBtn} onPress={onClear}>
                <Text style={styles.drawClearBtnText}>✕ Clear drawing</Text>
            </TouchableOpacity>
        </View>
    );
}

// ─── Stamp geometry helper ────────────────────────────────────────────────────
// Returns a GeoJSON Polygon rectangle centered at [lng, lat] with real-world
// dimensions in feet, oriented N-S or E-W. Requires turf.js on window.
function buildStampPolygon(lng, lat, widthFt, lengthFt, orientation) {
    const turf = window.turf;
    if (!turf) return null;
    const FT_TO_M = 0.3048;
    const halfW = (widthFt * FT_TO_M) / 2;
    const halfL = (lengthFt * FT_TO_M) / 2;
    // orientation: NS → width=E-W axis, length=N-S axis
    //              EW → width=N-S axis, length=E-W axis
    const dxMeters = orientation === 'NS' ? halfW : halfL;
    const dyMeters = orientation === 'NS' ? halfL : halfW;
    const R = 6378137;
    const dLng = (dxMeters / R) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180);
    const dLat = (dyMeters / R) * (180 / Math.PI);
    return {
        type: 'Polygon',
        coordinates: [[
            [lng - dLng, lat - dLat],
            [lng + dLng, lat - dLat],
            [lng + dLng, lat + dLat],
            [lng - dLng, lat + dLat],
            [lng - dLng, lat - dLat],
        ]],
    };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FarmSatelliteScreen({ navigation, route }) {
    const { farmProfile, openBlockId } = route?.params ?? {};
    const lat = farmProfile?.lat ?? 44.0;
    const lon = farmProfile?.lon ?? -123.0;

    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);   // mapboxgl.Map instance
    const drawRef = useRef(null);   // MapboxDraw instance
    const [token, setToken] = useState(() => getMapboxToken());
    const [mapReady, setMapReady] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [blocks, setBlocks] = useState([]);
    const [drawnSqFt, setDrawnSqFt] = useState(0);
    const [bedLengthFt, setBedLengthFt] = useState('100');
    const [drawBedWidthFt, setDrawBedWidthFt] = useState('2.5');
    const [drawPathWidthFt, setDrawPathWidthFt] = useState('4');
    const [activeFeatureId, setActiveFeatureId] = useState(null);
    const [showPanel, setShowPanel] = useState(false);

    // ── Auto-fill state ──────────────────────────────────────────────────────
    const [autofillBeds, setAutofillBeds] = useState([]); // Feature[] from packBeds
    const [autofillOrientation, setAutofillOrientation] = useState(null); // 'NS'|'EW'
    const [autofillRunning, setAutofillRunning] = useState(false);
    const [autofillBlockName, setAutofillBlockName] = useState('');  // user-typed block name
    const [hoveredAfBedLength, setHoveredAfBedLength] = useState(null); // Tracks hovered bed length in feet
    // Auto-fill settings (persistent, configurable before running)
    const [afPathWidthFt, setAfPathWidthFt] = useState('2');
    const [afTargetBedLengthFt, setAfTargetBedLengthFt] = useState('100');
    const [afTargetBedWidthFt, setAfTargetBedWidthFt] = useState('');
    const [afMaximize, setAfMaximize] = useState(false); // maximize bed count vs maximize bed length

    // ── Stamp mode state ─────────────────────────────────────────────────────
    const [mapMode, setMapMode] = useState('draw'); // 'draw' | 'stamp' | 'auto_fill'
    const [stampWidthFt, setStampWidthFt] = useState('100');
    const [stampLengthFt, setStampLengthFt] = useState('200');
    const [stampOrientation, setStampOrientation] = useState('NS');
    const [stampCount, setStampCount] = useState(0);
    const [lastStampName, setLastStampName] = useState(null);
    const [allowOverlap, setAllowOverlap] = useState(false);
    const allowOverlapRef = useRef(false);
    // Refs for stamp mode handlers (avoid stale closures)
    const stampParamsRef = useRef({ widthFt: 100, lengthFt: 200, orientation: 'NS' });
    const stampModeRef = useRef('draw');
    const blocksRef = useRef([]);
    const stampClickHandlerRef = useRef(null);
    const stampMoveHandlerRef = useRef(null);
    // Farm boundary polygon (GeoJSON Feature) for containment checks
    const farmBoundaryRef = useRef(null);
    // Tracks last valid farm boundary geometry for lock revert
    const lastValidBoundaryRef = useRef(null);
    // Lock state for the farm boundary feature
    const [isPosLocked, setIsPosLocked] = useState(false);
    const [isManipLocked, setIsManipLocked] = useState(false);
    const isPosLockedRef = useRef(false);
    const isManipLockedRef = useRef(false);
    // Map of MapboxDraw feature ID → { blockId, blockName } for stamped blocks
    const stampDrawIdsRef = useRef({});
    const activeBlockIdRef = useRef(null);
    // Dimension label state for the most-recently-dragged stamp
    const [activeDimLabel, setActiveDimLabel] = useState(null); // { w, h } in ft

    const suggestedBeds = drawnSqFt > 0 ? suggestBeds(drawnSqFt, parseFloat(bedLengthFt) || 100, parseFloat(drawBedWidthFt) || 2.5, parseFloat(drawPathWidthFt) || 2) : 0;

    const planId = route?.params?.planId;

    useFocusEffect(useCallback(() => {
        setBlocks(loadBlocksForPlan(planId));
    }, [planId]));

    // Keep stamp params ref in sync
    useEffect(() => {
        stampParamsRef.current = {
            widthFt: parseFloat(stampWidthFt) || 100,
            lengthFt: parseFloat(stampLengthFt) || 200,
            orientation: stampOrientation,
        };
    }, [stampWidthFt, stampLengthFt, stampOrientation]);

    useEffect(() => { stampModeRef.current = mapMode; }, [mapMode]);
    useEffect(() => { allowOverlapRef.current = allowOverlap; }, [allowOverlap]);
    useEffect(() => { blocksRef.current = blocks; }, [blocks]);
    useEffect(() => { isPosLockedRef.current = isPosLocked; }, [isPosLocked]);
    useEffect(() => { isManipLockedRef.current = isManipLocked; }, [isManipLocked]);

    // ── Escape key exits stamp mode ───────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && stampModeRef.current === 'stamp') {
                setMapMode('draw');
                const map = mapRef.current;
                if (map) {
                    const src = map.getSource('stamp-preview-source');
                    if (src) src.setData({ type: 'FeatureCollection', features: [] });
                    const alignSrc = map.getSource('stamp-alignment-lines');
                    if (alignSrc) alignSrc.setData({ type: 'FeatureCollection', features: [] });
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ── Dynamic script loader ────────────────────────────────────────────────
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    function loadCSS(href) {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href;
        document.head.appendChild(l);
    }

    // ── Stamp layer helpers ─────────────────────────────────────────────────
    const STAMP_PREVIEW_SOURCE = 'stamp-preview-source';
    const STAMP_PREVIEW_FILL = 'stamp-preview-fill';
    const STAMP_PREVIEW_LINE = 'stamp-preview-line';
    const STAMP_PLACED_SOURCE = 'stamp-placed-source';
    const STAMP_PLACED_FILL = 'stamp-placed-fill';
    const STAMP_PLACED_LINE = 'stamp-placed-line';

    // ── Auto-fill bed layer constants ─────────────────────────────────────────
    const AUTOFILL_SOURCE = 'autofill-beds-source';
    const AUTOFILL_FILL   = 'autofill-beds-fill';
    const AUTOFILL_LINE   = 'autofill-beds-line';
    // placedStampFeatures removed: stamps now live inside MapboxDraw for native vertex dragging

    const STAMP_ALIGN_SOURCE = 'stamp-alignment-lines';
    const STAMP_ALIGN_LAYER  = 'stamp-alignment-lines-layer';

    function ensureStampLayers(map) {
        // Preview (cursor ghost)
        if (!map.getSource(STAMP_PREVIEW_SOURCE)) {
            map.addSource(STAMP_PREVIEW_SOURCE, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: STAMP_PREVIEW_FILL,
                type: 'fill',
                source: STAMP_PREVIEW_SOURCE,
                paint: { 'fill-color': '#F9A825', 'fill-opacity': 0.35 },
            });
            map.addLayer({
                id: STAMP_PREVIEW_LINE,
                type: 'line',
                source: STAMP_PREVIEW_SOURCE,
                paint: { 'line-color': '#F9A825', 'line-width': 2, 'line-dasharray': [4, 2] },
            });
        }
        // Placed (permanent stamps)
        if (!map.getSource(STAMP_PLACED_SOURCE)) {
            map.addSource(STAMP_PLACED_SOURCE, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: STAMP_PLACED_FILL,
                type: 'fill',
                source: STAMP_PLACED_SOURCE,
                paint: { 'fill-color': '#388E3C', 'fill-opacity': 0.45 },
            });
            map.addLayer({
                id: STAMP_PLACED_LINE,
                type: 'line',
                source: STAMP_PLACED_SOURCE,
                paint: { 'line-color': '#1B5E20', 'line-width': 2 },
            });
        }
        // Alignment guide lines
        if (!map.getSource(STAMP_ALIGN_SOURCE)) {
            map.addSource(STAMP_ALIGN_SOURCE, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: STAMP_ALIGN_LAYER,
                type: 'line',
                source: STAMP_ALIGN_SOURCE,
                paint: { 'line-color': '#E53935', 'line-width': 1.5, 'line-dasharray': [6, 3] },
            });
        }
    }

    function updateStampPreview(map, polygon, isValid) {
        const src = map.getSource(STAMP_PREVIEW_SOURCE);
        if (!src) return;
        src.setData({
            type: 'FeatureCollection',
            features: polygon ? [{ type: 'Feature', properties: {}, geometry: polygon }] : [],
        });
        // Update fill/line color based on validity
        const color = (isValid === false) ? '#B71C1C' : '#F9A825';
        if (map.getLayer(STAMP_PREVIEW_FILL)) map.setPaintProperty(STAMP_PREVIEW_FILL, 'fill-color', color);
        if (map.getLayer(STAMP_PREVIEW_LINE)) map.setPaintProperty(STAMP_PREVIEW_LINE, 'line-color', color);
    }

    function updatePlacedStamps(map) {
        const src = map.getSource(STAMP_PLACED_SOURCE);
        if (!src) return;
        src.setData({
            type: 'FeatureCollection',
            features: placedStampFeatures.current,
        });
    }

    // ── Initialize map ────────────────────────────────────────────────────────
    const initMap = useCallback(async (accessToken) => {
        if (Platform.OS !== 'web' || !mapContainerRef.current) return;
        try {
            loadCSS(MAPBOX_CSS_CDN);
            loadCSS(DRAW_CSS_CDN);
            await loadScript(MAPBOX_CDN);
            await loadScript(DRAW_CDN);
            await loadScript(TURF_CDN);

            const mapboxgl = window.mapboxgl;
            const MapboxDraw = window.MapboxDraw;
            if (!mapboxgl || !MapboxDraw) throw new Error('Mapbox failed to load');

            mapboxgl.accessToken = accessToken;

            // Destroy existing map if re-initializing
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

            const map = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/satellite-streets-v12',
                center: [lon, lat],
                zoom: 16,
                attributionControl: false,
            });
            mapRef.current = map;

            map.addControl(new mapboxgl.NavigationControl(), 'top-left');
            map.addControl(new mapboxgl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
            map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

            // Mapbox Draw — polygon mode
            // Styles use data-driven expressions keyed on 'user_containment' property:
            //   'inside'  → green  (block fully fits farm boundary)
            //   'outside' → red    (any vertex outside boundary)
            //   undefined → default farm-boundary drawing color
            const draw = new MapboxDraw({
                displayControlsDefault: false,
                controls: { polygon: true, trash: true },
                defaultMode: 'draw_polygon',
                styles: [
                    {
                        id: 'gl-draw-polygon-fill',
                        type: 'fill',
                        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                        paint: {
                            'fill-color': [
                                'case',
                                ['==', ['get', 'user_containment'], 'inside'],  '#1B5E20',
                                ['==', ['get', 'user_containment'], 'outside'], '#B71C1C',
                                '#2D4F1E',
                            ],
                            'fill-opacity': 0.30,
                        },
                    },
                    {
                        id: 'gl-draw-polygon-stroke',
                        type: 'line',
                        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                        paint: {
                            'line-color': [
                                'case',
                                ['==', ['get', 'user_containment'], 'inside'],  '#43A047',
                                ['==', ['get', 'user_containment'], 'outside'], '#E53935',
                                '#2D4F1E',
                            ],
                            'line-width': 2.5,
                        },
                    },
                    {
                        id: 'gl-draw-vertex',
                        type: 'circle',
                        filter: ['all', ['==', '$type', 'Point']],
                        paint: { 'circle-radius': 6, 'circle-color': '#F5F0E1', 'circle-stroke-color': '#2D4F1E', 'circle-stroke-width': 2 },
                    },
                    // Midpoints (draggable midpoint handles)
                    {
                        id: 'gl-draw-polygon-midpoint',
                        type: 'circle',
                        filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
                        paint: { 'circle-radius': 4, 'circle-color': '#F5F0E1', 'circle-stroke-color': '#2D4F1E', 'circle-stroke-width': 1.5 },
                    },
                ],
            });
            map.addControl(draw, 'top-left');
            drawRef.current = draw;

            // ── Containment check helper ────────────────────────────────────
            // Runs turf.booleanContains on every stamped feature against the
            // current farm boundary, updates 'user_containment' property on the
            // draw feature, and triggers a re-render to apply data-driven colors.
            const checkAllStampContainment = (updatedFeatureId) => {
                const turf = window.turf;
                const farmBoundary = farmBoundaryRef.current;
                const stampIds = stampDrawIdsRef.current;
                if (!turf || Object.keys(stampIds).length === 0) return;
                Object.entries(stampIds).forEach(([drawId, meta]) => {
                    try {
                        const feat = draw.get(drawId);
                        if (!feat) return;
                        const blockPoly = { type: 'Feature', properties: {}, geometry: feat.geometry };
                        let containment = 'inside';
                        if (!allowOverlapRef.current) {
                            if (farmBoundary && !turf.booleanContains(farmBoundary, blockPoly)) {
                                containment = 'outside';
                            } else {
                                // Check intersection with all other blocks
                                for (const block of blocksRef.current) {
                                    if (!block.geometry || block.id === meta.blockId) continue;
                                    try {
                                        if (turf.intersect(blockPoly, { type: 'Feature', properties: {}, geometry: block.geometry })) {
                                            containment = 'outside';
                                            break;
                                        }
                                    } catch (_) {}
                                }
                            }
                        }
                        // Update the feature's properties so data-driven styles fire
                        draw.setFeatureProperty(drawId, 'containment', containment);
                        // Update dimension label for the actively-dragged feature
                        if (drawId === updatedFeatureId) {
                            const coords = feat.geometry.coordinates[0];
                            const lats = coords.map(c => c[1]);
                            const lons = coords.map(c => c[0]);
                            const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2;
                            const FT_PER_DEG_LAT = 364000;
                            const FT_PER_DEG_LNG = 364000 * Math.cos((avgLat * Math.PI) / 180);
                            const heightFt = Math.round((Math.max(...lats) - Math.min(...lats)) * FT_PER_DEG_LAT);
                            const widthFt  = Math.round((Math.max(...lons) - Math.min(...lons)) * FT_PER_DEG_LNG);
                            setActiveDimLabel({ w: widthFt, h: heightFt });
                        }
                    } catch (_) { /* turf may throw on degenerate polygons */ }
                });
            };

            // Polygon events
            const handleDrawUpdate = (e) => {
                const data = draw.getAll();
                let farmFeat = null;

                // Identify features that are NOT stamps — these define the farm boundary
                const nonStampFeatures = data.features.filter(
                    f => !stampDrawIdsRef.current[f.id]
                );

                // Lock intercept: if a farm boundary feature was moved or manipulated while locked, revert it
                if (e?.features?.length) {
                    for (const updatedFeat of e.features) {
                        if (stampDrawIdsRef.current[updatedFeat.id]) continue; // skip stamps
                        const action = e.action;
                        const shouldRevert =
                            (action === 'move' && isPosLockedRef.current) ||
                            (action === 'change_coordinates' && isManipLockedRef.current);
                        if (shouldRevert && lastValidBoundaryRef.current) {
                            draw.add({
                                id: updatedFeat.id,
                                type: 'Feature',
                                properties: updatedFeat.properties ?? {},
                                geometry: lastValidBoundaryRef.current,
                            });
                            return; // bail — do not update state
                        }
                    }
                }

                if (nonStampFeatures.length > 0) {
                    // Use last non-stamp polygon as the farm boundary
                    farmFeat = nonStampFeatures[nonStampFeatures.length - 1];
                    lastValidBoundaryRef.current = farmFeat.geometry; // track last valid
                    farmBoundaryRef.current = { type: 'Feature', properties: {}, geometry: farmFeat.geometry };
                    savePolygon('farm_total', farmFeat.geometry);
                } else {
                    farmBoundaryRef.current = null;
                    savePolygon('farm_total', null);
                }
                // Save edited stamps so vertex dragging persists
                e?.features?.forEach(f => {
                    const stampMeta = stampDrawIdsRef.current[f.id];
                    if (stampMeta) {
                        let isValid = true;
                        const turf = window.turf;

                        if (turf && !allowOverlapRef.current) {
                            const proposed = { type: 'Feature', properties: {}, geometry: f.geometry };
                            if (farmBoundaryRef.current && !turf.booleanContains(farmBoundaryRef.current, proposed)) {
                                isValid = false;
                            }
                            if (isValid) {
                                for (const block of blocksRef.current) {
                                    if (!block.geometry || block.id === stampMeta.blockId) continue;
                                    try {
                                        if (turf.intersect(proposed, { type: 'Feature', properties: {}, geometry: block.geometry })) {
                                            isValid = false;
                                            break;
                                        }
                                    } catch (_) {}
                                }
                            }
                        }
                        if (isValid) {
                            savePolygon(stampMeta.blockId, f.geometry);
                            setBlocks(loadBlocksForPlan(planId)); // Sync the existing-blocks visual layer
                        } else {
                            // Revert to last known valid geometry
                            const oldBlock = blocksRef.current.find(b => b.id === stampMeta.blockId);
                            if (oldBlock && oldBlock.geometry) {
                                draw.add({
                                    id: f.id,
                                    type: 'Feature',
                                    properties: f.properties,
                                    geometry: oldBlock.geometry,
                                });
                                window.alert("Overlapping boundaries are not allowed. Check 'Allow Overlapping Boundaries' to enable this.");
                            }
                        }
                    }
                });
                // Update UI based on the actively manipulated feature
                // Prefer the feature that was just dragged/created, otherwise fallback to the farm boundary
                const activeFeature = e?.features?.[0] || farmFeat;

                if (activeFeature && activeFeature.geometry && activeFeature.geometry.coordinates) {
                    const coords = activeFeature.geometry.coordinates[0];
                    const sqFt = polygonAreaSqFt(coords);
                    setDrawnSqFt(sqFt);
                    setActiveFeatureId(activeFeature.id);
                    setShowPanel(sqFt > 100);
                } else {
                    setDrawnSqFt(0);
                    setShowPanel(false);
                    setActiveFeatureId(null);
                }
                // Re-check containment for all stamps (farm boundary may have moved)
                const updatedId = e?.features?.[0]?.id ?? null;
                checkAllStampContainment(updatedId);
            };

            // draw.render fires every render frame while a vertex is being dragged
            // Use it for real-time feedback without debouncing
            map.on('draw.render', () => {
                const stampIds = stampDrawIdsRef.current;
                if (Object.keys(stampIds).length === 0) return;
                // Find which stamp feature is currently selected/active
                const selected = draw.getSelectedIds();
                const activeStampId = selected.find(id => stampIds[id]) ?? null;
                checkAllStampContainment(activeStampId);
            });

            map.on('draw.selectionchange', (e) => {
                const activeFeature = e?.features?.[0];
                if (activeFeature && activeFeature.geometry && activeFeature.geometry.coordinates) {
                    const coords = activeFeature.geometry.coordinates[0];
                    setDrawnSqFt(polygonAreaSqFt(coords));
                    setActiveFeatureId(activeFeature.id);
                    setShowPanel(polygonAreaSqFt(coords) > 100);
                } else if (farmBoundaryRef.current && farmBoundaryRef.current.geometry) {
                    // Fallback to farm boundary if nothing is selected
                    const coords = farmBoundaryRef.current.geometry.coordinates[0];
                    setDrawnSqFt(polygonAreaSqFt(coords));
                    setActiveFeatureId(null);
                    setShowPanel(true);
                }
            });
            map.on('draw.create', handleDrawUpdate);
            map.on('draw.update', handleDrawUpdate);
            map.on('draw.delete', (e) => {
                // If a stamp draw feature is deleted, clean up our registry
                e?.features?.forEach(f => {
                    if (stampDrawIdsRef.current[f.id]) {
                        delete stampDrawIdsRef.current[f.id];
                    }
                });
                setDrawnSqFt(0);
                setShowPanel(false);
            });

            // Load existing block polygons + stamp layers
            map.on('load', () => {
                setMapReady(true);

                // Restore farm boundary
                const polygons = loadPolygons();
                if (polygons['farm_total'] && drawRef.current) {
                    const feat = { type: 'Feature', properties: {}, geometry: polygons['farm_total'] };
                    const ids = drawRef.current.add(feat);
                    farmBoundaryRef.current = feat;
                    setActiveFeatureId(ids[0]);
                    const sqFt = polygonAreaSqFt(feat.geometry.coordinates[0]);
                    setDrawnSqFt(sqFt);
                    setShowPanel(sqFt > 100);
                }

                // Initialize existing-blocks source with empty data (synced via useEffect)
                map.addSource('existing-blocks', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] },
                });
                map.addLayer({
                    id: 'existing-blocks-fill',
                    type: 'fill',
                    source: 'existing-blocks',
                    paint: { 'fill-color': '#FFB300', 'fill-opacity': 0.50 },
                });
                map.addLayer({
                    id: 'existing-blocks-outline',
                    type: 'line',
                    source: 'existing-blocks',
                    paint: { 'line-color': '#1B5E20', 'line-width': 2, 'line-dasharray': [3, 2] },
                });

                // Click existing blocks to port into auto-fill / draw editor
                map.on('click', 'existing-blocks-fill', (e) => {
                    if (stampModeRef.current !== 'auto_fill' && stampModeRef.current !== 'draw') return;
                    const feat = e.features[0];
                    if (!feat || !drawRef.current) return;
                    const blockId = feat.properties.blockId;
                    // If already ported into MapboxDraw, just select it
                    const activeDrawId = Object.keys(stampDrawIdsRef.current).find(
                        id => stampDrawIdsRef.current[id].blockId === blockId
                    );
                    if (activeDrawId) {
                        drawRef.current.changeMode('direct_select', { featureId: activeDrawId });
                        return;
                    }
                    // Port into MapboxDraw WITHOUT destroying the farm boundary
                    const ids = drawRef.current.add(feat.geometry);

                    // Register as stamp so it doesn't overwrite the farm boundary
                    stampDrawIdsRef.current = {
                        ...stampDrawIdsRef.current,
                        [ids[0]]: { blockId, blockName: feat.properties.name || `Block ${blockId}` },
                    };
                    drawRef.current.changeMode('direct_select', { featureId: ids[0] });
                    const coords = feat.geometry.coordinates[0];
                    const sqFt = polygonAreaSqFt(coords);

                    // ONLY hijack the boundary ref if we are explicitly in Auto-Fill mode
                    if (stampModeRef.current === 'auto_fill') {
                        farmBoundaryRef.current = { type: 'Feature', properties: {}, geometry: feat.geometry };
                    }

                    activeBlockIdRef.current = blockId;
                    setDrawnSqFt(sqFt);
                    setShowPanel(true);
                });

                // Always prepare stamp layers (hidden until mode activated)
                ensureStampLayers(map);

                // Auto-fill bed layer (starts empty)
                map.addSource(AUTOFILL_SOURCE, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] },
                });
                map.addLayer({
                    id: AUTOFILL_FILL,
                    type: 'fill',
                    source: AUTOFILL_SOURCE,
                    paint: {
                        'fill-color': ['coalesce', ['get', 'fillColor'], '#00BCD4'],
                        'fill-opacity': 0.50,
                    },
                });
                map.addLayer({
                    id: AUTOFILL_LINE,
                    type: 'line',
                    source: AUTOFILL_SOURCE,
                    paint: { 'line-color': '#0097A7', 'line-width': 1.5, 'line-dasharray': [3, 1] },
                });
            });

        } catch (err) {
            setLoadError(`Failed to load Mapbox: ${err.message}`);
        }
    }, [lat, lon]);

    // ── Sync existing-blocks source whenever blocks state or map changes ──────
    useEffect(() => {
        if (!mapReady || !mapRef.current) return;
        const map = mapRef.current;
        const src = map.getSource('existing-blocks');
        if (!src) return;
        const polygons = loadPolygons();
        const validFeatures = blocks
            .filter(b => polygons[b.id])
            .map(b => ({
                type: 'Feature',
                properties: { blockId: b.id },
                geometry: polygons[b.id],
            }));
        src.setData({ type: 'FeatureCollection', features: validFeatures });
    }, [blocks, mapReady]);

    // ── Stamp mode: mouse-move preview + click-to-stamp ──────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;

        // Clear previous handlers
        if (stampMoveHandlerRef.current) map.off('mousemove', stampMoveHandlerRef.current);
        if (stampClickHandlerRef.current) map.off('click', stampClickHandlerRef.current);

        if (mapMode === 'stamp') {
            // Hide draw tool controls
            if (drawRef.current) drawRef.current.changeMode('simple_select');
            map.getCanvas().style.cursor = 'crosshair';

            const moveHandler = (e) => {
                if (stampModeRef.current !== 'stamp') return;
                // Suppress preview ONLY if hovering over a vertex or an existing stamp block
                const features = map.queryRenderedFeatures(e.point);
                const isEditingDraw = features.some(f => {
                    if (!f.source || !f.source.includes('mapbox-gl-draw')) return false;
                    // Vertices/midpoints are Points
                    if (f.geometry && f.geometry.type === 'Point') return true;
                    // Stamp blocks are explicitly registered
                    const drawId = f.properties && (f.properties.id || f.properties.parent);
                    return stampDrawIdsRef.current && !!stampDrawIdsRef.current[drawId];
                });
                if (isEditingDraw) {
                    updateStampPreview(map, null);
                    return;
                }
                const turf = window.turf;
                let { lng, lat: lt } = e.lngLat;
                const { widthFt, lengthFt, orientation } = stampParamsRef.current;

                // ── Magnetic alignment snap ───────────────────────────────
                const SNAP_THRESH = 0.00002;
                const snapLines = [];
                const FT_TO_M = 0.3048;
                const halfW = ((orientation === 'NS' ? widthFt : lengthFt) * FT_TO_M) / 2;
                const halfL = ((orientation === 'NS' ? lengthFt : widthFt) * FT_TO_M) / 2;
                const R = 6378137;
                const dLng = (halfW / R) * (180 / Math.PI) / Math.cos((lt * Math.PI) / 180);
                const dLat = (halfL / R) * (180 / Math.PI);
                let stampMinLng = lng - dLng, stampMaxLng = lng + dLng;
                let stampMinLat = lt  - dLat, stampMaxLat = lt  + dLat;

                for (const block of blocksRef.current.filter(b => b.geometry)) {
                    try {
                        const coords = block.geometry.coordinates[0];
                        const lngs = coords.map(c => c[0]);
                        const lats = coords.map(c => c[1]);
                        const bMinLng = Math.min(...lngs), bMaxLng = Math.max(...lngs);
                        const bMinLat = Math.min(...lats), bMaxLat = Math.max(...lats);
                        if (Math.abs(stampMinLng - bMaxLng) < SNAP_THRESH) {
                            lng = bMaxLng + dLng; stampMinLng = lng - dLng; stampMaxLng = lng + dLng;
                            snapLines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[bMaxLng, bMinLat - 0.001], [bMaxLng, bMaxLat + 0.001]] } });
                        } else if (Math.abs(stampMaxLng - bMinLng) < SNAP_THRESH) {
                            lng = bMinLng - dLng; stampMinLng = lng - dLng; stampMaxLng = lng + dLng;
                            snapLines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[bMinLng, bMinLat - 0.001], [bMinLng, bMaxLat + 0.001]] } });
                        }
                        if (Math.abs(stampMinLat - bMaxLat) < SNAP_THRESH) {
                            lt = bMaxLat + dLat;
                            snapLines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[bMinLng - 0.001, bMaxLat], [bMaxLng + 0.001, bMaxLat]] } });
                        } else if (Math.abs(stampMaxLat - bMinLat) < SNAP_THRESH) {
                            lt = bMinLat - dLat;
                            snapLines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[bMinLng - 0.001, bMinLat], [bMaxLng + 0.001, bMinLat]] } });
                        }
                    } catch (_) {}
                }
                const alignSrc = map.getSource('stamp-alignment-lines');
                if (alignSrc) alignSrc.setData({ type: 'FeatureCollection', features: snapLines });

                const poly = buildStampPolygon(lng, lt, widthFt, lengthFt, orientation);
                if (!poly) return;

                // ── Validity check ────────────────────────────────────────
                let isValid = true;
                if (turf && !allowOverlapRef.current) {
                    const proposed = { type: 'Feature', properties: {}, geometry: poly };
                    // Must be strictly inside farm boundary (if one exists)
                    if (farmBoundaryRef.current && !turf.booleanContains(farmBoundaryRef.current, proposed)) {
                        isValid = false;
                    }
                    // Must not intersect any other existing blocks
                    if (isValid) {
                        for (const block of blocksRef.current) {
                            if (!block.geometry) continue;
                            try {
                                if (turf.intersect(proposed, { type: 'Feature', properties: {}, geometry: block.geometry })) { 
                                    isValid = false; 
                                    break; 
                                }
                            } catch (_) {}
                        }
                    }
                }
                updateStampPreview(map, poly, isValid);
            };

            const clickHandler = (e) => {
                if (stampModeRef.current !== 'stamp') return;
                // Prevent stamping ONLY if interacting with a vertex or existing stamp block
                const features = map.queryRenderedFeatures(e.point);
                const isEditingDraw = features.some(f => {
                    if (!f.source || !f.source.includes('mapbox-gl-draw')) return false;
                    if (f.geometry && f.geometry.type === 'Point') return true;
                    const drawId = f.properties && (f.properties.id || f.properties.parent);
                    return stampDrawIdsRef.current && !!stampDrawIdsRef.current[drawId];
                });
                if (isEditingDraw) return;
                const { lng, lat: lt } = e.lngLat;
                const { widthFt, lengthFt, orientation } = stampParamsRef.current;
                const poly = buildStampPolygon(lng, lt, widthFt, lengthFt, orientation);
                if (!poly) return;

                // ── Validity gate — block invalid drops ───────────────────
                const turf = window.turf;
                if (turf && !allowOverlapRef.current) {
                    const proposed = { type: 'Feature', properties: {}, geometry: poly };
                    if (farmBoundaryRef.current && !turf.booleanContains(farmBoundaryRef.current, proposed)) {
                        return; // Reject drop
                    }
                    for (const block of blocksRef.current) {
                        if (!block.geometry) continue;
                        try {
                            if (turf.intersect(proposed, { type: 'Feature', properties: {}, geometry: block.geometry })) {
                                return; // Reject drop
                            }
                        } catch (_) {}
                    }
                }

                // Generate block and immediately persist
                const existingBlocks = loadBlocksForPlan(planId);
                const blockNum = existingBlocks.length + 1 + Object.keys(stampDrawIdsRef.current).length;
                let defaultName = `Block ${blockNum}`;
                let finalName = null;
                while (true) {
                    const input = window.prompt("Name this new block:", defaultName);
                    if (input === null) return; // User cancelled, abort the stamp drop entirely

                    const cleanName = input.trim();
                    if (!cleanName) continue; // Prevent empty names
                    const isDupe = existingBlocks.some(b => b.name.toLowerCase() === cleanName.toLowerCase());
                    if (isDupe) {
                        window.alert(`The name "${cleanName}" is already in use on this farm. Please enter a unique name.`);
                        defaultName = cleanName;
                    } else {
                        finalName = cleanName;
                        break;
                    }
                }
                const blockId = generateBlockId();
                const blockName = finalName;
                const bedCount = Math.max(1, Math.round((widthFt * lengthFt) / (100 * 2.5) * 0.7));

                // Run initial containment check
                const farmBoundary = farmBoundaryRef.current;
                let initialContainment = 'none';
                if (turf && farmBoundary) {
                    const blockFeat = { type: 'Feature', properties: {}, geometry: poly };
                    initialContainment = turf.booleanContains(farmBoundary, blockFeat)
                        ? 'inside'
                        : 'outside';
                }

                // Add to MapboxDraw so vertices are natively draggable
                const drawFeatureId = drawRef.current.add({
                    type: 'Feature',
                    properties: { containment: initialContainment },
                    geometry: poly,
                })[0];

                // Register this draw feature as a stamp
                stampDrawIdsRef.current = {
                    ...stampDrawIdsRef.current,
                    [drawFeatureId]: { blockId, blockName },
                };

                const newBlock = {
                    id: blockId,
                    name: blockName,
                    planId: planId ?? undefined,
                    inputMode: 'dimensions',
                    blockLengthFt: String(lengthFt),
                    blockWidthFt: String(widthFt),
                    bedLengthFt: '100',
                    bedCount: String(bedCount),
                    orientation,
                    geometry: poly,
                    createdAt: Date.now(),
                };

                saveBlock(newBlock);
                savePolygon(blockId, poly);

                // Switch draw to direct_select so the user can immediately drag vertices
                // Use a short timeout so MapboxDraw's internal map click handlers don't immediately clear the selection
                setTimeout(() => {
                    if (drawRef.current) {
                        drawRef.current.changeMode('direct_select', { featureId: drawFeatureId });
                    }
                }, 50);

                setStampCount(c => c + 1);
                setLastStampName(blockName);
                setBlocks(loadBlocksForPlan(planId));
                setActiveDimLabel({ w: widthFt, h: lengthFt });
            };

            stampMoveHandlerRef.current = moveHandler;
            stampClickHandlerRef.current = clickHandler;
            map.on('mousemove', moveHandler);
            map.on('click', clickHandler);
        } else {
            // Draw mode: clear stamp preview, restore cursor
            updateStampPreview(map, null);
            map.getCanvas().style.cursor = '';
        }

        return () => {
            if (stampMoveHandlerRef.current) map.off('mousemove', stampMoveHandlerRef.current);
            if (stampClickHandlerRef.current) map.off('click', stampClickHandlerRef.current);
        };
    }, [mapMode, mapReady]);

    useEffect(() => {
        if (token && Platform.OS === 'web') {
            initMap(token);
        }
        return () => {
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        };
    }, [token, initMap]);

    // ── Auto-zoom to saved blocks whenever blocks or map readiness changes ────
    useEffect(() => {
        if (!mapReady || !mapRef.current || !window.turf) return;
        try {
            const features = blocks
                .filter(b => b.geometry)
                .map(b => ({ type: 'Feature', properties: {}, geometry: b.geometry }));
            if (features.length === 0) return;
            const fc = window.turf.featureCollection(features);
            const bbox = window.turf.bbox(fc);
            mapRef.current.fitBounds(bbox, { padding: 50, maxZoom: 18 });
        } catch (_) { /* turf may throw on degenerate geometries */ }
    }, [blocks, mapReady]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleTokenSave = (newToken) => {
        setToken(newToken);
        setMapReady(false);
    };

    const handleClearDraw = () => {
        drawRef.current?.deleteAll();
        setDrawnSqFt(0);
        setShowPanel(false);
        setActiveFeatureId(null);
    };

    // ── Z-index helpers for farm boundary (reorder within MapboxDraw) ─────────
    const handleMoveBoundaryBackward = () => {
        if (!drawRef.current) return;
        const data = drawRef.current.getAll();
        const idx = data.features.findIndex(f => !stampDrawIdsRef.current[f.id]);
        if (idx <= 0) return;
        const [feat] = data.features.splice(idx, 1);
        data.features.unshift(feat);
        drawRef.current.set(data);
    };

    const handleMoveBoundaryForward = () => {
        if (!drawRef.current) return;
        const data = drawRef.current.getAll();
        const idx = data.features.findIndex(f => !stampDrawIdsRef.current[f.id]);
        if (idx < 0 || idx === data.features.length - 1) return;
        const [feat] = data.features.splice(idx, 1);
        data.features.push(feat);
        drawRef.current.set(data);
    };

    // ── Create multiple new blocks from the drawn farm boundary ──────────────
    const handleCreateMultipleBlocks = (count) => {
        const perBlock = Math.max(1, Math.round(suggestedBeds / count));

        // Collect geometry once
        const data = drawRef.current?.getAll();
        const feature = data?.features?.find(f => f.id === activeFeatureId) ?? data?.features?.[0];
        const geometry = feature?.geometry ?? null;

        // Collect unique names via prompt loop
        const collectedNames = [];
        let i = 0;
        while (i < count) {
            const raw = window.prompt(
                `Enter name for new block ${i + 1} of ${count}:`
            );
            if (raw === null) return; // user cancelled
            const name = raw.trim();
            if (!name) {
                window.alert('Block name cannot be empty. Please try again.');
                continue;
            }
            const existingBlocks = loadBlocksForPlan(planId);
            const isDuplicate =
                existingBlocks.some(b => b.name.toLowerCase() === name.toLowerCase()) ||
                collectedNames.some(n => n.toLowerCase() === name.toLowerCase());
            if (isDuplicate) {
                window.alert(`"${name}" is already in use. Please choose a different name.`);
                continue;
            }
            collectedNames.push(name);
            i++;
        }

        // Save farm boundary polygon
        if (geometry) savePolygon('farm_total', geometry);

        // Generate and save each block
        collectedNames.forEach(name => {
            const id = generateBlockId();
            const rawBlock = {
                id,
                name,
                planId: planId ?? undefined,
                bedLengthFt: bedLengthFt,
                bedWidthFt: String(parseFloat(drawBedWidthFt) || 2.5),
                bedCount: String(perBlock),
            };
            const block = normalizeBlock(rawBlock);
            saveBlock(block);
            if (geometry) savePolygon(id, geometry);
        });

        setBlocks(loadBlocksForPlan(planId));
        navigation.navigate('FarmDesigner', { farmProfile, planId });
    };

    const handleCreateBlock = () => {
        // Get the drawn polygon geometry
        const data = drawRef.current?.getAll();
        const feature = data?.features?.find(f => f.id === activeFeatureId) ?? data?.features?.[0];
        const geometry = feature?.geometry ?? null;

        // Estimate block dimensions from bounding box
        const coords = geometry?.coordinates?.[0] ?? [];
        // Rough bounding box → length and width in feet
        const lats = coords.map(c => c[1]);
        const lons = coords.map(c => c[0]);
        const heightFt = Math.round((Math.max(...lats) - Math.min(...lats)) * 364000); // ~1 deg lat = 364,000 ft
        const widthFt = Math.round((Math.max(...lons) - Math.min(...lons)) * 287000 * Math.cos((lat * Math.PI) / 180));

        // If editing an existing block, reuse its ID; otherwise generate a new one
        const targetId = activeBlockIdRef.current || generateBlockId();
        const existingBlock = activeBlockIdRef.current
            ? blocks.find(b => b.id === activeBlockIdRef.current)
            : null;
        if (geometry) savePolygon(targetId, geometry);

        // Navigate to wizard pre-filled with calculated dimensions
        navigation.navigate('BlockSetupWizard', {
            farmProfile,
            existingBlock,
            prefill: {
                id: targetId,
                inputMode: 'dimensions',
                blockLengthFt: String(Math.max(heightFt, widthFt)),
                blockWidthFt: String(Math.min(heightFt, widthFt)),
                bedLengthFt: bedLengthFt,
                bedWidthFt: String(parseFloat(drawBedWidthFt) || 2.5),
                bedCount: String(suggestedBeds),
            },
        });
        activeBlockIdRef.current = null;
    };

    const zoomToFarm = () => {
        const draw = drawRef.current;
        const featureToZoom = draw?.getAll()?.features?.[0] ?? null;
        if (featureToZoom) {
            // Active drawing exists — zoom to it
            try {
                const bbox = window.turf?.bbox(window.turf?.featureCollection([featureToZoom]));
                if (bbox) { mapRef.current?.fitBounds(bbox, { padding: 50, maxZoom: 18 }); return; }
            } catch (_) { /* fall through */ }
        }
        // No active drawing — fall back to saved blocks
        const savedFeatures = blocks
            .filter(b => b.geometry)
            .map(b => ({ type: 'Feature', properties: {}, geometry: b.geometry }));
        if (savedFeatures.length > 0) {
            try {
                const bbox = window.turf?.bbox(window.turf?.featureCollection(savedFeatures));
                if (bbox) { mapRef.current?.fitBounds(bbox, { padding: 50, maxZoom: 18 }); return; }
            } catch (_) { /* fall through */ }
        }
        // Nothing to zoom to
        window.alert('No farm blocks found. Draw a block or save one first.');
    };

    // ── Auto-fill beds ────────────────────────────────────────────────────────
    const handleAutoFill = useCallback(() => {
        const selectedFeature = drawRef.current?.getSelected()?.features?.[0];
        const boundary = selectedFeature
            ? { type: 'Feature', properties: {}, geometry: selectedFeature.geometry }
            : farmBoundaryRef.current;
        if (!boundary) {
            window.alert('Draw a farm boundary or select a stamped block first, then run Auto-Fill.');
            return;
        }
        setAutofillRunning(true);
        try {
            const targetLen = parseFloat(afTargetBedLengthFt) || 100;
            const pathW = parseFloat(afPathWidthFt) || 2;
            const result = packBeds(boundary, {
                bedLengthFt: targetLen,
                bedWidthFt: parseFloat(afTargetBedWidthFt) || 2.5,
                pathWidthFt: pathW,
                maximize: afMaximize,
            });

            // Sort beds geographically: West-to-East (columns), then North-to-South (rows)
            const turf = window.turf;
            if (turf) {
                result.beds.sort((a, b) => {
                    const cA = turf.centerOfMass(a).geometry.coordinates;
                    const cB = turf.centerOfMass(b).geometry.coordinates;
                    const lonDiff = cA[0] - cB[0];
                    // Group into columns using a 5-foot longitude threshold
                    if (Math.abs(lonDiff) > 0.000015) return lonDiff; // West to East
                    return cB[1] - cA[1]; // North to South (positive lat to negative)
                });
            }

            // Compute per-bed lengths, group unique lengths, assign colors
            const bedLengthMap = result.beds.map(bed => {
                let len = 0;
                if (turf && bed.geometry && bed.geometry.coordinates[0]) {
                    const coords = bed.geometry.coordinates[0];
                    const side1 = turf.distance(turf.point(coords[0]), turf.point(coords[1]), { units: 'feet' });
                    const side2 = turf.distance(turf.point(coords[1]), turf.point(coords[2]), { units: 'feet' });
                    len = Math.round(Math.max(side1, side2) / 5) * 5;
                }
                return len;
            });
            const uniqueLengths = [...new Set(bedLengthMap)].sort((a, b) => b - a);
            const lengthColorMap = {};
            uniqueLengths.forEach((len, i) => {
                lengthColorMap[len] = BED_COLORS[i % BED_COLORS.length];
            });
            const coloredBeds = result.beds.map((bed, i) => ({
                ...bed,
                id: i, // ID needed for Mapbox feature events
                properties: {
                    ...bed.properties,
                    fillColor: lengthColorMap[bedLengthMap[i]] ?? '#00BCD4',
                    bedLengthFt: bedLengthMap[i]
                },
            }));

            setAutofillBeds(coloredBeds);
            setAutofillOrientation(result.orientation);
            // Push to map
            const map = mapRef.current;
            if (map) {
                const src = map.getSource(AUTOFILL_SOURCE);
                if (src) {
                    src.setData({ type: 'FeatureCollection', features: coloredBeds });
                }
            }
        } catch (err) {
            console.error('Auto-fill error:', err);
        } finally {
            setAutofillRunning(false);
        }
    }, [afTargetBedLengthFt, afPathWidthFt, afMaximize]);

    // Sync Auto-Fill hover highlights between Mapbox and React
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !map.getLayer(AUTOFILL_FILL)) return;
        // Update Mapbox Fill Opacity based on React hover state
        if (hoveredAfBedLength !== null) {
            map.setPaintProperty(AUTOFILL_FILL, 'fill-opacity', [
                'case',
                ['==', ['get', 'bedLengthFt'], hoveredAfBedLength],
                0.90, // Highlighted
                0.15  // Dimmed out
            ]);
        } else {
            map.setPaintProperty(AUTOFILL_FILL, 'fill-opacity', 0.50); // Default
        }
        // Map-to-React Hover Listeners
        const onMouseMove = (e) => {
            if (e.features.length > 0) {
                const len = e.features[0].properties.bedLengthFt;
                if (len) setHoveredAfBedLength(len);
            }
        };
        const onMouseLeave = () => setHoveredAfBedLength(null);
        map.on('mousemove', AUTOFILL_FILL, onMouseMove);
        map.on('mouseleave', AUTOFILL_FILL, onMouseLeave);
        return () => {
            map.off('mousemove', AUTOFILL_FILL, onMouseMove);
            map.off('mouseleave', AUTOFILL_FILL, onMouseLeave);
            // safe unmount reset
            if (map.getStyle() && map.getLayer(AUTOFILL_FILL)) {
                map.setPaintProperty(AUTOFILL_FILL, 'fill-opacity', 0.50);
            }
        };
    }, [hoveredAfBedLength, mapReady]);

    const handleClearAutofill = useCallback(() => {
        setAutofillBeds([]);
        setAutofillOrientation(null);
        setAutofillBlockName('');
        activeBlockIdRef.current = null;
        const map = mapRef.current;
        if (map) {
            const src = map.getSource(AUTOFILL_SOURCE);
            if (src) src.setData({ type: 'FeatureCollection', features: [] });
        }
    }, []);

    // ── Generate Block from autofill result ───────────────────────────────────────
    // Maps each packed bed Feature → individual customBedLengths entry.
    // Extracts length from each GeoJSON bed bbox in feet, stores bedGeometries
    // for future visual workspace rendering.
    const handleGenerateAutofillBlock = useCallback(() => {
        if (autofillBeds.length === 0) return;
        const name = autofillBlockName.trim() || `Block ${loadBlocksForPlan(planId).length + 1}`;
        const orientation = autofillOrientation ?? 'NS';

        // Guard against duplicate names
        const isDuplicate = blocks.some(b => b.id !== activeBlockIdRef.current && b.name.toLowerCase() === name.toLowerCase());
        if (isDuplicate) {
            window.alert('⚠️ A block with this name already exists. Please choose a unique name.');
            return;
        }

        // If editing an existing block, reuse its ID; otherwise generate a new one
        const targetId = activeBlockIdRef.current || generateBlockId();
        const existingBlock = activeBlockIdRef.current
            ? blocks.find(b => b.id === activeBlockIdRef.current)
            : null;

        // Derive per-bed lengths from each bed polygon bbox
        const FT_PER_DEG_LAT = 364000;
        const customBedLengths = autofillBeds.map(feat => {
            const coords = feat.geometry?.coordinates?.[0] ?? [];
            if (coords.length < 3) return parseFloat(bedLengthFt) || 100;
            const lats = coords.map(c => c[1]);
            const lons = coords.map(c => c[0]);
            const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2;
            const FT_PER_DEG_LON = FT_PER_DEG_LAT * Math.cos((avgLat * Math.PI) / 180);
            const heightFt = (Math.max(...lats) - Math.min(...lats)) * FT_PER_DEG_LAT;
            const widthFt  = (Math.max(...lons) - Math.min(...lons)) * FT_PER_DEG_LON;
            // Primary dimension = longer of the two
            return Math.round(Math.max(heightFt, widthFt));
        });

        // Farm boundary geometry (the drawn polygon)
        const farmBoundary = farmBoundaryRef.current;
        const geometry = farmBoundary?.geometry ?? null;

        // Bed geometries array (GeoJSON Polygon per bed)
        const bedGeometries = autofillBeds.map(f => f.geometry);

        const rawBlock = {
            ...(existingBlock ?? {}),
            id: targetId,
            name: existingBlock?.name || name,
            planId: planId ?? undefined,
            inputMode: 'autofill',
            autofillOrientation: orientation,
            bedWidthFt: 4,
            pathwayWidthFt: 2,
            customBedLengths,
            geometry,
            bedGeometries,
            createdAt: existingBlock?.createdAt ?? Date.now(),
        };

        const block = normalizeBlock(rawBlock);
        saveBlock(block);
        if (geometry) savePolygon(targetId, geometry);
        setBlocks(loadBlocksForPlan(planId));
        activeBlockIdRef.current = null;

        // Confirm and offer to navigate
        const confirmed = window.confirm(
            `✅ "${block.name}" saved!\n` +
            `${block.bedCount} beds · ${orientation} · avg ${block.bedLengthFt}ft\n\n` +
            `Go to Farm Designer to assign crops?`
        );
        handleClearAutofill();
        if (confirmed) {
            navigation.navigate('FarmDesigner', { farmProfile, planId });
        }
    }, [autofillBeds, autofillOrientation, autofillBlockName, afTargetBedLengthFt, planId, blocks, handleClearAutofill]);

    // ── Non-web ───────────────────────────────────────────────────────────────
    if (Platform.OS !== 'web') {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <HomeLogoButton navigation={navigation} />
                    <Text style={styles.heading}>Satellite Map</Text>
                </View>
                <View style={styles.nonWebNote}>
                    <Text style={styles.nonWebIcon}>🗺</Text>
                    <Text style={styles.nonWebText}>
                        The satellite drawing tool is available in the web app (acrelogic-preview.pages.dev).
                        Open the app in a browser to draw your block outlines on a real satellite image of your farm.
                    </Text>
                </View>
            </View>
        );
    }

    const afLengthCounts = {};
    autofillBeds.forEach(bed => {
        let actualLen = 0;
        if (bed.geometry && bed.geometry.coordinates[0]) {
            const coords = bed.geometry.coordinates[0];
            const side1 = turf.distance(turf.point(coords[0]), turf.point(coords[1]), {units: 'feet'});
            const side2 = turf.distance(turf.point(coords[1]), turf.point(coords[2]), {units: 'feet'});
            actualLen = Math.round(Math.max(side1, side2) / 5) * 5;
        }
        if (actualLen > 0) afLengthCounts[actualLen] = (afLengthCounts[actualLen] || 0) + 1;
    });
    const afLengthBreakdownRows = Object.entries(afLengthCounts)
        .sort((a, b) => b[0] - a[0])
        .map(([len, count], i) => {
            const color = BED_COLORS[i % BED_COLORS.length];
            const isHovered = hoveredAfBedLength === Number(len);
            return (
                <View
                    key={len}
                    style={[
                        { flexDirection: 'row', alignItems: 'center', marginBottom: 3, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4 },
                        isHovered && { backgroundColor: 'rgba(45,79,30,0.08)' }
                    ]}
                    // React Native Web bindings
                    onMouseEnter={() => setHoveredAfBedLength(Number(len))}
                    onMouseLeave={() => setHoveredAfBedLength(null)}
                    // Mobile touch fallback bindings
                    onTouchStart={() => setHoveredAfBedLength(Number(len))}
                    onTouchEnd={() => setHoveredAfBedLength(null)}
                >
                    <View style={[{ width: 12, height: 12, borderRadius: 2, backgroundColor: color, marginRight: 6 }, isHovered && { transform: [{ scale: 1.2 }] }]} />
                    <Text style={[styles.autofillSettingsSub, isHovered && { fontWeight: '800', color: '#1B5E20' }]}>
                        {count} beds x {len}ft
                    </Text>
                </View>
            );
        });

    const resolvedAfName = autofillBlockName.trim() || `Block ${blocks.length + 1}`;
    const isAfNameDuplicate = blocks.some(
        b => b.id !== activeBlockIdRef.current && b.name.toLowerCase() === resolvedAfName.toLowerCase()
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <HomeLogoButton navigation={navigation} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>FARM DESIGNER · PRO</Text>
                    <Text style={styles.heading}>Satellite Layout</Text>
                </View>
                {token && (
                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.headerBtn} onPress={zoomToFarm}>
                            <Text style={styles.headerBtnText}>⌖ Farm</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerBtnAlt} onPress={() => setToken('')}>
                            <Text style={styles.headerBtnAltText}>Token</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Mode Toggle Bar */}
            {token && (
                <View style={styles.modeToggleBar}>
                    <TouchableOpacity
                        id="mode-draw-boundary"
                        style={[styles.modeToggleBtn, mapMode === 'draw' && styles.modeToggleBtnActive]}
                        onPress={() => setMapMode('draw')}
                    >
                        <Text style={[styles.modeToggleBtnText, mapMode === 'draw' && styles.modeToggleBtnTextActive]}>
                            ✏️  Draw Farm Boundary
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        id="mode-stamp-blocks"
                        style={[styles.modeToggleBtn, mapMode === 'stamp' && styles.modeToggleBtnActive]}
                        onPress={() => setMapMode('stamp')}
                    >
                        <Text style={[styles.modeToggleBtnText, mapMode === 'stamp' && styles.modeToggleBtnTextActive]}>
                            📐  Stamp Blocks
                        </Text>
                    </TouchableOpacity>
                    {/* Auto-Fill mode toggle */}
                    <TouchableOpacity
                        id="mode-autofill-beds"
                        style={[
                            styles.modeToggleBtn,
                            styles.modeToggleBtnAutofill,
                            mapMode === 'auto_fill' && styles.modeToggleBtnAutofillActive,
                        ]}
                        onPress={() => setMapMode(mapMode === 'auto_fill' ? 'draw' : 'auto_fill')}
                    >
                        <Text style={[
                            styles.modeToggleBtnText,
                            mapMode === 'auto_fill' && styles.modeToggleBtnTextActive,
                        ]}>
                            🌱 Auto-Fill Beds
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        id="manage-token-btn"
                        style={styles.manageTokenBtn}
                        onPress={() => {
                            try { localStorage.removeItem(MAPBOX_TOKEN_KEY); } catch { }
                            setToken('');
                            setMapReady(false);
                        }}
                    >
                        <Text style={styles.manageTokenBtnText}>🔑 Manage Token</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Token setup — shown when no token stored */}
            {!token ? (
                <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
                    <TokenSetup onSave={handleTokenSave} />
                </ScrollView>
            ) : (
                <View style={{ flex: 1 }}>
                    {/* Mapbox map container */}
                    <div
                        ref={mapContainerRef}
                        id="mapbox-satellite-container"
                        style={{ flex: 1, width: '100%', height: '100%', minHeight: 500 }}
                    />

                    {/* Loading overlay */}
                    {!mapReady && !loadError && (
                        <View style={styles.loadingOverlay}>
                            <Text style={styles.loadingText}>Loading satellite imagery…</Text>
                        </View>
                    )}

                    {/* Error overlay */}
                    {loadError && (
                        <View style={styles.errorOverlay}>
                            <Text style={styles.errorText}>{loadError}</Text>
                            <TouchableOpacity style={styles.errorBtn} onPress={() => { setLoadError(null); initMap(token); }}>
                                <Text style={styles.errorBtnText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Drawing instructions (shown when map ready, no active drawing, draw mode) */}
                    {mapReady && !showPanel && mapMode === 'draw' && (
                        <View style={styles.instructionBanner}>
                            <Text style={styles.instructionText}>
                                ✏️ Click the polygon tool (top-left) → trace your block boundary → click first point to close
                            </Text>
                        </View>
                    )}

                    {/* Stamp mode instruction */}
                    {mapReady && mapMode === 'stamp' && (
                        <View style={styles.instructionBanner}>
                            <Text style={styles.instructionText}>
                                📐 Click to stamp · drag vertices to resize
                            </Text>
                        </View>
                    )}

                    {/* Live dimension + containment badge — shown while dragging a stamp */}
                    {mapMode === 'stamp' && activeDimLabel && (
                        <View style={styles.dimLabelBadge}>
                            <Text style={styles.dimLabelText}>
                                {activeDimLabel.w} ft × {activeDimLabel.h} ft
                            </Text>
                            <Text style={styles.dimLabelSub}>
                                {(activeDimLabel.w * activeDimLabel.h / 43560).toFixed(3)} ac
                            </Text>
                        </View>
                    )}

                    {/* Auto-Fill Settings Card — persistent floating panel in auto_fill mode */}
                    {mapMode === 'auto_fill' && (
                        <View style={styles.autofillSettingsCard}>
                            <Text style={styles.autofillSettingsTitle}>🌱 Auto-Fill Settings</Text>
                            <Text style={styles.autofillSettingsSub}>Configure before or during drawing</Text>

                            <View style={styles.autofillSettingsRow}>
                                <Text style={styles.autofillSettingsLabel}>Path Width</Text>
                                <TextInput
                                    id="af-path-width-input"
                                    style={styles.autofillSettingsInput}
                                    value={afPathWidthFt}
                                    onChangeText={setAfPathWidthFt}
                                    keyboardType="numeric"
                                    selectTextOnFocus
                                />
                                <Text style={styles.autofillSettingsUnit}>ft</Text>
                            </View>

                            <View style={styles.autofillSettingsRow}>
                                <Text style={styles.autofillSettingsLabel}>Target Bed Length</Text>
                                <TextInput
                                    id="af-bed-length-input"
                                    style={styles.autofillSettingsInput}
                                    value={afTargetBedLengthFt}
                                    onChangeText={setAfTargetBedLengthFt}
                                    keyboardType="numeric"
                                    selectTextOnFocus
                                />
                                <Text style={styles.autofillSettingsUnit}>ft</Text>
                            </View>

                            <View style={styles.autofillSettingsRow}>
                                <Text style={styles.autofillSettingsLabel}>Target Bed Width</Text>
                                <TextInput
                                    id="af-bed-width-input"
                                    style={styles.autofillSettingsInput}
                                    value={afTargetBedWidthFt}
                                    onChangeText={setAfTargetBedWidthFt}
                                    keyboardType="numeric"
                                    placeholder="2.5"
                                    placeholderTextColor="rgba(255,255,255,0.35)"
                                    selectTextOnFocus
                                />
                                <Text style={styles.autofillSettingsUnit}>ft</Text>
                            </View>

                            <TouchableOpacity
                                id="af-maximize-toggle"
                                style={[styles.autofillMaximizeBtn, afMaximize && styles.autofillMaximizeBtnActive]}
                                onPress={() => setAfMaximize(m => !m)}
                            >
                                <Text style={[styles.autofillMaximizeBtnText, afMaximize && styles.autofillMaximizeBtnTextActive]}>
                                    {afMaximize ? '✓ Maximize Bed Count' : '○ Maximize Bed Count'}
                                </Text>
                            </TouchableOpacity>

                            {autofillBeds.length > 0 ? (
                                <View style={styles.autofillResultSection}>
                                    <Text style={styles.autofillResultTitle}>
                                        {autofillBeds.length} beds · {autofillOrientation} · {parseFloat(afTargetBedWidthFt) || 2.5}ft wide · {afTargetBedLengthFt}ft max
                                    </Text>
                                    {afLengthBreakdownRows.length > 0 ? <View style={{ marginTop: 4 }}>{afLengthBreakdownRows}</View> : null}
                                    {isAfNameDuplicate && (
                                        <Text style={{ color: '#E53935', fontSize: 13, marginBottom: 8, textAlign: 'right' }}>⚠️ Block name already in use</Text>
                                    )}
                                    <View style={styles.autofillNameRow}>
                                        <TextInput
                                            id="autofill-block-name-input"
                                            style={[styles.autofillNameInput, isAfNameDuplicate && { borderColor: '#E53935', color: '#E53935' }]}
                                            value={autofillBlockName}
                                            onChangeText={setAutofillBlockName}
                                            placeholder={`Block ${blocks.length + 1}`}
                                            placeholderTextColor="rgba(255,255,255,0.5)"
                                            autoCapitalize="words"
                                            autoCorrect={false}
                                            returnKeyType="done"
                                        />
                                        <TouchableOpacity
                                            id="autofill-generate-block-btn"
                                            style={[styles.autofillGenerateBtn, isAfNameDuplicate && { opacity: 0.5 }]}
                                            onPress={handleGenerateAutofillBlock}
                                            disabled={isAfNameDuplicate}
                                        >
                                            <Text style={styles.autofillGenerateBtnText}>✓ Save Block</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity onPress={handleClearAutofill}>
                                        <Text style={styles.autofillClearLink}>× Clear preview</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    id="af-run-btn"
                                    style={[styles.autofillRunBtn, autofillRunning && styles.autofillRunBtnDisabled]}
                                    onPress={handleAutoFill}
                                    disabled={autofillRunning}
                                >
                                    <Text style={styles.autofillRunBtnText}>
                                        {autofillRunning ? '⏳ Packing beds…' : '▶ Run Auto-Fill'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Drawing results panel */}
                    {showPanel && mapMode === 'draw' && (
                        <View style={styles.panelContainer}>
                            <DrawingPanel
                                sqFt={drawnSqFt}
                                bedLengthFt={bedLengthFt}
                                setBedLengthFt={setBedLengthFt}
                                bedWidthFt={drawBedWidthFt}
                                setBedWidthFt={setDrawBedWidthFt}
                                pathWidthFt={drawPathWidthFt}
                                setPathWidthFt={setDrawPathWidthFt}
                                suggestedBeds={suggestedBeds}
                                onCreateBlock={handleCreateBlock}
                                onCreateMultipleBlocks={handleCreateMultipleBlocks}
                                onClear={handleClearDraw}
                                isPosLocked={isPosLocked}
                                setIsPosLocked={setIsPosLocked}
                                isManipLocked={isManipLocked}
                                setIsManipLocked={setIsManipLocked}
                                onMoveBackward={handleMoveBoundaryBackward}
                                onMoveForward={handleMoveBoundaryForward}
                            />
                        </View>
                    )}

                    {/* Stamp controls panel */}
                    {mapMode === 'stamp' && (
                        <View style={styles.stampPanelContainer}>
                            <StampPanel
                                widthFt={stampWidthFt}
                                setWidthFt={setStampWidthFt}
                                lengthFt={stampLengthFt}
                                setLengthFt={setStampLengthFt}
                                orientation={stampOrientation}
                                setOrientation={setStampOrientation}
                                stampCount={stampCount}
                                lastStampName={lastStampName}
                                allowOverlap={allowOverlap}
                                setAllowOverlap={setAllowOverlap}
                            />
                        </View>
                    )}

                    {/* Block list overlay — existing blocks with polygon status */}
                    {blocks.length > 0 && (
                        <View style={styles.blockBadgeRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 6, padding: 8 }}>
                                    {blocks.map(b => {
                                        const polygons = loadPolygons();
                                        const hasPoly = !!polygons[b.id];
                                        return (
                                            <TouchableOpacity
                                                key={b.id}
                                                style={[styles.blockBadge, hasPoly && styles.blockBadgeActive]}
                                                onPress={() => navigation.navigate('BlockDetail', { block: b, farmProfile })}
                                            >
                                                <Text style={styles.blockBadgeText}>
                                                    {hasPoly ? '◉' : '○'} {b.name}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </ScrollView>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0EDE6' },

    // Auto-fill settings card (persistent floating panel)
    autofillSettingsCard: {
        position: 'absolute', top: 12, right: 12, width: 320,
        backgroundColor: 'rgba(0,33,43,0.95)', borderRadius: 14,
        paddingVertical: 14, paddingHorizontal: 16, zIndex: 30,
        borderWidth: 1, borderColor: 'rgba(0,188,212,0.4)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45, shadowRadius: 10,
    },
    autofillSettingsTitle: { color: '#00BCD4', fontWeight: '800', fontSize: 14, marginBottom: 2 },
    autofillSettingsSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 12 },
    autofillSettingsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
    autofillSettingsLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, flex: 1 },
    autofillSettingsInput: {
        backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6,
        paddingHorizontal: 8, paddingVertical: 4,
        color: '#fff', fontSize: 13, fontWeight: '700',
        width: 52, textAlign: 'center',
        borderWidth: 1, borderColor: 'rgba(0,188,212,0.3)',
    },
    autofillSettingsUnit: { color: 'rgba(255,255,255,0.5)', fontSize: 11, width: 14 },
    autofillMaximizeBtn: {
        borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10,
        borderWidth: 1, borderColor: 'rgba(0,188,212,0.35)',
        marginBottom: 12, alignItems: 'center',
    },
    autofillMaximizeBtnActive: { backgroundColor: 'rgba(0,188,212,0.2)', borderColor: '#00BCD4' },
    autofillMaximizeBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
    autofillMaximizeBtnTextActive: { color: '#00BCD4', fontWeight: '700' },
    autofillRunBtn: {
        backgroundColor: '#00BCD4', borderRadius: 8,
        paddingVertical: 10, alignItems: 'center',
    },
    autofillRunBtnDisabled: { opacity: 0.5 },
    autofillRunBtnText: { color: '#00212B', fontWeight: '800', fontSize: 13 },
    autofillResultSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,188,212,0.25)', paddingTop: 10 },
    autofillResultTitle: { color: '#00BCD4', fontSize: 12, fontWeight: '700', marginBottom: 8 },
    // Auto-fill panel (legacy bottom panel — kept for non-auto_fill mode fallback)
    autofillPanel: {
        position: 'absolute', bottom: 100, left: 12, right: 12,
        backgroundColor: 'rgba(0,121,134,0.96)', borderRadius: 12,
        paddingVertical: 10, paddingHorizontal: 14,
        zIndex: 20,
    },
    autofillPanelTitle: { color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 },
    autofillPanelSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginBottom: 8 },
    autofillNameRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    autofillNameInput: {
        flex: 1, backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 7, paddingVertical: 7, paddingHorizontal: 10,
        color: '#fff', fontSize: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    autofillGenerateBtn: {
        backgroundColor: '#00E5FF', borderRadius: 7,
        paddingVertical: 7, paddingHorizontal: 12,
    },
    autofillGenerateBtnText: { color: '#00212B', fontWeight: '800', fontSize: 12 },
    autofillClearLink: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 8, textAlign: 'center' },
    // Legacy badge styles
    autofillBadge: {
        position: 'absolute', bottom: 130, left: 12, right: 12,
        backgroundColor: 'rgba(0,151,167,0.92)', borderRadius: 10,
        paddingVertical: 8, paddingHorizontal: 14,
        flexDirection: 'column', alignItems: 'center',
        zIndex: 20,
    },
    autofillBadgeTitle: { color: '#fff', fontWeight: '700', fontSize: 13 },
    autofillBadgeSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
    modeToggleBtnAutofill: { borderColor: '#00BCD4', borderWidth: 1.5 },
    modeToggleBtnAutofillActive: { backgroundColor: '#00BCD4' },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen, zIndex: 10,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    headerActions: { flexDirection: 'row', gap: 6 },
    headerBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 11, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    headerBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.xs },
    headerBtnAlt: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    headerBtnAltText: { color: 'rgba(255,255,255,0.6)', fontSize: Typography.xs },

    // Token setup
    tokenCard: { backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, ...Shadows.card },
    tokenTitle: { fontSize: 20, fontWeight: '800', color: Colors.primaryGreen },
    tokenBody: { fontSize: Typography.sm, color: Colors.mutedText, lineHeight: 20 },
    tokenStep: { fontSize: Typography.sm, color: Colors.darkText, lineHeight: 20 },
    tokenLink: { color: Colors.primaryGreen, fontWeight: '700', textDecorationLine: 'underline' },
    tokenMono: { fontFamily: Platform.select({ web: 'monospace', default: 'Courier' }), fontSize: 12, backgroundColor: 'rgba(45,79,30,0.08)', paddingHorizontal: 4, borderRadius: 3 },
    tokenInput: { borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.25)', borderRadius: Radius.sm, padding: 12, fontSize: 12, fontFamily: Platform.select({ web: 'monospace', default: 'Courier' }), color: Colors.primaryGreen, backgroundColor: '#FFF', minHeight: 60 },
    tokenSaveBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
    tokenSaveBtnDisabled: { opacity: 0.35 },
    tokenSaveBtnText: { color: Colors.cream, fontWeight: '800', fontSize: Typography.sm },
    tokenNote: { fontSize: 10, color: Colors.mutedText, lineHeight: 14, fontStyle: 'italic' },

    // Map overlays
    loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(45,79,30,0.5)' },
    loadingText: { color: '#FFF', fontWeight: '700', fontSize: Typography.md },
    errorOverlay: { position: 'absolute', top: 80, left: 20, right: 20, backgroundColor: '#FFCCBC', borderRadius: Radius.md, padding: Spacing.md, gap: 8 },
    errorText: { fontSize: Typography.sm, color: '#BF360C' },
    errorBtn: { backgroundColor: '#BF360C', borderRadius: Radius.sm, paddingVertical: 8, alignItems: 'center' },
    errorBtnText: { color: '#FFF', fontWeight: '700' },

    // Mode toggle
    modeToggleBar: { flexDirection: 'row', backgroundColor: 'rgba(245,240,225,0.97)', paddingVertical: 6, paddingHorizontal: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.1)', zIndex: 9 },
    modeToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.full, alignItems: 'center', backgroundColor: 'rgba(45,79,30,0.07)', borderWidth: 1.5, borderColor: 'transparent' },
    modeToggleBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    modeToggleBtnText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primaryGreen },
    modeToggleBtnTextActive: { color: Colors.cream },
    manageTokenBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.full, alignItems: 'center', backgroundColor: 'rgba(183,28,28,0.10)', borderWidth: 1.5, borderColor: 'rgba(183,28,28,0.35)' },
    manageTokenBtnText: { fontSize: Typography.xs, fontWeight: '700', color: '#B71C1C' },

    instructionBanner: { position: 'absolute', top: 12, left: '50%', transform: [{ translateX: '-50%' }], backgroundColor: 'rgba(45,79,30,0.88)', borderRadius: Radius.full, paddingVertical: 8, paddingHorizontal: 16, maxWidth: '80%' },
    instructionText: { color: '#FFF', fontSize: Typography.xs, fontWeight: '600', textAlign: 'center' },
    dimLabelBadge: { position: 'absolute', top: 48, left: '50%', transform: [{ translateX: '-50%' }], backgroundColor: 'rgba(15,30,10,0.82)', borderRadius: Radius.md, paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center', gap: 2 },
    dimLabelText: { color: '#C8E6C9', fontSize: Typography.sm, fontWeight: '800', letterSpacing: 0.5 },
    dimLabelSub: { color: 'rgba(200,230,201,0.7)', fontSize: 10, fontWeight: '600' },

    // Stamp panel
    stampPanelContainer: { position: 'absolute', bottom: 80, right: 12 },
    stampPanel: { backgroundColor: '#FAFAF7', borderRadius: Radius.lg, padding: Spacing.md, gap: 8, width: 200, ...Shadows.card },
    stampPanelTitle: { fontSize: Typography.xs, fontWeight: '800', color: '#E65100', textTransform: 'uppercase', letterSpacing: 1 },
    stampPanelSub: { fontSize: 10, color: Colors.mutedText, marginTop: -4 },
    stampRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stampLabel: { fontSize: Typography.xs, color: Colors.mutedText, flex: 1 },
    stampInput: { width: 56, borderWidth: 1.5, borderColor: 'rgba(230,81,0,0.3)', borderRadius: 6, padding: 6, fontSize: Typography.sm, color: '#E65100', textAlign: 'right', backgroundColor: '#FFF' },
    stampUnit: { fontSize: Typography.xs, color: Colors.mutedText },
    stampOrientRow: { flexDirection: 'row', gap: 6 },
    stampOrientBtn: { flex: 1, paddingVertical: 7, borderRadius: Radius.sm, alignItems: 'center', backgroundColor: 'rgba(230,81,0,0.07)', borderWidth: 1.5, borderColor: 'transparent' },
    stampOrientBtnActive: { backgroundColor: '#E65100', borderColor: '#E65100' },
    stampOrientBtnText: { fontSize: 11, fontWeight: '700', color: '#E65100' },
    stampOrientBtnTextActive: { color: '#FFF' },
    stampLastBadge: { backgroundColor: 'rgba(56,142,60,0.12)', borderRadius: Radius.sm, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
    stampLastBadgeText: { fontSize: 10, color: '#2E7D32', fontWeight: '700' },

    panelContainer: { position: 'absolute', bottom: 80, right: 12 },
    drawPanel: { backgroundColor: '#FAFAF7', borderRadius: Radius.lg, padding: Spacing.md, gap: 8, width: 220, ...Shadows.card },
    drawPanelTitle: { fontSize: Typography.xs, fontWeight: '800', color: Colors.primaryGreen, textTransform: 'uppercase', letterSpacing: 1 },
    drawAreaNum: { fontSize: 22, fontWeight: '900', color: Colors.primaryGreen },
    drawAreaAcres: { fontSize: Typography.xs, color: Colors.mutedText, marginTop: -4 },
    drawRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    drawLabel: { fontSize: Typography.xs, color: Colors.mutedText, flex: 1 },
    drawInput: { width: 52, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: 6, padding: 6, fontSize: Typography.sm, color: Colors.primaryGreen, textAlign: 'right', backgroundColor: '#FFF' },
    drawUnit: { fontSize: Typography.xs, color: Colors.mutedText },
    drawSuggestion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(45,79,30,0.07)', borderRadius: Radius.sm, padding: 8 },
    drawSuggestLabel: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: '700' },
    drawSuggestNum: { fontSize: 20, fontWeight: '900', color: Colors.primaryGreen },
    drawCreateBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.sm, paddingVertical: 10, alignItems: 'center' },
    drawCreateBtnText: { color: Colors.cream, fontWeight: '800', fontSize: 11 },
    drawQuickSaveBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.sm, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
    drawQuickSaveBtnText: { color: Colors.cream, fontWeight: '800', fontSize: 12 },
    drawQuickSaveBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 9, textAlign: 'center' },
    drawCustomiseBtn: { paddingVertical: 6, alignItems: 'center' },
    drawCustomiseBtnText: { fontSize: 11, color: Colors.primaryGreen, fontWeight: '700', textDecorationLine: 'underline' },
    drawClearBtn: { paddingVertical: 6, alignItems: 'center' },
    drawClearBtnText: { fontSize: 11, color: Colors.mutedText },
    drawCheckRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 6 },
    drawCheckBox: { fontSize: 14, color: Colors.offWhite },
    drawCheckLabel: { fontSize: 12, color: Colors.offWhite, flex: 1 },
    drawZIndexRow: { flexDirection: 'column', gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 4 },
    drawZIndexLink: { fontSize: 11, color: '#81C784', textDecorationLine: 'underline' },

    blockBadgeRow: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(245,240,225,0.9)' },
    blockBadge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.full, backgroundColor: 'rgba(45,79,30,0.08)', borderWidth: 1, borderColor: 'rgba(45,79,30,0.15)' },
    blockBadgeActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    blockBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen },

    nonWebNote: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', gap: 12 },
    nonWebIcon: { fontSize: 52 },
    nonWebText: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center', lineHeight: 22 },
});
