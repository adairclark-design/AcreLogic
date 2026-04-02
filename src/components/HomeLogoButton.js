/**
 * HomeLogoButton.js
 * ─────────────────
 * A compact, tappable ACRELOGIC logo mark that lives top-center on every
 * inner screen header. Tapping it navigates back to the Hero (home) screen
 * by popping the entire navigation stack.
 *
 * Usage:
 *   import HomeLogoButton from '../components/HomeLogoButton';
 *   <HomeLogoButton navigation={navigation} />
 *
 * Props:
 *   navigation (required) — React Navigation prop
 *   color      (optional) — override text/icon colour (defaults to cream #F5F5DC)
 *   onPress    (optional) — custom override; if omitted, popToTop() is called
 */
import React, { useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Animated, Platform } from 'react-native';

export default function HomeLogoButton({ navigation, color, onPress }) {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const textColor = color ?? '#F5F5DC'; // cream default

    const handlePressIn = () => {
        Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
    };
    const handlePressOut = () => {
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start();
    };

    const handlePress = () => {
        if (onPress) {
            onPress();
        } else {
            // Pop all screens back to Hero (the stack root)
            navigation.popToTop();
        }
    };

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
                style={styles.btn}
                onPress={handlePress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.85}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            >
                {/* Leaf mark */}
                <View style={styles.leafRow}>
                    <View style={[styles.leafLeft,  { backgroundColor: textColor, opacity: 0.75 }]} />
                    <View style={[styles.leafStem,  { backgroundColor: textColor }]} />
                    <View style={[styles.leafRight, { borderColor: textColor, opacity: 0.85 }]} />
                </View>
                {/* Wordmark */}
                <View style={styles.wordRow}>
                    <Text style={[styles.wordAcre,  { color: '#D2B48C' }]}>ACRE</Text>
                    <Text style={[styles.wordLogic, { color: textColor }]}>LOGIC</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    btn: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    },
    leafRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
        marginBottom: 2,
    },
    leafLeft: {
        width: 8,
        height: 12,
        borderRadius: 8,
        transform: [{ rotate: '-20deg' }],
    },
    leafStem: {
        width: 2,
        height: 13,
        borderRadius: 2,
        marginBottom: -2,
    },
    leafRight: {
        width: 8,
        height: 12,
        borderRadius: 8,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        transform: [{ rotate: '20deg' }],
    },
    wordRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    wordAcre: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    wordLogic: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
});
