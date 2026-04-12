import json

# Average Seeds Per Ounce Data (rough industry standard for Market Gardening)
seed_counts = {
    'lettuce': 25000,
    'spinach': 2500,
    'radish': 2500,
    'carrot': 18000,
    'beet': 1500, # seedballs
    'tomato': 10000,
    'pepper': 4000,
    'onion': 8000,
    'scallion': 8000,
    'kale': 8500,
    'arugula': 16000,
    'mustard': 15000,
    'asian_greens': 15000,
    'tatsoi': 15000,
    'mizuna': 15000,
    'komatsuna': 15000,
    'turnip': 12000,
    'cabbage': 8000,
    'broccoli': 8000,
    'cauliflower': 8000,
    'kohlrabi': 8000,
    'brussels_sprouts': 8000,
    'cucumber': 1000,
    'zucchini': 200,
    'squash': 200,
    'pumpkin': 150,
    'melon': 900,
    'watermelon': 600,
    'peas': 100,
    'bean': 100,
    'corn': 150,
    'basil': 20000,
    'cilantro': 2500, # split seed
    'dill': 25000,
    'parsley': 18000,
    'celery': 70000,
    'eggplant': 6000,
    'garlic': 0, # not from seed 
    'potato': 0, # not from seed
    'sweet_potato': 0, # slips
    'swiss_chard': 1500, # seedballs
    'leek': 10000,
    'shallot': 8000,
    'chives': 25000,
    'sunflower': 600,
    'zinnia': 3500,
    'cosmos': 4000,
    'snapdragon': 180000, # huge
    'ammi': 60000, # huge
    'celosia': 40000,
    'gomphrena': 10000,
    'lisianthus': 20000,
    'stock': 15000,
    'statis': 10000,
    'strawflower': 40000,
    'scabiosa': 1500,
    'yarrow': 100000,
    'rudbeckia': 40000,
    'campanula': 120000,
    'delphinium': 10000,
    'dianthus': 25000,
    'sweet_pea': 350,
    'verbena': 10000,
    'marigold': 10000,
    'lavender': 25000,
    'rosemary': 20000,
    'mint': 30000,
    'oregano': 120000,
    'thyme': 100000,
    'sage': 3500,
    'okra': 500,
    'fennel': 6000,
    'parsnip': 6000,
    'rutabaga': 10000,
    'turnip': 12000,
    'bok_choy': 15000,
    'pak_choi': 15000
}

def get_seeds_per_oz(crop_id):
    for key, val in seed_counts.items():
        if key in crop_id:
            return val
    # Fallback averages for categories
    return 10000

with open('src/data/crops.json', 'r') as f:
    data = json.load(f)

for crop in data['crops']:
    if 'seeds_per_oz' not in crop:
        crop['seeds_per_oz'] = get_seeds_per_oz(crop['id'])
        if crop['seeds_per_oz'] == 0:
            crop['seeds_per_oz'] = None

with open('src/data/crops.json', 'w') as f:
    json.dump(data, f, indent=4)
print("Updated crops.json with seeds_per_oz")
