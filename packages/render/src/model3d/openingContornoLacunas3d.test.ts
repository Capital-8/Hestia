import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { frameOfWall, modelQuantities, openingGeometry, buildOpeningModel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningType, type Project } from '@hestia/model';
import { geometriaDaPeca } from './geometriaPeca3d.ts';
import { pecasDoModelo } from './openingParts.ts';

function cena(base: string, extra: Partial<OpeningType>): { p: Project; o: Opening } {
  const p0 = createEmptyProject();
  const t0 = p0.openingTypes[base]!;
  const s = new ProjectStore(p0);
  s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_x', ...extra } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t0.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  const p = s.project;
  return { p, o: p.elements.v as Opening };
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

describe('peças 3D: trilho em arco, folha que desliza e divisões decorativas', () => {
  it('janela de correr em arco com leque: volume da malha = volume do quantitativo (trilho, vidro, folha, divisões)', () => {
    const { p, o } = cena('ot_j120', { height: 1.4, shape: { kind: 'round', width: 1.2, height: 1.4 }, muntinPattern: { kind: 'fan', cols: 4, rows: 2, on: 'all' } });
    const f = frameOfWall(p, 'w')!;
    const model = buildOpeningModel(p, o, openingGeometry(p, o, f), f);
    const q = modelQuantities(model).parts;
    const pecas = pecasDoModelo(p, p.openingTypes['ot_x']!, model, false);
    for (const papel of ['track', 'glass', 'leaf', 'muntin'] as const) {
      const malha = pecas.filter((x) => x.role === papel && x.profile?.plane === 'tz').reduce((s, x) => s + volume(geometriaDaPeca(x)), 0);
      const esperado = q.filter((x) => x.role === papel && model.parts.find((m) => m.id === x.id)?.profile?.plane === 'tz').reduce((s, x) => s + x.volume, 0);
      expect(malha, papel).toBeGreaterThan(0);
      expect(malha, papel).toBeCloseTo(esperado, 7);
    }
  });
});
