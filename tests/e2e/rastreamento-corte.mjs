// Rastreamento e cursores no corte (e2e, sem servidor): abre o build de produção por file://, cria um corte na casa
// de exemplo e prova os cursores das vistas, o Esc do corte, a referência/guia do Alinhar e o undo do alinhamento.
//
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/e2e/rastreamento-corte.mjs
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

const browser = await chromium.launch({ executablePath: exe, args: CHROME_ARGS });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('crash', () => errors.push('[crash] a página caiu'));
page.on('dialog', (d) => d.dismiss());

const report = makeReporter();

const frames = (n = 2) => page.evaluate((count) => new Promise((resolve) => {
  let i = 0;
  const step = () => { i += 1; if (i >= count) resolve(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

const ui = () => page.evaluate(() => {
  const { editor, useUi } = window.__hestia;
  const s = useUi.getState();
  return {
    view: s.view, sectionId: s.sectionId, tool: s.tool, status: s.status,
    selection: [...s.selection], hover: s.hover, snapKind: s.snapKind,
    viewport: editor.viewport(),
  };
});

const cursor = () => page.locator('.canvas-wrap').evaluate((el) => getComputedStyle(el).cursor);

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

const inference = () => page.evaluate(() => {
  const i = window.__hestia.editor.activeTool.inference();
  return i && { point: i.point, kind: i.kind, guides: i.guides.length, hostId: i.hostId ?? null };
});

try {
  await report.step('abrir a casa2 e um corte no build de produção', async () => {
    const url = pathToFileURL(path.resolve('apps/web/dist/index.html'));
    url.search = '?gl=1&debug=1';
    await gotoBuild(url.href);
    await page.waitForSelector('.canvas-wrap canvas');
    await page.waitForFunction(() => window.__hestia);
    await page.evaluate(() => {
      const { editor } = window.__hestia;
      editor.newProject('house2');
      editor.store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte A', kind: 'section', a: { x: -2, y: 2 }, b: { x: 9, y: 2 }, depth: 6 } });
      editor.openSection('sv1');
    });
    await frames(2);
    await page.waitForTimeout(700);
    const st = await ui();
    report.check('vista é section', st.view === 'section', st.view);
    report.check('viewport do corte existe', !!st.viewport, JSON.stringify(st.viewport));
    const box = await page.locator('.canvas-wrap').boundingBox();
    report.check('canvas do corte visível', !!box && box.width > 100 && box.height > 100, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'sem caixa');
  });

  await report.step('cursores: Selecionar, Medir/Cota e pan', async () => {
    await page.evaluate(() => window.__hestia.editor.setTool('select'));
    await page.waitForTimeout(120);
    report.check('Selecionar em repouso usa default', (await cursor()) === 'default', await cursor());

    // Cursor também não vira mão ao passar sobre o desenho (o hover é só realce).
    const g = await page.evaluate(() => {
      const s = window.__hestia.editor.sectionOf('sv1');
      const o = s.openings.find((x) => x.kind === 'window') ?? s.openings[0];
      return { x: (o.t0 + o.t1) / 2, y: (o.z0 + o.z1) / 2 };
    });
    const over = await screenOf(g.x, g.y);
    await page.mouse.move(over.x, over.y);
    await page.waitForTimeout(80);
    report.check('Selecionar sobre uma abertura continua default (nunca grab/pointer)', (await cursor()) === 'default', await cursor());

    await page.evaluate(() => window.__hestia.editor.setTool('measure'));
    await page.waitForTimeout(120);
    report.check('ferramenta Medir/Cota usa crosshair', (await cursor()) === 'crosshair', await cursor());

    // Pan com Selecionar: a mão fecha ao arrastar e volta à seta ao soltar.
    await page.evaluate(() => window.__hestia.editor.setTool('select'));
    await page.waitForTimeout(80);
    const box = await page.locator('.canvas-wrap').boundingBox();
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(30);
    const downCursor = await cursor();
    await page.mouse.move(cx + 70, cy + 20, { steps: 6 });
    await page.waitForTimeout(80);
    const dragCursor = await cursor();
    await page.mouse.up();
    await page.mouse.move(box.x + 8, box.y + 8);
    await page.waitForTimeout(120);
    const restCursor = await cursor();
    report.check('pan: mão aberta ao iniciar', downCursor === 'grab', downCursor);
    report.check('pan: mão fechada durante o arraste', dragCursor === 'grabbing', dragCursor);
    report.check('depois do pan volta a default', restCursor === 'default', restCursor);

    // Navegador de projeto: nó de vista arrastável não anuncia grab.
    await page.evaluate(() => window.__hestia.useUi.setState({ browserOpen: true }));
    await page.waitForTimeout(200);
    const group = page.locator('[data-node="g:sections"]');
    if (await group.count()) { await group.dblclick(); await page.waitForTimeout(180); }
    const node = page.locator('[data-node="view:sv1"]');
    report.check('nó da vista no navegador existe e é arrastável', (await node.count()) === 1 && (await node.getAttribute('draggable')) === 'true', `count=${await node.count()}`);
    const nodeCursor = await node.evaluate((el) => getComputedStyle(el).cursor);
    const nodeClass = await node.getAttribute('class');
    report.check('nó [draggable=true].bnode usa default, não grab', nodeCursor === 'default' && String(nodeClass).includes('bnode'), `${nodeCursor} / ${nodeClass}`);
  });

  await report.step('Esc no corte não fecha a vista', async () => {
    await page.evaluate(() => window.__hestia.editor.setTool('select'));
    await page.waitForTimeout(80);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const st = await ui();
    report.check('Esc com Selecionar mantém a vista section', st.view === 'section', st.view);
    report.check('Esc com Selecionar mantém o sectionId', st.sectionId === 'sv1', String(st.sectionId));

    await page.evaluate(() => window.__hestia.editor.setTool('measure'));
    await page.waitForTimeout(100);
    const before = await ui();
    report.check('Medir está ativa antes do Esc', before.tool === 'measure', before.tool);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const after = await ui();
    report.check('Esc cancela a ferramenta (volta para select)', after.tool === 'select', after.tool);
    report.check('Esc da ferramenta não fecha o corte', after.view === 'section' && after.sectionId === 'sv1', `${after.view}/${after.sectionId}`);
  });

  await report.step('Alinhar no corte: referência, guia e undo', async () => {
    // Enquadra de novo depois do pan do passo anterior e lê a geometria da vista.
    await page.evaluate(() => window.__hestia.editor.zoomExtents());
    await page.waitForTimeout(150);
    const geo = await page.evaluate(() => {
      const { editor } = window.__hestia;
      const s = editor.sectionOf('sv1');
      const win = s.openings.find((o) => o.kind === 'window');
      if (!win) return null;
      const doors = s.openings.filter((o) => o.kind === 'door');
      // Uma porta com espaço à direita: a linha do topo pode ser estendida para fora do vão.
      const door = doors.find((o) => o.t1 + 1 < s.length) ?? doors[0];
      return {
        length: s.length,
        win: { id: win.openingId, t0: win.t0, t1: win.t1, z0: win.z0, z1: win.z1 },
        door: door && { id: door.openingId, t0: door.t0, t1: door.t1, z0: door.z0, z1: door.z1 },
      };
    });
    report.check('corte tem janela e porta visíveis', !!geo && !!geo.win && !!geo.door, JSON.stringify(geo));
    if (geo && geo.win && geo.door) {
      await page.evaluate(() => {
        const { editor, useUi } = window.__hestia;
        // Fluxo novo do Revit: nada selecionado; referência e alvo são escolhidos pelos cliques.
        useUi.setState({ selection: [] });
        editor.setTool('align');
      });
      await page.waitForTimeout(150);

      // Ponto sobre a reta do topo da porta, um pouco além do vão (onde o rastreamento estende a guia).
      const probeX = geo.door.t1 + 0.75;
      const probeY = geo.door.z1;
      const probe = await screenOf(probeX, probeY);
      // O clique da referência é na linha do topo do vão da porta.
      const refX = (geo.door.t0 + geo.door.t1) / 2;
      const refY = geo.door.z1;
      const topMid = await screenOf(refX, refY);

      // Caso 0: o topo do vão em si (ponto/aresta da porta) também entra na captura.
      await page.mouse.move(topMid.x, topMid.y);
      await page.waitForTimeout(120);
      const topInf = await inference();
      report.check('hover sobre o topo do vão da porta reconhece snap', !!topInf && topInf.kind !== 'none', topInf ? `kind=${topInf.kind} guides=${topInf.guides}` : 'inference()=null');

      // Caso 1 (interface): mover o mouse e ler a inferência da ferramenta.
      await page.mouse.move(probe.x, probe.y);
      await page.waitForTimeout(150);
      const hoverInf = await inference();
      const hoverUi = await ui();
      report.check(
        'hover na linha do topo da porta produz snap com guia',
        !!hoverInf && hoverInf.kind !== 'none' && hoverInf.guides > 0,
        hoverInf
          ? `kind=${hoverInf.kind} guides=${hoverInf.guides}`
          : `inference()=null; useUi.snapKind='${hoverUi.snapKind}'. Diagnóstico: o ramo do corte em apps/web/src/ui/ViewportCanvas.tsx (onMove) só alimenta a ferramenta com move quando drag.mode === 'tool' ou quando há ferramenta ativa sem botão; confira o caminho de hover da ferramenta Alinhar.`,
      );
      report.check('barra de status recebe o tipo de snap no hover', hoverUi.snapKind === hoverInf?.kind && hoverInf.kind !== 'none', `snapKind=${hoverUi.snapKind}`);

      // Diagnóstico isolado: alimentar a ferramenta diretamente prova que a inferência da seção tem guia.
      const direct = await page.evaluate(({ x, y }) => {
        const { editor } = window.__hestia;
        editor.pointer('move', { raw: { x, y }, shift: false, ctrl: false, alt: false });
        const i = editor.activeTool.inference();
        return i && { point: i.point, kind: i.kind, guides: i.guides.length, hostId: i.hostId ?? null };
      }, { x: probeX, y: probeY });
      report.check('inferência direta (sem a ponte do canvas) reconhece alinhamento', !!direct && direct.kind === 'alignment' && direct.guides > 0, JSON.stringify(direct));

      // Caminho real do usuário: clique na referência (o clique sempre chega à ferramenta).
      const before = await page.evaluate((id) => {
        const o = window.__hestia.editor.project.elements[id];
        return { heightOverride: o.heightOverride ?? null, sillOverride: o.sillOverride ?? null };
      }, geo.win.id);
      await page.mouse.click(topMid.x, topMid.y);
      await page.waitForTimeout(180);
      const refState = await page.evaluate(() => {
        const { editor, useUi } = window.__hestia;
        const i = editor.activeTool.inference();
        return {
          status: useUi.getState().status, preview: editor.activeTool.preview(), tool: useUi.getState().tool,
          selection: [...useUi.getState().selection],
          guides: (i?.guides ?? []).map((g) => ({ from: g.from, to: g.to, kind: g.kind })),
        };
      });
      const guide = refState.guides.find((g) => g.kind === 'alignment'
        && near(g.from.y, refY, 1e-6) && near(g.to.y, refY, 1e-6)
        && near(g.from.x, 0, 1e-6) && near(g.to.x, geo.length, 1e-6));
      report.check('clique na referência avisa e mantém a ferramenta ativa', refState.tool === 'align' && /Refer/i.test(refState.status), refState.status);
      report.check('clique na referência não seleciona nada', refState.selection.length === 0, JSON.stringify(refState.selection));
      report.check(
        'guia da referência vai de ponta a ponta na cota da porta (pela inferência, não pelo preview)',
        !!guide,
        guide ? `y=${round(guide.from.y)} x=[${round(guide.from.x)}, ${round(guide.to.x)}]` : `guides=${JSON.stringify(refState.guides)}`,
      );
      report.check('o preview não desenha uma linha própria de referência',
        !refState.preview.some((i) => i.kind === 'line' && !i.dashed), JSON.stringify(refState.preview));
      report.check('primeiro clique não altera o modelo', before.heightOverride === null && before.sillOverride === null, JSON.stringify(before));

      // Alvo: a linha do topo da janela. Nada precisa estar selecionado: o segundo clique descobre a janela.
      const target = await screenOf((geo.win.t0 + geo.win.t1) / 2, geo.win.z1);
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(220);
      const aligned = await page.evaluate((id) => {
        const { editor, useUi } = window.__hestia;
        const o = editor.project.elements[id];
        return { heightOverride: o.heightOverride ?? null, sillOverride: o.sillOverride ?? null, status: useUi.getState().status, undoLabel: editor.store.undoLabel, tool: useUi.getState().tool, selection: [...useUi.getState().selection] };
      }, geo.win.id);
      const expected = geo.door.z1 - (geo.win.z1 - geo.win.z0);
      report.check('segundo clique cria um único passo de undo', aligned.undoLabel === 'Alinhar no corte', String(aligned.undoLabel));
      report.check(
        `topo da janela alinhado à porta reposicionando o peitoril (sillOverride ≈ ${round(expected)})`,
        near(aligned.sillOverride, expected, 1e-6) && aligned.heightOverride === null,
        `sillOverride=${aligned.sillOverride} heightOverride=${aligned.heightOverride}`,
      );
      report.check('status confirma o alinhamento', /alinhad[ao]/i.test(aligned.status), aligned.status);
      report.check('o fluxo termina sem seleção', aligned.selection.length === 0, JSON.stringify(aligned.selection));

      await page.evaluate(() => window.__hestia.editor.store.undo());
      await page.waitForTimeout(180);
      const undone = await page.evaluate((id) => {
        const { editor } = window.__hestia;
        const o = editor.project.elements[id];
        return { heightOverride: o.heightOverride ?? null, sillOverride: o.sillOverride ?? null };
      }, geo.win.id);
      report.check('undo restaura a janela (sem override de peitoril/altura)', undone.heightOverride === null && undone.sillOverride === null, JSON.stringify(undone));
    }
  });

  await report.step('estabilidade', async () => {
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
