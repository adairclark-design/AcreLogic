#!/usr/bin/env python3
"""
fetch_wikipedia_crop_images.py
═══════════════════════════════════════════════════════════════════════
Downloads public-domain crop images from Wikipedia/Wikimedia Commons
for all 512 AcreLogic crop IDs.

Usage:
    python3 execution/fetch_wikipedia_crop_images.py

Outputs:
    public/crops/<crop_id>.jpg   — downloaded & resized image
    .tmp/image_fetch_log.csv     — status of every crop
    src/data/cropImages.js       — auto-generated import map

License note:
    Wikimedia Commons images are CC-BY-SA or CC0. Commercial use is
    allowed. Add to app footer: "Images: Wikimedia Commons (CC BY-SA)"
"""

import json
import os
import time
import csv
import urllib.request
import urllib.parse
import ssl
import shutil
from pathlib import Path

# ─── Paths ───────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent.parent
CROPS_JSON = BASE_DIR / 'src' / 'data' / 'crops.json'
OUT_DIR    = BASE_DIR / 'public' / 'crops'
LOG_DIR    = BASE_DIR / '.tmp'
LOG_FILE   = LOG_DIR / 'image_fetch_log.csv'
IMAGES_JS  = BASE_DIR / 'src' / 'data' / 'cropImages.js'

OUT_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ─── SSL context (bypass macOS cert issue in dev) ────────────────────
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'AcreLogic/1.0 (hello@acrelogic.com) crop-image-fetcher'}

# ─── Wikipedia title overrides ───────────────────────────────────────
# Maps crop_id → exact Wikipedia article title for best accuracy.
# Only needed when the crop name alone doesn't resolve to a good image.
WIKI_TITLE_MAP = {
    # Alliums
    'garlic_music':            'Garlic',
    'rocambole_garlic':        'Garlic',
    'scallions_evergreen':     'Scallion',
    'japanese_bunching_onion': 'Welsh onion',
    'walking_onion':           'Tree onion',
    'torpedo_onion':           'Onion',
    'sweet_onion':             'Vidalia onion',
    'pickling_onion':          'Pickling onion',
    'potato_onion':            'Multiplier onion',
    'shallots_ambition':       'Shallot',
    'leek_giant_musselburgh':  'Leek',

    # Brassicas
    'broccoli_belstar':        'Broccoli',
    'broccoli_raab':           'Rapini',
    'brussels_sprouts':        'Brussels sprout',
    'cabbage_storage':         'Cabbage',
    'red_cabbage':             'Red cabbage',
    'savoy_cabbage':           'Savoy cabbage',
    'napa_cabbage':            'Napa cabbage',
    'kale_red_russian':        'Kale',
    'red_russian_kale':        'Red Russian kale',
    'lacinato_kale':           'Lacinato kale',
    'siberian_kale':           'Kale',
    'perennial_kale':          'Daubenton kale',
    'portuguese_kale':         'Portuguese kale',
    'kohlrabi_kolibri':        'Kohlrabi',
    'kohlrabi_white_vienna':   'Kohlrabi',
    'bok_choy':                'Bok choy',
    'pac_choi_green':          'Bok choy',
    'pac_choi_joi':            'Bok choy',
    'arugula_standard':        'Arugula',
    'mizuna_standard':         'Mizuna',
    'tatsoi_standard':         'Tatsoi',
    'mustard_red_giant':       'Mustard plant',
    'mustard_seed':            'Mustard seed',
    'komatsuna':               'Komatsuna',
    'nine_star_broccoli':      'Nine Star Perennial Broccoli',
    'romanesco':               'Romanesco broccoli',
    'rutabaga_laurentian':     'Rutabaga',
    'swede':                   'Rutabaga',
    'turnip_hakurei':          'Turnip',
    'turnip_purple_top':       'Turnip',
    'kalettes':                'Flower sprouts',
    'tyfon':                   'Turnip',

    # Nightshades
    'tomato_amish_paste':       'Tomato',
    'tomato_black_cherry':      'Cherry tomato',
    'tomato_black_krim':        'Tomato',
    'tomato_celebrity':         'Tomato',
    'tomato_cherokee_purple':   'Heirloom tomato',
    'tomato_early_girl':        'Tomato',
    'tomato_green_zebra':       'Tomato',
    'tomato_heirloom_beefsteak':'Beefsteak tomato',
    'tomato_juliet':            'Grape tomato',
    'tomato_large_red_cherry':  'Cherry tomato',
    'tomato_mortgage_lifter':   'Heirloom tomato',
    'tomato_roma':              'Plum tomato',
    'tomato_san_marzano':       'San Marzano tomato',
    'tomato_yellow_brandywine': 'Heirloom tomato',
    'tomato_yellow_pear':       'Cherry tomato',
    'pepper_jalapeño':          'Jalapeño',
    'pepper_anaheim':           'Anaheim pepper',
    'pepper_banana':            'Banana pepper',
    'pepper_cayenne':           'Cayenne pepper',
    'pepper_chocolate_bell':    'Bell pepper',
    'pepper_cubanelle':         'Cubanelle',
    'pepper_fresno':            'Fresno chili',
    'pepper_ghost':             'Ghost pepper',
    'pepper_mini_sweet':        'Bell pepper',
    'pepper_padron':            'Padrón pepper',
    'pepper_pepperoncini':      'Pepperoncini',
    'pepper_poblano':           'Poblano',
    'pepper_serrano':           'Serrano pepper',
    'pepper_shishito':          'Shishito',
    'pepper_sweet':             'Bell pepper',
    'pepper_thai_bird':         'Bird\'s eye chili',
    'pepper_aji_amarillo':      'Ají amarillo',
    'hot_pepper_habanero':      'Habanero',
    'tomatillo_grande':         'Tomatillo',
    'japanese_eggplant':        'Japanese eggplant',

    # Cucurbits
    'zucchini_black_beauty':    'Zucchini',
    'squash_acorn':             'Acorn squash',
    'squash_blue_hubbard':      'Hubbard squash',
    'squash_butternut_new':     'Butternut squash',
    'butternut_squash':         'Butternut squash',
    'squash_cinderella':        'Cinderella pumpkin',
    'squash_cousa':             'Zucchini',
    'squash_delicata_new':      'Delicata squash',
    'squash_kabocha_new':       'Kabocha',
    'kabocha_squash':           'Kabocha',
    'squash_lemon':             'Yellow squash',
    'squash_red_kuri':          'Red kuri squash',
    'squash_round_zucchini':    'Zucchini',
    'squash_spaghetti':         'Spaghetti squash',
    'squash_sugar_pie_pumpkin': 'Pumpkin',
    'squash_sweet_dumpling':    'Sweet dumpling squash',
    'squash_tromboncino':       'Tromboncino',
    'squash_yellow_crookneck':  'Yellow squash',
    'pumpkin_jack':             'Jack-o\'-lantern',
    'summer_squash_pattypan':   'Patty pan squash',
    'melon_hales_best':         'Cantaloupe',
    'melon_charentais':         'Charentais cantaloupe',
    'melon_crenshaw':           'Crenshaw melon',
    'melon_galia':              'Galia melon',
    'melon_honeydew':           'Honeydew melon',
    'melon_honeydew_orange':    'Honeydew melon',
    'melon_canary':             'Canary melon',
    'watermelon_moon_stars':    'Watermelon',
    'watermelon_sugar_baby':    'Watermelon',
    'watermelon_yellow_doll':   'Watermelon',
    'bitter_melon':             'Bitter melon',
    'luffa_gourd':              'Luffa',

    # Greens / Lettuce
    'lettuce_mix':              'Mesclun',
    'lettuce_bibb':             'Bibb lettuce',
    'lettuce_butterhead':       'Butterhead lettuce',
    'lettuce_deer_tongue':      'Lettuce',
    'lettuce_flashy_trout':     'Lettuce',
    'lettuce_iceberg':          'Iceberg lettuce',
    'lettuce_little_gem':       'Gem lettuce',
    'lettuce_lolla_rossa':      'Lollo rosso',
    'lettuce_oakleaf_green':    'Oakleaf lettuce',
    'lettuce_oakleaf_red':      'Oakleaf lettuce',
    'lettuce_romaine_red':      'Romaine lettuce',
    'spinach_space':            'Spinach',
    'asian_mix':                'Mesclun',
    'malabar_spinach':          'Malabar spinach',
    'new_zealand_spinach':      'New Zealand spinach',
    'perpetual_spinach':        'Spinach beet',
    'fris_e':                   'Frisée',
    'radicchio_rossa':          'Radicchio',
    'belgian_endive':           'Belgian endive',
    'mache_vit':                'Corn salad',
    'sorrel_french':            'Common sorrel',
    'orach_red':                'Orache',
    'amaranth_greens':          'Amaranth',
    'purslane_golden':          'Common purslane',
    'good_king_henry':          'Good King Henry',
    'watercress_standard':      'Watercress',
    'ground_elder':             'Ground elder',
    'shoots':                   'Microgreen',
    'shungiku':                 'Glebionis coronaria',

    # Roots / Tubers
    'radish_french_breakfast':  'Radish',
    'black_radish':             'Black radish',
    'watermelon_radish':        'Daikon',
    'purple_daikon':            'Daikon',
    'tillage_radish':           'Daikon',
    'beet_chioggia':            'Beetroot',
    'beet_golden':              'Beetroot',
    'parsnip_harris':           'Parsnip',
    'salsify_mammoth':          'Salsify',
    'scorzonera_standard':      'Scorzonera',
    'burdock_gobo':             'Burdock',
    'arracacha':                'Arracacha',
    'oca_standard':             'Oca',
    'mashua':                   'Tropaeolum tuberosum',
    'ulluco':                   'Ulluco',
    'yacon':                    'Yacon',
    'jicama_standard':          'Jicama',
    'tiger_nut':                'Chufa sedge',
    'taro_standard':            'Taro',
    'lotus_root':               'Nelumbo nucifera',
    'water_chestnut':           'Water chestnut',
    'ginger_rhizome':           'Ginger',
    'turmeric_standard':        'Turmeric',
    'horseradish_standard':     'Horseradish',
    'skirret':                  'Skirret',
    'maca':                     'Maca',
    'rutabaga_laurentian':      'Rutabaga',

    # Potatoes
    'potato_fingerling':        'Fingerling potato',
    'potato_german_butterball': 'Yellow potato',
    'potato_purple_majesty':    'Purple Majesty potato',
    'potato_red_norland':       'Potato',
    'potato_russet':            'Russet Burbank potato',
    'sweet_potato_beauregard':  'Sweet potato',

    # Legumes
    'beans_green_bush':         'Green bean',
    'bean_black':               'Black turtle bean',
    'bean_cannellini':          'Cannellini bean',
    'bean_dragon_tongue':       'Wax bean',
    'bean_haricot_vert':        'Haricot vert',
    'bean_kidney':              'Kidney bean',
    'bean_lima_fordhook':       'Lima bean',
    'bean_lima_henderson':      'Lima bean',
    'bean_navy':                'Navy bean',
    'bean_pinto':               'Pinto bean',
    'bean_pole_kentucky_wonder':'Pole bean',
    'bean_pole_rattlesnake':    'Pole bean',
    'bean_purple_wax':          'Wax bean',
    'bean_yard_long':           'Yardlong bean',
    'bean_yellow_wax':          'Wax bean',
    'peas_sugar_snap':          'Sugar snap pea',
    'snap_peas_cascadia':       'Sugar snap pea',
    'snow_pea_mammoth':         'Snow pea',
    'runner_beans':             'Runner bean',
    'scarlet_runner_bean':      'Runner bean',
    'soybean':                  'Soybean',
    'soybeans_midori':          'Edamame',
    'mung_bean':                'Mung bean',
    'adzuki_bean':              'Adzuki bean',
    'lentil_beluga':            'Lentil',
    'lentil_red_chief':         'Lentil',
    'black_eyed_pea':           'Black-eyed pea',
    'chickpea_kabuli':          'Chickpea',
    'pigeon_pea':               'Pigeon pea',
    'purple_hull_pea':          'Southern pea',
    'tepary_bean':              'Tepary bean',
    'hyacinth_bean':            'Lablab',
    'lupin':                    'Lupin',
    'lupine':                   'Lupinus',
    'austrian_winter_pea':      'Field pea',
    'hairy_vetch':              'Hairy vetch',
    'berseem_clover':           'Berseem clover',
    'astragalus':               'Astragalus',
    'sunn_hemp':                'Sunn hemp',
    'annual_ryegrass':          'Annual ryegrass',

    # Herbs
    'basil_genovese':            'Basil',
    'basil_lemon':               'Lemon basil',
    'basil_purple':              'Purple basil',
    'basil_thai':                'Thai basil',
    'holy_basil':                'Holy basil',
    'african_blue_basil':        'African blue basil',
    'lime_basil':                'Basil',
    'rosemary_tuscan_blue':      'Rosemary',
    'thyme_english':             'Thyme',
    'lemon_thyme':               'Lemon thyme',
    'sage_garden':               'Common sage',
    'oregano_greek':             'Oregano',
    'marjoram_standard':         'Marjoram',
    'summer_savory':             'Summer savory',
    'winter_savory':             'Winter savory',
    'savory':                    'Savory',
    'tarragon_french':           'Tarragon',
    'parsley_flat_leaf':         'Parsley',
    'parsley_root':              'Hamburg parsley',
    'cilantro_standard':         'Coriander',
    'dill_standard':             'Dill',
    'fennel_standard':           'Fennel',
    'lovage_standard':           'Lovage',
    'angelica':                  'Angelica',
    'anise_hyssop':              'Anise hyssop',
    'chervil_standard':          'Chervil',
    'lemon_balm':                'Lemon balm',
    'lemon_verbena':             'Lemon verbena',
    'lemongrass_standard':       'Lemongrass',
    'mint_peppermint':           'Peppermint',
    'mint_spearmint':            'Spearmint',
    'mint_apple':                'Apple mint',
    'korean_mint':               'Agastache rugosa',
    'mountain_mint':             'Pycnanthemum',
    'bergamot':                  'Bergamot orange',
    'bee_balm':                  'Monarda didyma',
    'monarda':                   'Monarda',
    'pineapple_sage':            'Salvia elegans',
    'black_sage':                'Salvia mellifera',
    'hyssop':                    'Hyssop',
    'agastache':                 'Agastache',
    'chamomile_german':          'Chamomile',
    'roman_chamomile':           'Roman chamomile',
    'calendula_erfurter':        'Calendula officinalis',
    'stevia_standard':           'Stevia',
    'ashwagandha_standard':      'Ashwagandha',
    'ginseng':                   'Ginseng',
    'goldenseal':                'Goldenseal',
    'milk_thistle':              'Silybum marianum',
    'skullcap':                  'Scutellaria',
    'valerian':                  'Valerian (herb)',
    'motherwort':                'Motherwort',
    'rue':                       'Common rue',
    'wormwood':                  'Artemisia absinthium',
    'mugwort':                   'Mugwort',
    'blue_vervain':              'Verbena hastata',
    'verbena':                   'Verbena',
    'wood_betony':               'Betony',
    'skullcap':                  'Scutellaria',
    'licorice_root':             'Liquorice',
    'marshmallow_root':          'Althaea officinalis',
    'nettle':                    'Urtica dioica',
    'plantain_herb':             'Plantago',
    'spilanthes':                'Acmella oleracea',
    'rhodiola':                  'Rhodiola',
    'st_john_s_wort':            "St John's wort",
    'sweet_cicely':              'Sweet cicely',
    'lovage_standard':           'Lovage',
    'salad_burnet':              'Salad burnet',
    'good_king_henry':           'Good King Henry',
    'wood_sorrel':               'Oxalis',
    'shiso':                     'Perilla frutescens',
    'vietnamese_coriander':      'Vietnamese coriander',
    'garlic_chives':             'Chinese chives',
    'ramps_wild':                'Allium tricoccum',
    'tulsi':                     'Holy basil',

    # Grains
    'wheat_hard_red':           'Common wheat',
    'winter_wheat':             'Common wheat',
    'spring_barley':            'Barley',
    'barley_hulless':           'Barley',
    'oats_naked':               'Oat',
    'spelt_standard':           'Spelt',
    'quinoa_brightest':         'Quinoa',
    'amaranth_grain':           'Amaranth grain',
    'buckwheat_grain':          'Buckwheat',
    'teff_standard':            'Teff',
    'milo':                     'Sorghum bicolor',
    'sorghum':                  'Sorghum bicolor',
    'sorghum_sweet':            'Sweet sorghum',
    'pearl_millet':             'Pearl millet',
    'triticale':                'Triticale',
    'winter_rye':               'Rye',
    'canola':                   'Rapeseed',

    # Cover Crops
    'cover_crop_sudangrass':    'Sudan grass',
    'cover_crop_oats':          'Oat',
    'phacelia_cover':           'Phacelia',

    # Flowers
    'zinnia_benary_giant':      'Zinnia',
    'sunflower_holiday':        'Sunflower',
    'marigold_french':          'French marigold',
    'nasturtium_jewel':         'Nasturtium',
    'calendula_erfurter':       'Pot marigold',
    'larkspur_giant':           'Delphinium',
    'snapdragon_rocket':        'Antirrhinum',
    'bachelor_button':          "Bachelor's button",
    'sweet_pea_standard':       'Sweet pea',
    'cosmos_standard':          'Cosmos (plant)',
    'celosia_standard':         'Celosia',
    'statice_QIS':              'Limonium sinuatum',
    'statice_sinuata':          'Limonium sinuatum',
    'strawflower_apricot':      'Helichrysum bracteatum',
    'anemone_standard':         'Anemone',
    'ranunculus_standard':      'Ranunculus',
    'lisianthus_echo':          'Eustoma',
    'scabiosa_pincushion':      'Scabiosa',
    'gypsophila':               'Gypsophila',
    'ammi':                     'Ammi majus',
    'orlaya':                   'Orlaya grandiflora',
    'bupleurum':                'Bupleurum rotundifolium',
    'rudbeckia_standard':       'Rudbeckia',
    'asclepias':                'Asclepias',
    'liatris_spicata':          'Liatris spicata',
    'agrostemma':               'Agrostemma githago',
    'ammobium':                 'Ammobium alatum',
    'helipterum':               'Rhodanthe',
    'xeranthemum':              'Xeranthemum',
    'gomphrena':                'Gomphrena',
    'globe_amaranth':           'Gomphrena globosa',
    'bells_of_ireland':         'Moluccella laevis',
    'nicotiana':                'Ornamental tobacco',
    'morning_glory':            'Ipomoea purpurea',
    'phlox':                    'Phlox',
    'hollyhock':                'Alcea',
    'stock':                    'Matthiola incana',
    'sweet_pea_standard':       'Lathyrus odoratus',
    'alyssum':                  'Lobularia maritima',
    'ageratum':                 'Ageratum houstonianum',
    'portulaca':                'Portulaca grandiflora',
    'tulip':                    'Tulip',
    'passionflower':            'Passiflora',
    'matricaria':               'Matricaria',
    'poppy':                    'Papaver',
    'saponaria':                'Saponaria',
    'tithonia':                 'Tithonia rotundifolia',
    'mexican_sunflower':        'Tithonia rotundifolia',
    'mexican_mint_marigold':    'Tagetes lucida',
    'yarrow':                   'Achillea millefolium',
    'hyacinth_bean':            'Lablab purpureus',
    'phacelia':                 'Phacelia',

    # Fruits
    'strawberry_alpine':        'Alpine strawberry',
    'strawberry_seascape':      'Strawberry',
    'raspberry_everbearing':    'Raspberry',
    'blackberry':               'Blackberry',
    'blackberry_thornless':     'Blackberry',
    'blueberry':                'Blueberry',
    'gooseberry':               'Gooseberry',
    'jostaberry':               'Jostaberry',
    'lingonberry':              'Lingonberry',
    'honeyberry':               'Haskap berry',
    'honeyberry_standard':      'Haskap berry',
    'huckleberry':              'Huckleberry',
    'beach_plum':               'Beach plum',
    'nanking_cherry':           'Prunus tomentosa',
    'aronia_chokeberry':        'Chokeberry',
    'autumn_olive':             'Autumn olive',
    'sea_buckthorn':            'Sea buckthorn',
    'goji_berry':               'Goji',
    'wolfberry':                'Wolfberry',
    'medlar':                   'Medlar',
    'quince':                   'Quince',
    'serviceberry':             'Amelanchier',
    'juneberry':                'Amelanchier',
    'hardy_kiwi':               'Hardy kiwi',
    'pawpaw':                   'Pawpaw',
    'persimmon':                'Persimmon',
    'mulberry':                 'Mulberry',
    'ground_cherry_cossack':    'Ground cherry',
    'husk_cherry':              'Physalis',

    # Specialty
    'asparagus_mary_washington': 'Asparagus',
    'asparagus_millennium':      'Asparagus',
    'asparagus_purple':          'Asparagus',
    'artichoke':                 'Globe artichoke',
    'artichoke_imperial':        'Globe artichoke',
    'artichoke_violetto':        'Globe artichoke',
    'artichoke_jerusalem':       'Jerusalem artichoke',
    'okra_clemson':              'Okra',
    'okra_red':                  'Okra',
    'rhubarb_victoria':          'Rhubarb',
    'glasswort':                 'Salicornia',
    'agretti':                   'Salsola soda',
    'samphire':                  'Rock samphire',
    'wakame':                    'Wakame',
    'sea_purslane':             'Atriplex portulacoides',
    'wasabi':                    'Wasabi',
    'popcorn_robust':            'Popcorn',
    'corn_sweet_bicolor':       'Sweet corn',
    'corn_sweet_white':          'Sweet corn',
    'corn_sweet_yellow':         'Sweet corn',
    'taro_standard':             'Taro',
    'lotus_root':                'Sacred lotus',
    'sunchoke_stampede':         'Jerusalem artichoke',
    'atriplex':                  'Atriplex',
    'saltwort':                  'Salsola',
    'glasswort':                 'Salicornia europaea',

    # Misc
    'canola':                   'Rapeseed',
    'gai_lan':                  'Gai lan',
    'yu_choy':                  'Choy sum',
    'safflower':                'Safflower',
    'saffron_crocus':           'Crocus sativus',
    'lavender_hidcote':         'Lavender',
    'chamomile_german':         'Chamomile',
}


def wiki_search_title(crop_id: str, crop_name: str) -> str:
    """Return the Wikipedia article title to search for this crop."""
    if crop_id in WIKI_TITLE_MAP:
        return WIKI_TITLE_MAP[crop_id]
    return crop_name


def fetch_wiki_image_url(title: str, size: int = 600) -> str | None:
    """Query Wikipedia API for the lead image of an article."""
    encoded = urllib.parse.quote(title)
    url = (
        f'https://en.wikipedia.org/w/api.php?action=query'
        f'&titles={encoded}&prop=pageimages&format=json'
        f'&pithumbsize={size}'
    )
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10, context=CTX) as r:
            data = json.loads(r.read())
        pages = data.get('query', {}).get('pages', {})
        for page in pages.values():
            thumb = page.get('thumbnail')
            if thumb:
                return thumb['source']
    except Exception as e:
        print(f'    [wiki] ERROR for "{title}": {e}')
    return None


def download_image(url: str, dest_path: Path) -> bool:
    """Download image from url → dest_path. Returns True on success."""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15, context=CTX) as r:
            data = r.read()
        dest_path.write_bytes(data)
        return True
    except Exception as e:
        print(f'    [download] ERROR: {e}')
        return False


def process_crop(crop: dict, results: list) -> str:
    """Fetch and save image for one crop. Returns status string."""
    crop_id   = crop['id']
    crop_name = crop.get('name', crop_id)
    dest_path = OUT_DIR / f'{crop_id}.jpg'

    # 1. Try exact Wikipedia title mapping / crop name
    wiki_title = wiki_search_title(crop_id, crop_name)
    img_url = fetch_wiki_image_url(wiki_title)

    # 2. Fallback: try base name without variety suffix
    if not img_url and '_' in crop_id:
        base = crop_id.split('_')[0].title()
        img_url = fetch_wiki_image_url(base)

    # 3. Fallback: use existing image if present (keep old one)
    existing_exts = ['.jpg', '.png', '.jpeg']
    existing = None
    for ext in existing_exts:
        p = OUT_DIR / f'{crop_id}{ext}'
        if p.exists() and p.suffix != '.jpg':
            existing = p
            break
        elif (OUT_DIR / f'{crop_id}.jpg').exists():
            existing = OUT_DIR / f'{crop_id}.jpg'
            break

    if img_url:
        ok = download_image(img_url, dest_path)
        status = '✅ wikipedia' if ok else '⚠️  download_failed'
        source = img_url[:80]
    elif existing:
        # rename PNG to JPG if needed
        if existing.suffix != '.jpg':
            shutil.copy2(existing, dest_path)
        status = '⚠️  kept_existing'
        source = str(existing.name)
    else:
        status = '❌ missing'
        source = ''

    print(f'  {status}  {crop_id}')
    results.append({
        'crop_id':   crop_id,
        'crop_name': crop_name,
        'status':    status,
        'wiki_title': wiki_title,
        'source_url': source,
    })
    return status


def generate_images_js(crop_ids: list[str]):
    """Write src/data/cropImages.js referencing all downloaded images."""
    lines = [
        '// AUTO-GENERATED — do not edit manually',
        '// Public-domain images from Wikimedia Commons (CC BY-SA)',
        '// Attribution: https://commons.wikimedia.org/',
        '',
        'const CROP_IMAGES = {',
    ]
    for cid in sorted(crop_ids):
        path = OUT_DIR / f'{cid}.jpg'
        if path.exists():
            lines.append(f"  '{cid}': {{ uri: '/crops/{cid}.jpg' }},")
    lines += [
        '};',
        '',
        'export default CROP_IMAGES;',
        '',
    ]
    IMAGES_JS.write_text('\n'.join(lines))
    print(f'\n✅ Written {IMAGES_JS}')


def main():
    print('═' * 60)
    print('AcreLogic — Wikimedia Commons Crop Image Fetcher')
    print('═' * 60)

    data = json.loads(CROPS_JSON.read_text())
    crops = data.get('crops', data) if isinstance(data, dict) else data
    crops = sorted(crops, key=lambda c: c['id'])

    print(f'Total crops: {len(crops)}\n')

    results = []
    counts  = {'✅ wikipedia': 0, '⚠️  kept_existing': 0, '⚠️  download_failed': 0, '❌ missing': 0}

    for i, crop in enumerate(crops, 1):
        print(f'[{i:3}/{len(crops)}] {crop["id"]}', end=' ...\n')
        status = process_crop(crop, results)
        key = next((k for k in counts if k in status), '❌ missing')
        counts[key] = counts.get(key, 0) + 1
        time.sleep(0.25)  # polite rate limit

    # Write log
    with LOG_FILE.open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['crop_id','crop_name','status','wiki_title','source_url'])
        w.writeheader()
        w.writerows(results)
    print(f'\n📋 Log saved to {LOG_FILE}')

    # Write cropImages.js
    generate_images_js([c['id'] for c in crops])

    # Summary
    print('\n' + '─' * 50)
    print('Summary:')
    for label, count in counts.items():
        print(f'  {label}: {count}')
    print('─' * 50)
    missing = [r for r in results if '❌' in r['status']]
    if missing:
        print(f'\n⚠️  {len(missing)} crops still missing images:')
        for r in missing:
            print(f'   - {r["crop_id"]} ({r["crop_name"]})')


if __name__ == '__main__':
    main()
