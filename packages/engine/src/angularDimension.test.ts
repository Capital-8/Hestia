import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, makeWall, roofViewId, withAreaPlansOfTest, withViewPatchOfTest, type AreaPlan, type DetailLine, type Dimension, type Id, type Project } from '@hestia/model';
import { resolveAngularDimension } from './angularDimension.ts';

/**
 * Cota angular cuja referência é uma linha de detalhe (`<id>:detalhe`): a linha mora na vista da cota, que pode ser a
 * planta de piso, a de cobertura ou uma planta de área. A cota é recalculada em qualquer uma delas.
 */

const LV = 'lv_0';
const LINHA: DetailLine = { id: 'dl1', a: { x: 1, y: -2 }, b: { x: 1, y: 2 } };

/** Gravada com um centro propositalmente errado: só o recálculo (parede w1 × linha dl1) o leva a (1, 0). */
const cota = (): Dimension => ({
  id: 'ang', a: { x: 99, y: 99 }, b: { x: 100, y: 99 }, offset: 0,
  angular: { refA: 'w1:eixo', refB: 'dl1:detalhe', center: { x: 99, y: 99 }, from: { x: 1, y: 0 }, to: { x: 0, y: 1 }, radius: 1, side: 'minor', value: Math.PI / 2 },
});

function base(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: LV, a: { x: -3, y: 0 }, b: { x: 3, y: 0 } }) });
  return s.project;
}

const AREA: AreaPlan = { id: 'ap1', name: 'A', levelId: LV, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS }, tags: [] };
const ocupar = (p: Project, viewId: Id): Project => withViewPatchOfTest(p, viewId, { annotations: { detailLines: [LINHA], dimensions: [cota()] } });

describe('resolveAngularDimension: linha de detalhe de qualquer vista de planta', () => {
  it('planta de piso (controle)', () => {
    const p = ocupar(base(), `pv_${LV}`);
    const r = resolveAngularDimension(p, LV, cota());
    expect(r.angular!.center.x).toBeCloseTo(1, 9);
    expect(r.angular!.center.y).toBeCloseTo(0, 9);
  });

  it('planta de cobertura', () => {
    const p = ocupar(base(), roofViewId(LV));
    const r = resolveAngularDimension(p, LV, cota());
    expect(r.angular!.center.x).toBeCloseTo(1, 9);
    expect(r.angular!.center.y).toBeCloseTo(0, 9);
  });

  it('planta de área', () => {
    const p = ocupar(withAreaPlansOfTest(base(), [AREA]), 'ap1');
    const r = resolveAngularDimension(p, LV, cota());
    expect(r.angular!.center.x).toBeCloseTo(1, 9);
    expect(r.angular!.center.y).toBeCloseTo(0, 9);
  });

  it('linha que não existe em nenhuma vista do nível: mantém a geometria gravada', () => {
    const r = resolveAngularDimension(base(), LV, cota());
    expect(r.angular!.center).toEqual({ x: 99, y: 99 });
  });

  it('linha de outro nível não resolve', () => {
    const p = ocupar(base(), roofViewId(LV));
    expect(resolveAngularDimension(p, 'lv_1', cota()).angular!.center).toEqual({ x: 99, y: 99 });
  });
});
