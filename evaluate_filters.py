import json
import re

with open('src/data/crops.json') as f:
    crops = json.load(f)['crops']

with open('src/components/MegaMenuBar.js') as f:
    js_text = f.read()

start_idx = js_text.find('export const MEGA_CATEGORIES')
end_idx = js_text.find('export default function MegaMenuBar')
mega_cats_str = js_text[start_idx:end_idx].replace('export const MEGA_CATEGORIES =', 'const MEGA_CATEGORIES =')

node_script = f"""
const fs = require('fs');
const cropsData = JSON.parse(fs.readFileSync('src/data/crops.json', 'utf8'));
const crops = cropsData.crops;

{mega_cats_str}

let unmapped = [];
let sub_unmapped = [];

for (const c of crops) {{
    let topLevels = MEGA_CATEGORIES.filter(cat => cat.label !== 'All' && cat.filter(c));
    if (topLevels.length === 0) {{
        unmapped.push(c);
        continue;
    }}
    
    let hasSub = false;
    for (const topCat of topLevels) {{
        if (topCat.subcategories.some(sub => sub.filter(c))) {{
            hasSub = true;
            break;
        }}
    }}
    if (!hasSub) {{
        sub_unmapped.push({{ crop: c, topCat: topLevels.map(v => v.label).join(', ') }});
    }}
}}

if (unmapped.length > 0) {{
    console.log('=== COMPLETELY ORPHANED CROPS ===');
    console.log(unmapped.map(c => c.id + ' (Cat: ' + c.category + ')').join('\\n'));
}} else {{
    console.log('All crops belong to at least one top-level tab.');
}}
console.log('');
if (sub_unmapped.length > 0) {{
    console.log('=== ORPHANED FROM SUB-TABS ===');
    sub_unmapped.forEach(item => {{
        console.log(item.crop.id + ' (In ' + item.topCat + ')');
    }});
}} else {{
    console.log('All categorized crops belong to at least one sub-tab.');
}}
"""
with open('temp_eval.js', 'w') as f: f.write(node_script)
