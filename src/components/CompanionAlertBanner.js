/**
 * CompanionAlertBanner.js
 * ════════════════════════
 * Animated flash banner that slides down from the top when incompatible
 * companion crops are detected in the same bed (or adjacent beds).
 *
 * Props:
 *   warnings  — string[]  list of conflict reason strings
 *   onDismiss — fn        called when user taps × or auto-dismiss fires
 *
 * Auto-dismisses after AUTO_DISMISS_MS milliseconds.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Animated, Platform,
} from 'react-native';

const AUTO_DISMISS_MS = 5000;

export default function CompanionAlertBanner({ warnings = [], onDismiss }) {
    const slideY = useRef(new Animated.Value(-120)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const timer   = useRef(null);

    const dismiss = useCallback(() => {
        clearTimeout(timer.current);
        Animated.parallel([
            Animated.timing(slideY, { toValue: -120, duration: 250, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,    duration: 200, useNativeDriver: true }),
        ]).start(() => onDismiss?.());
    }, [onDismiss, slideY, opacity]);

    useEffect(() => {
        if (!warnings.length) return;

        // Slide in
        Animated.parallel([
            Animated.spring(slideY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();

        // Auto-dismiss
        timer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
        return () => clearTimeout(timer.current);
    }, [warnings, dismiss, slideY, opacity]);

    if (!warnings.length) return null;

    return (
        <Animated.View
            style={[
                styles.banner,
                { transform: [{ translateY: slideY }], opacity },
                Platform.OS === 'web' && { position: 'fixed', top: 56, left: 0, right: 0, zIndex: 9999 },
            ]}
        >
            <View style={styles.iconCol}>
                <Text style={styles.icon}>⚠️</Text>
            </View>
            <View style={styles.body}>
                <Text style={styles.title}>Companion Conflict Detected</Text>
                {warnings.slice(0, 2).map((w, i) => (
                    <Text key={i} style={styles.reason} numberOfLines={3}>{w}</Text>
                ))}
                {warnings.length > 2 && (
                    <Text style={styles.more}>+{warnings.length - 2} more conflict{warnings.length - 2 > 1 ? 's' : ''}</Text>
                )}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={dismiss} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 56, // below header
        left: 0,
        right: 0,
        zIndex: 9999,
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#B71C1C',
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 12,
    },
    iconCol: {
        paddingTop: 2,
    },
    icon: {
        fontSize: 20,
    },
    body: {
        flex: 1,
        gap: 3,
    },
    title: {
        fontSize: 13,
        fontWeight: '800',
        color: '#FFF',
        letterSpacing: 0.3,
    },
    reason: {
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 16,
    },
    more: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        fontStyle: 'italic',
    },
    closeBtn: {
        paddingTop: 1,
    },
    closeText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '700',
    },
});
