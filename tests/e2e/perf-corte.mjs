// Perfil do corte num projeto grande (e2e, sem servidor): abre o prédio de 10 pavimentos no build de produção por
// file://, abre um corte que atravessa o prédio e mede abertura fria, 20 passos de pan e 30 movimentos do mouse com a
// ferramenta Medir (snap). Imprime um JSON; não impõe limites de tempo (variam com a máquina) — falha só em erro de
// console/página, crash ou timeout.
//
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/e2e/perf-corte.mjs
//
// `window.__hestiaSection.snapshot()` (montagens/reaproveitamentos da lista do corte) só existe no build com `?debug=1`.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CHROME_FALLBACKS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium',
];
const exe = CHROME_FALLBACKS.find((p) => p && existsSync(p));
if (!exe) throw new Error('Chrome não encontrado: defina CHROME_PATH.');

const WATCHDOG_MS = Number(process.env.PERF_TIMEOUT_MS ?? 240_000);
const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    totalMs: round(sum),
    minMs: round(s[0]),
    medMs: round(s[Math.floor(s.length / 2)]),
    p90Ms: round(s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]),
    maxMs: round(s[s.length - 1]),
  };
};

const watchdog = setTimeout(() => {
  console.error(`TIMEOUT: perf-corte excedeu ${WATCHDOG_MS} ms.`);
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const browser = await chromium.launch({ executablePath: exe, args: ARGS });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('crash', () => errors.push('[crash] a página caiu'));
page.on('dialog', (d) => d.dismiss());

const frames = (n = 2) => page.evaluate((count) => new Promise((resolve) => {
  let i = 0;
  const step = () => { i += 1; if (i >= count) resolve(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

const sectionStats = () => page.evaluate(() => window.__hestiaSection?.snapshot?.() ?? null);
const memory = () => page.evaluate(() => {
  const m = performance.memory;
  return m ? { usedJSHeapMB: Math.round((m.usedJSHeapSize / 1048576) * 10) / 10, totalJSHeapMB: Math.round((m.totalJSHeapSize / 1048576) * 10) / 10 } : null;
});
const domCount = () => page.evaluate(() => document.querySelectorAll('*').length);

/**
 * Abre o build. Em Windows, um `npm run build` de outra frente pode substituir o `index.html` no instante do goto
 * (`ERR_FILE_NOT_FOUND` transitório); tenta de novo antes de falhar.
 */
async function gotoBuild(href) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { await page.goto(href); return; } catch (e) {
      last = e;
      if (!/ERR_FILE_NOT_FOUND/.test(String(e && e.message))) throw e;
      await page.waitForTimeout(800);
    }
  }
  throw last;
}

let result = null;
try {
  const url = pathToFileURL(path.resolve('apps/web/dist/index.html'));
  url.search = '?gl=1&debug=1';
  const tGoto = Date.now();
  await gotoBuild(url.href);
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForFunction(() => window.__hestia);
  const bootMs = Date.now() - tGoto;

  const prj = await page.evaluate(async () => {
    const { editor } = window.__hestia;
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const t0 = performance.now();
    editor.newProject('predio10');
    await raf(); await raf();
    return {
      ms: performance.now() - t0,
      walls: Object.values(editor.project.elements).filter((e) => e.kind === 'wall').length,
      levels: editor.project.levels.length,
      views: editor.project.views.map((v) => ({ id: v.id, name: v.name, a: v.a, b: v.b, depth: v.depth })),
    };
  });

  // Corte BB atravessa os 20 m do prédio, de fachada a fachada, e mostra os 10 pavimentos.
  const viewId = prj.views.find((v) => /BB/.test(v.name))?.id ?? prj.views[0]?.id;
  if (!viewId) throw new Error('template predio10 sem vista de corte');

  await page.evaluate(() => window.__hestiaSection?.reset?.());
  await frames(2);
  const memBefore = await memory();
  const domBefore = await domCount();

  const cold = await page.evaluate(async (id) => {
    const { editor, useUi } = window.__hestia;
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const t0 = performance.now();
    editor.openSection(id);
    await raf(); await raf();
    const s = editor.sectionOf(id);
    return {
      ms: performance.now() - t0,
      view: useUi.getState().view,
      viewport: editor.viewport(),
      stats: window.__hestiaSection?.snapshot?.() ?? null,
      section: s ? {
        length: s.length,
        zMin: s.zMin,
        zMax: s.zMax,
        cutRegions: s.cut.length,
        beyondItems: s.beyond.length,
        openings: s.openings.length,
        levels: s.levels.length,
      } : null,
    };
  }, viewId);

  // 20 passos de pan com dois rAF cada: o desenho não deve ser remontado (builds estável).
  const pan = await page.evaluate(async () => {
    const { editor } = window.__hestia;
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const times = [];
    const builds0 = window.__hestiaSection?.snapshot?.().builds ?? null;
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      editor.pan(i % 2 ? -9 : 9, i % 3 ? 4 : -4);
      await raf(); await raf();
      times.push(performance.now() - t);
    }
    const st = window.__hestiaSection?.snapshot?.() ?? null;
    return { times, builds0, builds1: st ? st.builds : null, stats: st, viewport: editor.viewport() };
  });

  // Ferramenta Medir: 30 movimentos sobre o desenho. O hover é o caminho principal (inferência a cada quadro); a
  // repetição com o botão pressionado separa o custo do snap do custo do evento caso o build ainda não entregue 'move'
  // à ferramenta sem botão (ver `hoverWithoutButton.movesWithSnap` no resultado).
  await page.evaluate(() => window.__hestia.editor.setTool('measure'));
  await page.waitForTimeout(120);
  const geo = await page.evaluate((id) => {
    const { editor } = window.__hestia;
    return { v: editor.viewport(), length: editor.sectionOf(id)?.length ?? 24 };
  }, viewId);
  const box = await page.locator('.canvas-wrap').boundingBox();
  if (!box) throw new Error('canvas do corte sem caixa');
  const worldToPage = (x, y) => ({
    x: box.x + geo.v.width / 2 + (x - geo.v.cx) * geo.v.zoom,
    y: box.y + geo.v.height / 2 - (y - geo.v.cy) * geo.v.zoom,
  });
  const points = Array.from({ length: 30 }, (_, i) => {
    const x = 2.5 + (i % 10) * 1.8;
    const y = 3 + Math.floor(i / 10) * 8;
    return { x, y };
  });

  const hoverTimes = [];
  const hoverKinds = [];
  for (const p of points) {
    const t = Date.now();
    const q = worldToPage(p.x, p.y);
    await page.mouse.move(q.x, q.y);
    await frames(1);
    hoverTimes.push(Date.now() - t);
    hoverKinds.push(await page.evaluate(() => {
      const { editor, useUi } = window.__hestia;
      return { snap: useUi.getState().snapKind, inf: editor.activeTool.inference()?.kind ?? null };
    }));
  }

  const dragTimes = [];
  const dragKinds = [];
  const first = worldToPage(points[0].x, points[0].y);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of points) {
    const t = Date.now();
    const q = worldToPage(p.x, p.y);
    await page.mouse.move(q.x, q.y, { steps: 1 });
    await frames(1);
    dragTimes.push(Date.now() - t);
    dragKinds.push(await page.evaluate(() => {
      const { editor, useUi } = window.__hestia;
      return { snap: useUi.getState().snapKind, inf: editor.activeTool.inference()?.kind ?? null };
    }));
  }
  await page.mouse.up();
  await page.waitForTimeout(150);

  const afterStats = await sectionStats();
  const memAfter = await memory();
  const domAfter = await domCount();

  const hoverSnaps = hoverKinds.filter((k) => k.inf && k.inf !== 'none').length;
  const dragSnaps = dragKinds.filter((k) => k.inf && k.inf !== 'none').length;
  const kinds = {};
  for (const k of dragKinds) kinds[k.inf ?? 'none'] = (kinds[k.inf ?? 'none'] ?? 0) + 1;

  result = {
    ok: errors.length === 0,
    bootMs,
    project: {
      id: 'predio10',
      viewId,
      newProjectMs: round(prj.ms),
      walls: prj.walls,
      levels: prj.levels,
      views: prj.views.length,
    },
    coldOpen: {
      ms: round(cold.ms),
      view: cold.view,
      stats: cold.stats,
      section: cold.section,
      note: 'abertura fria: inclui o computeSection e a primeira montagem da lista do corte',
    },
    pan: {
      steps: pan.times.length,
      ...stats(pan.times),
      perStepMs: pan.times.map((v) => round(v)),
      buildsBefore: pan.builds0,
      buildsAfter: pan.builds1,
      stats: pan.stats,
    },
    mouseMeasure: {
      steps: points.length,
      hoverWithoutButton: {
        ...stats(hoverTimes),
        perMoveMs: hoverTimes.map((v) => round(v)),
        movesWithSnap: hoverSnaps,
        note: hoverSnaps === points.length
          ? 'hover entregou move e snap em todos os movimentos'
          : hoverSnaps === 0
            ? 'sem botão o corte só realçou (hoverSectionAt); a ferramenta não recebeu move, então o caminho de hover não mediu snap'
            : `hover entregou move em ${hoverSnaps}/${points.length} movimentos`,
      },
      dragWithButton: {
        ...stats(dragTimes),
        perMoveMs: dragTimes.map((v) => round(v)),
        movesWithSnap: dragSnaps,
        inferenceKinds: kinds,
      },
    },
    stability: {
      consoleOrPageErrors: errors,
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      domNodesBefore: domBefore,
      domNodesAfter: domAfter,
      sectionStatsBefore: cold.stats,
      sectionStatsAfter: afterStats,
    },
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (e) {
  console.error('ERRO FATAL:', e && e.stack ? e.stack : e);
  console.log(JSON.stringify({ ok: false, fatal: String(e && e.message ? e.message : e), errors }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  await browser.close();
}
