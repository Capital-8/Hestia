// Compara o kernel geométrico experimental (Rust → WebAssembly) com o TypeScript no cenário de 20
// pavimentos do navegador. Roda `tests/e2e/perf-browser.mjs` duas vezes — kernel desligado e ligado — e
// imprime a tabela de medianas e p95 com o ganho percentual.
//
// Uso:
//   node scripts/perf-kernel.mjs                                  # medição real (exige `npm run build` e Chrome/Edge)
//   node scripts/perf-kernel.mjs --simular                        # ensaia o relatório com JSONs de exemplo, sem navegador
//   node scripts/perf-kernel.mjs --ts-json <a> --rust-json <b>    # compara dois JSONs já gravados (não roda nada)
//
// Variáveis: PERF_RUNS (repetições por cenário, padrão 5, repassada ao runner), CHROME_PATH, PERF_HEADED,
// KERNEL_QUERY (parâmetro que liga o kernel; padrão `kernel=rust`) e PERF_KERNEL_SAIDA (caminho do arquivo
// comparativo, quando não se quer o padrão em scripts/perf-baselines/). O lado TypeScript usa `kernel=ts` fixo.
//
// Por que existe um servidor local aqui: `tests/e2e/perf-browser.mjs` navega para `${APP_URL}?debug=1` e
// não aceita parâmetro extra de query, então não há como pedir `?kernel=rust` pela interface dele. Em vez
// de copiar o runner (que envelheceria em paralelo), este script sobe um servidor estático sobre
// `apps/web/dist` e, na primeira navegação de cada lado, redireciona para a mesma página com o parâmetro
// do lado. O aplicativo lê o flag de `location.search` (`apps/web/src/editor/preferenciasKernel.ts`), de
// modo que o caminho medido é exatamente o de abrir `?kernel=rust` na barra de endereço. Ver
// docs/decisoes/0045.
//
// Saída: `scripts/perf-baselines/kernel-rust-20-pav-<data>.json` com `{ ts, rust, deltaPct }`. Os JSONs
// brutos de cada lado ficam em `scripts/perf-baselines/browser-20-pav-<data>-kernel-<lado>.json` (gravados
// pelo próprio runner), para auditoria.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = join(RAIZ, 'tests', 'e2e', 'perf-browser.mjs');
const DIST = join(RAIZ, 'apps', 'web', 'dist');
const BASELINES = join(RAIZ, 'scripts', 'perf-baselines');

/** Parâmetro de URL que liga o kernel (`?kernel=rust`); o lado TypeScript usa o oposto explícito. */
const QUERY_RUST = process.env.KERNEL_QUERY ?? 'kernel=rust';
const QUERY_TS = 'kernel=ts';

/** Medidas sem as quais não há comparação: se faltarem num lado, a medição não terminou. */
const ESSENCIAIS = ['abrirProjeto', 'plantaNivelDoMeio', 'edicaoParede'];
/** Chaves do bloco de 20 pavimentos que são identificação do cenário, não medidas. */
const METADADOS = new Set(['pavimentos', 'paredes']);

/** Nome de cada medida do runner; chave desconhecida sai com o próprio nome. */
const ROTULOS = {
  abrirProjeto: 'Abrir projeto (até o 2º quadro)',
  carregarPaginaAteAppPronto: 'Carregar página até o app pronto',
  primeiraPinturaFCP: 'Primeira pintura (FCP)',
  plantaNivelDoMeio: 'Planta do nível do meio',
  selecaoPorCliqueNaPlanta: 'Seleção por clique na planta',
  edicaoParede: 'Edição de parede',
  portaNaParede: 'Inserir porta',
  janelaNaParede: 'Inserir janela',
  paredeNova: 'Inserir parede',
  pan: 'Pan (planta)',
  zoom: 'Zoom (planta)',
  pick3D: 'Pick 3D',
  orbitar3D: 'Órbita 3D',
  pan3D: 'Pan 3D',
  edicaoParede3D: 'Edição de parede (3D)',
  abrir3DPrimeiroQuadro: 'Abrir 3D (1º quadro)',
  abrir3DCargaCompleta: 'Abrir 3D (carga completa)',
};
const rotulo = (chave) => ROTULOS[chave] ?? chave;

/** Erro com código de saída próprio: 2 = falta pré-requisito (build/navegador), 1 = medição/comparação falhou. */
const falha = (mensagem, codigo = 1) => Object.assign(new Error(mensagem), { codigo });

const n1 = (x) => (x === null || x === undefined ? '—' : x.toFixed(1).replace('.', ','));
const pct = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')}%`);
const arred = (x) => (x === null ? null : Number(x.toFixed(2)));

/** Mediana/p95 de uma medida do runner, aceitando as três formas que ele usa (`resumo`, `{ tempo }`, `{ ms }`). */
function extrair(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return { medianaMs: valor, p95Ms: null };
  if (!valor || typeof valor !== 'object') return null;
  if (typeof valor.medianaMs === 'number') {
    return { medianaMs: valor.medianaMs, p95Ms: typeof valor.p95Ms === 'number' ? valor.p95Ms : null };
  }
  if (valor.tempo && typeof valor.tempo.medianaMs === 'number') {
    return { medianaMs: valor.tempo.medianaMs, p95Ms: typeof valor.tempo.p95Ms === 'number' ? valor.tempo.p95Ms : null };
  }
  // Medidas de valor único do runner (`abrir3DPrimeiroQuadro`, `abrir3DCargaCompleta`): só o ms.
  if (typeof valor.ms === 'number' && Number.isFinite(valor.ms)) return { medianaMs: valor.ms, p95Ms: null };
  return null;
}

/** Compara o bloco de 20 pavimentos dos dois lados. Devolve linhas, percentuais e o que ficou sem par. */
function comparar(ts20, rust20) {
  if (!ts20 || typeof ts20 !== 'object') throw falha('o lado TypeScript não tem `medidas["20Pavimentos"]`: a medição não terminou ou o JSON é de outro cenário.');
  if (!rust20 || typeof rust20 !== 'object') throw falha('o lado Rust não tem `medidas["20Pavimentos"]`: a medição não terminou ou o JSON é de outro cenário.');

  const chaves = [...new Set([...Object.keys(ts20), ...Object.keys(rust20)])].filter((k) => !METADADOS.has(k));
  const linhas = [];
  const deltaPct = {};
  const faltando = [];
  for (const chave of chaves) {
    const ts = extrair(ts20[chave]);
    const rust = extrair(rust20[chave]);
    if (!ts && !rust) continue;
    if (!ts || !rust) {
      faltando.push({ chave, lado: ts ? 'rust' : 'ts' });
      continue;
    }
    const pctMediana = ts.medianaMs === 0 ? null : arred(((ts.medianaMs - rust.medianaMs) / ts.medianaMs) * 100);
    const pctP95 = ts.p95Ms && rust.p95Ms ? arred(((ts.p95Ms - rust.p95Ms) / ts.p95Ms) * 100) : null;
    linhas.push({ chave, ts, rust, pctMediana, pctP95 });
    deltaPct[chave] = { mediana: pctMediana, p95: pctP95 };
  }

  const problemas = [];
  if (linhas.length === 0) problemas.push('nenhuma medida comparável nos dois lados; confira se os dois JSONs são do cenário de 20 pavimentos.');
  for (const f of faltando) {
    if (ESSENCIAIS.includes(f.chave)) {
      problemas.push(`o lado ${f.lado === 'ts' ? 'TypeScript' : 'Rust'} não tem números para "${rotulo(f.chave)}": a medição não terminou.`);
    }
  }
  if (problemas.length) throw falha(`não dá para comparar:\n  - ${problemas.join('\n  - ')}`);
  return { linhas, deltaPct, faltando };
}

/** Cabeçalho + linhas da tabela comparativa, em ms e ganho percentual (positivo = kernel mais rápido). */
function imprimirTabela(linhas) {
  const largura = Math.max(...linhas.map((l) => rotulo(l.chave).length), 'Medida'.length);
  const cabecalho = [
    'Medida'.padEnd(largura),
    'TS med'.padStart(9),
    'Rust med'.padStart(9),
    'ganho'.padStart(9),
    'TS p95'.padStart(9),
    'Rust p95'.padStart(9),
    'ganho p95'.padStart(10),
  ].join('  ');
  console.log(cabecalho);
  console.log('-'.repeat(cabecalho.length));
  for (const l of linhas) {
    console.log(
      [
        rotulo(l.chave).padEnd(largura),
        n1(l.ts.medianaMs).padStart(9),
        n1(l.rust.medianaMs).padStart(9),
        pct(l.pctMediana).padStart(9),
        n1(l.ts.p95Ms).padStart(9),
        n1(l.rust.p95Ms).padStart(9),
        pct(l.pctP95).padStart(10),
      ].join('  '),
    );
  }
}

/** Imprime o relatório completo. `fontes` são os dois JSONs (ou "simulado"). */
function relatar(resultado, fontes) {
  const { linhas, deltaPct, faltando } = resultado;
  console.log('\nKernel experimental — 20 pavimentos (ms; ganho positivo = o kernel foi mais rápido)');
  console.log(`  TypeScript: ${fontes.ts}`);
  console.log(`  Rust:       ${fontes.rust}\n`);
  imprimirTabela(linhas);

  const semPar = faltando.filter((f) => !ESSENCIAIS.includes(f.chave));
  if (semPar.length) {
    console.log(`\nFora da tabela (sem par nos dois lados): ${semPar.map((f) => `${rotulo(f.chave)} (só ${f.lado})`).join(', ')}.`);
  }
  const comMediana = linhas.filter((l) => l.pctMediana !== null);
  const maior = comMediana.reduce((a, b) => (b.pctMediana > a.pctMediana ? b : a), comMediana[0]);
  if (maior) console.log(`Maior ganho: ${rotulo(maior.chave)} (${pct(maior.pctMediana)} na mediana).`);
  if (comMediana.every((l) => Math.abs(l.pctMediana) < 1)) {
    console.warn(
      '\nAVISO: todos os ganhos estão dentro de ±1%. Confirme no diálogo "Experimentais" (ou pelo estado do kernel) que o\n' +
        'kernel realmente ficou ativo no lado Rust — dois lados rodando TypeScript produzem exatamente este quadro.',
    );
  }
  return deltaPct;
}

/** Bloco `{ ts, rust, deltaPct }` gravado em `scripts/perf-baselines/`. */
function montarSaida(ladoTs, ladoRust, deltaPct) {
  return { ts: ladoTs, rust: ladoRust, deltaPct };
}

function lerJson(caminho, lado) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (e) {
    throw falha(`não consegui ler o JSON do lado ${lado} ("${caminho}"): ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Resumo de um lado gravado no arquivo final, com o bloco de 20 pavimentos. */
function ladoDoBruto(arquivo, bruto) {
  return {
    arquivo,
    geradoEm: bruto?.geradoEm ?? null,
    endereco: bruto?.app?.endereco ?? null,
    medidas: bruto?.medidas?.['20Pavimentos'] ?? null,
  };
}

function gravarArquivo(saida, destino) {
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, `${JSON.stringify(saida, null, 2)}\n`);
  return destino;
}

const destinoPadrao = () =>
  process.env.PERF_KERNEL_SAIDA
    ? resolve(process.env.PERF_KERNEL_SAIDA)
    : join(BASELINES, `kernel-rust-20-pav-${new Date().toISOString().slice(0, 10)}.json`);

// ---------------------------------------------------------------------------------------------------
// Servidor estático do build com o parâmetro do kernel
// ---------------------------------------------------------------------------------------------------

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

/**
 * Servidor estático de `apps/web/dist` que injeta `query` na primeira navegação.
 *
 * O runner pede `${APP_URL}?debug=1`; o servidor responde 307 para a mesma página com o parâmetro do lado
 * (`?debug=1&kernel=rust`) e serve o build normalmente a partir daí. É o único jeito de forçar o flag sem
 * tocar no runner. Escuta em 127.0.0.1 numa porta livre.
 */
async function servirDist(query) {
  const chave = new URLSearchParams(query).keys().next().value ?? 'kernel';
  const servidor = createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
    } catch {
      res.writeHead(400).end('URL inválida');
      return;
    }
    if ((url.pathname === '/' || url.pathname === '/index.html') && !url.searchParams.has(chave)) {
      const busca = url.search ? `${url.search.slice(1)}&${query}` : query;
      res.writeHead(307, { location: `${url.pathname}?${busca}`, 'cache-control': 'no-store' });
      res.end();
      return;
    }
    const caminho = decodeURIComponent(url.pathname);
    let arquivo = resolve(DIST, `.${caminho}`);
    if (arquivo !== DIST && !arquivo.startsWith(DIST + sep)) {
      res.writeHead(403).end('fora do build');
      return;
    }
    try {
      const existe = existsSync(arquivo) && !statSync(arquivo).isDirectory();
      if (!existe && extname(caminho) !== '') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('não encontrado no build');
        return;
      }
      if (!existe) arquivo = join(DIST, 'index.html');
      res.writeHead(200, {
        'content-type': MIME.get(extname(arquivo).toLowerCase()) ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(arquivo)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e));
    }
  });
  await new Promise((ok, erro) => {
    servidor.once('error', erro);
    servidor.listen(0, '127.0.0.1', ok);
  });
  const { port } = servidor.address();
  return {
    base: `http://127.0.0.1:${port}`,
    fechar: () => new Promise((ok) => servidor.close(() => ok())),
  };
}

// ---------------------------------------------------------------------------------------------------
// Execução real
// ---------------------------------------------------------------------------------------------------

/** JSON mais recente que o runner gravou para este lado (o nome leva a data e o PERF_ROTULO). */
function acharJsonDoLado(lado, desde) {
  if (!existsSync(BASELINES)) return null;
  const sufixo = `-kernel-${lado}.json`;
  const candidatos = readdirSync(BASELINES)
    .filter((nome) => nome.startsWith('browser-20-pav-') && nome.endsWith(sufixo))
    .map((nome) => ({ nome, mtime: statSync(join(BASELINES, nome)).mtimeMs }))
    .filter((c) => c.mtime >= desde - 2000)
    .sort((a, b) => b.mtime - a.mtime);
  return candidatos[0]?.nome ?? null;
}

/**
 * Executa o runner e espera terminar. **Assíncrono de propósito**: o servidor estático que atende o app roda
 * neste mesmo processo, então bloquear o event loop com `spawnSync` travaria o carregamento da página.
 */
function executarRunner(lado, base) {
  return new Promise((ok, erro) => {
    const filho = spawn(process.execPath, [RUNNER, '--save'], {
      cwd: RAIZ,
      stdio: 'inherit',
      env: { ...process.env, APP_URL: base, PERF_ROTULO: `kernel-${lado}` },
    });
    filho.once('error', erro);
    filho.once('exit', (codigo, sinal) => ok({ codigo, sinal }));
  });
}

/** Roda o runner uma vez no lado pedido e devolve o JSON gravado. */
async function medirLado(lado, query) {
  console.log(`\n=== kernel ${lado === 'rust' ? 'ligado' : 'desligado'} (${query}) ===`);
  const servidor = await servirDist(query);
  const desde = Date.now();
  let execucao;
  try {
    execucao = await executarRunner(lado, servidor.base);
  } finally {
    await servidor.fechar();
  }
  if (execucao.codigo === 2) {
    throw falha(
      'o runner parou: falta navegador ou build. A mensagem acima diz qual; defina CHROME_PATH com o Chrome/Edge se for o navegador.',
      2,
    );
  }
  if (execucao.codigo === 3) throw falha('o runner reconheceu um servidor de desenvolvimento e não gravou baseline (código 3).', 2);
  if (execucao.codigo !== 0) {
    throw falha(`o runner terminou com código ${execucao.codigo ?? `sinal ${execucao.sinal}`}; nada foi comparado.`);
  }
  const nome = acharJsonDoLado(lado, desde);
  if (!nome) {
    throw falha(
      `o runner terminou sem gravar "browser-20-pav-*-kernel-${lado}.json" em scripts/perf-baselines. ` +
        'O `--save` só grava com build de produção; confira se APP_URL foi realmente servido pelo build.',
    );
  }
  const arquivo = join(BASELINES, nome);
  console.log(`JSON do lado ${lado}: ${arquivo}`);
  return { arquivo, bruto: lerJson(arquivo, lado) };
}

async function medir() {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw falha(
      'não encontrei o build do app (apps/web/dist/index.html).\n' +
        'Rode `npm run build` antes de medir: este roteiro compara só build de produção.',
      2,
    );
  }
  if (!existsSync(RUNNER)) throw falha(`não encontrei o runner de medição (${RUNNER}).`, 2);

  const ts = await medirLado('ts', QUERY_TS);
  const rust = await medirLado('rust', QUERY_RUST);

  const resultado = comparar(ts.bruto?.medidas?.['20Pavimentos'], rust.bruto?.medidas?.['20Pavimentos']);
  const deltaPct = relatar(resultado, { ts: ts.arquivo, rust: rust.arquivo });
  const destino = gravarArquivo(montarSaida(ladoDoBruto(ts.arquivo, ts.bruto), ladoDoBruto(rust.arquivo, rust.bruto), deltaPct), destinoPadrao());
  console.log(`Gravado: ${destino}`);
}

/** Modo `--ts-json`/`--rust-json`: compara dois JSONs já gravados, sem rodar navegador. */
function compararArquivos(tsJson, rustJson) {
  if (!tsJson || !rustJson) throw falha('use `--ts-json <a> --rust-json <b>` juntos: os dois lados são obrigatórios.');
  const ts = { arquivo: tsJson, bruto: lerJson(tsJson, 'TypeScript') };
  const rust = { arquivo: rustJson, bruto: lerJson(rustJson, 'Rust') };
  const resultado = comparar(ts.bruto?.medidas?.['20Pavimentos'], rust.bruto?.medidas?.['20Pavimentos']);
  const deltaPct = relatar(resultado, { ts: tsJson, rust: rustJson });
  const destino = gravarArquivo(montarSaida(ladoDoBruto(ts.arquivo, ts.bruto), ladoDoBruto(rust.arquivo, rust.bruto), deltaPct), destinoPadrao());
  console.log(`Gravado: ${destino}`);
}

// ---------------------------------------------------------------------------------------------------
// Simulação (--simular): exercita o parsing e o relatório com números inventados, sem navegador
// ---------------------------------------------------------------------------------------------------

const resumo = (medianaMs, p95Ms) => ({
  n: 5,
  medianaMs: Number(medianaMs.toFixed(2)),
  p95Ms: Number(p95Ms.toFixed(2)),
  mediaMs: Number(((medianaMs + p95Ms) / 2).toFixed(2)),
  minMs: Number((medianaMs * 0.8).toFixed(2)),
  maxMs: Number((p95Ms * 1.25).toFixed(2)),
});

/** Ganhos inventados por medida em modo `--simular` (o resto fica em 3%). */
const GANHOS_SIMULADOS = {
  plantaNivelDoMeio: 0.68,
  edicaoParede: 0.9,
  selecaoPorCliqueNaPlanta: 0.93,
  abrirProjeto: 0.96,
  portaNaParede: 0.88,
  janelaNaParede: 0.89,
  paredeNova: 0.91,
};

/** Bloco de 20 pavimentos no formato do runner, multiplicado por `mult(chave)`. */
function exemplo(mult) {
  const r = (chave, medianaMs, p95Ms) => resumo(medianaMs * mult(chave), p95Ms * mult(chave));
  return {
    pavimentos: 20,
    paredes: 640,
    abrirProjeto: r('abrirProjeto', 1680.6, 1846.9),
    carregarPaginaAteAppPronto: r('carregarPaginaAteAppPronto', 1060.4, 1197.2),
    primeiraPinturaFCP: r('primeiraPinturaFCP', 644.1, 736.5),
    plantaNivelDoMeio: r('plantaNivelDoMeio', 74.7, 235.6),
    selecaoPorCliqueNaPlanta: { cliques: 5, acertouParede: 5, tempo: r('selecaoPorCliqueNaPlanta', 32.9, 70.7) },
    edicaoParede: { edicoes: 5, confirmadasNoStore: 5, tempo: r('edicaoParede', 235.7, 426.4) },
    portaNaParede: { inseridas: 5, tempo: r('portaNaParede', 296.1, 340.8) },
    janelaNaParede: { inseridas: 5, tempo: r('janelaNaParede', 311.0, 372.1) },
    paredeNova: { criadas: 5, tempo: r('paredeNova', 210.5, 260.0) },
    pan: r('pan', 22.0, 32.3),
    zoom: r('zoom', 23.0, 37.5),
    pick3D: { cliques: 20, tempo: r('pick3D', 50.8, 57.0) },
    orbitar3D: { passos: 150, tempo: r('orbitar3D', 18.0, 40.0) },
    pan3D: { passos: 150, tempo: r('pan3D', 17.0, 38.0) },
    edicaoParede3D: { edicoes: 5, confirmadasNoStore: 5, tempo: r('edicaoParede3D', 240.0, 430.0) },
    abrir3DPrimeiroQuadro: { ms: 900.0 * mult('abrir3DPrimeiroQuadro') },
    abrir3DCargaCompleta: { ms: 2400.0 * mult('abrir3DCargaCompleta') },
  };
}

function simular() {
  console.log('MODO SIMULAÇÃO — números inventados, só para exercitar o parsing e o relatório. Nada é medido.');
  const ts = { geradoEm: new Date().toISOString(), app: { endereco: 'simulado?kernel=ts' }, medidas: { '20Pavimentos': exemplo(() => 1) } };
  const rust = {
    geradoEm: new Date().toISOString(),
    app: { endereco: 'simulado?kernel=rust' },
    medidas: { '20Pavimentos': exemplo((chave) => GANHOS_SIMULADOS[chave] ?? 0.97) },
  };
  const resultado = comparar(ts.medidas['20Pavimentos'], rust.medidas['20Pavimentos']);
  const deltaPct = relatar(resultado, { ts: '(simulado) 20 pavimentos, kernel desligado', rust: '(simulado) 20 pavimentos, kernel ligado' });
  const saida = montarSaida(ladoDoBruto('(simulado)', ts), ladoDoBruto('(simulado)', rust), deltaPct);
  const destino = join(os.tmpdir(), `kernel-rust-20-pav-simulado-${Date.now()}.json`);
  gravarArquivo(saida, destino);
  console.log(`\nSimulação gravada fora do repositório (não é baseline): ${destino}`);
  console.log('O arquivo real sai em scripts/perf-baselines/kernel-rust-20-pav-<data>.json quando rodar sem --simular.');
}

// ---------------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------------

const argumentos = process.argv.slice(2);
const valorDoFlag = (nome) => {
  const i = argumentos.indexOf(nome);
  return i >= 0 ? (argumentos[i + 1] ?? null) : null;
};

try {
  if (argumentos.includes('--simular')) {
    simular();
  } else if (argumentos.includes('--ts-json') || argumentos.includes('--rust-json')) {
    compararArquivos(valorDoFlag('--ts-json'), valorDoFlag('--rust-json'));
  } else {
    await medir();
  }
} catch (e) {
  console.error(`[perf-kernel] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(e && typeof e.codigo === 'number' ? e.codigo : 1);
}
