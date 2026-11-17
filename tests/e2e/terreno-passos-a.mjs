// Passos 1 a 4 do roteiro B.5 (localização, importação, edição de ponto, rótulos e corte).
import { abreVista3d } from './helpers.mjs';
import { aba, botao, clicar, digitar, DXF, medirDesenho, menuDividido, paraTela, shot, terreno } from './terreno-base.mjs';

/** Tempos medidos (ms), preenchidos pelos passos e impressos no fim. */
export const tempos = {};

/**
 * Abre o 3D e volta à planta. Com as multitelas (integração com a main) o duplo clique no item da árvore deixou de abrir a vista em
 * ambiente sem painéis abertos: passa pela mesma API que a barra de vistas usa.
 */
export const abrir3d = (page) => abreVista3d(page);
export const abrirPlanta = (page) => page.evaluate(() => window.__hestia.editor.setView('plan'));

export async function passo1(rep, { page }) {
  await rep.step('1. Gerenciar > Localização (norte 30°, cota zero 740) [interface]', async () => {
    await aba(page, 'Gerenciar');
    await botao(page, 'Localização');
    await page.locator('#loc-nv').waitFor();
    await digitar(page.locator('#loc-nv'), '30');
    await digitar(page.locator('#loc-z'), '740');
    await page.waitForTimeout(150);
    await shot(page, '01-localizacao.png');
    await page.getByRole('button', { name: 'Aplicar' }).last().click();
    await page.waitForTimeout(250);
    const l = await page.evaluate(() => window.__hestia.editor.project.localizacao);
    rep.check('localização gravada com cota zero 740', l?.cotaZero === 740, JSON.stringify(l));
    rep.check('norte verdadeiro 30° (em radianos)', Math.abs((l?.norteVerdadeiro ?? 0) - Math.PI / 6) < 1e-9, String(l?.norteVerdadeiro));
  });
}

export async function passo2(rep, { page }) {
  await rep.step('2. Importar levantamento DXF; curvas na planta e terreno no 3D [interface]', async () => {
    await aba(page, 'Massa e terreno');
    await menuDividido(page, 'Topografia', 'Importar levantamento…');
    const entrada = page.locator('input[accept=".dxf,.csv"]');
    await entrada.setInputFiles(DXF);
    await page.getByText(/Vértices: \d+ de/).waitFor();
    const resumo = await page.getByText(/Vértices: \d+ de/).innerText();
    rep.check('diálogo lê 12 curvas e 40 pontos', (await page.getByText(/12 \(0 pontos, 12 de cota constante/).count()) > 0 && (await page.getByText(/40 \(40 pontos/).count()) > 0, resumo);
    const ms = await medirDesenho(page, () => page.getByRole('button', { name: 'Importar', exact: true }).click());
    tempos.primeiroDesenhoPlantaImportado = ms;
    const t = await terreno(page);
    rep.check('terreno criado (40 pontos, 12 curvas)', !!t && t.pontos.length / 3 === 40 && t.curvas === 12, t ? `${t.pontos.length / 3} pontos, ${t.curvas} curvas` : 'sem terreno');
    await page.locator('.navbar button[aria-label="Enquadrar tudo"]').click();
    await page.waitForTimeout(500);
    const vpNav = await page.evaluate(() => window.__hestia.editor.viewport().zoom);
    rep.check('Enquadrar tudo pela barra de navegação (clique real) muda o zoom', vpNav !== 60, `zoom ${vpNav}`);
    if (vpNav === 60) { await page.evaluate(() => window.__hestia.editor.zoomExtents()); await page.waitForTimeout(500); }
    await shot(page, '02-importado-planta.png');
    const ms3 = await medirDesenho(page, () => abrir3d(page), { sel: '.canvas-wrap canvas' });
    tempos.abertura3dComTerreno = ms3;
    await page.waitForTimeout(800);
    await page.locator('.navbar button[aria-label="Enquadrar tudo"]').click();
    await page.waitForTimeout(1200);
    await shot(page, '02-importado-3d.png');
    await abrirPlanta(page);
    await page.waitForTimeout(500);
  });
}

/** Hash da captura da área da vista: diz se o desenho mudou entre dois instantes. */
const capHash = async (page) => (await page.screenshot({ clip: await page.locator('.canvas-wrap').boundingBox() })).toString('base64').length + ':' + (await page.screenshot({ clip: await page.locator('.canvas-wrap').boundingBox() })).toString('base64').slice(2000, 2200);

export async function passo3(rep, { page }) {
  await rep.step('3. Editar terreno: cota de um ponto +2 m, curvas se redesenham, Ctrl+Z [interface]', async () => {
    const t0 = await terreno(page);
    // Ponto do meio da lista, longe das bordas, para o clique não pegar vizinho.
    const i = 20;
    const [x, y, z] = [t0.pontos[i * 3], t0.pontos[i * 3 + 1], t0.pontos[i * 3 + 2]];
    await aba(page, 'Massa e terreno');
    await botao(page, 'Editar terreno');
    await page.waitForTimeout(300);
    const modo = await page.evaluate(() => window.__hestia.editor.activeTool.constructor.name + ':' + window.__hestia.useUi.getState().tool);
    rep.check('ferramenta Editar terreno ativa', /terrainEdit/i.test(modo), modo);
    const antes = await capHash(page);
    await clicar(page, x, y);
    await page.waitForTimeout(250);
    const campo = page.locator('#opt-tn-edit-cota');
    const lido = await campo.inputValue().catch(() => '');
    const exibida = Number(lido.replace(',', '.'));
    rep.check('campo Cota mostra a cota exibida do ponto (z + 740)', Math.abs(exibida - (z + 740)) < 0.0051, `lido "${lido}", z ${z}`);
    await digitar(campo, (exibida + 2).toFixed(3).replace('.', ','));
    await page.waitForTimeout(500);
    const t1 = await terreno(page);
    const dz = t1.pontos[i * 3 + 2] - z;
    rep.check('a cota do ponto subiu 2 m', Math.abs(dz - 2) < 0.006, `delta ${dz}`);
    const depois = await capHash(page);
    rep.check('as curvas se redesenharam (captura diferente)', depois !== antes);
    await shot(page, '03-edicao.png');
    await campo.blur();
    await page.locator('.canvas-wrap').hover();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const t2 = await terreno(page);
    rep.check('Ctrl+Z devolve a cota original', Math.abs(t2.pontos[i * 3 + 2] - z) < 1e-9, `z ${t2.pontos[i * 3 + 2]} (original ${z})`);
    await page.getByRole('button', { name: 'Concluir' }).click();
    await page.waitForTimeout(250);
  });
}
