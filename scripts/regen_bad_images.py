#!/usr/bin/env python3
"""
Regenerate bad crop images.
Uses Google Imagen first (free), then falls back to DALL-E 3 (OpenAI) when
Imagen daily quotas are exhausted.

Usage:
    python3 scripts/regen_bad_images.py

Add crops to BAD_CROPS as you find more bad images in the app.
"""
import os, pathlib, json, time, sys, urllib.request

# ── Load API keys ─────────────────────────────────────────────────────────────
def load_keys():
    """Load API keys, stopping at first valid value found per key (nearest .env wins)."""
    keys = {}
    search_dirs = [
        pathlib.Path(__file__).parent.parent,  # AcreLogic/
        pathlib.Path(__file__).parent.parent.parent,  # AntiGravity/
    ] + list(pathlib.Path(__file__).parents)[:5]

    for p in search_dirs:
        env_file = p / '.env'
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    # Only set if not already found AND value looks real (not a placeholder)
                    if k not in keys and v and 'your' not in v.lower() and 'placeholder' not in v.lower():
                        keys[k] = v

    return keys

KEYS = load_keys()
GEMINI_API_KEY = KEYS.get('GEMINI_API_KEY', '')
OPENAI_API_KEY = KEYS.get('OPENAI_API_KEY', '')

if not GEMINI_API_KEY and not OPENAI_API_KEY:
    print("ERROR: No API keys found (GEMINI_API_KEY or OPENAI_API_KEY)")
    sys.exit(1)

# ── Setup clients ─────────────────────────────────────────────────────────────
genai_client = None
openai_client = None

if GEMINI_API_KEY:
    try:
        from google import genai
        from google.genai import types as genai_types
        genai_client = genai.Client(api_key=GEMINI_API_KEY)
        print("✓ Google Imagen ready (primary)")
    except Exception as e:
        print(f"⚠ Google Imagen unavailable: {e}")

if OPENAI_API_KEY:
    try:
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        print("✓ DALL-E 3 ready (fallback)")
    except Exception as e:
        print(f"⚠ OpenAI unavailable: {e}")

# ── Imagen setup ──────────────────────────────────────────────────────────────
IMAGEN_MODELS = [
    'imagen-4.0-fast-generate-001',
    'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001',
]
_imagen_model_idx = 0
_imagen_all_exhausted = False

# ── Output directory ──────────────────────────────────────────────────────────
CROPS_DIR = pathlib.Path(__file__).parent.parent / 'public' / 'crops'
CROPS_DIR.mkdir(parents=True, exist_ok=True)

# ── Prompt builder ────────────────────────────────────────────────────────────
def make_prompt(crop_name: str) -> str:
    return (
        f"Professional photorealistic close-up photograph of {crop_name} plant on a clean white or very light neutral background. "
        f"Show the actual plant clearly — its leaves, stems, flowers, fruit, roots, or vegetables as botanically accurate. "
        f"Style: clean botanical product photography, bright even studio lighting, sharp focus, pure white or pale background. "
        f"NO dark backgrounds, NO dramatic lighting, NO cinematic style, NO fantasy art, NO hands, NO people, NO cameras, "
        f"NO objects other than the plant, NO text, NO abstract imagery, NO frames or borders. "
        f"Only the {crop_name} plant itself, crisp and detailed, centered in frame, white background."
    )

# ── Imagen generator ──────────────────────────────────────────────────────────
def try_imagen(crop_name: str, output_path: pathlib.Path) -> bool:
    global _imagen_model_idx, _imagen_all_exhausted

    if _imagen_all_exhausted or not genai_client:
        return False

    while _imagen_model_idx < len(IMAGEN_MODELS):
        model = IMAGEN_MODELS[_imagen_model_idx]
        try:
            result = genai_client.models.generate_images(
                model=model,
                prompt=make_prompt(crop_name),
                config=genai_types.GenerateImagesConfig(number_of_images=1, aspect_ratio="1:1"),
            )
            img_bytes = result.generated_images[0].image.image_bytes
            output_path.write_bytes(img_bytes)
            return True
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err or "quota" in err.lower():
                print(f"    ⚠ Imagen model {model} quota exhausted — trying next model")
                _imagen_model_idx += 1
            else:
                print(f"    ⚠ Imagen error: {err[:100]}")
                return False

    _imagen_all_exhausted = True
    print("    ⚠ All Imagen quotas exhausted — switching to DALL-E 3")
    return False

# ── DALL-E 3 generator ────────────────────────────────────────────────────────
def try_dalle(crop_name: str, output_path: pathlib.Path) -> bool:
    if not openai_client:
        print("    ✗ No OpenAI key configured")
        return False
    try:
        response = openai_client.images.generate(
            model="dall-e-3",
            prompt=make_prompt(crop_name),
            n=1,
            size="1024x1024",
            quality="standard",
            response_format="b64_json",  # Bytes in response — no SSL download needed
        )
        import base64
        img_bytes = base64.b64decode(response.data[0].b64_json)
        output_path.write_bytes(img_bytes)
        return True
    except Exception as e:
        print(f"    ✗ DALL-E 3 error: {e}")
        return False

# ── Main generator (Imagen → DALL-E 3) ───────────────────────────────────────
def generate_image(crop_name: str, output_path: pathlib.Path) -> bool:
    # Try Imagen first (free)
    if not _imagen_all_exhausted and genai_client:
        if try_imagen(crop_name, output_path):
            return True

    # Fall back to DALL-E 3
    if openai_client:
        print(f"    🔄 Using DALL-E 3 for {crop_name}")
        return try_dalle(crop_name, output_path)

    return False

# ── BAD CROPS LIST (confirmed by user visual audit on 2026-03-18) ─────────────
BAD_CROPS = [
    # === Previously fixed (wrong images) ===
    ("alyssum",            "Alyssum"),
    ("ammobium",           "Ammobium"),
    ("anise_hyssop",       "Anise Hyssop"),
    ("artichoke",          "Globe Artichoke"),
    ("asclepias",          "Asclepias (Butterfly Weed)"),
    ("atriplex",           "Atriplex (Orache)"),
    ("belgian_endive",     "Belgian Endive"),
    ("bupleurum",          "Bupleurum"),
    ("chinese_cabbage",    "Chinese Cabbage"),
    ("clarkia",            "Clarkia"),
    ("cornelian_cherry",   "Cornelian Cherry"),
    ("cornflower",         "Cornflower"),
    ("craspedia",          "Craspedia (Billy Buttons)"),
    ("crocus",             "Crocus"),
    ("cynoglossum",        "Cynoglossum (Chinese Forget-Me-Not)"),
    ("dandelion_greens",   "Dandelion"),
    ("digitalis",          "Digitalis (Foxglove)"),
    ("eryngium",           "Eryngium (Sea Holly)"),
    ("fris_e",             "Frisée"),
    ("ginseng",            "Ginseng"),
    ("gomphrena",          "Gomphrena (Globe Amaranth)"),
    ("hairy_vetch",        "Hairy Vetch"),
    ("hollyhock",          "Hollyhock"),
    ("kalettes",           "Kalettes (Flower Sprouts)"),
    ("licorice_root",      "Licorice Root"),
    ("mashua",             "Mashua"),
    ("orlaya",             "Orlaya (White Lace Flower)"),
    ("phacelia",           "Phacelia"),
    ("portulaca",          "Portulaca (Moss Rose)"),
    ("quinoa_brightest",   "Quinoa"),
    ("saffron_crocus",     "Saffron Crocus"),
    ("saponaria",          "Saponaria (Soapwort)"),
    ("sea_buckthorn",      "Sea Buckthorn"),
    ("ulluco",             "Ulluco"),
    ("yacon",              "Yacon"),
    # === Never generated — blank white boxes in live app ===
    ("tiger_nut",                "Tiger Nut"),
    ("lotus_root",               "Lotus Root"),
    ("water_chestnut",           "Water Chestnut"),
    ("wasabi",                   "Wasabi plant"),
    ("wakame",                   "Wakame seaweed"),
    ("glasswort",                "Glasswort"),
    ("skirret",                  "Skirret"),
    ("good_king_henry",          "Good King Henry"),
    ("nine_star_broccoli",       "Nine Star Broccoli"),
    ("perennial_kale",           "Perennial Kale"),
    ("walking_onion",            "Walking Onion (Egyptian Onion)"),
    ("welsh_onion",              "Welsh Onion"),
    ("japanese_bunching_onion",  "Japanese Bunching Onion"),
    ("potato_onion",             "Potato Onion"),
    ("rocambole_garlic",         "Rocambole Garlic"),
    ("elephant_garlic",          "Elephant Garlic"),
    ("garlic_chives",            "Garlic Chives"),
    ("shallot",                  "Shallot"),
    ("pickling_onion",           "Pickling Onion"),
    ("torpedo_onion",            "Torpedo Onion"),
    ("sweet_onion",              "Sweet Onion"),
    ("samphire",                 "Rock Samphire (Sea Fennel)"),
    ("sea_purslane",             "Sea Purslane"),
    ("agretti",                  "Agretti (Monk's Beard)"),
    ("collards_champion",        "Collard Greens"),
    ("parsley_root",             "Hamburg Parsley (Root Parsley)"),
    ("delicata_squash",          "Delicata Squash"),
    ("lisianthus_echo",          "Lisianthus (Prairie Gentian)"),
    ("taro_standard",            "Taro / Dasheen"),
    ("scorzonera_standard",      "Scorzonera (Black Salsify)"),
    ("tomato_roma",              "Roma Tomato"),
    ("pepper_shishito",          "Shishito Pepper"),
    ("pepper_padron",            "Padrón Pepper"),
    ("melon_crenshaw",           "Crenshaw Melon"),
    ("lemon_verbena",            "Lemon Verbena"),
    ("delphinium_standard",      "Delphinium"),
    ("larkspur_giant",           "Giant Larkspur"),
    ("corn_bloody_butcher",      "Bloody Butcher Field Corn"),
    ("eggplant_white",           "White Eggplant"),
    ("kohlrabi_white_vienna",    "White Vienna Kohlrabi"),
    # === Wrong art style — dark/moody/object-in-frame (2nd audit 2026-03-18) ===
    ("foxglove_standard",        "Foxglove flower"),
    ("celery_par_cel",           "Cutting Celery (Leaf Celery)"),
    ("delicata_squash",          "Delicata Squash vine with fruit"),
    ("lisianthus_echo",          "Lisianthus flower"),
    ("quinoa_brightest",         "Quinoa plant with seed heads"),
    ("taro_standard",            "Taro plant (Colocasia esculenta)"),
    ("scorzonera_standard",      "Scorzonera plant with black roots"),
    ("dandelion_greens",         "Dandelion plant with leaves"),
    ("tomato_roma",              "Roma tomato plant with fruit"),
    ("kalettes",                 "Kalettes (kale-sprout hybrid)"),
]

# ── Main ──────────────────────────────────────────────────────────────────────
# Only process crops that haven't been generated yet (skip existing files)
todo = [
    (cid, name) for cid, name in BAD_CROPS
    if not (CROPS_DIR / f"{cid}.png").exists()
]

if not todo:
    print("✅ All images already generated!")
    sys.exit(0)

print(f"\n🌿 Generating {len(todo)} crop images ({len(BAD_CROPS) - len(todo)} already done)\n")

success, failed = [], []

for i, (crop_id, crop_name) in enumerate(todo):
    out_path = CROPS_DIR / f"{crop_id}.png"
    print(f"  [{i+1}/{len(todo)}] 🎨 {crop_name}…")

    ok = generate_image(crop_name, out_path)
    if ok:
        source = "Imagen" if not _imagen_all_exhausted else "DALL-E 3"
        # Actually check which was used — if imagen exhausted, it was DALL-E
        source = "DALL-E 3" if _imagen_all_exhausted or not genai_client else "Imagen"
        print(f"    ✓ Saved ({source})")
        success.append(crop_id)
    else:
        failed.append(crop_id)
        print(f"    ✗ Failed — skipping")

    if i < len(todo) - 1:
        time.sleep(3)  # DALL-E 3 can go faster than Imagen

print(f"\n✅ Done: {len(success)} generated, {len(failed)} failed")
if failed:
    print("Still need:")
    for f in failed:
        print(f"  - {f}")
else:
    print("🎉 All crops have correct images! Run 'npm run deploy' to publish.")
