import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * Integração terreno + multitelas: projeto com terreno, painéis planta | 3D lado a lado; o terreno tem de aparecer nos DOIS painéis
 * (a captura de cada painel muda ao criar o terreno) e a planta continua desenhando após ativar o painel 3D.
 * Uso: APP='http://127.0.0.1:4190/?gl=1&debug=1' node tests/e2e/terreno-multitelas.mjs
 */
const URL_APP = process.env.APP ?? 'http://127.0.0.1:4190/?gl=1&debug=1';
const exe = ['/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 950 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/status of 404/.test(m.text()) && errors.push(m.text()));
page.on('response', (r) => r.status() === 404 && !/favicon/.test(r.url()) && errors.push(`404 ${r.url()}`));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
let n = 0;
const ok = (s) => console.log(`ok ${++n} ${s}`);
const cap = async (i) => (await page.locator('.pane-body').nth(i).screenshot()).toString('base64');
try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__hestiaKernel?.estado().ativo, null, { timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.removeItem('hestia.panes');
    window.__hestia.editor.newProject('house2');
    window.__hestia.useUi.setState({ tela: 'editor' });
  });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.getByRole('button', { name: 'Layout de painéis' }).click();
  await page.getByText('Duas colunas', { exact: true }).click();
  await page.waitForTimeout(2500);
  const antes = [await cap(0), await cap(1)];
  const kinds = await page.evaluate(() => {
    const out = [];
    const v = (nn) => (nn.kind === 'leaf' ? out.push(nn.pane.view.kind) : (v(nn.first), v(nn.second)));
    v(window.__hestia.usePanes.getState().layout.root);
    return out;
  });
  assert.deepEqual(kinds.slice().sort(), ['3d', 'plan']);
  ok(`painéis ${kinds.join(' | ')}`);
  // Terreno 40 x 30 m com um morro: 12 pontos de cota variável.
  await page.evaluate(() => {
    const { editor } = window.__hestia;
    const lv = editor.project.levels[0].id;
    const pontos = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) pontos.push(-15 + i * 10, -10 + j * 10, 1 + Math.sin(i) * 1.5 + j * 0.4);
    editor.store.exec({ type: 'addTerrain', terrain: { kind: 'terrain', id: 'tnx', levelId: lv, name: 'Terreno', pontos, curvas: [], quebras: [], intervaloCurvas: 0.5, mestraCada: 5, espessuraBase: 3, mostrarExistente: false, linhasRotulo: [], pontosCotados: [] } });
  });
  await page.waitForTimeout(4000);
  const depois = [await cap(0), await cap(1)];
  assert.notEqual(antes[0], depois[0], 'o painel 0 mudou com o terreno');
  assert.notEqual(antes[1], depois[1], 'o painel 1 mudou com o terreno');
  ok('os dois painéis (planta e 3D) mudaram ao criar o terreno');
  const t = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'terrain').length);
  assert.equal(t, 1);
  const kn = await page.evaluate(() => window.__hestiaKernel.estado());
  assert.ok(kn.ativo, 'kernel ativo');
  ok(`terreno no modelo e kernel ativo (${JSON.stringify(kn).slice(0, 80)})`);
  assert.equal(errors.length, 0, errors.join('\n'));
  ok('sem erros no console');
  console.log(`TODOS OS ${n} PASSOS PASSARAM`);
} catch (e) {
  console.log(`FALHOU: ${e.stack ?? e.message}\nERROS: ${errors.join(' | ')}`);
  process.exitCode = 1;
}
await browser.close();
