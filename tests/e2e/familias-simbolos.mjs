// Roteiro dos SÍMBOLOS 2D no editor de famílias (ficha D3), em Chromium real:
//   abre o editor, cria um símbolo novo pelo painel e confere a gravação no modelo; escolhe a ferramenta Círculo e clica no fundo
//   da tela (cria um primitivo no ponto); arrasta a alça do primeiro ponto e confere a gravação em números literais; liga
//   "Substituir geometria" e marca a vista Corte; lista erros de console.
//   Não cobre ainda a aparição do símbolo na PLANTA DO PROJETO (a ficha pede): fica para o roteiro do projeto, marcado como pendente.
// Uso: APP='http://127.0.0.1:5199/?debug=1' node tests/e2e/familias-simbolos.mjs
//   Sem APP, usa o servidor de desenvolvimento em http://127.0.0.1:5199 (suba com `vite --port 5199 --host 127.0.0.1` em apps/web).
//   CHROME_PATH aponta o navegador (padrão: /opt/pw-browsers/chromium). Sai com código 1 se algum passo falhar.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5199/?debug=1';
const EXE = chromeExecutable();
if (!EXE) {
  console.error('PENDENTE: Chromium não encontrado (defina CHROME_PATH)');
  process.exit(2);
}
const OUT = process.env.SHOTS ?? 'test-results/familias-simbolos';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
const page = await context.newPage();
const erros = [];
// O 404 de /favicon.ico (o servidor de desenvolvimento não tem ícone) não é erro do editor: fica fora da lista.
page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));

const rep = makeReporter();
const simbolosDaFamilia = () => page.evaluate(() => window.__hestia.useFamilia.getState().historico.atual.simbolos ?? []);

try {
  await rep.step('1. abre o app e o editor de famílias', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    rep.check('editor de famílias aberto', true);
  });

  await rep.step('2. cria um símbolo novo pelo painel', async () => {
    await page.getByRole('button', { name: 'Novo símbolo', exact: true }).click();
    await page.waitForFunction(() => (window.__hestia.useFamilia.getState().historico.atual.simbolos?.length ?? 0) === 1, null, { timeout: 30_000 });
    const [s] = await simbolosDaFamilia();
    rep.check('símbolo criado em planta, plano XY', s?.vistas?.[0] === 'planta' && s?.plano === 'xy', JSON.stringify(s));
    rep.check('símbolo nasce com uma linha de exemplo', s?.primitivos?.length === 1 && s?.primitivos?.[0]?.tipo === 'linha');
    rep.check('tela de desenho aparece', await page.locator('.fam-sim-tela').isVisible());
  });

  await rep.step('3. ferramenta Círculo: clique no fundo cria o primitivo no ponto', async () => {
    await page.getByRole('button', { name: 'Círculo', exact: true }).click();
    // Rola até a tela antes de medir: o clique por coordenadas não rola sozinho e cairia fora da janela.
    await page.locator('.fam-sim-fundo').scrollIntoViewIfNeeded();
    const caixa = await page.locator('.fam-sim-fundo').boundingBox();
    if (caixa === null) throw new Error('fundo da tela sem caixa');
    await page.mouse.click(caixa.x + caixa.width * 0.75, caixa.y + caixa.height * 0.25);
    await page.waitForFunction(() => (window.__hestia.useFamilia.getState().historico.atual.simbolos?.[0]?.primitivos?.length ?? 0) === 2, null, { timeout: 30_000 });
    const [, circ] = (await simbolosDaFamilia())[0]?.primitivos ?? [];
    rep.check('segundo primitivo é um círculo', circ?.tipo === 'circulo', JSON.stringify(circ));
    rep.check('círculo criado com raio em mm de exemplo', circ?.raio === '50');
  });

  await rep.step('4. arrasta a alça da linha: a gravação passa a números literais', async () => {
    const alca = page.locator('.fam-sim-alca').first();
    await alca.scrollIntoViewIfNeeded();
    const caixa = await alca.boundingBox();
    if (caixa === null) throw new Error('alça sem caixa');
    const x = caixa.x + caixa.width / 2;
    const y = caixa.y + caixa.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y - 30, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() => {
      const p = window.__hestia.useFamilia.getState().historico.atual.simbolos?.[0]?.primitivos?.[0];
      return p?.tipo === 'linha' && p.de?.[0] !== '0';
    }, null, { timeout: 30_000 });
    const [lin] = (await simbolosDaFamilia())[0]?.primitivos ?? [];
    rep.check('início da linha gravado em número literal', /^-?\d+(\.\d+)?$/.test(lin?.de?.[0] ?? ''), JSON.stringify(lin));
  });

  await rep.step('5. substituir geometria e vista Corte', async () => {
    await page.getByRole('button', { name: 'Substituir geometria', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Corte', exact: true }).check();
    await page.waitForFunction(() => {
      const s = window.__hestia.useFamilia.getState().historico.atual.simbolos?.[0];
      return s?.substituiGeometria === true && s.vistas.includes('corte');
    }, null, { timeout: 30_000 });
    rep.check('substituiGeometria ligada e vista Corte marcada', true);
    await page.screenshot({ path: `${OUT}/simbolos.png`, fullPage: false });
  });

  await rep.step('6. erros de console', async () => {
    rep.check('sem erros de console', erros.length === 0, erros.join(' | '));
  });
} catch (e) {
  console.log(`FALHA fora dos passos: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  rep.summary();
  await browser.close();
}
if (rep.steps.some((s) => s.status === 'FAIL')) process.exitCode = 1;
