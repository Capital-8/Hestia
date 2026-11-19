// Subdivisão não altera a superfície (só marca a área); Plataforma altera. Roteiro por dados (papel gravado e cota sob o cursor).
import { abrir, aba, botao, clicar, paraTela } from './terreno-base.mjs';
import { enquadrar, nPontos } from './terreno-passos-b.mjs';

/** Cota do terreno (barra de status) sob um ponto de mundo, em m. */
async function zSob(page, x, y) {
  const p = await paraTela(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(350);
  await page.mouse.move(p.x + 1, p.y + 1);
  await page.waitForTimeout(350);
  const txt = await page.evaluate(() => document.body.innerText.match(/z terreno ([\d.,]+) m/)?.[1] ?? '');
  return nPontos(txt);
}
const regioes = (page) => page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'terrainRegion').map((r) => ({ id: r.id, papel: r.papel, cota: r.cota, inclinacao: r.inclinacao, taludeCorte: r.taludeCorte, taludeAterro: r.taludeAterro, permeavel: r.permeavel })));

/** Pressupõe o projeto com um terreno inclinado (z = 2 + 0,2 x) e a planta aberta. */
export async function passoSubdivisao(rep, { page }) {
  await rep.step('S. Subdivisão só marca a área (superfície intacta); Plataforma → Subdivisão devolve o terreno natural [interface]', async () => {
    await enquadrar(page, { minX: -2, minY: -2, maxX: 42, maxY: 32 });
    await page.waitForTimeout(500);
    const antesA = await zSob(page, 20, 15);
    const antesB = await zSob(page, 32, 15);
    rep.check('terreno natural em A (x=20) e B (x=32): 6,00 e 8,40 (z = 2 + 0,2 x)', Math.abs(antesA - 6) < 0.02 && Math.abs(antesB - 8.4) < 0.02, `${antesA} ${antesB}`);
    await aba(page, 'Massa e terreno');
    await botao(page, 'Subdivisão');
    const predef = await page.evaluate(() => window.__hestia.editor.activeTool.predefinicao);
    rep.check('o botão Subdivisão liga a ferramenta na predefinição subdivisao', predef === 'subdivisao', predef);
    for (const [x, y] of [[15, 10], [25, 10], [25, 20], [15, 20]]) await clicar(page, x, y);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape');
    // Atalho ou item de menu "Região de terreno" (sem escolher predefinição): também nasce em Subdivisão, nunca em Plataforma.
    await page.evaluate(() => { window.__hestia.editor.setTool('select'); window.__hestia.editor.setTool('terrainRegion'); });
    const porAtalho = await page.evaluate(() => window.__hestia.editor.activeTool.predefinicao);
    rep.check('a ferramenta aberta sem escolher predefinição nasce em subdivisao', porAtalho === 'subdivisao', porAtalho);
    await page.keyboard.press('Escape');
    let rg = await regioes(page);
    rep.check('região criada com papel subdivisao, sem plano nem talude, permeável', rg.length === 1 && rg[0].papel === 'subdivisao' && rg[0].cota === 0 && rg[0].inclinacao === 0 && rg[0].taludeCorte === 0 && rg[0].taludeAterro === 0 && rg[0].permeavel === true, JSON.stringify(rg));
    const depoisA = await zSob(page, 20, 15);
    rep.check('a superfície sob a subdivisão continua o terreno natural (6,00)', Math.abs(depoisA - 6) < 0.02, `${depoisA}`);
    // Plataforma a 7,00 m (projeto) no retângulo B, depois trocada para Subdivisão pelo painel.
    await botao(page, 'Plataforma');
    await page.locator('#opt-rg-cota').fill('7,00');
    await page.locator('#opt-rg-cota').press('Enter');
    for (const [x, y] of [[28, 10], [36, 10], [36, 20], [28, 20]]) await clicar(page, x, y);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape');
    rg = await regioes(page);
    const plat = rg.find((r) => r.papel === 'plataforma');
    rep.check('segunda região é plataforma de cota 7,00', !!plat && Math.abs(plat.cota - 7) < 0.011, JSON.stringify(rg));
    const comPlat = await zSob(page, 32, 15);
    rep.check('com a plataforma a superfície sob ela vale 7,00 (o terreno natural era 8,40)', Math.abs(comPlat - 7) < 0.02, `${comPlat}`);
    await page.evaluate((id) => window.__hestia.useUi.setState({ selection: [id] }), plat.id);
    await page.waitForTimeout(500);
    await page.locator('#p-rg-papel').selectOption('subdivisao');
    await page.waitForTimeout(1200);
    rg = await regioes(page);
    const trocada = rg.find((r) => r.id === plat.id);
    rep.check('papel trocado para subdivisao: sem plano e sem talude residuais', trocada.papel === 'subdivisao' && trocada.cota === 0 && trocada.inclinacao === 0 && trocada.taludeCorte === 0 && trocada.taludeAterro === 0 && trocada.permeavel === true, JSON.stringify(trocada));
    const depoisB = await zSob(page, 32, 15);
    rep.check('a superfície voltou ao terreno natural (8,40)', Math.abs(depoisB - 8.4) < 0.02, `${depoisB}`);
  });
}

/** Passo autônomo: projeto novo com um terreno inclinado (z = 2 + 0,2 x). */
export async function subdivisaoCompleta(rep) {
  const ctx = await abrir({ width: 2560 });
  try {
    await ctx.page.evaluate(() => {
      const { editor } = window.__hestia;
      const lv = editor.project.levels[0].id;
      const pontos = [];
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 6; j++) pontos.push(i * 5, j * 5, 2 + 0.2 * i * 5);
      editor.store.exec({ type: 'addTerrain', terrain: { kind: 'terrain', id: 'tnx', levelId: lv, name: 'Terreno', pontos, curvas: [], quebras: [], intervaloCurvas: 1, mestraCada: 5, espessuraBase: 3, mostrarExistente: false, linhasRotulo: [], pontosCotados: [] } });
    });
    await ctx.page.waitForTimeout(3000);
    await passoSubdivisao(rep, ctx);
  } finally {
    await ctx.fechar();
  }
}
