/**
 * seedProcurementService.js — V3 (Categorical Approximations)
 * ══════════════════════════════════════════════════════════
 * Provides extremely fast, client-side approximate market averages
 * based on crop categories (100% catalog coverage, zero token costs).
 */

const CATEGORY_BASE_PRICES = {
    Nightshade: 5.50,
    Flower: 5.00,
    Cucurbit: 4.95,
    Legume: 4.95,
    Brassica: 4.50,
    Allium: 4.50,
    Root: 4.25,
    Greens: 3.95,
    Herb: 3.95,
    Specialty: 5.50,
    default: 4.50,
};

/** Deterministic string hash (no randomness — prices stay perfectly stable) */
function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }
    return Math.abs(h);
}

/**
 * Generate categorical pricing for a batch of seeds.
 */
export function generateCategoricalPricing(seedList) {
    return seedList.map((item) => {
        const basePrice = CATEGORY_BASE_PRICES[item.category] || CATEGORY_BASE_PRICES.default;

        // Apply a tiny ±5% deterministic variance based on crop name so that
        // not *every* single brassica is exactly identical to the penny.
        const varianceSeed = hashStr(item.name + 'variance');
        const variance = 1 + ((varianceSeed % 10) - 5) / 100; 
        const adjustedBase = basePrice * variance;

        // Apply vendor specific markups/markdowns mathematically
        const priceJohnnys = parseFloat((adjustedBase * 1.15).toFixed(2));
        const priceTerritorial = parseFloat((adjustedBase * 1.00).toFixed(2));
        const priceBakerCreek = parseFloat((adjustedBase * 0.90).toFixed(2));

        const vendors = {
            Johnnys: { price: priceJohnnys, stock: true, rawUnit: 'appx. packet' },
            BakerCreek: { price: priceBakerCreek, stock: true, rawUnit: 'appx. packet' },
            Territorial: { price: priceTerritorial, stock: true, rawUnit: 'appx. packet' },
        };

        return {
            cropId: item.cropId,
            name: item.name,
            emoji: item.emoji || '🌱',
            category: item.category,
            vendors,
        };
    });
}
