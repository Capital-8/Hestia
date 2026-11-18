import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLot, ladosPadrao, makeTerrain, makeTerrainRegion } from '@hestia/model';
import type { CurvaNivelTN, LinhaCorteTN, LinhaPlantaTN, SectionResult } from '@hestia/engine';
import { dxfGeometryOf } from './dxfExport.ts';
import { terrenoCorteDxfOf, terrenoPlantaDxfOf } from './dxfTerreno.ts';

const curvas: CurvaNivelTN[] = [
  { terrenoId: 'tn1', z: 10.5, mestra: false, fechada: true, pontos: [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 9 }, { x: 1, y: 9 }] },
  { terrenoId: 'tn1', z: 11, mestra: true, fechada: false, pontos: [{ x: 0, y: 5 }, { x: 10, y: 5 }] },
];
const borda: LinhaPlantaTN[] = [{ terrenoId: 'tn1', fechada: true, pontos: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }];
const falso = { curvas: () => curvas, planta: () => borda, corte: () => null };

function projeto(cotaZero?: number) {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: 'lv_0', name: 'T' }) });
  s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'rg1', levelId: 'lv_0', terrenoId: 'tn1', name: 'R', contorno: [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 6 }, { x: 2, y: 6 }], papel: 'plataforma', cota: 9 }) });
  s.exec({ type: 'addLot', lot: makeLot({ id: 'lt1', levelId: 'lv_0', contorno: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 30 }, { x: 0, y: 30 }], lados: ladosPadrao(4).map((l) => ({ ...l, recuo: 2 })) }) } as never);
  if (cotaZero !== undefined) s.exec({ type: 'setLocalizacao', localizacao: { origemE: 0, origemN: 0, cotaZero, norteVerdadeiro: 0 } });
  return s.project;
}

describe('terrenoPlantaDxfOf', () => {
  it('curvas com a elevação da cota (sem localização), mestra em camada própria, borda, região, lote e área edificável', () => {
    const t = terrenoPlantaDxfOf(projeto(), 'lv_0', { site: true, lot: true }, new Set(), falso);
    const camada = (n: string) => t.filter((x) => x.layer === n);
    expect(camada('TERRENO_CURVAS').map((x) => x.elevation)).toEqual([10.5]);
    expect(camada('TERRENO_CURVAS_MESTRAS').map((x) => [x.elevation, x.closed])).toEqual([[11, false]]);
    expect(camada('TERRENO_CURVAS')[0]!.pts).toHaveLength(4);
    expect(camada('TERRENO_BORDA')).toHaveLength(1);
    expect(camada('TERRENO_BORDA')[0]!.elevation).toBeUndefined();
    expect(camada('TERRENO_REGIAO')).toHaveLength(1);
    expect(camada('LOTE')).toHaveLength(1);
    expect(camada('LOTE_EDIFICAVEL').length).toBeGreaterThanOrEqual(1);
    expect(camada('LOTE_EDIFICAVEL')[0]!.dashed).toBe(true);
  });

  it('a elevação é a cota exibida: z do projeto mais cotaZero', () => {
    const t = terrenoPlantaDxfOf(projeto(740), 'lv_0', { site: true, lot: false }, new Set(), falso);
    expect(t.filter((x) => x.layer.startsWith('TERRENO_CURVAS')).map((x) => x.elevation)).toEqual([750.5, 751]);
    expect(t.some((x) => x.layer.startsWith('LOTE'))).toBe(false);
  });

  it('categoria site desligada: só o lote; lot desligada: só o terreno; ocultos não saem', () => {
    const p = projeto();
    expect(terrenoPlantaDxfOf(p, 'lv_0', { site: false, lot: true }, new Set(), falso).every((x) => x.layer.startsWith('LOTE'))).toBe(true);
    expect(terrenoPlantaDxfOf(p, 'lv_0', { site: true, lot: false }, new Set(['tn1']), falso)).toEqual([]);
  });

  it('sem kernel (curvas e borda nulas) saem só região e lote, sem falhar', () => {
    const t = terrenoPlantaDxfOf(projeto(), 'lv_0', { site: true, lot: true }, new Set(), { curvas: () => null, planta: () => null, corte: () => null });
    expect(t.map((x) => x.layer).sort()).toEqual(['LOTE', 'LOTE_EDIFICAVEL', 'TERRENO_REGIAO']);
    expect(t.some((x) => x.layer.startsWith('TERRENO_CURVAS'))).toBe(false);
  });

  it('outro nível: nada', () => {
    expect(terrenoPlantaDxfOf(projeto(), 'lv_9', { site: true, lot: true }, new Set(), { ...falso, curvas: () => [], planta: () => [] })).toEqual([]);
  });
});

describe('terrenoCorteDxfOf', () => {
  const linhas: LinhaCorteTN[] = [
    { terrenoId: 'tn1', papel: 'silhueta', fechada: false, pontos: [{ s: 0, z: 9 }, { s: 5, z: 9 }] },
    { terrenoId: 'tn1', papel: 'perfilExistente', fechada: false, pontos: [{ s: 0, z: 10 }, { s: 5, z: 10.5 }] },
    { terrenoId: 'tn1', papel: 'cortado', fechada: true, pontos: [{ s: 0, z: 10 }, { s: 5, z: 10 }, { s: 5, z: 7 }, { s: 0, z: 7 }] },
    { terrenoId: 'tn2', papel: 'silhueta', fechada: false, pontos: [{ s: 0, z: 1 }] },
  ];
  const secao = { length: 5, zMin: 0, zMax: 12, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [], plano: { a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, depth: 5 } } as unknown as SectionResult;
  const fonte = (corte: unknown) => ({ curvas: () => [], planta: () => [], corte: corte as never });

  it('solo cortado fechado, perfil existente tracejado e silhueta aberta; linha de 1 ponto e ocultos saem', () => {
    const r = terrenoCorteDxfOf(createEmptyProject(), secao, true, new Set(), fonte(() => linhas))!;
    expect(r).toHaveLength(3);
    expect(r.map((x) => [x.closed, x.dashed === true])).toEqual([[false, false], [false, true], [true, false]]);
    expect(r[2]!.pts[0]).toEqual({ x: 0, y: 10 });
    expect(terrenoCorteDxfOf(createEmptyProject(), secao, true, new Set(['tn1']), fonte(() => linhas))).toBeUndefined();
  });

  it('categoria oculta, kernel sem resposta ou seção sem plano: undefined', () => {
    expect(terrenoCorteDxfOf(createEmptyProject(), secao, false, new Set(), fonte(() => linhas))).toBeUndefined();
    expect(terrenoCorteDxfOf(createEmptyProject(), secao, true, new Set(), fonte(() => null))).toBeUndefined();
    expect(terrenoCorteDxfOf(createEmptyProject(), { ...secao, plano: undefined } as unknown as SectionResult, true, new Set(), fonte(() => linhas))).toBeUndefined();
  });
});

describe('dxfGeometryOf com terreno', () => {
  it('sem kernel o terreno não derruba a geometria; lote e região entram', () => {
    const geo = dxfGeometryOf(projeto(), 'lv_0');
    const camadas = new Set((geo.terreno ?? []).map((x) => x.layer));
    expect(camadas.has('LOTE')).toBe(true);
    expect(camadas.has('TERRENO_REGIAO')).toBe(true);
    expect([...camadas].some((c) => c.startsWith('TERRENO_CURVAS'))).toBe(false);
    expect(geo.layerStyles?.['LOTE']?.color).toBe(1);
  });
});
