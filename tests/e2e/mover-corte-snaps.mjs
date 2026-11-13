// Chrome real: Mover e Copiar no corte e na elevação com o MESMO fluxo da planta (ponto base com snaps, prévia com cota dinâmica,
// destino com snaps ou distância digitada + Enter, Orto, Esc, várias cópias, desfazer e refazer), com escada (e o guarda-corpo
// hospedado), guarda-corpo manual e parede. Contrato de famílias e ferramentas, regra 3 (corte e elevação).
//   URL=http://localhost:5197 CHROME_PATH=... SHOTS=<pasta> [SO=<parte do nome do passo>] node tests/e2e/mover-corte-snaps.mjs
//   (servidor de desenvolvimento do apps/web, porque o roteiro usa ?debug=1 e o serviço do guarda-corpo; rode da raiz do repositório)
import { chromium } from 'playwright-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter, worldToPage } from './helpers.mjs';

const URL_ = process.env.URL ?? 'http://localhost:5197';
const OUT = process.env.SHOTS ?? 'test-results/mover-corte-snaps';
mkdirSync(OUT, { recursive: true });
const ROOT = process.cwd().split(String.fromCharCode(92)).join('/');
const browser = await chromium.launch({ executablePath: chromeExecutable() ?? process.env.CHROME_PATH, args: CHROME_ARGS, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const erros = [];
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) erros.push(m.text()); });
await page.goto(`${URL_}/?debug=1`);
await page.waitForFunction(() => window.__hestia?.servicoGuardaCorpo, null, { timeout: 120000 });
await page.getByText('Novo projeto').first().click({ timeout: 8000 }).catch(() => {});
await page.waitForSelector('.canvas-wrap canvas', { timeout: 60000 });
const rep = makeReporter();
const { check } = rep;
const step = (nome, fn) => (process.env.SO && !nome.includes(process.env.SO) ? Promise.resolve() : rep.step(nome, fn));
const shot = (n) => page.screenshot({ path: path.join(OUT, n) });

// ---------- montagem: escada em L, guarda-corpo hospedado (gc1), guarda-corpo manual (gc2) e uma parede que cruza o corte ----------
async function montar() {
  await page.evaluate(async ({ root }) => {
    const { editor, model: m } = window.__hestia;
    editor.newProject('house2');
    const g = await import(/* @vite-ignore */ `/@fs/${root}/packages/engine/src/stairGenerators.ts`);
    const base = editor.project.levels[0], topo = editor.project.levels[1];
    const sk = g.generateLShape({ start: { x: 30, y: 30 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.28, risersFirst: 9, risersSecond: 9 });
    const comps = sk.map((x, k) => (x.kind === 'run' ? { id: `c${k}`, kind: 'run', ...x.run } : { id: `c${k}`, kind: 'landing', ...x.landing }));
    editor.store.exec({ type: 'addStair', stair: m.makeStair({ id: 'st1', typeId: m.defaultStairTypeId, levelId: base.id, topLevelId: topo?.id, components: comps }) });
    const tipo = Object.keys(editor.project.tiposGuardaCorpo)[0];
    const lado = { lance: true, patamar: true };
    editor.store.exec({ type: 'addGuardaCorpo', guardaCorpo: m.makeGuardaCorpo({ id: 'gc1', levelId: base.id, typeId: tipo, hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
    editor.store.exec({ type: 'addGuardaCorpo', guardaCorpo: m.makeGuardaCorpo({ id: 'gc2', levelId: base.id, typeId: tipo, hospedeiro: { tipo: 'manual', uso: 'livre', ladoDeslocamento: 'centro', caminho: [{ x: 28, y: 33, dz: 0 }, { x: 32, y: 33, dz: 0 }], fechado: false } }) });
    editor.store.exec({ type: 'addWall', wall: m.makeWall({ id: 'wx', typeId: editor.project.defaults.wallTypeId, levelId: base.id, a: { x: 35, y: 27 }, b: { x: 35, y: 34 } }) });
    editor.store.exec({ type: 'addView', view: { id: 'corte1', name: 'corte1', kind: 'section', a: { x: 28, y: 30.3 }, b: { x: 37, y: 30.3 }, depth: 4 } });
    editor.store.exec({ type: 'addView', view: { id: 'elev1', name: 'elev1', kind: 'elevation', a: { x: 28, y: 28.5 }, b: { x: 37, y: 28.5 }, depth: 8 } });
    window.__hestia.useUi.setState({ selection: [], view: 'plan', levelId: base.id });
  }, { root: ROOT });
  await page.waitForTimeout(3000);
}
const estado = () => page.evaluate(() => {
  const p = window.__hestia.editor.project;
  const out = { stairs: [], railings: [], wall: null };
  for (const e of Object.values(p.elements)) {
    if (e.kind === 'stair') out.stairs.push({ id: e.id, x: e.components[0].boundaryLeft[0].a.x, y: e.components[0].boundaryLeft[0].a.y, b: e.baseOffset, t: e.topOffset });
    else if (e.kind === 'railing') out.railings.push({ id: e.id, host: e.hospedeiro.tipo === 'manual' ? null : e.hospedeiro.escadaId, x: e.hospedeiro.tipo === 'manual' ? e.hospedeiro.caminho[0].x : null, cb: e.cotaBase });
    else if (e.id === 'wx') out.wall = { ax: e.a.x, ay: e.a.y, bx: e.b.x, b: e.baseOffset };
  }
  return out;
});
const st = (id, s) => s.stairs.find((x) => x.id === id);
const gc = (id, s) => s.railings.find((x) => x.id === id);
const mudou = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const status = () => page.evaluate(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : s ? JSON.stringify(s) : ''; });
const setSel = (ids) => page.evaluate((ids) => { window.__hestia.editor.setTool('select'); window.__hestia.useUi.setState({ selection: ids }); }, ids);
const setTool = (t) => page.evaluate((t) => window.__hestia.editor.setTool(t), t);
const desfaz = () => page.evaluate(() => window.__hestia.editor.undo());
const refaz = () => page.evaluate(() => window.__hestia.editor.redo());
const num = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const ferramenta = () => page.evaluate(() => { const t = window.__hestia.editor.activeTool; const i = t.inference?.(); return { id: t.id, kind: i?.kind ?? null, point: i?.point ?? null, prompt: t.inputPrompt?.() ?? null, dims: (t.tempDims?.() ?? []).map((d) => d.value), itens: t.preview().reduce((o, it) => ({ ...o, [it.kind]: (o[it.kind] ?? 0) + 1 }), {}) }; });
const abreVista = async (id) => {
  await page.evaluate((id) => window.__hestia.editor.openSection(id), id);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__hestia.editor.zoomExtents?.());
  await page.waitForTimeout(900);
};
const fechaVista = async () => { await page.evaluate(() => window.__hestia.editor.closeSection()); await page.waitForTimeout(500); };
const snapLigado = () => page.evaluate(() => (window.__hestia.useUi.getState().options.snap ?? {}).enabled !== false);

// ---------- vértices dos contornos que a vista desenha (a mesma fonte do snap) ----------
const vertices = (id) => page.evaluate((id) => {
  const h = window.__hestia;
  const res = h.editor.sectionOf(h.useUi.getState().sectionId);
  const rings = [];
  if (id.startsWith('gc')) {
    const pl = res.plano;
    const r = h.servicoGuardaCorpo().corte(h.editor.project, null, pl.a.x, pl.a.y, pl.b.x - pl.a.x, pl.b.y - pl.a.y, pl.depth);
    for (const l of r.linhas) if (l.guardaId === id && l.papel !== 255 && l.pontos.length >= 3) rings.push(l.pontos);
  } else {
    const dono = (o) => o.stairId === id || o.wallId === id;
    for (const c of res.cut) {
      const partes = c.parts && c.parts.length ? c.parts : c.sources.map((o) => ({ origin: o, polygons: c.polygons }));
      for (const pt of partes) if (dono(pt.origin)) for (const poly of pt.polygons) for (const ring of poly) rings.push(ring);
    }
    for (const b of res.beyond) if (dono(b)) for (const poly of b.polygons) for (const ring of poly) rings.push(ring);
  }
  return rings.flat().map((q) => ({ x: q.x, y: q.y }));
}, id);
async function aguardaVertices(id) {
  for (let i = 0; i < 20; i++) {
    const v = await vertices(id);
    if (v.length) return v;
    await page.waitForTimeout(500);
  }
  return vertices(id);
}
const topoDireito = (vs) => vs.reduce((a, q) => (q.y > a.y + 1e-9 || (Math.abs(q.y - a.y) <= 1e-9 && q.x > a.x) ? q : a));
const aPagina = (q) => worldToPage(page, q.x, q.y);
const mira = async (q, dx = 2, dy = 2) => { const p = await aPagina(q); await page.mouse.move(p.x + dx, p.y + dy); await page.waitForTimeout(250); return p; };
const clicaEm = async (q, dx = 2, dy = 2) => { const p = await mira(q, dx, dy); await page.mouse.click(p.x + dx, p.y + dy); await page.waitForTimeout(350); };

await montar();
const inicial = await estado();

for (const vista of ['corte1', 'elev1']) {
  const nome = vista === 'corte1' ? 'Corte' : 'Elevação';

  await step(`${nome}: Mover escada com ponto base e destino por snap (marcadores, prévia, cota dinâmica)`, async () => {
    await montar();
    await abreVista(vista);
    const sv = await aguardaVertices('st1');
    const gv = await aguardaVertices('gc2');
    const A = topoDireito(sv);
    const B = topoDireito(gv);
    await setSel(['st1']);
    const e0 = await estado();
    await setTool('move');
    // Ponto base: o cursor a poucos pixels do vértice; o snap leva o marcador ao vértice exato.
    await mira(A);
    let f = await ferramenta();
    check('base: o snap captura o vértice da escada (marcador de ponta)', f.kind === 'endpoint' && f.point && num(f.point.x, A.x) && num(f.point.y, A.y), JSON.stringify(f));
    await shot(`${vista}-1-base-snap.png`);
    await clicaEm(A);
    check('o primeiro clique só fixa a base (nada muda ainda) e o campo de distância aparece', !mudou(await estado(), e0) && (await ferramenta()).prompt !== null, JSON.stringify(await ferramenta()));
    // Destino: o vértice do guarda-corpo manual.
    await mira(B);
    f = await ferramenta();
    check('destino: o snap captura o vértice do guarda-corpo manual', f.kind === 'endpoint' && f.point && num(f.point.x, B.x) && num(f.point.y, B.y), JSON.stringify(f));
    check('prévia: contornos tracejados deslocados, linha do ponto base ao cursor, rótulo e uma cota dinâmica', (f.itens.polygon ?? 0) >= 3 && f.itens.line === 1 && f.itens.label === 1 && f.dims.length === 1 && num(f.dims[0], Math.hypot(B.x - A.x, B.y - A.y), 1e-6), JSON.stringify(f));
    await shot(`${vista}-2-destino-snap-previa.png`);
    const ms = await page.evaluate(() => { const t = window.__hestia.editor.activeTool; const t0 = performance.now(); for (let i = 0; i < 60; i++) t.move({ raw: { x: 1 + (i % 10) * 0.3, y: 1 + (i % 7) * 0.2 }, shift: false, ctrl: false, alt: false }); return (performance.now() - t0) / 60; });
    check('desempenho: cada movimento do cursor com a prévia da escada e dos guarda-corpos custa pouco', ms < 25, `${ms.toFixed(2)} ms por movimento`);
    await mira(B);
    const p = await aPagina(B);
    await page.mouse.click(p.x + 2, p.y + 2);
    await page.waitForTimeout(500);
    const e1 = await estado();
    check('o deslocamento é exatamente base até o ponto capturado (dt e dz)', num(st('st1', e1).x - st('st1', e0).x, B.x - A.x, 1e-6) && num(st('st1', e1).b, B.y - A.y, 1e-6) && num(st('st1', e1).t, B.y - A.y, 1e-6), `x +${st('st1', e1).x - st('st1', e0).x} (esperado ${B.x - A.x}); b=${st('st1', e1).b} (esperado ${B.y - A.y})`);
    check('o guarda-corpo hospedado segue a escada e o manual não se mexe', gc('gc1', e1).host === 'st1' && JSON.stringify(gc('gc2', e1)) === JSON.stringify(gc('gc2', e0)));
    check('Mover termina o gesto e volta a Selecionar', (await ferramenta()).id === 'select');
    await page.waitForTimeout(2500);
    await shot(`${vista}-3-depois.png`);
    await desfaz();
    check('Desfazer: tudo volta', !mudou(await estado(), e0));
    await refaz();
    check('Refazer: o movimento volta', num(st('st1', await estado()).b, B.y - A.y, 1e-6));
    await desfaz();
  });

  await step(`${nome}: distância digitada + Enter, Orto e Esc`, async () => {
    await montar();
    await abreVista(vista);
    const sv = await aguardaVertices('st1');
    const A = topoDireito(sv);
    const pA = await aPagina(A);
    await setSel(['st1']);
    const e0 = await estado();
    await setTool('move');
    await clicaEm(A);
    await page.mouse.move(pA.x + 140, pA.y - 60);
    await page.waitForTimeout(300);
    await page.keyboard.type('0,5');
    await page.waitForTimeout(250);
    check('o campo de distância digitada aparece na vista (Distância 0,5)', await page.locator('.typebox').count() === 1 && /0,5/.test(await page.locator('.typebox').innerText()), await page.locator('.typebox').allInnerTexts());
    await shot(`${vista}-4-digitar.png`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const e1 = await estado();
    const dt = st('st1', e1).x - st('st1', e0).x;
    const dz = st('st1', e1).b;
    check('digitado 0,5 + Enter: a escada anda exatamente 0,5 m na direção do cursor', num(Math.hypot(dt, dz), 0.5, 1e-6) && dt > 0 && dz > 0, `dt=${dt} dz=${dz}`);
    await desfaz();

    // Orto: horizontal a partir do ponto base.
    await page.keyboard.press('F8');
    await setSel(['st1']);
    await setTool('move');
    await clicaEm(A);
    await page.mouse.move(pA.x + 160, pA.y - 40);
    await page.waitForTimeout(300);
    const fo = await ferramenta();
    check('Orto (F8): o destino trava na horizontal do ponto base', ['ortho', 'nearest', 'endpoint', 'alignment'].includes(fo.kind) && fo.point && num(fo.point.y, A.y), JSON.stringify(fo));
    await shot(`${vista}-5-orto.png`);
    await page.mouse.click(pA.x + 160, pA.y - 40);
    await page.waitForTimeout(400);
    const e2 = await estado();
    check('Orto: a escada anda só ao longo do corte (sem subir)', num(st('st1', e2).b, 0, 1e-9) && st('st1', e2).x - st('st1', e0).x > 0.5);
    await page.keyboard.press('F8');
    await desfaz();

    // Esc: cancela o ponto base sem alterar nada; o segundo Esc sai da ferramenta.
    await setSel(['st1']);
    await setTool('move');
    await clicaEm(A);
    await page.mouse.move(pA.x + 100, pA.y - 80);
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const fe = await ferramenta();
    check('Esc cancela o ponto base: nada muda, sem prévia e sem campo de distância', !mudou(await estado(), e0) && fe.id === 'move' && fe.prompt === null && Object.keys(fe.itens).length === 0, JSON.stringify(fe));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('o segundo Esc sai do Mover', (await ferramenta()).id === 'select');
  });

  await step(`${nome}: Copiar várias cópias com a mesma base, um só desfazer, e guarda-corpo manual`, async () => {
    await montar();
    await abreVista(vista);
    const sv = await aguardaVertices('st1');
    const A = topoDireito(sv);
    const pA = await aPagina(A);
    await setSel(['st1']);
    const e0 = await estado();
    await setTool('copy');
    await clicaEm(A);
    await page.mouse.move(pA.x + 90, pA.y);
    await page.mouse.click(pA.x + 90, pA.y);
    await page.waitForTimeout(400);
    await page.mouse.move(pA.x + 190, pA.y - 30);
    await page.waitForTimeout(250);
    await shot(`${vista}-6-copiar-previa.png`);
    await page.mouse.click(pA.x + 190, pA.y - 30);
    await page.waitForTimeout(500);
    const e1 = await estado();
    check('duas cópias a partir da mesma base: 3 escadas e 2 guarda-corpos hospedados novos', e1.stairs.length === 3 && e1.railings.length === 4, `${e1.stairs.length} escadas, ${e1.railings.length} guarda-corpos`);
    check('a ferramenta continua ativa para mais cópias', (await ferramenta()).id === 'copy' && (await ferramenta()).prompt !== null);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Esc, com cópias feitas, encerra a sessão', (await ferramenta()).id === 'select');
    await desfaz();
    check('um só desfazer leva as duas cópias', !mudou(await estado(), e0), `${(await estado()).stairs.length} escadas`);
    await refaz();
    check('refazer traz as duas', (await estado()).stairs.length === 3);
    await desfaz();
  });

  await step(`${nome}: parede só anda na horizontal (prévia restrita e razão na barra de status)`, async () => {
    await montar();
    await abreVista(vista);
    const wv = await aguardaVertices('wx');
    const A = topoDireito(wv);
    await setSel(['wx']);
    const e0 = await estado();
    await setTool('move');
    await clicaEm(A);
    check('com só parede, a barra explica por que a prévia é horizontal', /parede/i.test(await status()) && /horizontal/i.test(await status()), await status());
    const pA = await aPagina(A);
    await page.mouse.move(pA.x + 120, pA.y - 90);
    await page.waitForTimeout(300);
    const f = await ferramenta();
    check('o ponto capturado fica na horizontal do ponto base', f.point && num(f.point.y, A.y, 1e-6), JSON.stringify(f));
    await shot(`${vista}-7-parede-horizontal.png`);
    await page.mouse.click(pA.x + 120, pA.y - 90);
    await page.waitForTimeout(500);
    const e1 = await estado();
    check('a parede andou ao longo do corte e a cota não mudou', e1.wall && Math.abs(e1.wall.ax - e0.wall.ax) > 0.3 && e1.wall.b === e0.wall.b && e1.wall.ay === e0.wall.ay, JSON.stringify(e1.wall));
    await desfaz();
    check('desfazer devolve a parede', !mudou(await estado(), e0));
  });

  await fechaVista();
}

await step('Sem erros de console nem de página', async () => {
  check('console limpo', erros.length === 0, erros.slice(0, 3).join(' | '));
});
rep.summary();
await browser.close();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
void inicial;
void snapLigado;
