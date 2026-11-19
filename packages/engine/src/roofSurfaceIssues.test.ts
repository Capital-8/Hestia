import { describe, expect, it } from 'vitest';
import { v2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeRoof, type Project } from '@hestia/model';
import { resolveRoofs, roofSurfaceIssues } from './index.ts';

/** Projeto com um telhado 'edges' sobre o contorno dado (o esqueleto real, sem stub). */
function project(boundary: { x: number; y: number }[], edgeSlopes: Array<number | null>, mark = ''): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary, shape: 'edges', edgeSlopes, heightOffset: 0, mark }) });
  return s.project;
}

describe('superfície em canto reentrante com empena (degrau preservado do esqueleto)', () => {
  // Caso da auditoria: vértice (1;6) com cotas 0, 0,6 e 0,6 (empena (1;6)-(2;5) encosta no beiral (3;7)-(1;6)).
  const FIXED = [v2(2, 5), v2(0, 5), v2(0, 7), v2(3, 7), v2(1, 6)];

  it('canto reentrante com empena: mantém o esqueleto com degrau e emite aviso roof-surface-step', () => {
    const p = project(FIXED, [60, 60, null, 60, null]);
    const issues = roofSurfaceIssues(p);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('roof-surface-step');
    expect(issues[0]!.severity).toBe('warning');
  });

  it('o telhado continua criado e com águas, reportando o degrau em steps e stepGaps', () => {
    const p = project(FIXED, [60, 60, null, 60, null]);
    const r = resolveRoofs(p, 'lv_0')[0]!;
    expect(r.planes.length).toBeGreaterThan(0);
    expect(r.problem).toBeUndefined();
    expect(r.steps?.length).toBeGreaterThan(0);
    expect(r.stepGaps?.length).toBeGreaterThan(0);
  });

  it('retângulo com duas águas (superfície contínua): sem aviso', () => {
    const rect = [v2(0, 0), v2(8, 0), v2(8, 6), v2(0, 6)];
    expect(roofSurfaceIssues(project(rect, [30, null, 30, null]))).toEqual([]);
  });
});
