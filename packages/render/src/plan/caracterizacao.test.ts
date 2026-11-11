import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject, DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, makeRoom, makeWall, ProjectStore, type AreaPlan, type AreaPlanAnnotations, withAreaPlansOfTest } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { LIGHT } from './types.ts';

/**
 * Caracterização (golden) do render de planta de piso e de planta de área.
 *
 * Trava o comportamento ATUAL: os snapshots são a rede de segurança para as fusões do plano de perfis
 * (docs: desenho-perfil-vista, passos 1 e 4). Se um snapshot mudar, a mudança precisa ser intencional:
 * rode `npx vitest run -u` só depois de confirmar que a diferença é esperada.
 */

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

/** Projeto pequeno: retângulo 4 x 5 m, uma sala, uma cota e um texto do nível. */
function projetoPequeno(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dn', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
  s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 'tn', at: { x: 2, y: 3 }, text: 'NOTA DO NIVEL', height: 3, rotation: 0 } });
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

const anotacoesDaVista: AreaPlanAnnotations = {
  dimensions: [{ id: 'dA', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1.5 }],
  texts: [{ id: 'tA', at: { x: 2, y: 4 }, text: 'NOTA DA VISTA', height: 3, rotation: 0 }],
  detailLines: [{ id: 'dlA', a: { x: 0, y: 1 }, b: { x: 4, y: 1 }, style: 'dashed' }],
  detailRegions: [],
  tags: [],
};

/** Entrada do render: o mesmo formato que o app monta (viewport e flags fixos). */
const entrada = (s: ProjectStore, areaPlan?: AreaPlan): PlanInput => ({
  // A planta de área vai registrada no projeto: o desenho lê a vista pela API do modelo.
  project: areaPlan ? withAreaPlansOfTest(s.project, [areaPlan]) : s.project,
  levelId: 'lv_0',
  resolved: resolveLevel(s.project, 'lv_0'),
  below: null,
  areaPlan,
  viewport: { cx: 2, cy: 2.5, zoom: 100, width: 600, height: 400 },
  theme: LIGHT,
  dark: false,
  selection: [],
  hover: null,
  preview: [],
  inference: null,
  showGrid: false,
});

describe('caracterização do render (golden)', () => {
  it('(a) planta de piso: ops do projeto pequeno não mudam', () => {
    const s = projetoPequeno();
    const ops = buildPlanGeometry(entrada(s));
    expect(ops.labels.map((l) => l.text)).toEqual(expect.arrayContaining(['4,00 m', 'NOTA DO NIVEL']));
    expect(ops).toMatchSnapshot();
  });

  it('(b) planta de área com anotações próprias: ops não mudam', () => {
    const s = projetoPequeno();
    const ops = buildPlanGeometry(entrada(s, planaArea({ annotations: anotacoesDaVista })));
    // Anotação da vista aparece; a do nível não vaza para a área.
    const textos = ops.labels.map((l) => l.text);
    expect(textos).toContain('NOTA DA VISTA');
    expect(textos).not.toContain('NOTA DO NIVEL');
    expect(ops).toMatchSnapshot();
  });

  it('(b2) planta de área sem anotações próprias: cai nas anotações do nível', () => {
    const s = projetoPequeno();
    const ops = buildPlanGeometry(entrada(s, planaArea()));
    const textos = ops.labels.map((l) => l.text);
    expect(textos).toContain('NOTA DO NIVEL');
    expect(textos).not.toContain('NOTA DA VISTA');
    expect(ops).toMatchSnapshot();
  });
});
