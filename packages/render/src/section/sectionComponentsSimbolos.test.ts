import { describe, expect, it } from 'vitest';
import { computeSection } from '@hestia/engine';
import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Familia, type Project, type Simbolo2D } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import type { StrokeOp } from '../plan/types.ts';
import { buildSectionDrawList } from './build.ts';

/** Corte em x = 1,2 (linha ao longo de Y, plano yz) sobre o armário em (1, 1). */
function listaCom(simbolos: Simbolo2D[]) {
  const p: Project = createEmptyProject('t');
  const familia: Familia = { ...structuredClone(FAMILIA_ARMARIO), simbolos };
  aplicar(p, { type: 'upsertFamily', family: familia });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: familia.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 1, z: 0, rotation: 0, mirrored: false, mark: 'c1' };
  const section = computeSection(p, { a: { x: 1.2, y: 0 }, b: { x: 1.2, y: 3 }, depth: 2 });
  return buildSectionDrawList({ project: p, section, viewport: { cx: 1.5, cy: 0.4, zoom: 200, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false });
}

/** Traços com exatamente estes dois pontos (t, z), arredondados a 1e-4. */
const comPontos = (strokes: StrokeOp[], pts: number[][]): StrokeOp[] =>
  strokes.filter((s) => s.pts.length === pts.length && s.pts.every((q, i) => Math.abs(q.x - pts[i]![0]!) < 1e-4 && Math.abs(q.y - pts[i]![1]!) < 1e-4));

describe('símbolos 2D no corte (D2)', () => {
  it('símbolo yz no corte paralelo a YZ aparece em (t, z): t a partir de a, z a cota', () => {
    const yz: Simbolo2D = { id: 'linha-yz', nome: 'Linha', vistas: ['corte'], plano: 'yz', primitivos: [{ tipo: 'linha', de: ['0', '100'], ate: ['500', '100'] }] };
    // Família: u = y local (0 → 0,5 m), v = z local (0,1 m). Componente em y = 1: t = 1 → 1,5 e z = 0,1.
    expect(comPontos(listaCom([yz]).strokes, [[1, 0.1], [1.5, 0.1]])).toHaveLength(1);
  });

  it('símbolo xz não aparece no corte paralelo a YZ', () => {
    const xz: Simbolo2D = { id: 'linha-xz', nome: 'Linha', vistas: ['corte'], plano: 'xz', primitivos: [{ tipo: 'linha', de: ['0', '100'], ate: ['500', '100'] }] };
    expect(comPontos(listaCom([xz]).strokes, [[1, 0.1], [1.5, 0.1]])).toHaveLength(0);
  });
});
