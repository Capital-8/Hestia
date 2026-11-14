// Portão visual da fase 2 (massa conceitual): abre o app construído (apps/web/dist), liga o kernel Rust, carrega as massas de referência
// (A.10) lado a lado e tira as capturas de planta, 3D, corte e elevação em docs/massa/evidencias/fase2/. Imprime todos os erros de console
// e de página e a contagem do kernel por massa. Código de saída 1 se houver erro de console/página, captura que não estabilizou ou verificação falha.
//   npm run build && node tests/e2e/massa-visual.mjs
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { abreVista3d, launch } from './helpers.mjs';

const RAIZ_DIST = path.resolve('apps/web/dist');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const JSON_GERADO = '/tmp/hestia-massa-fixture.json';
const JSON_CAPTURA = '/tmp/hestia-massa-captura.json';
const DIR = path.resolve('docs/massa/evidencias/fase2');
const NOME_PROJETO = 'hestia-massa-captura.json';

// Origem de cada massa na captura (só este script; o fixture TS não muda). Bulbo e pétala da flor ficam na mesma origem.
const DESLOCAMENTO = { m1: 0, m2: 20, m3: 40, m4: 60, m5: 90, m5p: 90 };
// Linha do corte: horizontal em y = 0, cruza M1 (x = 0), M3 (x = 40) e a flor (x = 90). Elevação: linha em y = -20, vendo as massas de frente.
const CORTE = { a: { x: -8, y: 0 }, b: { x: 102, y: 0 }, depth: 12 };
const ELEVACAO = { a: { x: -8, y: -20 }, b: { x: 102, y: -20 }, depth: 40 };

let falhas = 0;
/** Erros de console, de página e respostas 4xx/5xx; o roteiro e o servidor local gravam aqui. */
let errosPagina = [];
const check = (nome, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}${extra !== '' ? ` (${extra})` : ''}`);
  if (!ok) falhas++;
};

/**
 * Serve o build por HTTP local. Por `file://` o Chrome bloqueia o fetch do `geom_wasm.wasm` (CORS) e o kernel nunca sobe; esse é um achado
 * registrado no relatório, não o que este portão mede.
 */
function servirDist() {
  const srv = createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    const arq = path.join(RAIZ_DIST, rel === '/' ? 'index.html' : rel);
    if (!arq.startsWith(RAIZ_DIST)) {
      res.writeHead(403).end();
      return;
    }
    // O app não declara ícone (achado conhecido, fora da massa): o servidor de teste responde 204 ao pedido automático do
    // navegador, para o 404 do favicon não mascarar erros de verdade.
    if (rel === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    let corpo;
    try {
      corpo = await readFile(arq);
    } catch {
      errosPagina.push(`[HTTP 404 do servidor local] ${rel}`);
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] ?? 'application/octet-stream' }).end(corpo);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

/** Gera o projeto de referência, desloca as massas e roda a contagem do kernel (Node, mesmo wasm). Devolve a contagem por massa. */
function prepararProjeto() {
  execFileSync('npx', ['vite-node', 'tests/e2e/massa-fixture.mts', 'gerar', JSON_GERADO], { stdio: 'inherit' });
  const p = JSON.parse(readFileSync(JSON_GERADO, 'utf8'));
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'mass') continue;
    if (!(e.id in DESLOCAMENTO)) throw new Error(`massa sem deslocamento: ${e.id}`);
    e.origem = { x: DESLOCAMENTO[e.id], y: 0 };
    // Translação move o centro do arranjo junto (PLANO.md, A.3 item 4: "move `origem` (e `arranjo.cx/cy`)"); sem isso as pétalas giram em torno de (0, 0).
    if (e.arranjo) e.arranjo.cx += DESLOCAMENTO[e.id];
  }
  writeFileSync(JSON_CAPTURA, JSON.stringify(p));
  const saida = execFileSync('npx', ['vite-node', 'tests/e2e/massa-fixture.mts', 'contar', JSON_CAPTURA, JSON.stringify(CORTE)], { encoding: 'utf8' });
  const linha = saida.split('\n').find((l) => l.startsWith('CONTAGEM '));
  if (!linha) throw new Error('contagem do kernel sem saída');
  return JSON.parse(linha.slice('CONTAGEM '.length));
}

/**
 * Captura quando dois quadros seguidos saem iguais (o canvas parou de se mover). Sem estabilizar em 25 tentativas, grava a última e falha.
 * Tira o cursor da área de desenho antes, para o hover não entrar na foto.
 */
async function capturar(page, nome) {
  // Barras de progresso (montagem 3D e abertura em segundo plano) somem quando o trabalho termina; antes disso a tela ainda não é a final.
  const semBarra = await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'), null, { timeout: 180000 }).then(() => true, () => false);
  check(`${nome}: sem barra de progresso na tela`, semBarra);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  let anterior = null;
  let atual = null;
  for (let i = 1; i <= 25; i++) {
    atual = await page.screenshot({ type: 'png' });
    if (anterior && atual.equals(anterior)) {
      writeFileSync(path.join(DIR, nome), atual);
      check(`captura ${nome} estável`, true, `${i} quadros, ${(atual.length / 1024).toFixed(0)} kB`);
      return;
    }
    anterior = atual;
    await page.waitForTimeout(600);
  }
  writeFileSync(path.join(DIR, nome), atual);
  check(`captura ${nome} estável`, false, 'não estabilizou em 25 quadros; gravada a última');
}

/** Enquadra a vista atual com o botão "Enquadrar tudo" da barra de navegação (o do app, não uma chamada direta). */
async function enquadrarTudo(page) {
  await page.getByRole('button', { name: /Enquadrar tudo|Zoom to Fit/ }).first().click();
  await page.waitForTimeout(500);
}

/** Cria a vista de corte ou elevação no projeto, abre e espera o corte ser calculado (o worker responde em `sectionOf`). */
async function abrirVista(page, id, tipo, linha, nome) {
  await page.evaluate(({ id, tipo, linha, nome }) => {
    const { editor } = window.__hestia;
    editor.store.exec({ type: 'addView', view: { id, name: nome, kind: tipo, a: linha.a, b: linha.b, depth: linha.depth } });
    editor.openSection(id);
  }, { id, tipo, linha, nome });
  await page.waitForFunction((id) => window.__hestia.editor.sectionOf(id) !== null, id, { timeout: 90000 });
  await page.waitForTimeout(500);
}

const contagem = prepararProjeto();
console.log(`kernel em Node: ${contagem.kernel ? 'ok' : 'INDISPONÍVEL'}; massas no JSON: ${(contagem.massas ?? []).join(', ')}`);

mkdirSync(DIR, { recursive: true });
const browser = await launch();
const srv = await servirDist();
try {
  // A tela inicial não tem canvas: o `openApp` dos helpers espera o canvas, então aqui só se espera o gancho de depuração.
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  page.on('console', (m) => { if (m.type() === 'error') errosPagina.push(m.text()); });
  page.on('pageerror', (e) => errosPagina.push(`[pageerror] ${e.message}`));
  // O console não diz qual recurso falhou: a URL de cada resposta 4xx/5xx vai junto na lista de erros.
  page.on('response', (r) => { if (r.status() >= 400) errosPagina.push(`[HTTP ${r.status()}] ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?gl=1&debug=1`);
  await page.waitForFunction(() => window.__hestia, null, { timeout: 60000 });

  await page.waitForFunction(() => window.__hestiaKernel?.estado().ativo === true, null, { timeout: 60000 });
  console.log('kernel no app:', JSON.stringify(await page.evaluate(() => window.__hestiaKernel.estado())));

  await page.getByText('Novo projeto').first().click().catch(() => {});
  await page.waitForSelector('#file-open', { state: 'attached', timeout: 60000 });
  await page.setInputFiles('#file-open', JSON_CAPTURA);
  await page.waitForFunction((nome) => window.__hestia.editor.fileName === nome, NOME_PROJETO, { timeout: 60000 });
  await page.waitForTimeout(1000);

  const massasNoApp = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'mass').length);
  check('seis massas carregadas no app', massasNoApp === 6, String(massasNoApp));

  // Planta do nível 0 com as massas à vista.
  await page.evaluate(() => window.__hestia.useUi.setState({ view: 'plan', levelId: 'lv_0', selection: [] }));
  await enquadrarTudo(page);
  await capturar(page, 'planta.png');

  // 3D em perspectiva, enquadrado.
  await abreVista3d(page);
  await page.waitForFunction(() => window.__hestia3dModel !== undefined, null, { timeout: 60000 });
  await enquadrarTudo(page);
  // Diagnóstico (não é verificação): a cena 3D tem grupo de massa por nível, com malha do kernel ou reserva?
  const diag3d = await page.evaluate(() => {
    const cena = window.__hestia3dModel;
    const grupos = cena?.massaNaCena ?? [];
    const caixa = cena?.boxCache;
    const o = window.__hestia3d;
    return {
      grupos: grupos.map((g) => ({ nivel: g.levelId, filhos: g.grupo.children.length, noCenario: !!g.grupo.parent, visivel: g.grupo.visible, malha: !!g.mesh, faixas: g.ids?.length ?? 0, triangulos: g.geo?.index ? g.geo.index.count / 3 : null })),
      caixa: caixa && !caixa.isEmpty() ? { min: caixa.min.toArray().map((v) => +v.toFixed(2)), max: caixa.max.toArray().map((v) => +v.toFixed(2)) } : null,
      orbita: o ? { alvo: o.target.toArray().map((v) => +v.toFixed(2)), distancia: +o.distance.toFixed(2), azimute: +o.azimuth.toFixed(3), elevacao: +o.elevation.toFixed(3) } : null,
    };
  });
  console.log(`3D diagnóstico: ${JSON.stringify(diag3d)}`);
  // "Enquadrar tudo" põe a câmera a ~230 m. Causa provável (não isolada no código do app): a névoa linear fixa da 3D (scene3d.ts, Fog 60 a 170 m).
  // Achado registrado: a captura deste estado sai sem massa. Depois, duas rolagens do mouse sobre a 3D (câmera a ~120 m; o botão "Aproximar" não redesenhou).
  await capturar(page, '3d-enquadrar-tudo.png');
  const tela3d = await page.locator('.canvas-wrap canvas').first().boundingBox();
  await page.mouse.move(tela3d.x + tela3d.width / 2, tela3d.y + tela3d.height / 2);
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(600);
  }
  await capturar(page, '3d.png');

  // Corte, pela própria vista de corte do app.
  await page.evaluate(() => window.__hestia.useUi.setState({ view: 'plan' }));
  await abrirVista(page, 'sv_corte', 'section', CORTE, 'Corte massas');
  await enquadrarTudo(page);
  await capturar(page, 'corte.png');

  // Elevação, pela mesma vista do app (tipo elevation).
  await page.evaluate(() => window.__hestia.editor.closeSection());
  await abrirVista(page, 'sv_elev', 'elevation', ELEVACAO, 'Elevação massas');
  await enquadrarTudo(page);
  await capturar(page, 'elevacao.png');

  check('kernel continua ativo no fim', (await page.evaluate(() => window.__hestiaKernel.estado().ativo)) === true);
} catch (e) {
  check('roteiro sem exceção', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
  srv.close();
}

console.log('\n== CONTAGEM DO KERNEL POR MASSA (planta do nível 0 e corte da linha dada)');
for (const id of contagem.massas ?? []) {
  const pl = contagem.planta?.[id] ?? { linhas: 0, pontos: 0 };
  const co = contagem.corte?.[id] ?? { linhas: 0, pontos: 0 };
  console.log(`${id.padEnd(4)} planta: ${pl.linhas} linhas, ${pl.pontos} pontos | corte: ${co.linhas} linhas, ${co.pontos} pontos`);
}
check('kernel devolveu linhas de planta para todas as massas', (contagem.massas ?? []).every((id) => (contagem.planta?.[id]?.linhas ?? 0) > 0));

console.log(`\n== ERROS DE CONSOLE E DE PÁGINA (${errosPagina.length})`);
for (const e of errosPagina) console.log(`- ${e}`);
if (errosPagina.length) falhas++;

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${falhas} falha(s) de verificação ou erro(s) de console`);
process.exit(falhas === 0 ? 0 : 1);
