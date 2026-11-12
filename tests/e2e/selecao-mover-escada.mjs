// Chrome real: destaque de seleção e ferramentas Mover, Copiar, Alinhar (e Girar, Espelhar na planta) com escada, guarda-corpo
// hospedado e guarda-corpo manual, na planta, no corte e na elevação (decisão 0055 §25, contrato de famílias e ferramentas, regra 3).
//   URL=http://localhost:5196 CHROME_PATH=... SHOTS=<pasta> [SO=<parte do nome do passo>] node tests/e2e/selecao-mover-escada.mjs
//   (servidor de desenvolvimento do apps/web, porque o roteiro usa ?debug=1 e o serviço do guarda-corpo; rode da raiz do repositório)
import { chromium } from 'playwright-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';
import { decodePng } from './visual.mjs';

const URL_ = process.env.URL ?? 'http://localhost:5196';
const OUT = process.env.SHOTS ?? 'test-results/selecao-mover-escada';
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
// SO=Alinhar roda só os passos cujo nome contém o texto (útil para depurar um deles).
const step = (nome, fn) => (process.env.SO && !nome.includes(process.env.SO) ? Promise.resolve() : rep.step(nome, fn));
const shot = (n) => page.screenshot({ path: path.join(OUT, n) });

// ---------- montagem: escada em L com acabamento, guarda-corpo hospedado (gc1) e guarda-corpo manual (gc2) ----------
async function montar() {
  await page.evaluate(async ({ root }) => {
    const { editor, model: m } = window.__hestia;
    editor.newProject('house2');
    const g = await import(/* @vite-ignore */ `/@fs/${root}/packages/engine/src/stairGenerators.ts`);
    const base = editor.project.levels[0], topo = editor.project.levels[1];
    const baseType = m.DEFAULT_STAIR_TYPES.find((t) => t.id === m.defaultStairTypeId);
    editor.store.exec({ type: 'upsertStairType', stairType: { ...baseType, id: 'stt_acab', treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 } });
    const sk = g.generateLShape({ start: { x: 30, y: 30 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.28, risersFirst: 9, risersSecond: 9 });
    const comps = sk.map((x, k) => (x.kind === 'run' ? { id: `c${k}`, kind: 'run', ...x.run } : { id: `c${k}`, kind: 'landing', ...x.landing }));
    editor.store.exec({ type: 'addStair', stair: m.makeStair({ id: 'st1', typeId: 'stt_acab', levelId: base.id, topLevelId: topo?.id, components: comps }) });
    const tipo = Object.keys(editor.project.tiposGuardaCorpo)[0];
    const lado = { lance: true, patamar: true };
    editor.store.exec({ type: 'addGuardaCorpo', guardaCorpo: m.makeGuardaCorpo({ id: 'gc1', levelId: base.id, typeId: tipo, hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
    editor.store.exec({ type: 'addGuardaCorpo', guardaCorpo: m.makeGuardaCorpo({ id: 'gc2', levelId: base.id, typeId: tipo, hospedeiro: { tipo: 'manual', uso: 'livre', ladoDeslocamento: 'centro', caminho: [{ x: 28, y: 33, dz: 0 }, { x: 32, y: 33, dz: 0 }], fechado: false } }) });
    editor.store.exec({ type: 'addView', view: { id: 'corte1', name: 'corte1', kind: 'section', a: { x: 28, y: 30.3 }, b: { x: 37, y: 30.3 }, depth: 4 } });
    editor.store.exec({ type: 'addView', view: { id: 'elev1', name: 'elev1', kind: 'elevation', a: { x: 28, y: 28.5 }, b: { x: 37, y: 28.5 }, depth: 8 } });
    window.__hestia.useUi.setState({ selection: [], view: 'plan', levelId: base.id });
  }, { root: ROOT });
  await page.waitForTimeout(3000);
}
const estado = () => page.evaluate(() => {
  const p = window.__hestia.editor.project;
  const out = { stairs: [], railings: [] };
  for (const e of Object.values(p.elements)) {
    if (e.kind === 'stair') out.stairs.push({ id: e.id, x: e.components[0].boundaryLeft[0].a.x, y: e.components[0].boundaryLeft[0].a.y, b: e.baseOffset, t: e.topOffset });
    else if (e.kind === 'railing') out.railings.push({ id: e.id, host: e.hospedeiro.tipo === 'manual' ? null : e.hospedeiro.escadaId, x: e.hospedeiro.tipo === 'manual' ? e.hospedeiro.caminho[0].x : null, y: e.hospedeiro.tipo === 'manual' ? e.hospedeiro.caminho[0].y : null, cb: e.cotaBase, lados: e.hospedeiro.lados ? JSON.stringify(e.hospedeiro.lados) : null });
  }
  return out;
});
const st = (id, s) => s.stairs.find((x) => x.id === id);
const gc = (id, s) => s.railings.find((x) => x.id === id);
const mudou = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const status = () => page.evaluate(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : s ? JSON.stringify(s) : ''; });
const selecao = () => page.evaluate(() => window.__hestia.useUi.getState().selection);
const setSel = (ids) => page.evaluate((ids) => { window.__hestia.editor.setTool('select'); window.__hestia.useUi.setState({ selection: ids }); }, ids);
const desfaz = () => page.evaluate(() => window.__hestia.editor.undo());
const refaz = () => page.evaluate(() => window.__hestia.editor.redo());
const num = (a, b, tol = 2e-3) => Math.abs(a - b) <= tol;

// ---------- pixels azuis (cor de seleção) ----------
async function azuis() {
  const buf = await page.screenshot();
  const { w, h, rgba } = decodePng(buf);
  let n = 0;
  for (let y = 215; y < Math.min(h, 800); y++) for (let x = 300; x < Math.min(w, 1390); x++) {
    const i = (y * w + x) * 4;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (b > 180 && b - r > 60 && b - g > 30) n++;
  }
  return n;
}

// ---------- geometria das vistas (corte/elevação) lida do próprio resultado e das linhas do kernel ----------
const geomUmaVez = (id) => page.evaluate((id) => {
  const h = window.__hestia;
  const res = h.editor.sectionOf(h.useUi.getState().sectionId);
  const rings = [];
  if (id.startsWith('gc')) {
    const pl = res.plano;
    const r = h.servicoGuardaCorpo().corte(h.editor.project, null, pl.a.x, pl.a.y, pl.b.x - pl.a.x, pl.b.y - pl.a.y, pl.depth);
    for (const l of r.linhas) if (l.guardaId === id && l.papel !== 255 && l.pontos.length >= 3) rings.push(l.pontos);
  } else {
    const dono = (o) => o.stairId === id;
    for (const c of res.cut) {
      const partes = c.parts && c.parts.length ? c.parts : c.sources.map((o) => ({ origin: o, polygons: c.polygons }));
      for (const pt of partes) if (dono(pt.origin)) for (const poly of pt.polygons) for (const ring of poly) rings.push(ring);
    }
    for (const b of res.beyond) if (dono(b)) for (const poly of b.polygons) for (const ring of poly) rings.push(ring);
  }
  let maxY = -Infinity, minY = Infinity, minX = Infinity, maxX = -Infinity;
  for (const r of rings) for (const q of r) { maxY = Math.max(maxY, q.y); minY = Math.min(minY, q.y); minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); }
  const meio = (fn) => {
    let best = null;
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (!fn(a, b)) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!best || len > best.len) best = { len, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    return best;
  };
  const topo = meio((a, b) => Math.abs(a.y - maxY) < 1e-6 && Math.abs(b.y - maxY) < 1e-6);
  // Maior aresta vertical; em empate (os dois postes), a de maior x: o alinhamento anda pouco e o elemento fica dentro da vista.
  let vert = null;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    if (Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) <= 0.05) continue;
    const len = Math.abs(a.y - b.y);
    if (!vert || len > vert.len + 1e-9 || (Math.abs(len - vert.len) <= 1e-9 && a.x > vert.x)) vert = { len, x: a.x, y: (a.y + b.y) / 2 };
  }
  const qualquer = meio(() => true);
  return { n: rings.length, maxY, minY, minX, maxX, topo, vert, qualquer };
}, id);
/** A vista e o kernel recalculam em segundo plano: espera a geometria do elemento aparecer. */
async function geom(id) {
  for (let i = 0; i < 20; i++) {
    const g = await geomUmaVez(id);
    if (g.n > 0 && g.vert) return g;
    await page.waitForTimeout(500);
  }
  return geomUmaVez(id);
}
const aPagina = (q) => { if (!q) throw new Error('aresta não encontrada na vista'); return worldToPage(page, q.x, q.y); };
const abreVista = async (id) => {
  await page.evaluate((id) => window.__hestia.editor.openSection(id), id);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__hestia.editor.zoomExtents?.());
  await page.waitForTimeout(900);
};
const fechaVista = async () => { await page.evaluate(() => window.__hestia.editor.closeSection()); await page.waitForTimeout(500); };
// pontos de tela onde o clique do corte acerta cada elemento
const pontosDe = () => page.evaluate(async () => {
  const mod = await import('/src/editor/sectionPick.ts');
  const out = {};
  const r = document.querySelector('.canvas-wrap').getBoundingClientRect();
  for (let y = 60; y < r.height - 20; y += 6) for (let x = 60; x < r.width - 20; x += 6) {
    const p = mod.sectionPickAt({ x, y });
    if (p) (out[p.id] ??= []).push([x + r.left, y + r.top]);
  }
  return out;
});
const meioDe = (a) => a[Math.floor(a.length / 2)];
async function arrasta(x, y, dx, dy) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const zoomAtual = () => page.evaluate(() => window.__hestia.editor.viewport().zoom);
const esperaVista = () => page.waitForTimeout(3000);

await montar();
const inicial = await estado();

// =====================================================================================================================
// PLANTA
// =====================================================================================================================
await step('Planta: Mover, Copiar, Girar e Espelhar com escada e guarda-corpo manual (seleção antes)', async () => {
  const vista = () => page.evaluate(() => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); window.__hestia.editor.setViewport({ cx: 32, cy: 31, zoom: 70, width: Math.round(r.width), height: Math.round(r.height) }); });
  const caso = async (ids, ferramenta, passos) => {
    await montar();
    await vista();
    await setSel(ids);
    const antes = await estado();
    await page.evaluate((t) => window.__hestia.editor.setTool(t), ferramenta);
    for (const [x, y] of passos) { await clickWorld(page, x, y); await page.waitForTimeout(250); }
    return { antes, depois: await estado() };
  };
  let r = await caso(['st1'], 'move', [[31, 31], [32, 32]]);
  // A captura (snap) ajusta o ponto clicado em alguns centímetros: a conferência é do deslocamento, não do clique exato.
  check('Mover escada: a escada anda cerca de 1 m em x e y; o guarda-corpo hospedado continua hospedado', num(st('st1', r.depois).x, st('st1', r.antes).x + 1, 0.1) && num(st('st1', r.depois).y, st('st1', r.antes).y + 1, 0.1) && gc('gc1', r.depois).host === 'st1');
  r = await caso(['st1'], 'copy', [[31, 31], [32, 32]]);
  check('Copiar escada: nasce 1 escada e 1 guarda-corpo hospedado na cópia', r.depois.stairs.length === 2 && r.depois.railings.length === 3 && r.depois.railings.some((g) => g.host && g.host !== 'st1'));
  r = await caso(['st1'], 'rotate', [[31, 31], [32, 31], [31, 32]]);
  check('Girar escada: a escada gira', mudou(st('st1', r.antes), st('st1', r.depois)));
  r = await caso(['st1'], 'mirror', [[31, 30], [31, 33]]);
  check('Espelhar escada: nasce o espelho da escada com o guarda-corpo dele', r.depois.stairs.length === 2 && r.depois.railings.length === 3);
  r = await caso(['gc2'], 'move', [[31, 31], [32, 32]]);
  check('Mover guarda-corpo manual', num(gc('gc2', r.depois).x, 29, 0.1) && num(gc('gc2', r.depois).y, 34, 0.1));
  r = await caso(['gc2'], 'copy', [[31, 31], [32, 32]]);
  check('Copiar guarda-corpo manual', r.depois.railings.length === 3);
  r = await caso(['gc2'], 'rotate', [[31, 31], [32, 31], [31, 32]]);
  check('Girar guarda-corpo manual', mudou(gc('gc2', r.antes), gc('gc2', r.depois)));
  r = await caso(['gc2'], 'mirror', [[31, 30], [31, 33]]);
  check('Espelhar guarda-corpo manual', r.depois.railings.length === 3);
});

await step('Planta: guarda-corpo hospedado SOZINHO: Mover, Copiar, Girar e Espelhar recusam com a mensagem do hospedeiro na barra de status', async () => {
  for (const [ferramenta, passos] of [['move', [[31, 31], [32, 32]]], ['copy', [[31, 31], [32, 32]]], ['rotate', [[31, 31], [32, 31], [31, 32]]], ['mirror', [[31, 30], [31, 33]]]]) {
    await montar();
    await page.evaluate(() => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); window.__hestia.editor.setViewport({ cx: 32, cy: 31, zoom: 70, width: Math.round(r.width), height: Math.round(r.height) }); });
    await setSel(['gc1']);
    const antes = await estado();
    await page.evaluate((t) => window.__hestia.editor.setTool(t), ferramenta);
    for (const [x, y] of passos) { await clickWorld(page, x, y); await page.waitForTimeout(250); }
    check(`${ferramenta}: nada muda e a barra diz que o guarda-corpo hospedado segue a escada`, !mudou(antes, await estado()) && /hospedado/.test(await status()) && /escada/.test(await status()), await status());
  }
});

await step('Planta: Alinhar com escada e guarda-corpo (referência e alvo)', async () => {
  await montar();
  await page.evaluate(() => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); window.__hestia.editor.setViewport({ cx: 32, cy: 31, zoom: 70, width: Math.round(r.width), height: Math.round(r.height) }); });
  const antes = await estado();
  await page.evaluate(() => window.__hestia.editor.setTool('align'));
  await clickWorld(page, 30, 33.0); await page.waitForTimeout(300);
  await clickWorld(page, 31, 30.6); await page.waitForTimeout(400);
  const depois = await estado();
  check('Alinhar: o lado da escada vai até o caminho do guarda-corpo manual (y = 33)', num(st('st1', depois).y, 33), `y=${st('st1', depois).y}`);
  await page.evaluate(() => window.__hestia.editor.setTool('align'));
  await clickWorld(page, 31, 30.6); await page.waitForTimeout(300);
  await clickWorld(page, 30, 33.0); await page.waitForTimeout(400);
  check('Alinhar: o guarda-corpo manual vai até a linha da escada', mudou(gc('gc2', depois), gc('gc2', await estado())) || num(gc('gc2', depois).y, st('st1', depois).y));
  void antes;
});

// =====================================================================================================================
// CORTE E ELEVAÇÃO
// =====================================================================================================================
for (const vista of ['corte1', 'elev1']) {
  const nome = vista === 'corte1' ? 'Corte' : 'Elevação';

  await step(`${nome}: destaque de seleção do guarda-corpo e da escada (clique, hover, caixa nos dois sentidos)`, async () => {
    await montar();
    await abreVista(vista);
    const pts = await pontosDe();
    check('o clique do corte acerta escada, guarda-corpo hospedado e guarda-corpo manual', pts.st1 && pts.gc1 && pts.gc2, JSON.stringify(Object.keys(pts)));
    await setSel([]);
    await page.mouse.move(60, 840);
    await page.waitForTimeout(500);
    const base = await azuis();
    for (const id of ['st1', 'gc1', 'gc2']) {
      const [x, y] = meioDe(pts[id]);
      await page.mouse.move(x, y);
      await page.waitForTimeout(450);
      const hover = await azuis();
      check(`${id}: o cursor por cima já realça (contorno de pré-seleção)`, hover - base > 60 && (await page.evaluate(() => window.__hestia.useUi.getState().hover)) === id, `azul +${hover - base}`);
      await page.mouse.click(x, y);
      await page.waitForTimeout(600);
      const com = await azuis();
      check(`${id}: o clique seleciona e a vista pinta o realce de seleção`, (await selecao()).join() === id && com - base > 300, `azul +${com - base}`);
      await shot(`${vista}-${id}-selecionado.png`);
      await page.mouse.click(60, 700);
      await page.waitForTimeout(300);
    }
    // caixa da esquerda para a direita (janela): tudo dentro; da direita para a esquerda (cruzamento): o que toca.
    const todos = Object.values(pts).flat();
    const xs = todos.map((q) => q[0]), ys = todos.map((q) => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 30, Math.max(...xs) + 30, Math.min(...ys) - 30, Math.max(...ys) + 30];
    await setSel([]);
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(500);
    const jan = await selecao();
    check('caixa esquerda→direita (janela) pega escada e os dois guarda-corpos', ['st1', 'gc1', 'gc2'].every((id) => jan.includes(id)), jan.join());
    await shot(`${vista}-caixa-janela.png`);
    await setSel([]);
    const so = pts.gc2.filter((q) => !pts.st1.some((s) => Math.hypot(s[0] - q[0], s[1] - q[1]) < 60) && !pts.gc1.some((s) => Math.hypot(s[0] - q[0], s[1] - q[1]) < 60));
    const [gx, gy] = so[0];
    await page.mouse.move(gx + 12, gy + 10); await page.mouse.down(); await page.mouse.move(gx - 12, gy - 10, { steps: 4 }); await page.mouse.up();
    await page.waitForTimeout(500);
    const cru = await selecao();
    check('caixa direita→esquerda (cruzamento) pega só o guarda-corpo manual que ela toca', cru.join() === 'gc2', cru.join());
    // janela parcial: não pega o que não está inteiro
    await setSel([]);
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move((x0 + x1) / 2, y1, { steps: 4 }); await page.mouse.up();
    await page.waitForTimeout(400);
    check('caixa esquerda→direita parcial não pega a escada inteira', !(await selecao()).includes('st1'), (await selecao()).join());
  });

  await step(`${nome}: destaque com isolar e revelar ocultos`, async () => {
    await montar();
    await abreVista(vista);
    const pts = await pontosDe();
    await setSel(['gc1']);
    await page.mouse.move(60, 840);
    await page.waitForTimeout(500);
    const antes = await azuis();
    await page.evaluate(async () => (await window.__hestia.visibilidade()).temporaryIsolate(['gc1']));
    await page.waitForTimeout(800);
    const iso = await azuis();
    check('isolado o guarda-corpo hospedado, o destaque de seleção continua', iso > 300, `azul ${antes} → ${iso}`);
    await shot(`${vista}-isolado.png`);
    const [x, y] = meioDe(pts.gc2);
    await page.mouse.click(x, y);
    await page.waitForTimeout(500);
    check('o que ficou oculto pelo isolamento não é alvo do clique', !(await selecao()).includes('gc2'), (await selecao()).join());
    await setSel(['gc1']);
    await page.mouse.move(60, 840);
    await page.waitForTimeout(500);
    const iso2 = await azuis();
    await page.evaluate(async () => (await window.__hestia.visibilidade()).toggleRevealHidden());
    await page.waitForTimeout(1000);
    const rev = await azuis();
    check('revelar ocultos: o guarda-corpo oculto ganha contorno azul', rev - iso2 > 200, `azul ${iso2} → ${rev}`);
    await shot(`${vista}-revelar.png`);
    await page.evaluate(async () => { const v = await window.__hestia.visibilidade(); v.toggleRevealHidden(); v.resetTemporaryHidden(); });
  });

  await step(`${nome}: Mover (e Copiar) escada e guarda-corpo, com undo e redo`, async () => {
    await montar();
    await abreVista(vista);
    const pts = await pontosDe();
    const zoom = await zoomAtual();
    const dx = 90, dy = -60;
    const dt = dx / zoom, dz = -dy / zoom;
    // --- escada selecionada: leva o guarda-corpo hospedado junto
    await setSel(['st1']);
    const e0 = await estado();
    await page.evaluate(() => window.__hestia.editor.setTool('move'));
    const [x, y] = meioDe(pts.st1);
    await shot(`${vista}-mover-escada-antes.png`);
    await arrasta(x, y, dx, dy);
    const e1 = await estado();
    check('Mover escada: anda dt ao longo do corte e sobe dz (base e topo)', num(st('st1', e1).x, st('st1', e0).x + dt, 0.02) && num(st('st1', e1).b, dz, 0.02) && num(st('st1', e1).t, dz, 0.02), `x ${st('st1', e0).x}→${st('st1', e1).x} b=${st('st1', e1).b} (esperado dz=${dz.toFixed(3)})`);
    check('Mover escada: o guarda-corpo hospedado continua hospedado na mesma escada (segue sozinho)', gc('gc1', e1).host === 'st1' && gc('gc1', e1).cb === gc('gc1', e0).cb && JSON.stringify(gc('gc2', e1)) === JSON.stringify(gc('gc2', e0)));
    await esperaVista();
    await shot(`${vista}-mover-escada-depois.png`);
    const gDepois = await geom('gc1');
    const gAntes = await (async () => { await desfaz(); await esperaVista(); const g = await geom('gc1'); await refaz(); await esperaVista(); return g; })();
    check('Mover escada: o desenho do guarda-corpo hospedado acompanha (sobe dz)', num(gDepois.maxY - gAntes.maxY, dz, 0.03), `${gAntes.maxY} → ${gDepois.maxY}`);
    await desfaz();
    check('Desfazer: tudo volta', !mudou(await estado(), e0));
    await refaz();
    check('Refazer: o movimento volta', mudou(await estado(), e0) && num(st('st1', await estado()).b, dz, 0.02));
    await desfaz();
    // --- guarda-corpo manual
    await setSel(['gc2']);
    await page.evaluate(() => window.__hestia.editor.setTool('move'));
    const [mx, my] = meioDe(pts.gc2);
    await arrasta(mx, my, dx, dy);
    const e2 = await estado();
    check('Mover guarda-corpo manual: anda dt e sobe dz (cota base)', num(gc('gc2', e2).x, 28 + dt, 0.02) && num(gc('gc2', e2).cb, dz, 0.02), `x=${gc('gc2', e2).x} cb=${gc('gc2', e2).cb}`);
    await desfaz();
    // --- sem seleção: o arraste sobre o elemento o seleciona e move
    await setSel([]);
    await page.evaluate(() => window.__hestia.editor.setTool('move'));
    await arrasta(x, y, dx, dy);
    check('Mover sem seleção: o elemento sob o clique (escada) vira a seleção e anda', (await selecao()).join() === 'st1' && mudou(await estado(), e0));
    await desfaz();
    // --- guarda-corpo hospedado sozinho
    await setSel(['gc1']);
    await page.evaluate(() => window.__hestia.editor.setTool('move'));
    check('hospedado sozinho: a barra já explica ao escolher Mover', /hospedado/.test(await status()) && /escada/.test(await status()), await status());
    const [hx, hy] = meioDe(pts.gc1);
    await arrasta(hx, hy, dx, dy);
    await shot(`${vista}-mover-hospedado-recusa.png`);
    check('hospedado sozinho: nada muda e a mensagem fica na barra de status', !mudou(await estado(), e0) && /hospedado/.test(await status()) && /escada/.test(await status()) && /Nada foi alterado/.test(await status()), await status());
    // --- escada e guarda-corpo hospedado juntos
    await setSel(['st1', 'gc1']);
    await page.evaluate(() => window.__hestia.editor.setTool('move'));
    await arrasta(x, y, dx, dy);
    check('escada + hospedado selecionados: anda como um', num(st('st1', await estado()).x, st('st1', e0).x + dt, 0.02) && (await estado()).railings.length === 2);
    await desfaz();
    // --- Copiar
    await setSel(['st1']);
    await page.evaluate(() => window.__hestia.editor.setTool('copy'));
    check('Copiar entra no corte (ferramenta disponível)', (await page.evaluate(() => window.__hestia.useUi.getState().tool)) === 'copy');
    await arrasta(x, y, dx, dy);
    const e3 = await estado();
    check('Copiar escada: nasce uma escada com o guarda-corpo hospedado dela; a original fica', e3.stairs.length === 2 && e3.railings.length === 3 && num(st('st1', e3).x, st('st1', e0).x) && e3.railings.some((g) => g.host && g.host !== 'st1'));
    const nova = e3.stairs.find((s) => s.id !== 'st1');
    check('Copiar escada: a cópia anda dt e sobe dz', num(nova.x, st('st1', e0).x + dt, 0.02) && num(nova.b, dz, 0.02), `x=${nova.x} b=${nova.b}`);
    await desfaz();
    check('Copiar: desfazer remove a cópia', !mudou(await estado(), e0));
    await refaz();
    check('Copiar: refazer traz a cópia', (await estado()).stairs.length === 2);
    await desfaz();
    await setSel(['gc2']);
    await page.evaluate(() => window.__hestia.editor.setTool('copy'));
    await arrasta(mx, my, dx, dy);
    check('Copiar guarda-corpo manual: nasce outro na posição nova', (await estado()).railings.length === 3 && num(gc('gc2', await estado()).x, 28));
    await desfaz();
    // --- Copiar hospedado sozinho
    await setSel(['gc1']);
    await page.evaluate(() => window.__hestia.editor.setTool('copy'));
    await arrasta(hx, hy, dx, dy);
    check('Copiar hospedado sozinho: recusa com a mensagem e nada nasce', (await estado()).railings.length === 2 && /hospedado/.test(await status()), await status());
  });

  await step(`${nome}: Alinhar com escada e guarda-corpo (referência e alvo)`, async () => {
    // A) referência = topo do guarda-corpo manual; alvo = topo da escada
    await montar();
    await abreVista(vista);
    const gTopo = await geom('gc2');
    let sGeo = await geom('st1');
    await page.evaluate(() => window.__hestia.editor.setTool('align'));
    const e0 = await estado();
    await page.mouse.click(...Object.values(await aPagina(gTopo.topo)));
    await page.waitForTimeout(300);
    check('1º clique: a referência é o topo do guarda-corpo manual', /topo/i.test(await status()) && !/Sem referência/.test(await status()), await status());
    await shot(`${vista}-alinhar-referencia.png`);
    await page.mouse.click(...Object.values(await aPagina(sGeo.topo)));
    await page.waitForTimeout(400);
    const e1 = await estado();
    await esperaVista();
    sGeo = await geom('st1');
    check('Alinhar escada: o topo da escada vai à cota do topo do guarda-corpo manual', num(sGeo.maxY, gTopo.maxY, 0.005), `topo escada ${sGeo.maxY} ref ${gTopo.maxY}`);
    check('Alinhar escada: base e topo da escada sobem juntos e o hospedado segue', num(st('st1', e1).b, st('st1', e1).t) && st('st1', e1).b !== 0 && gc('gc1', e1).host === 'st1');
    await shot(`${vista}-alinhar-escada-depois.png`);
    await desfaz();
    check('Alinhar: desfazer volta', !mudou(await estado(), e0));
    await refaz();
    check('Alinhar: refazer repete', mudou(await estado(), e0));
    await desfaz();
    await esperaVista();

    // B) referência = topo da escada; alvo = topo do guarda-corpo manual (vira o alvo)
    await page.evaluate(() => window.__hestia.editor.setTool('align'));
    sGeo = await geom('st1');
    const g2 = await geom('gc2');
    await page.mouse.click(...Object.values(await aPagina(sGeo.topo)));
    await page.waitForTimeout(300);
    await page.mouse.click(...Object.values(await aPagina(g2.topo)));
    await page.waitForTimeout(400);
    await esperaVista();
    const g2d = await geom('gc2');
    check('Alinhar guarda-corpo manual: o topo dele vai à cota do topo da escada', num(g2d.maxY, sGeo.maxY, 0.005), `topo gc2 ${g2d.maxY} ref ${sGeo.maxY}`);
    await desfaz();
    await esperaVista();

    // C) linha vertical: a maior aresta vertical da escada vai à aresta vertical (poste) do guarda-corpo manual
    await page.evaluate(() => window.__hestia.editor.setTool('align'));
    sGeo = await geom('st1');
    const g2b = await geom('gc2');
    await page.mouse.click(...Object.values(await aPagina(g2b.vert)));
    await page.waitForTimeout(300);
    await page.mouse.click(...Object.values(await aPagina(sGeo.vert)));
    await page.waitForTimeout(400);
    await esperaVista();
    const sGeo2 = await geom('st1');
    check('Alinhar na horizontal: a aresta vertical da escada vai à aresta vertical do guarda-corpo manual', num(sGeo2.vert.x, g2b.vert.x, 0.005) && !num(sGeo.vert.x, g2b.vert.x, 0.01), `escada ${sGeo.vert.x} → ${sGeo2.vert.x}, ref ${g2b.vert.x}`);
    await desfaz();
    await esperaVista();

    // D) guarda-corpo hospedado como REFERÊNCIA vale; como ALVO recusa com a mensagem visível
    await page.evaluate(() => window.__hestia.editor.setTool('align'));
    const g1 = await geom('gc1');
    const g2c = await geom('gc2');
    await page.mouse.click(...Object.values(await aPagina(g2c.topo)));
    await page.waitForTimeout(300);
    const eD = await estado();
    await page.mouse.click(...Object.values(await aPagina(g1.qualquer)));
    await page.waitForTimeout(400);
    check('Alinhar com o hospedado como alvo: nada muda e a barra explica que ele segue a escada', !mudou(eD, await estado()) && /hospedado/.test(await status()) && /escada/.test(await status()), await status());
    await shot(`${vista}-alinhar-hospedado-recusa.png`);
    await page.evaluate(() => window.__hestia.editor.setTool('align'));
    await page.mouse.click(...Object.values(await aPagina(g1.vert)));
    await page.waitForTimeout(300);
    check('Alinhar com o hospedado como referência: a referência é aceita', /elemento/i.test(await status()) && !/Sem referência/.test(await status()), await status());
    await page.mouse.click(...Object.values(await aPagina(g2c.vert)));
    await page.waitForTimeout(400);
    await esperaVista();
    const g2e = await geom('gc2');
    // As duas faces do poste ficam a 2,5 cm uma da outra (menos de 3 px no zoom da vista): o clique pode pegar qualquer uma.
    check('Alinhar guarda-corpo manual pela aresta vertical do hospedado (o manual anda mais de 1 m até o poste)', num(g2e.vert.x, g1.vert.x, 0.03) && g2e.vert.x - g2c.vert.x > 1, `gc2 ${g2c.vert.x} → ${g2e.vert.x}, ref ${g1.vert.x}`);
    await desfaz();
    await fechaVista();
  });
}

await step('Sem erros de console nem de página', async () => {
  check('console limpo', erros.length === 0, erros.slice(0, 3).join(' | '));
});
rep.summary();
await browser.close();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
void inicial;
