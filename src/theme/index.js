// AcreLogic Design System — Color Palette & Typography
export const Colors = {
    primaryGreen: '#2D4F1E',
    warmTan: '#D2B48C',
    softLavender: '#B57EDC',
    burntOrange: '#CC5500',
    backgroundGrey: '#E5E4E2',
    cream: '#F5F5DC',
    white: '#FFFFFF',
    darkText: '#1A1A1A',
    mutedText: '#6B6B6B',
    cardBg: '#FAF6F0',
    overlayDark: 'rgba(20, 35, 10, 0.62)',
    overlayLight: 'rgba(210, 180, 140, 0.18)',
};

export const Typography = {
    // Weights
    regular: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',

    // Sizes
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 32,
    hero: 42,
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const Radius = {
    sm: 8,
    md: 15,
    lg: 22,
    xl: 32,
    full: 999,
};

export const Shadows = {
    card: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 5,
    },
    button: {
        shadowColor: Colors.primaryGreen,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
    },
    drawer: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 12,
    },
};
