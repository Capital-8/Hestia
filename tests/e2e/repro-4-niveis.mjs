// REPRODUÇÃO TEMPORÁRIA: 4 níveis, copia TODO o primeiro pavimento e cola nos outros três, depois olha o 3D.
// Uso: CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/e2e/repro-4-niveis.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const URL = process.env.APP_URL ?? 'http://localhost:5173/?gl=1&debug=1';
const OUT = process.env.SHOTS ?? 'C:/Users/User/AppData/Local/Temp/claude/repro-4-niveis';
mkdirSync(OUT, { recursive: true });
const exe = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => p && existsSync(p));

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('dialog', (d) => d.dismiss());
page.on('console', (m) => { if (m.type() === 'log') console.log('[app]', m.text()); });

await page.goto(URL);
await page.waitForSelector('.canvas-wrap canvas', { timeout: 60000 });
await page.waitForFunction(() => window.__hestia, { timeout: 60000 });
await page.waitForTimeout(800);

/** Diagnóstico da cena 3D real: por nível, quantos grupos/peças/caixas ela tem e a cota Z do grupo. */
const cenaDiag = () => page.evaluate(() => {
  const m = window.__hestia3dModel;
  if (!m) return 'sem __hestia3dModel';
  return (m.cenaNiveis ?? []).map((e) => ({
    lv: e.levelId,
    z: Number(e.grupo?.position?.z ?? 0).toFixed(2),
    filhos: e.grupo?.children?.length ?? 0,
    picks: e.picks?.length ?? 0,
    colecoes: (e.instancias ?? []).length,
    caixas: (e.instancias ?? []).reduce((s, c) => s + (c.count ?? c.quantidade ?? c.matrizes?.length ?? 0), 0),
    bytes: e.bytes,
  }));
});

const info = (label) => page.evaluate((label) => {
  const p = window.__hestia.editor.store.project;
  const porNivel = {};
  for (const e of Object.values(p.elements)) {
    const lv = e.levelId ?? (p.elements[e.hostId]?.levelId);
    porNivel[lv] ??= { wall: 0, door: 0, window: 0 };
    if (e.kind in porNivel[lv]) porNivel[lv][e.kind]++;
  }
  console.log(label, JSON.stringify(porNivel));
  return porNivel;
}, label);

// 1) Projeto com 4 níveis
await page.evaluate(() => {
  const { editor, useUi } = window.__hestia;
  editor.newProject('house2');
  const p = editor.store.project;
  const base = [...p.levels].sort((a, b) => a.elevation - b.elevation)[0];
  let i = 1;
  while (editor.store.project.levels.length < 4) {
    const elevation = 3 * (i + 1) + 3;
    editor.store.exec({ type: 'upsertLevel', level: { ...structuredClone(base), id: `lv_extra_${i}`, name: `Pav. ${i + 1}`, elevation } });
    i++;
  }
  useUi.setState({ view: 'plan', planKind: 'floor', dialog: null, pastePreview: null });
});
const niveis = await page.evaluate(() => [...window.__hestia.editor.store.project.levels].sort((a, b) => a.elevation - b.elevation).map((l) => ({ id: l.id, elevation: l.elevation })));
console.log('niveis', JSON.stringify(niveis));
await info('antes do copiar');

// 2) Copia TODO o primeiro pavimento (paredes + aberturas + o que mais estiver nele)
const origem = niveis[0].id;
if (process.env.TOPO) {
  // Cenário: paredes do térreo sobem até o 3º nível (topLevelId), como paredes que atravessam pavimentos.
  await page.evaluate(([origem, topo]) => {
    const { editor } = window.__hestia;
    const ids = Object.values(editor.store.project.elements).filter((e) => e.kind === 'wall' && e.levelId === origem).map((e) => e.id);
    editor.store.exec({ type: 'updateElements', ids, patch: { topLevelId: topo } });
  }, [origem, niveis[2].id]);
  console.log('cenario TOPO: paredes do origem com topLevelId =', niveis[2].id);
}
const destinos = niveis.slice(1).map((l) => l.id);
const ids = await page.evaluate((origem) => {
  const p = window.__hestia.editor.store.project;
  return Object.values(p.elements).filter((e) => {
    if (e.kind === 'door' || e.kind === 'window') return p.elements[e.hostId]?.levelId === origem;
    return e.levelId === origem;
  }).map((e) => e.id);
}, origem);
console.log('selecionados no origem', ids.length);
await page.evaluate((ids) => {
  const { editor, useUi } = window.__hestia;
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: ids.length ? editor.store.project.elements[ids[0]].levelId ?? null : null, selection: ids, tool: 'select' });
  editor.copySelection();
}, ids);
await page.evaluate((ids) => window.__hestia.useUi.setState({ selection: ids }), ids);

// 3) Cola nos outros três (caminho direto do diálogo)
const ok = await page.evaluate((destinos) => window.__hestia.editor.pasteLevelsDirect(destinos, false), destinos);
console.log('colou?', ok);
await info('depois de colar');

// 4) 3D
await page.evaluate(() => window.__hestia.useUi.setState({ view: '3d' }));
await page.waitForFunction(() => {
  const m = window.__hestia3dMontagem;
  return m && m.montados >= window.__hestia.editor.store.project.levels.length;
}, null, { timeout: 60000 }).catch((e) => console.log('montagem não completou:', e.message));
await page.waitForTimeout(1500);
const montados = await page.evaluate(() => window.__hestia3dMontagem?.montados ?? null);
console.log('montados 3D', montados);
await page.screenshot({ path: `${OUT}/1-3d-depois-de-colar.png` });
console.log('CENA depois de colar', JSON.stringify(await cenaDiag()));

// 5) Exclui uma porta de um nível colado e vê se o 3D muda
const porta = await page.evaluate((destino) => {
  const p = window.__hestia.editor.store.project;
  const e = Object.values(p.elements).find((x) => x.kind === 'door' && p.elements[x.hostId]?.levelId === destino);
  return e?.id ?? null;
}, destinos[0]);
console.log('porta a excluir', porta);
if (porta) {
  await page.evaluate((id) => window.__hestia.editor.store.exec({ type: 'deleteElements', ids: [id] }), porta);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/2-3d-depois-de-excluir-porta.png` });
  console.log('CENA depois de excluir', JSON.stringify(await cenaDiag()));
  await info('depois de excluir porta');
}

console.log('ERROS DE CONSOLE:', JSON.stringify(errors.slice(0, 20), null, 1));
await browser.close();
