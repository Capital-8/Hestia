// Mede, no Chrome real, o tempo do clique na caixa "Guarda-corpo" (painel da escada) até o quadro desenhado, na planta e no 3D.
//   URL=http://localhost:5182 CHROME_PATH=... node tests/e2e/gc-ligar-tempo.mjs [l|caracol]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CHROME_ARGS, chromeExecutable } from './helpers.mjs';

const URL_ = process.env.URL ?? 'http://localhost:5182';
const forma = process.argv[2] ?? 'l';
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
// Escada com a forma pedida, num canto livre do térreo.
const root = process.cwd().split(String.fromCharCode(92)).join('/');
await page.evaluate(async ({ root, forma }) => {
  const { editor, model: m } = window.__hestia;
  const g = await import(/* @vite-ignore */ `/@fs/${root}/packages/engine/src/stairGenerators.ts`);
  const sp = await import(/* @vite-ignore */ `/@fs/${root}/packages/engine/src/stairSpiral.ts`);
  const p = editor.project;
  const base = p.levels[0], topo = p.levels[1];
  let comps;
  if (forma === 'l') {
    const sk = g.generateLShape({ start: { x: 30, y: 30 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.28, risersFirst: 9, risersSecond: 9 });
    comps = sk.map((x, k) => (x.kind === 'run' ? { id: `c${k}`, kind: 'run', ...x.run } : { id: `c${k}`, kind: 'landing', ...x.landing }));
  } else {
    const r = sp.generateSpiralRun({ center: { x: 30, y: 30 }, rInner: 0.1, rOuter: 1, startAngle: 0, sweep: (540 * Math.PI) / 180, risers: 19 });
    comps = [{ id: 'c0', kind: 'run', ...r }];
  }
  editor.store.exec({ type: 'addStair', stair: m.makeStair({ id: 'st_bench', typeId: m.defaultStairTypeId, levelId: base.id, topLevelId: topo?.id, components: comps }) });
}, { root, forma });
await page.waitForTimeout(800);
console.log('kernel pronto:', await page.evaluate(() => window.__hestia.servicoGuardaCorpo().pronto()));

async function medir(vista, perfil) {
  await page.evaluate((v) => { window.__hestia.useUi.setState({ selection: [], view: v }); }, vista);
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.__hestia.useUi.setState({ selection: ['st_bench'] }));
  await page.waitForSelector('#p-sgc');
  await page.waitForTimeout(500);
  if (perfil) await perfil.send('Profiler.start');
  const r = await page.evaluate(() => new Promise((resolve) => {
    const tasks = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => tasks.push([e.startTime, e.duration]))).observe({ entryTypes: ['longtask'] });
    const box = document.querySelector('#p-sgc');
    const out = {};
    box.addEventListener('click', () => {
      const t0 = performance.now();
      out.t0 = t0;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        out.doisQuadros = performance.now() - t0;
        out.painel = !!document.querySelector('#p-sgc')?.checked;
      }));
      setTimeout(() => {
        out.tarefasLongas = tasks.filter(([s]) => s >= t0 - 5).map(([s, d]) => [Math.round(s - t0), Math.round(d)]);
        const ultimo = out.tarefasLongas.reduce((a, [s, d]) => Math.max(a, s + d), 0);
        out.ate_ultima_tarefa = ultimo;
        resolve(out);
      }, 2500);
    }, { capture: true, once: true });
    box.click();
  }));
  return r;
}
const perfil = process.env.PROFILE ? await page.context().newCDPSession(page) : null;
for (const v of (process.env.VISTAS ?? 'plan,3d').split(',')) {
  if (perfil) { await perfil.send('Profiler.enable'); await perfil.send('Profiler.setSamplingInterval', { interval: 200 }); }
  const prep = perfil ? (async () => {})() : null;
  const r = await medir(v, perfil);
  if (perfil) {
    const { profile } = await perfil.send('Profiler.stop');
    const por = new Map(); const nos = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas; const incl = new Map();
    const pai = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) pai.set(c, n.id);
    profile.samples.forEach((id, i) => {
      const d = (dt[i] ?? 0) / 1000; const n = nos.get(id);
      const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-1)[0]}:${n.callFrame.lineNumber}`;
      por.set(k, (por.get(k) ?? 0) + d);
      const vistos = new Set();
      for (let c = id; c !== undefined; c = pai.get(c)) { const m = nos.get(c); const kk = `${m.callFrame.functionName || '(anon)'} ${m.callFrame.url.split('/').slice(-1)[0]}:${m.callFrame.lineNumber}`; if (!vistos.has(kk)) { vistos.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + d); } }
    });
    const SEP = String.fromCharCode(10) + '   ';
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join(SEP);
    console.log(`--- ${v} proprio:${SEP}${top(por, 12)}${String.fromCharCode(10)}--- ${v} inclusivo:${SEP}${top(new Map([...incl].filter(([k]) => /.tsx?:/.test(k) && !/react|three.js/.test(k))), 60)}`);
  }
  console.log(`[CHROME ${forma} ${v}] ate dois quadros: ${r.doisQuadros?.toFixed(0)} ms | ate fim da ultima tarefa longa: ${r.ate_ultima_tarefa} ms | tarefas longas (inicio,dur): ${JSON.stringify(r.tarefasLongas)} | caixa marcada: ${r.painel}`);
  // desliga para a proxima vista
  await page.evaluate(() => document.querySelector('#p-sgc')?.click());
  await page.waitForTimeout(1500);
}
if (erros.length) console.log('erros:', erros.slice(0, 3));
await browser.close();
