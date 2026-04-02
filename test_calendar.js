const { calculatePlantsNeeded } = require('./src/services/homeGardenCalculator.js');
const { extractEvents } = require('./src/components/ActionCalendar.js'); // Cannot easily import React component logic, let's just test calculatePlantsNeeded
const cropsRaw = require('./src/data/crops.json').crops;

const tomato = cropsRaw.find(c => c.id === 'tomato_heirloom_beefsteak');
const kale = cropsRaw.find(c => c.id === 'kale_dinosaur');

function testCalculator() {
    // Mock the date object to be precisely March 30, 2026
    const RealDate = Date;
    global.Date = class extends RealDate {
        constructor(...args) {
            if (args.length) {
                super(...args);
            } else {
                super('2026-03-30T12:00:00Z');
            }
        }
    };
    
    // Test 1: Intolerant Crop (Tomato). Ideal seed start was Mar 1 (4 weeks ago). Ideal TP is Apr 12.
    // Today is March 30. (13 days until ideal TP). This is <= 21 days.
    // It should trigger recommendBuyStarts = true, and strict caveat.
    
    const gardenProfile = {
        last_frost_date: '2026-03-08', // TP date for tomato is last frost + 35 days (warmOffsetDays) = 2026-04-12.
        frost_free_days: 150,
        first_frost_date: '2026-11-01'
    };
    
    // warmOffset('Nightshade') is 35 days.
    // last_frost_date is March 8. March 8 + 35 days = April 12.
    // Today is March 30. Diff is exactly 13 days.
    
    console.log("--- Testing Tomato (Intolerant) ---");
    const resTomato = calculatePlantsNeeded(tomato, 4, gardenProfile);
    console.log("recommendBuyStarts:", resTomato.recommendBuyStarts);
    console.log("Caveat:", resTomato.lateStartCaveat);
    
    // Test 2: Tolerant crop. Let's make it a warm crop so it respects the same 35 day offset to easily test the logic limit.
    // cherry_tomato_sungold has late_transplant_tolerant = true.
    const cherryTomato = cropsRaw.find(c => c.id === 'cherry_tomato_sungold');
    console.log("\n--- Testing Cherry Tomato (Tolerant) ---");
    const resCherry = calculatePlantsNeeded(cherryTomato, 4, gardenProfile);
    console.log("recommendBuyStarts:", resCherry.recommendBuyStarts);
    console.log("Caveat:", resCherry.lateStartCaveat);

    // Assertions
    if (resTomato.recommendBuyStarts !== true) throw new Error("Tomato should recommend buy starts");
    if (!resTomato.lateStartCaveat.includes("Strongly suggest")) throw new Error("Tomato has wrong caveat");
    
    if (resCherry.recommendBuyStarts !== true) throw new Error("Cherry tomato should recommend buy starts");
    if (resCherry.lateStartCaveat.includes("Strongly suggest")) throw new Error("Cherry tomato has overly strict caveat");
    
    console.log("\n✅ All logic tests passed successfully.");
}

try {
    testCalculator();
} catch (e) {
    console.error("Test failed:", e);
    process.exit(1);
}
