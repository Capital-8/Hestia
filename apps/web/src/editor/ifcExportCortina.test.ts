import { describe, expect, it } from 'vitest';
import { buildTemplate, createEmptyProject, makeWall, type Project, type WallType } from '@hestia/model';
import { ifcGeometryOf, projectIfcComAvisos } from './ifcExport.ts';

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const NOW = new Date('2026-10-22T12:00:00Z');

/** Projeto com uma parede cortina de 6 m (sem nenhum kernel carregado nos testes de unidade). */
function projetoComCortina(): Project {
  const base = createEmptyProject('Cortina');
  const tipo: WallType = {
    ...base.wallTypes.wt_alv14!,
    id: 'wt_ct',
    name: 'Cortina teste',
    family: 'curtain',
    curtain: {
      depth: 0.1,
      u: { mode: 'fixedNumber', count: 4 },
      v: { mode: 'fixedNumber', count: 2 },
      mullions: { interiorVertical: 'mul_ret_50x100', interiorHorizontal: null, borderStart: 'mul_ret_50x100', borderEnd: 'mul_ret_50x100', borderBottom: null, borderTop: null, corner: null, joinPriority: 'vertical' },
      defaultPanelTypeId: 'pnl_vidro_10',
    },
    layers: [],
    strips: [],
    wrapInserts: 'none',
    wrapEnds: 'none',
  };
  const parede = { ...makeWall({ id: 'ct1', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }), order: 1 };
  return { ...base, wallTypes: { ...base.wallTypes, wt_ct: tipo }, elements: { ...base.elements, ct1: parede as Project['elements'][string] } };
}

describe('exportação IFC: parede cortina sem kernel (web)', () => {
  it('a cortina sai como parede genérica, com contorno e cota do tipo, e sem geometria do kernel', () => {
    const p = projetoComCortina();
    const geo = ifcGeometryOf(p);
    expect(geo.curtains).toBeUndefined();
    const generica = geo.walls.find((w) => w.wallId === 'ct1');
    expect(generica).toBeDefined();
    expect(generica!.footprints).toHaveLength(1);
    expect(generica!.footprints[0]![0]).toHaveLength(4);
    expect(generica!.height).toBeCloseTo(3, 6);
  });

  it('o texto tem IFCWALL no lugar da IFCCURTAINWALL e um aviso no idioma pedido', () => {
    const { texto, avisos } = projectIfcComAvisos(projetoComCortina(), NOW, 'pt');
    expect(count(texto, 'IFCWALL')).toBe(1);
    expect(count(texto, 'IFCCURTAINWALL')).toBe(0);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('Cortina teste');
    const en = projectIfcComAvisos(projetoComCortina(), NOW, 'en');
    expect(en.avisos[0]).toContain('kernel geometry');
  });

  it('projeto sem cortina não tem aviso nem IFCCURTAINWALL', () => {
    const { texto, avisos } = projectIfcComAvisos(buildTemplate('house2'), NOW, 'pt');
    expect(avisos).toEqual([]);
    expect(count(texto, 'IFCCURTAINWALL')).toBe(0);
  });
});
