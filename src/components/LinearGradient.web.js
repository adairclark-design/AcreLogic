/**
 * LinearGradient web shim
 * Metro uses this file instead of expo-linear-gradient when building for web.
 * Implements the same API using a CSS linear-gradient div.
 */
import React from 'react';
import { View } from 'react-native';

export function LinearGradient({ colors = [], start, end, style, children, ...props }) {
    // Convert colors array to CSS gradient direction + stops
    const angle = start && end
        ? Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI) + 90
        : 180;
    const gradient = `linear-gradient(${angle}deg, ${colors.join(', ')})`;

    return (
        <View
            style={[style, { backgroundImage: gradient }]}
            {...props}
        >
            {children}
        </View>
    );
}

export default LinearGradient;
