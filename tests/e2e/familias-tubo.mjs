// Roteiro de navegador da família de tubo (ficha H1, roteiro 1), em Chrome real:
//   1. abre o editor de famílias, cria uma família de tubo a partir do modelo-base "Tubo reto" (galeria Novo);
//   2. guarda em "Meus modelos", carrega no projeto e fecha o editor;
//   3. pela ferramenta Tubo desenha 3 trechos em L (0,0)→(3,0)→(3,2)→(6,2) e confere comprimentos e conexões recíprocas;
//   4. abre "Verificar rede" e confere as pontas livres listadas;
//   5. abre "Orçamento" e confere o quantitativo de tubulação (m) do DN 50;
//   6. verifica erros de console (o 404 de favicon é ignorado).
// Uso: APP='http://127.0.0.1:5201/?debug=1' node tests/e2e/familias-tubo.mjs
//   Sem APP, usa o servidor de desenvolvimento em http://127.0.0.1:5201 (suba com `npx vite --port 5201 --host 127.0.0.1` em apps/web).
//   CHROME_PATH aponta o navegador. Sai com código 1 se algum passo falhar.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5201/?debug=1';
const EXE = chromeExecutable();
if (!EXE) {
  console.error('PENDENTE: Chrome não encontrado (defina CHROME_PATH)');
  process.exit(2);
}
const OUT = process.env.SHOTS ?? path.resolve('docs/familias-parametricas/evidencias');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();

let famId = null;
let nomeFamilia = null;

/** Instâncias de componente do projeto, com a família, o L/DN e as ligações (conexões) de cada uma. */
const componentes = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements)
  .filter((e) => e.kind === 'component')
  .map((e) => ({ id: e.id, familyId: e.familyId, L: e.values?.L, DN: e.values?.DN, lig: e.ligacoes ?? null })));

const tubos = async () => (await componentes()).filter((c) => c.familyId === famId);

const abrirEditor = () => page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();

try {
  await rep.step('1. cria a família de tubo pelo modelo-base "Tubo reto" (galeria Novo)', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await abrirEditor();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    await page.locator('.fam-novo-btn').click();
    await page.waitForSelector('.fam-tpl', { timeout: 30_000 });
    await page.locator('.fam-tpl', { hasText: 'Tubo reto' }).first().click();
    await page.locator('.fam-bt.pri', { hasText: 'Criar' }).click();
    await page.waitForFunction(() => window.__hestia.useFamilia.getState().historico.atual.nome.endsWith('(nova)'), null, { timeout: 30_000 });
    const f = await page.evaluate(() => {
      const a = window.__hestia.useFamilia.getState().familia();
      return { id: a.id, nome: a.nome, corpos: a.corpos.map((c) => c.papel), ligacoes: a.ligacoes.length, parametros: a.parametros.map((p) => p.id) };
    });
    famId = f.id;
    nomeFamilia = f.nome;
    rep.check('família criada a partir de Tubo reto', f.nome === 'Tubo reto (nova)', f.nome);
    rep.check('corpo de tubo e duas ligações', f.corpos.includes('tubo') && f.ligacoes === 2, `${f.corpos.join(',')} / ${f.ligacoes}`);
    rep.check('parâmetros L e DN', f.parametros.includes('L') && f.parametros.includes('DN'), f.parametros.join(','));
    await page.screenshot({ path: path.join(OUT, 'tubo-familia-criada.png') });
  });

  await rep.step('2. guarda em Meus modelos, carrega no projeto e fecha o editor', async () => {
    await page.getByRole('button', { name: 'Abrir e salvar', exact: true }).first().click();
    await page.waitForSelector('.fam-arquivo', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Guardar em Meus modelos', exact: true }).click();
    await page.waitForSelector('.fam-arquivo .fam-msg', { timeout: 30_000 });
    const guardado = await page.evaluate(() => localStorage.getItem('hestia.familia.meus') ?? '');
    rep.check('Meus modelos guardou a família', guardado.includes(famId), `${guardado.length} caracteres`);
    await page.locator('.fam-dwin button[aria-label="Fechar"]').click();
    await page.getByRole('button', { name: 'Carregar no projeto', exact: true }).click();
    await page.waitForFunction((id) => !!window.__hestia.editor.store.project.componentFamilies?.[id], famId, { timeout: 30_000 });
    rep.check('família no projeto (componentFamilies)', true);
    await page.waitForFunction(() => !window.__hestia.useFamilia.getState().aberta, null, { timeout: 15_000 }).catch(() => undefined);
    rep.check('editor fechado após carregar', !(await page.evaluate(() => window.__hestia.useFamilia.getState().aberta)));
  });

  await rep.step('3. Inserir > Tubo: três trechos em L com conexões recíprocas', async () => {
    await page.locator('.rtab:visible', { hasText: /^(Inserir|Insert)$/ }).first().click();
    await page.getByRole('button', { name: /^(Tubo|Pipe)$/ }).first().click();
    rep.check('ferramenta ativa = tubo', (await page.evaluate(() => window.__hestia.useUi.getState().tool)) === 'tubo');
    await clickWorld(page, 0, 0);
    await clickWorld(page, 3, 0);
    await clickWorld(page, 3, 2);
    await clickWorld(page, 6, 2);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(OUT, 'tubo-em-L.png') });
    const t = await tubos();
    rep.check('3 instâncias da família', t.length === 3, String(t.length));
    rep.check('comprimentos 3000, 2000 e 3000 mm', t.map((c) => Math.round(c.L)).join(',') === '3000,2000,3000', t.map((c) => Math.round(c.L)).join(','));
    rep.check('todos com DN 50', t.every((c) => c.DN === 50), t.map((c) => c.DN).join(','));
    // As ligações são guardadas por id (`lig[idLigacao] = { componenteId, ligacaoId }`); só as conectadas aparecem.
    const ligadoA = (a, b) => Object.values(a?.lig ?? {}).some((x) => x.componenteId === b?.id);
    rep.check('trecho 1 conectado ao 2 (recíproco)', ligadoA(t[0], t[1]) && ligadoA(t[1], t[0]), JSON.stringify(t[0]?.lig));
    rep.check('trecho 2 conectado ao 3 (recíproco)', ligadoA(t[1], t[2]) && ligadoA(t[2], t[1]), JSON.stringify(t[1]?.lig));
    rep.check('pontas livres: uma ligação no 1 e no 3, duas no 2', Object.keys(t[0]?.lig ?? {}).length === 1 && Object.keys(t[2]?.lig ?? {}).length === 1 && Object.keys(t[1]?.lig ?? {}).length === 2);
    // LIMITAÇÃO medida: a curva automática só existe para as famílias de CONEXOES_POR_DOMINIO (fam_tubo_esgoto etc.).
    // O passo 4 mede se o cotovelo sem curva é acusado como incompatível. O tê não foi desenhado: fam_esgoto_te exige o tubo da biblioteca.
    rep.check('LIMITAÇÃO medida: tê não desenhado (fam_esgoto_te exige o tubo de esgoto da biblioteca)', true);
  });

  await rep.step('4. Verificar rede lista as duas pontas livres', async () => {
    await page.locator('.rtab:visible', { hasText: /^(Inserir|Insert)$/ }).first().click();
    await page.getByRole('button', { name: /^(Verificar rede|Check network)$/ }).first().click();
    const painel = page.locator('.rede-diagnostico, [role=dialog]', { hasText: /Verificar rede|Check network/ }).first();
    await painel.waitFor({ state: 'visible', timeout: 15_000 });
    const itens = await painel.locator('.issues-item').allInnerTexts();
    rep.check('lista tem as 2 ligações abertas', itens.filter((x) => /aberta/.test(x)).length === 2, `${itens.length} itens`);
    const incompativeis = itens.filter((x) => /incompatível/.test(x)).length;
    rep.check('LIMITAÇÃO medida: o cotovelo sem curva é acusado como incompatível nas 2 pontas', incompativeis === 2, `${incompativeis} incompatíveis`);
    await page.screenshot({ path: path.join(OUT, 'tubo-verificar-rede.png') });
    await page.keyboard.press('Escape');
  });

  await rep.step('5. Orçamento: quantitativo de tubulação em m por DN', async () => {
    await page.locator('.rtab:visible', { hasText: /^(Arquitetura|Architecture)$/ }).first().click();
    await page.getByRole('button', { name: /^(Orçamento|Budget)$/ }).first().click();
    await page.locator('.fam-dwin button', { hasText: /Instalações e estrutura|Installations/ }).first().click();
    const linhas = page.locator('tr').filter({ hasText: /Tubulação|Piping/ });
    await linhas.first().waitFor({ state: 'visible', timeout: 20_000 });
    const textos = (await linhas.allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    // Formato do quantitativo: "Tubulação DN 50 <quantidade 3> <medida 8> m" (numeroMep tira zeros à direita).
    rep.check('linha de tubulação DN 50: 3 trechos, medida 8 m (3 + 2 + 3)', textos.some((x) => /DN ?50/.test(x) && / 3 8(?:[,.]0+)? m\b/.test(x)), textos.join(' | ').slice(0, 200));
    await page.screenshot({ path: path.join(OUT, 'tubo-orcamento-m-dn.png') });
    await page.keyboard.press('Escape');
  });

  rep.check('sem erros de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} catch (e) {
  console.log(`FALHA fora dos passos: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  void nomeFamilia;
  rep.summary();
  await browser.close();
}
process.exit(rep.steps.some((s) => s.status === 'FAIL') || process.exitCode ? 1 : 0);
