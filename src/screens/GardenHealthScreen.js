import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Platform, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { loadSavedPlan } from '../services/persistence';
import { getCropById } from '../services/database';
import { inferZoneFromFrostDates } from '../services/farmUtils';

function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function getCurrentSeason(date, lastFrostIso, firstFrostIso) {
    if (!lastFrostIso || !firstFrostIso) return 'any';
    try {
        const now = date.getTime();
        const lf = new Date(lastFrostIso).getTime();
        const ff = new Date(firstFrostIso).getTime();
        
        const springEnd = lf + (45 * 86400000); // 45 days after last frost
        const fallStart = ff - (45 * 86400000); // 45 days before first frost

        if (now < springEnd) return 'spring';
        if (now > fallStart) return 'fall';
        return 'summer';
    } catch (e) {
        return 'any';
    }
}

function isRiskSeasonRelevant(pestSeason, currentSeason) {
    if (!pestSeason || pestSeason === 'any') return true;
    if (pestSeason === 'cool_wet') return currentSeason === 'spring' || currentSeason === 'fall';
    return pestSeason === currentSeason;
}

export default function GardenHealthScreen({ navigation, route }) {
    const [farmProfile, setFarmProfile] = useState(route?.params?.farmProfile ?? null);
    const [loading, setLoading] = useState(true);
    const [activeCrops, setActiveCrops] = useState([]); // Unique crops actively in the beds
    const [actionQueue, setActionQueue] = useState([]);
    
    // UI state
    const [expandedCropId, setExpandedCropId] = useState(null);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useFocusEffect(useCallback(() => {
        let fp = route?.params?.farmProfile ?? null;
        if (!fp) {
            const saved = loadSavedPlan();
            fp = saved?.farmProfile ?? null;
        }
        setFarmProfile(fp);

        // Load all successions
        const merged = {};
        let virtualBedCounter = 1;

        try {
            const paramSuccessions = route?.params?.bedSuccessions ?? null;
            if (paramSuccessions && Object.keys(paramSuccessions).length > 0) {
                for (const [num, succs] of Object.entries(paramSuccessions)) {
                    if (Array.isArray(succs) && succs.length > 0) merged[String(virtualBedCounter++)] = succs;
                }
            } else if (typeof localStorage !== 'undefined') {
                const flatRaw = localStorage.getItem('acrelogic_bed_successions');
                if (flatRaw) {
                    const flatData = JSON.parse(flatRaw);
                    for (const [, succs] of Object.entries(flatData)) {
                        if (Array.isArray(succs) && succs.length > 0) merged[String(virtualBedCounter++)] = succs;
                    }
                }
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key?.startsWith('acrelogic_block_beds_')) continue;
                    try {
                        const raw = localStorage.getItem(key);
                        if (!raw) continue;
                        const blockData = JSON.parse(raw);
                        for (const [, value] of Object.entries(blockData)) {
                            const succs = Array.isArray(value) ? value : (value?.successions ?? []);
                            if (succs.length > 0) merged[String(virtualBedCounter++)] = succs;
                        }
                    } catch { /* skip corrupt */ }
                }
            }
        } catch (e) {
            console.warn('[GardenHealth] Error reading successions:', e);
        }

        // Process active crops
        const now = today().getTime();
        const activeIds = new Set();
        const activeFullCrops = [];

        Object.values(merged).forEach(succList => {
            succList.forEach(succ => {
                // If it's started and not way past harvest, we consider it "active"
                if (succ.start_date) {
                    const startT = new Date(succ.start_date).getTime();
                    // Just count everything in ground this year for now
                    if (startT <= now + (30*86400000)) { 
                        if (!activeIds.has(succ.crop_id)) {
                            activeIds.add(succ.crop_id);
                            const c = getCropById(succ.crop_id);
                            if (c) activeFullCrops.push(c);
                        }
                    }
                }
            });
        });

        activeFullCrops.sort((a,b) => a.name.localeCompare(b.name));
        setActiveCrops(activeFullCrops);

        // Action Queue logic
        const userZone = inferZoneFromFrostDates(fp?.first_frost_date, fp?.last_frost_date);
        const userSeason = getCurrentSeason(today(), fp?.last_frost_date, fp?.first_frost_date);
        
        const queue = [];
        activeFullCrops.forEach(crop => {
            ['pests', 'diseases'].forEach(type => {
                (crop[type] || []).forEach(risk => {
                    if (risk.zone_relevance && !risk.zone_relevance.includes('all') && !risk.zone_relevance.includes(userZone)) return;
                    
                    // Only high or medium severity go into the action queue
                    if (risk.severity === 'low') return;
                    
                    // Only if it matches the current season roughly
                    if (!isRiskSeasonRelevant(risk.season, userSeason)) return;

                    queue.push({
                        cropId: crop.id,
                        cropName: crop.name,
                        type,
                        ...risk
                    });
                });
            });
        });

        // Dedup and sort
        const deduped = [];
        const seen = new Set();
        queue.forEach(q => {
            const key = `${q.cropName}-${q.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(q);
            }
        });

        deduped.sort((a, b) => {
            if (a.severity === 'high' && b.severity !== 'high') return -1;
            if (b.severity === 'high' && a.severity !== 'high') return 1;
            return a.cropName.localeCompare(b.cropName);
        });

        setActionQueue(deduped);
        setLoading(false);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, []));

    if (loading) {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{color: Colors.mutedText}}>Loading Garden Health...</Text>
            </View>
        );
    }

    const seasonLabel = getCurrentSeason(today(), farmProfile?.last_frost_date, farmProfile?.first_frost_date);
    const zoneLabel = inferZoneFromFrostDates(farmProfile?.first_frost_date, farmProfile?.last_frost_date).replace('_', ' ');

    return (
        <View style={s.container}>
            {/* ── Header ── */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={s.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={s.headerText}>
                    <Text style={s.headerTitle}>Garden Health Hub</Text>
                    <Text style={s.headerSub}>{zoneLabel.toUpperCase()} · {seasonLabel.toUpperCase()} SEASON</Text>
                </View>
            </View>

            <Animated.ScrollView
                style={[{ opacity: fadeAnim, flex: 1 }, Platform.OS === 'web' && { overflowY: 'scroll' }]}
                contentContainerStyle={s.scroll}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Action Queue ── */}
                <View style={s.sectionHeader}>
                    <Text style={s.sectionIcon}>🎯</Text>
                    <Text style={s.sectionTitle}>Action Queue ({actionQueue.length})</Text>
                </View>
                <Text style={s.sectionDesc}>High/Medium risks peaking in your zone this season.</Text>
                
                {actionQueue.length === 0 ? (
                    <View style={s.emptyBox}>
                        <Text style={s.emptyIcon}>✨</Text>
                        <Text style={s.emptyMsg}>No major seasonal threats detected for your active crops right now.</Text>
                    </View>
                ) : (
                    <View style={s.queueList}>
                        {actionQueue.slice(0, 5).map((q, i) => (
                            <View key={i} style={[s.qCard, q.severity === 'high' ? s.qCardHigh : s.qCardMed]}>
                                <View style={s.qTop}>
                                    <View style={[s.dot, q.severity === 'high' ? s.dotHigh : s.dotMed]} />
                                    <Text style={s.qCrop}>{q.cropName}</Text>
                                    <View style={s.qBadge}><Text style={s.qBadgeText}>{q.severity.toUpperCase()}</Text></View>
                                </View>
                                <Text style={s.qName}>Scout for: {q.name}</Text>
                                <Text style={s.qTreat}>Treatment: {q.organic_treatment}</Text>
                                
                                <View style={s.qActionRow}>
                                    <TouchableOpacity 
                                        style={s.qActionBtn}
                                        onPress={() => navigation.navigate('FieldJournal', { 
                                            farmProfile, 
                                            initialText: `${q.type === 'pests' ? '🐛' : '🍄'} Spotted ${q.name} on ${q.cropName}. ` 
                                        })}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={s.qActionBtnText}>📝 Log Sighting</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={s.qActionBtnSecondary}
                                        onPress={() => {
                                            const query = encodeURIComponent(`I am an organic farmer in growing zone ${zoneLabel}. I am growing ${q.cropName} and need to manage ${q.name}. What are the most effective organic treatments or preventative measures?`);
                                            Linking.openURL(`https://gemini.google.com/app?q=${query}`);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={s.qActionBtnSecondaryText}>✦ Ask Gemini</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── By Crop Details ── */}
                <View style={s.sectionHeader}>
                    <Text style={s.sectionIcon}>🌿</Text>
                    <Text style={s.sectionTitle}>Crop Intelligence</Text>
                </View>
                <Text style={s.sectionDesc}>IPM profiles for everything planned in your beds.</Text>
                
                <View style={s.cropList}>
                    {activeCrops.map(crop => {
                        const hasRisks = (crop.pests?.length > 0) || (crop.diseases?.length > 0);
                        const isExpanded = expandedCropId === crop.id;
                        return (
                            <View key={crop.id} style={s.cropCard}>
                                <TouchableOpacity 
                                    style={s.cropTouch} 
                                    disabled={!hasRisks}
                                    onPress={() => setExpandedCropId(isExpanded ? null : crop.id)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={s.cropName}>{crop.name}</Text>
                                    {!hasRisks ? (
                                        <Text style={s.noRiskText}>No data</Text>
                                    ) : (
                                        <Text style={s.chevron}>{isExpanded ? '▼' : '▶'}</Text>
                                    )}
                                </TouchableOpacity>
                                
                                {isExpanded && (
                                    <View style={s.cropBody}>
                                        {['pests', 'diseases'].map(type => (
                                            (crop[type] || []).map((r, ri) => (
                                                <View key={`${type}-${ri}`} style={s.detailRow}>
                                                    <Text style={s.detailName}>• {r.name}</Text>
                                                    <Text style={s.detailDesc}>{r.description}</Text>
                                                    <Text style={s.detailTreat}>{r.organic_treatment}</Text>
                                                </View>
                                            ))
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* ── CTA ── */}
                <View style={s.ctaWrap}>
                    <TouchableOpacity 
                        style={s.ctaBtn}
                        onPress={() => navigation.navigate('FieldJournal', { farmProfile })}
                    >
                        <Text style={s.ctaBtnText}>Log Pest Observation →</Text>
                    </TouchableOpacity>
                </View>
                
                <View style={{height: 60}} />
            </Animated.ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F2EA' },
    header: {
        backgroundColor: Colors.deepForest ?? '#1A2E0F',
        flexDirection: 'row', alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 54 : 16,
        paddingBottom: 14, paddingHorizontal: Spacing.md, gap: Spacing.sm,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backArrow: { fontSize: 28, color: '#FFF8F0', lineHeight: 32 },
    headerText: { flex: 1 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF8F0' },
    headerSub: { fontSize: 10, fontWeight: '700', color: 'rgba(255,248,240,0.6)', letterSpacing: 1, marginTop: 2 },
    
    scroll: { paddingTop: Spacing.md, paddingHorizontal: Spacing.md },
    
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md, gap: 6 },
    sectionIcon: { fontSize: 18 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.primaryGreen },
    sectionDesc: { fontSize: 12, color: Colors.mutedText, marginTop: 2, marginBottom: 12, marginLeft: 26 },
    
    emptyBox: { backgroundColor: 'rgba(45,79,30,0.05)', borderRadius: 8, padding: 20, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)' },
    emptyIcon: { fontSize: 24 },
    emptyMsg: { fontSize: 13, color: Colors.mutedText, textAlign: 'center' },

    queueList: { gap: 10 },
    qCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, ...Shadows.card },
    qCardHigh: { borderColor: '#FFCDD2', backgroundColor: '#FFF5F5' },
    qCardMed: { borderColor: '#FFE082', backgroundColor: '#FFF8E1' },
    qTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotHigh: { backgroundColor: '#C62828' },
    dotMed: { backgroundColor: '#E65100' },
    qCrop: { fontSize: 14, fontWeight: '800', color: Colors.primaryGreen, flex: 1 },
    qBadge: { backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    qBadgeText: { fontSize: 9, fontWeight: '800', color: '#666' },
    qName: { fontSize: 13, fontWeight: '700', color: '#333' },
    qTreat: { fontSize: 12, color: '#2E7D32', fontStyle: 'italic', marginTop: 4 },
    
    qActionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    qActionBtn: { flex: 1, backgroundColor: 'rgba(45,79,30,0.06)', paddingVertical: 8, borderRadius: Radius.sm, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)' },
    qActionBtnText: { fontSize: 11, fontWeight: '800', color: Colors.primaryGreen },
    qActionBtnSecondary: { flex: 1, backgroundColor: 'rgba(0,105,92,0.06)', paddingVertical: 8, borderRadius: Radius.sm, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,105,92,0.2)' },
    qActionBtnSecondaryText: { fontSize: 11, fontWeight: '800', color: '#00695C' },

    cropList: { gap: 8 },
    cropCard: { backgroundColor: '#FAFAF7', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#EDEEEA' },
    cropTouch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
    cropName: { fontSize: 15, fontWeight: '700', color: Colors.primaryGreen },
    chevron: { fontSize: 12, color: Colors.mutedText },
    noRiskText: { fontSize: 11, color: '#aaa', fontStyle: 'italic' },
    cropBody: { backgroundColor: '#fff', padding: 12, paddingTop: 0, gap: 12 },
    detailRow: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8 },
    detailName: { fontSize: 13, fontWeight: '700', color: '#444' },
    detailDesc: { fontSize: 12, color: '#666', marginTop: 2 },
    detailTreat: { fontSize: 12, fontStyle: 'italic', color: '#2E7D32', marginTop: 4 },
    
    ctaWrap: { marginTop: 30, alignItems: 'center' },
    ctaBtn: { backgroundColor: Colors.primaryGreen, paddingVertical: 14, paddingHorizontal: 30, borderRadius: 24, ...Shadows.card },
    ctaBtnText: { color: Colors.cream, fontSize: 14, fontWeight: '700' },
});
