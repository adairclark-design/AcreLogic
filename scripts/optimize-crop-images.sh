#!/usr/bin/env bash
# optimize-crop-images.sh
# Converts all PNG crop images to WebP (q=82) and replaces them in-place.
# Requires: cwebp (brew install webp)
# Usage: bash scripts/optimize-crop-images.sh

set -euo pipefail

CROPS_DIR="assets/crops"
QUALITY=82
CONVERTED=0
FAILED=0

echo "🌱 AcreLogic — Crop Image Optimizer"
echo "  Source: $CROPS_DIR"
echo "  Quality: $QUALITY"
echo ""

BEFORE=$(du -sm "$CROPS_DIR" | awk '{print $1}')

for png in "$CROPS_DIR"/*.png; do
    base="${png%.png}"
    webp="$base.webp"

    # Convert PNG → WebP
    if cwebp -q "$QUALITY" -mt -quiet "$png" -o "$webp" 2>/dev/null; then
        # Replace PNG in-place: overwrite PNG with WebP bytes, keep .png extension
        # (Expo/RN references the file by name including .png extension)
        cp "$webp" "$png"
        rm "$webp"
        CONVERTED=$((CONVERTED + 1))
    else
        echo "  ⚠ Failed: $png"
        FAILED=$((FAILED + 1))
    fi
done

AFTER=$(du -sm "$CROPS_DIR" | awk '{print $1}')
SAVED=$((BEFORE - AFTER))

echo "✅ Done!"
echo "   Converted: $CONVERTED files"
echo "   Failed:    $FAILED files"
echo "   Before:    ${BEFORE}MB"
echo "   After:     ${AFTER}MB"
echo "   Saved:     ~${SAVED}MB ($(( SAVED * 100 / BEFORE ))% reduction)"
