import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, DEFAULT_VIEW_RANGE, ProjectStore, projetoComCoberturaDeTeste, floorViewId, makeRoom, makeWall, legacyRoofViewId as roofViewId, type AreaPlan, type Project, planViewRangeOf, withViewPatchOfTest } from '@hestia/model';
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
import { areaPlansOf } from '@hestia/model';

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
  const s = new ProjectStore(projetoComCoberturaDeTeste());
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
    const ap = areaPlansOf(p).find((x) => x.id === AP)!;
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
    const sala = areaTableRows(p, areaPlansOf(p)[0]!).find((r) => r.kind === 'room')!;
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
    const esperado = viewRangeWarnings(p, LV0, planViewRangeOf(p, floorViewId(LV0)));
    expect(esperado.length).toBeGreaterThan(0);
    expect(viewRangeWarningsOfView(p, floorViewId(LV0))).toEqual(esperado);
    expect(viewRangeWarningsOfView(p, AP)).toEqual(esperado);
  });

  it('cobertura migrada usa a faixa dela (planta comum); vista inexistente não avisa', () => {
    const p = montar();
    expect(viewRangeWarningsOfView(p, roofViewId(LV0))).toEqual(viewRangeWarnings(p, LV0, planViewRangeOf(p, roofViewId(LV0))));
    expect(viewRangeWarningsOfView(p, 'nao')).toEqual([]);
  });
});

describe('assinaturas: geometria separada de vista', () => {
  const comNivel = (p: Project, patch: object): Project => ({ ...p, levels: p.levels.map((l, i) => (i === 0 ? { ...l, ...patch } : l)) });
  const texto = { id: 'tx', at: { x: 0, y: 0 }, text: 'x', height: 2.5, rotation: 0 };
  const cota = { id: 'dn2', a: { x: 0, y: 1 }, b: { x: 4, y: 1 }, offset: 1 };
  const piso = floorViewId(LV0);

  it('planViews fica fora do global (e das chaves por nível e do corte): editar cota, texto, ocultos e intervalo não muda nada', () => {
    const p = montar();
    const base = assinaturasDoProjeto(p);
    const novos = [
      withViewPatchOfTest(p, piso, { annotations: { dimensions: [cota] } }),
      withViewPatchOfTest(p, piso, { annotations: { texts: [texto] } }),
      withViewPatchOfTest(p, piso, { hidden: { categories: ['wall'] } }),
      withViewPatchOfTest(p, roofViewId(LV0), { hidden: { categories: ['roof'] } }),
      withViewPatchOfTest(p, piso, { viewRange: { ...DEFAULT_VIEW_RANGE, cut: 1.0 } }),
      withViewPatchOfTest(p, AP, { annotations: { texts: [texto] } }),
    ].map((q) => assinaturasDoProjeto(q));
    for (const a of novos) {
      expect(a.global).toBe(base.global);
      expect(a.horizontais).toBe(base.horizontais);
      expect([...a.nivel]).toEqual([...base.nivel]);
      expect(a.ordem).toEqual(base.ordem);
    }
  });

  it('o global continua mudando com o que muda geometria (cota do nível, nome, separador, elemento sem nível)', () => {
    const p = montar();
    const base = assinaturasDoProjeto(p).global;
    expect(assinaturasDoProjeto(comNivel(p, { elevation: p.levels[0]!.elevation + 0.5 })).global).not.toBe(base);
    expect(assinaturasDoProjeto(comNivel(p, { name: 'Outro' })).global).not.toBe(base);
    expect(assinaturasDoProjeto(comNivel(p, { roomSeparators: [{ id: 'sp', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }] })).global).not.toBe(base);
    expect(assinaturasDoProjeto({ ...p, settings: { ...p.settings, showTags: !p.settings.showTags } }).global).not.toBe(base);
  });

  it('assinaturaGeometriaGlobal ignora o que é de vista; reage a cota, nome e separador', () => {
    const p = montar();
    const base = assinaturaGeometriaGlobal(p);
    expect(assinaturaGeometriaGlobal(montar())).toBe(base);
    expect(assinaturaGeometriaGlobal(withViewPatchOfTest(p, piso, { viewRange: { ...DEFAULT_VIEW_RANGE, cut: 1.0 } }))).toBe(base);
    expect(assinaturaGeometriaGlobal(withViewPatchOfTest(p, piso, { hidden: { categories: ['wall'] } }))).toBe(base);
    expect(assinaturaGeometriaGlobal(withViewPatchOfTest(p, piso, { annotations: { texts: [texto] } }))).toBe(base);
    expect(assinaturaGeometriaGlobal(comNivel(p, { elevation: p.levels[0]!.elevation + 0.5 }))).not.toBe(base);
    expect(assinaturaGeometriaGlobal(comNivel(p, { roomSeparators: [{ id: 'sp', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }] }))).not.toBe(base);
  });

  it('assinaturaDeVista reage ao que a vista desenha, não ao modelo nem ao nome do nível', () => {
    const p = montar();
    const base = assinaturaDeVista(p, piso);
    expect(assinaturaDeVista(montar(), piso)).toBe(base);
    expect(assinaturaDeVista(comNivel(p, { name: 'Outro' }), piso)).toBe(base);
    expect(assinaturaDeVista(withViewPatchOfTest(p, piso, { viewRange: { ...DEFAULT_VIEW_RANGE, cut: 1.0 } }), piso)).not.toBe(base);
    expect(assinaturaDeVista(withViewPatchOfTest(p, piso, { hidden: { categories: ['wall'] } }), piso)).not.toBe(base);
    expect(assinaturaDeVista(withViewPatchOfTest(p, piso, { annotations: { texts: [texto] } }), piso)).not.toBe(base);
    expect(assinaturaDeVista(p, 'nao')).toBe('-');
  });

  it('planta de área: anotação própria da vista conta; a do piso do mesmo nível não (cada vista tem a sua)', () => {
    const p = montar();
    const proprias = montar({ proprias: true });
    expect(assinaturaDeVista(p, AP)).not.toBe(assinaturaDeVista(proprias, AP));
    // A área guarda as dela: mexer na anotação do PISO não muda a assinatura da área; mexer na da área muda.
    expect(assinaturaDeVista(withViewPatchOfTest(p, piso, { annotations: { dimensions: [] } }), AP)).toBe(assinaturaDeVista(p, AP));
    expect(assinaturaDeVista(withViewPatchOfTest(p, AP, { annotations: { dimensions: [cota] } }), AP)).not.toBe(assinaturaDeVista(p, AP));
  });
});
