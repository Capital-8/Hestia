// Harness por pavimento do kernel v2 (decisão 0046 §5).
//
// Uso: npx vite-node scripts/kernel-harness.mts -- <projeto.json> [--wasm caminho] [--paredes P]
//      npx vite-node scripts/kernel-harness.mts -- --sintetico N [--paredes P] [--wasm caminho]
// Sem --wasm usa a implementação falsa em TypeScript (autoteste do harness). Sai com código != 0 em qualquer divergência.
import { readFileSync } from 'node:fs';
import { migrateProject } from '@hestia/model';
import { syntheticProject } from './perf-baselines/projeto-sintetico.mts';
import { executarHarness, formatarTabela } from './kernel-harness-nucleo.mts';

const args = process.argv.slice(2).filter((a) => a !== '--');
const valor = (nome: string): string | undefined => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};

const caminhoWasm = valor('--wasm');
const sintetico = valor('--sintetico');
const paredesPorPav = valor('--paredes');
const posicionais = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]!.startsWith('--')));

let projeto;
if (sintetico !== undefined) {
  projeto = syntheticProject(Number(sintetico), paredesPorPav ? Number(paredesPorPav) : undefined);
} else if (posicionais[0]) {
  projeto = migrateProject(JSON.parse(readFileSync(posicionais[0], 'utf8')));
} else {
  console.error('uso: kernel-harness.mts <projeto.json> | --sintetico N  [--paredes P] [--wasm caminho]');
  process.exit(2);
}

const resultado = await executarHarness({ projeto, wasm: caminhoWasm ? readFileSync(caminhoWasm) : undefined });
console.log(formatarTabela(resultado));
if (resultado.divergencias.length > 0) {
  console.error(`\n${resultado.divergencias.length} divergência(s):`);
  for (const d of resultado.divergencias.slice(0, 50)) console.error(`  - ${d}`);
  process.exit(1);
}
console.log('\n0 divergências.');
