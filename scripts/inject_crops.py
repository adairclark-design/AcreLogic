import os
import json
import re
import shutil
import unicodedata

BRAIN_DIR = "/Users/adairclark/.gemini/antigravity/brain/40cbdc6f-7ecc-41d1-8a28-95c399e3ab9c"
ACRE_LOGIC_DIR = "/Users/adairclark/Desktop/AntiGravity/AcreLogic"
CROPS_JSON_PATH = os.path.join(ACRE_LOGIC_DIR, "src/data/crops.json")
CROP_IMAGES_PATH = os.path.join(ACRE_LOGIC_DIR, "src/data/cropImages.js")
ASSETS_DIR = os.path.join(ACRE_LOGIC_DIR, "assets/crops")

def slugify(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^\w\s-]', '', value).strip().lower()
    return re.sub(r'[-\s]+', '_', value)

def run():
    walkthrough_path = os.path.join(BRAIN_DIR, "walkthrough.md")
    with open(walkthrough_path, "r") as f:
        content = f.read()

    pattern = r'!\[([^\]]+)\]\(([^)]+\.png)\)'
    matches = re.findall(pattern, content)

    with open(CROPS_JSON_PATH, "r") as f:
        crops_db = json.load(f)

    # Note: Using known reliable IDs from crops.json
    base_tomato = next((c for c in crops_db["crops"] if c.get("id") == "tomato_heirloom_beefsteak"), None)
    base_chicory = next((c for c in crops_db["crops"] if c.get("id") == "chicory_catalogna"), None)

    if not base_tomato or not base_chicory:
        print("Base models not found! Exiting.")
        return

    new_require_statements = []

    for name, orig_path in matches:
        is_tomato = "tomato" in name.lower()
        clean_id = slugify(name)

        if any(c.get("id") == clean_id for c in crops_db["crops"]):
            print(f"Skipping {clean_id}, already exists in crops.json.")
            continue
            
        print(f"Processing: {name} -> {clean_id}")

        import copy
        base_obj = copy.deepcopy(base_tomato if is_tomato else base_chicory)
        base_obj["id"] = clean_id
        
        # Determine Name and Variety
        if " " in name:
            kind, variety = name.split(" ", 1)
            base_obj["name"] = kind.strip()
            base_obj["variety"] = variety.strip()
        else:
            base_obj["name"] = name.strip()
            base_obj["variety"] = "Standard"

        crops_db["crops"].append(base_obj)

        file_name = clean_id + ".png"
        new_asset_path = os.path.join(ASSETS_DIR, file_name)
        if os.path.exists(orig_path):
            shutil.copy2(orig_path, new_asset_path)
        else:
            print(f"Warning: Image not found at {orig_path}")
        
        new_require_statements.append(f"  '{clean_id}': require('../../assets/crops/{file_name}'),")

    # Update crops.json
    with open(CROPS_JSON_PATH, "w") as f:
        json.dump(crops_db, f, indent=4)
        print("Updated crops.json.")
        
    # Update cropImages.js
    with open(CROP_IMAGES_PATH, "r") as f:
        js_content = f.read()

    target_str = "// ── Generic ID aliases (match crops.json ids) ──────────────────────────"
    insert_str = "\n".join(new_require_statements) + "\n\n  " + target_str
    
    if target_str in js_content:
        js_content = js_content.replace(target_str, insert_str)
        with open(CROP_IMAGES_PATH, "w") as f:
            f.write(js_content)
        print("Updated cropImages.js.")
    else:
        print("Target string not found in cropImages.js!")

if __name__ == "__main__":
    run()
