// Prumada na ferramenta Tubo (ficha B4), em Chrome real: Sistemas > Tubo, dois pontos na cota 0, cota do painel para 2, terceiro ponto:
// a emenda sobe na VERTICAL e depois anda na horizontal (joelhos da Krona), sem tubo diagonal; "Verificar rede" sem afastada/incompatível.
// Uso: CHROME_PATH=... APP='http://127.0.0.1:5214/?debug=1' node tests/e2e/tubo-prumada.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5214/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/tubo-prumada';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, z: e.z, L: e.values?.L, inc: e.inclinacao?.[0] ?? null })));
/** Orientação do tubo: inclinação interna 0 = vertical, 90° = horizontal; o resto é diagonal. */
const orient = (t) => (t.inc === null || Math.abs(t.inc) < 1e-6 ? 'vertical' : Math.abs(t.inc - Math.PI / 2) < 1e-6 ? 'horizontal' : 'diagonal');
const TUBO = 'fam_krona_esgoto_tubo_corte';
let antes = [];

try {
  await rep.step('1. abre o app, Sistemas > Tubo, painel com "Mudança de cota"', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.getByRole('button', { name: 'Tubo', exact: true }).first().click();
    await page.waitForSelector('#place-tubo-modocota', { timeout: 15_000 });
    const modo = await page.locator('#place-tubo-modocota').inputValue();
    const ops = await page.locator('#place-tubo-modocota option').allInnerTexts();
    rep.check('padrão "subir_primeiro" com as 3 opções', modo === 'subir_primeiro' && ops.join('|') === 'Subir primeiro|Andar primeiro|Diagonal', `${modo} / ${ops.join('|')}`);
    await page.locator('#place-tubo-dn').selectOption('100');
    await page.screenshot({ path: `${OUT}/00-painel.png` });
  });
  await rep.step('2. dois pontos na cota 0 e a cota do painel para 2', async () => {
    await clickWorld(page, 0, 0);
    await clickWorld(page, 3, 0);
    antes = await comps();
    rep.check('1 tubo na cota 0', antes.filter((c) => c.f === TUBO).length === 1, `${antes.length} componentes`);
    const z = page.locator('#place-tubo-z');
    await z.fill('2');
    await z.press('Enter');
    await page.waitForTimeout(300);
    const zEm = await page.evaluate(() => document.querySelector('#place-tubo-z')?.value);
    rep.check('campo de cota com 2', /2/.test(String(zEm)), String(zEm));
  });
  await rep.step('3. terceiro ponto: vertical + horizontal e joelhos, sem diagonal', async () => {
    await clickWorld(page, 3, 3);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const todos = await comps();
    const ids = new Set(antes.map((c) => c.id));
    const novos = todos.filter((c) => !ids.has(c.id));
    const tubos = novos.filter((c) => c.f === TUBO);
    const joelhos = todos.filter((c) => c.f === 'fam_krona_esgoto_joelho90');
    const ori = tubos.map(orient).sort().join(',');
    rep.check('2 trechos novos: um vertical e um horizontal', tubos.length === 2 && ori === 'horizontal,vertical', `${tubos.length} (${ori})`);
    rep.check('nenhum tubo diagonal na rede', !todos.filter((c) => c.f === TUBO).some((c) => orient(c) === 'diagonal'), todos.filter((c) => c.f === TUBO).map(orient).join(','));
    rep.check('joelhos 90° da Krona: 1 no pé da vertical (liga o tubo da cota 0) e 1 no topo (cota 2)', joelhos.length === 2 && joelhos.some((j) => Math.abs(j.z) < 1e-6) && joelhos.some((j) => Math.abs(j.z - 2) < 1e-6), joelhos.map((j) => j.z).join(','));
    await page.screenshot({ path: `${OUT}/01-planta.png` });
  });
  await rep.step('4. Verificar rede: sem conexão afastada nem incompatível', async () => {
    await page.getByRole('button', { name: 'Verificar rede', exact: true }).first().click();
    await page.waitForFunction(() => /aviso|Nenhum|sem problema/i.test(document.querySelector('[role="dialog"]:last-of-type')?.textContent ?? document.body.innerText), null, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    const itens = await page.locator('[role="dialog"] li, [role="dialog"] tr').allInnerTexts();
    const txt = itens.join(' | ');
    rep.check('nenhum item “afastada” nem “incompatível”', !itens.some((x) => /afastad|incompat/i.test(x)), txt.slice(0, 200).replace(/\s+/g, ' '));
    await page.screenshot({ path: `${OUT}/02-verificar-rede.png` });
  });
  await rep.step('5. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
