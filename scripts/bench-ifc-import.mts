/**
 * Mede a importação de um IFC sem a interface (Node): leitura, parsing, mapeamento e memória.
 * Uso: `npx vite-node scripts/bench-ifc-import.mts -- "C:/caminho/arquivo.ifc"`.
 */
import { readFileSync } from 'node:fs';
import { parseStep, schemaOf } from '../packages/io/src/ifcImport/step.ts';
import { importIfc } from '../packages/io/src/ifcImport/mapping.ts';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: npx vite-node scripts/bench-ifc-import.mts -- "caminho/arquivo.ifc"');
  process.exit(1);
}

const t0 = performance.now();
const texto = readFileSync(arquivo, 'utf8');
const t1 = performance.now();
console.log(`bytes=${texto.length} leitura=${(t1 - t0).toFixed(0)}ms schema=${schemaOf(texto)}`);

const t2 = performance.now();
const step = parseStep(texto);
const t3 = performance.now();
console.log(`entidades=${step.entities.size} quebradas=${step.broken} parse=${(t3 - t2).toFixed(0)}ms`);

const contagem = new Map<string, number>();
for (const e of step.entities.values()) contagem.set(e.type, (contagem.get(e.type) ?? 0) + 1);
const top = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('tipos:', top.map(([t, n]) => `${t}=${n}`).join(' '));

const t4 = performance.now();
const { project, report } = importIfc(texto);
const t5 = performance.now();
console.log(`importIfc=${(t5 - t4).toFixed(0)}ms`);
console.log(`elementos=${Object.keys(project.elements).length} niveis=${project.levels.length}`);
console.log('importado:', JSON.stringify(report.imported));
console.log('generico:', JSON.stringify(report.generic));
console.log('geometria:', JSON.stringify(report.geometry));
console.log('ignorados:', JSON.stringify(report.skipped));
const mem = process.memoryUsage();
console.log(`memoria rss=${(mem.rss / 1048576).toFixed(0)}MB heap=${(mem.heapUsed / 1048576).toFixed(0)}MB`);
