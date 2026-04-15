/**
 * seedCostOptimizer.js
 * ═════════════════════
 * Global Minimum Cost Algorithm — runs entirely client-side, zero API cost.
 *
 * Given a seed list and per-variety vendor price data, finds the optimal
 * split across vendors that minimizes (subtotal + shipping) combined.
 *
 * Strategy:
 *   1. For each variety, collect all in-stock vendor prices
 *   2. Try all meaningful vendor-split combinations (brute-force is fine
 *      at seed-order scale: 3 vendors × 10–30 items = trivial)
 *   3. For each split, compute subtotal per vendor + apply shipping threshold
 *   4. Return the split with the lowest grand total, plus a "single vendor"
 *      alternative for users who prefer simplicity
 */

import VENDOR_SKUS from '../data/seedVendorSKUs.json';

export const VENDOR_CONFIG = {
    Johnnys: {
        label: "Johnny's Selected Seeds",
        shortLabel: "Johnny's",
        emoji: '🟡',
        accentColor: '#C8860A',
        bgColor: '#FFFBF0',
        borderColor: '#F59E0B',
        freeShippingAt: 50.00,
        flatShipping: 6.95,
        affiliateParam: 'aff_id=acrelogic',
        baseUrl: 'https://www.johnnyseeds.com',
        cartUrl: (skus) => `https://www.johnnyseeds.com/cart?add=${skus.join(',')}`,
        searchUrl: (q) => `https://www.johnnyseeds.com/search?q=${encodeURIComponent(q)}`,
    },
    BakerCreek: {
        label: 'Baker Creek Heirloom Seeds',
        shortLabel: 'Baker Creek',
        emoji: '🔴',
        accentColor: '#B91C1C',
        bgColor: '#FFF5F5',
        borderColor: '#FCA5A5',
        freeShippingAt: 35.00,
        flatShipping: 5.95,
        affiliateParam: 'ref=acrelogic',
        baseUrl: 'https://www.rareseeds.com',
        cartUrl: (variantIds) =>
            `https://www.rareseeds.com/cart/${variantIds.map(id => `${id}:1`).join(',')}`,
        searchUrl: (q) => `https://www.rareseeds.com/catalogsearch/result/?q=${encodeURIComponent(q)}`,
    },
    Territorial: {
        label: 'Territorial Seed Company',
        shortLabel: 'Territorial',
        emoji: '🟢',
        accentColor: '#166534',
        bgColor: '#F0FDF4',
        borderColor: '#86EFAC',
        freeShippingAt: 75.00,
        flatShipping: 8.95,
        affiliateParam: 'ref=acrelogic',
        baseUrl: 'https://territorialseed.com',
        cartUrl: (variantIds) =>
            `https://territorialseed.com/cart/${variantIds.map(id => `${id}:1`).join(',')}`,
        searchUrl: (q) => `https://territorialseed.com/search?type=product&q=${encodeURIComponent(q)}`,
    },
};

// ─── Cart URL Builder ─────────────────────────────────────────────────────────

/**
 * Build a pre-filled cart URL for a vendor given a list of cropIds.
 * Falls back to a search URL if SKU not mapped.
 */
export function buildCartUrl(vendor, cropIds) {
    const config = VENDOR_CONFIG[vendor];
    if (!config) return null;

    const skus = [];
    const unmapped = [];

    for (const cropId of cropIds) {
        const vendorData = VENDOR_SKUS.crops?.[cropId]?.[vendor];
        if (!vendorData) {
            unmapped.push(cropId);
            continue;
        }
        if (vendor === 'Johnnys') {
            skus.push(vendorData.sku);
        } else {
            // Shopify: use variant_id
            skus.push(vendorData.shopify_variant_id);
        }
    }

    let url;
    if (skus.length > 0) {
        url = config.cartUrl(skus);
    } else {
        // All unmapped — fall back to search for first item
        const fallback = VENDOR_SKUS.crops?.[cropIds[0]]?.search_fallback || cropIds[0].replace(/_/g, ' ');
        url = config.searchUrl(fallback);
    }

    // Append affiliate parameter
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${config.affiliateParam}`;
}

/**
 * Build a search URL for a single unmapped crop (always works).
 */
export function buildSearchUrl(vendor, cropId) {
    const config = VENDOR_CONFIG[vendor];
    const fallback = VENDOR_SKUS.crops?.[cropId]?.search_fallback || cropId.replace(/_/g, ' ');
    const url = config.searchUrl(fallback);
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${config.affiliateParam}`;
}

// ─── Shipping Calculator ──────────────────────────────────────────────────────

function shippingCost(vendor, subtotal) {
    const config = VENDOR_CONFIG[vendor];
    return subtotal >= config.freeShippingAt ? 0 : config.flatShipping;
}

// ─── Global Minimum Cost Solver ───────────────────────────────────────────────

/**
 * Input: priceData — array of per-variety vendor offers:
 * [
 *   {
 *     cropId: 'lettuce_butterhead',
 *     name: 'Lettuce Butterhead',
 *     vendors: {
 *       Johnnys:     { price: 3.95, stock: true },
 *       BakerCreek:  { price: 3.49, stock: true },
 *       Territorial: { price: 4.25, stock: false },
 *     }
 *   }, ...
 * ]
 *
 * Returns: OptimalCartResult
 */
export function solveOptimalCart(priceData) {
    const vendorNames = Object.keys(VENDOR_CONFIG);
    const availableVendors = new Set();

    // Build per-item cheapest-vendor lookup
    const items = priceData.map(item => {
        const offers = [];
        for (const [vendor, offer] of Object.entries(item.vendors || {})) {
            if (offer.stock && offer.price > 0) {
                offers.push({ vendor, price: offer.price });
                availableVendors.add(vendor);
            }
        }
        offers.sort((a, b) => a.price - b.price);
        return { ...item, offers };
    });

    // ── Strategy 1: Pure cheapest-per-item (may split across all vendors) ──
    const splitResult = _buildSplitCart(items, vendorNames);

    // ── Strategy 2: Best single-vendor (consolidation) ──
    let bestSingleVendor = null;
    let bestSingleTotal = Infinity;

    for (const vendor of vendorNames) {
        const cart = _buildSingleVendorCart(items, vendor);
        if (cart && cart.grandTotal < bestSingleTotal) {
            bestSingleTotal = cart.grandTotal;
            bestSingleVendor = cart;
        }
    }

    // ── Strategy 3: Two-vendor combinations (catch shipping-threshold sweet spots) ──
    let bestTwoVendor = null;
    let bestTwoTotal = Infinity;

    const combos = _combinations(vendorNames, 2);
    for (const [v1, v2] of combos) {
        const cart = _buildTwoVendorCart(items, v1, v2);
        if (cart && cart.grandTotal < bestTwoTotal) {
            bestTwoTotal = cart.grandTotal;
            bestTwoVendor = cart;
        }
    }

    // Pick the winner
    const strategies = [splitResult, bestSingleVendor, bestTwoVendor].filter(Boolean);
    strategies.sort((a, b) => a.grandTotal - b.grandTotal);
    const optimal = strategies[0];

    return {
        optimal,
        singleVendorAlternative: bestSingleVendor,
        savingsVsSingleVendor: bestSingleVendor
            ? parseFloat((bestSingleVendor.grandTotal - optimal.grandTotal).toFixed(2))
            : 0,
    };
}

// ─── Internal Cart Builders ───────────────────────────────────────────────────

function _buildSplitCart(items, vendorNames) {
    const vendorCarts = {};
    for (const v of vendorNames) vendorCarts[v] = { cropIds: [], subtotal: 0 };

    for (const item of items) {
        if (!item.offers.length) continue;
        const best = item.offers[0];
        vendorCarts[best.vendor].cropIds.push(item.cropId);
        vendorCarts[best.vendor].subtotal += best.price;
    }

    return _finalizeCart(vendorCarts, 'Optimal Split');
}

function _buildSingleVendorCart(items, vendor) {
    const cart = { cropIds: [], subtotal: 0, missing: [] };

    for (const item of items) {
        const offer = (item.vendors || {})[vendor];
        if (offer?.stock && offer.price > 0) {
            cart.cropIds.push(item.cropId);
            cart.subtotal += offer.price;
        } else {
            // Use cheapest available as price estimate even if not from this vendor
            const fallback = item.offers[0];
            if (fallback) {
                cart.cropIds.push(item.cropId);
                cart.subtotal += fallback.price;
                cart.missing.push(item.name);
            }
        }
    }

    if (!cart.cropIds.length) return null;

    const shipping = shippingCost(vendor, cart.subtotal);
    const cartUrl = buildCartUrl(vendor, cart.cropIds);

    return {
        label: `All from ${VENDOR_CONFIG[vendor].shortLabel}`,
        vendorCarts: {
            [vendor]: {
                cropIds: cart.cropIds,
                subtotal: parseFloat(cart.subtotal.toFixed(2)),
                shipping,
                total: parseFloat((cart.subtotal + shipping).toFixed(2)),
                cartUrl,
            }
        },
        grandTotal: parseFloat((cart.subtotal + shipping).toFixed(2)),
        vendorCount: 1,
        missingItems: cart.missing,
    };
}

function _buildTwoVendorCart(items, v1, v2) {
    const carts = { [v1]: { cropIds: [], subtotal: 0 }, [v2]: { cropIds: [], subtotal: 0 } };

    for (const item of items) {
        const o1 = (item.vendors || {})[v1];
        const o2 = (item.vendors || {})[v2];
        const p1 = (o1?.stock && o1.price > 0) ? o1.price : Infinity;
        const p2 = (o2?.stock && o2.price > 0) ? o2.price : Infinity;

        if (p1 === Infinity && p2 === Infinity) continue;
        const winner = p1 <= p2 ? v1 : v2;
        const price = Math.min(p1, p2);
        carts[winner].cropIds.push(item.cropId);
        carts[winner].subtotal += price;
    }

    let grandTotal = 0;
    const vendorCartsOut = {};
    let activeVendors = 0;

    for (const [vendor, cart] of Object.entries(carts)) {
        if (!cart.cropIds.length) continue;
        activeVendors++;
        const shipping = shippingCost(vendor, cart.subtotal);
        const total = cart.subtotal + shipping;
        grandTotal += total;
        vendorCartsOut[vendor] = {
            cropIds: cart.cropIds,
            subtotal: parseFloat(cart.subtotal.toFixed(2)),
            shipping,
            total: parseFloat(total.toFixed(2)),
            cartUrl: buildCartUrl(vendor, cart.cropIds),
        };
    }

    if (!activeVendors) return null;

    return {
        label: `Split: ${[v1, v2].filter(v => vendorCartsOut[v]).map(v => VENDOR_CONFIG[v].shortLabel).join(' + ')}`,
        vendorCarts: vendorCartsOut,
        grandTotal: parseFloat(grandTotal.toFixed(2)),
        vendorCount: activeVendors,
        missingItems: [],
    };
}

function _finalizeCart(vendorCarts, label) {
    let grandTotal = 0;
    const out = {};

    for (const [vendor, cart] of Object.entries(vendorCarts)) {
        if (!cart.cropIds.length) continue;
        const subtotal = parseFloat(cart.subtotal.toFixed(2));
        const shipping = shippingCost(vendor, subtotal);
        const total = parseFloat((subtotal + shipping).toFixed(2));
        grandTotal += total;
        out[vendor] = {
            cropIds: cart.cropIds,
            subtotal,
            shipping,
            total,
            cartUrl: buildCartUrl(vendor, cart.cropIds),
        };
    }

    return {
        label,
        vendorCarts: out,
        grandTotal: parseFloat(grandTotal.toFixed(2)),
        vendorCount: Object.keys(out).length,
        missingItems: [],
    };
}

function _combinations(arr, k) {
    const result = [];
    function combine(start, combo) {
        if (combo.length === k) { result.push([...combo]); return; }
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            combine(i + 1, combo);
            combo.pop();
        }
    }
    combine(0, []);
    return result;
}
