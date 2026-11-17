import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * Multitelas de ponta a ponta no navegador: layouts, escolha de qualquer vista por painel (inclusive no painel ativo),
 * ativação ao pousar o mouse (e a recusa com botão pressionado), estilo visual por painel sem tocar no projeto,
 * divisórias da grade 2×2, fechar painel e persistência ao recarregar.
 * Uso: APP=http://127.0.0.1:4180/?gl=1&debug=1 node tests/e2e/multitelas.mjs
 */
const URL_APP = process.env.APP ?? 'http://127.0.0.1:4180/?gl=1&debug=1';
const exe = ['/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} @ ${m.location().url}`));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('response', (r) => r.status() === 404 && errors.push(`404 ${r.url()}`));
page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()));
let passos = 0;
const ok = (nome) => console.log(`ok ${++passos} ${nome}`);

const S = () => page.evaluate(() => {
  const { usePanes, useUi } = window.__hestia;
  const l = usePanes.getState().layout;
  const folhas = [];
  const visita = (n) => (n.kind === 'leaf' ? folhas.push(n.pane) : (visita(n.first), visita(n.second)));
  visita(l.root);
  const ui = useUi.getState();
  return { active: l.activeId, max: l.maximizedId, panes: folhas.map((p) => ({ id: p.id, kind: p.view.kind, view: p.view, style: p.style })), ui: { view: ui.view, sectionId: ui.sectionId, levelId: ui.levelId, openViews: ui.openViews.length } };
});
const pane = (id) => page.locator(`section.pane:has(.pane-head)`).nth(id);
const body = async (i) => {
  const b = await page.locator('.pane-body').nth(i).boundingBox();
  assert.ok(b, `corpo do painel ${i}`);
  return b;
};
const preset = async (rotulo) => {
  await page.getByRole('button', { name: 'Layout de painéis' }).click();
  await page.getByText(rotulo, { exact: true }).click();
  await page.waitForTimeout(500);
};
const trocarVista = async (i, rotulo) => {
  await page.locator('select.pane-view').nth(i).selectOption({ label: rotulo });
  await page.waitForTimeout(400);
};

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120_000 });
  await page.evaluate(() => {
    localStorage.removeItem('hestia.panes');
    const { editor, useUi } = window.__hestia;
    editor.newProject('house2');
    useUi.setState({ tela: 'editor' });
    editor.store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte A', kind: 'section', a: { x: -2, y: 2 }, b: { x: 9, y: 2 }, depth: 6 } });
    editor.store.exec({ type: 'addView', view: { id: 'sv2', name: 'Corte B', kind: 'section', a: { x: 3, y: -2 }, b: { x: 3, y: 9 }, depth: 6 } });
  });
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(1200);

  // 1. Um painel: sem cabeçalho, como antes.
  let s = await S();
  assert.equal(s.panes.length, 1);
  assert.equal(await page.locator('.pane-head').count(), 0);
  ok('um painel sem cabeçalho');

  // 2. Preset "Duas colunas": 2 painéis com vistas DIFERENTES (planta + 3D).
  await preset('Duas colunas');
  s = await S();
  assert.equal(s.panes.length, 2);
  assert.equal(await page.locator('.pane-head').count(), 2);
  assert.notEqual(s.panes[0].kind + JSON.stringify(s.panes[0].view), s.panes[1].kind + JSON.stringify(s.panes[1].view), 'vistas diferentes');
  ok(`duas colunas: ${s.panes.map((p) => p.kind).join(' | ')}`);

  // 3. O seletor lista TODOS os tipos de vista (agrupados).
  const grupos = await page.locator('select.pane-view').first().evaluate((el) => [...el.querySelectorAll('optgroup')].map((g) => g.label));
  for (const g of ['Plantas de piso', 'Plantas de cobertura', 'Modelo 3D', 'Cortes']) assert.ok(grupos.includes(g), `grupo ${g} em ${grupos}`);
  ok(`seletor com grupos: ${grupos.join(', ')}`);

  // 4. BUG relatado: trocar para CORTE no painel ATIVO precisa mudar a vista de fato.
  const ativo = (await S()).active;
  const idx = (await S()).panes.findIndex((p) => p.id === ativo);
  await trocarVista(idx, 'Corte A');
  s = await S();
  assert.equal(s.panes[idx].kind, 'section', 'painel ativo virou corte');
  assert.equal(s.ui.view, 'section');
  assert.equal(s.ui.sectionId, 'sv1');
  ok('painel ativo: planta → corte');
  await trocarVista(idx, 'Modelo 3D');
  s = await S();
  assert.equal(s.panes[idx].kind, '3d');
  assert.equal(s.ui.view, '3d');
  ok('painel ativo: corte → 3D');
  await trocarVista(idx, 'Corte B');
  assert.equal((await S()).ui.sectionId, 'sv2');
  ok('painel ativo: 3D → outro corte');

  // 5. Painel INATIVO escolhe corte: vira o ativo e navega.
  const outro = 1 - idx;
  await trocarVista(outro, 'Corte A');
  s = await S();
  assert.equal(s.panes[outro].kind, 'section');
  assert.equal(s.active, s.panes[outro].id, 'painel inativo passou a ativo');
  assert.equal(s.ui.sectionId, 'sv1');
  ok('painel inativo escolhe corte e ativa');

  // 6. Sem abas duplicadas: reabrir a mesma vista não cria outra aba.
  const abas = (await S()).ui.openViews;
  await trocarVista(outro, 'Corte B');
  await trocarVista(outro, 'Corte A');
  assert.equal((await S()).ui.openViews, abas, 'reabrir vistas já abertas não cria aba nova');
  ok('sem aba duplicada');

  // 6b. Regressão: o corte INATIVO desenha o próprio conteúdo (antes ficava em branco e piscava ao passar o mouse).
  {
    const e = await S();
    const iCorte = e.panes.findIndex((p) => p.kind === 'section');
    const iOutra = e.panes.findIndex((p) => p.kind !== 'section');
    const tam = async () => (await page.locator('.pane-body').nth(iCorte).screenshot()).length;
    const bc = await body(iCorte);
    const bo = await body(iOutra);
    await page.mouse.move(5, 5);
    await page.mouse.move(bc.x + bc.width / 2, bc.y + bc.height / 2, { steps: 4 });
    await page.waitForTimeout(900);
    const comoAtivo = await tam();
    await page.mouse.move(bo.x + bo.width / 2, bo.y + bo.height / 2, { steps: 4 });
    await page.waitForTimeout(900);
    assert.notEqual((await S()).active, e.panes[iCorte].id, 'o corte ficou inativo');
    const comoInativo = await tam();
    // Em branco o PNG tem ~1/3 do tamanho do desenhado (3610 contra 11147 medidos): exige mais da metade.
    assert.ok(comoInativo > comoAtivo * 0.5, `corte inativo desenhado (${comoInativo} B contra ${comoAtivo} B ativo)`);
    // Estável: voltar e ir de novo repete o mesmo desenho, sem piscar.
    const amostras = [];
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(bc.x + bc.width / 2, bc.y + bc.height / 2, { steps: 3 });
      await page.waitForTimeout(500);
      await page.mouse.move(bo.x + bo.width / 2, bo.y + bo.height / 2, { steps: 3 });
      await page.waitForTimeout(500);
      amostras.push(await tam());
    }
    assert.equal(new Set(amostras).size, 1, `corte inativo estável entre ativações: ${amostras}`);
    ok(`corte inativo desenha (${comoInativo} B de ${comoAtivo} B) e não pisca`);
  }

  // 7. Ativar ao pousar o mouse, sem clicar.
  s = await S();
  const alvo = s.panes.find((p) => p.id !== s.active).id;
  const iAlvo = s.panes.findIndex((p) => p.id === alvo);
  const b = await body(iAlvo);
  await page.mouse.move(5, 5); // sai de qualquer painel: o seletor de vista não move o mouse
  await page.waitForTimeout(150);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.waitForTimeout(500);
  assert.equal((await S()).active, alvo, 'pousar o mouse ativa');
  ok('ativa ao pousar o mouse (sem clique)');

  // 8. Com botão pressionado NÃO ativa (arrastar de um painel para outro).
  const antes = (await S()).active;
  const iOutro = (await S()).panes.findIndex((p) => p.id !== antes);
  const bA = await body((await S()).panes.findIndex((p) => p.id === antes));
  const bB = await body(iOutro);
  await page.mouse.move(5, 5);
  await page.mouse.move(bA.x + bA.width / 2, bA.y + bA.height / 2, { steps: 4 });
  await page.waitForTimeout(300);
  assert.equal((await S()).active, antes);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(bB.x + bB.width / 2, bB.y + bB.height / 2, { steps: 6 });
  assert.equal((await S()).active, antes, 'arrasto atravessando outro painel não troca o ativo');
  await page.mouse.up({ button: 'middle' });
  ok('arrasto com botão pressionado não troca o painel ativo');

  // 9. Grade 2×2 com 4 vistas e divisória das linhas arrastável.
  await preset('Grade 2×2');
  s = await S();
  assert.equal(s.panes.length, 4);
  const kinds = new Set(s.panes.map((p) => p.kind));
  assert.ok(kinds.size >= 3, `vistas diversas na grade: ${[...kinds]}`);
  const raizAntes = await page.evaluate(() => window.__hestia.usePanes.getState().layout.root.ratio);
  const barra = page.locator('.pane-split-bar.column').first();
  const bb = await barra.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 - 120, { steps: 8 });
  await page.mouse.up();
  const raizDepois = await page.evaluate(() => window.__hestia.usePanes.getState().layout.root.ratio);
  assert.ok(raizDepois < raizAntes - 0.05, `divisória horizontal da grade arrastou (${raizAntes} → ${raizDepois})`);
  ok(`grade 2×2 (${[...kinds].join(',')}) e divisória horizontal arrastável`);

  // 10. Estilo por painel independente, sem tocar no projeto.
  const view3dAntes = await page.evaluate(() => JSON.stringify(window.__hestia.editor.project.view3d ?? null));
  const i3d = (await S()).panes.findIndex((p) => p.kind === '3d');
  const iPlan = (await S()).panes.findIndex((p) => p.kind === 'plan');
  assert.ok(i3d >= 0 && iPlan >= 0);
  const shot = (i) => page.locator('.pane-body').nth(i).screenshot();
  await page.locator('select.pane-style').nth(i3d).selectOption({ label: 'Aramado' });
  await page.locator('select.pane-style').nth(iPlan).selectOption({ label: 'Linhas ocultas' });
  await page.waitForTimeout(900);
  s = await S();
  assert.equal(s.panes[i3d].style.style, 'wireframe');
  assert.equal(s.panes[iPlan].style.style, 'hiddenLine');
  const ap = await page.evaluate(([a, b]) => ({ a: window.__hestia.descreverEstiloAplicado(a), b: window.__hestia.descreverEstiloAplicado(b) }), [s.panes[i3d].id, s.panes[iPlan].id]);
  assert.equal(ap.a.style, 'wireframe');
  assert.equal(ap.b.style, 'hiddenLine');
  const wire = await shot(i3d);
  await page.locator('select.pane-style').nth(i3d).selectOption({ label: 'Realista' });
  await page.waitForTimeout(1500);
  const real = await shot(i3d);
  assert.notDeepEqual(wire, real, 'o 3D muda de aparência com o estilo');
  assert.equal((await S()).panes[iPlan].style.style, 'hiddenLine', 'o outro painel não mudou');
  const view3dDepois = await page.evaluate(() => JSON.stringify(window.__hestia.editor.project.view3d ?? null));
  assert.equal(view3dDepois, view3dAntes, 'o projeto não foi alterado pelo estilo do painel');
  ok('estilo por painel: independente e sem gravar no projeto');

  // 11. Persistência ao recarregar. Com 2 painéis: 4 contextos WebGL por software derrubam o Chrome em máquina com pouca RAM.
  await preset('Duas colunas');
  const antesReload = await S();
  assert.equal(antesReload.panes.length, 2);
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__hestia);
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('hestia.panes') ?? 'null'));
  assert.ok(guardado, 'layout guardado');
  const folhasGuardadas = JSON.stringify(guardado).match(/"kind":"leaf"/g)?.length;
  assert.equal(folhasGuardadas, 2, 'dois painéis guardados');
  const restaurado = await S();
  assert.equal(restaurado.panes.length, 2, 'layout restaurado no store após recarregar');
  assert.deepEqual(restaurado.panes.map((p) => p.style.style ?? null), antesReload.panes.map((p) => p.style.style ?? null), 'estilos por painel restaurados');
  ok(`layout e estilos restaurados após recarregar (${restaurado.panes.length} painéis)`);

  // 12. Fechar painéis até sobrar um; o último não fecha.
  await page.evaluate(() => {
    localStorage.removeItem('hestia.panes');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__hestia);
  await page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    editor.newProject('house2');
    useUi.setState({ tela: 'editor' });
  });
  await page.waitForTimeout(800);
  await preset('Duas linhas');
  assert.equal((await S()).panes.length, 2);
  await page.getByRole('button', { name: 'Fechar painel' }).first().click();
  await page.waitForTimeout(300);
  assert.equal((await S()).panes.length, 1);
  assert.equal(await page.locator('.pane-head').count(), 0);
  ok('fechar painel volta ao modo de um painel');

  const relevantes = errors.filter((e) => !/favicon|WebGL|GPU stall|swiftshader/i.test(e));
  assert.deepEqual(relevantes, [], `erros no console: ${relevantes.join(' | ')}`);
  ok('sem erros no console');
  console.log(`\nTODOS OS ${passos} PASSOS PASSARAM`);
} catch (e) {
  console.error('FALHOU:', e.message);
  await page.screenshot({ path: 'test-results/multitelas-falha.png' }).catch(() => {});
  console.error('erros do console:', errors.slice(0, 5));
  process.exitCode = 1;
} finally {
  await browser.close();
}
