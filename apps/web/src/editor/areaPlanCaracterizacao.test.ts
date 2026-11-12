import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject, DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, makeRoom, makeWall, ProjectStore, type AreaPlan, type AreaPlanAnnotations } from '@hestia/model';
import { areaPlanDxf, planDxf, viewDxf } from './dxfExport.ts';

/**
 * Caracterização do DXF da planta de área (golden). Trava o comportamento ATUAL de `areaPlanDxf` para o mesmo
 * projeto pequeno usado no render. O caso de textos repetidos documenta o comportamento atual, mesmo que
 * seja bug: a deduplicação das anotações é por texto, não por id (o plano de perfis corrige isso no passo 10).
 */

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

function projetoPequeno(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  return s;
}

const planaArea = (over: Partial<AreaPlan> = {}): AreaPlan => ({
  id: 'ap1',
  name: 'Planta de área',
  levelId: 'lv_0',
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
  tags: [],
  ...over,
});

const comAnotacoes = (annotations: AreaPlanAnnotations): AreaPlan => planaArea({ annotations });

/** Conta ocorrências de um valor de registro DXF (linha exata), para comparar com e sem repetição. */
const contaTexto = (dxf: string, valor: string): number => dxf.split('\r\n').filter((l) => l === valor).length;

describe('caracterização do DXF da planta de área (golden)', () => {
  it('(e) DXF do projeto pequeno com anotações da vista não muda', () => {
    const s = projetoPequeno();
    s.exec({ type: 'addAreaPlan', plan: comAnotacoes({
      dimensions: [{ id: 'dA', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1.5 }],
      texts: [{ id: 'tA', at: { x: 2, y: 4 }, text: 'NOTA DA VISTA', height: 3, rotation: 0 }],
      detailLines: [{ id: 'dlA', a: { x: 0, y: 1 }, b: { x: 4, y: 1 } }],
      detailRegions: [],
      tags: [],
    }) });
    const dxf = areaPlanDxf(s.project, 'ap1');
    expect(dxf.startsWith('0\r\nSECTION')).toBe(true);
    expect(dxf.endsWith('0\r\nEOF\r\n')).toBe(true);
    expect(dxf).toContain('NOTA DA VISTA');
    expect(dxf).toContain('4,00 m');
    expect(dxf).toMatchSnapshot();
  });

  it('(e) DXF sem anotações próprias não traz as anotações do nível (mesmo com cota e texto no nível)', () => {
    const s = projetoPequeno();
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dn', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 'tn', at: { x: 2, y: 3 }, text: 'NOTA DO NIVEL', height: 3, rotation: 0 } });
    s.exec({ type: 'addAreaPlan', plan: planaArea() });
    const dxf = areaPlanDxf(s.project, 'ap1');
    // Sem annotations no plano, o render já cai no nível; o registro extra não duplica o texto.
    expect(contaTexto(dxf, 'NOTA DO NIVEL')).toBe(1);
    expect(contaTexto(dxf, '4,00 m')).toBe(1);
  });

  it('(e) duas anotações com texto igual saem ambas (dedup por instância, não por texto)', () => {
    const s = projetoPequeno();
    s.exec({ type: 'addAreaPlan', plan: comAnotacoes({
      dimensions: [],
      texts: [
        { id: 'tRep1', at: { x: 1, y: 4 }, text: 'REPETIDO', height: 3, rotation: 0 },
        { id: 'tRep2', at: { x: 3, y: 1 }, text: 'REPETIDO', height: 3, rotation: 0 },
      ],
      detailLines: [],
      detailRegions: [],
      tags: [],
    }) });
    const dxf = areaPlanDxf(s.project, 'ap1');
    // Hoje: o render da área já desenha os dois textos (labels com o mesmo valor), então a passagem extra
    // os considera "já desenhados" e não escreve TEXT extra. Resultado: cada ocorrência vem só do render.
    // Se a posição de cada uma some do DXF, é a regressão que o passo 10 deve corrigir.
    const ocorrencias = contaTexto(dxf, 'REPETIDO');
    expect(ocorrencias).toBe(2);
    expect(dxf).toMatchSnapshot();
  });

  it('(e) textos iguais na vista e no nível: a vista não perde o próprio texto', () => {
    const s = projetoPequeno();
    s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 'tn', at: { x: 2, y: 3 }, text: 'IGUAL', height: 3, rotation: 0 } });
    s.exec({ type: 'addAreaPlan', plan: comAnotacoes({
      dimensions: [],
      texts: [{ id: 'tA', at: { x: 2, y: 4 }, text: 'IGUAL', height: 3, rotation: 0 }],
      detailLines: [],
      detailRegions: [],
      tags: [],
    }) });
    const dxf = areaPlanDxf(s.project, 'ap1');
    // Comportamento atual: a planta de área usa só as anotações da vista (annotations definido).
    expect(contaTexto(dxf, 'IGUAL')).toBeGreaterThanOrEqual(1);
  });

  it('perfil que oculta anotações: nem o render nem a passagem extra as escrevem', () => {
    const s = projetoPequeno();
    s.exec({ type: 'addAreaPlan', plan: planaArea({
      graphics: { ...DEFAULT_AREA_GRAPHICS, showAnnotations: false, showDimensions: false },
      annotations: {
        dimensions: [{ id: 'dA', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1.5 }],
        texts: [{ id: 'tA', at: { x: 2, y: 4 }, text: 'OCULTO', height: 3, rotation: 0 }],
        detailLines: [{ id: 'dlA', a: { x: 0, y: 1 }, b: { x: 4, y: 1 } }],
        detailRegions: [],
        tags: [],
      },
    }) });
    const dxf = areaPlanDxf(s.project, 'ap1');
    expect(dxf).not.toContain('OCULTO');
    expect(dxf).not.toContain('4,00 m');
    expect(dxf).not.toContain('ANOTACOES_DETALHE');
  });

  it('três textos iguais saem os três', () => {
    const s = projetoPequeno();
    const t = (id: string, x: number) => ({ id, at: { x, y: 4 }, text: 'TRIPLO', height: 3, rotation: 0 });
    s.exec({ type: 'addAreaPlan', plan: comAnotacoes({ dimensions: [], texts: [t('a', 1), t('b', 2), t('c', 3)], detailLines: [], detailRegions: [], tags: [] }) });
    expect(contaTexto(areaPlanDxf(s.project, 'ap1'), 'TRIPLO')).toBe(3);
  });

  it('ponto único viewDxf: piso igual a planDxf, área igual a areaPlanDxf', () => {
    const s = projetoPequeno();
    s.exec({ type: 'addAreaPlan', plan: planaArea() });
    expect(viewDxf(s.project, { viewId: 'pv_lv_0' })).toBe(planDxf(s.project, 'lv_0'));
    expect(viewDxf(s.project, { viewId: 'ap1' })).toBe(areaPlanDxf(s.project, 'ap1'));
  });
});
