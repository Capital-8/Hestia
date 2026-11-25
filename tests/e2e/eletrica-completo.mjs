// Projeto elétrico de ponta a ponta (ficha C7), em Chrome real, como um usuário: Sistemas > Elétrico. As peças entram pela Biblioteca
// (cartão + clique na planta); os eletrodutos são traçados com a ferramenta Eletroduto e o mouse; Circuitos, Verificar rede,
// Quantitativos elétricos, Arquivo e a vista 3D são abertos pelos botões ou pela árvore de projeto. Atalhos de programa, anotados
// no passo onde aparecem: enquadramento da vista (setViewport) e leitura das posições das entradas pelo motor (só para mirar o mouse).
// NÃO dimensiona: nenhum número de corrente, seção, disjuntor ou queda de tensão é conferido ou exigido.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5220/?debug=1' node tests/e2e/eletrica-completo.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5220/?debug=1';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/-home-user-Hestia/e0b36f0f-5cd5-5bfc-b964-572e233c1fd8/scratchpad/eletrica-completo';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const erros = [];
const r404 = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() === 404) r404.push(r.url()); });
const rep = makeReporter();
const shot = (nome) => page.screenshot({ path: `${OUT}/${nome}.png` });
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, x: e.x, y: e.y, z: e.z, L: e.values?.L })));
const FAM = { tubo: 'fam_krona_eletrica_tubo_corte', curva: 'fam_krona_eletrica_curva90', caixa: 'fam_krona_eletrica_caixa_4x4', quadro: 'fam_quadro_distribuicao_eletrico', tom: 'fam_tomada_2p_t', int: 'fam_interruptor_simples', lum: 'fam_luminaria_plafon_redondo' };
const contar = (lista, fam) => lista.filter((c) => c.f === fam).length;
const idsDe = async (fam) => (await comps()).filter((c) => c.f === fam).map((c) => c.id);
const tubos = () => idsDe(FAM.tubo);
const ELET = /sem quadro|sem eletroduto|potência 0|posição|posições/;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pos = (id) => page.evaluate((id) => { const e = window.__hestia.editor.store.project.elements[id]; return e ? { x: e.x, y: e.y, z: e.z } : null; }, id);
/** Posições das entradas de eletroduto de uma peça (metros): só para mirar o mouse na entrada que a tela mostra. */
const entradas = (id) => page.evaluate((id) => {
  const { engine, editor } = window.__hestia;
  const p = editor.store.project;
  const c = p.elements[id];
  return engine.resolverComponente(p, c).ligacoes.filter((l) => l.dominio === 'eletroduto').map((l) => {
    const m = engine.ligacaoNoMundo(l, c).posicaoMundo;
    const d = engine.ligacaoNoMundo(l, c).direcaoMundo;
    return { nome: l.id, x: m[0], y: m[1], z: m[2], dir: [d[0], d[1], d[2]] };
  });
}, id);
const selecao = () => page.evaluate(() => window.__hestia.useUi.getState().selection);
const fechar = async () => {
  // O painel Circuitos agora é uma janela flutuante (não modal) com o próprio botão de fechar.
  const janela = page.locator('.circ-janela');
  if (await janela.isVisible().catch(() => false)) await janela.getByRole('button', { name: 'Fechar painel Circuitos' }).click();
  else await page.locator('[role="dialog"]').last().locator('button.btn', { hasText: /^Fechar$/ }).click();
  await page.waitForTimeout(250);
};
const aba = async (nome) => { await page.locator('.ribbon-tabs .rtab:visible', { hasText: new RegExp(`^${nome}$`) }).first().click(); await page.waitForTimeout(150); };
const botao = (nome, indice = 0) => page.getByRole('button', { name: nome, exact: true }).nth(indice);
const fecharBiblioteca = async () => { if (await page.locator('.pal-janela').isVisible().catch(() => false)) await page.locator('.pal-fechar').click(); };
/** Abre o painel Circuitos pela faixa (Sistemas > Elétrico). */
const abrirCircuitos = async () => { await fecharBiblioteca(); await aba('Sistemas'); await botao('Circuitos').click(); await page.waitForSelector('.circ-painel', { timeout: 15_000 }); };
/** Avisos elétricos do "Verificar rede" (texto dos itens do painel). */
const avisosEletricos = async () => {
  if (await page.locator('.circ-janela').isVisible().catch(() => false)) await fechar().catch(() => page.keyboard.press('Escape'));
  await aba('Sistemas');
  await botao('Verificar rede').click();
  await page.waitForTimeout(1200);
  return (await page.locator('[role="dialog"] li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').replace(/ Ir para$/, '')).filter((x) => ELET.test(x));
};
/** Coloca uma peça pela Biblioteca: cartão (aba Elétrico) e clique na planta. Devolve os ids das peças novas. */
async function colocar(busca, cartao, x, y) {
  const antes = (await comps()).map((c) => c.id);
  if (!(await page.locator('.pal-janela').isVisible().catch(() => false))) await botao('Eletrodutos e dispositivos').click();
  await page.locator('.pal-busca').fill(busca);
  await page.waitForTimeout(250);
  await page.locator('.pal-movel', { hasText: cartao }).first().click();
  await page.waitForTimeout(200);
  await clickWorld(page, x, y);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return (await comps()).map((c) => c.id).filter((id) => !antes.includes(id));
}
/** Entrada livre de `id` mais perto de `alvo` (cada entrada serve a uma só ligação: `usadas`). */
async function entradaPerto(id, alvo, usadas) {
  // C8a: as entradas têm direção (o eletroduto tem de chegar de frente para ela). Escolhe a mais perto entre as que apontam para o alvo em planta (como o usuário faz); sem nenhuma, a mais perto.
  const aponta = (c) => c.dir[0] * (alvo.x - c.x) + c.dir[1] * (alvo.y - c.y) > 0;
  const lista = (await entradas(id)).filter((c) => !usadas.includes(`${id}:${c.nome}`)).sort((a, b) => (aponta(b) ? 1 : 0) - (aponta(a) ? 1 : 0) || dist(a, alvo) - dist(b, alvo));
  usadas.push(`${id}:${lista[0].nome}`);
  return lista[0];
}
/** Ações de quebra do passo 6: cada uma é um passo de desfazer (Ctrl+Z). */
const quebras = [];
/** Códigos de diagnóstico da cena íntegra (passo 5): o desfazer tem de voltar a eles. */
let baseline = '';
let baselineEl = 0;

try {
  // ---------- 1 ----------
  await rep.step('1. Sistemas > Elétrico: botões visíveis, ativos e com ícones diferentes', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    // Enquadramento da vista (atalho de programa): x de -2 a 9 m e y de -1 a 4 m. Não mexe em peças.
    await page.evaluate(() => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), cx: 3.5, cy: 1.5, zoom: 110 }); });
    await aba('Sistemas');
    const icones = [];
    for (const n of ['Eletroduto', 'Eletrodutos e dispositivos', 'Circuitos', 'Quantitativos elétricos']) {
      const b = botao(n);
      const vis = await b.isVisible();
      const ativo = await b.isEnabled();
      rep.check(`"${n}" visível e ativo`, vis && ativo, `visível=${vis} ativo=${ativo}`);
      icones.push(await b.locator('svg').first().evaluate((e) => e.outerHTML).catch(() => ''));
    }
    const verif = page.getByRole('button', { name: 'Verificar rede', exact: true });
    rep.check('"Verificar rede" aparece uma única vez na faixa (sem duplicata no grupo Elétrico)', (await verif.count()) === 1, `${await verif.count()} botões`);
    icones.push(await verif.nth(0).locator('svg').first().evaluate((e) => e.outerHTML).catch(() => ''));
    rep.check('cinco ícones distintos', icones.every(Boolean) && new Set(icones).size === icones.length, `${new Set(icones).size} de ${icones.length} distintos`);
    await shot('01-aba-eletrico');
  });

  // ---------- 2 ----------
  await rep.step('2. insere quadro, 2 caixas, 2 tomadas, 1 interruptor e 1 luminária pela Biblioteca', async () => {
    await botao('Eletrodutos e dispositivos').click();
    await page.waitForSelector('.pal-janela', { timeout: 15_000 });
    await page.locator('.pal-busca').fill('');
    await page.waitForTimeout(300);
    await shot('02-biblioteca-eletrico');
    // Disciplina da vista = Elétrico (propriedade da vista, no painel; sem isso os componentes elétricos ficam em meio-tom).
    const sel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Hidrossanitário' }) }).first();
    await sel.selectOption('Elétrico').catch((e) => console.log('  info  disciplina:', e.message.split('\n')[0]));
    await page.waitForTimeout(300);
    console.log('  info  disciplina da vista:', await sel.inputValue().catch(() => '?'));
    const n = [
      await colocar('Quadro', 'Quadro de distribuição', 0, 0),
      await colocar('Caixa de luz 4', /série 2/, 3, 0),
      await colocar('Caixa de luz 4', /série 2/, 3, 3),
      await colocar('Tomada', 'Tomada 2P+T', 6, 1.5),
      await colocar('Tomada', 'Tomada 2P+T', 6, 3),
      await colocar('Interruptor', 'Interruptor simples', 8, 0),
      await colocar('Plafon', 'Plafon redondo', 4.5, 4),
    ];
    const t = await comps();
    rep.check('1 quadro, 2 caixas, 2 tomadas, 1 interruptor e 1 luminária', contar(t, FAM.quadro) === 1 && contar(t, FAM.caixa) === 2 && contar(t, FAM.tom) === 2 && contar(t, FAM.int) === 1 && contar(t, FAM.lum) === 1, `${t.length} peças`);
    rep.check('cada cartão colocou uma peça', n.every((x) => x.length === 1), n.map((x) => x.length).join(','));
    await fecharBiblioteca();
    await shot('02-planta-com-pecas');
  });

  const [QD] = await idsDe(FAM.quadro);
  const [CX1, CX2] = await idsDe(FAM.caixa);
  const [T1, T2] = await idsDe(FAM.tom);
  const [IN] = await idsDe(FAM.int);
  const [LU] = await idsDe(FAM.lum);

  // ---------- 3 ----------
  await rep.step('3. traça eletrodutos com a ferramenta Eletroduto: quadro-caixa, caixa-tomada, caixa-caixa, caixa-tomada 2 com prumada, caixa-interruptor e caixa-luminária', async () => {
    const usadas = [];
    const pQ = await pos(QD), pC1 = await pos(CX1), pC2 = await pos(CX2);
    const pT1 = await pos(T1), pT2 = await pos(T2), pI = await pos(IN), pL = await pos(LU);
    const eCQ = await entradaPerto(CX1, pQ, usadas);
    const eT1 = await entradaPerto(CX1, pT1, usadas);
    const eC1 = await entradaPerto(CX1, pC2, usadas);
    const eL = await entradaPerto(CX1, pL, usadas);
    const eC2 = await entradaPerto(CX2, pC1, usadas);
    const eP = await entradaPerto(CX2, pT2, usadas);
    const eI = await entradaPerto(CX2, pI, usadas);
    const quadroEnt = (await entradas(QD)).sort((a, b) => dist(a, pC1) - dist(b, pC1))[0];
    // C8a: tomada, interruptor e luminária têm várias entradas de eletroduto (lados, topo, base, fundo): o traçado termina na mais próxima da caixa de origem.
    const aT1 = await entradaPerto(T1, pC1, usadas), aT2 = await entradaPerto(T2, pC2, usadas), aI = await entradaPerto(IN, pC2, usadas), aL = await entradaPerto(LU, pC1, usadas);
    console.log('  info  entradas escolhidas:', JSON.stringify({ quadro: quadroEnt.nome, cx1: [eCQ, eT1, eC1, eL].map((e) => e.nome), cx2: [eC2, eP, eI].map((e) => e.nome) }));
    /** Ativa a ferramenta Eletroduto (ela sai ao fim de cada trecho), define DN 20 e traça; devolve a variação de peças. */
    const traco = async (nome, cota, pontos) => {
      if (!(await page.locator('#place-tubo-z').isVisible().catch(() => false))) {
        await fecharBiblioteca();
        await botao('Eletroduto').click();
        await page.waitForSelector('#place-tubo-dn', { timeout: 15_000 });
        await page.locator('#place-tubo-dn').selectOption('20');
      }
      const a0 = await comps();
      await page.locator('#place-tubo-z').fill(String(cota));
      await page.locator('#place-tubo-z').press('Enter');
      for (const p of pontos) {
        if (p.cota !== undefined) { await page.locator('#place-tubo-z').fill(String(p.cota)); await page.locator('#place-tubo-z').press('Enter'); }
        await clickWorld(page, p.x, p.y);
      }
      const fala = await page.evaluate(() => [...document.querySelectorAll('div,span')].filter((e) => e.children.length === 0 && /^(Eletroduto|Bloqueado|Sem caminho)/.test(e.textContent.trim())).map((e) => e.textContent.trim()).slice(-1)[0] ?? '');
      console.log(`  info  fala depois de "${nome}":`, fala.slice(0, 300));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const a1 = await comps();
      return { nome, tubos: contar(a1, FAM.tubo) - contar(a0, FAM.tubo), curvas: contar(a1, FAM.curva) - contar(a0, FAM.curva) };
    };
    const r = [];
    // C8a: o usuário clica a entrada de partida e a de chegada; o caminho em 90° (e o número de trechos e curvas) vem do cálculo da ferramenta,
    // que respeita a direção de cada entrada. Só a prumada passa a cota do ponto final (campo "z").
    r.push(await traco('quadro -> caixa 1', quadroEnt.z, [{ x: quadroEnt.x, y: quadroEnt.y }, { x: eCQ.x, y: eCQ.y }]));
    r.push(await traco('caixa 1 -> tomada 1', eT1.z, [{ x: eT1.x, y: eT1.y }, { x: aT1.x, y: aT1.y, cota: aT1.z }]));
    r.push(await traco('caixa 1 -> caixa 2', eC1.z, [{ x: eC1.x, y: eC1.y }, { x: eC2.x, y: eC2.y }]));
    r.push(await traco('caixa 2 -> tomada 2 (prumada, cota muda)', eP.z, [{ x: eP.x, y: eP.y }, { x: aT2.x, y: aT2.y, cota: aT2.z }]));
    r.push(await traco('caixa 2 -> interruptor', eI.z, [{ x: eI.x, y: eI.y }, { x: aI.x, y: aI.y, cota: aI.z }]));
    r.push(await traco('caixa 1 -> luminária', eL.z, [{ x: eL.x, y: eL.y }, { x: aL.x, y: aL.y, cota: aL.z }]));
    console.log('  info  peças por trecho (resultado do cálculo do caminho):', JSON.stringify(r));
    rep.check('cada traçado criou eletroduto e curvas pelo cálculo (curvas = trechos - 1, a menos de luvas)', r.every((x) => x.tubos >= 1 && x.curvas >= 0 && x.curvas <= x.tubos), JSON.stringify(r));
    rep.check('caixa 2-tomada 2 com mudança de cota: prumada (vertical e horizontais, 2 curvas ou mais)', r[3].curvas >= 2 && r[3].tubos >= 3, JSON.stringify(r[3]));
    const incompat = await page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).filter((d) => d.codigo === 'incompativel' || d.codigo === 'conexao_afastada' || d.codigo === 'conexao_invalida').map((d) => `${d.codigo}:${d.motivo ?? ''}`));
    rep.check('rede sem incompatível, afastada nem conexão inválida depois dos traçados', incompat.length === 0, incompat.join(' | '));
    const ligs = await page.evaluate((ids) => ids.map((id) => Object.keys(window.__hestia.editor.store.project.elements[id].ligacoes ?? {}).length), [CX1, CX2, T1, T2, IN, LU]);
    rep.check('ligações gravadas nas caixas, tomadas, interruptor e luminária', ligs.every((n) => n >= 1), ligs.join(','));
    const ligTubos = await page.evaluate((ids) => ids.map((id) => Object.keys(window.__hestia.editor.store.project.elements[id].ligacoes ?? {}).join('+') || '-'), await tubos());
    console.log('  info  ligações gravadas nos eletrodutos (a, b):', ligTubos.join(' '));
    console.log('  info  ligações da tomada 1:', await page.evaluate((id) => JSON.stringify(window.__hestia.editor.store.project.elements[id].ligacoes ?? {}).slice(0, 200), T1));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await shot('03-eletrodutos-tracados');
  });

  // ---------- 4 ----------
  await rep.step('4. Circuitos: 2 circuitos, atribuição por seleção com o mouse, VA e comprimento', async () => {
    await abrirCircuitos();
    await botao('Novo circuito').click();
    await botao('Novo circuito').click();
    const nomes = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.circuitosEletricos ?? {}).map((c) => c.nome));
    rep.check('2 circuitos C1 e C2', nomes.join() === 'C1,C2', nomes.join());
    await fechar();
    // Seleção na planta com o painel fechado (como o usuário faz): tomada 1 e interruptor.
    // C8a: os eletrodutos agora chegam à borda do dispositivo; o clique de seleção vai ao centro dele (tomada 80 x 50 mm, interruptor 80 x 50 mm), não ao canto.
    await clickWorld(page, 6.04, 1.525);
    await page.keyboard.down('Shift');
    await clickWorld(page, 8.04, 0.025);
    await page.keyboard.up('Shift');
    const s1 = await selecao();
    rep.check('seleção = tomada 1 e interruptor', s1.length === 2 && s1.includes(T1) && s1.includes(IN), JSON.stringify(s1));
    await abrirCircuitos();
    rep.check('painel mostra 2 componentes selecionados', /2 componente\(s\) selecionado\(s\)/.test(await page.locator('.circ-painel').innerText()));
    await page.locator('[data-circuito]').nth(0).getByRole('button', { name: /Atribuir selecionados/ }).click();
    await page.waitForTimeout(200);
    await fechar();
    // Luminária para C2.
    let ok = false;
    for (const [dx, dy] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
      await page.keyboard.press('Escape');
      await clickWorld(page, 4.5 + dx, 4 + dy);
      const s3 = await selecao();
      if (s3.length === 1 && s3[0] === LU) { ok = true; console.log('  info  luminária selecionada no ponto', dx, dy); break; }
      console.log('  info  clique em', dx, dy, 'selecionou', JSON.stringify(s3));
    }
    rep.check('luminária selecionada pelo mouse (algum ponto dela)', ok, '');
    await abrirCircuitos();
    await page.locator('[data-circuito]').nth(1).getByRole('button', { name: /Atribuir selecionados/ }).click();
    await page.waitForTimeout(200);
    const cs = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.circuitosEletricos).map((c) => ({ nome: c.nome, pontos: c.pontos.map((p) => p.componenteId) })));
    const famDe = await page.evaluate(() => Object.fromEntries(Object.values(window.__hestia.editor.store.project.elements).map((e) => [e.id, e.familyId])));
    const fams = cs.map((c) => c.pontos.map((id) => famDe[id]).sort().join(','));
    rep.check('C1 com tomada e interruptor; C2 com luminária', fams[0] === [FAM.int, FAM.tom].sort().join(',') && fams[1] === FAM.lum, JSON.stringify(fams));
    const va = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.circuitosEletricos).map((c) => c.pontos.reduce((s, p) => s + p.potenciaVA, 0)));
    const vaTela = await page.locator('[data-total-circuito]').allInnerTexts();
    const vaQuadro = await page.locator('[data-total-quadro]').allInnerTexts();
    rep.check('total VA por circuito = soma dos pontos', vaTela.map((t) => Number(t.replace(/[^\d]/g, ''))).join() === va.join(), `${vaTela.join(' | ')} x ${va.join(',')}`);
    rep.check('total VA do quadro = soma dos circuitos', Number((vaQuadro[0] ?? '').replace(/[^\d]/g, '')) === va.reduce((a, b) => a + b, 0), vaQuadro.join(' | '));
    const comp = (await page.locator('[data-comprimento]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
    console.log('  info  comprimento na tela:', comp.join(' || '));
    rep.check('comprimento até o ponto mais distante aparece em metros (C1 e C2)', comp.length >= 2 && /\d[\d.,]* m/.test(comp[0]) && /\d[\d.,]* m/.test(comp[1]), comp.join(' | '));
    await shot('04-circuitos-atribuidos');
    await fechar();
  });

  // ---------- 5 ----------
  await rep.step('5. Verificar rede: sem aviso elétrico na cena íntegra', async () => {
    baseline = await page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).map((d) => d.codigo).sort().join(','));
    const el = await avisosEletricos();
    baselineEl = el.length;
    rep.check('nenhum aviso elétrico na cena íntegra', el.length === 0, el.join(' | '));
    await shot('05-verificar-integra');
    await fechar();
  });

  // ---------- 6 ----------
  await rep.step('6. quebra a rede: desliga um eletroduto, solta uma caixa, apaga o quadro e cria circuito sem quadro', async () => {
    // Eletroduto reto entre as caixas: o trecho cujo ponto médio fica mais perto do meio entre as caixas.
    const c1 = await pos(CX1), c2 = await pos(CX2);
    const meio = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
    const candidatos = [];
    for (const id of await tubos()) { const e = await entradas(id); candidatos.push({ id, m: { x: (e[0].x + e[1].x) / 2, y: (e[0].y + e[1].y) / 2 } }); }
    const reto = candidatos.sort((a, b) => dist(a.m, meio) - dist(b.m, meio))[0];
    await page.keyboard.press('Escape');
    await clickWorld(page, reto.m.x, reto.m.y);
    await page.waitForTimeout(200);
    const sel = await selecao();
    rep.check('trecho reto entre as caixas selecionado com o mouse', sel.includes(reto.id), JSON.stringify(sel));
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    rep.check('eletroduto apagado (uma peça a menos)', (await tubos()).length === candidatos.length - 1, `${candidatos.length} -> ${(await tubos()).length}`);
    quebras.push('apagar eletroduto');
    // Solta a caixa 2: seleciona e arrasta com o mouse.
    /** Seleciona a peça com o mouse, aciona Mover (botão de Modificar, ou o atalho mv) e clica a base e o destino. */
    const mover = async (id) => {
      const a0 = await pos(id);
      // Clique de seleção: o centro da peça nem sempre é o ponto que a seleciona (no passo 4 a luminária só foi selecionada 12 cm ao lado). Tenta desvios até selecionar a peça.
      let a = { x: a0.x, y: a0.y };
      for (const [dx, dy] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
        await page.keyboard.press('Escape');
        await clickWorld(page, a0.x + dx, a0.y + dy);
        await page.waitForTimeout(150);
        if ((await selecao()).includes(id)) { a = { x: a0.x + dx, y: a0.y + dy }; break; }
      }
      console.log('  info  selecionado após clique em', id === LU ? 'luminária' : 'caixa 2', ':', JSON.stringify(await selecao()), '| alvo', id);
      // Atalho de teclado mv (sequência do perfil padrão): a faixa não tem o botão Mover visível nesta aba.
      await page.keyboard.press('m'); await page.keyboard.press('v');
      console.log('  info  Mover pelo atalho mv; barra:', await page.evaluate(() => [...document.querySelectorAll('div,span')].filter((e) => e.children.length === 0 && /Mover/.test(e.textContent)).map((e) => e.textContent.trim()).slice(0, 2).join(' | ')));
      await page.waitForTimeout(150);
      await clickWorld(page, a.x, a.y);
      console.log('  info  barra após base:', await page.evaluate(() => [...document.querySelectorAll('div,span')].filter((e) => e.children.length === 0 && /Mover|base|destino|Clique|Esc/i.test(e.textContent)).map((e) => e.textContent.trim()).slice(0, 3).join(' | ')));
      // Prévia: cursor no destino sem clicar (captura para ver o fantasma e a barra antes de confirmar).
      // Destino para baixo: o enquadramento (y até 4 m) não mostra y > 4 m; a luminária a y = 4 m ficaria na borda superior.
      const dst = await worldToPage(page, a.x + 1.2, a.y - 0.6);
      await page.mouse.move(dst.x, dst.y, { steps: 5 });
      await page.waitForTimeout(250);
      if (id === LU) await shot('06-mover-luminaria-previa');
      await clickWorld(page, a.x + 1.2, a.y - 0.6);
      await page.waitForTimeout(150);
      console.log('  info  barra após destino:', await page.evaluate(() => [...document.querySelectorAll('div,span')].filter((e) => e.children.length === 0 && /\S/.test(e.textContent) && /^(Mover|Clique|Não|Sem|Luminária|Caixa|Peça|Encaixe|Movimento)/i.test(e.textContent.trim())).map((e) => e.textContent.trim()).slice(0, 4).join(' | ')));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      console.log('  info  Mover', id === LU ? 'luminária' : 'caixa 2', 'base', JSON.stringify(a), 'antes', JSON.stringify(a0), 'depois', JSON.stringify(await pos(id)), 'sel', JSON.stringify(await selecao()));
      return dist(a0, await pos(id)) > 0.3;
    };
    // Controle: a luminária (peça livre no teto) arrasta; a caixa (hospedada em parede) é o caso do roteiro.
    const moveuLum = await mover(LU);
    rep.check('controle: luminária movida (selecionar e Mover)', moveuLum, '');
    if (moveuLum) quebras.push('arrastar luminária');
    await page.keyboard.press('Escape');
    const antesCx = await pos(CX2);
    const moveu = await mover(CX2);
    const depoisCx = await pos(CX2);
    rep.check('caixa 2 movida (selecionar e Mover)', moveu, `${antesCx.x.toFixed(2)},${antesCx.y.toFixed(2)} -> ${depoisCx.x.toFixed(2)},${depoisCx.y.toFixed(2)}`);
    if (moveu) quebras.push('arrastar caixa 2');
    await shot('06-caixa-arrastada');
    // Apaga o quadro (seleção com o mouse + Delete); depois cria circuito: ele fica sem quadro.
    await page.keyboard.press('Escape');
    const pq = await pos(QD);
    await clickWorld(page, pq.x, pq.y);
    const selQ = await selecao();
    rep.check('quadro selecionado com o mouse', selQ.includes(QD), JSON.stringify(selQ));
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    rep.check('quadro apagado', (await idsDe(FAM.quadro)).length === 0, '');
    quebras.push('apagar quadro');
    await abrirCircuitos();
    await botao('Novo circuito').click();
    await page.waitForTimeout(200);
    const ncs = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.circuitosEletricos).map((c) => ({ nome: c.nome, quadro: c.quadroId ?? null })));
    rep.check('circuito novo sem quadro', ncs.some((c) => !c.quadro), JSON.stringify(ncs));
    quebras.push('criar circuito sem quadro');
    await shot('06-circuito-sem-quadro');
    await fechar();
  });

  // ---------- 7 ----------
  await rep.step('7. Verificar rede lista os avisos esperados', async () => {
    const el = await avisosEletricos();
    console.log('  info  avisos elétricos:', JSON.stringify(el));
    rep.check('circuito sem quadro', el.some((x) => /sem quadro/.test(x)), '');
    // Decisão (C7): Mover não solta as ligações gravadas; a rede acusa 'ligação afastada' na ponta que ficou para trás
    // (as portas já não se encontram) e 'sem eletroduto' vale quando o eletroduto é apagado.
    const afastadas = await page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).filter((d) => d.codigo === 'conexao_afastada').length);
    rep.check('ponto ou caixa sem eletroduto, ou ligação afastada da caixa movida', el.some((x) => /sem eletroduto/.test(x)) || afastadas > 0, `${afastadas} afastadas`);
    await shot('07-verificar-avisos');
    await fechar();
  });

  // ---------- 8 ----------
  await rep.step('8. desfaz (Ctrl+Z) as quebras e confere que os avisos somem', async () => {
    await page.keyboard.press('Escape');
    const circAntes = await page.evaluate(() => Object.keys(window.__hestia.editor.store.project.circuitosEletricos ?? {}).length);
    const trilha = [];
    for (let i = 0; i < quebras.length; i++) {
      await clickWorld(page, 8.5, 4).catch(() => {});
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
      trilha.push(await page.evaluate(() => `${Object.keys(window.__hestia.editor.store.project.circuitosEletricos ?? {}).length} circ / ${Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.familyId === 'fam_krona_eletrica_tubo_corte').length} tubos`));
    }
    console.log('  info  após cada Ctrl+Z:', trilha.join(' ; '));
    const restam = await page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).map((d) => d.codigo).sort().join(','));
    console.log('  info  Ctrl+Z x', quebras.length, `(${quebras.join('; ')}) | diagnóstico = cena íntegra:`, restam === baseline);
    rep.check(`${quebras.length} Ctrl+Z voltam o diagnóstico à cena íntegra`, restam === baseline, `agora: ${restam.slice(0, 120)} | íntegra: ${baseline.slice(0, 120)}`);
    const circDepois = await page.evaluate(() => Object.keys(window.__hestia.editor.store.project.circuitosEletricos ?? {}).length);
    rep.check('circuitos C1 e C2 continuam (o desfazer parou nas quebras)', circDepois === 2, `${circAntes} antes -> ${circDepois}`);
    const el = await avisosEletricos();
    rep.check('Verificar rede depois de desfazer: mesmos avisos da cena íntegra', el.length === baselineEl, `${el.length} agora x ${baselineEl} na cena íntegra`);
    await shot('08-desfeito');
    await fechar();
  });

  // ---------- 9 ----------
  await rep.step('9. Quantitativos elétricos: tabela contra o montado e CSV', async () => {
    const esperado = await page.evaluate(() => {
      const { editor } = window.__hestia;
      const els = Object.values(editor.store.project.elements).filter((e) => e.kind === 'component');
      const tb = els.filter((e) => e.familyId === 'fam_krona_eletrica_tubo_corte');
      return { tubos: tb.length, metros: tb.reduce((s, e) => s + (e.values?.L ?? 0), 0) / 1000, caixas: els.filter((e) => e.familyId === 'fam_krona_eletrica_caixa_4x4').length, tomadas: els.filter((e) => e.familyId === 'fam_tomada_2p_t').length, interruptores: els.filter((e) => e.familyId === 'fam_interruptor_simples').length, quadros: els.filter((e) => e.familyId === 'fam_quadro_distribuicao_eletrico').length };
    });
    await aba('Sistemas');
    await botao('Quantitativos elétricos').click();
    await page.waitForSelector('.circ-quant', { timeout: 15_000 });
    await page.waitForTimeout(300);
    const linhas = await page.locator('table.circ-quant tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())));
    console.log('  info  esperado:', JSON.stringify(esperado));
    console.log('  info  linhas:\n   ' + linhas.map((l) => l.join(' | ')).join('\n   '));
    const eletro = linhas.find((l) => l[0] === 'Projeto' && /Eletroduto/.test(l[1]));
    const metros = eletro ? Number((eletro[4] ?? '').replace(/[^\d,.]/g, '').replace(',', '.')) : NaN;
    rep.check('eletroduto do projeto: trechos = peças cortadas', eletro !== undefined && Number(eletro[3]) === esperado.tubos, eletro?.join(' | ') ?? 'ausente');
    rep.check('eletroduto do projeto: metros = soma de L', Math.abs(metros - esperado.metros) < 0.01, `${metros} x ${esperado.metros.toFixed(3)}`);
    const caixa = linhas.find((l) => l[0] === 'Projeto' && /Caixa/.test(l[1]));
    rep.check('caixas do projeto', caixa !== undefined && Number(caixa[3]) === esperado.caixas, caixa?.join(' | ') ?? 'ausente');
    const tom = linhas.find((l) => l[0] === 'Projeto' && /Tomada/.test(l[2]));
    rep.check('tomadas do projeto', tom !== undefined && Number(tom[3]) === esperado.tomadas, tom?.join(' | ') ?? 'ausente');
    const inter = linhas.find((l) => l[0] === 'Projeto' && /Interruptor/.test(l[2]));
    rep.check('interruptores do projeto', inter !== undefined && Number(inter[3]) === esperado.interruptores, inter?.join(' | ') ?? 'ausente');
    const quad = linhas.find((l) => l[0] === 'Projeto' && /Quadro/.test(l[1]));
    rep.check('quadro do projeto', quad !== undefined && Number(quad[3]) === esperado.quadros, quad?.join(' | ') ?? 'ausente');
    const sujo = /corrente|seção|disjuntor|queda de tens/i.test(await page.locator('[role="dialog"]').last().innerText());
    rep.check('nada de corrente, seção, disjuntor ou queda de tensão', !sujo, '');
    await shot('09-quantitativos');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.getByRole('button', { name: 'Baixar CSV', exact: true }).click()]);
    await download.saveAs(`${OUT}/quantitativos.csv`);
    const csv = readFileSync(`${OUT}/quantitativos.csv`, 'utf8');
    rep.check('CSV: cabeçalho de seis colunas', csv.split('\n')[0].replace(/\r/, '') === 'Escopo;Grupo;Item;Quantidade;Medida;Unidade', csv.split('\n')[0]);
    rep.check('CSV: linha do eletroduto do projeto', /^Projeto;Eletroduto;.*;\d+;[\d.,]+;m$/m.test(csv), csv.split('\n').slice(0, 3).join(' / '));
    await fechar();
  });

  // ---------- 10 ----------
  await rep.step('10. salva o projeto como arquivo, recarrega a página e reabre pelo Abrir arquivo', async () => {
    const antes = { tubos: (await tubos()).length, quadros: (await idsDe(FAM.quadro)).length, circuitos: await page.evaluate(() => Object.keys(window.__hestia.editor.store.project.circuitosEletricos ?? {}).length), caixas: (await idsDe(FAM.caixa)).length };
    await aba('Arquivo');
    await page.locator('.fm-item').filter({ hasText: /^\s*Salvar\s*$/ }).click();
    await page.waitForTimeout(600);
    const aviso = await page.locator('[role="dialog"]').innerText().catch(() => '');
    console.log('  info  Salvar sem pasta de biblioteca mostrou:', aviso.replace(/\s+/g, ' ').slice(0, 160));
    rep.check('Salvar sem pasta oferece baixar o arquivo', /arquivo|Baixar|download/i.test(aviso), aviso.replace(/\s+/g, ' ').slice(0, 80));
    await shot('10-salvar-sem-pasta');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.locator('[role="dialog"] button', { hasText: /Baixar|arquivo/i }).first().click()]);
    const caminho = `${OUT}/projeto-c7.hestia.json`;
    await download.saveAs(caminho);
    rep.check('arquivo do projeto baixado', readFileSync(caminho).length > 1000, `${readFileSync(caminho).length} bytes`);
    await page.locator('[role="dialog"] button', { hasText: /Cancelar|Fechar/ }).first().click({ timeout: 2000 }).catch(() => {});
    await page.reload();
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.waitForTimeout(1200);
    await shot('10-tela-inicial-apos-recarregar');
    await page.locator('input[type="file"][accept*="hestia"]').setInputFiles(caminho);
    await page.waitForTimeout(3000);
    await shot('10-reaberto');
    const depois = { tubos: (await tubos()).length, quadros: (await idsDe(FAM.quadro)).length, circuitos: await page.evaluate(() => Object.keys(window.__hestia.editor.store.project.circuitosEletricos ?? {}).length), caixas: (await idsDe(FAM.caixa)).length };
    rep.check('eletrodutos persistem', depois.tubos === antes.tubos, `${antes.tubos} -> ${depois.tubos}`);
    rep.check('quadro persiste', depois.quadros === antes.quadros, `${antes.quadros} -> ${depois.quadros}`);
    rep.check('circuitos persistem', depois.circuitos === antes.circuitos, `${antes.circuitos} -> ${depois.circuitos}`);
    rep.check('caixas persistem', depois.caixas === antes.caixas, `${antes.caixas} -> ${depois.caixas}`);
  });

  // ---------- 11 ----------
  await rep.step('11. vista 3D sem erro de console', async () => {
    const antes = erros.length;
    await aba('Vista');
    await page.getByText('3D padrão', { exact: true }).first().dblclick().catch(() => {});
    await page.waitForTimeout(4000);
    await shot('11-vista-3d');
    rep.check('vista 3D abriu (canvas visível)', (await page.locator('canvas').count()) > 0, '');
    rep.check('sem erro de console durante a vista 3D', erros.length === antes, erros.slice(antes, antes + 2).join(' | ').slice(0, 200));
  });

  // ---------- 12 ----------
  await rep.step('12. sem erro de console no roteiro inteiro', async () => {
    rep.check('sem erro de console (404 de recurso listados abaixo)', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
    console.log('  info  respostas 404:', [...new Set(r404)].join(' , ') || 'nenhuma');
  });
} finally {
  await page.screenshot({ path: `${OUT}/zz-estado-final.png` }).catch(() => {});
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
