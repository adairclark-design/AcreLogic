#!/usr/bin/env python3
"""
fix_problem_crops.py
Targeted re-fetch for the 28 crops with wrong Pixabay images.
Deletes existing image, uses improved query, re-downloads.

Run: python3 execution/fix_problem_crops.py
"""

import ssl, json, time, urllib.request, urllib.parse
from pathlib import Path

ASSETS_DIR = Path('/Users/adairclark/Desktop/AntiGravity/AcreLogic/assets/crops')
CROPS_JSON = Path('/Users/adairclark/Desktop/AntiGravity/AcreLogic/src/data/crops.json')
IMAGES_JS  = Path('/Users/adairclark/Desktop/AntiGravity/AcreLogic/src/data/cropImages.js')
API_KEY    = '55095455-8154c1f67de203630354a2de2'

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# ────────────────────────────────────────────────────────────────────
# ROOT CAUSE FIXES:
#   - food → nature: "food" category returns cooked dishes
#   - Drop geographic words: "mountain", "russian", "torpedo", "japanese"
#   - Add plant/growing/raw/fresh context
#   - Use scientific names or very precise descriptors for obscure plants
# ────────────────────────────────────────────────────────────────────
FIXES = {
    # Alliums — "torpedo" was returning naval torpedoes, "sweet onion" returning candy
    'sweet_onion':         ('white onion bulb fresh vegetable harvest',          'nature'),
    'torpedo_onion':       ('red onion elongated cipolline raw vegetable',       'nature'),
    'chives':              ('chives green herb growing plant fresh',              'nature'),
    'chives_standard':     ('chives allium green herb garden growing',           'nature'),

    # Brassicas / greens
    'tatsoi_standard':     ('tatsoi spoon mustard rosette leaves fresh vegetable','nature'),
    'kale_red_russian':    ('kale purple red frilly leaves garden plant growing', 'nature'),
    'red_russian_kale':    ('red kale purple frilly leaves raw fresh',           'nature'),
    'celtuce':             ('stem lettuce asparagus lettuce green vegetable raw', 'nature'),
    'shungiku':            ('edible chrysanthemum greens leaves fresh vegetable', 'nature'),
    'belgian_endive':      ('witloof endive chicory white compact head raw',     'nature'),
    'asian_mix':           ('asian salad greens mix tatsoi mizuna raw',          'nature'),

    # Nightshades / cucurbits
    'japanese_eggplant':   ('japanese eggplant slender purple raw vegetable',    'nature'),
    'eggplant_ichiban':    ('ichiban eggplant long purple raw fresh garden',     'nature'),

    # Herbs with geographic name confusion
    'cinnamon_basil':      ('basil herb fresh green leaves plant growing',       'nature'),
    'mountain_mint':       ('pycnanthemum mint herb white flower plant',         'nature'),
    'eucalyptus':          ('eucalyptus branch leaves fresh cut florist',        'nature'),
    'canola':              ('rapeseed yellow flowers field growing crop',         'nature'),
    'soybean':             ('soybean plant green pods growing field agriculture','nature'),
    'honeyberry':          ('haskap lonicera blue berry fruit fresh raw',        'nature'),
    'blueberry':           ('blueberry cluster fresh raw ripe fruit bush',       'nature'),

    # Wasabi — shows paste, not plant
    'wasabi':              ('wasabi plant rhizome green stem fresh',              'nature'),

    # Rare / obscure plants — need very specific terms
    'good_king_henry':     ('goosefoot herb wild green plant leaf vegetable',    'nature'),
    'glasswort':           ('samphire glasswort salicornia succulent green marsh','nature'),
    'sea_purslane':        ('sea purslane portulaka halimione coastal plants',   'nature'),
    'samphire':            ('rock samphire crithmum maritimum herb green plant', 'nature'),
    'arracacha':           ('white carrot root vegetable fresh harvest tuber',   'nature'),

    # Flowers — previous queries were too generic
    'bells_of_ireland':    ('bells ireland moluccella green flower fresh',       'nature'),
    'asclepias':           ('asclepias milkweed orange flower blooming plant',   'nature'),
    'delphinium_standard': ('delphinium blue purple tall flower spike bloom',    'nature'),
    'larkspur_giant':      ('larkspur consolida annual blue purple flower',      'nature'),
    'foxglove_standard':   ('foxglove digitalis purple bell flower bloom spike', 'nature'),
}


def pixabay_search(query, category, api_key):
    params = {'key': api_key, 'q': query, 'image_type': 'photo',
              'safesearch': 'true', 'per_page': 10, 'min_width': 400, 'order': 'popular'}
    if category:
        params['category'] = category
    url = f'https://pixabay.com/api/?{urllib.parse.urlencode(params)}'
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10, context=CTX) as r:
            data = json.loads(r.read())
        hits = data.get('hits', [])
        if hits:
            return hits[0].get('webformatURL', '')
    except Exception as e:
        print(f'    search_err: {e}')
    return None


def download(url, dest):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://pixabay.com/',
        })
        with urllib.request.urlopen(req, timeout=15, context=CTX) as r:
            dest.write_bytes(r.read())
        return True
    except Exception as e:
        print(f'    dl_err: {e}')
        return False


def regenerate_js():
    data = json.loads(CROPS_JSON.read_text())
    crops = sorted(data.get('crops', data) if isinstance(data, dict) else data, key=lambda c: c['id'])
    lines = ['// Crop images — assets/crops/ directory', '', 'const CROP_IMAGES = {']
    found = 0
    for c in crops:
        cid = c['id']
        for ext in ['jpg', 'jpeg', 'png']:
            p = ASSETS_DIR / f'{cid}.{ext}'
            if p.exists():
                lines.append(f"  '{cid}': require('../../assets/crops/{cid}.{ext}'),")
                found += 1
                break
    lines += ['};', '', 'export default CROP_IMAGES;', '']
    IMAGES_JS.write_text('\n'.join(lines))
    return found


def main():
    print(f'Fixing {len(FIXES)} problem crops...\n')
    fixed = 0
    failed = []

    for i, (cid, (query, category)) in enumerate(FIXES.items(), 1):
        # Delete existing wrong image
        for ext in ['jpg', 'jpeg', 'png']:
            old = ASSETS_DIR / f'{cid}.{ext}'
            if old.exists():
                old.unlink()
                break

        print(f'[{i:2}/{len(FIXES)}] {cid}')
        print(f'         query: "{query}" ({category})')

        dest = ASSETS_DIR / f'{cid}.jpg'
        url = pixabay_search(query, category, API_KEY)

        if url:
            ok = download(url, dest)
            if ok:
                print(f'         ✅')
                fixed += 1
            else:
                # Fallback: no category filter
                url2 = pixabay_search(query, '', API_KEY)
                if url2 and download(url2, dest):
                    print(f'         ✅ (no-cat fallback)')
                    fixed += 1
                else:
                    print(f'         ❌')
                    failed.append(cid)
        else:
            print(f'         ❌ (no results)')
            failed.append(cid)

        time.sleep(0.4)

    covered = regenerate_js()
    print(f'\n{"─"*50}')
    print(f'Fixed: {fixed}/{len(FIXES)}')
    print(f'cropImages.js: {covered}/512')
    if failed:
        print(f'Still failed: {failed}')


if __name__ == '__main__':
    main()
