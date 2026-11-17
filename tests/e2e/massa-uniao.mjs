// Polígono com o campo Lados e botão "Unir formas" (frente massa-forma-livre). Fluxo do navegador, só por cliques na faixa,
// na barra de opções e no painel de propriedades; `window.__hestia` apenas CONFERE (valores literais calculados à mão).
//   Retângulo 6 x 4 em (30,30)-(36,34) + círculo de centro (36,32) e raio 3 (sobrepostos). União por TR: as duas bordas do
//   retângulo (y = 34 e y = 30) aparam contra o círculo em x = 36 - sqrt(5) = 33,7639 e a aresta direita (x = 36) sai com Excluir.
//   Área da união = 24 + 9π - (4·√5 + 2·(7,0686 - 6,0209)·... ) = 41,2346 m² (cordas de 2 mm tiram menos de 0,05).
// Uso: APP=http://127.0.0.1:4195/?gl=1&debug=1 node tests/e2e/massa-uniao.mjs
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL_APP = process.env.APP ?? 'http://127.0.0.1:4195/?gl=1&debug=1';
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
const massas = () => H(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'mass').sort((a, b) => a.order - b.order).map((m) => JSON.parse(JSON.stringify(m))));
const status = () => H(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); });
const estadoEsboco = () => H(() => { const v = window.__hestia.editor.perimetro.view(); return { ativo: v.active, alvo: v.target ?? null, segs: v.draft?.segs.length ?? 0, ok: v.result?.ok ?? null, editing: v.editing ?? null }; });
const mundo = (x, y) => H(({ x, y }) => { const r = document.querySelector('.canvas-wrap').getBoundingClientRect(); const vp = window.__hestia.editor.viewport(); return { x: r.x + vp.width / 2 + (x - vp.cx) * vp.zoom, y: r.y + vp.height / 2 - (y - vp.cy) * vp.zoom }; }, { x, y });
const clique = async (x, y) => { const p = await mundo(x, y); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(80); };
const btn = (n) => page.getByRole('button', { name: n, exact: true }).first();
const area = (pts) => Math.abs(pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]; return s + (a.x * b.y - b.x * a.y); }, 0)) / 2;
const num = async (sel, v) => { const f = page.locator(sel); await f.fill(String(v)); await f.press('Enter'); await page.waitForTimeout(150); };
const valor = (sel) => page.locator(sel).inputValue();
const abrirEsboco = async () => {
  await page.getByRole('button', { name: 'Massa e terreno', exact: true }).click();
  await page.getByRole('group', { name: 'Modelo de massa', exact: true }).getByRole('button', { name: 'Massa', exact: true }).click();
  await page.waitForTimeout(300);
};

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
  await H(() => { localStorage.removeItem('hestia.panes'); const { editor, useUi } = window.__hestia; editor.newProject('house2'); useUi.setState({ tela: 'editor' }); });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(1000);
  await H(() => { const { editor } = window.__hestia; const v = editor.viewport(); editor.setViewport({ ...v, cx: 38, cy: 32, zoom: 40 }); });
  const segs = () => H(() => window.__hestia.editor.perimetro.view().draft?.segs.length ?? 0);
  const ok = () => H(() => window.__hestia.editor.perimetro.view().result?.ok ?? null);

  await passo('a. Polígono inscrito: campo Lados = 6, dois cliques, 6 linhas, Concluir habilitado, massa de 6 vértices', async () => {
    await abrirEsboco();
    await num('#opt-pm-lados', 6);
    check('campo Lados mostra 6', (await valor('#opt-pm-lados')) === '6', await valor('#opt-pm-lados'));
    await btn('Polígono inscrito').click();
    await clique(30, 30);
    check('depois do 1º clique não pede digitação (prompt vazio)', (await H(() => window.__hestia.editor.activeTool.inputPrompt())) === null);
    await clique(32, 30);
    check('esboço com 6 linhas', (await segs()) === 6, String(await segs()));
    check('Concluir habilitado (ok=true)', (await ok()) === true);
    check('botão Concluir habilitado no DOM', await btn('Concluir').isEnabled());
    await num('#opt-mass-altura', 9);
    await btn('Concluir').click();
    await page.waitForTimeout(300);
    const m = (await massas()).at(-1);
    const pts = m.secoes[0].perfil.pontos;
    check('massa livre com 6 vértices', m.secoes[0].perfil.forma === 'livre' && pts.length === 6, String(pts.length));
    const a = area(pts);
    check('área do hexágono 10,3923 m²', Math.abs(a - 10.3923) < 1e-3, a.toFixed(4));
    check('volume 93,53 m³ (área x 9)', Math.abs(a * m.secoes[1].z - 93.5307) < 1e-2, (a * m.secoes[1].z).toFixed(4));
  });

  await passo('a2. Lados = 8 no campo: octógono; Lados fora de 3 a 64 volta ao limite', async () => {
    await H(() => window.__hestia.useUi.setState({ selection: [] }));
    await abrirEsboco();
    await num('#opt-pm-lados', 8);
    await btn('Polígono circunscrito').click();
    await clique(30, 30); await clique(32, 30);
    check('esboço com 8 linhas', (await segs()) === 8, String(await segs()));
    await btn('Cancelar').click();
  });

  await passo('b. Dois retângulos sobrepostos + Unir formas = 1 contorno de 28 m²', async () => {
    await abrirEsboco();
    await btn('Retângulo').click();
    await clique(30, 30); await clique(34, 34);
    await clique(32, 32); await clique(36, 36);
    check('8 linhas e Concluir recusado (laços se cruzam)', (await segs()) === 8 && (await ok()) === false);
    check('botão Concluir desabilitado', await btn('Concluir').isDisabled());
    await btn('Unir formas').click();
    check('1 contorno válido: Concluir habilitado', (await ok()) === true, await status());
    check('mensagem da união', (await status()).includes('2 formas unidas em 1 contorno'), await status());
    const ring = await H(() => window.__hestia.editor.perimetro.view().result.loops[0].ring);
    check('contorno com 8 vértices e área 28', ring.length === 8 && Math.abs(area(ring) - 28) < 1e-9, `${ring.length} / ${area(ring)}`);
    // d. Ctrl+Z desfaz a união (volta aos 2 retângulos soltos) e Ctrl+Y refaz
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    check('d. Ctrl+Z desfaz a união: Concluir volta a recusado', (await ok()) === false && (await segs()) === 8);
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(150);
    check('d. Ctrl+Y refaz a união', (await ok()) === true);
    await num('#opt-mass-altura', 5);
    await btn('Concluir').click();
    await page.waitForTimeout(300);
    const m = (await massas()).at(-1);
    const pts = m.secoes[0].perfil.pontos;
    check('massa criada com o contorno da união (8 pontos)', pts.length === 8, String(pts.length));
    check('volume = 28 x 5 = 140 m³', Math.abs(area(pts) * m.secoes[1].z - 140) < 1e-6, (area(pts) * m.secoes[1].z).toFixed(6));
  });

  await passo('c. Formas disjuntas: aviso e nada muda', async () => {
    await H(() => window.__hestia.useUi.setState({ selection: [] }));
    await abrirEsboco();
    await btn('Retângulo').click();
    await clique(40, 30); await clique(42, 32);
    await clique(45, 30); await clique(47, 32);
    await btn('Unir formas').click();
    check('aviso "não se sobrepõem"', (await status()).includes('não se sobrepõem'), await status());
    check('continuam 8 linhas', (await segs()) === 8);
    await btn('Cancelar').click();
  });

  await passo('e. Piso: o campo Lados e Unir formas valem em todos os alvos (hexágono + hexágono sobrepostos, Concluir cria 1 piso)', async () => {
    await H(() => window.__hestia.editor.perimetro.begin('floor'));
    await page.waitForTimeout(300);
    await num('#opt-pm-lados', 6);
    await btn('Polígono inscrito').click();
    await clique(30, 30); await clique(32, 30);
    await clique(31.1, 30.5); await clique(33.1, 30.5);
    check('piso: 12 linhas e recusado', (await segs()) === 12 && (await ok()) === false);
    await btn('Unir formas').click();
    check('piso: união válida', (await ok()) === true, await status());
    const antes = await H(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'floor').length);
    await btn('Concluir').click();
    await page.waitForTimeout(300);
    const depois = await H(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'floor').length);
    check('piso criado a partir da união', depois === antes + 1, `${antes} -> ${depois}`);
  });
} finally {
  console.log('\nerros de console:', erros.length);
  for (const e of erros.slice(0, 5)) console.log('  ', e.slice(0, 200));
  check('sem erro de console/página', erros.length === 0);
  await browser.close();
  console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
}
