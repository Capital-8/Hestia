import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
page.on('console', (m) => console.log('[c]', m.type(), m.text().slice(0, 300)));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
page.on('worker', (w) => { console.log('[worker]', w.url()); });
page.on('pageerror', (e) => console.log('[pe]', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:4192/?debug=1&gl=1');
await page.waitForFunction(() => window.__hestia, null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Novo projeto/ }).first().click();
await page.getByRole('button', { name: /Em branco/ }).click({ timeout: 1500 }).catch(() => undefined);
await page.waitForFunction(() => window.__hestia.useUi.getState().tela === 'editor');
const t = readFileSync(process.env.HOME + '/Documents/Projetos/Projeto sem título/projeto.hestia.json', 'utf8');
const r = await page.evaluate(async (t) => {
  const { editor, model } = window.__hestia;
  editor.load(model.migrateProject(JSON.parse(t)), 'd.json');
  await new Promise((r) => setTimeout(r, 3000));
  const id = editor.project.views.find((v) => v.kind === 'section').id;
  window.__vperf.reset(); const t0 = performance.now();
  editor.openSection(id);
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 500)); if (editor.sectionFresh(id)) break; }
  return { fresh: editor.sectionFresh(id), dt: performance.now() - t0, marks: window.__vperf.marks.map(([n, t]) => [n, Math.round(t - window.__vperf.marks[0][1])]) };
}, t);
console.log(JSON.stringify(r));
await b.close();
