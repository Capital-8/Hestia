// Aceite final da massa conceitual no navegador (ficha Q1; PLANO.md B.5 "Roteiro de aceite final" e A.8 item 8). Dirige o app construído por
// cliques (faixa, barra de opções, painel de propriedades, diálogos, menu Arquivo), sobre servidor http local e kernel Rust ligado, a partir de um
// projeto em branco. `window.__hestia.editor.project` só CONFERE. Onde a interface não oferece o gesto (criar níveis, abrir o corte pelo
// navegador, criar a elevação), o roteiro usa o comando do modelo e diz isso no passo. Números exatos do kernel vêm de `kernelEmNode`.
// Capturas em docs/massa/evidencias/final/. Sai com código 1 se algo falhar ou houver erro de console.
//   npm run build && node tests/e2e/massa.mjs
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { abreVista3d, clickWorld, launch, pressTool, worldToPage } from './helpers.mjs';
import { aba, areaDoAnel, botaoDoPainel, capturar as capturarComum, coletarErros, criarRelatorio, dialogo, enquadrarPlanta, enquadrarTudo, iniciarServidorDev, kernelEmNode, lerMassas, massasNa3d, novoProjetoEmBranco, numeroDoTexto, resumoErro, selecionarMassa, servirDist } from './massaHelpers.mjs';

const DIR = path.resolve('docs/massa/evidencias/final');
const SALVO = '/tmp/hestia-massa-e2e/massa-final.hestia.json';
const VIEWPORT = { width: 1440, height: 860 };
const LADO = 8;
const ALTURA_TORRE = 30;
const rel = criarRelatorio();
const { check, errosPagina } = rel;
const tamanhos = {};
const capturar = async (page, nome) => { tamanhos[nome] = await capturarComum(page, DIR, nome, check); check(`${nome}: PNG até 400 kB`, tamanhos[nome] <= 400 * 1024, `${(tamanhos[nome] / 1024).toFixed(0)} kB`); };

async function passo(nome, fn) {
  console.log(`\n== ${nome}`);
  try {
    await fn();
  } catch (e) {
    check(`${nome}: sem exceção`, false, resumoErro(e));
  }
}

/** Lê o projeto do editor (só conferência): massas completas, níveis, pisos, paredes e vistas. */
const lerProjeto = (page) => page.evaluate(() => {
  const p = window.__hestia.editor.project;
  const por = (k) => Object.values(p.elements).filter((e) => e.kind === k);
  return JSON.parse(JSON.stringify({ massas: por('mass').sort((a, b) => a.order - b.order), pisos: por('floor'), paredes: por('wall'), niveis: p.levels, vistas: p.views ?? [], pranchas: p.sheets ?? [] }));
});

/** Abre uma página no app, espera o kernel (ou não) e entrega a lista de erros dela. */
async function abrirApp(ctx, srv, erros, { kernel = true } = {}) {
  const page = await ctx.newPage();
  coletarErros(page, erros);
  // Servidor de desenvolvimento (sem kernel): o vite não tem o 204 do favicon que o servidor de teste dá.
  if (!kernel) await page.route('**/favicon.ico', (r) => r.fulfill({ status: 204 }));
  await page.goto(kernel ? `http://127.0.0.1:${srv.address().port}/index.html?gl=1&debug=1` : `${srv}/index.html?gl=1&debug=1&kernel=ts`);
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120000 });
  if (kernel) await page.waitForFunction(() => window.__hestiaKernel?.estado().ativo === true, null, { timeout: 60000 });
  return page;
}

/** Abre um .hestia.json pelo seletor de arquivo do app (o `#file-open` do menu Abrir). */
async function abrirArquivo(page, arquivo) {
  await page.getByText('Novo projeto').first().click().catch(() => undefined);
  await page.waitForSelector('#file-open', { state: 'attached', timeout: 60000 });
  await page.setInputFiles('#file-open', arquivo);
  await page.waitForFunction((n) => window.__hestia.editor.fileName === n, path.basename(arquivo), { timeout: 60000 });
  await page.waitForTimeout(1000);
}

/** Zoom out da planta com a roda do mouse até a vista abranger `largura` metros. */
async function afastarPlanta(page, largura) {
  const caixa = await page.locator('.canvas-wrap').boundingBox();
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  for (let i = 0; i < 40; i++) {
    const v = await page.evaluate(() => window.__hestia.editor.viewport());
    if (v.width / v.zoom >= largura) return;
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(120);
  }
}

const opcao = async (page, id, valor) => { await page.locator(id).fill(String(valor)); await page.keyboard.press('Enter'); await page.waitForTimeout(150); };
/** Renomeia a massa selecionada pelo campo "Nome" do painel de propriedades. */
const nomear = async (page, nome) => { await page.locator('#ms-name').fill(nome); await page.keyboard.press('Enter'); await page.waitForTimeout(150); };
const ferramentaMassa = async (page, modo) => {
  await aba(page, 'Massa e terreno');
  await page.getByRole('button', { name: 'Massa', exact: true }).click();
  await page.getByRole('button', { name: modo, exact: true }).click();
};

const browser = await launch();
const srv = await servirDist(errosPagina);
mkdirSync(DIR, { recursive: true });
mkdirSync(path.dirname(SALVO), { recursive: true });
let torre = null;
let bulbo = null;
let petala = null;
let antes = null;
let dev = null;
try {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await abrirApp(ctx, srv, errosPagina);
  check('kernel ligado no app (ativo)', (await page.evaluate(() => window.__hestiaKernel.estado().ativo)) === true);
  await novoProjetoEmBranco(page);
  check('projeto em branco sem massas', (await lerMassas(page)).length === 0);

  // Níveis a cada 3 m até 30 m (o projeto em branco só tem dois): sem eles a tabela não teria o que mostrar na torre. Comando do modelo.
  await page.evaluate(() => {
    const { editor } = window.__hestia;
    const base = editor.project.levels[1];
    for (let k = 2; k <= 10; k++) editor.store.exec({ type: 'upsertLevel', level: { ...structuredClone(base), id: `lv_${k}`, name: `Nível ${k + 1}`, elevation: 3 * k } });
  });
  check('11 níveis (0 a 30 m)', (await page.evaluate(() => window.__hestia.editor.project.levels.length)) === 11);

  // 1. Extrusão de um quadrado de 8 m (perfil livre 8 x 8), altura 30 m, torção total de 90° pelo painel.
  await passo('1. Extrusão do quadrado de 8 m, 30 m de altura, torção de 90°', async () => {
    await afastarPlanta(page, 90);
    await ferramentaMassa(page, 'Extrusão');
    await page.locator('#opt-mass-perfil').selectOption('livre');
    await opcao(page, '#opt-mass-altura', ALTURA_TORRE);
    for (const [x, y] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) await clickWorld(page, x, y);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const ms = await lerProjeto(page);
    torre = ms.massas[0] ?? null;
    check('1 massa, 2 seções, perfil livre de 4 pontos', ms.massas.length === 1 && torre?.secoes.length === 2 && torre.secoes[0].perfil.forma === 'livre' && torre.secoes[0].perfil.pontos.length === 4, torre ? `${torre.secoes.length} seções` : 'sem massa');
    const pts = torre?.secoes[0].perfil.pontos ?? [];
    // O clique cai em pixel (sem captura de grade): o erro de posição é da ordem de 1e-6 m, então a área do perfil sai 64 com erro de 1e-4.
    check(`perfil é um quadrado de ${LADO} m (área 64, erro de pixel)`, pts.length === 4 && Math.abs(areaDoAnel(pts) - LADO * LADO) < 1e-4, pts.length ? `área ${areaDoAnel(pts).toFixed(4)}` : '');
    check(`altura de ${ALTURA_TORRE} m`, torre && Math.abs(torre.secoes[1].z - torre.secoes[0].z - ALTURA_TORRE) < 1e-6, torre ? String(torre.secoes[1].z) : '');
    await selecionarMassa(page, torre.id, { x: 0, y: 0 }, worldToPage);
    check('painel da massa mostra "Torção total (graus)"', await page.locator('#ms-torcao').isVisible());
    await nomear(page, 'Torre');
    await opcao(page, '#ms-torcao', 90);
    torre = (await lerProjeto(page)).massas[0];
    check('rotação da última seção = π/2 (1e-9)', Math.abs(torre.secoes[1].rotacao - Math.PI / 2) < 1e-9, String(torre.secoes[1].rotacao));
    check('rotação da primeira seção = 0', Math.abs(torre.secoes[0].rotacao) < 1e-12);
  });

  // 2. Bulbo de raio 6 m e altura 15 m (centro em x = 25 m, para não tocar a torre).
  await passo('2. Bulbo de raio 6 m e altura 15 m', async () => {
    await pressTool(page, 'v');
    await afastarPlanta(page, 90);
    await ferramentaMassa(page, 'Bulbo');
    await opcao(page, '#opt-mass-altura', 15);
    await clickWorld(page, 25, 0);
    await clickWorld(page, 31, 0);
    const ms = (await lerProjeto(page)).massas;
    bulbo = ms[1] ?? null;
    check('2 massas no projeto', ms.length === 2, String(ms.length));
    await selecionarMassa(page, bulbo.id, { x: 25, y: 0 }, worldToPage);
    await nomear(page, 'Bulbo');
    bulbo = (await lerProjeto(page)).massas[1];
    check('bulbo: 5 seções, altura 15 m', bulbo?.secoes.length === 5 && Math.abs(bulbo.secoes[4].z - 15) < 1e-6, bulbo ? `${bulbo.secoes.length} seções, topo ${bulbo.secoes[4]?.z}` : '');
    const raios = (bulbo?.secoes ?? []).map((s) => s.perfil.raio ?? 0);
    check('bulbo: raio máximo de 6 m', Math.abs(Math.max(...raios) - 6) < 0.05, Math.max(...raios).toFixed(3));
    check('bulbo: centro em (25, 0)', bulbo && Math.abs(bulbo.origem.x - 25) < 0.05 && Math.abs(bulbo.origem.y) < 0.05, bulbo ? `${bulbo.origem.x}, ${bulbo.origem.y}` : '');
  });

  // 3. Loft de uma pétala (círculo de 1,5 m na base, 0,8 m no topo, inclinada para fora) e arranjo polar de 12 em volta do bulbo.
  await passo('3. Loft da pétala e arranjo polar de 12 cópias', async () => {
    await ferramentaMassa(page, 'Loft');
    await page.locator('#opt-mass-perfil').selectOption('circulo');
    await clickWorld(page, 33, 0);
    await clickWorld(page, 34.5, 0);
    await clickWorld(page, 36, 0);
    await clickWorld(page, 36.8, 0);
    const dlg = dialogo(page, 'Seções da massa');
    await dlg.waitFor({ timeout: 5000 });
    check('loft: diálogo "Seções da massa" abriu', await dlg.isVisible());
    await dlg.locator('#ms-add').click();
    await dlg.locator('#ms-aplicar').click();
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
    petala = (await lerProjeto(page)).massas[2] ?? null;
    check('pétala: 3 seções depois do diálogo', petala?.secoes.length === 3, String(petala?.secoes.length));
    await pressTool(page, 'v');
    check('pétala selecionada pelo clique', await selecionarMassa(page, petala.id, { x: 33, y: 0 }, worldToPage));
    await nomear(page, 'Pétala');
    await page.locator('#ms-arr').check();
    await opcao(page, '#ms-arr-n', 12);
    await opcao(page, '#ms-arr-cx', bulbo.origem.x);
    await opcao(page, '#ms-arr-cy', bulbo.origem.y);
    await opcao(page, '#ms-arr-ang', 360);
    petala = (await lerProjeto(page)).massas[2];
    const a = petala.arranjo;
    check('arranjo de 12 cópias', a?.n === 12, String(a?.n));
    check('centro do arranjo = centro do bulbo', a && Math.abs(a.cx - bulbo.origem.x) < 1e-6 && Math.abs(a.cy - bulbo.origem.y) < 1e-6, a ? `${a.cx}, ${a.cy}` : '');
    check('ângulo total do arranjo = 2π', a && Math.abs(a.anguloTotal - 2 * Math.PI) < 1e-6, String(a?.anguloTotal));
    await pressTool(page, 'v');
    await page.keyboard.press('Escape');
    await enquadrarPlanta(page);
    await capturar(page, 'planta.png');
  });

  // 4. Corte (ferramenta Corte, dois cliques), elevação, 3D e prancha com as quatro vistas.
  await passo('4. Corte, elevação, 3D e prancha', async () => {
    await afastarPlanta(page, 90);
    await pressTool(page, 'k');
    await clickWorld(page, -10, 0);
    await clickWorld(page, 45, 0);
    await page.keyboard.press('Escape');
    let vistas = (await lerProjeto(page)).vistas;
    check('corte criado pela ferramenta Corte', vistas.some((v) => v.kind === 'section'), `${vistas.length} vista(s)`);
    const corte = vistas.find((v) => v.kind === 'section');
    await page.evaluate((id) => window.__hestia.editor.openSection(id), corte.id);
    await page.waitForFunction((id) => window.__hestia.editor.sectionOf(id) !== null, corte.id, { timeout: 90000 });
    await page.waitForTimeout(500);
    await enquadrarTudo(page);
    await capturar(page, 'corte.png');

    await page.evaluate(() => {
      const { editor } = window.__hestia;
      editor.closeSection();
      editor.store.exec({ type: 'addView', view: { id: 'sv_elev', name: 'Elevação massas', kind: 'elevation', a: { x: -12, y: -45 }, b: { x: 48, y: -45 }, depth: 100 } });
      editor.openSection('sv_elev');
    });
    await page.waitForFunction(() => window.__hestia.editor.sectionOf('sv_elev') !== null, null, { timeout: 90000 });
    await page.waitForTimeout(500);
    await enquadrarTudo(page);
    await capturar(page, 'elevacao.png');

    await page.evaluate(() => window.__hestia.editor.closeSection());
    await abreVista3d(page);
    await page.waitForFunction(() => window.__hestia3dModel !== undefined, null, { timeout: 60000 });
    await enquadrarTudo(page);
    check('3D: massas na cena', (await massasNa3d(page)) >= 1, String(await massasNa3d(page)));
    await capturar(page, '3d.png');

    await page.evaluate(() => {
      const { editor, useUi } = window.__hestia;
      editor.store.exec({ type: 'addSheet', sheet: { id: 'sh_massa', number: 'A-101', name: 'Massas', size: 'A1', orientation: 'landscape', margin: 10, discipline: 'Arquitetura', titleBlock: { project: editor.project.name, client: 'Cliente', author: 'Equipe', date: '14/11/2026', revision: '0' }, viewports: [] } }, 'Criar prancha');
      useUi.setState({ view: 'sheet', sheetId: 'sh_massa' });
    });
    await page.waitForSelector('.sheet-stage svg');
    await page.getByRole('button', { name: 'Adicionar vista', exact: true }).click();
    await page.getByText('Adicionar vistas', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    for (const nome of [/^Planta/, /^Corte/, /^Elevação/, /^Modelo 3D \(enquadramento padrão\)/]) await page.getByRole('checkbox', { name: nome }).first().check();
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page.waitForFunction(() => (window.__hestia.editor.project.sheets ?? []).find((s) => s.id === 'sh_massa')?.viewports.length === 4, null, { timeout: 60000 });
    const tipos = (await lerProjeto(page)).pranchas.find((s) => s.id === 'sh_massa').viewports.map((v) => v.view.kind).sort().join(',');
    check('prancha com planta, corte, elevação e 3D', tipos === '3d,plan,section,section', tipos);
    await page.waitForTimeout(3000);
    await capturar(page, 'prancha.png');
  });

  // 5. Tabela "Massas por pavimento": 64 m² em todos os níveis da torre.
  await passo('5. Tabela "Massas por pavimento"', async () => {
    await page.evaluate(() => window.__hestia.useUi.setState({ view: 'plan', levelId: 'lv_0', selection: [] }));
    await aba(page, 'Vista');
    await botaoDoPainel(page, 'Criar', 'Tabelas ▾').click();
    await page.getByRole('menuitem', { name: 'Massas por pavimento', exact: true }).click();
    const tab = dialogo(page, 'Massas por pavimento');
    await tab.waitFor({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] table tbody tr').length > 0, null, { timeout: 30000 });
    const linhas = await tab.locator('table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')));
    const daTorre = linhas.filter((l) => l[0] === torre.name);
    check('tabela: 11 linhas da torre (níveis de 0 a 30 m)', daTorre.length === 11, String(daTorre.length));
    const areas = daTorre.map((l) => numeroDoTexto(l[2]));
    check('tabela: 64 m² em todos os níveis da torre (2 casas)', areas.length > 0 && areas.every((a) => Math.abs(a - 64) < 0.006), areas.join(' / '));
    check('tabela: linhas do bulbo e da pétala também aparecem', linhas.some((l) => l[0] === bulbo.name) && linhas.some((l) => l[0] === petala.name));
    await capturar(page, 'tabela.png');
    await tab.getByRole('button', { name: 'Fechar', exact: true }).first().click();
    await tab.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  });

  // 6. Pisos e paredes da massa no nível de 12 m: um Ctrl+Z desfaz cada um (e Ctrl+Y refaz).
  await passo('6. Pisos e paredes da massa, desfazer e refazer', async () => {
    await page.evaluate(() => window.__hestia.useUi.setState({ view: 'plan', levelId: 'lv_4' }));
    await enquadrarPlanta(page);
    await selecionarMassa(page, torre.id, { x: 0, y: 0 }, worldToPage);
    const so = async (dlg, prefixo) => {
      for (let k = 0; k <= 10; k++) {
        const c = dlg.locator(`#${prefixo}-nivel-lv_${k}`);
        if (k === 4) await c.check(); else await c.uncheck();
      }
    };
    await aba(page, 'Massa e terreno');
    await botaoDoPainel(page, 'Modelo por massa', 'Pisos da massa').click();
    const dp = dialogo(page, 'Pisos da massa');
    await dp.waitFor({ timeout: 5000 });
    await so(dp, 'mp');
    await dp.getByRole('button', { name: 'Gerar', exact: true }).click();
    await dp.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
    let pj = await lerProjeto(page);
    const pisos = pj.pisos.filter((f) => f.origemMassa?.massaId === torre.id);
    check('Pisos da massa: 1 piso no nível de 12 m, com origemMassa', pisos.length === 1 && pisos[0].origemMassa.nivelId === 'lv_4', String(pisos.length));
    check('o piso gerado tem 64 m² (1e-2)', pisos.length === 1 && Math.abs(areaDoAnel(pisos[0].boundary) - 64) < 1e-2, pisos[0] ? areaDoAnel(pisos[0].boundary).toFixed(4) : '');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    pj = await lerProjeto(page);
    check('um Ctrl+Z desfaz os pisos', pj.pisos.length === 0, String(pj.pisos.length));
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);
    check('Ctrl+Y refaz os pisos', (await lerProjeto(page)).pisos.length === 1);

    await botaoDoPainel(page, 'Modelo por massa', 'Paredes da massa').click();
    const dw = dialogo(page, 'Paredes da massa');
    await dw.waitFor({ timeout: 5000 });
    await so(dw, 'mw');
    await dw.getByRole('button', { name: 'Gerar', exact: true }).click();
    await dw.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
    pj = await lerProjeto(page);
    const paredes = pj.paredes.filter((w) => w.origemMassa?.massaId === torre.id);
    // O anel da fatia começa onde a semirreta +x cruza o quadrado girado (meio de um lado): o simplificador mantém esse ponto, então saem 5 paredes
    // (4 lados, um deles dividido em dois segmentos colineares). Achado da D2 relatado ao dono; aqui o aceite é a cadeia fechada de 4 a 5 paredes.
    const comprimentos = paredes.map((w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y));
    const fechada = paredes.every((w, i) => Math.hypot(w.b.x - paredes[(i + 1) % paredes.length].a.x, w.b.y - paredes[(i + 1) % paredes.length].a.y) < 1e-6);
    check('Paredes da massa: cadeia fechada de 4 a 5 paredes no nível de 12 m, com origemMassa', paredes.length >= 4 && paredes.length <= 5 && fechada && paredes.every((w) => w.origemMassa.nivelId === 'lv_4'), `${paredes.length} paredes`);
    check('Paredes da massa: nenhum segmento menor que 0,40 m e contorno de 64 m² (0,5)', comprimentos.every((c) => c >= 0.4) && Math.abs(areaDoAnel(paredes.map((w) => w.a)) - 64) < 0.5, `área ${areaDoAnel(paredes.map((w) => w.a)).toFixed(3)}, ${paredes.length} paredes`);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    pj = await lerProjeto(page);
    check('um Ctrl+Z desfaz as paredes e mantém o piso', pj.paredes.length === 0 && pj.pisos.length === 1, `${pj.paredes.length} paredes, ${pj.pisos.length} piso(s)`);
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);
    check('Ctrl+Y refaz as paredes', (await lerProjeto(page)).paredes.length === paredes.length);
  });

  // 7a. Salvar (menu Arquivo, "Baixar arquivo"), reabrir numa página nova e comparar.
  await passo('7a. Salvar e reabrir', async () => {
    antes = await lerProjeto(page);
    await page.getByRole('button', { name: 'Menu Arquivo', exact: true }).click();
    await dialogo(page, 'Menu Arquivo').getByRole('button', { name: 'Salvar', exact: true }).click();
    const [baixa] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Baixar arquivo', exact: true }).click()]);
    await baixa.saveAs(SALVO);
    check('arquivo salvo pelo app (download) com as massas', statSync(SALVO).size > 1000 && readFileSync(SALVO, 'utf8').includes('"mass"'), `${(statSync(SALVO).size / 1024).toFixed(0)} kB`);
    const p2 = await abrirApp(ctx, srv, errosPagina);
    await abrirArquivo(p2, SALVO);
    const depois = await lerProjeto(p2);
    const ord = (l) => [...l].sort((a, b) => a.id.localeCompare(b.id));
    check('reaberto: massas idênticas (modelo inteiro)', JSON.stringify(ord(depois.massas)) === JSON.stringify(ord(antes.massas)));
    check('reaberto: pisos e paredes geradas idênticos', JSON.stringify(ord(depois.pisos)) === JSON.stringify(ord(antes.pisos)) && JSON.stringify(ord(depois.paredes)) === JSON.stringify(ord(antes.paredes)));
    check('reaberto: níveis, vistas e prancha idênticos', JSON.stringify(depois.niveis) === JSON.stringify(antes.niveis) && JSON.stringify(depois.vistas) === JSON.stringify(antes.vistas) && JSON.stringify(depois.pranchas) === JSON.stringify(antes.pranchas));
    await p2.evaluate(() => window.__hestia.useUi.setState({ view: 'plan', levelId: 'lv_0', selection: [] }));
    await enquadrarPlanta(p2);
    await capturar(p2, 'apos-reabrir.png');
    await p2.close();
    // Números exatos do kernel sobre o arquivo salvo.
    const k = kernelEmNode(SALVO);
    check('kernel em Node pronto', k.pronto === true);
    const fT = (k.fatias ?? []).filter((f) => f.massaId === torre.id && f.nivelId !== null);
    check('torre: fatia em cada um dos 11 níveis', fT.length === 11, String(fT.length));
    const areaPerfil = areaDoAnel(torre.secoes[0].perfil.pontos);
    check('torre: toda fatia com a área do perfil (1e-6; a torção não muda a área)', fT.length > 0 && fT.every((f) => Math.abs(f.area - areaPerfil) < 1e-6), `perfil ${areaPerfil.toFixed(9)}`);
    check('torre: toda fatia com 64 m² (1e-3, o perfil clicado tem erro de pixel)', fT.length > 0 && fT.every((f) => Math.abs(f.area - 64) < 1e-3), fT.map((f) => f.area.toFixed(6)).join(' '));
    const linhasT = (k.linhas ?? []).filter((l) => l.massaName === torre.name);
    check('tabela exata: área do perfil em todos os níveis da torre (1e-6)', linhasT.length === 11 && linhasT.every((l) => Math.abs(l.area - areaPerfil) < 1e-6), linhasT.map((l) => l.area.toFixed(9)).join(' '));
    // O quadrado gira: o canto mais distante do centro da fatia acompanha a torção linear (0 a 90° em 30 m), módulo 90°.
    const meio = fT.find((f) => Math.abs(f.z - 12) < 1e-9);
    const cx = meio.pontos.reduce((s, q) => s + q.x, 0) / meio.pontos.length;
    const cy = meio.pontos.reduce((s, q) => s + q.y, 0) / meio.pontos.length;
    const canto = meio.pontos.reduce((m, q) => (Math.hypot(q.x - cx, q.y - cy) > Math.hypot(m.x - cx, m.y - cy) ? q : m));
    const giro = (((Math.atan2(canto.y - cy, canto.x - cx) * 180) / Math.PI - 45 - (12 / ALTURA_TORRE) * 90) % 90 + 90) % 90;
    check('planta de 12 m: quadrado girado 36° (canto mais longe a 45° + 36°, módulo 90°)', Math.min(giro, 90 - giro) < 0.5, `desvio ${Math.min(giro, 90 - giro).toFixed(3)}°`);
  });

  // 7b. Kernel desligado (o wasm não carrega): aviso, contorno de reserva e nenhum travamento.
  await passo('7b. Kernel desligado', async () => {
    const e3 = [];
    dev = await iniciarServidorDev();
    const p3 = await abrirApp(ctx, dev.url, e3, { kernel: false });
    await abrirArquivo(p3, SALVO);
    await p3.waitForTimeout(3000);
    const est = await p3.evaluate(() => window.__hestiaKernel.estado());
    check('kernel desligado (?kernel=ts do modo de desenvolvimento)', est.ativo === false, `nome ${est.nome}`);
    await p3.getByRole('button', { name: /avisos|aviso|warning/i }).last().click().catch(() => undefined);
    const textoAvisos = await p3.locator('.issues-pop').innerText({ timeout: 10000 }).catch(() => '');
    check('aviso massa-sem-kernel no painel de avisos', /kernel de geometria não está ligado/.test(textoAvisos), textoAvisos.split('\n')[0] ?? '');
    await p3.keyboard.press('Escape');
    await p3.evaluate(() => window.__hestia.useUi.setState({ view: 'plan', levelId: 'lv_0', selection: [] }));
    await enquadrarPlanta(p3);
    await aba(p3, 'Massa e terreno');
    const mostrar = botaoDoPainel(p3, 'Modelo de massa', 'Mostrar massa');
    const caixa = await p3.locator('.canvas-wrap').boundingBox();
    const tira = async () => { await p3.mouse.move(2, 2); await p3.waitForTimeout(500); return p3.screenshot({ type: 'png', clip: caixa }); };
    const comMassa = await tira();
    await mostrar.click();
    const semMassa = await tira();
    await mostrar.click();
    check('planta: contorno de reserva da massa desenhado sem kernel', !comMassa.equals(semMassa));
    await capturar(p3, 'sem-kernel.png');
    await abreVista3d(p3);
    await p3.waitForFunction(() => window.__hestia3dModel !== undefined, null, { timeout: 60000 });
    await enquadrarTudo(p3);
    await p3.waitForTimeout(1500);
    const grupos = await p3.evaluate(() => (window.__hestia3dModel?.massaNaCena ?? []).filter((g) => g.grupo.parent && g.grupo.children.length > 0).length);
    check('3D: contorno de reserva das massas na cena', grupos >= 1, String(grupos));
    const vivo = await p3.evaluate(() => window.__hestia.editor.project.levels.length);
    check('app continua respondendo sem kernel', vivo === 11);
    const graves = e3.filter((m) => /pageerror/.test(m));
    check('sem exceção de página sem kernel', graves.length === 0, graves.join(' | '));
    const resto = e3.filter((m) => !/pageerror/.test(m));
    for (const m of resto) console.log(`(console sem kernel) ${m}`);
    errosPagina.push(...resto.filter((m) => !/wasm|kernel|WebAssembly/i.test(m)).map((m) => `[sem kernel] ${m}`));
    await p3.close();
  });
  check('kernel continua ativo na página principal', (await page.evaluate(() => window.__hestiaKernel.estado().ativo)) === true);
} catch (e) {
  check('roteiro sem exceção', false, resumoErro(e));
} finally {
  await browser.close();
  srv.close();
  dev?.parar();
}

console.log(`\n== ERROS DE CONSOLE E DE PÁGINA (${errosPagina.length})`);
for (const e of errosPagina) console.log(`- ${e}`);
check('sem erro de console nem de página', errosPagina.length === 0, `${errosPagina.length} erro(s)`);
console.log(`\n${rel.falhas() === 0 ? 'PASSOU' : 'FALHOU'}: ${rel.falhas()} falha(s) de verificação ou erro(s) de console`);
process.exit(rel.falhas() === 0 ? 0 : 1);
