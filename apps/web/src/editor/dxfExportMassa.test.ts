import { describe, expect, it } from 'vitest';
import { ESTILO_CORTE_MASSA, ESTILO_PLANTA_MASSA, type LinhaCorteMassaProjeto, type LinhaPlantaMassaProjeto } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeMass, type Project } from '@hestia/model';
import { massaDoCorte, massaDxfDaPlanta, massaItensDoCorte, massaPathsDaPlanta } from './dxfExportMassa.ts';
import { dxfGeometryOf, planDxf, sectionDxf, sectionDxfGeometryOf } from './dxfExport.ts';

const quadrado = (l: number, fecha = true): Array<{ x: number; y: number }> => {
  const q = [{ x: 0, y: 0 }, { x: l, y: 0 }, { x: l, y: l }, { x: 0, y: l }];
  return fecha ? [...q, q[0]!] : q;
};
const plantaLinha = (massaId: string, estilo: number, pontos = quadrado(8)): LinhaPlantaMassaProjeto => ({ massaId, copia: 0, estilo, pontos });
const corteLinha = (massaId: string, estilo: number, pontos = [{ s: 0, z: 0 }, { s: 10, z: 0 }, { s: 10, z: 9 }, { s: 0, z: 9 }, { s: 0, z: 0 }]): LinhaCorteMassaProjeto => ({ massaId, copia: 0, estilo, pontos });

describe('DXF da massa: planta (linhas do kernel simuladas)', () => {
  it('cortado e projetado saem contínuos, acima tracejado; o ponto de fechamento repetido do kernel sai', () => {
    const r = massaPathsDaPlanta([plantaLinha('m', ESTILO_PLANTA_MASSA.cortado), plantaLinha('m', ESTILO_PLANTA_MASSA.projetado), plantaLinha('m', ESTILO_PLANTA_MASSA.acima)], new Set());
    expect(r.map((l) => l.dashed === true)).toEqual([false, false, true]);
    expect(r.every((l) => l.closed && l.pts.length === 4)).toBe(true);
  });

  it('massa oculta na vista e anel degenerado não saem', () => {
    const r = massaPathsDaPlanta([plantaLinha('m', 0), plantaLinha('n', 0), plantaLinha('n', 1, [{ x: 0, y: 0 }, { x: 1, y: 1 }])], new Set(['m']));
    expect(r).toHaveLength(1);
  });

  it('categoria oculta: nenhuma camada MASSA (undefined)', () => {
    expect(massaDxfDaPlanta(createEmptyProject('P'), 'lv_0', 1.2, new Set(), false)).toBeUndefined();
  });
});

describe('DXF da massa: corte e elevação (linhas do kernel simuladas)', () => {
  it('o cortado é item de corte, o projetado é item além do plano e a feição (linha aberta) não sai', () => {
    const r = massaItensDoCorte([corteLinha('m', ESTILO_CORTE_MASSA.cortado), corteLinha('m', ESTILO_CORTE_MASSA.projetado), corteLinha('m', ESTILO_CORTE_MASSA.feicao, [{ s: 0, z: 3 }, { s: 5, z: 3 }])]);
    expect(r.cut).toHaveLength(1);
    expect(r.beyond).toHaveLength(1);
    expect(r.cut[0]!.category).toBe('mass');
    // O anel (s, z) do kernel vira polígono em (x, y) sem o ponto de fechamento.
    expect(r.cut[0]!.polygons[0]![0]).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 9 }, { x: 0, y: 9 }]);
  });
});

describe('DXF da massa sem kernel (web)', () => {
  const massa = makeMass({
    id: 'm1',
    levelId: 'lv_0',
    name: 'M',
    secoes: [
      { z: 0, perfil: { forma: 'circulo', raio: 2 }, rotacao: 0, escala: 1, dx: 0, dy: 0 },
      { z: 3, perfil: { forma: 'circulo', raio: 2 }, rotacao: 0, escala: 1, dx: 0, dy: 0 },
    ],
  });
  const projeto = (): Project => {
    const s = new ProjectStore(createEmptyProject('M'));
    s.exec({ type: 'addMass', mass: massa });
    return { ...s.project, views: [{ id: 'sv1', name: 'Corte AA', kind: 'section', a: { x: -5, y: 0 }, b: { x: 5, y: 0 }, depth: 5 }] };
  };

  it('a planta não leva a camada MASSA e não lança', () => {
    const p = projeto();
    expect(dxfGeometryOf(p, 'lv_0').masses).toBeUndefined();
    expect(planDxf(p, 'lv_0')).not.toContain('MASSA');
  });

  it('o corte não leva CORTE_MASSA e não lança; massaDoCorte devolve vazio', () => {
    const p = projeto();
    expect(sectionDxfGeometryOf(p, 'sv1').cut.some((i) => i.category === 'mass')).toBe(false);
    expect(sectionDxf(p, 'sv1')).not.toContain('CORTE_MASSA');
    expect(massaDoCorte(p, { cut: [], beyond: [], openings: [] } as never, true)).toEqual({ cut: [], beyond: [] });
  });
});
