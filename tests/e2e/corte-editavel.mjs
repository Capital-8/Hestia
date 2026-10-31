import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Edição no corte: ferramentas não voltam à planta, medir/cota/texto funcionam em (t,z), o Nível (LL) cria nível
 * com extensões e o Mover altera a parede no plano com um undo.
 */
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('dialog', (d) => d.dismiss());
try {
  await page.goto(pathToFileURL(path.resolve('apps/web/dist/index.html')).href + '?gl=1&debug=1');
  await page.waitForFunction(() => window.__hestia);
  await page.evaluate(() => {
    const { editor } = window.__hestia;
    editor.newProject('house2');
    editor.store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte A', kind: 'section', a: { x: -2, y: 2 }, b: { x: 9, y: 2 }, depth: 6 } });
    editor.openSection('sv1');
  });
  await page.waitForTimeout(800);
  const box = await page.locator('canvas').boundingBox();
  assert.ok(box && box.width > 10, 'canvas do corte visível');
  const click = (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  const state = () => page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    const p = editor.project;
    return {
      tool: useUi.getState().tool,
      view: useUi.getState().view,
      status: useUi.getState().status,
      levels: p.levels.length,
      vp: !!editor.viewport(),
      annotations: p.views.find((v) => v.id === 'sv1')?.annotations,
      extents: p.views.find((v) => v.id === 'sv1')?.levelExtents,
    };
  });
  assert.equal((await state()).view, 'section');
  assert.equal((await state()).vp, true);
  const cursor = () => page.locator('.canvas-wrap').evaluate((el) => getComputedStyle(el).cursor);
  assert.equal(await cursor(), 'default', 'cursor de seleção no corte, sem mão');

  // Ferramenta Medir permanece no corte e mede em (t,z).
  await page.keyboard.press('m');
  await page.keyboard.press('e');
  await page.waitForTimeout(80);
  assert.equal((await state()).tool, 'measure');
  assert.equal(await cursor(), 'crosshair', 'cursor de desenho no corte');
  await click(0.35, 0.55);
  await click(0.65, 0.55);

  // Cota persistente.
  await page.keyboard.press('d');
  await page.keyboard.press('i');
  await page.waitForTimeout(80);
  await click(0.35, 0.5);
  await click(0.65, 0.5);
  await click(0.5, 0.42);
  await page.waitForTimeout(200);
  assert.equal((await state()).annotations.dimensions.length, 1, 'cota no corte');

  // Texto persistente (Esc encerra a ferramenta sem fechar a vista).
  await page.keyboard.press('t');
  await page.keyboard.press('x');
  await page.waitForTimeout(80);
  await click(0.5, 0.6);
  await page.keyboard.type('Teste corte');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert.equal((await state()).annotations.texts.length, 1, 'texto no corte');
  await page.keyboard.press('Escape');
  assert.equal((await state()).view, 'section', 'Esc da ferramenta não fecha o corte');

  // Alça de peitoril: selecionar uma janela e arrastar a base para cima.
  const opening = await page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    const sec = editor.sectionOf('sv1');
    const o = sec.openings.find((x) => x.kind === 'window');
    if (!o) return null;
    editor.setTool('select');
    useUi.setState({ selection: [o.openingId] });
    const v = editor.viewport();
    let minY = Infinity, minX = Infinity, maxX = -Infinity;
    for (const poly of o.polygons) for (const ring of poly) for (const p of ring) {
      minY = Math.min(minY, p.y); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    }
    return { id: o.openingId, minY, minX, maxX, v };
  });
  assert.ok(opening, 'janela visível no corte');
  const sx = (x) => (x - opening.v.cx) * opening.v.zoom + opening.v.width / 2;
  const sy = (y) => opening.v.height / 2 - (y - opening.v.cy) * opening.v.zoom;
  const hx = box.x + sx((opening.minX + opening.maxX) / 2);
  const hy = box.y + sy(opening.minY);
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx, hy - 25, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  assert.equal((await state()).status.includes('Peitoril atualizado'), true, 'peitoril editado pela alça');

  // Nível LL: nível + extensões na vista, no mesmo undo.
  const beforeLevels = (await state()).levels;
  await page.keyboard.press('l');
  await page.keyboard.press('l');
  await page.waitForTimeout(80);
  assert.equal((await state()).tool, 'level');
  await click(0.3, 0.55);
  await click(0.7, 0.55);
  await page.waitForTimeout(300);
  const levelState = await state();
  assert.equal(levelState.levels, beforeLevels + 1, 'nível criado');
  assert.equal(Object.keys(levelState.extents ?? {}).length, 1, 'extensão do nível gravada');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hestia.editor.store.undo());
  await page.waitForTimeout(100);

  // Mover parede selecionada no corte (horizontal = direção da linha).
  const wall = await page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    const w = Object.values(editor.project.elements).find((e) => e.kind === 'wall');
    editor.setTool('select');
    useUi.setState({ selection: [w.id] });
    editor.setTool('move');
    return { id: w.id, a: w.a, b: w.b };
  });
  await page.waitForTimeout(80);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const moved = await page.evaluate((id) => window.__hestia.editor.project.elements[id], wall.id);
  assert.notDeepEqual(moved.a, wall.a, 'parede moveu no corte');
  await page.evaluate(() => window.__hestia.editor.store.undo());
  const undone = await page.evaluate((id) => window.__hestia.editor.project.elements[id], wall.id);
  assert.deepEqual(undone.a, wall.a, 'undo volta a parede');

  // A mão só aparece no pan; ao soltar, a vista volta ao cursor de seleção.
  await page.evaluate(() => window.__hestia.editor.setTool('select'));
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 5 });
  assert.equal(await cursor(), 'grabbing', 'mão durante o pan');
  await page.mouse.up();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.waitForTimeout(80);
  assert.equal(await cursor(), 'default', 'cursor de seleção depois do pan');

  assert.deepEqual(errors, [], 'sem erros de console/página');
  console.log('OK corte-editavel: medir, cota, texto, nivel LL, mover e undo');
} finally {
  await browser.close();
}
