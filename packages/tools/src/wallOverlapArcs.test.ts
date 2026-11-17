import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, type Wall } from '@hestia/model';
import { copiesOverlap } from './wallOverlapGuard.ts';

const arco = (id: string, sag: number, ax = -3, bx = 3): Wall => ({
  ...makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: ax, y: 0 }, b: { x: bx, y: 0 } }),
  sag,
  order: 0,
});
const T = (x: number, y = 0) => ({ kind: 'translate' as const, d: { x, y } });

describe('sobreposição de paredes em arco (F1.9)', () => {
  it('arcos distintos com a mesma corda (semicírculos de cima e de baixo) não se sobrepõem', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: arco('c1', 3) });
    s.exec({ type: 'addWall', wall: arco('c2', 3, 3, -3) });
    const a = s.project.elements.c1 as Wall;
    const b = s.project.elements.c2 as Wall;
    expect(copiesOverlap(s.project, [a, b], [T(10), T(20)])).toBeNull();
  });

  it('o mesmo arco, idêntico, continua recusado (no projeto e dentro do lote)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: arco('c1', 3) });
    const a = s.project.elements.c1 as Wall;
    expect(copiesOverlap(s.project, [a], [T(0)])?.wall.id).toBe('c1');
    expect(copiesOverlap(s.project, [a], [T(0, 5), T(0, 5)])).not.toBeNull();
  });

  it('arco em sentido oposto com a mesma curva geométrica é recusado; reta contra arco não', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: arco('c1', 3) });
    const a = s.project.elements.c1 as Wall;
    expect(copiesOverlap(s.project, [arco('x', -3, 3, -3)], [T(0)])?.wall.id).toBe('c1');
    expect(copiesOverlap(s.project, [a], [T(0, 5)])).toBeNull();
  });

  it('duas retas realmente sobrepostas seguem recusadas', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: arco('r1', 0) });
    expect(copiesOverlap(s.project, [s.project.elements.r1 as Wall], [T(1)])?.wall.id).toBe('r1');
  });
});
