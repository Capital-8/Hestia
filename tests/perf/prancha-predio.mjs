// Medição de desempenho da prancha (0.2.5) num PRÉDIO MODELO: o template "Prédio, 10 pavimentos" (packages/model/src/
// templatePredio10.ts) com plantas de 4 pavimentos + cobertura, 2 cortes (do template) e 4 elevações, tudo numa prancha A0.
// Simula o arrastar do Navegador (mouse real, HTML5 drag) e mede: tempo de cada drop até a vista estar visível, quadros
// de pan, zoom e arrastar vista. Uso (com `npm run build` feito e `vite preview` na porta 4300):
//   PERF_URL=http://localhost:4300/ PERF_OUT=tests/perf/prancha-resultado.json node tests/perf/prancha-predio.mjs
// Saída: JSON com os números e um resumo na tela. Não grava imagens.
import { chromium } from 'playwright-core';
import { existsSync, writeFileSync } from 'node:fs';

const URL = (process.env.PERF_URL ?? 'http://localhost:4300/') + '?debug=1';
const OUT = process.env.PERF_OUT ?? 'tests/perf/prancha-medida.json';
const exe = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: process.env.PERF_CHROME_ARGS ? process.env.PERF_CHROME_ARGS.split(' ') : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(URL);
await page.waitForFunction(() => window.__hestia);

// 1. Prédio modelo pelo botão "Novo".
await page.evaluate(() => { window.__hestia.editor.newProject('predio10'); window.__hestia.useUi.setState({ tela: 'editor' }); });
await page.waitForSelector('.canvas-wrap canvas', { timeout: 60000 });
await page.waitForFunction(() => window.__hestia.editor.project.levels.length === 10, null, { timeout: 120000 });
await page.waitForTimeout(1500);

// 2. Quatro elevações (o template traz os cortes AA e BB) e uma prancha A0 aberta.
await page.evaluate(() => {
  const ed = window.__hestia.editor;
  const W = 20, D = 13;
  const els = [
    ['PD-ES', 'Elevação Sul', { x: -1, y: -2 }, { x: W + 1, y: -2 }],
    ['PD-EN', 'Elevação Norte', { x: W + 1, y: D + 2 }, { x: -1, y: D + 2 }],
    ['PD-EL', 'Elevação Leste', { x: W + 2, y: -1 }, { x: W + 2, y: D + 1 }],
    ['PD-EO', 'Elevação Oeste', { x: -2, y: D + 1 }, { x: -2, y: -1 }],
  ];
  for (const [id, name, a, b] of els) ed.store.exec({ type: 'addView', view: { id, name, kind: 'elevation', a, b, depth: 24 } });
});
const sheetId = 'sh_perf';
await page.evaluate((id) => {
  const ed = window.__hestia.editor;
  ed.store.exec({ type: 'addSheet', sheet: { id, number: 'A-101', name: 'Prédio', size: 'A0', orientation: 'landscape', margin: 10, titleBlock: { project: ed.project.name, client: '', author: '', date: '18/11/2026', revision: '0' }, viewports: [] } }, 'Prancha de medição');
  window.__hestia.useUi.setState({ view: 'sheet', sheetId: id });
}, sheetId);
await page.waitForSelector('.sheet-stage svg');
// PERF_IDLE_MS: tempo que a folha vazia fica parada antes do primeiro arraste (o usuário olha a prancha; o app prepara as vistas nesse tempo).
await page.waitForTimeout(Number(process.env.PERF_IDLE_MS ?? 3000));
await page.waitForTimeout(800);

// 3. Medidor de quadros (rAF contínuo, com rótulo da fase) e de tarefas longas.
await page.evaluate(() => {
  const m = { label: null, frames: {}, last: performance.now(), long: {} };
  window.__m = m; window.__slow = [];
  const tick = (t) => {
    if (m.label) { (m.frames[m.label] ??= []).push(t - m.last); if (t - m.last > 400) { const svg = document.querySelector('.sheet-stage svg'); window.__slow.push([m.label, Math.round(t - m.last), svg?.getAttribute('viewBox')]); } }
    m.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (m.label) (m.long[m.label] ??= []).push(e.duration); }).observe({ entryTypes: ['longtask'] });
  } catch { /* sem longtask */ }
  window.__loaf = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), render: Math.round(e.startTime + e.duration - e.renderStart), layout: e.styleAndLayoutStart ? Math.round(e.startTime + e.duration - e.styleAndLayoutStart) : 0, scripts: e.scripts.map((x) => `${Math.round(x.duration)}ms ${x.invoker}`).slice(0, 4) }); }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* sem LoAF */ }
  window.__nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
});
const phase = (label) => page.evaluate((l) => { window.__m.label = l; window.__m.last = performance.now(); }, label);
const frame = () => page.evaluate(() => window.__nextFrame());

// 4. Drops: cada vista do Navegador, na ordem, soltas em posições distintas da folha.
const drops = [
  ['plan:lv_0', 'Planta Térreo'], ['plan:lv_1', 'Planta Pav. 2'], ['plan:lv_2', 'Planta Pav. 3'], ['plan:lv_3', 'Planta Pav. 4'],
  ['plan:lv_9', 'Planta Cobertura (último pavimento)'],
  ['view:PD-AA', 'Corte AA'], ['view:PD-BB', 'Corte BB'],
  ['view:PD-ES', 'Elevação Sul'], ['view:PD-EN', 'Elevação Norte'], ['view:PD-EL', 'Elevação Leste'], ['view:PD-EO', 'Elevação Oeste'],
];
for (const g of ['g:elev', 'g:sections']) {
  const n = page.locator(`[data-node="${g}"]`).first();
  if ((await n.getAttribute('aria-expanded')) !== 'true') await n.locator('.bbox').click();
}
// PERF_PROFILE=drops|gestos grava um perfil de CPU (CDP) da fase e imprime as funções de maior tempo próprio.
const prof = process.env.PERF_PROFILE ?? '';
const cdp = prof ? await page.context().newCDPSession(page) : null;
if (cdp) await cdp.send('Profiler.enable');
const selfAcc = new Map();
const inclAcc = new Map();
const topOf = (profile, n = 35, self = new Map()) => {
  const byId = new Map(profile.nodes.map((nd) => [nd.id, nd]));
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const nd = byId.get(id);
    const k = `${nd.callFrame.functionName || '(anon)'} ${nd.callFrame.url.split('/').pop()}:${nd.callFrame.lineNumber}`;
    self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
  });
  if (self === selfAcc) {
    const parent = new Map();
    for (const nd of profile.nodes) for (const c of nd.children ?? []) parent.set(c, nd.id);
    profile.samples.forEach((id, i) => {
      const seen = new Set();
      for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
        const nd = byId.get(cur);
        const k = `${nd.callFrame.functionName || '(anon)'} ${nd.callFrame.url.split('/').pop()}:${nd.callFrame.lineNumber}`;
        if (seen.has(k)) continue;
        seen.add(k);
        inclAcc.set(k, (inclAcc.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
      }
    });
    return '';
  }
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(7)} ms  ${k}`).join('\n');
};
if (cdp && prof === 'drops') await cdp.send('Profiler.start');
const stage = page.locator('.sheet-stage');
const sbox = await stage.boundingBox();
const dropResults = [];
const cols = 4;
const FAST = process.env.PERF_FAST === '1'; // só gestos: põe as vistas por comando, sem arrastar do Navegador
if (FAST) {
  await page.evaluate((list) => {
    const ed = window.__hestia.editor;
    list.forEach(([node], i) => {
      const view = node.startsWith('plan:') ? { kind: 'plan', levelId: node.slice(5) } : { kind: 'section', sectionId: node.slice(5) };
      ed.store.exec({ type: 'addViewport', sheetId: 'sh_perf', viewport: { id: `vf${i}`, view, at: { x: 15 + (i % 4) * 205, y: 20 + Math.floor(i / 4) * 270 }, size: { w: 200, h: 240 }, scale: 100 } });
    });
  }, drops);
  await page.waitForTimeout(8000);
}
for (let i = 0; i < (FAST ? 0 : drops.length); i++) {
  const [node, label] = drops[i];
  const src = page.locator(`[data-node="${node}"]`).first();
  if ((await src.count()) === 0) { dropResults.push({ label, node, error: 'nó ausente no Navegador' }); continue; }
  await src.scrollIntoViewIfNeeded();
  const sb = await src.boundingBox();
  const tx = sbox.x + sbox.width * (0.14 + 0.24 * (i % cols));
  const ty = sbox.y + sbox.height * (0.2 + 0.28 * Math.floor(i / cols));
  const before = await page.evaluate(() => window.__hestia.editor.project.sheets[0].viewports.length);
  await page.evaluate((n) => {
    window.__drop = null;
    document.addEventListener('drop', () => {
      const t0 = performance.now();
      window.__marks = { handler: null, dom: null };
      window.addEventListener('drop', () => { window.__marks.handler = performance.now() - t0; }, { once: true });
      const mo = new MutationObserver(() => { if (window.__marks.dom === null && document.querySelectorAll('[data-vp-layer]').length >= n) { window.__marks.dom = performance.now() - t0; mo.disconnect(); } });
      mo.observe(document.querySelector('.sheet-stage'), { childList: true, subtree: true });
      const poll = () => {
        const layers = document.querySelectorAll('[data-vp-layer]');
        const last = layers[layers.length - 1];
        if (layers.length >= n && last && last.querySelector('path')) {
          requestAnimationFrame(() => requestAnimationFrame(() => { window.__drop = performance.now() - t0; window.__dropEpoch = performance.timeOrigin + performance.now(); }));
        } else requestAnimationFrame(poll);
      };
      poll();
    }, { once: true, capture: true });
  }, before + 1);
  await page.mouse.move(sb.x + 30, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + 200, sb.y + sb.height / 2, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 12 });
  await page.mouse.move(tx + 2, ty + 1, { steps: 2 });
  const upAt = Date.now();
  if (cdp && prof === 'drop') { await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start'); }
  await page.mouse.up();
  try {
    await page.waitForFunction(() => window.__drop !== null, null, { timeout: 120000 });
    const ms = await page.evaluate(() => window.__drop);
    if (cdp && prof === 'drop') { const { profile } = await cdp.send('Profiler.stop'); topOf(profile, 0, selfAcc); }
    const info = await page.evaluate(() => {
      const vps = window.__hestia.editor.project.sheets[0].viewports;
      return { n: vps.length, scale: vps[vps.length - 1]?.scale };
    });
    const fromUp = await page.evaluate(() => window.__dropEpoch);
    const mk = await page.evaluate(() => window.__marks);
    dropResults.push({ label, node, marks: { handler: Math.round(mk.handler), dom: Math.round(mk.dom) }, ms: Math.round(ms * 10) / 10, msFromUp: Math.round((fromUp - upAt) * 10) / 10, added: info.n === before + 1, scale: info.scale });
  } catch (e) {
    dropResults.push({ label, node, error: 'tempo esgotado: vista não apareceu' });
  }
  await page.waitForTimeout(300);
}
if (cdp && prof === 'drops') { const { profile } = await cdp.send('Profiler.stop'); console.log('PERFIL drops\n' + topOf(profile)); }
if (cdp && prof === 'drop') console.log('INCLUSIVO soltar (soma dos 11)\n' + [...inclAcc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `${v.toFixed(0).padStart(7)} ms  ${k}`).join('\n'));
if (cdp && prof === 'drop') console.log('PERFIL soltar (soma dos 11)\n' + [...selfAcc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${v.toFixed(0).padStart(7)} ms  ${k}`).join('\n'));
const layersInfo = await page.evaluate(() =>
  [...document.querySelectorAll('[data-vp-layer]')].map((g) => g.querySelectorAll('path').length));

// 5. Gestos com todas as vistas dentro da prancha.
await page.evaluate(() => document.activeElement?.blur?.());
const emptyPoint = () => page.evaluate(() => {
  const svg = document.querySelector('.sheet-stage svg');
  const vb = svg.viewBox.baseVal;
  const m = svg.getScreenCTM();
  const at = (px, py) => ({ x: (vb.x + px) * m.a + m.e, y: (vb.y + py) * m.d + m.f });
  return at(3, 3);
});
const stats = (a) => {
  if (!a || a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
};
const gestures = {};
const run = async (label, fn) => {
  await page.waitForTimeout(500);
  await phase(label);
  await fn();
  await phase(null);
  const r = await page.evaluate((l) => ({ f: window.__m.frames[l] ?? [], long: window.__m.long[l] ?? [] }), label);
  gestures[label] = { frame: stats(r.f), longtasks: r.long.length, longMax: r.long.length ? +Math.max(...r.long).toFixed(1) : 0, over100: r.f.filter((x) => x > 100).length };
};

if (cdp && prof === 'gestos') await cdp.send('Profiler.start');
const cx = sbox.x + sbox.width / 2;
const cy = sbox.y + sbox.height / 2;
await run('zoom', async () => {
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, -120); await frame(); }
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 120); await frame(); }
});
await run('pan-ajustada', async () => {
  const p = await emptyPoint();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 0; i < 80; i++) { await page.mouse.move(p.x + 3 * i, p.y - 2 * i); await frame(); }
  await page.mouse.up();
});
// Zoom 3x no centro para o pan aproximado.
await page.mouse.move(cx, cy);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -120); await frame(); }
await run('pan-aproximada', async () => {
  const p = { x: sbox.x + 40, y: sbox.y + sbox.height - 40 };
  // ponto vazio garantido: onde não há vista sob o cursor (a folha tem margens); usa o canto e confere por elementFromPoint.
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 0; i < 80; i++) { await page.mouse.move(p.x + 4 * i, p.y - 3 * i); await frame(); }
  await page.mouse.up();
});
// Volta ao enquadramento (tecla de ajuste da barra) e arrasta uma vista.
await page.evaluate(() => document.querySelector('.sheet-stage')?.focus?.());
await page.locator('.sheet-vcb button').nth(2).click();
await page.waitForTimeout(600);
const vpBox = await page.locator('[data-vp-layer]').first().evaluate((g) => { const r = g.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }).catch(() => null);
let moveOk = false;
await run('mover-vista', async () => {
  const b = vpBox ?? { x: cx - 50, y: cy - 50, width: 100, height: 100 };
  const x0 = b.x + b.width / 2;
  const y0 = b.y + b.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 0; i < 60; i++) { await page.mouse.move(x0 + 2 * i, y0 + 1.5 * i); await frame(); }
  await phase('mover-vista-soltar');
  await page.mouse.up();
  await frame();
  await frame();
  moveOk = true;
});
if (cdp && prof === 'gestos') { const { profile } = await cdp.send('Profiler.stop'); console.log('PERFIL gestos\n' + topOf(profile)); }
const release = await page.evaluate(() => window.__m.frames['mover-vista-soltar'] ?? []);
gestures['mover-vista-soltar'] = { frame: stats(release) };
// Nitidez: com o gesto parado, toda camada volta a escala 1 (rasterizada no zoom corrente, não esticada).
await page.waitForTimeout(700);
const layerScales = await page.evaluate(() => [...document.querySelectorAll('[data-vp-layer]')].map((g) => { const m = new DOMMatrix(getComputedStyle(g.closest('div')).transform); return Math.round(m.a * 1000) / 1000; }));
const domNodes = await page.evaluate(() => document.querySelectorAll('.sheet-stage svg *').length);

const dropMs = dropResults.filter((d) => d.msFromUp !== undefined).map((d) => d.msFromUp);
if (process.env.PERF_LOAF === '1') console.log('LOAF', JSON.stringify(await page.evaluate(() => window.__loaf.filter((e) => e.d > 40))));
const slow = await page.evaluate(() => window.__slow);
console.log('quadros lentos (>400 ms):', JSON.stringify(slow));
const result = { when: new Date().toISOString(), drops: dropResults, dropStats: stats(dropMs), gestures, pathsPerViewport: layersInfo, svgNodes: domNodes, layerScales, moveOk, errors };
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ dropStats: result.dropStats, gestures: Object.fromEntries(Object.entries(gestures).map(([k, v]) => [k, v.frame])), svgNodes: domNodes }, null, 1));
for (const d of dropResults) console.log(d.error ? `FALHA ${d.label}: ${d.error}` : `${d.label}: ${d.msFromUp} ms desde o soltar (${d.ms} ms desde o evento drop; tratador ${d.marks?.handler} ms, DOM ${d.marks?.dom} ms; 1:${d.scale})`);
await browser.close();
