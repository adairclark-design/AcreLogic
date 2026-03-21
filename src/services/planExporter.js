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
 *
 * PDF Sections (in order):
 *   1. Your Planting Plan  — crop cards (existing)
 *   2. Action Calendar     — week-by-week task timeline
 *   3. Seed Shopping List  — packets & estimated cost
 *   4. Yield & ROI Forecast — season totals + per-crop breakdown
 */
import { Platform } from 'react-native';

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
        return null;
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
        color: #2D4F1E; margin: 24px 0 10px;
        border-bottom: 2px solid rgba(45,79,30,0.15); padding-bottom: 5px;
    }
    .crop-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .crop-row {
        background: #fff; border: 1px solid rgba(45,79,30,0.12);
        border-radius: 7px; overflow: hidden; display: flex; flex-direction: column;
        break-inside: avoid; page-break-inside: avoid;
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
    .succession-note { margin: 0 10px 6px; padding: 5px 8px; font-size: 9px; color: #7A4500; line-height: 1.4;
        background: rgba(204,120,0,0.07); border-left: 2px solid #CC7800; border-radius: 3px; }

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

    /* ── Calendar section ─────────────────────── */
    .cal-month { margin-bottom: 16px; break-inside: avoid; }
    .cal-month-header {
        background: #2D4F1E; color: #F5F5DC;
        font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
        padding: 6px 12px; border-radius: 5px 5px 0 0;
    }
    .cal-week {
        border: 1px solid rgba(45,79,30,0.12); border-top: none;
        background: #fff; padding: 6px 10px; display: flex; align-items: flex-start; gap: 10px;
    }
    .cal-week:last-child { border-radius: 0 0 5px 5px; }
    .cal-week-label { font-size: 9px; color: #6B6B6B; font-weight: 600; min-width: 90px; padding-top: 2px; }
    .cal-events { display: flex; flex-wrap: wrap; gap: 4px; }
    .cal-chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 7px; border-radius: 20px; font-size: 9px; font-weight: 600;
        line-height: 1.2;
    }
    .chip-indoor    { background: #E8F5E9; color: #2E7D32; }
    .chip-sow       { background: #E3F2FD; color: #1565C0; }
    .chip-transplant{ background: #FFF9C4; color: #F57F17; }
    .chip-harvest   { background: #FBE9E7; color: #BF360C; }

    /* ── Seeds section ───────────────────────── */
    .seeds-banner {
        background: #2D4F1E; color: #F5F5DC;
        border-radius: 7px; padding: 12px 20px;
        display: flex; gap: 24px; margin-bottom: 14px;
    }
    .seeds-stat { flex: 1; text-align: center; }
    .seeds-stat .sv { font-size: 18px; font-weight: 700; }
    .seeds-stat .sl { font-size: 9px; color: #D2B48C; text-transform: uppercase; letter-spacing: 1px; margin-top: 1px; }
    .seeds-section-head {
        font-size: 11px; font-weight: 700; color: #2D4F1E;
        padding: 8px 0 4px; border-bottom: 2px solid #2D4F1E; margin-bottom: 2px;
    }
    .seeds-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    .seeds-table th { background: rgba(45,79,30,0.08); padding: 5px 8px; text-align: left; font-size: 9px; color: #2D4F1E; text-transform: uppercase; letter-spacing: 0.5px; }
    .seeds-table td { padding: 5px 8px; font-size: 10px; border-bottom: 1px solid rgba(45,79,30,0.07); }
    .seeds-table tr:last-child td { border-bottom: none; }
    .seeds-subtotal { text-align: right; font-size: 9px; font-style: italic; color: #2D4F1E; font-weight: 600; padding: 3px 8px 10px; }
    .seeds-grand {
        background: #2D4F1E; color: #F5F5DC;
        border-radius: 7px; padding: 12px 16px; text-align: center; margin-top: 8px;
    }
    .seeds-grand .sg-label { font-size: 9px; color: #D2B48C; text-transform: uppercase; letter-spacing: 1px; }
    .seeds-grand .sg-value { font-size: 20px; font-weight: 700; margin-top: 3px; }
    .seeds-grand .sg-note  { font-size: 9px; color: rgba(245,245,220,0.65); margin-top: 3px; }

    /* ── Yield section ───────────────────────── */
    .yield-hero {
        background: #2D4F1E; color: #F5F5DC;
        border-radius: 7px; padding: 14px 20px;
        display: flex; gap: 24px; margin-bottom: 14px;
    }
    .yield-stat { flex: 1; text-align: center; }
    .yield-stat .yv { font-size: 18px; font-weight: 700; }
    .yield-stat .yl { font-size: 9px; color: #D2B48C; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
    .yield-table { width: 100%; border-collapse: collapse; }
    .yield-table th { background: #2D4F1E; color: #fff; padding: 6px 10px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
    .yield-table td { padding: 6px 10px; font-size: 10px; border-bottom: 1px solid rgba(45,79,30,0.07); }
    .yield-table tr:nth-child(even) td { background: rgba(45,79,30,0.03); }
    .yield-total td { border-top: 2px solid #2D4F1E; font-weight: 700; color: #2D4F1E; font-size: 10px; }
    .yield-note { font-size: 9px; color: #6B6B6B; font-style: italic; margin-top: 8px; text-align: center; }
`;

// ─── Compact 2-column crop row HTML ──────────────────────────────────────────
function cropCardHTML(item, imgSrc) {
    if (!item.isSupported) { return ''; }

    var kpiHTML;
    if (item.isFlower) {
        kpiHTML = '<div class="kpi"><span class="kpi-val">' + (item.stemsPerWeek || 0) + '/wk</span><span class="kpi-lbl">Stems</span></div>'
            + '<div class="kpi"><span class="kpi-val">' + (item.weeksSeason || 0) + ' wks</span><span class="kpi-lbl">Season</span></div>'
            + '<div class="kpi"><span class="kpi-val">' + (item.seedsToStart || 0) + '</span><span class="kpi-lbl">Plants</span></div>';
    } else {
        kpiHTML = '<div class="kpi"><span class="kpi-val">' + (item.targetLbs || 0) + ' lbs</span><span class="kpi-lbl">Goal</span></div>'
            + '<div class="kpi"><span class="kpi-val">' + (item.seedsToStart || 0) + '</span><span class="kpi-lbl">' + (item.seedType === 'TP' ? 'Transplants' : 'Plants') + '</span></div>';
    }

    var facts = [];
    if (item.dtm) {
        facts.push('<div class="fact"><span class="fi">&#9201;</span><span class="fl">DTM</span><span class="fv">' + item.dtm + 'd</span></div>');
    }
    if (item.inGroundDays && item.inGroundDays > item.dtm) {
        facts.push('<div class="fact"><span class="fi">&#128197;</span><span class="fl">In-ground window</span><span class="fv">' + item.inGroundDays + ' days total</span></div>');
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
    if (item.harvestStyle) {
        facts.push('<div class="fact"><span class="fi">&#9986;</span><span class="fl">Harvest</span><span class="fv">' + item.harvestStyle + '</span></div>');
    }
    if (item.yieldLow != null && item.yieldHigh != null) {
        facts.push('<div class="fact"><span class="fi">&#128202;</span><span class="fl">Expected yield</span><span class="fv">' + item.yieldLow + '\u2013' + item.yieldHigh + ' lbs</span></div>');
    }

    var cropIcon = imgSrc
        ? '<img src="' + imgSrc + '" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,0.3);" alt="' + item.cropName + '">'
        : '<span class="crop-row-emoji">' + (item.emoji || '\uD83C\uDF3F') + '</span>';

    var PLACEHOLDER_VARIETIES = new Set(['Primary','Standard','Heirloom','Hybrid']);
    var variety = item.variety && !PLACEHOLDER_VARIETIES.has(item.variety)
        ? '<span class="crop-row-variety">' + item.variety + '</span>'
        : '';
    var factsHTML = facts.length > 0
        ? '<div class="crop-facts">' + facts.join('') + '</div>'
        : '';
    var successionHTML = (item.needsSuccession && item.successionNote)
        ? '<div class="succession-note">&#9889; ' + item.successionNote + '</div>'
        : '';
    var noteHTML = item.consumptionNotes
        ? '<div class="crop-note">&#128161; ' + item.consumptionNotes + '</div>'
        : '';

    return '<div class="crop-row">'
        + '<div class="crop-row-head">' + cropIcon
        + '<span class="crop-row-name">' + item.cropName + '</span>' + variety + '</div>'
        + '<div class="crop-kpi">' + kpiHTML + '</div>'
        + factsHTML
        + successionHTML
        + noteHTML
        + '</div>';
}

// ─── Section 2: Action Calendar HTML ─────────────────────────────────────────
const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

function parseISO(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    const parts = dateStr.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
}

function isoDate(date) {
    return date.toISOString().split('T')[0];
}

function calWeekLabel(date) {
    const month = MONTH_NAMES[date.getMonth()].slice(0, 3);
    return 'Week of ' + month + ' ' + date.getDate();
}

function extractCalendarEvents(crops) {
    var events = [];
    for (var i = 0; i < crops.length; i++) {
        var c = crops[i];
        var name = c.variety ? (c.cropName + ' (' + c.variety + ')') : c.cropName;

        function push(dateRaw, type, roundLabel) {
            var date = parseISO(dateRaw);
            if (!date) return;
            var weekStart = startOfWeek(date);
            events.push({
                date: date,
                weekKey: isoDate(weekStart),
                monthKey: date.getFullYear() + '-' + String(date.getMonth()).padStart(2, '0'),
                monthLabel: MONTH_NAMES[date.getMonth()] + ' ' + date.getFullYear(),
                weekLabel: calWeekLabel(weekStart),
                displayName: name,
                type: type,
                roundLabel: roundLabel || null,
            });
        }

        push(c.indoorSeedDateRaw, 'indoor', null);
        push(c.directSowDateRaw, 'sow', c.successionDates && c.successionDates.length > 0 ? 'Round 1' : null);
        push(c.transplantDateRaw, 'transplant', null);
        push(c.harvestStartDateRaw, 'harvest', null);

        if (c.successionDates && c.successionDates.length > 0) {
            for (var s = 0; s < c.successionDates.length; s++) {
                push(c.successionDates[s].dateRaw, 'sow', 'Round ' + c.successionDates[s].round);
            }
        }
    }
    events.sort(function(a, b) { return a.weekKey < b.weekKey ? -1 : a.weekKey > b.weekKey ? 1 : 0; });
    return events;
}

var CHIP_CLASS = { indoor: 'chip-indoor', sow: 'chip-sow', transplant: 'chip-transplant', harvest: 'chip-harvest' };
var CHIP_EMOJI = { indoor: '🌱', sow: '💧', transplant: '🌤', harvest: '✂️' };

function buildCalendarSectionHTML(crops) {
    var events = extractCalendarEvents(crops);
    if (events.length === 0) {
        return '<p style="color:#6B6B6B;font-style:italic;font-size:10px;padding:8px 0;">Add a location to your profile to see exact planting dates.</p>';
    }

    // Group by month → by week
    var months = {}; // monthKey → { label, weeks: { weekKey → { label, events[] } } }
    var monthOrder = [];
    for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (!months[ev.monthKey]) {
            months[ev.monthKey] = { label: ev.monthLabel, weeks: {}, weekOrder: [] };
            monthOrder.push(ev.monthKey);
        }
        var m = months[ev.monthKey];
        if (!m.weeks[ev.weekKey]) {
            m.weeks[ev.weekKey] = { label: ev.weekLabel, events: [] };
            m.weekOrder.push(ev.weekKey);
        }
        m.weeks[ev.weekKey].events.push(ev);
    }

    var html = '';
    for (var mi = 0; mi < monthOrder.length; mi++) {
        var mk = monthOrder[mi];
        var month = months[mk];
        html += '<div class="cal-month">';
        html += '<div class="cal-month-header">' + month.label + '</div>';
        for (var wi = 0; wi < month.weekOrder.length; wi++) {
            var wk = month.weekOrder[wi];
            var week = month.weeks[wk];
            html += '<div class="cal-week">';
            html += '<span class="cal-week-label">' + week.label + '</span>';
            html += '<div class="cal-events">';
            for (var ei = 0; ei < week.events.length; ei++) {
                var e = week.events[ei];
                var chip = CHIP_CLASS[e.type] || 'chip-sow';
                var emoji = CHIP_EMOJI[e.type] || '';
                var label = e.displayName + (e.roundLabel ? ' · ' + e.roundLabel : '');
                html += '<span class="cal-chip ' + chip + '">' + emoji + ' ' + label + '</span>';
            }
            html += '</div></div>';
        }
        html += '</div>';
    }
    return html;
}

// ─── Section 3: Seed Shopping List HTML ──────────────────────────────────────
var CATEGORY_SPECS = {
    'Greens':     { seedsPerPacket: 400, price: 3.49, unit: 'seeds' },
    'Brassica':   { seedsPerPacket: 150, price: 3.99, unit: 'seeds' },
    'Root':       { seedsPerPacket: 300, price: 3.49, unit: 'seeds' },
    'Tuber':      { seedsPerPacket:   1, price: 4.99, unit: 'starts', isSpecial: true },
    'Allium':     { seedsPerPacket: 100, price: 3.99, unit: 'seeds' },
    'Legume':     { seedsPerPacket:  60, price: 3.99, unit: 'seeds' },
    'Herb':       { seedsPerPacket: 200, price: 3.99, unit: 'seeds' },
    'Nightshade': { seedsPerPacket:  25, price: 4.99, unit: 'seeds' },
    'Cucurbit':   { seedsPerPacket:  20, price: 4.49, unit: 'seeds' },
    'Flower':     { seedsPerPacket:  50, price: 4.49, unit: 'seeds' },
    'Specialty':  { seedsPerPacket:  40, price: 4.99, unit: 'seeds' },
    'Grain':      { seedsPerPacket: 200, price: 3.49, unit: 'seeds' },
    'Fruit':      { seedsPerPacket:   1, price: 6.99, unit: 'plants', isSpecial: true },
    'Cover Crop': { seedsPerPacket: 500, price: 3.99, unit: 'seeds' },
};
var DEFAULT_SPECS = { seedsPerPacket: 50, price: 4.99, unit: 'seeds' };

function specsFor(crop) { return CATEGORY_SPECS[crop.category] || DEFAULT_SPECS; }
function fmtMoney(n) { return '$' + n.toFixed(2); }

function seedLineTotal(crop) {
    var specs = specsFor(crop);
    var qty = crop.seedsToStart || crop.plantsNeeded || 1;
    if (specs.isSpecial) return qty * specs.price;
    var packets = Math.max(1, Math.ceil(qty / specs.seedsPerPacket));
    return packets * specs.price;
}

function seedSectionTableHTML(sectionCrops) {
    if (sectionCrops.length === 0) return '';
    var rows = '';
    var subtotal = 0;
    for (var i = 0; i < sectionCrops.length; i++) {
        var c = sectionCrops[i];
        var specs = specsFor(c);
        var qty = c.seedsToStart || c.plantsNeeded || 1;
        var packetsStr, detail;
        if (specs.isSpecial) {
            packetsStr = qty + ' ' + specs.unit;
            detail = fmtMoney(specs.price) + '/ea';
        } else {
            var pkt = Math.max(1, Math.ceil(qty / specs.seedsPerPacket));
            packetsStr = pkt + (pkt === 1 ? ' packet' : ' packets');
            detail = qty + ' seeds · ~' + specs.seedsPerPacket + '/pkt';
        }
        var lineTotal = seedLineTotal(c);
        subtotal += lineTotal;
        var cropLabel = c.cropName + (c.variety ? ' · ' + c.variety : '');
        rows += '<tr><td>' + cropLabel + '</td><td style="color:#6B6B6B;">' + detail + '</td>'
            + '<td style="font-weight:600;color:#2D4F1E;">' + packetsStr + '</td>'
            + '<td style="font-weight:600;text-align:right;">' + fmtMoney(lineTotal) + '</td></tr>';
    }
    return rows + '<tr><td colspan="3" style="text-align:right;font-style:italic;color:#2D4F1E;font-weight:600;font-size:9px;padding-top:4px;">Section subtotal</td>'
        + '<td style="font-weight:700;color:#2D4F1E;text-align:right;">' + fmtMoney(subtotal) + '</td></tr>';
}

function buildSeedsSectionHTML(crops) {
    var directSow = crops.filter(function(c) { return c.seedType === 'DS' && !specsFor(c).isSpecial; });
    var startIndoors = crops.filter(function(c) { return c.seedType === 'TP' && !specsFor(c).isSpecial; });
    var specialPurchase = crops.filter(function(c) { return specsFor(c).isSpecial; });

    var grandTotal = crops.reduce(function(s, c) { return s + seedLineTotal(c); }, 0);
    var grandLow  = grandTotal * 0.8;
    var grandHigh = grandTotal * 1.2;
    var totalPackets = [...directSow, ...startIndoors].reduce(function(s, c) {
        var specs = specsFor(c);
        var qty = c.seedsToStart || 1;
        return s + Math.max(1, Math.ceil(qty / specs.seedsPerPacket));
    }, 0);

    var tableHead = '<table class="seeds-table"><thead><tr>'
        + '<th>Crop</th><th>Seeds Needed</th><th>Qty</th><th style="text-align:right;">Est. Cost</th>'
        + '</tr></thead><tbody>';
    var tableEnd = '</tbody></table>';

    var html = '';

    // Banner
    html += '<div class="seeds-banner">'
        + '<div class="seeds-stat"><div class="sv">' + totalPackets + '</div><div class="sl">Seed Packets</div></div>'
        + '<div class="seeds-stat"><div class="sv">' + fmtMoney(grandLow) + '&ndash;' + fmtMoney(grandHigh) + '</div><div class="sl">Est. Seed Cost</div></div>'
        + '</div>';

    if (directSow.length > 0) {
        html += '<div class="seeds-section-head">💧 Direct Sow Seeds</div>';
        html += tableHead + seedSectionTableHTML(directSow) + tableEnd;
    }
    if (startIndoors.length > 0) {
        html += '<div class="seeds-section-head" style="margin-top:12px;">🪴 Start Indoors / Transplant</div>';
        html += tableHead + seedSectionTableHTML(startIndoors) + tableEnd;
    }
    if (specialPurchase.length > 0) {
        html += '<div class="seeds-section-head" style="margin-top:12px;">🛒 Buy as Starts / Tubers</div>';
        html += tableHead + seedSectionTableHTML(specialPurchase) + tableEnd;
    }

    html += '<div class="seeds-grand">'
        + '<div class="sg-label">Estimated Total Seed Investment</div>'
        + '<div class="sg-value">' + fmtMoney(grandLow) + ' &ndash; ' + fmtMoney(grandHigh) + '</div>'
        + '<div class="sg-note">Based on ' + totalPackets + ' seed packet' + (totalPackets !== 1 ? 's' : '')
        + (specialPurchase.length > 0 ? ' + ' + specialPurchase.length + ' specialty start' + (specialPurchase.length !== 1 ? 's' : '') : '')
        + ' &middot; Retail averages: Johnny\'s, Baker Creek, High Mowing</div>'
        + '</div>';

    return html;
}

// ─── Section 4: Yield & ROI Forecast HTML ────────────────────────────────────
var RETAIL_PRICE_PER_LB = {
    'Greens': 3.00, 'Brassica': 2.50, 'Root': 1.50, 'Tuber': 1.00,
    'Allium': 1.25, 'Legume': 3.00, 'Herb': 10.00, 'Nightshade': 2.75,
    'Cucurbit': 1.50, 'Specialty': 3.00, 'Grain': 1.00, 'Fruit': 4.00,
    'Cover Crop': null, 'Flower': null,
};

function priceFor(category) {
    var p = RETAIL_PRICE_PER_LB[category];
    return (p == null) ? null : p;
}

function buildYieldSectionHTML(crops) {
    var produceCrops = crops.filter(function(c) {
        return !c.isFlower && c.yieldLow != null && c.yieldHigh != null && c.yieldHigh > 0;
    });
    var specialCrops = crops.filter(function(c) {
        return c.isFlower || !c.yieldLow || c.yieldHigh === 0;
    });

    if (produceCrops.length === 0) {
        return '<p style="color:#6B6B6B;font-style:italic;font-size:10px;padding:8px 0;">No yield data available for selected crops.</p>';
    }

    var totalLow  = produceCrops.reduce(function(s, c) { return s + (c.yieldLow  || 0); }, 0);
    var totalHigh = produceCrops.reduce(function(s, c) { return s + (c.yieldHigh || 0); }, 0);
    var valueLow  = produceCrops.reduce(function(s, c) {
        var p = priceFor(c.category);
        return s + (p != null ? (c.yieldLow || 0) * p : 0);
    }, 0);
    var valueHigh = produceCrops.reduce(function(s, c) {
        var p = priceFor(c.category);
        return s + (p != null ? (c.yieldHigh || 0) * p : 0);
    }, 0);

    var sorted = produceCrops.slice().sort(function(a, b) { return (b.yieldHigh || 0) - (a.yieldHigh || 0); });

    var html = '';

    // Hero
    html += '<div class="yield-hero">'
        + '<div class="yield-stat"><div class="yv">' + totalLow + '&ndash;' + totalHigh + ' lbs</div><div class="yl">Projected Harvest</div></div>'
        + '<div class="yield-stat"><div class="yv">' + fmtMoney(valueLow) + '&ndash;' + fmtMoney(valueHigh) + '</div><div class="yl">Retail Market Value</div></div>'
        + '</div>';

    // Breakdown table
    html += '<table class="yield-table"><thead><tr>'
        + '<th>Crop</th><th>Yield Range</th><th>$/lb</th><th style="text-align:right;">Est. Value</th>'
        + '</tr></thead><tbody>';

    for (var i = 0; i < sorted.length; i++) {
        var c = sorted[i];
        var price = priceFor(c.category);
        var rowValLow  = price != null ? Math.round((c.yieldLow  || 0) * price) : null;
        var rowValHigh = price != null ? Math.round((c.yieldHigh || 0) * price) : null;
        html += '<tr>'
            + '<td style="color:#2D4F1E;font-weight:600;">' + c.cropName + (c.variety ? ' <span style="color:#6B6B6B;font-weight:400;">(' + c.variety + ')</span>' : '') + '</td>'
            + '<td>' + (c.yieldLow || 0) + '&ndash;' + (c.yieldHigh || 0) + ' lbs</td>'
            + '<td style="color:#6B6B6B;">' + (price != null ? fmtMoney(price) : '&mdash;') + '</td>'
            + '<td style="text-align:right;font-weight:600;color:#BF360C;">' + (rowValLow != null ? fmtMoney(rowValLow) + '&ndash;' + fmtMoney(rowValHigh) : '&mdash;') + '</td>'
            + '</tr>';
    }

    // Total row
    html += '</tbody><tfoot><tr class="yield-total">'
        + '<td>Total (' + produceCrops.length + ' crops)</td>'
        + '<td>' + totalLow + '&ndash;' + totalHigh + ' lbs</td>'
        + '<td></td>'
        + '<td style="text-align:right;">' + fmtMoney(valueLow) + '&ndash;' + fmtMoney(valueHigh) + '</td>'
        + '</tr></tfoot></table>';

    if (specialCrops.length > 0) {
        html += '<p style="font-size:9px;color:#E65100;margin-top:8px;">&#127800; ' + specialCrops.length
            + ' crop' + (specialCrops.length !== 1 ? 's' : '') + ' not included in totals: '
            + specialCrops.map(function(c) { return c.cropName; }).join(', ') + '.</p>';
    }

    html += '<p class="yield-note">&#128202; Yields are estimates (±20% of your season goal). '
        + 'Retail prices reflect USDA averages and vary by region.</p>';

    return html;
}

// ─── 1. Family Plan HTML ──────────────────────────────────────────────────────
async function buildFamilyPlanHTML(planResult, familySize) {
    var imgMap = {};
    if (Platform.OS === 'web') {
        var baseUrl = window.location.origin;
        await Promise.all(
            planResult.supported.map(async function(item) {
                var cropId = item.cropId ?? item.id;
                if (!cropId) return;
                var dataUrl = await imageToDataURL(baseUrl + '/crops/' + cropId + '.png');
                if (!dataUrl) dataUrl = await imageToDataURL(baseUrl + '/crops/' + cropId + '.jpg');
                if (dataUrl) { imgMap[cropId] = dataUrl; }
            })
        );
    }

    var crops = planResult.supported;

    var cropCardsHTML = crops.map(function(item) {
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
        + '<div class="sum-stat"><div class="val">' + crops.length + '</div><div class="lbl">Crops</div></div>'
        + '<div class="sum-stat"><div class="val">' + familySize + '</div><div class="lbl">Family members</div></div>'
        + '</div>'
        + warnHTML
        // ── Section 1: Crop Cards ──
        + '<div class="section-title">Your Planting Plan</div>'
        + '<div class="crop-grid">' + cropCardsHTML + '</div>'
        // ── Section 2: Action Calendar ──
        + '<div class="section-title page-break">&#128197;&nbsp; Action Calendar</div>'
        + buildCalendarSectionHTML(crops)
        // ── Section 3: Seed Shopping List ──
        + '<div class="section-title">&#127807;&nbsp; Seed Shopping List</div>'
        + buildSeedsSectionHTML(crops)
        // ── Section 4: Yield & ROI Forecast ──
        + '<div class="section-title">&#128202;&nbsp; Yield &amp; ROI Forecast</div>'
        + buildYieldSectionHTML(crops)
        // ── Footer ──
        + '<div class="good-luck"><span class="emoji">&#129388;</span><h2>Good Luck Gardening!</h2><p>Happy planting this season.</p></div>'
        + '<div class="footer">Generated by AcreLogic &middot; acrelogic.pages.dev<br>'
        + 'Quantities are estimates based on USDA household consumption averages and include a 15% germination/pest loss buffer.</div>'
        + '</div></body></html>';
}

// ─── 2. Garden Space Plan HTML ────────────────────────────────────────────────
async function loadImageAsDataURL(cropId) {
    if (Platform.OS !== 'web') return null;
    var baseUrl = window.location.origin;
    var url = await imageToDataURL(baseUrl + '/crops/' + cropId + '.png');
    if (!url) url = await imageToDataURL(baseUrl + '/crops/' + cropId + '.jpg');
    return url || null;
}

async function buildGardenPlanHTML(planResult, spaceResult, familySize) {
    var imgMap = {};
    var imagePromises = planResult.supported.map(async function(item) {
        var id = item.cropId || item.id;
        var src = await loadImageAsDataURL(id);
        if (src) imgMap[id] = src;
    });
    await Promise.allSettled(imagePromises);

    var crops = planResult.supported;

    var cropCardsHTML = crops.map(function(item) {
        var id = item.cropId || item.id;
        return cropCardHTML(item, imgMap[id] || null);
    }).join('');

    var warnHTML = (planResult.unsupportedCrops || []).length
        ? '<div class="warn-bar">&#9888; No quantity data available for: ' + planResult.unsupportedCrops.join(', ') + '</div>'
        : '';

    var locationLine = (planResult.gardenProfile && planResult.gardenProfile.address)
        ? (planResult.gardenProfile.address + ' &middot; ' + planResult.gardenProfile.frost_free_days + ' frost-free days')
        : (planResult.activeZoneLabel
            ? ('Zone ' + planResult.activeZoneLabel)
            : 'Location not set &mdash; add your zip for exact planting dates');

    return '<!DOCTYPE html><html lang="en"><head>'
        + '<meta charset="UTF-8">'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<title>AcreLogic &middot; Garden Space Plan</title>'
        + '<style>' + BASE_CSS + '</style>'
        + '</head><body>'
        + '<div class="header">'
        + '<span class="logo-leaf">&#127807;</span>'
        + '<div class="logo-text"><h1>ACRELOGIC</h1><p>GARDEN SPACE PLAN</p></div>'
        + '<div class="header-meta">Generated ' + todayLabel() + '<br>Family of ' + familySize + '</div>'
        + '</div>'
        + '<div class="body">'
        + '<div class="summary-banner">'
        + '<div class="sum-stat"><div class="val">' + crops.length + '</div><div class="lbl">Crops</div></div>'
        + '<div class="sum-stat"><div class="val">' + familySize + '</div><div class="lbl">Family</div></div>'
        + '</div>'
        + (spaceResult && spaceResult.totalBeds > 0
            ? '<div style="text-align:center;padding:6px 0 12px;color:#6b6b6b;font-size:11px;">'
              + '&#127981; ' + spaceResult.totalBeds + ' beds available &middot; ' + spaceResult.bedAreaSqFt + ' sq ft growing area'
              + '</div>'
            : '')
        + warnHTML
        + '<div style="font-size:9px;color:#6B6B6B;margin-bottom:12px;">' + locationLine + '</div>'
        // ── Section 1: Crop Cards ──
        + '<div class="section-title">Your Planting Plan</div>'
        + '<div class="crop-grid">' + cropCardsHTML + '</div>'
        // ── Section 2: Action Calendar ──
        + '<div class="section-title page-break">&#128197;&nbsp; Action Calendar</div>'
        + buildCalendarSectionHTML(crops)
        // ── Section 3: Seed Shopping List ──
        + '<div class="section-title">&#127807;&nbsp; Seed Shopping List</div>'
        + buildSeedsSectionHTML(crops)
        // ── Section 4: Yield & ROI Forecast ──
        + '<div class="section-title">&#128202;&nbsp; Yield &amp; ROI Forecast</div>'
        + buildYieldSectionHTML(crops)
        // ── Footer ──
        + '<div class="good-luck"><span class="emoji">&#129388;</span><h2>Good Luck Gardening!</h2><p>Happy planting this season.</p></div>'
        + '<div class="footer">Generated by AcreLogic &middot; acrelogic.pages.dev</div>'
        + '</div></body></html>';
}

// ─── Public exports ───────────────────────────────────────────────────────────
export async function exportFamilyPlan(planResult, familySize) {
    var html = await buildFamilyPlanHTML(planResult, familySize);
    await printHTML(html, 'acrelogic-family-plan');
}

export async function exportGardenPlan(planResult, spaceResult, familySize) {
    var html = await buildGardenPlanHTML(planResult, spaceResult, familySize);
    await printHTML(html, 'acrelogic-garden-plan');
}
