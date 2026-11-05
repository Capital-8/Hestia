import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolveLevel } from '@hestia/engine';
import { migrateProject, type Id } from '@hestia/model';
import { LIGHT, ModelScene, buildPlanDrawList, planViewOf, type PlanInput } from '@hestia/render';

const file = process.argv[2]!;
const p = migrateProject(JSON.parse(readFileSync(file, 'utf8')));
const t = (f: () => unknown): number => { const a = performance.now(); f(); return performance.now() - a; };
const f1 = (x: number) => x.toFixed(1).padStart(8);
let resolved: ReturnType<typeof resolveLevel>[] = [];
console.log('resolveLevel x', p.levels.length, f1(t(() => { resolved = p.levels.map((l) => resolveLevel(p, l.id)); })), 'ms');
const sc = new ModelScene();
const O = { edges: false, shadows: false, dark: false };
console.log('ModelScene.update frio ', f1(t(() => sc.update(p, resolved, O))));
console.log('ModelScene.update quente', f1(t(() => sc.update(p, resolved, O))));
const todos = Object.values(p.elements);
const porTipo = new Map<string, Id[]>();
for (const e of todos) { const a = porTipo.get(e.kind) ?? []; a.push(e.id); porTipo.set(e.kind, a); }
const h = (ids: Id[]) => sc.highlight(ids, null);
for (const [k, ids] of porTipo) {
  const um = ids.slice(0, 12); const r: number[] = [];
  for (const id of um) { sc.highlight([], null); r.push(t(() => h([id]))); }
  r.sort((a, b) => a - b);
  const caixa = t(() => sc.selectionBounds(ids.slice(0, 1)));
  console.log(`1 ${k.padEnd(8)} highlight mediana ${f1(r[r.length >> 1]!)} max ${f1(r.at(-1)!)}  | n=${ids.length}`);
}
for (const [k, ids] of porTipo) {
  sc.highlight([], null);
  console.log(`TODOS ${k.padEnd(8)} (${ids.length}) frio ${f1(t(() => h(ids)))}  mesmo-array ${f1(t(() => h(ids)))}  bounds ${f1(t(() => sc.selectionBounds(ids)))}`);
}
const ids = todos.filter((e) => e.kind !== 'room').map((e) => e.id);
sc.highlight([], null);
console.log(`TUDO (${ids.length}) frio ${f1(t(() => h(ids)))} novo array ${f1(t(() => h([...ids])))}`);
const sel = [...ids]; const g = t(() => { for (let i = 0; i < 60; i++) sc.highlight(sel, ids[i]!); });
console.log('TUDO selecionado + 60 hovers distintos', f1(g), 'ms');
// ocultar paredes
const lv = p.levels[3]!.id;
const paredes = todos.filter((e) => e.kind === 'wall');
const ocultos = new Set(paredes.map((w) => w.id));
console.log('ocultar todas as paredes (update)', f1(t(() => sc.update(p, resolved, { ...O, hidden: ocultos }))));
console.log('mostrar de novo (update)        ', f1(t(() => sc.update(p, resolved, O))));
const um = new Set([paredes[5]!.id]);
console.log('ocultar 1 parede (update)       ', f1(t(() => sc.update(p, resolved, { ...O, hidden: um }))));
// planta
const base = (selection: Id[]): PlanInput => ({
  project: p, levelId: lv, resolved: resolved[3]!, below: resolved[2]!, viewport: { cx: 30, cy: 20, zoom: 15, width: 1600, height: 900 }, theme: LIGHT, dark: false,
  selection, hover: null, preview: [], inference: null, showGrid: true, showRoofProjection: true,
} as PlanInput);
const ids3 = todos.filter((e) => (e as { levelId?: Id }).levelId === lv).map((e) => e.id);
console.log(`planta nivel ${lv} (${ids3.length} el.): sem sel`, f1(t(() => buildPlanDrawList(base([])))), ' idem', f1(t(() => buildPlanDrawList(base([])))));
console.log('  com tudo selecionado', f1(t(() => buildPlanDrawList(base(ids3)))), ' idem', f1(t(() => buildPlanDrawList(base(ids3)))));
console.log('  voltar a sem sel    ', f1(t(() => buildPlanDrawList(base([])))));
console.log('  1 selecionado       ', f1(t(() => buildPlanDrawList(base([ids3[3]!])))));
