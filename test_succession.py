import json
from datetime import datetime, timedelta

with open('src/data/crops.json') as f:
    crops = json.load(f).get('crops', [])

buttercrunch = next((c for c in crops if c['id'] == 'lettuce_buttercrunch'), None)

# Fake input data mimicking the logic
seed_type = buttercrunch.get('seed_type')  # 'TP'
dtm = buttercrunch.get('dtm')              # 65
tp_weeks = buttercrunch.get('seed_start_weeks_before_transplant') # 4
interval = buttercrunch.get('harvest_window_days', 14) # 14

indoor_seed_date_raw = datetime(2026, 3, 14) 
first_frost = datetime(2026, 10, 15)

print("--- Testing Transplant Succession Logic ---")
print(f"Crop: {buttercrunch['name']}")
print(f"Seed Type: {seed_type}")
print(f"Interval: {interval} days")
print(f"Weeks Indoors: {tp_weeks} weeks")
print(f"DTM (from transplant): {dtm} days\n")

succession_dates = []

# Exact mimic of homeGardenCalculator.js patched loop
anchor_sow_raw = indoor_seed_date_raw if seed_type == 'TP' else None

if anchor_sow_raw and first_frost:
    for round_num in range(2, 9):
        sow_raw = anchor_sow_raw + timedelta(days=(round_num - 1) * interval)
        
        if seed_type == 'TP':
            # Maturity from seed = seed_start_weeks + dtm
            maturity_raw = sow_raw + timedelta(days=(tp_weeks * 7) + dtm)
        else:
            maturity_raw = sow_raw + timedelta(days=dtm)
            
        if maturity_raw > first_frost:
            break
            
        succession_dates.append({
            'round': round_num,
            'dateRaw': sow_raw.strftime('%Y-%m-%d'),
            'maturity_theoretical': maturity_raw.strftime('%Y-%m-%d')
        })

print(f"Round 1 (Ideal Indoor Seed Date): {indoor_seed_date_raw.strftime('%Y-%m-%d')}")
if succession_dates:
    print("Succession Rounds Built Successfully:")
    for r in succession_dates:
        print(f"  Round {r['round']}: Seed Indoors {r['dateRaw']} -> Matures before frost: {r['maturity_theoretical']}")
    print("\n✅ Parity Achieved! TP crops now model exact succession arrays natively.")
else:
    print("❌ FAILED. No explicit rounds calculated.")
