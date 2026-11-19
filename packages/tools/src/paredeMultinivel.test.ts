import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, dimRefAt, makeWall, openingsOfWall, wallsOfPlan, type Project } from '@hestia/model';
import { hostUnder, infer } from './index.ts';
import { alignFeaturesAt } from './alignFeatures.ts';

/*
 * lv_0 em 0, lv_1 em 3 (ativo; corte a 1,20 m: z = 4,2). W1 (lv_0) de (0,0) a (5,0), altura `h`: com 9 a faixa é 0..9
 * e cruza 4,2; com 3 o topo encosta na base do nível (0..3) e não cruza.
 */
function cena(h: number): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'W1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, height: h }) });
  return s.project;
}
const ctx = (p: Project) => ({ project: p, levelId: 'lv_1', mpp: 0.01, gridStep: 0.5 });

describe('parede de outro nível que cruza o corte vale nas ferramentas do nível ativo', () => {
  it('snap: o ponto médio do eixo de W1 (2,5; 0) aparece no N2; com topo em 3,0 não', () => {
    const r = infer({ x: 2.5, y: 0.01 }, ctx(cena(9)));
    expect(r.kind).toBe('midpoint');
    expect(r.point.x).toBeCloseTo(2.5, 9);
    expect(r.point.y).toBeCloseTo(0, 9);
    expect(infer({ x: 2.5, y: 0.01 }, ctx(cena(3))).kind).not.toBe('midpoint');
  });

  it('snap: faces de W1 (y = 0,07 e -0,07, espessura 0,14) entram nos alinhamentos do N2 só quando cruza', () => {
    const q = { project: cena(9), levelId: 'lv_1', at: { x: 2.5, y: 0.07 }, metersPerPixel: 0.01 };
    const com = alignFeaturesAt(q);
    const sem = alignFeaturesAt({ ...q, project: cena(3) });
    expect(com.length).toBeGreaterThan(0);
    expect(sem.length).toBe(0);
  });

  it('cota: dimRefAt acha o eixo de W1 no N2 (ponta b em 5; 0), e não com topo em 3,0', () => {
    const r = dimRefAt(cena(9), 'lv_1', { x: 5.01, y: 0.01 }, 0.05);
    expect(JSON.stringify(r?.ref)).toContain('W1');
    expect(r?.point).toEqual({ x: 5, y: 0 });
    expect(dimRefAt(cena(3), 'lv_1', { x: 5.01, y: 0.01 }, 0.05)).toBeNull();
  });

  it('abertura: hostUnder acha W1 no N2 (offset 2,5) e a abertura fica na parede dona (lv_0)', () => {
    const p = cena(9);
    expect(wallsOfPlan(p, 'lv_1').map((w) => w.id)).toEqual(['W1']);
    const host = hostUnder({ x: 2.5, y: 0.02 }, p, 'lv_1', 0.01, false);
    expect(host?.wallId).toBe('W1');
    expect(host!.offset).toBeCloseTo(2.5, 9);
    expect(hostUnder({ x: 2.5, y: 0.02 }, cena(3), 'lv_1', 0.01, false)).toBeNull();
    // A abertura não tem nível próprio: pertence à parede hospedeira, que é do lv_0 (3D e quantitativos a veem lá, uma vez).
    const s = new ProjectStore(p);
    s.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: s.project.defaults.doorTypeId, hostId: host!.wallId, offset: host!.offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as never });
    expect(openingsOfWall(s.project, 'W1').map((o) => o.id)).toEqual(['d1']);
    expect(s.project.elements.W1).toMatchObject({ levelId: 'lv_0' });
    expect('levelId' in s.project.elements.d1!).toBe(false);
  });
});
