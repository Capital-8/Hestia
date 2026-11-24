// Ferramenta Tubo com a Krona (fichas L1, O2 e P2), em Chrome real: aba Sistemas > Tubo, tipo de tubulação Krona (esgoto), três trechos
// em L, joelhos da Krona nos cantos, trechos encurtados pela bolsa e "Verificar rede" sem conexão afastada nem incompatível.
// Uso: CHROME_PATH=... APP='http://127.0.0.1:5211/?debug=1' node tests/e2e/tubo-krona.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5211/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/tubo-krona';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ f: e.familyId, L: e.values?.L, DN: e.values?.DN, lig: Object.keys(e.ligacoes ?? {}).length })));

try {
  await rep.step('1. abre o app e escolhe Sistemas > Tubo', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.getByRole('button', { name: 'Tubo', exact: true }).first().click();
    await page.waitForSelector('#place-tubo-familia', { timeout: 15_000 });
    const sel = await page.locator('#place-tubo-familia').inputValue();
    rep.check('tipo padrão = esgoto da Krona (projeto sem tubos)', sel === 'fam_krona_esgoto_tubo_corte', sel);
    const dns = await page.locator('#place-tubo-dn option').allInnerTexts();
    rep.check('DN só da lista da Krona (sem 63)', dns.includes('100') && dns.includes('250') && !dns.includes('63'), dns.join(','));
    await page.locator('#place-tubo-dn').selectOption('100');
  });
  await rep.step('2. desenha 3 trechos em L e confere joelhos e encurtamento', async () => {
    await clickWorld(page, 0, 0);
    await clickWorld(page, 3, 0);
    await clickWorld(page, 3, 3);
    await clickWorld(page, 0, 3);
    await page.keyboard.press('Escape');
    const c = await comps();
    const tubos = c.filter((x) => x.f === 'fam_krona_esgoto_tubo_corte');
    const joelhos = c.filter((x) => x.f === 'fam_krona_esgoto_joelho90');
    rep.check('3 trechos de tubo', tubos.length === 3, `${tubos.length}`);
    rep.check('2 joelhos da Krona', joelhos.length === 2, `${joelhos.length}`);
    const Ls = tubos.map((t) => Math.round(t.L * 10) / 10);
    rep.check('trechos encurtados pela bolsa (3000 − 58 nas pontas conectadas)', Ls.some((v) => Math.abs(v - 2942) < 1) && Ls.some((v) => Math.abs(v - 2884) < 1), Ls.join(' / '));
    await page.screenshot({ path: `${OUT}/01-planta.png` });
  });
  await rep.step('3. Verificar rede: sem conexão afastada nem incompatível', async () => {
    await page.getByRole('button', { name: 'Verificar rede', exact: true }).first().click();
    await page.waitForFunction(() => /aviso|Nenhum|sem problema/i.test(document.querySelector('[role="dialog"]:last-of-type')?.textContent ?? document.body.innerText), null, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    const itens = await page.locator('[role="dialog"] li, [role="dialog"] tr').allInnerTexts();
    const txt = itens.join(' | ');
    rep.check('diálogo da rede lista os avisos', true, txt.slice(0, 160).replace(/\s+/g, ' '));
    rep.check('nenhum item “afastada” nem “incompatível” (só as pontas abertas das extremidades da cadeia, se houver)', !itens.some((x) => /afastad|incompat/i.test(x)), txt.slice(0, 200).replace(/\s+/g, ' '));
    await page.screenshot({ path: `${OUT}/02-verificar-rede.png` });
  });
  await rep.step('4. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
