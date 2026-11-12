// Redesenho de cotas (feat/cotas) no app real: caixa de seleção e pan no corte, cota linear selecionável com alça e Delete,
// cota angular gravada na vista, cota associativa com editor de valor (cota dirigida), estilo global e snap de escada no corte.
//   npm run build && CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe' node tests/e2e/cotas.mjs
import { mkdirSync } from 'node:fs';
import { clickWorld, launch, makeReporter, openApp, pressTool, worldToPage } from './helpers.mjs';

const OUT = process.env.SHOTS ?? 'test-results/shots';
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const { page, errors } = await openApp(browser, { query: '?gl=1&debug=1', width: 1440, height: 860 });
const r = makeReporter();
const skipped = [];
/** Caso impossível de automatizar: fica registrado como pulado, com o motivo, e entra na lista final. */
const pular = (nome, motivo) => { skipped.push(`${nome}: ${motivo}`); console.log(`  PULADO ${nome} (${motivo})`); };

const vp = () => page.evaluate(() => { const v = window.__hestia.editor.viewport(); return { cx: v.cx, cy: v.cy, zoom: v.zoom }; });
const ui = () => page.evaluate(() => { const s = window.__hestia.useUi.getState(); return { view: s.view, tool: s.tool, selection: [...s.selection], hover: s.hover, status: s.status, dialog: s.dialog, dimEditId: s.dimEditId }; });
const secAnn = (id) => page.evaluate((i) => {
  const v = window.__hestia.editor.project.views.find((x) => x.id === i);
  const a = v?.annotations;
  return { dims: (a?.dimensions ?? []).map((d) => ({ id: d.id, a: d.a, b: d.b, offset: d.offset, mode: d.mode, angular: !!d.angular })), total: a ? Object.values(a).reduce((n, l) => n + l.length, 0) : 0 };
}, id);
const levelDimCount = () => page.evaluate(() => window.__hestia.model.levelDimensions(window.__hestia.editor.project, 'lv_0').length);
const pageToWorld = async (px, py) => {
  const v = await page.evaluate(() => {
    const el = document.querySelector('.canvas-wrap').getBoundingClientRect();
    const w = window.__hestia.editor.viewport();
    return { left: el.x, top: el.y, cx: w.cx, cy: w.cy, zoom: w.zoom, width: w.width, height: w.height };
  });
  return { x: v.cx + (px - v.left - v.width / 2) / v.zoom, y: v.cy - (py - v.top - v.height / 2) / v.zoom };
};
const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(80); };
const abrirCorte = (extra = '') => page.evaluate((extraSrc) => {
  const { editor } = window.__hestia;
  editor.newProject('house2');
  if (extraSrc) new Function('editor', 'window', extraSrc)(editor, window);
  editor.store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte A', kind: 'section', a: { x: -2, y: 2 }, b: { x: 9, y: 2 }, depth: 6 } });
  editor.openSection('sv1');
}, extra);

// ---------------------------------------------------------------------------------------------------------------- (a)
await r.step('(a) corte: botão esquerdo no vazio faz caixa (seleciona) e não move a vista; botão do meio faz pan', async () => {
  await abrirCorte();
  await page.waitForTimeout(800);
  const box = await page.locator('.canvas-wrap').boundingBox();
  const v0 = await vp();
  // Esquerda → direita, de um canto vazio até o canto oposto: caixa em modo janela cobrindo o corte inteiro.
  const x0 = box.x + 6, y0 = box.y + 6, x1 = box.x + box.width - 6, y1 = box.y + box.height - 6;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 6 });
  await page.mouse.move(x1, y1, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const v1 = await vp();
  const s1 = await ui();
  r.check('vista não mudou com o arrasto do esquerdo', Math.abs(v1.cx - v0.cx) < 1e-9 && Math.abs(v1.cy - v0.cy) < 1e-9 && Math.abs(v1.zoom - v0.zoom) < 1e-9, JSON.stringify([v0, v1]));
  r.check('caixa selecionou elementos', s1.selection.length > 0, `${s1.selection.length} ids`);
  await page.screenshot({ path: `${OUT}/70-corte-caixa.png` });
  // Limpa a seleção e faz pan com o botão do meio.
  await press('Escape');
  await page.mouse.move(box.x + box.width / 2, box.y + 14);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + 74, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(150);
  const v2 = await vp();
  r.check('botão do meio moveu a vista (pan)', Math.hypot(v2.cx - v1.cx, v2.cy - v1.cy) > 1e-3, JSON.stringify([v1, v2]));
  r.check('pan não selecionou nada', (await ui()).selection.length === 0, `${(await ui()).selection.length}`);
});

// ---------------------------------------------------------------------------------------------------------------- (b)
await r.step('(b) corte: cota linear — hover, seleção, alça do meio muda offset, Delete remove, Ctrl+Z restaura', async () => {
  await abrirCorte();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__hestia.editor.setTool('dimension'));
  // Dois pontos no vazio acima da casa (sem snap a elementos) e depois o lado da linha.
  const v = await page.evaluate(() => { const w = window.__hestia.editor.viewport(); return { cx: w.cx, cy: w.cy, zoom: w.zoom, width: w.width, height: w.height }; });
  const topY = v.cy + (v.height / 2 - 40) / v.zoom;
  await clickWorld(page, v.cx - 1.5, topY);
  await clickWorld(page, v.cx + 1.5, topY);
  await clickWorld(page, v.cx, topY - 0.5);
  await page.waitForTimeout(200);
  const s0 = await secAnn('sv1');
  r.check('cota gravada na vista', s0.dims.length === 1 && !s0.dims[0].angular, JSON.stringify(s0.dims));
  const d = s0.dims[0];
  await page.evaluate(() => window.__hestia.editor.setTool('select'));
  await page.evaluate(() => window.__hestia.useUi.setState({ selection: [] }));
  // Meio da linha de cota: ponto médio + normal * offset (normal à esquerda de a→b).
  const mid = (dd) => {
    const dx = dd.b.x - dd.a.x, dy = dd.b.y - dd.a.y, l = Math.hypot(dx, dy);
    return { x: (dd.a.x + dd.b.x) / 2 + (-dy / l) * dd.offset, y: (dd.a.y + dd.b.y) / 2 + (dx / l) * dd.offset, n: { x: -dy / l, y: dx / l } };
  };
  const m0 = mid(d);
  const p0 = await worldToPage(page, m0.x, m0.y);
  await page.mouse.move(p0.x - 40, p0.y + 40);
  await page.mouse.move(p0.x, p0.y, { steps: 4 });
  await page.waitForTimeout(250);
  r.check('hover realça a cota', (await ui()).hover === d.id, String((await ui()).hover));
  await page.mouse.click(p0.x, p0.y);
  await page.waitForTimeout(150);
  r.check('clique seleciona a cota', JSON.stringify((await ui()).selection) === JSON.stringify([d.id]), JSON.stringify((await ui()).selection));
  await page.screenshot({ path: `${OUT}/71-corte-cota-selecionada.png` });
  // Alça do meio: arrasta 0,4 m ao longo da normal.
  const t = await worldToPage(page, m0.x + m0.n.x * 0.4, m0.y + m0.n.y * 0.4);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move((p0.x + t.x) / 2, (p0.y + t.y) / 2, { steps: 4 });
  await page.mouse.move(t.x, t.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const s1 = await secAnn('sv1');
  r.check('offset mudou ~ +0,4 m', s1.dims.length === 1 && Math.abs(s1.dims[0].offset - (d.offset + 0.4)) < 0.05, `${d.offset} → ${s1.dims[0]?.offset}`);
  r.check('a, b intactos', JSON.stringify(s1.dims[0].a) === JSON.stringify(d.a) && JSON.stringify(s1.dims[0].b) === JSON.stringify(d.b));
  await press('Delete');
  const s2 = await secAnn('sv1');
  r.check('Delete removeu a cota', s2.dims.length === 0, `${s2.dims.length}`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const s3 = await secAnn('sv1');
  r.check('Ctrl+Z restaurou a cota', s3.dims.length === 1 && Math.abs(s3.dims[0].offset - s1.dims[0].offset) < 1e-9, JSON.stringify(s3.dims.map((x) => x.offset)));
});

// ---------------------------------------------------------------------------------------------------------------- (c)
await r.step('(c) corte: cota angular entre duas arestas grava na vista, não no nível', async () => {
  await abrirCorte();
  await page.waitForTimeout(700);
  const antesNivel = await levelDimCount();
  const arestas = await page.evaluate(() => {
    const { editor, sectionSnapIndex } = window.__hestia;
    const idx = sectionSnapIndex(editor.sectionOf('sv1'));
    const v = editor.viewport();
    const dentro = (p) => Math.abs(p.x - v.cx) < v.width / 2 / v.zoom * 0.9 && Math.abs(p.y - v.cy) < v.height / 2 / v.zoom * 0.9;
    const len = (s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const h = idx.tracks.filter((t) => t.axis === 'h' && len(t) > 1.5 && dentro(t.a) && dentro(t.b)).sort((x, y) => len(y) - len(x))[0];
    const vt = idx.tracks.filter((t) => t.axis === 'v' && len(t) > 1.2 && dentro(t.a) && dentro(t.b)).sort((x, y) => len(y) - len(x))[0];
    return h && vt ? { h, v: vt, total: idx.tracks.length } : { total: idx.tracks.length };
  });
  if (!arestas.h) throw new Error(`sem aresta horizontal/vertical visível (${arestas.total} trilhas)`);
  const hm = { x: arestas.h.a.x + (arestas.h.b.x - arestas.h.a.x) * 0.35, y: arestas.h.a.y + (arestas.h.b.y - arestas.h.a.y) * 0.35 };
  const vm = { x: arestas.v.a.x + (arestas.v.b.x - arestas.v.a.x) * 0.35, y: arestas.v.a.y + (arestas.v.b.y - arestas.v.a.y) * 0.35 };
  const encontro = { x: arestas.v.a.x, y: arestas.h.a.y };
  await page.evaluate(() => window.__hestia.editor.setTool('angularDimension'));
  await clickWorld(page, hm.x, hm.y);
  await clickWorld(page, vm.x, vm.y);
  const sgn = (a, b) => (a >= b ? 1 : -1);
  await clickWorld(page, encontro.x + 0.5 * sgn(hm.x, encontro.x), encontro.y + 0.5 * sgn(vm.y, encontro.y));
  await page.waitForTimeout(250);
  const s = await secAnn('sv1');
  r.check('cota angular na vista (SectionView.annotations)', s.dims.length === 1 && s.dims[0].angular, JSON.stringify(s.dims.map((x) => x.angular)));
  r.check('nada gravado no nível', (await levelDimCount()) === antesNivel, `${antesNivel} → ${await levelDimCount()}`);
  await page.screenshot({ path: `${OUT}/72-corte-angular.png` });
});

// ---------------------------------------------------------------------------------------------------------------- (d)
const planaComPorta = () => page.evaluate(() => {
  const { editor, useUi } = window.__hestia;
  editor.newProject('house2');
  const p = editor.project;
  const doors = Object.values(p.elements).filter((e) => e.kind === 'door');
  const door = doors.find((d) => p.elements[d.hostId]?.levelId === 'lv_0') ?? doors[0];
  if (!door) return null;
  useUi.setState({ view: 'plan', planViewId: 'pv_' + p.elements[door.hostId].levelId, levelId: p.elements[door.hostId].levelId, sectionId: null, selection: [], dialog: null });
  const wall = p.elements[door.hostId];
  editor.zoomExtents();
  return { doorId: door.id, wallId: wall.id, levelId: wall.levelId };
});
let planaInfo = null;
await r.step('(d) planta: cota associativa face da parede ↔ borda da porta; duplo clique abre o editor; novo valor move; 1 Ctrl+Z; valor impossível recusa', async () => {
  planaInfo = await planaComPorta();
  if (!planaInfo) throw new Error('a casa de exemplo não tem porta');
  const { doorId, wallId } = planaInfo;
  // Zoom na parede: pontos de mundo das duas feições.
  const pts = await page.evaluate(({ doorId, wallId }) => {
    const { editor, model } = window.__hestia;
    const p = editor.project;
    const a = model.resolveDimRef(p, { elementId: wallId, feature: 'wall-face-lo' });
    const b = model.resolveDimRef(p, { elementId: doorId, feature: 'opening-edge-a' });
    const w = p.elements[wallId];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    editor.setViewport?.({ cx: mx, cy: my, zoom: 140 });
    return { a, b, wallLen: Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) };
  }, { doorId, wallId });
  console.log(`  pontos: ${JSON.stringify(pts)}`);
  await page.waitForTimeout(300);
  const antes = await levelDimCount();
  await page.evaluate(() => window.__hestia.editor.setTool('dimension'));
  // A face fica a meia espessura do eixo: a cota alinhada seria oblíqua à parede, então mede-se na direção da parede.
  const wd = await page.evaluate((id) => { const w = window.__hestia.editor.project.elements[id]; return Math.abs(w.b.x - w.a.x) >= Math.abs(w.b.y - w.a.y) ? 'horizontal' : 'vertical'; }, wallId);
  await page.getByLabel('Direção').selectOption(wd);
  await clickWorld(page, pts.a.x, pts.a.y);
  await clickWorld(page, pts.b.x, pts.b.y);
  // Lado da linha: perpendicular à parede (0,5 m).
  const dx = pts.b.x - pts.a.x, dy = pts.b.y - pts.a.y, l = Math.hypot(dx, dy);
  await clickWorld(page, (pts.a.x + pts.b.x) / 2 - (dy / l) * 0.5, (pts.a.y + pts.b.y) / 2 + (dx / l) * 0.5);
  await page.waitForTimeout(250);
  const dim = await page.evaluate(() => {
    const { editor, model } = window.__hestia;
    const ds = model.levelDimensions(editor.project, editor.store.project.levels[0].id);
    const d = ds[ds.length - 1];
    if (!d) return null;
    const pp = model.dimensionPoints(editor.project, d);
    return { id: d.id, a: pp.a, b: pp.b, offset: d.offset, refs: d.refs ?? null, value: model.dimensionValue(editor.project, d) };
  });
  r.check('cota criada no nível', (await levelDimCount()) === antes + 1 && !!dim, `${antes} → ${await levelDimCount()}`);
  r.check('refs associativas preenchidas (a e b)', !!dim?.refs?.a && !!dim?.refs?.b, JSON.stringify(dim?.refs));
  if (!dim?.refs?.a || !dim?.refs?.b) { pular('(d) edição de valor', 'os cliques não capturaram as refs; resto do caso depende delas'); return; }
  await page.evaluate(() => window.__hestia.editor.setTool('select'));
  await page.evaluate(() => window.__hestia.useUi.setState({ selection: [] }));
  const n = { x: -(dim.b.y - dim.a.y), y: dim.b.x - dim.a.x };
  const nl = Math.hypot(n.x, n.y);
  const meio = { x: (dim.a.x + dim.b.x) / 2 + (n.x / nl) * dim.offset, y: (dim.a.y + dim.b.y) / 2 + (n.y / nl) * dim.offset };
  const pm = await worldToPage(page, meio.x, meio.y);
  const modelo = () => page.evaluate(() => JSON.stringify(window.__hestia.editor.project.elements));
  const valorDaCota = () => page.evaluate((id) => {
    const { editor, model } = window.__hestia;
    const d = model.levelDimensions(editor.project, editor.project.levels[0].id).find((x) => x.id === id);
    return d ? model.dimensionValue(editor.project, d) : null;
  }, dim.id);
  const base = await modelo();
  await page.mouse.move(pm.x, pm.y);
  await page.mouse.dblclick(pm.x, pm.y);
  await page.waitForSelector('input[aria-label="Valor da cota"]', { timeout: 3000 });
  r.check('duplo clique abriu o DimValueEditor', (await ui()).dimEditId === dim.id, String((await ui()).dimEditId));
  const texto = await page.inputValue('input[aria-label="Valor da cota"]');
  console.log(`  valor no campo: "${texto}" (modelo: ${dim.value})`);
  // Valor impossível primeiro: bem maior que a parede. Deve recusar e deixar o modelo igual.
  const imp = String((pts.wallLen + 8).toFixed(2)).replace('.', ',');
  await page.fill('input[aria-label="Valor da cota"]', imp);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const stRecusa = await ui();
  r.check('valor impossível: modelo inalterado', (await modelo()) === base);
  r.check('valor impossível: recusa visível (editor segue aberto + status)', stRecusa.dimEditId === dim.id && stRecusa.status.length > 0, stRecusa.status);
  // Valor possível: +0,10 m.
  const novo = Math.round((dim.value + 0.1) * 100) / 100;
  await page.fill('input[aria-label="Valor da cota"]', String(novo).replace('.', ','));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const valor = await valorDaCota();
  r.check('valor da cota passou a ser o digitado', valor !== null && Math.abs(valor - novo) < 0.006, `${dim.value} → ${valor} (pedido ${novo})`);
  const depois = await modelo();
  r.check('porta/parede se moveram', depois !== base);
  r.check('editor fechou', (await ui()).dimEditId === null);
  await page.screenshot({ path: `${OUT}/73-cota-dirigida.png` });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  r.check('um único Ctrl+Z desfaz o ajuste (valor e modelo iguais aos de antes)', (await modelo()) === base && Math.abs((await valorDaCota()) - dim.value) < 0.006, `${await valorDaCota()} (antes ${dim.value})`);
});

// ---------------------------------------------------------------------------------------------------------------- (e)
await r.step('(e) diálogo de estilo: marcador e altura do texto mudam o desenho das cotas e persistem', async () => {
  // Reaproveita a planta do caso (d): se a cota ainda existe (Ctrl+Z desfaz só o ajuste), basta; senão cria uma por comando.
  const temCota = await levelDimCount();
  if (temCota === 0) {
    await page.evaluate(() => {
      const { editor, model } = window.__hestia;
      editor.store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dx1', a: { x: 1, y: 1 }, b: { x: 4, y: 1 }, offset: 0.6 } });
      void model;
    });
  }
  await page.evaluate(() => { window.__hestia.editor.zoomExtents(); window.__hestia.useUi.setState({ selection: [], hover: null }); });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  const canvas = page.locator('.canvas-wrap');
  const antesPng = await canvas.screenshot({ path: `${OUT}/74a-planta-estilo-antes.png` });
  const estilo0 = await page.evaluate(() => ({ ...(window.__hestia.editor.project.settings.dimensionStyle ?? {}) }));
  await page.evaluate(() => window.__hestia.useUi.setState({ dialog: 'dimensions', dialogArg: null }));
  await page.waitForSelector('text=Cotas do projeto');
  await page.getByRole('tab', { name: 'Estilo das cotas' }).click();
  await page.selectOption('#dst-tick', 'dot');
  await page.fill('#dst-textHeight', '5');
  await page.screenshot({ path: `${OUT}/74-dialogo-estilo.png` });
  await page.getByRole('button', { name: 'OK' }).click();
  await page.waitForTimeout(1200);
  console.log(`  diálogo: ${(await ui()).dialog}`);
  const estilo1 = await page.evaluate(() => ({ ...window.__hestia.editor.project.settings.dimensionStyle }));
  r.check('estilo no projeto: marcador "dot"', estilo1.tick === 'dot', `${estilo0.tick} → ${estilo1.tick}`);
  r.check('estilo no projeto: texto 5 mm', estilo1.textHeight === 5, `${estilo0.textHeight} → ${estilo1.textHeight}`);
  const depoisPng = await canvas.screenshot({ path: `${OUT}/74b-planta-estilo-depois.png` });
  const diferentes = await page.evaluate(async ([a, b]) => {
    const load = async (s) => { const i = new Image(); i.src = `data:image/png;base64,${s}`; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const x = await load(a), y = await load(b);
    let n = 0;
    for (let k = 0; k < x.length; k += 4) if (Math.abs(x[k] - y[k]) + Math.abs(x[k + 1] - y[k + 1]) + Math.abs(x[k + 2] - y[k + 2]) > 30) n++;
    return n;
  }, [antesPng.toString('base64'), depoisPng.toString('base64')]);
  r.check('o desenho da planta mudou (pixels diferentes)', diferentes > 20, `${diferentes} px`);
  await page.screenshot({ path: `${OUT}/75-planta-estilo-novo.png` });
  const viaJson = await page.evaluate(() => JSON.parse(JSON.stringify(window.__hestia.editor.project)).settings.dimensionStyle);
  r.check('persiste na serialização do projeto', viaJson.tick === 'dot' && viaJson.textHeight === 5, JSON.stringify([viaJson.tick, viaJson.textHeight]));
  pular('(e) persistir após recarregar a página', 'o app não guarda o projeto entre sessões sem o seletor de arquivos nativo; coberto pela ida e volta em JSON acima');
});

// ---------------------------------------------------------------------------------------------------------------- (f)
await r.step('(f) snap de escada no corte: o índice contém vértices da escada', async () => {
  const info = await page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    editor.newProject('house2');
    useUi.setState({ view: 'plan', planViewId: 'pv_lv_0', levelId: 'lv_0', sectionId: null, selection: [], dialog: null });
    return true;
  });
  void info;
  // Escada reta criada pela ferramenta (Q), como no e2e das escadas.
  await pressTool(page, 'q');
  await page.waitForTimeout(150);
  console.log(`  ferramenta ativa: ${(await ui()).tool}`);
  await page.locator('#opt-stairshape').selectOption('straight').catch(() => {});
  await clickWorld(page, 2, 4);
  await clickWorld(page, 7, 4);
  await page.waitForTimeout(300);
  console.log(`  status: ${(await ui()).status}`);
  const stair = await page.evaluate(() => {
    const e = Object.values(window.__hestia.editor.project.elements).find((x) => x.kind === 'stair');
    if (!e) return null;
    const pts = e.components.flatMap((c) => (c.kind === 'run' ? [...c.boundaryLeft, ...c.boundaryRight, ...c.risers].flatMap((s) => [s.a, s.b]) : []));
    return { id: e.id, minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) };
  });
  if (!stair) throw new Error('a escada não foi criada');
  const yMid = (stair.minY + stair.maxY) / 2;
  await page.evaluate(({ x0, x1, y }) => {
    const { editor } = window.__hestia;
    editor.setTool('select');
    editor.store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte da escada', kind: 'section', a: { x: x0, y }, b: { x: x1, y }, depth: 3 } });
    editor.openSection('sv1');
  }, { x0: stair.minX - 1, x1: stair.maxX + 1, y: yMid });
  await page.waitForTimeout(800);
  const res = await page.evaluate((stairId) => {
    const { editor, sectionSnapIndex } = window.__hestia;
    const sec = editor.sectionOf('sv1');
    const idx = sectionSnapIndex(sec);
    const host = idx.byHost.get(stairId);
    return { rings: (sec.snapRings ?? []).filter((s) => s.hostId === stairId).length, points: host?.points.length ?? 0, vertices: host?.points.filter((p) => p.kind === 'endpoint').length ?? 0, segments: host?.segments.length ?? 0, total: idx.points.length };
  }, stair.id);
  console.log(`  escada ${stair.id}: ${JSON.stringify(res)}`);
  r.check('anéis de captura da escada no resultado do corte', res.rings > 0, String(res.rings));
  r.check('índice tem vértices (endpoint) da escada', res.vertices >= 4, `${res.vertices} vértices, ${res.segments} segmentos`);
  await page.screenshot({ path: `${OUT}/76-corte-escada.png` });
});

r.summary();
r.check('sem erros no console do navegador', errors.length === 0, errors.slice(0, 3).join(' | '));
if (errors.length) console.log('Erros do navegador:\n' + errors.join('\n'));
if (skipped.length) console.log('\nPULADOS:\n' + skipped.map((s) => `  - ${s}`).join('\n'));
await browser.close();
process.exit(r.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
