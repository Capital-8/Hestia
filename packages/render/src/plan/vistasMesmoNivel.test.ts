import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, ProjectStore, createEmptyProject, floorViewId, makeRoof, makeWall, roofViewId, withAreaPlansOfTest, type AreaPlan, type Project } from '@hestia/model';
import { planFrameUpdateOf, PlanFrame, type PlanViewState } from './planFrame.ts';
import { planGeometrySelection } from './build.ts';
import { drawnAnnotations } from './notes.ts';
import { planStyleOf } from './style.ts';
import { planViewOf } from './view.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

/**
 * Vistas do mesmo nível (piso, cobertura e planta de área) com ocultos e anotações diferentes, desenhadas alternadas pela
 * mesma entrada que a tela usa (`planFrameUpdateOf` + `PlanFrame`), no MESMO projeto e na MESMA versão: uma não contamina
 * a outra. O desenho de cada vista tem de sair igual ao de um quadro novo, sem histórico.
 */

const V: Viewport = { cx: 4, cy: 3, zoom: 60, width: 800, height: 600 };
const NULL_SINK = { setSlot: (): void => {}, setBackground: (): void => {} };

const AREA: AreaPlan = {
  id: 'ap1',
  name: 'Áreas',
  levelId: 'lv_0',
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
  tags: [],
  annotations: {
    dimensions: [],
    texts: [{ id: 'tA', at: { x: 2, y: 4 }, text: 'NOTA DA AREA', height: 3, rotation: 0 }],
    detailLines: [],
    detailRegions: [],
    tags: [],
  },
};

function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  const pts = [{ x: 0, y: 0 }, { x: 0, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 0 }];
  pts.forEach((a, i) => s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b: pts[(i + 1) % 4]!, locationLine: 'finishInterior' }) }));
  s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [{ x: -0.3, y: -0.3 }, { x: 8.3, y: -0.3 }, { x: 8.3, y: 6.3 }, { x: -0.3, y: 6.3 }], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 } }) });
  s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 'tn', at: { x: 2, y: 3 }, text: 'NOTA DO NIVEL', height: 3, rotation: 0 } });
  return withAreaPlansOfTest(s.project, [AREA]);
}

const p = projeto();

const estado = (over: Partial<PlanViewState>): PlanViewState => ({
  project: p,
  version: 1,
  levelId: 'lv_0',
  v: V,
  theme: LIGHT,
  dark: false,
  gpu: false,
  showGrid: false,
  showUnderlay: false,
  showRoofProjection: true,
  thinLines: false,
  selection: [],
  hover: null,
  preview: [],
  inference: null,
  resolve: (id) => resolveLevel(p, id, new Map()),
  ...over,
});

/** As três vistas do nível 0, cada uma com os seus ocultos. */
const VISTAS = {
  piso: estado({ hidden: new Set(['w0']) }),
  area: estado({ areaPlan: AREA, hidden: new Set() }),
  cobertura: estado({ roofPlanMode: true, hidden: new Set(['r']) }),
};
type Nome = keyof typeof VISTAS;

const desenhar = (quadro: PlanFrame, s: PlanViewState): string => {
  quadro.update({ ...planFrameUpdateOf(s), gpu: false });
  return JSON.stringify(quadro.drawList(LIGHT));
};

/** Desenho de referência: quadro novo, sem nenhuma vista antes. */
const referencia = (nome: Nome): string => desenhar(new PlanFrame(NULL_SINK), VISTAS[nome]);

describe('vistas do mesmo nível não se contaminam (piso, cobertura, planta de área)', () => {
  const ref = { piso: referencia('piso'), area: referencia('area'), cobertura: referencia('cobertura') };

  it('as três vistas, de fato, saem diferentes (ocultos e anotações próprios)', () => {
    expect(ref.piso).not.toBe(ref.area);
    expect(ref.piso).not.toBe(ref.cobertura);
    expect(ref.area).not.toBe(ref.cobertura);
    expect(ref.area).toContain('NOTA DA AREA');
    expect(ref.area).not.toContain('NOTA DO NIVEL');
    expect(ref.piso).toContain('NOTA DO NIVEL');
    expect(ref.piso).not.toContain('NOTA DA AREA');
  });

  it('piso x área, alternados várias vezes no mesmo quadro: cada um sai como se fosse o primeiro', () => {
    const quadro = new PlanFrame(NULL_SINK);
    for (let i = 0; i < 4; i++) {
      expect(desenhar(quadro, VISTAS.piso)).toBe(ref.piso);
      expect(desenhar(quadro, VISTAS.area)).toBe(ref.area);
    }
  });

  it('piso x cobertura, alternados várias vezes no mesmo quadro', () => {
    const quadro = new PlanFrame(NULL_SINK);
    for (let i = 0; i < 4; i++) {
      expect(desenhar(quadro, VISTAS.cobertura)).toBe(ref.cobertura);
      expect(desenhar(quadro, VISTAS.piso)).toBe(ref.piso);
    }
  });

  it('as três em sequências variadas, no mesmo quadro e também em quadros separados', () => {
    const sequencia: Nome[] = ['piso', 'area', 'cobertura', 'cobertura', 'area', 'piso', 'cobertura', 'piso', 'area', 'area', 'piso'];
    const unico = new PlanFrame(NULL_SINK);
    const porVista: Record<Nome, PlanFrame> = { piso: new PlanFrame(NULL_SINK), area: new PlanFrame(NULL_SINK), cobertura: new PlanFrame(NULL_SINK) };
    for (const nome of sequencia) {
      expect(desenhar(unico, VISTAS[nome])).toBe(ref[nome]);
      expect(desenhar(porVista[nome], VISTAS[nome])).toBe(ref[nome]);
    }
  });

  it('sem nenhum oculto em nenhuma delas, só o id da vista separa as camadas (piso, área e cobertura alternados)', () => {
    const limpas: Record<Nome, PlanViewState> = { piso: estado({}), area: estado({ areaPlan: AREA }), cobertura: estado({ roofPlanMode: true }) };
    const esperado = Object.fromEntries((Object.keys(limpas) as Nome[]).map((n) => [n, desenhar(new PlanFrame(NULL_SINK), limpas[n])])) as Record<Nome, string>;
    const quadro = new PlanFrame(NULL_SINK);
    for (const nome of ['piso', 'cobertura', 'area', 'piso', 'area', 'cobertura', 'cobertura', 'piso'] as Nome[]) expect(desenhar(quadro, limpas[nome])).toBe(esperado[nome]);
    expect(new Set(Object.values(esperado)).size).toBe(3);
  });

  it('as chaves do quadro distinguem as três vistas (o id da vista entra nelas)', () => {
    const u = (Object.keys(VISTAS) as Nome[]).map((n) => planFrameUpdateOf(VISTAS[n]));
    for (const chave of ['geometryKey', 'overlayKey', 'hoverKey'] as const) expect(new Set(u.map((x) => x[chave])).size).toBe(3);
    expect(planFrameUpdateOf(VISTAS.piso).geometryKey).toContain(floorViewId('lv_0'));
    expect(planFrameUpdateOf(VISTAS.cobertura).geometryKey).toContain(roofViewId('lv_0'));
    expect(planFrameUpdateOf(VISTAS.area).geometryKey).toContain(AREA.id);
  });
});

describe('vista da planta (planViewOf do render) por vista', () => {
  it('piso e planta de área do mesmo nível têm entradas próprias, estáveis por referência', () => {
    const piso = planViewOf(p, 'lv_0', floorViewId('lv_0'));
    const area = planViewOf(p, 'lv_0', AREA.id);
    expect(area).not.toBe(piso);
    for (let i = 0; i < 3; i++) {
      expect(planViewOf(p, 'lv_0', floorViewId('lv_0'))).toBe(piso);
      expect(planViewOf(p, 'lv_0', AREA.id)).toBe(area);
    }
    // Sem `viewId`, vale a planta de piso (o que as outras pastas sempre pediram).
    expect(planViewOf(p, 'lv_0')).toBe(piso);
    // Hoje as duas leem o mesmo intervalo e os mesmos gráficos do nível: o conteúdo é igual.
    expect(area.range).toEqual(piso.range);
    expect([...area.hidden].sort()).toEqual([...piso.hidden].sort());
  });
});

describe('parâmetros opcionais de vista nas entradas exportadas', () => {
  it('planGeometrySelection com viewId: as anotações que a planta de área POSSUI chegam à geometria (as copiadas do nível agora também: D2)', () => {
    expect(planGeometrySelection(p, 'lv_0', ['tA', 'tn', 'w0'], AREA, AREA.id)).toEqual(['tA']);
    const herdeira: AreaPlan = { ...AREA, id: 'ap2', annotations: undefined };
    const q: Project = withAreaPlansOfTest(p, [AREA, herdeira]);
    // O id do nível não é da vista; a cópia (`tn__ap2`) é.
    expect(planGeometrySelection(q, 'lv_0', ['tA', 'tn'], herdeira, herdeira.id)).toEqual([]);
    expect(planGeometrySelection(q, 'lv_0', ['tA', 'tn', 'tn__ap2'], herdeira, herdeira.id)).toEqual(['tn__ap2']);
    // Sem viewId o comportamento é o de sempre.
    expect(planGeometrySelection(p, 'lv_0', ['tA', 'tn', 'w0'], AREA)).toEqual(['tA']);
  });

  it('drawnAnnotations: a planta de área desenha as dela; a que nasceu sem conjunto próprio desenha as cópias das do nível', () => {
    expect(drawnAnnotations(p, 'lv_0', AREA, AREA.id).texts.map((t) => t.id)).toEqual(['tA']);
    const herdeira: AreaPlan = { ...AREA, id: 'ap2', annotations: undefined };
    const q: Project = withAreaPlansOfTest(p, [AREA, herdeira]);
    expect(drawnAnnotations(q, 'lv_0', herdeira, herdeira.id).texts.map((t) => t.id)).toEqual(['tn__ap2']);
    expect(drawnAnnotations(q, 'lv_0').texts.map((t) => t.id)).toEqual(['tn']);
  });

  it('planStyleOf com viewId: a planta de área usa os gráficos do nível e a escala da própria planta', () => {
    const piso = planStyleOf(p, 'lv_0', 60);
    expect(planStyleOf(p, 'lv_0', 60, undefined, AREA.id)).toEqual(piso);
    expect(planStyleOf(p, 'lv_0', 60, 20, AREA.id).scale).toBe(20);
  });
});
