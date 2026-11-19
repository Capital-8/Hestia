import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLevel, makeWall, wallsCrossingCut, wallsOfPlan, type Project } from '@hestia/model';
import { planViewOf } from './view.ts';

/*
 * Níveis: lv_0 em 0, lv_1 (N2) em 3, lv_2 (N3) em 6. Intervalo padrão: corte 1,20 m acima do nível; plano de corte do N2 em z = 4,2.
 * W1: do N1 (z 0), topo no N3 (z 6): faixa 0..6, cruza 4,2.  W2: do N2, de 3 a 5,8, encontra a ponta de W1 em (4,0).
 * W3: do N1 com altura 3,0 (topo exatamente na base do N2): faixa 0..3, não cruza 4,2.
 * W4: do N1 com altura 4,2 (topo exatamente no corte do N2): a borda conta como dentro.
 */
function cena(): Project {
  const base = createEmptyProject();
  const s = new ProjectStore({ ...base, levels: [...base.levels, makeLevel({ id: 'lv_2', name: 'N3', elevation: 6 })] });
  const w = (id: string, levelId: string, a: [number, number], b: [number, number], extra: Partial<Parameters<typeof makeWall>[0]> = {}) =>
    makeWall({ id, typeId: 'wt_alv14', levelId, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, ...extra });
  s.exec({ type: 'addWall', wall: w('W1', 'lv_0', [0, 0], [4, 0], { topLevelId: 'lv_2', topOffset: 0 }) });
  s.exec({ type: 'addWall', wall: w('W2', 'lv_1', [4, 0], [4, 4], { height: 2.8 }) });
  s.exec({ type: 'addWall', wall: w('W3', 'lv_0', [0, 10], [4, 10], { height: 3 }) });
  s.exec({ type: 'addWall', wall: w('W4', 'lv_0', [0, 12], [4, 12], { height: 4.2 }) });
  return s.project;
}

describe('parede que atravessa níveis (N1 até o N3) na planta do N2', () => {
  it('cruza o corte do N2 (4,2): W1 e W4 sim; W3 (topo em 3,0) não', () => {
    const p = cena();
    expect(wallsCrossingCut(p, 'lv_1').map((x) => x.id)).toEqual(['W1', 'W4']);
    expect(wallsOfPlan(p, 'lv_1').map((x) => x.id)).toEqual(['W1', 'W2', 'W4']);
  });

  it('desenha W1 cortada no N2 (faixa 0..6) e mantém o dono no N1', () => {
    const p = cena();
    const v = planViewOf(p, 'lv_1');
    expect(v.cutZ).toBeCloseTo(4.2, 9);
    expect(v.cls.get('W1')).toBe('cut');
    const rw = v.geo.walls.W1!;
    expect(rw.baseZ).toBeCloseTo(0, 9);
    expect(rw.height).toBeCloseTo(6, 9);
    expect(rw.layers.length).toBeGreaterThan(0);
    expect(v.geo.walls.W3).toBeUndefined();
    expect(v.cls.has('W3')).toBe(false);
    expect(p.elements.W1).toMatchObject({ levelId: 'lv_0', baseOffset: 0, topLevelId: 'lv_2' });
  });

  it('o canto de W1 com W2 (que se encontram em altura, 3..5,8 dentro de 0..6) fecha no mesmo grupo', () => {
    const v = planViewOf(cena(), 'lv_1');
    expect(v.geo.clusters.some((c) => c.wallIds.includes('W1') && c.wallIds.includes('W2'))).toBe(true);
  });

  it('no N1 a parede continua cortada uma vez (dona) e no N3 (corte 7,2) não aparece', () => {
    const p = cena();
    expect(planViewOf(p, 'lv_0').cls.get('W1')).toBe('cut');
    expect(planViewOf(p, 'lv_0').geo.walls.W1).toBeDefined();
    expect(wallsCrossingCut(p, 'lv_2')).toEqual([]);
    expect(planViewOf(p, 'lv_2').geo.walls.W1).toBeUndefined();
  });
});
