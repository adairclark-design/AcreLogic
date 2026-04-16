import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking, Platform } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { buildCartUrl } from '../services/seedCostOptimizer';

const VENDOR_COLORS = {
    Johnnys: '#FFD700',
    BakerCreek: '#D32F2F',
    Territorial: '#388E3C',
};

const VENDOR_NAMES = {
    Johnnys: "Johnny's Seeds",
    BakerCreek: "Baker Creek",
    Territorial: "Territorial Seed",
};

export default function QuickShopModal({ visible, cropName, priceData, onClose }) {
    if (!visible || !priceData) return null;

    const handleBuy = (vendor) => {
        // Build affiliate cart URL for this single crop
        const url = buildCartUrl(vendor, [priceData.cropId]);
        if (Platform.OS === 'web') {
            window.open(url, '_blank');
        } else {
            Linking.openURL(url);
        }
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
                <View style={styles.panel}>
                    <View style={styles.dragHandle} />
                    
                    <Text style={styles.title}>🛒 Shop {cropName} Seeds</Text>
                    <Text style={styles.subtitle}>Direct affiliate links open securely in a new tab.</Text>

                    <View style={styles.vendorList}>
                        {['Johnnys', 'BakerCreek', 'Territorial'].map(vendor => {
                            const vData = priceData.vendors[vendor];
                            if (!vData) return null;

                            const isOOS = !vData.stock;
                            const hasPrice = vData.price > 0;

                            return (
                                <View key={vendor} style={styles.vendorRow}>
                                    <View style={styles.vendorInfo}>
                                        <View style={[styles.vendorDot, { backgroundColor: VENDOR_COLORS[vendor] }]} />
                                        <Text style={styles.vendorName}>{VENDOR_NAMES[vendor]}</Text>
                                    </View>

                                    <View style={styles.vendorAction}>
                                        {!hasPrice ? (
                                            <Text style={styles.oosText}>Unavailable</Text>
                                        ) : isOOS ? (
                                            <Text style={styles.oosText}>Out of Stock</Text>
                                        ) : (
                                            <TouchableOpacity 
                                                style={[styles.buyBtn, { backgroundColor: VENDOR_COLORS[vendor] }]}
                                                onPress={() => handleBuy(vendor)}
                                            >
                                                <Text style={[
                                                    styles.buyBtnText, 
                                                    vendor === 'Johnnys' && { color: '#000' }
                                                ]}>
                                                    Buy ~${vData.price.toFixed(2)}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </View>

                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <Text style={styles.disclaimerText}>
                        * Prices shown are approximate categorical market averages.
                    </Text>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    panel: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        padding: Spacing.xl,
        paddingBottom: Platform.OS === 'web' ? 40 : 60,
        alignItems: 'center',
    },
    dragHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#CCC',
        borderRadius: 2,
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: Colors.primaryGreen,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        marginBottom: Spacing.xl,
    },
    vendorList: {
        width: '100%',
        gap: Spacing.md,
        marginBottom: Spacing.xl,
    },
    vendorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.md,
        backgroundColor: Colors.backgroundGrey,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: 'rgba(45,79,30,0.1)',
    },
    vendorInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    vendorDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    vendorName: {
        fontSize: Typography.md,
        fontWeight: Typography.semiBold,
        color: Colors.darkText,
    },
    vendorAction: {
        minWidth: 100,
        alignItems: 'flex-end', // Add this to align button text to the right correctly
    },
    oosText: {
        fontSize: Typography.sm,
        color: Colors.mutedText,
        fontStyle: 'italic',
        paddingVertical: 8,
    },
    buyBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: Radius.full,
    },
    buyBtnText: {
        color: Colors.white,
        fontWeight: Typography.bold,
        fontSize: Typography.sm,
    },
    closeBtn: {
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    closeBtnText: {
        color: Colors.mutedText,
        fontSize: Typography.md,
        fontWeight: Typography.semiBold,
    },
});
