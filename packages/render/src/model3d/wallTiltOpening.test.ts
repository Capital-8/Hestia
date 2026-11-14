import { describe, expect, it } from 'vitest';
import { resolveLevel, type ResolvedWall } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Opening, type OpeningPlane } from '@hestia/model';
import { wallLayerSolid, type SolidBatch } from './solids.ts';

const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });

/** Parede reta 4 m, H=3, t=0,2, com uma janela 1,2x1,0 (peitoril 1,0) ou porta 0,9x2,1 em offset 2. */
function wall(tilt: number, op?: { kind: 'window' | 'door'; plano?: OpeningPlane }): ResolvedWall {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const ot = base.openingTypes.ot_j120!;
  base.openingTypes.ot_jan = { ...ot, id: 'ot_jan', width: 1.2, height: 1.0, sill: 1.0, leaves: 0 };
  base.openingTypes.ot_por = { ...base.openingTypes.ot_p80!, id: 'ot_por', width: 0.9, height: 2.1, sill: 0, leaves: 0 };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ...(tilt ? { tilt } : {}) }) });
  if (op) {
    const o: Opening = { id: 'o1', kind: op.kind, typeId: op.kind === 'window' ? 'ot_jan' : 'ot_por', hostId: 'w1', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...(op.plano ? { plano: op.plano } : {}) };
    s.exec({ type: 'addOpening', opening: o });
  }
  return resolveLevel(s.project, 'lv_0').walls.w1!;
}
const solids = (rw: ResolvedWall): SolidBatch[] => rw.layers.map((l) => wallLayerSolid(rw, l));
const vol = (bs: SolidBatch[]): number => {
  let v = 0;
  for (const b of bs) {
    const P = (k: number): number[] => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!];
    for (let i = 0; i < b.indices.length; i += 3) {
      const [a, c, d] = [P(b.indices[i]!), P(b.indices[i + 1]!), P(b.indices[i + 2]!)] as [number[], number[], number[]];
      v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
    }
  }
  return v;
};
function closed(b: SolidBatch): boolean {
  const id = new Map<string, number>();
  const vid = (k: number): number => {
    const key = [0, 1, 2].map((j) => b.positions[k * 3 + j]!.toFixed(6)).join(',');
    if (!id.has(key)) id.set(key, id.size);
    return id.get(key)!;
  };
  const dir = new Map<string, number>();
  for (let i = 0; i < b.indices.length; i += 3) {
    const t = [vid(b.indices[i]!), vid(b.indices[i + 1]!), vid(b.indices[i + 2]!)];
    for (let j = 0; j < 3; j++) if (t[j] !== t[(j + 1) % 3]) dir.set(`${t[j]}>${t[(j + 1) % 3]}`, (dir.get(`${t[j]}>${t[(j + 1) % 3]}`) ?? 0) + 1);
  }
  for (const [k, n] of dir) {
    const [u, w] = k.split('>');
    if (n !== 1 || dir.get(`${w}>${u}`) !== 1) return false;
  }
  return dir.size > 0;
}
const zRange = (b: SolidBatch): [number, number] => {
  const zs = b.positions.filter((_, i) => i % 3 === 2);
  return [Math.min(...zs), Math.max(...zs)];
};

describe('F2.8: vão em parede inclinada (θ=15°, t=0,2)', () => {
  it('janela inclinada retira 0,2400 e a malha segue fechada', () => {
    const cheia = vol(solids(wall(15)));
    const rw = wall(15, { kind: 'window' });
    expect(rw.tiltCuts).toHaveLength(1);
    const bs = solids(rw);
    expect(cheia - vol(bs)).toBeCloseTo(0.24, 4);
    expect(bs.every(closed)).toBe(true);
  });
  it('janela vertical (plano declarado) retira 0,2400/cosθ = 0,2485: o corte atual', () => {
    const cheia = vol(solids(wall(15)));
    const rw = wall(15, { kind: 'window', plano: 'vertical' });
    expect(rw.tiltCuts).toBeUndefined();
    const bs = solids(rw);
    expect(cheia - vol(bs)).toBeCloseTo(0.24 / Math.cos((15 * Math.PI) / 180), 4);
    expect(bs.every(closed)).toBe(true);
  });
  it('porta vertical (padrão) retira 0,3913; porta inclinada abre pelo piso, volume ≥ 0,378 e malha fechada', () => {
    const cheia = vol(solids(wall(15)));
    const v = wall(15, { kind: 'door' });
    expect(v.tiltCuts).toBeUndefined();
    expect(cheia - vol(solids(v))).toBeCloseTo(0.3913, 4);
    const i = wall(15, { kind: 'door', plano: 'inclinado' });
    const bs = solids(i);
    expect(bs.every(closed)).toBe(true);
    expect(zRange(bs[0]!)[0]).toBeGreaterThanOrEqual(-1e-9);
    expect(cheia - vol(bs)).toBeGreaterThan(0.37);
  });
  it('topo da janela inclinada: z = 1 + cosθ − e·senθ nas faces (1,9400 e 1,9918), centro 1,9659', () => {
    const bs = solids(wall(15, { kind: 'window' }));
    const alturas = new Set<number>();
    for (let i = 2; i < bs[0]!.positions.length; i += 3) alturas.add(Math.round(bs[0]!.positions[i]! * 1e4) / 1e4);
    expect(alturas.has(1.94)).toBe(true);
    expect(alturas.has(1.9918)).toBe(true);
    expect(zRange(bs[0]!)[1]).toBeCloseTo(3, 6);
  });
  it('θ=0: janela inclinada e vertical dão o mesmo sólido (sem tiltCuts)', () => {
    const a = wall(0, { kind: 'window', plano: 'inclinado' });
    const b = wall(0, { kind: 'window', plano: 'vertical' });
    expect(a.tiltCuts).toBeUndefined();
    expect(vol(solids(a))).toBeCloseTo(vol(solids(b)), 12);
  });
});
