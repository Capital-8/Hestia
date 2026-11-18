// Pintura de faces no 3D + Estúdio da Face 2D + passagem transparente em parede composta (frente "pintura de faces").
// Roteiro com asserções; código de saída 1 se algo falhar. Precisa de um servidor do app em modo dev (ganchos de depuração):
//   (cd apps/web && npx vite --port 4800 --strictPort) ; HESTIA_URL=http://localhost:4800/ node tests/e2e/pintura-faces.mjs
// Navegador: CHROME_PATH (ex.: /usr/bin/google-chrome) ou o Chromium do sistema usado pelos outros e2e.
import { chromium } from 'playwright-core';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const URL_APP = process.env.HESTIA_URL ?? 'http://localhost:4800/';
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
const texturaResp = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.url().includes('/texturas-basicas/')) texturaResp.push(`${r.status()} ${r.url().split('/').pop()}`); });
const rep = makeReporter();
const check = rep.check.bind(rep);
const H = (fn, arg) => page.evaluate(fn, arg);
const t0 = Date.now();
const lap = (nome) => console.log(`  [tempo] ${nome}: ${((Date.now() - t0) / 1000).toFixed(1)} s desde o início`);

await page.goto(`${URL_APP}?debug=1`);
await page.waitForSelector('.canvas-wrap canvas');
await page.waitForFunction(() => window.__hestia && window.__hestia.model, null, { timeout: 60000 });
await page.waitForTimeout(500);

/** Posição de tela (px) onde o picking 3D devolve a face pedida do elemento; varre o canvas passando o mouse. */
async function acharFace(elementId, face) {
  const box = await page.locator('.canvas-wrap canvas').first().boundingBox();
  for (let y = box.y + 60; y < box.y + box.height - 60; y += 18) {
    for (let x = box.x + 60; x < box.x + box.width - 60; x += 18) {
      await page.mouse.move(x, y);
      const hit = await H(() => window.__hestia.useUi.getState().facePaint.hoverHit);
      if (hit && hit.elementId === elementId && hit.face === face) return { x, y, hit };
    }
  }
  return null;
}

let wallA = null;
let wallB = null;
let compTypeId = null;

await rep.step('projeto em branco com duas paredes (uma composta) e vista 3D', async () => {
  const r = await H(() => {
    const { editor, model } = window.__hestia;
    editor.newProject('blank');
    const p = editor.project;
    const levelId = p.levels[0].id;
    const comp = Object.values(p.wallTypes).find((w) => w.layers && w.layers.length >= 3);
    const simples = p.wallTypes[p.defaults.wallTypeId];
    editor.store.exec({ type: 'addWall', wall: model.makeWall({ id: 'wA', typeId: simples.id, levelId, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
    editor.store.exec({ type: 'addWall', wall: model.makeWall({ id: 'wB', typeId: (comp ?? simples).id, levelId, a: { x: 0, y: 4 }, b: { x: 6, y: 4 } }) });
    editor.setView('3d');
    const s = window.__hestia.useUi.getState();
    if (!s.openViews.some((v) => v.kind === '3d')) window.__hestia.useUi.setState({ openViews: [...s.openViews, { kind: '3d' }] });
    return { levelId, simples: simples.id, comp: comp?.id ?? null, camadas: (comp ?? simples).layers.length };
  });
  compTypeId = r.comp;
  wallA = 'wA';
  wallB = 'wB';
  check('parede composta (>= 3 camadas) existe no projeto', r.comp !== null, JSON.stringify(r));
  await page.waitForFunction(() => window.__hestia3dModel && window.__hestia3dMontagem, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const n = await H(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'wall').length);
  check('duas paredes no modelo', n === 2, n);
  lap('projeto e 3D');
});

await rep.step('botões Pintar face e Estúdio da face existem na faixa (Modificar, 3D)', async () => {
  const pintar = page.locator('button[title*="Pintar face"], button:has-text("Pintar face")');
  const estudio = page.locator('button[title*="Estúdio da face"], button:has-text("Estúdio da face")');
  check('botão Pintar face (3D) visível', (await pintar.count()) >= 1 && (await pintar.first().isVisible()), await pintar.count());
  check('botão Estúdio da face (2D) visível', (await estudio.count()) >= 1 && (await estudio.first().isVisible()), await estudio.count());
});

await rep.step('Pintar Face: pinta a face externa da parede com textura basica:*', async () => {
  await page.locator('button[title*="Pintar face"], button:has-text("Pintar face")').first().click();
  await page.waitForTimeout(300);
  const ativo = await H(() => { const f = window.__hestia.useUi.getState().facePaint; return { active: f.active, mode: f.mode }; });
  check('modo pintura ativo', ativo.active === true && ativo.mode === 'paint', JSON.stringify(ativo));
  // material com textura básica (Madeira Cumaru -> basica:Wood026)
  await page.locator('#opt-fp-material').selectOption('mat_cumaru');
  const mat = await H(() => ({ id: window.__hestia.useUi.getState().facePaint.materialId, tex: window.__hestia.editor.project.materials.mat_cumaru?.aparencia?.textura?.imagemId }));
  check('material escolhido tem textura basica:Wood026', mat.id === 'mat_cumaru' && mat.tex === 'basica:Wood026', JSON.stringify(mat));
  let achou = await acharFace(wallA, 'sideExt');
  if (!achou) {
    // a câmera padrão pode ver a outra face: gira a órbita meia volta e tenta de novo
    await H(() => { const o = window.__hestia3d; if (o?.azimuth !== undefined) o.azimuth += Math.PI; else if (o?.theta !== undefined) o.theta += Math.PI; });
    await page.waitForTimeout(500);
    achou = await acharFace(wallA, 'sideExt');
  }
  check('picking 3D acha a face externa da parede A', achou !== null, achou ? `${Math.round(achou.x)},${Math.round(achou.y)}` : 'não achou');
  if (!achou) return;
  await page.mouse.move(achou.x, achou.y);
  await page.mouse.click(achou.x, achou.y);
  await page.waitForTimeout(600);
  const fp = await H(() => window.__hestia.editor.project.elements.wA.facePaints ?? null);
  check('facePaints da parede A tem a face externa com cumaru', Array.isArray(fp) && fp.some((e) => e.face === 'sideExt' && e.layer === 'all' && e.materialId === 'mat_cumaru'), JSON.stringify(fp));
  // 3D: lote pintado com a textura (o mapa pode chegar depois do download do .webp)
  await page.waitForFunction(() => {
    let ok = false;
    window.__hestia3dModel.scene.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.map && o.material.color?.getHexString?.() !== undefined && o.userData?.kind === 'wall') ok = true; });
    return ok;
  }, null, { timeout: 20000 }).catch(() => {});
  const lotes = await H(() => {
    const out = [];
    window.__hestia3dModel.scene.traverse((o) => {
      if (o.isMesh && o.userData?.kind === 'wall' && o.material && !Array.isArray(o.material)) out.push({ cor: o.material.color?.getHexString?.(), mapa: !!o.material.map, opac: o.material.opacity });
    });
    return out;
  });
  check('3D tem lote de parede com cor do cumaru (683817)', lotes.some((l) => l.cor === '683817'), JSON.stringify(lotes));
  check('lote pintado recebeu o mapa de textura', lotes.some((l) => l.cor === '683817' && l.mapa), JSON.stringify(lotes));
  check('arquivo /texturas-basicas/Wood026.webp servido (200)', texturaResp.some((r) => r === '200 Wood026.webp'), texturaResp.join(', '));
  lap('pintar face');
});

await rep.step('desfazer e refazer da pintura', async () => {
  await H(() => window.__hestia.editor.undo());
  const a = await H(() => window.__hestia.editor.project.elements.wA.facePaints ?? null);
  check('desfazer remove a pintura', !a || a.length === 0, JSON.stringify(a));
  await H(() => window.__hestia.editor.redo());
  const b = await H(() => window.__hestia.editor.project.elements.wA.facePaints ?? null);
  check('refazer devolve a pintura', Array.isArray(b) && b.length === 1 && b[0].materialId === 'mat_cumaru', JSON.stringify(b));
});

await rep.step('Estúdio da Face: abre a vista face:... pelo botão e desenha uma região retangular', async () => {
  await page.keyboard.press('Escape');
  await page.locator('button[title*="Estúdio da face"], button:has-text("Estúdio da face")').first().click();
  await page.waitForTimeout(300);
  const modo = await H(() => window.__hestia.useUi.getState().facePaint.mode);
  check('modo studioPick ativo', modo === 'studioPick', modo);
  const achou = await acharFace(wallA, 'sideExt');
  check('picking acha a face externa da parede A', achou !== null);
  if (!achou) return;
  await page.mouse.click(achou.x, achou.y);
  await page.waitForTimeout(800);
  const v = await H(() => { const s = window.__hestia.useUi.getState(); return { view: s.view, faceView: s.faceView, abas: s.openViews.filter((o) => o.kind === 'face').length }; });
  check('vista ativa é a face', v.view === 'face' && v.faceView?.elementId === 'wA' && v.faceView?.face === 'sideExt', JSON.stringify(v));
  check('aba de face aberta (chave face:wA:sideExt:all)', v.abas === 1);
  await page.waitForSelector('.fs-canvas-wrap canvas', { timeout: 15000 });
  // ferramenta de forma: retângulo; arrasta no canvas
  await H(() => window.__hestia.useUi.setState((s) => ({ faceStudio: { ...s.faceStudio, tool: 'shape', shape: 'rect', asBand: false, activeMaterialId: 'mat_cumaru', snapGrid: false } })));
  const box = await page.locator('.fs-canvas-wrap canvas').first().boundingBox();
  const x0 = box.x + box.width * 0.4, y0 = box.y + box.height * 0.4, x1 = box.x + box.width * 0.55, y1 = box.y + box.height * 0.6;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
  await page.mouse.move(x1, y1, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  let reg = await H(() => (window.__hestia.editor.project.elements.wA.facePaints ?? []).flatMap((e) => (e.regions ?? []).map((r) => ({ ...r, __face: e.face }))));
  if (reg.length === 0) {
    // alguns modos pedem clique-clique em vez de arraste
    await page.mouse.click(x0, y0);
    await page.mouse.click(x1, y1);
    await page.waitForTimeout(600);
    reg = await H(() => (window.__hestia.editor.project.elements.wA.facePaints ?? []).flatMap((e) => (e.regions ?? []).map((r) => ({ ...r, __face: e.face }))));
  }
  check('uma região retangular criada na face externa', reg.length === 1 && reg[0].shape?.kind === 'rect', JSON.stringify(reg));
  if (reg.length !== 1) return;
  const s = reg[0].shape;
  const area = Math.abs(s.u1 - s.u0) * Math.abs(s.v1 - s.v0);
  check('área do retângulo é positiva', area > 0, area);
  // área pintada no painel (formatQuantity) e no levantamento (engine)
  const painel = await page.locator('text=/Área pintada/').first().locator('xpath=..').innerText().catch(() => '');
  console.log(`  painel: ${JSON.stringify(painel)}`);
  const lev = await H(() => {
    const { editor, resolveLevel, quantifyLevel } = window.__hestia;
    const p = editor.project;
    const r = resolveLevel(p, p.levels[0].id);
    const q = quantifyLevel(p, r);
    return q.faceAreaByMaterial;
  });
  console.log(`  levantamento faceAreaByMaterial: ${JSON.stringify(lev)}`);
  const mm = /([\d.]+,\d+|\d+)\s*m²/.exec(painel);
  const lido = mm ? Number(mm[1].replace(/\./g, '').replace(',', '.')) : NaN;
  const quant = await H((a) => window.__hestia.model.formatQuantity(window.__hestia.model.unitsOf(window.__hestia.editor.project), 'area', a, { lang: 'pt' }), area).catch(() => null);
  console.log(`  área esperada (formatQuantity): ${quant}`);
  check('painel mostra a área pintada = área do retângulo (formatQuantity)', Number.isFinite(lido) && Math.abs(lido - area) < Math.max(0.011, area * 0.02), `${lido} x ${area}`);
  const wood = lev.mat_cumaru ?? 0;
  check('levantamento: área do cumaru >= área da região (face inteira pintada + região)', wood >= area - 1e-6, `${wood} x ${area}`);
  lap('estúdio da face');
});

await rep.step('desfazer e refazer da região desenhada', async () => {
  const n0 = await H(() => (window.__hestia.editor.project.elements.wA.facePaints ?? []).flatMap((e) => e.regions ?? []).length);
  await H(() => window.__hestia.editor.undo());
  const n1 = await H(() => (window.__hestia.editor.project.elements.wA.facePaints ?? []).flatMap((e) => e.regions ?? []).length);
  await H(() => window.__hestia.editor.redo());
  const n2 = await H(() => (window.__hestia.editor.project.elements.wA.facePaints ?? []).flatMap((e) => e.regions ?? []).length);
  check('desfazer tira a região e refazer devolve', n0 === 1 && n1 === 0 && n2 === 1, `${n0}/${n1}/${n2}`);
});

await rep.step('ida e volta: facePaints sobrevive a salvar e abrir', async () => {
  const r = await H(async () => {
    const { editor, model } = window.__hestia;
    const txt = model.serializeProject ? model.serializeProject(editor.project) : JSON.stringify(editor.project);
    const volta = model.migrateProject(JSON.parse(txt));
    return { antes: JSON.stringify(editor.project.elements.wA.facePaints), depois: JSON.stringify(volta.elements.wA.facePaints), versao: volta.schemaVersion };
  });
  check('facePaints idêntico depois de salvar e abrir', r.antes === r.depois && r.antes !== undefined, `${r.antes?.length}/${r.depois?.length} v${r.versao}`);
});

await rep.step('parede composta + material transparente (passagem translúcida)', async () => {
  await H(() => window.__hestia.editor.setView('3d'));
  await page.waitForTimeout(800);
  const antes = await H(() => {
    let tr = 0;
    window.__hestia3dModel.scene.traverse((o) => { if (o.isMesh && o.userData?.kind === 'wall' && o.material && !Array.isArray(o.material) && o.material.transparent && o.material.opacity < 0.99) tr++; });
    return tr;
  });
  await H(() => {
    window.__hestia.editor.store.exec({ type: 'setFacePaint', elementId: 'wB', entry: { face: 'sideExt', layer: 'all', materialId: 'mat_vidro_fume' } });
  });
  await page.waitForTimeout(1500);
  const depois = await H(() => {
    const mats = [];
    window.__hestia3dModel.scene.traverse((o) => { if (o.isMesh && o.userData?.kind === 'wall' && o.material && !Array.isArray(o.material)) mats.push({ cor: o.material.color?.getHexString?.(), tr: !!o.material.transparent, op: o.material.opacity }); });
    return mats;
  });
  const translucidos = depois.filter((m) => m.tr && m.op < 0.99);
  check('antes: nenhum lote translúcido de parede', antes === 0, antes);
  check('depois: existe lote translúcido (vidro fumê, opacidade 0,45)', translucidos.length >= 1 && translucidos.some((m) => Math.abs(m.op - 0.45) < 0.02), JSON.stringify(translucidos));
  const camadasOpacas = depois.filter((m) => !m.tr || m.op >= 0.99).length;
  check('camadas internas continuam presentes (opacas) atrás do vidro', camadasOpacas >= 2, camadasOpacas);
  lap('parede transparente');
});

await rep.step('sem erros no console', async () => {
  const relevantes = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/i.test(e));
  check('console sem erros', relevantes.length === 0, relevantes.slice(0, 3).join(' | '));
});

rep.summary();
console.log(`  [tempo total] ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await browser.close();
process.exit(rep.steps.some((s) => s.status !== 'PASS') ? 1 : 0);
