// Mistura e Loft pela caixa de formas (base e topo), fantasma da base, Editar contorno base/topo, Ctrl+Z (frente massa-forma-livre).
//   Base quadrado 4x4 (36..40 x 30..34), topo círculo de raio 2 (centro 38,32), altura 6 m. O volume (entre 12,5·6 = 75 e 16·6 = 96 m³) é provado no kernel real: tests/kernel-massa-mistura-livre.wasm.test.ts. Fluxo do navegador, só por cliques na faixa,
// na barra de opções e no painel de propriedades; `window.__hestia` apenas CONFERE (valores literais calculados à mão).
//   Retângulo 6 x 4 em (30,30)-(36,34) + círculo de centro (36,32) e raio 3 (sobrepostos). União por TR: as duas bordas do
//   retângulo (y = 34 e y = 30) aparam contra o círculo em x = 36 - sqrt(5) = 33,7639 e a aresta direita (x = 36) sai com Excluir.
//   Área da união = 24 + 9π - (4·√5 + 2·(7,0686 - 6,0209)·... ) = 41,2346 m² (cordas de 2 mm tiram menos de 0,05).
// Uso: APP=http://127.0.0.1:4195/?gl=1&debug=1 node tests/e2e/massa-mistura.mjs
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
  const fantasma = () => H(() => window.__hestia.editor.activeTool.preview().filter((i) => i.kind === 'polygon' && i.dashed).length);
  const modo = (m) => H((m) => { const { useUi } = window.__hestia; const o = useUi.getState().options; useUi.setState({ options: { ...o, mass: { perfil: 'circulo', altura: 6, lados: 6, ...o.mass, modo: m, galeria: true } } }); }, m);

  await passo('1. Mistura quadrado -> círculo pelo esboço', async () => {
    await modo('mistura');
    await abrirEsboco();
    check('fase da base: mensagem "Forma da base"', (await status()).includes('Forma da base'), await status());
    await num('#opt-mass-altura', 6);
    await btn('Retângulo').click(); await clique(36, 30); await clique(40, 34);
    check('base: 4 linhas, sem fantasma', (await segs()) === 4 && (await fantasma()) === 0);
    await btn('Concluir').click();
    await page.waitForTimeout(250);
    check('nenhuma massa ainda e esboço continua aberto (topo)', (await massas()).length === 0 && (await estadoEsboco()).ativo);
    check('mensagem "Forma do topo"', (await status()).includes('Forma do topo'), await status());
    check('topo: esboço vazio e fantasma tracejado da base', (await segs()) === 0 && (await fantasma()) === 1);
    await btn('Círculo').click(); await clique(38, 32); await clique(40, 32);
    check('topo: círculo = 2 arcos e fantasma ainda visível', (await segs()) === 2 && (await fantasma()) === 1);
    await btn('Concluir').click();
    await page.waitForTimeout(300);
    const m = (await massas())[0];
    check('1 massa com 2 seções z 0 e 6', m.secoes.length === 2 && m.secoes[0].z === 0 && m.secoes[1].z === 6, JSON.stringify(m.secoes.map((s) => s.z)));
    const base = m.secoes[0].perfil.pontos;
    const topo = m.secoes[1].perfil.pontos;
    check('base: quadrado de 4 pontos e área 16', base.length === 4 && Math.abs(area(base) - 16) < 1e-9, `${base.length} / ${area(base)}`);
    check('topo: círculo de muitos pontos e área ~12,56 (12,5 a 12,57)', topo.length > 30 && area(topo) > 12.5 && area(topo) < 12.5664, `${topo.length} / ${area(topo).toFixed(4)}`);
    check('perfis diferentes', JSON.stringify(base) !== JSON.stringify(topo));
    check('origem no centro da base (38,32) e deslocamento do topo 0', Math.abs(m.origem.x - 38) < 1e-6 && Math.abs(m.origem.y - 32) < 1e-6 && Math.abs(m.secoes[1].dx) < 1e-3 && Math.abs(m.secoes[1].dy) < 1e-3, `${m.origem.x},${m.origem.y} / ${m.secoes[1].dx},${m.secoes[1].dy}`);
  });

  await passo('2. Editar contorno: dois itens (base e topo); alterar só o topo; Ctrl+Z', async () => {
    const antes = (await massas())[0];
    check('painel oferece "Editar contorno da base" e "do topo"', (await page.locator('#ms-edit-contorno').count()) === 1 && (await page.locator('#ms-edit-contorno-topo').count()) === 1);
    await page.locator('#ms-edit-contorno-topo').click();
    await page.waitForTimeout(300);
    check('esboço reaberto com o círculo do topo (2 arcos reconhecidos)', (await segs()) === 2 && (await estadoEsboco()).editing === antes.id, String(await segs()));
    await page.keyboard.press('Control+a');
    await btn('Excluir').click();
    await btn('Retângulo').click(); await clique(37, 31); await clique(39, 33);
    await btn('Concluir').click();
    await page.waitForTimeout(300);
    const m = (await massas())[0];
    check('topo agora retângulo ~2x2 (4 pontos, área 4 ± 0,1: o snap ajusta o canto)', m.secoes[1].perfil.pontos.length === 4 && Math.abs(area(m.secoes[1].perfil.pontos) - 4) < 0.1, String(area(m.secoes[1].perfil.pontos)));
    check('base intacta', JSON.stringify(m.secoes[0].perfil) === JSON.stringify(antes.secoes[0].perfil));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    check('Ctrl+Z restaura o topo circular', (await massas())[0].secoes[1].perfil.pontos.length === antes.secoes[1].perfil.pontos.length);
    await page.locator('#ms-edit-contorno').click();
    await page.waitForTimeout(300);
    check('base: esboço reaberto com 4 linhas', (await segs()) === 4, String(await segs()));
    await btn('Cancelar').click();
  });

  await passo('3. Cancelar no topo volta à base; na base cancela tudo', async () => {
    await H(() => window.__hestia.useUi.setState({ selection: [] }));
    await modo('mistura');
    await abrirEsboco();
    await btn('Retângulo').click(); await clique(30, 36); await clique(33, 39);
    await btn('Concluir').click();
    check('topo aberto', (await fantasma()) === 1);
    await btn('Cancelar').click();
    check('Cancelar no topo volta à base com as 4 linhas', (await estadoEsboco()).ativo && (await segs()) === 4 && (await fantasma()) === 0 && (await status()).includes('Forma da base'), await status());
    await btn('Cancelar').click();
    check('Cancelar na base fecha tudo, sem massa nova', !(await estadoEsboco()).ativo && (await massas()).length === 1);
  });

  await passo('4. Loft: base e topo pelo esboço e depois o diálogo "Seções da massa"', async () => {
    await modo('loft');
    await abrirEsboco();
    await btn('Retângulo').click(); await clique(30, 30); await clique(33, 33);
    await btn('Concluir').click();
    await btn('Círculo').click(); await clique(31.5, 31.5); await clique(32.5, 31.5);
    await btn('Concluir').click();
    await page.getByRole('dialog', { name: 'Seções da massa', exact: true }).waitFor({ timeout: 5000 });
    check('diálogo "Seções da massa" aberto', true);
    const ms = await massas();
    check('2 massas no total; a do loft com 2 seções de perfis diferentes', ms.length === 2 && ms[1].secoes.length === 2 && JSON.stringify(ms[1].secoes[0].perfil) !== JSON.stringify(ms[1].secoes[1].perfil));
    await page.getByRole('dialog', { name: 'Seções da massa', exact: true }).getByRole('button', { name: /Cancelar|Fechar/ }).first().click();
  });

  await passo('5. Bulbo continua pela ferramenta de perfis', async () => {
    await modo('bulbo');
    await H(() => window.__hestia.useUi.setState({ selection: [] }));
    await page.getByRole('button', { name: 'Massa e terreno', exact: true }).click();
    await page.getByRole('group', { name: 'Modelo de massa', exact: true }).getByRole('button', { name: 'Bulbo', exact: true }).click();
    const e = await H(() => ({ tool: window.__hestia.useUi.getState().tool, ativo: window.__hestia.editor.perimetro.ativo }));
    check('ferramenta mass (não o esboço)', e.tool === 'mass' && !e.ativo, JSON.stringify(e));
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  });
} finally {
  console.log('\nerros de console:', erros.length);
  for (const e of erros.slice(0, 5)) console.log('  ', e.slice(0, 200));
  check('sem erro de console/página', erros.length === 0);
  await browser.close();
  console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
}
