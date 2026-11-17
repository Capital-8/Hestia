// Anotações de ponto (cota de elevação, cota de coordenada), nuvem de revisão e símbolo de norte: SELECIONAR, DESTACAR,
// APAGAR (Delete e menu) e DESFAZER em planta de piso, planta de área e corte. Só `window.__hestia` para conferir.
// Uso: APP=http://127.0.0.1:4198/?gl=1&debug=1 node tests/e2e/anotar-apagar.mjs
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL_APP = process.env.APP ?? 'http://127.0.0.1:4198/?gl=1&debug=1';
const exe = ['/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const erros = [];
page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
let falhas = 0;
const check = (nome, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}${extra !== '' ? ` (${extra})` : ''}`);
  if (!ok) falhas++;
};
async function passo(nome, fn) {
  console.log(`\n== ${nome}`);
  try { await fn(); } catch (e) { check(`${nome}: sem exceção`, false, e.message.split('\n')[0]); }
}
const H = (fn, arg) => page.evaluate(fn, arg);
const mundo = (x, y) => H(({ x, y }) => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); const vp = window.__hestia.editor.viewport(); return { x: r.x + vp.width / 2 + (x - vp.cx) * vp.zoom, y: r.y + vp.height / 2 - (y - vp.cy) * vp.zoom }; }, { x, y });
const mover = async (x, y) => { const p = await mundo(x, y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(120); };
const clique = async (x, y) => { const p = await mundo(x, y); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); };
const vazio = () => H(() => { const { useUi } = window.__hestia; useUi.setState({ selection: [], hover: null }); });
const sel = () => H(() => window.__hestia.useUi.getState().selection.slice());
const hover = () => H(() => window.__hestia.useUi.getState().hover);

/** Lista as anotações de ponto/nuvem/símbolo da vista corrente: planta de piso (nível), planta de área ou corte. */
const contagem = () => H(() => {
  const { editor, useUi } = window.__hestia;
  const u = useUi.getState();
  const p = editor.project;
  const src = u.view === 'section' ? p.views.find((v) => v.id === u.sectionId)?.annotations
    : u.planKind === 'area' ? p.areaPlans.find((a) => a.id === u.areaPlanId)?.annotations
    : p.levels.find((l) => l.id === u.levelId);
  return { spots: (src?.spots ?? []).length, clouds: (src?.revisionClouds ?? []).length, symbols: (src?.symbols ?? []).length };
});

const CASOS = [
  { nome: 'cota de elevação', lista: 'addSpot', item: (id) => ({ id, kind: 'elevation', target: { x: 3, y: 2 }, at: { x: 4, y: 2.5 }, showLeader: true, familyId: 'spot_elev_nbr' }), clica: { x: 3, y: 2 }, campo: 'spots' },
  { nome: 'cota de coordenada', lista: 'addSpot', item: (id) => ({ id, kind: 'coordinate', target: { x: 6, y: 2 }, at: { x: 7, y: 2.5 }, showLeader: true, familyId: 'spot_coord_proj' }), clica: { x: 6, y: 2 }, campo: 'spots' },
  { nome: 'nuvem de revisão', lista: 'addRevisionCloud', item: (id) => ({ id, points: [{ x: 9, y: 1 }, { x: 11, y: 1 }, { x: 11, y: 3 }, { x: 9, y: 3 }], closed: true, familyId: 'revfam_red' }), clica: { x: 10, y: 1 }, campo: 'clouds' },
  { nome: 'símbolo de norte', lista: 'addSymbol', item: (id) => ({ id, kind: 'northArrow', at: { x: 13, y: 2 }, rotation: 0, familyId: 'north_nbr' }), clica: { x: 13, y: 2 }, campo: 'symbols' },
];

async function bateria(rotulo, ctx) {
  for (const c of CASOS) {
    await passo(`${rotulo}: ${c.nome}`, async () => {
      const id = `t_${rotulo.replace(/\W/g, '')}_${c.campo}_${c.nome.length}`;
      await vazio();
      await H(({ lista, item, ctx }) => { window.__hestia.editor.store.exec({ type: lista, ...ctx, item }); }, { lista: c.lista, item: { ...c.item(id) }, ctx });
      await page.waitForTimeout(150);
      const antes = await contagem();
      check('criada (1 do tipo)', antes[c.campo] === 1, JSON.stringify(antes));
      await mover(c.clica.x, c.clica.y);
      check('DESTACA ao passar o cursor', (await hover()) === id, String(await hover()));
      await clique(c.clica.x, c.clica.y);
      check('SELECIONA ao clicar', JSON.stringify(await sel()) === JSON.stringify([id]), JSON.stringify(await sel()));
      await page.keyboard.press('Delete');
      await page.waitForTimeout(200);
      check('APAGA com Delete', (await contagem())[c.campo] === 0, JSON.stringify(await contagem()));
      check('seleção limpa', (await sel()).length === 0);
      await H(() => window.__hestia.editor.undo());
      await page.waitForTimeout(150);
      check('Ctrl+Z desfaz em 1 passo', (await contagem())[c.campo] === 1, JSON.stringify(await contagem()));
      // menu de contexto: o item Excluir chama editor.deleteSelection
      await clique(c.clica.x, c.clica.y);
      await H(() => window.__hestia.editor.deleteSelection());
      await page.waitForTimeout(200);
      check('APAGA pelo caminho do menu (deleteSelection)', (await contagem())[c.campo] === 0, JSON.stringify(await contagem()));
    });
  }
}

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
  await H(() => { localStorage.removeItem('hestia.panes'); const { editor, useUi } = window.__hestia; editor.newProject('house2'); useUi.setState({ tela: 'editor' }); });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(1000);
  const lv = await H(() => window.__hestia.useUi.getState().levelId);
  await H(() => { const { editor } = window.__hestia; editor.setViewport({ ...editor.viewport(), cx: 8, cy: 2, zoom: 50 }); });

  await bateria('planta de piso', { levelId: lv });

  // Planta de área
  const planId = await H(async () => {
    const { editor, useUi } = window.__hestia;
    const { createAreaPlanAction, openAreaPlan } = await import('/src/editor/areaPlanActions.ts');
    const id = createAreaPlanAction(editor.store, useUi.getState().levelId);
    openAreaPlan(editor.store, id);
    return id;
  });
  await page.waitForTimeout(500);
  await H(() => { const { editor } = window.__hestia; editor.setViewport({ ...editor.viewport(), cx: 8, cy: 2, zoom: 50 }); });
  await bateria('planta de área', { levelId: lv, planId });

  // Corte
  await H(() => {
    const { editor } = window.__hestia;
    editor.store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte A', kind: 'section', a: { x: -2, y: 2 }, b: { x: 14, y: 2 }, depth: 6 } });
    editor.openSection('sv1');
  });
  await page.waitForTimeout(800);
  await H(() => { const { editor } = window.__hestia; editor.setViewport({ ...editor.viewport(), cx: 8, cy: 2, zoom: 50 }); });
  await bateria('corte', { levelId: lv, sectionId: 'sv1' });
  check('sem erros de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
