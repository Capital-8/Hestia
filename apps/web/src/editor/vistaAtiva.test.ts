import { describe, expect, it } from 'vitest';
import { createEmptyProject, DEFAULT_AREA_GRAPHICS, ProjectStore, toolAllowedInView, type AreaPlan } from '@hestia/model';
import { TOOL_GROUPS, type ToolId } from '@hestia/tools';
import { AREA_PLAN_TOOLS } from './controller.ts';
import { areaViewIdDeFundo, camposDeNivel, nivelAtivo, patchParaAtivarVista, planViewIdAtivo, planViewIdDe, planViewIdDeFundo, tipoDeVistaAtivo, type CamposDaVista } from './vistaAtiva.ts';

const campos = (over: Partial<CamposDaVista>): CamposDaVista => ({ view: 'plan', levelId: 'lv_0', planKind: 'floor', areaPlanId: null, ...over });

describe('permissão de ferramenta por tipo de vista', () => {
  // Todos os ids que a interface conhece (grupos da faixa) mais os que ficam fora dela.
  const ids: string[] = [...new Set<string>([...TOOL_GROUPS.flatMap((g) => g.tools), 'select', 'perimeter', 'paste', 'section', 'grid', 'roomsep', 'angularDimension', 'measure', 'inexistente'])];

  it('a planta de área é igual a AREA_PLAN_TOOLS para todo id de ferramenta', () => {
    for (const id of ids) expect(toolAllowedInView('area', id), id).toBe((AREA_PLAN_TOOLS as readonly string[]).includes(id as ToolId));
  });

  it('piso e cobertura aceitam todas (a cobertura não tem restrição hoje)', () => {
    for (const id of ids) {
      expect(toolAllowedInView('floor', id)).toBe(true);
      expect(toolAllowedInView('roof', id)).toBe(true);
    }
  });
});

describe('seletores da vista ativa', () => {
  it('piso', () => {
    const ui = campos({ levelId: 'lv_1' });
    expect(planViewIdAtivo(ui)).toBe('pv_lv_1');
    expect(tipoDeVistaAtivo(ui)).toBe('floor');
    expect(nivelAtivo(ui)).toBe('lv_1');
  });

  it('cobertura', () => {
    const ui = campos({ planKind: 'roof' });
    expect(planViewIdAtivo(ui)).toBe('pvr_lv_0');
    expect(tipoDeVistaAtivo(ui)).toBe('roof');
  });

  it('área: o id da planta; sem areaPlanId não há vista', () => {
    const ui = campos({ planKind: 'area', areaPlanId: 'ap1' });
    expect(planViewIdAtivo(ui)).toBe('ap1');
    expect(tipoDeVistaAtivo(ui)).toBe('area');
    expect(planViewIdAtivo(campos({ planKind: 'area', areaPlanId: null }))).toBeNull();
    expect(tipoDeVistaAtivo(campos({ planKind: 'area', areaPlanId: null }))).toBeNull();
  });

  it('3D, corte e prancha: nenhuma vista de planta ativa, mas a de fundo continua', () => {
    for (const view of ['3d', 'section', 'sheet'] as const) {
      const ui = campos({ view, planKind: 'roof' });
      expect(planViewIdAtivo(ui)).toBeNull();
      expect(tipoDeVistaAtivo(ui)).toBeNull();
      expect(planViewIdDeFundo(ui)).toBe('pvr_lv_0');
      expect(nivelAtivo(ui)).toBe('lv_0');
    }
    expect(planViewIdDeFundo(campos({ view: '3d', planKind: 'area', areaPlanId: 'ap1' }))).toBe('ap1');
  });
});

describe('patchParaAtivarVista (inverso)', () => {
  const s = new ProjectStore(createEmptyProject());
  const plan: AreaPlan = { id: 'ap1', name: 'A', levelId: 'lv_1', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS }, tags: [] };
  s.exec({ type: 'addAreaPlan', plan });
  const p = s.project;

  it('piso, cobertura e área', () => {
    expect(patchParaAtivarVista(p, 'pv_lv_1')).toEqual({ view: 'plan', levelId: 'lv_1', planKind: 'floor', planViewId: 'pv_lv_1' });
    expect(patchParaAtivarVista(p, 'pvr_lv_0')).toEqual({ view: 'plan', levelId: 'lv_0', planKind: 'roof', planViewId: 'pvr_lv_0' });
    expect(patchParaAtivarVista(p, 'ap1')).toEqual({ view: 'plan', levelId: 'lv_1', planKind: 'area', planViewId: 'ap1' });
  });

  it('id inexistente: null', () => {
    expect(patchParaAtivarVista(p, 'nada')).toBeNull();
  });

  it('ida e volta: o patch ativa a vista pedida', () => {
    for (const id of ['pv_lv_0', 'pvr_lv_1', 'ap1']) {
      const patch = patchParaAtivarVista(p, id)!;
      expect(planViewIdAtivo(patch)).toBe(id);
    }
  });
});

describe('estado com planViewId (forma única) e estado no formato antigo', () => {
  it('planViewId manda; sem ele, a vista sai de levelId/planKind/areaPlanId', () => {
    expect(planViewIdAtivo({ view: 'plan', levelId: 'lv_0', planKind: 'area', planViewId: 'ap1' })).toBe('ap1');
    expect(planViewIdAtivo({ view: 'plan', levelId: 'lv_0', planKind: 'roof', planViewId: 'pvr_lv_0' })).toBe('pvr_lv_0');
    // Formato antigo (sessão antiga, harness do ouro): mesmos ids.
    expect(planViewIdAtivo({ view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: 'ap1' })).toBe('ap1');
    expect(planViewIdAtivo({ view: 'plan', levelId: 'lv_0', planKind: 'roof' })).toBe('pvr_lv_0');
    expect(planViewIdAtivo({ view: 'plan', levelId: 'lv_0', planKind: 'floor' })).toBe('pv_lv_0');
  });

  it('camposDeNivel: piso e cobertura acompanham o novo nível; área não muda de planta', () => {
    expect(camposDeNivel({ planKind: 'floor', planViewId: 'pv_lv_0' }, 'lv_1')).toEqual({ levelId: 'lv_1', planViewId: 'pv_lv_1' });
    expect(camposDeNivel({ planKind: 'roof', planViewId: 'pvr_lv_0' }, 'lv_1')).toEqual({ levelId: 'lv_1', planViewId: 'pvr_lv_1' });
    expect(camposDeNivel({ planKind: 'area', planViewId: 'ap1' }, 'lv_1')).toEqual({ levelId: 'lv_1', planViewId: 'ap1' });
  });

  it('planViewIdDe: nível + tipo (+ área) para o id da vista', () => {
    expect(planViewIdDe('lv_2', 'floor')).toBe('pv_lv_2');
    expect(planViewIdDe('lv_2', 'roof')).toBe('pvr_lv_2');
    expect(planViewIdDe('lv_2', 'area', 'ap9')).toBe('ap9');
  });

  it('areaViewIdDeFundo: só quando a planta de fundo é de área', () => {
    expect(areaViewIdDeFundo({ levelId: 'lv_0', planKind: 'area', planViewId: 'ap1' })).toBe('ap1');
    expect(areaViewIdDeFundo({ levelId: 'lv_0', planKind: 'floor', planViewId: 'pv_lv_0' })).toBeNull();
  });
});
