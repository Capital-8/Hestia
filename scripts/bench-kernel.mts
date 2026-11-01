// Grava as booleanas reais da montagem 3D (TypeScript) e reproduz no kernel Rust, comparando tempo e área por operação.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolveLevel } from '@hestia/engine';
import { migrateProject } from '@hestia/model';
import { ModelScene } from '@hestia/render';
import * as ts from '../packages/geom/src/boolean.ts';
import { definirImplKernel, type ImplKernel } from '../packages/geom/src/kernel/contrato.ts';
import { criarImplKernelDoWasm } from '../packages/geom/src/kernel/implementacaoRust.ts';
import { multiArea, type MultiPolygon } from '../packages/geom/src/polygon.ts';

type Reg = { op: 'uniao' | 'diferenca' | 'interseccao' | 'offset'; args: MultiPolygon[]; delta: number; tsMs: number; area: number };
const regs: Reg[] = [];
const T = <R,>(f: () => R): [R, number] => { const a = performance.now(); const r = f(); return [r, performance.now() - a]; };
const gravador: ImplKernel = {
  nome: 'rec',
  uniao: (args) => { const [r, ms] = T(() => ts.union(...args)); regs.push({ op: 'uniao', args, delta: 0, tsMs: ms, area: multiArea(r) }); return r; },
  diferenca: (args) => { const [r, ms] = T(() => ts.difference(args[0]!, ...args.slice(1))); regs.push({ op: 'diferenca', args, delta: 0, tsMs: ms, area: multiArea(r) }); return r; },
  interseccao: (a, b) => { const [r, ms] = T(() => ts.intersection(a, b)); regs.push({ op: 'interseccao', args: [a, b], delta: 0, tsMs: ms, area: multiArea(r) }); return r; },
  offset: (m, d) => { const [r, ms] = T(() => ts.offsetMulti(m, d)); regs.push({ op: 'offset', args: [m], delta: d, tsMs: ms, area: multiArea(r) }); return r; },
};
const p = migrateProject(JSON.parse(readFileSync(process.argv[2]!, 'utf8')));
const resolved = p.levels.map((l) => resolveLevel(p, l.id));
definirImplKernel(gravador);
const [, tTotal] = T(() => new ModelScene().update(p, resolved, { edges: false, shadows: false, dark: false }));
definirImplKernel(null);
console.log(`montagem 3D gravada: ${regs.length} operações, ${tTotal.toFixed(0)} ms (tempo total com gravação)`);

const wasm = readFileSync(process.argv[3] ?? 'packages/geom/assets/geom_wasm.wasm');
const rust = await criarImplKernelDoWasm(wasm);
const por = new Map<string, { n: number; ts: number; rust: number; vertsMed: number; divergencias: number; naoImpl: number }>();
const maiores: Array<{ op: string; tsMs: number; rustMs: number; nargs: number; verts: number }> = [];
for (const r of regs) {
  const s = por.get(r.op) ?? { n: 0, ts: 0, rust: 0, vertsMed: 0, divergencias: 0, naoImpl: 0 };
  por.set(r.op, s);
  const verts = r.args.reduce((a, m) => a + m.reduce((b, po) => b + po.reduce((c, an) => c + an.length, 0), 0), 0);
  let out: MultiPolygon | null = null; let ms = 0;
  try {
    [out, ms] = T(() => r.op === 'uniao' ? rust.uniao(r.args) : r.op === 'diferenca' ? rust.diferenca(r.args) : r.op === 'interseccao' ? rust.interseccao(r.args[0]!, r.args[1]!) : rust.offset(r.args[0]!, r.delta));
  } catch (e) { s.naoImpl++; if (s.naoImpl <= 4) console.log("FALHA", r.op, (e as Error).message, JSON.stringify(r.args).slice(0, 300)); continue; }
  s.n++; s.ts += r.tsMs; s.rust += ms; s.vertsMed += verts;
  if (Math.abs(multiArea(out!) - r.area) > 1e-4 * Math.max(1, Math.abs(r.area))) { s.divergencias++; if (s.divergencias <= 6) console.log('DIVERGE', r.op, 'args', r.args.length, 'verts', verts, 'TS', r.area.toFixed(6), 'Rust', multiArea(out!).toFixed(6), 'entradas', r.args.map((m) => multiArea(m).toFixed(5)).join(' | ')); }
  maiores.push({ op: r.op, tsMs: r.tsMs, rustMs: ms, nargs: r.args.length, verts });
}
console.log('\nop            n     TS ms   Rust ms   verts/op  args/op  divergências de área  falhas');
for (const [op, s] of por) console.log(op.padEnd(12), String(s.n).padStart(6), s.ts.toFixed(0).padStart(9), s.rust.toFixed(0).padStart(9), (s.vertsMed / Math.max(1, s.n)).toFixed(0).padStart(9), '', String(s.divergencias).padStart(10), String(s.naoImpl).padStart(8));
console.log('\nmaiores diferenças (Rust − TS):');
maiores.sort((a, b) => (b.rustMs - b.tsMs) - (a.rustMs - a.tsMs)).slice(0, 8).forEach((m) => console.log(m.op.padEnd(11), 'args', String(m.nargs).padStart(4), 'verts', String(m.verts).padStart(6), 'TS', m.tsMs.toFixed(2).padStart(8), 'Rust', m.rustMs.toFixed(2).padStart(8)));
