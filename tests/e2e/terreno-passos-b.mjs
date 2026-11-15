// Passos 4 a 6 do roteiro B.5 (rótulos de curva, corte com solo, plataforma, corte e aterro).
import { aba, botao, clicar, digitar, medirDesenho, paraTela, shot, terreno } from './terreno-base.mjs';
import { abrirPlanta, tempos } from './terreno-passos-a.mjs';

const ARQ = (page) => page.evaluate(() => window.__hestia.editor.project);
export const nPontos = (n) => Number(n.replace(/\./g, '').replace(',', '.'));

/** Enquadra a planta numa caixa de mundo (gancho: o zoom por roda de mouse é impreciso para um enquadramento repetível). */
export const enquadrar = (page, b) => page.evaluate((b) => window.__hestia.editor.zoomToBox(b), b);

export async function passo4(rep, { page }) {
  await rep.step('4. Rótulo de curva (cotas = z + 740) e corte atravessando o terreno [interface]', async () => {
    await aba(page, 'Massa e terreno');
    await botao(page, 'Rótulo de curva');
    await clicar(page, 10, 35);
    await clicar(page, 92, 35);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const t = await terreno(page);
    rep.check('a linha de rótulo foi gravada', t.linhasRotulo.length === 4, JSON.stringify(t.linhasRotulo));
    await enquadrar(page, { minX: 28, minY: 31, maxX: 42, maxY: 39 });
    await page.waitForTimeout(700);
    // Os rótulos HTML só são realinhados no quadro seguinte ao zoom (defeito do PlanLabels, ver o relatório): um movimento do mouse repinta.
    await page.mouse.move(900, 400);
    await page.waitForTimeout(300);
    await page.mouse.move(905, 405);
    await page.locator('.labels .plan-note:visible').first().waitFor({ timeout: 5000 }).catch(() => {});
    const textos = await page.locator('.labels .plan-note:visible').allTextContents();
    const vals = textos.map((s) => nPontos(s.replace(/\s*m$/, '')));
    const zs = (await ARQ(page)).elements;
    const curvas = Object.values(zs).find((e) => e.kind === 'terrain').curvas.map((c) => c.z + 740);
    rep.check('há rótulos de cota visíveis na planta', vals.length >= 1, textos.join(' | '));
    rep.check('cada rótulo é z + 740 de uma curva', vals.length > 0 && vals.every((v) => curvas.some((c) => Math.abs(c - v) < 0.006)), textos.join(' | '));
    rep.check('os rótulos são de curvas mestras (múltiplos de 5 acima do zero: 745 e 750)', vals.length > 0 && vals.every((v) => v % 5 === 0), vals.join(','));
    await shot(page, '04-rotulos.png');

    // Corte pela ferramenta Corte da faixa Vista: dois cliques; o corte abre sozinho.
    await page.evaluate(() => window.__hestia.editor.zoomExtents());
    await page.waitForTimeout(500);
    await aba(page, 'Vista');
    await botao(page, 'Corte');
    await clicar(page, 0, 35);
    const ms = await medirDesenho(page, () => clicar(page, 100, 35), { calmaMs: 700 });
    tempos.aberturaDoCorte = ms;
    await page.waitForTimeout(800);
    const vista = await page.evaluate(() => window.__hestia.useUi.getState().view);
    rep.check('o corte abriu na área central', vista === 'section', vista);
    await shot(page, '04-corte.png');
  });
}

export async function passo5(rep, { page }) {
  await rep.step('5. Plataforma 10x10 no meio, 1 m abaixo da cota local; degrau e perfil existente no corte [interface]', async () => {
    await abrirPlanta(page);
    await page.waitForTimeout(500);
    const p = await paraTela(page, 50, 35);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(400);
    const barra = await page.evaluate(() => document.body.innerText.match(/z terreno ([\d.,]+) m/)?.[1] ?? '');
    const local = nPontos(barra);
    rep.check('a barra de status mostra a cota do terreno sob o cursor', Number.isFinite(local) && local > 740, `"${barra}"`);
    await enquadrar(page, { minX: 38, minY: 28, maxX: 62, maxY: 42 });
    await page.waitForTimeout(500);
    await aba(page, 'Massa e terreno');
    await botao(page, 'Plataforma');
    await digitar(page.locator('#opt-rg-cota'), (local - 1).toFixed(2).replace('.', ','));
    for (const [x, y] of [[45, 30], [55, 30], [55, 40], [45, 40]]) await clicar(page, x, y);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const rg = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'terrainRegion').map((r) => ({ papel: r.papel, cota: r.cota, n: r.contorno.length, c: r.contorno.map((q) => [q.x, q.y]) })));
    rep.check('uma região de plataforma de 4 vértices', rg.length === 1 && rg[0].papel === 'plataforma' && rg[0].n === 4, JSON.stringify(rg));
    rep.check('cota da plataforma = cota local - 1 (projeto = exibida - 740)', rg.length === 1 && Math.abs(rg[0].cota + 740 - (local - 1)) < 0.011, `cota ${rg[0]?.cota}, local ${local}`);
    await page.keyboard.press('Escape');
    // Reabre o corte: agora mostra o degrau da plataforma e o perfil existente tracejado.
    await page.getByRole('tab', { name: /Corte A/ }).click();
    await page.waitForTimeout(2500);
    await shot(page, '05-plataforma-corte-geral.png');
    // Aproxima do degrau (coordenadas do corte: s ao longo da linha, z do projeto).
    await enquadrar(page, { minX: 36, minY: 8, maxX: 64, maxY: 14 });
    await page.waitForTimeout(1200);
    await page.mouse.move(900, 400);
    await page.mouse.move(905, 405);
    await page.waitForTimeout(500);
    await shot(page, '05-plataforma-corte.png');
  });
}

export async function passo6(rep, { page }) {
  await rep.step('6. Corte e aterro: tabela com o volume e mapa na planta [interface]', async () => {
    await abrirPlanta(page);
    await page.waitForTimeout(400);
    await aba(page, 'Massa e terreno');
    await botao(page, 'Corte e aterro');
    await page.waitForTimeout(900);
    const texto = await page.locator('[role=dialog]').last().innerText();
    await shot(page, '06-tabela-corte-aterro.png');
    rep.check('a tabela lista a plataforma', /Plataforma/.test(texto), texto.replace(/\n+/g, ' | ').slice(0, 200));
    const celulas = await page.locator('[role=dialog] tbody tr', { hasText: 'Plataforma 1' }).first().locator('td').allTextContents();
    const [area, , corte, aterro] = celulas.slice(3).map(nPontos);
    rep.check('área da plataforma ~100 m² (cliques de mouse com snap, tolerância 2 %)', Math.abs(area - 100) < 2, String(area));
    rep.check('volume de corte da plataforma entre 80 e 105 m³ (1 m sob um topo quase plano)', corte > 80 && corte < 105, `corte ${corte}`);
    rep.check('aterro da plataforma ~0 (o topo do morro é o ponto mais alto)', aterro < 1, `aterro ${aterro}`);
    await page.getByRole('button', { name: /Fechar/ }).last().click();
    await page.waitForTimeout(300);
    await botao(page, 'Mapa de corte e aterro');
    await enquadrar(page, { minX: 25, minY: 15, maxX: 75, maxY: 55 });
    await page.waitForTimeout(1500);
    await shot(page, '06-mapa.png');
  });
}
