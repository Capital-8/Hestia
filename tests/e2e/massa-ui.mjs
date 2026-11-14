// Teste de interface da massa conceitual no navegador (portão visual da fase 3: fichas U1 e U2, PLANO.md A.6 e emendas E10 a E14).
// Dirige o app só por cliques (faixa, painel de propriedades, diálogos, navegador e vista 3D) e lê `window.__hestia` apenas para
// CONFERIR o resultado. Capturas em docs/massa/evidencias/fase3/. Sai com código 1 se alguma verificação falhar ou houver erro de
// console/página (achados do app entram como FALHA, com o erro completo na lista final).
//   npm run build && node tests/e2e/massa-ui.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { clickWorld, launch, pressTool } from './helpers.mjs';
import { aba, botaoDoPainel, capturar as capturarComum, dialogo, enquadrarPlanta, enquadrarTudo, lerMassas, massasNa3d, resumoErro, servirDist, statusTexto } from './massaHelpers.mjs';

const DIR = path.resolve('docs/massa/evidencias/fase3');
const VIEWPORT = { width: 1440, height: 860 };

let falhas = 0;
/** Erros de console, de página e respostas 4xx/5xx (o servidor local grava os seus 404 aqui também). */
const errosPagina = [];
const check = (nome, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}${extra !== '' ? ` (${extra})` : ''}`);
  if (!ok) falhas++;
};

/** Um passo do roteiro: uma exceção vira uma verificação falha e o roteiro segue (para mostrar os problemas de uma vez). */
async function passo(nome, fn) {
  console.log(`\n== ${nome}`);
  try {
    await fn();
  } catch (e) {
    check(`${nome}: sem exceção`, false, resumoErro(e));
  }
}


const capturar = (page, nome) => capturarComum(page, DIR, nome, check);

const browser = await launch();
const srv = await servirDist(errosPagina);
mkdirSync(DIR, { recursive: true });
let bulboId = null;
let loftId = null;
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errosPagina.push(m.text()); });
  page.on('pageerror', (e) => errosPagina.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errosPagina.push(`[HTTP ${r.status()}] ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?gl=1&debug=1`);
  await page.waitForFunction(() => window.__hestia, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__hestiaKernel?.estado().ativo === true, null, { timeout: 60000 });
  check('kernel ligado no app (ativo)', (await page.evaluate(() => window.__hestiaKernel.estado().ativo)) === true);

  // Projeto novo em branco, pelo menu Arquivo (como o flow.mjs).
  // A tela inicial tem o cartão "Novo projeto"; depois, o botão "Menu Arquivo" da barra de título abre o diálogo do mesmo nome.
  await page.getByRole('button', { name: /Novo projeto/ }).first().click().catch(() => undefined);
  await page.getByRole('button', { name: 'Menu Arquivo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu Arquivo', exact: true }).getByRole('button', { name: 'Novo', exact: true }).click();
  await page.getByRole('button', { name: /Em branco/ }).click();
  await page.waitForTimeout(400);
  check('projeto em branco sem massas', (await lerMassas(page)).length === 0);

  // a. Extrusão: círculo de raio 3 m na origem; altura padrão 9 m.
  await passo('a. Extrusão de um círculo na planta', async () => {
    await aba(page, 'Massa e terreno');
    await page.getByRole('button', { name: 'Massa', exact: true }).click();
    await page.getByRole('button', { name: 'Extrusão', exact: true }).click();
    await clickWorld(page, 0, 0);
    await clickWorld(page, 3, 0);
    const ms = await lerMassas(page);
    check('1 massa no projeto', ms.length === 1, String(ms.length));
    check('massa com 2 seções', ms[0]?.n === 2, String(ms[0]?.n));
    check('altura 9 m (z da última seção)', ms[0] && Math.abs(ms[0].zs[1] - ms[0].zs[0] - 9) < 1e-6, ms[0] ? `${ms[0].zs.join(' / ')}` : '');
    check('perfil circular de raio perto de 3 m', ms[0]?.forma === 'circulo' && Math.abs((ms[0].raio ?? 0) - 3) < 0.05, String(ms[0]?.raio));
    check('centro da extrusão na origem (0, 0)', ms[0] && Math.abs(ms[0].origem.x) < 0.05 && Math.abs(ms[0].origem.y) < 0.05, ms[0] ? `${ms[0].origem.x.toFixed(3)}, ${ms[0].origem.y.toFixed(3)}` : '');
    // ACHADOS DO APP (não do roteiro), verificados de propósito até o app corrigir: na planta, o clique no botão "Enquadrar tudo" da
    // barra de navegação não dispara o botão (o canvas captura o ponteiro, ViewportCanvas.tsx onDown); a ferramenta ativa recebe o
    // clique na posição do botão e fica com um centro pendente ("Clique para definir o raio").
    await page.getByRole('button', { name: /Enquadrar tudo|Zoom to Fit/ }).first().click();
    await page.waitForTimeout(400);
    const vistaNav = await page.evaluate(() => window.__hestia.editor.viewport());
    check('ACHADO: botão "Enquadrar tudo" da barra de navegação enquadra a massa (planta)', Math.abs(vistaNav.cx) < 1 && Math.abs(vistaNav.cy) < 1, `centro ${vistaNav.cx.toFixed(2)}, ${vistaNav.cy.toFixed(2)}`);
    const barra = await statusTexto(page);
    check('ACHADO: o clique no botão não chega à ferramenta Massa', !barra.includes('definir o raio'), barra.slice(0, 60));
    await pressTool(page, 'v');
    await enquadrarPlanta(page);
    await capturar(page, '01-extrusao.png');
  });

  // b. Seleção pelo clique e painel de propriedades: torção total de 90°.
  await passo('b. Propriedades: torção total de 90°', async () => {
    await pressTool(page, 'v');
    await clickWorld(page, 1, 0);
    const sel = await page.evaluate(() => window.__hestia.useUi.getState().selection);
    const id = (await lerMassas(page))[0]?.id;
    check('massa selecionada pelo clique', !!id && sel.includes(id), JSON.stringify(sel));
    check('painel mostra "Torção total (graus)"', await page.locator('#ms-torcao').isVisible());
    check('painel mostra "Arranjo polar"', await page.locator('#ms-arr').isVisible());
    await page.locator('#ms-torcao').fill('90');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const m = (await lerMassas(page))[0];
    check('rotação da última seção = 90° (π/2)', m && Math.abs(m.rot.at(-1) - Math.PI / 2) < 1e-6, m ? String(m.rot.at(-1)) : '');
    check('rotação da primeira seção continua 0', m && Math.abs(m.rot[0]) < 1e-9, m ? String(m.rot[0]) : '');
    await capturar(page, '02-propriedades.png');
  });

  // c. Diálogo "Seções da massa": 2 linhas, adicionar uma seção, aplicar -> 3 seções.
  await passo('c. Diálogo "Seções da massa"', async () => {
    await page.locator('#ms-edit-secoes').click();
    const dlg = dialogo(page, 'Seções da massa');
    await dlg.waitFor({ timeout: 5000 });
    check('diálogo "Seções da massa" aberto', await dlg.isVisible());
    check('tabela com 2 linhas', (await dlg.locator('table tbody tr').count()) === 2);
    check('prévia com 2 seções sobrepostas', (await dlg.locator('svg[aria-label="Planta com 2 seções sobrepostas"]').count()) === 1);
    await capturar(page, '03-secoes.png');
    await dlg.locator('#ms-add').click();
    check('3 linhas depois de "Adicionar seção"', (await dlg.locator('table tbody tr').count()) === 3);
    await dlg.locator('#ms-aplicar').click();
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
    check('diálogo fechou depois de "Aplicar"', (await dlg.count()) === 0);
    const m = (await lerMassas(page))[0];
    check('3 seções no projeto', m?.n === 3, String(m?.n));
  });

  // d. Arranjo polar com 6 cópias pelo painel.
  await passo('d. Arranjo polar com 6 cópias', async () => {
    await page.locator('#ms-arr').check();
    await page.locator('#ms-arr-n').fill('6');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const m = (await lerMassas(page))[0];
    check('arranjo.n === 6', m?.arranjo?.n === 6, String(m?.arranjo?.n));
    await capturar(page, '04-arranjo.png');
  });

  // e. Navegador de projeto: categoria "Massas".
  await passo('e. Navegador: categoria "Massas"', async () => {
    await page.locator('[role="treeitem"][data-node="cat:mass"] .bbox').click();
    await page.waitForTimeout(300);
    const nos = await page.locator('[data-node^="ms:"]').count();
    check('categoria "Massas" lista 1 massa', nos === 1, String(nos));
    await capturar(page, '05-navegador.png');
  });

  // f. Tabela "Massas por pavimento" (Vista > Criar > Tabelas).
  await passo('f. Tabela "Massas por pavimento"', async () => {
    await aba(page, 'Vista');
    await botaoDoPainel(page, 'Criar', 'Tabelas ▾').click();
    await page.getByRole('menuitem', { name: 'Massas por pavimento', exact: true }).click();
    const tab = dialogo(page, 'Massas por pavimento');
    await tab.waitFor({ timeout: 5000 });
    const linhas = await tab.locator('table tbody tr').count();
    check('tabela abre com linhas (kernel ligado)', linhas >= 1, String(linhas));
    await capturar(page, '06-tabela.png');
    await tab.getByRole('button', { name: 'Fechar', exact: true }).first().click();
    await tab.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  });

  // g. Bulbo (5 seções) e loft (abre o diálogo "Seções da massa" sozinho). A vista da extrusão cobre x de -9 a 9 m: os dois cabem nela.
  await passo('g. Bulbo e loft', async () => {
    await enquadrarPlanta(page);
    await aba(page, 'Massa e terreno');
    await page.getByRole('button', { name: 'Massa', exact: true }).click();
    await page.getByRole('button', { name: 'Bulbo', exact: true }).click();
    await clickWorld(page, -6, 0);
    await clickWorld(page, -7.5, 0);
    let ms = await lerMassas(page);
    check('bulbo: 2 massas no projeto', ms.length === 2, String(ms.length));
    const bulbo = ms.at(-1);
    bulboId = bulbo?.id ?? null;
    check('bulbo: 5 seções', bulbo?.n === 5, String(bulbo?.n));
    const raioMax = await page.evaluate((id) => Math.max(...window.__hestia.editor.project.elements[id].secoes.map((s) => s.perfil.raio ?? 0)), bulboId ?? '');
    check('bulbo: raio máximo de 1,5 m (o segundo clique)', Math.abs(raioMax - 1.5) < 0.05, raioMax.toFixed(3));

    await page.getByRole('button', { name: 'Loft', exact: true }).click();
    await clickWorld(page, 6, 0);
    await clickWorld(page, 8, 0);
    await clickWorld(page, 6, 0);
    await clickWorld(page, 7, 0);
    const dlg = dialogo(page, 'Seções da massa');
    await dlg.waitFor({ timeout: 5000 }).catch(() => undefined);
    check('loft: o diálogo "Seções da massa" abre sozinho', await dlg.isVisible().catch(() => false));
    ms = await lerMassas(page);
    check('loft: 3 massas no projeto', ms.length === 3, String(ms.length));
    loftId = ms.at(-1)?.id ?? null;
    await dlg.getByRole('button', { name: 'Cancelar', exact: true }).click().catch(() => undefined);
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
    await enquadrarPlanta(page);
    await capturar(page, '07-loft-bulbo.png');
  });

  // h. Desfazer reverte a última criação (o loft).
  await passo('h. Desfazer (Ctrl+Z)', async () => {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    const ms = await lerMassas(page);
    check('contagem de massas caiu de 3 para 2', ms.length === 2, String(ms.length));
    check('a massa desfeita é a última criada (o loft)', !ms.some((m) => m.id === loftId));
  });

  // i. Vista 3D (Vista > Criar > Vista 3D) com as massas à vista.
  await passo('i. Vista 3D', async () => {
    await aba(page, 'Vista');
    await botaoDoPainel(page, 'Criar', 'Vista 3D').click();
    await page.waitForFunction(() => window.__hestia3dModel !== undefined, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    await enquadrarTudo(page);
    check('3D: massas na cena', (await massasNa3d(page)) >= 1, String(await massasNa3d(page)));
    await capturar(page, '08-3d.png');
  });

  // j. "Mostrar massa" na vista 3D: desliga (somem) e liga (voltam).
  await passo('j. Mostrar massa (3D)', async () => {
    await aba(page, 'Massa e terreno');
    const mostrar = botaoDoPainel(page, 'Modelo de massa', 'Mostrar massa');
    check('"Mostrar massa" começa ligado', (await mostrar.getAttribute('aria-pressed')) === 'true');
    await mostrar.click();
    await page.waitForFunction(() => (window.__hestia3dModel?.massaNaCena ?? []).length === 0, null, { timeout: 15000 }).catch(() => undefined);
    check('3D: massas somem com "Mostrar massa" desligado', (await massasNa3d(page)) === 0, String(await massasNa3d(page)));
    check('"Mostrar massa" fica sem pressionado', (await mostrar.getAttribute('aria-pressed')) !== 'true');
    await capturar(page, '09-3d-massa-oculta.png');
    await mostrar.click();
    await page.waitForFunction(() => (window.__hestia3dModel?.massaNaCena ?? []).length > 0, null, { timeout: 15000 }).catch(() => undefined);
    check('3D: massas voltam com "Mostrar massa" ligado', (await massasNa3d(page)) >= 1, String(await massasNa3d(page)));
    await capturar(page, '10-3d-massa-visivel.png');
  });

  check('kernel continua ativo no fim', (await page.evaluate(() => window.__hestiaKernel.estado().ativo)) === true);
} catch (e) {
  check('roteiro sem exceção', false, resumoErro(e));
} finally {
  await browser.close();
  srv.close();
}

console.log(`\n== ERROS DE CONSOLE E DE PÁGINA (${errosPagina.length})`);
for (const e of errosPagina) console.log(`- ${e}`);
check('sem erro de console nem de página', errosPagina.length === 0, `${errosPagina.length} erro(s)`);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${falhas} falha(s) de verificação ou erro(s) de console`);
process.exit(falhas === 0 ? 0 : 1);
