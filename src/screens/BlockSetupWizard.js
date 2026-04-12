/**
 * BlockSetupWizard.js
 * ════════════════════
 * 5-step wizard for creating or editing a farm block:
 *   Step 0 — Block name + optional family assignment + grid position
 *   Step 1 — (New) Duplicate layout? How many? Name each one.
 *   Step 2 — Input mode: "I know my bed count" vs "I know my block dimensions"
 *   Step 3 — Pathways + bisecting road config
 *   Step 4 — Review summary → Save
 *
 * When editing an existing block, Step 1 is skipped automatically.
 */
import React, { useState, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, Animated, Platform, Switch,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { saveBlock, loadBlocks } from '../services/persistence';
import {
    calculateBedsFromDimensions, blockSummaryLine,
    generateBlockId, GRID_POSITIONS, FAMILY_OPTIONS,
} from '../services/farmUtils';
import HomeLogoButton from '../components/HomeLogoButton';

const TOTAL_STEPS = 4;

// ─── Step indicator ────────────────────────────────────────────────────────────
const StepDots = ({ step }) => (
    <View style={styles.stepDots}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
        ))}
    </View>
);

// ── Section chip selector ──────────────────────────────────────────────────
// Grid-wrapping chip selector — no horizontal scroll (which caused oval stretching)
const ChipSelect = ({ options, value, onSelect, multi = false }) => (
    <View style={styles.chipRow}>
        {options.map(opt => {
            const active = multi ? (value ?? []).includes(opt) : value === opt;
            return (
                <TouchableOpacity
                    key={opt}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => onSelect(opt)}
                >
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={2}>{opt}</Text>
                </TouchableOpacity>
            );
        })}
    </View>
);

// ─── Field row ────────────────────────────────────────────────────────────────
const FieldRow = ({ label, unit, value, onChangeText, onBlur, keyboardType = 'numeric', placeholder = '0' }) => (
    <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.fieldInputWrap}>
            <TextInput
                style={styles.fieldInput}
                value={value}
                onChangeText={onChangeText}
                onBlur={onBlur}
                keyboardType={keyboardType}
                placeholder={placeholder}
                placeholderTextColor={Colors.mutedText}
            />
            {unit ? <Text style={styles.fieldUnit}>{unit}</Text> : null}
        </View>
    </View>
);

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export default function BlockSetupWizard({ route, navigation }) {
    const existingBlock = route?.params?.block ?? null;
    const farmProfile = route?.params?.farmProfile ?? null;
    const defaultGridPos = route?.params?.defaultGridPos ?? null;
    const planId = route?.params?.planId ?? null;  // from FarmDesigner → tags each saved block
    const selectedCropIds = route?.params?.selectedCropIds ?? [];
    // prefill: data passed from FarmSatelliteScreen after drawing a polygon
    const prefill = route?.params?.prefill ?? null;

    // ── Existing-block collision data ─────────────────────────────────────────
    // Load all blocks that belong to this plan and exclude the one being edited.
    // Used to grey out occupied grid positions and warn about duplicate names.
    const existingPlanBlocks = useMemo(() => {
        const all = loadBlocks();
        const peers = planId ? all.filter(b => b.planId === planId) : all;
        return peers.filter(b => b.id !== (existingBlock?.id ?? '__none__'));
    }, [planId, existingBlock?.id]);

    // Set of "col_row" strings for occupied positions
    const takenPositions = useMemo(() => {
        const s = new Set();
        existingPlanBlocks.forEach(b => {
            if (b.gridPosition != null) {
                s.add(`${b.gridPosition.col}_${b.gridPosition.row}`);
            }
        });
        return s;
    }, [existingPlanBlocks]);

    // Set of lowercase block names already in use
    const takenNames = useMemo(() => {
        const s = new Set();
        existingPlanBlocks.forEach(b => {
            if (b.name) s.add(b.name.trim().toLowerCase());
        });
        return s;
    }, [existingPlanBlocks]);

    const [step, setStep] = useState(0);
    const slideAnim = useRef(new Animated.Value(0)).current;

    // ── Form State — falls back to satellite prefill before using defaults ─────
    const [blockName, setBlockName] = useState(existingBlock?.name ?? prefill?.blockName ?? '');
    const [familyAssignment, setFamilyAssignment] = useState(existingBlock?.familyAssignment ?? 'Mixed (no restriction)');
    const [gridPos, setGridPos] = useState(existingBlock?.gridPosition ?? defaultGridPos ?? prefill?.gridPosition ?? null);

    const [inputMode, setInputMode] = useState(existingBlock?.inputMode ?? prefill?.inputMode ?? 'beds');
    const [bedCount, setBedCount] = useState(String(existingBlock?.bedCount ?? prefill?.bedCount ?? '8'));
    const [bedLengthFt, setBedLengthFt] = useState(String(existingBlock?.bedLengthFt ?? prefill?.bedLengthFt ?? '100'));
    const [blockLenFt, setBlockLenFt] = useState(String(existingBlock?.blockLengthFt ?? prefill?.blockLengthFt ?? ''));
    const [blockWidFt, setBlockWidFt] = useState(String(existingBlock?.blockWidthFt ?? prefill?.blockWidthFt ?? ''));

    const [bedWidthFt, setBedWidthFt] = useState(String(existingBlock?.bedWidthFt ?? '2.5'));
    const [pathwayFt, setPathwayFt] = useState(String(existingBlock?.pathwayWidthFt ?? '1'));
    // N/S bisecting pathway: auto-enabled when coming from satellite (user's requested default)
    const [bisectEnabled, setBisectEnabled] = useState(existingBlock?.bisectingRoad?.enabled ?? (prefill ? true : false));
    const [bisectOrient, setBisectOrient] = useState(existingBlock?.bisectingRoad?.orientation ?? 'NS');
    const [bisectWidFt, setBisectWidFt] = useState(String(existingBlock?.bisectingRoad?.widthFt ?? '4'));

    // ── Duplicate block state (Step 1) ──────────────────────────────────────
    // Only used when creating new blocks (not editing). Lets the user create
    // multiple identically-configured blocks in one pass.
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [dupeCountStr, setDupeCountStr] = useState('2');
    // dupeNames[0] is always the primary name; extra entries for copies
    const [dupeNames, setDupeNames] = useState(['', '']);
    // dupeGridPositions[i] is the explicit grid slot for block i (parallel to dupeNames)
    // Initialized with auto-sequential defaults from available slots.
    const [dupeGridPositions, setDupeGridPositions] = useState(() => {
        return [gridPos ?? null, null];
    });

    // ── Extended grid rows and cols ────────────────────────────────────────────
    // extraGridRows = extra rows below standard 3×3
    // extraGridCols = extra columns to the right of standard 3×3
    const [extraGridRows, setExtraGridRows] = useState(0);
    const [extraGridCols, setExtraGridCols] = useState(0);

    const buildAllPositions = (extraRows = extraGridRows, extraCols = extraGridCols) => {
        const all = [...GRID_POSITIONS]; // NW/N/NE/W/Center/E/SW/S/SE (rows 0–2)

        // Extra rows below base grid: SW1/S1/SE1, SW2/S2/SE2…
        for (let r = 0; r < extraRows; r++) {
            const n = r + 1;
            all.push(
                { label: `SW${n}`, col: 0, row: 3 + r },
                { label: `S${n}`,  col: 1, row: 3 + r },
                { label: `SE${n}`, col: 2, row: 3 + r },
            );
        }

        // Extra columns to the right: NE1/E1/SE1, NE2/E2/SE2…
        // SE{n} is skipped when extraRows >= n — that row already placed SE{n} at col:2
        for (let c = 0; c < extraCols; c++) {
            const n = c + 1;
            all.push({ label: `NE${n}`, col: 3 + c, row: 0 });
            all.push({ label: `E${n}`,  col: 3 + c, row: 1 });
            if (n > extraRows) {
                // SE{n} hasn’t been added by a row yet — add it from the column
                all.push({ label: `SE${n}`, col: 3 + c, row: 2 });
            }
        }

        // Sort row-major (row first, then col) so flexWrap lays out as a proper grid
        all.sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);
        return all;
    };



    // Helper: total number of columns in the current expanded grid
    const totalGridCols = 3 + extraGridCols;

    // Update dupeNames and positions when user finishes typing the count
    // Using a raw string during typing (dupeCountStr) so deletion works naturally;
    // actual clamping only happens on blur or when moving to the next step.
    const applyDupeCount = (rawVal) => {
        // Allow the field to freely show what the user typed (even blank)
        setDupeCountStr(rawVal);
        const n = Math.max(2, Math.min(20, parseInt(rawVal) || 2));
        setDupeNames(prev => Array.from({ length: n }, (_, i) => prev[i] ?? ''));
        setDupeGridPositions(prev => {
            return Array.from({ length: n }, (_, i) => prev[i] ?? null);
        });
    };

    // Clamp to valid range on blur so we don't leave invalid state
    const commitDupeCount = () => {
        const n = Math.max(2, Math.min(20, parseInt(dupeCountStr) || 2));
        applyDupeCount(String(n));
    };

    const updateDupeName = (idx, val) => {
        setDupeNames(prev => {
            const arr = [...prev];
            arr[idx] = val;
            return arr;
        });
    };

    const updateDupeGridPos = (idx, pos) => {
        setDupeGridPositions(prev => {
            const arr = [...prev];
            arr[idx] = pos;
            return arr;
        });
    };

    // Skip the duplication step entirely when editing an existing block
    const isEditing = !!existingBlock;
    // Actual step count: 4 when creating, 3 when editing (Step 0 / Multiple? hidden)
    const effectiveTotalSteps = isEditing ? TOTAL_STEPS - 1 : TOTAL_STEPS;
    // Map internal step index → wizard content index
    // When isEditing, step 0 (multiple?) is not shown, so we offset by 1
    const contentIdx = isEditing ? step + 1 : step;

    // ── Derived: computed bed count for dimension mode ──────────────────────
    const computedBedCount = inputMode === 'dimensions'
        ? calculateBedsFromDimensions({
            blockLengthFt: parseFloat(blockLenFt) || 0,
            blockWidthFt: parseFloat(blockWidFt) || 0,
            bedWidthFt: parseFloat(bedWidthFt) || 2.5,
            pathwayWidthFt: parseFloat(pathwayFt) || 1,
            bisectingRoad: {
                enabled: bisectEnabled,
                orientation: bisectOrient,
                widthFt: parseFloat(bisectWidFt) || 14,
            },
        })
        : parseInt(bedCount) || 0;

    const effectiveBedCount = inputMode === 'beds' ? (parseInt(bedCount) || 0) : computedBedCount;
    const effectiveBedLen = parseFloat(bedLengthFt) || 100;

    // ── Navigation ───────────────────────────────────────────────────────────
    // When isDuplicate, Step 1 (single-block naming) is skipped because
    // all block names were already collected in Step 0.
    const goForward = () => {
        const skip = !isEditing && isDuplicate && step === 0; // skip naming step in dupe mode
        const nextStep = skip ? step + 2 : step + 1;
        Animated.timing(slideAnim, { toValue: -30, duration: 80, useNativeDriver: true }).start(() => {
            slideAnim.setValue(30);
            setStep(nextStep);
            Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
        });
    };

    const goBack = () => {
        if (step === 0) { navigation.goBack(); return; }
        // When coming back from step 2 in dupe mode, skip step 1 and return to step 0
        const skip = !isEditing && isDuplicate && step === 2;
        const prevStep = skip ? step - 2 : step - 1;
        Animated.timing(slideAnim, { toValue: 30, duration: 80, useNativeDriver: true }).start(() => {
            slideAnim.setValue(-30);
            setStep(prevStep);
            Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
        });
    };

    const handleSave = () => {
        // ── Collision guard ───────────────────────────────────────────────────
        // Catch any conflicts that may have been typed after passing the wizard.
        if (!isEditing && isDuplicate) {
            const count = parseInt(dupeCountStr) || 2;
            const seenNames = new Set();
            const seenPos  = new Set();
            for (let i = 0; i < count; i++) {
                const rawName = dupeNames[i]?.trim();
                const name = (rawName || `${blockName.trim() || 'Block'} ${String.fromCharCode(65 + i)}`).toLowerCase();
                if (takenNames.has(name) || seenNames.has(name)) {
                    alert(`A block named "${name}" already exists on this farm. Please choose a unique name.`);
                    return;
                }
                seenNames.add(name);
                const pos = dupeGridPositions[i];
                if (pos) {
                    const key = `${pos.col}_${pos.row}`;
                    if (takenPositions.has(key) || seenPos.has(key)) {
                        alert(`Grid position "${pos.label}" is already occupied. Please choose a different location.`);
                        return;
                    }
                    seenPos.add(key);
                }
            }
        } else if (!isEditing) {
            const name = blockName.trim().toLowerCase();
            if (name && takenNames.has(name)) {
                alert(`A block named "${blockName.trim()}" already exists on this farm. Please choose a unique name.`);
                return;
            }
            if (gridPos) {
                const key = `${gridPos.col}_${gridPos.row}`;
                if (takenPositions.has(key)) {
                    alert(`Grid position "${gridPos.label}" is already occupied by another block.`);
                    return;
                }
            }
        }

        const baseBlock = {
            inputMode,
            bedCount: effectiveBedCount,
            bedLengthFt: effectiveBedLen,
            bedWidthFt: parseFloat(bedWidthFt) || 2.5,
            pathwayWidthFt: parseFloat(pathwayFt) || 1,
            blockLengthFt: inputMode === 'dimensions' ? (parseFloat(blockLenFt) || null) : null,
            blockWidthFt: inputMode === 'dimensions' ? (parseFloat(blockWidFt) || null) : null,
            bisectingRoad: { enabled: bisectEnabled, orientation: bisectOrient, widthFt: parseFloat(bisectWidFt) || 14 },
            familyAssignment,
            gridPosition: gridPos,
        };

        if (!isEditing && isDuplicate) {
            // Save multiple blocks — one per name entered, each with explicit grid position
            const count = parseInt(dupeCountStr) || 2;
            for (let i = 0; i < count; i++) {
                const rawName = dupeNames[i]?.trim();
                const name = rawName || `${blockName.trim() || 'Block'} ${String.fromCharCode(65 + i)}`;
                // Use the explicit per-block position chosen in Step 1
                const assignedPos = dupeGridPositions[i] ?? null;
                saveBlock({
                    ...baseBlock,
                    id: generateBlockId(),
                    name,
                    gridPosition: assignedPos,
                    planId: planId ?? undefined,
                });
            }
        } else {
            // Single block (or editing)
            saveBlock({
                ...baseBlock,
                id: existingBlock?.id ?? prefill?.id ?? generateBlockId(),
                name: blockName.trim() || `Block ${Date.now().toString(36).toUpperCase().slice(-4)}`,
                planId: planId ?? undefined,
            });
        }

        navigation.navigate('FarmDesigner', { farmProfile, planId, selectedCropIds, saved: true });
    };

    // ─── Step content ─────────────────────────────────────────────────────
    const stepContent = [
        // Step 0 (NEW — skipped when editing): Multiple or Single?
        <ScrollView key="step0"
            style={[styles.stepContent, Platform.OS === 'web' ? { overflowY: 'scroll', flex: 1, minHeight: 0, maxHeight: 'calc(100dvh - 190px)' } : null]}
            contentContainerStyle={styles.stepInner}
            showsVerticalScrollIndicator={Platform.OS !== 'web'}
        >
            <Text style={styles.stepTitle}>Multiple Blocks with the Same Layout?</Text>
            <Text style={styles.stepSubtitle}>
                Do you have more than one block with the same bed configuration? Create them all at once.
            </Text>

            {/* Yes / No prominent buttons */}
            <View style={styles.yesNoRow}>
                {[{ v: false, l: 'No', sub: 'Just this one block' }, { v: true, l: 'Yes', sub: 'Same layout, multiple locations' }].map(({ v, l, sub }) => (
                    <TouchableOpacity
                        key={String(v)}
                        style={[styles.yesNoBtn, isDuplicate === v && styles.yesNoBtnActive]}
                        onPress={() => setIsDuplicate(v)}
                    >
                        <Text style={[styles.yesNoBtnLabel, isDuplicate === v && styles.yesNoBtnLabelActive]}>{l}</Text>
                        <Text style={[styles.yesNoBtnSub, isDuplicate === v && styles.yesNoBtnSubActive]}>{sub}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {isDuplicate && (
                <>
                    <Text style={styles.fieldHint}>
                        How many blocks total? (2–20)
                    </Text>
                    <FieldRow
                        label="Total blocks"
                        value={dupeCountStr}
                        onChangeText={applyDupeCount}
                        onBlur={commitDupeCount}
                        placeholder="2"
                    />

                    <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
                        Name Each Block
                    </Text>
                    <Text style={styles.fieldHint}>
                        Leave blank to auto-name (Block A, Block B…)
                    </Text>

                    {dupeNames.map((name, idx) => {
                        // Positions taken by OTHER blocks in this batch (not self)
                        const takenByBatch = new Set(
                            dupeGridPositions
                                .filter((p, i) => i !== idx && p)
                                .map(p => `${p.col}_${p.row}`)
                        );
                        const myPos = dupeGridPositions[idx];

                        // Duplicate name check: taken by farm OR by another block in this batch
                        const resolvedName = name.trim() || `${blockName.trim() || 'Block'} ${String.fromCharCode(65 + idx)}`;
                        const isNameDuplicate = takenNames.has(resolvedName.toLowerCase()) ||
                            dupeNames.some((n, i) => i !== idx && (n.trim() || `${blockName.trim() || 'Block'} ${String.fromCharCode(65 + i)}`).toLowerCase() === resolvedName.toLowerCase());

                        return (
                            <View key={idx} style={styles.dupeBlockCard}>
                                {/* Block label + name field */}
                                <View style={styles.dupeBlockHeader}>
                                    <Text style={styles.dupeBadge}>{String.fromCharCode(65 + idx)}</Text>
                                    <TextInput
                                        style={[styles.fieldInput, { flex: 1 }, isNameDuplicate && styles.fieldInputError]}
                                        value={name}
                                        onChangeText={val => updateDupeName(idx, val)}
                                        placeholder={`e.g. ${blockName.trim() || 'Block'} ${String.fromCharCode(65 + idx)}`}
                                        placeholderTextColor={Colors.mutedText}
                                        keyboardType="default"
                                    />
                                </View>
                                {isNameDuplicate && (
                                    <Text style={styles.duplicateWarning}>⚠️ Name already in use — choose a unique name</Text>
                                )}

                                {/* Mini grid position picker with extended rows + cols */}
                                <View style={styles.dupeGridWrap}>
                                    <Text style={styles.dupeGridLabel}>📍 Grid Position</Text>
                                    <View style={styles.dupeGrid}>
                                        {buildAllPositions().map(pos => {
                                            const isSelected = myPos?.label === pos.label;
                                            // Grey out: taken by this farm OR by another block in this batch
                                            const isTakenByFarm  = takenPositions.has(`${pos.col}_${pos.row}`);
                                            const isTakenByBatch = takenByBatch.has(`${pos.col}_${pos.row}`);
                                            const isTaken = isTakenByFarm || isTakenByBatch;
                                            return (
                                                <TouchableOpacity
                                                    key={pos.label}
                                                    style={[
                                                        styles.dupeGridCell,
                                                        isSelected && styles.dupeGridCellActive,
                                                        isTakenByFarm && styles.dupeGridCellOccupied,
                                                        !isTakenByFarm && isTakenByBatch && styles.dupeGridCellTaken,
                                                        { width: `${Math.floor(96 / totalGridCols)}%` },
                                                    ]}
                                                    onPress={() => !isTaken && updateDupeGridPos(idx, pos)}
                                                    activeOpacity={isTaken ? 1 : 0.7}
                                                >
                                                    <Text style={[
                                                        styles.dupeGridCellText,
                                                        isSelected && styles.dupeGridCellTextActive,
                                                        isTaken && styles.dupeGridCellTextTaken,
                                                    ]}>
                                                        {pos.label}{isTakenByFarm ? ' ✕' : ''}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                    {/* + Add Row / + Add Column — shared, only shown on first card */}
                                    {idx === 0 && (
                                        <View style={styles.addBtnsRow}>
                                            <TouchableOpacity
                                                style={[styles.addRowBtn, { flex: 1 }]}
                                                onPress={() => setExtraGridRows(r => r + 1)}
                                            >
                                                <Text style={styles.addRowBtnText}>
                                                    + Row (SW{extraGridRows + 1} | S{extraGridRows + 1} | SE{extraGridRows + 1})
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.addRowBtn, { flex: 1 }]}
                                                onPress={() => setExtraGridCols(c => c + 1)}
                                            >
                                                <Text style={styles.addRowBtnText}>
                                                    {extraGridCols + 1 > extraGridRows
                                                        ? `+ Col (NE${extraGridCols + 1} | E${extraGridCols + 1} | SE${extraGridCols + 1})`
                                                        : `+ Col (NE${extraGridCols + 1} | E${extraGridCols + 1})`
                                                    }
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </>
            )}
            <View style={{ height: 40 }} />
        </ScrollView>,

        // Step 1: Single-block Name + Grid Position only
        // (When isDuplicate, names were collected in Step 0 above — skip to bed config)
        <ScrollView key="step1"
            style={[styles.stepContent, Platform.OS === 'web' ? { overflowY: 'scroll', flex: 1, minHeight: 0, maxHeight: 'calc(100dvh - 190px)' } : null]}
            contentContainerStyle={styles.stepInner}
            showsVerticalScrollIndicator={Platform.OS !== 'web'}
        >
            <Text style={styles.stepTitle}>Name Your Block</Text>
            <Text style={styles.stepSubtitle}>What do you call this section of your farm?</Text>
            <TextInput
                style={[styles.bigInput, !isEditing && blockName.trim() && takenNames.has(blockName.trim().toLowerCase()) && styles.bigInputError]}
                value={blockName}
                onChangeText={setBlockName}
                placeholder="e.g. Block A, North Field, Hoop House..."
                placeholderTextColor={Colors.mutedText}
                autoFocus
            />
            {/* Live duplicate name warning (single-block flow) */}
            {!isEditing && blockName.trim() && takenNames.has(blockName.trim().toLowerCase()) && (
                <Text style={styles.duplicateWarning}>⚠️ A block with this name already exists — choose a unique name</Text>
            )}
            <Text style={styles.fieldLabel}>Crop Family Assignment (optional)</Text>
            <Text style={styles.fieldHint}>Dedicating a block to one family makes rotation tracking across seasons automatic.</Text>
            <ChipSelect
                options={FAMILY_OPTIONS}
                value={familyAssignment}
                onSelect={setFamilyAssignment}
            />
            <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Grid Position on Farm Map</Text>
            {takenPositions.size > 0 && (
                <Text style={styles.fieldHint}>Greyed slots (✕) are already occupied by blocks on this farm.</Text>
            )}
            <View style={styles.gridPicker}>
                {buildAllPositions().map(pos => {
                    const isOccupied = takenPositions.has(`${pos.col}_${pos.row}`);
                    const isSelected = gridPos?.label === pos.label;
                    return (
                        <TouchableOpacity
                            key={pos.label}
                            style={[
                                styles.gridCell,
                                isSelected && styles.gridCellActive,
                                isOccupied && styles.gridCellOccupied,
                                { width: `${Math.floor(96 / totalGridCols)}%` },
                            ]}
                            onPress={() => !isOccupied && setGridPos(pos)}
                            activeOpacity={isOccupied ? 1 : 0.7}
                        >
                            <Text style={[
                                styles.gridCellText,
                                isSelected && styles.gridCellTextActive,
                                isOccupied && styles.gridCellTextOccupied,
                            ]}>
                                {pos.label}{isOccupied ? ' ✕' : ''}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            {/* + Add Row / + Add Column for extended positions */}
            <View style={styles.addBtnsRow}>
                <TouchableOpacity
                    style={[styles.addRowBtn, { flex: 1 }]}
                    onPress={() => setExtraGridRows(r => r + 1)}
                >
                    <Text style={styles.addRowBtnText}>
                        + Add Row  (SW{extraGridRows + 1} / S{extraGridRows + 1} / SE{extraGridRows + 1})
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.addRowBtn, { flex: 1 }]}
                    onPress={() => setExtraGridCols(c => c + 1)}
                >
                    <Text style={styles.addRowBtnText}>
                        {extraGridCols + 1 > extraGridRows
                            ? `+ Add Column  (NE${extraGridCols + 1} | E${extraGridCols + 1} | SE${extraGridCols + 1})`
                            : `+ Add Column  (NE${extraGridCols + 1} | E${extraGridCols + 1})`
                        }
                    </Text>
                </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />
        </ScrollView>,

        // Step 2: Bed Config + Pathways
        <ScrollView
            key="step2"
            style={[styles.stepContent, Platform.OS === 'web' ? { overflowY: 'scroll', flex: 1, minHeight: 0, maxHeight: 'calc(100dvh - 190px)' } : null]}
            contentContainerStyle={styles.stepInner}
            showsVerticalScrollIndicator={Platform.OS !== 'web'}
        >
            <Text style={styles.stepTitle}>Bed Configuration</Text>
            <View style={styles.modeToggle}>
                {[{ v: 'beds', l: '# Beds' }, { v: 'dimensions', l: 'Block Size' }].map(({ v, l }) => (
                    <TouchableOpacity
                        key={v}
                        style={[styles.modeBtn, inputMode === v && styles.modeBtnActive]}
                        onPress={() => setInputMode(v)}
                    >
                        <Text style={[styles.modeBtnText, inputMode === v && styles.modeBtnTextActive]}>{l}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {inputMode === 'beds' ? (
                <>
                    <Text style={styles.fieldHint}>I know exactly how many beds I have.</Text>
                    <FieldRow label="Number of beds" value={bedCount} onChangeText={setBedCount} />
                    <FieldRow label="Bed length" unit="ft" value={bedLengthFt} onChangeText={setBedLengthFt} />
                </>
            ) : (
                <>
                    <Text style={styles.fieldHint}>I know my block dimensions — beds will be auto-calculated.</Text>
                    <FieldRow label="Block length" unit="ft" value={blockLenFt} onChangeText={setBlockLenFt} />
                    <FieldRow label="Block width" unit="ft" value={blockWidFt} onChangeText={setBlockWidFt} />
                    <FieldRow label="Bed length" unit="ft" value={bedLengthFt} onChangeText={setBedLengthFt} />
                </>
            )}

            {/* ── Pathways (merged from old Step 3) ─── */}
            <View style={[styles.bisectRow, { marginTop: Spacing.md }]}>
                <Text style={[styles.fieldLabel, { flex: 1 }]}>Pathways</Text>
            </View>
            <FieldRow label="Bed width" unit="ft" value={bedWidthFt} onChangeText={setBedWidthFt} placeholder="2.5" />
            <FieldRow label="Pathway width between beds" unit="ft" value={pathwayFt} onChangeText={setPathwayFt} placeholder="1" />

            <View style={styles.bisectRow}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Bisecting road / main path?</Text>
                    <Text style={styles.fieldHint}>A road or wide path that cuts the block in half</Text>
                </View>
                <Switch
                    value={bisectEnabled}
                    onValueChange={setBisectEnabled}
                    trackColor={{ false: 'rgba(45,79,30,0.15)', true: Colors.primaryGreen }}
                    thumbColor={Colors.cream}
                />
            </View>

            {bisectEnabled && (
                <>
                    <Text style={styles.fieldLabel}>Orientation</Text>
                    <ChipSelect
                        options={['NS (runs N↕S, splits E/W)', 'EW (runs E↔W, splits N/S)']}
                        value={bisectOrient === 'NS' ? 'NS (runs N↕S, splits E/W)' : 'EW (runs E↔W, splits N/S)'}
                        onSelect={v => setBisectOrient(v.startsWith('NS') ? 'NS' : 'EW')}
                    />
                    <FieldRow label="Road / path width" unit="ft" value={bisectWidFt} onChangeText={setBisectWidFt} placeholder="14" />
                </>
            )}

            {inputMode === 'dimensions' && (
                <View style={styles.calcPreview}>
                    <Text style={styles.calcLabel}>Auto-calculated beds</Text>
                    <Text style={styles.calcValue}>{computedBedCount} beds</Text>
                </View>
            )}
            <View style={{ height: 40 }} />
        </ScrollView>,

        // Step 3: Review
        <ScrollView key="step3"
            style={[styles.stepContent, Platform.OS === 'web' ? { overflowY: 'scroll', flex: 1, minHeight: 0, maxHeight: 'calc(100dvh - 190px)' } : null]}
            contentContainerStyle={styles.stepInner}
            showsVerticalScrollIndicator={Platform.OS !== 'web'}
        >
            <Text style={styles.stepTitle}>Review & Save</Text>
            <View style={styles.reviewCard}>
                {isDuplicate && !isEditing ? (
                    <>
                        <Row label="Creating blocks" value={`${dupeCountStr} blocks`} />
                        {dupeNames.map((n, i) => (
                            <Row
                                key={i}
                                label={`Block ${String.fromCharCode(65 + i)}`}
                                value={`${n.trim() || `${blockName.trim() || 'Block'} ${String.fromCharCode(65 + i)}`} · ${dupeGridPositions[i]?.label ?? '—'}`}
                            />
                        ))}
                        <View style={styles.reviewDivider} />
                    </>
                ) : (
                    <Row label="Block name" value={blockName || '(unnamed)'} />
                )}
                <Row label="Grid position" value={gridPos?.label ?? '—'} />
                <Row label="Family assignment" value={familyAssignment} />
                <Row label="Beds" value={`${effectiveBedCount} beds`} />
                <Row label="Bed length" value={`${effectiveBedLen} ft`} />
                <Row label="Bed width" value={`${bedWidthFt} ft`} />
                <Row label="Pathway width" value={`${pathwayFt} ft`} />
                {bisectEnabled && <Row label="Bisecting road" value={`${bisectOrient}, ${bisectWidFt}ft wide`} />}
                {inputMode === 'dimensions' && (
                    <Row label="Block dimensions" value={`${blockLenFt || '—'} ft × ${blockWidFt || '—'} ft`} />
                )}
                <View style={styles.reviewDivider} />
                <Row label="Total Planted Area (Per Block)" value={`${(effectiveBedCount * effectiveBedLen * (parseFloat(bedWidthFt) || 2.5)).toLocaleString()} sq ft`} />
            </View>
            <TouchableOpacity style={styles.saveBlockBtn} onPress={handleSave}>
                <Text style={styles.saveBlockBtnText}>
                    {isDuplicate && !isEditing
                        ? `✓ Create ${dupeCountStr} Blocks`
                        : '✓ Save Block'
                    }
                </Text>
            </TouchableOpacity>
        </ScrollView>,
    ];

    const canAdvance = [
        true, // step 0: multiple? always valid
        true, // step 1: name optional
        inputMode === 'beds' ? (parseInt(bedCount) > 0) : (parseFloat(blockLenFt) > 0 && parseFloat(blockWidFt) > 0), // step 2: bed config
        false, // step 3: save button handles it
    ][contentIdx] ?? false;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <HomeLogoButton navigation={navigation} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>FARM DESIGNER</Text>
                    <Text style={styles.heading}>{existingBlock ? 'Edit Block' : 'New Block'}</Text>
                    <StepDots step={step} />
                </View>
                {step < effectiveTotalSteps - 1 && (
                    <TouchableOpacity
                        style={[styles.headerNextBtn, !canAdvance && styles.headerNextBtnDisabled]}
                        onPress={goForward}
                        disabled={!canAdvance}
                    >
                        <Text style={styles.headerNextBtnText}>
                            {step === TOTAL_STEPS - 2 ? 'Review →' : 'Next →'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <Animated.View style={[
                styles.body,
                { transform: [{ translateX: slideAnim }] },
                Platform.OS === 'web' ? { overflow: 'clip', minHeight: 0 } : null,
            ]}>
                {stepContent[contentIdx]}
            </Animated.View>

        </View>
    );
}

// Small helper row for review step
const Row = ({ label, value }) => (
    <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>{label}</Text>
        <Text style={styles.reviewValue}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0EDE6',
        ...Platform.select({ web: { height: '100dvh', overflow: 'clip' } }),
    },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },

    stepDots: { flexDirection: 'row', gap: 5, marginTop: 3 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
    dotActive: { backgroundColor: Colors.cream },

    body: { flex: 1, ...Platform.select({ web: { minHeight: 0 } }) },
    stepContent: { flex: 1, ...Platform.select({ web: { minHeight: 0 } }) },
    stepInner: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 60 },
    stepTitle: { fontSize: 22, fontWeight: '800', color: Colors.primaryGreen },
    stepSubtitle: { fontSize: Typography.sm, color: Colors.mutedText, marginTop: -Spacing.sm },
    stepHint: { fontSize: Typography.xs, color: Colors.mutedText },

    bigInput: {
        borderWidth: 2, borderColor: 'rgba(45,79,30,0.25)', borderRadius: Radius.md,
        padding: Spacing.md, fontSize: Typography.lg, fontWeight: '700', color: Colors.primaryGreen,
        backgroundColor: Colors.white ?? '#FFF',
    },

    fieldLabel: { fontSize: Typography.xs, fontWeight: '800', color: Colors.primaryGreen, letterSpacing: 0.5, textTransform: 'uppercase' },
    fieldHint: { fontSize: Typography.xs, color: Colors.mutedText, marginTop: -Spacing.sm + 2, lineHeight: 16 },

    fieldRow: { gap: 4 },
    fieldInputWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    fieldInput: {
        flex: 1, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)', borderRadius: Radius.sm,
        padding: 10, fontSize: Typography.sm, color: Colors.primaryGreen, backgroundColor: Colors.white ?? '#FFF',
    },
    fieldUnit: { fontSize: Typography.xs, color: Colors.mutedText, width: 28 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 4 },
    chip: {
        paddingVertical: 6, paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(45,79,30,0.07)',
        borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: 160,
    },
    chipActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    chipText: { fontSize: 12, color: Colors.primaryGreen, fontWeight: '700', textAlign: 'center' },
    chipTextActive: { color: Colors.cream },

    gridPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    gridCell: { width: '22%', paddingVertical: 1, borderRadius: Radius.sm, borderWidth: 1, borderColor: 'rgba(45,79,30,0.15)', alignItems: 'center', backgroundColor: 'rgba(45,79,30,0.04)' },
    gridCellActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    // Occupied by an existing farm block — not selectable
    gridCellOccupied: { backgroundColor: 'rgba(180,30,30,0.07)', borderColor: 'rgba(180,30,30,0.25)', opacity: 0.55 },
    gridCellText: { fontSize: 7, fontWeight: '700', color: Colors.primaryGreen },
    gridCellTextActive: { color: Colors.cream },
    gridCellTextOccupied: { color: '#B01818', fontWeight: '800' },

    // ── + Add Row / + Add Column buttons row ───────────────────────────────────
    addBtnsRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: Spacing.sm,
    },
    addRowBtn: {
        flex: 1, // Added flex: 1 to make buttons share space
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: Radius.md,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(45,79,30,0.3)',
        alignItems: 'center',
    },
    addRowBtnText: {
        fontSize: Typography.xs,
        fontWeight: '700',
        color: Colors.primaryGreen,
        letterSpacing: 0.3,
    },

    modeToggle: { flexDirection: 'row', gap: 8, borderRadius: Radius.md, overflow: 'hidden' },
    modeBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', alignItems: 'center' },
    modeBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    modeBtnText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.primaryGreen },
    modeBtnTextActive: { color: Colors.cream },

    // Yes / No big buttons for duplicate layout question
    yesNoRow: { flexDirection: 'row', gap: 12, marginVertical: Spacing.sm },
    yesNoBtn: {
        flex: 1, paddingVertical: 20,
        borderRadius: Radius.lg,
        borderWidth: 2, borderColor: 'rgba(45,79,30,0.2)',
        alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(45,79,30,0.03)',
    },
    yesNoBtnActive: {
        backgroundColor: Colors.primaryGreen,
        borderColor: Colors.primaryGreen,
    },
    yesNoBtnLabel: {
        fontSize: 28, fontWeight: '900',
        color: Colors.primaryGreen,
    },
    yesNoBtnLabelActive: { color: Colors.cream },
    yesNoBtnSub: {
        fontSize: Typography.xs, fontWeight: '600',
        color: Colors.mutedText, textAlign: 'center',
        paddingHorizontal: 8,
    },
    yesNoBtnSubActive: { color: 'rgba(245,245,220,0.78)' },

    bisectRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

    calcPreview: { marginTop: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: 'rgba(45,79,30,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    calcLabel: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primaryGreen, textTransform: 'uppercase' },
    calcValue: { fontSize: 22, fontWeight: '900', color: Colors.primaryGreen },

    reviewCard: { backgroundColor: Colors.cardBg ?? '#FAFAF7', borderRadius: Radius.md, padding: Spacing.md, gap: 8 },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
    reviewLabel: { fontSize: Typography.xs, color: Colors.mutedText, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    reviewValue: { fontSize: Typography.sm, color: Colors.primaryGreen, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
    reviewDivider: { height: 1, backgroundColor: 'rgba(45,79,30,0.1)', marginVertical: 4 },

    saveBlockBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.md },
    saveBlockBtnText: { color: Colors.cream, fontWeight: '800', fontSize: Typography.md },

    headerNextBtn: {
        backgroundColor: Colors.cream,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        minWidth: 90,
        alignItems: 'center',
    },
    headerNextBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    headerNextBtnText: {
        color: Colors.primaryGreen,
        fontWeight: '700',
        fontSize: 14,
    },
    footer: { padding: Spacing.lg, paddingBottom: 32 },
    nextBtn: { backgroundColor: Colors.primaryGreen, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center' },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText: { color: Colors.cream, fontWeight: '800', fontSize: Typography.md },

    // ── Per-block duplicate card styles ──────────────────────────────────────
    dupeBlockCard: {
        backgroundColor: Colors.white ?? '#FFF',
        borderRadius: Radius.md, borderWidth: 1.5,
        borderColor: 'rgba(45,79,30,0.15)', padding: Spacing.sm, gap: 8,
    },
    dupeBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dupeBadge: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: Colors.primaryGreen, textAlign: 'center',
        fontSize: Typography.sm, fontWeight: '900', color: Colors.cream,
        lineHeight: 28, overflow: 'hidden',
    },

    // Mini 3×3 grid position picker inside each dupe block card
    dupeGridWrap: { gap: 4 },
    dupeGridLabel: { fontSize: 9, fontWeight: '800', color: Colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5 },
    dupeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    dupeGridCell: {
        width: '30%', paddingVertical: 5,
        borderRadius: Radius.sm, borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.18)',
        alignItems: 'center',
        backgroundColor: 'rgba(45,79,30,0.04)',
    },
    dupeGridCellActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    // Taken by another card in the same batch
    dupeGridCellTaken: { backgroundColor: 'rgba(0,0,0,0.04)', borderColor: 'rgba(0,0,0,0.08)', opacity: 0.4 },
    // Occupied by a pre-existing farm block
    dupeGridCellOccupied: { backgroundColor: 'rgba(180,30,30,0.07)', borderColor: 'rgba(180,30,30,0.25)', opacity: 0.55 },
    dupeGridCellText: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen },
    dupeGridCellTextActive: { color: Colors.cream },
    dupeGridCellTextTaken: { color: Colors.mutedText },

    // ── Inline duplicate-name warning ────────────────────────────────────────
    duplicateWarning: {
        fontSize: Typography.xs, fontWeight: '700',
        color: '#B01818',
        marginTop: -4,
        paddingLeft: 2,
    },
    // Border highlight on conflicting name inputs
    fieldInputError: { borderColor: '#B01818', borderWidth: 2 },
    bigInputError:   { borderColor: '#B01818', borderWidth: 2.5 },
});
