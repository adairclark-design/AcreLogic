#!/usr/bin/env node
/**
 * pwa-inject.js
 * Run after `expo export -p web` to inject PWA support into dist/.
 * Usage: node scripts/pwa-inject.js
 */
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const SRC = path.join(__dirname, '..', 'pwa');

// ─── 1. Copy PWA static files into dist/ ────────────────────────────────────
const filesToCopy = ['manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png'];
for (const file of filesToCopy) {
  const src = path.join(SRC, file);
  const dest = path.join(DIST, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ Copied ${file}`);
  } else {
    console.warn(`⚠  Missing ${src} — skipping`);
  }
}

// ─── 2. Inject PWA tags into dist/index.html ────────────────────────────────
const indexPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const PWA_HEAD = `
    <!-- PWA / Install -->
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#2D4F1E" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="AcreLogic" />
    <link rel="apple-touch-icon" href="/icon-192.png" />

    <!-- Print styles -->
    <style media="print">
      /* Hide interactive chrome when printing */
      [data-noprintid], .fab-container, button, input, textarea { display: none !important; }
      body { background: white !important; color: black !important; font-size: 11pt !important; }
      * { box-shadow: none !important; border-radius: 0 !important; }
      .scrollContent, [data-printscroll] { overflow: visible !important; height: auto !important; }
    </style>

    <!-- Service Worker -->
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js')
            .then(r => console.log('[PWA] SW registered:', r.scope))
            .catch(e => console.warn('[PWA] SW failed:', e));
        });
      }
    </script>`;

if (html.includes('<!-- PWA / Install -->')) {
  console.log('ℹ  PWA tags already present — skipping injection');
} else {
  html = html.replace('</head>', PWA_HEAD + '\n  </head>');
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('✓ PWA tags injected into index.html');
}

// ─── 3. Patch viewport meta to include viewport-fit=cover ────────────────────
// Required for env(safe-area-inset-bottom) to work on iOS Safari, so the
// sticky footer CTA is never hidden behind the home indicator / browser chrome.
if (html.includes('viewport-fit=cover')) {
  console.log('ℹ  viewport-fit=cover already present — skipping');
} else {
  html = fs.readFileSync(indexPath, 'utf8'); // re-read in case PWA tags were just written
  const viewportRx = /(<meta\s+name="viewport"\s+content="[^"]*?)"/i;
  if (viewportRx.test(html)) {
    html = html.replace(viewportRx, '$1, viewport-fit=cover"');
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('✓ viewport-fit=cover added to viewport meta');
  } else {
    console.warn('⚠  Could not find viewport meta tag — skipping viewport-fit patch');
  }
}

console.log('\n🚀 PWA inject complete!');
