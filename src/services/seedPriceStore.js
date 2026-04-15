import { useState, useEffect } from 'react';
import { fetchVendorPrices, buildMockPriceData } from './seedProcurementService';
import cropDbRaw from '../data/crops.json';

// Singleton cache to survive remounts
let globalPriceCache = null;
let fetchPromise = null;
const listeners = new Set();

const ALL_SEED_LIST = cropDbRaw.crops.map(c => ({
    cropId: c.id,
    name: c.variety || c.name,
    emoji: c.emoji || '🌱',
    category: c.category,
    reqType: 'seeds'
}));

function notify() {
    for (const listener of listeners) listener(globalPriceCache);
}

export async function hydrateSeedPrices() {
    if (globalPriceCache) return globalPriceCache;
    if (fetchPromise) return fetchPromise;

    fetchPromise = (async () => {
        try {
            console.log('[SeedPriceStore] Hydrating global price cache...');
            // Exclude cover crops from standard pricing since vendors usually sell in huge bulk
            const targetList = ALL_SEED_LIST.filter(c => c.category !== 'Cover Crop').slice(0, 60); // Max 60 per request per API limit
            const prices = await fetchVendorPrices(targetList);
            
            // Create dictionary mapping query names back to original crop.ids 
            const nameToId = {};
            for (const c of targetList) {
                // Extract directly from the ALL_SEED_LIST mapped shape
                nameToId[c.name] = c.cropId;
            }

            // Convert array output into a keyed map for O(1) lookup using true cropId
            const cacheMap = {};
            for (const item of prices) {
                // Determine lowest price
                let minPrice = Infinity;
                for (const vParams of Object.values(item.vendors)) {
                    if (vParams.stock && vParams.price > 0 && vParams.price < minPrice) {
                        minPrice = vParams.price;
                    }
                }
                item.lowestPrice = minPrice === Infinity ? null : minPrice;
                
                const trueId = nameToId[item.variety] || item.cropId;
                item.cropId = trueId; // Align inner object ID
                cacheMap[trueId] = item;
            }
            
            globalPriceCache = cacheMap;
            notify();
            return cacheMap;
        } catch (err) {
            console.warn('[SeedPriceStore] Global hydration failed, falling back to mock prices', err);
            // Fallback to mock logic if Railway worker is down
            const mockPrices = buildMockPriceData(ALL_SEED_LIST);
            const cacheMap = {};
            for (const item of mockPrices) {
                let minPrice = Infinity;
                for (const vParams of Object.values(item.vendors)) {
                    if (vParams.stock && vParams.price > 0 && vParams.price < minPrice) {
                        minPrice = vParams.price;
                    }
                }
                item.lowestPrice = minPrice === Infinity ? null : minPrice;
                cacheMap[item.cropId] = item;
            }
            globalPriceCache = cacheMap;
            notify();
            return cacheMap;
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
