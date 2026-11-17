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
  await page.locator('.btn.primary', { hasText: 'Aplicar' }).last().click();
  await page.waitForTimeout(400);
};

/** Espera (até 12 s) os rótulos satisfazerem `ok` e devolve a última leitura. */
async function esperar(ok) {
  let t = await textos();
  for (let i = 0; i < 48 && !ok(t); i++) { await page.waitForTimeout(250); t = await textos(); }
  return t;
}
const tem = (t, x) => t.includes(x);
const corpoDe = async (inicio) => (await rotulos()).find((r) => r.t.startsWith(inicio))?.px ?? 0;
const ui = (fn, arg) => H(fn, arg);
const abrirEditarTipo = async (triggerId) => { await page.locator(`#${triggerId}-edit`).click(); await page.waitForTimeout(300); };

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
  await H(() => { localStorage.removeItem('hestia.panes'); const { editor, useUi } = window.__hestia; editor.newProject('house2'); useUi.setState({ tela: 'editor' }); });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(1000);
  const nivel = await lv();
  await H(() => { const { editor } = window.__hestia; editor.setViewport({ ...editor.viewport(), cx: 10, cy: 5, zoom: 40 }); });
  const alvo = { x: 10, y: 5 };
  await exec({ type: 'upsertSpotFamily', family: { id: 'spot_coord_rel', name: 'Coordenada relativa', kind: 'coordinate', planSymbol: 'crosshair', sectionSymbol: 'triangle-open', symbolMm: 3.4, textMm: 2, base: 'relative', prefix: '', precision: 2, unit: 'project', showLeader: true } });
  const spots = [
    ['e_proj', 'elevation', 'spot_elev_nbr', { x: 11, y: 6 }, undefined],
    ['e_rel', 'elevation', 'spot_elev_rel', { x: 11, y: 4 }, undefined],
    ['e_z', 'elevation', 'spot_elev_nbr', { x: 11, y: 7 }, 2.5],
    ['e_relz', 'elevation', 'spot_elev_rel', { x: 11, y: 3 }, 2.5],
    ['c_proj', 'coordinate', 'spot_coord_proj', { x: 12, y: 6 }, undefined],
    ['c_surv', 'coordinate', 'spot_coord_surv', { x: 12, y: 3 }, undefined],
    ['c_rel', 'coordinate', 'spot_coord_rel', { x: 12, y: 9 }, undefined],
  ];
  for (const [id, kind, familyId, at, z] of spots) await exec({ type: 'addSpot', levelId: nivel, item: { id, kind, target: alvo, at, showLeader: true, familyId, ...(z !== undefined ? { z } : {}) } });

  await passo('1. Sem Localização: coordenada do projeto e elevação do nível', async () => {
    const t = await esperar((x) => tem(x, 'N +5,00 m\nE +10,00 m'));
    check('coordenada projeto/levantamento/relativa = N +5,00 / E +10,00', t.filter((x) => x === 'N +5,00 m\nE +10,00 m').length === 3, JSON.stringify(t));
    check('elevação projeto no nível 0 = ±0,00 m', tem(t, '±0,00 m'), JSON.stringify(t));
    check('elevação com z = 2,5 = +2,50 m', tem(t, '+2,50 m'), JSON.stringify(t));
  });

  await passo('2. Localização pelo diálogo: E 500000, N 7000000, cota zero 760, norte 0°', async () => {
    await aplicarLocalizacao(500000, 7000000, 760, 0);
    check('localização gravada', JSON.stringify(await H(() => window.__hestia.editor.project.localizacao)) === '{"origemE":500000,"origemN":7000000,"cotaZero":760,"norteVerdadeiro":0}');
    const t = await esperar((x) => tem(x, '+760,00 m'));
    check('elevação projeto = z 0 + 760 = +760,00 m', tem(t, '+760,00 m'), JSON.stringify(t));
    check('elevação projeto com z 2,5 = +762,50 m', tem(t, '+762,50 m'), JSON.stringify(t));
    check('elevação relativa ao nível segue ±0,00 e +2,50 (não depende da Localização)', tem(t, 'N.A. ±0,00 m') && tem(t, 'N.A. +2,50 m'), JSON.stringify(t));
    check('coordenada projeto = N +7000005,00 / E +500010,00', tem(t, 'N +7000005,00 m\nE +500010,00 m'), JSON.stringify(t));
    check('coordenada levantamento (sem ponto de levantamento) = a real da Localização', t.filter((x) => x === 'N +7000005,00 m\nE +500010,00 m').length === 2, JSON.stringify(t));
    check('coordenada relativa ao ponto-base continua N +5,00 / E +10,00', tem(t, 'N +5,00 m\nE +10,00 m'), JSON.stringify(t));
  });

  await passo('3. Norte verdadeiro 90°: E = 499995 e N = 7000010', async () => {
    await aplicarLocalizacao(500000, 7000000, 760, 90);
    const t = await esperar((x) => tem(x, 'N +7000010,00 m\nE +499995,00 m'));
    check('coordenada projeto girada 90°', tem(t, 'N +7000010,00 m\nE +499995,00 m'), JSON.stringify(t));
  });

  await passo('4. A prévia da ferramenta usa a mesma conta', async () => {
    await H(() => window.__hestia.editor.activate('spotCoordinate'));
    const p = await H(({ x, y }) => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); const vp = window.__hestia.editor.viewport(); return { x: r.x + vp.width / 2 + (x - vp.cx) * vp.zoom, y: r.y + vp.height / 2 - (y - vp.cy) * vp.zoom }; }, alvo);
    await page.mouse.move(p.x - 80, p.y + 80);
    await page.mouse.move(p.x, p.y);
    const t = await esperar((x) => tem(x, 'N +7000010,00 m / E +499995,00 m'));
    check('prévia = N +7000010,00 m / E +499995,00 m', tem(t, 'N +7000010,00 m / E +499995,00 m'), JSON.stringify(t));
    await H(() => window.__hestia.editor.activate('select'));
  });

  await passo('5. Editar o tipo (altura do texto) muda o desenho', async () => {
    await aplicarLocalizacao(500000, 7000000, 760, 0);
    await esperar((x) => tem(x, 'N +7000005,00 m\nE +500010,00 m'));
    const antes = await corpoDe('N +7000005,00');
    await H(() => { const { useUi, editor } = window.__hestia; useUi.setState({ selection: ['c_proj'] }); });
    await page.waitForSelector('#prop-spotfamily-edit');
    await abrirEditarTipo('prop-spotfamily');
    await page.fill('#sf-th', '4'); await page.press('#sf-th', 'Enter');
    await page.locator('.btn.primary', { hasText: 'OK' }).last().click();
    await page.waitForTimeout(500);
    const h = await H(() => window.__hestia.editor.project.settings.spotFamilies.find((f) => f.id === 'spot_coord_proj').textMm);
    check('altura do tipo gravada = 4 mm', h === 4, String(h));
    let depois = 0;
    for (let i = 0; i < 40 && Math.abs(depois / antes - 2) > 0.05; i++) { await page.waitForTimeout(250); depois = await corpoDe('N +7000005'); }
    check('corpo do texto passa de 2 mm para 4 mm (razão 2)', Math.abs(depois / antes - 2) < 0.05, `${antes} -> ${depois}`);
  });

  await passo('6. Terreno: família do rótulo e da cota de ponto', async () => {
    await H(({ nivel }) => {
      const { editor, useUi } = window.__hestia;
      editor.store.exec({ type: 'addTerrain', terrain: { kind: 'terrain', id: 'tn1', levelId: nivel, name: 'Terreno', pontos: [20, 20, 1, 40, 20, 1, 40, 40, 1, 20, 40, 1], curvas: [], quebras: [], intervaloCurvas: 1, mestraCada: 5, espessuraBase: 3, mostrarExistente: false, linhasRotulo: [], pontosCotados: [30, 30] } });
      editor.setViewport({ ...editor.viewport(), cx: 30, cy: 30, zoom: 40 });
      useUi.setState({ selection: ['tn1'] });
    }, { nivel });
    const t = await esperar((x) => x.some((y) => /^\+761,00/.test(y)));
    check('cota de ponto do terreno = z 1 + 760 = +761,00 m', t.some((y) => y === '+761,00 m'), JSON.stringify(t));
    const antes = await corpoDe('+761,00');
    await page.waitForSelector('#prop-tn-cotadofamily-edit');
    await abrirEditarTipo('prop-tn-cotadofamily');
    await page.fill('#tt-h', '3.6'); await page.press('#tt-h', 'Enter');
    await page.fill('#tt-pre', 'Z '); await page.press('#tt-pre', 'Enter');
    await page.locator('.btn.primary', { hasText: 'OK' }).last().click();
    await page.waitForTimeout(500);
    const t2 = await esperar((x) => x.includes('Z +761,00 m'));
    check('prefixo da família aparece: "Z +761,00 m"', t2.includes('Z +761,00 m'), JSON.stringify(t2));
    check('altura do texto 3,6 mm = 2x a de 1,8 mm', Math.abs((await corpoDe('Z +761,00')) / antes - 2) < 0.05, `${antes} -> ${await corpoDe('Z +761,00')}`);
    check('terreno guarda só o tipo de cota (padrão do projeto muda)', (await H(() => window.__hestia.editor.project.settings.defaultTerrainSpotFamilyId)) !== undefined);
  });

  await passo('7. Lote: família da linha de propriedade e do texto dos lados', async () => {
    await H(({ nivel }) => {
      const { editor, useUi } = window.__hestia;
      editor.store.exec({ type: 'addLot', lot: { kind: 'lot', id: 'lt1', levelId: nivel, name: 'Lote', contorno: [{ x: 0, y: 12 }, { x: 10, y: 12 }, { x: 10, y: 20 }, { x: 0, y: 20 }], lados: [{ papel: 'frente', recuo: 0 }, { papel: 'lateral', recuo: 0 }, { papel: 'fundo', recuo: 0 }, { papel: 'lateral', recuo: 0 }], limites: {}, mostrarEdificavel: false } });
      editor.setViewport({ ...editor.viewport(), cx: 5, cy: 16, zoom: 40 });
      useUi.setState({ selection: ['lt1'] });
    }, { nivel });
    const t = await esperar((x) => tem(x, 'frente 10,00 m'));
    check('texto do lado: "frente 10,00 m"', tem(t, 'frente 10,00 m'), JSON.stringify(t));
    const antes = await corpoDe('frente');
    await page.waitForSelector('#prop-lt-family-edit');
    await abrirEditarTipo('prop-lt-family');
    await page.fill('#lf-h', '3'); await page.press('#lf-h', 'Enter');
    await page.locator('#lf-paper').uncheck();
    await page.locator('.btn.primary', { hasText: 'OK' }).last().click();
    await page.waitForTimeout(500);
    const t2 = await esperar((x) => tem(x, '10,00 m') && !x.some((y) => y.startsWith('frente')));
    check('sem o papel do lado, o texto fica só "10,00 m"', tem(t2, '10,00 m') && !t2.some((y) => y.startsWith('frente')), JSON.stringify(t2));
    const depois = await corpoDe('10,00 m');
    check('altura do texto 3 mm = 2x a de 1,5 mm', Math.abs(depois / antes - 2) < 0.05, `${antes} -> ${depois}`);
  });

  check('sem erros de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
