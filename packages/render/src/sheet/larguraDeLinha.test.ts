import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, type Project, type SheetViewport, type Wall } from '@hestia/model';
import { LIGHT, type PlanDrawList } from '../plan/types.ts';
import { partsOf } from './convert.ts';
import { planPartsOf, sectionPartsOf } from './viewports.ts';

const id = (q: { x: number; y: number }): { x: number; y: number } => q;
const PX_96DPI_MM = 25.4 / 96;

describe('espessura de linha na folha e no PDF', () => {
  it('traço com espessura de papel mantém os mm do papel; sem ela vale pixel de tela a 96 dpi', () => {
    const list: PlanDrawList = {
      background: '#ffffff',
      fills: [],
      labels: [],
      strokes: [
        // 0,7 mm na escala 1:50: na vista da folha o widthPx é mm × 1000
        { pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false, widthPx: 700, papel: { mm: 0.7, escala: 50 }, color: '#000000', alpha: 1 },
        // sem papel: 1 px de tela
        { pts: [{ x: 0, y: 1 }, { x: 1, y: 1 }], closed: false, widthPx: 1, color: '#000000', alpha: 1 },
        // sem papel, 2,2 px, tracejado de 10 e 5 px
        { pts: [{ x: 0, y: 2 }, { x: 1, y: 2 }], closed: false, widthPx: 2.2, color: '#000000', alpha: 1, dash: [10, 5] },
      ],
    };
    const { paths } = partsOf(list, id, LIGHT);
    expect(paths[0]!.widthMm).toBeCloseTo(0.7, 12);
    expect(paths[1]!.widthMm).toBeCloseTo(PX_96DPI_MM, 12); // 0,2646 mm
    expect(paths[2]!.widthMm).toBeCloseTo(2.2 * PX_96DPI_MM, 12);
    expect(paths[2]!.dashMm![0]).toBeCloseTo(10 * PX_96DPI_MM, 12); // 2,646 mm
    expect(paths[2]!.dashMm![1]).toBeCloseTo(5 * PX_96DPI_MM, 12); // 1,323 mm
  });

  function projeto(): Project {
    const p = createEmptyProject();
    for (const [i, [ax, ay, bx, by]] of ([[0, 0, 8, 0], [8, 0, 8, 5], [8, 5, 0, 5], [0, 5, 0, 0]] as const).entries()) {
      const w = makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: ax, y: ay }, b: { x: bx, y: by } });
      p.elements[w.id] = { ...w, order: i + 1 } as Wall;
    }
    p.nextOrder = 10;
    p.views = [{ id: 'sv1', name: 'Corte AA', kind: 'section', a: { x: 2, y: -1 }, b: { x: 2, y: 6 }, depth: 6 } as never];
    return p;
  }
  const vp = (scale: number, view: SheetViewport['view']): SheetViewport => ({ id: 'v1', view, at: { x: 0, y: 0 }, size: { w: 200, h: 150 }, scale } as SheetViewport);

  it('corte 1:50 na folha: o contorno externo é a pena de corte da parede (0,7 mm) e nenhum traço é um fio invisível', () => {
    const { paths } = sectionPartsOf(projeto(), 'sv1', vp(50, { kind: 'section', sectionId: 'sv1' }));
    const larguras = paths.map((s) => s.widthMm);
    expect(Math.max(...larguras)).toBeCloseTo(0.7, 9);
    expect(Math.min(...larguras)).toBeGreaterThanOrEqual(0.09);
  });

  it('corte: todo tracejado da folha tem trecho de pelo menos 1 mm (antes saía com 0,01 mm, contínuo no PDF)', () => {
    const { paths } = sectionPartsOf(projeto(), 'sv1', vp(100, { kind: 'section', sectionId: 'sv1' }));
    const tracejados = paths.filter((s) => s.dashMm !== undefined);
    expect(tracejados.length).toBeGreaterThan(0);
    for (const s of tracejados) expect(s.dashMm![0]).toBeGreaterThanOrEqual(1);
  });

  it('planta 1:100 na folha: contorno cortado de 0,5 mm, hachura mais fina que o contorno, sem fios invisíveis', () => {
    const { paths } = planPartsOf(projeto(), 'lv_0', vp(100, { kind: 'plan', levelId: 'lv_0' }));
    const larguras = paths.map((s) => s.widthMm);
    expect(Math.max(...larguras)).toBeCloseTo(0.5, 9);
    expect(Math.min(...larguras)).toBeGreaterThanOrEqual(0.09);
    expect(larguras.filter((w) => Math.abs(w - 0.09) < 1e-9).length).toBeGreaterThan(0); // hachura de 0,09 mm
  });
});
