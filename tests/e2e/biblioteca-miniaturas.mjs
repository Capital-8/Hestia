// Miniaturas da Biblioteca por silhueta real (ficha B7), em Chrome real: abre a Biblioteca, vai ao grupo Hidráulica e ao Elétrico,
// confere que cada miniatura MEP é um desenho (mais de N elementos SVG e mais de uma cor de preenchimento), não um retângulo liso
// cinza, tira capturas e lista erros de console.
// Uso: APP='http://127.0.0.1:5215/?debug=1' node tests/e2e/biblioteca-miniaturas.mjs  (suba `vite --port 5215` em apps/web)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5215/?debug=1';
const EXE = chromeExecutable();
if (!EXE) { console.error('PENDENTE: Chrome não encontrado (defina CHROME_PATH)'); process.exit(2); }
const OUT = process.env.SHOTS ?? 'test-results/biblioteca-miniaturas';
mkdirSync(OUT, { recursive: true });

/** Mínimo de elementos gráficos para uma miniatura ser "desenho" (um retângulo de fallback tem 1). */
const N_MIN_ELEMENTOS = 4;
/** Mínimo de cores de preenchimento distintas (o sombreado já gera várias). */
const N_MIN_CORES = 2;

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();

/** Lê, no navegador, cada cartão da grade: nome, quantos elementos gráficos e quantas cores de preenchimento. */
const inspecionar = () => page.evaluate(() => [...document.querySelectorAll('.pal-grade .pal-movel')].map((card) => {
  const svg = card.querySelector('svg');
  const els = svg ? [...svg.querySelectorAll('path,rect,circle,line,polygon,ellipse')] : [];
  const cores = new Set(els.map((e) => e.getAttribute('fill')));
  return { nome: card.querySelector('.pal-nome')?.textContent ?? '', elementos: els.length, cores: cores.size };
}));

const ehDesenho = (c) => c.elementos >= N_MIN_ELEMENTOS && c.cores >= N_MIN_CORES;

async function conferirGrupo(nomeAba, arquivo) {
  await page.getByRole('tab', { name: nomeAba, exact: true }).click();
  await page.waitForSelector('.pal-grade .pal-movel', { timeout: 15_000 });
  const cartoes = await inspecionar();
  const desenhos = cartoes.filter(ehDesenho);
  const liso = cartoes.filter((c) => !ehDesenho(c));
  rep.check(`${nomeAba}: há miniaturas`, cartoes.length > 0, `${cartoes.length} cartões`);
  rep.check(`${nomeAba}: todas são desenho (não retângulo liso)`, liso.length === 0,
    liso.slice(0, 6).map((c) => `${c.nome} (${c.elementos} el., ${c.cores} cor)`).join('; ') || 'ok');
  console.log(`${nomeAba}: ${desenhos.length}/${cartoes.length} desenhos; exemplos: ${desenhos.slice(0, 4).map((c) => `${c.nome}=${c.elementos}el/${c.cores}cores`).join(' | ')}`);
  await page.locator('.pal-janela').screenshot({ path: `${OUT}/${arquivo}-grade.png` });
  const primeiros = page.locator('.pal-grade .pal-movel').nth(0);
  await primeiros.screenshot({ path: `${OUT}/${arquivo}-cartao-1.png` });
  await page.locator('.pal-grade .pal-movel').nth(1).screenshot({ path: `${OUT}/${arquivo}-cartao-2.png` });
  return cartoes;
}

try {
  await rep.step('1. abre o app e a Biblioteca', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.getByRole('button', { name: 'Biblioteca', exact: true }).first().click();
    await page.waitForSelector('.pal-janela', { state: 'visible', timeout: 15_000 });
    rep.check('Biblioteca aberta', true);
  });

  await rep.step('2. grupo Hidráulica: miniaturas MEP são desenho', async () => {
    await conferirGrupo('Hidráulica', 'hidraulica');
  });

  await rep.step('3. grupo Elétrico: miniaturas MEP são desenho', async () => {
    await conferirGrupo('Elétrico', 'eletrico');
  });

  await rep.step('4. sem erro de console (o 404 do favicon do servidor de desenvolvimento é ignorado)', async () => {
    const reais = erros.filter((e) => !/status of 404/.test(e));
    rep.check('sem erro de console', reais.length === 0, reais.slice(0, 3).join(' | ').slice(0, 160));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
