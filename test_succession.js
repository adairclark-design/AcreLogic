const { calculatePlantsNeeded } = require('./src/services/homeGardenCalculator.js');
const cropsRaw = require('./src/data/crops.json').crops;

function verifyTPSuccession() {
    // Force date to March 1, 2026
    const RealDate = Date;
    global.Date = class extends RealDate {
        constructor(...args) {
            if (args.length) super(...args);
            else super('2026-03-01T12:00:00Z');
        }
    };
    
    // Pick Buttercrunch Lettuce (TP crop)
    const buttercrunch = cropsRaw.find(c => c.id === 'lettuce_buttercrunch');
    
    // A standard garden profile with 150 frost-free days
    const gardenProfile = {
        last_frost_date: '2026-04-15',   // Mid-April
        first_frost_date: '2026-10-15',  // Mid-October
        frost_free_days: 180
    };
    
    console.log("--- Testing Transplant Succession Logic ---");
    console.log(`Crop: ${buttercrunch.name}`);
    console.log(`Seed Type: ${buttercrunch.seed_type}`);
    console.log(`Interval: ${buttercrunch.harvest_window_days} days`);
    console.log(`Weeks Indoors: ${buttercrunch.seed_start_weeks_before_transplant} weeks`);
    console.log(`DTM (from transplant): ${buttercrunch.dtm} days\n`);

    const result = calculatePlantsNeeded(buttercrunch, 4, gardenProfile);
    
    console.log(`Round 1 (Ideal Indoor Seed Date): ${result.indoorSeedDate}`);
    if (result.successionDates && result.successionDates.length > 0) {
        console.log("Succession Rounds Built Successfully:");
        result.successionDates.forEach(r => {
            console.log(`  Round ${r.round}: ${r.dateRaw}`);
        });
        console.log("\n✅ Parity Achieved! TP crops now model succession arrays natively.");
    } else {
        console.log("❌ FAILED. No explicit rounds calculated.");
        process.exit(1);
    }
}

try {
    verifyTPSuccession();
} catch (e) {
    console.error(e);
    process.exit(1);
}
