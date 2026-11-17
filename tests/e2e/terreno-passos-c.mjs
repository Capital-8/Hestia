// Passos 7 a 9 do roteiro B.5 (lote por tabela com recuos, índices do lote, gravidade).
import { aba, botao, clicar, digitar, menuDividido, paraTela, shot } from './terreno-base.mjs';
import { abreVista3d, perimetroPorPontos, pressTool } from './helpers.mjs';
import { enquadrar, nPontos } from './terreno-passos-b.mjs';
import { abrirPlanta } from './terreno-passos-a.mjs';

const lote = (page) => page.evaluate(() => {
  const l = Object.values(window.__hestia.editor.project.elements).find((e) => e.kind === 'lot');
  return l ? { id: l.id, contorno: l.contorno.map((q) => [q.x, q.y]), lados: l.lados } : null;
});

export async function passo7(rep, { page }) {
  await rep.step('7. Linhas de propriedade > Por tabela: retângulo 12 x 30, fechamento zero, recuos 5 / 1,5 / 3, edificável 198 m² [interface]', async () => {
    await aba(page, 'Massa e terreno');
    await menuDividido(page, 'Linhas de propriedade', 'Por tabela…');
    await page.locator('#rumo-x').waitFor();
    await digitar(page.locator('#rumo-x'), 14);
    await digitar(page.locator('#rumo-y'), 22);
    const linhas = [[90, 12], [0, 30], [270, 12], [180, 30]];
    for (let i = 0; i < 4; i++) {
      await digitar(page.locator(`#rumo-az-${i}`), linhas[i][0]);
      await digitar(page.locator(`#rumo-d-${i}`), linhas[i][1]);
    }
    await page.waitForTimeout(300);
    const fech = await page.getByText(/Erro de fechamento:/).innerText();
    rep.check('erro de fechamento zero', /0,00 m/.test(fech), fech);
    await page.getByRole('button', { name: 'Criar lote' }).click();
    await page.waitForTimeout(700);
    const l = await lote(page);
    rep.check('o lote foi criado com 4 vértices', l?.contorno.length === 4, JSON.stringify(l?.contorno));
    // Direção no projeto = azimute + norte verdadeiro (E4): com norte 30°, o lado de azimute 90° sai a 120° do +y, sentido horário.
    const [a, b] = [l.contorno[0], l.contorno[1]];
    const az = (((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI) + 360) % 360;
    rep.check('primeiro lado a 120° (azimute 90° + norte 30°, regra E4)', Math.abs(az - 120) < 0.01, `${az.toFixed(3)}°`);
    // Recuos pelo painel de propriedades do lote: lado 1 frente, 2 e 4 laterais, 3 fundo.
    await page.locator('select[aria-label="Papel do lado 3"]').selectOption('fundo');
    const recuos = { 1: '5', 2: '1,5', 3: '3', 4: '1,5' };
    for (const [n, v] of Object.entries(recuos)) {
      const campo = page.locator(`select[aria-label="Papel do lado ${n}"]`).locator('..').locator('input');
      await campo.scrollIntoViewIfNeeded();
      await digitar(campo, v);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(400);
    const area = await page.getByText('Área edificável', { exact: true }).locator('xpath=following-sibling::*[1]').innerText().catch(() => '');
    rep.check('área edificável 198 m² no painel do lote', nPontos(area.replace(/\s*m².*/, '')) === 198, `"${area}"`);
    await page.evaluate(() => window.__hestia.editor.zoomExtents());
    await page.waitForTimeout(900);
    await shot(page, '07-lote.png');
    const lf = await lote(page);
    rep.check('papéis e recuos gravados no modelo', JSON.stringify(lf.lados.map((x) => [x.papel, x.recuo])) === JSON.stringify([['frente', 5], ['lateral', 1.5], ['fundo', 3], ['lateral', 1.5]]), JSON.stringify(lf.lados));
  });
}

export async function passo8(rep, { page }) {
  await rep.step('8. Laje 9 x 10 no lote; Índices do lote: taxa de ocupação 25 % [interface + gancho para a laje]', async () => {
    const l = await lote(page);
    const Q = l.contorno;
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
    const n = (v) => { const m = Math.hypot(v[0], v[1]); return [v[0] / m, v[1] / m]; };
    const u = n(sub(Q[1], Q[0]));
    const v = n(sub(Q[2], Q[1]));
    const P = (a, b) => [Q[0][0] + u[0] * a + v[0] * b, Q[0][1] + u[1] * a + v[1] * b];
    const anel = [P(1.5, 6), P(10.5, 6), P(10.5, 16), P(1.5, 16)];
    const r = await perimetroPorPontos(page, 'slab', anel);
    rep.check('a laje 9 x 10 foi criada dentro do lote (gancho do modo Criar perímetro)', r.ok, r.msg?.key ?? JSON.stringify(r.msg));
    await aba(page, 'Massa e terreno');
    await botao(page, 'Índices do lote');
    await page.waitForTimeout(1000);
    const texto = await page.locator('[role=dialog]').last().innerText();
    await shot(page, '08-indices.png');
    const linha = await page.locator('[role=dialog] tbody tr').first().locator('td').allTextContents();
    rep.check('a tabela traz uma linha para o lote', linha.length > 3, linha.join(' | '));
    const pct = /(\d+(?:,\d+)?)\s*%/.exec(linha.join(' | '));
    rep.check('taxa de ocupação 25 % (laje 9 x 10 sobre 360 m²) listada na tabela', !!pct && Math.abs(nPontos(pct[1]) - 25) < 0.01, linha.join(' | '));
    void texto;
    await page.getByRole('button', { name: /Fechar/ }).last().click();
  });
}

export async function passo9(rep, { page }) {
  await rep.step('9. Gravidade ligada: a parede nasce com baseOffset = cota do terreno no 1º clique [interface]', async () => {
    const alvo = [75, 22];
    await enquadrar(page, { minX: 70, minY: 17, maxX: 82, maxY: 27 });
    await page.waitForTimeout(700);
    const p = await paraTela(page, alvo[0], alvo[1]);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(500);
    const lido = await page.evaluate(() => document.body.innerText.match(/z terreno ([\d.,]+) m/)?.[1] ?? '');
    const exibida = nPontos(lido);
    rep.check('a barra de status dá a cota do terreno no ponto do 1º clique', exibida > 740, `"${lido}"`);
    await page.getByRole('button', { name: /^Gravidade/ }).click();
    await page.waitForTimeout(200);
    await pressTool(page, 'w');
    await clicar(page, alvo[0], alvo[1]);
    await clicar(page, alvo[0] + 8, alvo[1]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const w = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'wall').map((e) => ({ a: e.a, baseOffset: e.baseOffset })));
    rep.check('uma parede foi criada', w.length === 1, String(w.length));
    const esperado = exibida - 740;
    rep.check('baseOffset = cota do terreno no 1º clique (tolerância 2 cm)', w.length === 1 && Math.abs(w[0].baseOffset - esperado) < 0.02, `baseOffset ${w[0]?.baseOffset}, terreno ${esperado}`);
    // A parede (base a ~7 m, acima do plano de corte da planta) não aparece na planta: mostra-se o painel de propriedades dela e o 3D.
    const idParede = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).find((e) => e.kind === 'wall').id);
    await page.evaluate((id) => window.__hestia.useUi.setState({ selection: [id] }), idParede);
    await enquadrar(page, { minX: 66, minY: 15, maxX: 90, maxY: 29 });
    await page.waitForTimeout(900);
    await shot(page, '09-gravidade.png');
    await abreVista3d(page);
    await page.waitForTimeout(1500);
    await page.locator('.navbar button[aria-label="Enquadrar tudo"]').click();
    await page.waitForTimeout(1500);
    await shot(page, '09-gravidade-3d.png');
    await abrirPlanta(page);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Gravidade/ }).click();
  });
}
