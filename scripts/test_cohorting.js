const successions = [
    { crop_name: 'Agretti', start_date: '2026-03-06' },
    { crop_name: 'Kohlrabi', start_date: null }, // The troublemaker
    { crop_name: 'Anemone', start_date: '2026-03-06T14:30:00Z' }, // Time attached to prove normalization
    { crop_name: 'Carrot', start_date: '2026-04-10' }
];

const withKey = successions.map(s => ({
    ...s,
    _dateKey: s.start_date ? s.start_date.slice(0, 10) : '__no_date__',
}));

const cohortMap = new Map();
withKey.forEach(s => {
    if (!cohortMap.has(s._dateKey)) {
        cohortMap.set(s._dateKey, []);
    }
    cohortMap.get(s._dateKey).push(s);
});

const sortedKeys = [...cohortMap.keys()].sort((a, b) => {
    if (a === '__no_date__') return 1;
    if (b === '__no_date__') return -1;
    return a.localeCompare(b);
});

console.log('--- COHORT VERIFICATION RESULTS ---');
sortedKeys.forEach(dateKey => {
    const cropsInCohort = cohortMap.get(dateKey).map(c => c.crop_name);
    console.log(`Cohort Date: [${dateKey}]`);
    console.log(`  └→ Crops grouped together: ${cropsInCohort.join(', ')}`);
});
console.log('-----------------------------------');
