#!/usr/bin/env python3
"""
fetch_inaturalist_images.py
═══════════════════════════
Fetches real, CC-licensed plant photos from iNaturalist for AcreLogic crops.

iNaturalist has millions of verified plant observations with Creative Commons
licenses — free to use commercially with attribution. This replaces AI-generated
images with actual field photos of the real plants/varieties.

Usage:
    # Fill only missing images (safe default):
    python3 scripts/fetch_inaturalist_images.py

    # Regenerate specific crops:
    python3 scripts/fetch_inaturalist_images.py --crops pepper_shishito,pepper_padron,melon_crenshaw

    # Force overwrite all:
    python3 scripts/fetch_inaturalist_images.py --force

    # Preview results without saving:
    python3 scripts/fetch_inaturalist_images.py --dry-run

How it works:
    1. Searches iNaturalist Observations API by taxon name
    2. Filters to research-grade observations with CC licenses
    3. Picks highest-quality photo (sorted by faves + quality)
    4. Downloads and saves to public/crops/{crop_id}.png
"""
import os, sys, json, time, pathlib, urllib.request, urllib.parse, argparse
import ssl, base64

# ── Config ────────────────────────────────────────────────────────────────────
CROPS_DIR  = pathlib.Path(__file__).parent.parent / 'public' / 'crops'
CROPS_JSON = pathlib.Path(__file__).parent.parent / 'src' / 'data' / 'crops.json'
INATURALIST_API = 'https://api.inaturalist.org/v1'

# Disable SSL verification for macOS compatibility (same fix we use for other scripts)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode    = ssl.CERT_NONE

# ── Taxon search map ──────────────────────────────────────────────────────────
# Maps crop_id → best iNaturalist taxon search term.
# Uses scientific names where possible for highest-accuracy results.
# Add more entries here as needed.
TAXON_MAP = {
    # Nightshades
    'pepper_shishito':           'Capsicum annuum shishito',
    'pepper_padron':             'Capsicum annuum Padrón',
    'pepper_jalapeño':           'Capsicum annuum jalapeño',
    'pepper_sweet':              'Capsicum annuum bell pepper',
    'pepper_anaheim':            'Capsicum annuum Anaheim',
    'pepper_poblano':            'Capsicum annuum poblano',
    'pepper_serrano':            'Capsicum annuum serrano',
    'pepper_cayenne':            'Capsicum annuum cayenne',
    'pepper_ghost':              'Capsicum chinense bhut jolokia',
    'pepper_habanero':           'Capsicum chinense habanero',
    'pepper_banana':             'Capsicum annuum banana pepper',
    'pepper_thai_bird':          'Capsicum annuum bird pepper',
    'pepper_aji_amarillo':       'Capsicum baccatum aji amarillo',
    'eggplant_ichiban':          'Solanum melongena eggplant',
    'eggplant_white':            'Solanum melongena white eggplant',
    'eggplant_thai':             'Solanum melongena thai eggplant',
    'japanese_eggplant':         'Solanum melongena japanese eggplant',
    'tomato_roma':               'Solanum lycopersicum roma tomato',
    'tomato_san_marzano':        'Solanum lycopersicum san marzano',
    'tomato_heirloom_beefsteak': 'Solanum lycopersicum beefsteak tomato',
    'cherry_tomato_sungold':     'Solanum lycopersicum cherry tomato',
    'tomatillo_grande':          'Physalis philadelphica tomatillo',
    'ground_cherry_cossack':     'Physalis pruinosa ground cherry',
    # Cucurbits
    'melon_crenshaw':            'Cucumis melo Crenshaw melon',
    'butternut_squash':          'Cucurbita moschata butternut squash',
    'delicata_squash':           'Cucurbita pepo delicata squash',
    'squash_acorn':              'Cucurbita pepo acorn squash',
    'kabocha_squash':            'Cucurbita maxima kabocha squash',
    'luffa_gourd':               'Luffa aegyptiaca luffa',
    'bitter_melon':              'Momordica charantia bitter melon',
    # Greens
    'dandelion_greens':          'Taraxacum officinale dandelion',
    'kalettes':                  'Brassica oleracea kalettes',
    'tatsoi':                    'Brassica rapa tatsoi',
    'mizuna':                    'Brassica rapa mizuna',
    'mache_vit':                 'Valerianella locusta mâche',
    'sorrel_french':             'Rumex acetosa sorrel',
    'radicchio':                 'Cichorium intybus radicchio',
    'agretti':                   'Salsola soda agretti',
    'glasswort':                 'Salicornia glasswort',
    'watercress_standard':       'Nasturtium officinale watercress',
    # Brassicas
    'kohlrabi_white_vienna':     'Brassica oleracea kohlrabi',
    'collards_champion':         'Brassica oleracea collard greens',
    'nine_star_broccoli':        'Brassica oleracea broccoli',
    # Roots & Tubers
    'scorzonera_standard':       'Scorzonera hispanica scorzonera',
    'parsley_root':              'Petroselinum crispum root parsley',
    'skirret':                   'Sium sisarum skirret',
    'arracacha':                 'Arracacia xanthorrhiza arracacha',
    'mashua':                    'Tropaeolum tuberosum mashua',
    'ulluco':                    'Ullucus tuberosus ulluco',
    'oca':                       'Oxalis tuberosa oca',
    'yacon':                     'Smallanthus sonchifolius yacon',
    'taro_standard':             'Colocasia esculenta taro',
    # Specialty
    'lisianthus_echo':           'Eustoma grandiflorum lisianthus',
    'quinoa_brightest':          'Chenopodium quinoa quinoa',
    'foxglove_standard':         'Digitalis purpurea foxglove',
    'celery_par_cel':            'Apium graveolens cutting celery',
    'lotus_root':                'Nelumbo nucifera lotus root',
    'water_chestnut':            'Eleocharis dulcis water chestnut',
    'wakame':                    'Undaria pinnatifida wakame',
    'wasabi':                    'Eutrema japonicum wasabi',
    # Alliums
    'walking_onion':             'Allium proliferum walking onion',
    'elephant_garlic':           'Allium ampeloprasum elephant garlic',
    'rocambole_garlic':          'Allium sativum rocambole garlic',
    'garlic_chives':             'Allium tuberosum garlic chives',
    # Flowers
    'scabiosa_pincushion':       'Scabiosa pincushion flower',
    'cynoglossum':               'Cynoglossum amabile chinese forget-me-not',
    'orlaya':                    'Orlaya grandiflora white lace flower',
    'bupleurum':                 'Bupleurum griffithii bupleurum',
    'ammi':                      'Ammi majus bishops flower',
    'craspedia':                 'Craspedia globosa billy buttons',
    'asclepias':                 'Asclepias tuberosa butterfly weed',
    # Herbs
    'lemon_verbena':             'Aloysia citrodora lemon verbena',
    'ashwagandha_standard':      'Withania somnifera ashwagandha',
    'valerian':                  'Valeriana officinalis valerian',
    'licorice_root':             'Glycyrrhiza glabra licorice root',
    # Fruit
    'sea_buckthorn':             'Hippophae rhamnoides sea buckthorn',
    'cornelian_cherry':          'Cornus mas cornelian cherry',
    'aronia_chokeberry':         'Aronia arbutifolia aronia',
    # Grains
    'taro_standard':             'Colocasia esculenta taro',
}

# ── Priority list (user-flagged bad images) ───────────────────────────────────
PRIORITY_CROPS = [
    'pepper_shishito', 'pepper_padron', 'melon_crenshaw',
    'dandelion_greens', 'kalettes', 'delicata_squash',
    'taro_standard', 'tomato_roma', 'lisianthus_echo',
    'quinoa_brightest', 'foxglove_standard', 'celery_par_cel',
    'scorzonera_standard',
]

# ── iNaturalist API functions ─────────────────────────────────────────────────
def search_taxon(taxon_name):
    """Find taxon ID for a scientific/common name."""
    params = urllib.parse.urlencode({'q': taxon_name, 'per_page': 1})
    url = f"{INATURALIST_API}/taxa?{params}"
    try:
        with urllib.request.urlopen(url, context=SSL_CTX, timeout=10) as r:
            data = json.loads(r.read())
        results = data.get('results', [])
        if results:
            return results[0]['id'], results[0].get('name', taxon_name)
        return None, None
    except Exception as e:
        print(f"    ⚠ Taxon search failed for '{taxon_name}': {e}")
        return None, None

def fetch_best_photo(taxon_id, taxon_name_fallback):
    """
    Fetch the highest-quality CC-licensed observation photo for a taxon.
    Prefers: research-grade, most-faved, license=CC-BY or CC-BY-NC.
    """
    # Try with taxon_id first, then fall back to taxon_name search
    endpoints = []
    if taxon_id:
        params = urllib.parse.urlencode({
            'taxon_id': taxon_id,
            'quality_grade': 'research',
            'license': 'cc-by,cc-by-nc,cc-by-sa,cc-by-nc-sa',
            'photos': 'true',
            'per_page': 10,
            'order_by': 'votes',
            'order': 'desc',
        })
        endpoints.append(f"{INATURALIST_API}/observations?{params}")

    # Fallback: search by name
    params2 = urllib.parse.urlencode({
        'taxon_name': taxon_name_fallback.split()[0] + ' ' + (taxon_name_fallback.split()[1] if len(taxon_name_fallback.split()) > 1 else ''),
        'quality_grade': 'research',
        'license': 'cc-by,cc-by-nc,cc-by-sa,cc-by-nc-sa',
        'photos': 'true',
        'per_page': 5,
        'order_by': 'votes',
        'order': 'desc',
    })
    endpoints.append(f"{INATURALIST_API}/observations?{params2}")

    for url in endpoints:
        try:
            with urllib.request.urlopen(url, context=SSL_CTX, timeout=15) as r:
                data = json.loads(r.read())
            observations = data.get('results', [])
            for obs in observations:
                photos = obs.get('photos', [])
                if photos:
                    # Get the medium/large URL
                    photo_url = photos[0].get('url', '')
                    if photo_url:
                        # Replace 'square' with 'medium' for better resolution
                        photo_url = photo_url.replace('square', 'medium').replace('/square', '/medium')
                        license_code = photos[0].get('license_code', 'unknown')
                        attribution = photos[0].get('attribution', '')
                        return photo_url, license_code, attribution
        except Exception as e:
            print(f"    ⚠ Observation fetch failed: {e}")
            continue

    return None, None, None

def download_image(url, output_path):
    """Download image from URL and save as PNG."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'AcreLogic/1.0 (crop imagery; contact@acrelogic.com)'})
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=20) as r:
            img_bytes = r.read()
        output_path.write_bytes(img_bytes)
        return True
    except Exception as e:
        print(f"    ✗ Download failed: {e}")
        return False

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Fetch CC-licensed plant photos from iNaturalist')
    parser.add_argument('--crops',    help='Comma-separated crop IDs to fetch (default: all in TAXON_MAP)')
    parser.add_argument('--force',    action='store_true', help='Overwrite existing images')
    parser.add_argument('--priority', action='store_true', help='Only process priority (user-flagged bad) crops')
    parser.add_argument('--dry-run',  action='store_true', help='Print what would be fetched, do not save')
    args = parser.parse_args()

    CROPS_DIR.mkdir(parents=True, exist_ok=True)

    # Determine which crops to process
    if args.crops:
        target_ids = [c.strip() for c in args.crops.split(',')]
    elif args.priority:
        target_ids = PRIORITY_CROPS
    else:
        target_ids = list(TAXON_MAP.keys())

    # Filter to those with taxon mappings
    todo = [(cid, TAXON_MAP[cid]) for cid in target_ids if cid in TAXON_MAP]
    if not todo:
        print("No crops to process (check TAXON_MAP for missing entries)")
        sys.exit(0)

    # Filter out existing unless --force
    if not args.force:
        todo = [(cid, name) for cid, name in todo if not (CROPS_DIR / f"{cid}.png").exists()]
        if not todo:
            print("✅ All targeted crops already have images. Use --force to overwrite.")
            sys.exit(0)

    print(f"\n🌿 iNaturalist fetch: {len(todo)} crops {'(dry run)' if args.dry_run else ''}\n")

    success, failed, skipped = [], [], []
    attr_log = []  # Attribution log for CC compliance

    for i, (crop_id, taxon_query) in enumerate(todo):
        out_path = CROPS_DIR / f"{crop_id}.png"
        print(f"  [{i+1}/{len(todo)}] {crop_id}")
        print(f"    🔍 Searching: '{taxon_query}'")

        if args.dry_run:
            print(f"    ✓ [DRY RUN] Would search iNaturalist for: {taxon_query}")
            success.append(crop_id)
            continue

        # Find taxon ID
        taxon_id, scientific_name = search_taxon(taxon_query)
        if taxon_id:
            print(f"    ✓ Taxon: {scientific_name} (id={taxon_id})")
        else:
            print(f"    ⚠ No taxon found — trying direct observation search")

        # Fetch best photo
        photo_url, license_code, attribution = fetch_best_photo(taxon_id, taxon_query)
        if not photo_url:
            print(f"    ✗ No CC-licensed photo found — skipping")
            failed.append(crop_id)
            time.sleep(1)
            continue

        print(f"    📷 License: {license_code}")
        print(f"    🔗 URL: {photo_url[:80]}...")

        # Download
        if download_image(photo_url, out_path):
            print(f"    ✓ Saved → {out_path.name}")
            success.append(crop_id)
            attr_log.append({'crop_id': crop_id, 'license': license_code, 'attribution': attribution, 'url': photo_url})
        else:
            failed.append(crop_id)

        time.sleep(1.5)  # iNaturalist rate limit: be respectful

    # Save attribution log (CC compliance)
    if attr_log and not args.dry_run:
        log_path = CROPS_DIR.parent.parent / 'scripts' / 'inaturalist_attributions.json'
        existing = []
        if log_path.exists():
            try:
                existing = json.loads(log_path.read_text())
            except:
                pass
        # Merge (update existing entries by crop_id)
        existing_ids = {e['crop_id'] for e in existing}
        merged = [e for e in existing if e['crop_id'] not in {a['crop_id'] for a in attr_log}] + attr_log
        log_path.write_text(json.dumps(merged, indent=2))
        print(f"\n📋 Attribution log saved: {log_path}")

    print(f"\n✅ Done: {len(success)} fetched, {len(failed)} failed, {len(skipped)} skipped")
    if failed:
        print("Still need (no iNaturalist photo found — use DALL-E for these):")
        for f in failed:
            print(f"  - {f}")
    else:
        print("🎉 All done! Run 'npm run deploy' to publish.")

if __name__ == '__main__':
    main()
