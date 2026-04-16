import { useState, useEffect } from 'react';
import { fetchVendorPrices } from './seedProcurementService';
import cropDbRaw from '../data/crops.json';

// Singleton cache to survive remounts
let globalPriceCache = null;
let fetchPromise = null;
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

const BATCH_SIZE = 60;

export async function hydrateSeedPrices() {
    if (globalPriceCache) return globalPriceCache;
    if (fetchPromise) return fetchPromise;

    fetchPromise = (async () => {
        try {
            console.log('[SeedPriceStore] Hydrating global price cache (batched)...');
            const allTarget = ALL_SEED_LIST.filter(c => c.category !== 'Cover Crop');

            // Build nameToId for full list
            const nameToId = {};
            for (const c of allTarget) nameToId[c.name] = c.cropId;

            // Split into batches of BATCH_SIZE
            const batches = [];
            for (let i = 0; i < allTarget.length; i += BATCH_SIZE) {
                batches.push(allTarget.slice(i, i + BATCH_SIZE));
            }

            // Start with empty cache so subscribers see N/A while batches load
            globalPriceCache = {};

            // Fire all batches in parallel; notify UI as each resolves
            await Promise.all(batches.map(async (batch) => {
                try {
                    const prices = await fetchVendorPrices(batch);
                    _mergePrices(prices, nameToId, globalPriceCache);
                } catch (batchErr) {
                    console.warn(`[SeedPriceStore] Batch failed, logging N/A:`, batchErr);
                    // Simply leave the cache items out so they show as N/A
                }
                notify();
            }));

            return globalPriceCache;
        } catch (err) {
            console.warn('[SeedPriceStore] Hydration failed entirely', err);
            // Don't fall back to mocks, leave globalPriceCache empty
            globalPriceCache = {};
            notify();
            return globalPriceCache;
        } finally {
            fetchPromise = null;
        }
    })();
    return fetchPromise;
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
