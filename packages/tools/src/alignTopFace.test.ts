import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeCeiling, makeFloor, makeRoof, makeSlab, makeWall, type Layer, type Wall } from '@hestia/model';
import { alignFeaturesAt } from './alignFeatures.ts';
import { clickAt, makeEnv, tool, walls } from './testEnv.ts';

/**
 * Alinhar à FACE SUPERIOR da parede (T-D). Reta L=4, t=0,2, H=3, 15° (literais de wallTopFaces.test.ts, à mão com
 * tan15° = 0,2679491924 e 1/cos15° = 1,0352761804): topo externo em y=0,9073752, interno 0,7003200, eixo 0,8038476.
 */
const EXT = 0.9073751953;
const INT = 0.7003199593;
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });

function ambiente(ws: Array<{ id: string; a: { x: number; y: number }; b: { x: number; y: number }; tilt?: number; sag?: number }>) {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const ctx = makeEnv(new ProjectStore(base));
  for (const w of ws) {
    const j = { kind: 'miter' as const, flip: false };
    ctx.store.exec({
      type: 'addWall',
      wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', a: w.a, b: w.b, height: 3, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall,
    });
  }
  return ctx;
}
const RETA = { id: 'w', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
const pos = (ctx: ReturnType<typeof makeEnv>, id: string) => walls(ctx.store).find((w) => w.id === id)!;
const query = (ctx: ReturnType<typeof makeEnv>, x: number, y: number, extra = {}) =>
  alignFeaturesAt({ project: ctx.store.project, levelId: 'lv_0', at: { x, y }, metersPerPixel: 0.01, topFaces: true, ...extra });

describe('Alinhar: feições da face superior (referência)', () => {
  it('parede a 15°: oferece a aresta superior externa em y=0,9073752 e a interna em 0,7003200', () => {
    const ctx = ambiente([{ ...RETA, tilt: 15 }]);
    const ext = query(ctx, 2, EXT).find((f) => f.kind === 'faceSuperior')!;
    expect(ext.label).toBe('Aresta superior externa');
    expect(ext.line.p.y).toBeCloseTo(0.9073751953, 9);
    expect(Math.abs(ext.line.d.x)).toBeCloseTo(1, 9);
    expect(ext.seg!.a.x).toBeCloseTo(0, 9);
    expect(ext.seg!.b.x).toBeCloseTo(4, 9);
    const int = query(ctx, 2, INT).find((f) => f.kind === 'faceSuperior')!;
    expect(int.label).toBe('Aresta superior interna');
    expect(int.line.p.y).toBeCloseTo(0.7003199593, 9);
  });

  it('sem topFaces, o resultado é o de antes (nenhuma feição de topo)', () => {
    const ctx = ambiente([{ ...RETA, tilt: 15 }]);
    expect(query(ctx, 2, EXT, { topFaces: false }).some((f) => f.kind === 'faceSuperior')).toBe(false);
  });

  it('parede vertical: funde com a base (sem duplicar); com topLabel a face leva o rótulo "Face superior"', () => {
    const ctx = ambiente([RETA]);
    const sem = query(ctx, 2, 0.1);
    expect(sem.some((f) => f.kind === 'faceSuperior' || f.kind === 'nucleoSuperior')).toBe(false);
    expect(sem.filter((f) => f.kind === 'faceParede')).toHaveLength(1);
    const com = query(ctx, 2, 0.1, { topLabel: true });
    const topo = com.filter((f) => f.kind === 'faceSuperior');
    expect(topo).toHaveLength(1);
    expect(topo[0]!.label).toBe('Face superior');
    expect(topo[0]!.line.p.y).toBeCloseTo(0.1, 9);
    expect(com.filter((f) => f.kind === 'faceParede')).toHaveLength(0);
  });

  it('arco a 15°: a aresta superior externa passa por (2; 1,9073752) com tangente horizontal no topo do arco', () => {
    // corda 4, sag 1 → R=2,5, centro (2; -1,5); topo a 15° afasta H·tanθ=0,8038476 e t/cosθ/2=0,1035276: 2,5+0,8038476+0,1035276 = 3,4073752
    const ctx = ambiente([{ ...RETA, tilt: 15, sag: 1 }]);
    const f = query(ctx, 2, -1.5 + 3.4073751953).find((q) => q.kind === 'faceSuperior')!;
    expect(f).toBeDefined();
    expect(f.line.p.y).toBeCloseTo(1.9073751953, 3);
    expect(Math.abs(f.line.d.y)).toBeLessThan(0.1);
    expect(f.seg).toBeUndefined();
  });
});

describe('Alinhar: aresta de contorno ao topo da parede inclinada', () => {
  it('piso: a aresta vai a y=0,9073752 (face superior externa) e o desfazer restaura', () => {
    const ctx = ambiente([{ ...RETA, tilt: 15 }]);
    const quad = [{ x: 0, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 5 }, { x: 0, y: 5 }];
    ctx.store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: quad }) });
    const t = tool('align', ctx.env);
    clickAt(t, 2, EXT); // referência: aresta superior externa
    clickAt(t, 2, 3); // aresta do piso
    const f = ctx.store.project.elements.f1 as { boundary: Array<{ x: number; y: number }> };
    expect(f.boundary[0]!.y).toBeCloseTo(0.9073751953, 9);
    expect(f.boundary[1]!.y).toBeCloseTo(0.9073751953, 9);
    expect(f.boundary[2]!.y).toBe(5);
    expect(f.boundary[3]!.y).toBe(5);
    ctx.store.undo();
    expect((ctx.store.project.elements.f1 as { boundary: Array<{ y: number }> }).boundary.map((v) => v.y)).toEqual([3, 3, 5, 5]);
  });

  it('telhado, laje e forro também podem ser a feição móvel (aresta do contorno)', () => {
    for (const kind of ['roof', 'slab', 'ceiling'] as const) {
      const ctx = ambiente([{ ...RETA, tilt: 15 }]);
      const boundary = [{ x: 0, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 5 }, { x: 0, y: 5 }];
      if (kind === 'roof') ctx.store.exec({ type: 'addRoof', roof: makeRoof({ id: 'e', typeId: 'rt_ceramica', levelId: 'lv_0', boundary }) });
      else if (kind === 'slab') ctx.store.exec({ type: 'addSlab', slab: makeSlab({ id: 'e', typeId: 'ls_mac12', levelId: 'lv_0', boundary }) });
      else ctx.store.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'e', typeId: 'ct_gesso', levelId: 'lv_0', boundary }) });
      const t = tool('align', ctx.env);
      clickAt(t, 2, EXT);
      clickAt(t, 2, 3);
      const e = ctx.store.project.elements.e as { boundary: Array<{ y: number }> };
      expect(e.boundary[0]!.y).toBeCloseTo(0.9073751953, 9);
      expect(e.boundary[1]!.y).toBeCloseTo(0.9073751953, 9);
      ctx.store.undo();
      expect((ctx.store.project.elements.e as { boundary: Array<{ y: number }> }).boundary[0]!.y).toBe(3);
    }
  });

  it('parede vertical: alinhar à face superior == alinhar à face da base (mesma posição)', () => {
    const viaTopo = ambiente([RETA]);
    const quad = [{ x: 0, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 5 }, { x: 0, y: 5 }];
    viaTopo.store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: quad }) });
    const t = tool('align', viaTopo.env);
    clickAt(t, 2, 0.1);
    clickAt(t, 2, 3);
    const f = viaTopo.store.project.elements.f1 as { boundary: Array<{ y: number }> };
    expect(f.boundary[0]!.y).toBeCloseTo(0.1, 9);
    expect(f.boundary[1]!.y).toBeCloseTo(0.1, 9);
  });
});

describe('Alinhar: aresta superior da parede como feição móvel', () => {
  it('parede a 15° em y=3 é alinhada ao topo externo de outra: translada exatamente −3 e desfaz', () => {
    const ctx = ambiente([{ ...RETA, tilt: 15 }, { id: 'm', a: { x: 0, y: 3 }, b: { x: 4, y: 3 }, tilt: 15 }]);
    const t = tool('align', ctx.env);
    clickAt(t, 2, EXT); // topo externo de w (0,9073752)
    clickAt(t, 2, 3 + EXT); // topo externo de m (3,9073752)
    expect(pos(ctx, 'm').a.y).toBeCloseTo(0, 9);
    expect(pos(ctx, 'm').b.y).toBeCloseTo(0, 9);
    expect(pos(ctx, 'w').a.y).toBe(0);
    ctx.store.undo();
    expect(pos(ctx, 'm').a.y).toBe(3);
    expect(pos(ctx, 'm').b.y).toBe(3);
  });
});
