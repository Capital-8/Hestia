// Verificar rede elétrica de TRAÇADO (ficha C5), em Chrome real. Quadro + caixa + 3 eletrodutos + 2 tomadas entram por comando do
// programa (ligados pela rede de ligações); cria o circuito pelo painel Circuitos; confere o comprimento informado (3 m + 2 m) e que
// "Verificar rede" não acusa nada elétrico; depois desliga um eletroduto, zera a potência de um ponto, cria um circuito sem quadro e
// reduz as posições do quadro, e confere cada aviso esperado. O programa NÃO dimensiona: nada de corrente, seção nem queda de tensão.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5218/?debug=1' node tests/e2e/eletrica-verificar.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5218/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/eletrica-verificar';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const ELET = /sem quadro|sem eletroduto|potência 0|posição|posições/;
const fechar = async () => { await page.locator('[role="dialog"]').last().locator('button.btn', { hasText: /^Fechar$/ }).click(); await page.waitForTimeout(250); };
async function verificar() {
  await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
  await page.getByRole('button', { name: 'Verificar rede', exact: true }).first().click();
  await page.waitForTimeout(1200);
  const itens = (await page.locator('[role="dialog"] li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').replace(/ Ir para$/, ''));
  return itens;
}

try {
  await rep.step('1. monta quadro, caixa, 3 eletrodutos e 2 tomadas ligados (comando do programa)', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    const n = await page.evaluate(() => {
      const { model, editor, useUi } = window.__hestia;
      const nivel = useUi.getState().levelId;
      for (const f of ['fam_quadro_distribuicao_eletrico', 'fam_krona_eletrica_tubo_corte', 'fam_krona_eletrica_caixa_4x4', 'fam_tomada']) editor.store.exec({ type: 'upsertFamily', family: structuredClone(model.familiaDaBiblioteca(f)) });
      const mk = (id, f, x, y, extra = {}) => ({ id, kind: 'component', familyId: f, typeId: model.familiaDaBiblioteca(f).tipos[0]?.id ?? null, levelId: nivel, x, y, z: 0, rotation: 0, mirrored: false, mark: id, ...extra });
      const add = (c) => editor.store.exec({ type: 'addComponent', component: c });
      add(mk('qd1', 'fam_quadro_distribuicao_eletrico', 1, 1, { typeId: 'dn25' }));
      add(mk('t1', 'fam_krona_eletrica_tubo_corte', 2, 1, { values: { L: 3000 } }));
      add(mk('cx1', 'fam_krona_eletrica_caixa_4x4', 4, 1));
      add(mk('t2', 'fam_krona_eletrica_tubo_corte', 4.5, 1, { values: { L: 2000 } }));
      add(mk('t3', 'fam_krona_eletrica_tubo_corte', 4, 2, { values: { L: 1000 } }));
      add(mk('tom1', 'fam_tomada', 6.5, 1));
      add(mk('tom2', 'fam_tomada', 4, 3));
      for (const [a, la, b, lb] of [['qd1', 'a', 't1', 'a'], ['t1', 'b', 'cx1', 'a'], ['cx1', 'b', 't2', 'a'], ['t2', 'b', 'tom1', 'eletroduto'], ['cx1', 'c', 't3', 'a'], ['t3', 'b', 'tom2', 'eletroduto']]) editor.store.exec({ type: 'connectComponents', a, ligacaoA: la, b, ligacaoB: lb });
      editor.setViewport({ ...editor.viewport(), cx: 4, cy: 2, zoom: 160 });
      return Object.values(editor.store.project.elements).filter((e) => e.kind === 'component').length;
    });
    rep.check('7 componentes ligados', n === 7, n);
  });
  await rep.step('2. painel Circuitos: circuito com as 2 tomadas (100 VA) e comprimento pela rede', async () => {
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.getByRole('button', { name: 'Circuitos', exact: true }).first().click();
    await page.waitForSelector('.circ-painel', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Novo circuito', exact: true }).click();
    await page.evaluate(() => window.__hestia.useUi.setState({ selection: ['tom1', 'tom2'] }));
    await page.waitForTimeout(200);
    await page.locator('[data-circuito]').first().getByRole('button', { name: /Atribuir selecionados/ }).click();
    await page.waitForTimeout(300);
    const txt = (await page.locator('[data-comprimento]').first().innerText()).replace(/\s+/g, ' ');
    rep.check('comprimento = 3 m + 2 m (ponto mais distante)', /ponto mais distante: 5 m$/.test(txt), txt);
    const painel = await page.locator('.circ-painel').innerText();
    rep.check('painel sem corrente, seção, disjuntor nem queda de tensão', !/Corrente|Seção do condutor|Disjuntor|Queda de tensão/.test(painel), '');
    await page.screenshot({ path: `${OUT}/01-painel-comprimento.png` });
    await fechar();
  });
  await rep.step('3. rede íntegra: Verificar rede sem aviso elétrico', async () => {
    const itens = await verificar();
    console.log('  info  avisos:', itens.length, '| elétricos:', JSON.stringify(itens.filter((x) => ELET.test(x))));
    rep.check('nenhum aviso elétrico de traçado', !itens.some((x) => ELET.test(x)), itens.filter((x) => ELET.test(x)).join(' | '));
    await page.screenshot({ path: `${OUT}/02-verificar-integra.png` });
    await fechar();
  });
  await rep.step('4. quebra o traçado: desliga t2, zera tom2, circuito sem quadro, quadro com 1 posição', async () => {
    await page.evaluate(() => {
      const { editor } = window.__hestia;
      const s = editor.store;
      s.exec({ type: 'disconnectComponents', a: 't2', ligacaoA: 'a' });
      s.exec({ type: 'assignPontoCircuito', circuitoId: 'cir_1', ponto: { componenteId: 'tom2', potenciaVA: 0 } });
      const lum = { id: 'lum1', kind: 'component', familyId: 'fam_tomada', typeId: window.__hestia.model.familiaDaBiblioteca('fam_tomada').tipos[0].id, levelId: window.__hestia.useUi.getState().levelId, x: 7, y: 3, z: 0, rotation: 0, mirrored: false, mark: 'lum1' };
      s.exec({ type: 'addComponent', component: lum });
      s.exec({ type: 'addCircuitoEletrico', circuito: { id: 'cir_2', nome: 'C2', tipo: 'iluminacao', tensao: 127, cor: '#1c7ed6', pontos: [{ componenteId: 'lum1', potenciaVA: 100 }] } });
      s.exec({ type: 'addComponent', component: { ...lum, id: 'cx2', familyId: 'fam_krona_eletrica_caixa_4x4', typeId: window.__hestia.model.familiaDaBiblioteca('fam_krona_eletrica_caixa_4x4').tipos[0].id, x: 8, y: 1, mark: 'cx2' } });
      s.exec({ type: 'updateComponent', id: 'qd1', patch: { values: { posicoes: 1 } } });
      s.exec({ type: 'moveCircuitoEletrico', id: 'cir_2', quadroId: 'qd1' });
      s.exec({ type: 'moveCircuitoEletrico', id: 'cir_2' });
    });
    const n = await page.evaluate(() => Object.keys(window.__hestia.editor.store.project.circuitosEletricos).length);
    rep.check('2 circuitos no projeto', n === 2, n);
  });
  await rep.step('5. Verificar rede lista os avisos esperados', async () => {
    const itens = await verificar();
    const el = itens.filter((x) => ELET.test(x));
    console.log('  info  elétricos:', JSON.stringify(el));
    rep.check('circuito sem quadro (C2)', el.some((x) => /Circuito C2 sem quadro/.test(x)), '');
    rep.check('ponto sem eletroduto até o quadro (C1)', el.some((x) => /Circuito C1: ponto sem eletroduto ligado até o quadro/.test(x)), '');
    rep.check('caixa solta (cx2) sem eletroduto: 1 aviso', el.filter((x) => /Caixa ou dispositivo elétrico sem eletroduto/.test(x)).length === 1, `${el.filter((x) => /Caixa ou dispositivo/.test(x)).length} aviso(s)`);
    rep.check('ponto com potência 0 (C1)', el.some((x) => /Circuito C1: ponto com potência 0/.test(x)), '');
    await page.screenshot({ path: `${OUT}/03-verificar-avisos.png` });
    await fechar();
  });
  await rep.step('6. quadro com mais circuitos que posições', async () => {
    await page.evaluate(() => window.__hestia.editor.store.exec({ type: 'moveCircuitoEletrico', id: 'cir_2', quadroId: 'qd1' }));
    const itens = await verificar();
    const q = itens.filter((x) => /Quadro com/.test(x));
    rep.check('quadro com 2 circuito(s) para 1 posição(ões)', q.some((x) => /Quadro com 2 circuito\(s\) para 1 posição/.test(x)), q.join(' | ') || 'ausente');
    await page.screenshot({ path: `${OUT}/04-verificar-quadro.png` });
    await fechar();
  });
  await rep.step('7. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
