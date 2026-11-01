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
const win = Object.values(p0.elements).filter((e) => e.kind === 'window')[40]! as { id: string };
const wall = Object.values(p0.elements).filter((e) => e.kind === 'wall')[300]! as { id: string; heightOffset?: number };
function passo(nome: string, cmd: object): void {
  store.exec(cmd as never);
  const p = store.project;
  const tr = t(() => { r = p.levels.map((l) => resolveLevel(p, l.id)); });
  const ts = t(() => sc.update(p, r, O));
  console.log(`${nome}: resolver ${tr.toFixed(0)} ms + cena ${ts.toFixed(0)} ms`);
}
for (let i = 0; i < 2; i++) {
  passo('apagar janela', { type: 'deleteElements', ids: [win.id] });
  store.undo();
  passo('altura parede', { type: 'updateElements', ids: [wall.id], patch: { heightOffset: (wall.heightOffset ?? 0) + 0.05 * (i + 1) } });
}
