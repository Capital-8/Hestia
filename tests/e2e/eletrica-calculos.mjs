// Cálculos elétricos (ficha C5), em Chrome real: quadro + caixa + 3 eletrodutos + 2 tomadas entram por comando do programa (ligados
// pela rede de ligações), o painel Circuitos mostra potência, corrente, seção, disjuntor, comprimento e queda, e o roteiro compara cada
// número com a conta FEITA À MÃO aqui (fórmulas escritas de novo, sem usar o engine). Depois edita uma tabela (Tabelas) e vê o
// resultado mudar, e um circuito sobrecarregado aparece em "Verificar rede". Tabelas provisórias (CONFERIR): não são norma.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5218/?debug=1' node tests/e2e/eletrica-calculos.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5218/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/eletrica-calculos';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const pt = (v, casas) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas === 0 ? 0 : 1, maximumFractionDigits: casas });
const res = async (chave) => (await page.locator(`[data-calculo] [data-res="${chave}"]`).first().innerText()).replace(/\s+/g, ' ').trim();
const dialogo = () => page.locator('[role="dialog"]').first();

// Conta à mão (tabelas provisórias): 2 tomadas de 1000 VA a 127 V, fp 1, demanda 1; eletrodutos 3 m + 2 m até a tomada mais longe.
const V = 127, VA = 2000, L = 3 + 2, RHO = 0.0225;
const I = VA / V;
const queda = (S) => (2 * RHO * L * I) / (S * V) * 100;

try {
  await rep.step('1. abre o app e monta quadro, caixa, 3 eletrodutos e 2 tomadas ligados', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    const ok = await page.evaluate(() => {
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
    rep.check('7 componentes ligados', ok === 7, ok);
  });
  await rep.step('2. Circuitos: cria circuito de tomadas, atribui as 2 tomadas, 1000 VA cada', async () => {
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.getByRole('button', { name: 'Circuitos', exact: true }).first().click();
    await page.waitForSelector('.circ-painel', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Novo circuito', exact: true }).click();
    await page.locator('[data-circuito] select').first().selectOption('tomadas_uso_geral');
    await page.evaluate(() => window.__hestia.useUi.setState({ selection: ['tom1', 'tom2'] }));
    await page.waitForTimeout(200);
    await page.locator('[data-circuito]').first().getByRole('button', { name: /Atribuir selecionados/ }).click();
    for (const id of ['tom1', 'tom2']) {
      const campo = page.locator(`[data-ponto="${id}"] input`).first();
      await campo.fill('1000');
      await campo.press('Enter');
      await page.waitForTimeout(150);
    }
    const cs = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.circuitosEletricos).map((c) => `${c.tipo}:${c.quadroId}:${c.pontos.map((p) => p.potenciaVA).join('+')}`));
    rep.check('circuito de tomadas no quadro qd1 com 1000 + 1000 VA', cs.join() === 'tomadas_uso_geral:qd1:1000+1000', cs.join());
  });
  await rep.step('3. números do painel = conta à mão (corrente, seção, disjuntor, comprimento, queda)', async () => {
    const esperado = { potencia: `${pt(VA, 0)} VA (${pt(VA, 0)} W)`, corrente: `${pt(I, 2)} A`, secao: '2,5 mm2', disjuntor: '16 A', comprimento: `${pt(L, 2)} m`, queda: `${pt(queda(2.5), 2)} % (limite 4,0 %)` };
    console.log('  info  esperado à mão:', JSON.stringify(esperado));
    for (const k of Object.keys(esperado)) rep.check(`${k}: painel = conta à mão`, (await res(k)) === esperado[k], `painel "${await res(k)}" × mão "${esperado[k]}"`);
    const txt = await dialogo().innerText();
    rep.check('selo CONFERIR visível no painel', (await page.locator('[data-conferir]').count()) >= 2 && /CONFERIR/.test(txt));
    const tq = (await page.locator('[data-calculo-quadro]').innerText()).replace(/\s+/g, ' ');
    rep.check('total do quadro: potência aplicada e soma das correntes', tq === `aplicada ${pt(VA, 0)} VA, soma das correntes ${pt(I, 2)} A`, tq);
    await page.screenshot({ path: `${OUT}/01-painel-calculos.png` });
  });
  await rep.step('4. botão Tabelas: edita a capacidade de 2,5 mm2 para 15 A e a seção sobe para 4 mm2', async () => {
    await page.getByRole('button', { name: 'Tabelas', exact: true }).click();
    await page.waitForSelector('[data-tabelas-estado]', { timeout: 10_000 });
    const estado0 = await page.locator('[data-tabelas-estado]').getAttribute('data-tabelas-estado');
    await page.screenshot({ path: `${OUT}/02-tabelas.png` });
    const campo = page.locator('[data-secao="2.5"] input').first();
    await campo.fill('15');
    await campo.press('Enter');
    await page.waitForTimeout(300);
    await page.locator('[role="dialog"]').last().locator('button.btn', { hasText: /^Fechar$/ }).click();
    await page.waitForTimeout(300);
    rep.check('as tabelas nascem CONFERIR', estado0 === 'CONFERIR', estado0);
    const esperado = { secao: '4,0 mm2', disjuntor: '16 A', queda: `${pt(queda(4), 2)} % (limite 4,0 %)` };
    console.log('  info  esperado à mão com 2,5 mm2 a 15 A:', JSON.stringify(esperado));
    for (const k of Object.keys(esperado)) rep.check(`${k} mudou como na conta à mão`, (await res(k)) === esperado[k], `painel "${await res(k)}" × mão "${esperado[k]}"`);
    const guardado = await page.evaluate(() => localStorage.getItem('hestia.eletrica.tabelas'));
    rep.check('a edição ficou no navegador (localStorage)', /"2.5":15/.test(guardado ?? ''), (guardado ?? '').slice(0, 80));
    await page.screenshot({ path: `${OUT}/03-apos-editar-tabela.png` });
  });
  await rep.step('5. circuito sobrecarregado: 20 kVA em uma tomada e Verificar rede o lista', async () => {
    const campo = page.locator('[data-ponto="tom1"] input').first();
    await campo.fill('20000');
    await campo.press('Enter');
    await page.waitForTimeout(300);
    rep.check('painel: nenhuma seção serve', /nenhuma serve/.test(await res('secao')), await res('secao'));
    await page.screenshot({ path: `${OUT}/04-sobrecarga-painel.png` });
    await page.locator('[role="dialog"]').last().locator('button.btn', { hasText: /^Fechar$/ }).click();
    await page.waitForTimeout(300);
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.getByRole('button', { name: 'Verificar rede', exact: true }).first().click();
    await page.waitForTimeout(1500);
    const itens = (await page.locator('[role="dialog"] li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
    console.log('  info  itens de Verificar rede:', itens.length, '| elétricos:', JSON.stringify(itens.filter((x) => /Circuito|circuito|Caixa ou dispositivo|Quadro/.test(x))));
    rep.check('lista o circuito sobrecarregado com "tabelas provisórias (CONFERIR)"', itens.some((x) => /C1 sobrecarregado/.test(x) && /tabelas provisórias \(CONFERIR\)/.test(x)), itens.find((x) => /sobrecarregado/.test(x)) ?? 'ausente');
    rep.check('a rede montada não acusa "sem quadro", "sem eletroduto" nem potência 0', !itens.some((x) => /sem quadro|sem eletroduto|potência 0/.test(x)), '');
    await page.screenshot({ path: `${OUT}/05-verificar-rede.png` });
  });
  await rep.step('6. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
