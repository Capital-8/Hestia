// Conformidade entre conexões no navegador (fase 4, ficha F1): água fria soldável Krona DN 25 em L (joelho no canto), trecho selecionado
// e trocado para DN 32 pelo painel de propriedades. Confere que existe TUBO entre o joelho e a redução (nunca peça com peça), que a
// Verificar rede não acusa `conexoes_coladas` nem `conexao_afastada`, e que um Ctrl+Z volta tudo em um passo. Traçado só pelo mouse;
// atalhos de programa: enquadramento da vista (setViewport) e leitura do estado do projeto (store) para conferir o resultado.
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5224/?debug=1' node tests/e2e/conexoes-coladas.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5224/?debug=1';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/-home-user-Hestia/e0b36f0f-5cd5-5bfc-b964-572e233c1fd8/scratchpad/conexoes-coladas';
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

const SOL = 'fam_krona_soldavel_tubo_corte';
const JOE = 'fam_krona_soldavel_joelho90';
const RED = 'fam_krona_soldavel_luva_reducao';
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, DN: e.values?.DN, L: e.values?.L, x: e.x, y: e.y, z: e.z, lig: Object.values(e.ligacoes ?? {}).map((l) => l.componenteId) })));
const snapshot = () => page.evaluate(() => JSON.stringify(window.__hestia.editor.store.project.elements));
const perto = (v, m) => Math.abs(v - m) < 0.05;
const status = () => page.evaluate(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); });
const vista = (cx, cy, zoom = 160) => page.evaluate(([cx, cy, zoom]) => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), cx, cy, zoom }); }, [cx, cy, zoom]);
const aba = async (nome) => { await page.locator('.ribbon-tabs .rtab:visible', { hasText: new RegExp(`^${nome}$`) }).first().click(); await page.waitForTimeout(150); };
const botao = (nome) => page.getByRole('button', { name: nome, exact: true }).first();
const escolhe = async (sel, valor) => { await page.locator(sel).selectOption(valor); await page.waitForTimeout(300); };
const verificar = async () => {
  await aba('Sistemas');
  await botao('Verificar rede').click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]') !== null, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return (await page.locator('[role="dialog"] li, [role="dialog"] tr').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
};
const fecharDialogo = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
const desfazer = async () => { await clickWorld(page, -20, -20); await page.keyboard.press('Control+z'); await page.waitForTimeout(500); };
const selecionadosN = () => page.evaluate(() => window.__hestia.useUi.getState().selection.length);

/** Seleciona o trecho vertical (x = 1, y de 0 a 1): clique no meio; se não pegar, janela; se não, "Ir para" do Verificar rede. */
async function selecionaTrechoDoJoelho() {
  await page.keyboard.press('Escape');
  await clickWorld(page, 1, 0.5);
  await page.waitForTimeout(300);
  if ((await selecionadosN()) === 0) {
    info('clique no meio do trecho não selecionou; tentando janela');
    const a = await worldToPage(page, 0.8, 0.12);
    const b = await worldToPage(page, 1.2, 0.95);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(400);
  }
  if ((await selecionadosN()) === 0) {
    info('janela não selecionou; seleção pelo "Ir para" do Verificar rede');
    const alvo = (await comps()).filter((c) => c.f === SOL && perto(c.x, 1) && c.y > 0.0).map((c) => c.id);
    for (let i = 0; i < 12 && (await selecionadosN()) === 0; i++) {
      await verificar();
      const links = page.locator('[role="dialog"] button, [role="dialog"] a').filter({ hasText: /^\s*Ir para\s*$/ });
      if (i >= (await links.count())) break;
      await links.nth(i).click();
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => window.__hestia.useUi.getState().selection);
      if (!(s.length === 1 && alvo.includes(s[0]))) { await page.evaluate(() => window.__hestia.useUi.getState().setSelection?.([])); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
    }
    await fecharDialogo();
  }
  return selecionadosN();
}

try {
  await rep.step('1. Água fria soldável Krona DN 25 em L: trecho, joelho 90° e trecho', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await aba('Sistemas');
    await botao('Tubo').click();
    await page.waitForSelector('#place-tubo-familia', { timeout: 15_000 });
    await page.locator('#place-tubo-familia').selectOption(SOL);
    await page.waitForTimeout(200);
    await page.locator('#place-tubo-dn').selectOption('25');
    await page.waitForTimeout(200);
    await vista(0.5, 0.5);
    await clickWorld(page, 0, 0);
    await clickWorld(page, 1, 0);
    await clickWorld(page, 1, 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const c = await comps();
    const tubos = c.filter((x) => x.f === SOL);
    rep.check('2 trechos DN 25 e 1 joelho 90° no canto (1; 0)', tubos.length === 2 && tubos.every((t) => t.DN === 25) && c.some((x) => x.f === JOE && perto(x.x, 1) && perto(x.y, 0)), `${tubos.length} trechos; joelho ${c.filter((x) => x.f === JOE).length}`);
    await shot('01-L-DN25');
    const itens = await verificar();
    info(`Verificar rede (L antes): ${itens.join(' | ').slice(0, 200)}`);
    rep.check('L antes da troca: sem afastada, incompatível nem coladas', !itens.some((x) => /afastad|incompat|colad/i.test(x)), itens.join(' | ').slice(0, 200));
    await fecharDialogo();
  });

  await rep.step('2. Seleciona o trecho que sai do joelho e troca para DN 32 pelo painel', async () => {
    await page.keyboard.press('Escape');
    const n = await selecionaTrechoDoJoelho();
    info(`itens selecionados: ${n}`);
    await page.waitForSelector('#p-comp-type', { timeout: 10_000 }).catch(() => {});
    rep.check('painel do trecho com campo Tipo (bitola)', (await page.locator('#p-comp-type').count()) === 1);
    const snap = await snapshot();
    const antes = await comps();
    await escolhe('#p-comp-type', 'DN 32');
    await page.waitForTimeout(600);
    const depois = await comps();
    const idsAntes = new Set(antes.map((x) => x.id));
    const novos = depois.filter((x) => !idsAntes.has(x.id));
    info(`novos: ${novos.map((x) => `${x.f.replace('fam_krona_soldavel_', '')}(DN ${x.DN}, L ${x.L ? Number(x.L).toFixed(1) : '-'})`).join(', ') || 'nenhum'}; status: ${(await status()).slice(0, 160)}`);
    rep.check('trecho virou DN 32', depois.some((x) => x.f === SOL && x.DN === 32));
    const red = depois.find((x) => x.f === RED);
    const curto = depois.find((x) => x.f === SOL && x.DN === 25 && /_tubo_/.test(x.id));
    rep.check('redução (luva de redução) entrou', !!red);
    rep.check('existe um TUBO curto de DN 25 entre o joelho e a redução (id *_tubo_*)', !!curto, curto ? `L ${Number(curto.L).toFixed(1)} mm` : 'sem tubo curto');
    rep.check('o tubo curto tem pelo menos 10 mm (mínimo provisório CONFERIR)', !!curto && Number(curto.L) >= 10 - 1e-6, curto ? `L ${Number(curto.L).toFixed(2)}` : '');
    const joelho = depois.find((x) => x.f === JOE);
    rep.check('a redução NÃO está ligada direto ao joelho (nenhuma peça com peça)', !!joelho && !!red && !joelho.lig.includes(red.id) && !red.lig.includes(joelho.id), '');
    rep.check('o tubo curto liga joelho e redução', !!joelho && !!red && !!curto && curto.lig.includes(joelho.id) && curto.lig.includes(red.id), '');
    await vista(1, 0.05, 700);
    await shot('02-depois-DN32-detalhe');
    await vista(0.5, 0.5);
    await shot('02-depois-DN32');
    await page.evaluate((s) => { window.__snapAntes = s; }, snap);
  });

  await rep.step('3. Verificar rede: sem conexoes_coladas nem conexao_afastada', async () => {
    const itens = await verificar();
    info(`Verificar rede após a troca: ${itens.filter((x) => !/aberta/i.test(x)).join(' | ') || 'só pontas abertas'}`);
    rep.check('sem "Conexões coladas"', !itens.some((x) => /colad/i.test(x)), itens.filter((x) => /colad/i.test(x)).join(' | ').slice(0, 200));
    rep.check('sem "afastada" (soldável: luva de redução, recuo com sinal)', !itens.some((x) => /afastad/i.test(x)), itens.filter((x) => /afastad/i.test(x)).join(' | ').slice(0, 200) || 'sem afastada');
    rep.check('sem "incompatível" (bolsa em bolsa)', !itens.some((x) => /incompat/i.test(x)), itens.filter((x) => /incompat/i.test(x)).join(' | ').slice(0, 200) || 'sem incompatível');
    await shot('03-verificar-rede');
    await fecharDialogo();
  });

  await rep.step('4. Um Ctrl+Z volta a cena inteira (uma entrada no desfazer)', async () => {
    const snap = await page.evaluate(() => window.__snapAntes);
    await desfazer();
    const igual = (await snapshot()) === snap;
    rep.check('estado igual ao de antes da troca', igual, igual ? '' : 'estado difere');
    rep.check('sem tubo curto nem redução depois do Ctrl+Z', !(await comps()).some((x) => x.f === RED || /_tubo_/.test(x.id)));
    await shot('04-desfeito');
  });

  rep.check('sem erros no console do navegador', erros.length === 0, erros.slice(0, 2).join(' | '));
} finally {
  rep.summary();
  await browser.close();
  process.exit(rep.steps.some((s) => s.status !== 'PASS') ? 1 : 0);
}
