// Quantitativos elétricos (ficha C6), em Chrome real. Quadro + caixa 4x4 + 3 eletrodutos + 2 tomadas + 1 interruptor entram por
// comando do programa (ligados pela rede de ligações); o circuito C1 recebe as 2 tomadas pelo painel Circuitos; depois abre
// Sistemas > Elétrico > Quantitativos elétricos e confere a tabela contra o que foi montado (eletroduto total = 3 + 2 + 1 m, uma vez
// cada peça; circuito = mesmas 3 peças pelo caminho das duas tomadas; caixa 1; VA = soma do que está no projeto). Baixa o CSV e confere
// o cabeçalho. Não há dimensionamento: nenhum número de corrente, seção, disjuntor ou queda de tensão.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5219/?debug=1' node tests/e2e/eletrica-quantitativos.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5219/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/eletrica-quantitativos';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const fechar = async () => { await page.locator('[role="dialog"]').last().locator('button.btn', { hasText: /^Fechar$/ }).click(); await page.waitForTimeout(250); };
const abreQuantitativos = async () => {
  await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
  await page.getByRole('button', { name: 'Quantitativos elétricos', exact: true }).first().click();
  await page.waitForSelector('.circ-quant', { timeout: 15_000 });
  await page.waitForTimeout(300);
};
/** Linhas da tabela como textos de célula (escopo; grupo; item; quantidade; medida). */
const linhas = () => page.locator('table.circ-quant tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())));

try {
  await rep.step('1. monta quadro, caixa, 3 eletrodutos, 2 tomadas e 1 interruptor ligados (comando do programa)', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    const n = await page.evaluate(() => {
      const { model, editor, useUi } = window.__hestia;
      const nivel = useUi.getState().levelId;
      for (const f of ['fam_quadro_distribuicao_eletrico', 'fam_krona_eletrica_tubo_corte', 'fam_krona_eletrica_caixa_4x4', 'fam_tomada_2p_t', 'fam_interruptor_simples']) editor.store.exec({ type: 'upsertFamily', family: structuredClone(model.familiaDaBiblioteca(f)) });
      const mk = (id, f, x, y, extra = {}) => ({ id, kind: 'component', familyId: f, typeId: model.familiaDaBiblioteca(f).tipos[0]?.id ?? null, levelId: nivel, x, y, z: 0, rotation: 0, mirrored: false, mark: id, ...extra });
      const add = (c) => editor.store.exec({ type: 'addComponent', component: c });
      add(mk('qd1', 'fam_quadro_distribuicao_eletrico', 1, 1, { typeId: 'dn25' }));
      add(mk('t1', 'fam_krona_eletrica_tubo_corte', 2, 1, { values: { L: 3000 } }));
      add(mk('cx1', 'fam_krona_eletrica_caixa_4x4', 4, 1));
      add(mk('t2', 'fam_krona_eletrica_tubo_corte', 4.5, 1, { values: { L: 2000 } }));
      add(mk('t3', 'fam_krona_eletrica_tubo_corte', 4, 2, { values: { L: 1000 } }));
      add(mk('tom1', 'fam_tomada_2p_t', 6.5, 1));
      add(mk('tom2', 'fam_tomada_2p_t', 4, 3));
      add(mk('int1', 'fam_interruptor_simples', 8, 1));
      for (const [a, la, b, lb] of [['qd1', 'a', 't1', 'a'], ['t1', 'b', 'cx1', 'a'], ['cx1', 'b', 't2', 'a'], ['t2', 'b', 'tom1', 'eletroduto'], ['cx1', 'c', 't3', 'a'], ['t3', 'b', 'tom2', 'eletroduto']]) editor.store.exec({ type: 'connectComponents', a, ligacaoA: la, b, ligacaoB: lb });
      editor.setViewport({ ...editor.viewport(), cx: 4, cy: 2, zoom: 160 });
      return Object.values(editor.store.project.elements).filter((e) => e.kind === 'component').length;
    });
    rep.check('8 componentes montados', n === 8, n);
  });
  await rep.step('2. circuito C1 com as 2 tomadas pelo painel Circuitos', async () => {
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.getByRole('button', { name: 'Circuitos', exact: true }).first().click();
    await page.waitForSelector('.circ-painel', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Novo circuito', exact: true }).click();
    await page.evaluate(() => window.__hestia.useUi.setState({ selection: ['tom1', 'tom2'] }));
    await page.waitForTimeout(200);
    await page.locator('[data-circuito]').first().getByRole('button', { name: /Atribuir selecionados/ }).click();
    await page.waitForTimeout(300);
    await fechar();
    const circuitos = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.circuitosEletricos ?? {}).map((c) => ({ nome: c.nome, pontos: c.pontos.length })));
    rep.check('C1 com 2 pontos', circuitos.length === 1 && circuitos[0].pontos === 2, JSON.stringify(circuitos));
  });
  await rep.step('3. Sistemas > Elétrico > Quantitativos elétricos: tabela confere com o montado', async () => {
    await abreQuantitativos();
    const esperado = await page.evaluate(() => {
      const { editor } = window.__hestia;
      const cs = Object.values(editor.store.project.circuitosEletricos ?? {});
      const va = cs.reduce((s, c) => s + c.pontos.reduce((t, pt) => t + pt.potenciaVA * (pt.fator ?? 1), 0), 0);
      return { va };
    });
    const ls = await linhas();
    const textos = ls.map((l) => l.join(' | '));
    console.log('  info  linhas:', textos.length, '\n   ' + textos.join('\n   '));
    const eletro = ls.find((l) => l[0] === 'Projeto' && l[1] === 'Eletroduto');
    rep.check('eletroduto do projeto: 3 trechos e 6 m (3 + 2 + 1, sem recuo somado)', eletro !== undefined && eletro[3] === '3' && /^6 m$/.test(eletro[4]), eletro?.join(' | ') ?? 'ausente');
    const caixa = ls.find((l) => l[0] === 'Projeto' && l[1] === 'Caixa');
    rep.check('uma caixa 4x4 no projeto', caixa !== undefined && caixa[3] === '1', caixa?.join(' | ') ?? 'ausente');
    const tomadas = ls.find((l) => l[0] === 'Projeto' && l[1] === 'Ponto' && l[2] === 'Tomada');
    rep.check('2 tomadas e 1 interruptor no projeto', tomadas?.[3] === '2' && ls.some((l) => l[0] === 'Projeto' && l[2] === 'Interruptor' && l[3] === '1'), textos.filter((t) => /Ponto/.test(t)).join(' || '));
    const c1Eletro = ls.find((l) => l[0] === 'C1' && l[1] === 'Eletroduto');
    rep.check('C1: mesmas 3 peças pelo caminho das duas tomadas, 6 m (uma vez cada)', c1Eletro !== undefined && c1Eletro[3] === '3' && /^6 m$/.test(c1Eletro[4]), c1Eletro?.join(' | ') ?? 'ausente');
    const c1Pot = ls.find((l) => l[0] === 'C1' && l[1] === 'Potência');
    const vaTexto = c1Pot?.[4] ?? '';
    const vaNum = Number(vaTexto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    rep.check('C1: VA = soma de potência × fator no projeto', Math.abs(vaNum - esperado.va) < 0.5, `${vaTexto} x esperado ${esperado.va}`);
    const sujo = /corrente|seção|disjuntor|queda de tens/i.test(await page.locator('[role="dialog"]').last().innerText());
    rep.check('nada de corrente, seção, disjuntor ou queda de tensão no diálogo', !sujo, '');
    await page.screenshot({ path: `${OUT}/01-quantitativos.png` });
  });
  await rep.step('4. CSV baixado: cabeçalho de seis colunas e linhas do projeto', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar CSV', exact: true }).click()]);
    const caminho = `${OUT}/quantitativos.csv`;
    await download.saveAs(caminho);
    const csv = readFileSync(caminho, 'utf8');
    rep.check('cabeçalho do CSV', csv.split('\n')[0] === 'Escopo;Grupo;Item;Quantidade;Medida;Unidade', csv.split('\n')[0]);
    rep.check('CSV traz a linha do eletroduto do projeto', /^Projeto;Eletroduto;DN \d+;3;6;m$/m.test(csv), csv.split('\n').slice(0, 3).join(' / '));
    await fechar();
  });
  await rep.step('5. Verificar rede também aparece no grupo Elétrico', async () => {
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    const n = await page.locator('.ribbon button', { hasText: 'Verificar rede' }).count();
    rep.check('Verificar rede visível na aba Sistemas', n >= 1, n);
    await page.screenshot({ path: `${OUT}/02-sistemas-eletrico.png` });
  });
  await rep.step('6. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
