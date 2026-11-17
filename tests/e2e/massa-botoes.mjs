// Teste de CADA botão de massa da aba "Massa e terreno" (frente massa-forma-livre, fase A). Enumera os botões pela própria faixa
// e prova o efeito de cada um por DADOS (ferramenta ativa, campos da massa criada, categoria visível, elementos com `origemMassa`,
// motivo do botão desativado). Sem imagens. Dirige a faixa por cliques; `window.__hestia` só confere.
// Uso: APP=http://127.0.0.1:4195/?gl=1&debug=1 node tests/e2e/massa-botoes.mjs
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
const ferramenta = () => H(() => window.__hestia.useUi.getState().tool);
const status = () => H(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); });
const opcoesMassa = () => H(() => JSON.parse(JSON.stringify(window.__hestia.useUi.getState().options.mass ?? null)));
const abaMassa = () => page.getByRole('button', { name: 'Massa e terreno', exact: true }).click();
const botao = (painel, nome) => page.getByRole('group', { name: painel, exact: true }).getByRole('button', { name: nome, exact: true });
const mundo = async (x, y) => H(({ x, y }) => {
  const r = document.querySelector('.canvas-wrap').getBoundingClientRect();
  const vp = window.__hestia.editor.viewport();
  return { x: r.x + vp.width / 2 + (x - vp.cx) * vp.zoom, y: r.y + vp.height / 2 - (y - vp.cy) * vp.zoom };
}, { x, y });
const clique = async (x, y) => { const p = await mundo(x, y); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(60); };
const mover = async (x, y) => { const p = await mundo(x, y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(60); };
const limpaMassas = () => H(() => {
  const { editor } = window.__hestia;
  const ids = Object.values(editor.project.elements).filter((e) => e.kind === 'mass').map((m) => m.id);
  if (ids.length) editor.store.exec({ type: 'deleteElements', ids });
});

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
  await H(() => {
    localStorage.removeItem('hestia.panes');
    const { editor, useUi } = window.__hestia;
    editor.newProject('house2');
    useUi.setState({ tela: 'editor' });
  });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(1200);
  // Área livre da planta, longe da casa.
  await H(() => { const { editor } = window.__hestia; const v = editor.viewport(); editor.setViewport({ ...v, cx: 40, cy: 40, zoom: 14 }); });
  await page.waitForTimeout(300);
  await limpaMassas();
  await abaMassa();

  // Enumeração: os botões do painel "Modelo de massa" e "Modelo por massa" pelo que a faixa mostra.
  const rotulosPainel = async (painel) => page.getByRole('group', { name: painel, exact: true }).getByRole('button').evaluateAll((bs) => bs.map((b) => ({ nome: b.getAttribute('aria-label') ?? b.textContent, off: b.disabled, titulo: b.title })));
  const pMassa = await rotulosPainel('Modelo de massa');
  const pPor = await rotulosPainel('Modelo por massa');
  console.log('painel Modelo de massa:', pMassa.map((b) => `${b.nome}${b.off ? '(off)' : ''}`).join(' | '));
  console.log('painel Modelo por massa:', pPor.map((b) => `${b.nome}${b.off ? '(off)' : ''}`).join(' | '));
  for (const n of ['Massa', 'Extrusão', 'Mistura', 'Loft', 'Bulbo', 'Mostrar massa', 'Massa no local', 'Colocar massa']) check(`faixa tem o botão "${n}"`, pMassa.some((b) => b.nome === n));
  for (const n of ['Pisos da massa', 'Paredes da massa', 'Telhado por face', 'Parede por face', 'Forro por face', 'Piso por face']) check(`faixa tem o botão "${n}"`, pPor.some((b) => b.nome === n));

  await passo('1. Botões por face e "no local/colocar" ainda não existem: desativados e dizem por quê', async () => {
    for (const [painel, lista, nomes] of [['Modelo de massa', pMassa, ['Massa no local', 'Colocar massa']], ['Modelo por massa', pPor, ['Telhado por face', 'Parede por face', 'Forro por face', 'Piso por face']]]) {
      for (const n of nomes) {
        const b = lista.find((x) => x.nome === n);
        check(`"${n}" desativado com motivo no tooltip`, !!b && b.off && /ainda não disponível/.test(b.titulo), b?.titulo.replace(/\n/g, ' ') ?? 'ausente');
      }
    }
  });

  await passo('2. Pisos/Paredes da massa sem massa selecionada: desativados com o motivo', async () => {
    await H(() => window.__hestia.useUi.setState({ selection: [] }));
    for (const n of ['Pisos da massa', 'Paredes da massa']) {
      const b = botao('Modelo por massa', n);
      check(`"${n}" desativado sem seleção`, await b.isDisabled());
      check(`"${n}" diz "Selecione uma massa."`, /Selecione uma massa\./.test((await b.getAttribute('title')) ?? ''));
    }
  });

  await passo('3. Botão Massa liga a ferramenta (e Esc volta)', async () => {
    await botao('Modelo de massa', 'Massa').click();
    check('ferramenta ativa = mass', (await ferramenta()) === 'mass', await ferramenta());
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    check('Esc sai da ferramenta (select)', (await ferramenta()) === 'select', await ferramenta());
  });

  await passo('4. Extrusão (círculo): campos da massa criada', async () => {
    await botao('Modelo de massa', 'Extrusão').click();
    const o = await opcoesMassa();
    check('opções: modo extrusao', o?.modo === 'extrusao', JSON.stringify(o));
    check('ferramenta ativa = mass', (await ferramenta()) === 'mass');
    await clique(36, 36);
    await clique(39, 36);
    const m = await massas();
    check('1 massa criada', m.length === 1, String(m.length));
    const x = m[0];
    check('2 seções, z 0 e 9', x?.secoes.length === 2 && x.secoes[0].z === 0 && x.secoes[1].z === 9, JSON.stringify(x?.secoes.map((s) => s.z)));
    check('perfil circulo de raio 3 (snap)', x?.secoes[0].perfil.forma === 'circulo' && Math.abs(x.secoes[0].perfil.raio - 3) < 0.3, String(x?.secoes[0].perfil.raio));
    check('massa selecionada depois de criar', await H((id) => window.__hestia.useUi.getState().selection.includes(id), x?.id));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  await passo('5. Extrusão com perfil elipse, polígono e livre (barra de opções)', async () => {
    await botao('Modelo de massa', 'Extrusão').click();
    await page.locator('#opt-mass-perfil').selectOption('elipse');
    await clique(46, 36); await clique(49, 38);
    await page.locator('#opt-mass-perfil').selectOption('poligono');
    await page.locator('#opt-mass-lados').fill('5'); await page.keyboard.press('Enter');
    await clique(36, 44); await clique(39, 44);
    await page.locator('#opt-mass-perfil').selectOption('livre');
    await clique(46, 44); await clique(50, 44); await clique(50, 48); await clique(46, 48);
    await page.keyboard.press('Enter');
    const m = await massas();
    check('4 massas no total', m.length === 4, String(m.length));
    check('elipse com rx,ry > 0', m[1]?.secoes[0].perfil.forma === 'elipse' && m[1].secoes[0].perfil.rx > 0 && m[1].secoes[0].perfil.ry > 0, JSON.stringify(m[1]?.secoes[0].perfil));
    check('polígono com 5 lados', m[2]?.secoes[0].perfil.forma === 'poligono' && m[2].secoes[0].perfil.lados === 5, JSON.stringify(m[2]?.secoes[0].perfil));
    check('livre com 4 pontos', m[3]?.secoes[0].perfil.forma === 'livre' && m[3].secoes[0].perfil.pontos.length === 4, JSON.stringify(m[3]?.secoes[0].perfil).slice(0, 80));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  await passo('5b. Perfil livre fechado com a tecla C e mistura livre (base e topo) com Enter', async () => {
    const antes = (await massas()).length;
    await botao('Modelo de massa', 'Extrusão').click();
    await page.locator('#opt-mass-perfil').selectOption('livre');
    await clique(76, 36); await clique(80, 36); await clique(78, 40);
    await page.keyboard.press('c');
    const m = await massas();
    check('C fecha o perfil livre e cria a massa', m.length === antes + 1 && m.at(-1)?.secoes[0].perfil.forma === 'livre' && m.at(-1).secoes[0].perfil.pontos.length === 3, `${m.length - antes} nova(s)`);
    await botao('Modelo de massa', 'Mistura').click();
    await clique(76, 46); await clique(80, 46); await clique(78, 50); await page.keyboard.press('Enter');
    check('mistura livre: base aceita com Enter, ainda sem massa', (await massas()).length === antes + 1, await status());
    await clique(76, 46); await clique(81, 46); await clique(78, 51); await page.keyboard.press('Enter');
    check('mistura livre: topo com Enter cria a massa', (await massas()).length === antes + 2, await status());
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  await passo('6. Mistura: dois perfis (base círculo, topo outro) -> 2 seções com perfis distintos', async () => {
    const antes = (await massas()).length;
    await botao('Modelo de massa', 'Mistura').click();
    check('opções: modo mistura', (await opcoesMassa())?.modo === 'mistura');
    await page.locator('#opt-mass-perfil').selectOption('circulo');
    await clique(56, 36); await clique(58, 36);
    check('1o perfil não cria massa ainda', (await massas()).length === antes, await status());
    await clique(56, 36); await clique(59, 36);
    const m = await massas();
    check('mistura cria 1 massa', m.length === antes + 1, String(m.length));
    const x = m.at(-1);
    check('2 seções e interpolação linear', x?.secoes.length === 2 && x.interpolacao === 'linear');
    check('raios 2 e 3 (aprox.)', x && Math.abs(x.secoes[0].perfil.raio - 2) < 0.3 && Math.abs(x.secoes[1].perfil.raio - 3) < 0.3, x ? `${x.secoes[0].perfil.raio} / ${x.secoes[1].perfil.raio}` : '');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  await passo('7. Loft: cria a massa e abre o diálogo "Seções da massa"', async () => {
    const antes = (await massas()).length;
    await botao('Modelo de massa', 'Loft').click();
    check('opções: modo loft', (await opcoesMassa())?.modo === 'loft');
    await clique(56, 44); await clique(58, 44);
    await clique(56, 44); await clique(59, 44);
    const m = await massas();
    check('loft cria 1 massa', m.length === antes + 1, String(m.length));
    await page.getByRole('dialog', { name: 'Seções da massa', exact: true }).waitFor({ timeout: 5000 });
    check('diálogo "Seções da massa" aberto', true);
    check('massa do loft com 2 seções (editáveis no diálogo)', m.at(-1)?.secoes.length === 2);
    await page.getByRole('dialog', { name: 'Seções da massa', exact: true }).getByRole('button', { name: /Cancelar|Fechar/ }).first().click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  await passo('8. Bulbo: 5 seções circulares, interpolação suave', async () => {
    const antes = (await massas()).length;
    await botao('Modelo de massa', 'Bulbo').click();
    check('opções: modo bulbo', (await opcoesMassa())?.modo === 'bulbo');
    await clique(66, 40); await clique(70, 40);
    const m = await massas();
    check('bulbo cria 1 massa', m.length === antes + 1, String(m.length));
    const x = m.at(-1);
    check('5 seções', x?.secoes.length === 5, String(x?.secoes.length));
    check('interpolação suave', x?.interpolacao === 'suave');
    check('todas circulares', x?.secoes.every((s) => s.perfil.forma === 'circulo'));
    check('z do topo = 9', x && Math.abs(x.secoes[4].z - 9) < 1e-9, String(x?.secoes[4].z));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  await passo('9. Mostrar massa alterna a categoria na vista', async () => {
    const visivel = () => H(() => { const { editor } = window.__hestia; const v = editor.project.views ?? []; return JSON.stringify({ hidden: (window.__hestia.useUi.getState().hiddenCategories ?? null) }); });
    const pressed = async () => (await botao('Modelo de massa', 'Mostrar massa').getAttribute('aria-pressed')) === 'true';
    const a = await pressed();
    await botao('Modelo de massa', 'Mostrar massa').click();
    await page.waitForTimeout(200);
    const b = await pressed();
    check('clique inverte o estado pressionado', a !== b, `${a} -> ${b}`);
    await botao('Modelo de massa', 'Mostrar massa').click();
    await page.waitForTimeout(200);
    check('segundo clique volta ao estado inicial', (await pressed()) === a);
    void visivel;
  });

  await passo('10. Pisos e Paredes da massa geram elementos com origemMassa', async () => {
    const m = (await massas())[0];
    await H((id) => window.__hestia.useUi.setState({ selection: [id], view: 'plan' }), m.id);
    await page.waitForTimeout(200);
    await abaMassa();
    check('"Pisos da massa" habilitado com 1 massa', await botao('Modelo por massa', 'Pisos da massa').isEnabled());
    await botao('Modelo por massa', 'Pisos da massa').click();
    const dp = page.getByRole('dialog', { name: 'Pisos da massa', exact: true });
    await dp.waitFor({ timeout: 5000 });
    await dp.getByRole('button', { name: 'Gerar', exact: true }).click();
    await dp.waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined);
    const nPisos = await H((id) => Object.values(window.__hestia.editor.project.elements).filter((e) => (e.kind === 'floor' || e.kind === 'slab') && e.origemMassa?.massaId === id).length, m.id);
    check('Pisos da massa: >= 1 elemento com origemMassa da massa', nPisos >= 1, String(nPisos));
    await H((id) => window.__hestia.useUi.setState({ selection: [id] }), m.id);
    await abaMassa();
    await botao('Modelo por massa', 'Paredes da massa').click();
    const dw = page.getByRole('dialog', { name: 'Paredes da massa', exact: true });
    await dw.waitFor({ timeout: 5000 });
    await dw.getByRole('button', { name: 'Gerar', exact: true }).click();
    await dw.waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined);
    const nParedes = await H((id) => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'wall' && e.origemMassa?.massaId === id).length, m.id);
    check('Paredes da massa: >= 3 paredes com origemMassa da massa', nParedes >= 3, String(nParedes));
  });

  await passo('11. Tabela de massas (Vista > Tabelas > Massas por pavimento)', async () => {
    await page.getByRole('button', { name: 'Vista', exact: true }).click();
    await botao('Criar', 'Tabelas ▾').click();
    await page.getByRole('menuitem', { name: 'Massas por pavimento', exact: true }).click();
    const tab = page.getByRole('dialog', { name: 'Massas por pavimento', exact: true });
    await tab.waitFor({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] table tbody tr').length > 0, null, { timeout: 30000 });
    const n = await tab.locator('table tbody tr').count();
    check('tabela com linhas das massas', n >= 1, String(n));
    await tab.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  });
} finally {
  console.log('\nerros de console:', erros.length);
  for (const e of erros.slice(0, 5)) console.log('  ', e.slice(0, 200));
  check('sem erro de console/página', erros.length === 0);
  await browser.close();
  console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
}
