#!/usr/bin/env python3
"""
fetch_commons_crop_images.py
═════════════════════════════════════════════════════════════════════
Fetches accurate, public-domain crop images from Wikimedia Commons
by querying CATEGORIES by scientific name — NOT Wikipedia lead images.

This is the correct approach:
  Wikipedia lead image = whatever Wikidata picked (elephants, stars...)
  Commons category     = botanically curated photos of that exact species

Usage:
    python3 execution/fetch_commons_crop_images.py

License: Wikimedia Commons CC-BY-SA. Attribution footer required:
         "Images: Wikimedia Commons contributors (CC BY-SA)"
"""

import json
import ssl
import time
import shutil
import urllib.request
import urllib.parse
from pathlib import Path

BASE_DIR   = Path(__file__).parent.parent
SCI_NAMES  = BASE_DIR / 'execution' / 'crop_scientific_names.json'
OVERRIDES  = BASE_DIR / 'execution' / 'url_overrides.json'
OUT_DIR    = BASE_DIR / 'public' / 'crops'
IMAGES_JS  = BASE_DIR / 'src' / 'data' / 'cropImages.js'
CROPS_JSON = BASE_DIR / 'src' / 'data' / 'crops.json'

OUT_DIR.mkdir(parents=True, exist_ok=True)

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
HEADERS = {'User-Agent': 'AcreLogic/2.0 (https://acrelogic.pages.dev; contact@acrelogic.com)'}

# Mime types and extensions we accept
GOOD_MIME = {'image/jpeg', 'image/jpg', 'image/png', 'image/webp'}

# Commons categories to skip (diagrams, range maps, etc.)
SKIP_KEYWORDS = ['map', 'range', 'distribution', 'diagram', 'icon', 'logo',
                 'symbol', 'stamp', 'flag', 'coat', 'arms', 'microscop', 'electron',
                 'herbarium', 'specimen', 'dried', 'preserved', 'fossil', 'skeleton']


def http_get(url, timeout=15):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read()


def query_commons_category(category_name, thumb_size=600, limit=20):
    """
    Query all image files in a Wikimedia Commons category.
    Returns list of dicts with keys: title, url, mime, width, height, license
    """
    encoded = urllib.parse.quote(f'Category:{category_name}')
    api_url = (
        'https://commons.wikimedia.org/w/api.php'
        f'?action=query&generator=categorymembers'
        f'&gcmtitle={encoded}&gcmtype=file&gcmlimit={limit}'
        f'&prop=imageinfo&iiprop=url|mime|size|extmetadata'
        f'&iiurlwidth={thumb_size}&format=json'
    )
    try:
        data = json.loads(http_get(api_url))
        pages = data.get('query', {}).get('pages', {})
        results = []
        for page in pages.values():
            title = page.get('title', '')
            ii_list = page.get('imageinfo', [])
            if not ii_list:
                continue
            ii = ii_list[0]
            mime = ii.get('mime', '')
            if mime not in GOOD_MIME:
                continue
            # Skip non-plant images by filename keywords
            title_lower = title.lower()
            if any(kw in title_lower for kw in SKIP_KEYWORDS):
                continue
            # Get license from extmetadata
            meta = ii.get('extmetadata', {})
            license_val = meta.get('LicenseShortName', {}).get('value', '')
            # Only CC-BY, CC-BY-SA, CC0, PD
            if license_val and not any(ok in license_val for ok in ['CC BY', 'CC0', 'Public domain', 'PD']):
                continue
            thumb_url = ii.get('thumburl', '') or ii.get('url', '')
            w = ii.get('thumbwidth', 0) or ii.get('width', 0)
            h = ii.get('thumbheight', 0) or ii.get('height', 0)
            results.append({
                'title': title,
                'url': thumb_url,
                'mime': mime,
                'width': w,
                'height': h,
                'license': license_val,
            })
        return results
    except Exception as e:
        return []


def score_image(img):
    """Higher = better candidate. Prefer JPEG, landscape, larger."""
    score = 0
    if 'jpeg' in img['mime'] or 'jpg' in img['mime']:
        score += 10
    w, h = img['width'], img['height']
    if w > 0 and h > 0:
        # Prefer roughly square or landscape (produce photos)
        ratio = w / h
        if 0.5 < ratio < 3.0:
            score += 5
        # Prefer wider images
        score += min(w, 800) / 100
    return score


def best_image(results):
    """Return the highest-scoring image dict, or None."""
    if not results:
        return None
    return max(results, key=score_image)


def download(url, dest):
    try:
        data = http_get(url, timeout=20)
        dest.write_bytes(data)
        return True
    except Exception as e:
        print(f'    dl_err: {e}')
        return False


def fetch_for_crop(crop_id, commons_name, sci_name):
    """
    Try to fetch a good image. Strategy:
    1. Commons category by 'commons' name (common/variety name)
    2. Commons category by scientific name
    3. Commons category by genus only
    Returns (url, source_desc) or (None, None)
    """
    attempts = [
        commons_name,
        sci_name,
        sci_name.split()[0] if ' ' in sci_name else None,  # genus
    ]
    for cat in attempts:
        if not cat:
            continue
        results = query_commons_category(cat)
        img = best_image(results)
        if img and img['url']:
            return img['url'], f'category:{cat}'
        time.sleep(0.3)
    return None, None


def load_overrides():
    if OVERRIDES.exists():
        return json.loads(OVERRIDES.read_text())
    return {}


def generate_images_js(crop_ids):
    lines = [
        '// AUTO-GENERATED — do not edit manually',
        '// Public-domain images from Wikimedia Commons (CC BY-SA)',
        '// Attribution: https://commons.wikimedia.org/',
        '',
        'const CROP_IMAGES = {',
    ]
    found = 0
    for cid in sorted(crop_ids):
        for ext in ['jpg', 'png', 'jpeg']:
            p = OUT_DIR / f'{cid}.{ext}'
            if p.exists():
                lines.append(f"  '{cid}': {{ uri: '/crops/{cid}.{ext}' }},")
                found += 1
                break
    lines += ['};', '', 'export default CROP_IMAGES;', '']
    IMAGES_JS.write_text('\n'.join(lines))
    return found


def main():
    sci_map = json.loads(SCI_NAMES.read_text())
    overrides = load_overrides()

    data = json.loads(CROPS_JSON.read_text())
    crops = data.get('crops', data) if isinstance(data, dict) else data
    crops = sorted(crops, key=lambda c: c['id'])

    print(f'═' * 60)
    print(f'AcreLogic — Wikimedia Commons Category Image Fetcher v2')
    print(f'Total crops: {len(crops)}')
    print(f'═' * 60 + '\n')

    results_log = []
    counts = {'✅ commons': 0, '📋 override': 0, '⚠️  kept': 0, '❌ missing': 0}

    for i, crop in enumerate(crops, 1):
        cid = crop['id']
        dest_jpg = OUT_DIR / f'{cid}.jpg'
        print(f'[{i:3}/{len(crops)}] {cid}', end=' ... ')

        # Phase 0: hard overrides (specific file URLs)
        if cid in overrides:
            override_url = overrides[cid]
            ok = download(override_url, dest_jpg)
            status = '📋 override' if ok else '❌ override_fail'
            print(status)
            counts[status.split()[0] + ' override'] = counts.get(status.split()[0] + ' override', 0) + 1
            results_log.append({'id': cid, 'status': status, 'source': override_url[:80]})
            time.sleep(0.2)
            continue

        # Phase 1: already have a good image? Skip re-download
        existing = next((OUT_DIR / f'{cid}.{e}' for e in ['jpg','png'] if (OUT_DIR / f'{cid}.{e}').exists()), None)

        # Always re-fetch (remove old wrong images)
        if existing:
            existing.unlink()

        # Phase 2: query Commons
        info = sci_map.get(cid, {})
        commons_name = info.get('commons', '')
        sci_name = info.get('sci', '')

        if commons_name or sci_name:
            url, src = fetch_for_crop(cid, commons_name, sci_name)
            if url:
                ok = download(url, dest_jpg)
                if ok:
                    print(f'✅ ({src})')
                    counts['✅ commons'] += 1
                    results_log.append({'id': cid, 'status': '✅', 'source': src})
                    time.sleep(0.25)
                    continue
        
        print('❌ missing')
        counts['❌ missing'] += 1
        results_log.append({'id': cid, 'status': '❌', 'source': ''})
        time.sleep(0.25)

    # Generate cropImages.js
    all_ids = [c['id'] for c in crops]
    covered = generate_images_js(all_ids)

    print(f'\n{"─"*50}')
    print(f'Summary:')
    for k, v in counts.items():
        print(f'  {k}: {v}')
    print(f'cropImages.js: {covered}/512 crops with images')

    missing = [r['id'] for r in results_log if '❌' in r['status']]
    if missing:
        print(f'\n⚠️  Still missing ({len(missing)}):')
        for mid in missing:
            print(f'   - {mid}')


if __name__ == '__main__':
    main()
