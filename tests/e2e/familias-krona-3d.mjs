// Captura 3D das famílias da Krona no editor (olhar a união das conexões). Uso: CHROME_PATH=... APP=http://127.0.0.1:5211/?debug=1 node tests/e2e/familias-krona-3d.mjs "Joelho 90° de esgoto Krona" ...
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5211/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/krona-3d';
const nomes = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
await page.goto(APP);
await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
await page.getByRole('button', { name: /Novo projeto/ }).first().click();
await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
let i = 0;
for (const nome of nomes) {
  i += 1;
  await page.locator('.fam-novo-btn').click();
  await page.waitForSelector('.fam-tpl', { timeout: 30_000 });
  const busca = page.locator('input[type="search"], input[placeholder*="uscar"]').first();
  if (await busca.count()) await busca.fill(nome);
  await page.locator('.fam-tpl', { hasText: nome }).first().click();
  await page.locator('.fam-bt.pri', { hasText: 'Criar' }).click();
  await page.waitForTimeout(1500);
  await page.locator('.fam-root').screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-${nome.replace(/[^a-z0-9]+/gi, '_')}.png` });
  console.log('ok', nome);
}
console.log('erros de página:', erros.length, erros.slice(0, 2).join(' | '));
await browser.close();
