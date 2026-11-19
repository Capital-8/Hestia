import { describe, expect, it } from 'vitest';
import { resolveRoofs, type ResolvedRoof, type ResolvedRoofLayer, type ResolvedRoofPlane } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeRoof } from '@hestia/model';
import { poligonoSoldado, trechosSemEmenda } from './roofEmendas3d.ts';
import { buildRoofSolids, type SolidBatch } from './solids.ts';

/**
 * "Filetes" no 3D do telhado: linhas finas na emenda entre águas vizinhas. Causas reproduzidas aqui: (1) a emenda era
 * decidida por um ponto a 1e-5 m e cota a 1e-6 m, então ruído do Clipper (~1e-6) fazia a parede interna reaparecer;
 * (2) junção em T (uma água de um lado, duas do outro) não era emenda em nenhum trecho; (3) triângulos de área ~0.
 */

const LAYERS: ResolvedRoofLayer[] = [{ layerIndex: 0, materialId: 'mat_telha_ceramica', thickness: 0.05, below: 0 }];
const EAVE = 2.8;
const P = (x: number, y: number) => ({ x, y });

const planeA = (): ResolvedRoofPlane => ({ polygon: [[[P(0, 0), P(8, 0), P(8, 3), P(0, 3)]]], origin: P(0, 0), up: P(0, 1), percent: 30, z0: EAVE });

function roof(planes: ResolvedRoofPlane[]): ResolvedRoof {
  return { roofId: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', eaveZ: EAVE, joinedArea: 0, layers: LAYERS, planes, lines: [] };
}

/** Água do outro lado da cumeeira y = 3, inteira ou partida em x = 4; `ruido` desloca a origem (ruído do motor). */
function planeBs(split: boolean, ruido = 0): ResolvedRoofPlane[] {
  const base = { up: P(0, -1), percent: 30, z0: EAVE + ruido };
  if (!split) return [{ ...base, polygon: [[[P(0, 3), P(8, 3), P(8, 6), P(0, 6)]]], origin: P(0, 6) }];
  return [
    { ...base, polygon: [[[P(0, 3), P(4, 3), P(4, 6), P(0, 6)]]], origin: P(0, 6) },
    { ...base, polygon: [[[P(4, 3), P(8, 3), P(8, 6), P(4, 6)]]], origin: P(0, 6) },
  ];
}

/** Paredes verticais (normal horizontal) do lote cujos dois extremos estão na linha y = 3 (a emenda). */
function paredesNaEmenda(batches: SolidBatch[]): number {
  let n = 0;
  for (const b of batches) {
    for (let i = 0; i < b.indices.length; i += 3) {
      const ia = b.indices[i]!;
      if (Math.abs(b.normals[ia * 3 + 2]!) > 1e-9) continue;
      const ys = [0, 1, 2].map((k) => b.positions[b.indices[i + k]! * 3 + 1]!);
      if (ys.every((y) => Math.abs(y - 3) < 1e-6)) n++;
    }
  }
  return n;
}

/** Menor dobro-de-área entre os triângulos do lote. */
function menorArea2(batches: SolidBatch[]): number {
  let min = Infinity;
  for (const b of batches) {
    for (let i = 0; i < b.indices.length; i += 3) {
      const v = [0, 1, 2].map((k) => [0, 1, 2].map((c) => b.positions[b.indices[i + k]! * 3 + c]!));
      const u = [v[1]![0]! - v[0]![0]!, v[1]![1]! - v[0]![1]!, v[1]![2]! - v[0]![2]!];
      const w = [v[2]![0]! - v[0]![0]!, v[2]![1]! - v[0]![1]!, v[2]![2]! - v[0]![2]!];
      const c = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
      min = Math.min(min, Math.hypot(c[0]!, c[1]!, c[2]!));
    }
  }
  return min;
}

describe('filetes na emenda das águas (3D)', () => {
  it('base: duas águas inteiras na mesma cota: sem parede na cumeeira', () => {
    expect(paredesNaEmenda(buildRoofSolids([roof([planeA(), ...planeBs(false)])]))).toBe(0);
  });

  it('junção em T (uma água de um lado, duas do outro): a emenda cobre a aresta toda', () => {
    const r = roof([planeA(), ...planeBs(true)]);
    expect(trechosSemEmenda(r, 0)(P(8, 3), P(0, 3))).toEqual([]);
    expect(paredesNaEmenda(buildRoofSolids([r]))).toBe(0);
  });

  it('ruído de 5e-6 m na cota e na posição do outro lado não faz a parede interna reaparecer', () => {
    const r = roof([planeA(), ...planeBs(true, 5e-6)]);
    r.planes[1]!.polygon = [[[P(0, 3 + 4e-6), P(4, 3 - 3e-6), P(4, 6), P(0, 6)]]];
    expect(paredesNaEmenda(buildRoofSolids([r]))).toBe(0);
  });

  it('degrau real (1 cm) continua com parede, só no trecho em que existe', () => {
    const r = roof([planeA(), ...planeBs(true)]);
    // A metade x de 4 a 8 do outro lado sobe 1 cm: a parede fica só nela.
    r.planes[2]!.z0 = EAVE + 0.01;
    const trechos = trechosSemEmenda(r, 0)(P(8, 3), P(0, 3));
    expect(trechos).toHaveLength(1);
    expect(trechos[0]![0].x).toBeCloseTo(8, 9);
    expect(trechos[0]![1].x).toBeCloseTo(4, 9);
  });

  it('a água de lado único ganha o vértice da junção em T na aresta comum (malha sem fresta)', () => {
    const r = roof([planeA(), ...planeBs(true)]);
    const ring = poligonoSoldado(r, 0, r.planes[0]!.polygon[0]!)[0]!;
    expect(ring.some((q) => Math.abs(q.x - 4) < 1e-9 && Math.abs(q.y - 3) < 1e-9)).toBe(true);
    expect(ring).toHaveLength(5);
  });

  it('nenhum triângulo de área ~0 na malha, com ou sem junção em T', () => {
    for (const split of [false, true]) {
      const lotes = buildRoofSolids([roof([planeA(), ...planeBs(split)])]);
      expect(menorArea2(lotes)).toBeGreaterThan(1e-7);
    }
  });

  it('regressão (L fictício): fechamento vertical do degrau com material da testeira só quando closeStepGaps: true', () => {
    // L fictício (canto reentrante em (5,0)); arestas e0 e e4 são empenas, as demais têm 30 %.
    const L_BOUNDARY = [P(5, 0), P(9, 0), P(9, 5), P(0, 5), P(0, -1.5), P(5, -1.5)];
    const buildWith = (closeStepGaps: boolean) => {
      const st = new ProjectStore(createEmptyProject());
      st.exec({
        type: 'addRoof',
        roof: makeRoof({
          id: 'r_l',
          typeId: 'rt_ceramica',
          levelId: 'lv_0',
          boundary: L_BOUNDARY,
          shape: 'edges',
          edgeSlopes: [null, 30, 30, 30, null, 30],
          edgeOverhangs: L_BOUNDARY.map(() => 0.5),
          heightOffset: 2.8,
          closeStepGaps,
        }),
      });
      return buildRoofSolids(resolveRoofs(st.project, 'lv_0'));
    };
    const open = buildWith(false);
    expect(open.some((b) => b.materialId.endsWith('#testeira'))).toBe(false);
    const closed = buildWith(true);
    const fascia = closed.find((b) => b.materialId === 'mat_madeira#testeira');
    expect(fascia).toBeDefined();
    expect(fascia!.indices.length).toBeGreaterThan(0);
    expect(menorArea2(closed)).toBeGreaterThan(1e-7);
  });
});
