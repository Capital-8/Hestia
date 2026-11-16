// Auxiliares comuns dos E2E da massa conceitual (massa-visual.mjs, massa-ui.mjs e massa.mjs): servidor http local do build, relatório
// de verificações, captura estável e atalhos de interface. Só funções puras de teste; nenhum código de produto.
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as servidorTcp } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const RAIZ_DIST = path.resolve('apps/web/dist');
export const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

/**
 * Relatório de verificações: `check(nome, ok, extra)` imprime e conta as falhas; `falhas()` devolve o total. `errosPagina` junta erros de
 * console, de página e respostas 4xx/5xx (o servidor local grava os seus 404 aqui também).
 */
export function criarRelatorio() {
  let falhas = 0;
  const errosPagina = [];
  const check = (nome, ok, extra = '') => {
    console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}${extra !== '' ? ` (${extra})` : ''}`);
    if (!ok) falhas++;
  };
  return { check, errosPagina, falhas: () => falhas, somaFalha: () => { falhas++; } };
}

/** Liga a coleta de erros de console, de página e de resposta 4xx/5xx de uma página na lista `errosPagina`. */
export function coletarErros(page, errosPagina) {
  page.on('console', (m) => { if (m.type() === 'error') errosPagina.push(m.text()); });
  page.on('pageerror', (e) => errosPagina.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errosPagina.push(`[HTTP ${r.status()}] ${r.url()}`); });
}

/** Primeira linha do erro e a linha "waiting for" do Playwright (o seletor que não apareceu). */
export const resumoErro = (e) => e.message.split('\n').filter((l) => /^\s*(locator|waiting for|Error|expect)/i.test(l) || l.includes('waiting for')).slice(0, 2).join(' | ') || e.message.split('\n')[0];

/**
 * Serve o build por HTTP local. Por `file://` o Chrome bloqueia o fetch do `geom_wasm.wasm` (CORS) e o kernel não sobe. O favicon
 * responde 204: o app não declara ícone (achado conhecido, fora da massa), e o 404 não deve mascarar erros de verdade.
 */
export function servirDist(errosPagina) {
  const srv = createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    const arq = path.join(RAIZ_DIST, rel === '/' ? 'index.html' : rel);
    if (!arq.startsWith(RAIZ_DIST)) {
      res.writeHead(403).end();
      return;
    }
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

/**
 * Captura quando dois quadros seguidos saem iguais (a tela parou de mudar). Tira o cursor da área de desenho antes, para o hover
 * não entrar na foto. Sem estabilizar em 25 tentativas, grava a última e falha.
 */
export async function capturar(page, dir, nome, check) {
  const semBarra = await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'), null, { timeout: 180000 }).then(() => true, () => false);
  check(`${nome}: sem barra de progresso na tela`, semBarra);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  let anterior = null;
  let atual = null;
  for (let i = 1; i <= 25; i++) {
    atual = await page.screenshot({ type: 'png' });
    if (anterior && atual.equals(anterior)) {
      writeFileSync(path.join(dir, nome), atual);
      check(`captura ${nome} estável`, true, `${i} quadros, ${(atual.length / 1024).toFixed(0)} kB`);
      return atual.length;
    }
    anterior = atual;
    await page.waitForTimeout(600);
  }
  writeFileSync(path.join(dir, nome), atual);
  check(`captura ${nome} estável`, false, 'não estabilizou em 25 quadros; gravada a última');
  return atual.length;
}

/** "Enquadrar tudo" da barra de navegação (o botão do app). Na planta ele tem um defeito conhecido; use `enquadrarPlanta` lá. */
export const enquadrarTudo = async (page) => {
  await page.getByRole('button', { name: /Enquadrar tudo|Zoom to Fit/ }).first().click();
  await page.waitForTimeout(500);
};

/** Enquadra a planta pelo menu de contexto do canvas ("Ajustar zoom"), que funciona com o mouse. */
export async function enquadrarPlanta(page) {
  await page.mouse.move(1200, 300);
  await page.mouse.click(1200, 300, { button: 'right' });
  await page.getByRole('menuitem', { name: /Ajustar zoom|Zoom to Fit/ }).first().click();
  await page.waitForTimeout(500);
}

export const dialogo = (page, nome) => page.getByRole('dialog', { name: nome, exact: true });
/** Botão de um painel da faixa (o grupo tem o título do painel): a barra de acesso rápido repete alguns rótulos. */
export const botaoDoPainel = (page, painel, nome) => page.getByRole('group', { name: painel, exact: true }).getByRole('button', { name: nome, exact: true });
export const aba = (page, nome) => page.getByRole('button', { name: nome, exact: true }).click();

/** Só leitura: as massas do projeto em ordem de criação. */
export const lerMassas = (page) => page.evaluate(() => Object.values(window.__hestia.editor.project.elements)
  .filter((e) => e.kind === 'mass')
  .map((m) => ({ id: m.id, nome: m.name, order: m.order, origem: m.origem, n: m.secoes.length, zs: m.secoes.map((s) => s.z), rot: m.secoes.map((s) => s.rotacao), forma: m.secoes[0].perfil.forma, raio: m.secoes[0].perfil.raio ?? null, arranjo: m.arranjo ?? null }))
  .sort((a, b) => a.order - b.order));

/** Só leitura: o texto da barra de status (o que o usuário vê na linha de baixo). */
export const statusTexto = (page) => page.evaluate(() => { const s = window.__hestia.useUi.getState().status; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); });

/** Só leitura: grupos de massa que estão na cena 3D (a cena retira a massa quando a categoria fica oculta na vista). */
export const massasNa3d = (page) => page.evaluate(() => (window.__hestia3dModel?.massaNaCena ?? []).filter((g) => g.grupo.parent && g.grupo.children.length > 0).length);

/** Projeto novo em branco pelo menu Arquivo (como o flow.mjs): cartão "Novo projeto" da tela inicial e depois "Em branco". */
export async function novoProjetoEmBranco(page) {
  await page.getByRole('button', { name: /Novo projeto/ }).first().click().catch(() => undefined);
  await page.getByRole('button', { name: 'Menu Arquivo', exact: true }).click();
  await dialogo(page, 'Menu Arquivo').getByRole('button', { name: 'Novo', exact: true }).click();
  await page.getByRole('button', { name: /Em branco/ }).click();
  await page.waitForTimeout(400);
}

/**
 * Seleciona uma massa pelo clique na planta; se o clique não a pegar, grava a seleção direto no estado da interface (e devolve false,
 * para o roteiro registrar que o clique falhou).
 */
export async function selecionarMassa(page, id, clique, worldToPage) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const p = await worldToPage(page, clique.x, clique.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  const ok = await page.evaluate((i) => window.__hestia.useUi.getState().selection.includes(i), id);
  if (!ok) await page.evaluate((i) => window.__hestia.useUi.setState({ selection: [i] }), id);
  return ok;
}

/** Texto de uma célula numérica da tabela ("64,00", "1.234,50") como número. */
export const numeroDoTexto = (s) => parseFloat(s.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));

/** Área pela fórmula do cadarço de um anel [{x, y}]. */
export const areaDoAnel = (pts) => Math.abs(pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]; return s + (a.x * b.y - b.x * a.y); }, 0)) / 2;

const SCRIPT_KERNEL = `
import { readFileSync } from 'node:fs';
import { buildMassSchedule, iniciarDespachoKernel, servicoMassa } from '${path.resolve('packages/engine/src/index.ts')}';
import { caminhoDoWasm } from '${path.resolve('packages/geom/src/kernel/caminhoWasm.ts')}';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const caminho = caminhoDoWasm();
await iniciarDespachoKernel({ fatiaA: true, fatiaB: true, sombra: false }, async () => readFileSync(caminho));
for (let i = 0; i < 100 && !servicoMassa().pronto(); i++) await new Promise((r) => setTimeout(r, 100));
const sch = buildMassSchedule(p);
const fatias = servicoMassa().fatias(p);
console.log('RES ' + JSON.stringify({ pronto: servicoMassa().pronto(), linhas: sch ? sch.rows : null, fatias }));
`;

/**
 * Números EXATOS do kernel Rust (o mesmo wasm do app) para um projeto salvo: tabela por pavimento e fatias. A tabela do app mostra 2 casas,
 * então a tolerância de 1e-6 se confere aqui. O script vai para /tmp (fora do repositório) e importa os módulos do repositório por caminho absoluto.
 */
export function kernelEmNode(arquivoJson) {
  mkdirSync('/tmp/hestia-massa-e2e', { recursive: true });
  const script = '/tmp/hestia-massa-e2e/kernel.mts';
  writeFileSync(script, SCRIPT_KERNEL);
  const saida = execFileSync('npx', ['vite-node', script, arquivoJson], { encoding: 'utf8', timeout: 180000 });
  const linha = saida.split('\n').find((l) => l.startsWith('RES '));
  if (!linha) throw new Error('kernel em Node sem saída');
  return JSON.parse(linha.slice(4));
}

/**
 * Sobe o servidor de desenvolvimento do app (vite) numa porta livre. É o único jeito de ter o app SEM kernel: o build de produção exige o
 * kernel Rust (sem ele o app recusa abrir qualquer projeto), e só o modo de desenvolvimento aceita `?kernel=ts` (ver `configDoDespacho`).
 * Devolve `{ url, parar }`.
 */
export async function iniciarServidorDev() {
  const porta = await new Promise((ok) => { const t = servidorTcp().listen(0, '127.0.0.1', () => { const n = t.address().port; t.close(() => ok(n)); }); });
  const filho = spawn('npx', ['vite', '--port', String(porta), '--strictPort', '--host', '127.0.0.1'], { cwd: path.resolve('apps/web'), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('vite dev não subiu em 60 s')), 60000);
    filho.stdout.on('data', (d) => { if (String(d).includes('Local:')) { clearTimeout(t); ok(); } });
    filho.on('exit', (c) => { clearTimeout(t); falha(new Error(`vite dev saiu com código ${c}`)); });
  });
  return { url: `http://127.0.0.1:${porta}`, parar: () => filho.kill('SIGTERM') };
}
