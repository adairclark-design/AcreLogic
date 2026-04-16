#!/usr/bin/env python3
"""
patch_potato_onion.py
─────────────────────
Ensures potato_onion is exclusively assigned to the Alliums tab.

Two-part fix:
  1. Verifies crops.json already has category=Allium, subcategory=Alliums (data is correct).
  2. Patches the MegaMenuBar.js Potatoes filter to explicitly exclude potato_onion.
"""

import json
import re
import sys

CROPS_JSON   = "src/data/crops.json"
MEGAMENU_JS  = "src/components/MegaMenuBar.js"

# ── Step 1: Verify / patch crops.json ─────────────────────────────────────────
print("→ Loading crops.json …")
with open(CROPS_JSON, "r", encoding="utf-8") as f:
    raw = f.read()

data = json.loads(raw)  # will raise if invalid JSON
crops = data["crops"]
print(f"  ✓ JSON valid — {len(crops)} crops loaded")

target = next((c for c in crops if isinstance(c, dict) and c.get("id") == "potato_onion"), None)
if target is None:
    print("  ✗ potato_onion not found in crops.json", file=sys.stderr)
    sys.exit(1)

print(f"  Found: id={target['id']}, category={target.get('category')}, subcategory={target.get('subcategory')}")

changed = False
if target.get("category") != "Allium":
    print(f"  Patching category: {target['category']} → Allium")
    target["category"] = "Allium"
    changed = True
if target.get("subcategory") != "Alliums":
    print(f"  Patching subcategory: {target.get('subcategory')} → Alliums")
    target["subcategory"] = "Alliums"
    changed = True

if changed:
    with open(CROPS_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("  ✓ crops.json patched and written")
    # Re-validate
    with open(CROPS_JSON, "r", encoding="utf-8") as f:
        json.loads(f.read())
    print("  ✓ crops.json re-validated — JSON is clean")
else:
    print("  ✓ crops.json already correct — no changes needed")

# ── Step 2: Patch MegaMenuBar.js Potatoes filter ──────────────────────────────
print("\n→ Patching MegaMenuBar.js Potatoes filter …")
with open(MEGAMENU_JS, "r", encoding="utf-8") as f:
    js = f.read()

OLD_FILTER = (
    "filter: c => c.id.includes('potato') && !c.id.includes('sweet_potato')"
)
NEW_FILTER = (
    "filter: c => c.id.includes('potato') && !c.id.includes('sweet_potato') && !c.id.includes('potato_onion')"
)

if NEW_FILTER in js:
    print("  ✓ MegaMenuBar.js already patched — no changes needed")
elif OLD_FILTER in js:
    js_patched = js.replace(OLD_FILTER, NEW_FILTER, 1)
    with open(MEGAMENU_JS, "w", encoding="utf-8") as f:
        f.write(js_patched)
    print("  ✓ MegaMenuBar.js patched: Potatoes filter now excludes potato_onion")
else:
    print("  ✗ Could not find expected Potatoes filter string in MegaMenuBar.js", file=sys.stderr)
    sys.exit(1)

print("\n✅ All patches applied successfully. potato_onion is now exclusively in Alliums.")
