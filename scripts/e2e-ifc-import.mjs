// Teste de importação IFC pela interface: mede o tempo até o projeto entrar no editor e guarda uma captura da barra.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const ARQUIVO = process.env.IFC;
if (!ARQUIVO) {
  console.error('Uso: IFC="caminho/arquivo.ifc" node scripts/e2e-ifc-import.mjs');
  process.exit(1);
}
const URL_APP = process.env.APP ?? 'http://localhost:5173/?gl=1&debug=1';
const SAIDA = process.env.SHOTS ?? 'test-results/ifc-import';
mkdirSync(SAIDA, { recursive: true });

const executavel = [
  'C:/Users/Dennylson/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: executavel,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const erros = [];
page.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text());
  if (m.text().includes('[ifc') || m.text().startsWith('IFC importado') || m.text().includes('Falha ao importar')) console.log('[console]', m.text());
});
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() === 404) console.log('[404]', r.url()); });

await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('.canvas-wrap canvas', { timeout: 120_000 });
await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
console.log('app carregado');

await page.getByRole('button', { name: 'Menu Arquivo' }).click();
await page.evaluate(() => {
  window.__ifcEventos = [];
  window.__ifcT0 = performance.now();
  window.__hestia.useUi.subscribe((s, prev) => {
    if (s.ifcImport !== prev.ifcImport) {
      window.__ifcEventos.push({
        t: Math.round(performance.now() - window.__ifcT0),
        fase: s.ifcImport?.fase ?? null,
        f: s.ifcImport ? Math.round(s.ifcImport.fracao * 1000) / 1000 : null,
      });
    }
  });
});
const t0 = Date.now();
await page.locator('#file-ifc').setInputFiles(ARQUIVO);

// A barra aparece assim que a importação começa; guarda uma captura no meio do caminho.
let viuBarra = false;
try {
  await page.waitForSelector('.ifc-progress', { timeout: 20_000 });
  viuBarra = true;
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SAIDA, 'barra.png') });
} catch {
  console.log('barra de progresso NAO apareceu');
}

const fim = await page
  .waitForFunction(
    () => {
      const els = Object.values(window.__hestia.editor.project.elements);
      return els.length > 1000 ? els.length : false;
    },
    null,
    { timeout: 180_000 },
  )
  .then((h) => h.jsonValue());
const segundos = ((Date.now() - t0) / 1000).toFixed(2);

const info = await page.evaluate(() => {
  const p = window.__hestia.editor.project;
  const els = Object.values(p.elements);
  const porTipo = {};
  for (const e of els) porTipo[e.kind] = (porTipo[e.kind] ?? 0) + 1;
  const status = document.querySelector('.statusbar .msg')?.textContent ?? '';
  return { elementos: els.length, niveis: p.levels.length, porTipo, status, nome: p.name, eventos: window.__ifcEventos };
});
await page.screenshot({ path: path.join(SAIDA, 'depois.png') });

const marcos = {};
for (const e of info.eventos) {
  if (!e.fase) continue;
  if (!marcos[`${e.fase}_ini`]) marcos[`${e.fase}_ini`] = e.t;
  marcos[`${e.fase}_fim`] = e.t;
}
delete info.eventos;
console.log(JSON.stringify({ segundos, viuBarra, marcos, ...info, erros }, null, 2));
await browser.close();
