// Corte incremental no projeto real: tempo por etapa e conferência contra o corte completo.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { computeSection, SecaoIncremental } from '@hestia/engine';
import { migrateProject, ProjectStore } from '@hestia/model';
import { definirImplKernel } from '../packages/geom/src/kernel/contrato.ts';
import { criarImplKernelDoWasm } from '../packages/geom/src/kernel/implementacaoRust.ts';
if (process.env.KERNEL === 'rust') definirImplKernel(await criarImplKernelDoWasm(readFileSync('packages/geom/assets/geom_wasm.wasm')));
const p0 = migrateProject(JSON.parse(readFileSync(process.argv[2]!, 'utf8')));
const store = new ProjectStore(p0);
const linha = { a: { x: 5, y: -8 }, b: { x: 30, y: -8 }, depth: 40 };
const inc = new SecaoIncremental();
const t = <T,>(f: () => T): [T, number] => { const a = performance.now(); const r = f(); return [r, performance.now() - a]; };
const [r0, t0] = t(() => inc.calcular(store.project, linha));
console.log('incremental frio', t0.toFixed(0), 'ms; níveis', inc.recalculados);
const [, t1] = t(() => inc.calcular(store.project, linha));
console.log('incremental mesmo projeto', t1.toFixed(0), 'ms; níveis', inc.recalculados);
const paredes = Object.values(p0.elements).filter((e) => e.kind === 'wall') as Array<{ id: string; heightOffset?: number }>;
for (const [nome, w] of [['parede A', paredes[300]!], ['parede B', paredes[900]!]] as const) {
  store.exec({ type: 'updateElements', ids: [w.id], patch: { heightOffset: (w.heightOffset ?? 0) + 0.05 } });
  const [ri, ti] = t(() => inc.calcular(store.project, linha));
  const [rc, tc] = t(() => computeSection(store.project, linha));
  console.log(`${nome}: incremental ${ti.toFixed(0)} ms (níveis ${inc.recalculados}) | completo ${tc.toFixed(0)} ms | igual: ${JSON.stringify(ri) === JSON.stringify(rc)}`);
}
console.log('frio igual ao completo:', JSON.stringify(r0).length);
import { chavesDoCorte } from '@hestia/engine';
const [, ts] = t(() => chavesDoCorte(store.project, linha));
console.log('assinaturas', ts.toFixed(0), 'ms');
