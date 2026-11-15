import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
page.on('pageerror', (e) => console.log('[pe]', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:4192/?debug=1&gl=1');
await page.waitForFunction(() => window.__hestia?.executarResolucao, null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Novo projeto/ }).first().click();
await page.getByRole('button', { name: /Em branco/ }).click({ timeout: 1500 }).catch(() => undefined);
await page.waitForFunction(() => window.__hestia.useUi.getState().tela === 'editor');
const t = readFileSync(process.env.HOME + '/Documents/Projetos/Projeto sem título/projeto.hestia.json', 'utf8');
const cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
const r0 = await page.evaluate(async (t) => { const { editor, model } = window.__hestia; editor.load(model.migrateProject(JSON.parse(t)), 'd.json'); await new Promise((r) => setTimeout(r, 4000)); }, t);

await cdp.send('Profiler.start');
const r = await page.evaluate(async (t) => {
  const { editor, model } = window.__hestia; const ex = await window.__hestia.executarResolucao();
  const out = {}; const K = await window.__hestia.geomKernel();
  window.__hestiaKernel.reset?.();
  for (let k = 0; k < 1; k++) {
    const p = model.migrateProject(JSON.parse(t)); const sec = p.views.find((v) => v.kind === 'section');
    const t0 = performance.now(); ex('corte', p, sec.id); out['corte' + k] = Math.round(performance.now() - t0);
  }
  const parts = globalThis.__cap[0]; const nv = (m) => m.reduce((s, q) => s + q.reduce((t, r) => t + r.length, 0), 0);
  const tm = (f) => { const t = performance.now(); const o = f(); return [Math.round(performance.now() - t), nv(o)]; };
  out.todos = tm(() => K.unionClipper(...parts));
  const idx = parts.map((m, i) => i).sort((i, j) => nv(parts[i]) - nv(parts[j]));
  out.fold = tm(() => { let acc = []; for (const i of idx) acc = K.unionClipper(acc, parts[i]); return acc; });
  out.grandeSo = tm(() => K.unionClipper(parts[10]));
  out.sem715 = tm(() => K.unionClipper(...parts.filter((_, i) => i !== 10)));
  out.fold715 = tm(() => { const g = K.unionClipper(parts[10]); return K.unionClipper(g, ...parts.filter((_, i) => i !== 10)); });
  out.byArea = 0; out.partsV = parts.map(nv).join(','); return out;
}, t);
console.log(JSON.stringify(r));
const { profile } = await cdp.send('Profiler.stop');
const dt = profile.timeDeltas; const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + dt[i] / 1000); });
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${Math.round(v)} ms  ${k}`).join('\n'));
await b.close();
