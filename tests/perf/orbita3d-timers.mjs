// Atribuição de tempo durante a ÓRBITA 3D: quais callbacks de setTimeout/requestAnimationFrame rodam na janela do arrasto,
// quanto custam, e quando acontecem os rebuilds de camada (contadores do ?perf=1). Mesmo gesto de orbita3d.mjs (Alt + esquerdo).
// Uso: PERF_URL=http://127.0.0.1:4801/ PERF_CENARIO=A PERF_PROJETO=predio10 PERF_OUT=/caminho.json node tests/perf/orbita3d-timers.mjs
// Atenção: esta passada usa ?perf=1 (instrumentação do WebGL e do próprio medidor), que pesa na CPU; serve para ATRIBUIR, não para tempo.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.PERF_URL ?? 'http://127.0.0.1:4801/';
const CENARIO = process.env.PERF_CENARIO ?? 'avulso';
const PROJETO = process.env.PERF_PROJETO ?? 'predio10';
const OUT = process.env.PERF_OUT ?? 'orbita3d-timers-medida.json';
const DURACAO_MS = 3000;
const PASSO_MS = 16;
const PASSO_PX = 8;
const AMPLITUDE_PX = 152;
const exe = [process.env.CHROME_PATH, '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const projetoTexto = PROJETO.startsWith('arquivo:') ? readFileSync(PROJETO.slice('arquivo:'.length), 'utf8') : null;
const projetoTipo = projetoTexto === null ? PROJETO : 'arquivo';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => Math.round(v * 10) / 10;

// Roda antes de qualquer script da página: embrulha setTimeout e requestAnimationFrame e grava (só com T.on) nome, fonte,
// atraso pedido e duração real de cada callback.
const EMBRULHO = `(() => {
  const T = { on: false, t0: 0, rows: [] };
  window.__T = T;
  const regista = (tipo, fn, atraso, t, dur) => {
    if (!T.on) return;
    T.rows.push({ tipo, nome: fn.name || '(anon)', src: String(fn).slice(0, 120).replace(/\\s+/g, ' '), atraso, t: r(t - T.t0), dur: r(dur) });
  };
  const r = (v) => Math.round(v * 100) / 100;
  const stO = window.setTimeout;
  window.setTimeout = function (fn, atraso, ...args) {
    if (typeof fn !== 'function') return stO.call(this, fn, atraso, ...args);
    return stO.call(this, function () {
      const t = performance.now();
      try { return fn.apply(this, arguments); } finally { regista('setTimeout', fn, atraso ?? 0, t, performance.now() - t); }
    }, atraso, ...args);
  };
  const rafO = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => rafO((ts) => {
    const t = performance.now();
    try { return fn(ts); } finally { regista('raf', fn, 0, t, performance.now() - t); }
  });
})();`;

const contarCena = () => {
  const m = window.__hestia3dModel;
  if (!m) return null;
  let meshes = 0;
  m.scene.traverseVisible((o) => { if (o.isMesh) meshes++; });
  return { malhasVisiveis: meshes };
};

const contarElementos = () => {
  const p = window.__hestia.editor.project;
  const porTipo = {};
  for (const lv of p.levels) for (const [k, v] of Object.entries(lv)) if (Array.isArray(v)) porTipo[k] = (porTipo[k] ?? 0) + v.length;
  return { niveis: p.levels.length, paredes: porTipo.walls ?? 0 };
};

const camera = () => { const p = window.__hestia3d.camera.position; return { x: p.x, y: p.y, z: p.z }; };

async function orbitar(page, box) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let x = cx - AMPLITUDE_PX;
  let dir = 1;
  await page.mouse.move(x, cy);
  await page.keyboard.down('Alt');
  await page.mouse.down({ button: 'left' });
  const t0 = Date.now();
  let movimentos = 0;
  while (Date.now() - t0 < DURACAO_MS) {
    x += dir * PASSO_PX;
    if (x >= cx + AMPLITUDE_PX || x <= cx - AMPLITUDE_PX) dir = -dir;
    await page.mouse.move(x, cy);
    movimentos++;
    const espera = t0 + movimentos * PASSO_MS - Date.now();
    if (espera > 0) await sleep(espera);
  }
  await page.mouse.up({ button: 'left' });
  await page.keyboard.up('Alt');
  return { duracaoMs: Date.now() - t0, movimentos };
}

const browser = await chromium.launch({ executablePath: exe, args: ARGS });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const erros = [];
page.on('pageerror', (e) => { if (erros.length < 20) erros.push(`[pageerror] ${e.message.slice(0, 300)}`); });
await page.addInitScript(EMBRULHO);
await page.goto(`${BASE}?debug=1&perf=1&overlay=0`);
await page.waitForFunction(() => window.__hestia, null, { timeout: 180000 });
await page.evaluate(({ tipo, texto }) => {
  const ed = window.__hestia.editor;
  if (tipo === 'arquivo') ed.load(window.__hestia.model.migrateProject(JSON.parse(texto)), 'projeto.hestia.json');
  else ed.newProject(tipo);
  window.__hestia.useUi.setState({ tela: 'editor' });
}, { tipo: projetoTipo, texto: projetoTexto });
await page.waitForSelector('.canvas-wrap canvas', { timeout: 120000 });
await page.waitForFunction(() => window.__hestia.editor.project.levels.length > 0, null, { timeout: 180000 });
await page.waitForFunction(() => window.__hestiaPerf, null, { timeout: 60000 });
await sleep(1500);
const elementos = await page.evaluate(contarElementos);

const tVista = Date.now();
await page.evaluate(() => window.__hestia.useUi.setState({ view: '3d' }));
await page.waitForFunction(() => window.__hestia3dModel && window.__hestia3dModel.scene.children.length > 0, null, { timeout: 180000 });
let anterior = -1; let iguais = 0; let tEstavel = null;
for (let i = 0; i < 240 && iguais < 3; i++) {
  const c = await page.evaluate(contarCena);
  if (c.malhasVisiveis === anterior) iguais++; else { iguais = 0; tEstavel = Date.now() - tVista; }
  anterior = c.malhasVisiveis;
  await sleep(1000);
}
await sleep(500);
const box = await page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});

// Vigia de rebuilds: a cada quadro lê o total de rebuilds do medidor; grava o instante e a camada que mudou.
await page.evaluate(() => {
  const W = { ultimo: null, eventos: [], t0: 0, on: false };
  window.__W = W;
  const tick = () => {
    const s = window.__hestiaPerf.snapshot();
    if (W.ultimo && s.total.rebuilds !== W.ultimo.total.rebuilds && W.on) {
      const dif = {};
      for (const k of Object.keys(s.camadas)) { const d = s.camadas[k] - (W.ultimo.camadas[k] ?? 0); if (d) dif[k] = d; }
      W.eventos.push({ t: Math.round((performance.now() - W.t0) * 10) / 10, rebuildsAcumulados: s.total.rebuilds, camadas: dif });
    }
    W.ultimo = s;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// Janela de medição: 1 s antes do arrasto (ocioso) e os 3 s de órbita; depois 1 s de cauda (damping).
await page.evaluate(() => { window.__T.rows = []; window.__T.on = false; });
await sleep(1000);
const cam0 = await page.evaluate(camera);
await page.evaluate(() => { window.__T.t0 = performance.now(); window.__T.on = true; window.__W.t0 = performance.now(); window.__W.on = true; });
const iniOrbita = await page.evaluate(() => performance.now());
const orb = await orbitar(page, box);
const fimOrbita = await page.evaluate(() => performance.now());
await sleep(1000);
await page.evaluate(() => { window.__T.on = false; window.__W.on = false; });
const cam1 = await page.evaluate(camera);
const deslocada = Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y, cam1.z - cam0.z);

const rows = await page.evaluate(() => window.__T.rows);
const rebuilds = await page.evaluate(() => window.__W.eventos);
const loaf = await page.evaluate(() => {
  const L = [];
  try {
    for (const e of performance.getEntriesByType('long-animation-frame')) {
      L.push({ start: r1(e.startTime), dur: r1(e.duration), scripts: e.scripts.map((s) => ({ d: r1(s.duration), inv: s.invoker, forced: r1(s.forcedStyleAndLayoutDuration ?? 0) })) });
    }
  } catch { /* sem LoAF */ }
  function r1(v) { return Math.round(v * 10) / 10; }
  return L;
});
const snapFinal = await page.evaluate(() => { const s = window.__hestiaPerf.snapshot(); return { total: s.total, camadas: s.camadas }; });

// Agregação: custo por callback (fonte + atraso + tipo) durante a órbita.
const grupos = new Map();
for (const r of rows) {
  const k = `${r.tipo} atraso=${r.atraso} | ${r.src}`;
  const g = grupos.get(k) ?? { chave: k, tipo: r.tipo, atraso: r.atraso, src: r.src, n: 0, somaMs: 0, maxMs: 0, nome: r.nome };
  g.n++; g.somaMs += r.dur; g.maxMs = Math.max(g.maxMs, r.dur);
  grupos.set(k, g);
}
const topCallbacks = [...grupos.values()].sort((a, b) => b.somaMs - a.somaMs).slice(0, 10).map((g) => ({ ...g, somaMs: r1(g.somaMs), maxMs: r1(g.maxMs) }));
const somaTodos = rows.reduce((a, r) => a + r.dur, 0);

const resultado = {
  cenario: CENARIO, base: BASE, projeto: projetoTipo === 'arquivo' ? 'projeto real (arquivo local, nome omitido)' : projetoTipo,
  quando: new Date().toISOString(), elementos, montagemEstavelMs: tEstavel, duracaoOrbitaMs: orb.duracaoMs, movimentos: orb.movimentos,
  cameraDeslocada: r1(deslocada), callbacksTotal: rows.length, callbacksSomaMs: r1(somaTodos),
  topCallbacks, rebuilds, contadoresFinais: snapFinal, loafEntradas: loaf.length, loafLongos: loaf.map((e) => ({ inicio: e.start, dur: e.dur, scripts: e.scripts.slice(0, 4) })),
  erros,
};
writeFileSync(OUT, JSON.stringify(resultado, null, 2));
console.log(`[${CENARIO}] niveis=${elementos.niveis} paredes=${elementos.paredes} callbacks=${rows.length} soma=${r1(somaTodos)}ms rebuilds=${rebuilds.length}`);
for (const g of topCallbacks) console.log(`  ${g.somaMs} ms (n=${g.n}, max ${g.maxMs}) ${g.chave.slice(0, 200)}`);
for (const e of rebuilds) console.log(`  rebuild t=${e.t}ms ${JSON.stringify(e.camadas)}`);
void iniOrbita; void fimOrbita;
await browser.close();
