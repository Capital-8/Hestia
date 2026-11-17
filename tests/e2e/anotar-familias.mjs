// Famílias de anotação e Localização. Fluxo no navegador; `window.__hestia` só CONFERE (valores literais calculados à mão).
//   Localização: origem E 500000, N 7000000, cota zero 760, norte verdadeiro 0° e depois 90°, pelo diálogo real.
//   Ponto (10, 5) no nível 0 (cota 0): com norte 0, E = 500010, N = 7000005, cota = 760,00.
//   Com norte 90° (θ = π/2): E = 500000 + 10·cos θ − 5·sen θ = 499995; N = 7000000 + 10·sen θ + 5·cos θ = 7000010.
// Uso: APP=http://127.0.0.1:4198/?gl=1&debug=1 node tests/e2e/anotar-familias.mjs
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL_APP = process.env.APP ?? 'http://127.0.0.1:4198/?gl=1&debug=1';
const exe = ['/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const erros = [];
page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
let falhas = 0;
const check = (nome, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}${extra !== '' ? ` (${extra})` : ''}`);
  if (!ok) falhas++;
};
async function passo(nome, fn) {
  console.log(`\n== ${nome}`);
  try { await fn(); } catch (e) { check(`${nome}: sem exceção`, false, e.message.split('\n')[0]); }
}
const H = (fn, arg) => page.evaluate(fn, arg);
/** Textos e corpos (px) dos rótulos de anotação desenhados na tela. */
const rotulos = () => H(() => [...document.querySelectorAll('.labels .plan-note, .labels .dim-label')].map((n) => ({ t: n.textContent ?? '', px: parseFloat(n.style.fontSize || getComputedStyle(n).fontSize) })));
const textos = async () => (await rotulos()).map((r) => r.t);
const exec = (c) => H((c) => window.__hestia.editor.store.exec(c), c);
const lv = () => H(() => window.__hestia.useUi.getState().levelId);
const aplicarLocalizacao = async (e, n, z, graus) => {
  await H(async () => { const m = await import('/src/ui/dialogs/localizacaoAberta.ts'); m.abrirLocalizacao(); });
  await page.waitForSelector('#loc-e');
  for (const [id, v] of [['#loc-e', e], ['#loc-n', n], ['#loc-z', z], ['#loc-nv', graus]]) { await page.fill(id, String(v)); await page.press(id, 'Enter'); }
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await page.waitForTimeout(400);
};

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
  await H(() => { localStorage.removeItem('hestia.panes'); const { editor, useUi } = window.__hestia; editor.newProject('house2'); useUi.setState({ tela: 'editor' }); });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(1000);
  const nivel = await lv();
  await H(() => { const { editor } = window.__hestia; editor.setViewport({ ...editor.viewport(), cx: 10, cy: 5, zoom: 40 }); });
  const alvo = { x: 10, y: 5 };
  const spots = [
    ['e_proj', 'elevation', 'spot_elev_nbr', { x: 11, y: 6 }],
    ['e_rel', 'elevation', 'spot_elev_rel', { x: 11, y: 4 }],
    ['c_proj', 'coordinate', 'spot_coord_proj', { x: 12, y: 6 }],
    ['c_surv', 'coordinate', 'spot_coord_surv', { x: 12, y: 3 }],
  ];
  await passo('1. Localização pelo diálogo: E 500000, N 7000000, cota zero 760, norte 0', async () => {
    for (const [id, kind, familyId, at] of spots) await exec({ type: 'addSpot', levelId: nivel, item: { id, kind, target: alvo, at, showLeader: true, familyId } });
    await page.waitForTimeout(300);
    console.log('antes:', JSON.stringify(await textos()));
    await aplicarLocalizacao(500000, 7000000, 760, 0);
    const loc = await H(() => window.__hestia.editor.project.localizacao);
    check('localizacao gravada', JSON.stringify(loc), JSON.stringify(loc));
    console.log('depois:', JSON.stringify(await textos()));
  });
} finally {
  await browser.close();
}
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
