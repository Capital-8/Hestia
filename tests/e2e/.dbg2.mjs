import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
await page.goto('http://127.0.0.1:4192/?debug=1&gl=1');
await page.waitForFunction(() => window.__hestia?.executarResolucao, null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Novo projeto/ }).first().click();
await page.getByRole('button', { name: /Em branco/ }).click({ timeout: 1500 }).catch(() => undefined);
await page.waitForFunction(() => window.__hestia.useUi.getState().tela === 'editor');
const t = readFileSync(process.env.HOME + '/Documents/Projetos/Projeto sem título/projeto.hestia.json', 'utf8');
await page.evaluate(async (t) => { const { editor, model } = window.__hestia; editor.load(model.migrateProject(JSON.parse(t)), 'd.json'); await new Promise((r) => setTimeout(r, 4000)); }, t);
const cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
const r = await page.evaluate(async (t) => {
  const { model } = window.__hestia; const ex = await window.__hestia.executarResolucao();
  const out = {}; window.__hestiaKernel.reset?.();
  for (let k = 0; k < 3; k++) {
    const p = model.migrateProject(JSON.parse(t)); const sec = p.views.find((v) => v.kind === 'section');
    const t0 = performance.now(); ex('corte', p, sec.id); out['corte' + k] = Math.round(performance.now() - t0);
  }
  out.med = Object.fromEntries(Object.entries(window.__hestiaKernel.medicao().porOp).map(([k, v]) => [k, [v.chamadas, Math.round(v.ms)]]));
  return out;
}, t);
console.log(JSON.stringify(r));
const { profile } = await cdp.send('Profiler.stop');
const dt = profile.timeDeltas; const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map(); profile.nodes.forEach((n) => (n.children ?? []).forEach((c) => parent.set(c, n.id)));
const incl = new Map();
profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + dt[i] / 1000); const seen = new Set(); for (let c = id; c !== undefined; c = parent.get(c)) { const m = byId.get(c); const kk = `${m.callFrame.functionName || '(anon)'}:${m.callFrame.lineNumber}`; if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + dt[i] / 1000); } } });
console.log('SELF\n' + [...self].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${Math.round(v)} ms  ${k}`).join('\n'));
console.log('INCL\n' + [...incl].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${Math.round(v)} ms  ${k}`).join('\n'));
await b.close();
