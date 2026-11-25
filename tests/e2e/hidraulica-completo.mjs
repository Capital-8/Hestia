// Esgoto e água fria no navegador, como um usuário (ficha B8): Sistemas > Hidráulica e tubulação, ferramenta Tubo, painel de
// propriedades, faixa e "Verificar rede". Passos: troca de bitola (situação 1), prumada (situação 2), ângulo sem peça (situação 3),
// bloqueio por desnível (situação 4), declividade, salvar/recarregar e vista 3D. Traçado só pelo mouse; atalhos de programa
// anotados onde aparecem: enquadramento da vista (setViewport) e leitura do estado do projeto (store) para conferir o resultado.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5221/?debug=1' node tests/e2e/hidraulica-completo.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5221/?debug=1';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/-home-user-Hestia/e0b36f0f-5cd5-5bfc-b964-572e233c1fd8/scratchpad/hidraulica-completo';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const shot = (nome) => page.screenshot({ path: `${OUT}/${nome}.png` });
const info = (msg) => console.log(`  info  ${msg}`);

const ESG = 'fam_krona_esgoto_tubo_corte';
const JOE90 = 'fam_krona_esgoto_joelho90';
const JOE45 = 'fam_krona_esgoto_joelho45';
const TUBOS_DN = (c) => c.filter((x) => x.f === ESG);
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, DN: e.values?.DN, L: e.values?.L, x: e.x, y: e.y, z: e.z, inc: e.inclinacao?.[0] ?? null })));
const snapshot = () => page.evaluate(() => JSON.stringify(window.__hestia.editor.store.project.elements));
const novos = (antes, lista) => lista.filter((c) => !antes.has(c.id));
const ids = (lista) => new Set(lista.map((c) => c.id));
/** Posições (x, y, z) do store vêm em metros: tolerância de 5 cm. */
const perto = (valor, metros) => Math.abs(valor - metros) < 0.05;
const status = () => page.evaluate(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); });
const textoPagina = () => page.evaluate(() => document.body.innerText);
/** Vista: enquadramento por programa (ponto de mundo no centro, 60 px/m: cabe ±5 m em altura); só para caber o traçado na tela. */
const vista = (cx, cy) => page.evaluate(([cx, cy]) => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), cx, cy, zoom: 60 }); }, [cx, cy]);
const aba = async (nome) => { await page.locator('.ribbon-tabs .rtab:visible', { hasText: new RegExp(`^${nome}$`) }).first().click(); await page.waitForTimeout(150); };
const botao = (nome) => page.getByRole('button', { name: nome, exact: true }).first();
const escolhe = async (sel, valor) => {
  const tag = await page.locator(sel).evaluate((el) => el.tagName);
  if (tag === 'SELECT') await page.locator(sel).selectOption(valor);
  else { await page.locator(sel).fill(valor); await page.locator(sel).press('Enter'); }
  await page.waitForTimeout(300);
};
/** Ferramenta Tubo (Sistemas > Hidráulica e tubulação): tipo e bitola pelo painel da ferramenta. */
const ferramentaTubo = async (familia, dn) => {
  await aba('Sistemas');
  // O botão Tubo liga e desliga a ferramenta: só clica quando o painel da ferramenta não está aberto.
  // Com um trecho selecionado o painel mostra o componente, não a ferramenta: Esc limpa a seleção e a ferramenta volta a aparecer.
  for (let k = 0; k < 2 && !(await page.locator('#place-tubo-familia').isVisible().catch(() => false)); k++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if (!(await page.locator('#place-tubo-familia').isVisible().catch(() => false)) && (await botao('Tubo').getAttribute('aria-pressed')) !== 'true') await botao('Tubo').click();
  }
  try {
    await page.waitForSelector('#place-tubo-familia', { timeout: 15_000 });
  } catch (e) {
    const est = await page.evaluate(() => ({ botoes: [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Tubo').map((b) => `${b.getAttribute('aria-pressed')}|${b.className}`), status: JSON.stringify(window.__hestia.useUi.getState().status).slice(0, 120), sel: window.__hestia.useUi.getState().selection.length }));
    info(`falha ao abrir a ferramenta Tubo: ${JSON.stringify(est)}`);
    await shot('erro-ferramenta-tubo');
    throw e;
  }
  await page.locator('#place-tubo-familia').selectOption(familia);
  await page.waitForTimeout(200);
  await page.locator('#place-tubo-dn').selectOption(String(dn));
  await page.waitForTimeout(200);
};
const cota = async (m) => escolhe('#place-tubo-z', String(m));
/** Verificar rede pela faixa; devolve os itens do diálogo. */
const verificar = async () => {
  await aba('Sistemas');
  await botao('Verificar rede').click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]') !== null, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const itens = (await page.locator('[role="dialog"] li, [role="dialog"] tr').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  return itens;
};
const fecharDialogo = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
/** Seleção de um trecho: clique no meio; se o clique não seleciona, janela (arraste de esq. para dir. contém o trecho inteiro). */
const selecionadosN = () => page.evaluate(() => window.__hestia.useUi.getState().selection.length);
/** Seleção pelo link "Ir para" do Verificar rede (o app seleciona o item): tenta os itens até achar o trecho de origem (ox, oy). */
const selecionaPeloVerificar = async (ox, oy) => {
  const alvo = (await comps()).filter((c) => c.f === ESG && perto(c.x, ox) && perto(c.y, oy)).map((c) => c.id);
  for (let i = 0; i < 30; i++) {
    await verificar();
    const links = page.locator('[role="dialog"] button, [role="dialog"] a').filter({ hasText: /^\s*Ir para\s*$/ });
    if (i >= (await links.count())) break;
    await links.nth(i).click();
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => window.__hestia.useUi.getState().selection);
    if (s.length === 1 && alvo.includes(s[0])) { info(`trecho de origem (${ox}; ${oy}) selecionado pelo "Ir para" do item ${i + 1}`); return 1; }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  return 0;
};
/** Seleção de um trecho: clique no meio; se não seleciona, janela (esq. para dir. contém o trecho); se não, "Ir para" do Verificar rede. */
const selecionaTrecho = async (xa, xb, y) => {
  await page.keyboard.press('Escape');
  await clickWorld(page, (xa + xb) / 2, y);
  await page.waitForTimeout(300);
  if ((await selecionadosN()) === 0) {
    info(`clique no meio do trecho (${(xa + xb) / 2}; ${y}) não selecionou; tentando janela`);
    const a = await worldToPage(page, xa - 0.4, y - 0.45);
    const b = await worldToPage(page, xb - 0.07, y + 0.45);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
  if ((await selecionadosN()) === 0) {
    info('janela também não selecionou; seleção pelo "Ir para" do Verificar rede');
    await fecharDialogo();
    await selecionaPeloVerificar(0, y);
    await fecharDialogo();
  }
  return selecionadosN();
};
/** Passo de desfazer: clique em área vazia (tira a seleção) antes do Ctrl+Z. */
const desfazer = async () => { await clickWorld(page, -20, -20); await page.keyboard.press('Control+z'); await page.waitForTimeout(500); };

try {
  // ---------- 1 ----------
  await rep.step('1. Sistemas > Hidráulica e tubulação: Tubo ativo, tipos Krona no painel, bitolas do catálogo', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await aba('Sistemas');
    rep.check('painel "Hidráulica e tubulação" visível na faixa', (await textoPagina()).includes('Hidráulica e tubulação'));
    await botao('Tubo').click();
    await page.waitForSelector('#place-tubo-familia', { timeout: 15_000 });
    const estado = await botao('Tubo').evaluate((b) => ({ pressed: b.getAttribute('aria-pressed'), cls: b.className }));
    info(`botão Tubo após clique: aria-pressed=${estado.pressed} class="${estado.cls}"`);
    rep.check('botão Tubo ficou ativo (aria-pressed=true ou classe active)', estado.pressed === 'true' || /active|on|sel/.test(estado.cls), JSON.stringify(estado));
    const fams = await page.locator('#place-tubo-familia option').allInnerTexts();
    info(`tipos no painel: ${fams.join(' | ')}`);
    rep.check('tipo "Esgoto Krona" no painel', fams.some((f) => /esgoto.*krona|krona.*esgoto/i.test(f)), fams.join(' | '));
    rep.check('tipo "Água fria soldável Krona" no painel', fams.some((f) => /soldável.*krona|krona.*soldável/i.test(f)), fams.join(' | '));
    const valorSold = await page.locator('#place-tubo-familia option').evaluateAll((os) => os.find((o) => /soldável.*Krona|Krona.*soldável/i.test(o.textContent))?.value ?? '');
    await page.locator('#place-tubo-familia').selectOption(valorSold);
    await page.waitForTimeout(250);
    const dnsSold = await page.locator('#place-tubo-dn option').allInnerTexts();
    info(`bitolas água fria soldável: ${dnsSold.join(',')}`);
    rep.check('bitolas da água fria vêm do catálogo (sem 63 de esgoto, ao menos 25 e 32)', dnsSold.includes('25') && dnsSold.includes('32') && !dnsSold.includes('63'), dnsSold.join(','));
    await page.locator('#place-tubo-familia').selectOption(ESG);
    await page.waitForTimeout(250);
    const dns = await page.locator('#place-tubo-dn option').allInnerTexts();
    info(`bitolas esgoto: ${dns.join(',')}`);
    rep.check('bitolas do esgoto Krona incluem 50, 75, 100 e 150', ['50', '75', '100', '150'].every((d) => dns.includes(d)), dns.join(','));
    await page.locator('#place-tubo-dn').selectOption('100');
    await shot('01-painel');
  });

  // ---------- 2 ----------
  await rep.step('2. esgoto DN 100: trecho reto e trecho em L (joelho 90° no canto), Verificar rede sem afastada/incompatível', async () => {
    await vista(1.5, -1.5);
    const antes = ids(await comps());
    await clickWorld(page, 0, -6);
    await clickWorld(page, 3, -6);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const reto = novos(antes, await comps());
    rep.check('reto: 1 trecho DN 100 criado', TUBOS_DN(reto).length === 1 && TUBOS_DN(reto)[0].DN === 100, `${TUBOS_DN(reto).length} trecho(s), DN ${TUBOS_DN(reto)[0]?.DN}`);
    const antesL = ids(await comps());
    await clickWorld(page, 0, 0);
    await clickWorld(page, 3, 0);
    await clickWorld(page, 3, 3);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const L = novos(antesL, await comps());
    const joelhosL = L.filter((c) => c.f === JOE90);
    rep.check('em L: 2 trechos DN 100 novos', TUBOS_DN(L).length === 2, `${TUBOS_DN(L).length}`);
    rep.check('joelho 90° da Krona no canto (3 m, 0 m)', joelhosL.some((j) => perto(j.x, 3) && perto(j.y, 0)), joelhosL.map((j) => `${j.x},${j.y}`).join(' / '));
    await shot('02-planta-L');
    const itens = await verificar();
    info(`Verificar rede: ${itens.join(' | ').slice(0, 300)}`);
    rep.check('sem "afastada" nem "incompatível"', !itens.some((x) => /afastad|incompat/i.test(x)), itens.join(' | ').slice(0, 200));
    await shot('02-verificar-rede');
    await fecharDialogo();
  });

  // ---------- 3 ----------
  await rep.step('3. troca de bitola 100 -> 75 no painel de propriedades: redução entra, um Ctrl+Z volta tudo', async () => {
    await vista(1.5, 0);
    await page.keyboard.press('Escape');
    const sel3 = await selecionaTrecho(0, 2.94, 0);
    info(`itens selecionados: ${sel3}`);
    await page.waitForSelector('#p-comp-type', { timeout: 10_000 }).catch(() => {});
    const existe = await page.locator('#p-comp-type').count();
    rep.check('painel de propriedades do trecho com campo Tipo (bitola)', existe === 1, `${existe}`);
    const snap = await snapshot();
    const antes = await comps();
    const antesIds = ids(antes);
    await escolhe('#p-comp-type', 'DN 75');
    await page.waitForTimeout(600);
    const depois = await comps();
    const criados = novos(antesIds, depois);
    const removidos = antes.filter((c) => !ids(depois).has(c.id));
    info(`novos: ${criados.map((c) => `${c.f}(DN ${c.DN})`).join(', ') || 'nenhum'} | removidos: ${removidos.map((c) => `${c.f}(DN ${c.DN})`).join(', ') || 'nenhum'}`);
    info(`peças após a troca: ${depois.map((c) => `${c.f.replace('fam_krona_esgoto_', '')}(DN ${c.DN}, x ${c.x}, y ${c.y})`).join(' | ')}`);
    info(`status: ${await status()}`);
    rep.check('trecho virou DN 75 (campo Tipo do painel)', TUBOS_DN(depois).some((t) => t.DN === 75), TUBOS_DN(depois).map((t) => t.DN).join(','));
    rep.check('redução 100x75 da Krona entrou (família com "reducao")', criados.some((c) => /reducao/.test(c.f)), criados.map((c) => c.f).join(','));
    rep.check('joelho do canto mantido', depois.some((c) => c.f === JOE90 && perto(c.x, 3) && perto(c.y, 0)), '');
    await shot('03-troca-75');
    const itens = await verificar();
    info(`Verificar rede após troca (itens que não são ponta aberta): ${itens.filter((x) => !/aberta/.test(x)).join(' | ') || 'nenhum'}`);
    await shot('03-troca-75-rede');
    rep.check('rede após troca: sem "afastada" (defeito conhecido de 13 mm da excêntrica 100→75)', !itens.some((x) => /afastad/i.test(x)), itens.filter((x) => /afastad/i.test(x)).join(' | ').slice(0, 200) || 'sem afastada');
    await fecharDialogo();
    await desfazer();
    const volta = (await snapshot()) === snap;
    rep.check('um Ctrl+Z volta a cena inteira (uma entrada no desfazer)', volta, volta ? '' : 'estado difere do antes da troca');
    await shot('03-desfeito');
  });

  // ---------- 3b ----------
  await rep.step('3b. troca 150 -> 50 (par ausente no catálogo): conexão removida com alerta, um Ctrl+Z volta', async () => {
    await vista(1.5, -13.5);
    await ferramentaTubo(ESG, 150);
    await clickWorld(page, 0, -12);
    await clickWorld(page, 3, -12);
    await clickWorld(page, 3, -15);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    const sel3b = await selecionaTrecho(0, 2.94, -12);
    info(`itens selecionados (150): ${sel3b}`);
    await page.waitForSelector('#p-comp-type', { timeout: 10_000 }).catch(() => {});
    const snap = await snapshot();
    const antes = await comps();
    await escolhe('#p-comp-type', 'DN 50');
    await page.waitForTimeout(600);
    const depois = await comps();
    info(`após 150→50: novos ${novos(ids(antes), depois).map((c) => `${c.f}(DN ${c.DN})`).join(', ') || 'nenhum'}; status: ${await status()}`);
    const joelhoVirou = depois.some((c) => c.f === JOE90 && perto(c.x, 3) && perto(c.y, -12));
    info(`joelho 150 do canto ainda existe: ${joelhoVirou}`);
    rep.check('alerta de troca na barra de status (par ausente)', /150|50|sem|conex|aviso|remov/i.test(await status()) || /remov|sem redução|não há/i.test(await textoPagina()), (await status()).slice(0, 160));
    await shot('03b-150-50');
    await desfazer();
    rep.check('um Ctrl+Z volta a cena (150→50)', (await snapshot()) === snap, '');
  });

  // ---------- 4 ----------
  await rep.step('4. prumada: cota 0, dois pontos, cota 2 e terceiro ponto: vertical + horizontal com joelhos, sem diagonal', async () => {
    await vista(1.5, 11.5);
    await ferramentaTubo(ESG, 100);
    const ops = await page.locator('#place-tubo-modocota option').allInnerTexts();
    rep.check('modos de cota: Subir primeiro, Andar primeiro, Diagonal', ops.join('|') === 'Subir primeiro|Andar primeiro|Diagonal', ops.join('|'));
    await cota(0);
    await clickWorld(page, 0, 10);
    await clickWorld(page, 3, 10);
    await cota(2);
    const antes = ids(await comps());
    await clickWorld(page, 3, 13);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const todos = await comps();
    const tubos = novos(antes, todos).filter((c) => c.f === ESG);
    const ori = tubos.map((t) => (t.inc === null || Math.abs(t.inc) < 1e-6 ? 'vertical' : Math.abs(t.inc - Math.PI / 2) < 1e-6 ? 'horizontal' : 'diagonal')).sort().join(',');
    info(`trechos novos: ${tubos.length} (${ori}); joelhos no projeto: ${todos.filter((c) => c.f === JOE90).map((j) => `(${j.x},${j.y},${j.z})`).join(' ')}`);
    rep.check('2 trechos novos: vertical e horizontal', tubos.length === 2 && ori === 'horizontal,vertical', `${tubos.length} (${ori})`);
    rep.check('nenhum trecho diagonal', !ori.includes('diagonal'), ori);
    rep.check('joelhos 90° da Krona na emenda (um no pé, um no topo)', novos(antes, todos).filter((c) => c.f === JOE90).length >= 2, `${novos(antes, todos).filter((c) => c.f === JOE90).length}`);
    await shot('04-subir-primeiro');
    await aba('Sistemas');
    const itens = await verificar();
    rep.check('Verificar rede sem afastada/incompatível', !itens.some((x) => /afastad|incompat/i.test(x)), itens.join(' | ').slice(0, 200));
    await fecharDialogo();
    // Andar primeiro (mesmo tipo, outra cota de início)
    await ferramentaTubo(ESG, 100);
    await page.locator('#place-tubo-modocota').selectOption({ label: 'Andar primeiro' });
    await cota(0);
    await vista(1.5, 21.5);
    await clickWorld(page, 0, 20);
    await clickWorld(page, 3, 20);
    await cota(2);
    const a2 = ids(await comps());
    await clickWorld(page, 3, 23);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const andar = novos(a2, await comps()).filter((c) => c.f === ESG);
    const oriA = andar.map((t) => (t.inc === null || Math.abs(t.inc) < 1e-6 ? 'vertical' : Math.abs(t.inc - Math.PI / 2) < 1e-6 ? 'horizontal' : 'diagonal')).sort().join(',');
    rep.check('Andar primeiro: 2 trechos vertical + horizontal, sem diagonal', andar.length === 2 && oriA === 'horizontal,vertical', `${andar.length} (${oriA})`);
    await shot('04-andar-primeiro');
    // Diagonal 45°: dz 2 m com 2 m de planta
    await ferramentaTubo(ESG, 100);
    await page.locator('#place-tubo-modocota').selectOption({ label: 'Diagonal' });
    await vista(1.5, 30);
    await cota(0);
    await clickWorld(page, 0, 30);
    await cota(2);
    const d45 = ids(await comps());
    await clickWorld(page, 2, 30);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const diag45 = novos(d45, await comps()).filter((c) => c.f === ESG || c.f === JOE45);
    info(`diagonal 45°: ${diag45.map((c) => `${c.f}(inc ${c.inc})`).join(', ')}`);
    rep.check('Diagonal 45° passa (há curva/joelho 45 no tipo)', diag45.length > 0 && diag45.some((c) => c.f === JOE45 || c.f === ESG), diag45.map((c) => c.f).join(','));
    await shot('04-diagonal-45');
    // Diagonal 30°: dz 2 m com 3,5 m de planta
    await vista(1.5, 40);
    await cota(0);
    await clickWorld(page, 0, 40);
    await cota(2);
    const d30 = ids(await comps());
    await clickWorld(page, 3.5, 40);
    await page.waitForTimeout(300);
    const msg30 = (await status()) + ' | ' + (await textoPagina()).replace(/\s+/g, ' ');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const novos30 = novos(d30, await comps());
    rep.check('Diagonal 30° bloqueada com mensagem (sem trecho novo)', novos30.length === 0 && /30|ângulo|angulo|diagonal|bloque/i.test(msg30), `${novos30.length} novos; ${msg30.slice(0, 160)}`);
    await shot('04-diagonal-30');
  });

  // ---------- 5 ----------
  await rep.step('5. ângulo sem peça (60° no esgoto): alerta, sem conexão inventada, sugestão de cota', async () => {
    await vista(2, 51);
    await ferramentaTubo(ESG, 100);
    await page.locator('#place-tubo-modocota').selectOption({ label: 'Subir primeiro' });
    await cota(0);
    await clickWorld(page, 0, 50);
    await clickWorld(page, 3, 50);
    const antes = ids(await comps());
    const joelhosAntes = (await comps()).filter((c) => c.f === JOE90 || c.f === JOE45).length;
    const p = { x: 3 + 3 * Math.cos(Math.PI / 3), y: 50 + 3 * Math.sin(Math.PI / 3) };
    const { x, y } = p;
    const pp = await worldToPage(page, x, y);
    await page.mouse.move(pp.x, pp.y);
    await page.waitForTimeout(400);
    await shot('05-previa-60');
    const tuboAntes5 = TUBOS_DN(await comps()).length;
    await clickWorld(page, x, y);
    await page.waitForTimeout(300);
    const msg = (await status()) + ' | ' + (await textoPagina()).replace(/\s+/g, ' ');
    await shot('05-60-graus');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const depois = await comps();
    const joelhosDepois = depois.filter((c) => c.f === JOE90 || c.f === JOE45).length;
    info(`mensagem: ${msg.slice(0, 300)}`);
    rep.check('alerta de ângulo (60°) visível', /60|ângulo|angulo|sem peça|sem conex|cota/i.test(msg), msg.slice(0, 160));
    rep.check('nenhuma conexão inventada (joelhos iguais)', joelhosDepois === joelhosAntes, `${joelhosAntes} -> ${joelhosDepois}`);
    rep.check('texto/prévia sugere mudar a cota (B5)', /mudar a cota/i.test(msg), /mudar a cota/i.test(msg) ? '' : 'não está no texto da barra; ver captura 05-previa-60 (rótulo da prévia)');
    info(`trechos de esgoto após o 60°: ${TUBOS_DN(depois).length - tuboAntes5} novo(s) nesse clique`);
  });

  // ---------- 6 ----------
  await rep.step('6. bloqueio: desnível de 5 cm em DN 100 bloqueia (vermelho e sugestão); 40 cm passa', async () => {
    await vista(1.5, 61.5);
    await ferramentaTubo(ESG, 100);
    await page.locator('#place-tubo-modocota').selectOption({ label: 'Subir primeiro' });
    await cota(0);
    await clickWorld(page, 0, 60);
    await clickWorld(page, 3, 60);
    await cota(0.05);
    const zEm = await page.locator('#place-tubo-z').inputValue();
    info(`cota digitada 0,05 m; campo mostra: "${zEm}"`);
    const antes = ids(await comps());
    await page.mouse.move((await worldToPage(page, 3, 63)).x, (await worldToPage(page, 3, 63)).y);
    await page.waitForTimeout(400);
    await shot('06-previa-vermelha');
    await clickWorld(page, 3, 63);
    await page.waitForTimeout(300);
    const msg = (await status()) + ' | ' + (await textoPagina()).replace(/\s+/g, ' ');
    info(`bloqueio: ${msg.slice(0, 300)}`);
    rep.check('mensagem "Bloqueado: …" com sugestão de cota em mm', /Bloqueado:/.test(msg) && /Sugest[aã]o:.*mm/.test(msg), msg.match(/Bloqueado[^|]*/)?.[0]?.slice(0, 160) ?? msg.slice(0, 120));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const criados = novos(antes, await comps()).filter((c) => c.f === ESG);
    rep.check('nada criado no bloqueio', criados.length === 0, `${criados.length} trechos`);
    await shot('06-bloqueado');
    await vista(1.5, 67.5);
    await cota(0);
    await clickWorld(page, 0, 66);
    await clickWorld(page, 3, 66);
    await cota(0.4);
    const a40 = ids(await comps());
    await clickWorld(page, 3, 69);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const passou = novos(a40, await comps()).filter((c) => c.f === ESG);
    rep.check('desnível de 40 cm passa (trechos novos criados)', passou.length >= 2, `${passou.length} trechos`);
    await shot('06-40cm');
  });

  // ---------- 7 ----------
  await rep.step('7. declividade: 2% sem "inclinação fora do limite"; 0,5% acusa', async () => {
    await vista(1.5, 80);
    await ferramentaTubo(ESG, 100);
    await cota(0);
    await page.locator('#place-tubo-decl').fill('2');
    await page.locator('#place-tubo-decl').press('Enter');
    await page.waitForTimeout(250);
    const a7 = ids(await comps());
    await clickWorld(page, 0, 80);
    await clickWorld(page, 3, 80);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    rep.check('trecho a 2% criado', novos(a7, await comps()).some((c) => c.f === ESG), '');
    let itens = await verificar();
    await shot('07-rede-2');
    info(`Verificar rede com 2%: ${itens.join(' | ').slice(0, 300)}`);
    rep.check('2%: sem "inclinação fora do limite"', !itens.some((x) => /declividade|fora da faixa/i.test(x)), itens.filter((x) => /declividade|fora da faixa/i.test(x)).join(' | ').slice(0, 160) || 'nenhum');
    await fecharDialogo();
    await vista(1.5, 84);
    await ferramentaTubo(ESG, 100);
    await cota(0);
    await page.locator('#place-tubo-decl').fill('0.5');
    await page.locator('#place-tubo-decl').press('Enter');
    await page.waitForTimeout(250);
    const a8 = ids(await comps());
    await clickWorld(page, 0, 84);
    await clickWorld(page, 3, 84);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    rep.check('trecho a 0,5% criado', novos(a8, await comps()).some((c) => c.f === ESG), '');
    itens = await verificar();
    await shot('07-rede-0-5');
    info(`Verificar rede com 0,5%: ${itens.join(' | ').slice(0, 300)}`);
    rep.check('0,5%: acusa "inclinação fora do limite"', itens.some((x) => /declividade|fora da faixa/i.test(x)), itens.filter((x) => /declividade|fora da faixa/i.test(x)).join(' | ').slice(0, 160) || 'nenhum');
    await fecharDialogo();
  });

  await rep.step('7b. controle: 0,5% em DN 75 (mesma conta, outro DN) e diâmetro da ligação do trecho', async () => {
    await vista(1.5, 90);
    await ferramentaTubo(ESG, 75);
    await cota(0);
    await page.locator('#place-tubo-decl').fill('0.5');
    await page.locator('#place-tubo-decl').press('Enter');
    await page.waitForTimeout(250);
    const a9 = ids(await comps());
    await clickWorld(page, 0, 90);
    await clickWorld(page, 3, 90);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const t75 = novos(a9, await comps()).filter((c) => c.f === ESG);
    rep.check('trecho DN 75 a 0,5% criado', t75.some((c) => c.DN === 75), t75.map((c) => c.DN).join(','));
    const dia = await page.evaluate((id) => { const { engine, editor } = window.__hestia; const p = editor.store.project; const c = p.elements[id]; return engine.resolverComponente(p, c).ligacoes.map((l) => l.diametro); }, t75[0]?.id);
    info(`diâmetros das ligações do trecho DN 75 (m): ${JSON.stringify(dia)}`);
    const itens = await verificar();
    await shot('07b-rede-dn75');
    info(`DN 75 a 0,5%: ${itens.filter((x) => /declividade|fora da faixa/i.test(x)).join(' | ') || 'sem item de inclinação'}`);
    rep.check('DN 75 a 0,5%: acusa "inclinação fora do limite"', itens.some((x) => /declividade|fora da faixa/i.test(x)), '');
    await fecharDialogo();
  });

  // ---------- 8 ----------
  await rep.step('8. salva, recarrega e reabre; 3D abre; sem erro de console', async () => {
    const antesTubos = TUBOS_DN(await comps()).length;
    const antesJoelhos = (await comps()).filter((c) => c.f === JOE90).length;
    await aba('Arquivo');
    await page.locator('.fm-item').filter({ hasText: /^\s*Salvar\s*$/ }).click();
    await page.waitForTimeout(600);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.locator('[role="dialog"] button', { hasText: /Baixar|arquivo/i }).first().click()]);
    const caminho = `${OUT}/projeto-b8.hestia.json`;
    await download.saveAs(caminho);
    rep.check('arquivo do projeto baixado', readFileSync(caminho).length > 1000, `${readFileSync(caminho).length} bytes`);
    await page.locator('[role="dialog"] button', { hasText: /Cancelar|Fechar/ }).first().click({ timeout: 2000 }).catch(() => {});
    await page.reload();
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.waitForTimeout(1200);
    await page.locator('input[type="file"][accept*="hestia"]').setInputFiles(caminho);
    await page.waitForTimeout(3000);
    const depois = await comps();
    rep.check('trechos de esgoto persistem', TUBOS_DN(depois).length === antesTubos, `${antesTubos} -> ${TUBOS_DN(depois).length}`);
    rep.check('joelhos persistem', depois.filter((c) => c.f === JOE90).length === antesJoelhos, `${antesJoelhos} -> ${depois.filter((c) => c.f === JOE90).length}`);
    await shot('08-reaberto');
    const errosAntes = erros.length;
    await aba('Vista');
    const r3d = await page.getByText('3D padrão', { exact: true }).first().dblclick().then(() => true).catch(() => false);
    if (!r3d) info('"3D padrão" não clicável pela faixa; abrindo a vista 3D por programa (atalho de vista)');
    if (!r3d) await page.evaluate(() => { const { editor, useUi } = window.__hestia; editor.setView('3d'); const s = useUi.getState(); if (!s.openViews.some((v) => v.kind === '3d')) useUi.setState({ openViews: [...s.openViews, { kind: '3d' }] }); });
    await page.waitForTimeout(4000);
    await shot('08-3d');
    rep.check('vista 3D abriu sem erro de console', erros.length === errosAntes, erros.slice(errosAntes, errosAntes + 2).join(' | ').slice(0, 200));
  });

  await rep.step('9. sem erro de console no roteiro inteiro', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 240));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);

