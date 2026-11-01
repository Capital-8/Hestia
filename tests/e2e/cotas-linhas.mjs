// Cota por linha de parede (Revit): clicar nas faces, a cota segue a parede, trava restringe, painel da cota.
//   npm run build -w @hestia/web && node tests/e2e/cotas-linhas.mjs
import { mkdirSync } from 'node:fs';
import { clickWorld, launch, makeReporter, openApp, worldToPage } from './helpers.mjs';

const OUT = process.env.SHOTS ?? 'test-results/shots';
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const { page, errors } = await openApp(browser, { query: '?debug=1', width: 1440, height: 860 });
const r = makeReporter();
const dims = () => page.evaluate(() => window.__hestia.model.levelDimensions(window.__hestia.editor.project, 'lv_0'));
const valor = () => page.evaluate(() => { const { editor, model } = window.__hestia; return model.levelDimensions(editor.project, 'lv_0').map((d) => model.dimensionValue(editor.project, d)); });

await r.step('(1) cotar duas faces com o mouse grava refs de linha', async () => {
  await page.evaluate(() => {
    const { editor, useUi, model: m } = window.__hestia;
    editor.load(m.createEmptyProject('Cotas linhas'), 'cotas-linhas.hestia.json');
    editor.store.exec({ type: 'addWall', wall: m.makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
    editor.store.exec({ type: 'addWall', wall: m.makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 6, y: 3 } }) });
    useUi.setState({ selection: [] });
    editor.setTool('dimension');
  });
  await page.waitForTimeout(400);
  await clickWorld(page, 1.7, 0.092);
  await clickWorld(page, 3.3, 3 - 0.092);
  await clickWorld(page, 7, 1.5);
  const d = await dims();
  r.check('uma cota criada', d.length === 1, String(d.length));
  r.check('as duas pontas são wall-line', d[0]?.refs?.a?.feature === 'wall-line' && d[0]?.refs?.b?.feature === 'wall-line', JSON.stringify(d[0]?.refs));
  const [v] = await valor();
  r.check('mede a perpendicular entre faces (2,816 m)', Math.abs(v - 2.816) < 0.002, String(v));
  await page.screenshot({ path: `${OUT}/cl-01-criada.png` });
});

await r.step('(2) mover a parede: a cota acompanha; travada, arrasta a outra', async () => {
  await page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    editor.setTool('select');
    editor.store.exec({ type: 'setWallEnds', id: 'w2', a: { x: 0, y: 4 }, b: { x: 6, y: 4 } });
  });
  const [v1] = await valor();
  r.check('a cota seguiu a parede (3,816 m)', Math.abs(v1 - 3.816) < 0.002, String(v1));
  await page.evaluate(() => {
    const { editor, model } = window.__hestia;
    const d = model.levelDimensions(editor.project, 'lv_0')[0];
    editor.store.exec({ type: 'updateDimension', levelId: 'lv_0', id: d.id, patch: { locked: true, lockedValue: model.dimensionValue(editor.project, d) } });
    editor.store.exec({ type: 'setWallEnds', id: 'w1', a: { x: 0, y: -1 }, b: { x: 6, y: -1 } });
  });
  const [v2] = await valor();
  const y2 = await page.evaluate(() => window.__hestia.editor.project.elements.w2.a.y);
  r.check('travada: valor mantido', Math.abs(v2 - 3.816) < 0.002, String(v2));
  r.check('travada: a outra parede foi junto (y=3)', Math.abs(y2 - 3) < 0.002, String(y2));
});

await r.step('(3) painel de propriedades da cota segue o padrão dos elementos', async () => {
  await page.evaluate(() => {
    const { editor, useUi, model } = window.__hestia;
    const d = model.levelDimensions(editor.project, 'lv_0')[0];
    editor.store.exec({ type: 'updateDimension', levelId: 'lv_0', id: d.id, patch: { locked: undefined, lockedValue: undefined } });
    editor.setTool('select');
    useUi.setState({ selection: [d.id] });
  });
  await page.waitForTimeout(500);
  const grupos = await page.evaluate(() => [...document.querySelectorAll('aside[aria-label="Propriedades"] details.pgroup > summary')].map((s) => s.textContent));
  r.check('grupos Restrições, Dimensões, Texto da cota, Gráficos, Identidade', ['Restrições', 'Dimensões', 'Texto da cota', 'Gráficos', 'Dados de identidade'].every((g) => grupos.includes(g)), grupos.join(' | '));
  const campo = await page.locator('#p-dvalue').count();
  r.check('o valor é editável pelo painel', campo === 1, String(campo));
  await page.screenshot({ path: `${OUT}/cl-03-painel.png` });
});

await r.step('(4) parede inteira com a ferramenta de cota', async () => {
  await page.evaluate(() => {
    const { editor, useUi, model: m } = window.__hestia;
    editor.load(m.createEmptyProject('Parede inteira'), 'parede-inteira.hestia.json');
    editor.store.exec({ type: 'addWall', wall: m.makeWall({ id: 'h', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
    editor.store.exec({ type: 'addWall', wall: m.makeWall({ id: 'v', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 3, y: -2 }, b: { x: 3, y: 2 } }) });
    editor.store.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'h', offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    useUi.setState({ selection: [], options: { ...useUi.getState().options, dimensionPick: 'wall' } });
    editor.setTool('dimension');
  });
  await page.waitForTimeout(400);
  await clickWorld(page, 5, 0);
  await clickWorld(page, 5, -1.2);
  const d = await dims();
  r.check('sequência com pontas, porta e parede cruzada (≥ 4 trechos)', d.length >= 4, String(d.length));
  await page.screenshot({ path: `${OUT}/cl-04-parede-inteira.png` });
});

r.check('sem erros no console do navegador', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(r.summary());
