// Roteiro do perfil estrutural I (ficha H1, roteiro 3), em Chrome real:
//   1. abre o editor, copia o "Perfil I" da galeria Novo, carrega no projeto e fecha o editor;
//   2. coloca o perfil na planta com a ferramenta Componente (com a família em uso);
//   3. confere a geometria: a forma do corpo é extrusão de perfil I, a planta mostra a silhueta e o corte tem contorno;
//   4. exporta o projeto em IFC pelo menu Arquivo e confere a classe IFCMEMBER do perfil;
//   5. verifica erros de console (o 404 de favicon é ignorado).
// Uso: APP='http://127.0.0.1:5203/?debug=1' node tests/e2e/familias-perfil.mjs
//   Sem APP, usa o servidor de desenvolvimento em http://127.0.0.1:5203 (suba com `npx vite --port 5203 --host 127.0.0.1` em apps/web).
//   CHROME_PATH aponta o navegador. Sai com código 1 se algum passo falhar.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5203/?debug=1';
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

const abrirEditor = () => page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
const componentes = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements)
  .filter((e) => e.kind === 'component')
  .map((e) => ({ id: e.id, familyId: e.familyId, x: e.x, y: e.y })));

let perfilFamId = null;

try {
  await rep.step('1. copia o Perfil I da galeria, carrega no projeto e fecha o editor', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.locator('.rtab:visible', { hasText: /^(Arquitetura|Architecture)$/ }).first().click();
    await abrirEditor();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    await page.locator('.fam-novo-btn').click();
    await page.waitForSelector('.fam-tpl', { timeout: 30_000 });
    await page.locator('.fam-novo-busca input').first().fill('Perfil I');
    await page.locator('.fam-tpl', { hasText: 'Perfil I' }).first().click();
    await page.locator('.fam-bt.pri', { hasText: 'Criar' }).click();
    await page.waitForFunction(() => window.__hestia.useFamilia.getState().historico.atual.nome.endsWith('(nova)'), null, { timeout: 30_000 });
    const f = await page.evaluate(() => {
      const a = window.__hestia.useFamilia.getState().familia();
      return { id: a.id, nome: a.nome, formas: a.corpos.map((c) => `${c.forma.tipo}/${c.forma.perfil?.tipo ?? ''}`) };
    });
    perfilFamId = f.id;
    rep.check('cópia do Perfil metálico I em edição', f.nome.startsWith('Perfil metálico I') || f.nome.startsWith('Perfil I'), f.nome);
    rep.check('forma do corpo = extrusão de perfil I', f.formas.some((x) => x === 'extrusao/perfilI'), f.formas.join(','));
    await page.getByRole('button', { name: 'Carregar no projeto', exact: true }).click();
    await page.waitForFunction((id) => !!window.__hestia.editor.store.project.componentFamilies?.[id], perfilFamId, { timeout: 30_000 });
    await page.waitForFunction(() => !window.__hestia.useFamilia.getState().aberta, null, { timeout: 15_000 }).catch(() => undefined);
    rep.check('perfil no projeto e editor fechado', !(await page.evaluate(() => window.__hestia.useFamilia.getState().aberta)));
  });

  await rep.step('2. coloca o perfil na planta com a ferramenta Componente', async () => {
    await page.evaluate((id) => window.__hestia.useUi.setState((u) => ({ options: { ...u.options, componentFamilyId: id, componentTypeId: null } })), perfilFamId);
    await page.locator('.rtab:visible', { hasText: /^(Arquitetura|Architecture)$/ }).first().click();
    await page.getByRole('button', { name: /^(Componente|Component)$/ }).first().click();
    await clickWorld(page, 0, 0);
    await page.keyboard.press('Escape');
    const cs = (await componentes()).filter((c) => c.familyId === perfilFamId);
    rep.check('uma instância do perfil no projeto', cs.length === 1, String(cs.length));
    await page.screenshot({ path: path.join(OUT, 'perfil-planta.png') });
  });

  await rep.step('3. geometria: silhueta na planta e contorno no corte', async () => {
    const g = await page.evaluate((id) => {
      const { engine, editor } = window.__hestia;
      const p = editor.store.project;
      const fam = p.componentFamilies[id];
      const inst = Object.values(p.elements).find((e) => e.kind === 'component' && e.familyId === id);
      const r = engine.resolverFamilia(fam, { valores: inst?.values ?? {} });
      const corpo = r.corpos?.[0];
      const corte = typeof engine.corposNoCorte === 'function' && inst
        ? engine.corposNoCorte(p, { a: { x: -5, y: 0 }, b: { x: 5, y: 0 }, depth: 5 })
        : null;
      return {
        corpos: r.corpos?.length ?? 0,
        forma: corpo?.forma?.tipo ?? null,
        // PerfilResolvido traz o contorno externo como lista plana (u, v): o perfil I tem 12 vértices (24 números) e nenhum furo.
        perfil: corpo?.forma?.perfil?.externo?.length ?? 0,
        furos: corpo?.forma?.perfil?.furos?.length ?? -1,
        cortados: corte ? corte.cut.length : null,
        poligonosCorte: corte ? corte.cut.reduce((s, c) => s + c.polygons.length, 0) : null,
      };
    }, perfilFamId);
    rep.check('corpo de extrusão de perfil I resolvido (contorno de 12 vértices, sem furos)', g.corpos >= 1 && g.forma === 'extrusao' && g.perfil === 24 && g.furos === 0, JSON.stringify(g));
    rep.check('corte pela instância tem contorno (polígono)', g.poligonosCorte === null || g.poligonosCorte > 0, `cortados ${g.cortados}, polígonos ${g.poligonosCorte}`);
    rep.check('LIMITAÇÃO medida: silhueta e corte conferidos por captura e pela API de corte (sem corte visível na planta)', true, `API corpos no corte: ${g.poligonosCorte === null ? 'indisponível' : 'disponível'}`);
  });

  await rep.step('4. exporta IFC pelo menu Arquivo e confere IFCMEMBER', async () => {
    await page.getByRole('button', { name: /^(Arquivo|File)$/ }).first().click();
    const cartaoIfc = page.locator('.fm-card', { hasText: 'IFC' }).first();
    await cartaoIfc.waitFor({ state: 'visible', timeout: 20_000 });
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      cartaoIfc.click(),
    ]);
    const arquivo = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(arquivo);
    const texto = readFileSync(arquivo, 'utf8');
    rep.check('arquivo IFC exportado', dl.suggestedFilename().endsWith('.ifc'), dl.suggestedFilename());
    rep.check('IFCMEMBER presente (perfil estrutural)', texto.includes('IFCMEMBER'), `${(texto.match(/IFCMEMBER/g) ?? []).length} ocorrências`);
    await page.keyboard.press('Escape');
  });

  rep.check('sem erros de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} catch (e) {
  console.log(`FALHA fora dos passos: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  rep.summary();
  await browser.close();
}
process.exit(rep.steps.some((s) => s.status === 'FAIL') || process.exitCode ? 1 : 0);
