/**
 * BedDesignerSetupScreen.js
 * ═════════════════════════
 * Pre-flight form for the standalone Bed Designer sandbox.
 * User enters space dimensions and orientation, then taps
 * "Open Designer" to launch VisualBedLayout in sandbox mode.
 */
import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

export default function BedDesignerSetupScreen({ navigation }) {
    const [lengthFt, setLengthFt] = useState('40');
    const [widthFt,  setWidthFt]  = useState('30');
    const [orientation, setOrientation] = useState('NS');
    const [error, setError] = useState('');

    function handleOpen() {
        const l = parseFloat(lengthFt);
        const w = parseFloat(widthFt);
        if (!l || !w || l <= 0 || w <= 0) {
            setError('Please enter valid dimensions (greater than 0).');
            return;
        }
        setError('');

        // Build a minimal spaceResult-compatible object.
        // No beds are pre-calculated — the sandbox starts empty.
        const spaceResult = {
            spaceLengthFt: l,
            spaceWidthFt:  w,
            bedLengthFt:   8,
            bedWidthFt:    4,
            pathwayWidthFt: 2,
            nsPathwayCount: 0,
            ewPathwayCount: 0,
            mainPathWidthFt: 0,
            equidistant: false,
            colGroups: [],
            rowGroups: [],
            bedsAcrossWidth: 0,
            bedsAlongLength: 0,
            totalBeds: 0,
            isSandbox: true,          // flag: no pre-placed beds
        };

        navigation.navigate('VisualBedLayout', {
            spaceJson: JSON.stringify(spaceResult),
            orientation,
        });
    }

    return (
        <View style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={s.backArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={s.superLabel}>ACRELOGIC</Text>
                <Text style={s.headerTitle}>Design My Garden</Text>
                <Text style={s.headerSub}>
                    Tell us your space — then drop, drag, and plant your beds your way.
                </Text>
            </View>

            <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

                {/* Space dimensions */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>📐 Space Dimensions</Text>
                    <Text style={s.cardSub}>Enter the total area you're working with</Text>

                    <View style={s.dimRow}>
                        <View style={s.dimField}>
                            <Text style={s.dimLabel}>Length (ft)</Text>
                            <TextInput
                                style={s.dimInput}
                                value={lengthFt}
                                onChangeText={setLengthFt}
                                keyboardType="decimal-pad"
                                selectTextOnFocus
                                placeholder="e.g. 40"
                                placeholderTextColor={Colors.mutedText}
                            />
                        </View>
                        <Text style={s.dimX}>×</Text>
                        <View style={s.dimField}>
                            <Text style={s.dimLabel}>Width (ft)</Text>
                            <TextInput
                                style={s.dimInput}
                                value={widthFt}
                                onChangeText={setWidthFt}
                                keyboardType="decimal-pad"
                                selectTextOnFocus
                                placeholder="e.g. 30"
                                placeholderTextColor={Colors.mutedText}
                            />
                        </View>
                    </View>

                    {(parseFloat(lengthFt) > 0 && parseFloat(widthFt) > 0) && (
                        <Text style={s.sqftNote}>
                            {(parseFloat(lengthFt) * parseFloat(widthFt)).toLocaleString()} sq ft
                            {' '}· {((parseFloat(lengthFt) * parseFloat(widthFt)) / 43560).toFixed(2)} acres
                        </Text>
                    )}
                </View>

                {/* Orientation */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>🧭 Space Orientation</Text>
                    <Text style={s.cardSub}>Which direction does your space run?</Text>

                    <View style={s.segRow}>
                        {[
                            { val: 'NS', label: '↕ N/S', hint: 'Length runs North to South' },
                            { val: 'EW', label: '↔ E/W', hint: 'Length runs East to West' },
                        ].map(opt => (
                            <TouchableOpacity
                                key={opt.val}
                                style={[s.segBtn, orientation === opt.val && s.segBtnActive]}
                                onPress={() => setOrientation(opt.val)}
                            >
                                <Text style={[s.segBtnText, orientation === opt.val && s.segBtnTextActive]}>
                                    {opt.label}
                                </Text>
                                <Text style={[s.segBtnHint, orientation === opt.val && s.segBtnHintActive]}>
                                    {opt.hint}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* How it works */}
                <View style={s.explainerCard}>
                    <Text style={s.explainerTitle}>How the Designer works</Text>
                    {[
                        ['➕', 'Use the sidebar to add beds with custom dimensions and orientation'],
                        ['🔀', 'Drag beds anywhere within your space boundary'],
                        ['🌱', 'Tap a bed → Assign Crops → paint each cell with a crop'],
                        ['🗓', 'Export your design to the Family Planting Plan'],
                    ].map(([icon, text]) => (
                        <View key={text} style={s.explainerRow}>
                            <Text style={s.explainerIcon}>{icon}</Text>
                            <Text style={s.explainerText}>{text}</Text>
                        </View>
                    ))}
                </View>

                {/* Error */}
                {!!error && <Text style={s.error}>{error}</Text>}

                {/* CTA */}
                <TouchableOpacity style={[s.openBtn, Shadows.button]} onPress={handleOpen}>
                    <Text style={s.openBtnText}>Open Designer →</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: '#F5F3EE',
        ...Platform.select({ web: { maxHeight: '100dvh' } }),
    },

    // Header
    header: {
        backgroundColor: Colors.primaryGreen,
        paddingTop: 54, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl,
    },
    backBtn: { padding: 4, marginBottom: Spacing.sm },
    backArrow: { fontSize: 28, color: Colors.cream, lineHeight: 30 },
    superLabel: { fontSize: 9, fontWeight: '800', color: Colors.warmTan, letterSpacing: 3, marginBottom: 4 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.cream, marginBottom: 6 },
    headerSub: { fontSize: 14, color: 'rgba(245,245,220,0.75)', lineHeight: 20 },

    // Body
    body: { padding: Spacing.lg, gap: Spacing.md },

    // Cards
    card: {
        backgroundColor: '#FFF', borderRadius: Radius.lg,
        padding: Spacing.lg, borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)',
        gap: Spacing.sm,
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.primaryGreen },
    cardSub: { fontSize: 12, color: Colors.mutedText, marginBottom: 4 },

    // Dimension row
    dimRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dimField: { flex: 1, gap: 4 },
    dimLabel: { fontSize: 11, fontWeight: '700', color: Colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5 },
    dimInput: {
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.2)', borderRadius: Radius.sm,
        padding: 12, fontSize: 22, fontWeight: '800', color: Colors.primaryGreen,
        textAlign: 'center', backgroundColor: '#FAFAF7',
    },
    dimX: { fontSize: 24, color: Colors.mutedText, fontWeight: '300', marginTop: 20 },
    sqftNote: { fontSize: 12, color: Colors.mutedText, textAlign: 'center', fontStyle: 'italic' },

    // Orientation segment
    segRow: { flexDirection: 'row', gap: 10 },
    segBtn: {
        flex: 1, padding: 14, borderRadius: Radius.md,
        borderWidth: 1.5, borderColor: 'rgba(45,79,30,0.18)',
        backgroundColor: '#FAFAF7', alignItems: 'center', gap: 4,
    },
    segBtnActive: { backgroundColor: Colors.primaryGreen, borderColor: Colors.primaryGreen },
    segBtnText: { fontSize: 15, fontWeight: '800', color: Colors.primaryGreen },
    segBtnTextActive: { color: '#FFF8F0' },
    segBtnHint: { fontSize: 10, color: Colors.mutedText, textAlign: 'center' },
    segBtnHintActive: { color: 'rgba(255,248,240,0.75)' },

    // Explainer
    explainerCard: {
        backgroundColor: 'rgba(45,79,30,0.05)', borderRadius: Radius.lg,
        padding: Spacing.lg, borderWidth: 1, borderColor: 'rgba(45,79,30,0.1)', gap: 10,
    },
    explainerTitle: { fontSize: 13, fontWeight: '800', color: Colors.primaryGreen, marginBottom: 4 },
    explainerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    explainerIcon: { fontSize: 16, width: 24 },
    explainerText: { flex: 1, fontSize: 13, color: Colors.mutedText, lineHeight: 18 },

    // Error + CTA
    error: { fontSize: 13, color: '#C62828', textAlign: 'center' },
    openBtn: {
        backgroundColor: Colors.primaryGreen, borderRadius: Radius.md,
        paddingVertical: 18, alignItems: 'center', marginTop: 4,
    },
    openBtnText: { fontSize: 17, fontWeight: '800', color: '#FFF8F0', letterSpacing: 0.5 },
});
