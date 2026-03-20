#!/usr/bin/env python3
"""
fetch_pixabay_crop_images.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fetches accurate food/plant photos from Pixabay (CC0 license)
for all 512 AcreLogic crops.

Pixabay API: https://pixabay.com/api/docs/
Key: stored in .env as PIXABAY_API_KEY

Run: python3 execution/fetch_pixabay_crop_images.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json, ssl, time, urllib.request, urllib.parse
from pathlib import Path

BASE_DIR   = Path(__file__).parent.parent
CROPS_JSON = BASE_DIR / 'src' / 'data' / 'crops.json'
ASSETS_DIR = BASE_DIR / 'assets' / 'crops'
IMAGES_JS  = BASE_DIR / 'src' / 'data' / 'cropImages.js'

ASSETS_DIR.mkdir(parents=True, exist_ok=True)

API_KEY = '55095455-8154c1f67de203630354a2de2'

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# ──────────────────────────────────────────────────────────
# Search query map: crop_id → (pixabay_query, category)
# category: 'food' | 'nature' | 'science'
# ──────────────────────────────────────────────────────────
QUERY_MAP = {
    # Leafy greens
    'arugula_standard':      ('arugula rocket leaves',       'food'),
    'spinach_space':         ('spinach leaves green',        'food'),
    'lettuce_mix':           ('lettuce mix salad greens',    'food'),
    'lettuce_butterhead':    ('butterhead lettuce',          'food'),
    'lettuce_bibb':          ('bibb lettuce green',          'food'),
    'lettuce_oakleaf_green': ('oak leaf lettuce green',      'food'),
    'lettuce_oakleaf_red':   ('red oak leaf lettuce',        'food'),
    'lettuce_romaine_red':   ('romaine lettuce red',         'food'),
    'lettuce_little_gem':    ('little gem lettuce',          'food'),
    'lettuce_lolla_rossa':   ('lollo rossa lettuce red',     'food'),
    'lettuce_flashy_trout':  ('speckled lettuce leaves',     'food'),
    'lettuce_iceberg':       ('iceberg lettuce head',        'food'),
    'lettuce_deer_tongue':   ('lettuce leaves green',        'food'),
    'mache_vit':             ('mache lamb lettuce leaves',   'food'),
    'sorrel_french':         ('sorrel leaves herb',          'food'),
    'radicchio_rossa':       ('radicchio red chicory',       'food'),
    'endive_frisee':         ('frisee endive chicory',       'food'),
    'fris_e':                ('frisee endive',               'food'),
    'asian_mix':             ('asian salad mix greens',      'food'),
    'watercress_standard':   ('watercress leaves',           'food'),
    'purslane_golden':       ('purslane succulent leaves',   'nature'),
    'kale_red_russian':      ('red russian kale leaves',     'food'),
    'lacinato_kale':         ('lacinato kale dinosaur kale', 'food'),
    'siberian_kale':         ('kale leaves garden',          'food'),
    'perennial_kale':        ('kale plant garden',           'nature'),
    'kalettes':              ('kale sprouts',                'food'),
    'amaranth_greens':       ('amaranth leaves green',       'nature'),
    'orach_red':             ('orach red leaves mountain spinach', 'nature'),
    'new_zealand_spinach':   ('spinach leaves green',        'food'),
    'malabar_spinach':       ('malabar spinach green leaves','nature'),
    'claytonia':             ('miner lettuce claytonia',     'nature'),
    'dandelion_greens':      ('dandelion leaves greens',     'nature'),
    'perpetual_spinach':     ('chard spinach leaves',        'food'),
    'purslane_golden':       ('purslane leaves yellow',      'nature'),

    # Brassicas
    'broccoli_belstar':      ('broccoli fresh green',        'food'),
    'broccoli_raab':         ('rapini broccoli rabe',        'food'),
    'cabbage_storage':       ('green cabbage head',          'food'),
    'red_cabbage':           ('red cabbage head vegetable',  'food'),
    'savoy_cabbage':         ('savoy cabbage crinkled',      'food'),
    'napa_cabbage':          ('napa cabbage chinese',        'food'),
    'chinese_cabbage':       ('chinese cabbage leaves',      'food'),
    'pac_choi_joi':          ('bok choy pak choi',           'food'),
    'pac_choi_green':        ('bok choy green vegetable',    'food'),
    'kohlrabi_kolibri':      ('kohlrabi purple vegetable',   'food'),
    'kohlrabi_white_vienna': ('kohlrabi white green',        'food'),
    'cauliflower_snowball':  ('cauliflower white head',      'food'),
    'brussels_sprouts':      ('brussels sprouts green',      'food'),
    'collards_champion':     ('collard greens leaves',       'food'),
    'romanesco':             ('romanesco broccoli fractal',  'food'),
    'gai_lan':               ('gai lan chinese broccoli',    'food'),
    'komatsuna':             ('komatsuna japanese greens',   'food'),
    'yu_choy':               ('yu choy green vegetable',     'food'),
    'tatsoi_standard':       ('tatsoi rosette leaves',       'food'),
    'mizuna_standard':       ('mizuna japanese salad',       'food'),
    'mustard_red_giant':     ('red mustard greens leaves',   'food'),
    'bok_choy':              ('bok choy vegetable green',    'food'),
    'portuguese_kale':       ('kale cabbage leaves',         'food'),
    'nine_star_broccoli':    ('broccoli cauliflower head',   'food'),
    'ethiopian_kale':        ('kale leaves dark green',      'food'),

    # Root vegetables
    'carrot_nantes':         ('carrots orange fresh',        'food'),
    'carrot_chantenay':      ('orange carrots harvest',      'food'),
    'carrot_cosmic_purple':  ('purple carrots rainbow',      'food'),
    'carrot_white':          ('white carrots parsnip',       'food'),
    'daucus':                ('wild carrot flower white',    'nature'),
    'beet_chioggia':         ('chioggia beet candy striped', 'food'),
    'beet_golden':           ('golden beet yellow root',     'food'),
    'turnip_hakurei':        ('white turnip salad',          'food'),
    'turnip_purple_top':     ('purple top turnip root',      'food'),
    'parsnip_harris':        ('parsnip root vegetable white','food'),
    'celeriac_monarch':      ('celeriac celery root',        'food'),
    'daikon_miyashige':      ('daikon radish white',         'food'),
    'rutabaga_laurentian':   ('rutabaga swede root',         'food'),
    'watermelon_radish':     ('watermelon radish pink inside','food'),
    'purple_daikon':         ('purple daikon radish',        'food'),
    'black_radish':          ('black radish round',          'food'),
    'radish_french_breakfast':('french breakfast radish red','food'),
    'salsify_mammoth':       ('salsify root vegetable',      'food'),
    'scorzonera_standard':   ('scorzonera black root',       'food'),
    'oca_standard':          ('oca tuber colorful',          'food'),
    'parsley_root':          ('parsley root hamburg',        'food'),

    # Alliums
    'scallions_evergreen':   ('scallions green onion bunch', 'food'),
    'leek_giant_musselburgh':('leeks fresh harvest',         'food'),
    'onion_candy':           ('sweet onion yellow',          'food'),
    'cipollini_onion':       ('cipollini onion flat',        'food'),
    'garlic_music':          ('garlic bulb white fresh',     'food'),
    'garlic_chives':         ('garlic chives flowering',     'food'),
    'elephant_garlic':       ('elephant garlic large bulb',  'food'),
    'shallots_ambition':     ('shallots brown onion',        'food'),
    'chives_standard':       ('chives herb fresh',           'food'),
    'ramps_wild':            ('wild ramp leek spring',       'nature'),
    'walking_onion':         ('walking onion top set',       'nature'),
    'sweet_onion':           ('sweet onion harvest',         'food'),
    'pickling_onion':        ('small pickling onion white',  'food'),
    'torpedo_onion':         ('torpedo onion red italian',   'food'),
    'welsh_onion':           ('welsh onion bunching',        'nature'),
    'japanese_bunching_onion':('japanese bunching onion',    'food'),
    'shallot':               ('shallots fresh harvest',      'food'),
    'shallots_ambition':     ('shallots red brown',          'food'),
    'potato_onion':          ('shallot small onion',         'food'),
    'rocambole_garlic':      ('rocambole garlic hardneck',   'food'),

    # Potatoes & tubers
    'potato_red_norland':    ('red potato harvest',          'food'),
    'potato_fingerling':     ('fingerling potato fresh',     'food'),
    'potato_purple_majesty': ('purple potato harvest',       'food'),
    'potato_russet':         ('russet potato brown',         'food'),
    'potato_german_butterball':('yellow potato butter',      'food'),
    'sweet_potato_beauregard':('sweet potato orange',        'food'),
    'sunchoke_stampede':     ('jerusalem artichoke tuber',   'food'),
    'jicama_standard':       ('jicama root vegetable',       'food'),
    'taro_standard':         ('taro root corm',              'food'),
    'tiger_nut':             ('tiger nut chufa tuber',       'food'),
    'lotus_root':            ('lotus root vegetable slice',  'food'),
    'water_chestnut':        ('water chestnut vegetable',    'food'),
    'mashua':                ('mashua tropaeolum tuber',     'nature'),
    'ulluco':                ('ulluco colorful tuber',       'nature'),
    'maca':                  ('maca root powder',            'food'),
    'yacon':                 ('yacon root tuber',            'food'),

    # Nightshades
    'tomato_heirloom_beefsteak':('heirloom beefsteak tomato', 'food'),
    'cherry_tomato_sungold': ('cherry tomato orange yellow', 'food'),
    'tomato_roma':           ('roma tomato paste red',       'food'),
    'tomato_san_marzano':    ('san marzano tomato italian',  'food'),
    'tomato_cherokee_purple':('heirloom purple tomato',      'food'),
    'tomato_yellow_brandywine':('yellow heirloom tomato',    'food'),
    'tomato_green_zebra':    ('green zebra tomato striped',  'food'),
    'tomato_black_krim':     ('dark red black tomato heirloom','food'),
    'tomato_mortgage_lifter':('large pink heirloom tomato',  'food'),
    'tomato_celebrity':      ('red tomato round fresh',      'food'),
    'tomato_early_girl':     ('red tomato vine fresh',       'food'),
    'tomato_yellow_pear':    ('yellow pear tomato small',    'food'),
    'tomato_black_cherry':   ('black cherry tomato dark',    'food'),
    'tomato_juliet':         ('grape tomato red cluster',    'food'),
    'tomato_large_red_cherry':('red cherry tomato cluster',  'food'),
    'tomato_amish_paste':    ('paste tomato red large',      'food'),
    'tomatillo_grande':      ('tomatillo green husk',        'food'),
    'ground_cherry_cossack': ('ground cherry physalis husk', 'food'),
    'pepper_sweet':          ('sweet bell pepper colorful',  'food'),
    'pepper_jalapeño':       ('jalapeño pepper green red',   'food'),
    'pepper_habanero':       ('habanero pepper orange',      'food'),
    'hot_pepper_habanero':   ('habanero orange pepper',      'food'),
    'pepper_anaheim':        ('anaheim pepper green long',   'food'),
    'pepper_poblano':        ('poblano pepper dark green',   'food'),
    'pepper_serrano':        ('serrano pepper green red',    'food'),
    'pepper_banana':         ('banana pepper yellow',        'food'),
    'pepper_shishito':       ('shishito pepper japanese',    'food'),
    'pepper_padron':         ('padron pepper small green',   'food'),
    'pepper_cayenne':        ('cayenne pepper red dried',    'food'),
    'pepper_ghost':          ('ghost pepper bhut jolokia',   'nature'),
    'pepper_fresno':         ('fresno pepper red chile',     'food'),
    'pepper_cubanelle':      ('cubanelle frying pepper',     'food'),
    'pepper_mini_sweet':     ('mini sweet pepper colorful',  'food'),
    'pepper_aji_amarillo':   ('aji amarillo yellow pepper',  'food'),
    'pepper_chocolate_bell': ('chocolate brown bell pepper', 'food'),
    'pepper_pepperoncini':   ('pepperoncini pepper pickled', 'food'),
    'pepper_thai_bird':      ('thai bird eye chili pepper',  'food'),
    'eggplant_ichiban':      ('japanese eggplant long purple','food'),
    'eggplant_thai':         ('thai eggplant small green',   'food'),
    'eggplant_white':        ('white eggplant fresh',        'food'),
    'pepper_sweet':          ('colorful bell pepper',        'food'),
    'sweet_pepper':          ('sweet pepper red yellow',     'food'),

    # Cucurbits
    'cucumber_marketmore':   ('cucumber fresh green',        'food'),
    'cucumber_lemon':        ('lemon cucumber yellow round', 'food'),
    'cucumber_armenian':     ('armenian cucumber light green','food'),
    'cucumber_english':      ('english cucumber long',       'food'),
    'cucumber_persian':      ('persian cucumber small',      'food'),
    'cucumber_boston_pickling':('pickling cucumber small',   'food'),
    'cucumber_japanese':     ('japanese cucumber thin',      'food'),
    'cucumber_crystal_apple':('crystal apple cucumber round','food'),
    'zucchini_black_beauty': ('zucchini courgette dark green','food'),
    'summer_squash_pattypan':('pattypan squash flying saucer','food'),
    'squash_acorn':          ('acorn squash dark green',     'food'),
    'squash_red_kuri':       ('red kuri squash orange',      'food'),
    'squash_sugar_pie_pumpkin':('sugar pie pumpkin small',   'food'),
    'squash_cinderella':     ('cinderella pumpkin red flat', 'food'),
    'squash_blue_hubbard':   ('hubbard squash blue grey',    'food'),
    'squash_spaghetti':      ('spaghetti squash yellow',     'food'),
    'squash_sweet_dumpling': ('sweet dumpling squash small', 'food'),
    'squash_delicata_new':   ('delicata squash cream striped','food'),
    'squash_butternut_new':  ('butternut squash fresh',      'food'),
    'squash_kabocha_new':    ('kabocha squash green japanese','food'),
    'squash_round_zucchini': ('round zucchini ball squash',  'food'),
    'squash_yellow_crookneck':('yellow crookneck squash',    'food'),
    'squash_tromboncino':    ('tromboncino squash zucchini', 'food'),
    'squash_lemon':          ('lemon squash yellow round',   'food'),
    'squash_cousa':          ('cousa squash light green',    'food'),
    'butternut_squash':      ('butternut squash autumn',     'food'),
    'kabocha_squash':        ('kabocha pumpkin green',       'food'),
    'delicata_squash':       ('delicata squash striped',     'food'),
    'pumpkin_jack':          ('orange pumpkin halloween',    'food'),
    'bitter_melon':          ('bitter melon bitter gourd',   'food'),
    'luffa_gourd':           ('luffa gourd loofah',          'nature'),
    'melon_honeydew':        ('honeydew melon green fresh',  'food'),
    'melon_honeydew_orange': ('honeydew orange flesh melon', 'food'),
    'melon_galia':           ('galia melon netted',          'food'),
    'melon_canary':          ('canary melon yellow bright',  'food'),
    'melon_charentais':      ('charentais cantaloupe french','food'),
    'melon_hales_best':      ('cantaloupe melon fresh',      'food'),
    'cantaloupe_ambrosia':   ('cantaloupe melon sliced',     'food'),
    'melon_crenshaw':        ('crenshaw melon large yellow', 'food'),
    'watermelon_sugar_baby': ('small watermelon round',      'food'),
    'watermelon_moon_stars': ('watermelon whole fresh',      'food'),
    'watermelon_yellow_doll':('yellow flesh watermelon',     'food'),

    # Legumes
    'peas_sugar_snap':       ('sugar snap peas green pod',   'food'),
    'snap_peas_cascadia':    ('snap peas green fresh',       'food'),
    'snow_pea_mammoth':      ('snow peas flat pod',          'food'),
    'beans_green_bush':      ('green beans fresh harvest',   'food'),
    'bean_pole_kentucky_wonder':('green beans pole harvest', 'food'),
    'bean_pole_rattlesnake': ('purple green bean pod',       'food'),
    'bean_dragon_tongue':    ('dragon tongue bean yellow streaked','food'),
    'bean_yard_long':        ('yard long bean asian',        'food'),
    'bean_lima_henderson':   ('lima bean fresh green',       'food'),
    'bean_lima_fordhook':    ('lima bean large fresh',       'food'),
    'bean_black':            ('black beans dried',           'food'),
    'bean_pinto':            ('pinto beans dried',           'food'),
    'bean_kidney':           ('kidney bean red dried',       'food'),
    'bean_cannellini':       ('cannellini white bean',       'food'),
    'bean_navy':             ('navy bean white dried',       'food'),
    'bean_haricot_vert':     ('haricot vert french bean thin','food'),
    'bean_yellow_wax':       ('yellow wax bean fresh',       'food'),
    'bean_purple_wax':       ('purple bean fresh',           'food'),
    'chickpea_standard':     ('chickpea garbanzo bean',      'food'),
    'chickpea_kabuli':       ('chickpea dried beige',        'food'),
    'lentil_red_chief':      ('red lentil dried',            'food'),
    'lentil_beluga':         ('black beluga lentil',         'food'),
    'mung_bean':             ('mung bean green dried',       'food'),
    'adzuki_bean':           ('adzuki bean small red',       'food'),
    'black_eyed_pea':        ('black eyed pea bean',         'food'),
    'purple_hull_pea':       ('cowpea pod purple',           'food'),
    'fava_beans':            ('fava bean broad bean green',  'food'),
    'fababean':              ('fava bean broad fresh',       'food'),
    'edamame_besweet':       ('edamame soybean pods green',  'food'),
    'soybeans_midori':       ('edamame green soybean',       'food'),
    'soybean':               ('soybean plant field',         'nature'),
    'cowpeas_iron_clay':     ('cowpea vine field',           'nature'),
    'runner_beans':          ('scarlet runner bean flower',  'nature'),
    'scarlet_runner_bean':   ('runner bean red flower',      'nature'),
    'hyacinth_bean':         ('hyacinth bean lablab purple', 'nature'),
    'pigeon_pea':            ('pigeon pea plant',            'nature'),
    'pigeon_pea':            ('pigeon pea pod',              'food'),
    'lupin':                 ('lupin bean dried seed',       'food'),
    'tepary_bean':           ('dried bean colorful',         'food'),
    'field_peas':            ('field pea dried green',       'food'),
    'cowpea_cover':          ('cowpea cover crop green',     'nature'),
    'mung_bean':             ('mung bean sprout',            'food'),

    # Herbs
    'basil_genovese':        ('fresh basil leaves green',    'food'),
    'basil_thai':            ('thai basil purple stem',      'food'),
    'basil_purple':          ('purple basil leaves',         'food'),
    'basil_lemon':           ('lemon basil herb leaves',     'food'),
    'lime_basil':            ('lime basil herb',             'nature'),
    'cinnamon_basil':        ('cinnamon basil herb',         'nature'),
    'african_blue_basil':    ('blue basil herb flower',      'nature'),
    'holy_basil':            ('tulsi holy basil plant',      'nature'),
    'parsley_flat_leaf':     ('flat leaf parsley fresh',     'food'),
    'cilantro_standard':     ('cilantro coriander fresh',    'food'),
    'cilantro_slow_bolt':    ('cilantro herb fresh',         'food'),
    'cilantro_santo':        ('cilantro plant fresh',        'food'),
    'dill_fernleaf':         ('dill herb fresh feathery',    'food'),
    'dill_standard':         ('dill herb plant',             'food'),
    'thyme_english':         ('thyme herb fresh',            'food'),
    'lemon_thyme':           ('thyme herb lemon',            'nature'),
    'oregano_greek':         ('oregano herb fresh',          'food'),
    'sage_garden':           ('sage herb fresh leaves',      'food'),
    'rosemary_tuscan_blue':  ('rosemary herb branch',        'food'),
    'mint_spearmint':        ('spearmint fresh herb',        'food'),
    'mint_peppermint':       ('peppermint herb fresh',       'food'),
    'mint_apple':            ('apple mint herb leaf',        'nature'),
    'korean_mint':           ('korean mint agastache herb',  'nature'),
    'lemon_balm':            ('lemon balm herb melissa',     'nature'),
    'tarragon_french':       ('tarragon herb fresh',         'food'),
    'fennel_bronze':         ('fennel herb feathery',        'food'),
    'fennel_standard':       ('fennel bulb vegetable',       'food'),
    'chervil_standard':      ('chervil herb delicate',       'nature'),
    'chervil_curled':        ('chervil herb curled leaf',    'nature'),
    'Vietnamese_coriander':  ('vietnamese coriander herb',   'nature'),
    'vietnamese_coriander':  ('vietnamese coriander daun kesom','nature'),
    'culantro':              ('culantro herb spiky leaf',    'nature'),
    'lovage_standard':       ('lovage herb tall plant',      'nature'),
    'caraway_standard':      ('caraway seed herb',           'food'),
    'fenugreek_standard':    ('fenugreek seed herb',         'food'),
    'marjoram_standard':     ('marjoram herb fresh',         'food'),
    'summer_savory':         ('savory herb fresh',           'nature'),
    'winter_savory':         ('winter savory herb',          'nature'),
    'savory':                ('savory herb aromatic',        'nature'),
    'borage_standard':       ('borage flower blue herb',     'nature'),
    'stevia_standard':       ('stevia plant leaves',         'nature'),
    'epazote_standard':      ('epazote herb mexican',        'nature'),
    'lemongrass_standard':   ('lemongrass stalk fresh',      'food'),
    'lemon_verbena':         ('lemon verbena herb leaf',     'nature'),
    'shiso':                 ('shiso perilla leaf japanese', 'food'),
    'gai_lan':               ('chinese broccoli gai lan',    'food'),
    'watercress_standard':   ('watercress fresh green',      'food'),
    'garlic_chives':         ('garlic chives flat leaf',     'food'),
    'komatsuna':             ('japanese greens komatsuna',   'food'),
    'shungiku':              ('chrysanthemum greens edible', 'food'),
    'sorrel_french':         ('sorrel herb leaf sour',       'nature'),

    # Flowers (cut)
    'sunflower_holiday':     ('sunflower bright yellow',     'nature'),
    'zinnia_benary_giant':   ('zinnia flower colorful',      'nature'),
    'snapdragon_rocket':     ('snapdragon flower antirrhinum','nature'),
    'calendula_erfurter':    ('calendula marigold orange',   'nature'),
    'statice_QIS':           ('statice limonium purple dried','nature'),
    'statice_sinuata':       ('statice flower purple white', 'nature'),
    'strawflower_apricot':   ('strawflower everlasting apricot','nature'),
    'lisianthus_echo':       ('lisianthus flower eustoma',   'nature'),
    'marigold_french':       ('french marigold tagetes',     'nature'),
    'nasturtium_jewel':      ('nasturtium flower orange',    'nature'),
    'dahlia_dinner_plate':   ('dinner plate dahlia flower',  'nature'),
    'ranunculus_standard':   ('ranunculus flower colorful',  'nature'),
    'anemone_standard':      ('anemone flower spring',       'nature'),
    'sweet_pea_standard':    ('sweet pea flower lathyrus',   'nature'),
    'delphinium_standard':   ('delphinium tall blue flower', 'nature'),
    'larkspur_giant':        ('larkspur consolida flower',   'nature'),
    'foxglove_standard':     ('foxglove digitalis flower',   'nature'),
    'cosmos_bipinnatus':     ('cosmos bipinnatus pink flower','nature'),
    'cosmos_sulphureus':     ('cosmos sulphureus orange flower','nature'),
    'mexican_sunflower':     ('tithonia mexican sunflower orange','nature'),
    'bachelor_button':       ('bachelor button cornflower blue','nature'),
    'scabiosa_pincushion':   ('scabiosa pincushion flower',  'nature'),
    'rudbeckia_standard':    ('rudbeckia black eyed susan',  'nature'),
    'celosia_cockscomb':     ('cockscomb celosia cristata',  'nature'),
    'celosia_plume':         ('plume celosia feathery red',  'nature'),
    'globe_amaranth':        ('globe amaranth gomphrena',    'nature'),
    'liatris_spicata':       ('liatris blazing star purple', 'nature'),
    'gypsophila':            ('baby breath gypsophila white','nature'),
    'ammi':                  ('ammi white flower umbel',     'nature'),
    'ammobium':              ('ammobium winged everlasting',  'nature'),
    'agrostemma':            ('corn cockle agrostemma',      'nature'),
    'alyssum':               ('sweet alyssum white flower',  'nature'),
    'ageratum':              ('ageratum blue flower fluffy', 'nature'),
    'daucus':                ('wild carrot queen anne lace', 'nature'),
    'echinacea_purpurea':    ('echinacea purple coneflower', 'nature'),
    'chamomile_german':      ('chamomile flower white daisy','nature'),
    'feverfew':              ('feverfew flower white herb',  'nature'),
    'crocus':                ('crocus flower purple spring', 'nature'),
    'tulip':                 ('tulip flower spring colorful','nature'),
    'dianthus':              ('dianthus carnation flower',   'nature'),
    'eryngium':              ('eryngium sea holly blue',     'nature'),
    'poppy':                 ('poppy red flower field',      'nature'),
    'phlox':                 ('phlox flower purple pink',    'nature'),
    'nicotiana':             ('nicotiana flowering tobacco', 'nature'),
    'morning_glory':         ('morning glory flower blue',   'nature'),
    'hollyhock':             ('hollyhock flower tall pink',  'nature'),
    'bee_balm':              ('bee balm monarda red flower', 'nature'),
    'asclepias':             ('butterfly weed asclepias orange','nature'),
    'columbine':             ('columbine aquilegia flower',  'nature'),
    'clarkia':               ('clarkia flower pink purple',  'nature'),
    'clary_sage':            ('clary sage salvia flower',    'nature'),
    'cynoglossum':           ('cynoglossum blue flower',     'nature'),
    'didiscus':              ('blue lace flower trachymene', 'nature'),
    'digitalis':             ('foxglove digitalis bloom',    'nature'),
    'bells_of_ireland':      ('bells of ireland green flower','nature'),
    'matthiola':             ('stock flower matthiola',      'nature'),
    'stock':                 ('stock flower matthiola',      'nature'),
    'orlaya':                ('white lace flower orlaya',    'nature'),
    'gomphrena':             ('globe amaranth gomphrena pink','nature'),
    'craspedia':             ('craspedia billy button yellow','nature'),
    'xeranthemum':           ('xeranthemum everlasting',     'nature'),
    'helipterum':            ('paper daisy rhodanthe pink',  'nature'),
    'bupleurum':             ('bupleurum green filler flower','nature'),
    'cerinthe':              ('cerinthe honeywort blue',     'nature'),
    'centaurea':             ('cornflower centaurea blue',   'nature'),
    'cornflower':            ('cornflower blue field',       'nature'),
    'yarrow':                ('yarrow achillea flower white','nature'),
    'rudbeckia_standard':    ('black eyed susan flower yellow','nature'),
    'saponaria':             ('soapwort saponaria pink',     'nature'),
    'euphorbia':             ('euphorbia spurge green',      'nature'),
    'monarda':               ('monarda bee balm flower red', 'nature'),
    'scabiosa_pincushion':   ('scabiosa blue pincushion',    'nature'),
    'lisianthus_echo':       ('lisianthus purple flower',    'nature'),
    'agastache':             ('agastache anise hyssop blue', 'nature'),
    'anise_hyssop':          ('anise hyssop agastache purple','nature'),
    'lavender_hidcote':      ('lavender purple flower field','nature'),
    'rudbeckia_standard':    ('rudbeckia flower yellow',     'nature'),
    'coneflower':            ('echinacea purple coneflower', 'nature'),
    'hibiscus':              ('hibiscus flower tropical red','nature'),
    'passionflower':         ('passionflower passiflora',    'nature'),
    'nasturtium_jewel':      ('nasturtium orange flower',    'nature'),
    'portulaca':             ('portulaca moss rose flower',  'nature'),
    'salvia_nemorosa':       ('salvia blue purple spike',    'nature'),
    'cobaea':                ('cobaea cup saucer vine',      'nature'),
    'sweet_william':         ('sweet william dianthus',      'nature'),

    # Asparagus & artichokes
    'asparagus_millennium':  ('asparagus spears fresh green','food'),
    'asparagus_purple':      ('purple asparagus spears',     'food'),
    'asparagus_mary_washington':('green asparagus spears',   'food'),
    'artichoke_imperial':    ('artichoke vegetable green',   'food'),
    'artichoke_violetto':    ('purple artichoke italian',    'food'),
    'artichoke':             ('artichoke fresh vegetable',   'food'),
    'artichoke_jerusalem':   ('jerusalem artichoke knobbly', 'food'),
    'cardoon':               ('cardoon thistle stem',        'food'),
    'rhubarb_victoria':      ('rhubarb red stalk fresh',     'food'),

    # Celery & fennel
    'celery_utah':           ('celery stalk bunch fresh',    'food'),
    'celery_par_cel':        ('cutting celery herb leaf',    'food'),
    'celeriac_monarch':      ('celeriac celery root knobby', 'food'),
    'fennel_bronze':         ('fennel herb bronze feathery', 'food'),

    # Okra & corn
    'okra_clemson':          ('okra pod fresh green',        'food'),
    'okra_red':              ('red okra pod',                'food'),
    'corn_sweet_peaches':    ('sweet corn ear yellow',       'food'),
    'corn_sweet_silver_queen':('white sweet corn ear',       'food'),
    'corn_sweet_bicolor':    ('bicolor sweet corn ear',      'food'),
    'corn_sweet_yellow':     ('yellow sweet corn ear',       'food'),
    'corn_glass_gem':        ('glass gem corn colorful',     'food'),
    'corn_bloody_butcher':   ('red corn ear harvest',        'food'),
    'popcorn_robust':        ('popcorn ear dry',             'food'),
    'sorghum_sweet':         ('sorghum grain stalk',         'nature'),
    'pearl_millet':          ('pearl millet spike grain',    'nature'),

    # Grains
    'wheat_hard_red':        ('wheat field grain golden',    'nature'),
    'spelt_standard':        ('spelt grain harvest',         'nature'),
    'einkorn_standard':      ('einkorn wheat grain',         'nature'),
    'barley_hulless':        ('barley grain golden',         'nature'),
    'oats_naked':            ('oat grain field',             'nature'),
    'teff_standard':         ('teff grain small',            'nature'),
    'buckwheat_grain':       ('buckwheat grain flower',      'nature'),
    'amaranth_grain':        ('amaranth grain head red',     'nature'),
    'quinoa_brightest':      ('quinoa plant seed head',      'nature'),
    'flax':                  ('flax linseed flower blue',    'nature'),
    'milo':                  ('sorghum milo grain head',     'nature'),
    'canola':                ('canola rapeseed yellow flower','nature'),
    'triticale':             ('triticale grain field',       'nature'),

    # Fruits / berries
    'strawberry_seascape':   ('strawberry red fresh ripe',   'food'),
    'strawberry_alpine':     ('alpine wild strawberry',      'food'),
    'raspberry_everbearing': ('raspberry red fresh ripe',    'food'),
    'blackberry_thornless':  ('blackberry fresh cluster',    'food'),
    'blackberry':            ('blackberry fresh ripe',       'food'),
    'elderberry_standard':   ('elderberry cluster dark',     'food'),
    'honeyberry_standard':   ('honeyberry blue fruit',       'food'),
    'honeyberry':            ('honeyberry haskap blue',      'food'),
    'currant_red':           ('red currant cluster berry',   'food'),
    'currant_black':         ('blackcurrant cluster dark',   'food'),
    'currant':               ('currant berry cluster red',   'food'),
    'blueberry':             ('blueberry fresh ripe',        'food'),
    'aronia_chokeberry':     ('aronia chokeberry dark berry','food'),
    'goji_berry':            ('goji berry red dried',        'food'),
    'gooseberry':            ('gooseberry green berry',      'food'),
    'huckleberry':           ('huckleberry wild berry blue', 'nature'),
    'fig':                   ('fig fruit fresh halved',      'food'),
    'mulberry':              ('mulberry berry purple',       'food'),
    'beach_plum':            ('wild plum beach purple',      'nature'),
    'nanking_cherry':        ('nanking cherry red small',    'nature'),
    'cornelian_cherry':      ('cornelian cherry red fruit',  'food'),
    'jostaberry':            ('jostaberry dark berry',       'nature'),
    'juneberry':             ('serviceberry amelanchier',    'nature'),
    'sea_buckthorn':         ('sea buckthorn orange berry',  'nature'),
    'serviceberry':          ('serviceberry berry purple',   'nature'),
    'lingonberry':           ('lingonberry red berry',       'food'),
    'sea_buckthorn':         ('sea buckthorn bright orange', 'nature'),
    'hardy_kiwi':            ('hardy kiwi actinidia green',  'nature'),
    'autumn_olive':          ('autumn olive red berry',      'nature'),
    'wolfberry':             ('wolfberry goji red',          'food'),
    'persimmon':             ('persimmon fruit orange',      'food'),
    'medlar':                ('medlar fruit brown autumn',   'nature'),
    'quince':                ('quince fruit yellow',         'food'),
    'pawpaw':                ('pawpaw fruit tropical north', 'nature'),

    # Ginger / turmeric / tropical
    'ginger_rhizome':        ('ginger root fresh yellow',    'food'),
    'turmeric_standard':     ('turmeric root orange',        'food'),
    'wasabi':                ('wasabi rhizome fresh green',  'food'),
    'horseradish_standard':  ('horseradish root white',      'food'),
    'burdock_gobo':          ('burdock gobo root long',      'food'),
    'galangal':              ('galangal root ginger',        'food'),
    'taro_standard':         ('taro corm root',              'food'),

    # Medicinal / herbs
    'echinacea_purpurea':    ('echinacea purple coneflower', 'nature'),
    'ashwagandha_standard':  ('ashwagandha root herb',       'nature'),
    'valerian':              ('valerian flower white herb',  'nature'),
    'motherwort':            ('motherwort leonurus herb',    'nature'),
    'chamomile_german':      ('chamomile white flower',      'nature'),
    'roman_chamomile':       ('chamomile white flower',      'nature'),
    'feverfew':              ('feverfew white flower herb',  'nature'),
    'st_john_s_wort':        ('st johns wort yellow flower', 'nature'),
    'skullcap':              ('skullcap scutellaria herb',   'nature'),
    'goldenseal':            ('goldenseal root herb plant',  'nature'),
    'milk_thistle':          ('milk thistle silybum flower', 'nature'),
    'astragalus':            ('astragalus root herb',        'nature'),
    'rhodiola':              ('rhodiola rosea root herb',    'nature'),
    'elecampane':            ('elecampane yellow flower tall','nature'),
    'licorice_root':         ('licorice root glycyrrhiza',   'food'),
    'marshmallow_root':      ('marshmallow althaea flower',  'nature'),
    'comfrey':               ('comfrey blue flower herb',    'nature'),
    'salad_burnet':          ('salad burnet herb leaf',      'nature'),
    'wood_betony':           ('betony stachys herb flower',  'nature'),
    'blue_vervain':          ('blue vervain verbena flower', 'nature'),
    'wood_sorrel':           ('wood sorrel oxalis leaf',     'nature'),
    'wormwood':              ('wormwood artemisia silver',   'nature'),
    'rue':                   ('rue ruta plant blue green',   'nature'),
    'hyssop':                ('hyssop blue flower herb',     'nature'),
    'bergamot':              ('wild bergamot monarda flower','nature'),
    'motherwort':            ('motherwort herb plant',       'nature'),
    'mountain_mint':         ('mountain mint pycnanthemum',  'nature'),
    'catnip':                ('catnip nepeta herb plant',    'nature'),
    'spilanthes':            ('spilanthes toothache plant',  'nature'),
    'plantain_herb':         ('plantain herb broadleaf',     'nature'),
    'nettle':                ('stinging nettle herb leaf',   'nature'),
    'ground_elder':          ('ground elder aegopodium',     'nature'),
    'sweet_cicely':          ('sweet cicely myrrhis herb',  'nature'),

    # Microgreens / shoots
    'shoots':                ('microgreens fresh seedlings', 'food'),
    'mache_vit':             ('mache lamb lettuce rosette',  'food'),
    'cress_ornamental':      ('garden cress microgreen',     'food'),

    # Alliums continued
    'elephant_garlic':       ('elephant garlic large bulb',  'food'),
    'walking_onion':         ('egyptian walking onion',      'nature'),

    # Cover crops
    'cover_crop_rye':        ('winter rye grain field green','nature'),
    'cover_crop_oats':       ('oat cover crop field',        'nature'),
    'cover_crop_buckwheat':  ('buckwheat white flower',      'nature'),
    'cover_crop_clover':     ('white clover field green',    'nature'),
    'cover_crop_red_clover': ('red clover field flower',     'nature'),
    'cover_crop_crimson_clover':('crimson clover red flower','nature'),
    'cover_crop_berseem_clover':('berseem clover field',     'nature'),
    'cover_crop_balansa_clover':('clover field green cover', 'nature'),
    'cover_crop_vetch':      ('hairy vetch purple flower',   'nature'),
    'cover_crop_rye_vetch':  ('rye vetch winter cover crop', 'nature'),
    'cover_crop_austrian_pea':('field pea cover crop vine', 'nature'),
    'cover_crop_field_pea':  ('field pea vine cover crop',   'nature'),
    'cover_crop_mustard':    ('mustard yellow flower field', 'nature'),
    'cover_crop_field_mustard':('brassica mustard field',    'nature'),
    'cover_crop_radish':     ('daikon radish tillage',       'nature'),
    'cover_crop_tillage_radish':('tillage radish bulb ground','nature'),
    'cover_crop_phacelia':   ('phacelia purple flower bee',  'nature'),
    'cover_crop_sudangrass': ('sudan grass tall field',      'nature'),
    'cover_crop_sunn_hemp':  ('sunn hemp crotalaria green',  'nature'),
    'cover_crop_forage_turnip':('turnip field forage',       'nature'),
    'cover_crop_japanese_millet':('millet grain grass field','nature'),
    'cover_crop_sunflower':  ('sunflower field wide',        'nature'),
    'cover_crop_sweet_clover':('sweet clover yellow flower', 'nature'),
    'annual_ryegrass':       ('ryegrass green lawn grass',   'nature'),
    'cover_crop_field_mustard':('mustard brassica field yellow','nature'),
    'hairy_vetch':           ('hairy vetch purple flower',   'nature'),
    'austrian_winter_pea':   ('field pea pod cover crop',    'nature'),

    # Specialty / other
    'bitter_melon':          ('bitter melon bumpy green',    'food'),
    'luffa_gourd':           ('luffa loofah gourd long',     'nature'),
    'glasswort':             ('samphire glasswort green',     'nature'),
    'sea_purslane':          ('sea purslane atriplex',        'nature'),
    'samphire':              ('rock samphire sea fennel',    'food'),
    'saltwort':              ('saltwort salsola plant',       'nature'),
    'maca':                  ('maca root andean',             'food'),
    'ulluco':                ('ulluco colorful tuber',        'food'),
    'mashua':                ('mashua tropaeolum tuber',      'nature'),
    'oca_standard':          ('oca tuber colorful root',      'food'),
    'arracacha':             ('arracacha white carrot root',  'food'),
    'claytonia':             ('miner lettuce winter purslane','nature'),
    'good_king_henry':       ('good king henry goosefoot',   'nature'),
    'skirret':               ('skirret white root vegetable','nature'),
    'scorzonera_standard':   ('scorzonera black salsify',     'food'),
    'burdock_gobo':          ('burdock root gobo long',       'food'),
    'belgian_endive':        ('belgian endive witloof white', 'food'),
    'chicory_catalogna':     ('chicory catalogna leaf',       'food'),
    'celtuce':               ('celtuce stem lettuce',         'food'),
    'luffa':                 ('luffa sponge gourd',           'nature'),
    'wakame':                ('wakame seaweed fresh',         'food'),
    'tiger_nut':             ('tiger nut chufa small tuber',  'food'),
    'water_chestnut':        ('water chestnut dark brown',    'food'),
    'lotus_root':            ('lotus root sliced holes',      'food'),
    'wasabi':                ('wasabi green paste plant',     'food'),
    'glasswort':             ('marsh samphire glasswort',     'nature'),
    'sea_purslane':          ('sea purslane coastal',         'nature'),
    'samphire':              ('samphire sea vegetable',       'food'),
    'malabar_spinach':       ('malabar climbing spinach vine','nature'),
    'new_zealand_spinach':   ('new zealand spinach thick',    'nature'),
    'purslane_golden':       ('golden purslane succulent',    'nature'),
    'teff_standard':         ('teff grain ethiopia small',    'nature'),
    'safflower':             ('safflower orange flower',      'nature'),
    'carthamus':             ('safflower carthamus orange',   'nature'),
    'saffron_crocus':        ('saffron crocus purple flower', 'nature'),
    'sage_garden':           ('garden sage silver leaves',    'food'),
    'tulsi':                 ('tulsi holy basil purple',      'nature'),
    'pineapple_sage':        ('pineapple sage red flower',    'nature'),
    'black_sage':            ('black sage salvia plant',      'nature'),
    'lemon_verbena':         ('lemon verbena aloysia herb',   'nature'),
    'mexican_mint_marigold': ('mexican tarragon tagetes',     'nature'),
    'stevia_standard':       ('stevia leaf sweet herb',       'nature'),
    'epazote_standard':      ('epazote herb mexican leaf',    'nature'),
    'rue':                   ('rue herb blue green leaves',   'nature'),
    'spilanthes':            ('toothache plant flower yellow','nature'),
    'forage_rape':           ('rapeseed brassica field',      'nature'),
    'canola':                ('canola yellow flower crop',    'nature'),
    'sunn_hemp':             ('sunn hemp crotalaria yellow',  'nature'),
    'milo':                  ('sorghum milo grain red',       'nature'),
    'tyfon':                 ('turnip greens field',          'nature'),
    'atriplex':              ('orach mountain spinach',       'nature'),
    'mangel':                ('mangel beet fodder large',     'nature'),
    'swede':                 ('swede rutabaga root purple',   'food'),
    'jicama_standard':       ('jicama white root vegetable',  'food'),
    'pigeon_pea':            ('pigeon pea pod plant',         'nature'),
    'lupin':                 ('lupin bean white dried',        'food'),
    'lupine':                ('lupine lupin flower blue',      'nature'),

    # Ginger / exotic
    'ginseng':               ('ginseng panax root herbal',   'nature'),
    'astragalus':            ('astragalus plant herb root',   'nature'),
    'elderberry_standard':   ('elderflower elderberry cluster','nature'),

    # Fruit trees / shrubs
    'fig':                   ('fig fresh halved interior',    'food'),
    'medlar':                ('medlar fruit brown old',       'nature'),
    'quince':                ('quince yellow fruit',          'food'),
    'aronia_chokeberry':     ('chokeberry dark berry cluster','food'),
    'autumn_olive':          ('autumn olive berry red',       'nature'),

    # Misc
    'shoots':                ('microgreens sprout tray fresh','food'),
    'cress_ornamental':      ('garden cress seedling',        'food'),
    'husk_cherry':           ('husk cherry physalis fruit',   'food'),
    'ground_cherry_cossack': ('ground cherry paper husk',     'food'),
    'quinoa_brightest':      ('quinoa plant colorful head',   'nature'),
    'amaranth_grain':        ('amaranth red grain head',      'nature'),
    'hyacinth_bean':         ('lablab purple pod bean',       'nature'),
    'morning_glory':         ('morning glory blue purple',    'nature'),
    'portulaca':             ('portulaca rose moss flower',    'nature'),
    'nasturtium_jewel':      ('nasturtium flower orange red', 'nature'),
}

GOOD_MIME = {'image/jpeg', 'image/jpg', 'image/png'}


def pixabay_search(query, category, api_key):
    params = urllib.parse.urlencode({
        'key': api_key,
        'q': query,
        'image_type': 'photo',
        'category': category,
        'safesearch': 'true',
        'per_page': 10,
        'min_width': 400,
        'order': 'popular',
    })
    url = f'https://pixabay.com/api/?{params}'
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10, context=CTX) as r:
            data = json.loads(r.read())
        hits = data.get('hits', [])
        # Return best hit (highest views = most relevant, best quality)
        if hits:
            return hits[0].get('webformatURL', '')
    except Exception as e:
        print(f'    api_err: {e}')
    return None


def download(url, dest):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Referer': 'https://pixabay.com/',
        })
        with urllib.request.urlopen(req, timeout=15, context=CTX) as r:
            dest.write_bytes(r.read())
        return True
    except Exception as e:
        print(f'    dl_err: {e}')
        return False


def generate_images_js(asset_dir, crops_json, images_js):
    data = json.loads(crops_json.read_text())
    crops = sorted(data.get('crops', data) if isinstance(data, dict) else data, key=lambda c: c['id'])

    lines = [
        '// Crop images — assets/crops/ directory (bundled, Pixabay CC0)',
        '',
        'const CROP_IMAGES = {',
    ]
    found = 0
    for c in crops:
        cid = c['id']
        for ext in ['jpg', 'jpeg', 'png']:
            p = asset_dir / f'{cid}.{ext}'
            if p.exists():
                lines.append(f"  '{cid}': require('../../assets/crops/{cid}.{ext}'),")
                found += 1
                break
    lines += ['};', '', 'export default CROP_IMAGES;', '']
    images_js.write_text('\n'.join(lines))
    return found


def main():
    data = json.loads(CROPS_JSON.read_text())
    crops = data.get('crops', data) if isinstance(data, dict) else data
    crops = sorted(crops, key=lambda c: c['id'])

    print('═' * 60)
    print('AcreLogic — Pixabay Crop Image Fetcher')
    print(f'Total crops: {len(crops)}')
    print('═' * 60 + '\n')

    counts = {'✅': 0, '⚡': 0, '❌': 0}

    for i, crop in enumerate(crops, 1):
        cid = crop['id']
        crop_name = crop.get('name', cid.replace('_', ' '))

        # Check if already have a good image
        existing = next((ASSETS_DIR / f'{cid}.{e}' for e in ['jpg','png','jpeg']
                         if (ASSETS_DIR / f'{cid}.{e}').exists()), None)
        if existing:
            print(f'[{i:3}/{len(crops)}] {cid} ⚡ (kept existing)')
            counts['⚡'] += 1
            continue

        # Get search query from map, or auto-generate from crop name + category
        if cid in QUERY_MAP:
            query, category = QUERY_MAP[cid]
        else:
            # Auto-generate: use crop name
            query = crop_name.lower()
            # Determine category from crop category field
            crop_cat = str(crop.get('category', '')).lower()
            if any(k in crop_cat for k in ['flower', 'cut', 'cover']):
                category = 'nature'
            else:
                category = 'food'
            print(f'[{i:3}/{len(crops)}] {cid} (auto: "{query}" / {category})')

        print(f'[{i:3}/{len(crops)}] {cid} → "{query}" ({category})... ', end='')

        dest = ASSETS_DIR / f'{cid}.jpg'
        url = pixabay_search(query, category, API_KEY)

        if url:
            ok = download(url, dest)
            if ok:
                print('✅')
                counts['✅'] += 1
            else:
                # Retry without category filter
                url2 = pixabay_search(query, '', API_KEY)
                if url2 and download(url2, dest):
                    print('✅ (no-cat fallback)')
                    counts['✅'] += 1
                else:
                    print('❌')
                    counts['❌'] += 1
        else:
            # Retry — use just first word of crop name
            fallback_q = crop_name.split()[0].lower()
            url2 = pixabay_search(fallback_q + ' plant', 'nature', API_KEY)
            if url2 and download(url2, dest):
                print(f'✅ (fallback: {fallback_q})')
                counts['✅'] += 1
            else:
                print('❌')
                counts['❌'] += 1

        time.sleep(0.3)  # rate limit: ~3 req/sec max free tier

    # Generate cropImages.js
    covered = generate_images_js(ASSETS_DIR, CROPS_JSON, IMAGES_JS)

    print(f'\n{"─"*50}')
    print('Summary:')
    for k, v in counts.items():
        print(f'  {k} {v}')
    print(f'cropImages.js: {covered}/512 crops with images')


if __name__ == '__main__':
    main()
