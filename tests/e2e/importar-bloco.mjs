import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * Importador de blocos de ponta a ponta no navegador. Tudo é gerado em código (nenhum arquivo baixado):
 *  1. um cubo de 1 x 1 x 1 m em OBJ (12 triângulos) entra pelo diálogo "Importar móvel" (input de arquivo);
 *  2. confere por dados o asset (malha, caixa, triângulos), a instância (posição, escala) e a planta (overlay);
 *  3. o 3D mostra os triângulos do móvel (contadores `__hestiaPerf`);
 *  4. salvar (serializeProject) e reabrir (migrateProject) volta idêntico;
 *  5. 200 instâncias de um bloco de ~2.000 triângulos (esfera UV em OBJ): mede tempo e draw calls no 3D.
 * Uso: APP='http://127.0.0.1:4197/?gl=1&debug=1&perf=1&overlay=0' node tests/e2e/importar-bloco.mjs
 */
const URL_APP = process.env.APP ?? 'http://127.0.0.1:4197/?gl=1&debug=1&perf=1&overlay=0';
const exe = ['/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} @ ${m.location().url}`));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()));
let passos = 0;
const ok = (nome, extra = '') => console.log(`ok ${++passos} ${nome}${extra ? ` ${extra}` : ''}`);

/** Cubo 1 x 1 x 1 m (Z para cima no app; o OBJ é Y para cima e o importador reorienta pelo padrão). */
function objCubo() {
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const f = [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]];
  return Buffer.from(`o cubo\n${v.map((p) => `v ${p.join(' ')}`).join('\n')}\n${f.map((t) => `f ${t.join(' ')}`).join('\n')}\n`);
}
/** Esfera UV com `faixas` x `setores` (triângulos = 2 * setores * (faixas - 1)); 32 x 33 = 2.016 triângulos. */
function objEsfera(faixas, setores) {
  const L = ['o esfera'];
  L.push('v 0 1 0');
  for (let i = 1; i < faixas; i++) {
    const th = (Math.PI * i) / faixas;
    for (let j = 0; j < setores; j++) {
      const ph = (2 * Math.PI * j) / setores;
      L.push(`v ${(0.2 * Math.sin(th) * Math.cos(ph)).toFixed(5)} ${(0.2 * Math.cos(th)).toFixed(5)} ${(0.2 * Math.sin(th) * Math.sin(ph)).toFixed(5)}`);
    }
  }
  L.push('v 0 -1 0');
  const idx = (i, j) => 2 + (i - 1) * setores + (((j % setores) + setores) % setores);
  let tri = 0;
  for (let j = 0; j < setores; j++) { L.push(`f 1 ${idx(1, j + 1)} ${idx(1, j)}`); tri++; }
  for (let i = 1; i < faixas - 1; i++) {
    for (let j = 0; j < setores; j++) {
      L.push(`f ${idx(i, j)} ${idx(i, j + 1)} ${idx(i + 1, j + 1)}`, `f ${idx(i, j)} ${idx(i + 1, j + 1)} ${idx(i + 1, j)}`);
      tri += 2;
    }
  }
  const last = 2 + (faixas - 1) * setores;
  for (let j = 0; j < setores; j++) { L.push(`f ${last} ${idx(faixas - 1, j)} ${idx(faixas - 1, j + 1)}`); tri++; }
  return { buf: Buffer.from(`${L.join('\n')}\n`), tri };
}

const snap = () => page.evaluate(() => window.__hestiaPerf?.snapshot());
const resumo = () => page.evaluate(() => {
  const p = window.__hestia.editor.project;
  const assets = Object.values(p.furniture?.assets ?? {});
  const inst = Object.values(p.elements).filter((e) => e.kind === 'furniture');
  return {
    assets: assets.map((a) => ({ id: a.id, name: a.name, triangles: a.stats?.triangles ?? null, bbox: a.bbox ?? null, hash: a.contentHash })),
    inst: inst.map((e) => ({ id: e.id, assetId: e.assetId, x: e.x, y: e.y, z: e.z, scale: e.scale, rotation: e.rotation, levelId: e.levelId })),
  };
});

async function importar(nome, buf) {
  await page.evaluate(() => window.__hestia.useUi.setState({ dialog: 'importFurniture', dialogArg: null }));
  await page.locator('[data-testid=fur-file]').setInputFiles({ name: nome, mimeType: 'application/octet-stream', buffer: buf });
  await page.waitForSelector('[data-testid=fur-ready]', { timeout: 120_000 });
  await page.locator('[data-testid=fur-add]').click();
  await page.waitForSelector('[data-testid=fur-blocks]', { timeout: 120_000 });
  await page.evaluate(() => window.__hestia.useUi.setState({ dialog: null, dialogArg: null }));
}

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
  await page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    editor.newProject('house2');
    useUi.setState({ tela: 'editor' });
  });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(1200);

  // 1. importar o cubo pelo diálogo
  await importar('cubo.obj', objCubo());
  let r = await resumo();
  assert.equal(r.assets.length, 1, 'um asset');
  assert.equal(r.assets[0].triangles, 12, 'cubo: 12 triângulos');
  ok('cubo.obj importado pelo diálogo', JSON.stringify(r.assets[0].bbox));

  // 2. instância com escala e posição conhecidas
  const lv = await page.evaluate(() => window.__hestia.editor.project.levels[0].id);
  const assetId = r.assets[0].id;
  await page.evaluate(([assetId, lv]) => {
    window.__hestia.editor.store.exec({ type: 'addFurniture', furniture: { id: 'mv1', kind: 'furniture', assetId, levelId: lv, x: 2.5, y: 3.5, z: 0, rotation: 0, scale: 2, mirrored: false, name: 'Cubo A' } });
  }, [assetId, lv]);
  r = await resumo();
  assert.deepEqual(r.inst.map((i) => [i.x, i.y, i.z, i.scale]), [[2.5, 3.5, 0, 2]]);
  ok('instância com posição e escala');

  // 3. planta: overlay de contorno do móvel
  await page.evaluate(() => window.__hestia.useUi.setState({ view: 'plan' }));
  await page.waitForTimeout(800);
  const overlayPlanta = await page.evaluate(() => document.querySelectorAll('[data-testid=furniture-plan] polygon').length);
  assert.ok(overlayPlanta >= 1, `overlay da planta (${overlayPlanta})`);
  ok('aparece na planta (overlay)', String(overlayPlanta));

  // 4. 3D: triângulos do móvel entram na contagem do quadro
  await page.evaluate(() => window.__hestia.useUi.setState({ view: '3d' }));
  await page.waitForTimeout(2500);
  const s3 = await snap();
  assert.ok(s3 && s3.quadro, 'contadores do 3D');
  const triComMovel = s3.quadro.triangulos;
  await page.evaluate(() => window.__hestia.editor.store.exec({ type: 'deleteFurniture', id: 'mv1' }));
  await page.waitForTimeout(2000);
  const triSem = (await snap()).quadro.triangulos;
  assert.ok(triComMovel - triSem >= 12, `3D: o móvel soma >= 12 triângulos (${triComMovel} vs ${triSem})`);
  await page.evaluate(() => window.__hestia.editor.store.undo());
  await page.waitForTimeout(800);
  ok('aparece no 3D', `${triComMovel} com / ${triSem} sem`);

  // 5. orçamento de triângulos do projeto (função oficial da vista 3D, carregada do código-fonte pelo servidor de desenvolvimento)
  const orc = await page.evaluate(async (raiz) => {
    const m = await import(/* @vite-ignore */ `/@fs${raiz}/packages/render/src/index.ts`);
    return m.furnitureViewBudget(window.__hestia.editor.project);
  }, process.cwd());
  assert.equal(orc.instancias, 1);
  assert.equal(orc.triangulos, 12, 'orçamento: 1 instância x 12 triângulos');
  assert.equal(orc.excede, false);
  ok('orçamento de triângulos', JSON.stringify(orc));

  // 6. salvar e reabrir idêntico
  const igual = await page.evaluate(() => {
    const { model, editor } = window.__hestia;
    const antes = editor.project;
    const texto = model.serializeProject(antes, 1);
    const depois = model.migrateProject(JSON.parse(texto));
    return { igual: JSON.stringify(depois) === JSON.stringify(antes), tamanho: texto.length, v: depois.schemaVersion, temAsset: Object.keys(depois.furniture?.assets ?? {}).length, inst: Object.values(depois.elements).filter((e) => e.kind === 'furniture').length };
  });
  assert.ok(igual.igual, 'salvar e reabrir idêntico');
  assert.equal(igual.temAsset, 1);
  assert.equal(igual.inst, 1);
  ok('salvar e reabrir idêntico', `${igual.tamanho} bytes, v${igual.v}`);

  // 7. instâncias em massa: 200 do mesmo bloco de ~2.000 triângulos
  const esf = objEsfera(32, 33);
  await importar('esfera.obj', esf.buf);
  r = await resumo();
  const esfera = r.assets.find((a) => a.name.toLowerCase().includes('esfera')) ?? r.assets[1];
  console.log(`esfera: ${esfera.triangles} triângulos (gerados ${esf.tri})`);
  await page.evaluate(() => window.__hestia.editor.store.exec({ type: 'deleteFurniture', id: 'mv1' }));
  await page.waitForTimeout(1500);
  const base = await snap();
  const t0 = await page.evaluate(([assetId, lv]) => {
    const t = performance.now();
    const { editor } = window.__hestia;
    for (let i = 0; i < 200; i++) {
      const x = -3 + (i % 20) * 0.9, y = -3 + Math.floor(i / 20) * 0.9;
      editor.store.exec({ type: 'addFurniture', furniture: { id: `m${i}`, kind: 'furniture', assetId, levelId: lv, x, y, z: 0, rotation: (i * 0.3) % 6.28, scale: 1, mirrored: false, name: `E${i}` } });
    }
    return performance.now() - t;
  }, [esfera.id, lv]);
  await page.waitForTimeout(6000);
  const massa = await snap();
  const j = massa.janela ?? {};
  const total = massa.quadro;
  console.log(JSON.stringify({ comandosMs: Math.round(t0), base: base.quadro, quadroMassa: total, janela: { ms: j.ms, drawCalls: j.drawCalls, triangulos: j.triangulos } }));
  const orcMassa = await page.evaluate(async (raiz) => {
    const m = await import(/* @vite-ignore */ `/@fs${raiz}/packages/render/src/index.ts`);
    return m.furnitureViewBudget(window.__hestia.editor.project);
  }, process.cwd());
  console.log('orçamento da vista (massa):', JSON.stringify(orcMassa));
  assert.equal(orcMassa.instancias, 200);
  assert.ok(total.triangulos >= 200 * 100, `triângulos desenhados (${total.triangulos}) mostram as 200 instâncias (versão leve ou completa)`);
  assert.ok(total.drawCalls < 400, `draw calls ${total.drawCalls} (instanciamento: nao pode ser ~200 por peca)`);
  ok('200 instâncias de ~2.000 triângulos', `draw calls ${total.drawCalls}, triângulos ${total.triangulos}`);

  const reabrir = await page.evaluate(() => {
    const { model, editor } = window.__hestia;
    const antes = editor.project;
    const t = performance.now();
    const texto = model.serializeProject(antes, 1);
    const ms = performance.now() - t;
    const depois = model.migrateProject(JSON.parse(texto));
    return { igual: JSON.stringify(depois) === JSON.stringify(antes), bytes: texto.length, msSerializar: Math.round(ms) };
  });
  assert.ok(reabrir.igual, 'projeto com 200 instâncias reabre idêntico');
  ok('200 instâncias: salvar e reabrir idêntico', JSON.stringify(reabrir));

  assert.deepEqual(errors.filter((e) => !/favicon|WebGL|GPU stall|swiftshader/i.test(e)), [], 'sem erros no console');
  ok('sem erros de console');
} catch (e) {
  console.error('FALHA', e);
  console.error(errors.slice(0, 10));
  process.exitCode = 1;
} finally {
  await browser.close();
}
