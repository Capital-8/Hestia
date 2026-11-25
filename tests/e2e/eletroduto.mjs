// Ferramenta Eletroduto (ficha C3), em Chrome real: Sistemas > Eletroduto, traça um L entre duas caixas de luz da Krona, confere as
// peças criadas (2 eletrodutos cortados e 1 curva 90°), a ligação nas entradas das caixas e "Verificar rede" (sem afastada/incompatível;
// as entradas LIVRES das caixas aparecem como "ligação aberta", porque a caixa não tem tampão). As caixas são postas por comando do
// programa (família da biblioteca + instância), não pela paleta; o eletroduto é traçado com o mouse.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5216/?debug=1' node tests/e2e/eletroduto.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5216/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/eletroduto';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, x: e.x, y: e.y, z: e.z, L: e.values?.L, lig: Object.keys(e.ligacoes ?? {}).length })));
const TUBO = 'fam_krona_eletrica_tubo_corte';
const CURVA = 'fam_krona_eletrica_curva90';
const CAIXA = 'fam_krona_eletrica_caixa_4x4';

try {
  await rep.step('1. abre o app, Sistemas > Elétrico > Eletroduto, painel próprio', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.screenshot({ path: `${OUT}/00-aba-sistemas.png` });
    await page.getByRole('button', { name: 'Eletroduto', exact: true }).first().click();
    await page.waitForSelector('#place-tubo-dn', { timeout: 15_000 });
    const dns = (await page.locator('#place-tubo-dn option').allInnerTexts()).join('|');
    const tipos = (await page.locator('#place-tubo-familia option').allInnerTexts()).join('|');
    const titulo = await page.locator('details.pgroup > summary').allInnerTexts();
    rep.check('bitolas do catálogo 20|25|32', dns === '20|25|32', dns);
    rep.check('tipo elétrico no seletor (e nenhum de esgoto)', /Eletroduto PVC/.test(tipos) && !/Esgoto|Água/.test(tipos), tipos);
    rep.check('painel com o título Eletroduto', titulo.some((t) => /Eletroduto/.test(t)), titulo.slice(0, 6).join(','));
    await page.locator('#place-tubo-dn').selectOption('20');
    await page.screenshot({ path: `${OUT}/01-painel.png` });
  });
  await rep.step('2. duas caixas de luz 4x4 da Krona no projeto', async () => {
    const entradas = await page.evaluate(({ CAIXA }) => {
      const { model, engine, editor } = window.__hestia;
      const f = model.familiaDaBiblioteca(CAIXA);
      editor.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
      const mk = (id, x, y, rot) => ({ id, kind: 'component', familyId: CAIXA, typeId: f.tipos[0].id, levelId: window.__hestia.useUi.getState().levelId, x, y, z: 0.5, rotation: rot, mirrored: false, values: { L: 100, A: 100, P: 50 }, mark: '' });
      editor.store.exec({ type: 'addComponent', component: mk('cx1', 0, 0, 0) });
      editor.store.exec({ type: 'addComponent', component: mk('cx2', 3.025, 2, Math.PI / 2) });
      const pos = (id, lig) => { const c = editor.store.project.elements[id]; const l = engine.resolverComponente(editor.store.project, c).ligacoes.find((q) => q.id === lig); return engine.ligacaoNoMundo(l, c).posicaoMundo; };
      return { d: pos('cx1', 'd'), c: pos('cx2', 'c') };
    }, { CAIXA });
    rep.check('2 caixas', (await comps()).filter((c) => c.f === CAIXA).length === 2, JSON.stringify(entradas));
    globalThis.E = entradas;
    const z = page.locator('#place-tubo-z');
    await z.fill(String(entradas.d[2]));
    await z.press('Enter');
    await page.waitForTimeout(300);
    // Enquadra as caixas: a ferramenta lê o viewport, então garante que a planta mostra x de 0 a 3,1 e y de 0 a 2,1.
    await page.evaluate(() => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), cx: 1.5, cy: 1, zoom: 200 }); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/02-caixas.png` });
  });
  await rep.step('3. traça em L: da entrada da caixa 1, canto, até a entrada da caixa 2', async () => {
    const { d, c } = globalThis.E;
    await clickWorld(page, d[0], d[1]);
    await clickWorld(page, c[0], d[1]);
    await clickWorld(page, c[0], c[1]);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const todos = await comps();
    const tubos = todos.filter((x) => x.f === TUBO);
    const curvas = todos.filter((x) => x.f === CURVA);
    const cx = todos.filter((x) => x.f === CAIXA);
    rep.check('2 eletrodutos cortados e 1 curva 90° da Krona elétrica', tubos.length === 2 && curvas.length === 1, `${tubos.length} tubos, ${curvas.length} curvas`);
    rep.check('cada caixa ligada ao eletroduto por 1 ligação', cx.every((x) => x.lig === 1), cx.map((x) => `${x.id}:${x.lig}`).join(','));
    rep.check('comprimentos menores que o traçado (recuo nas bolsas)', tubos.every((x) => x.L > 0 && x.L < 3000), tubos.map((x) => x.L.toFixed(1)).join(','));
    await page.screenshot({ path: `${OUT}/03-planta-L.png` });
  });
  await rep.step('4. Verificar rede: sem conexão afastada nem incompatível', async () => {
    const diag = await page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).map((d) => d.codigo + ':' + d.elementId));
    const cont = diag.reduce((a, d) => ({ ...a, [d.split(':')[0]]: (a[d.split(':')[0]] ?? 0) + 1 }), {});
    rep.check('diagnóstico do motor sem afastada/incompatível/inválida/curvas', !diag.some((d) => /afastada|incompativel|invalida|curvas/.test(d)), JSON.stringify(cont));
    rep.check('só as 6 entradas livres das caixas aparecem como ligação aberta', cont.ligacao_aberta === 6 && diag.filter((d) => d.startsWith('ligacao_aberta:cx')).length === 6, JSON.stringify(cont));
    await page.getByRole('button', { name: 'Verificar rede', exact: true }).first().click();
    await page.waitForTimeout(3000);
    const itens = await page.locator('[role="dialog"] li, [role="dialog"] tr').allInnerTexts();
    rep.check('painel sem “afastada” nem “incompatível”', !itens.some((x) => /afastad|incompat/i.test(x)), itens.slice(0, 3).join(' | ').replace(/\s+/g, ' ').slice(0, 200));
    const vis = await page.evaluate(() => { const li = document.querySelector('[role="dialog"] li'); if (!li) return null; const r = li.getBoundingClientRect(); const cs = getComputedStyle(li); return { w: r.width, h: r.height, color: cs.color, vis: cs.visibility, op: cs.opacity, bg: getComputedStyle(document.querySelector('[role="dialog"]')).backgroundColor }; });
    console.log('  info  primeiro item do painel:', JSON.stringify(vis));
    await page.screenshot({ path: `${OUT}/04-verificar-rede.png` });
  });
  await rep.step('5. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
