// Roteiro dos CORPOS no editor de famílias (ficha B7), em Chromium real:
//   abre o editor pelo botão da faixa; cria uma varredura pela aba Criar (grupo Corpos); confere a lista e o painel;
//   muda o raio da curva do caminho (em L) e confere que a resolução do corpo mudou (o 3D recebe a nova forma);
//   tenta uma fórmula inválida e confere a recusa em vermelho sem alterar a família; desfaz; lista erros de console.
// Uso: APP='http://127.0.0.1:5199/?debug=1' node tests/e2e/familias-corpos.mjs
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
const OUT = process.env.SHOTS ?? 'test-results/familias-corpos';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));

const rep = makeReporter();
const familiaAtual = () => page.evaluate(() => window.__hestia.useFamilia.getState().historico.atual);
const corpoSelecionado = () => page.evaluate(() => {
  const s = window.__hestia.useFamilia.getState();
  const id = s.historico.atual.corpos?.at(-1)?.id ?? null;
  return { id, sel: s.sel };
});
/** Resolução do corpo pelo mesmo motor que o editor usa: o que o 3D recebe. */
const resolucaoDoCorpo = (id) => page.evaluate((cid) => {
  const s = window.__hestia.useFamilia.getState();
  const r = window.__hestia.engine.resolverFamilia(s.historico.atual, { tipoId: s.tipoId ?? undefined, valores: s.valores });
  return JSON.stringify((r.corpos ?? []).filter((c) => c.id === cid));
}, id);

let idCorpo = null;
let resolucaoAntes = null;

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

  await rep.step('2. aba Criar tem o grupo Corpos com as quatro formas', async () => {
    const grupo = page.getByRole('group', { name: 'Corpos' });
    rep.check('grupo Corpos visível', await grupo.isVisible());
    for (const nome of ['Extrusão', 'Revolução', 'Varredura', 'Transição']) {
      rep.check(`botão ${nome}`, await grupo.getByRole('button', { name: nome, exact: true }).isVisible());
    }
  });

  await rep.step('3. cria uma varredura: vira o corpo selecionado e aparece na lista', async () => {
    const antes = (await familiaAtual()).corpos?.length ?? 0;
    await page.getByRole('button', { name: 'Varredura', exact: true }).click();
    await page.waitForFunction((n) => (window.__hestia.useFamilia.getState().historico.atual.corpos?.length ?? 0) === n + 1, antes, { timeout: 30_000 });
    const { id, sel } = await corpoSelecionado();
    idCorpo = id;
    rep.check('corpo novo gravado', (await familiaAtual()).corpos.length === antes + 1, `id ${id}`);
    rep.check('peça não fica selecionada', sel === null);
    rep.check('item da lista de corpos selecionado', (await page.locator('.fam-corpo-li.sel').count()) === 1);
    rep.check('painel do corpo mostra o nome Varredura', (await page.locator('.fam-corpo-painel').innerText()).includes('Varredura'));
    rep.check('tabela de pontos com 3 linhas (caminho em L)', (await page.locator('.fam-corpo-tabela tbody tr').count()) === 3);
  });

  await rep.step('4. muda o raio da curva: a resolução do corpo muda (o 3D recebe a nova forma)', async () => {
    resolucaoAntes = await resolucaoDoCorpo(idCorpo);
    const campo = page.locator(`#fcp-${idCorpo}-1-raio`);
    rep.check('campo do raio no vértice 1', (await campo.count()) === 1);
    await campo.fill('200');
    await campo.press('Enter');
    await page.waitForFunction((id) => {
      const c = window.__hestia.useFamilia.getState().historico.atual.corpos?.find((x) => x.id === id);
      return c?.forma.tipo === 'varredura' && c.forma.caminho.raios?.[0] === '200';
    }, idCorpo, { timeout: 30_000 });
    const depois = await resolucaoDoCorpo(idCorpo);
    rep.check('raio gravado como 200 no modelo', (await familiaAtual()).corpos.find((c) => c.id === idCorpo).forma.caminho.raios[0] === '200');
    rep.check('resolução do corpo diferente de antes', depois !== resolucaoAntes);
    await page.screenshot({ path: `${OUT}/varredura-raio-200.png` });
  });

  await rep.step('5. fórmula inválida: recusa em vermelho e a família não muda', async () => {
    const antes = JSON.stringify((await familiaAtual()).corpos);
    const campo = page.locator(`#fcp-${idCorpo}-1-raio`);
    await campo.fill('(200');
    await campo.press('Enter');
    rep.check('campo marcado como inválido', (await campo.getAttribute('aria-invalid')) === 'true');
    rep.check('campo com a mensagem de erro (classe bad)', (await campo.getAttribute('class')).includes('bad'));
    rep.check('família intacta depois da recusa', JSON.stringify((await familiaAtual()).corpos) === antes);
  });

  await rep.step('6. desfazer volta o raio anterior', async () => {
    await page.evaluate(() => window.__hestia.useFamilia.getState().desfazer());
    await page.waitForFunction((id) => {
      const c = window.__hestia.useFamilia.getState().historico.atual.corpos?.find((x) => x.id === id);
      return c?.forma.tipo === 'varredura' && c.forma.caminho.raios?.[0] !== '200';
    }, idCorpo, { timeout: 30_000 });
    rep.check('raio voltou ao padrão (100)', (await familiaAtual()).corpos.find((c) => c.id === idCorpo).forma.caminho.raios[0] === '100');
  });

  await rep.step('7. erros de console durante o roteiro', async () => {
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
