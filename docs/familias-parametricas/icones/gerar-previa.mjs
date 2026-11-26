// Gera previa.html/previa.png/faixa-*.png de TODOS os ícones MEP. Uso: node docs/familias-parametricas/icones/gerar-previa.mjs
import { build } from 'esbuild'; import { readFileSync, writeFileSync } from 'node:fs'; import { chromium } from 'playwright-core';
const dir = new URL('.', import.meta.url).pathname;
await build({ entryPoints: ['apps/web/src/ui/iconesMep.ts'], bundle: true, format: 'esm', outfile: '/tmp/iconesMep.mjs', logLevel: 'error' });
const { ICONES_MEP } = await import('/tmp/iconesMep.mjs');
const old = readFileSync(dir + 'previa.html', 'utf8');
const head = old.slice(0, old.indexOf('</defs></svg>') + 13);
const svg = (m, s) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 32 32">${m}</svg>`;
const ks = Object.keys(ICONES_MEP);
const cell = (k, s, t) => `<div class="c ${t}">${svg(ICONES_MEP[k], s)}</div>`;
const grade = (s) => `<div class="g">${ks.map((k) => `<div class="i"><div class="n">${k}</div>${cell(k, s, 'l')}${cell(k, s, 'd')}</div>`).join('')}</div>`;
const faixa = (t) => `<div class="f ${t}" id="f${t}">${ks.map((k) => cell(k, 20, t)).join('')}</div>`;
const css = '<style>.g{display:flex;flex-wrap:wrap;gap:6px}.i{background:#888;padding:4px;text-align:center}.n{font:10px monospace;color:#000}.i .c{margin:0;padding:6px}.f{display:inline-flex;flex-wrap:wrap;width:760px;padding:6px}.f .c{margin:0;padding:6px}</style>';
const page = (b) => (head.includes('.g{display') ? head : head.replace('</style>', css.slice(7, -8) + '</style>')) + b + '</body></html>';
writeFileSync(dir + 'previa.html', page(`<h3>32 px</h3>${grade(32)}<h3>64 px</h3>${grade(64)}`));
writeFileSync('/tmp/f.html', page(`<div id="a">${grade(32)}</div>${faixa('l')}<br>${faixa('d')}`));
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
for (const [scale, suf] of [[2, '']]) {
  const pg = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: scale });
  await pg.goto('file://' + dir + 'previa.html'); await pg.screenshot({ path: dir + 'previa.png', fullPage: true });
  await pg.goto('file:///tmp/f.html');
  await pg.locator('#fl').screenshot({ path: dir + 'faixa-claro.png' }); await pg.locator('#fd').screenshot({ path: dir + 'faixa-escuro.png' });
  const p1 = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await p1.goto('file:///tmp/f.html');
  await p1.locator('#fl').screenshot({ path: dir + 'faixa-claro-20px-1x.png' }); await p1.locator('#fd').screenshot({ path: dir + 'faixa-escuro-20px-1x.png' });
}
await b.close();
