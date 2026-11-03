// Genera los íconos PNG de la PWA a partir de public/logo.svg: node scripts/icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'public', 'logo.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 0.1], ['apple-touch-icon.png', 180, 0]]) {
    await page.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * (1 - pad * 2));
    await page.setContent(`<body style="margin:0;background:#0e0e0e;display:grid;place-items:center;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body>`);
    await page.screenshot({ path: path.join(__dirname, '..', 'public', name) });
  }
  await browser.close();
})();
