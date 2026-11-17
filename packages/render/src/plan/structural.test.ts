import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  makeBeam,
  makeColumn,
  makeFooting,
  type Project,
} from '@hestia/model';
import { defaultPaint } from './style.ts';
import {
  structuralPegadas,
  structuralPlanOps,
  structuralSelectionOps,
} from './structural.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const THEME = LIGHT;

const VIEWPORT: Viewport = {
  zoom: 50,
  cx: 0,
  cy: 0,
  width: 800,
  height: 600,
};

function createTestProject(): Project {
  const p = createEmptyProject();
  const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 2, y: 3 }, mark: 'P1' });
  const b = makeBeam({ id: 'b1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } });
  const f = makeFooting({ id: 'f1', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: { x: 2, y: 3 } });
  p.elements[c.id] = { ...c, order: 1 };
  p.elements[b.id] = { ...b, order: 2 };
  p.elements[f.id] = { ...f, order: 3 };
  return p;
}

describe('structural plan ops', () => {
  it('gera operações 2D para pilares, vigas e sapatas', () => {
    const p = createTestProject();
    p.settings.showTags = true;
    const paint = defaultPaint('wall', 50);
    const ops = structuralPlanOps(p, 'lv_0', THEME, false, 'medium', undefined, paint, paint, 100);

    expect(ops.fills.length).toBeGreaterThanOrEqual(2); // sapata + pilar
    expect(ops.strokes.length).toBeGreaterThanOrEqual(4); // sapata + viga contorno + viga eixo + pilar corte
    expect(ops.labels.some((l) => l.text === 'P1')).toBe(true);
    expect(ops.labels.some((l) => l.text === 'VG-01')).toBe(true);
  });

  it('respeita elementos ocultos', () => {
    const p = createTestProject();
    const hidden = new Set(['c1', 'b1']);
    const paint = defaultPaint('wall', 50);
    const ops = structuralPlanOps(p, 'lv_0', THEME, false, 'medium', hidden, paint, paint, 100);

    // c1 e b1 ocultos -> apenas f1
    expect(ops.labels).toHaveLength(0);
    expect(ops.fills).toHaveLength(1); // só a sapata
  });

  it('structuralSelectionOps adiciona alças nas pontas da viga selecionada', () => {
    const p = createTestProject();
    const ops = structuralSelectionOps(p, 'lv_0', ['b1'], null, THEME, VIEWPORT);
    expect(ops.fills.length).toBeGreaterThan(0);
    // Deve conter alças em (0, 0) e (5, 0)
    expect(ops.fills.some((f) => f.color === '#ffffff')).toBe(true);
  });

  it('structuralPegadas retorna polígonos de pilares, vigas e sapatas', () => {
    const p = createTestProject();
    const map = structuralPegadas(p, 'lv_0');
    expect(map.has('c1')).toBe(true);
    expect(map.has('b1')).toBe(true);
    expect(map.has('f1')).toBe(true);
  });
});
