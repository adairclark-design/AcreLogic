/**
 * Standard weight conversions for crops that can be reported by either weight or volume.
 * Used to translate wholesale poundage into market bunch equivalents.
 */
export const LBS_PER_BUNCH = {
    'Greens': 0.5,     // 8oz bunches (Arugula, Spinach, Kale, Chard)
    'Herb': 0.25,      // 4oz bunches (Basil, Cilantro, Parsley)
    'Root': 1.0,       // 16oz bunches (Carrots, Radishes, Beets)
    'Allium': 0.75,    // 12oz bunches (Scallions, Green Garlic)
    'Brassica': 1.5,   // 24oz bunches (Broccolini, Kale)
    'Specialty': 0.5   // Default fallback
};
