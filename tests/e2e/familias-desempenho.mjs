// Medição do desempenho do pan, do zoom e do mouse com muitos tubos e conexões (ficha N1). Cria N tubos da Krona em grade e mede o
// intervalo entre quadros (média e p95) durante pan e zoom programáticos e o custo de mover o mouse sobre o desenho.
// Uso: CHROME_PATH=... APP='http://127.0.0.1:5211/?debug=1' N=200 node tests/e2e/familias-desempenho.mjs
import { chromium } from 'playwright-core';
import { CHROME_ARGS, chromeExecutable } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5211/?debug=1';
const N = Number(process.env.N ?? 200);
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 800 } })).newPage();
await page.goto(APP);
await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
await page.getByRole('button', { name: /Novo projeto/ }).first().click();
await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });

const cria = await page.evaluate(async (n) => {
  const { editor, model, engine } = window.__hestia;
  const nivel = window.__hestia.useUi.getState().levelId;
  for (const id of ['fam_krona_esgoto_tubo_corte', 'fam_krona_esgoto_joelho90']) editor.store.exec({ type: 'upsertFamily', family: structuredClone(model.familiaDaBiblioteca(id)) });
  const t0 = performance.now();
  editor.store.transaction('carga', () => {
    for (let i = 0; i < n; i++) {
      const linha = Math.floor(i / 20);
      const a = [(i % 20) * 1.2, linha * 1.0, 0.5];
      const b = [a[0] + 1, a[1], 0.5];
      const c = engine.trechoDeTubo(a, b, { id: 'fam_krona_esgoto_tubo_corte' }, 100, { id: `t${i}`, levelId: nivel });
      editor.store.exec({ type: 'addComponent', component: c });
      if (i % 2 === 0) editor.store.exec({ type: 'addComponent', component: { id: `j${i}`, kind: 'component', familyId: 'fam_krona_esgoto_joelho90', typeId: 'dn100', levelId: nivel, order: 0, x: b[0], y: b[1], z: 0.5, rotation: 0, mirrored: false, mark: '' } });
    }
  });
  return { n, ms: Math.round(performance.now() - t0), comps: Object.values(editor.store.project.elements).filter((e) => e.kind === 'component').length };
}, N);
console.log('carga', JSON.stringify(cria));
await page.evaluate(() => window.__hestia.editor.zoomFit?.());
await page.waitForTimeout(1500);

const quadros = (passo) => page.evaluate(async (tipo) => {
  const { editor } = window.__hestia;
  const t = [];
  let ult = performance.now();
  for (let i = 0; i < 90; i++) {
    if (tipo === 'pan') editor.pan(i % 2 === 0 ? 14 : -14, 6); else editor.zoomWheel({ x: 700, y: 400 }, i % 2 === 0 ? -120 : 120);
    await new Promise((r) => requestAnimationFrame(r));
    const agora = performance.now();
    t.push(agora - ult);
    ult = agora;
  }
  t.sort((a, b) => a - b);
  const media = t.reduce((s, x) => s + x, 0) / t.length;
  return { media: Math.round(media * 10) / 10, p95: Math.round(t[Math.floor(t.length * 0.95)] * 10) / 10, max: Math.round(t[t.length - 1] * 10) / 10 };
}, passo);
console.log('pan   ', JSON.stringify(await quadros('pan')));
console.log('zoom  ', JSON.stringify(await quadros('zoom')));

// Custo SÍNCRONO de cada pointermove (o que o mouse paga, sem esperar o quadro), com a ferramenta Selecionar e com a ferramenta Tubo.
const custo = (ferramenta) => page.evaluate(async (f) => {
  const { editor } = window.__hestia;
  editor.setTool(f);
  const c = document.querySelector('.canvas-wrap canvas');
  const r = c.getBoundingClientRect();
  const mover = (i) => c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.x + 200 + ((i * 37) % 800), clientY: r.y + 150 + ((i * 53) % 400), bubbles: true, pointerId: 1 }));
  if (f === 'tubo') {
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.x + 300, clientY: r.y + 300, bubbles: true, pointerId: 1, button: 0, buttons: 1 }));
    c.dispatchEvent(new PointerEvent('pointerup', { clientX: r.x + 300, clientY: r.y + 300, bubbles: true, pointerId: 1, button: 0 }));
  }
  const t = [];
  for (let i = 0; i < 150; i++) { const t0 = performance.now(); mover(i); t.push(performance.now() - t0); }
  t.sort((x, y) => x - y);
  const media = t.reduce((sum, x) => sum + x, 0) / t.length;
  return { ferramenta: f, mediaMs: Math.round(media * 100) / 100, p95Ms: Math.round(t[Math.floor(t.length * 0.95)] * 100) / 100, maxMs: Math.round(t[t.length - 1] * 100) / 100 };
}, ferramenta);
console.log('mouse ', JSON.stringify(await custo('select')));
console.log('mouse ', JSON.stringify(await custo('tubo')));
await browser.close();
