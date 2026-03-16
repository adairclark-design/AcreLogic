/**
 * AcreLogic AI Advisor Service
 * ==============================
 * Calls the /ai-advisor endpoint on the AcreLogic Cloudflare Worker.
 * Sends conversation history + farm context to Gemini 1.5 Flash.
 */

export const CLIMATE_WORKER_URL = 'https://acrelogic-climate-worker.adair-clark.workers.dev';

// ─ Demo-mode fallback ─ used when the Worker /ai-advisor endpoint isn't deployed yet
// Matches keywords in the last user message and returns a helpful farming reply.
function demoFallback(messages = []) {
    const last = (messages.slice().reverse().find(m => m.role === 'user')?.content ?? '').toLowerCase();
    if (/pest|bug|insect|aphid|caterpillar|worm|flea beetle/.test(last))
        return `Great question on pest management! For most vegetable crops, start with weekly scouting — look under leaves for eggs and early damage. Row cover is your best preventative. For aphids, a strong blast of water knocks them off; insecticidal soap handles heavier infestations. Flea beetles love brassicas — succession planting past June usually avoids the worst pressure. Would you like a scouting schedule for any specific crop?`;
    if (/soil|compost|fertility|nitrogen|amendment/.test(last))
        return `Healthy soil is everything. Before planting, aim for 3–4" of finished compost worked in. For nitrogen: blood meal is fast (3-4 weeks), feather meal slower but longer lasting. A soil test every 2 years is worth the $25 — Oregon State Extension Lab is excellent. Cover crops like winter rye + hairy vetch in fall add N and organic matter simultaneously. Which section of the farm are you working on?`;
    if (/water|irrigat|drip|sprinkler/.test(last))
        return `Drip irrigation is the gold standard for market gardens — it keeps foliage dry (reducing disease) and delivers water exactly where roots are. A simple timer + pressure regulator setup runs ~$150 for 8 beds.  Most greens need 1" per week; fruiting crops (tomatoes, cucumbers) need 1.5–2" once fruiting starts. Would you like help sizing a drip layout?`;
    if (/succession|planting|schedule|timing|when/.test(last))
        return `Succession planting is the key to a steady harvest window. For greens like arugula and lettuce, seed every 2–3 weeks from March through September. For beans, every 3 weeks May–July. The goal is overlapping harvest windows so you're never flooded or short. Your Crop Calendar tab shows exactly when each bed comes available — are you trying to time a specific crop?`;
    if (/csa|share|box|member|delivery/.test(last))
        return `A solid CSA box needs variety across 5 categories: something root, something green, an herb or allium, a fruit vegetable (tomato, cucumber, zucchini), and a specialty item. Aim for 8–12 lbs total per share. During shoulder seasons (spring, fall) greens carry the box — build successions of lettuce, arugula, spinach, and kale to always have something harvesting. Want help planning a specific delivery week?`;
    if (/cover crop|overwintering|winter/.test(last))
        return `Cover crops are one of the highest-ROI things you can do for a market garden. Winter rye + hairy vetch mix is the workhorse: sow by mid-September in Zone 8, it'll establish before freeze, fix nitrogen through winter, and you terminate it in April with a few passes of a broadfork. Let it grow too long and it's a beast to till — aim to terminate when hairy vetch is in early flower. DTM to termination: ~210 days from September sow.`;
    if (/price|revenue|profit|sell|market|wholesale/.test(last))
        return `For a market garden, greens carry the highest revenue per bed-foot: arugula and lettuce at $5–7/lb wholesale, salad mix up to $10. Tomatoes and cucumbers are lower per lb but high total volume. The sweet spot for CSA profitability is usually a mix of 40% high-value greens/herbs, 40% staple vegetables, 20% specialty. Your Yield & Revenue tab estimates this per bed — have you had a chance to review those projections?`;
    // Generic farming answer
    return `That’s a great farming question! While my full AI reasoning is warming up, here’s what I can share: the best decisions on a market garden come from close observation — weekly bed walks noting germination rates, pest pressure, and growth stages will tell you more than any chart. Is there a specific crop or challenge you’d like to dig into? I can give more targeted advice once you tell me more about what you’re seeing.`;
}

/**
 * Send a message to the AI advisor and get a response.
 *
 * @param {Array}  messages     - Full conversation history: [{ role: 'user'|'assistant', content: string }]
 * @param {Object} farmContext  - { farmProfile, selectedCrops, bedSuccessions, bedCount }
 * @returns {Promise<string>}   - The assistant's reply text
 */
export async function askAdvisor(messages, farmContext = {}) {
    const url = `${CLIMATE_WORKER_URL}/ai-advisor`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, farmContext }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            // If it's a 404/501, the endpoint isn't deployed — use demo fallback silently
            if (response.status === 404 || response.status === 501 || response.status === 503) {
                return demoFallback(messages);
            }
            throw new Error(err.error ?? `AI advisor error ${response.status}`);
        }

        const data = await response.json();
        return data.reply ?? 'Sorry, I could not get a response. Please try again.';
    } catch (err) {
        // Network error or worker not deployed — fall back to demo mode
        console.warn('[AIAdvisor] Backend unavailable, using demo mode:', err.message);
        return demoFallback(messages);
    }
}

/**
 * Suggested starter questions shown when chat opens.
 * Personalized based on what crops/beds the user has.
 */
export function getStarterQuestions(farmContext = {}) {
    const { selectedCrops = [], farmProfile = {} } = farmContext;
    const hasCrops = selectedCrops.length > 0;
    const location = farmProfile.address ?? null;

    const base = [
        'What should I plant first this season?',
        'How do I maximize my bed yield?',
        'What pests should I watch for right now?',
        'How do I improve my soil between crops?',
    ];

    const contextual = [];
    if (hasCrops && selectedCrops.includes('Arugula')) {
        contextual.push('When should I start my first arugula succession?');
    }
    if (hasCrops && selectedCrops.some(c => ['Tomato', 'Cucumber', 'Zucchini'].includes(c))) {
        contextual.push('When should I start my tomatoes/cucumbers indoors?');
    }
    if (hasCrops && selectedCrops.includes('Green Beans')) {
        contextual.push('How many bean successions can I fit in my season?');
    }
    if (location) {
        contextual.push(`What crops grow best near ${location.split(',')[0]}?`);
    }

    // Return up to 4: contextual first, then base
    return [...contextual, ...base].slice(0, 4);
}

/**
 * Generate a full 8-bed CSA plan using AI.
 * @param {object} farmProfile
 * @param {number} memberCount - number of CSA members
 * @param {Array}  availableCrops - array of { name, dtm, price, yield_lbs } from crop DB
 * @returns {Promise<{plan: {beds: Array, csa_notes: string}}>}
 */
export async function callAiPlanGenerator(farmProfile, memberCount, availableCrops = []) {
    const url = `${CLIMATE_WORKER_URL}/ai-plan-generator`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmProfile, memberCount, availableCrops }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? `Plan generator error ${response.status}`);
    }
    const data = await response.json();
    return data.plan;
}

/**
 * Send a photo to Gemini Vision for plant pest/disease diagnosis.
 * @param {string} imageBase64 - base64-encoded image (no data: prefix)
 * @param {string} mimeType    - e.g. 'image/jpeg'
 * @param {object} farmContext - { cropNames, location, farmProfile }
 * @returns {Promise<string>} diagnosis text
 */
export async function askAdvisorWithImage(imageBase64, mimeType = 'image/jpeg', farmContext = {}) {
    const url = `${CLIMATE_WORKER_URL}/ai-vision`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, farmContext }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? `Vision error ${response.status}`);
    }
    const data = await response.json();
    return data.diagnosis ?? 'No diagnosis available';
}
