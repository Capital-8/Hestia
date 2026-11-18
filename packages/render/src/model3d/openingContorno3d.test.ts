import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { frameOfWall, modelQuantities, openingGeometry, buildOpeningModel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { geometriaDaPeca } from './geometriaPeca3d.ts';
import { openingPieces, pecasDoModelo, type OpeningPiece } from './openingParts.ts';

function cena(shape?: OpeningShape): { p: Project; o: Opening; pecas: OpeningPiece[] } {
  const p0 = createEmptyProject();
  const t0 = p0.openingTypes['ot_p90']!;
  const s = new ProjectStore(p0);
  s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_x', ...(shape ? { shape } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: 'door', typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  const p = s.project;
  const o = p.elements.v as Opening;
  const f = frameOfWall(p, 'w')!;
  return { p, o, pecas: openingPieces(p, o, openingGeometry(p, o, f), f, 3, false) };
}

/** Volume (m3) da malha: soma dos tetraedros com a origem; positivo quando as normais saem do sólido. */
function volume(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  let v = 0;
  for (let i = 0; i < n; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => {
      const j = idx ? idx.getX(i + k) : i + k;
      return [pos.getX(j), pos.getY(j), pos.getZ(j)] as const;
    }) as [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

describe('peças 3D em vão com forma', () => {
  it('a travessa e a folha em arco viram prismas com o volume do quantitativo', () => {
    const { pecas } = cena({ kind: 'round', width: 0.9, height: 2.1 });
    const prismas = pecas.filter((q) => q.profile?.plane === 'tz' && q.role !== 'handle');
    expect(prismas.map((q) => q.role)).toEqual(expect.arrayContaining(['head', 'leaf']));
    for (const q of prismas) {
      const m = volume(geometriaDaPeca(q));
      expect(m).toBeGreaterThan(0); // normais para fora
      const esperado = q.w * q.d * q.h;
      expect(m).toBeLessThan(esperado); // menor que a caixa envolvente
    }
  });
  it('volume da malha = volume do quantitativo, peça a peça', () => {
    const { p, o } = cena({ kind: 'round', width: 0.9, height: 2.1 });
    const f = frameOfWall(p, 'w')!;
    const model = buildOpeningModel(p, o, openingGeometry(p, o, f), f);
    const q = modelQuantities(model).parts;
    const pecas = pecasDoModelo(p, p.openingTypes['ot_x']!, model, false);
    const porPapel = (papel: string): number => pecas.filter((x) => x.role === papel && x.profile?.plane === 'tz').reduce((s, x) => s + volume(geometriaDaPeca(x)), 0);
    expect(porPapel('head')).toBeCloseTo(q.filter((x) => x.role === 'head').reduce((s, x) => s + x.volume, 0), 7);
    expect(porPapel('leaf')).toBeCloseTo(q.filter((x) => x.role === 'leaf').reduce((s, x) => s + x.volume, 0), 7);
  });
  it('vão retangular: as mesmas peças de antes (nenhuma com seção tz fora das ferragens)', () => {
    const { pecas } = cena();
    expect(pecas.filter((q) => q.profile?.plane === 'tz' && q.role !== 'handle')).toEqual([]);
  });
});
