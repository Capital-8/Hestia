// Ferramentas da aba Modificar sobre tubo e eletroduto (fase 4, ficha F6a parte 1), em Chrome real.
// Esgoto Krona DN 100 em L: seleciona o trecho (pegadores), arrasta a ponta (prolonga, o joelho acompanha), arrasta o meio com Ctrl e o
// campo Cota (gera a prumada), Estender até o meio de outro tubo (tê), Aparar dois tubos que se cruzam (joelho) e Dividir com luva; depois
// eletroduto rígido (ponta arrastada, Dividir com luva) e corrugado (ponta arrastada). Traçado e edição só pelo mouse e pelos campos;
// atalhos de programa, anotados: setTool('select') e seleção por store (o 'v' do roteiro antigo), enquadramento da vista e leitura do estado.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5229/?debug=1' node tests/e2e/modificar-mep-1.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5229/?debug=1';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/-home-user-Hestia/e0b36f0f-5cd5-5bfc-b964-572e233c1fd8/scratchpad/modificar-mep-1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const ESG = 'fam_krona_esgoto_tubo_corte';
const ETUBO = 'fam_krona_eletrica_tubo_corte';
const CORR = 'fam_tigre_tigreflex_amarelo';
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, DN: e.values?.DN, L: e.values?.L, x: e.x, y: e.y, z: e.z })));
const extremos = (id) => page.evaluate((id) => {
  const { engine, editor } = window.__hestia; const p = editor.store.project; const c = p.elements[id];
  const l = [...engine.resolverComponente(p, c).ligacoes].sort((a, b) => a.posicao[2] - b.posicao[2]);
  return { a: [...engine.ligacaoNoMundo(l[0], c).posicaoMundo], b: [...engine.ligacaoNoMundo(l[l.length - 1], c).posicaoMundo] };
}, id);
const rede = () => page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).filter((d) => ['conexao_afastada', 'incompativel', 'ligacao_incompativel', 'conexao_invalida', 'conexoes_coladas', 'curvatura_fechada'].includes(d.codigo)).map((d) => d.codigo));
const status = () => page.evaluate(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); });
const vista = (cx, cy, zoom) => page.evaluate(([cx, cy, zoom]) => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), cx, cy, zoom }); }, [cx, cy, zoom]);
const aba = async (n) => { await page.evaluate(() => window.__hestia.useUi.setState({ selection: [] })); await page.keyboard.press('Escape'); await page.locator('.ribbon-tabs .rtab:visible', { hasText: new RegExp(`^${n}$`) }).first().click(); await page.waitForTimeout(150); };
const botao = (n) => page.getByRole('button', { name: n, exact: true }).first();
const cota = async (z) => { await page.locator('#place-tubo-z').fill(String(z)); await page.locator('#place-tubo-z').press('Enter'); await page.waitForTimeout(120); };
const ativar = async (ferramenta, familia, dn, z) => {
  await page.keyboard.press('Escape');
  await botao(ferramenta).click();
  await page.waitForSelector('#place-tubo-dn', { timeout: 15_000 });
  await page.locator('#place-tubo-familia').selectOption(familia);
  await page.locator('#place-tubo-dn').selectOption(String(dn));
  await cota(z);
};
const traco = async (pts) => { for (const [x, y] of pts) await clickWorld(page, x, y); await page.keyboard.press('Escape'); await page.waitForTimeout(250); };
const selecionar = async (id) => { await page.evaluate((id) => { window.__hestia.editor.setTool('select'); window.__hestia.useUi.setState({ selection: [id] }); }, id); await page.waitForTimeout(200); };
const arrastar = async (de, para, { ctrl = false, alt = false } = {}) => {
  const a = await worldToPage(page, de[0], de[1]); const b = await worldToPage(page, para[0], para[1]);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  if (ctrl) await page.keyboard.down('Control');
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 6 });
  await shot(`drag-${Date.now() % 100000}`);
  await page.mouse.up();
  if (ctrl) await page.keyboard.up('Control');
  if (alt) await page.keyboard.up('Alt');
  await page.waitForTimeout(300);
};
const tubos = async (f) => (await comps()).filter((c) => c.f === f);

try {
  await rep.step('1. esgoto Krona DN 100 em L: (0;0) → (2;0) → (2;2), z = 0,5', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await aba('Sistemas');
    await ativar('Tubo', ESG, 100, 0.5);
    await vista(2, 1, 130);
    await traco([[0, 0], [2, 0], [2, 2]]);
    const t = await tubos(ESG);
    rep.check('2 trechos e 1 joelho', t.length === 2 && (await comps()).some((c) => /joelho90/.test(c.f)), `${t.length}`);
    await shot('01-L');
  });

  let t1;
  await rep.step('2. seleciona o trecho: pegadores nas pontas e no meio; arrasta a ponta (2;0) até (2,6;0): prolonga e o joelho acompanha', async () => {
    t1 = (await tubos(ESG))[0];
    await selecionar(t1.id);
    await page.mouse.move(...Object.values(await worldToPage(page, 1, 0)));
    await shot('02-pegadores');
    await arrastar([2, 0], [2.6, 0]);
    const j = (await comps()).find((c) => /joelho90/.test(c.f));
    const e = await extremos(t1.id);
    rep.check('joelho acompanhou até x = 2,6', Math.abs(j.x - 2.6) < 0.02, `${j.x}`);
    rep.check('trecho prolongado', e.b[0] > 2.4, `${e.b[0]}`);
    rep.check('rede limpa', (await rede()).length === 0, (await rede()).join(','));
    await shot('03-prolongado');
  });

  await rep.step('3. meio com Ctrl e Cota 0,9: o trecho sobe e GANHA A PRUMADA (vertical e joelhos)', async () => {
    await aba('Sistemas');
    await ativar('Tubo', ESG, 100, 0.9);
    await page.keyboard.press('Escape');
    await selecionar(t1.id);
    const antes = (await comps()).length;
    const e = await extremos(t1.id);
    const meio = [(e.a[0] + e.b[0]) / 2, 0];
    await arrastar(meio, [meio[0] + 0.2, meio[1]], { ctrl: true });
    const depois = await comps();
    const e2 = await extremos(t1.id);
    console.log('  status:', await status());
    rep.check('trecho na cota 0,9', Math.abs(e2.a[2] - 0.9) < 0.01, `${e2.a[2]}`);
    rep.check('peças novas (prumada e joelhos)', depois.length >= antes + 3, `${antes} -> ${depois.length}`);
    rep.check('rede limpa', (await rede()).length === 0, (await rede()).join(','));
    await shot('04-prumada');
    await page.evaluate(() => window.__hestia.editor.store.undo()); // atalho de programa: o Ctrl+Z do teclado não chega ao canvas no roteiro
    await page.waitForTimeout(200);
    rep.check('um Ctrl+Z desfaz a prumada', (await comps()).length === antes, `${(await comps()).length}`);
  });

  await rep.step('4. Estender até o meio de outro tubo (tê) e Aparar dois tubos que se cruzam (joelho)', async () => {
    await aba('Sistemas');
    await ativar('Tubo', ESG, 100, 0.5);
    await vista(8, -3, 110);
    await traco([[6, -3], [10, -3]]);
    await ativar('Tubo', ESG, 100, 0.5);
    await traco([[8, -5], [8, -3.8]]);
    await aba('Modificar');
    await page.keyboard.press('Escape');
    await botao('Aparar/Estender').click();
    await page.locator('#opt-trimmode').selectOption('unico');
    await clickWorld(page, 7, -3);
    for (const c of await tubos(ESG)) console.log('  tubo', c.id, JSON.stringify(await extremos(c.id)));
    await clickWorld(page, 8, -4.9);
    await page.waitForTimeout(300);
    console.log('  status:', await status());
    const te = (await comps()).filter((c) => /esgoto_te$/.test(c.f));
    rep.check('tê criado e ramal ligado', te.length === 1, `${te.length}`);
    rep.check('rede limpa depois do Estender', (await rede()).length === 0, (await rede()).join(','));
    await shot('05-estender-te');
    await aba('Sistemas');
    await ativar('Tubo', ESG, 100, 0.5);
    await vista(14, 0, 110);
    await traco([[12, 0], [16, 0]]);
    await ativar('Tubo', ESG, 100, 0.5);
    await traco([[14, -2], [14, 2]]);
    await aba('Modificar');
    await page.keyboard.press('Escape');
    await botao('Aparar/Estender').click();
    await page.locator('#opt-trimmode').selectOption('canto');
    await clickWorld(page, 13, 0);
    await clickWorld(page, 14, 1);
    const joelhos = (await comps()).filter((c) => /joelho90/.test(c.f)).length;
    rep.check('joelho fechou o canto', joelhos >= 2, `${joelhos}`);
    rep.check('rede limpa depois do Aparar', (await rede()).length === 0, (await rede()).join(','));
    await shot('06-aparar-canto');
  });

  await rep.step('5. Dividir com luva', async () => {
    await aba('Sistemas');
    await ativar('Tubo', ESG, 100, 0.5);
    await vista(20, 0, 110);
    await traco([[18, 0], [22, 0]]);
    await aba('Modificar');
    await page.keyboard.press('Escape');
    console.log('  botoes:', (await page.locator('button:visible').allInnerTexts()).filter((t) => /Divid|Aparar|Alinhar|Unir/.test(t)).join('|'));
    await botao('Dividir elemento').click();
    await page.locator('#opt-splittubo').selectOption('luva');
    await clickWorld(page, 20, 0);
    const luvas = (await comps()).filter((c) => /esgoto_luva$/.test(c.f)).length;
    rep.check('luva inserida no corte', luvas === 1, `${luvas}`);
    rep.check('rede limpa', (await rede()).length === 0, (await rede()).join(','));
    await shot('07-dividir-luva');
  });

  await rep.step('6. elétrica: eletroduto rígido em L (ponta arrastada, Dividir com luva) e corrugado (ponta arrastada)', async () => {
    await aba('Sistemas');
    await ativar('Eletroduto', ETUBO, 20, 0.5);
    await vista(26, 1, 110);
    await traco([[24, 0], [26, 0], [26, 2]]);
    const r = (await tubos(ETUBO))[0];
    await selecionar(r.id);
    await arrastar([26, 0], [26.5, 0]);
    const curva = (await comps()).find((c) => /curva90/.test(c.f));
    rep.check('curva acompanhou a ponta', curva && Math.abs(curva.x - 26.5) < 0.02, `${curva?.x}`);
    rep.check('rede limpa (rígido)', (await rede()).length === 0, (await rede()).join(','));
    await shot('08-eletroduto-rigido');
    await aba('Modificar');
    await page.keyboard.press('Escape');
    await botao('Dividir elemento').click();
    await clickWorld(page, 25, 0);
    rep.check('luva do eletroduto', (await comps()).some((c) => /eletrica_luva$/.test(c.f)), await status());
    await aba('Sistemas');
    await ativar('Eletroduto', CORR, 20, 0.5);
    await vista(32, 1, 110);
    await traco([[30, 0], [32, 0], [32, 2]]);
    const c = (await tubos(CORR));
    rep.check('2 trechos corrugados', c.length === 2, `${c.length}`);
    await selecionar(c[1].id);
    await arrastar([32, 2], [32, 2.6]);
    rep.check('rede limpa (corrugado)', (await rede()).length === 0, (await rede()).join(','));
    await shot('09-corrugado');
  });
} finally {
  rep.check('sem erros de console', erros.length === 0, erros.slice(0, 3).join(' | '));
  await browser.close();
  rep.summary();
  process.exitCode = rep.steps.every((s) => s.status === 'PASS') ? 0 : 1;
}
