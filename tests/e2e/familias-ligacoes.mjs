// Roteiro das LIGAÇÕES no editor de famílias (ficha C2b), em Chromium real:
//   abre o editor pelo botão da faixa; cria uma ligação pelo painel da navegação (domínio Água quente, seção redonda);
//   confere a amostra de cor do domínio no formulário e a contagem de marcadores 3D (atributo data-ligacoes do 3D);
//   muda o diâmetro e confere a gravação no modelo; desfaz as duas ações e confere que a família volta ao início;
//   lista erros de console.
// Uso: APP='http://127.0.0.1:5199/?debug=1' node tests/e2e/familias-ligacoes.mjs
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
const OUT = process.env.SHOTS ?? 'test-results/familias-ligacoes';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));

const rep = makeReporter();
const ligacoesDaFamilia = () => page.evaluate(() => window.__hestia.useFamilia.getState().historico.atual.ligacoes ?? []);
const marcadoresNo3d = () => page.evaluate(() => document.querySelector('.fam3d-root')?.getAttribute('data-ligacoes') ?? null);

try {
  await rep.step('1. abre o app e o editor de famílias', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    await page.waitForSelector('.fam3d-root', { state: 'attached', timeout: 60_000 });
    rep.check('editor de famílias aberto', true);
  });

  await rep.step('2. a família começa sem ligações e o 3D mostra zero marcadores', async () => {
    rep.check('lista de ligações vazia', (await ligacoesDaFamilia()).length === 0);
    rep.check('3D com zero marcadores', (await marcadoresNo3d()) === '0');
  });

  await rep.step('3. cria uma ligação de Água quente (redonda) pelo painel', async () => {
    await page.locator('#fln-novo-dominio').selectOption('agua_quente');
    await page.locator('#fln-novo-secao').selectOption('redonda');
    await page.getByRole('button', { name: 'Nova ligação', exact: true }).click();
    await page.waitForFunction(() => (window.__hestia.useFamilia.getState().historico.atual.ligacoes?.length ?? 0) === 1, null, { timeout: 30_000 });
    const [lig] = await ligacoesDaFamilia();
    rep.check('ligação criada com o domínio escolhido', lig?.dominio === 'agua_quente', JSON.stringify(lig));
    rep.check('ligação criada com a seção redonda', lig?.secao === 'redonda');
    rep.check('formulário da ligação aparece', await page.locator('#fln-lig1-diametro').isVisible());
  });

  await rep.step('4. o 3D recebe o marcador e a amostra tem a cor do domínio', async () => {
    await page.waitForFunction(() => document.querySelector('.fam3d-root')?.getAttribute('data-ligacoes') === '1', null, { timeout: 30_000 });
    rep.check('3D com um marcador', (await marcadoresNo3d()) === '1');
    const cor = await page.locator('.fam-lig-form .fam-lig-amostra').evaluate((el) => getComputedStyle(el).backgroundColor);
    // Água quente = 0xe53935 = rgb(229, 57, 53)
    rep.check('amostra na cor de Água quente', cor === 'rgb(229, 57, 53)', cor);
  });

  await rep.step('5. edita o diâmetro e a gravação chega ao modelo', async () => {
    const campo = page.locator('#fln-lig1-diametro');
    await campo.fill('50');
    await campo.press('Enter');
    await page.waitForFunction(() => window.__hestia.useFamilia.getState().historico.atual.ligacoes?.[0]?.diametro === '50', null, { timeout: 30_000 });
    rep.check('diâmetro gravado como 50', (await ligacoesDaFamilia())[0]?.diametro === '50');
    rep.check('3D continua com um marcador', (await marcadoresNo3d()) === '1');
  });

  await rep.step('6. desfazer volta o diâmetro e depois tira a ligação', async () => {
    await page.evaluate(() => window.__hestia.useFamilia.getState().desfazer());
    await page.waitForFunction(() => window.__hestia.useFamilia.getState().historico.atual.ligacoes?.[0]?.diametro === '20', null, { timeout: 30_000 });
    rep.check('diâmetro voltou a 20', (await ligacoesDaFamilia())[0]?.diametro === '20');
    await page.evaluate(() => window.__hestia.useFamilia.getState().desfazer());
    await page.waitForFunction(() => (window.__hestia.useFamilia.getState().historico.atual.ligacoes?.length ?? 0) === 0, null, { timeout: 30_000 });
    rep.check('lista de ligações voltou a zero', (await ligacoesDaFamilia()).length === 0);
    await page.waitForFunction(() => document.querySelector('.fam3d-root')?.getAttribute('data-ligacoes') === '0', null, { timeout: 30_000 });
    rep.check('3D voltou a zero marcadores', (await marcadoresNo3d()) === '0');
  });

  await rep.step('7. erros de console durante o roteiro', async () => {
    await page.screenshot({ path: `${OUT}/ligacoes.png` });
    const pageErr = erros.filter((e) => e.startsWith('[pageerror]'));
    rep.check('nenhum pageerror', pageErr.length === 0, pageErr.slice(0, 2).join(' | '));
    const outros = erros.filter((e) => !e.startsWith('[pageerror]') && !e.includes('Failed to load resource'));
    rep.check('nenhum console.error', outros.length === 0, outros.slice(0, 3).map((e) => e.slice(0, 90)).join(' | '));
  });
} catch (e) {
  console.log(`FALHA fora dos passos: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  rep.summary();
  await browser.close();
}
if (rep.steps.some((s) => s.status === 'FAIL')) process.exitCode = 1;
