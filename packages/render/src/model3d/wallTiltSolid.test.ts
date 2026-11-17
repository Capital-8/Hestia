import { describe, expect, it } from 'vitest';
import { resolveLevel, type ResolvedWall } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer } from '@hestia/model';
import { clearWallLayerCache, wallLayerCacheStats, wallLayerSolid, type SolidBatch } from './solids.ts';

const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });

function resolved(layers: number[], wall: { a: { x: number; y: number }; b: { x: number; y: number }; sag?: number; tilt?: number }): ResolvedWall {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: layers.map(camada) };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_t', levelId: 'lv_0', height: 3, ...wall }) });
  return resolveLevel(s.project, 'lv_0').walls.w1!;
}
const solids = (rw: ResolvedWall): SolidBatch[] => rw.layers.map((l) => wallLayerSolid(rw, l));

/** Volume com sinal (tetraedros com a origem): positivo = malha fechada com normais para fora. */
function signedVolume(b: SolidBatch): number {
  let v = 0;
  const P = (k: number): number[] => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!];
  for (let i = 0; i < b.indices.length; i += 3) {
    const [a, c, d] = [P(b.indices[i]!), P(b.indices[i + 1]!), P(b.indices[i + 2]!)] as [number[], number[], number[]];
    v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
  }
  return v;
}
const total = (bs: SolidBatch[]): number => bs.reduce((s, b) => s + signedVolume(b), 0);

/** Toda aresta (vértices soldados por posição) aparece em exatamente 2 triângulos, em sentidos opostos. */
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
    for (let j = 0; j < 3; j++) {
      const u = t[j]!;
      const w = t[(j + 1) % 3]!;
      if (u === w) continue;
      dir.set(`${u}>${w}`, (dir.get(`${u}>${w}`) ?? 0) + 1);
    }
  }
  for (const [k, n] of dir) {
    const [u, w] = k.split('>');
    if (n !== 1 || dir.get(`${w}>${u}`) !== 1) return false;
  }
  return dir.size > 0;
}

describe('F2.3: sólido de parede inclinada (4.2, sem junção)', () => {
  const straight = (tilt?: number, layers = [0.2]) => resolved(layers, { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ...(tilt === undefined ? {} : { tilt }) });

  it('reta L=4, t=0,2, H=3: θ=15° dá 2,4847 e θ=30° dá 2,7713, malha fechada, normais para fora', () => {
    for (const [tilt, vol] of [[15, 2.4847], [30, 2.7713], [-15, 2.4847]] as const) {
      const bs = solids(straight(tilt));
      expect(Math.abs(total(bs) - vol)).toBeLessThan(1e-4);
      expect(closed(bs[0]!)).toBe(true);
    }
    // topo desloca 0,8038 para a esquerda (+y) em θ=15°
    const top = Math.max(...solids(straight(15))[0]!.positions.filter((_, i) => i % 3 === 1));
    expect(top).toBeCloseTo(0.8038 + 0.1035, 3);
  });

  it('reta: volume exato com tolerância 1e-6 contra a fórmula literal 4·3·0,2/cos(15°)', () => {
    expect(Math.abs(total(solids(straight(15))) - 2.484_66)).toBeLessThan(1e-4);
    expect(Math.abs(total(solids(straight(15))) - (4 * 3 * 0.2) / Math.cos(Math.PI / 12))).toBeLessThan(1e-6);
  });

  it('arco R=5, φ=90°: afastando 5,2708 e aproximando 4,4865 (1e-3)', () => {
    const c = 5 * Math.SQRT2;
    const sag = 5 * (1 - Math.SQRT1_2);
    const away = resolved([0.2], { a: { x: 0, y: 0 }, b: { x: c, y: 0 }, sag, tilt: 15 });
    const near = resolved([0.2], { a: { x: 0, y: 0 }, b: { x: c, y: 0 }, sag, tilt: -15 });
    expect(Math.abs(total(solids(away)) - 5.2708)).toBeLessThan(1e-3);
    expect(Math.abs(total(solids(near)) - 4.4865)).toBeLessThan(1e-3);
    expect(closed(solids(away)[0]!)).toBe(true);
    expect(closed(solids(near)[0]!)).toBe(true);
  });

  it('duas camadas: a soma dos volumes é o total (2,4847)', () => {
    const rw = straight(15, [0.1, 0.1]);
    const bs = solids(rw);
    expect(bs).toHaveLength(2);
    expect(Math.abs(total(bs) - 2.4847)).toBeLessThan(1e-4);
    expect(bs.every(closed)).toBe(true);
  });

  it('tilt=0 ou ausente: mesma malha (vértices e índices) e o resolvido não ganha campo', () => {
    clearWallLayerCache();
    const sem = straight();
    const zero = straight(0);
    expect('tilt' in sem).toBe(false);
    expect('tilt' in zero).toBe(false);
    const forcado: ResolvedWall = { ...sem, tilt: 0 };
    const a = solids(sem)[0]!;
    const b = solids(zero)[0]!;
    const c = solids(forcado)[0]!;
    expect(b.positions).toEqual(a.positions);
    expect(b.indices).toEqual(a.indices);
    expect(c.positions).toEqual(a.positions);
    expect(c.indices).toEqual(a.indices);
    expect(Math.abs(signedVolume(a) - 2.4)).toBeLessThan(1e-6);
  });

  it('a chave de cache muda com o tilt', () => {
    clearWallLayerCache();
    const m0 = wallLayerCacheStats().misses;
    const v15 = signedVolume(solids(straight(15))[0]!);
    const v30 = signedVolume(solids(straight(30))[0]!);
    expect(wallLayerCacheStats().misses - m0).toBe(2);
    expect(wallLayerCacheStats().size).toBe(2);
    expect(v30).toBeGreaterThan(v15);
    solids(straight(15));
    expect(wallLayerCacheStats().size).toBe(2);
  });
});
