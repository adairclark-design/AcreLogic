const fs = require('fs');
const cropsData = JSON.parse(fs.readFileSync('src/data/crops.json', 'utf8'));
const crops = cropsData.crops;

// Read the js file and manually extract just the MEGA_CATEGORIES structure
// A bit hacky, but robust enough. We can actually just require it if we mock React.
const React = { useState: () => [], useRef: () => ({}), useCallback: f=>f, useEffect: f=>f };
const ReactNative = { View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView', StyleSheet: { create: x=>x }, Platform: { OS: 'web' }, Animated: { Value: class{}, spring: ()=>({start:f=>f}), timing: ()=>({start:f=>f}), View: 'Animated.View' }, Pressable: 'Pressable' };
const Theme = { Colors: {}, Typography: {}, Spacing: {}, Radius: {}, Shadows: {} };

const m = require('module');
const originalRequire = m.prototype.require;
m.prototype.require = function (path) {
  if (path === 'react') return React;
  if (path === 'react-native') return ReactNative;
  if (path === '../theme') return Theme;
  return originalRequire.call(this, path);
};

// Next, we need Babel since it uses export/import statement.
// Since we don't want to mess with babel, let's just cheat:
let rawJs = fs.readFileSync('src/components/MegaMenuBar.js', 'utf8');
rawJs = rawJs.replace(/import .* from '.*';/g, '');
rawJs = rawJs.replace(/export const MEGA_CATEGORIES/g, 'const MEGA_CATEGORIES');
rawJs = rawJs.replace(/export default function .*/g, '');
rawJs += '\nmodule.exports = MEGA_CATEGORIES;\n';

fs.writeFileSync('temp_mega.js', rawJs);
const MEGA_CATEGORIES = require('./temp_mega.js');

let unmapped = [];
let sub_unmapped = [];

for (const c of crops) {
    // 1. Does it map to any top-level category (except All)?
    let topLevels = MEGA_CATEGORIES.filter(cat => cat.label !== 'All' && cat.filter(c));
    if (topLevels.length === 0) {
        unmapped.push(c);
        continue;
    }
    
    // 2. Does it map to at least one subcategory inside that top-level category?
    let hasSub = false;
    for (const topCat of topLevels) {
        if (topCat.subcategories.some(sub => sub.filter(c))) {
            hasSub = true;
            break;
        }
    }
    if (!hasSub) {
        sub_unmapped.push({ crop: c, topCat: topLevels.map(v => v.label).join(', ') });
    }
}

if (unmapped.length > 0) {
    console.log("=== COMPLETELY ORPHANED CROPS (Failed top-level category filters) ===");
    console.log(unmapped.map(c => `${c.id} (Category: ${c.category})`).join('\n'));
} else {
    console.log("All crops belong to at least one top-level tab.");
}

console.log("\n");

if (sub_unmapped.length > 0) {
    console.log("=== ORPHANED FROM SUB-TABS (Belongs to top-level tab, but no sub-chip catches it) ===");
    sub_unmapped.forEach(item => {
        console.log(`${item.crop.id} (In ${item.topCat})`);
    });
} else {
    console.log("All categorized crops belong to at least one sub-tab.");
}
