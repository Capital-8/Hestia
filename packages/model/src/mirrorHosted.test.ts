import { describe, expect, it } from 'vitest';
import { applyTransform, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type Wall } from './index.ts';

/** Parede reta (0,0)-(6,0): o eixo de simetria é o eixo y, então o reflexo troca o sinal de x. */
const wall = (id: string, ay = 0): Omit<Wall, 'order'> =>
  makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: ay }, b: { x: 6, y: ay } });

/** Abertura completa, com todos os campos que o espelho deve preservar. */
const door = (id: string, hostId: string, patch: Partial<Opening> = {}): Opening => ({
  id,
  kind: 'door',
  typeId: 'ot_p80',
  hostId,
  offset: 2,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
  ...patch,
});

/** Centro da abertura na linha de localização (parede reta, `locationLine: 'wallCenter'`). */
function centerOf(w: Wall, offset: number): Vec2 {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy);
  return { x: w.a.x + (dx / len) * offset, y: w.a.y + (dy / len) * offset };
}

/** Dobradiça a meia largura do centro, no lado indicado por `flipHand`. */
function hingeOf(w: Wall, o: Opening, halfWidth: number): Vec2 {
  const c = centerOf(w, o.offset);
  const dx = (w.b.x - w.a.x) / Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const dy = (w.b.y - w.a.y) / Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const hs = o.flipHand ? 1 : -1;
  return { x: c.x + dx * hs * halfWidth, y: c.y + dy * hs * halfWidth };
}

const mirrorY = { kind: 'mirror', a: { x: 0, y: -1 }, b: { x: 0, y: 1 } } as const;

function closeTo(actual: Vec2, expected: Vec2): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe('espelhar paredes com aberturas hospedadas', () => {
  it('in-place inverte flipFacing e preserva flipHand, offset e os demais campos', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('w') });
    s.exec({
      type: 'addOpening',
      opening: door('d', 'w', {
        offset: 2,
        flipHand: false,
        flipFacing: false,
        sillOverride: 0.15,
        heightOverride: 2.1,
        mark: 'P1',
        ifcProperties: [{ name: 'FireRating', value: 'EI30', pset: 'Pset_DoorCommon' }],
      }),
    });
    const halfWidth = s.project.openingTypes.ot_p80!.width / 2;
    const wBefore = s.project.elements.w as Wall;
    const oBefore = s.project.elements.d as Opening;
    const centerBefore = centerOf(wBefore, oBefore.offset);
    const hingeBefore = hingeOf(wBefore, oBefore, halfWidth);

    s.exec({ type: 'transform', ids: ['w'], transform: mirrorY });

    const w = s.project.elements.w as Wall;
    const o = s.project.elements.d as Opening;
    expect(w.flipped).toBe(true);
    expect(o.flipFacing).toBe(true);
    expect(o.flipHand).toBe(false);
    expect(o.offset).toBe(2);
    expect(o.hostId).toBe('w');
    expect(o.typeId).toBe('ot_p80');
    expect(o.sillOverride).toBe(0.15);
    expect(o.heightOverride).toBe(2.1);
    expect(o.mark).toBe('P1');
    expect(o.ifcProperties).toEqual([{ name: 'FireRating', value: 'EI30', pset: 'Pset_DoorCommon' }]);
    // Espelho no eixo y: centro e dobradiça são exatamente os reflexos dos originais.
    closeTo(centerOf(w, o.offset), applyTransform(mirrorY, centerBefore));
    closeTo(hingeOf(w, o, halfWidth), applyTransform(mirrorY, hingeBefore));
  });

  it('with copy: nova parede e nova abertura simétricas, original intacta', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('w') });
    s.exec({ type: 'addOpening', opening: door('d', 'w', { offset: 2, flipHand: false, flipFacing: false, mark: 'P1' }) });
    const halfWidth = s.project.openingTypes.ot_p80!.width / 2;
    const wBefore = s.project.elements.w as Wall;
    const oBefore = s.project.elements.d as Opening;
    const centerBefore = centerOf(wBefore, oBefore.offset);
    const hingeBefore = hingeOf(wBefore, oBefore, halfWidth);

    s.exec({ type: 'transform', ids: ['w'], transform: mirrorY, copy: { idMap: { w: 'w2', d: 'd2' } } });

    // Original intocada.
    const w0 = s.project.elements.w as Wall;
    const o0 = s.project.elements.d as Opening;
    expect(w0).toEqual(wBefore);
    expect(o0).toEqual(oBefore);

    const w2 = s.project.elements.w2 as Wall;
    const d2 = s.project.elements.d2 as Opening;
    expect(d2.hostId).toBe('w2');
    expect(d2.offset).toBe(oBefore.offset);
    expect(d2.flipHand).toBe(oBefore.flipHand);
    expect(d2.flipFacing).toBe(!oBefore.flipFacing);
    expect(d2.typeId).toBe(oBefore.typeId);
    expect(d2.mark).toBe(oBefore.mark);
    expect(d2.sillOverride).toBe(oBefore.sillOverride);
    // Cópia é imagem especular: centro e dobradiça são os reflexos dos originais.
    closeTo(centerOf(w2, d2.offset), applyTransform(mirrorY, centerBefore));
    closeTo(hingeOf(w2, d2, halfWidth), applyTransform(mirrorY, hingeBefore));
  });

  it('translate e rotate não mudam flipFacing nem flipHand', () => {
    for (const transform of [
      { kind: 'translate', d: { x: 1, y: 2 } },
      { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 },
    ] as const) {
      const s = new ProjectStore(createEmptyProject());
      s.exec({ type: 'addWall', wall: wall('w') });
      s.exec({ type: 'addOpening', opening: door('d', 'w', { flipHand: true, flipFacing: true, offset: 3 }) });
      s.exec({ type: 'transform', ids: ['w'], transform });
      const o = s.project.elements.d as Opening;
      expect(o.flipHand).toBe(true);
      expect(o.flipFacing).toBe(true);
      expect(o.offset).toBe(3);
    }
  });

  it('abertura hospedada em parede fora de ids permanece intacta', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('w') });
    s.exec({ type: 'addWall', wall: wall('outra', 5) });
    s.exec({ type: 'addOpening', opening: door('d', 'w') });
    s.exec({ type: 'addOpening', opening: door('dOutra', 'outra', { flipHand: true, flipFacing: true, offset: 4 }) });
    const outraAntes = s.project.elements.outra as Wall;

    s.exec({ type: 'transform', ids: ['w'], transform: mirrorY });

    const o = s.project.elements.d as Opening;
    expect(o.flipFacing).toBe(true);
    const outra = s.project.elements.dOutra as Opening;
    expect(outra.flipHand).toBe(true);
    expect(outra.flipFacing).toBe(true);
    expect(outra.offset).toBe(4);
    expect(outra.hostId).toBe('outra');
    expect(s.project.elements.outra).toEqual(outraAntes);
  });
});
