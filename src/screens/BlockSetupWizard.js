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
import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, Animated, Platform, Switch,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { saveBlock } from '../services/persistence';
import {
    calculateBedsFromDimensions, blockSummaryLine,
    generateBlockId, GRID_POSITIONS, FAMILY_OPTIONS,
} from '../services/farmUtils';

const TOTAL_STEPS = 5;

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
const FieldRow = ({ label, unit, value, onChangeText, keyboardType = 'numeric', placeholder = '0' }) => (
    <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.fieldInputWrap}>
            <TextInput
                style={styles.fieldInput}
                value={value}
                onChangeText={onChangeText}
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
    // prefill: data passed from FarmSatelliteScreen after drawing a polygon
    const prefill = route?.params?.prefill ?? null;

    const [step, setStep] = useState(0);
    const slideAnim = useRef(new Animated.Value(0)).current;

    // ── Form State — falls back to satellite prefill before using defaults ─────
    const [blockName, setBlockName] = useState(existingBlock?.name ?? prefill?.blockName ?? '');
    const [familyAssignment, setFamilyAssignment] = useState(existingBlock?.familyAssignment ?? 'Mixed (no restriction)');
    const [gridPos, setGridPos] = useState(existingBlock?.gridPosition ?? defaultGridPos ?? prefill?.gridPosition ?? GRID_POSITIONS[4]);

    const [inputMode, setInputMode] = useState(existingBlock?.inputMode ?? prefill?.inputMode ?? 'beds');
    const [bedCount, setBedCount] = useState(String(existingBlock?.bedCount ?? prefill?.bedCount ?? '8'));
    const [bedLengthFt, setBedLengthFt] = useState(String(existingBlock?.bedLengthFt ?? prefill?.bedLengthFt ?? '100'));
    const [blockLenFt, setBlockLenFt] = useState(String(existingBlock?.blockLengthFt ?? prefill?.blockLengthFt ?? ''));
    const [blockWidFt, setBlockWidFt] = useState(String(existingBlock?.blockWidthFt ?? prefill?.blockWidthFt ?? ''));

    const [bedWidthFt, setBedWidthFt] = useState(String(existingBlock?.bedWidthFt ?? '2.5'));
    const [pathwayFt, setPathwayFt] = useState(String(existingBlock?.pathwayWidthFt ?? '4'));
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
        // Block 0 gets the user's chosen gridPos; blocks 1+ get the next 1 available slot
        const used = new Set(gridPos ? [`${gridPos.col}_${gridPos.row}`] : []);
        const available = GRID_POSITIONS.filter(p => !used.has(`${p.col}_${p.row}`));
        return [gridPos ?? null, available[0] ?? null];
    });

    // Recompute available positions for auto-defaults, given what other blocks in the
    // batch have already claimed. Returns positions NOT claimed by any other index.
    const getAvailableForIdx = (positions, skipIdx) => {
        const used = new Set(
            positions
                .filter((p, i) => i !== skipIdx && p)
                .map(p => `${p.col}_${p.row}`)
        );
        return GRID_POSITIONS.filter(p => !used.has(`${p.col}_${p.row}`));
    };

    // Update dupeNames array when count changes
    const applyDupeCount = (val) => {
        const n = Math.max(2, Math.min(20, parseInt(val) || 2));
        setDupeCountStr(String(n));
        setDupeNames(prev => {
            const arr = Array.from({ length: n }, (_, i) => prev[i] ?? '');
            return arr;
        });
        // Also resize dupeGridPositions, filling new slots with next auto-available position
        setDupeGridPositions(prev => {
            const arr = Array.from({ length: n }, (_, i) => prev[i] ?? null);
            // Fill any nulls (newly added slots) with the next available unoccupied position
            for (let i = 0; i < n; i++) {
                if (!arr[i]) {
                    const avail = getAvailableForIdx(arr, i);
                    arr[i] = avail[0] ?? null;
                }
            }
            return arr;
        });
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
    // Actual step count: 5 when creating, 4 when editing (Step 1 hidden)
    const effectiveTotalSteps = isEditing ? TOTAL_STEPS - 1 : TOTAL_STEPS;
    // Map internal step index → wizard content index
    // When isEditing, step 1 (duplicate) is not shown, so we offset
    const contentIdx = (!isEditing || step === 0) ? step : step + 1;

    // ── Derived: computed bed count for dimension mode ──────────────────────
    const computedBedCount = inputMode === 'dimensions'
        ? calculateBedsFromDimensions({
            blockLengthFt: parseFloat(blockLenFt) || 0,
            blockWidthFt: parseFloat(blockWidFt) || 0,
            bedWidthFt: parseFloat(bedWidthFt) || 2.5,
            pathwayWidthFt: parseFloat(pathwayFt) || 4,
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
    const goForward = () => {
        Animated.timing(slideAnim, { toValue: -30, duration: 80, useNativeDriver: true }).start(() => {
            slideAnim.setValue(30);
            setStep(s => s + 1);
            Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
        });
    };

    const goBack = () => {
        if (step === 0) { navigation.goBack(); return; }
        Animated.timing(slideAnim, { toValue: 30, duration: 80, useNativeDriver: true }).start(() => {
            slideAnim.setValue(-30);
            setStep(s => s - 1);
            Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
        });
    };

    const handleSave = () => {
        const baseBlock = {
            inputMode,
            bedCount: effectiveBedCount,
            bedLengthFt: effectiveBedLen,
            bedWidthFt: parseFloat(bedWidthFt) || 2.5,
            pathwayWidthFt: parseFloat(pathwayFt) || 4,
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
                });
            }
        } else {
            // Single block (or editing)
            saveBlock({
                ...baseBlock,
                id: existingBlock?.id ?? prefill?.id ?? generateBlockId(),
                name: blockName.trim() || `Block ${Date.now().toString(36).toUpperCase().slice(-4)}`,
            });
        }

        navigation.navigate('FarmDesigner', { farmProfile, saved: true });
    };

    // ─── Step content ─────────────────────────────────────────────────────
    const stepContent = [
        // Step 0: Name + Position
        <ScrollView key="step0" style={styles.stepContent} contentContainerStyle={styles.stepInner}
            showsVerticalScrollIndicator={false}
            {...(Platform.OS === 'web' ? { style: [styles.stepContent, { overflowY: 'scroll' }], contentContainerStyle: styles.stepInner } : {})}
        >
            <Text style={styles.stepTitle}>Name Your Block</Text>
            <Text style={styles.stepSubtitle}>What do you call this section of your farm?</Text>
            <TextInput
                style={styles.bigInput}
                value={blockName}
                onChangeText={setBlockName}
                placeholder="e.g. Block A, North Field, Hoop House..."
                placeholderTextColor={Colors.mutedText}
                autoFocus
            />
            <Text style={styles.fieldLabel}>Crop Family Assignment (optional)</Text>
            <Text style={styles.fieldHint}>Dedicating a block to one family makes rotation tracking across seasons automatic.</Text>
            <ChipSelect
                options={FAMILY_OPTIONS}
                value={familyAssignment}
                onSelect={setFamilyAssignment}
            />
            <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Grid Position on Farm Map</Text>
            <View style={styles.gridPicker}>
                {GRID_POSITIONS.map(pos => (
                    <TouchableOpacity
                        key={pos.label}
                        style={[styles.gridCell, gridPos?.label === pos.label && styles.gridCellActive]}
                        onPress={() => setGridPos(pos)}
                    >
                        <Text style={[styles.gridCellText, gridPos?.label === pos.label && styles.gridCellTextActive]}>
                            {pos.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            <View style={{ height: 40 }} />
        </ScrollView>,

        // Step 1 (NEW — skipped when editing): Block Duplication
        <ScrollView key="step1" style={styles.stepContent} contentContainerStyle={styles.stepInner}
            showsVerticalScrollIndicator={false}
            {...(Platform.OS === 'web' ? { style: [styles.stepContent, { overflowY: 'scroll' }], contentContainerStyle: styles.stepInner } : {})}
        >
            <Text style={styles.stepTitle}>Multiple Blocks?</Text>
            <Text style={styles.stepSubtitle}>
                Do you have more than one block with the same layout? You can create them all at once.
            </Text>

            {/* Yes / No toggle */}
            <View style={styles.modeToggle}>
                {[{ v: false, l: 'No — just this one' }, { v: true, l: 'Yes — duplicate layout' }].map(({ v, l }) => (
                    <TouchableOpacity
                        key={String(v)}
                        style={[styles.modeBtn, isDuplicate === v && styles.modeBtnActive]}
                        onPress={() => setIsDuplicate(v)}
                    >
                        <Text style={[styles.modeBtnText, isDuplicate === v && styles.modeBtnTextActive]}>{l}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {isDuplicate && (
                <>
                    <Text style={styles.fieldHint}>
                        How many blocks total with this layout? (2–20)
                    </Text>
                    <FieldRow
                        label="Total blocks"
                        value={dupeCountStr}
                        onChangeText={applyDupeCount}
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
                        const takenByOthers = new Set(
                            dupeGridPositions
                                .filter((p, i) => i !== idx && p)
                                .map(p => `${p.col}_${p.row}`)
                        );
                        const myPos = dupeGridPositions[idx];
                        return (
                            <View key={idx} style={styles.dupeBlockCard}>
                                {/* Block label + name field */}
                                <View style={styles.dupeBlockHeader}>
                                    <Text style={styles.dupeBadge}>{String.fromCharCode(65 + idx)}</Text>
                                    <TextInput
                                        style={[styles.fieldInput, { flex: 1 }]}
                                        value={name}
                                        onChangeText={val => updateDupeName(idx, val)}
                                        placeholder={`e.g. ${blockName.trim() || 'Block'} ${String.fromCharCode(65 + idx)}`}
                                        placeholderTextColor={Colors.mutedText}
                                        keyboardType="default"
                                    />
                                </View>

                                {/* Mini 3×3 grid position picker */}
                                <View style={styles.dupeGridWrap}>
                                    <Text style={styles.dupeGridLabel}>📍 Grid Position</Text>
                                    <View style={styles.dupeGrid}>
                                        {GRID_POSITIONS.map(pos => {
                                            const isSelected = myPos?.label === pos.label;
                                            const isTaken = takenByOthers.has(`${pos.col}_${pos.row}`);
                                            return (
                                                <TouchableOpacity
                                                    key={pos.label}
                                                    style={[
                                                        styles.dupeGridCell,
                                                        isSelected && styles.dupeGridCellActive,
                                                        isTaken && styles.dupeGridCellTaken,
                                                    ]}
                                                    onPress={() => !isTaken && updateDupeGridPos(idx, pos)}
                                                    activeOpacity={isTaken ? 1 : 0.7}
                                                >
                                                    <Text style={[
                                                        styles.dupeGridCellText,
                                                        isSelected && styles.dupeGridCellTextActive,
                                                        isTaken && styles.dupeGridCellTextTaken,
                                                    ]}>
                                                        {pos.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </>
            )}
            <View style={{ height: 40 }} />
        </ScrollView>,

        // Step 2: Beds or Dimensions
        <ScrollView key="step2" style={styles.stepContent} contentContainerStyle={styles.stepInner}
            showsVerticalScrollIndicator={false}
            {...(Platform.OS === 'web' ? { style: [styles.stepContent, { overflowY: 'scroll' }], contentContainerStyle: styles.stepInner } : {})}
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
            <View style={{ height: 40 }} />
        </ScrollView>,

        // Step 3: Pathways + bisecting road
        <ScrollView key="step3" style={styles.stepContent} contentContainerStyle={styles.stepInner}
            showsVerticalScrollIndicator={false}
            {...(Platform.OS === 'web' ? { style: [styles.stepContent, { overflowY: 'scroll' }], contentContainerStyle: styles.stepInner } : {})}
        >
            <Text style={styles.stepTitle}>Pathways</Text>
            <FieldRow label="Bed width" unit="ft" value={bedWidthFt} onChangeText={setBedWidthFt} placeholder="2.5" />
            <FieldRow label="Pathway width between beds" unit="ft" value={pathwayFt} onChangeText={setPathwayFt} placeholder="4" />

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
                        options={['NS (runs N↕5, splits E/W)', 'EW (runs E↔W, splits N/S)']}
                        value={bisectOrient === 'NS' ? 'NS (runs N↕5, splits E/W)' : 'EW (runs E↔W, splits N/S)'}
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

        // Step 4: Review
        <ScrollView key="step4" style={styles.stepContent} showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.stepInner}
            {...(Platform.OS === 'web' ? { style: [styles.stepContent, { overflowY: 'scroll' }], contentContainerStyle: styles.stepInner } : {})}
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
                <Row label="Grid position" value={gridPos?.label ?? 'Center'} />
                <Row label="Family assignment" value={familyAssignment} />
                <Row label="Beds" value={`${effectiveBedCount} beds`} />
                <Row label="Bed length" value={`${effectiveBedLen} ft`} />
                <Row label="Bed width" value={`${bedWidthFt} ft`} />
                <Row label="Pathway width" value={`${pathwayFt} ft`} />
                {bisectEnabled && <Row label="Bisecting road" value={`${bisectOrient}, ${bisectWidFt}ft wide`} />}
                <View style={styles.reviewDivider} />
                <Row label="Total planted area (per block)" value={`${(effectiveBedCount * effectiveBedLen * (parseFloat(bedWidthFt) || 2.5)).toLocaleString()} sq ft`} />
                <Row label="Total linear feet (per block)" value={`${(effectiveBedCount * effectiveBedLen * 4).toLocaleString()} row-ft`} />
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
        true, // step 0: name optional
        true, // step 1 (duplicate): always optional, skip if not needed
        inputMode === 'beds' ? (parseInt(bedCount) > 0) : (parseFloat(blockLenFt) > 0 && parseFloat(blockWidFt) > 0), // step 2
        true, // step 3: pathways always valid
        false, // step 4: save button handles it
    ][contentIdx] ?? false;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.stepLabel}>FARM DESIGNER</Text>
                    <Text style={styles.heading}>{existingBlock ? 'Edit Block' : 'New Block'}</Text>
                </View>
                <StepDots step={step} />
            </View>

            <Animated.View style={[styles.body, { transform: [{ translateX: slideAnim }] }]}>
                {stepContent[contentIdx]}
            </Animated.View>

            {/* Bottom nav */}
            {step < effectiveTotalSteps - 1 && (
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.nextBtn, !canAdvance && styles.nextBtnDisabled]}
                        onPress={goForward}
                        disabled={!canAdvance}
                    >

                        <Text style={styles.nextBtnText}>
                            {step === TOTAL_STEPS - 2 ? 'Review →' : 'Next →'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
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

    stepDots: { flexDirection: 'row', gap: 5 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
    dotActive: { backgroundColor: Colors.cream },

    body: { flex: 1 },
    stepContent: { flex: 1 },
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
    gridCellText: { fontSize: 7, fontWeight: '700', color: Colors.primaryGreen },
    gridCellTextActive: { color: Colors.cream },

    modeToggle: { flexDirection: 'row', gap: 8, borderRadius: Radius.md, overflow: 'hidden' },
    modeBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', alignItems: 'center' },
    modeBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    modeBtnText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.primaryGreen },
    modeBtnTextActive: { color: Colors.cream },

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
    dupeGridCellTaken: { backgroundColor: 'rgba(0,0,0,0.04)', borderColor: 'rgba(0,0,0,0.08)', opacity: 0.4 },
    dupeGridCellText: { fontSize: 10, fontWeight: '700', color: Colors.primaryGreen },
    dupeGridCellTextActive: { color: Colors.cream },
    dupeGridCellTextTaken: { color: Colors.mutedText },
});
