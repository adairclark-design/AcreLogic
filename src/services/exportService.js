/**
 * AcreLogic Export Service
 * ========================
 * Generates PDF and CSV exports of the complete crop plan.
 *
 * PDF: expo-print → rendered HTML → system share sheet
 * CSV: Plain string → expo-sharing → Files / AirDrop / Email
 *
 * PDF format matches Fortier's planning board layout:
 *   - Cover page with farm summary + revenue estimate
 *   - Per-bed succession table
 *   - Full seeding calendar sorted by date
 *   - Yield & revenue breakdown per crop
 */

import { Platform } from 'react-native';

// Native-only modules — dynamically loaded so web bundle never imports them
let Print, Sharing, FileSystem;
if (Platform.OS !== 'web') {
  Print = require('expo-print');
  Sharing = require('expo-sharing');
  FileSystem = require('expo-file-system');
}

// ─── Colors (mirror theme for HTML) ──────────────────────────────────────────
const GREEN = '#2D4F1E';
const TAN = '#D2B48C';
const ORANGE = '#CC5500';
const CREAM = '#F5F5DC';
const LAVENDER = '#B57EDC';
const GREY = '#6B6B6B';

// ─── PDF Export ────────────────────────────────────────────────────────────────

/**
 * Generate and share a PDF of the complete farm plan.
 *
 * @param {object} farmProfile
 * @param {Array} calendarEntries - From calendarGenerator
 * @param {object} yieldSummary - From yieldCalculator (totals + byCrop + byBed)
 * @param {object} bedSuccessions - { [bedNum]: [succession, ...] }
 */
export async function exportPDF(farmProfile, calendarEntries, yieldSummary, bedSuccessions) {
  const html = buildPDFHTML(farmProfile, calendarEntries, yieldSummary, bedSuccessions);

  if (Platform.OS === 'web') {
    // Web: open print dialog in a new window
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileName = `AcreLogic_FarmPlan_${todaySlug()}.pdf`;
  const newUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.moveAsync({ from: uri, to: newUri });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: 'Share Your AcreLogic Farm Plan', UTI: 'com.adobe.pdf' });
  }
  return newUri;
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

/**
 * Generate and share a CSV of the seeding calendar.
 * Columns: Date, Bed, Action, Crop, Variety, Seed Amount, Plant Count, Rows, JANG Config, Notes, Est. Harvest
 */
export async function exportCalendarCSV(calendarEntries) {
  const headers = [
    'Date', 'Bed', 'Action', 'Crop', 'Variety',
    'Seed Amount', 'Plant Count', 'Rows', 'Spacing',
    'JANG Config', 'DTM', 'Est. Harvest', 'Notes',
  ];
  const rows = calendarEntries.map(e => [
    e.entry_date ?? '', e.bed_label ?? `Bed ${e.bed_number}`, formatAction(e.action),
    e.crop_name ?? '', e.crop_variety ?? '', e.seed_amount_label ?? '',
    e.plant_count ?? '', e.row_count ?? '', e.spacing_label ?? '',
    e.jang_config_label ?? '', e.dtm ? `${e.dtm}d` : '', e.estimated_harvest_date ?? '', e.special_notes ?? '',
  ]);
  const csv = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
  const fileName = `AcreLogic_Calendar_${todaySlug()}.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const fileUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Planting Calendar', UTI: 'public.comma-separated-values-text' });
  }
  return fileUri;
}

/**
 * Generate and share a CSV of the yield & revenue estimates.
 */
export async function exportYieldCSV(yieldSummary) {
  const headers = [
    'Bed', 'Succession', 'Crop', 'Variety',
    'Yield (lbs)', 'Yield (bunches)', 'Price/lb', 'Price/bunch',
    'Revenue (Low)', 'Revenue (Mid)', 'Revenue (High)', 'Bed Days Used',
  ];
  const allEstimates = Object.values(yieldSummary.byBed ?? {}).flat();
  const rows = allEstimates.map(e => [
    e.bed_label ?? `Bed ${e.bed_number}`, e.succession_slot ?? '', e.crop_name ?? '', e.crop_variety ?? '',
    e.estimated_yield_lbs ?? '', e.estimated_yield_bunches ?? '',
    e.price_per_lb ? `$${e.price_per_lb}` : '', e.price_per_bunch ? `$${e.price_per_bunch}` : '',
    e.gross_revenue_low ? `$${e.gross_revenue_low}` : '',
    e.gross_revenue_mid ? `$${e.gross_revenue_mid}` : '',
    e.gross_revenue_high ? `$${e.gross_revenue_high}` : '',
    e.bed_days_used ?? '',
  ]);
  const totals = yieldSummary.totals ?? {};
  rows.push(['TOTAL', '', '', '', totals.total_yield_lbs ? Math.round(totals.total_yield_lbs) : '', '', '', '',
    totals.total_revenue_low ? `$${totals.total_revenue_low}` : '',
    totals.total_revenue_mid ? `$${totals.total_revenue_mid}` : '',
    totals.total_revenue_high ? `$${totals.total_revenue_high}` : '', '']);
  const csv = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
  const fileName = `AcreLogic_Revenue_${todaySlug()}.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const fileUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Revenue Estimates', UTI: 'public.comma-separated-values-text' });
  }
  return fileUri;
}

// ─── Excel Export ─────────────────────────────────────────────────────────────

/**
 * Generate and download/share an .xlsx workbook with 3 sheets:
 *   1. "Seeding Calendar" — every farm action sorted by date
 *   2. "Yield by Crop"    — harvest estimates with low/high range
 *   3. "Bed Plan"         — succession plan per bed
 *
 * Uses SheetJS (xlsx package). Works on web (download) and native (share sheet).
 */
export async function exportExcel(farmProfile, calendarEntries, yieldSummary, bedSuccessions) {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `AcreLogic Farm Plan — ${farmProfile?.address ?? 'My Farm'}`,
    Author: 'AcreLogic',
    CreatedDate: new Date(),
  };

  // ── Sheet 1: Seeding Calendar ──────────────────────────────────────────────
  const calendarHeaders = [
    'Date', 'Week Day', 'Bed', 'Action', 'Crop', 'Variety',
    'DTM (days)', 'Seed Amount', 'Plant Count', 'Rows', 'Spacing',
    'JANG Config', 'Est. Harvest', 'Notes',
  ];
  const calendarData = [calendarHeaders, ...calendarEntries.map(e => [
    e.entry_date ?? '',
    e.entry_date ? new Date(`${e.entry_date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }) : '',
    e.bed_label ?? `Bed ${e.bed_number}`,
    formatAction(e.action),
    e.crop_name ?? '',
    e.crop_variety ?? '',
    e.dtm ?? '',
    e.seed_amount_label ?? '',
    e.plant_count ?? '',
    e.row_count ?? '',
    e.spacing_label ?? '',
    e.jang_config_label ?? '',
    e.estimated_harvest_date ?? '',
    e.special_notes ?? '',
  ])];
  const calSheet = XLSX.utils.aoa_to_sheet(calendarData);
  calSheet['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 6 }, { wch: 10 },
    { wch: 16 }, { wch: 14 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, calSheet, 'Seeding Calendar');

  // ── Sheet 2: Yield by Crop ─────────────────────────────────────────────────
  const yieldHeaders = [
    'Crop', 'Variety', 'Category',
    'Yield Low (lbs)', 'Yield High (lbs)', 'Yield Bunches',
    'Price/lb', 'Revenue Low', 'Revenue Mid', 'Revenue High',
    'Bed Slots', 'Harvest Method',
  ];
  const allEstimates = Object.values(yieldSummary?.byBed ?? {}).flat();
  const yieldData = [yieldHeaders, ...allEstimates.map(e => [
    e.crop_name ?? '',
    e.crop_variety ?? '',
    e.category ?? '',
    e.yield_lbs_low ?? e.estimated_yield_lbs ?? '',
    e.yield_lbs_high ?? e.estimated_yield_lbs ?? '',
    e.estimated_yield_bunches ?? '',
    e.price_per_lb ?? '',
    e.gross_revenue_low ?? '',
    e.gross_revenue_mid ?? '',
    e.gross_revenue_high ?? '',
    1, // each row = 1 bed slot
    e.harvest_notes ?? '',
  ])];
  // Totals row
  const totals = yieldSummary?.totals ?? {};
  yieldData.push([
    'TOTAL', '', '', '', Math.round(totals.total_yield_lbs ?? 0), '',
    '', Math.round(totals.total_revenue_low ?? 0),
    Math.round(totals.total_revenue_mid ?? 0),
    Math.round(totals.total_revenue_high ?? 0), '', '',
  ]);
  const yieldSheet = XLSX.utils.aoa_to_sheet(yieldData);
  yieldSheet['!cols'] = [
    { wch: 18 }, { wch: 20 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, yieldSheet, 'Yield by Crop');

  // ── Sheet 3: Bed Plan ──────────────────────────────────────────────────────
  const bedHeaders = [
    'Bed', 'Slot', 'Crop', 'Variety', 'Category',
    'Start Date', 'End Date', 'DTM (days)',
    'Planting Method', 'Revenue Est.',
  ];
  const bedRows = [];
  for (let bed = 1; bed <= 8; bed++) {
    const succs = bedSuccessions[bed] ?? [];
    if (succs.length === 0) {
      bedRows.push([`Bed ${bed}`, '', '(empty)', '', '', '', '', '', '', '']);
    } else {
      succs.forEach((s, idx) => {
        const est = allEstimates.find(e => e.bed_number === bed && e.succession_slot === idx + 1);
        bedRows.push([
          idx === 0 ? `Bed ${bed}` : '',
          idx + 1,
          s.crop_name ?? s.name ?? '',
          s.variety ?? '',
          s.category ?? '',
          s.start_date ?? '',
          s.end_date ?? '',
          s.dtm ?? '',
          s.planting_method ?? s.seed_type ?? '',
          est?.gross_revenue_mid ?? '',
        ]);
      });
    }
  }
  const bedData = [bedHeaders, ...bedRows];
  const bedSheet = XLSX.utils.aoa_to_sheet(bedData);
  bedSheet['!cols'] = [
    { wch: 8 }, { wch: 6 }, { wch: 18 }, { wch: 20 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, bedSheet, 'Bed Plan');

  // ── Write and trigger download/share ──────────────────────────────────────
  const fileName = `AcreLogic_Plan_${todaySlug()}.xlsx`;

  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, fileName);
    return;
  }

  // Native: write to temp file then share
  const wbOut = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, wbOut, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export to Excel / Google Sheets',
      UTI: 'com.microsoft.excel.xlsx',
    });
  }
  return fileUri;
}

// ─── HTML Builder ──────────────────────────────────────────────────────────────
function buildPDFHTML(farmProfile, calendarEntries, yieldSummary, bedSuccessions) {
  const totals = yieldSummary?.totals ?? {};
  const byCrop = yieldSummary?.byCrop ?? {};
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const farmAddress = farmProfile?.address ?? 'My Farm';
  const ffd = farmProfile?.frost_free_days ?? '--';
  const zone = farmProfile?.usda_zone ?? '--';
  const lastFrost = farmProfile?.last_frost_date ?? '--';
  const firstFrost = farmProfile?.first_frost_date ?? '--';

  // Group calendar by date for the table
  const grouped = {};
  for (const entry of calendarEntries) {
    if (!grouped[entry.entry_date]) grouped[entry.entry_date] = [];
    grouped[entry.entry_date].push(entry);
  }

  const calendarRows = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, entries]) =>
      entries.map((entry, i) => `
        <tr style="${i === 0 ? 'border-top: 2px solid #e0d8c8;' : ''}">
          ${i === 0 ? `<td rowspan="${entries.length}" style="font-weight:700;color:${ORANGE};white-space:nowrap;padding:8px 10px;">${formatDateShort(date)}</td>` : ''}
          <td style="padding:8px 6px;color:${GREEN};font-weight:600;">${entry.bed_label}</td>
          <td style="padding:8px 6px;">
            <span style="background:${actionBg(entry.action)};color:${actionFg(entry.action)};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;">
              ${formatAction(entry.action)}
            </span>
          </td>
          <td style="padding:8px 6px;font-weight:600;color:${GREEN};">${entry.crop_name ?? ''}</td>
          <td style="padding:8px 6px;color:${GREY};font-size:12px;">${entry.crop_variety ?? ''}</td>
          <td style="padding:8px 6px;font-size:12px;color:${GREY};">${entry.seed_amount_label ?? ''}</td>
          <td style="padding:8px 6px;font-size:11px;color:${GREY};">${entry.jang_config_label ?? '—'}</td>
          <td style="padding:8px 6px;font-size:11px;color:${GREY};">${entry.special_notes ?? ''}</td>
        </tr>
      `)
    )
    .join('');

  const topCrops = (totals.top_crops_by_revenue ?? []).map((c, i) => `
    <tr style="${i % 2 === 0 ? 'background:#faf6f0;' : ''}">
      <td style="padding:10px 12px;font-weight:600;color:${GREEN};">${c.crop_name}</td>
      <td style="padding:10px 12px;color:${GREY};font-size:13px;">${c.crop_variety ?? ''}</td>
      <td style="padding:10px 12px;">${c.bed_slots}</td>
      <td style="padding:10px 12px;">${Math.round(c.total_yield_lbs ?? 0).toLocaleString()} lbs</td>
      <td style="padding:10px 12px;font-weight:700;color:${ORANGE};">$${Math.round(c.total_revenue_mid ?? 0).toLocaleString()}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff; color: #1A1A1A; }
  h1, h2, h3 { font-weight: 700; }
  table { border-collapse: collapse; width: 100%; }
  td, th { text-align: left; vertical-align: middle; }
  th { background: ${GREEN}; color: ${CREAM}; padding: 10px 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
</style>
</head>
<body>

<!-- Cover page -->
<div style="background:${GREEN};color:${CREAM};padding:60px 48px;min-height:100vh;display:flex;flex-direction:column;justify-content:space-between;">
  <div>
    <div style="font-size:11px;letter-spacing:3px;color:${TAN};text-transform:uppercase;margin-bottom:12px;">AcreLogic · Farm Plan</div>
    <h1 style="font-size:48px;color:${CREAM};line-height:1.1;margin-bottom:8px;">${farmAddress}</h1>
    <div style="font-size:16px;color:${TAN};margin-bottom:48px;">Generated ${today}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:500px;">
      ${infoBlock('Frost-Free Days', `${ffd} days`)}
      ${infoBlock('Last Frost', formatDateShort(lastFrost))}
      ${infoBlock('First Frost', formatDateShort(firstFrost))}
      ${infoBlock('USDA Zone', zone)}
      ${infoBlock('Soil Type', farmProfile?.soil_type ?? '--')}
      ${infoBlock('Elevation', farmProfile?.elevation_ft ? `${farmProfile.elevation_ft} ft` : '--')}
    </div>
  </div>

  <div style="border-top:1px solid rgba(210,180,140,0.3);padding-top:32px;">
    <div style="font-size:12px;color:${TAN};letter-spacing:2px;margin-bottom:8px;">ESTIMATED SEASON REVENUE</div>
    <div style="font-size:56px;font-weight:900;color:${CREAM};">$${Math.round(totals.total_revenue_low ?? 0).toLocaleString()} – $${Math.round(totals.total_revenue_high ?? 0).toLocaleString()}</div>
    <div style="font-size:18px;color:${TAN};">~$${Math.round(totals.total_revenue_mid ?? 0).toLocaleString()} organic wholesale · ${Math.round(totals.total_yield_lbs ?? 0).toLocaleString()} lbs total yield · ${calendarEntries.length} seeding actions</div>
  </div>
</div>

<!-- Top crops -->
<div style="padding:48px;page-break-before:always;">
  <h2 style="color:${GREEN};font-size:24px;margin-bottom:4px;">Top Crops by Revenue</h2>
  <p style="color:${GREY};margin-bottom:24px;font-size:14px;">Organic wholesale pricing with regional premium applied</p>
  <table>
    <tr><th>Crop</th><th>Variety</th><th>Beds</th><th>Est. Yield</th><th>Revenue (Mid)</th></tr>
    ${topCrops}
  </table>
</div>

<!-- Full seeding calendar -->
<div style="padding:48px;page-break-before:always;">
  <h2 style="color:${GREEN};font-size:24px;margin-bottom:4px;">Complete Seeding Calendar</h2>
  <p style="color:${GREY};margin-bottom:24px;font-size:14px;">All actions across 8 beds, sorted by date</p>
  <table>
    <tr><th>Date</th><th>Bed</th><th>Action</th><th>Crop</th><th>Variety</th><th>Seed/Plants</th><th>JANG Config</th><th>Notes</th></tr>
    ${calendarRows}
  </table>
</div>

<!-- Footer -->
<div style="padding:24px 48px;border-top:1px solid #e0d8c8;color:${GREY};font-size:11px;display:flex;justify-content:space-between;">
  <span>AcreLogic Farm Plan · ${today}</span>
  <span>Sources: JM Fortier, Eliot Coleman, Daniel Mays, Jesse Frost</span>
</div>

</body>
</html>`;
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function infoBlock(label, value) {
  return `
    <div>
      <div style="font-size:10px;color:${TAN};letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">${label}</div>
      <div style="font-size:18px;color:${CREAM};font-weight:700;">${value}</div>
    </div>
  `;
}

function formatAction(action) {
  switch (action) {
    case 'seed_start': return 'Seed Start';
    case 'transplant': return 'Transplant';
    case 'cover_crop': return 'Cover Crop';
    case 'direct_seed': return 'Direct Seed';
    default: return action ?? 'Plant';
  }
}

function actionBg(action) {
  switch (action) {
    case 'seed_start': return '#E8D5F5';
    case 'transplant': return '#FFE4D4';
    case 'cover_crop': return '#E8E8E8';
    default: return '#D4ECD4';
  }
}

function actionFg(action) {
  switch (action) {
    case 'seed_start': return LAVENDER;
    case 'transplant': return ORANGE;
    case 'cover_crop': return '#555';
    default: return GREEN;
  }
}

function formatDateShort(dateStr) {
  if (!dateStr || dateStr === '--') return '--';
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function csvEscape(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function todaySlug() {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}
