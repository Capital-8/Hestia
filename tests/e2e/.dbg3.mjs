import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
page.on('pageerror', (e) => console.log('[pe]', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:4192/?debug=1&gl=1');
await page.waitForFunction(() => window.__hestia?.geomKernel, null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Novo projeto/ }).first().click();
await page.getByRole('button', { name: /Em branco/ }).click({ timeout: 1500 }).catch(() => undefined);
await page.waitForFunction(() => window.__hestia.useUi.getState().tela === 'editor');
const t = readFileSync(process.env.HOME + '/Documents/Projetos/Projeto sem título/projeto.hestia.json', 'utf8');
await page.evaluate(async (t) => { const { editor, model } = window.__hestia; editor.load(model.migrateProject(JSON.parse(t)), 'd.json'); await new Promise((r) => setTimeout(r, 4000)); }, t);
const r = await page.evaluate(async () => {
  const { editor } = window.__hestia; const ex = await window.__hestia.executarResolucao(); const K = await window.__hestia.geomKernel();
  globalThis.__cap = [];
  const p = editor.project; const sec = p.views.find((v) => v.kind === 'section');
  // captura rapida: aborta depois de 12 s
  const t0 = performance.now();
  try { ex('corte', p, sec.id); } catch (e) {}
  const cap = globalThis.__cap; globalThis.__cap = null;
  const nv = (m) => m.reduce((s, q) => s + q.reduce((t, r) => t + r.length, 0), 0);
  cap.sort((x, y) => x.uteis.reduce((s, m) => s + nv(m), 0) - y.uteis.reduce((s, m) => s + nv(m), 0));
  const alvo = cap[cap.length - 1];
  const tm = (f) => { const t = performance.now(); const o = f(); return [Math.round(performance.now() - t), o]; };
  const area = (m) => m.reduce((s, q) => s + q.reduce((t, r, i) => { let a = 0; for (let k = 0; k < r.length; k++) { const u = r[k], v = r[(k + 1) % r.length]; a += u.x * v.y - v.x * u.y; } return t + (i === 0 ? 1 : -1) * Math.abs(a) / 2; }, 0), 0);
  const res = { n: cap.length, a: nv(alvo.a), subs: alvo.uteis.map(nv) };
  const [t1, o1] = tm(() => K.differenceClipper(alvo.a, ...alvo.uteis)); res.orig = [t1, area(o1), nv(o1)];
  const seq = (grupos) => { let r = alvo.a; for (const g of grupos) { if (!r.length) break; r = K.differenceClipper(r, ...g); } return r; };
  const [tA, oA] = tm(() => seq(alvo.uteis.map((m) => [m]))); res.um_a_um = [tA, area(oA), nv(oA)];
  const polys = alvo.uteis.flatMap((m) => m.map((q) => [q]));
  for (const L of [4, 16, 64]) { const gr = []; for (let i = 0; i < polys.length; i += L) gr.push(polys.slice(i, i + L)); const [tB, oB] = tm(() => seq(gr.map((g) => [g.flat()]))); res['poligonos_lote' + L] = [tB, area(oB), nv(oB), gr.length]; }
  return res;
}, null).catch((e) => String(e));
console.log(JSON.stringify(r));
await b.close();
