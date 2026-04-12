#!/usr/bin/env python3
import json
import sys
from pathlib import Path

CROPS_FILE = Path(__file__).parent.parent / "src" / "data" / "crops.json"

# Base configuration for the new frilly mustards
MUSTARD_BASE = {
    "category": "Brassica",
    "emoji": "🥬",
    "dtm": 45,
    "harvest_window_days": 15,
    "seed_type": "DS",
    "season": "cool",
    "min_frost_free_days": 21,
    "max_temp_f": 75,
    "rows_per_30in_bed": 4,
    "in_row_spacing_in": 4,
    "row_spacing_in": 6,
    "seed_oz_per_100ft": 0.5,
    "loss_buffer_pct": 15,
    "yield_lbs_per_100ft": 70,
    "yield_unit": "lbs",
    "wholesale_price_per_lb": 8,
    "organic_premium_pct": 30,
    "feed_class": "light",
    "rotation_cannot_follow": ["brassica"],
    "rotation_prefers_after": ["legume", "cover_crop"],
    "interplant_compatible": ["radish", "spinach"],
    "harvest_count": 3,
    "harvest_frequency": "Weekly",
    "harvest_method": "Scissor harvest",
    "harvest_expectation": "70 lbs per 100ft",
    "frost_tolerant": True,
    "hard_frost": False,
    "germination_rate_pct": 0.85,
    "planting_method": "Direct Seed",
}

NEW_MUSTARDS = [
    {
        **MUSTARD_BASE,
        "id": "mustard_golden_frills",
        "name": "Mustard",
        "variety": "Golden Frills",
        "notes": "Highly serrated light-green leaves. Excellent loft for salad mixes. Moderately spicy flavor but mellows when cooked or mixed.",
    },
    {
        **MUSTARD_BASE,
        "id": "mustard_miz_america",
        "name": "Mustard",
        "variety": "Miz America",
        "dtm": 40,
        "notes": "Deep maroon-red leaves on both sides. Uniform leaf shape perfect for bunching or baby leaf. Mild mustard flavor.",
    },
    {
        **MUSTARD_BASE,
        "id": "mustard_purple_frills",
        "name": "Mustard",
        "variety": "Purple Frills",
        "notes": "Dark purple, deeply fringed leaves with a classic spicy mustard bite. Great color contrast in salad bags.",
    }
]

def patch_mustards():
    with open(CROPS_FILE, "r") as f:
        data = json.load(f)
        
    crops = data["crops"]
    existing_ids = {c["id"] for c in crops}
    
    modified_count = 0
    added_count = 0
    
    for c in crops:
        # Lower HW for standard mustards
        if c["id"] in ["mustard_red_giant", "mustard_purple_osaka", "mustard_green_wave"]:
            print(f"Modifying {c['id']}: HW {c.get('harvest_window_days')} -> 15")
            c["harvest_window_days"] = 15
            modified_count += 1
            
        # Lower HW for cover crop mustard
        if c["id"] == "cover_crop_field_mustard":
            print(f"Modifying {c['id']}: HW {c.get('harvest_window_days')} -> 14")
            c["harvest_window_days"] = 14
            modified_count += 1
            
        # Adjust seed mustard
        if c["id"] == "mustard_seed":
            print(f"Modifying {c['id']}: DTM {c.get('dtm')} -> 75, HW {c.get('harvest_window_days')} -> 21")
            c["dtm"] = 75
            c["harvest_window_days"] = 21
            modified_count += 1
            
    for nm in NEW_MUSTARDS:
        if nm["id"] not in existing_ids:
            print(f"Adding new crop: {nm['id']}")
            crops.append(nm)
            added_count += 1
            
    with open(CROPS_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    # LOGICAL VERIFICATION
    print("\n--- LOGICAL VERIFICATION: MUSTARD IGD REPORT ---")
    mustards = [c for c in crops if 'mustard' in c['id']]
    for m in mustards:
        dtm = m.get('dtm', 0)
        hw = m.get('harvest_window_days', 0)
        igd = dtm + hw
        status = "✅ PASS" if igd <= 100 else "❌ FAIL"
        print(f"{status} | {m['id']}: DTM={dtm} + HW={hw} => IGD={igd}")

if __name__ == "__main__":
    patch_mustards()
