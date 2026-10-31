// Alinhar no corte no fluxo do Revit (e2e, sem servidor): abre o build de produção por file://, cria a casa2, um corte
// que mostra porta e janela e uma elevação norte que mostra três janelas, e prova o fluxo sem seleção:
//   1) o primeiro clique escolhe a referência (topo, peitoril, ombreira ou vértice) e só mostra a guia da inferência;
//   2) o segundo clique descobre o alvo (janela, porta ou parede) pelo próprio clique;
//   3) cada alinhamento é um único passo de desfazer ("Alinhar no corte").
//
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/e2e/alinhamento-revit.mjs
//
// O roteiro inteiro roda num Chromium (SwiftShader) e imprime um resumo PASS/FALHA; o código de saída é 1 se qualquer
// verificação falhar ou se houver erro de console/página.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { makeReporter, CHROME_ARGS } from './helpers.mjs';

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

const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
const round = (v) => Math.round(v * 1e3) / 1e3;
const width = (o) => o.t1 - o.t0;

const browser = await chromium.launch({ executablePath: exe, args: CHROME_ARGS });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('crash', () => errors.push('[crash] a página caiu'));
page.on('dialog', (d) => d.dismiss());

const report = makeReporter();
/** Toda leitura de seleção entra aqui: o fluxo inteiro tem de ficar com selection=[] (caso 7). */
const selectionSeen = [];
const seenSelection = async () => {
  const s = await page.evaluate(() => [...window.__hestia.useUi.getState().selection]);
  selectionSeen.push(s);
  return s;
};

const frames = (n = 2) => page.evaluate((count) => new Promise((resolve) => {
  let i = 0;
  const step = () => { i += 1; if (i >= count) resolve(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

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

/** Ponto de mundo (t,z) do corte em coordenadas de página, relendo a vista a cada uso. */
async function screenOf(x, y) {
  const g = await page.evaluate(() => {
    const r = document.querySelector('.canvas-wrap').getBoundingClientRect();
    const v = window.__hestia.editor.viewport();
    return { left: r.left, top: r.top, v };
  });
  return {
    x: g.left + g.v.width / 2 + (x - g.v.cx) * g.v.zoom,
    y: g.top + g.v.height / 2 - (y - g.v.cy) * g.v.zoom,
  };
}

/** Estado da ferramenta ativa na vista: inferência, prévia, status, seleção e histórico. */
const alignState = () => page.evaluate(() => {
  const { editor, useUi } = window.__hestia;
  const ui = useUi.getState();
  const i = editor.activeTool.inference();
  return {
    view: ui.view, sectionId: ui.sectionId, tool: ui.tool, status: ui.status, selection: [...ui.selection],
    snapKind: ui.snapKind, undoLabel: editor.store.undoLabel, version: editor.store.version,
    viewport: editor.viewport(),
    inf: i && {
      kind: i.kind,
      point: i.point,
      hostId: i.hostId ?? null,
      guides: (i.guides ?? []).map((g) => ({ from: g.from, to: g.to, kind: g.kind })),
    },
    preview: editor.activeTool.preview(),
  };
});

/** Abre o corte/elevação da vista e enquadra. */
async function openView(view) {
  await page.evaluate((v) => {
    const { editor } = window.__hestia;
    editor.store.exec({ type: 'addView', view: v });
    editor.openSection(v.id);
    editor.zoomExtents();
  }, view);
  await frames(3);
  await page.waitForTimeout(600);
  await seenSelection();
}

const sectionOpenings = (id) => page.evaluate((viewId) => {
  const s = window.__hestia.editor.sectionOf(viewId);
  return {
    length: s ? s.length : null,
    zMin: s ? s.zMin : null,
    zMax: s ? s.zMax : null,
    openings: (s?.openings ?? []).map((o) => ({
      id: o.openingId, kind: o.kind, t0: o.t0, t1: o.t1, z0: o.z0, z1: o.z1, depth: o.depth, cut: o.cut,
    })),
    beyond: (s?.beyond ?? []).map((b) => ({ wallId: b.wallId ?? null, roofId: b.roofId ?? null, depth: b.depth })),
  };
}, id);

const openingState = (id) => page.evaluate((openingId) => {
  const o = window.__hestia.editor.project.elements[openingId];
  if (!o) return null;
  return {
    id: o.id, kind: o.kind, hostId: o.hostId, typeId: o.typeId, offset: o.offset,
    sillOverride: o.sillOverride ?? null, heightOverride: o.heightOverride ?? null,
  };
}, id);

/** Base do nível da parede hospedeira (cota absoluta do piso). */
const wallBase = (openingId) => page.evaluate((id) => {
  const p = window.__hestia.editor.project;
  const o = p.elements[id];
  const wall = o ? p.elements[o.hostId] : null;
  const level = wall ? p.levels.find((l) => l.id === wall.levelId) : null;
  return level ? level.elevation : 0;
}, openingId);

/** Cos entre o eixo da parede da abertura e a direção do corte: converte deslocamento em (t) para offset. */
const wallCutCos = (openingId, viewId) => page.evaluate(({ id, view }) => {
  const p = window.__hestia.editor.project;
  const o = p.elements[id];
  const wall = o ? p.elements[o.hostId] : null;
  const v = p.views.find((x) => x.id === view);
  if (!wall || !v) return null;
  const ux = wall.b.x - wall.a.x, uy = wall.b.y - wall.a.y;
  const dx = v.b.x - v.a.x, dy = v.b.y - v.a.y;
  const lu = Math.hypot(ux, uy), ld = Math.hypot(dx, dy);
  if (lu < 1e-12 || ld < 1e-12) return null;
  return (ux / lu) * (dx / ld) + (uy / lu) * (dy / ld);
}, { id: openingId, view: viewId });

const clickWorld = async (x, y) => {
  const p = await screenOf(x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(170);
  await seenSelection();
};
const moveWorld = async (x, y) => {
  const p = await screenOf(x, y);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(150);
  await seenSelection();
};
const freshAlign = async () => {
  await page.evaluate(() => {
    window.__hestia.useUi.setState({ selection: [] });
    window.__hestia.editor.setTool('align');
  });
  await page.waitForTimeout(120);
  await seenSelection();
};
const undo = async () => {
  await page.evaluate(() => window.__hestia.editor.store.undo());
  await page.waitForTimeout(180);
  await seenSelection();
};

/** A guia persistente da referência: horizontal (topo/peitoril) ou vertical (ombreira/centro). */
function hasRefGuide(inf, axis, value, length, zMin, zMax) {
  if (!inf) return false;
  return (inf.guides ?? []).some((g) => g.kind === 'alignment' && (
    axis === 'h'
      ? near(g.from.y, value) && near(g.to.y, value) && near(g.from.x, 0) && near(g.to.x, length)
      : near(g.from.x, value) && near(g.to.x, value) && near(g.from.y, zMin) && near(g.to.y, zMax)
  ));
}
/** Nenhuma linha sólida de referência na prévia: só o fantasma tracejado do alvo pode aparecer. */
const hasSolidPreviewLine = (preview) => (preview ?? []).some((i) => i.kind === 'line' && !i.dashed);

try {
  let corte = null;
  let elevacao = null;

  await report.step('caso 1: abrir o corte da casa2 com selection=[]', async () => {
    const url = pathToFileURL(path.resolve('apps/web/dist/index.html'));
    url.search = '?gl=1&debug=1';
    await gotoBuild(url.href);
    await page.waitForSelector('.canvas-wrap canvas');
    await page.waitForFunction(() => window.__hestia);
    await page.evaluate(() => {
      const { editor, useUi } = window.__hestia;
      editor.newProject('house2');
      useUi.setState({ selection: [] });
      editor.store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte A', kind: 'section', a: { x: -2, y: 2 }, b: { x: 9, y: 2 }, depth: 6 } });
      editor.openSection('sv1');
      editor.zoomExtents();
    });
    await frames(3);
    await page.waitForTimeout(700);
    const st = await seenSelection().then(() => alignState());
    report.check('vista é section', st.view === 'section', st.view);
    report.check('sectionId=sv1', st.sectionId === 'sv1', String(st.sectionId));
    report.check('selection começa vazia', st.selection.length === 0, JSON.stringify(st.selection));
    report.check('viewport do corte existe', !!st.viewport && st.viewport.zoom > 0, JSON.stringify(st.viewport));
    const box = await page.locator('.canvas-wrap').boundingBox();
    report.check('canvas do corte visível', !!box && box.width > 100 && box.height > 100,
      box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'sem caixa');

    corte = await sectionOpenings('sv1');
    console.log('  geometria do corte:', JSON.stringify({
      length: corte.length, zMin: corte.zMin, zMax: corte.zMax,
      openings: corte.openings.map((o) => ({ id: o.id, kind: o.kind, t: [round(o.t0), round(o.t1)], z: [round(o.z0), round(o.z1)] })),
    }));
    const portas = corte.openings.filter((o) => o.kind === 'door');
    const janelas = corte.openings.filter((o) => o.kind === 'window');
    report.check('o corte mostra ao menos uma porta', portas.length > 0, `${portas.length} porta(s)`);
    report.check('o corte mostra ao menos uma janela', janelas.length > 0, `${janelas.length} janela(s)`);
  });

  await report.step('caso 2: ativar Alinhar sem seleção', async () => {
    await freshAlign();
    const st = await alignState();
    report.check('ferramenta Alinhar ativa', st.tool === 'align', st.tool);
    report.check('selection continua vazia', st.selection.length === 0, JSON.stringify(st.selection));
    report.check('status pede a referência sem exigir seleção', /referência/i.test(st.status) && /alvo/i.test(st.status), st.status);
    report.check('sem referência ainda não há inferência/prévia', st.inf === null && st.preview.length === 0,
      st.inf ? `inf=${st.inf.kind}` : `preview=${st.preview.length} item(ns)`);
  });

  await report.step('caso 3: referência no topo da porta, alvo no topo da janela (sem seleção) e um único undo', async () => {
    const portas = corte.openings.filter((o) => o.kind === 'door').sort((a, b) => width(b) - width(a));
    const janelas = corte.openings.filter((o) => o.kind === 'window').sort((a, b) => width(b) - width(a));
    const porta = portas[0];
    const janela = janelas[0];
    report.check('porta e janela escolhidas para o par topo→topo', !!porta && !!janela,
      porta && janela ? `${porta.id} → ${janela.id}` : 'faltou porta/janela');
    if (porta && janela) {
      const base = await wallBase(janela.id);
      const antes = await openingState(janela.id);
      await freshAlign();
      const vAntes = (await alignState()).version;

      const refX = (porta.t0 + porta.t1) / 2;
      const refZ = porta.z1;
      await clickWorld(refX, refZ);
      const ref = await alignState();
      report.check('primeiro clique vira referência no topo da porta', /Referência .*topo da porta/i.test(ref.status), ref.status);
      report.check('primeiro clique não altera o modelo', ref.version === vAntes, `version=${ref.version} (antes ${vAntes})`);
      report.check('primeiro clique não seleciona nada', ref.selection.length === 0, JSON.stringify(ref.selection));
      report.check('guia persistente da referência entra em inference()',
        hasRefGuide(ref.inf, 'h', refZ, corte.length, corte.zMin, corte.zMax),
        ref.inf ? `kind=${ref.inf.kind} guides=${JSON.stringify(ref.inf.guides)}` : 'inference()=null');
      report.check('preview não desenha linha própria de referência', !hasSolidPreviewLine(ref.preview),
        JSON.stringify(ref.preview));

      const tgtX = (janela.t0 + janela.t1) / 2;
      const tgtZ = janela.z1;
      await moveWorld(tgtX, tgtZ);
      const mira = await alignState();
      report.check('cursor sobre o topo da janela alvo tem snap', !!mira.inf && mira.inf.kind !== 'none',
        mira.inf ? `kind=${mira.inf.kind} point=${JSON.stringify(mira.inf.point)}` : 'inference()=null');
      report.check('a guia da referência persiste ao mirar o alvo',
        hasRefGuide(mira.inf, 'h', refZ, corte.length, corte.zMin, corte.zMax),
        mira.inf ? `guides=${JSON.stringify(mira.inf.guides)}` : 'inference()=null');
      report.check('ao mirar, a prévia só tem fantasma tracejado (nenhuma linha sólida de referência)',
        !hasSolidPreviewLine(mira.preview), JSON.stringify(mira.preview));
      report.check('a janela alvo é destacada na prévia (alvo descoberto pelo clique)',
        mira.preview.some((i) => i.kind === 'highlight' && i.ids.includes(janela.id)),
        JSON.stringify(mira.preview.filter((i) => i.kind === 'highlight')));

      await clickWorld(tgtX, tgtZ);
      const dep = await alignState();
      const depois = await openingState(janela.id);
      const esperado = round(refZ - janela.z0); // topo - (base + peitoril atual)
      report.check('segundo clique alinha o topo da janela pelo clique (sem seleção)',
        near(depois.heightOverride, esperado),
        `heightOverride=${depois.heightOverride} (esperado ${esperado})`);
      report.check('o alinhamento do topo não mexe no peitoril', depois.sillOverride === null, String(depois.sillOverride));
      report.check('alinhamento é um único passo: undoLabel="Alinhar no corte"', dep.undoLabel === 'Alinhar no corte', String(dep.undoLabel));
      report.check('status confirma o topo alinhado', /alinhado/i.test(dep.status), dep.status);
      report.check('segundo clique também não seleciona nada', dep.selection.length === 0, JSON.stringify(dep.selection));

      await undo();
      const voltou = await openingState(janela.id);
      const undoDepois = await alignState();
      report.check('um undo restaura o heightOverride', voltou.heightOverride === null && voltou.sillOverride === null,
        JSON.stringify(voltou));
      report.check('não sobra segundo passo de undo do alinhamento', undoDepois.undoLabel !== 'Alinhar no corte',
        String(undoDepois.undoLabel));
      report.check('desfazer não toca na seleção', undoDepois.selection.length === 0, JSON.stringify(undoDepois.selection));
      report.check('referência tinha ficado intacta antes do alvo', antes.heightOverride === null, JSON.stringify(antes));
    }
  });

  await report.step('preparar a elevação norte com três janelas (janela A → janela B)', async () => {
    await openView({ id: 'sv2', name: 'Elevação Norte', kind: 'section', a: { x: 9, y: 8 }, b: { x: -2, y: 8 }, depth: 6 });
    const st = await alignState();
    report.check('vista é a elevação sv2', st.view === 'section' && st.sectionId === 'sv2', `${st.view}/${st.sectionId}`);
    report.check('selection continua vazia ao trocar de vista', st.selection.length === 0, JSON.stringify(st.selection));
    elevacao = await sectionOpenings('sv2');
    const janelas = elevacao.openings.filter((o) => o.kind === 'window').sort((a, b) => width(b) - width(a));
    console.log('  janelas da elevação:', JSON.stringify(janelas.map((o) => ({
      id: o.id, t: [round(o.t0), round(o.t1)], z: [round(o.z0), round(o.z1)],
    }))));
    report.check('a elevação mostra ao menos duas janelas', janelas.length >= 2, `${janelas.length} janela(s)`);
    const inteiras = janelas.filter((o) => o.t0 > 0.01 && o.t1 < elevacao.length - 0.01);
    const par = inteiras.length >= 2 ? inteiras : janelas;
    const b = par[0];
    const a = par.find((o) => o.id !== b.id && Math.abs(o.z0 - b.z0) > 0.05) ?? par.find((o) => o.id !== b.id);
    report.check('há janela A e janela B na mesma vista', !!a && !!b, a && b ? `${a.id} → ${b.id}` : 'faltou par');
    report.check('as duas janelas têm peitoris diferentes (a feição decide, sem Shift)', !!a && !!b && !near(a.z0, b.z0, 0.05),
      a && b ? `A=${round(a.z0)} B=${round(b.z0)}` : '');
  });

  await report.step('caso 4: referência no peitoril de A, alvo no peitoril de B → sillOverride', async () => {
    const janelas = elevacao.openings.filter((o) => o.kind === 'window').sort((a, b) => width(b) - width(a));
    const inteiras = janelas.filter((o) => o.t0 > 0.01 && o.t1 < elevacao.length - 0.01);
    const par = inteiras.length >= 2 ? inteiras : janelas;
    const b = par[0];
    const a = par.find((o) => o.id !== b.id && Math.abs(o.z0 - b.z0) > 0.05) ?? par.find((o) => o.id !== b.id);
    if (!a || !b) { report.check('par de janelas para o peitoril', false, 'sem duas janelas'); return; }
    const base = await wallBase(b.id);
    const antes = await openingState(b.id);
    await freshAlign();
    const vAntes = (await alignState()).version;

    const refX = (a.t0 + a.t1) / 2;
    const refZ = a.z0;
    await clickWorld(refX, refZ);
    const ref = await alignState();
    report.check('primeiro clique vira referência no peitoril de A', /Referência .*peitoril da janela/i.test(ref.status), ref.status);
    report.check('peitoril de referência não altera o modelo', ref.version === vAntes, `version=${ref.version} (antes ${vAntes})`);
    report.check('guia horizontal do peitoril entra em inference()',
      hasRefGuide(ref.inf, 'h', refZ, elevacao.length, elevacao.zMin, elevacao.zMax),
      ref.inf ? `guides=${JSON.stringify(ref.inf.guides)}` : 'inference()=null');
    report.check('nenhuma linha própria de referência no preview', !hasSolidPreviewLine(ref.preview), JSON.stringify(ref.preview));

    const tgtX = (b.t0 + b.t1) / 2;
    const tgtZ = b.z0;
    await moveWorld(tgtX, tgtZ);
    const mira = await alignState();
    report.check('o cursor sobre o peitoril de B tem snap', !!mira.inf && mira.inf.kind !== 'none',
      mira.inf ? `kind=${mira.inf.kind}` : 'inference()=null');
    report.check('a guia horizontal persiste ao mirar B', hasRefGuide(mira.inf, 'h', refZ, elevacao.length, elevacao.zMin, elevacao.zMax),
      mira.inf ? `guides=${JSON.stringify(mira.inf.guides)}` : 'inference()=null');

    await clickWorld(tgtX, tgtZ);
    const dep = await alignState();
    const depois = await openingState(b.id);
    const esperado = round(refZ - base);
    report.check('segundo clique alinha o peitoril de B (feature decide, sem Shift)',
      near(depois.sillOverride, esperado), `sillOverride=${depois.sillOverride} (esperado ${esperado})`);
    report.check('alinhar o peitoril não cria heightOverride', depois.heightOverride === null, String(depois.heightOverride));
    report.check('peitoril: undoLabel="Alinhar no corte"', dep.undoLabel === 'Alinhar no corte', String(dep.undoLabel));
    report.check('status confirma o peitoril alinhado', /alinhado/i.test(dep.status), dep.status);
    report.check('selection continua vazia no peitoril', dep.selection.length === 0, JSON.stringify(dep.selection));

    await undo();
    const voltou = await openingState(b.id);
    const undoDepois = await alignState();
    report.check('um undo restaura o sillOverride', voltou.sillOverride === antes.sillOverride && voltou.heightOverride === antes.heightOverride,
      `${JSON.stringify(voltou)} (antes ${JSON.stringify(antes)})`);
    report.check('peitoril: não sobra segundo passo de undo', undoDepois.undoLabel !== 'Alinhar no corte', String(undoDepois.undoLabel));
  });

  await report.step('caso 5: referência na ombreira de A, alvo na ombreira de B → offset', async () => {
    const janelas = elevacao.openings.filter((o) => o.kind === 'window').sort((a, b) => width(b) - width(a));
    const inteiras = janelas.filter((o) => o.t0 > 0.01 && o.t1 < elevacao.length - 0.01);
    const par = inteiras.length >= 2 ? inteiras : janelas;
    const b = par[0];
    const a = par.find((o) => o.id !== b.id && Math.abs(o.z0 - b.z0) > 0.05) ?? par.find((o) => o.id !== b.id);
    if (!a || !b) { report.check('par de janelas para a ombreira', false, 'sem duas janelas'); return; }
    const cos = await wallCutCos(b.id, 'sv2');
    report.check('a parede alvo não é perpendicular ao corte', Number.isFinite(cos) && Math.abs(cos) >= 0.2, `cos=${round(cos ?? NaN)}`);
    if (!Number.isFinite(cos) || Math.abs(cos) < 0.2) return;
    const antes = await openingState(b.id);
    await freshAlign();
    const vAntes = (await alignState()).version;

    const refX = a.t1; // ombreira direita (jambRight) de A
    const refZ = (a.z0 + a.z1) / 2;
    await clickWorld(refX, refZ);
    const ref = await alignState();
    report.check('primeiro clique vira referência na ombreira de A', /Referência .*ombreira/i.test(ref.status), ref.status);
    report.check('ombreira de referência não altera o modelo', ref.version === vAntes, `version=${ref.version} (antes ${vAntes})`);
    report.check('guia vertical da ombreira entra em inference()',
      hasRefGuide(ref.inf, 'v', refX, elevacao.length, elevacao.zMin, elevacao.zMax),
      ref.inf ? `guides=${JSON.stringify(ref.inf.guides)}` : 'inference()=null');

    const tgtX = b.t1; // mesma ombreira (direita) de B
    const tgtZ = (b.z0 + b.z1) / 2;
    await moveWorld(tgtX, tgtZ);
    const mira = await alignState();
    report.check('o cursor sobre a ombreira de B tem snap', !!mira.inf && mira.inf.kind !== 'none',
      mira.inf ? `kind=${mira.inf.kind}` : 'inference()=null');
    report.check('a guia vertical persiste ao mirar B', hasRefGuide(mira.inf, 'v', refX, elevacao.length, elevacao.zMin, elevacao.zMax),
      mira.inf ? `guides=${JSON.stringify(mira.inf.guides)}` : 'inference()=null');

    await clickWorld(tgtX, tgtZ);
    const dep = await alignState();
    const depois = await openingState(b.id);
    const esperado = round(antes.offset + (refX - b.t1) / cos);
    report.check('segundo clique alinha a ombreira de B mudando o offset',
      near(depois.offset, esperado), `offset=${depois.offset} (esperado ${esperado})`);
    report.check('a ombreira clicada de B vai para a cota da referência', near(depois.offset, esperado),
      `A.t1=${round(refX)} B.offset=${depois.offset}`);
    report.check('alinhar a ombreira não cria heightOverride/sillOverride',
      depois.heightOverride === null && depois.sillOverride === null,
      `height=${depois.heightOverride} sill=${depois.sillOverride}`);
    report.check('ombreira: undoLabel="Alinhar no corte"', dep.undoLabel === 'Alinhar no corte', String(dep.undoLabel));
    report.check('status confirma a ombreira alinhada', /alinhad[ao]/i.test(dep.status), dep.status);
    report.check('selection continua vazia na ombreira', dep.selection.length === 0, JSON.stringify(dep.selection));

    // A seção recalculada mostra a ombreira de B na cota da referência.
    const recalculado = await sectionOpenings('sv2');
    const bNow = recalculado.openings.find((o) => o.id === b.id);
    report.check('a ombreira alinhada aparece na cota de A na vista recalculada',
      !!bNow && (near(bNow.t1, refX) || near(bNow.t0, refX)),
      bNow ? `B t=[${round(bNow.t0)}, ${round(bNow.t1)}] ref=${round(refX)}` : 'B sumiu da vista');

    await undo();
    const voltou = await openingState(b.id);
    const undoDepois = await alignState();
    report.check('um undo restaura o offset', near(voltou.offset, antes.offset),
      `offset=${voltou.offset} (antes ${antes.offset})`);
    report.check('ombreira: não sobra segundo passo de undo', undoDepois.undoLabel !== 'Alinhar no corte', String(undoDepois.undoLabel));
  });

  await report.step('caso 8: cada linha e cada vértice da janela vira referência; quatro cantos com snap', async () => {
    const janelas = elevacao.openings.filter((o) => o.kind === 'window').sort((a, b) => width(b) - width(a));
    const janela = janelas[0];
    if (!janela) { report.check('janela para linhas/vértices', false, 'sem janela'); return; }
    const midT = (janela.t0 + janela.t1) / 2;
    const midZ = (janela.z0 + janela.z1) / 2;
    const linhas = [
      { nome: 'topo', x: midT, y: janela.z1, esperado: /topo da janela/i },
      { nome: 'peitoril', x: midT, y: janela.z0, esperado: /peitoril da janela/i },
      { nome: 'ombreira esquerda', x: janela.t0, y: midZ, esperado: /ombreira/i },
      { nome: 'ombreira direita', x: janela.t1, y: midZ, esperado: /ombreira/i },
      { nome: 'centro vertical', x: midT, y: midZ, esperado: /centro/i },
    ];
    for (const l of linhas) {
      await freshAlign();
      const vAntes = (await alignState()).version;
      await clickWorld(l.x, l.y);
      const st = await alignState();
      report.check(`linha "${l.nome}" vira referência`, l.esperado.test(st.status) && /Referência/i.test(st.status), st.status);
      report.check(`linha "${l.nome}" não altera o modelo`, st.version === vAntes, `version=${st.version} (antes ${vAntes})`);
      report.check(`linha "${l.nome}" mantém a seleção vazia`, st.selection.length === 0, JSON.stringify(st.selection));
      report.check(`linha "${l.nome}" tem guia na inferência`, (st.inf?.guides?.length ?? 0) > 0,
        st.inf ? `guides=${JSON.stringify(st.inf.guides)}` : 'inference()=null');
    }

    // Quatro cantos: mover o mouse perto de cada um e ler a inferência da ferramenta.
    await freshAlign();
    const cantos = [
      { nome: 'superior esquerdo', x: janela.t0, y: janela.z1 },
      { nome: 'superior direito', x: janela.t1, y: janela.z1 },
      { nome: 'inferior direito', x: janela.t1, y: janela.z0 },
      { nome: 'inferior esquerdo', x: janela.t0, y: janela.z0 },
    ];
    for (const c of cantos) {
      await moveWorld(c.x, c.y);
      const st = await alignState();
      report.check(`canto ${c.nome}: a inferência devolve snap`, !!st.inf && st.inf.kind !== 'none',
        st.inf ? `kind=${st.inf.kind} point=${JSON.stringify(st.inf.point)}` : 'inference()=null');
      report.check(`canto ${c.nome}: o snap cai no próprio vértice`,
        !!st.inf && near(st.inf.point.x, c.x, 0.02) && near(st.inf.point.y, c.y, 0.02),
        st.inf ? JSON.stringify(st.inf.point) : 'inference()=null');
    }

    // Clicar no vértice também vira referência (sem alterar o modelo nem selecionar).
    await freshAlign();
    const vAntes = (await alignState()).version;
    await clickWorld(janela.t0, janela.z1);
    const vertice = await alignState();
    report.check('clique no vértice da janela vira referência', /^Referência/i.test(vertice.status), vertice.status);
    report.check('vértice: snap lido é de ponta (endpoint)', vertice.inf?.kind === 'endpoint',
      vertice.inf ? vertice.inf.kind : 'inference()=null');
    report.check('vértice: não altera o modelo', vertice.version === vAntes, `version=${vertice.version} (antes ${vAntes})`);
    report.check('vértice: mantém a seleção vazia', vertice.selection.length === 0, JSON.stringify(vertice.selection));
    report.check('vértice: guia na inferência', (vertice.inf?.guides?.length ?? 0) > 0,
      vertice.inf ? `guides=${JSON.stringify(vertice.inf.guides)}` : 'inference()=null');

    // Aresta inclinada de telhado: só existe em templates com telhado. A house2 não tem; se houver, prova a guia.
    const inclinadas = await page.evaluate(() => {
      const s = window.__hestia.editor.sectionOf('sv2');
      const out = [];
      const visit = (polys) => {
        for (const poly of polys ?? []) for (const ring of poly) {
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            if (Math.abs(b.x - a.x) > 1e-6 && Math.abs(b.y - a.y) > 1e-6) {
              out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }
          }
        }
      };
      for (const b of s?.beyond ?? []) visit(b.polygons);
      return out;
    });
    if (inclinadas.length === 0) {
      report.check('aresta inclinada de telhado: não há no template house2 (verificação condicional)', true,
        'sem telhado/aresta inclinada na seção — nada a verificar');
    } else {
      await freshAlign();
      for (const p of inclinadas.slice(0, 3)) {
        await moveWorld(p.x, p.y);
        const st = await alignState();
        report.check('aresta inclinada: a inferência reconhece snap/guia',
          !!st.inf && st.inf.kind !== 'none' && (st.inf.guides?.length ?? 0) > 0,
          st.inf ? `kind=${st.inf.kind} guides=${st.inf.guides.length}` : 'inference()=null');
      }
    }

    // Esc depois da referência cancela o passo e mantém o Alinhar ativo.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const esc = await alignState();
    report.check('Esc cancela a referência sem sair da ferramenta', esc.tool === 'align', esc.tool);
    report.check('Esc não altera a seleção', esc.selection.length === 0, JSON.stringify(esc.selection));
  });

  await report.step('caso 7 e 9: seleção vazia no fluxo inteiro e nenhum erro de console/página', async () => {
    const vazias = selectionSeen.every((s) => s.length === 0);
    const comSelecao = selectionSeen.filter((s) => s.length > 0);
    report.check('selection=[] em todas as leituras do fluxo', vazias,
      vazias ? `${selectionSeen.length} leitura(s)` : JSON.stringify(comSelecao));
    const st = await alignState();
    report.check('a vista termina no corte/elevação com o Alinhar disponível', st.view === 'section' && st.tool === 'align',
      `${st.view}/${st.tool}`);
    report.check('sem erros de console/página', errors.length === 0, errors.join(' | '));
  });
} catch (e) {
  console.error('ERRO FATAL:', e && e.stack ? e.stack : e);
  errors.push(`[fatal] ${e && e.message ? e.message : e}`);
} finally {
  report.summary();
  const failed = report.steps.filter((s) => s.status !== 'PASS').length;
  const result = {
    ok: failed === 0 && errors.length === 0,
    failedSteps: failed,
    steps: report.steps,
    errors,
  };
  console.log('\n== JSON');
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  await browser.close();
}
