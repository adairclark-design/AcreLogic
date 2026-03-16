/**
 * FieldJournalScreen
 * ═══════════════════
 * Daily farm notes with:
 *   • Free-text entries sorted newest-first
 *   • Optional bed tag (Bed 1–8 or 'General')
 *   • Swipe-to-delete (long-press on web)
 *   • Persisted to localStorage via persistence.js
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Animated, Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadJournalEntries, saveJournalEntry, deleteJournalEntry, saveActualHarvest } from '../services/persistence';

const BED_TAGS = ['General', ...Array.from({ length: 8 }, (_, i) => `Bed ${i + 1}`)];

function formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Entry Card ───────────────────────────────────────────────────────────────
const EntryCard = ({ entry, onDelete }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const confirmDelete = () => {
        if (Platform.OS === 'web') {
            if (window.confirm('Delete this journal entry?')) onDelete(entry.id);
        } else {
            Alert.alert('Delete Entry', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(entry.id) },
            ]);
        }
    };

    const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start();
    const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

    const tagColor = entry.bedTag && entry.bedTag !== 'General' ? Colors.burntOrange : Colors.mutedText;

    return (
        <Animated.View style={[styles.entryCard, Shadows.card, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.entryHeader}>
                <View style={styles.entryMeta}>
                    <Text style={styles.entryDate}>{formatDate(entry.date)}</Text>
                    <Text style={styles.entryTime}>{formatTime(entry.date)}</Text>
                </View>
                {entry.bedTag && (
                    <View style={[styles.bedTag, entry.bedTag !== 'General' && styles.bedTagHighlight]}>
                        <Text style={[styles.bedTagText, { color: tagColor }]}>{entry.bedTag}</Text>
                    </View>
                )}
                <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={confirmDelete}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                >
                    <Text style={styles.deleteBtnText}>🗑</Text>
                </TouchableOpacity>
            </View>
            <Text style={styles.entryText}>{entry.text}</Text>
        </Animated.View>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FieldJournalScreen({ navigation, route }) {
    const { farmProfile, bedSuccessions, initialBedTag } = route?.params ?? {};

    // If launched from a bed long-press, auto-open the form with that bed pre-selected
    const didAutoOpen = React.useRef(false);

    const [entries, setEntries] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newText, setNewText] = useState('');
    const [selectedTag, setSelectedTag] = useState('General');
    const [saving, setSaving] = useState(false);
    const [filter, setFilter] = useState(null); // null = all
    const [entryType, setEntryType] = useState('note'); // 'note' | 'harvest'
    const [harvestCrop, setHarvestCrop] = useState('');
    const [harvestLbs, setHarvestLbs] = useState('');
    const [hasIssue, setHasIssue] = useState(null);    // null = not answered, false = No, true = Yes
    const [issueCategories, setIssueCategories] = useState([]);
    const [issueNote, setIssueNote] = useState('');

    const ISSUE_OPTIONS = [
        { id: 'Fungus', label: '🍄 Fungus/Disease' },
        { id: 'Insect', label: '🐛 Insect Pressure' },
        { id: 'Poor Germination', label: '🌱 Poor Germination' },
        { id: 'Irrigation', label: '💧 Irrigation Problem' },
        { id: 'Heat', label: '🌡️ Heat / Frost' },
    ];

    const formAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (initialBedTag && !didAutoOpen.current) {
            didAutoOpen.current = true;
            setTimeout(() => openForm(initialBedTag), 350); // let screen animate in first
        }
    }, [initialBedTag]);

    useEffect(() => {
        const loaded = loadJournalEntries();
        setEntries(loaded);
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }, []); // eslint-disable-line

    const openForm = (preTag = 'General') => {
        setShowForm(true);
        setNewText('');
        setSelectedTag(preTag);
        setEntryType('note');
        setHarvestCrop('');
        setHarvestLbs('');
        setHasIssue(null);
        setIssueCategories([]);
        setIssueNote('');
        Animated.spring(formAnim, { toValue: 1, tension: 60, friction: 11, useNativeDriver: true }).start();
    };

    const closeForm = () => {
        Animated.timing(formAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setShowForm(false));
    };

    const handleSave = useCallback(() => {
        setSaving(true);
        try {
            if (entryType === 'harvest') {
                const crop = harvestCrop.trim();
                const lbs = parseFloat(harvestLbs);
                if (!crop || isNaN(lbs) || lbs <= 0) return;
                saveActualHarvest({
                    bedNum: parseInt(selectedTag?.replace('Bed ', '')) || 0,
                    cropName: crop,
                    actualLbs: lbs,
                    hasIssue: hasIssue === true,
                    issueCategories: hasIssue === true ? issueCategories : [],
                    issueNote: hasIssue === true ? issueNote : '',
                });
                // Build a readable journal entry so it appears in the list
                const issueSuffix = hasIssue === true && issueCategories.length > 0
                    ? ` · Issue: ${issueCategories.join(', ')}`
                    : '';
                const text = `⛶️ Harvest logged: ${lbs} lbs of ${crop}${issueSuffix}`;
                const journalEntry = saveJournalEntry({ bedTag: selectedTag, text });
                if (journalEntry) setEntries(prev => [journalEntry, ...prev]);
            } else {
                const text = newText.trim();
                if (!text) return;
                const entry = saveJournalEntry({ bedTag: selectedTag, text });
                if (entry) setEntries(prev => [entry, ...prev]);
            }
            closeForm();
        } finally {
            setSaving(false);
        }
    }, [newText, selectedTag, entryType, harvestCrop, harvestLbs]);

    const handleDelete = useCallback((id) => {
        deleteJournalEntry(id);
        setEntries(prev => prev.filter(e => e.id !== id));
    }, []);

    const filteredEntries = filter
        ? entries.filter(e => e.bedTag === filter)
        : entries;

    const formTranslateY = formAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
    const formOpacity = formAnim;

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.stepLabel}>FARM MANAGEMENT</Text>
                    <Text style={styles.heading}>Field Journal</Text>
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={showForm ? closeForm : openForm}>
                    <Text style={styles.addBtnText}>{showForm ? '✕' : '+ Note'}</Text>
                </TouchableOpacity>
            </View>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
                {[null, ...BED_TAGS].map(tag => (
                    <TouchableOpacity
                        key={tag ?? 'all'}
                        style={[styles.filterChip, filter === tag && styles.filterChipActive]}
                        onPress={() => setFilter(tag)}
                    >
                        <Text style={[styles.filterChipText, filter === tag && styles.filterChipTextActive]}>
                            {tag ?? 'All'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Entry list */}
            <Animated.ScrollView
                style={[{ opacity: fadeAnim }, Platform.OS === 'web' && { overflowY: 'scroll' }]}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {filteredEntries.length === 0 ? (
                    <View style={styles.emptyView}>
                        <Text style={styles.emptyIcon}>📓</Text>
                        <Text style={styles.emptyTitle}>
                            {filter ? `No entries for ${filter}` : 'No entries yet'}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            Tap "+ Note" to record observations, pest sightings, or weather notes
                        </Text>
                        {!showForm && (
                            <TouchableOpacity style={styles.emptyAddBtn} onPress={openForm}>
                                <Text style={styles.emptyAddBtnText}>+ Add First Entry</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    filteredEntries.map(entry => (
                        <EntryCard key={entry.id} entry={entry} onDelete={handleDelete} />
                    ))
                )}
                <View style={{ height: showForm ? (entryType === 'harvest' ? 520 : 380) : 80 }} />
            </Animated.ScrollView>

            {/* New entry form (slides up from bottom) */}
            {showForm && (
                <Animated.View style={[
                    styles.form,
                    Shadows.card,
                    { opacity: formOpacity, transform: [{ translateY: formTranslateY }] },
                ]}>
                    <View style={styles.formHandle} />
                    <Text style={styles.formTitle}>New Entry — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>

                    {/* Entry type toggle */}
                    <View style={styles.typeRow}>
                        <TouchableOpacity style={[styles.typeBtn, entryType === 'note' && styles.typeBtnActive]} onPress={() => setEntryType('note')}>
                            <Text style={[styles.typeBtnText, entryType === 'note' && styles.typeBtnTextActive]}>📓 Note</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.typeBtn, entryType === 'harvest' && styles.typeBtnActive]} onPress={() => setEntryType('harvest')}>
                            <Text style={[styles.typeBtnText, entryType === 'harvest' && styles.typeBtnTextActive]}>⚖️ Log Harvest</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Bed tag selector */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScroll} contentContainerStyle={styles.tagScrollContent}>
                        {BED_TAGS.map(tag => (
                            <TouchableOpacity
                                key={tag}
                                style={[styles.tagChip, selectedTag === tag && styles.tagChipActive]}
                                onPress={() => setSelectedTag(tag)}
                            >
                                <Text style={[styles.tagChipText, selectedTag === tag && styles.tagChipTextActive]}>{tag}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Scrollable body — allows harvest + issue section to scroll */}
                    <ScrollView
                        style={styles.formBodyScroll}
                        contentContainerStyle={styles.formBodyScrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                    {entryType === 'harvest' ? (
                        <View style={styles.harvestForm}>
                            <TextInput
                                style={styles.harvestInput}
                                value={harvestCrop}
                                onChangeText={setHarvestCrop}
                                placeholder="Crop name (e.g. Arugula)"
                                placeholderTextColor={Colors.mutedText}
                                autoFocus
                            />
                            <View style={styles.lbsRow}>
                                <TextInput
                                    style={[styles.harvestInput, styles.lbsInput]}
                                    value={harvestLbs}
                                    onChangeText={setHarvestLbs}
                                    placeholder="Weight"
                                    placeholderTextColor={Colors.mutedText}
                                    keyboardType="decimal-pad"
                                />
                                <Text style={styles.lbsUnit}>lbs</Text>
                            </View>

                            {/* Issue attribution */}
                            <View style={styles.issueSection}>
                                <Text style={styles.issueQuestion}>Issue with this crop?</Text>
                                <View style={styles.issueYNRow}>
                                    {[{ v: false, label: 'No – on track' }, { v: true, label: 'Yes – had a problem' }].map(opt => (
                                        <TouchableOpacity
                                            key={String(opt.v)}
                                            style={[
                                                styles.issueYNBtn,
                                                hasIssue === opt.v && (opt.v ? styles.issueYNBtnYes : styles.issueYNBtnNo),
                                            ]}
                                            onPress={() => {
                                                setHasIssue(opt.v);
                                                if (!opt.v) { setIssueCategories([]); setIssueNote(''); }
                                            }}
                                        >
                                            <Text style={[
                                                styles.issueYNText,
                                                hasIssue === opt.v && styles.issueYNTextActive,
                                            ]}>{opt.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {hasIssue === true && (
                                    <View style={styles.issueCategoryWrap}>
                                        <Text style={styles.issueCategoryLabel}>What caused it? (select all that apply)</Text>
                                        <View style={styles.issueCategoryChips}>
                                            {ISSUE_OPTIONS.map(opt => {
                                                const active = issueCategories.includes(opt.id);
                                                return (
                                                    <TouchableOpacity
                                                        key={opt.id}
                                                        style={[styles.issueChip, active && styles.issueChipActive]}
                                                        onPress={() => {
                                                            setIssueCategories(prev =>
                                                                active ? prev.filter(x => x !== opt.id) : [...prev, opt.id]
                                                            );
                                                        }}
                                                    >
                                                        <Text style={[styles.issueChipText, active && styles.issueChipTextActive]}>{opt.label}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                        <TextInput
                                            style={styles.issueNoteInput}
                                            value={issueNote}
                                            onChangeText={setIssueNote}
                                            placeholder="Optional: describe the issue (e.g. aphids on brassicas week 6)"
                                            placeholderTextColor={Colors.mutedText}
                                            multiline
                                            maxLength={300}
                                        />
                                    </View>
                                )}
                            </View>
                        </View>
                    ) : (
                        <TextInput
                            style={styles.noteInput}
                            value={newText}
                            onChangeText={setNewText}
                            placeholder="What did you observe today? Pests, growth, weather, soil…"
                            placeholderTextColor={Colors.mutedText}
                            multiline
                            maxLength={1000}
                            autoFocus
                        />
                    )}

                    </ScrollView>

                    <View style={styles.formActions}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={closeForm}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.saveBtn, ((entryType === 'note' ? !newText.trim() : (!harvestCrop.trim() || !harvestLbs)) || saving) && styles.saveBtnDisabled]}
                            onPress={handleSave}
                            disabled={(entryType === 'note' ? !newText.trim() : (!harvestCrop.trim() || !harvestLbs)) || saving}
                        >
                            <Text style={styles.saveBtnText}>📓 Save Entry</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0EDE6' },

    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
        backgroundColor: Colors.primaryGreen, gap: Spacing.sm,
    },
    backBtn: { padding: 4 },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    headerText: { flex: 1, gap: 2 },
    stepLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warmTan, letterSpacing: 2 },
    heading: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.cream },
    addBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    addBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.xs },

    filterBar: { maxHeight: 44, backgroundColor: Colors.primaryGreen },
    filterContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: 6, flexDirection: 'row', alignItems: 'center' },
    filterChip: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)' },
    filterChipActive: { backgroundColor: Colors.burntOrange },
    filterChipText: { fontSize: Typography.xs, color: 'rgba(245,240,225,0.75)', fontWeight: Typography.medium },
    filterChipTextActive: { color: Colors.white, fontWeight: Typography.bold },

    listContent: { padding: Spacing.md, gap: Spacing.sm },
    emptyView: { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.primaryGreen },
    emptySubtitle: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 },
    emptyAddBtn: { marginTop: 4, backgroundColor: Colors.primaryGreen, paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radius.md },
    emptyAddBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.sm },

    // Entry cards
    entryCard: {
        backgroundColor: Colors.cardBg ?? '#FAFAF7',
        borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.08)',
    },
    entryHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    entryMeta: { flex: 1, gap: 1 },
    entryDate: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },
    entryTime: { fontSize: 9, color: Colors.mutedText },
    bedTag: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: Radius.full, backgroundColor: 'rgba(45,79,30,0.07)' },
    bedTagHighlight: { backgroundColor: 'rgba(198,101,30,0.1)' },
    bedTagText: { fontSize: 9, fontWeight: Typography.bold },
    deleteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(198,40,40,0.08)', alignItems: 'center', justifyContent: 'center' },
    deleteBtnText: { fontSize: 13 },
    entryText: { fontSize: Typography.sm, color: Colors.darkText, lineHeight: 21 },

    // Form
    form: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Colors.cardBg ?? '#FAFAF7',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingBottom: 32, paddingHorizontal: Spacing.lg,
    },
    formHandle: { width: 36, height: 4, backgroundColor: 'rgba(45,79,30,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
    formTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen, marginBottom: Spacing.sm },
    tagScroll: { maxHeight: 38 },
    tagScrollContent: { gap: 6, flexDirection: 'row', alignItems: 'center' },
    tagChip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: Radius.full, backgroundColor: 'rgba(45,79,30,0.07)', borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.12)' },
    tagChipActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    tagChipText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.bold },
    tagChipTextActive: { color: Colors.cream },
    noteInput: {
        marginTop: Spacing.sm,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
        borderRadius: Radius.sm, padding: Spacing.sm,
        fontSize: Typography.sm, color: Colors.darkText,
        minHeight: 100, maxHeight: 160, textAlignVertical: 'top',
        backgroundColor: Colors.white ?? '#FFFFFF',
    },
    formActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: Radius.md, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', alignItems: 'center' },
    cancelBtnText: { color: Colors.mutedText, fontWeight: Typography.bold, fontSize: Typography.sm },
    saveBtn: { flex: 2, paddingVertical: 13, borderRadius: Radius.md, backgroundColor: Colors.primaryGreen, alignItems: 'center' },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.sm },

    typeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    typeBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', alignItems: 'center', backgroundColor: 'rgba(45,79,30,0.04)' },
    typeBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    typeBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },
    typeBtnTextActive: { color: Colors.cream },

    formBodyScroll: { maxHeight: 280, ...Platform.select({ web: { overflowY: 'scroll' } }) },
    formBodyScrollContent: { gap: Spacing.sm },
    harvestForm: { gap: Spacing.sm },
    harvestInput: { borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)', borderRadius: Radius.sm, padding: 10, fontSize: Typography.sm, color: Colors.darkText, backgroundColor: Colors.white ?? '#FFFFFF' },
    lbsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    lbsInput: { flex: 1 },
    lbsUnit: { fontSize: Typography.sm, color: Colors.primaryGreen, fontWeight: Typography.bold, width: 30 },

    // ── Issue Attribution ────────────────────────────────────────────────────
    issueSection: { borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.1)', paddingTop: Spacing.sm, marginTop: Spacing.sm, gap: Spacing.xs },
    issueQuestion: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primaryGreen },
    issueYNRow: { flexDirection: 'row', gap: Spacing.sm },
    issueYNBtn: {
        flex: 1, paddingVertical: 8, borderRadius: Radius.sm,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
        alignItems: 'center', backgroundColor: 'rgba(45,79,30,0.03)',
    },
    issueYNBtnNo:  { backgroundColor: '#E8F5E9', borderColor: '#2E7D32' },
    issueYNBtnYes: { backgroundColor: '#FFEBEE', borderColor: '#C62828' },
    issueYNText: { fontSize: Typography.xs, color: Colors.mutedText, fontWeight: Typography.bold },
    issueYNTextActive: { color: Colors.darkText },

    issueCategoryWrap: { gap: Spacing.xs, marginTop: 4 },
    issueCategoryLabel: { fontSize: 10, color: Colors.mutedText, fontWeight: Typography.medium },
    issueCategoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    issueChip: {
        paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.full,
        borderWidth: 1.5, borderColor: 'rgba(198,40,40,0.2)',
        backgroundColor: 'rgba(198,40,40,0.04)',
    },
    issueChipActive: { backgroundColor: '#FFCDD2', borderColor: '#C62828' },
    issueChipText: { fontSize: 10, color: '#C62828', fontWeight: Typography.bold },
    issueChipTextActive: { color: '#B71C1C' },
    issueNoteInput: {
        borderWidth: 1.5, borderColor: 'rgba(198,40,40,0.2)', borderRadius: Radius.sm,
        padding: 8, fontSize: 11, color: Colors.darkText,
        minHeight: 56, textAlignVertical: 'top',
        backgroundColor: 'rgba(255,235,238,0.4)', marginTop: 4,
    },

});
