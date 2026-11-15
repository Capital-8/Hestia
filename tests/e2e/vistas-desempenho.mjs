// D5: desempenho de abrir corte e elevação NO NAVEGADOR, por fase. Dois cenários: o projeto principal do dono (lido de
// `HESTIA_DONO`, padrão ~/Documents/Projetos/Projeto sem título/projeto.hestia.json; nada é copiado para o repositório; sem o
// arquivo o cenário é pulado) e 30 paredes (zigue-zague da linha de base do parede-inclinada.mjs, verticais).
// Imprime a tabela de fases e sai com 1 se estourar a meta com folga 3x (1ª abertura < 200 ms, seguintes < 100 ms).
//   node tests/e2e/vistas-desempenho.mjs        (APP_URL, CHROME_PATH, HESTIA_DONO, RODADAS, SO=dono|30v|30i)
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_APP = process.env.APP_URL ?? 'http://127.0.0.1:4192/';
const DONO = process.env.HESTIA_DONO ?? path.join(os.homedir(), 'Documents/Projetos/Projeto sem título/projeto.hestia.json');
const META_1A = 200; const META_SEG = 100; const FOLGA = 3;
const RODADAS = Number(process.env.RODADAS ?? 3);
const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ARGS });

async function novoApp() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(`${URL_APP}?debug=1&gl=1`);
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Novo projeto/ }).first().click({ timeout: 30000 });
  await page.getByRole('button', { name: /Em branco/ }).click({ timeout: 1500 }).catch(() => undefined);
  await page.waitForFunction(() => window.__hestia.useUi.getState().tela === 'editor', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  return { page, ctx, erros };
}

/** Monta o cenário e devolve as vistas-modelo (corte e elevação) a abrir. */
async function montar(page, cenario) {
  if (cenario === 'dono') {
    const texto = readFileSync(DONO, 'utf8');
    return page.evaluate((t) => {
      const { editor, model } = window.__hestia;
      editor.load(model.migrateProject(JSON.parse(t)), 'dono.hestia.json');
      const vs = editor.project.views;
      return { section: vs.find((v) => v.kind === 'section'), elevation: vs.find((v) => v.kind === 'elevation') };
    }, texto);
  }
  const tilt = cenario === '30i' ? 15 : 0;
  return page.evaluate((tilt) => {
    const { editor, model } = window.__hestia;
    const pts = []; for (let i = 0; i <= 30; i++) pts.push({ x: i * 3, y: i % 2 ? 2 : 0 });
    for (let i = 0; i < 30; i++) editor.applyCommand({ type: 'addWall', wall: model.makeWall({ id: model.newId('wall'), typeId: 'wt_conc15', levelId: 'lv_0', a: pts[i], b: pts[i + 1], ...(tilt ? { tilt } : {}) }) });
    return { section: { kind: 'section', name: 'c', a: { x: -2, y: 1 }, b: { x: 92, y: 1 }, depth: 6 }, elevation: { kind: 'elevation', name: 'e', a: { x: -2, y: -3 }, b: { x: 92, y: -3 }, depth: 12 } };
  }, tilt);
}

/** Abre uma vista (nova ou já existente) e devolve o tempo total e as fases (ms). */
function abrir(page, modelo, nova) {
  return page.evaluate(async ([modelo, nova]) => {
    const { editor, model, useUi } = window.__hestia;
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    let id = modelo.id;
    if (nova) { id = model.newId('v'); const { id: _i, ...resto } = modelo; editor.applyCommand({ type: 'addView', view: { ...resto, id, name: `${resto.name} ${id}` } }); }
    else { editor.closeSection(); await raf(); await raf(); }
    await new Promise((r) => setTimeout(r, 150)); // deixa o app ocioso
    const vp = window.__vperf; vp.reset();
    const t0 = performance.now(); editor.openSection(id);
    let fim = null;
    for (let g = 0; g < 3000 && fim === null; g++) {
      await raf();
      const m = vp.marks; const ic = m.findIndex(([n]) => n === 'cache');
      if (ic >= 0 ? m.slice(ic).some(([n]) => n === 'r_fim') : editor.sectionFresh(id) && m.some(([n]) => n === 'r_fim')) fim = performance.now();
    }
    await raf(); const apres = performance.now();
    const E = (n, depois = -Infinity) => { const x = vp.marks.find(([nm, t]) => nm === n && t >= depois); return x ? x[1] : NaN; };
    const base = performance.timeOrigin + t0;
    const abre = E('abrir', base - 5);
    const ped = E('pedido', abre); const pos = E('postado', ped); const wr = E('w_recebido', pos - 1); const wi = E('w_inicio', wr); const wf = E('w_fim', wi);
    const rsp = E('resposta', pos); const cache = E('cache', rsp); const bi = E('b_ini', cache); const bf = E('b_fim', bi); const dl = E('dl_fim', bf); const rf = E('r_fim', bi);
    const fases = {
      '1 pedido (abrir->postMessage)': ped - abre, '2 clone/postagem': pos - ped, '3 ida ao worker': wr - pos, '4 calculo no worker': wf - wi + (wi - wr),
      '5 volta (clone do resultado)': rsp - wf, '6 promessa->cache': cache - rsp, '7 espera do quadro (React/layout)': bi - cache,
      '8 primitivas (build)': bf - bi, '9 setDrawList (malhas)': dl - bf, '10 render GL (submissao)': rf - dl, '11 apresentacao (rAF)': (apres - base) - (rf - base),
    };
    return { id, total: apres - t0, ate_render: fim - t0, fases };
  }, [modelo, nova]);
}
const mediana = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const cenarios = [['dono', 'projeto do dono'], ['30v', '30 paredes verticais'], ['30i', '30 paredes 15 graus']].filter(([c]) => !process.env.SO || process.env.SO.split(',').includes(c));
const linhas = []; let falhou = false;
for (const [cen, rotulo] of cenarios) {
  if (cen === 'dono' && !existsSync(DONO)) { console.log(`(pulado: ${DONO} nao existe)`); continue; }
  const { page, ctx, erros } = await novoApp();
  const modelos = await montar(page, cen);
  await page.waitForTimeout(2500);
  for (const [tipo, mod] of [['corte', modelos.section], ['elevacao', modelos.elevation]]) {
    if (!mod) continue;
    const primeira = await abrir(page, mod, true);
    const seg = []; for (let k = 0; k < RODADAS; k++) seg.push(await abrir(page, mod, true));
    const reab = []; const idReab = seg[0].id; for (let k = 0; k < RODADAS; k++) reab.push(await abrir(page, { ...mod, id: idReab }, false));
    const med = (xs) => mediana(xs.map((x) => x.total));
    const fasesSeg = {}; for (const k of Object.keys(seg[0].fases)) fasesSeg[k] = mediana(seg.map((x) => x.fases[k]));
    linhas.push({ rotulo, tipo, primeira: primeira.total, seg: med(seg), reab: med(reab), f1: primeira.fases, fs: fasesSeg });
    if (primeira.total > META_1A * FOLGA || med(seg) > META_SEG * FOLGA) falhou = true;
  }
  if (erros.length) console.log(`erros de pagina em ${rotulo}: ${erros.slice(0, 2).join(' | ').slice(0, 300)}`);
  await ctx.close();
}
await browser.close();
const f = (x) => (Number.isFinite(x) ? x.toFixed(1).padStart(7) : '    n/d');
console.log('\n== Tempos totais (ms, ate a apresentacao): 1a abertura | seguintes (mediana) | reabrir c/ cache');
for (const l of linhas) console.log(`${l.rotulo.padEnd(24)} ${l.tipo.padEnd(9)} ${f(l.primeira)} ${f(l.seg)} ${f(l.reab)}`);
console.log('\n== Fases (ms): 1a abertura | seguintes (mediana)');
for (const l of linhas) { console.log(`-- ${l.rotulo} / ${l.tipo}`); for (const k of Object.keys(l.f1)) console.log(`   ${k.padEnd(38)} ${f(l.f1[k])} ${f(l.fs[k])}`); }
console.log(`\nMetas: 1a < ${META_1A} ms, seguintes < ${META_SEG} ms (limite do script com folga ${FOLGA}x: ${META_1A * FOLGA}/${META_SEG * FOLGA}). ${falhou ? 'ESTOUROU' : 'dentro do limite'}`);
process.exit(falhou ? 1 : 0);
