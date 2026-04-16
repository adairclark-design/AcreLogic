import { useState, useEffect } from 'react';
import { generateCategoricalPricing } from './seedProcurementService';
import cropDbRaw from '../data/crops.json';

// Singleton cache to survive remounts
let globalPriceCache = null;
const listeners = new Set();

const ALL_SEED_LIST = cropDbRaw.crops.map(c => ({
    cropId: c.id,
    name: c.variety && c.variety !== 'Primary' ? `${c.name} ${c.variety}` : c.name,
    emoji: c.emoji || '🌱',
    category: c.category,
    reqType: 'seeds'
}));

function notify() {
    for (const listener of listeners) listener(globalPriceCache);
}

/** Compute lowestPrice and merge a batch of price items into cacheMap */
function _mergePrices(prices, nameToId, cacheMap) {
    for (const item of prices) {
        let minPrice = Infinity;
        for (const vParams of Object.values(item.vendors)) {
            if (vParams.stock && vParams.price > 0 && vParams.price < minPrice) {
                minPrice = vParams.price;
            }
        }
        item.lowestPrice = minPrice === Infinity ? null : minPrice;
        const trueId = nameToId[item.name] || item.cropId;
        item.cropId = trueId;
        cacheMap[trueId] = item;
    }
}

export function hydrateSeedPrices() {
    if (globalPriceCache) return globalPriceCache;

    console.log('[SeedPriceStore] Hydrating global categorical prices synchronously...');
    
    // Only price real crops (ignore Cover Crops bulk sizing)
    const allTarget = ALL_SEED_LIST.filter(c => c.category !== 'Cover Crop');
    
    // Build lookup dictionary
    const nameToId = {};
    for (const c of allTarget) nameToId[c.name] = c.cropId;

    // Generate math-based approximations instantly
    const prices = generateCategoricalPricing(allTarget);
    
    const cacheMap = {};
    _mergePrices(prices, nameToId, cacheMap);

    globalPriceCache = cacheMap;
    notify();
    return globalPriceCache;
}

export function useSeedPrices() {
    const [prices, setPrices] = useState(globalPriceCache);

    useEffect(() => {
        listeners.add(setPrices);
        if (!globalPriceCache) {
            hydrateSeedPrices();
        }
        return () => listeners.delete(setPrices);
    }, []);

    return prices;
}
