const fs = require('fs');
const dbPath = './src/data/crops.json';
const db = JSON.parse(fs.readFileSync(dbPath));

const tpTargets = {
    'Bok Choy': { wks: 4, spacing: 6 },
    'Tatsoi':   { wks: 4, spacing: 6 },
    'Fennel':   { wks: 5, spacing: 8 },
    'Kohlrabi': { wks: 4, spacing: 6 },
    'Scallion': { wks: 6, spacing: 6 },
    'Swiss Chard': { wks: 4, spacing: 12 },
    'Collards': { wks: 4, spacing: 12 },
    'Kale':     { wks: 4, spacing: 12 },
    'Mustard':  { wks: 4, spacing: 8 },
    'Cabbage':  { wks: 4, spacing: 18 },
    'Broccoli': { wks: 4, spacing: 18 },
    'Cauliflower': { wks: 4, spacing: 18 },
    'Celery':   { wks: 8, spacing: 8 },
};

let modified = 0;
db.crops.forEach(c => {
    let t = null;
    
    // Fix Kale's Biennial bug
    if (c.seed_type && c.seed_type.toLowerCase() === 'biennial') {
        c.seed_type = 'DS'; // Will be overridden to TP underneath if it's Kale
        modified++;
    }

    if (tpTargets[c.name]) t = tpTargets[c.name];
    else if (c.name.includes('Lettuce') && !c.name.includes('Leaf') && !c.name.includes('Mix')) t = {wks: 4, spacing: 8};
    else if (c.name.includes('Kale')) t = tpTargets['Kale'];
    else if (c.name.includes('Bok Choy') || c.name.includes('Tatsoi') || c.name.includes('Choi')) t = tpTargets['Bok Choy'];
    
    if (t) {
        if (c.seed_type !== 'TP') {
            c.seed_type = 'TP';
            modified++;
        }
        if (c.seed_start_weeks_before_transplant !== t.wks) {
            c.seed_start_weeks_before_transplant = t.wks;
            modified++;
        }
        if (!c.in_row_spacing_in || c.in_row_spacing_in < t.spacing) {
            c.in_row_spacing_in = t.spacing;
            modified++;
        }
        if (c.seed_oz_per_100ft) {
            c.seed_oz_per_100ft = null;
            modified++;
        }
    }
});
console.log(`Successfully processed. Modifications made: ${modified}`);
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
