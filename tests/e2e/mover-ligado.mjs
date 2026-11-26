// Mover com as peças ligadas acompanhando (fase 4, ficha F4), em Chrome real, como um usuário.
// Hidráulica: esgoto Krona DN 100 em U (tubo, joelho, tubo, joelho, tubo): mover o tubo do meio pelo corpo (os joelhos vêm junto e os
// vizinhos esticam), mover um joelho (o ângulo que não tem peça solta a ligação com alerta), prévia vermelha no bloqueio (trecho acima
// de 6000 mm). Elétrica: caixa, eletroduto, tomada: mover a caixa pelo eixo (o eletroduto estica) e a tomada em z.
// Traçado e movimentos só pelo mouse e teclado; atalhos de programa, anotados onde aparecem: enquadramento da vista (setViewport),
// leitura do estado do projeto (store/engine) para conferir o resultado e para mirar o mouse, e UMA chamada ao planejador do motor
// (`planejarMovimentoLigado`) aplicada numa transação para o movimento em z (a ferramenta Mover é de planta e não tem campo de cota).
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5227/?debug=1' node tests/e2e/mover-ligado.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5227/?debug=1';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/-home-user-Hestia/e0b36f0f-5cd5-5bfc-b964-572e233c1fd8/scratchpad/mover-ligado';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const shot = (nome) => page.screenshot({ path: `${OUT}/${nome}.png` });
const info = (msg) => console.log(`  info  ${msg}`);

const ESG = 'fam_krona_esgoto_tubo_corte';
const JOE = 'fam_krona_esgoto_joelho90';
const FAM_E = { tubo: 'fam_krona_eletrica_tubo_corte', caixa: 'fam_krona_eletrica_caixa_4x4', tom: 'fam_tomada_2p_t' };
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, DN: e.values?.DN, L: e.values?.L, x: e.x, y: e.y, z: e.z, lig: Object.values(e.ligacoes ?? {}).map((l) => l.componenteId) })));
const porFam = async (f) => (await comps()).filter((c) => c.f === f);
const snapshot = () => page.evaluate(() => JSON.stringify(window.__hestia.editor.store.project.elements));
const perto = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
const status = () => page.evaluate(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); });
const selecao = () => page.evaluate(() => window.__hestia.useUi.getState().selection);
const vista = (cx, cy, zoom = 130) => page.evaluate(([cx, cy, zoom]) => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), cx, cy, zoom }); }, [cx, cy, zoom]);
const aba = async (nome) => { await page.locator('.ribbon-tabs .rtab:visible', { hasText: new RegExp(`^${nome}$`) }).first().click(); await page.waitForTimeout(150); };
const botao = (nome) => page.getByRole('button', { name: nome, exact: true }).first();
/** Diagnóstico da rede do projeto, lido do motor: códigos que interessam à ficha. */
const rede = () => page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).filter((d) => ['conexao_afastada', 'incompativel', 'conexoes_coladas', 'conexao_invalida', 'ligacao_aberta', 'curvatura_fechada'].includes(d.codigo)).map((d) => `${d.codigo}:${d.elementId}.${d.ligacaoId ?? ''}`));
const semAfastada = (lista) => !lista.some((x) => /^(conexao_afastada|incompativel|conexoes_coladas|conexao_invalida)/.test(x));
/** Passo de desfazer: clica num ponto vazio para o foco ir à planta e aperta Ctrl+Z. */
const desfazer = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Control+z'); await page.waitForTimeout(500); };
/** O alerta modal (ligação desfeita) fecha com Esc; devolve o texto, ou '' se não apareceu. */
async function fechaAlerta() {
  const dlg = page.locator('[role="dialog"]').last();
  const texto = (await dlg.isVisible().catch(() => false)) ? (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : '';
  if (texto) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  return texto;
}
/** Seleciona `id` pelo mouse (tenta desvios ao redor do ponto); sem sucesso, seleciona pelo estado (atalho de programa, anotado). */
async function seleciona(id, x, y) {
  for (const [dx, dy] of [[0, 0], [0.055, 0.03], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04], [0.1, 0], [-0.1, 0], [0.2, 0], [0, 0.1]]) {
    await page.keyboard.press('Escape');
    await clickWorld(page, x + dx, y + dy);
    await page.waitForTimeout(150);
    const s = await selecao();
    if (s.length === 1 && s[0] === id) return 'mouse';
  }
  await page.evaluate((id) => window.__hestia.useUi.setState({ selection: [id] }), id);
  await page.waitForTimeout(150);
  return 'atalho de programa (setSelection)';
}
/** Aciona Mover pelo atalho mv, clica a base, mostra a prévia no destino (captura) e clica o destino. */
async function mover(base, destino, { alt = false, capturaPrevia = null, teclasAntes = null } = {}) {
  await page.keyboard.press('m'); await page.keyboard.press('v');
  await page.waitForTimeout(150);
  await clickWorld(page, base.x, base.y);
  const dst = await worldToPage(page, destino.x, destino.y);
  await page.mouse.move(dst.x, dst.y, { steps: 6 });
  await page.waitForTimeout(300);
  if (capturaPrevia) await shot(capturaPrevia);
  const falaPrevia = await status();
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.click(dst.x, dst.y);
  if (alt) await page.keyboard.up('Alt');
  await page.waitForTimeout(400);
  return falaPrevia;
}

try {
  await rep.step('1. Esgoto Krona DN 100 em U: tubo, joelho, tubo, joelho, tubo', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await aba('Sistemas');
    await botao('Tubo').click();
    await page.waitForSelector('#place-tubo-familia', { timeout: 15_000 });
    await page.locator('#place-tubo-familia').selectOption(ESG);
    await page.waitForTimeout(200);
    await page.locator('#place-tubo-dn').selectOption('100');
    await page.waitForTimeout(200);
    await vista(1.5, 0.6);
    for (const [x, y] of [[0, 0], [1, 0], [1, 1], [2.2, 1]]) await clickWorld(page, x, y);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const tubos = await porFam(ESG);
    const joelhos = await porFam(JOE);
    rep.check('3 trechos DN 100 e 2 joelhos', tubos.length === 3 && joelhos.length === 2 && tubos.every((t) => t.DN === 100), `${tubos.length} trechos, ${joelhos.length} joelhos`);
    const r = await rede();
    info(`rede antes: ${r.join(' | ')}`);
    rep.check('rede íntegra antes de mover (só pontas abertas)', semAfastada(r), r.join(' | '));
    await shot('01-U-antes');
  });

  const base0 = { snap: '' };
  await rep.step('2. Mover o tubo do meio pelo corpo: os joelhos vêm junto, os vizinhos esticam, rede sem afastada, um Ctrl+Z', async () => {
    const tubos = await porFam(ESG);
    const meio = tubos.find((t) => perto(t.x, 1, 0.2) && Math.abs(Number(t.L) - 1000) < 400 && t.y > 0.0 && t.y < 0.5);
    const antes = Object.fromEntries(tubos.map((t) => [t.id, t]));
    base0.snap = await snapshot();
    // O trecho do meio sobe de y = 0 a y = 1 em x = 1: clique no meio dele.
    const como = await seleciona(meio?.id ?? '', 1, 0.5);
    info(`seleção do tubo do meio por: ${como}; id ${meio?.id}`);
    rep.check('tubo do meio selecionado', (await selecao()).includes(meio?.id), JSON.stringify(await selecao()));
    const fala = await mover({ x: 1, y: 0.5 }, { x: 1.5, y: 0.5 }, { capturaPrevia: '02-mover-tubo-previa' });
    info(`barra na prévia: ${fala.slice(0, 160)}`);
    const depois = await comps();
    const get = (id) => depois.find((c) => c.id === id);
    const tubosD = depois.filter((c) => c.f === ESG);
    const a = tubosD.find((t) => antes[t.id] && perto(antes[t.id].x, 0, 0.2) && antes[t.id].y < 0.2);
    const c = tubosD.find((t) => antes[t.id] && antes[t.id].x > 1.05);
    info(`L antes/depois do 1º trecho: ${a ? `${Number(antes[a.id].L).toFixed(0)} -> ${Number(a.L).toFixed(0)}` : '?'}; do 3º: ${c ? `${Number(antes[c.id].L).toFixed(0)} -> ${Number(c.L).toFixed(0)}` : '?'}`);
    rep.check('o tubo do meio andou 0,5 m em x', !!meio && perto(get(meio.id).x, antes[meio.id].x + 0.5), `${antes[meio?.id]?.x} -> ${get(meio?.id)?.x}`);
    rep.check('o primeiro trecho esticou cerca de 500 mm', !!a && Math.abs(Number(a.L) - Number(antes[a.id].L) - 500) < 5, a ? `${Number(a.L) - Number(antes[a.id].L)}` : '');
    rep.check('o terceiro trecho encurtou cerca de 500 mm', !!c && Math.abs(Number(antes[c.id].L) - Number(c.L) - 500) < 5, c ? `${Number(antes[c.id].L) - Number(c.L)}` : '');
    const joelhos = depois.filter((x) => x.f === JOE);
    rep.check('os dois joelhos vieram junto (x = 1,5)', joelhos.length === 2 && joelhos.every((j) => perto(j.x, 1.5)), joelhos.map((j) => j.x.toFixed(2)).join(','));
    const r = await rede();
    info(`rede depois: ${r.join(' | ')}`);
    rep.check('rede sem ligação afastada, incompatível nem colada', semAfastada(r), r.join(' | '));
    rep.check('nenhuma ligação desfeita (nenhum alerta)', (await fechaAlerta()) === '');
    await shot('02-mover-tubo-depois');
    await desfazer();
    rep.check('um Ctrl+Z volta o projeto inteiro', (await snapshot()) === base0.snap);
    await shot('02-mover-tubo-desfeito');
  });

  await rep.step('3. Mover um joelho: o tubo que entortaria além do aceitável solta do joelho com alerta; um Ctrl+Z devolve tudo', async () => {
    const [j1] = (await porFam(JOE)).sort((p, q) => p.y - q.y);
    base0.snap = await snapshot();
    const como = await seleciona(j1.id, j1.x, j1.y);
    info(`seleção do joelho por: ${como}; id ${j1.id} em (${j1.x.toFixed(2)}, ${j1.y.toFixed(2)})`);
    rep.check('joelho selecionado', (await selecao()).includes(j1.id), JSON.stringify(await selecao()));
    await mover({ x: j1.x, y: j1.y }, { x: j1.x + 0.5, y: j1.y }, { capturaPrevia: '03-mover-joelho-previa' });
    const texto = await fechaAlerta();
    info(`alerta: ${texto.slice(0, 260)}`);
    rep.check('apareceu o alerta de ligação desfeita', /desfeita/.test(texto), texto.slice(0, 120));
    const depois = (await comps()).find((c) => c.id === j1.id);
    rep.check('o joelho andou 0,5 m', perto(depois.x, j1.x + 0.5), `${j1.x} -> ${depois.x}`);
    const r = await rede();
    info(`rede depois: ${r.join(' | ')}`);
    rep.check('rede sem ligação afastada (a ligação desfeita virou ponta aberta, avisada)', semAfastada(r), r.join(' | '));
    rep.check('uma ligação a menos no joelho', depois.lig.length === 1, `${depois.lig.length} ligações`);
    await shot('03-mover-joelho-depois');
    await desfazer();
    rep.check('um Ctrl+Z volta o projeto inteiro (inclusive a ligação desfeita)', (await snapshot()) === base0.snap);
  });

  await rep.step('4. Trecho acima de 6000 mm: prévia vermelha com o motivo e nada é gravado', async () => {
    const tubos = await porFam(ESG);
    const meio = tubos.find((t) => perto(t.x, 1, 0.2) && t.y > 0.0 && t.y < 0.5);
    base0.snap = await snapshot();
    await vista(4, 0.6, 70);
    await seleciona(meio.id, 1, 0.5);
    await page.keyboard.press('m'); await page.keyboard.press('v');
    await clickWorld(page, 1, 0.5);
    const dst = await worldToPage(page, 8, 0.5);
    await page.mouse.move(dst.x, dst.y, { steps: 6 });
    await page.waitForTimeout(400);
    const fala = await status();
    info(`barra: ${fala.slice(0, 200)}`);
    rep.check('a barra diz "Bloqueado" com o motivo do comprimento máximo', /Bloqueado/.test(fala) && /comprimento máximo/.test(fala), fala.slice(0, 160));
    await shot('04-bloqueado-previa-vermelha');
    await page.mouse.click(dst.x, dst.y);
    await page.waitForTimeout(300);
    rep.check('o clique não gravou nada', (await snapshot()) === base0.snap);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await vista(1.5, 0.6);
  });

  // ---------- elétrica ----------
  let CX1, TM;
  const entradas = (id) => page.evaluate((id) => {
    const { engine, editor } = window.__hestia;
    const p = editor.store.project;
    const c = p.elements[id];
    return engine.resolverComponente(p, c).ligacoes.filter((l) => l.dominio === 'eletroduto').map((l) => {
      const m = engine.ligacaoNoMundo(l, c);
      return { nome: l.id, x: m.posicaoMundo[0], y: m.posicaoMundo[1], z: m.posicaoMundo[2], dir: [...m.direcaoMundo] };
    });
  }, id);
  await rep.step('5. Elétrica: caixa, eletroduto e tomada pela Biblioteca e pela ferramenta Eletroduto', async () => {
    await page.keyboard.press('Escape');
    // Projeto limpo para a parte elétrica: desfaz tudo o que a hidráulica criou, em um Ctrl+Z por passo (atalho de programa: limpa o estado).
    await page.evaluate(() => { const { editor } = window.__hestia; while (editor.store.canUndo) editor.store.undo(); });
    await page.waitForTimeout(300);
    await vista(2.5, 0.6, 110);
    await botao('Dispositivos elétricos').click();
    await page.waitForSelector('.pal-janela', { timeout: 15_000 });
    // Disciplina da vista = Elétrico (propriedade da vista, no painel; sem isso os componentes elétricos ficam em meio-tom).
    const disc = page.locator('select').filter({ has: page.locator('option', { hasText: 'Hidrossanitário' }) }).first();
    await disc.selectOption('Elétrico').catch((e) => info(`disciplina: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(300);
    const colocar = async (busca, cartao, x, y) => {
      const antes = (await comps()).map((c) => c.id);
      await page.locator('.pal-busca').fill(busca);
      await page.waitForTimeout(250);
      await page.locator('.pal-movel', { hasText: cartao }).first().click();
      await page.waitForTimeout(200);
      await clickWorld(page, x, y);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      return (await comps()).map((c) => c.id).filter((id) => !antes.includes(id));
    };
    [CX1] = await colocar('Caixa de luz 4', /série 2/, 0.5, 0.5);
    [TM] = await colocar('Tomada', 'Tomada 2P+T', 4, 0.4985);
    rep.check('uma caixa e uma tomada colocadas', !!CX1 && !!TM, `${CX1} ${TM}`);
    await page.locator('.pal-fechar').click().catch(() => {});
    const portaCx = async () => (await entradas(CX1)).filter((e) => e.dir[0] > 0.9).sort((p, q) => p.z - q.z)[0];
    const eTm = (await entradas(TM)).filter((e) => e.dir[0] < -0.9)[0] ?? (await entradas(TM))[0];
    // Atalho de programa: a cota (z) da caixa, o mesmo campo do painel de propriedades, para a porta da caixa ficar na altura da porta da tomada
    // (assim o eletroduto sai reto, sem prumada: o caso de um trecho único).
    const zc = (await portaCx()).z;
    await page.evaluate(([id, dz]) => { const { editor } = window.__hestia; const c = editor.store.project.elements[id]; editor.store.exec({ type: 'updateComponent', id, patch: { z: c.z + dz } }); }, [CX1, eTm.z - zc]);
    const eCx = await portaCx();
    info(`entradas: caixa ${JSON.stringify(eCx)} tomada ${JSON.stringify(eTm)}`);
    await botao('Eletroduto').click();
    await page.waitForSelector('#place-tubo-dn', { timeout: 15_000 });
    await page.locator('#place-tubo-dn').selectOption('20');
    await page.locator('#place-tubo-z').fill(String(eCx.z));
    await page.locator('#place-tubo-z').press('Enter');
    await clickWorld(page, eCx.x, eCx.y);
    await page.locator('#place-tubo-z').fill(String(eTm.z));
    await page.locator('#place-tubo-z').press('Enter');
    await clickWorld(page, eTm.x, eTm.y);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const t = await porFam(FAM_E.tubo);
    info(`eletrodutos: ${t.length} (L ${t.map((x) => Number(x.L).toFixed(0)).join(', ')})`);
    rep.check('há eletroduto ligando a caixa à tomada', t.length >= 1 && t.some((x) => x.lig.includes(CX1)) && t.some((x) => x.lig.includes(TM)), `${t.length} trechos`);
    const r = await rede();
    rep.check('rede íntegra antes de mover', semAfastada(r), r.join(' | '));
    await shot('05-eletrico-antes');
  });

  await rep.step('6. Elétrica: mover a caixa ao longo do eletroduto estica o tubo; um Ctrl+Z', async () => {
    const p = (await comps()).find((c) => c.id === CX1);
    const tubo = (await porFam(FAM_E.tubo)).find((x) => x.lig.includes(CX1));
    base0.snap = await snapshot();
    const como = await seleciona(CX1, p.x, p.y);
    info(`seleção da caixa por: ${como}; em (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    rep.check('caixa selecionada', (await selecao()).includes(CX1), JSON.stringify(await selecao()));
    await mover({ x: p.x, y: p.y }, { x: p.x - 0.5, y: p.y }, { capturaPrevia: '06-mover-caixa-previa' });
    const texto = await fechaAlerta();
    const p2 = (await comps()).find((c) => c.id === CX1);
    const t2 = (await comps()).find((c) => c.id === tubo.id);
    info(`caixa x ${p.x.toFixed(2)} -> ${p2.x.toFixed(2)}; tubo L ${Number(tubo.L).toFixed(0)} -> ${Number(t2.L).toFixed(0)}; alerta: ${texto.slice(0, 120)}`);
    rep.check('a caixa andou 0,5 m', perto(p2.x, p.x - 0.5), `${p.x} -> ${p2.x}`);
    rep.check('o eletroduto esticou cerca de 500 mm', Math.abs(Number(t2.L) - Number(tubo.L) - 500) < 8, `${Number(t2.L) - Number(tubo.L)}`);
    rep.check('a caixa continua ligada ao eletroduto', t2.lig.includes(CX1) && p2.lig.includes(tubo.id), '');
    const r = await rede();
    rep.check('rede sem ligação afastada', semAfastada(r), r.join(' | '));
    await shot('06-mover-caixa-depois');
    await desfazer();
    rep.check('um Ctrl+Z volta o projeto inteiro', (await snapshot()) === base0.snap);
  });

  await rep.step('7. Elétrica: mover a tomada em z (planejador do motor aplicado numa transação): o tubo reto horizontal não vira inclinado, a ligação é desfeita com alerta; um Ctrl+Z', async () => {
    base0.snap = await snapshot();
    const res = await page.evaluate((id) => {
      const { engine, editor } = window.__hestia;
      const plano = engine.planejarMovimentoLigado(editor.store.project, [id], [0, 0, 0.3]);
      editor.store.transaction('Mover em z', () => { for (const c of plano.comandos) editor.store.exec(c); });
      return { alertas: plano.alertas.map((a) => a.motivo), desfeitas: plano.desfeitas.length, bloqueado: plano.bloqueado ?? null };
    }, TM);
    info(`plano em z: ${JSON.stringify(res).slice(0, 360)}`);
    const t = (await comps()).find((c) => c.id === TM);
    rep.check('a tomada subiu 0,3 m', t.z > 0.29, `z = ${t.z}`);
    rep.check('uma ligação desfeita, com o alerta da prumada (declividade 0 não vira inclinado)', res.desfeitas === 1 && res.alertas.some((a) => /declividade 0/.test(a) && /prumada/.test(a)), JSON.stringify(res.alertas).slice(0, 200));
    const r = await rede();
    info(`rede: ${r.join(' | ')}`);
    rep.check('rede sem ligação afastada nem incompatível', semAfastada(r), r.join(' | '));
    await shot('07-tomada-em-z');
    await desfazer();
    rep.check('um Ctrl+Z volta o projeto inteiro', (await snapshot()) === base0.snap);
  });

  await rep.step('8. Alt solta as ligações: a caixa anda e o tubo fica para trás (a rede acusa afastada, como antes)', async () => {
    const p = (await comps()).find((c) => c.id === CX1);
    const tubo = (await porFam(FAM_E.tubo)).find((x) => x.lig.includes(CX1));
    base0.snap = await snapshot();
    await seleciona(CX1, p.x, p.y);
    await mover({ x: p.x, y: p.y }, { x: p.x - 0.5, y: p.y }, { alt: true });
    await fechaAlerta();
    const t2 = (await comps()).find((c) => c.id === tubo.id);
    rep.check('o tubo não esticou (mesmo L)', Math.abs(Number(t2.L) - Number(tubo.L)) < 0.5, `${tubo.L} -> ${t2.L}`);
    const r = await rede();
    rep.check('a rede acusa ligação afastada', r.some((x) => x.startsWith('conexao_afastada')), r.join(' | '));
    await desfazer();
  });

  rep.check('sem erros no console do navegador', erros.length === 0, erros.slice(0, 2).join(' | '));
} finally {
  rep.summary();
  await browser.close();
  process.exit(rep.steps.some((s) => s.status !== 'PASS') ? 1 : 0);
}
