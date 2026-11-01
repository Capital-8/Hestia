import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { computeSection } from '@hestia/engine';
import { migrateProject, ProjectStore } from '@hestia/model';
import { definirImplKernel } from '../packages/geom/src/kernel/contrato.ts';
import { criarImplKernelDoWasm } from '../packages/geom/src/kernel/implementacaoRust.ts';
if (process.env.KERNEL === 'rust') definirImplKernel(await criarImplKernelDoWasm(readFileSync('packages/geom/assets/geom_wasm.wasm')));
const p0 = migrateProject(JSON.parse(readFileSync(process.argv[2]!, 'utf8')));
const t = (f: () => unknown): number => { const a = performance.now(); f(); return performance.now() - a; };
const store = new ProjectStore(p0);
const linha = { a: { x: 5, y: -8 }, b: { x: 30, y: -8 }, depth: 40 };
console.log('corte frio', t(() => computeSection(store.project, linha)).toFixed(0), 'ms');
console.log('corte mesmo projeto', t(() => computeSection(store.project, linha)).toFixed(0), 'ms');
const w = Object.values(p0.elements).filter((e) => e.kind === 'wall')[300]! as { id: string; heightOffset?: number };
for (let i = 0; i < 2; i++) {
  store.exec({ type: 'updateElements', ids: [w.id], patch: { heightOffset: (w.heightOffset ?? 0) + 0.05 * (i + 1) } });
  console.log(`corte após edição ${i + 1}`, t(() => computeSection(store.project, linha)).toFixed(0), 'ms');
}
