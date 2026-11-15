import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { junctionLevel, quantifyLevel, resolveLevel } from '@hestia/engine';
import { wallLayerSolid } from '@hestia/render';
import { projectIfc } from './ifcExport.ts';

/** J4 · o volume do sólido 3D (J3), dos quantitativos e do IFC (lido do STEP) coincide em junção exata de arco inclinado (1e-3). */
const NOW = new Date('2026-11-15T12:00:00Z');
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt: number; sag: number }
function build(walls: W[], height: number): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  for (const w of walls) s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, tilt: w.tilt, sag: w.sag, joinStart: j, joinEnd: j }) as Wall });
  return s.project;
}
/** Entidades STEP `#n=TIPO(args)` por número. */
function entidades(text: string): Map<number, { tipo: string; args: string }> {
  const m = new Map<number, { tipo: string; args: string }>();
  for (const l of text.split('\n')) {
    const r = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/.exec(l.trim());
    if (r) m.set(Number(r[1]), { tipo: r[2]!, args: r[3]! });
  }
  return m;
}
const refs = (s: string): number[] => (s.match(/#(\d+)/g) ?? []).map((x) => Number(x.slice(1)));
const nums = (s: string): number[] => (s.match(/-?\d+(?:\.\d+)?(?:E-?\d+)?/gi) ?? []).map(Number);

/** Volume dos sólidos do arquivo (projeto com uma só parede): extrusão (área × profundidade × cos da direção) ou Brep (divergência). */
function volumeDaParede(text: string): { volume: number; tipo: string } {
  const e = entidades(text);
  let total = 0;
  let tipo = '';
  for (const [, ent] of e) {
    if (ent.tipo === 'IFCEXTRUDEDAREASOLID') {
      tipo = 'extrusao';
      const [perfil, , dir] = refs(ent.args);
      const curva = e.get(refs(e.get(perfil!)!.args)[0]!)!;
      const pts = refs(curva.args).map((id) => nums(e.get(id)!.args));
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0]! * pts[i + 1]![1]! - pts[i + 1]![0]! * pts[i]![1]!;
      const d = nums(e.get(dir!)!.args);
      const depth = nums(ent.args.slice(ent.args.lastIndexOf(',') + 1))[0]!;
      total += (Math.abs(a) / 2) * depth * d[2]!;
    } else if (ent.tipo === 'IFCFACETEDBREP') {
      tipo = 'brep';
      const shell = e.get(refs(ent.args)[0]!)!;
      for (const f of refs(shell.args)) {
        for (const b of refs(e.get(f)!.args)) {
          const loop = e.get(refs(e.get(b)!.args)[0]!)!;
          const p = refs(loop.args).map((id) => nums(e.get(id)!.args));
          for (let i = 1; i < p.length - 1; i++) {
            const [a0, b0, c0] = [p[0]!, p[i]!, p[i + 1]!];
            total += (a0[0]! * (b0[1]! * c0[2]! - b0[2]! * c0[1]!) - a0[1]! * (b0[0]! * c0[2]! - b0[2]! * c0[0]!) + a0[2]! * (b0[0]! * c0[1]! - b0[1]! * c0[0]!)) / 6;
          }
        }
      }
    }
  }
  return { volume: total, tipo };
}


/** Volume por divergência da malha do sólido 3D. */
function volume3d(p: Project, id: string): number {
  const rl = resolveLevel(p, 'lv_0');
  const jl = junctionLevel(p, 'lv_0');
  const rw = rl.walls[id]!;
  const b = wallLayerSolid(rw, rw.layers[0]!, jl);
  const pt = (i: number): number[] => [b.positions[i * 3]!, b.positions[i * 3 + 1]!, b.positions[i * 3 + 2]!];
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const a = pt(b.indices[i]!), c = pt(b.indices[i + 1]!), d = pt(b.indices[i + 2]!);
    v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
  }
  return v;
}
const SAG = -(5 - Math.sqrt(25 - 12.5));

describe('J4 · 3D = quantitativo = IFC na junção exata de arco inclinado', () => {
  it('arcos concêntricos tangentes R=5, tilt −10°: 4,686577 por parede (literal) e os três coincidem', () => {
    const p = build([{ id: 'A', a: { x: 5, y: 0 }, b: { x: 0, y: 5 }, sag: SAG, tilt: -10 }, { id: 'B', a: { x: 0, y: 5 }, b: { x: -5, y: 0 }, sag: SAG, tilt: -10 }], 2.8);
    const v3 = volume3d(p, 'A') + volume3d(p, 'B');
    const q = quantifyLevel(p, resolveLevel(p, 'lv_0')).walls.reduce((s, w) => s + w.grossVolume, 0);
    const ifc = volumeDaParede(projectIfc(p, NOW));
    expect(ifc.tipo).toBe('brep');
    expect(Math.abs(v3 / (2 * 4.686576785591231) - 1)).toBeLessThan(1e-3);
    expect(Math.abs(q / v3 - 1)).toBeLessThan(1e-3);
    expect(Math.abs(ifc.volume / v3 - 1)).toBeLessThan(1e-3);
  });

  it('círculos de centros (0,0) e (6,0), R=5, 15° afastando (canto não linear): 3D, quantitativo e IFC coincidem', () => {
    const sg = 5 - Math.sqrt(20);
    const p = build([{ id: 'A', a: { x: 3, y: 4 }, b: { x: 5, y: 0 }, sag: sg, tilt: 15 }, { id: 'B', a: { x: 3, y: 4 }, b: { x: 1, y: 0 }, sag: -sg, tilt: -15 }], 2.8);
    const v3 = volume3d(p, 'A') + volume3d(p, 'B');
    const q = quantifyLevel(p, resolveLevel(p, 'lv_0')).walls.reduce((s, w) => s + w.grossVolume, 0);
    const ifc = volumeDaParede(projectIfc(p, NOW));
    expect(v3).toBeGreaterThan(5);
    expect(Math.abs(q / v3 - 1)).toBeLessThan(1e-3);
    expect(Math.abs(ifc.volume / v3 - 1)).toBeLessThan(1e-3);
  });
});
