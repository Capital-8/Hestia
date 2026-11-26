// Eletroduto CORRUGADO (ficha F2), em Chrome real: Sistemas > Eletroduto, escolhe o tipo corrugado Tigreflex e traça de uma caixa de
// luz até uma tomada com 3 cantos livres, mudando a cota do painel entre cliques (trecho inclinado, sem prumada nem peça nos cantos).
// Confere: só trechos corrugados criados (nenhuma curva, luva ou tê), Verificar rede sem afastada/incompatível/coladas/curvatura,
// Quantitativos elétricos com a linha "Eletroduto corrugado" (tabela e CSV), e o bloqueio de um canto fechado demais (prévia vermelha
// e fala com "aumentar o trecho para N mm"). A caixa e a tomada são postas por comando do programa; o eletroduto é traçado com o mouse.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5225/?debug=1' node tests/e2e/eletroduto-corrugado.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { CHROME_ARGS, abreVista3d, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5225/?debug=1';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/-home-user-Hestia/e0b36f0f-5cd5-5bfc-b964-572e233c1fd8/scratchpad/eletroduto-corrugado';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const shot = (nome) => page.screenshot({ path: `${OUT}/${nome}.png` });
const CORR = 'fam_tigre_tigreflex_amarelo';
const CAIXA = 'fam_krona_eletrica_caixa_4x4';
const TOMADA = 'fam_tomada_2p_t';
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, x: e.x, y: e.y, z: e.z, L: e.values?.L, incl: Array.isArray(e.inclinacao) ? Math.abs(e.inclinacao[0] - Math.PI / 2) : 0, lig: Object.keys(e.ligacoes ?? {}).length })));
const entradas = (id) => page.evaluate((id) => {
  const { engine, editor } = window.__hestia;
  const p = editor.store.project;
  const c = p.elements[id];
  return engine.resolverComponente(p, c).ligacoes.filter((l) => l.dominio === 'eletroduto').map((l) => { const m = engine.ligacaoNoMundo(l, c); return { nome: l.id, x: m.posicaoMundo[0], y: m.posicaoMundo[1], z: m.posicaoMundo[2], dir: [...m.direcaoMundo] }; });
}, id);
const diag = () => page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).map((d) => d.codigo));
const contar = (l) => l.reduce((a, c) => ({ ...a, [c]: (a[c] ?? 0) + 1 }), {});
const definirZ = async (z) => { const f = page.locator('#place-tubo-z'); await f.fill(String(z)); await f.press('Enter'); await page.waitForTimeout(150); };
const falas = () => page.evaluate(() => document.querySelector('.statusbar, .status, [role="status"]')?.textContent ?? '');

try {
  await rep.step('1. Sistemas > Eletroduto: o seletor de tipo oferece rígido e corrugado; escolhe o corrugado', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.getByRole('button', { name: 'Eletroduto', exact: true }).first().click();
    await page.waitForSelector('#place-tubo-familia', { timeout: 15_000 });
    const tipos = await page.locator('#place-tubo-familia option').allInnerTexts();
    rep.check('rígido e os dois corrugados no seletor', tipos.length === 3 && tipos.some((t) => /rígido/i.test(t)) && tipos.filter((t) => /corrugado/i.test(t)).length === 2, tipos.join(' | '));
    await page.locator('#place-tubo-familia').selectOption(CORR);
    await page.waitForTimeout(200);
    const dns = (await page.locator('#place-tubo-dn option').allInnerTexts()).join('|');
    rep.check('bitolas do catálogo Tigreflex 20|25|32', dns === '20|25|32', dns);
    await page.locator('#place-tubo-dn').selectOption('20');
    await shot('01-painel-corrugado');
  });

  await rep.step('2. caixa de luz 4x4 e tomada 2P+T (girada 90°) no projeto', async () => {
    await page.evaluate(({ CAIXA, TOMADA }) => {
      const { model, editor, useUi } = window.__hestia;
      const nivel = useUi.getState().levelId;
      for (const f of [CAIXA, TOMADA]) editor.store.exec({ type: 'upsertFamily', family: structuredClone(model.familiaDaBiblioteca(f)) });
      const mk = (id, f, x, y, rot, extra = {}) => ({ id, kind: 'component', familyId: f, typeId: model.familiaDaBiblioteca(f).tipoPadrao ?? model.familiaDaBiblioteca(f).tipos[0]?.id ?? null, levelId: nivel, x, y, z: 0, rotation: rot, mirrored: false, mark: id, ...extra });
      editor.store.exec({ type: 'addComponent', component: mk('cx1', CAIXA, 0, 0, 0, { z: 0.5, values: { L: 100, A: 100, P: 50 } }) });
      editor.store.exec({ type: 'addComponent', component: mk('tm1', TOMADA, 4.5, 3, Math.PI / 2, { values: {} }) });
      editor.setViewport({ ...editor.viewport(), cx: 2.5, cy: 1.6, zoom: 150 });
    }, { CAIXA, TOMADA });
    await page.waitForTimeout(300);
    const cx = await entradas('cx1');
    const tm = await entradas('tm1');
    globalThis.E = { cx, tm };
    rep.check('caixa e tomada com entradas de eletroduto', cx.length === 4 && tm.length >= 1, `${cx.length} + ${tm.length} entradas`);
    console.log('  info  entradas da tomada:', JSON.stringify(tm.map((e) => [e.nome, +e.x.toFixed(3), +e.y.toFixed(3), +e.z.toFixed(3), e.dir.map((v) => +v.toFixed(2))])));
    await shot('02-caixa-e-tomada');
  });

  await rep.step('3. traça caixa → tomada com 3 cantos, mudando a cota do painel entre cliques', async () => {
    const { cx, tm } = globalThis.E;
    const d = cx.find((e) => e.nome === 'd');
    // entrada da tomada virada para −Y (a tomada gira 90°): o último trecho chega de frente para ela
    const t = tm.find((e) => e.dir[1] < -0.9) ?? tm[0];
    console.log('  info  entrada de partida', d.nome, d.z.toFixed(3), '; entrada de chegada', t.nome, t.z.toFixed(3));
    await definirZ(d.z);
    await clickWorld(page, d.x, d.y); // começa na entrada da caixa (+X)
    await clickWorld(page, 2, d.y); // trecho 1: reto, na cota da caixa
    await definirZ(d.z + 0.45); // sobe 45 cm durante o traçado
    await clickWorld(page, 2, 1.8); // canto 1 (+X → +Y), trecho 2 inclinado
    await definirZ(d.z + 0.45);
    await clickWorld(page, t.x, 1.8); // canto 2 (+Y → +X), trecho 3 na nova cota
    await definirZ(t.z - 0.2); // volta a descer
    await clickWorld(page, t.x, t.y); // canto 3 e chegada na entrada da tomada
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const todos = await comps();
    const corr = todos.filter((c) => c.f === CORR);
    const outros = todos.filter((c) => c.f !== CORR && c.id !== 'cx1' && c.id !== 'tm1');
    rep.check('4 trechos corrugados e NENHUMA outra peça (sem curva, luva nem tê)', corr.length === 4 && outros.length === 0, `${corr.length} trechos; outras: ${outros.map((o) => o.f).join(',') || '—'}`);
    rep.check('trechos ligados em cadeia (as duas pontas de cada trecho ligadas: ao anterior, à caixa ou à tomada)', corr.every((c) => c.lig === 2), corr.map((c) => c.lig).join(','));
    console.log('  info  trechos (x, y, z, L mm, inclinação):', JSON.stringify(corr.map((c) => [+c.x.toFixed(3), +c.y.toFixed(3), +c.z.toFixed(3), +c.L.toFixed(0), +c.incl.toFixed(3)])));
    rep.check('caixa e tomada ligadas ao corrugado', todos.find((c) => c.id === 'cx1').lig === 1 && todos.find((c) => c.id === 'tm1').lig === 1, `cx1:${todos.find((c) => c.id === 'cx1').lig} tm1:${todos.find((c) => c.id === 'tm1').lig}`);
    const incl = corr.filter((c) => Math.abs(c.incl) > 1e-6).length;
    rep.check('mudança de cota entre cliques: ao menos 2 trechos inclinados (sem prumada)', incl >= 2, `${incl} inclinados`);
    await page.evaluate(() => window.__hestia.editor.setViewport({ ...window.__hestia.editor.viewport(), cx: 2.4, cy: 1.6, zoom: 150 }));
    await shot('03-planta-corrugado');
    // Zoom no canto 1 (trecho horizontal que sobe 45 cm e vira): como o canto flexível aparece na planta.
    await page.evaluate(() => window.__hestia.editor.setViewport({ ...window.__hestia.editor.viewport(), cx: 2, cy: 0.35, zoom: 600 }));
    await page.waitForTimeout(300);
    await shot('03b-planta-canto-zoom');
    await page.evaluate(() => window.__hestia.editor.setViewport({ ...window.__hestia.editor.viewport(), cx: 2.5, cy: 1.6, zoom: 150 }));
  });

  await rep.step('4. Verificar rede: sem afastada, incompatível, coladas nem curvatura fechada nos cantos válidos', async () => {
    const d = await diag();
    const c = contar(d);
    rep.check('nenhum aviso de canto flexível válido', !d.some((x) => /afastada|incompativel|conexoes_coladas|conexao_invalida|curvatura_fechada|curvas_entre_caixas/.test(x)), JSON.stringify(c));
    await page.getByRole('button', { name: 'Verificar rede', exact: true }).first().click();
    await page.waitForTimeout(2500);
    const itens = (await page.locator('[role="dialog"] li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
    rep.check('painel sem "afastada", "incompatível", "coladas" nem "canto fechado"', !itens.some((x) => /afastad|incompat|coladas|canto fechado/i.test(x)), `${itens.length} itens: ${itens.slice(0, 2).join(' | ').slice(0, 160)}`);
    console.log('  info  avisos que restam:', JSON.stringify(c));
    console.log('  info  ligações abertas por peça:', JSON.stringify(await page.evaluate(() => { const p = window.__hestia.editor.store.project; return window.__hestia.engine.diagnosticarRede(p).filter((x) => x.codigo === 'ligacao_aberta').map((x) => x.elementId + '.' + x.ligacaoId); })));
    await shot('04-verificar-rede');
    await page.locator('[role="dialog"]').last().locator('button.btn', { hasText: /^Fechar$/ }).click().catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(250);
  });

  await rep.step('5. Quantitativos elétricos: linha "Eletroduto corrugado" (tabela e CSV), sem curvas nem luvas', async () => {
    await page.getByRole('button', { name: 'Quantitativos elétricos', exact: true }).first().click();
    await page.waitForSelector('.circ-quant', { timeout: 15_000 });
    const linhas = await page.locator('table.circ-quant tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())));
    const corr = linhas.filter((l) => /corrugado/i.test(l[1] ?? ''));
    console.log('  info  linhas:', JSON.stringify(linhas));
    rep.check('uma linha "Eletroduto corrugado" com DN 20, 4 trechos e comprimento em m', corr.length === 1 && /DN 20/.test(corr[0][2]) && corr[0][3] === '4' && /m$/.test(corr[0][4]), JSON.stringify(corr));
    rep.check('nenhuma linha de Curva nem de Luva', !linhas.some((l) => /^(Curva|Luva)$/.test(l[1] ?? '')), linhas.map((l) => l[1]).join(','));
    await shot('05-quantitativos');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar CSV' }).click()]);
    const csv = readFileSync(await dl.path(), 'utf8');
    rep.check('CSV traz a linha "Eletroduto corrugado"', /Projeto;Eletroduto corrugado;.*DN 20;4;/.test(csv), csv.split('\n').filter((l) => /corrugado/.test(l)).join(' / '));
    await page.locator('[role="dialog"]').last().locator('button.btn', { hasText: /^Fechar$/ }).click();
    await page.waitForTimeout(250);
  });

  await rep.step('6. canto fechado demais: a prévia fica vermelha e o clique é bloqueado com "aumentar o trecho para N mm"', async () => {
    const antes = (await comps()).filter((c) => c.f === CORR).length;
    await page.getByRole('button', { name: 'Eletroduto', exact: true }).first().click();
    await definirZ(0.5);
    await clickWorld(page, 6, 0);
    await clickWorld(page, 6.1, 0); // trecho de 0,1 m
    const p = await worldToPage(page, 6.1, 1);
    await page.mouse.move(p.x, p.y); // canto de 90° com trecho anterior de 0,1 m: não cabe
    await page.waitForTimeout(250);
    await shot('06-bloqueio-previa');
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    const depois = (await comps()).filter((c) => c.f === CORR).length;
    const texto = await page.evaluate(() => document.body.innerText);
    rep.check('o segundo trecho não foi criado (só o primeiro de 0,1 m)', depois === antes + 1, `${antes} → ${depois}`);
    rep.check('a mensagem mostra o bloqueio com o motivo de curvatura e a sugestão', /Bloqueado/.test(texto) && /raio mínimo de curvatura/.test(texto), (texto.match(/Bloqueado[^\n]{0,200}/) ?? [''])[0]);
    await shot('06-bloqueio-clique');
    await page.keyboard.press('Escape');
    // Variante: o trecho NOVO é o curto (o anterior tem 1 m): a sugestão é "aumentar o trecho para N mm".
    await clickWorld(page, 0.6, -0.5);
    await clickWorld(page, 1.6, -0.5);
    const q = await worldToPage(page, 1.6, -0.4);
    await page.mouse.move(q.x, q.y);
    await page.waitForTimeout(250);
    await shot('06b-bloqueio-trecho-novo');
    const rot = await page.evaluate(() => [...document.querySelectorAll('canvas')].length);
    await page.mouse.click(q.x, q.y);
    await page.waitForTimeout(300);
    const t2 = await page.evaluate(() => document.body.innerText);
    rep.check('trecho novo curto: a mensagem sugere "aumentar o trecho para 120 mm"', /aumentar o trecho para 120 mm/.test(t2), (t2.match(/Bloqueado[^\n]{0,220}/) ?? [''])[0] + ` (${rot} canvas)`);
    await page.keyboard.press('Escape');
  });

  await rep.step('7. vista 3D do traçado', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await abreVista3d(page);
    await page.waitForTimeout(1500);
    // Aproxima a câmera do traçado com a roda do mouse (o enquadramento geral deixa os tubos de 20 mm minúsculos).
    await page.mouse.move(930, 520);
    for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(120); }
    await page.waitForTimeout(1500);
    await shot('07-vista-3d');
    rep.check('3D abriu sem erro', erros.length === 0, erros.slice(0, 2).join(' | ').slice(0, 200));
  });

  await rep.step('8. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
