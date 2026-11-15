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

const r = await page.evaluate(async (t) => {
  const { editor, model, resolveLevel } = window.__hestia; const ex = await window.__hestia.executarResolucao();
  const p = editor.project; const out = {};
  for (const lv of p.levels) { const t0 = performance.now(); try { resolveLevel(p, lv.id); } catch (e) { out['err'+lv.id] = String(e).slice(0,80); } out['lv_' + lv.id] = Math.round(performance.now() - t0); }
  const sec = p.views.find((v) => v.kind === 'section');
  const t0 = performance.now(); try { ex('corte', p, sec.id); } catch (e) { out.errcorte = String(e).slice(0, 200); } out.corte = Math.round(performance.now() - t0);
  out.len = JSON.stringify(globalThis.__lentas); return out;
}, t);
console.log(JSON.stringify(r));
const profile = { nodes: [], samples: [], timeDeltas: [] };
const dt = profile.timeDeltas; const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + dt[i] / 1000); });
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${Math.round(v)} ms  ${k}`).join('\n'));
await b.close();
