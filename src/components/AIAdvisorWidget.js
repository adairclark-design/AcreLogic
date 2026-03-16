/**
 * AIAdvisorWidget
 * ================
 * A floating "Max" chat button that expands into a full chat panel.
 * Context-aware: knows the user's current crops, frost dates, and bed plan.
 *
 * Usage:
 *   <AIAdvisorWidget farmProfile={farmProfile} selectedCrops={crops} bedSuccessions={beds} />
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput, Animated,
    ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
    Dimensions,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { askAdvisor, getStarterQuestions, askAdvisorWithImage } from '../services/aiAdvisorService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PANEL_W = Math.min(SCREEN_W * 0.88, 400);

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble = ({ message }) => {
    const isUser = message.role === 'user';
    return (
        <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
            {!isUser && <Text style={styles.avatarLabel}>🌱</Text>}
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleMax]}>
                <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
                    {message.content}
                </Text>
            </View>
        </View>
    );
};

// ─── Typing Indicator ─────────────────────────────────────────────────────────
const TypingIndicator = () => {
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const pulse = (dot, delay) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, { toValue: -5, duration: 300, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
                    Animated.delay(600),
                ])
            ).start();
        pulse(dot1, 0);
        pulse(dot2, 150);
        pulse(dot3, 300);
    }, []);

    return (
        <View style={styles.bubbleRow}>
            <Text style={styles.avatarLabel}>🌱</Text>
            <View style={styles.bubbleMax}>
                <View style={styles.typingDots}>
                    {[dot1, dot2, dot3].map((dot, i) => (
                        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
                    ))}
                </View>
            </View>
        </View>
    );
};

// ─── Main Widget ──────────────────────────────────────────────────────────────
export default function AIAdvisorWidget({ farmProfile = {}, selectedCrops = [], bedSuccessions = {} }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const fileInputRef = useRef(null);
    const [starters, setStarters] = useState([]);

    const panelAnim = useRef(new Animated.Value(0)).current;
    const fabAnim = useRef(new Animated.Value(1)).current;
    const scrollRef = useRef(null);

    const farmContext = {
        farmProfile,
        selectedCrops: Array.isArray(selectedCrops) ? selectedCrops : [],
        bedSuccessions,
        bedCount: 8,
    };

    useEffect(() => {
        setStarters(getStarterQuestions(farmContext));
    }, [selectedCrops]);

    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
    }, [messages, isThinking]);

    const openPanel = () => {
        setIsOpen(true);
        // Animate greeting if first open
        if (messages.length === 0) {
            setTimeout(() => {
                setMessages([{
                    role: 'assistant',
                    content: `Hi! I'm Max, your farming advisor 🌱 I can see your current plan — ask me anything about your crops, timing, soil, or pests.`,
                }]);
            }, 300);
        }
        Animated.parallel([
            Animated.spring(panelAnim, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }),
            Animated.timing(fabAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
    };

    const closePanel = () => {
        Animated.parallel([
            Animated.timing(panelAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
            Animated.timing(fabAnim, { toValue: 1, duration: 250, delay: 150, useNativeDriver: true }),
        ]).start(() => setIsOpen(false));
    };

    const sendMessage = useCallback(async (text) => {
        const content = (text ?? input).trim();
        if (!content || isThinking) return;

        const userMsg = { role: 'user', content };
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setInput('');
        setIsThinking(true);

        try {
            const reply = await askAdvisor(nextMessages, farmContext);
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Sorry, I'm having trouble connecting right now. Check your internet connection and try again.`,
            }]);
        } finally {
            setIsThinking(false);
        }
    }, [input, messages, isThinking, farmContext]);

    // Web-only: open file picker → convert to base64 → send to Gemini Vision
    const handleScanPhoto = useCallback(() => {
        if (Platform.OS !== 'web') return;
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    }, []);

    const handleFileChange = useCallback(async (event) => {
        const file = event?.target?.files?.[0];
        if (!file) return;

        setIsScanning(true);
        const userMsg = { role: 'user', content: `📸 Scanning photo: "${file.name}" — diagnosing…` };
        setMessages(prev => [...prev, userMsg]);
        setIsThinking(true);

        try {
            const reader = new FileReader();
            const base64 = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const cropNames = (Array.isArray(selectedCrops) ? selectedCrops : []).map(c =>
                typeof c === 'string' ? c : c?.crop_name ?? c?.name ?? ''
            ).filter(Boolean);

            const diagnosis = await askAdvisorWithImage(base64, file.type, {
                cropNames,
                location: farmProfile?.address ?? farmProfile?.usda_zone ?? 'unknown',
                farmProfile,
            });

            setMessages(prev => [...prev, { role: 'assistant', content: diagnosis }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Sorry, I couldn't analyze the photo. ${err.message}`,
            }]);
        } finally {
            setIsThinking(false);
            setIsScanning(false);
            // Reset file input so same file can be selected again
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [farmProfile, selectedCrops]);

    const panelTranslateY = panelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [300, 0],
    });

    return (
        <View style={styles.container} pointerEvents="box-none">

            {/* ── Chat Panel ── */}
            {isOpen && (
                <Animated.View style={[
                    styles.panel, Shadows.card,
                    { opacity: panelAnim, transform: [{ translateY: panelTranslateY }] },
                ]}>
                    {/* Header */}
                    <View style={styles.panelHeader}>
                        <View style={styles.panelHeaderLeft}>
                            <View style={styles.panelAvatar}><Text style={styles.panelAvatarText}>🌱</Text></View>
                            <View>
                                <Text style={styles.panelName}>Max</Text>
                                <Text style={styles.panelSubtitle}>Your farming advisor</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={closePanel} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Messages */}
                    <ScrollView
                        ref={scrollRef}
                        style={styles.messages}
                        contentContainerStyle={styles.messagesContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
                        {isThinking && <TypingIndicator />}

                        {/* Starter questions — show only if just the greeting is visible */}
                        {messages.length === 1 && !isThinking && starters.length > 0 && (
                            <View style={styles.starters}>
                                {starters.map((q, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={styles.starterChip}
                                        onPress={() => sendMessage(q)}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={styles.starterText}>{q}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </ScrollView>

                    {/* Input */}
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={styles.inputRow}>
                            {/* Web file input — hidden */}
                            {Platform.OS === 'web' && (
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={handleFileChange}
                                />
                            )}
                            {/* Camera scan button */}
                            {Platform.OS === 'web' && (
                                <TouchableOpacity
                                    style={[styles.cameraBtn, isThinking && styles.sendBtnDisabled]}
                                    onPress={handleScanPhoto}
                                    disabled={isThinking}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.cameraBtnText}>📸</Text>
                                </TouchableOpacity>
                            )}
                            <TextInput
                                style={styles.input}
                                value={input}
                                onChangeText={setInput}
                                placeholder="Ask about crops, pests, soil… or 📸 scan a leaf"
                                placeholderTextColor={Colors.mutedText}
                                multiline
                                maxLength={500}
                                returnKeyType="send"
                                onSubmitEditing={() => sendMessage()}
                                editable={!isThinking}
                            />
                            <TouchableOpacity
                                style={[styles.sendBtn, (!input.trim() || isThinking) && styles.sendBtnDisabled]}
                                onPress={() => sendMessage()}
                                disabled={!input.trim() || isThinking}
                                activeOpacity={0.8}
                            >
                                {isThinking
                                    ? <ActivityIndicator size="small" color={Colors.cream} />
                                    : <Text style={styles.sendBtnText}>↑</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </Animated.View>
            )}

            {/* ── FAB ── */}
            <Animated.View style={[styles.fab, { opacity: fabAnim, transform: [{ scale: fabAnim }] }]}>
                <TouchableOpacity
                    style={[styles.fabButton, Shadows.button]}
                    onPress={openPanel}
                    activeOpacity={0.85}
                >
                    <Text style={styles.fabIcon}>🌱</Text>
                    <Text style={styles.fabLabel}>Ask Max</Text>
                </TouchableOpacity>
            </Animated.View>

        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        position: 'absolute', bottom: 0, right: 0, left: 0, top: 0,
        justifyContent: 'flex-end', alignItems: 'flex-end',
        paddingBottom: Platform.OS === 'ios' ? 100 : 80,
        paddingRight: Spacing.md,
        zIndex: 999,
    },

    // ── Panel ──────────────────────────────────────────────────────────────────
    panel: {
        width: PANEL_W,
        maxHeight: SCREEN_H * 0.65,
        backgroundColor: Colors.cream,
        borderRadius: Radius.xl,
        overflow: 'hidden',
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.12)',
    },
    panelHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.primaryGreen,
        paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    },
    panelHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    panelAvatar: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    panelAvatarText: { fontSize: 18 },
    panelName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.cream },
    panelSubtitle: { fontSize: 10, color: 'rgba(245,240,225,0.75)' },
    closeBtn: { padding: 6 },
    closeBtnText: { color: Colors.cream, fontSize: Typography.sm, opacity: 0.8 },

    // ── Messages ───────────────────────────────────────────────────────────────
    messages: { flex: 1 },
    messagesContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.sm },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs },
    bubbleRowUser: { justifyContent: 'flex-end' },
    avatarLabel: { fontSize: 18, marginBottom: 2 },
    bubble: { maxWidth: PANEL_W * 0.72, borderRadius: 16, padding: Spacing.sm },
    bubbleMax: { backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)' },
    bubbleUser: { backgroundColor: Colors.primaryGreen },
    bubbleText: { fontSize: Typography.sm, color: Colors.darkText, lineHeight: 20 },
    bubbleTextUser: { color: Colors.cream },

    // ── Typing ─────────────────────────────────────────────────────────────────
    typingDots: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
    typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primaryGreen, opacity: 0.6 },

    // ── Starters ───────────────────────────────────────────────────────────────
    starters: { gap: 6, marginTop: Spacing.xs },
    starterChip: {
        backgroundColor: 'white', borderRadius: Radius.md,
        paddingVertical: 8, paddingHorizontal: Spacing.sm,
        borderWidth: 1, borderColor: 'rgba(45,79,30,0.15)',
    },
    starterText: { fontSize: Typography.xs, color: Colors.primaryGreen, fontWeight: Typography.medium },

    // ── Input ──────────────────────────────────────────────────────────────────
    inputRow: {
        flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs,
        borderTopWidth: 1, borderTopColor: 'rgba(45,79,30,0.1)',
        padding: Spacing.sm,
    },
    input: {
        flex: 1, fontSize: Typography.sm, color: Colors.darkText,
        backgroundColor: 'white', borderRadius: Radius.md,
        paddingHorizontal: Spacing.sm, paddingVertical: 8,
        maxHeight: 80, borderWidth: 1, borderColor: 'rgba(45,79,30,0.15)',
    },
    sendBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.primaryGreen,
        alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    cameraBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(45,79,30,0.12)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)',
    },
    cameraBtnText: { fontSize: 18 },
    sendBtnText: { color: Colors.cream, fontSize: 18, fontWeight: Typography.bold },

    // ── FAB ───────────────────────────────────────────────────────────────────
    fab: {},
    fabButton: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 12, paddingHorizontal: 18,
        borderRadius: 30,
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    },
    fabIcon: { fontSize: 20 },
    fabLabel: { color: Colors.cream, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 0.5 },
});
