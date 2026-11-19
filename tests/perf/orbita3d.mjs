// Medição de quadros ao ORBITAR a câmera 3D. A órbita é Alt + botão esquerdo (ViewportCanvas: `isOrbitReq`); o arrasto
// simulado tem mouse real (Playwright), 3 s de movimento contínuo, 8 px a cada ~16 ms, ida e volta.
// Uso (servidor já no ar, ex.: `vite preview` na 4801 ou `vite` na 4802):
//   PERF_URL=http://127.0.0.1:4801/ PERF_CENARIO=A PERF_PROJETO=predio10 PERF_OUT=/caminho/saida.json node tests/perf/orbita3d.mjs
//   PERF_PROJETO=arquivo:/caminho/projeto.hestia.json  (lido por caminho; o conteúdo só vai para a página, nada é gravado no repo)
//   PERF_MODOS=tempo,contadores (padrão: os dois). "tempo": sem instrumentação (quadros, CDP, LoAF). "contadores": com
//   ?perf=1 (draw calls e triângulos do WebGL, via window.__hestiaPerf); a instrumentação pesa na CPU, então não serve para tempo.
// Saída: JSON (PERF_OUT) e resumo na tela. Não grava imagens.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.PERF_URL ?? 'http://127.0.0.1:4801/';
const CENARIO = process.env.PERF_CENARIO ?? 'avulso';
const PROJETO = process.env.PERF_PROJETO ?? 'predio10';
const OUT = process.env.PERF_OUT ?? 'orbita3d-medida.json';
const MODOS = (process.env.PERF_MODOS ?? 'tempo,contadores').split(',');
const DURACAO_MS = 3000;
const PASSO_MS = 16;
const PASSO_PX = 8;
const AMPLITUDE_PX = 152; // ida e volta de ±152 px em torno do centro do canvas (cabe no viewport de 1600 px)
const exe = [process.env.CHROME_PATH, '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const projetoTexto = PROJETO.startsWith('arquivo:') ? readFileSync(PROJETO.slice('arquivo:'.length), 'utf8') : null;
const projetoTipo = projetoTexto === null ? PROJETO : 'arquivo';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => Math.round(v * 10) / 10;

function stats(a) {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const acima33 = s.filter((x) => x > 33).length;
  return {
    n: s.length, p50: r1(q(0.5)), p95: r1(q(0.95)), p99: r1(q(0.99)), max: r1(s[s.length - 1]),
    media: r1(s.reduce((x, y) => x + y, 0) / s.length),
    acima33, pctAcima33: Math.round((1000 * acima33) / s.length) / 10,
    acima100: s.filter((x) => x > 100).length,
  };
}

// Contagem da cena 3D (sem instrumentação): malhas visíveis ~ chamadas de desenho; triângulos das malhas visíveis.
const contarCena = () => {
  const m = window.__hestia3dModel;
  if (!m) return null;
  const geos = new Set(); const mats = new Set(); const texs = new Set();
  let meshes = 0; let instanciadas = 0; let tris = 0; let verts = 0;
  m.scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.isInstancedMesh) instanciadas++;
    const g = o.geometry;
    geos.add(g.uuid);
    const n = g.index ? g.index.count : g.attributes.position.count;
    tris += (n / 3) * (o.isInstancedMesh ? o.count : 1);
    verts += g.attributes.position.count;
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
      mats.add(mt.uuid);
      for (const k of Object.keys(mt)) { const v = mt[k]; if (v && v.isTexture) texs.add(v.uuid); }
    }
  });
  return { malhasVisiveis: meshes, instanciadas, triangulosVisiveis: Math.round(tris), vertices: verts, geometrias: geos.size, materiais: mats.size, texturas: texs.size };
};

const contarElementos = () => {
  const p = window.__hestia.editor.project;
  const porTipo = {};
  for (const lv of p.levels) for (const [k, v] of Object.entries(lv)) if (Array.isArray(v)) porTipo[k] = (porTipo[k] ?? 0) + v.length;
  return { niveis: p.levels.length, paredes: porTipo.walls ?? 0, porTipo };
};

const camera = () => { const p = window.__hestia3d.camera.position; return { x: p.x, y: p.y, z: p.z }; };

const instalarMedidor = () => {
  const f = { label: null, last: 0, d: {}, loaf: [], loafOk: false, tIni: 0, tFim: 0 };
  window.__f = f;
  const tick = (t) => { if (f.label) (f.d[f.label] ??= []).push(t - f.last); f.last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        f.loaf.push({ start: e.startTime, dur: e.duration, renderStart: e.renderStart, styleStart: e.styleAndLayoutStart,
          scripts: e.scripts.map((s) => ({ d: s.duration, inv: s.invoker, forced: s.forcedStyleAndLayoutDuration })) });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
    f.loafOk = true;
  } catch { f.loafOk = false; }
};

function resumoLoaf(ls) {
  const t = { dur: 0, script: 0, layoutForcado: 0, styleLayout: 0, render: 0 };
  const inv = new Map();
  for (const e of ls) {
    const fim = e.start + e.dur;
    t.dur += e.dur;
    t.script += e.scripts.reduce((a, s) => a + s.d, 0);
    t.layoutForcado += e.scripts.reduce((a, s) => a + (s.forced ?? 0), 0);
    if (e.renderStart && e.styleStart) t.styleLayout += e.renderStart - e.styleStart;
    if (e.renderStart) t.render += fim - e.renderStart;
    for (const s of e.scripts) inv.set(s.inv || '(?)', (inv.get(s.inv || '(?)') ?? 0) + s.d);
  }
  const o = { n: ls.length };
  for (const k of Object.keys(t)) o[k] = r1(t[k]);
  o.topInvocadores = [...inv].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, r1(v)]);
  return o;
}

async function orbitar(page, box, cam0) {
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
    const alvo = t0 + movimentos * PASSO_MS;
    const espera = alvo - Date.now();
    if (espera > 0) await sleep(espera);
  }
  const duracao = Date.now() - t0;
  await page.mouse.up({ button: 'left' });
  await page.keyboard.up('Alt');
  const cam1 = await page.evaluate(camera);
  const deslocada = Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y, cam1.z - cam0.z);
  return { duracaoMs: duracao, movimentos, movimentosPorSeg: r1((movimentos * 1000) / duracao), cameraDeslocada: r1(deslocada) };
}

async function rodar(browser, modo) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error' && erros.length < 20) erros.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { if (erros.length < 20) erros.push(`[pageerror] ${e.message.slice(0, 300)}`); });
  const query = modo === 'contadores' ? '&perf=1&overlay=0' : '';
  await page.goto(`${BASE}?debug=1${query}`);
  await page.waitForFunction(() => window.__hestia, null, { timeout: 180000 });
  await page.evaluate(({ tipo, texto }) => {
    const ed = window.__hestia.editor;
    if (tipo === 'arquivo') ed.load(window.__hestia.model.migrateProject(JSON.parse(texto)), 'projeto.hestia.json');
    else ed.newProject(tipo);
    window.__hestia.useUi.setState({ tela: 'editor' });
  }, { tipo: projetoTipo, texto: projetoTexto });
  await page.waitForSelector('.canvas-wrap canvas', { timeout: 120000 });
  await page.waitForFunction(() => window.__hestia.editor.project.levels.length > 0, null, { timeout: 180000 });
  await sleep(1500);
  const elementos = await page.evaluate(contarElementos);

  // Vista 3D (useUi.view, como o próprio app faz) e espera a montagem ficar estável (contagem de malhas igual por 3 leituras).
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
  const cena = await page.evaluate(contarCena);
  await sleep(500);

  const box = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  await page.evaluate(instalarMedidor);
  const fase = (label) => page.evaluate((l) => {
    const f = window.__f;
    f.label = l;
    f.last = performance.now();
    if (l) f.tIni = f.last; else f.tFim = f.last;
  }, label);

  await fase('ocioso'); await sleep(2000); await fase(null);
  const ociosoDts = await page.evaluate(() => window.__f.d.ocioso ?? []);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metricas = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

  const cam0 = await page.evaluate(camera);
  const m0 = await metricas();
  await fase('orbita');
  const orb = await orbitar(page, box, cam0);
  await fase(null);
  const m1 = await metricas();
  await sleep(300);

  const dts = await page.evaluate(() => window.__f.d.orbita ?? []);
  const loafTodos = await page.evaluate(() => window.__f.loaf.filter((e) => e.start >= window.__f.tIni && e.start <= window.__f.tFim));
  const loafOk = await page.evaluate(() => window.__f.loafOk);
  const seg = orb.duracaoMs / 1000;
  const porQuadro = (k) => (dts.length ? r1(((m1[k] - m0[k]) * 1000) / dts.length) : null);
  const contadores = modo === 'contadores' ? await page.evaluate(() => {
    const s = window.__hestiaPerf?.snapshot?.();
    if (!s) return null;
    return { ativo: s.ativo, backend: s.backend, janela: s.janela, total: s.total, indisponiveis: s.indisponiveis };
  }) : null;
  const heapMB = r1((m1.JSHeapUsedSize ?? 0) / 1048576);
  const resultado = {
    cenario: CENARIO, modo, url: BASE, projeto: projetoTipo === 'arquivo' ? 'projeto real (arquivo local, nome omitido)' : projetoTipo,
    navegador: await browser.version(), quando: new Date().toISOString(),
    elementos, cena, montagemEstavelMs: tEstavel,
    ocioso: { frames: stats(ociosoDts) },
    orbita: {
      ...orb,
      quadrosPorSeg: r1(dts.length / seg),
      frames: stats(dts),
      porQuadroMs: { script: porQuadro('ScriptDuration'), layout: porQuadro('LayoutDuration'), recalcEstilo: porQuadro('RecalcStyleDuration'), tarefaPrincipal: porQuadro('TaskDuration') },
      threadPrincipalOcupadaPct: r1((100 * ((m1.TaskDuration - m0.TaskDuration) / seg))),
      heapMB,
      loafDisponivel: loafOk,
      loafSoQuadrosLongos: resumoLoaf(loafTodos),
    },
    contadores,
    erros,
  };
  await page.close();
  return resultado;
}

const browser = await chromium.launch({ executablePath: exe, args: ARGS });
const resultados = [];
for (const modo of MODOS) resultados.push(await rodar(browser, modo));
await browser.close();
writeFileSync(OUT, JSON.stringify({ cenario: CENARIO, base: BASE, projeto: resultados[0]?.projeto, resultados }, null, 2));
for (const r of resultados) {
  const f = r.orbita.frames;
  console.log(`[${CENARIO}/${r.modo}] niveis=${r.elementos.niveis} paredes=${r.elementos.paredes} malhas=${r.cena?.malhasVisiveis} tris=${r.cena?.triangulosVisiveis} camara=${r.orbita.cameraDeslocada}`);
  if (f) console.log(`  quadros=${f.n} p50=${f.p50} p95=${f.p95} p99=${f.p99} max=${f.max} >33ms=${f.pctAcima33}% (${f.acima33}) >100ms=${f.acima100}`);
  console.log(`  por quadro (ms): ${JSON.stringify(r.orbita.porQuadroMs)} thread=${r.orbita.threadPrincipalOcupadaPct}% ocioso p50=${r.ocioso.frames?.p50}`);
  if (r.contadores) console.log(`  contadores: ${JSON.stringify(r.contadores.total)}`);
  if (r.erros.length) console.log(`  erros: ${r.erros.length} (ex.: ${r.erros[0]})`);
}
