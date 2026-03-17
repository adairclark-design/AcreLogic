/**
 * planExporter.js
 * ════════════════
 * Generates a styled HTML planting plan and exports it:
 *   - Web:    Opens a new browser window → window.print() (Save as PDF built in)
 *   - Native: expo-print → expo-sharing share sheet
 *
 * Public API:
 *   exportFamilyPlan(planResult, familySize)
 *   exportGardenPlan(planResult, spaceResult, familySize)
 */
import { Platform } from 'react-native';
import CROP_IMAGES from '../data/cropImages';

// ─── Platform branch ──────────────────────────────────────────────────────────
async function printHTML(html, filename = 'acrelogic-plan') {
    if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (!win) {
            const blob = new Blob([html], { type: 'text/html' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${filename}.html`;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 380);
    } else {
        try {
            const Print   = (await import('expo-print')).default;
            const Sharing = await import('expo-sharing');
            const { uri } = await Print.printToFileAsync({ html, base64: false });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'application/pdf',
                    dialogTitle: 'Save or Share Your Planting Plan',
                });
            } else {
                await Print.printAsync({ uri });
            }
        } catch (err) {
            console.warn('[planExporter] native print failed:', err);
        }
    }
}

// ─── Date helper ──────────────────────────────────────────────────────────────
function todayLabel() {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date());
}

// ─── Image → inline base64 data URL ──────────────────────────────────────────
// Fetches a local asset URL and converts it to a self-contained data: URI so
// the exported HTML document has no external image dependencies.
async function imageToDataURL(src) {
    try {
        const res  = await fetch(src);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror   = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null; // fall back gracefully to emoji
    }
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────
const BASE_CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #F5F5DC; color: #1A1A1A; font-size: 11px; }
    @media print {
        body { background: #F5F5DC; }
        .no-print { display: none !important; }
        .page-break { page-break-before: always; }
    }
    .header {
        background: #2D4F1E; color: #F5F5DC;
        padding: 18px 36px 16px; display: flex; align-items: center; gap: 16px;
    }
    .logo-leaf { font-size: 32px; }
    .logo-text h1 { font-size: 22px; font-weight: 700; letter-spacing: 4px; }
    .logo-text p  { font-size: 10px; color: #D2B48C; letter-spacing: 1.5px; margin-top: 2px; }
    .header-meta { margin-left: auto; text-align: right; font-size: 10px; color: rgba(245,245,220,0.7); line-height: 1.5; }
    .body { max-width: 960px; margin: 0 auto; padding: 20px 24px 48px; }
    .summary-banner {
        background: #2D4F1E; color: #F5F5DC;
        border-radius: 8px; padding: 14px 22px;
        display: flex; gap: 24px; margin-bottom: 18px; flex-wrap: wrap;
    }
    .sum-stat { flex: 1; min-width: 80px; }
    .sum-stat .val { font-size: 22px; font-weight: 700; }
    .sum-stat .lbl { font-size: 9px; color: #D2B48C; letter-spacing: 1px; text-transform: uppercase; margin-top: 1px; }
    .section-title {
        font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
        color: #2D4F1E; margin: 18px 0 10px;
        border-bottom: 2px solid rgba(45,79,30,0.15); padding-bottom: 5px;
    }
    .crop-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .crop-row {
        background: #fff; border: 1px solid rgba(45,79,30,0.12);
        border-radius: 7px; overflow: hidden; display: flex; flex-direction: column;
    }
    .crop-row-head {
        background: #2D4F1E; color: #F5F5DC;
        padding: 6px 10px; display: flex; align-items: center; gap: 8px;
    }
    .crop-row-emoji { font-size: 18px; line-height: 1; }
    .crop-row-name  { font-size: 13px; font-weight: 700; flex: 1; }
    .crop-row-variety { font-size: 9px; color: #D2B48C; margin-left: auto; }
    .crop-kpi { display: flex; background: rgba(45,79,30,0.05); border-bottom: 1px solid rgba(45,79,30,0.08); }
    .kpi { flex: 1; text-align: center; padding: 5px 4px; }
    .kpi-val { font-size: 12px; font-weight: 700; color: #2D4F1E; display: block; }
    .kpi-lbl { font-size: 8px; color: #6B6B6B; text-transform: uppercase; letter-spacing: 0.4px; }
    .crop-facts { padding: 6px 10px; display: flex; flex-direction: column; gap: 3px; }
    .fact { display: flex; align-items: flex-start; gap: 6px; font-size: 10px; }
    .fact .fi { width: 14px; text-align: center; flex-shrink: 0; }
    .fact .fl { color: #6B6B6B; flex: 1; }
    .fact .fv { font-weight: 600; text-align: right; max-width: 55%; }
    .fact .fv.hi { color: #2D4F1E; }
    .crop-note { padding: 0 10px 6px; font-size: 9px; color: #6B6B6B; font-style: italic; line-height: 1.4; }
    .info-card {
        background: #fff; border-radius: 8px; padding: 12px 16px;
        border: 1px solid rgba(45,79,30,0.12); margin-bottom: 12px;
    }
    .info-card h4 { font-size: 11px; font-weight: 700; color: #2D4F1E; margin-bottom: 8px; }
    .info-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(45,79,30,0.07); font-size: 10px; }
    .info-row:last-child { border-bottom: none; }
    .info-row .lbl { color: #6B6B6B; }
    .info-row .val { font-weight: 600; }
    .warn-bar { background: rgba(204,85,0,0.08); border-left: 3px solid #CC5500; border-radius: 5px; padding: 8px 12px; margin-bottom: 12px; font-size: 10px; color: #CC5500; }
    .footer { text-align: center; color: #6B6B6B; font-size: 10px; margin-top: 32px; padding-top: 14px; border-top: 1px solid rgba(45,79,30,0.15); }
    .good-luck { text-align: center; padding: 24px 0 18px; }
    .good-luck .emoji { font-size: 40px; display: block; margin-bottom: 8px; }
    .good-luck h2 { font-size: 18px; font-weight: 700; color: #2D4F1E; }
    .good-luck p  { font-size: 11px; color: #6B6B6B; margin-top: 4px; }
`;

// ─── Compact 2-column crop row HTML ──────────────────────────────────────────
// imgSrc: base64 data URL for the crop photo, or null to fall back to emoji
function cropCardHTML(item, imgSrc) {
    if (!item.isSupported) { return ''; }

    var kpiHTML;
    if (item.isFlower) {
        kpiHTML = '<div class="kpi"><span class="kpi-val">' + (item.stemsPerWeek || 0) + '/wk</span><span class="kpi-lbl">Stems</span></div>'
            + '<div class="kpi"><span class="kpi-val">' + (item.weeksSeason || 0) + ' wks</span><span class="kpi-lbl">Season</span></div>'
            + '<div class="kpi"><span class="kpi-val">' + (item.seedsToStart || 0) + '</span><span class="kpi-lbl">Plants</span></div>';
    } else {
        kpiHTML = '<div class="kpi"><span class="kpi-val">' + (item.targetLbs || 0) + ' lbs</span><span class="kpi-lbl">Goal</span></div>'
            + '<div class="kpi"><span class="kpi-val">' + (item.linearFeetNeeded || 0) + ' ft</span><span class="kpi-lbl">Row ft</span></div>'
            + '<div class="kpi"><span class="kpi-val">' + (item.seedsToStart || 0) + '</span><span class="kpi-lbl">' + (item.seedType === 'TP' ? 'Transplants' : 'Plants') + '</span></div>';
    }

    var facts = [];
    if (item.dtm) {
        facts.push('<div class="fact"><span class="fi">&#9201;</span><span class="fl">DTM</span><span class="fv">' + item.dtm + 'd</span></div>');
    }
    if (item.seedType) {
        facts.push('<div class="fact"><span class="fi">&#127807;</span><span class="fl">Method</span><span class="fv">' + (item.seedType === 'DS' ? 'Direct Sow' : 'Transplant') + '</span></div>');
    }
    if (item.indoorSeedDate) {
        facts.push('<div class="fact"><span class="fi">&#128197;</span><span class="fl">Start seeds indoors</span><span class="fv hi">' + item.indoorSeedDate + '</span></div>');
    } else if (item.seedStartWeeks) {
        facts.push('<div class="fact"><span class="fi">&#128197;</span><span class="fl">Start seeds</span><span class="fv">' + item.seedStartWeeks + ' wks before LF</span></div>');
    }
    if (item.transplantDate) {
        facts.push('<div class="fact"><span class="fi">&#127828;</span><span class="fl">Transplant</span><span class="fv hi">' + item.transplantDate + '</span></div>');
    }
    if (item.directSowDate) {
        facts.push('<div class="fact"><span class="fi">&#127807;</span><span class="fl">Sow date</span><span class="fv hi">' + item.directSowDate + '</span></div>');
    }
    if (item.inRowSpacingIn) {
        facts.push('<div class="fact"><span class="fi">&#8596;</span><span class="fl">In-row spacing</span><span class="fv">' + item.inRowSpacingIn + '"</span></div>');
    }
    if (item.rowSpacingIn) {
        facts.push('<div class="fact"><span class="fi">&#8597;</span><span class="fl">Row spacing (30" bed)</span><span class="fv">' + item.rowSpacingIn + '"</span></div>');
    }
    if (item.rowsPer30inBed) {
        facts.push('<div class="fact"><span class="fi">&#127997;</span><span class="fl">Rows/30" bed</span><span class="fv">' + item.rowsPer30inBed + '</span></div>');
    }
    if (item.harvestStyle) {
        facts.push('<div class="fact"><span class="fi">&#9986;</span><span class="fl">Harvest</span><span class="fv">' + item.harvestStyle + '</span></div>');
    }
    if (item.yieldLow != null && item.yieldHigh != null) {
        facts.push('<div class="fact"><span class="fi">&#128202;</span><span class="fl">Expected yield</span><span class="fv">' + item.yieldLow + '\u2013' + item.yieldHigh + ' lbs</span></div>');
    }

    // Use photorealistic image when available, emoji as fallback
    var cropIcon = imgSrc
        ? '<img src="' + imgSrc + '" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,0.3);" alt="' + item.cropName + '">'
        : '<span class="crop-row-emoji">' + (item.emoji || '\uD83C\uDF3F') + '</span>';

    var variety = item.variety
        ? '<span class="crop-row-variety">' + item.variety + '</span>'
        : '';
    var factsHTML = facts.length > 0
        ? '<div class="crop-facts">' + facts.join('') + '</div>'
        : '';
    var noteHTML = item.consumptionNotes
        ? '<div class="crop-note">&#128161; ' + item.consumptionNotes + '</div>'
        : '';

    return '<div class="crop-row">'
        + '<div class="crop-row-head">' + cropIcon
        + '<span class="crop-row-name">' + item.cropName + '</span>' + variety + '</div>'
        + '<div class="crop-kpi">' + kpiHTML + '</div>'
        + factsHTML
        + noteHTML
        + '</div>';
}

// ─── 1. Family Plan HTML ──────────────────────────────────────────────────────
async function buildFamilyPlanHTML(planResult, familySize) {
    // Prefetch all crop images in parallel → inline base64 data URLs
    var imgMap = {};
    if (Platform.OS === 'web') {
        await Promise.all(
            planResult.supported.map(async function(item) {
                var raw = CROP_IMAGES[item.cropId] ?? CROP_IMAGES[item.id];
                // Expo web resolves require() to:
                //   - a string URI            (Webpack static asset URL)
                //   - an object { uri: '...' } (Image source object)
                //   - a number                (native module ID — not useful on web)
                var src = null;
                if (typeof raw === 'string' && raw.length > 0) {
                    src = raw;
                } else if (raw && typeof raw === 'object' && typeof raw.uri === 'string') {
                    src = raw.uri;
                } else if (raw != null) {
                    // Last resort: resolve via the asset registry (Expo web exposes Asset)
                    try {
                        var resolved = require('expo-asset').Asset.fromModule(raw);
                        await resolved.downloadAsync();
                        src = resolved.localUri ?? resolved.uri ?? null;
                    } catch (_) {}
                }
                if (src) {
                    var dataUrl = await imageToDataURL(src);
                    if (dataUrl) { imgMap[item.cropId ?? item.id] = dataUrl; }
                }
            })
        );
    }

    var cropCardsHTML = planResult.supported.map(function(item) {
        var id = item.cropId ?? item.id;
        return cropCardHTML(item, imgMap[id] || null);
    }).join('');

    var warnHTML = planResult.unsupportedCrops.length
        ? '<div class="warn-bar">&#9888; No quantity data available for: ' + planResult.unsupportedCrops.join(', ') + '</div>'
        : '';

    var locationLine = (planResult.gardenProfile && planResult.gardenProfile.address)
        ? (planResult.gardenProfile.address + ' &middot; ' + planResult.gardenProfile.frost_free_days + ' frost-free days')
        : 'Location not set &mdash; add your zip for exact planting dates';

    return '<!DOCTYPE html><html lang="en"><head>'
        + '<meta charset="UTF-8">'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<title>AcreLogic &middot; Family Planting Plan</title>'
        + '<style>' + BASE_CSS + '</style>'
        + '</head><body>'
        + '<div class="header">'
        + '<span class="logo-leaf">&#127807;</span>'
        + '<div class="logo-text"><h1>ACRELOGIC</h1><p>FAMILY PLANTING PLAN</p></div>'
        + '<div class="header-meta">Generated ' + todayLabel() + '<br>Family of ' + familySize
        + '<br><span style="font-size:9px;opacity:0.7">' + locationLine + '</span></div>'
        + '</div>'
        + '<div class="body">'
        + '<div class="summary-banner">'
        + '<div class="sum-stat"><div class="val">' + planResult.supported.length + '</div><div class="lbl">Crops</div></div>'
        + '<div class="sum-stat"><div class="val">' + planResult.totalLinearFt + ' ft</div><div class="lbl">Total row feet</div></div>'
        + '<div class="sum-stat"><div class="val">~' + planResult.totalBedsNeeded + '</div><div class="lbl">Est. 4&times;8 beds</div></div>'
        + '<div class="sum-stat"><div class="val">' + familySize + '</div><div class="lbl">Family members</div></div>'
        + '</div>'
        + warnHTML
        + '<div class="section-title">Your Planting Plan</div>'
        + '<div class="crop-grid">' + cropCardsHTML + '</div>'
        + '<div class="good-luck"><span class="emoji">&#129388;</span><h2>Good Luck Gardening!</h2><p>Happy planting this season.</p></div>'
        + '<div class="footer">Generated by AcreLogic &middot; acrelogic.pages.dev<br>'
        + 'Quantities are estimates based on USDA household consumption averages and include a 15% loss buffer. Row spacing notes are based on 30&Prime; wide beds.</div>'
        + '</div></body></html>';
}

// ─── 2. Garden Space Plan CSS (extends BASE_CSS) ──────────────────────────────
const GARDEN_EXTRA_CSS = `
    .bed-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-top: 14px; }
    .bed-card { background: #fff; border: 1px solid rgba(45,79,30,0.12); border-radius: 7px; overflow: hidden; }
    .bed-head { background: #4A7C2F; color: #F5F5DC; padding: 6px 10px; font-size: 11px; font-weight: 700; }
    .bed-crop { padding: 4px 10px; font-size: 10px; border-bottom: 1px solid rgba(45,79,30,0.07); display: flex; justify-content: space-between; }
    .bed-crop:last-child { border-bottom: none; }
    .bed-crop .cn { color: #2D4F1E; font-weight: 600; }
    .bed-crop .cl { color: #6B6B6B; }
`;

// ─── 3. Garden Space Plan HTML ────────────────────────────────────────────────
function buildGardenPlanHTML(planResult, spaceResult, familySize) {
    var bedCardsHTML = (spaceResult.beds || []).map(function(bed) {
        var cropsHTML = (bed.crops || []).map(function(c) {
            return '<div class="bed-crop"><span class="cn">' + (c.cropName || c.name || '') + '</span>'
                + '<span class="cl">' + (c.rowsUsed || '') + ' rows</span></div>';
        }).join('');
        return '<div class="bed-card"><div class="bed-head">Bed ' + bed.id + '</div>' + cropsHTML + '</div>';
    }).join('');

    return '<!DOCTYPE html><html lang="en"><head>'
        + '<meta charset="UTF-8">'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<title>AcreLogic &middot; Garden Space Plan</title>'
        + '<style>' + BASE_CSS + GARDEN_EXTRA_CSS + '</style>'
        + '</head><body>'
        + '<div class="header">'
        + '<span class="logo-leaf">&#127807;</span>'
        + '<div class="logo-text"><h1>ACRELOGIC</h1><p>GARDEN SPACE PLAN</p></div>'
        + '<div class="header-meta">Generated ' + todayLabel() + '<br>Family of ' + familySize + '</div>'
        + '</div>'
        + '<div class="body">'
        + '<div class="summary-banner">'
        + '<div class="sum-stat"><div class="val">' + ((spaceResult.beds || []).length) + '</div><div class="lbl">Beds</div></div>'
        + '<div class="sum-stat"><div class="val">' + planResult.supported.length + '</div><div class="lbl">Crops</div></div>'
        + '<div class="sum-stat"><div class="val">' + familySize + '</div><div class="lbl">Family</div></div>'
        + '</div>'
        + '<div class="section-title">Bed Layout</div>'
        + '<div class="bed-grid">' + bedCardsHTML + '</div>'
        + '<div class="footer">Generated by AcreLogic &middot; acrelogic.pages.dev</div>'
        + '</div></body></html>';
}

// ─── Public exports ───────────────────────────────────────────────────────────
export async function exportFamilyPlan(planResult, familySize) {
    var html = await buildFamilyPlanHTML(planResult, familySize);
    await printHTML(html, 'acrelogic-family-plan');
}

export async function exportGardenPlan(planResult, spaceResult, familySize) {
    var html = buildGardenPlanHTML(planResult, spaceResult, familySize);
    await printHTML(html, 'acrelogic-garden-plan');
}
