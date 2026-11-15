import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirMapaCorteAterro, projetoTerreno, resolveLevel, servicoTerreno, type MapaCorteAterroTN } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { ALFA_MAPA, COR_ATERRO, COR_CORTE, mapaCorteAterroOps } from './terrenoMapa.ts';
import { LIGHT } from './types.ts';

function entrada(p: Project, levelId: Id): PlanInput {
  return {
    project: p, levelId, resolved: resolveLevel(p, levelId, new Map()), below: null, viewport: { cx: 10, cy: 10, zoom: 20, width: 800, height: 600 },
    theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false,
  };
}

/** Triângulos de teste: dois de corte (T5) ou dois de aterro (T7), 6 números por triângulo. */
const triangulos = (terrenoId: Id, tipo: 'corte' | 'aterro'): MapaCorteAterroTN[] => [
  { terrenoId, tipo, pontos: [5, 5, 15, 5, 15, 15, 5, 5, 15, 15, 5, 15] },
];
const cores = (p: Project): string[] => buildPlanGeometry(entrada(p, 'lv_0')).fills.map((f) => f.color);

afterEach(() => {
  vi.restoreAllMocks();
  definirMapaCorteAterro(false);
});

describe('mapa de corte e aterro na planta', () => {
  it('T5 (corte): só vermelho translúcido, um polígono por triângulo, e nenhum azul', () => {
    const p = projetoTerreno('T5');
    vi.spyOn(servicoTerreno(), 'mapaCorteAterro').mockReturnValue(triangulos('tn_t5', 'corte'));
    definirMapaCorteAterro(true);
    const fills = buildPlanGeometry(entrada(p, 'lv_0')).fills;
    const vermelhos = fills.filter((f) => f.color === COR_CORTE);
    expect(vermelhos).toHaveLength(1);
    expect(vermelhos[0]!.polygons).toHaveLength(2);
    expect(vermelhos[0]!.alpha).toBe(ALFA_MAPA);
    expect(vermelhos[0]!.polygons[0]![0]).toHaveLength(3);
    expect(fills.filter((f) => f.color === COR_ATERRO)).toHaveLength(0);
  });

  it('T7 (aterro): só azul translúcido e nenhum vermelho', () => {
    const p = projetoTerreno('T7');
    vi.spyOn(servicoTerreno(), 'mapaCorteAterro').mockReturnValue(triangulos('tn_t7', 'aterro'));
    definirMapaCorteAterro(true);
    const c = cores(p);
    expect(c.filter((x) => x === COR_ATERRO)).toHaveLength(1);
    expect(c.filter((x) => x === COR_CORTE)).toHaveLength(0);
  });

  it('mapa desligado: nenhuma consulta ao kernel para o mapa e nenhum preenchimento do mapa', () => {
    const p = projetoTerreno('T5');
    const spy = vi.spyOn(servicoTerreno(), 'mapaCorteAterro').mockReturnValue(triangulos('tn_t5', 'corte'));
    const c = cores(p);
    expect(spy).not.toHaveBeenCalled();
    expect(c).not.toContain(COR_CORTE);
    expect(c).not.toContain(COR_ATERRO);
  });

  it('mapa ligado consulta o kernel do nível do terreno uma vez', () => {
    const p = projetoTerreno('T5');
    const spy = vi.spyOn(servicoTerreno(), 'mapaCorteAterro').mockReturnValue([]);
    definirMapaCorteAterro(true);
    cores(p);
    expect(spy).toHaveBeenCalledWith(p, 'lv_0');
  });

  it('sem kernel (null): sem preenchimento e sem exceção', () => {
    const p = projetoTerreno('T5');
    vi.spyOn(servicoTerreno(), 'mapaCorteAterro').mockReturnValue(null);
    definirMapaCorteAterro(true);
    expect(() => cores(p)).not.toThrow();
    expect(cores(p)).not.toContain(COR_CORTE);
  });

  it('terreno oculto não é pintado; grupos vazios ou de terreno desconhecido não geram preenchimento', () => {
    const g = triangulos('tn_t5', 'corte');
    expect(mapaCorteAterroOps(g, new Set()).fills).toEqual([]);
    expect(mapaCorteAterroOps(null, new Set(['tn_t5'])).fills).toEqual([]);
    expect(mapaCorteAterroOps([{ terrenoId: 'tn_t5', tipo: 'corte', pontos: [] }], new Set(['tn_t5'])).fills).toEqual([]);
    expect(mapaCorteAterroOps([...g, ...triangulos('tn_t5', 'aterro')], new Set(['tn_t5'])).fills.map((f) => f.color)).toEqual([COR_CORTE, COR_ATERRO]);
  });

  it('terreno oculto na vista: o mapa dele some', () => {
    const p = projetoTerreno('T5');
    vi.spyOn(servicoTerreno(), 'mapaCorteAterro').mockReturnValue(triangulos('tn_t5', 'corte'));
    definirMapaCorteAterro(true);
    const g = buildPlanGeometry({ ...entrada(p, 'lv_0'), hidden: new Set(['tn_t5']) });
    expect(g.fills.map((f) => f.color)).not.toContain(COR_CORTE);
  });
});
