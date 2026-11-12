// Mede, no Chrome real, a camada própria do guarda-corpo na planta: editar uma parede com o guarda-corpo ligado não pode recalcular o
// guarda-corpo (conta as chamadas a `planta` do kernel), e ligar/editar o guarda-corpo não refaz o resto da planta.
//   URL=http://localhost:5183 CHROME_PATH=... node tests/e2e/gc-planta-tempo.mjs
import { chromium } from 'playwright-core';
import path from 'node:path';
import { CHROME_ARGS, chromeExecutable } from './helpers.mjs';

const URL_ = process.env.URL ?? 'http://localhost:5183';
const FIXTURE = path.resolve('packages/engine/src/fixtures/casa-2-quartos.hestia.json');
const browser = await chromium.launch({ executablePath: chromeExecutable() ?? process.env.CHROME_PATH, args: CHROME_ARGS, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
await page.goto(`${URL_}/?debug=1`);
await page.waitForFunction(() => window.__hestia?.servicoGuardaCorpo, null, { timeout: 60000 });
await page.getByText('Novo projeto').first().click().catch(() => {});
await page.waitForSelector('#file-open', { state: 'attached', timeout: 60000 });
await page.setInputFiles('#file-open', FIXTURE);
await page.waitForFunction(() => window.__hestia.editor.fileName === 'casa-2-quartos.hestia.json');
await page.waitForTimeout(1500);
const root = process.cwd().split(String.fromCharCode(92)).join('/');
await page.evaluate(async ({ root }) => {
  const { editor, model: m } = window.__hestia;
  const g = await import(/* @vite-ignore */ `/@fs/${root}/packages/engine/src/stairGenerators.ts`);
  const p = editor.project;
  const base = p.levels[0], topo = p.levels[1];
  const sk = g.generateLShape({ start: { x: 30, y: 30 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.28, risersFirst: 9, risersSecond: 9 });
  const comps = sk.map((x, k) => (x.kind === 'run' ? { id: `c${k}`, kind: 'run', ...x.run } : { id: `c${k}`, kind: 'landing', ...x.landing }));
  editor.store.exec({ type: 'addStair', stair: m.makeStair({ id: 'st_bench', typeId: m.defaultStairTypeId, levelId: base.id, topLevelId: topo?.id, components: comps }) });
}, { root });
await page.evaluate(() => { window.__hestia.useUi.setState({ selection: [], view: 'plan' }); });
await page.waitForTimeout(3000);
await page.evaluate(() => window.__hestia.useUi.setState({ selection: ['st_bench'] }));
await page.waitForSelector('#p-sgc');
await page.waitForTimeout(500);
await page.evaluate(() => {
  const s = window.__hestia.servicoGuardaCorpo();
  window.__chamadasPlanta = 0;
  const orig = s.planta.bind(s);
  s.planta = (...a) => { window.__chamadasPlanta++; return orig(...a); };
});
const quadros = () => page.evaluate(() => new Promise((r) => { const t0 = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - t0))); }));
// Liga o guarda-corpo (clique real) e mede até dois quadros.
const ligar = await page.evaluate(() => new Promise((resolve) => {
  const box = document.querySelector('#p-sgc');
  box.addEventListener('click', () => {
    const t0 = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0)));
  }, { capture: true, once: true });
  box.click();
}));
await page.waitForTimeout(1500);
const aposLigar = await page.evaluate(() => window.__chamadasPlanta);
// Edita uma parede do térreo (arrasta a ponta em 1 cm) com o guarda-corpo ligado.
const editar = await page.evaluate(() => new Promise((resolve) => {
  const { editor } = window.__hestia;
  const w = Object.values(editor.project.elements).find((e) => e.kind === 'wall' && e.levelId === editor.project.levels[0].id);
  const t0 = performance.now();
  editor.store.exec({ type: 'updateElements', ids: [w.id], patch: { b: { x: w.b.x + 0.01, y: w.b.y } } });
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0)));
}));
await page.waitForTimeout(1500);
const aposEditar = await page.evaluate(() => window.__chamadasPlanta);
console.log(`[CHROME plan] ligar guarda-corpo: ${ligar.toFixed(0)} ms | editar parede (guarda-corpo ligado): ${editar.toFixed(0)} ms | chamadas ao kernel ao ligar: ${aposLigar} | chamadas ao editar parede: ${aposEditar - aposLigar} (meta: 0)`);
if (erros.length) console.log('erros:', erros.slice(0, 3));
await browser.close();
