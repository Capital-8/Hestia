import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { clienteFuroContornoFalso, definirClienteFuroContorno, resolveLevel } from '@hestia/engine';
import { buildLevelSolids, clearWallLayerCache } from './solids.ts';

/** Parede de 4 m x 3 m com um vão livre (offset 2), com forma ou sem ela. */
function projeto(forma: boolean): Project {
  const base = createEmptyProject();
  const shape: OpeningShape = { kind: 'round', width: 0.9, height: 2.1 };
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', leaves: 0, closure: 'none', ...(forma ? { shape } : {}) };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  const o: Opening = { id: 'o', kind: 'door', typeId: 'ot_arco', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: o });
  return s.project;
}

const volume = (b: { positions: number[]; indices: number[] }): number => {
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const p = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
    const [p0, p1, p2] = [p(b.indices[i]!), p(b.indices[i + 1]!), p(b.indices[i + 2]!)];
    v += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
  }
  return v;
};

afterEach(() => {
  definirClienteFuroContorno(null);
  clearWallLayerCache();
});

describe('3D da parede com vão por contorno', () => {
  it('sem cliente: a forma não muda a malha (faixas com furo retangular)', () => {
    const a = buildLevelSolids(resolveLevel(projeto(true), 'lv_0'));
    clearWallLayerCache();
    const b = buildLevelSolids(resolveLevel(projeto(false), 'lv_0'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('com cliente falso: a malha do cliente entra no lugar das faixas, em coordenadas do mundo', () => {
    const p = projeto(true);
    const rect = Math.abs(volume(buildLevelSolids(resolveLevel(p, 'lv_0')).batches.find((x) => x.materialId === 'mat_bloco14')!));
    clearWallLayerCache();
    const cli = clienteFuroContornoFalso({ retorno: false });
    definirClienteFuroContorno(cli);
    const bloco = buildLevelSolids(resolveLevel(p, 'lv_0')).batches.find((x) => x.materialId === 'mat_bloco14')!;
    expect(cli.chamadas.prisma).toBeGreaterThan(0);
    // A caixa do falso é a placa inteira (4 x 0,14 x 3): bem orientada e sem o furo retangular das faixas.
    expect(Math.abs(volume(bloco))).toBeCloseTo(4 * 0.14 * 3, 6);
    expect(Math.abs(volume(bloco))).toBeGreaterThan(rect);
    const xs = bloco.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(4, 6);
  });

  it('trocar o cliente invalida o cache do sólido da camada', () => {
    const p = projeto(true);
    definirClienteFuroContorno(clienteFuroContornoFalso({ retorno: false }));
    const a = buildLevelSolids(resolveLevel(p, 'lv_0')).batches.find((x) => x.materialId === 'mat_bloco14')!;
    definirClienteFuroContorno(clienteFuroContornoFalso({ prisma: false, retorno: false })); // recuo retangular
    const b = buildLevelSolids(resolveLevel(p, 'lv_0')).batches.find((x) => x.materialId === 'mat_bloco14')!;
    expect(Math.abs(volume(a))).toBeGreaterThan(Math.abs(volume(b)));
  });
});
