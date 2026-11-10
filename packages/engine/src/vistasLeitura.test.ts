import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  DEFAULT_VIEW_RANGE,
  ProjectStore,
  createEmptyProject,
  floorViewId,
  makeRoom,
  makeWall,
  roofViewId,
  type AreaPlan,
  type Project,
} from '@hestia/model';
import {
  areaLegendRows,
  areaLegendRowsOfView,
  areaTableAllRows,
  areaTableRows,
  areaTableRowsOfView,
  assinaturaDeVista,
  assinaturaGeometriaGlobal,
  assinaturasDoProjeto,
  schemeOf,
  schemeOfView,
  viewRangeWarnings,
  viewRangeWarningsOfView,
} from './index.ts';

const LV0 = 'lv_0';
const AP = 'ap_t';

const plan = (id: string, over: Partial<AreaPlan> = {}): AreaPlan => ({
  id,
  name: `Planta ${id}`,
  levelId: LV0,
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } },
  tags: [],
  ...over,
});

/** Sala 4 × 5 fechada, um esquema por categoria e uma planta de área; parede alta fora do intervalo para gerar aviso. */
function montar(opcoes: { proprias?: boolean } = {}): Project {
  const s = new ProjectStore(createEmptyProject());
  const pts = [{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 0 }];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: LV0, a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'wa', typeId: 'wt_alv14', levelId: LV0, a: { x: 1, y: 1 }, b: { x: 2, y: 1 }, baseOffset: 2.5, height: 1 }) });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: LV0, name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  s.exec({ type: 'upsertColorScheme', scheme: { id: 'sc1', name: 'Por categoria', by: 'category' } });
  s.exec({ type: 'addAreaPlan', plan: plan(AP, { schemeId: 'sc1' }) });
  s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'dn', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
  if (opcoes.proprias) s.exec({ type: 'addText', levelId: LV0, planId: AP, text: { id: 'tp', at: { x: 1, y: 1 }, text: 'Própria', height: 2.5, rotation: 0 } });
  return s.project;
}

describe('leitura de planta de área pelo id da vista', () => {
  it.each([false, true])('legenda e tabela por vista igualam as por AreaPlan (anotações próprias: %s)', (proprias) => {
    const p = montar({ proprias });
    const ap = p.areaPlans!.find((x) => x.id === AP)!;
    expect(areaLegendRowsOfView(p, AP).length).toBeGreaterThan(0);
    expect(areaLegendRowsOfView(p, AP)).toEqual(areaLegendRows(p, ap));
    expect(areaTableRowsOfView(p, AP).filter((r) => r.kind === 'room')).toHaveLength(1);
    expect(areaTableRowsOfView(p, AP)).toEqual(areaTableRows(p, ap));
    expect(schemeOfView(p, AP)).toEqual(schemeOf(p, ap));
  });

  it('o quadro geral continua somando cada planta de área, com subtotal e total', () => {
    const p = montar();
    const rows = areaTableAllRows(p);
    expect(rows.map((r) => r.kind)).toEqual(['room', 'subtotal', 'total']);
    const sala = areaTableRows(p, p.areaPlans![0]!).find((r) => r.kind === 'room')!;
    expect(rows[0]).toEqual({ ...sala, percent: 100 });
    expect(rows[2]!.area).toBeCloseTo(sala.area, 9);
  });

  it('vista que não é de área, ou que não existe, não tem legenda nem tabela', () => {
    const p = montar();
    expect(areaTableRowsOfView(p, floorViewId(LV0))).toEqual([]);
    expect(areaLegendRowsOfView(p, roofViewId(LV0))).toEqual([]);
    expect(areaTableRowsOfView(p, 'nao')).toEqual([]);
    expect(schemeOfView(p, floorViewId(LV0))).toBeNull();
  });
});

describe('avisos de intervalo pelo id da vista', () => {
  it.each([false, true])('planta de piso e planta de área: igual a viewRangeWarnings com o intervalo do nível (próprias: %s)', (proprias) => {
    const p = montar({ proprias });
    const esperado = viewRangeWarnings(p, LV0, p.levels[0]!.viewRange);
    expect(esperado.length).toBeGreaterThan(0);
    expect(viewRangeWarningsOfView(p, floorViewId(LV0))).toEqual(esperado);
    expect(viewRangeWarningsOfView(p, AP)).toEqual(esperado);
  });

  it('cobertura usa o intervalo padrão; vista inexistente não avisa', () => {
    const p = montar();
    expect(viewRangeWarningsOfView(p, roofViewId(LV0))).toEqual(viewRangeWarnings(p, LV0, DEFAULT_VIEW_RANGE));
    expect(viewRangeWarningsOfView(p, 'nao')).toEqual([]);
  });
});

describe('assinaturas: geometria separada de vista', () => {
  const comNivel = (p: Project, patch: object): Project => ({ ...p, levels: p.levels.map((l, i) => (i === 0 ? { ...l, ...patch } : l)) });
  const texto = { id: 'tx', at: { x: 0, y: 0 }, text: 'x', height: 2.5, rotation: 0 };

  it('assinaturasDoProjeto.global continua misturando vista (valor existente preservado)', () => {
    const p = montar();
    expect(assinaturasDoProjeto(comNivel(p, { texts: [texto] })).global).not.toBe(assinaturasDoProjeto(p).global);
    expect(assinaturasDoProjeto(comNivel(p, { hidden: { categories: ['wall'] } })).global).not.toBe(assinaturasDoProjeto(p).global);
  });

  it('assinaturaGeometriaGlobal ignora intervalo, gráficos, ocultos e anotações; reage a cota e separador', () => {
    const p = montar();
    const base = assinaturaGeometriaGlobal(p);
    expect(assinaturaGeometriaGlobal(montar())).toBe(base);
    expect(assinaturaGeometriaGlobal(comNivel(p, { viewRange: { ...DEFAULT_VIEW_RANGE, cut: 1.0 } }))).toBe(base);
    expect(assinaturaGeometriaGlobal(comNivel(p, { hidden: { categories: ['wall'] }, roofHidden: { categories: ['roof'] } }))).toBe(base);
    expect(assinaturaGeometriaGlobal(comNivel(p, { dimensions: [], texts: [texto] }))).toBe(base);
    expect(assinaturaGeometriaGlobal(comNivel(p, { elevation: p.levels[0]!.elevation + 0.5 }))).not.toBe(base);
    expect(assinaturaGeometriaGlobal(comNivel(p, { roomSeparators: [{ id: 'sp', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }] }))).not.toBe(base);
  });

  it('assinaturaDeVista reage ao que a vista desenha, não ao modelo nem ao nome', () => {
    const p = montar();
    const piso = floorViewId(LV0);
    const base = assinaturaDeVista(p, piso);
    expect(assinaturaDeVista(montar(), piso)).toBe(base);
    expect(assinaturaDeVista(comNivel(p, { name: 'Outro' }), piso)).toBe(base);
    expect(assinaturaDeVista(comNivel(p, { viewRange: { ...DEFAULT_VIEW_RANGE, cut: 1.0 } }), piso)).not.toBe(base);
    expect(assinaturaDeVista(comNivel(p, { hidden: { categories: ['wall'] } }), piso)).not.toBe(base);
    expect(assinaturaDeVista(comNivel(p, { texts: [texto] }), piso)).not.toBe(base);
    expect(assinaturaDeVista(p, 'nao')).toBe('-');
  });

  it('planta de área: herda a anotação do nível; com anotação própria só a própria conta', () => {
    const p = montar();
    const proprias = montar({ proprias: true });
    expect(assinaturaDeVista(p, AP)).not.toBe(assinaturaDeVista(proprias, AP));
    expect(assinaturaDeVista(comNivel(proprias, { dimensions: [] }), AP)).toBe(assinaturaDeVista(proprias, AP));
    expect(assinaturaDeVista(comNivel(p, { dimensions: [] }), AP)).not.toBe(assinaturaDeVista(p, AP));
  });
});
