// Massa com a CAIXA DE FORMAS, União por TR e cotas (frente massa-forma-livre, fase C). Fluxo do navegador, só por cliques na faixa,
// na barra de opções e no painel de propriedades; `window.__hestia` apenas CONFERE (valores literais calculados à mão).
//   Retângulo 6 x 4 em (30,30)-(36,34) + círculo de centro (36,32) e raio 3 (sobrepostos). União por TR: as duas bordas do
//   retângulo (y = 34 e y = 30) aparam contra o círculo em x = 36 - sqrt(5) = 33,7639 e a aresta direita (x = 36) sai com Excluir.
//   Área da união = 24 + 9π - (4·√5 + 2·(7,0686 - 6,0209)·... ) = 41,2346 m² (cordas de 2 mm tiram menos de 0,05).
// Uso: APP=http://127.0.0.1:4195/?gl=1&debug=1 node tests/e2e/massa-forma-livre.mjs
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
  await H(() => { const { editor } = window.__hestia; const v = editor.viewport(); editor.setViewport({ ...v, cx: 36, cy: 32, zoom: 40 }); });
  const elevNivel = await H(() => window.__hestia.editor.project.levels.find((l) => l.id === window.__hestia.useUi.getState().levelId).elevation);
  check('nível atual do projeto de teste a 0 m', elevNivel === 0, String(elevNivel));

  await passo('1. Botão Massa abre o esboço com a galeria de formas e as opções de cota', async () => {
    await abrirEsboco();
    const e = await estadoEsboco();
    check('esboço ativo com alvo massa', e.ativo && e.alvo === 'mass', JSON.stringify(e));
    for (const n of ['Linha (contorno por pontos)', 'Retângulo', 'Polígono inscrito', 'Círculo', 'Arco (3 pontos)', 'Arco (centro e extremidades)', 'Arco tangente', 'Filete', 'Elipse', 'Aparar/Estender', 'Excluir', 'Concluir', 'Cancelar']) {
      check(`botão "${n}" presente`, (await page.getByRole('button', { name: n, exact: true }).count()) > 0);
    }
    check('galeria da massa não oferece "Pegar face" nem "Por perímetro" (sem sentido na massa)', (await page.getByRole('button', { name: /Pegar face|Por perímetro/ }).count()) === 0);
    await num('#opt-mass-altura', 6);
    await num('#opt-mass-cota-base', 2);
    check('cota do topo = 2 + 6 = 8 m na barra', (await valor('#opt-mass-cota-topo')).replace(',', '.').startsWith('8'), await valor('#opt-mass-cota-topo'));
  });

  await passo('2. Desenha retângulo + círculo sobrepostos, une por TR e exclui a aresta interna', async () => {
    await btn('Retângulo').click(); await clique(30, 30); await clique(36, 34);
    await btn('Círculo').click(); await clique(36, 32); await clique(39, 32);
    let e = await estadoEsboco();
    check('6 linhas e Concluir recusaria (laços se cruzam)', e.segs === 6 && e.ok === false, JSON.stringify(e));
    await btn('Aparar/Estender').click();
    await clique(31, 34); await clique(38.819, 33.026);
    await clique(31, 30); await clique(38.819, 30.974);
    await btn('Excluir').click(); await clique(36, 30.5);
    e = await estadoEsboco();
    check('5 linhas e um único contorno fechado (ok)', e.segs === 5 && e.ok === true, JSON.stringify(e));
  });

  await passo('3. Concluir cria a massa com 1 contorno, cotas 2 a 8 m, área e volume', async () => {
    await btn('Concluir').click();
    await page.waitForTimeout(300);
    check('esboço fechado', !(await estadoEsboco()).ativo);
    const ms = await massas();
    check('1 massa', ms.length === 1, String(ms.length));
    const m = ms[0];
    check('2 seções z 0 e 6', m.secoes.length === 2 && m.secoes[0].z === 0 && m.secoes[1].z === 6, JSON.stringify(m.secoes.map((s) => s.z)));
    check('perfil livre', m.secoes[0].perfil.forma === 'livre');
    const pts = m.secoes[0].perfil.pontos;
    check('contorno com 3 a 256 pontos', pts.length >= 3 && pts.length <= 256, String(pts.length));
    const a = area(pts);
    check('área da união 41,2346 m² (cordas de 2 mm: -0,05)', a > 41.17 && a < 41.24, a.toFixed(4));
    check('volume = área x 6 = 247,4 m³ (247,0 a 247,45)', a * 6 > 247.0 && a * 6 < 247.45, (a * 6).toFixed(3));
    check('cota da base 2 m (baseOffset 2 sobre nível a 0)', m.baseOffset === 2, String(m.baseOffset));
    check('massa selecionada e painel com cota da base e topo', (await valor('#ms-cota-base')).startsWith('2') && (await valor('#ms-cota-topo')).replace(',', '.').startsWith('8'), `${await valor('#ms-cota-base')} / ${await valor('#ms-cota-topo')}`);
    // limites do contorno: x de 30 a 39
    const xs = pts.map((p) => p.x + m.origem.x);
    check('contorno vai de x = 30 a 39 m', Math.abs(Math.min(...xs) - 30) < 1e-6 && Math.abs(Math.max(...xs) - 39) < 1e-6, `${Math.min(...xs).toFixed(3)} a ${Math.max(...xs).toFixed(3)}`);
  });

  await passo('4. Cota do topo editável: 12 m -> altura 10, z reescalado; desfazer volta', async () => {
    await num('#ms-cota-topo', 12);
    let m = (await massas())[0];
    check('z da última seção = 10 e base ainda 2', m.secoes[1].z === 10 && m.baseOffset === 2, `${m.secoes[1].z} / ${m.baseOffset}`);
    check('campo Altura mostra 10', (await valor('#ms-height')).replace(',', '.').startsWith('10'), await valor('#ms-height'));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    m = (await massas())[0];
    check('um Ctrl+Z volta a altura a 6 m', m.secoes[1].z === 6 && m.baseOffset === 2, String(m.secoes[1].z));
    await num('#ms-cota-topo', 1);
    m = (await massas())[0];
    check('topo abaixo da base recusado: altura continua 6 e a mensagem aparece', m.secoes[1].z === 6 && (await page.locator('#ms-erro').innerText()).includes('maior que zero'));
    await num('#ms-cota-base', 5);
    m = (await massas())[0];
    check('cota da base 5: baseOffset 5 e altura 6 intacta', m.baseOffset === 5 && m.secoes[1].z === 6, `${m.baseOffset} / ${m.secoes[1].z}`);
    check('cota do topo passou a 11 m', (await valor('#ms-cota-topo')).replace(',', '.').startsWith('11'), await valor('#ms-cota-topo'));
  });

  await passo('5. De nível a nível pelo painel', async () => {
    const niveis = await H(() => window.__hestia.editor.project.levels.map((l) => ({ id: l.id, el: l.elevation })).sort((a, b) => a.el - b.el));
    const [a, b] = [niveis[0], niveis[niveis.length - 1]];
    await page.locator('#ms-nivel-ini').selectOption(a.id);
    await page.locator('#ms-nivel-fim').selectOption(b.id);
    await page.locator('#ms-niveis-aplicar').click();
    await page.waitForTimeout(200);
    const m = (await massas())[0];
    check(`base = nível ${a.el} m e altura = ${b.el - a.el} m`, m.baseOffset === a.el && Math.abs(m.secoes[1].z - (b.el - a.el)) < 1e-9, `${m.baseOffset} / ${m.secoes[1].z}`);
  });

  await passo('6. Editar contorno reabre o esboço da base; novo contorno 4 x 4 conserva cotas', async () => {
    const antes = (await massas())[0];
    await page.locator('#ms-edit-contorno').click();
    await page.waitForTimeout(300);
    let e = await estadoEsboco();
    check('esboço reaberto em edição da massa', e.ativo && e.alvo === 'mass' && e.editing === antes.id && e.segs >= 3, JSON.stringify(e));
    await page.keyboard.press('Control+a');
    await btn('Excluir').click();
    await page.waitForTimeout(150);
    e = await estadoEsboco();
    check('contorno antigo apagado (0 linhas)', e.segs === 0, JSON.stringify(e));
    await btn('Retângulo').click(); await clique(40, 30); await clique(44, 34);
    await btn('Concluir').click();
    await page.waitForTimeout(300);
    const ms = await massas();
    const m = ms[0];
    check('continua 1 massa, mesmo id', ms.length === 1 && m.id === antes.id);
    const pts = m.secoes[0].perfil.pontos;
    check('contorno 4 x 4: área 16 m² e 4 pontos', pts.length === 4 && Math.abs(area(pts) - 16) < 1e-9, `${pts.length} / ${area(pts)}`);
    check('cotas e altura preservadas', m.baseOffset === antes.baseOffset && m.secoes[1].z === antes.secoes[1].z, `${m.baseOffset} / ${m.secoes[1].z}`);
    const xs = pts.map((p) => p.x + m.origem.x);
    check('novo contorno em x de 40 a 44', Math.abs(Math.min(...xs) - 40) < 1e-6 && Math.abs(Math.max(...xs) - 44) < 1e-6);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    check('um Ctrl+Z restaura o contorno da união', (await massas())[0].secoes[0].perfil.pontos.length === antes.secoes[0].perfil.pontos.length);
  });

  await passo('7. Furo recusado com mensagem clara; o esboço continua aberto', async () => {
    await H(() => window.__hestia.useUi.setState({ selection: [] }));
    await abrirEsboco();
    await btn('Retângulo').click(); await clique(30, 36); await clique(36, 40);
    await btn('Retângulo').click(); await clique(32, 37); await clique(34, 39);
    await btn('Concluir').click();
    await page.waitForTimeout(200);
    const e = await estadoEsboco();
    check('esboço segue aberto', e.ativo);
    check('mensagem: a massa não aceita furos', (await status()).includes('não aceita furos'), await status());
    check('nenhuma massa nova', (await massas()).length === 1);
    await btn('Cancelar').click();
    check('Cancelar fecha o esboço', !(await estadoEsboco()).ativo);
  });
} finally {
  console.log('\nerros de console:', erros.length);
  for (const e of erros.slice(0, 5)) console.log('  ', e.slice(0, 200));
  check('sem erro de console/página', erros.length === 0);
  await browser.close();
  console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
}
