import { getSuccessionCandidatesRanked, scoreCrop } from './src/services/successionEngine.js';
import { getCropById } from './src/services/database.js';

const farmProfile = {
    lat: 45.5,
    first_frost_date: '2026-10-30',
    last_frost_date: '2026-04-02',
    frost_free_days: 210
};

const bedState = {
    successions: [
        { start_date: '2026-05-01', end_date: '2026-11-05' }
    ]
};

async function test() {
    const crop = await getCropById('radicchio_rossa');
    const scored = await getSuccessionCandidatesRanked(bedState, farmProfile, { maxResults: 100 });
    const radicchio = scored.find(s => s.crop.id === 'radicchio_rossa');
    console.log(JSON.stringify(radicchio, null, 2));
}

test();
