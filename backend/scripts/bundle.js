/**
 * Une los .js de apps-script en un solo archivo para pegarlo en el editor de Apps Script
 * sin crear un archivo por módulo: npm run bundle → backend/apps-script/dist/Codigo.gs
 */
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'apps-script');
const order = ['Core.js', 'Data.js', 'Calendar.js', 'Api.js', 'Admin.js', 'Setup.js'];

const missing = fs.readdirSync(src).filter(f => f.endsWith('.js') && !order.includes(f));
if (missing.length) throw new Error('Agrega a `order` en bundle.js: ' + missing.join(', '));

const header = [
  '/**',
  ' * Offs1de Barber Club · API de reservas (Apps Script).',
  ' * ARCHIVO GENERADO con `npm run bundle`: no lo edites a mano, edita backend/apps-script/*.js.',
  ' * Pega todo este contenido en el archivo Código.gs del editor de Apps Script.',
  ' */',
  '',
].join('\n');

const body = order
  .map(f => `// ===== ${f} =====\n\n${fs.readFileSync(path.join(src, f), 'utf8').trim()}\n`)
  .join('\n');

const outDir = path.join(src, 'dist');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'Codigo.gs'), header + body);
console.log('Generado backend/apps-script/dist/Codigo.gs');
