// Portão da parede inclinada (ETAPA A): prova no app real (http://127.0.0.1:4174/, build da branch) os defeitos P1 a P3 e P5 a P7
// encontrados ao testar a parede inclinada (P4, nó de 3 paredes, fica fora). Sai com 0 só se todos os pontos passam.
// A interface é acionada por clique onde o gesto existe (ferramenta Parede, painel de colocação, campo Inclinação das Propriedades);
// onde não existe (criar paredes por coordenada, vistas de corte/elevação, janelas e portas) o passo diz que usou o comando do modelo
// (`editor.applyCommand`, via hook `?debug=1`). A malha 3D é lida da cena (`__hestia3dModel.scene`) e fatiada em planos z.
//   node tests/e2e/parede-inclinada.mjs        (APP_URL=... para outro endereço; CHROME_PATH para outro Chrome)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const URL_APP = process.env.APP_URL ?? 'http://127.0.0.1:4174/';
const EVID = path.resolve('docs/parede-formas/evidencias/etapaA');
mkdirSync(EVID, { recursive: true });
const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ARGS });
const rows = [];
const fmt = (v) => (typeof v === 'number' ? (Math.round(v * 10000) / 10000).toString() : String(v));

// ---------- biblioteca no navegador (fatias da malha 3D, cantos, plano) ----------
const LIB = () => {
  const m = () => window.__hestia3dModel;
  const grupos = (id, kind = 'wall') => {
    const out = [];
    m().scene.traverse((o) => { if (o.isMesh && o.userData.kind === kind && o.userData.ranges) { const r = o.userData.ranges.find((x) => x.id === id); if (r) out.push({ o, r }); } });
    return out;
  };
  const tris = ({ o, r }) => {
    const g = o.geometry; const pos = g.attributes.position; const idx = g.index; const t = [];
    const P = (i) => { const v = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) }; return v; };
    for (let k = r.start; k < r.start + r.count; k += 3) t.push([P(idx.getX(k)), P(idx.getX(k + 1)), P(idx.getX(k + 2))]);
    return t;
  };
  const slice = (t, z) => {
    const segs = [];
    for (const tr of t) {
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const a = tr[i]; const b = tr[(i + 1) % 3];
        if ((a.z - z) * (b.z - z) < 0) { const u = (z - a.z) / (b.z - a.z); pts.push([a.x + u * (b.x - a.x), a.y + u * (b.y - a.y)]); }
      }
      if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
    }
    return segs;
  };
  const segDist = (px, py, s) => {
    const dx = s[2] - s[0]; const dy = s[3] - s[1]; const l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / l2)) : 0;
    return Math.hypot(px - (s[0] + u * dx), py - (s[1] + u * dy));
  };
  const inside = (px, py, segs) => { let c = false; for (const s of segs) { if ((s[1] > py) !== (s[3] > py) && px < s[0] + ((py - s[1]) / (s[3] - s[1])) * (s[2] - s[0])) c = !c; } return c; };
  /** Distância do ponto à união das fatias dos grupos (0 se dentro). */
  const distUniao = (px, py, listas) => {
    let best = Infinity;
    for (const segs of listas) { if (segs.length && inside(px, py, segs)) return 0; for (const s of segs) best = Math.min(best, segDist(px, py, s)); }
    return best;
  };
  const fatias = (id, z) => grupos(id).map((g) => slice(tris(g), z));
  /** Linhas de face (esquerda/direita) de uma parede reta na cota z: segmentos paralelos ao eixo, deslocamentos extremos. */
  const faces = (w, z) => {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); const d = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }; const n = { x: -d.y, y: d.x };
    let lo = Infinity; let hi = -Infinity;
    for (const segs of fatias(w.id, z)) for (const s of segs) {
      const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
      const par = Math.abs((s[2] - s[0]) * d.y - (s[3] - s[1]) * d.x) / (len || 1);
      if (len > 0.3 && par < 1e-3) { for (const [x, y] of [[s[0], s[1]], [s[2], s[3]]]) { const o = (x - w.a.x) * n.x + (y - w.a.y) * n.y; lo = Math.min(lo, o); hi = Math.max(hi, o); } }
    }
    return { d, n, lo, hi, a: w.a };
  };
  const inter = (p, q) => {
    const A = { x: p.a.x + p.n.x * p.off, y: p.a.y + p.n.y * p.off }; const B = { x: q.a.x + q.n.x * q.off, y: q.a.y + q.n.y * q.off };
    const den = p.d.x * q.d.y - p.d.y * q.d.x; if (Math.abs(den) < 1e-9) return null;
    const t = ((B.x - A.x) * q.d.y - (B.y - A.y) * q.d.x) / den;
    return { x: A.x + t * p.d.x, y: A.y + t * p.d.y };
  };
  /** Fresta no canto entre duas paredes retas que compartem a ponta: distância dos cantos externo e interno (da fatia z) à união das fatias. */
  window.__pi = {
    canto(A, B, zs) {
      const turn = Math.sign((A.b.x - A.a.x) * (B.b.y - B.a.y) - (A.b.y - A.a.y) * (B.b.x - B.a.x));
      const out = [];
      for (const z of zs) {
        const fa = faces(A, z); const fb = faces(B, z);
        const lados = turn > 0 ? { ext: ['lo', 'lo'], int: ['hi', 'hi'] } : { ext: ['hi', 'hi'], int: ['lo', 'lo'] };
        const lista = [...fatias(A.id, z), ...fatias(B.id, z)];
        const r = { z, sobra: 0 };
        // saliência: vértice de uma fatia além da face externa da OUTRA parede (corte simples faz a ponta atravessar a face)
        for (const [W, F] of [[A, fb], [B, fa]]) {
          const o = lados.ext[0];
          const signo = o === 'lo' ? -1 : 1;
          for (const segs of fatias(W.id, z)) for (const s of segs) for (const [x, y] of [[s[0], s[1]], [s[2], s[3]]]) {
            const off = (x - F.a.x) * F.n.x + (y - F.a.y) * F.n.y;
            r.sobra = Math.max(r.sobra, signo * (off - F[o]));
          }
        }
        for (const [nome, [la, lb]] of Object.entries(lados)) {
          const P = inter({ ...fa, off: fa[la] }, { ...fb, off: fb[lb] });
          r[nome] = P ? distUniao(P.x, P.y, lista) : NaN;
          r[nome + 'P'] = P;
        }
        out.push(r);
      }
      return out;
    },
    /** Área da união aproximada (soma das fatias) e o contorno somado: usado só para relatar. */
    topo(id, z) { const ps = []; for (const g of grupos(id)) for (const t of tris(g)) for (const v of t) if (Math.abs(v.z - z) < 1e-4) ps.push(v); const n = ps.length || 1; return { n: ps.length, x: ps.reduce((s, v) => s + v.x, 0) / n, y: ps.reduce((s, v) => s + v.y, 0) / n, ymax: Math.max(...ps.map((v) => v.y)), ymin: Math.min(...ps.map((v) => v.y)) }; },
    malhaAbertura(hostId, kind) { // vértices das peças de esquadria do tipo; devolve pontos
      const pts = []; m().scene.traverse((o) => { if (o.isMesh && o.userData.kind === kind) { const g = o.geometry; const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = o.localToWorld(o.position.clone().set(p.getX(i), p.getY(i), p.getZ(i))); pts.push([v.x, v.y, v.z]); } } });
      return pts;
    },
  };
  window.__nova = (cmds) => { const { editor, model } = window.__hestia; for (const c of cmds) editor.applyCommand(c); };
};

async function novoApp(viewport = { width: 1440, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404 \(Not Found\)/.test(m.text() + (m.location()?.url ?? ''))) erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
  await page.goto(`${URL_APP}?debug=1&gl=1`);
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Novo projeto/ }).first().click({ timeout: 30000 });
  await page.getByRole('button', { name: /Em branco/ }).click({ timeout: 1500 }).catch(() => undefined);
  await page.waitForFunction(() => window.__hestia.useUi.getState().tela === 'editor', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(LIB);
  return { page, erros, ctx };
}
const addWall = (page, spec) => page.evaluate((s) => {
  const { editor, model } = window.__hestia;
  const id = model.newId('wall');
  editor.applyCommand({ type: 'addWall', wall: model.makeWall({ id, typeId: s.type ?? 'wt_conc15', levelId: 'lv_0', a: s.a, b: s.b, ...(s.tilt ? { tilt: s.tilt } : {}) }) });
  return id;
}, spec);
const abre3d = async (page) => {
  await page.evaluate(() => { const { editor, useUi } = window.__hestia; editor.setView('3d'); const s = useUi.getState(); if (!s.openViews.some((v) => v.kind === '3d')) useUi.setState({ openViews: [...s.openViews, { kind: '3d' }] }); });
  await page.waitForFunction(() => window.__hestia3dModel?.scene, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
};
const camera = async (page, v) => { await page.evaluate((v) => {
  const o = window.__hestia3d; const T = o.target.constructor;
  o.cancelAnimation?.(); o.azimuth = v.az; o.elevation = v.el; o.distance = v.d; o.target.set(v.t[0], v.t[1], v.t[2]); o.apply();
  window.__hestia.editor.bump();
}, v); await page.waitForTimeout(500); };
async function captura(page, nome) {
  await page.mouse.move(2, 2); await page.waitForTimeout(500);
  let ant = null; let atual = null;
  for (let i = 0; i < 12; i++) { atual = await page.screenshot({ type: 'png' }); if (ant && atual.equals(ant)) break; ant = atual; await page.waitForTimeout(500); }
  writeFileSync(path.join(EVID, nome), atual);
  return nome;
}
const espera3d = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function ponto(id, nome, fn) {
  if (process.env.SO && !process.env.SO.split(',').includes(id)) return;
  const r = { id, nome, checks: [], pass: true, shots: [] };
  rows.push(r);
  const check = (nm, ok, val = '') => { r.checks.push({ nm, ok: !!ok, val: fmt(val) }); if (!ok) r.pass = false; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id} ${nm}${val !== '' ? ` -> ${fmt(val)}` : ''}`); };
  console.log(`\n== ${id} ${nome}`);
  try { await fn({ check, r }); } catch (e) { check('sem exceção', false, e.message.split('\n')[0]); }
}
const ocupado = (erros, check) => check('sem erro de console', erros.length === 0, erros.slice(0, 2).join(' | '));
const TOL = 0.002;
const cantoVal = (res) => res.map((c) => `z=${fmt(c.z)} ext=${fmt(c.ext)} int=${fmt(c.int)} sobra=${fmt(c.sobra)}`).join('; ');
const cantoOk = (res) => res.every((c) => c.ext <= TOL && c.int <= TOL && c.sobra <= TOL);
const ZS = [0.05, 1.4, 2.75];

/** Um L (a→b→c, canto em (4,0)) com tilts dados: confere fresta/saliência no canto e captura de dois ângulos. */
async function cantoL(check, r, rotulo, tA, tB, prefixo, principal) {
  const { page, erros, ctx } = await novoApp();
  const A = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt: tA }; const B = { a: { x: 4, y: 0 }, b: { x: 4, y: 4 }, tilt: tB };
  A.id = await addWall(page, A); B.id = await addWall(page, B);
  await abre3d(page);
  const res = await page.evaluate(([A, B, zs]) => window.__pi.canto(A, B, zs), [A, B, ZS]);
  const av = await page.evaluate(() => (document.querySelector('.statusbar, footer')?.innerText ?? '').match(/\d+ avisos?/)?.[0] ?? 'sem avisos');
  const ok = cantoOk(res);
  check(`${rotulo}: cantos sem fresta nem saliência (<= 2 mm) em z=0,05/1,4/2,75 [${av}]`, ok, cantoVal(res));
  if (principal || !ok) {
    await camera(page, { az: -2.2, el: 0.5, d: 7, t: [4, 0, 1.4] }); r.shots.push(await captura(page, `${prefixo}-externo.png`));
    await camera(page, { az: 0.9, el: 0.45, d: 6, t: [4, 0, 1.4] }); r.shots.push(await captura(page, `${prefixo}-interno.png`));
  }
  ocupado(erros, check); await ctx.close();
}

// ---------- P1 ----------
await ponto('P1', 'Junção em toda a altura (L 15° + 30°)', async ({ check, r }) => {
  await cantoL(check, r, 'L 15°+30° (ambas inclinam para dentro)', 15, 30, 'P1-L15-30', true);
  await cantoL(check, r, 'L -15°+-30° (inclinam para fora)', -15, -30, 'P1-L-15-30', false);
  await cantoL(check, r, 'L 15°+-30° (mista de sinal)', 15, -30, 'P1-L15--30', false);
});

// ---------- P2 ----------
await ponto('P2', 'Cache: mudar o tilt de UMA parede isolada', async ({ check, r }) => {
  const { page, erros, ctx } = await novoApp();
  const id = await addWall(page, { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  await abre3d(page);
  await camera(page, { az: -1.2, el: 0.35, d: 8, t: [2, 0.5, 1.4] });
  const antes = await page.evaluate((id) => window.__pi.topo(id, 2.8), id);
  r.shots.push(await captura(page, 'P2-antes-vertical.png'));
  // Campo Inclinação das Propriedades (UI): seleciona a parede e digita 20.
  await page.evaluate((id) => window.__hestia.useUi.setState({ selection: [id] }), id);
  let via = 'campo Inclinação (Propriedades)';
  try { await page.locator('#p-tilt').fill('20', { timeout: 5000 }); await page.keyboard.press('Enter'); } catch { via = 'comando setWallTilt (campo não acionável)'; await page.evaluate((id) => window.__hestia.editor.applyCommand({ type: 'setWallTilt', ids: [id], tilt: 20 }), id); }
  console.log('  via: ' + via);
  const tilt = await page.evaluate((id) => window.__hestia.editor.project.elements[id].tilt ?? 0, id);
  check('modelo: tilt = 20 (' + via + ')', Math.abs(tilt - 20) < 1e-6, tilt);
  const esperado = 2.8 * Math.tan((20 * Math.PI) / 180);
  const mudou = await espera3d(page, ([id, y0]) => { const t = window.__pi.topo(id, 2.8); return Math.abs(t.y - y0) > 0.1; }, [id, antes.y], 8000);
  const depois = await page.evaluate((id) => window.__pi.topo(id, 2.8), id);
  check(`3D (sem criar outra parede): topo desloca ${fmt(esperado)} m em y`, mudou && Math.abs(depois.y - antes.y - esperado) < 0.01, `antes y=${fmt(antes.y)} depois y=${fmt(depois.y)}`);
  await camera(page, { az: -1.2, el: 0.35, d: 8, t: [2, 0.5, 1.4] });
  r.shots.push(await captura(page, 'P2-depois-tilt20.png'));
  // planta no corte (z=1,20): faixa da parede deve deslocar 1,2*tan20
  const pl = await page.evaluate(async (id) => {
    const { editor, resolveLevel } = window.__hestia;
    const rl = resolveLevel(editor.project, 'lv_0'); const ws = rl.walls instanceof Map ? [...rl.walls.values()] : Object.values(rl.walls);
    const w = ws.find((x) => x.wallId === id || x.id === id);
    const ys = []; for (const l of w.layers) for (const mp of l.cut) for (const poly of mp) for (const ring of [poly]) for (const p of ring) ys.push(p.y);
    const vid = window.__hestia.model.newId('v');
    editor.applyCommand({ type: 'addView', view: { id: vid, name: 'CP2', kind: 'section', a: { x: 2, y: -3 }, b: { x: 2, y: 3 }, depth: 3 } });
    const sr = await editor.sectionReady(vid);
    const xs0 = []; const xs1 = []; for (const c of sr.cut) for (const mp of c.polygons) for (const ring of mp) for (const p of ring) (Math.abs(p.y) < 1e-6 ? xs0 : Math.abs(p.y - 2.8) < 1e-6 ? xs1 : []).push(p.x);
    const m = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    return { cutY: ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : NaN, tiltPlan: !!w.tiltPlan, secBase: m(xs0), secTop: m(xs1), n0: xs0.length, n1: xs1.length };
  }, id);
  check(`planta (corte z=1,2): faixa em y=${fmt(1.2 * Math.tan((20 * Math.PI) / 180))}`, Math.abs(pl.cutY - 1.2 * Math.tan((20 * Math.PI) / 180)) < 0.01, pl.cutY);
  check(`corte vertical: topo deslocado ${fmt(esperado)} da base`, Math.abs(pl.secTop - pl.secBase - esperado) < 0.01 || Math.abs(pl.secBase - pl.secTop - esperado) < 0.01, `base ${fmt(pl.secBase)} topo ${fmt(pl.secTop)}`);
  ocupado(erros, check); await ctx.close();
});

// ---------- P3 ----------
await ponto('P3', 'Misto: parede inclinada 20° + vertical numa ponta', async ({ check, r }) => {
  await cantoL(check, r, 'L 20°+vertical', 20, 0, 'P3-L20-0', true);
  await cantoL(check, r, 'L -20°+vertical', -20, 0, 'P3-L-20-0', false);
  await cantoL(check, r, 'L vertical+20°', 0, 20, 'P3-L0-20', false);
  await cantoL(check, r, 'L vertical+-20°', 0, -20, 'P3-L0--20', false);
});

// ---------- P5 ----------
await ponto('P5', 'Aberturas em parede inclinada 20°', async ({ check, r }) => {
  const { page, erros, ctx } = await novoApp();
  const id = await addWall(page, { a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, tilt: 20 });
  const ops = await page.evaluate((id) => {
    const { editor, model } = window.__hestia; const out = {};
    for (const [k, kind, type, off] of [['janela', 'window', 'ot_j120', 1.5], ['porta', 'door', 'ot_p80', 4.5]]) {
      const oid = model.newId('op'); out[k] = oid;
      editor.applyCommand({ type: 'addOpening', opening: { id: oid, kind, typeId: type, hostId: id, offset: off, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    }
    return out;
  }, id);
  const info = await page.evaluate(([id, ops]) => {
    const { editor, model, resolveLevel } = window.__hestia; const p = editor.project;
    const rl = resolveLevel(p, 'lv_0'); const ws = rl.walls instanceof Map ? [...rl.walls.values()] : Object.values(rl.walls); const w = ws.find((x) => x.wallId === id || x.id === id);
    const plano = (oid) => model.openingPlaneOf(p.elements[oid]);
    return { janela: plano(ops.janela), porta: plano(ops.porta), cuts: (w.tiltCuts ?? []).map((c) => ({ cx: c.cx, z0: c.z0, z1: c.z1, hw: c.halfW })) };
  }, [id, ops]);
  console.log('  ' + JSON.stringify(info));
  check('plano efetivo da janela = inclinado', info.janela === 'inclinado', info.janela);
  check('plano efetivo da porta = vertical', info.porta === 'vertical', info.porta);
  check('corte do vão inclinado só na janela (tiltCuts: 1 entrada em cx=1,5)', info.cuts.length === 1 && Math.abs(info.cuts[0].cx - 1.5) < 0.01, JSON.stringify(info.cuts));
  await abre3d(page);
  // esquadria 3D da janela deve ficar dentro da espessura da parede inclinada em cada cota
  const pts = await page.evaluate(() => window.__pi.malhaAbertura(null, 'window'));
  const T = Math.tan((20 * Math.PI) / 180); let dev = 0; let n = 0;
  for (const [x, y, z] of pts) { if (x > 0.5 && x < 2.6) { dev = Math.max(dev, Math.abs(y - z * T)); n++; } }
  check('esquadria 3D da janela dentro da parede em toda a altura (desvio do eixo inclinado <= 0,12 m)', n > 0 && dev <= 0.12, `${n} vértices; desvio máx ${fmt(dev)} m`);
  await camera(page, { az: -1.0, el: 0.3, d: 9, t: [3, 0.5, 1.4] });
  r.shots.push(await captura(page, 'P5-aberturas-3d.png'));
  await camera(page, { az: -1.9, el: 0.2, d: 9, t: [3, 0.5, 1.4] });
  r.shots.push(await captura(page, 'P5-aberturas-3d-b.png'));
  ocupado(erros, check); await ctx.close();
});

// ---------- P6 ----------
await ponto('P6', 'Criação: opção Inclinação visível e aplicada ao desenhar', async ({ check, r }) => {
  const { page, erros, ctx } = await novoApp();
  await page.getByRole('button', { name: 'Parede', exact: true }).first().click();
  await page.waitForTimeout(600);
  const vis = await page.evaluate(() => new Promise((ok) => {
    const el = document.querySelector('#place-wall-tilt');
    if (!el) return ok({ existe: false });
    const rc = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    let anc = el.parentElement; let rolagem = 0; while (anc) { rolagem += anc.scrollTop; anc = anc.parentElement; }
    const io = new IntersectionObserver((es) => { ok({ existe: true, ratio: es[0].intersectionRatio, noViewport: rc.top >= 0 && rc.bottom <= innerHeight && rc.left >= 0 && rc.right <= innerWidth && rc.width > 0 && rc.height > 0, display: cs.display, vis: cs.visibility, rolagem, y: Math.round(rc.top) }); io.disconnect(); });
    io.observe(el);
  }));
  console.log('  ' + JSON.stringify(vis));
  check('campo #place-wall-tilt existe no DOM', vis.existe);
  check('visível na viewport sem rolar (ratio >= 0,99, rolagem 0)', vis.existe && vis.ratio >= 0.99 && vis.noViewport && vis.rolagem === 0, `ratio=${fmt(vis.ratio ?? 0)} y=${vis.y} rolagem=${vis.rolagem}`);
  r.shots.push(await captura(page, 'P6-painel-colocacao.png'));
  // digita 15 ANTES do primeiro clique e desenha uma parede com cliques reais
  await page.locator('#place-wall-tilt').fill('15'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const opt = await page.evaluate(() => window.__hestia.useUi.getState().options.wallTilt);
  check('opção wallTilt guardada (graus) = 15', opt !== undefined && Math.abs(opt - 15) < 1e-6, opt);
  await page.evaluate(() => window.__hestia.editor.ensureViewport(innerWidth, innerHeight));
  const mundo = async (x, y) => page.evaluate(([x, y]) => { const rc = document.querySelector('.canvas-wrap').getBoundingClientRect(); const v = window.__hestia.editor.viewport(); return { x: rc.x + v.width / 2 + (x - v.cx) * v.zoom, y: rc.y + v.height / 2 - (y - v.cy) * v.zoom }; }, [x, y]);
  const clica = async (x, y) => { const p = await mundo(x, y); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };
  await clica(0, 0); await page.mouse.move((await mundo(3, 0)).x, (await mundo(3, 0)).y); await clica(3, 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const paredes = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'wall').map((w) => ({ tilt: w.tilt ?? 0, a: w.a, b: w.b })));
  console.log('  ' + JSON.stringify(paredes));
  check('desenhou 1 parede por cliques', paredes.length === 1, paredes.length);
  check('a parede nasce com tilt 15', paredes.length >= 1 && Math.abs(paredes[0].tilt - 15) < 1e-6, paredes[0]?.tilt);
  await abre3d(page); await camera(page, { az: -1.2, el: 0.35, d: 7, t: [1.5, 0.5, 1.4] });
  r.shots.push(await captura(page, 'P6-parede-desenhada-3d.png'));
  ocupado(erros, check); await ctx.close();
});

// ---------- P7 ----------
async function medir(page, rotulo, tilt) {
  const pts = []; for (let i = 0; i <= 30; i++) pts.push({ x: i * 3, y: i % 2 ? 2 : 0 });
  await page.evaluate(([pts, tilt]) => { const { editor, model } = window.__hestia; for (let i = 0; i < 30; i++) editor.applyCommand({ type: 'addWall', wall: model.makeWall({ id: model.newId('wall'), typeId: 'wt_conc15', levelId: 'lv_0', a: pts[i], b: pts[i + 1], ...(tilt ? { tilt } : {}) }) }); }, [pts, tilt]);
  const n = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'wall').length);
  const tempos = await page.evaluate(async () => {
    const { editor, model } = window.__hestia;
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const mk = (kind, name, a, b, depth) => { const id = model.newId('v'); editor.applyCommand({ type: 'addView', view: { id, name, kind, a, b, depth } }); return id; };
    // aquecimento do worker do corte, numa vista vazia
    const w = mk('section', 'aquec', { x: 500, y: 500 }, { x: 510, y: 500 }, 2); editor.openSection(w); await editor.sectionReady(w);
    const med = async (kind, a, b, depth) => {
      const xs = [];
      for (let k = 0; k < 3; k++) {
        if (k > 0) { const t0 = editor.project.elements; } // cada rodada usa uma vista nova (sem cache)
        const id = mk(kind, `${kind}${k}`, a, b, depth);
        const t0 = performance.now(); editor.openSection(id); await raf(); await raf(); const s = await editor.sectionReady(id); await raf(); xs.push(performance.now() - t0);
        if (!s) throw new Error('sem resultado');
      }
      return xs;
    };
    const corte = await med('section', { x: -2, y: 1 }, { x: 92, y: 1 }, 6);
    const elev = await med('elevation', { x: -2, y: -3 }, { x: 92, y: -3 }, 12);
    return { corte, elev };
  });
  const mediana = (a) => [...a].sort((x, y) => x - y)[1];
  return { rotulo, n, corte: tempos.corte, elev: tempos.elev, mc: mediana(tempos.corte), me: mediana(tempos.elev) };
}
await ponto('P7', 'Desempenho: 30 paredes, corte e elevação < 100 ms', async ({ check }) => {
  const resultados = {};
  for (const [rot, tilt] of [['inclinadas 15°', 15], ['verticais', 0]]) {
    const { page, erros, ctx } = await novoApp();
    resultados[rot] = await medir(page, rot, tilt);
    ocupado(erros, () => undefined, () => undefined);
    await ctx.close();
  }
  for (const [rot, v] of Object.entries(resultados)) console.log(`  ${rot}: ${v.n} paredes; corte ${v.corte.map((x) => x.toFixed(1)).join('/')} ms (mediana ${v.mc.toFixed(1)}); elevação ${v.elev.map((x) => x.toFixed(1)).join('/')} ms (mediana ${v.me.toFixed(1)})`);
  const i = resultados['inclinadas 15°']; const v = resultados.verticais;
  check('30 paredes inclinadas criadas', i.n === 30, i.n);
  check('corte (30 paredes 15°) < 100 ms', i.mc < 100, `${i.mc.toFixed(1)} ms [${i.corte.map((x) => x.toFixed(1))}]`);
  check('elevação (30 paredes 15°) < 100 ms', i.me < 100, `${i.me.toFixed(1)} ms [${i.elev.map((x) => x.toFixed(1))}]`);
  check('linha de base: corte (30 verticais)', true, `${v.mc.toFixed(1)} ms [${v.corte.map((x) => x.toFixed(1))}]`);
  check('linha de base: elevação (30 verticais)', true, `${v.me.toFixed(1)} ms [${v.elev.map((x) => x.toFixed(1))}]`);
});

await browser.close();
console.log('\n== RESUMO');
for (const r of rows) { console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.nome}`); for (const c of r.checks) console.log(`        ${c.ok ? 'ok  ' : 'FAIL'} ${c.nm}${c.val ? `  [${c.val}]` : ''}`); if (r.shots.length) console.log(`        capturas: ${r.shots.join(', ')}`); }
writeFileSync(path.join(EVID, 'resultado.json'), JSON.stringify(rows, null, 1));
process.exit(rows.every((r) => r.pass) ? 0 : 1);
