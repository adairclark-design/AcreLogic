/**
 * AcreLogic — Crop Image Downloader
 * Downloads Wikipedia thumbnail images for all crops in crops.json
 * and generates src/data/cropImages.js for the bundler.
 *
 * Usage: node scripts/download-crop-images.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const cropsJson = require('../src/data/crops.json');
const ASSETS_DIR = path.join(__dirname, '../assets/crops');
const OUTPUT_JS = path.join(__dirname, '../src/data/cropImages.js');

// ── Wikipedia search terms for each crop id ─────────────────────────────────
// When the crop name alone is ambiguous, provide a more specific search term.
const WIKI_SEARCH = {
    // Greens
    'radish_french_breakfast': 'Radish vegetable',
    'spinach_space': 'Spinach',
    'lettuce_mix': 'Lettuce',
    'arugula_standard': 'Arugula',
    'chard_rainbow': 'Swiss chard',
    'mizuna_standard': 'Mizuna',
    'tatsoi_standard': 'Tatsoi',
    'mustard_red_giant': 'Mustard greens',
    'mache_vit': 'Valerianella locusta',
    'sorrel_french': 'Sorrel herb',
    'radicchio_rossa': 'Radicchio',
    'endive_frisee': 'Endive',
    'asian_mix': 'Asian salad greens',
    'watercress_standard': 'Watercress',
    'purslane_golden': 'Portulaca oleracea',
    // Brassica
    'kale_red_russian': 'Kale',
    'broccoli_belstar': 'Broccoli',
    'cabbage_storage': 'Cabbage',
    'pac_choi_joi': 'Bok choy',
    'kohlrabi_kolibri': 'Kohlrabi',
    'cauliflower_snowball': 'Cauliflower',
    'brussels_sprouts': 'Brussels sprout',
    'collards_champion': 'Collard greens',
    'napa_cabbage': 'Napa cabbage',
    'romanesco': 'Romanesco broccoli',
    // Root
    'carrot_nantes': 'Carrot vegetable',
    'beet_chioggia': 'Beetroot',
    'turnip_hakurei': 'Turnip',
    'parsnip_harris': 'Parsnip',
    'celeriac_monarch': 'Celeriac',
    'daikon_miyashige': 'Daikon radish',
    'rutabaga_laurentian': 'Rutabaga',
    'potato_red_norland': 'Potato',
    'sweet_potato_beauregard': 'Sweet potato',
    'sunchoke_stampede': 'Jerusalem artichoke',
    'parsley_root': 'Hamburg parsley',
    'salsify_mammoth': 'Tragopogon porrifolius',
    // Allium
    'scallions_evergreen': 'Scallion',
    'leek_giant_musselburgh': 'Leek vegetable',
    'onion_candy': 'Onion',
    'cipollini_onion': 'Cipollini',
    'garlic_music': 'Garlic',
    'shallots_ambition': 'Shallot',
    'chives_standard': 'Chives',
    'ramps_wild': 'Allium tricoccum',
    // Legume
    'peas_sugar_snap': 'Sugar snap pea',
    'beans_green_bush': 'Green bean',
    'edamame_besweet': 'Edamame',
    'fava_beans': 'Fava bean',
    'cowpeas_iron_clay': 'Cowpea',
    'runner_beans': 'Runner bean',
    'snap_peas_cascadia': 'Snow pea',
    'soybeans_midori': 'Soybean',
    // Herb
    'cilantro_santo': 'Coriander herb',
    'basil_genovese': 'Basil',
    'parsley_flat_leaf': 'Parsley',
    'dill_fernleaf': 'Dill herb',
    'thyme_english': 'Thyme herb',
    'oregano_greek': 'Oregano',
    'sage_garden': 'Salvia officinalis',
    'rosemary_tuscan_blue': 'Rosemary herb',
    'mint_spearmint': 'Mentha spicata',
    'lemon_balm': 'Melissa officinalis',
    'tarragon_french': 'Tarragon',
    'fennel_bronze': 'Fennel',
    'chervil_curled': 'Chervil',
    'lavender_hidcote': 'Lavandula angustifolia',
    'chamomile_german': 'Chamomile',
    // Nightshade
    'tomato_heirloom_beefsteak': 'Heirloom tomato',
    'cherry_tomato_sungold': 'Cherry tomato',
    'pepper_sweet': 'Bell pepper',
    'pepper_jalapeño': 'Jalapeño',
    'eggplant_ichiban': 'Eggplant vegetable',
    'tomatillo_grande': 'Tomatillo',
    'ground_cherry_cossack': 'Physalis peruviana',
    'hot_pepper_habanero': 'Habanero',
    // Cucurbit
    'cucumber_marketmore': 'Cucumber',
    'zucchini_black_beauty': 'Zucchini',
    'summer_squash_pattypan': 'Pattypan squash',
    'butternut_squash': 'Butternut squash',
    'kabocha_squash': 'Kabocha',
    'delicata_squash': 'Delicata squash',
    'pumpkin_jack': 'Pumpkin',
    'cantaloupe_ambrosia': 'Cantaloupe',
    'watermelon_sugar_baby': 'Watermelon',
    'bitter_melon': 'Bitter melon',
    // Flower
    'sunflower_holiday': 'Sunflower',
    'zinnia_benary_giant': 'Zinnia',
    'snapdragon_rocket': 'Antirrhinum',
    'calendula_erfurter': 'Calendula officinalis',
    'statice_QIS': 'Limonium sinuatum',
    'strawflower_apricot': 'Xerochrysum bracteatum',
    'lisianthus_echo': 'Eustoma grandiflorum',
    'marigold_french': 'Tagetes patula',
    'nasturtium_jewel': 'Nasturtium flower',
    // Specialty
    'amaranth_grain': 'Amaranth grain',
    'quinoa_brightest': 'Quinoa',
    'corn_sweet_peaches': 'Sweet corn',
    'asparagus_millennium': 'Asparagus vegetable',
    'artichoke_imperial': 'Globe artichoke',
    'celery_utah': 'Celery',
    'okra_clemson': 'Okra',
    'rhubarb_victoria': 'Rhubarb',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function slugify(cropId) {
    return cropId.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').toLowerCase();
}

function get(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        lib.get(url, { headers: { 'User-Agent': 'AcreLogic/1.0 (crop-image-downloader)' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return get(res.headers.location).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function getWikipediaThumbnail(searchTerm) {
    const encoded = encodeURIComponent(searchTerm);
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=pageimages&format=json&pithumbsize=400&redirects=1`;
    const res = await get(apiUrl);
    const data = JSON.parse(res.body.toString());
    const pages = data?.query?.pages ?? {};
    for (const page of Object.values(pages)) {
        if (page.thumbnail?.source) return page.thumbnail.source;
    }
    return null;
}

async function downloadImage(url, destPath) {
    const res = await get(url);
    if (res.status === 200) {
        fs.writeFileSync(destPath, res.body);
        return true;
    }
    return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

    const crops = cropsJson.crops.filter(c => c.category !== 'Cover Crop');

    // Map crop_id → image filename (reuse existing PNGs where available)
    const existingImages = {};
    for (const f of fs.readdirSync(ASSETS_DIR)) {
        const base = path.basename(f, path.extname(f));
        existingImages[base] = f;
    }

    const imageMap = {}; // crop_id → relative asset filename

    // Map legacy filenames for existing 16 crops
    const LEGACY_MAP = {
        'radish_french_breakfast': 'radish.png',
        'spinach_space': 'spinach.png',
        'lettuce_mix': 'lettuce.png',
        'kale_red_russian': 'kale.png',
        'broccoli_belstar': 'broccoli.png',
        'carrot_nantes': 'carrots.png',
        'beet_chioggia': 'beets.png',
        'chard_rainbow': 'chard.png',
        'pac_choi_joi': 'pac_choi.png',
        'arugula_standard': 'arugula.png',
        'cilantro_santo': 'cilantro.png',
        'parsley_flat_leaf': 'parsley.png',
        'dill_fernleaf': 'dill.png',
        'fennel_bronze': 'fennel.png',
        'peas_sugar_snap': 'peas.png',
        'radicchio_rossa': 'radicchio.png',
        'turnip_hakurei': 'turnips.png',
    };

    let downloaded = 0, skipped = 0, failed = 0;

    for (const crop of crops) {
        const id = crop.id;

        // Already have a legacy image?
        if (LEGACY_MAP[id]) {
            imageMap[id] = LEGACY_MAP[id];
            skipped++;
            continue;
        }

        // Already downloaded previously?
        const slug = slugify(id);
        const existingFile = [`${slug}.jpg`, `${slug}.png`, `${slug}.jpeg`]
            .find(f => fs.existsSync(path.join(ASSETS_DIR, f)));
        if (existingFile) {
            imageMap[id] = existingFile;
            skipped++;
            continue;
        }

        const searchTerm = WIKI_SEARCH[id] ?? crop.name;
        process.stdout.write(`  Fetching [${id}] via "${searchTerm}"... `);

        try {
            const thumbUrl = await getWikipediaThumbnail(searchTerm);
            if (!thumbUrl) {
                console.log('❌ no thumbnail');
                failed++;
                continue;
            }

            const ext = thumbUrl.split('.').pop().split(/[?#]/)[0].toLowerCase();
            const filename = `${slug}.${['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'}`;
            const destPath = path.join(ASSETS_DIR, filename);
            const ok = await downloadImage(thumbUrl, destPath);
            if (ok) {
                imageMap[id] = filename;
                downloaded++;
                console.log(`✅ ${filename}`);
            } else {
                failed++;
                console.log(`❌ download failed`);
            }
        } catch (e) {
            failed++;
            console.log(`❌ ${e.message}`);
        }

        // Polite delay to avoid rate-limiting
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\nDone: ${downloaded} downloaded, ${skipped} reused, ${failed} failed\n`);

    // ── Generate cropImages.js ─────────────────────────────────────────────────
    // All require() calls must be static at module level for the bundler.
    const lines = [
        '// AUTO-GENERATED by scripts/download-crop-images.js — do not edit manually',
        '// Re-run: node scripts/download-crop-images.js',
        '',
        'const CROP_IMAGES = {',
    ];

    for (const crop of crops) {
        const id = crop.id;
        const file = imageMap[id];
        if (file) {
            lines.push(`  '${id}': require('../../assets/crops/${file}'),`);
        } else {
            lines.push(`  '${id}': null, // no image — will show emoji fallback`);
        }
    }

    lines.push('};', '', 'export default CROP_IMAGES;', '');
    fs.writeFileSync(OUTPUT_JS, lines.join('\n'));
    console.log(`✅ Generated ${OUTPUT_JS} (${crops.length} entries)`);
}

main().catch(e => { console.error(e); process.exit(1); });
