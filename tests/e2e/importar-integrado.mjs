import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * Importar móvel integrado (branch teste/0.2.5-com-moveis): botão da faixa Inserir ATIVO, importa um .glb (cilindro) e um
 * .obj (caixa) gerados em código, coloca na planta pela ferramenta, gira com R, mede planta (contorno real), 3D e orçamento.
 * Uso: APP='http://127.0.0.1:4500/?gl=1&debug=1&perf=1&overlay=0' node tests/e2e/importar-integrado.mjs
 */
const URL_APP = process.env.APP ?? 'http://127.0.0.1:4500/?gl=1&debug=1&perf=1&overlay=0';
const exe = ['/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} @ ${m.location().url}`));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()));
let passos = 0;
const ok = (nome, extra = '') => console.log(`ok ${++passos} ${nome}${extra ? ` ${extra}` : ''}`);

/** Cilindro (raio 0.25 m, altura 0.8 m, 24 lados, eixo Y para cima como no glTF) em GLB binário. */
function glbCilindro(lados = 24) {
  const pos = [], idx = [];
  const r = 0.25, h = 0.8;
  for (let i = 0; i < lados; i++) {
    const a = (2 * Math.PI * i) / lados;
    pos.push(r * Math.cos(a), 0, r * Math.sin(a), r * Math.cos(a), h, r * Math.sin(a));
  }
  pos.push(0, 0, 0, 0, h, 0);
  const c0 = lados * 2, c1 = c0 + 1;
  for (let i = 0; i < lados; i++) {
    const j = (i + 1) % lados;
    idx.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1, c1, i * 2 + 1, j * 2 + 1, c0, j * 2, i * 2);
  }
  const P = new Float32Array(pos), I = new Uint16Array(idx);
  const pb = Buffer.from(P.buffer), ib = Buffer.from(I.buffer);
  const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const bin = Buffer.concat([pad(pb), pad(ib)]);
  const mn = [-r, 0, -r], mx = [r, h, r];
  const json = {
    asset: { version: '2.0' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'cilindro' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: 'verde', pbrMetallicRoughness: { baseColorFactor: [0.1, 0.6, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pb.length }, { buffer: 0, byteOffset: pad(pb).length, byteLength: ib.length }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5123, count: I.length, type: 'SCALAR' },
    ],
  };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, tipo) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(tipo, 4, 'latin1'); return b; };
  return { buf: Buffer.concat([head, ch(js.length, 'JSON'), js, ch(bin.length, 'BIN\0'), bin]), tri: lados * 4 };
}
/** Caixa 0.6 x 0.4 x 0.5 m em OBJ (Y para cima). */
function objCaixa() {
  const [a, b, c] = [0.6, 0.5, 0.4];
  const v = [[0, 0, 0], [a, 0, 0], [a, 0, c], [0, 0, c], [0, b, 0], [a, b, 0], [a, b, c], [0, b, c]];
  const f = [[1, 2, 3], [1, 3, 4], [5, 8, 7], [5, 7, 6], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 8], [3, 8, 4], [4, 8, 5], [4, 5, 1]];
  return Buffer.from(`o caixa\n${v.map((p) => `v ${p.join(' ')}`).join('\n')}\n${f.map((t) => `f ${t.join(' ')}`).join('\n')}\n`);
}

const snap = () => page.evaluate(() => window.__hestiaPerf?.snapshot());
const moveis = () => page.evaluate(() => {
  const p = window.__hestia.editor.project;
  return {
    assets: Object.values(p.furniture?.assets ?? {}).map((a) => ({ id: a.id, name: a.name, fmt: a.sourceFormat, tri: a.stats.triangles, bbox: a.bbox })),
    inst: Object.values(p.elements).filter((e) => e.kind === 'furniture').map((e) => ({ id: e.id, assetId: e.assetId, x: e.x, y: e.y, z: e.z, rot: e.rotation, scale: e.scale })),
  };
});

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
  await page.evaluate(() => { const { editor, useUi } = window.__hestia; editor.newProject('house2'); useUi.setState({ tela: 'editor' }); });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(1500);

  // 1. botão da faixa Inserir: existe e está ativo (não `soon`, não disabled)
  await page.locator('.rtab:visible', { hasText: /^(Inserir|Insert)$/ }).first().click();
  const botao = page.locator('.rb-btn:visible', { hasText: /Importar móvel|Import furniture/ }).first();
  await botao.waitFor({ timeout: 20_000 });
  const dis = await botao.evaluate((b) => ({ disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', soon: /soon/.test(b.className) }));
  assert.equal(dis.disabled, false, 'botão Importar móvel ativo');
  ok('faixa Inserir: botão "Importar móvel" ativo', JSON.stringify(dis));
  await botao.click();
  await page.waitForSelector('[data-testid=fur-file]', { timeout: 20_000 });
  const accept = await page.locator('[data-testid=fur-file]').getAttribute('accept');
  for (const e of ['.skp', '.glb', '.gltf', '.obj', '.dae', '.fbx', '.zip']) assert.ok(accept.includes(e), `aceita ${e}`);
  const multiplo = await page.locator('[data-testid=fur-file]').getAttribute('multiple');
  ok('diálogo abre; seletor aceita', `${accept} multiple=${multiplo !== null} (um arquivo por vez; vários arquivos = .zip)`);

  // 2. importar o .glb (Worker) e medir o tempo
  const glb = glbCilindro();
  const t0 = Date.now();
  await page.locator('[data-testid=fur-file]').setInputFiles({ name: 'cilindro.glb', mimeType: 'model/gltf-binary', buffer: glb.buf });
  await page.waitForSelector('[data-testid=fur-ready]', { timeout: 120_000 });
  const msImport = Date.now() - t0;
  await page.locator('[data-testid=fur-add-place]').click();
  await page.waitForFunction(() => Object.keys(window.__hestia.editor.project.furniture?.assets ?? {}).length === 1, null, { timeout: 120_000 });
  const msTotal = Date.now() - t0;
  await page.waitForTimeout(300);
  let m = await moveis();
  assert.equal(m.assets.length, 1);
  assert.equal(m.assets[0].fmt, 'glb');
  assert.equal(m.assets[0].tri, glb.tri, 'triângulos do cilindro');
  const tool = await page.evaluate(() => window.__hestia.useUi.getState().tool);
  assert.equal(tool, 'furniture', 'Adicionar e colocar ativa a ferramenta');
  ok('cilindro.glb importado e ferramenta ativa', `leitura ${msImport} ms, até gravar ${msTotal} ms, ${m.assets[0].tri} tri, bbox ${JSON.stringify(m.assets[0].bbox)}`);

  // 3. colocar na planta: clique no canvas
  await page.evaluate(() => window.__hestia.useUi.setState({ view: 'plan' }));
  await page.waitForTimeout(800);
  const box = await page.locator('.canvas-wrap canvas').first().boundingBox();
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(200);
  await page.keyboard.press('r');
  await page.mouse.move(cx + 3, cy + 3);
  await page.mouse.click(cx + 3, cy + 3);
  await page.waitForTimeout(600);
  m = await moveis();
  assert.equal(m.inst.length, 1, 'uma instância colocada');
  const rot = m.inst[0].rot;
  assert.ok(Math.abs(Math.abs(rot) - Math.PI / 2) < 1e-6, `R girou 90° (${rot})`);
  ok('colocado por clique, R girou', JSON.stringify(m.inst[0]));

  // 4. planta: contorno real (mais de 4 vértices para o cilindro)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const poly = await page.evaluate(() => [...document.querySelectorAll('[data-testid=furniture-plan] polygon')].map((p) => p.getAttribute('points').trim().split(/\s+/).length));
  assert.ok(poly.length >= 1 && poly[0] > 8, `contorno do cilindro tem ${poly[0]} vértices`);
  ok('planta: contorno da projeção da malha', `vértices ${JSON.stringify(poly)}`);

  // 5. caixa .obj pelo botão Importar da paleta Biblioteca
  await page.evaluate(() => window.__hestia.useUi.setState({ tool: 'select' }));
  await page.locator('.rtab:visible', { hasText: /^(Arquitetura|Architecture)$/ }).first().click();
  await page.locator('.rb-btn:visible', { hasText: /^Biblioteca$|^Library$/ }).first().click();
  const pal = page.locator('[data-testid=pal-importar]');
  if (await pal.count()) {
    await pal.click();
    ok('paleta Biblioteca: botão Importar abre o diálogo');
  } else {
    await page.evaluate(() => window.__hestia.useUi.setState({ dialog: 'importFurniture', dialogArg: null }));
    console.log('aviso: paleta não encontrada pela faixa; diálogo aberto por estado');
  }
  await page.waitForSelector('[data-testid=fur-file]');
  await page.locator('[data-testid=fur-file]').setInputFiles({ name: 'caixa.obj', mimeType: 'text/plain', buffer: objCaixa() });
  await page.waitForSelector('[data-testid=fur-ready]', { timeout: 120_000 });
  await page.locator('[data-testid=fur-add]').click();
  await page.waitForSelector('[data-testid=fur-blocks]', { timeout: 60_000 });
  await page.evaluate(() => window.__hestia.useUi.setState({ dialog: null, dialogArg: null }));
  m = await moveis();
  assert.equal(m.assets.length, 2);
  const caixa = m.assets.find((a) => a.fmt === 'obj');
  assert.equal(caixa.tri, 12);
  ok('caixa.obj importada', JSON.stringify(caixa.bbox));

  // 6. mover/copiar pelo transform e apagar/desfazer
  const inst = m.inst[0].id;
  await page.evaluate((id) => {
    const { editor } = window.__hestia;
    editor.store.exec({ type: 'transform', ids: [id], transform: { kind: 'translate', d: { x: 1, y: 0.5 } } });
  }, inst);
  const mv = (await moveis()).inst[0];
  assert.ok(Math.abs(mv.x - (m.inst[0].x + 1)) < 1e-9 && Math.abs(mv.y - (m.inst[0].y + 0.5)) < 1e-9, 'transform moveu');
  await page.evaluate((id) => window.__hestia.editor.store.exec({ type: 'transform', ids: [id], transform: { kind: 'translate', d: { x: 2, y: 0 } }, copy: { idMap: { [id]: 'fuCopia' } } }), inst);
  assert.equal((await moveis()).inst.length, 2, 'cópia pelo transform');
  await page.evaluate(() => window.__hestia.editor.store.exec({ type: 'deleteFurniture', id: 'fuCopia' }));
  assert.equal((await moveis()).inst.length, 1);
  await page.evaluate(() => window.__hestia.editor.store.undo());
  assert.equal((await moveis()).inst.length, 2, 'desfazer volta a cópia');
  ok('mover, copiar, apagar, desfazer');

  // 7. 3D: triângulos do quadro com e sem os móveis
  await page.evaluate(() => window.__hestia.useUi.setState({ view: '3d' }));
  await page.waitForTimeout(3000);
  const com = (await snap()).quadro;
  await page.evaluate(() => { const { editor } = window.__hestia; editor.store.exec({ type: 'deleteElements', ids: Object.values(editor.project.elements).filter((e) => e.kind === 'furniture').map((e) => e.id) }); });
  await page.waitForTimeout(2500);
  const sem = (await snap()).quadro;
  assert.ok(com.triangulos - sem.triangulos >= 2 * glb.tri, `3D soma ${com.triangulos - sem.triangulos} triângulos (esperado >= ${2 * glb.tri})`);
  await page.evaluate(() => window.__hestia.editor.store.undo());
  await page.waitForTimeout(1500);
  ok('3D: móveis desenhados', `${com.triangulos} com / ${sem.triangulos} sem; draw calls ${com.drawCalls}/${sem.drawCalls}`);

  // 8. orçamento de triângulos
  const orc = await page.evaluate(async (raiz) => {
    const mod = await import(/* @vite-ignore */ `/@fs${raiz}/packages/render/src/index.ts`);
    return mod.furnitureViewBudget(window.__hestia.editor.project);
  }, process.cwd());
  assert.equal(orc.excede, false);
  ok('orçamento de triângulos da vista', JSON.stringify(orc));

  // 9. contorno de corte? relatório: a seção do projeto com móvel importado
  const secao = await page.evaluate(() => {
    const { editor } = window.__hestia;
    return { views: editor.project.views.length };
  });
  console.log('vistas de corte no projeto de teste:', JSON.stringify(secao));

  assert.deepEqual(errors.filter((e) => !/favicon|WebGL|GPU stall|swiftshader/i.test(e)), [], 'sem erros no console');
  ok('sem erros de console');
} catch (e) {
  console.error('FALHA', e);
  console.error('DIALOGO:', (await page.locator('.modal, [role=dialog]').allInnerTexts().catch(() => [])).join(' | ').slice(0, 600));
  console.error(errors.slice(0, 10));
  process.exitCode = 1;
} finally {
  await browser.close();
}
