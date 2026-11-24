// Abas do editor de famílias (ficha G2): Inserir, Modificar, Vista e Gerenciar. Nenhuma aba mostra o placeholder
// "Aba ainda sem painéis", e os botões habilitados chamam ações reais (a família muda, ou abre o diálogo existente).
// Uso: APP='http://127.0.0.1:4700/?debug=1' node tests/e2e/familias-abas.mjs
//   Sem APP, usa o servidor de desenvolvimento em http://127.0.0.1:4700 (suba com `vite --port 4700` em apps/web).
//   CHROME_PATH aponta o navegador; sem ele, procura o Chromium do sistema. Sai com código 1 se algum passo falhar.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:4700/?debug=1';
const EXE = chromeExecutable();
if (!EXE) {
  console.error('PENDENTE: Chromium não encontrado (defina CHROME_PATH)');
  process.exit(2);
}
const OUT = process.env.SHOTS ?? 'test-results/familias-abas';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const store = () => page.evaluate(() => {
  const s = window.__hestia.useFamilia.getState();
  const f = s.familia();
  return { dialogo: s.dialogo, vista: s.vista, simbolos: (f.simbolos ?? []).length, detalhes: (f.detalhes ?? []).length, ligacoes: (f.ligacoes ?? []).length };
});
const abrirAba = (nome) => page.locator('.fam-root .rtab', { hasText: nome }).first().click();
/** Fecha o diálogo aberto pela faixa (o roteiro só confere que ele abriu). */
const fecharDialogo = () => page.evaluate(() => window.__hestia.useFamilia.getState().set({ dialogo: null }));

try {
  await rep.step('1. abre o editor de famílias pela faixa Construir', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    rep.check('editor aberto', (await store()).dialogo === null);
  });

  await rep.step('2. nenhuma aba mostra o placeholder e as cinco abas estão habilitadas', async () => {
    const abas = await page.locator('.fam-root .rtab').evaluateAll((els) => els.map((e) => ({ nome: e.textContent, off: e.disabled, dica: e.title })));
    rep.check('cinco abas', abas.length === 5, abas.map((a) => a.nome).join(','));
    rep.check('nenhuma aba desabilitada', abas.every((a) => !a.off));
    rep.check('nenhum placeholder "Aba ainda sem painéis"', abas.every((a) => !a.dica.includes('sem painéis')));
  });

  await rep.step('3. Inserir: cada aba tem painéis e o botão Símbolo 2D adiciona um símbolo', async () => {
    await abrirAba('Inserir');
    const antes = await store();
    rep.check('aba Inserir tem botões', (await page.locator('.fam-root .ribbon .rb-btn').count()) > 0);
    await page.locator('.fam-root .ribbon .rb-btn', { hasText: 'Símbolo 2D' }).click();
    const depois = await store();
    rep.check('Símbolo 2D grava um símbolo na família', depois.simbolos === antes.simbolos + 1, `${antes.simbolos} → ${depois.simbolos}`);
    await page.locator('.fam-root .ribbon .rb-btn', { hasText: 'Detalhe' }).click();
    rep.check('Detalhe grava um detalhe na família', (await store()).detalhes === antes.detalhes + 1);
    await page.locator('.fam-root .ribbon .rb-btn', { hasText: 'Ligação' }).first().click();
    rep.check('Ligação grava uma ligação na família', (await store()).ligacoes === antes.ligacoes + 1);
    await page.locator('.fam-root .ribbon .rb-btn', { hasText: 'Módulo aninhado' }).click();
    rep.check('Módulo aninhado abre o diálogo existente', (await store()).dialogo === 'aninhado');
    await fecharDialogo();
  });

  await rep.step('4. Vista: troca a vista padrão e o nível de detalhe', async () => {
    await abrirAba('Vista');
    await page.locator('.fam-root .ribbon .rb-btn', { hasText: 'Frente' }).click();
    rep.check('botão Frente grava vista frente', (await store()).vista === 'frente');
    await page.locator('.fam-root .ribbon .rb-btn', { hasText: '3D' }).first().click();
    rep.check('botão 3D volta à vista 3d', (await store()).vista === '3d');
    const desab = await page.locator('.fam-root .ribbon .rb-btn:disabled').evaluateAll((els) => els.map((e) => e.title));
    rep.check('botões ainda não existentes ficam desabilitados com motivo', desab.length > 0 && desab.every((d) => d.length > 0), `${desab.length} desabilitados`);
  });

  await rep.step('5. Gerenciar: Parâmetros abre o diálogo existente; Validar explica por que está desabilitado', async () => {
    await abrirAba('Gerenciar');
    await page.locator('.fam-root .ribbon .rb-btn', { hasText: 'Parâmetros' }).click();
    rep.check('Parâmetros abre o diálogo de parâmetros', (await store()).dialogo === 'parametros');
    await fecharDialogo();
    rep.check('Validar desabilitado com motivo', await page.locator('.fam-root .ribbon .rb-btn:disabled', { hasText: 'Validar' }).count() === 1);
  });

  await rep.step('6. erros de console durante o roteiro', async () => {
    const pageErr = erros.filter((e) => e.startsWith('[pageerror]'));
    rep.check('nenhum pageerror', pageErr.length === 0, pageErr.slice(0, 2).join(' | '));
  });
} catch (e) {
  console.log(`FALHA fora dos passos: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  rep.summary();
  await browser.close();
}
const falhou = rep.steps.some((s) => s.status === 'FAIL');
if (falhou) process.exitCode = 1;
