// Desenhar a partir do MEIO de um tubo e fechar em outro tubo ou porta (fase 4, ficha F5), em Chrome real.
// Esgoto Krona: traça um tubo reto DN 100, passa o mouse no meio (halo e rótulo 'Derivar aqui'), clica ali e traça um ramal DN 75 em
// OUTRA cota até um alvo (prévia mostra a rota inteira); confere tê, tubo curto, redução, rota vertical + horizontal, rede sem
// avisos de geometria (a excêntrica 100 x 75 tem a pendência B6 de 13 mm, registrada) e UM Ctrl+Z. Depois alvo no meio de outro
// tubo, 'Criar tubo a partir daqui' pelo menu de contexto e o elétrico (eletroduto rígido sem tê: bloqueia e sugere caixa; caixa como
// alvo com rota em outra cota). Traçado só pelo mouse e pelos campos do painel; atalhos de programa, anotados onde aparecem:
// enquadramento da vista (setViewport) e leitura do estado do projeto e das portas (store e motor) só para conferir e mirar.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5228/?debug=1' node tests/e2e/derivar-meio.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5228/?debug=1';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/-home-user-Hestia/e0b36f0f-5cd5-5bfc-b964-572e233c1fd8/scratchpad/derivar-meio';
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
const TE = 'fam_krona_esgoto_te';
const JOE = 'fam_krona_esgoto_joelho90';
const RED = 'fam_krona_esgoto_reducao_excentrica';
const ETUBO = 'fam_krona_eletrica_tubo_corte';
const CAIXA = 'fam_krona_eletrica_caixa_4x4';
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, DN: e.values?.DN, L: e.values?.L, x: e.x, y: e.y, z: e.z, lig: Object.values(e.ligacoes ?? {}).map((l) => l.componenteId) })));
const extremos = (id) => page.evaluate((id) => {
  const { engine, editor } = window.__hestia;
  const p = editor.store.project;
  const c = p.elements[id];
  const l = [...engine.resolverComponente(p, c).ligacoes].sort((a, b) => a.posicao[2] - b.posicao[2]);
  const a = engine.ligacaoNoMundo(l[0], c).posicaoMundo;
  const b = engine.ligacaoNoMundo(l[l.length - 1], c).posicaoMundo;
  return { a: [...a], b: [...b] };
}, id);
const eixoDe = (e) => { const d = [0, 1, 2].map((k) => Math.abs(e.b[k] - e.a[k])); return d[2] > d[0] && d[2] > d[1] ? 'z' : d[0] >= d[1] ? 'x' : 'y'; };
const snapshot = () => page.evaluate(() => JSON.stringify(window.__hestia.editor.store.project.elements));
const rede = () => page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).filter((d) => ['conexao_afastada', 'incompativel', 'ligacao_incompativel', 'conexoes_coladas', 'conexao_invalida'].includes(d.codigo)).map((d) => ({ codigo: d.codigo, valor: d.valor ?? null })));
const status = () => page.evaluate(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); });
const previa = () => page.evaluate(() => window.__hestia.editor.activeTool.preview().map((i) => ({ k: i.kind, t: i.text ?? null, tom: i.tone ?? null, tr: i.dashed === true })));
const vista = (cx, cy, zoom) => page.evaluate(([cx, cy, zoom]) => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), cx, cy, zoom }); }, [cx, cy, zoom]);
const aba = async (nome) => { await page.locator('.ribbon-tabs .rtab:visible', { hasText: new RegExp(`^${nome}$`) }).first().click(); await page.waitForTimeout(150); };
const botao = (nome, indice = 0) => page.getByRole('button', { name: nome, exact: true }).nth(indice);
const cota = async (z) => { await page.locator('#place-tubo-z').fill(String(z)); await page.locator('#place-tubo-z').press('Enter'); await page.waitForTimeout(120); };
const dn = async (v) => { await page.locator('#place-tubo-dn').selectOption(String(v)); await page.waitForTimeout(150); };
const mover = async (x, y) => { const p = await worldToPage(page, x, y); await page.mouse.move(p.x, p.y, { steps: 4 }); await page.waitForTimeout(150); return p; };
const ferramentaAtiva = () => page.evaluate(() => window.__hestia.useUi.getState().tool);
/** Ativa a ferramenta (nunca com Esc ocioso: o segundo Esc sai dela) e põe família, DN e cota no painel. */
const ativar = async (ferramenta, familia, dnInicial, z) => {
  if ((await ferramentaAtiva()) !== ferramenta.toLowerCase()) { await page.keyboard.press('Escape'); await botao(ferramenta).click(); }
  await page.waitForSelector('#place-tubo-dn', { timeout: 15_000 });
  await page.locator('#place-tubo-familia').selectOption(familia);
  await dn(dnInicial);
  await cota(z);
};
const fecharBiblioteca = async () => { if (await page.locator('.pal-janela').isVisible().catch(() => false)) await page.locator('.pal-fechar').click(); };

try {
  await rep.step('1. esgoto Krona: tubo reto DN 100 em z = 0,5, de (0; 0) a (4; 0)', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await aba('Sistemas');
    await ativar('Tubo', ESG, 100, 0.5);
    await vista(2, 1.2, 150);
    await clickWorld(page, 0, 0);
    await clickWorld(page, 4, 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const t = (await comps()).filter((c) => c.f === ESG);
    rep.check('1 tubo DN 100', t.length === 1 && t[0].DN === 100, `${t.length}`);
    await shot('01-tubo-reto');
  });

  await rep.step('2. o mouse no MEIO do tubo mostra o halo e o rótulo "Derivar aqui" (cota do cursor diferente da do tubo)', async () => {
    await cota(0);
    await mover(2, 0.03);
    const pv = await previa();
    const rotulos = pv.filter((i) => i.k === 'label').map((i) => i.t);
    rep.check('rótulo "Derivar aqui (DN 100)"', rotulos.some((x) => /^Derivar aqui/.test(x ?? '')), rotulos.join(' | '));
    rep.check('halo (anéis) do snap', pv.filter((i) => i.k === 'polygon').length >= 2, `${pv.filter((i) => i.k === 'polygon').length} anéis`);
    await shot('02-halo-derivar-aqui');
  });

  const antes = { snap: '' };
  await rep.step('3. clica no meio, muda para DN 75 e z = 1,5 e a prévia mostra a ROTA inteira até o alvo; clica o alvo', async () => {
    await cota(0.5);
    antes.snap = await snapshot();
    await clickWorld(page, 2, 0);
    await dn(75);
    await cota(1.5);
    await mover(3, 1.2);
    const pv = await previa();
    const tracejados = pv.filter((i) => i.k === 'line' && i.tr).length;
    rep.check('prévia com a rota inteira em fantasma: tubo curto DN 100 + 3 trechos (sobe, anda em y, anda em x)', tracejados === 4, `${tracejados} tracejados; rótulos: ${pv.filter((i) => i.k === 'label').map((i) => i.t).join(' | ').slice(0, 160)}`);
    rep.check('prévia sem vermelho (rota viável)', !pv.some((i) => i.tom === 'invalid'), '');
    await shot('03-previa-da-rota');
    await clickWorld(page, 3, 1.2);
    await page.waitForTimeout(400);
    info(`status: ${(await status()).slice(0, 200)}`);
    await shot('04-ramal-criado');
  });

  await rep.step('4. confere a rede: tê, tubo curto DN 100, redução, vertical + horizontais, joelhos', async () => {
    const c = await comps();
    const tubos = c.filter((x) => x.f === ESG);
    const te = c.find((x) => x.f === TE);
    const red = c.find((x) => x.f === RED);
    rep.check('1 tê', c.filter((x) => x.f === TE).length === 1, '');
    rep.check('1 redução 100 x 75', c.filter((x) => x.f === RED).length === 1, '');
    rep.check('2 joelhos 90° (a rota tem 3 trechos)', c.filter((x) => x.f === JOE).length === 2, `${c.filter((x) => x.f === JOE).length}`);
    const curto = tubos.find((x) => x.DN === 100 && red && x.lig.includes(red.id) && te && x.lig.includes(te.id));
    rep.check('tubo curto DN 100 entre o tê e a redução (nunca peça com peça)', !!curto, curto ? `L ${Number(curto.L).toFixed(1)} mm` : '');
    rep.check('o tubo curto tem pelo menos 10 mm', !!curto && Number(curto.L) >= 10 - 1e-6, curto ? Number(curto.L).toFixed(2) : '');
    rep.check('a redução não está ligada direto ao tê', !!te && !!red && !te.lig.includes(red.id), '');
    const dns = tubos.map((x) => x.DN).sort((a, b) => a - b).join(',');
    rep.check('tubos: 2 metades DN 100 + tubo curto DN 100 + 3 do ramal DN 75', dns === '75,75,75,100,100,100', dns);
    const eixos = [];
    for (const t of tubos.filter((x) => x.DN === 75)) eixos.push(eixoDe(await extremos(t.id)));
    rep.check('ramal: um trecho vertical e dois horizontais (y e x)', eixos.sort().join(',') === 'x,y,z', eixos.join(','));
    const r = await rede();
    const sobra = r.filter((d) => !(d.codigo === 'conexao_afastada' && d.valor !== null && Math.abs(d.valor - 13.07) < 0.2));
    rep.check('rede sem avisos de geometria (afastada, incompatível, coladas), exceto a pendência B6 da excêntrica (13,07 mm)', sobra.length === 0, JSON.stringify(r));
    await shot('05-rede-esgoto');
  });

  await rep.step('5. um Ctrl+Z desfaz a derivação inteira (divisão, tê, tubo curto, redução, ramal)', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const igual = (await snapshot()) === antes.snap;
    rep.check('estado igual ao de antes do clique no meio', igual, igual ? '' : 'estado difere');
    await shot('06-desfeito');
  });

  await rep.step('6. alvo no MEIO de outro tubo: segundo tubo DN 100 em z = 1,5; do meio de um ao meio do outro', async () => {
    await ativar('Tubo', ESG, 100, 1.5);
    await clickWorld(page, 0, 3);
    await clickWorld(page, 4, 3);
    await page.keyboard.press('Escape');
    await cota(0.5);
    await clickWorld(page, 2, 0);
    await cota(1.5);
    await mover(2, 3);
    const pv = await previa();
    rep.check('prévia viável (sem vermelho) até o meio do outro tubo', !pv.some((i) => i.tom === 'invalid') && pv.some((i) => i.k === 'label' && /^Derivar aqui/.test(i.t ?? '')), pv.filter((i) => i.k === 'label').map((i) => i.t).join(' | ').slice(0, 160));
    await shot('07-alvo-no-meio-previa');
    await clickWorld(page, 2, 3);
    await page.waitForTimeout(400);
    const c = await comps();
    rep.check('2 tês (um em cada tubo) e 1 joelho', c.filter((x) => x.f === TE).length === 2 && c.filter((x) => x.f === JOE).length === 1, `tês ${c.filter((x) => x.f === TE).length}, joelhos ${c.filter((x) => x.f === JOE).length}`);
    const r = await rede();
    rep.check('rede sem avisos de geometria', r.length === 0, JSON.stringify(r));
    await shot('08-alvo-no-meio');
  });

  await rep.step('7. "Criar tubo a partir daqui" pelo menu de contexto num tubo selecionado', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await vista(2, 1.2, 150);
    let tubo = null;
    for (const x of (await comps()).filter((c) => c.f === ESG)) {
      const e = await extremos(x.id);
      if (Math.abs(e.a[1]) < 1e-6 && Math.abs(e.b[1]) < 1e-6 && Math.abs(e.a[2] - 0.5) < 1e-6 && Math.min(e.a[0], e.b[0]) < 3.4 && Math.max(e.a[0], e.b[0]) > 3.4) tubo = x;
    }
    rep.check('achou o tubo (y = 0, z = 0,5) que passa por x = 3,4', !!tubo, '');
    await page.evaluate((id) => window.__hestia.useUi.setState({ selection: [id] }), tubo.id);
    const p = await worldToPage(page, 3.4, 0);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(200);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.waitForTimeout(400);
    const item = page.getByText('Criar tubo a partir daqui', { exact: true }).first();
    rep.check('o menu de contexto tem "Criar tubo a partir daqui"', await item.isVisible().catch(() => false), '');
    await shot('09-menu-de-contexto');
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      await page.waitForTimeout(400);
      const ferr = await page.evaluate(() => window.__hestia.useUi.getState().tool);
      rep.check('a ferramenta Tubo foi ativada', ferr === 'tubo', ferr);
      const f = await page.evaluate(() => window.__hestia.editor.activeTool.constructor.name);
      info(`ferramenta ativa: ${f}; status: ${(await status()).slice(0, 160)}`);
      await shot('09b-ferramenta-ativada');
      const painel = await page.locator('#place-tubo-dn').count();
      rep.check('o painel volta às opções da ferramenta com o DN do tubo clicado (100)', painel === 1 && (await page.locator('#place-tubo-dn').inputValue()) === '100', '');
      info(`painel do tubo visível: ${painel}; DN ${painel ? await page.locator('#place-tubo-dn').inputValue() : '-'}; z ${(await page.locator('#place-tubo-z').count()) ? await page.locator('#place-tubo-z').inputValue() : '-'}`);
      const n0 = (await comps()).filter((x) => x.f === TE).length;
      await mover(3.4, 1.5);
      await shot('09c-previa-do-ramal');
      info(`prévia antes do clique: ${JSON.stringify((await previa()).filter((i) => i.k === 'label'))}`);
      await clickWorld(page, 3.4, 1.5);
      await page.waitForTimeout(400);
      info(`status depois do clique: ${(await status()).slice(0, 200)}; tês em x: ${(await comps()).filter((x) => x.f === TE).map((x) => x.x.toFixed(3)).join(', ')}`);
      rep.check('o próximo clique fecha o ramal a partir do meio do tubo clicado (novo tê perto de x = 3,4)', (await comps()).filter((x) => x.f === TE && Math.abs(x.x - 3.4) < 0.1).length === 1 && (await comps()).filter((x) => x.f === TE).length === n0 + 1, '');
      await shot('10-criar-tubo-aqui');
    }
  });

  await rep.step('8. elétrica: eletroduto rígido sem tê no catálogo BLOQUEIA o clique no meio e sugere caixa', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await vista(2, 6, 110);
    await ativar('Eletroduto', ETUBO, 20, 0.5);
    await clickWorld(page, 0, 6);
    await clickWorld(page, 3, 6);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const n0 = (await comps()).filter((x) => x.f === ETUBO).length;
    await mover(1.5, 6.03);
    const pv = await previa();
    rep.check('halo mostra "Sem derivação neste tipo"', pv.some((i) => i.k === 'label' && /Sem derivação/.test(i.t ?? '')), pv.filter((i) => i.k === 'label').map((i) => i.t).join(' | '));
    await clickWorld(page, 1.5, 6);
    await mover(1.5, 7.5);
    const hover = await previa();
    rep.check('prévia vermelha com "Bloqueado"', hover.some((i) => i.tom === 'invalid') && hover.some((i) => /^Bloqueado/.test(i.t ?? '')), hover.filter((i) => i.k === 'label').map((i) => i.t).join(' | ').slice(0, 200));
    await clickWorld(page, 1.5, 7.5);
    await page.waitForTimeout(300);
    const msg = await status();
    rep.check('a fala traz o motivo e a sugestão de caixa', /não tem tê/.test(msg) && /caixa/.test(msg), msg.slice(0, 220));
    rep.check('nada foi gravado (mesmo número de eletrodutos)', (await comps()).filter((x) => x.f === ETUBO).length === n0, '');
    await shot('11-eletrica-bloqueio');
  });

  await rep.step('9. elétrica: caixa como alvo, em outra cota, com a rota respeitando a entrada', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await botao('Dispositivos elétricos').click();
    await page.waitForSelector('.pal-janela', { timeout: 15_000 });
    await page.locator('.pal-busca').fill('Caixa de luz 4');
    await page.waitForTimeout(250);
    await page.locator('.pal-movel', { hasText: /série 2/ }).first().click();
    await page.waitForTimeout(200);
    await clickWorld(page, 4.5, 8.5);
    await page.keyboard.press('Escape');
    await fecharBiblioteca();
    await page.waitForTimeout(200);
    const cx = (await comps()).find((x) => x.f === CAIXA);
    rep.check('caixa colocada', !!cx, '');
    await ativar('Eletroduto', ETUBO, 20, 0.5);
    await clickWorld(page, 0, 8.5);
    await cota(1.5);
    const porta = await page.evaluate((id) => {
      const { engine, editor } = window.__hestia;
      const p = editor.store.project;
      const c = p.elements[id];
      return engine.resolverComponente(p, c).ligacoes.filter((l) => l.dominio === 'eletroduto').map((l) => { const m = engine.ligacaoNoMundo(l, c); return { nome: l.id, x: m.posicaoMundo[0], y: m.posicaoMundo[1], z: m.posicaoMundo[2], dir: [...m.direcaoMundo] }; });
    }, cx.id);
    const esq = porta.find((q) => q.dir[0] < -0.9) ?? porta[0];
    await cota(esq.z);
    await mover(esq.x, esq.y);
    const pv = await previa();
    rep.check('halo e nome da porta da caixa na prévia', pv.some((i) => i.k === 'label' && /^Porta: /.test(i.t ?? '')), pv.filter((i) => i.k === 'label').map((i) => i.t).join(' | ').slice(0, 160));
    await clickWorld(page, esq.x, esq.y);
    await page.waitForTimeout(400);
    const tubos = (await comps()).filter((x) => x.f === ETUBO);
    info(`eletrodutos: ${tubos.length}; status: ${(await status()).slice(0, 160)}`);
    const r = await rede();
    rep.check('rede elétrica sem afastada, incompatível nem coladas', r.length === 0, JSON.stringify(r));
    await vista(2.3, 7.8, 110);
    await page.waitForTimeout(300);
    await shot('12-eletrica-caixa-alvo');
  });

  await rep.step('10. captura em 3D (3D padrão): o ramal sobe do tê, anda e fecha no meio do outro tubo', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByText('3D padrão', { exact: true }).first().dblclick();
    await page.waitForTimeout(2500);
    await shot('13-vista-3d');
    const vista3d = await page.evaluate(() => window.__hestia.useUi.getState().view);
    rep.check('a vista 3D abriu', vista3d === '3d', vista3d);
  });

  rep.check('sem erros no console do navegador', erros.length === 0, erros.slice(0, 2).join(' | '));
} finally {
  rep.summary();
  await browser.close();
  process.exit(rep.steps.some((s) => s.status !== 'PASS') ? 1 : 0);
}
