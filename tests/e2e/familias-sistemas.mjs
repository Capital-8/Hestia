// Aba Sistemas e Biblioteca por sistema (fichas J1 a J3), em Chrome real: a aba tem Tubo, Verificar rede, Tubos e conexões e Catálogo;
// "Tubos e conexões" abre a Biblioteca na aba Hidráulica com as famílias da Krona; o catálogo abre o diálogo; Aço abre perfis.
// Uso: CHROME_PATH=... APP='http://127.0.0.1:5211/?debug=1' node tests/e2e/familias-sistemas.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5211/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/familias-sistemas';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const abaAtiva = async (nome) => page.getByRole('tab', { name: nome, exact: true }).first().click();

try {
  await rep.step('1. abre o app', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    rep.check('projeto novo aberto', true);
  });
  await rep.step('2. aba Sistemas: painel Hidráulica e tubulação com os botões certos', async () => {
    await abaAtiva('Sistemas');
    for (const nome of ['Tubo', 'Tubos e conexões', 'Verificar rede', 'Catálogo de tubos']) {
      const b = page.getByRole('button', { name: nome, exact: true }).first();
      const ok = await b.isVisible().catch(() => false);
      rep.check(`botão “${nome}” visível`, ok);
      if (ok) rep.check(`botão “${nome}” habilitado`, await b.isEnabled());
    }
    await page.screenshot({ path: `${OUT}/01-sistemas.png` });
  });
  await rep.step('3. Tubos e conexões abre a Biblioteca na aba Hidráulica com a Krona', async () => {
    await page.getByRole('button', { name: 'Tubos e conexões', exact: true }).first().click();
    await page.waitForSelector('.pal-janela', { timeout: 10_000 });
    const sel = await page.locator('.pal-abas [aria-selected="true"]').innerText();
    rep.check('aba selecionada = Hidráulica', sel.trim() === 'Hidráulica', sel);
    const n = await page.locator('.pal-grade > *').count();
    rep.check('há cartões (famílias de tubulação)', n >= 30, `${n} cartões`);
    const txt = await page.locator('.pal-grade').innerText();
    rep.check('mostra famílias da Krona', /Krona/.test(txt));
    rep.check('não mostra móvel', !/Cômoda|Armário baixo/.test(txt));
    await page.screenshot({ path: `${OUT}/02-biblioteca-hidraulica.png` });
  });
  await rep.step('4. Catálogo de tubos abre o editor com o diálogo', async () => {
    await page.getByRole('button', { name: 'Catálogo de tubos', exact: true }).first().click();
    await page.waitForSelector('[aria-label="Catálogos de tubos e conexões"]', { timeout: 20_000 });
    rep.check('diálogo do catálogo aberto', true);
    await page.screenshot({ path: `${OUT}/03-catalogo.png` });
  });
  await rep.step('5. Aço abre a Biblioteca em Estrutura com perfis', async () => {
    await page.evaluate(() => window.__hestia.useFamilia.getState().ocultar());
    await abaAtiva('Aço');
    await page.getByRole('button', { name: 'Parafuso e chapa', exact: true }).first().click();
    await page.waitForSelector('.pal-janela', { timeout: 10_000 });
    const sel = await page.locator('.pal-abas [aria-selected="true"]').innerText();
    rep.check('aba selecionada = Estrutura', sel.trim() === 'Estrutura', sel);
    rep.check('mostra perfil', /Perfil/.test(await page.locator('.pal-grade').innerText()));
  });
  await rep.step('6. sem erro de console', async () => {
    const reais = erros.filter((e) => !/status of 404/.test(e));
    rep.check('sem erro de console (404 do favicon ignorado)', reais.length === 0, reais.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
