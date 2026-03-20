#!/usr/bin/env python3
"""
AcreLogic Crop Expansion — Two-Phase Batch Script
==================================================
Phase 1: Generate crop metadata JSON via Gemini text API (fast, ~5 min)
Phase 2: Generate photorealistic crop images in batches with rate limiting (slow, ~4-8 hrs)

Usage:
  python3 scripts/expand_crops.py --phase 1          # metadata only
  python3 scripts/expand_crops.py --phase 2          # images only (after phase 1)
  python3 scripts/expand_crops.py --phase all        # both phases sequentially
  python3 scripts/expand_crops.py --phase 2 --start 50   # resume image gen from crop #50

The script is fully RESUMABLE. Already-generated images are skipped automatically.
"""

import argparse, json, os, sys, time, re, base64, pathlib, random
from datetime import datetime
from google import genai
from google.genai import types

# ── Config ─────────────────────────────────────────────────────────────────
REPO_ROOT   = pathlib.Path(__file__).parent.parent
DATA_DIR    = REPO_ROOT / "src" / "data"
PUBLIC_CROPS= REPO_ROOT / "public" / "crops"
ASSETS_CROPS= REPO_ROOT / "assets" / "crops"
CROPS_JSON  = DATA_DIR / "crops.json"
CROPIMGS_JS = DATA_DIR / "cropImages.js"
NEW_CROPS_JSON = REPO_ROOT / "scripts" / "_new_crops_generated.json"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    # Search current dir and up to 3 parent directories for .env
    search = [pathlib.Path.cwd()] + list(pathlib.Path(__file__).parents)[:4]
    for p in search:
        env_path = p / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("GEMINI_API_KEY="):
                    GEMINI_API_KEY = line.split("=", 1)[1].strip()
                    break
        if GEMINI_API_KEY:
            break

if not GEMINI_API_KEY:
    print("ERROR: GEMINI_API_KEY not found. Set it in .env or as environment variable.")
    sys.exit(1)

# ── Initialise Gemini client ────────────────────────────────────────────────
GENAI_CLIENT = genai.Client(api_key=GEMINI_API_KEY)

# ── Image output dir ────────────────────────────────────────────────────────
PUBLIC_CROPS.mkdir(parents=True, exist_ok=True)

# ── Rate limiting ────────────────────────────────────────────────────────────
# Gemini imagen: ~4 imgs/min free tier → 15s between images to be safe
IMG_DELAY_S   = 16    # seconds between image calls
# Text API: very generous limits
TEXT_DELAY_S  = 1

# ──────────────────────────────────────────────────────────────────────────────
# NEW CROPS TO ADD — organised by Johnny's taxonomy
# Already in DB (lowercased) are filtered out automatically at runtime.
# Format: (display_name, category, subcategory, notes_hint)
# ──────────────────────────────────────────────────────────────────────────────
NEW_CROP_SPECS = [
    # ── VEGETABLES ──────────────────────────────────────────────────────────
    ("Artichoke",           "Specialty",  "Perennial Vegetables", "large globe thistle-like vegetable"),
    ("Cardoon",             "Specialty",  "Perennial Vegetables", "related to artichoke, edible stalks"),
    ("Cardoon",             "Specialty",  "Perennial Vegetables", "thistle relative, silvery architectural plant"),
    ("Celery",              "Greens",     "Stalks",              "crunchy stalks, cool season"),
    ("Celeriac",            "Root",       "Root Vegetables",     "celery-root turnip-like"),
    ("Collards",            "Brassica",   "Leafy Greens",        "southern staple, large leaf"),
    ("Chinese Cabbage",     "Brassica",   "Asian Greens",        "napa type, mild flavor"),
    ("Kohlrabi",            "Brassica",   "Root-like Brassica",  "swollen stem, mild turnip flavor"),
    ("Salsify",             "Root",       "Root Vegetables",     "oyster plant, long white root"),
    ("Scorzonera",          "Root",       "Root Vegetables",     "black salsify, long dark-skinned root"),
    ("Husk Cherry",         "Nightshade", "Ground Cherries",     "tomatillo relative in papery husk"),
    ("Shoots",              "Greens",     "Microgreens/Shoots",  "sunflower, pea, and similar edible shoots"),
    ("Kalettes",            "Brassica",   "Brassica Hybrids",    "kale × brussels sprout hybrid"),
    ("Rutabaga",            "Root",       "Root Vegetables",     "large yellow-flesh turnip relative"),
    ("Leeks",               "Allium",     "Alliums",             "mild onion family, long white shaft"),
    ("Microgreens",         "Greens",     "Microgreens/Shoots",  "young seedling greens harvested early"),
    ("Watercress",          "Greens",     "Specialty Greens",    "aquatic/semi-aquatic peppery green"),
    ("Broccoli Raab",       "Brassica",   "Leafy Greens",        "rapini, bitter Italian green"),
    ("Mizuna",              "Greens",     "Asian Greens",        "Japanese frilly mustard green"),
    ("Tatsoi",              "Greens",     "Asian Greens",        "spoon-shaped dark green rosette"),
    ("Arugula",             "Greens",     "Specialty Greens",    "peppery salad green"),
    ("Mâche",               "Greens",     "Specialty Greens",    "corn salad, lamb's lettuce"),
    ("Radicchio",           "Greens",     "Chicory Family",      "red-headed Italian chicory"),
    ("Belgian Endive",      "Greens",     "Chicory Family",      "forced endive witloof type"),
    ("Frisée",              "Greens",     "Chicory Family",      "curly endive, blanched heart"),
    ("Dandelion Greens",    "Herb",       "Medicinal Herbs",     "cultivated culinary dandelion"),
    ("Claytonia",           "Greens",     "Specialty Greens",    "miner's lettuce, heart-shaped"),
    ("Orach",               "Greens",     "Specialty Greens",    "mountain spinach, red and green types"),
    ("Purslane",            "Greens",     "Specialty Greens",    "succulent salad green rich in omega-3"),
    ("New Zealand Spinach", "Greens",     "Specialty Greens",    "heat-tolerant spinach substitute"),
    ("Chard",               "Greens",     "Leafy Greens",        "rainbow chard bright colored stems"),
    ("Burdock",             "Root",       "Root Vegetables",     "gobo root, very long tap root"),
    ("Parsnip",             "Root",       "Root Vegetables",     "sweet white carrot-like root"),
    ("Hamburg Parsley",     "Root",       "Root Vegetables",     "parsley root, creamy turnip-like"),
    ("Asparagus",           "Specialty",  "Perennial Vegetables","long spears, perennial crown"),
    ("Rhubarb",             "Specialty",  "Perennial Vegetables","tart red stalks, pie plant"),
    ("Artichoke Jerusalem", "Tuber",      "Tubers",              "sunchoke, knobby white tuber"),
    ("Yacon",               "Tuber",      "Tubers",              "South American sweet crunchy tuber"),
    ("Mashua",              "Tuber",      "Tubers",              "Andean nasturtium-relative tuber"),
    ("Ulluco",              "Tuber",      "Tubers",              "colorful Andean tuber"),

    # ── FLOWERS ─────────────────────────────────────────────────────────────
    ("Agrostemma",          "Flower",     "Annual Flowers",       "corn cockle, tall pink flowers"),
    ("Ammobium",            "Flower",     "Everlasting Flowers",  "winged everlasting white papery"),
    ("Ammi",                "Flower",     "Cut Flowers",          "false Queen Anne's lace, airy white"),
    ("Asclepias",           "Flower",     "Perennial Flowers",    "butterfly weed orange, milkweed"),
    ("Atriplex",            "Flower",     "Annual Flowers",       "red mountain spinach ornamental"),
    ("Bells of Ireland",    "Flower",     "Cut Flowers",          "green bell-shaped calyxes"),
    ("Bupleurum",           "Flower",     "Cut Flowers",          "green star-shaped filler flower"),
    ("Carthamus",           "Flower",     "Cut Flowers",          "safflower, orange thistlelike"),
    ("Celosia",             "Flower",     "Annual Flowers",       "cockscomb, bright velvety plumes"),
    ("Centaurea",           "Flower",     "Annual Flowers",       "bachelor's button, blue star"),
    ("Cerinthe",            "Flower",     "Annual Flowers",       "honeywort, blue bracts, bee magnet"),
    ("Clarkia",             "Flower",     "Annual Flowers",       "farewell-to-spring, pink ruffled"),
    ("Craspedia",           "Flower",     "Everlasting Flowers",  "drumstick flower, golden ball"),
    ("Cynoglossum",         "Flower",     "Annual Flowers",       "Chinese forget-me-not, blue"),
    ("Daucus",              "Flower",     "Cut Flowers",          "Queen Anne's lace, white umbel"),
    ("Didiscus",            "Flower",     "Cut Flowers",          "blue lace flower, delicate"),
    ("Digitalis",           "Flower",     "Biennial Flowers",     "foxglove, tall spikes"),
    ("Dianthus",            "Flower",     "Cut Flowers",          "sweet William, carnation family"),
    ("Eryngium",            "Flower",     "Cut Flowers",          "sea holly, spiky blue metallic"),
    ("Eucalyptus",          "Flower",     "Foliage",              "silver dollar gum, fragrant foliage"),
    ("Gomphrena",           "Flower",     "Annual Flowers",       "globe amaranth, clover-like heads"),
    ("Gypsophila",          "Flower",     "Cut Flowers",          "baby's breath, airy white filler"),
    ("Helipterum",          "Flower",     "Everlasting Flowers",  "paper daisy, pink white papery"),
    ("Larkspur",            "Flower",     "Cut Flowers",          "annual delphinium, blue purple spikes"),
    ("Lisianthus",          "Flower",     "Cut Flowers",          "eustoma, ruffled rose-like bloom"),
    ("Lupine",              "Flower",     "Perennial Flowers",    "tall spikes blue pink purple"),
    ("Matricaria",          "Flower",     "Annual Flowers",       "feverfew, white daisy buttons"),
    ("Monarda",             "Flower",     "Perennial Flowers",    "bee balm, red wild bergamot"),
    ("Nicotiana",           "Flower",     "Annual Flowers",       "flowering tobacco, fragrant"),
    ("Orlaya",              "Flower",     "Cut Flowers",          "white lace flower, whorled petals"),
    ("Phacelia",            "Flower",     "Annual Flowers",       "tansy phacelia, blue bee forage"),
    ("Poppy",               "Flower",     "Annual Flowers",       "papaver, red orange pink white"),
    ("Portulaca",           "Flower",     "Annual Flowers",       "moss rose, succulent bright blooms"),
    ("Rudbeckia",           "Flower",     "Perennial Flowers",    "black-eyed Susan, golden daisy"),
    ("Saponaria",           "Flower",     "Annual Flowers",       "soapwort, pink rock-garden flowers"),
    ("Scabiosa",            "Flower",     "Cut Flowers",          "pincushion flower, lavender lilac"),
    ("Statice",             "Flower",     "Everlasting Flowers",  "sea lavender, papery purple"),
    ("Stock",               "Flower",     "Cut Flowers",          "matthiola, fragrant ruffled spikes"),
    ("Tithonia",            "Flower",     "Annual Flowers",       "Mexican sunflower, orange tall"),
    ("Verbena",             "Flower",     "Annual Flowers",       "trailing or upright clusters"),
    ("Xeranthemum",         "Flower",     "Everlasting Flowers",  "immortelle, papery lavender"),
    ("Cress Ornamental",    "Flower",     "Annual Flowers",       "decorative garden cress"),
    ("Tulip",               "Flower",     "Bulb Flowers",         "spring-blooming bulb, many colors"),
    ("Crocus",              "Flower",     "Bulb Flowers",         "spring bulb, first to bloom"),
    ("Hyacinth Bean",       "Flower",     "Annual Vines",         "Lablab bean, purple pods decorative"),
    ("Morning Glory",       "Flower",     "Annual Vines",         "twining vine with blue purple blooms"),
    ("Sweet Pea",           "Flower",     "Annual Vines",         "fragrant climbing pea flowers"),
    ("Phlox",               "Flower",     "Annual Flowers",       "annual phlox, bright clusters"),
    ("Columbine",           "Flower",     "Perennial Flowers",    "aquilegia spurred wildflower"),
    ("Cornflower",          "Flower",     "Annual Flowers",       "bachelor's button bright blue"),
    ("Bee Balm",            "Flower",     "Perennial Flowers",    "monarda, red tubular bee magnet"),
    ("Hollyhock",           "Flower",     "Biennial Flowers",     "tall stately cottage garden classic"),
    ("Ageratum",            "Flower",     "Annual Flowers",       "floss flower, blue fuzzy clusters"),
    ("Alyssum",             "Flower",     "Annual Flowers",       "sweet alyssum, white carpet honey-scented"),
    ("Ranunculus",          "Flower",     "Bulb Flowers",         "rose-like layered petals, cut flower"),
    ("Liatris",             "Flower",     "Perennial Flowers",    "blazing star, purple wands"),

    # ── HERBS ────────────────────────────────────────────────────────────────
    ("Angelica",            "Herb",       "Biennial Herbs",       "tall architectural herb, celery-like"),
    ("Anise Hyssop",        "Herb",       "Perennial Herbs",      "licorice-scented spikes, bee magnet"),
    ("Bee Balm",            "Herb",       "Perennial Herbs",      "bergamot tea herb, red flowers"),
    ("Ginseng",             "Herb",       "Medicinal Herbs",      "slow-growing root, high value"),
    ("Goldenseal",          "Herb",       "Medicinal Herbs",      "forest medicinal herb"),
    ("Hyssop",              "Herb",       "Perennial Herbs",      "aromatic blue-flowered shrub"),
    ("Lemon Balm",          "Herb",       "Perennial Herbs",      "melissa, lemon-scented mint family"),
    ("Mountain Mint",       "Herb",       "Perennial Herbs",      "pycnanthemum, native pollinator herb"),
    ("Rue",                 "Herb",       "Perennial Herbs",      "bitter aromatic herb, blue-green foliage"),
    ("Saffron Crocus",      "Herb",       "Specialty Herbs",      "stigmas harvested for saffron spice"),
    ("Salad Burnet",        "Herb",       "Perennial Herbs",      "cucumber-flavored serrated leaves"),
    ("Saltwort",            "Herb",       "Specialty Herbs",      "salsola, sea vegetable herb"),
    ("Savory",              "Herb",       "Annual Herbs",         "summer savory, bean companion"),
    ("Shiso",               "Herb",       "Annual Herbs",         "perilla, red or green Japanese herb"),
    ("Valerian",            "Herb",       "Perennial Herbs",      "tall medicinal herb, white flowers"),
    ("Catnip",              "Herb",       "Perennial Herbs",      "nepeta, cat attractant, calming"),
    ("Lemongrass",          "Herb",       "Specialty Herbs",      "tropical grass, citrus aroma"),
    ("Mexican Mint Marigold","Herb",      "Annual Herbs",         "tarragon substitute, anise flavor"),
    ("Astragalus",          "Herb",       "Medicinal Herbs",      "milk vetch, immune tonic"),
    ("Marshmallow Root",    "Herb",       "Medicinal Herbs",      "althaea, demulcent medicinal"),
    ("Motherwort",          "Herb",       "Perennial Herbs",      "leonurus, heart tonic herb"),
    ("Skullcap",            "Herb",       "Perennial Herbs",      "scutellaria, nerve tonic blue flowers"),
    ("Comfrey",             "Herb",       "Perennial Herbs",      "symphytum, dynamic accumulator"),
    ("Wormwood",            "Herb",       "Perennial Herbs",      "artemisia, bitter medicinal"),
    ("Elecampane",          "Herb",       "Perennial Herbs",      "inula, tall root medicinal"),
    ("Milk Thistle",        "Herb",       "Annual Herbs",         "silybum, liver tonic seed"),
    ("Passionflower",       "Herb",       "Perennial Herbs",      "passion vine, calming medicinal"),
    ("Tulsi",               "Herb",       "Annual Herbs",         "holy basil, Ayurvedic adaptogen"),
    ("Marjoram",            "Herb",       "Annual Herbs",         "sweet marjoram, oregano relative"),
    ("Winter Savory",       "Herb",       "Perennial Herbs",      "hardy savory, bean companion"),

    # ── FRUITS ───────────────────────────────────────────────────────────────
    ("Blackberry",          "Fruit",      "Cane Fruit",           "bramble fruit, erect or trailing"),
    ("Blueberry",           "Fruit",      "Berry Shrubs",         "highbush or half-high types"),
    ("Gooseberry",          "Fruit",      "Berry Shrubs",         "tart or sweet small currant relative"),
    ("Jostaberry",          "Fruit",      "Berry Shrubs",         "black currant × gooseberry hybrid"),
    ("Sea Buckthorn",       "Fruit",      "Berry Shrubs",         "orange tart berries nitrogen fixer"),
    ("Currant",             "Fruit",      "Berry Shrubs",         "red white or black small clusters"),
    ("Fig",                 "Fruit",      "Tree Fruit",           "sweet soft fleshy fruit"),
    ("Persimmon",           "Fruit",      "Tree Fruit",           "astringent or non-astringent types"),
    ("Pawpaw",              "Fruit",      "Tree Fruit",           "tropical-like North American native"),
    ("Mulberry",            "Fruit",      "Tree Fruit",           "black or white long berries"),
    ("Quince",              "Fruit",      "Tree Fruit",           "fragrant yellow hard fruit for jam"),
    ("Medlar",              "Fruit",      "Tree Fruit",           "old-world fruit, bletted when ripe"),
    ("Hardy Kiwi",          "Fruit",      "Vining Fruit",         "actinidia, small smooth skin kiwi"),
    ("Honeyberry",          "Fruit",      "Berry Shrubs",         "lonicera caerulea, first spring berry"),
    ("Goji Berry",          "Fruit",      "Berry Shrubs",         "wolfberry, superfood red berries"),
    ("Aronia",              "Fruit",      "Berry Shrubs",         "chokeberry, astringent antioxidant"),
    ("Elderberry",          "Fruit",      "Berry Shrubs",         "sambucus, immune tonic dark berries"),
    ("Lingonberry",         "Fruit",      "Berry Shrubs",         "low acid Scandinavian berry"),
    ("Huckleberry",         "Fruit",      "Berry Shrubs",         "wild type blueberry relative"),
    ("Serviceberry",        "Fruit",      "Tree Fruit",           "amelanchier, sweet early summer"),
    ("Nanking Cherry",      "Fruit",      "Tree Fruit",           "fruiting shrub cherry, small tart"),
    ("Beach Plum",          "Fruit",      "Tree Fruit",           "coastal native plum, tart"),
    ("Autumn Olive",        "Fruit",      "Berry Shrubs",         "elaeagnus, nitrogen fixing edible"),
    ("Juneberry",           "Fruit",      "Tree Fruit",           "serviceberry alias saskatoon"),
    ("Cornelian Cherry",    "Fruit",      "Tree Fruit",           "dogwood fruit, bright red tart"),
    ("Wolfberry",           "Fruit",      "Berry Shrubs",         "lycium chinense nutrient berry"),

    # ── FARM SEED ────────────────────────────────────────────────────────────
    ("Sorghum",             "Grain",      "Farm Grains",          "drought-tolerant grain or sweet stalk"),
    ("Milo",                "Grain",      "Farm Grains",          "grain sorghum, livestock feed"),
    ("Triticale",           "Grain",      "Farm Grains",          "wheat × rye hybrid, winter grain"),
    ("Winter Rye",          "Grain",      "Cover Crops",          "secale cereale, winter hardy cover"),
    ("Winter Wheat",        "Grain",      "Farm Grains",          "soft or hard red winter wheat"),
    ("Spring Barley",       "Grain",      "Farm Grains",          "malting or feed barley"),
    ("Flax",                "Grain",      "Farm Grains",          "linseed or fiber flax"),
    ("Sunflower",           "Grain",      "Farm Grains",          "oilseed type, large head"),
    ("Canola",              "Grain",      "Farm Grains",          "rapeseed oil crop brassica"),
    ("Mustard Seed",        "Grain",      "Cover Crops",          "biofumigant brassica cover crop"),
    ("Tillage Radish",      "Cover Crop", "Cover Crops",          "deep tap-root biodrilling daikon"),
    ("Crimson Clover",      "Cover Crop", "Nitrogen Fixers",      "beautiful nitrogen fixer red spikes"),
    ("Hairy Vetch",         "Cover Crop", "Nitrogen Fixers",      "winter hardy nitrogen fixing vine"),
    ("Austrian Winter Pea", "Cover Crop", "Nitrogen Fixers",      "cold tolerant cover pea"),
    ("Sunn Hemp",           "Cover Crop", "Nitrogen Fixers",      "fast growing tropical nitrogen fixer"),
    ("Cowpea Cover",        "Cover Crop", "Nitrogen Fixers",      "southern pea summer cover crop"),
    ("Annual Ryegrass",     "Cover Crop", "Grasses",              "fast ground cover, erosion control"),
    ("Phacelia Cover",      "Cover Crop", "Beneficial Insect",    "bee phacelia purple mass bloom"),
    ("Berseem Clover",      "Cover Crop", "Nitrogen Fixers",      "Egyptian clover, multi-cut"),
    ("Field Peas",          "Legume",     "Field Legumes",        "dun peas, protein livestock forage"),
    ("Fababean",            "Legume",     "Field Legumes",        "large seeded fava for grain"),
    ("Soybean",             "Legume",     "Field Legumes",        "edamame or dry soy"),
    ("Lupin",               "Legume",     "Field Legumes",        "white lupin grain legume"),
    ("Safflower",           "Grain",      "Farm Grains",          "oil or birdseed crop, spiny"),
    ("Ethiopian Kale",      "Brassica",   "Brassicas",            "gomen, large leaf African brassica"),
    ("Siberian Kale",       "Brassica",   "Brassicas",            "ultra-hardy blue-green kale type"),
    ("Portuguese Kale",     "Brassica",   "Brassicas",            "couve, long-leafed Portuguese type"),
    ("Red Russian Kale",    "Brassica",   "Brassicas",            "frilly purple-stemmed tender kale"),
    ("Lacinato Kale",       "Brassica",   "Brassicas",            "dinosaur kale, dark puckered leaves"),
    ("Napa Cabbage",        "Brassica",   "Asian Greens",         "Chinese cabbage, mild crisp heads"),
    ("Savoy Cabbage",       "Brassica",   "Brassicas",            "crinkle-leaved headed brassica"),
    ("Red Cabbage",         "Brassica",   "Brassicas",            "dense purple-red firm head"),
    ("Bok Choy",            "Brassica",   "Asian Greens",         "white-stemmed Asian brassica"),
    ("Gai Lan",             "Brassica",   "Asian Greens",         "Chinese broccoli, tender stems"),
    ("Tyfon",               "Brassica",   "Cover Crops",          "turnip × leafy Chinese cabbage hybrid"),
    ("Forage Rape",         "Brassica",   "Cover Crops",          "brassica napus forage type"),
    ("Swede",               "Root",       "Root Vegetables",      "Swedish turnip dense yellow flesh"),
    ("Celtuce",             "Greens",     "Specialty Greens",     "stem lettuce asparagus lettuce"),
    ("Shungiku",            "Herb",       "Annual Herbs",         "chrysanthemum greens edible"),
    ("Lemon Cucumber",      "Cucurbit",   "Cucumbers",            "round pale yellow mild cucumbers"),
    ("Japanese Eggplant",   "Nightshade", "Eggplant",             "long slender Japanese aubergine"),
    ("Thai Basil",          "Herb",       "Annual Herbs",         "anise-flavored SE Asian basil"),
    ("Holy Basil",          "Herb",       "Annual Herbs",         "tulsi adaptogen basil"),
    ("Cinnamon Basil",      "Herb",       "Annual Herbs",         "warm spiced aromatic basil"),
    ("Lime Basil",          "Herb",       "Annual Herbs",         "citrus-fresh compact basil"),
    ("African Blue Basil",  "Herb",       "Perennial Herbs",      "perennial pollinator basil"),
    ("Pineapple Sage",      "Herb",       "Perennial Herbs",      "fruity fragrant salvia"),
    ("Clary Sage",          "Herb",       "Biennial Herbs",       "ornamental medicinal salvia"),
    ("Black Sage",          "Herb",       "Perennial Herbs",      "native California salvia medicinal"),
    ("Roman Chamomile",     "Herb",       "Perennial Herbs",      "low creeping perennial chamomile"),
    ("Lemon Verbena",       "Herb",       "Perennial Herbs",      "intensely lemon-scented shrub"),
    ("Vietnamese Coriander","Herb",       "Perennial Herbs",      "hot spicy cilantro substitute"),
    ("Epazote",             "Herb",       "Annual Herbs",         "Mexican tea herb for beans"),
    ("Culantro",            "Herb",       "Annual Herbs",         "long cilantro, tropical climate"),
    ("Agastache",           "Herb",       "Perennial Herbs",      "hummingbird mint, anise flavor"),
    ("Bergamot",            "Herb",       "Perennial Herbs",      "bee balm, Earl Grey tea aroma"),
    ("Blue Vervain",        "Herb",       "Perennial Herbs",      "verbena hastata pollinator"),
    ("Licorice Root",       "Herb",       "Perennial Herbs",      "glycyrrhiza sweet root medicinal"),
    ("Spilanthes",          "Herb",       "Annual Herbs",         "toothache plant, numbing flowers"),
    ("Wood Sorrel",         "Herb",       "Perennial Herbs",      "oxalis, clover-like sour leaves"),
    ("Wood Betony",         "Herb",       "Perennial Herbs",      "stachys, woodland medicinal herb"),
    ("Elecampane",          "Herb",       "Perennial Herbs",      "inula helenium, large daisy root"),
    ("Echinacea Purpurea",  "Herb",       "Perennial Herbs",      "purple coneflower immune herb"),
    ("Sweet Cicely",        "Herb",       "Perennial Herbs",      "myrrhis odorata, anise flavor"),
    ("Ground Elder",        "Herb",       "Perennial Herbs",      "goutweed, young leaves edible"),
    ("Nettle",              "Herb",       "Perennial Herbs",      "urtica dioica, nutrient-rich spring green"),
    ("Plantain Herb",       "Herb",       "Perennial Herbs",      "plantago, healing wound herb"),
    ("Yarrow",              "Flower",     "Perennial Flowers",    "achillea, feathery aromatic white"),
    ("Feverfew",            "Herb",       "Perennial Herbs",      "small white daisy migraines herb"),
    ("St John's Wort",      "Herb",       "Perennial Herbs",      "hypericum perforatum mood herb"),
    ("Ashwagandha",         "Herb",       "Perennial Herbs",      "withania adaptogen Indian ginseng"),
    ("Astragalus",          "Herb",       "Perennial Herbs",      "huang qi, immune tonic Chinese"),
    ("Rhodiola",            "Herb",       "Perennial Herbs",      "arctic root stress adaptogen"),
    ("Maca",                "Root",       "Root Vegetables",      "Andean crucifer energy root"),
    ("Yacon",               "Root",       "Root Vegetables",      "South American sweet crunchy root"),
    ("Oca",                 "Tuber",      "Tubers",               "New Zealand yam, tart tuber"),
    ("Arracacha",           "Root",       "Root Vegetables",      "South American white carrot"),
    ("Tiger Nut",           "Tuber",      "Tubers",               "chufa sedge, sweet nutty tubers"),
    ("Lotus Root",          "Specialty",  "Water Vegetables",     "aquatic root with pretty holes"),
    ("Water Chestnut",      "Specialty",  "Water Vegetables",     "eleocharis corm, crunchy aquatic"),
    ("Wasabi",              "Specialty",  "Specialty Crops",      "Japanese horseradish rhizome"),
    ("Wakame",              "Specialty",  "Sea Vegetables",       "brown seaweed fronds"),
    ("Agretti",             "Greens",     "Specialty Greens",     "salsola soda, monk's beard samphire"),
    ("Samphire",            "Greens",     "Specialty Greens",     "rock samphire sea fennel coastal"),
    ("Sea Purslane",        "Greens",     "Specialty Greens",     "salty coastal succulent"),
    ("Glasswort",           "Greens",     "Specialty Greens",     "salicornia, sea beans crunchy"),
    ("Skirret",             "Root",       "Root Vegetables",      "sium sisarum multi-rooted sweet"),
    ("Good King Henry",     "Greens",     "Perennial Vegetables", "goosefoot perennial green"),
    ("Nine Star Broccoli",  "Brassica",   "Perennial Vegetables", "perennial sprouting broccoli"),
    ("Perennial Kale",      "Brassica",   "Perennial Vegetables", "tronchuda or tree kale multi-year"),
    ("Walking Onion",       "Allium",     "Alliums",              "top-setting Egyptian onion"),
    ("Welsh Onion",         "Allium",     "Alliums",              "bunching never-bulbing perennial onion"),
    ("Japanese Bunching Onion","Allium",  "Alliums",              "negi, slim white perennial onion"),
    ("Potato Onion",        "Allium",     "Alliums",              "multiplier onion, clumping"),
    ("Rocambole Garlic",    "Allium",     "Alliums",              "hardneck garlic, rich complex flavor"),
    ("Elephant Garlic",     "Allium",     "Alliums",              "large mild leek-relative bulb"),
    ("Garlic Chives",       "Allium",     "Alliums",              "Chinese chives flat bladed garlic flavored"),
    ("Shallot",             "Allium",     "Alliums",              "multiplier mild onion clumps"),
    ("Cipollini Onion",     "Allium",     "Alliums",              "flat disk-shaped mild Italian onion"),
    ("Pickling Onion",      "Allium",     "Alliums",              "small silverskin boiling onion"),
    ("Torpedo Onion",       "Allium",     "Alliums",              "long red sweet Italian onion"),
    ("Sweet Onion",         "Allium",     "Alliums",              "Walla Walla Vidalia type mild onion"),
]

# Remove duplicates by name
seen = set()
UNIQUE_SPECS = []
for spec in NEW_CROP_SPECS:
    key = spec[0].lower()
    if key not in seen:
        seen.add(key)
        UNIQUE_SPECS.append(spec)

# ──────────────────────────────────────────────────────────────────────────────
def load_existing_crops():
    d = json.loads(CROPS_JSON.read_text())
    return d.get("crops", d), d

def make_id(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")

def gemini_text(prompt, model="gemini-2.5-flash"):
    """Call Gemini text API via google.genai SDK."""
    r = GENAI_CLIENT.models.generate_content(model=model, contents=prompt)
    return r.text


# ── Imagen model rotation — each model has its own 70/day quota ──────────────
# Total capacity: 3 × 70 = 210 images/day
IMAGEN_MODELS = [
    "imagen-4.0-fast-generate-001",    # fastest  — 70/day
    "imagen-4.0-generate-001",          # standard — 70/day (separate quota)
    "imagen-4.0-ultra-generate-001",    # best     — 70/day (separate quota)
]
_active_model_idx = 0   # increments when a model hits quota

def gemini_image(prompt, output_path):
    """Generate image via Gemini imagen and save to output_path.
    Automatically rotates through all 3 models if one hits its daily quota.
    """
    global _active_model_idx

    while _active_model_idx < len(IMAGEN_MODELS):
        model = IMAGEN_MODELS[_active_model_idx]
        try:
            result = GENAI_CLIENT.models.generate_images(
                model=model,
                prompt=prompt,
                config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio="1:1"),
            )
            img_bytes = result.generated_images[0].image.image_bytes
            output_path.write_bytes(img_bytes)
            return True
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                print(f"    ⚠ Model {model} quota exhausted — switching to next model")
                _active_model_idx += 1
                if _active_model_idx < len(IMAGEN_MODELS):
                    print(f"    → Switching to {IMAGEN_MODELS[_active_model_idx]}")
                    continue  # retry with next model immediately (no wait needed)
                else:
                    print(f"    ✗ All 3 image models have hit their daily quota (210 images). Try again tomorrow.")
                    return False
            else:
                print(f"    ⚠ Image gen failed: {e}")
                return False
    return False

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 1 — Generate crop metadata
# ──────────────────────────────────────────────────────────────────────────────
def phase1_generate_metadata():
    existing_crops, full_data = load_existing_crops()
    existing_names = {c.get("name", "").lower() for c in existing_crops}
    existing_ids   = {c.get("id") for c in existing_crops}

    # Filter to genuinely new crops
    to_add = [s for s in UNIQUE_SPECS if s[0].lower() not in existing_names]
    print(f"\n📋 Phase 1: Generating metadata for {len(to_add)} new crops")
    print(f"   (Skipping {len(UNIQUE_SPECS) - len(to_add)} already in DB)\n")

    # Load any previously generated
    already_generated = {}
    if NEW_CROPS_JSON.exists():
        already_generated = {c["name"].lower(): c for c in json.loads(NEW_CROPS_JSON.read_text())}
        print(f"   Resuming — {len(already_generated)} crops already generated\n")

    new_crops = list(already_generated.values())

    for i, (crop_name, category, subcategory, hint) in enumerate(to_add):
        if crop_name.lower() in already_generated:
            continue

        print(f"  [{i+1}/{len(to_add)}] Generating metadata: {crop_name}…")
        prompt = f"""Generate a single detailed JSON object for the crop/plant "{crop_name}" for a farm planning app.
Context: {hint}. Category: {category}. Subcategory: {subcategory}.

Return ONLY valid JSON with these exact keys:
{{
  "id": "{make_id(crop_name)}",
  "name": "{crop_name}",
  "variety": "Primary",
  "category": "{category}",
  "subcategory": "{subcategory}",
  "emoji": "<single emoji representing this crop>",
  "dtm": <days from seed/transplant to first harvest, number>,
  "harvest_window_days": <days harvest window remains open, number>,
  "seed_type": "<DS or TP>",
  "season": "<cool or warm>",
  "frost_tolerant": <true or false>,
  "min_frost_free_days": <minimum frost free days required, number>,
  "rows_per_30in_bed": <number>,
  "in_row_spacing_in": <inches, number>,
  "yield_lbs_per_100ft": <estimated yield, number>,
  "yield_unit": "<lbs or bunches or each>",
  "wholesale_price_per_lb": <market price per lb USD, number>,
  "feed_class": "<vegetable or fruit or grain or herb or flower or cover_crop>",
  "planting_method": "<seed or transplant or division or cutting>",
  "description": "<2 sentence growing description for farmers>",
  "rotation_prefers_after": ["<crop family name>"],
  "rotation_cannot_follow": ["<crop family name>"],
  "notes": "<brief growing tip>"
}}
Return ONLY the JSON object, no markdown, no explanation."""

        try:
            raw = gemini_text(prompt)
            # Extract JSON from response
            raw = raw.strip()
            if raw.startswith("```"):
                raw = re.sub(r"^```[a-z]*\n?", "", raw)
                raw = re.sub(r"\n?```$", "", raw)
            crop_data = json.loads(raw)
            crop_data["name"] = crop_name
            crop_data["id"] = make_id(crop_name)
            crop_data["category"] = category
            crop_data["subcategory"] = subcategory
            new_crops.append(crop_data)
            already_generated[crop_name.lower()] = crop_data
            # Save progress after each crop
            NEW_CROPS_JSON.write_text(json.dumps(new_crops, indent=2))
            print(f"    ✓ {crop_name} (DTM: {crop_data.get('dtm','?')}d)")
        except Exception as e:
            print(f"    ✗ Failed: {e}")

        time.sleep(TEXT_DELAY_S)

    print(f"\n✅ Phase 1 complete: {len(new_crops)} crop metadata entries generated")
    print(f"   Saved to: {NEW_CROPS_JSON}\n")
    return new_crops

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 2 — Generate images
# ──────────────────────────────────────────────────────────────────────────────
def phase2_generate_images(start_at=0):
    if not NEW_CROPS_JSON.exists():
        print("ERROR: Run Phase 1 first to generate crop metadata.")
        sys.exit(1)

    new_crops = json.loads(NEW_CROPS_JSON.read_text())
    print(f"\n🖼  Phase 2: Generating images for {len(new_crops)} crops (starting at #{start_at})\n")

    generated = 0
    skipped   = 0
    failed    = []

    for i, crop in enumerate(new_crops[start_at:], start=start_at):
        crop_id   = crop.get("id") or make_id(crop["name"])
        img_path  = PUBLIC_CROPS / f"{crop_id}.png"

        if img_path.exists():
            print(f"  [{i+1}/{len(new_crops)}] ⏭  {crop['name']} — already exists, skipping")
            skipped += 1
            continue

        print(f"  [{i+1}/{len(new_crops)}] 🎨 {crop['name']}…", flush=True)
        prompt = (
            f"Professional photorealistic close-up photograph of {crop['name']} plant. "
            f"Show the actual plant - its leaves, stems, flowers, fruit, or vegetables as appropriate. "
            f"Botanical photography style, natural outdoor lighting, garden or farm background. "
            f"NO people, NO animals, NO buildings, NO landscapes, NO text, NO abstract imagery. "
            f"Only the {crop['name']} plant itself, crisp and detailed, centered in frame."
        )

        ok = gemini_image(prompt, img_path)
        if ok:
            print(f"    ✓ Saved {img_path.name}")
            generated += 1
        else:
            failed.append(crop["name"])
            print(f"    ✗ Failed — will retry on next run")

        # Rate limiting: 16s between calls to stay under free-tier limits
        if i < len(new_crops) - 1:
            # Add slight jitter to avoid pattern detection
            jitter = random.uniform(0, 3)
            wait   = IMG_DELAY_S + jitter
            print(f"    ⏳ Waiting {wait:.0f}s…")
            time.sleep(wait)

    print(f"\n✅ Phase 2 summary:")
    print(f"   Generated: {generated} images")
    print(f"   Skipped (already existed): {skipped}")
    if failed:
        print(f"   Failed ({len(failed)}): {', '.join(failed[:10])}")
        print(f"   Re-run with --phase 2 to retry failed images")

# ──────────────────────────────────────────────────────────────────────────────
# FINALISE — Merge into crops.json + update cropImages.js
# ──────────────────────────────────────────────────────────────────────────────
def finalize():
    """Merge _new_crops_generated.json into crops.json and regenerate cropImages.js."""
    if not NEW_CROPS_JSON.exists():
        print("ERROR: No generated crops found. Run Phase 1 first.")
        return

    existing_crops, full_data = load_existing_crops()
    new_crops = json.loads(NEW_CROPS_JSON.read_text())

    existing_ids = {c.get("id") for c in existing_crops}
    truly_new = [c for c in new_crops if c.get("id") not in existing_ids]

    print(f"\n🔀 Merging {len(truly_new)} new crops into crops.json…")

    all_crops = existing_crops + truly_new
    if "crops" in full_data:
        full_data["crops"] = all_crops
    else:
        full_data = all_crops

    # Backup original
    import shutil
    shutil.copy(CROPS_JSON, str(CROPS_JSON) + ".bak2")
    CROPS_JSON.write_text(json.dumps(full_data, indent=2, ensure_ascii=False))
    print(f"   ✓ crops.json updated ({len(all_crops)} total crops)")

    # Rebuild cropImages.js
    all_ids = [c.get("id") for c in all_crops if c.get("id")]
    # Check which have images
    lines = ["// AUTO-GENERATED — do not edit manually",
             "// Images served as runtime URLs (no bundling required)",
             "",
             "const CROP_IMAGES = {"]

    for cid in sorted(all_ids):
        img_public = PUBLIC_CROPS / f"{cid}.png"
        img_assets = ASSETS_CROPS / f"{cid}.png"
        if img_public.exists() or img_assets.exists():
            lines.append(f"  '{cid}': {{ uri: '/crops/{cid}.png' }},")

    lines += ["};", "", "export default CROP_IMAGES;"]
    CROPIMGS_JS.write_text("\n".join(lines))
    print(f"   ✓ cropImages.js rebuilt ({len([l for l in lines if 'uri:' in l])} image entries)")
    print(f"\n🎉 Done! Crops: {len(existing_crops)} → {len(all_crops)} (+{len(truly_new)})")


# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AcreLogic crop expansion")
    parser.add_argument("--phase", choices=["1", "2", "all", "finalize"], default="1",
                        help="1=metadata, 2=images, all=both, finalize=merge into app")
    parser.add_argument("--start", type=int, default=0,
                        help="Start image generation at crop index N (for resuming)")
    args = parser.parse_args()

    print("=" * 60)
    print("  AcreLogic Crop Expansion Script")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    if args.phase in ("1", "all"):
        phase1_generate_metadata()

    if args.phase in ("2", "all"):
        phase2_generate_images(start_at=args.start)

    if args.phase == "finalize":
        finalize()

    if args.phase == "all":
        finalize()
