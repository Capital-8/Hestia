#!/usr/bin/env node
/**
 * Relatório executável do experimento do kernel geométrico (Rust → WebAssembly).
 *
 * Roda os mesmos casos de `packages/geom/src/kernel/fixtures.ts` por dois caminhos — TypeScript de
 * referência (`boolean.ts`) e kernel wasm (`criarImplKernelDoWasm`) — e imprime:
 *
 *   - tabela por operação: casos, divergências, operações não implementadas, pior delta de área,
 *     tempo do TypeScript (ms), tempo do kernel (ms) e ganho;
 *   - tabela de divergências (caso, operação, motivo, delta), quando houver;
 *   - veredito final `EQUIVALENTE` / `DIVERGENTE` com a contagem.
 *
 * Uso:
 *   node scripts/wasm-equivalencia.mjs
 *   npx vite-node scripts/wasm-equivalencia.mjs
 *
 * O `boolean.ts` importa `clipper-lib` (CJS) com `import * as`; o Node puro não expõe as classes
 * nesse namespace, então o script se recarrega sozinho com o `vite-node` local (o mesmo interop do
 * Vitest) quando detecta esse cenário. O caminho `npx vite-node` também funciona direto.
 *
 * Códigos de saída: 0 = EQUIVALENTE, 1 = DIVERGENTE, 2 = NÃO MEDIDO (sem artefato, sem módulo do
 * kernel ou nenhuma operação implementada). Operações que a crate ainda não implementa aparecem como
 * "não implementada" e **não** derrubam o relatório.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CASOS,
  areaLiquida,
  compararResultados,
  ehNaoImplementada,
  executarKernel,
  executarTs,
  formatarDivergencias,
  normalizar,
  perimetro,
  rotuloOperacao,
} from '../packages/geom/src/kernel/fixtures.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARCA_VITE_NODE = 'HESTIA_WASM_EQUIV_VIA_VITE_NODE';
const ORDEM = ['union', 'difference', 'intersection', 'unionClipper', 'differenceClipper', 'offsetMulti'];

const mensagem = (e) => (e instanceof Error ? e.message : String(e));
const REPETICOES = 3;

/**
 * Executa `fn` algumas vezes e devolve o valor da última chamada e a **mediana** dos tempos.
 * Mediana (não média) para não deixar uma pausa de GC/JIT dominar a primeira medição.
 */
function medir(fn) {
  const tempos = [];
  let valor;
  for (let i = 0; i < REPETICOES; i++) {
    const t0 = performance.now();
    valor = fn();
    tempos.push(performance.now() - t0);
  }
  tempos.sort((a, b) => a - b);
  return { ms: tempos[(tempos.length - 1) >> 1], valor };
}

/** O caminho Clipper só funciona se o namespace CJS de `clipper-lib` expuser as classes. */
function podeUsarCaminhoClipper() {
  const quadrado = [[[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]]];
  try {
    return areaLiquida(executarTs({ tipo: 'unionClipper', args: [quadrado] })) > 0.5;
  } catch {
    return false;
  }
}

function recarregarViaViteNode() {
  const entrada = join(RAIZ, 'node_modules', 'vite-node', 'vite-node.mjs');
  if (!existsSync(entrada)) return false;
  console.error('[wasm-equivalencia] interop CJS do `clipper-lib` indisponível no Node puro; recarregando com vite-node…\n');
  const r = spawnSync(process.execPath, [entrada, fileURLToPath(import.meta.url)], {
    cwd: RAIZ,
    stdio: 'inherit',
    env: { ...process.env, [MARCA_VITE_NODE]: '1' },
  });
  process.exit(r.status ?? 2);
}

if (process.env[MARCA_VITE_NODE] !== '1' && !podeUsarCaminhoClipper()) recarregarViaViteNode();

const CAMINHO_WASM = join(RAIZ, 'packages', 'geom', 'assets', 'geom_wasm.wasm');
const CAMINHO_IMPL = join(RAIZ, 'packages', 'geom', 'src', 'kernel', 'implementacaoRust.ts');

async function carregarModuloKernel() {
  if (!existsSync(CAMINHO_IMPL)) return null;
  for (const alvo of [CAMINHO_IMPL, pathToFileURL(CAMINHO_IMPL).href, './implementacaoRust.ts']) {
    try {
      const mod = await import(/* @vite-ignore */ alvo);
      if (typeof mod.criarImplKernelDoWasm === 'function') return mod;
    } catch {
      // alvo indisponível: tenta o próximo
    }
  }
  return null;
}

const COLUNAS = [
  { titulo: 'operação', largura: 17, valor: (t) => t },
  { titulo: 'casos', largura: 6, valor: (t, s) => String(s.casos) },
  { titulo: 'div', largura: 5, valor: (t, s) => String(s.divergencias) },
  { titulo: 'n/impl', largura: 7, valor: (t, s) => String(s.naoImpl) },
  { titulo: 'pior Δárea m²', largura: 13, valor: (t, s) => s.medidas > 0 ? s.piorArea.toExponential(2) : '—' },
  { titulo: 'pior Δperím m', largura: 13, valor: (t, s) => s.medidas > 0 ? s.piorPerimetro.toExponential(2) : '—' },
  { titulo: 'TS ms', largura: 9, valor: (t, s) => s.medidas + s.naoImpl > 0 ? s.msTs.toFixed(2) : '—' },
  { titulo: 'Rust ms', largura: 9, valor: (t, s) => s.medidas > 0 ? s.msRust.toFixed(2) : '—' },
  { titulo: 'ganho', largura: 7, valor: (t, s) => (s.medidas > 0 && s.msRust > 0 ? `${(s.msTs / s.msRust).toFixed(1)}×` : '—') },
];

function imprimirTabela(stats) {
  const linha = (valores) => `| ${valores.map((v, i) => String(v).padEnd(COLUNAS[i].largura)).join(' | ')} |`;
  const separador = `| ${COLUNAS.map((c) => '-'.repeat(c.largura)).join(' | ')} |`;
  console.log(linha(COLUNAS.map((c) => c.titulo)));
  console.log(separador);
  for (const tipo of ORDEM) {
    const s = stats.get(tipo);
    console.log(linha(COLUNAS.map((c) => c.valor(tipo, s))));
  }
  // Total só das operações medidas nos DOIS lados: incluir o TS de uma operação que o kernel não
  // implementa inflaria o "ganho" com trabalho que o Rust não fez.
  const total = ORDEM.filter((tipo) => stats.get(tipo).medidas > 0).reduce(
    (acc, tipo) => {
      const s = stats.get(tipo);
      return { msTs: acc.msTs + s.msTsPar, msRust: acc.msRust + s.msRust };
    },
    { msTs: 0, msRust: 0 },
  );
  console.log(separador);
  const soma = COLUNAS.map((c) => {
    if (c.titulo === 'operação') return 'TOTAL';
    if (c.titulo === 'TS ms') return total.msTs.toFixed(2);
    if (c.titulo === 'Rust ms') return total.msRust.toFixed(2);
    if (c.titulo === 'ganho') return total.msRust > 0 ? `${(total.msTs / total.msRust).toFixed(1)}×` : '—';
    return '';
  });
  console.log(linha(soma));
}

async function principal() {
  console.log('== Equivalência geométrica: TypeScript × kernel wasm ==\n');
  if (!existsSync(CAMINHO_WASM)) {
    console.error(`[sem artefato] ${CAMINHO_WASM} não existe. Rode \`node scripts/build-wasm.mjs\` (requer cargo) antes.`);
    return 2;
  }
  const bytes = new Uint8Array(readFileSync(CAMINHO_WASM));
  console.log(`wasm: ${CAMINHO_WASM} (${(bytes.length / 1024).toFixed(1)} kB)`);

  const modulo = await carregarModuloKernel();
  if (modulo === null) {
    console.error('[sem implementação] `packages/geom/src/kernel/implementacaoRust.ts` não existe ou não exporta `criarImplKernelDoWasm`.');
    return 2;
  }

  const tInit = performance.now();
  const impl = await modulo.criarImplKernelDoWasm(bytes);
  console.log(`kernel instanciado em ${(performance.now() - tInit).toFixed(2)} ms\n`);

  const stats = new Map(
    ORDEM.map((tipo) => [
      tipo,
      { casos: 0, medidas: 0, naoImpl: 0, divergencias: 0, piorArea: 0, piorPerimetro: 0, msTs: 0, msTsPar: 0, msRust: 0, erros: new Set() },
    ]),
  );
  const divergencias = [];
  let operacoes = 0;

  // Aquecimento fora da medição: JIT do TypeScript e cache interno do wasm.
  for (const op of CASOS[0].operacoes) {
    try {
      executarTs(op);
    } catch {
      /* stub: o laço principal reporta */
    }
    try {
      executarKernel(impl, op);
    } catch {
      /* ainda não implementada */
    }
  }

  for (const caso of CASOS) {
    for (const op of caso.operacoes) {
      operacoes++;
      const s = stats.get(op.tipo);
      s.casos++;
      const rotulo = rotuloOperacao(op);
      let referencia;
      let medicaoTs;
      try {
        medicaoTs = medir(() => executarTs(op));
      } catch (e) {
        s.divergencias++;
        divergencias.push({ caso: caso.id, operacao: rotulo, motivo: 'erro no caminho TS', delta: mensagem(e) });
        continue;
      }
      referencia = medicaoTs.valor;
      s.msTs += medicaoTs.ms;

      let resultado;
      let medicaoRust;
      try {
        medicaoRust = medir(() => executarKernel(impl, op));
      } catch (e) {
        // "Não implementada" é cobertura parcial declarada; qualquer outro erro é divergência real.
        if (ehNaoImplementada(e)) {
          s.naoImpl++;
          s.erros.add(mensagem(e));
        } else {
          s.divergencias++;
          divergencias.push({ caso: caso.id, operacao: rotulo, motivo: 'erro no kernel', delta: mensagem(e) });
        }
        continue;
      }
      resultado = medicaoRust.valor;
      s.msRust += medicaoRust.ms;
      s.msTsPar += medicaoTs.ms;
      s.medidas++;
      s.piorArea = Math.max(s.piorArea, Math.abs(areaLiquida(resultado) - areaLiquida(referencia)));
      s.piorPerimetro = Math.max(s.piorPerimetro, Math.abs(perimetro(normalizar(resultado)) - perimetro(normalizar(referencia))));

      const ds = compararResultados(caso.id, rotulo, referencia, resultado);
      if (ds.length > 0) {
        s.divergencias += ds.length;
        divergencias.push(...ds);
      }
    }
  }

  imprimirTabela(stats);
  console.log(`\ntempos: mediana de ${REPETICOES} execuções por operação (com aquecimento antes); TOTAL só das operações medidas nos dois lados.`);

  const medidas = ORDEM.reduce((acc, tipo) => acc + stats.get(tipo).medidas, 0);
  const naoImpl = ORDEM.reduce((acc, tipo) => acc + stats.get(tipo).naoImpl, 0);
  console.log(`\n${CASOS.length} casos · ${operacoes} operações · ${medidas} medidas no kernel · ${naoImpl} não implementadas`);

  const erros = [...new Set(ORDEM.flatMap((tipo) => [...stats.get(tipo).erros]))];
  if (erros.length > 0) console.log(`\nMotivo das não implementadas (exemplos): ${erros.slice(0, 3).join(' · ')}`);

  if (divergencias.length > 0) console.log(`\n${formatarDivergencias(divergencias)}\n`);

  if (medidas === 0) {
    console.log('VEREDITO: NÃO MEDIDO — nenhuma operação do kernel foi implementada (crate ainda em stub?).');
    return 2;
  }
  if (divergencias.length === 0) {
    console.log(`VEREDITO: EQUIVALENTE — ${medidas} operação(ões) medidas, 0 divergências, ${naoImpl} não implementada(s).`);
    return 0;
  }
  console.log(`VEREDITO: DIVERGENTE — ${medidas} operação(ões) medidas, ${divergencias.length} divergência(s), ${naoImpl} não implementada(s).`);
  return 1;
}

process.exit(await principal());
