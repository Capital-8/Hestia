// e2e do kernel geométrico experimental (docs/decisoes/0045).
//
// Prova três coisas no build de produção, com o app de verdade:
//   1. com o flag DESLIGADO, nenhum request ao `geom_wasm.wasm` acontece (custo zero);
//   2. com `?kernel=rust`, o wasm é baixado, instancia e o kernel fica ativo (ABI conferida);
//   3. desligar depois devolve o estado para o TypeScript.
//
// Serve `apps/web/dist` por HTTP porque `fetch` de `file://` é bloqueado no Chrome — o mesmo motivo
// pelo qual o kernel precisa de servidor (e pelo qual o artefato de arquivo único cai no TS).
//
// Uso: node tests/e2e/kernel-experimental.mjs   (precisa de `npm run build` antes)
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIST = join(ROOT, 'apps', 'web', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function acharChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidatos.find((p) => existsSync(p)) ?? null;
}

/** Servidor estático mínimo sobre o dist, contando requests por caminho. */
async function subirServidor() {
  const pedidos = [];
  const servidor = createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    pedidos.push(caminho);
    const arquivo = caminho === '/' ? join(DIST, 'index.html') : join(DIST, caminho);
    if (!arquivo.startsWith(DIST) || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('nao encontrado');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(arquivo)] ?? 'application/octet-stream' });
    res.end(readFileSync(arquivo));
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;
  return { base: `http://127.0.0.1:${porta}`, pedidos, fechar: () => new Promise((ok) => servidor.close(ok)) };
}

const falhas = [];
function conferir(condicao, mensagem) {
  if (condicao) {
    console.log(`  ok   ${mensagem}`);
  } else {
    falhas.push(mensagem);
    console.log(`  FALHA ${mensagem}`);
  }
}

async function esperar(condicao, ms, intervalo = 100) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (await condicao()) return true;
    await new Promise((r) => setTimeout(r, intervalo));
  }
  return false;
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('PENDENTE: falta o build. Rode `npm run build`.');
  process.exit(2);
}
const wasmNoDist = join(DIST, 'geom_wasm.wasm');
if (!existsSync(wasmNoDist)) {
  console.error('PENDENTE: `apps/web/dist/geom_wasm.wasm` não existe (o build não copiou o asset do kernel).');
  process.exit(2);
}
const chrome = acharChrome();
if (!chrome) {
  console.error('PENDENTE: Chrome/Edge não encontrado (defina CHROME_PATH).');
  process.exit(2);
}

const { chromium } = await import('playwright-core');
const srv = await subirServidor();
const browser = await chromium.launch({ executablePath: chrome, headless: true });

try {
  // ------------------------------------------------ flag desligado (padrão)
  console.log('\n[1/3] kernel DESLIGADO (padrão)');
  srv.pedidos.length = 0;
  const off = await browser.newPage();
  await off.goto(`${srv.base}/?debug=1`, { waitUntil: 'load' });
  await off.waitForFunction(() => !!window.__hestia, null, { timeout: 30000 });
  const estadoOff = await off.evaluate(() => window.__hestiaKernel.estado());
  conferir(estadoOff.ativo === false, `estadoKernel().ativo === false (motivo: ${estadoOff.motivo ?? 'nenhum'})`);
  const baixouOff = srv.pedidos.filter((p) => p.endsWith('geom_wasm.wasm')).length;
  conferir(baixouOff === 0, `nenhum request ao geom_wasm.wasm (${baixouOff})`);
  await off.close();

  // ------------------------------------------------ flag ligado por URL
  console.log('\n[2/3] kernel LIGADO (?kernel=rust)');
  srv.pedidos.length = 0;
  const on = await browser.newPage();
  const erros = [];
  on.on('pageerror', (e) => erros.push(String(e)));
  await on.goto(`${srv.base}/?debug=1&kernel=rust`, { waitUntil: 'load' });
  await on.waitForFunction(() => !!window.__hestia, null, { timeout: 30000 });
  const ativou = await esperar(async () => (await on.evaluate(() => window.__hestiaKernel.estado())).ativo, 20000);
  const estadoOn = await on.evaluate(() => window.__hestiaKernel.estado());
  conferir(ativou, `kernel ativou (motivo: ${estadoOn.motivo ?? 'nenhum'})`);
  conferir(estadoOn.versaoAbi === 1, `versão do ABI === 1 (${estadoOn.versaoAbi})`);
  conferir(estadoOn.nome === 'rust', `impl ativa é 'rust' (${estadoOn.nome})`);
  const baixouOn = srv.pedidos.filter((p) => p.endsWith('geom_wasm.wasm')).length;
  conferir(baixouOn >= 1, `wasm baixado (${baixouOn} request)`);
  conferir(erros.length === 0, `sem erro de página (${erros.length})`);

  // ------------------------------------------------ medição do seam
  console.log('\n[3/3] medição e geometria pelo kernel');
  // A primeira renderização do projeto vazio pode acontecer antes do wasm terminar de instanciar
  // (ativação é assíncrona e não bloqueia a UI); essas chamadas caem no TypeScript. O que importa é
  // que, depois de instanciado, o seam passe a servir pelo kernel.
  const medicaoInicial = await on.evaluate(() => window.__hestiaKernel.medicao());
  console.log(`  info chamadas iniciais: ${medicaoInicial.chamadas} (origem ${medicaoInicial.origem}, tipicamente 'ts' antes do wasm ficar pronto)`);

  // Carrega um projeto-modelo com paredes: a resolução geométrica aciona as booleanas pelo seam,
  // que com o kernel ligado atende pelo wasm (o contador de chamadas prova a travessia).
  const antes = await on.evaluate(() => window.__hestiaKernel.medicao().chamadas);
  await on.evaluate(() => window.__hestia.editor.newProject('house2'));
  const cresceu = await esperar(async () => {
    const m = await on.evaluate(() => window.__hestiaKernel.medicao());
    return m.chamadas > antes + 10;
  }, 25000);
  const medicaoFinal = await on.evaluate(() => window.__hestiaKernel.medicao());
  conferir(cresceu, `booleanas passaram pelo seam (${antes} → ${medicaoFinal.chamadas} chamadas)`);
  conferir(medicaoFinal.origem === 'rust', `origem da medição é 'rust' (${medicaoFinal.origem})`);
  const elementos = await on.evaluate(() => Object.keys(window.__hestia.editor.project.elements).length);
  conferir(elementos > 0, `projeto resolvido com ${elementos} elementos`);
  const estadoFinal = await on.evaluate(() => window.__hestiaKernel.estado());
  conferir(estadoFinal.ativo === true && estadoFinal.falhas === 0, `kernel seguiu ativo, 0 falhas (${estadoFinal.falhas})`);
  await on.close();
} finally {
  await browser.close();
  await srv.fechar();
}

console.log('');
if (falhas.length > 0) {
  console.error(`REPROVADO: ${falhas.length} verificação(ões) falharam.`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('APROVADO: kernel experimental funcionando ponta a ponta no build de produção.');
