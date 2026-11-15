import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { DEFAULT_VIEW_GRAPHICS, ProjectStore, createEmptyProject, levelGraphicsOf, makeLot, type Id } from '@hestia/model';
import { componentSnapIndex, DEFAULT_SNAP, infer, pickTerrenoAt } from '@hestia/tools';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { ocultosDoSitio } from './viewVisibility.ts';

const lote = () => makeLot({ id: 'lt1', levelId: 'lv_0', contorno: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], lados: [0, 1, 2, 3].map(() => ({ papel: 'lateral' as const, recuo: 0 })) });

function projetoComSitio() {
  const s = new ProjectStore(createEmptyProject());
  adicionarFixtureTerreno(s, 'T5');
  s.exec({ type: 'addLot', lot: lote() });
  return s.project;
}

const graficos = (p: ReturnType<typeof projetoComSitio>, site: boolean, lot: boolean) => {
  const g = levelGraphicsOf(p, 'lv_0');
  return { overrides: { ...g.overrides, site: { ...g.overrides.site, visible: site }, lot: { ...g.overrides.lot, visible: lot } } };
};

describe('visibilidade do terreno e do lote na seleção e na captura', () => {
  const nada = () => new Set<Id>();

  it('com as categorias visíveis e nada oculto na vista, devolve o próprio conjunto de base', () => {
    const p = projetoComSitio();
    const base = new Set<Id>(['w1']);
    expect(ocultosDoSitio(p, base, graficos(p, true, true), nada)).toBe(base);
  });

  it('categoria site desligada oculta o terreno e a região, mas não o lote', () => {
    const p = projetoComSitio();
    const r = ocultosDoSitio(p, new Set<Id>(), graficos(p, false, true), nada);
    expect([...r].sort()).toEqual(['rg_t5', 'tn_t5']);
  });

  it('categoria lot desligada oculta só o lote; a base é preservada', () => {
    const p = projetoComSitio();
    const r = ocultosDoSitio(p, new Set<Id>(['w1']), graficos(p, true, false), nada);
    expect([...r].sort()).toEqual(['lt1', 'w1']);
  });

  it('Hide in View e o temporário (conjunto da vista) ocultam só o elemento escondido', () => {
    const p = projetoComSitio();
    const r = ocultosDoSitio(p, new Set<Id>(), graficos(p, true, true), () => new Set<Id>(['rg_t5', 'w9']));
    expect([...r]).toEqual(['rg_t5']);
  });

  it('projeto sem terreno nem lote não lê a vista (não paga o custo) e devolve a base', () => {
    const p = createEmptyProject();
    const base = new Set<Id>();
    let leu = false;
    expect(ocultosDoSitio(p, base, { overrides: DEFAULT_VIEW_GRAPHICS.overrides }, () => { leu = true; return new Set<Id>(); })).toBe(base);
    expect(leu).toBe(false);
  });

  it('oculto não é selecionável: o pick do terreno ignora o conjunto de ocultos', () => {
    const p = projetoComSitio();
    const ponto = { x: 10, y: 5.03 };
    expect(pickTerrenoAt(p, 'lv_0', ponto, 0.1)).not.toBeNull();
    const ocultos = ocultosDoSitio(p, new Set<Id>(), graficos(p, false, true), nada);
    expect(pickTerrenoAt(p, 'lv_0', ponto, 0.1, ocultos)).toBeNull();
  });

  it('o editor entrega às ferramentas os ocultos da planta com o terreno, quando a categoria site está desligada no nível', () => {
    const p0 = projetoComSitio();
    const s = new ProjectStore(p0);
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { site: { visible: false } } } });
    editor.load(s.project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'floor' });
    expect([...editor.ocultosDaPlanta()].sort()).toEqual(expect.arrayContaining(['rg_t5', 'tn_t5']));
    expect(editor.ocultosDaPlanta().has('lt1')).toBe(false);
  });

  it('oculto não dá snap: o vértice da borda do terreno só captura quando ele não está nos ocultos', () => {
    const p = projetoComSitio();
    const ctx = (hiddenIds?: ReadonlySet<Id>) => ({
      project: p, levelId: 'lv_0', mpp: 0.01, gridStep: 0, snap: { ...DEFAULT_SNAP, grid: false }, noGrid: true, indexed: [componentSnapIndex(p, 'lv_0')], ...(hiddenIds ? { hiddenIds } : {}),
    });
    // Vértice do contorno da região T5 em (5, 5).
    const visivel = infer({ x: 5.01, y: 5.01 }, ctx());
    expect(visivel.kind).toBe('endpoint');
    expect(visivel.point).toEqual({ x: 5, y: 5 });
    const ocultos = ocultosDoSitio(p, new Set<Id>(), graficos(p, false, true), nada);
    const oculto = infer({ x: 5.01, y: 5.01 }, ctx(ocultos));
    expect(oculto.point).toEqual({ x: 5.01, y: 5.01 });
  });
});
