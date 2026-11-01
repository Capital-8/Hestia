import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolveLevel } from '@hestia/engine';
import { migrateProject, ProjectStore } from '@hestia/model';
import { ModelScene } from '@hestia/render';
const p0 = migrateProject(JSON.parse(readFileSync(process.argv[2]!, 'utf8')));
const t = (f: () => unknown): number => { const a = performance.now(); f(); return performance.now() - a; };
const O = { edges: false, shadows: false, dark: false };
const store = new ProjectStore(p0);
const sc = new ModelScene();
let r = p0.levels.map((l) => resolveLevel(p0, l.id));
console.log('build frio', t(() => sc.update(store.project, r, O)).toFixed(0), 'ms');
const w = Object.values(p0.elements).filter((e) => e.kind === 'wall')[300]! as { id: string; heightOffset?: number };
for (let i = 0; i < 3; i++) {
  store.exec({ type: 'updateElements', ids: [w.id], patch: { heightOffset: (w.heightOffset ?? 0) + 0.05 * (i + 1) } });
  const p = store.project;
  let tr = 0; tr = t(() => { r = p.levels.map((l) => resolveLevel(p, l.id)); });
  const ts = t(() => sc.update(p, r, O));
  console.log(`edição ${i + 1}: resolver níveis ${tr.toFixed(0)} ms + atualizar cena ${ts.toFixed(0)} ms`);
}
