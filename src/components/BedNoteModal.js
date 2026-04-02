/**
 * BedNoteModal
 * ════════════
 * A lightweight aux popup triggered by long-pressing any bed tile.
 * - Writes directly to the Field Journal via saveJournalEntry()
 * - Auto-stamps date, time, and GPS location (if available)
 * - Appears as an overlay card — doesn't navigate away from the current screen
 *
 * Usage:
 *   <BedNoteModal
 *     visible={!!noteBed}
 *     bedNum={noteBed}          // 1–8 or null
 *     onClose={() => setNoteBed(null)}
 *   />
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Modal, KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { saveJournalEntry } from '../services/persistence';

// ── Location helper ───────────────────────────────────────────────────────────
function getLocationString() {
    return new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            return resolve(null);
        }
        const timeout = setTimeout(() => resolve(null), 4000);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                clearTimeout(timeout);
                const lat = pos.coords.latitude.toFixed(5);
                const lon = pos.coords.longitude.toFixed(5);
                resolve(`${lat}, ${lon}`);
            },
            () => { clearTimeout(timeout); resolve(null); },
            { timeout: 3500, maximumAge: 60000 }
        );
    });
}

function formatNow() {
    const d = new Date();
    return d.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function BedNoteModal({ visible, bedNum, blockName, onClose }) {
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [locationStr, setLocationStr] = useState(null);
    const [fetchingLoc, setFetchingLoc] = useState(false);

    const slideAnim = useRef(new Animated.Value(60)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const inputRef = useRef(null);

    // Fetch location and animate in when modal opens
    useEffect(() => {
        if (!visible) return;
        setText('');
        setSaved(false);
        setLocationStr(null);

        // Animate in
        Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start(() => {
            // Focus input after animation
            setTimeout(() => inputRef.current?.focus(), 50);
        });

        // Grab location in background
        setFetchingLoc(true);
        getLocationString().then(loc => {
            setLocationStr(loc);
            setFetchingLoc(false);
        });
    }, [visible]);

    const animateOut = useCallback((afterCb) => {
        Animated.parallel([
            Animated.timing(slideAnim, { toValue: 60, duration: 200, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start(() => {
            slideAnim.setValue(60);
            opacityAnim.setValue(0);
            afterCb?.();
        });
    }, []);

    const handleClose = useCallback(() => {
        animateOut(onClose);
    }, [animateOut, onClose]);

    const handleSave = useCallback(async () => {
        const trimmed = text.trim();
        if (!trimmed || saving) return;
        setSaving(true);

        try {
            // Build note text with auto-stamp footer
            const stamp = [
                `📅 ${formatNow()}`,
                locationStr ? `📍 ${locationStr}` : null,
            ].filter(Boolean).join('  ·  ');

            const fullText = `${trimmed}\n\n${stamp}`;
            const bedTag = bedNum ? `${blockName ? blockName + ' — ' : ''}Bed ${bedNum}` : 'General';

            saveJournalEntry({ bedTag, text: fullText });
            setSaved(true);

            // Brief success flash then close
            setTimeout(() => {
                animateOut(onClose);
            }, 900);
        } catch (e) {
            console.error('[BedNoteModal] save failed:', e);
        } finally {
            setSaving(false);
        }
    }, [text, saving, bedNum, locationStr, animateOut, onClose]);

    if (!visible) return null;

    const bedLabel = bedNum ? `${blockName ? blockName + ' — ' : ''}Bed ${bedNum}` : 'General';

    return (
        <Modal
            transparent
            animationType="none"
            visible={visible}
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            {/* Scrim */}
            <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={handleClose} />

            {/*
              * On web: KAV with behavior='height' collapses the container when keyboard appears,
              * pushing the card offscreen. Web browsers handle keyboard scrolling natively,
              * so we skip KAV entirely and anchor the card with position:fixed at the bottom.
              * On native: use behavior='padding' to lift the card above the keyboard.
              */}
            <KeyboardAvoidingView
                style={styles.positioner}
                behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
                enabled={Platform.OS !== 'web'}
                pointerEvents="box-none"
            >
                <Animated.View
                    style={[
                        styles.card,
                        Platform.OS === 'web' && styles.cardWeb,
                        Shadows.drawer,
                        { opacity: opacityAnim, transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {/* Handle */}
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <Text style={styles.headerIcon}>📓</Text>
                            <View>
                                <Text style={styles.headerTitle}>Field Note</Text>
                                <Text style={styles.headerMeta}>
                                    {bedLabel}  ·  {formatNow()}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Location stamp */}
                    <View style={styles.locationRow}>
                        <Text style={styles.locationIcon}>📍</Text>
                        {fetchingLoc ? (
                            <ActivityIndicator size="small" color={Colors.primaryGreen} style={{ marginLeft: 4 }} />
                        ) : (
                            <Text style={styles.locationText}>
                                {locationStr ?? 'Location unavailable'}
                            </Text>
                        )}
                    </View>

                    {/* Text input */}
                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        value={text}
                        onChangeText={setText}
                        placeholder="What did you observe? Pests, growth, soil notes, weather…"
                        placeholderTextColor={Colors.mutedText}
                        multiline
                        maxLength={600}
                        textAlignVertical="top"
                    />

                    {/* Actions */}
                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.saveBtn,
                                (!text.trim() || saving) && styles.saveBtnDisabled,
                                saved && styles.saveBtnSaved,
                            ]}
                            onPress={handleSave}
                            disabled={!text.trim() || saving}
                        >
                            <Text style={styles.saveText}>
                                {saved ? '✓ Saved to Journal' : saving ? 'Saving…' : '📓 Save to Journal'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    positioner: {
        flex: 1,
        justifyContent: 'flex-end',
        pointerEvents: 'box-none',
    },
    card: {
        backgroundColor: '#FAFAF7',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    },
    // On web: hard-pinned to bottom of viewport using fixed positioning.
    // translateZ(0) forces a new GPU compositing layer so the keyboard overlay
    // cannot displace the card. env(safe-area-inset-bottom) handles notch devices.
    cardWeb: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: 640,
        marginHorizontal: 'auto',
        transform: [{ translateZ: 0 }],
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        zIndex: 9999,
    },
    handle: {
        width: 36, height: 4,
        backgroundColor: 'rgba(45,79,30,0.2)',
        borderRadius: 2, alignSelf: 'center',
        marginTop: 10, marginBottom: 14,
    },
    header: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: Spacing.sm,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    headerIcon: { fontSize: 22 },
    headerTitle: {
        fontSize: Typography.md, fontWeight: Typography.bold,
        color: Colors.primaryGreen,
    },
    headerMeta: { fontSize: Typography.xs, color: Colors.mutedText, marginTop: 1 },
    closeBtn: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(45,79,30,0.08)',
        alignItems: 'center', justifyContent: 'center',
    },
    closeBtnText: { fontSize: 12, color: Colors.mutedText, fontWeight: Typography.bold },

    locationRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(45,79,30,0.05)',
        borderRadius: Radius.sm, paddingVertical: 6,
        paddingHorizontal: 10, marginBottom: Spacing.sm, gap: 4,
    },
    locationIcon: { fontSize: 11 },
    locationText: { fontSize: 10, color: Colors.mutedText, flex: 1 },

    input: {
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
        borderRadius: Radius.sm, padding: Spacing.sm,
        fontSize: Typography.sm, color: Colors.darkText,
        // Fixed height on web prevents the card from reflowing when keyboard opens,
        // which was causing the card to jump off the bottom of the screen.
        ...Platform.select({
            web: { height: 120 },
            default: { minHeight: 110, maxHeight: 180 },
        }),
        backgroundColor: '#FFFFFF', marginBottom: Spacing.sm,
    },

    actions: { flexDirection: 'row', gap: Spacing.sm },
    cancelBtn: {
        flex: 1, paddingVertical: 13, borderRadius: Radius.md,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)',
        alignItems: 'center',
    },
    cancelText: { color: Colors.mutedText, fontWeight: Typography.bold, fontSize: Typography.sm },
    saveBtn: {
        flex: 2, paddingVertical: 13, borderRadius: Radius.md,
        backgroundColor: Colors.primaryGreen, alignItems: 'center',
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnSaved: { backgroundColor: '#2e7d32' },
    saveText: { color: '#FAFAF7', fontWeight: Typography.bold, fontSize: Typography.sm },
});
