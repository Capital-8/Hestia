// Planta técnica de tubos e conexões (ficha D1), em Chrome real: esgoto Krona em L e uma prumada, desenhados com o mouse, e a planta
// capturada em duas escalas (duas linhas com contorno de joelho; linha simples) mais uma aproximação.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5222/?debug=1' node tests/e2e/planta-tubos.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5222/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/planta-tubos';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ f: e.familyId, z: e.z, inc: e.inclinacao?.[0] ?? null })));
const zoomPara = async (zoom, cx, cy) => {
  await page.evaluate(({ zoom, cx, cy }) => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), zoom, cx, cy }); }, { zoom, cx, cy });
  await page.waitForTimeout(700);
};

try {
  await rep.step('1. abre o app e escolhe Sistemas > Tubo (DN 100)', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.getByRole('button', { name: 'Tubo', exact: true }).first().click();
    await page.waitForSelector('#place-tubo-familia', { timeout: 15_000 });
    await page.locator('#place-tubo-dn').selectOption('100');
    await zoomPara(80, 4, 1.5);
  });
  await rep.step('2. esgoto em L (0,0) > (3,0) > (3,3) e prumada (6,0) > (9,0), cota 2, (9,3)', async () => {
    await clickWorld(page, 0, 0);
    await clickWorld(page, 3, 0);
    await clickWorld(page, 3, 3);
    await page.keyboard.press('Escape');
    await clickWorld(page, 6, 0);
    await clickWorld(page, 9, 0);
    const z = page.locator('#place-tubo-z');
    await z.fill('2');
    await z.press('Enter');
    await page.waitForTimeout(300);
    await clickWorld(page, 9, 3);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const c = await comps();
    rep.check('tubos e joelhos criados', c.filter((x) => x.f === 'fam_krona_esgoto_tubo_corte').length >= 5 && c.filter((x) => x.f === 'fam_krona_esgoto_joelho90').length >= 3, `${c.length} componentes`);
    rep.check('há tubo vertical (prumada)', c.some((x) => x.f === 'fam_krona_esgoto_tubo_corte' && (x.inc === null || Math.abs(x.inc) < 1e-6)));
  });
  await rep.step('3. captura da planta em 3 escalas (80, 20 e 300 px/m)', async () => {
    await page.keyboard.press('Escape');
    await zoomPara(80, 4.5, 1.5);
    await page.screenshot({ path: `${OUT}/01-escala-80.png` });
    await zoomPara(20, 4.5, 1.5);
    await page.screenshot({ path: `${OUT}/02-escala-20.png` });
    await zoomPara(300, 2.7, 0.3);
    await page.screenshot({ path: `${OUT}/03-aproximacao-joelho.png` });
    await zoomPara(300, 9, 2.8);
    await page.screenshot({ path: `${OUT}/04-aproximacao-prumada.png` });
    rep.check('capturas gravadas', true, OUT);
  });
  await rep.step('4. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
