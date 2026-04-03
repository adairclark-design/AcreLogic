/**
 * AIPlanGeneratorModal
 * ════════════════════
 * Bottom sheet modal that lets the user specify their CSA size,
 * calls Gemini for an optimized 8-bed plan, then applies it to bedSuccessions.
 *
 * Props:
 *   visible         - boolean
 *   farmProfile     - object
 *   frostFreeDays   - number
 *   onClose         - () => void
 *   onApplyPlan     - (bedSuccessions: object) => void  ← merged plan handed back
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal,
    TextInput, Animated, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { callAiPlanGenerator } from '../services/aiAdvisorService';
import { getCropsForWindow, getCropById } from '../services/database';
import { getSuccessionCandidatesRanked, autoGenerateSuccessions } from '../services/successionEngine';

const MEMBER_PRESETS = [10, 20, 30, 50, 100];

export default function AIPlanGeneratorModal({ visible, farmProfile, frostFreeDays, onClose, onApplyPlan }) {
    const [memberCount, setMemberCount] = useState(20);
    const [customCount, setCustomCount] = useState('');
    const [phase, setPhase] = useState('idle'); // idle | thinking | mapping | applying | done | error
    const [statusMsg, setStatusMsg] = useState('');
    const [planSummary, setPlanSummary] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const slideAnim = useRef(new Animated.Value(600)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            setPhase('idle');
            setPlanSummary(null);
            setErrorMsg('');
            Animated.parallel([
                Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
                Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: 600, duration: 280, useNativeDriver: true }),
                Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    // Pulse animation for the thinking indicator
    useEffect(() => {
        if (phase === 'thinking' || phase === 'mapping' || phase === 'applying') {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 0.6, duration: 700, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        }
    }, [phase]);

    const effectiveMemberCount = customCount ? parseInt(customCount) || memberCount : memberCount;

    const handleGenerate = useCallback(async () => {
        setPhase('thinking');
        setStatusMsg('Asking AI to design your farm plan…');
        setErrorMsg('');

        try {
            // 1. Fetch available crops
            const allCrops = await getCropsForWindow(frostFreeDays, ['cool', 'warm'], ['Cover Crop']);
            const cropSummaries = allCrops.map(c => ({
                name: c.name,
                dtm: c.dtm,
                price: c.wholesale_price_per_lb ?? 2,
                yield_lbs: Math.round((c.yield_lbs_per_100ft ?? 50) * 0.5),
            }));

            // 2. Call Gemini for a crop plan
            const plan = await callAiPlanGenerator(farmProfile, effectiveMemberCount, cropSummaries);

            if (!plan?.beds?.length) throw new Error('AI returned an empty plan');

            setPhase('mapping');
            setStatusMsg('Matching AI suggestions to your crop database…');

            // 3. Map crop names → crop IDs + generate successions per bed
            const newBedSuccessions = {};
            const summary = [];

            for (const bedPlan of plan.beds) {
                const bedNum = bedPlan.bed;
                if (!bedNum || bedNum > 8) continue;

                const successions = [];
                let remainingDays = frostFreeDays;

                for (const cropName of (bedPlan.crops ?? [])) {
                    if (remainingDays < 20) break;

                    // Fuzzy match: find crop by name (case-insensitive prefix)
                    const match = allCrops.find(c =>
                        c.name.toLowerCase().startsWith(cropName.toLowerCase().slice(0, 4)) ||
                        cropName.toLowerCase().startsWith(c.name.toLowerCase().slice(0, 4))
                    );
                    if (!match) continue;

                    // Use successionEngine to get a dated slot
                    const previousCrop = successions.length > 0 ? successions[successions.length - 1] : null;
                    const candidates = await getSuccessionCandidatesRanked(
                        { successions },
                        farmProfile ?? { frost_free_days: frostFreeDays },
                        { maxResults: 1, forceIncludeCropId: match.id }
                    ).catch(() => []);

                    const best = candidates.find(c => c.crop?.id === match.id) ?? candidates[0];
                    if (!best?.fits) continue;

                    const slot = {
                        crop_id: best.crop.id,
                        crop_name: best.crop.name,
                        variety: best.crop.variety,
                        emoji: best.crop.emoji,
                        dtm: best.crop.dtm,
                        harvest_window_days: best.crop.harvest_window_days,
                        feed_class: best.crop.feed_class,
                        category: best.crop.category,
                        start_date: best.start_date,
                        end_date: best.end_date,
                        succession_slot: successions.length + 1,
                        is_auto_generated: true,
                    };
                    successions.push(slot);
                    remainingDays -= (best.crop.dtm ?? 30) + (best.crop.harvest_window_days ?? 0);
                }

                if (successions.length > 0) {
                    newBedSuccessions[bedNum] = successions;
                    summary.push({ bed: bedNum, crops: successions.map(s => s.crop_name) });
                }
            }

            setPhase('done');
            setPlanSummary({ beds: summary, csa_notes: plan.csa_notes ?? '' });
            onApplyPlan(newBedSuccessions);

        } catch (err) {
            console.error('[AIPlanGenerator]', err);
            setPhase('error');
            setErrorMsg(err.message ?? 'Something went wrong');
        }
    }, [farmProfile, frostFreeDays, effectiveMemberCount]);

    const RATING_ICONS = { thinking: '🤖', mapping: '🌱', applying: '📋', done: '✅', error: '⚠️' };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <Animated.View style={[styles.scrim, { opacity: opacityAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
            </Animated.View>
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                {/* Handle */}
                <View style={styles.handle} />

                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerIcon}>🤖</Text>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>AI Plan Generator</Text>
                        <Text style={styles.subtitle}>Gemini designs your farm block CSA plan</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                    {phase === 'idle' && (
                        <>
                            <Text style={styles.label}>How many CSA members are you planning for?</Text>

                            {/* Preset buttons */}
                            <View style={styles.presets}>
                                {MEMBER_PRESETS.map(n => (
                                    <TouchableOpacity
                                        key={n}
                                        style={[styles.presetBtn, memberCount === n && !customCount && styles.presetBtnActive]}
                                        onPress={() => { setMemberCount(n); setCustomCount(''); }}
                                    >
                                        <Text style={[styles.presetText, memberCount === n && !customCount && styles.presetTextActive]}>{n}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Custom count input */}
                            <View style={styles.customRow}>
                                <Text style={styles.customLabel}>Or enter custom:</Text>
                                <TextInput
                                    style={styles.customInput}
                                    value={customCount}
                                    onChangeText={setCustomCount}
                                    keyboardType="numeric"
                                    placeholder="e.g. 45"
                                    placeholderTextColor={Colors.mutedText}
                                    maxLength={4}
                                />
                            </View>

                            <View style={styles.infoRow}>
                                <Text style={styles.infoText}>
                                    ✦ AI will select crops optimized for yield, variety, and {effectiveMemberCount} weekly shares
                                </Text>
                            </View>

                            <TouchableOpacity style={[styles.generateBtn, Shadows.button]} onPress={handleGenerate}>
                                <Text style={styles.generateBtnText}>🌱 Generate My Farm Plan</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {(phase === 'thinking' || phase === 'mapping' || phase === 'applying') && (
                        <View style={styles.progressView}>
                            <Animated.Text style={[styles.progressIcon, { opacity: pulseAnim }]}>
                                {RATING_ICONS[phase] ?? '🤖'}
                            </Animated.Text>
                            <ActivityIndicator color={Colors.primaryGreen} size="large" style={{ marginVertical: 12 }} />
                            <Text style={styles.progressMsg}>{statusMsg}</Text>
                            <Text style={styles.progressHint}>This takes 10–20 seconds ·  Powered by Gemini</Text>
                        </View>
                    )}

                    {phase === 'done' && planSummary && (
                        <View style={styles.resultView}>
                            <Text style={styles.resultTitle}>✅ Plan Applied!</Text>
                            {planSummary.csa_notes ? (
                                <View style={styles.notesCard}>
                                    <Text style={styles.notesText}>"{planSummary.csa_notes}"</Text>
                                </View>
                            ) : null}
                            {planSummary.beds.map(b => (
                                <View key={b.bed} style={styles.resultRow}>
                                    <Text style={styles.resultBedNum}>Bed {b.bed}</Text>
                                    <Text style={styles.resultCrops} numberOfLines={1}>{b.crops.join(' → ')}</Text>
                                </View>
                            ))}
                            <TouchableOpacity style={[styles.doneBtn, Shadows.button]} onPress={onClose}>
                                <Text style={styles.doneBtnText}>View My Plan →</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {phase === 'error' && (
                        <View style={styles.errorView}>
                            <Text style={styles.errorIcon}>⚠️</Text>
                            <Text style={styles.errorTitle}>Plan generation failed</Text>
                            <Text style={styles.errorMsg}>{errorMsg}</Text>
                            <TouchableOpacity style={styles.retryBtn} onPress={() => setPhase('idle')}>
                                <Text style={styles.retryBtnText}>Try Again</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20 },
    sheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Colors.cardBg ?? '#FAFAF7',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        zIndex: 21, paddingBottom: 36, maxHeight: '85%',
    },
    handle: { width: 40, height: 4, backgroundColor: 'rgba(45,79,30,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },

    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.1)', gap: Spacing.sm },
    headerIcon: { fontSize: 28 },
    headerText: { flex: 1, gap: 2 },
    title: { fontSize: Typography.lg ?? 18, fontWeight: '700', color: Colors.primaryGreen },
    subtitle: { fontSize: Typography.xs ?? 11, color: Colors.mutedText },
    closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(45,79,30,0.1)', alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 12, color: Colors.primaryGreen },

    body: { paddingHorizontal: Spacing.lg },

    label: { fontSize: Typography.base ?? 15, fontWeight: '600', color: Colors.primaryGreen, marginTop: Spacing.lg, marginBottom: Spacing.sm },

    presets: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    presetBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, backgroundColor: 'rgba(45,79,30,0.06)', borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.15)', alignItems: 'center' },
    presetBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    presetText: { fontSize: Typography.sm ?? 14, fontWeight: '700', color: Colors.primaryGreen },
    presetTextActive: { color: Colors.cream ?? '#FFF8F0' },

    customRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
    customLabel: { fontSize: Typography.sm ?? 14, color: Colors.mutedText },
    customInput: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: Radius.sm, padding: 8, fontSize: Typography.base ?? 15, color: Colors.primaryGreen, textAlign: 'center' },

    infoRow: { backgroundColor: 'rgba(45,79,30,0.06)', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.lg },
    infoText: { fontSize: Typography.xs ?? 11, color: Colors.primaryGreen, lineHeight: 16 },

    generateBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 16, borderRadius: Radius.md, alignItems: 'center' },
    generateBtnText: { color: Colors.cream ?? '#FFF8F0', fontSize: Typography.md ?? 16, fontWeight: '700', letterSpacing: 1 },

    progressView: { alignItems: 'center', paddingVertical: 40, gap: 6 },
    progressIcon: { fontSize: 48 },
    progressMsg: { fontSize: Typography.base ?? 15, fontWeight: '600', color: Colors.primaryGreen, textAlign: 'center' },
    progressHint: { fontSize: Typography.xs ?? 11, color: Colors.mutedText, marginTop: 4, textAlign: 'center' },

    resultView: { paddingTop: Spacing.lg, gap: Spacing.sm },
    resultTitle: { fontSize: Typography.lg ?? 18, fontWeight: '700', color: Colors.primaryGreen },
    notesCard: { backgroundColor: 'rgba(45,79,30,0.06)', borderRadius: Radius.sm, padding: Spacing.sm },
    notesText: { fontSize: Typography.sm ?? 14, color: Colors.primaryGreen, fontStyle: 'italic', lineHeight: 20 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(45,79,30,0.07)' },
    resultBedNum: { fontSize: Typography.sm ?? 14, fontWeight: '700', color: Colors.burntOrange, width: 44 },
    resultCrops: { flex: 1, fontSize: Typography.sm ?? 14, color: Colors.primaryGreen },
    doneBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.md },
    doneBtnText: { color: Colors.cream ?? '#FFF8F0', fontSize: Typography.base ?? 15, fontWeight: '700', letterSpacing: 1 },

    errorView: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    errorIcon: { fontSize: 40 },
    errorTitle: { fontSize: Typography.lg ?? 18, fontWeight: '700', color: '#C62828' },
    errorMsg: { fontSize: Typography.sm ?? 14, color: Colors.mutedText, textAlign: 'center', paddingHorizontal: 16 },
    retryBtn: { backgroundColor: 'rgba(45,79,30,0.1)', paddingVertical: 10, paddingHorizontal: 24, borderRadius: Radius.full, marginTop: 8 },
    retryBtnText: { color: Colors.primaryGreen, fontWeight: '700' },
});
