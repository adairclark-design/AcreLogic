import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Animated, Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadJournalEntries, saveJournalEntry, deleteJournalEntry, saveActualHarvest, loadBlocks } from '../services/persistence';
import GlobalNavBar from '../components/GlobalNavBar';

function formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

    // Default legacy colors
    let tagColor = Colors.mutedText;
    let bgStyle = { backgroundColor: 'rgba(45,79,30,0.07)' };

    // New format (e.g. Block A - Bed 1) highlight
    if (entry.bedTag && !entry.bedTag.endsWith('General')) {
        tagColor = Colors.burntOrange;
        bgStyle = { backgroundColor: 'rgba(198,101,30,0.1)' };
    }

    return (
        <Animated.View style={[styles.entryCard, Shadows.card, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.entryHeader}>
                <View style={styles.entryMeta}>
                    <Text style={styles.entryDate}>{formatDate(entry.date)}</Text>
                    <Text style={styles.entryTime}>{formatTime(entry.date)}</Text>
                </View>
                {entry.bedTag && (
                    <View style={[styles.bedTag, bgStyle]}>
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
    const [entries, setEntries] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [activeBlockId, setActiveBlockId] = useState(null);
    const [activeQuadrant, setActiveQuadrant] = useState('All');
    const [activeBedNum, setActiveBedNum] = useState('General'); // 'General' or number

    const [showForm, setShowForm] = useState(false);
    const [newText, setNewText] = useState('');
    const [saving, setSaving] = useState(false);
    const [entryType, setEntryType] = useState('note'); // 'note' | 'harvest'
    const [harvestCrop, setHarvestCrop] = useState('');
    const [harvestLbs, setHarvestLbs] = useState('');
    const [hasIssue, setHasIssue] = useState(null);    
    const [issueCategories, setIssueCategories] = useState([]);
    const [issueNote, setIssueNote] = useState('');

    const formAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useFocusEffect(useCallback(() => {
        const loadedEntries = loadJournalEntries();
        setEntries(loadedEntries);

        const loadedBlocks = loadBlocks();
        setBlocks(loadedBlocks);
        if (loadedBlocks.length > 0) setActiveBlockId(prev => prev || loadedBlocks[0].id);

        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }, []));

    const activeBlock = blocks.find(b => b.id === activeBlockId) || null;
    const currentBlockName = activeBlock?.name || 'Legacy Workspace';
    const numBeds = activeBlock?.bedCount || 8;

    // Determine derived Quadrant layout
    let quadrants = ['All'];
    if (activeBlock?.bisectingRoad?.enabled) {
        if (activeBlock.bisectingRoad.orientation === 'EW') quadrants = ['All', 'North', 'South'];
        if (activeBlock.bisectingRoad.orientation === 'NS') quadrants = ['All', 'West', 'East'];
    }

    useEffect(() => {
        if (!quadrants.includes(activeQuadrant)) setActiveQuadrant('All');
    }, [activeBlockId]);

    // Calculate generic beds to list
    const midPoint = Math.ceil(numBeds / 2);
    let bedList = [];
    if (activeQuadrant === 'North' || activeQuadrant === 'West') {
        for (let i = 1; i <= midPoint; i++) bedList.push(i);
    } else if (activeQuadrant === 'South' || activeQuadrant === 'East') {
        for (let i = midPoint + 1; i <= numBeds; i++) bedList.push(i);
    } else {
        for (let i = 1; i <= numBeds; i++) bedList.push(i);
    }

    const currentBedTag = activeBedNum === 'General' 
        ? `${currentBlockName} - General` 
        : `${currentBlockName} - Bed ${activeBedNum}`;

    const filteredEntries = entries.filter(e => {
        // Strict match against exact BedTag string
        if (e.bedTag === currentBedTag) return true;
        
        // Handling legacy entries that only had "General" or "Bed X" saved
        if (!activeBlock && (e.bedTag === `Bed ${activeBedNum}` || (activeBedNum === 'General' && e.bedTag === 'General'))) {
            return true;
        }
        return false;
    });

    const openForm = () => {
        setShowForm(true);
        setNewText('');
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
                
                const bedLogNum = activeBedNum === 'General' ? 0 : parseInt(activeBedNum);
                saveActualHarvest({
                    bedNum: bedLogNum,
                    cropName: crop,
                    actualLbs: lbs,
                    hasIssue: hasIssue === true,
                    issueCategories: hasIssue === true ? issueCategories : [],
                    issueNote: hasIssue === true ? issueNote : '',
                });

                const issueSuffix = hasIssue === true && issueCategories.length > 0
                    ? ` · Issue: ${issueCategories.join(', ')}` : '';
                const text = `⛶️ Harvest logged: ${lbs} lbs of ${crop}${issueSuffix}`;
                
                const journalEntry = saveJournalEntry({ bedTag: currentBedTag, text });
                if (journalEntry) setEntries(prev => [journalEntry, ...prev]);
            } else {
                const text = newText.trim();
                if (!text) return;
                const entry = saveJournalEntry({ bedTag: currentBedTag, text });
                if (entry) setEntries(prev => [entry, ...prev]);
            }
            closeForm();
        } finally {
            setSaving(false);
        }
    }, [newText, currentBedTag, entryType, harvestCrop, harvestLbs, hasIssue, issueCategories, issueNote, activeBedNum]);

    const handleDelete = useCallback((id) => {
        deleteJournalEntry(id);
        setEntries(prev => prev.filter(e => e.id !== id));
    }, []);

    const formTranslateY = formAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });
    const formOpacity = formAnim;

    const ISSUE_OPTIONS = [
        { id: 'Fungus', label: '🍄 Fungus/Disease' },
        { id: 'Insect', label: '🐛 Insect Pressure' },
        { id: 'Poor Germination', label: '🌱 Poor Germination' },
        { id: 'Irrigation', label: '💧 Irrigation Problem' },
        { id: 'Heat', label: '🌡️ Heat / Frost' },
    ];

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <GlobalNavBar navigation={navigation} farmProfile={{}} planId={activeBlockId} activeRoute="FieldJournal" />

            {/* Block & Quadrant Nav Header */}
            <View style={styles.header}>

                {/* Block Tabs */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.blockTabsScroll} contentContainerStyle={styles.blockTabsContainer}>
                    {blocks.map(b => (
                        <TouchableOpacity 
                            key={b.id} 
                            style={[styles.blockTabBtn, activeBlockId === b.id && styles.blockTabBtnActive]}
                            onPress={() => { setActiveBlockId(b.id); setActiveBedNum('General'); }}
                        >
                            <Text style={[styles.blockTabBtnText, activeBlockId === b.id && styles.blockTabBtnTextActive]}>
                                {b.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    {blocks.length === 0 && (
                        <Text style={styles.noBlocksText}>No blocks configured.</Text>
                    )}
                </ScrollView>
                
                {/* Quadrant Tabs */}
                {quadrants.length > 1 && (
                    <View style={styles.quadrantTabsContainer}>
                        {quadrants.map(q => (
                            <TouchableOpacity 
                                key={q}
                                style={[styles.quadrantTabBtn, activeQuadrant === q && styles.quadrantTabBtnActive]}
                                onPress={() => { setActiveQuadrant(q); setActiveBedNum('General'); }}
                            >
                                <Text style={[styles.quadrantTabBtnText, activeQuadrant === q && styles.quadrantTabBtnTextActive]}>{q}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            {/* Split Pane View */}
            <View style={styles.splitPane}>
                {/* Left Sidebar - EXACTLY Beds List */}
                <View style={styles.sidebar}>

                    {/* Beds List */}
                    <View style={styles.bedListHeader}>
                        <Text style={styles.sidebarSectionTitle}>{currentBlockName.toUpperCase()}</Text>
                    </View>
                    <ScrollView 
                        style={styles.bedListScroll} 
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 250 }}
                    >
                        <TouchableOpacity 
                            style={[styles.bedBtn, activeBedNum === 'General' && styles.bedBtnActive]}
                            onPress={() => setActiveBedNum('General')}
                        >
                            <Text style={[styles.bedBtnText, activeBedNum === 'General' && styles.bedBtnTextActive]}>Block General</Text>
                        </TouchableOpacity>

                        {bedList.map(num => (
                            <TouchableOpacity 
                                key={num}
                                style={[styles.bedBtn, activeBedNum === num && styles.bedBtnActive]}
                                onPress={() => setActiveBedNum(num)}
                            >
                                <Text style={[styles.bedBtnText, activeBedNum === num && styles.bedBtnTextActive]}>Bed {num}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Right Main Content */}
                <View style={[styles.mainArea, Platform.OS === 'web' && { overflowY: 'hidden' }]}>
                    {/* Active scope header */}
                    <View style={styles.mainHeader}>
                        <Text style={styles.mainHeaderText}>Viewing: {currentBedTag}</Text>
                        
                        {!showForm && (
                            <TouchableOpacity style={styles.addBtnSmall} onPress={openForm}>
                                <Text style={styles.addBtnSmallText}>+ New Entry</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    
                    <Animated.ScrollView
                        style={[{ flex: 1, opacity: fadeAnim }, Platform.OS === 'web' && { overflowY: 'scroll' }]}
                        contentContainerStyle={[styles.listContent, { paddingBottom: 250 }]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {filteredEntries.length === 0 ? (
                            <View style={styles.emptyView}>
                                <Text style={styles.emptyIcon}>📓</Text>
                                <Text style={styles.emptyTitle}>No notes for this bed</Text>
                                <Text style={styles.emptySubtitle}>Log observations, pest tracking, and daily harvest amounts.</Text>
                                {!showForm && (
                                    <TouchableOpacity style={styles.emptyAddBtn} onPress={openForm}>
                                        <Text style={styles.emptyAddBtnText}>+ Add First Note</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : (
                            filteredEntries.map(entry => (
                                <EntryCard key={entry.id} entry={entry} onDelete={handleDelete} />
                            ))
                        )}
                        <View style={{ height: showForm ? 400 : 100 }} />
                    </Animated.ScrollView>
                </View>
            </View>

            {/* Slide up form */}
            {showForm && (
                <View style={styles.formOverlay} pointerEvents="box-none">
                    <Animated.View style={[
                        styles.form,
                        Shadows.card,
                        { opacity: formOpacity, transform: [{ translateY: formTranslateY }] },
                    ]}>
                        <View style={styles.formContentOuter}>
                            <View style={styles.formHandle} />
                            <View style={styles.formHeaderRow}>
                                <Text style={styles.formTitle}>Add to {currentBedTag}</Text>
                                <TouchableOpacity style={styles.closeX} onPress={closeForm}>
                                    <Text style={styles.closeXText}>✕</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.typeRow}>
                                <TouchableOpacity style={[styles.typeBtn, entryType === 'note' && styles.typeBtnActive]} onPress={() => setEntryType('note')}>
                                    <Text style={[styles.typeBtnText, entryType === 'note' && styles.typeBtnTextActive]}>📓 Note</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.typeBtn, entryType === 'harvest' && styles.typeBtnActive]} onPress={() => setEntryType('harvest')}>
                                    <Text style={[styles.typeBtnText, entryType === 'harvest' && styles.typeBtnTextActive]}>⚖️ Log Harvest</Text>
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.formBodyScroll} contentContainerStyle={styles.formBodyScrollContent} keyboardShouldPersistTaps="handled">
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

                                        {/* Issue tracking */}
                                        <View style={styles.issueSection}>
                                            <Text style={styles.issueQuestion}>Issue with this harvest?</Text>
                                            <View style={styles.issueYNRow}>
                                                {[{ v: false, label: 'No' }, { v: true, label: 'Yes' }].map(opt => (
                                                    <TouchableOpacity
                                                        key={String(opt.v)}
                                                        style={[styles.issueYNBtn, hasIssue === opt.v && (opt.v ? styles.issueYNBtnYes : styles.issueYNBtnNo)]}
                                                        onPress={() => { setHasIssue(opt.v); if (!opt.v) { setIssueCategories([]); setIssueNote(''); } }}
                                                    >
                                                        <Text style={[styles.issueYNText, hasIssue === opt.v && styles.issueYNTextActive]}>{opt.label}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                            {hasIssue === true && (
                                                <View style={styles.issueCategoryWrap}>
                                                    <View style={styles.issueCategoryChips}>
                                                        {ISSUE_OPTIONS.map(opt => {
                                                            const active = issueCategories.includes(opt.id);
                                                            return (
                                                                <TouchableOpacity key={opt.id} style={[styles.issueChip, active && styles.issueChipActive]} onPress={() => setIssueCategories(p => active ? p.filter(x=>x!==opt.id) : [...p, opt.id])}>
                                                                    <Text style={[styles.issueChipText, active && styles.issueChipTextActive]}>{opt.label}</Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                    <TextInput style={styles.issueNoteInput} value={issueNote} onChangeText={setIssueNote} placeholder="Describe the issue" placeholderTextColor={Colors.mutedText} />
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                ) : (
                                    <TextInput
                                        style={styles.noteInput}
                                        value={newText}
                                        onChangeText={setNewText}
                                        placeholder="Observe pests, growth, soil conditions..."
                                        placeholderTextColor={Colors.mutedText}
                                        multiline
                                        autoFocus
                                    />
                                )}
                            </ScrollView>

                            <TouchableOpacity
                                style={[styles.saveBtn, ((entryType === 'note' ? !newText.trim() : (!harvestCrop.trim() || !harvestLbs)) || saving) && styles.saveBtnDisabled]}
                                onPress={handleSave}
                                disabled={(entryType === 'note' ? !newText.trim() : (!harvestCrop.trim() || !harvestLbs)) || saving}
                            >
                                <Text style={styles.saveBtnText}>Save to {currentBedTag}</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0EDE6' },
    header: {
        paddingTop: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: 0,
        backgroundColor: Colors.primaryGreen,
    },
    
    // New Header Navigation Tabs
    blockTabsScroll: { maxHeight: 50, marginBottom: Spacing.xs },
    blockTabsContainer: { gap: Spacing.sm, paddingBottom: Spacing.xs },
    blockTabBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.full },
    blockTabBtnActive: { backgroundColor: Colors.cream },
    blockTabBtnText: { color: 'rgba(255,255,255,0.7)', fontWeight: '600', fontSize: 14 },
    blockTabBtnTextActive: { color: Colors.primaryGreen, fontWeight: '800' },
    noBlocksText: { paddingHorizontal: Spacing.md, fontSize: 13, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', alignSelf: 'center' },

    quadrantTabsContainer: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.md, paddingHorizontal: 4 },
    quadrantTabBtn: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.1)' },
    quadrantTabBtnActive: { backgroundColor: Colors.warmTan, borderColor: Colors.warmTan },
    quadrantTabBtnText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 11 },
    quadrantTabBtnTextActive: { color: Colors.darkText, fontWeight: '800' },

    splitPane: { flex: 1, flexDirection: 'row' },
    
    // ── Left Sidebar (Beds Only) ──
    sidebar: {
        width: Platform.OS === 'web' ? 240 : 160,
        backgroundColor: '#EBE7DF',
        borderRightWidth: 1,
        borderRightColor: 'rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        ...Platform.select({ web: { height: 'calc(100vh - 120px)' } })
    },
    sidebarSectionTitle: {
        fontSize: 10, fontWeight: '800', color: Colors.mutedText, letterSpacing: 1,
        paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 6,
    },

    bedListHeader: { backgroundColor: 'transparent' },
    bedListScroll: { flex: 1 },
    bedBtn: { paddingVertical: 12, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
    bedBtnActive: { backgroundColor: Colors.white ?? '#FFF', borderLeftWidth: 3, borderLeftColor: Colors.burntOrange, paddingLeft: Spacing.md - 3 },
    bedBtnText: { fontSize: 13, fontWeight: '500', color: Colors.darkText },
    bedBtnTextActive: { fontWeight: '800', color: Colors.primaryGreen },

    // ── Main Content Area ──
    mainArea: { flex: 1, backgroundColor: '#FAFAFAF0' },
    mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: Spacing.md, backgroundColor: Colors.cardBg ?? '#FAFAF7', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    mainHeaderText: { fontSize: 13, fontWeight: '800', color: Colors.burntOrange },
    addBtnSmall: { backgroundColor: Colors.primaryGreen, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full },
    addBtnSmallText: { color: Colors.cream, fontWeight: '700', fontSize: 11 },
    
    listContent: { padding: Spacing.md, gap: Spacing.sm },
    emptyView: { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.primaryGreen },
    emptySubtitle: { fontSize: Typography.sm, color: Colors.mutedText, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 },
    emptyAddBtn: { marginTop: 4, backgroundColor: Colors.primaryGreen, paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radius.md },
    emptyAddBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.sm },

    // ── Entry Card ──
    entryCard: {
        backgroundColor: Colors.white ?? '#FFFFFF',
        borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.08)',
    },
    entryHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    entryMeta: { flex: 1, gap: 1 },
    entryDate: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },
    entryTime: { fontSize: 9, color: Colors.mutedText },
    bedTag: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: Radius.full, backgroundColor: 'rgba(45,79,30,0.07)' },
    bedTagText: { fontSize: 9, fontWeight: Typography.bold },
    deleteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(198,40,40,0.08)', alignItems: 'center', justifyContent: 'center' },
    deleteBtnText: { fontSize: 13 },
    entryText: { fontSize: Typography.sm, color: Colors.darkText, lineHeight: 21 },

    // ── Form Overlay ──
    formOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'flex-end', zIndex: 100 },
    form: { backgroundColor: Colors.cardBg ?? '#FAFAF7', borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.15, shadowRadius: 20 },
    formContentOuter: { paddingBottom: 40, paddingHorizontal: Spacing.lg, width: '100%', maxWidth: 600, alignSelf: 'center' },
    formHandle: { width: 36, height: 4, backgroundColor: 'rgba(45,79,30,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
    formHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
    formTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.primaryGreen },
    closeX: { padding: 4 },
    closeXText: { fontSize: 18, color: Colors.mutedText, fontWeight: '800' },
    
    noteInput: {
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)', borderRadius: Radius.sm, padding: Spacing.sm,
        fontSize: Typography.sm, color: Colors.darkText, minHeight: 120, textAlignVertical: 'top',
        backgroundColor: Colors.white ?? '#FFFFFF',
    },
    saveBtn: { paddingVertical: 14, borderRadius: Radius.md, backgroundColor: Colors.primaryGreen, alignItems: 'center', marginTop: Spacing.md },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: Colors.cream, fontWeight: Typography.bold, fontSize: Typography.sm },

    typeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    typeBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', alignItems: 'center', backgroundColor: 'rgba(45,79,30,0.04)' },
    typeBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    typeBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryGreen },
    typeBtnTextActive: { color: Colors.cream },

    formBodyScroll: { maxHeight: 300, ...Platform.select({ web: { overflowY: 'scroll' } }) },
    formBodyScrollContent: { gap: Spacing.sm, paddingBottom: 20 },
    harvestForm: { gap: Spacing.sm },
    harvestInput: { borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)', borderRadius: Radius.sm, padding: 10, fontSize: Typography.sm, color: Colors.darkText, backgroundColor: Colors.white ?? '#FFFFFF' },
    lbsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    lbsInput: { flex: 1 },
    lbsUnit: { fontSize: Typography.sm, color: Colors.primaryGreen, fontWeight: Typography.bold, width: 30 },

    issueSection: { borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.1)', paddingTop: Spacing.sm, marginTop: Spacing.sm, gap: Spacing.xs },
    issueQuestion: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primaryGreen },
    issueYNRow: { flexDirection: 'row', gap: Spacing.sm },
    issueYNBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)', alignItems: 'center', backgroundColor: 'rgba(45,79,30,0.03)' },
    issueYNBtnNo:  { backgroundColor: '#E8F5E9', borderColor: '#2E7D32' },
    issueYNBtnYes: { backgroundColor: '#FFEBEE', borderColor: '#C62828' },
    issueYNText: { fontSize: Typography.xs, color: Colors.mutedText, fontWeight: Typography.bold },
    issueYNTextActive: { color: Colors.darkText },

    issueCategoryWrap: { gap: Spacing.xs, marginTop: 4 },
    issueCategoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    issueChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'rgba(198,40,40,0.2)', backgroundColor: 'rgba(198,40,40,0.04)' },
    issueChipActive: { backgroundColor: '#FFCDD2', borderColor: '#C62828' },
    issueChipText: { fontSize: 10, color: '#C62828', fontWeight: Typography.bold },
    issueChipTextActive: { color: '#B71C1C' },
    issueNoteInput: { borderWidth: 1.5, borderColor: 'rgba(198,40,40,0.2)', borderRadius: Radius.sm, padding: 8, fontSize: 11, color: Colors.darkText, minHeight: 46, textAlignVertical: 'top', backgroundColor: 'rgba(255,235,238,0.4)', marginTop: 4 },
});
