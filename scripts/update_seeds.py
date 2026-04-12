import json

# Better density estimates (Seeds per Ounce)
# Sources: Johnny's Seeds, High Mowing
DENSITY_MAP = {
    'Arugula': 17000,
    'Radish': 2800,
    'Carrot': 18000,
    'Beet': 1500, # Beet "seeds" are capsules
    'Turnip': 12000,
    'Spinach': 2500,
    'Lettuce': 25000,
    'Cress': 12000,
    'Mustard': 15000,
    'Kale': 8500,
    'Collards': 8500,
    'Swiss Chard': 1500,
    'Mizuna': 15000,
    'Pac Choy': 12000,
    'Tatsoi': 12000,
    'Cilantro': 2500,
    'Dill': 10000,
    'Parsley': 15000,
    'Basil': 20000,
    'Chives': 25000,
    'Scallion': 12000,
    'Onion': 8000,
    'Leek': 10000,
    'Garlic': 0, # not from seed
    'Tomato': 10000,
    'Pepper': 4500,
    'Eggplant': 6000,
    'Cucumber': 1000,
    'Zucchini': 200,
    'Squash': 200,
    'Pumpkin': 150,
    'Melon': 900,
    'Watermelon': 600,
    'Pea': 100,
    'Bean': 100,
    'Corn': 150,
    'Okra': 500,
    'Cabbage': 8500,
    'Broccoli': 8500,
    'Cauliflower': 8500,
    'Kohlrabi': 8500,
    'Brussels Sprouts': 8500,
    'Celery': 70000,
    'Fennel': 7000,
    'Parsnip': 6000,
    'Rutabaga': 12000,
}

def run():
    with open('src/data/crops.json', 'r') as f:
        data = json.load(f)
        
    for crop in data['crops']:
        if crop['name'] in DENSITY_MAP:
            crop['seeds_per_oz'] = DENSITY_MAP[crop['name']]
        else:
            # Fallbacks 
            cat = crop['category']
            if cat == 'Greens': crop['seeds_per_oz'] = 17000
            elif cat == 'Root': crop['seeds_per_oz'] = 8000
            elif cat == 'Brassica': crop['seeds_per_oz'] = 8500
            elif cat == 'Allium': crop['seeds_per_oz'] = 8000
            elif cat == 'Fruiting': crop['seeds_per_oz'] = 4000
            elif cat == 'Legume': crop['seeds_per_oz'] = 100
            elif cat == 'Herbs': crop['seeds_per_oz'] = 20000
            elif cat == 'Flowers': crop['seeds_per_oz'] = 10000
            elif cat == 'Cover': crop['seeds_per_oz'] = 1000
            elif cat == 'Tuber': crop['seeds_per_oz'] = 100
            
    with open('src/data/crops.json', 'w') as f:
        json.dump(data, f, indent=4)
        
if __name__ == '__main__':
    run()
