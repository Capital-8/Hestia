import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { t } from './i18n.ts';
import { makeTerrain, makeTerrainRegion } from './terrain.ts';
import { TERRENO_LIMITES as L, type CurvaTerreno, type Terrain, type TerrainRegion } from './terrainTypes.ts';
import { anelTerrenoSimples, areaAnelComSinal, terrainIssue, terrainRegionIssue } from './validateTerrain.ts';
import type { Project } from './types.ts';

const terreno = (p: Partial<Terrain> = {}): Terrain => ({ ...makeTerrain({ id: 'tn1', levelId: 'lv_0', ...p }), order: 0 });
const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }];
const regiao = (p: Partial<TerrainRegion> = {}): TerrainRegion => ({ ...makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri, ...p }), order: 0 });
/** Projeto com um terreno 'tn1' e as regiões pedidas já dentro dele. */
function projeto(regioes: TerrainRegion[] = []): Project {
  const p = createEmptyProject();
  p.elements['tn1'] = terreno();
  for (const r of regioes) p.elements[r.id] = r;
  return p;
}
const msg = (k: Parameters<typeof t>[1], params?: Record<string, string | number>): string => t('pt', k, params);

describe('terrainIssue (A.3 item 6)', () => {
  it('terreno vazio e com menos de 3 vértices é aceito (estado durante a criação)', () => {
    expect(terrainIssue(terreno())).toBeNull();
    expect(terrainIssue(terreno({ pontos: [0, 0, 1, 5, 5, 2] }))).toBeNull();
  });

  it('terreno completo e válido passa', () => {
    const tn = terreno({
      pontos: [0, 0, 1, 10, 0, 2, 5, 8, 3],
      curvas: [{ z: 2, xy: [0, 0, 5, 5], fechada: false }],
      quebras: [{ xyz: [0, 0, 1, 5, 5, 2] }],
      borda: [0, 0, 10, 0, 5, 8],
      linhasRotulo: [0, 0, 5, 5],
      pontosCotados: [1, 1],
    });
    expect(terrainIssue(tn)).toBeNull();
  });

  it('número não finito', () => {
    expect(terrainIssue(terreno({ pontos: [Number.NaN, 0, 0] }))).toBe(msg('md_tn_numero'));
    expect(terrainIssue(terreno({ pontos: [0, Number.POSITIVE_INFINITY, 0] }))).toBe(msg('md_tn_numero'));
    expect(terrainIssue(terreno({ curvas: [{ z: Number.NaN, xy: [0, 0, 1, 1], fechada: false }] }))).toBe(msg('md_tn_cota', { max: L.cotaMax }));
  });

  it('|x| e |y| acima de coordMax; |z| acima de cotaMax', () => {
    expect(terrainIssue(terreno({ pontos: [L.coordMax + 1, 0, 0] }))).toBe(msg('md_tn_coord', { max: L.coordMax }));
    expect(terrainIssue(terreno({ pontos: [0, -L.coordMax - 1, 0] }))).toBe(msg('md_tn_coord', { max: L.coordMax }));
    expect(terrainIssue(terreno({ pontos: [L.coordMax, -L.coordMax, L.cotaMax] }))).toBeNull();
    expect(terrainIssue(terreno({ pontos: [0, 0, L.cotaMax + 1] }))).toBe(msg('md_tn_cota', { max: L.cotaMax }));
    expect(terrainIssue(terreno({ curvas: [{ z: L.cotaMax + 1, xy: [0, 0, 1, 1], fechada: false }] }))).toBe(msg('md_tn_cota', { max: L.cotaMax }));
    expect(terrainIssue(terreno({ quebras: [{ xyz: [0, 0, 0, 1, 1, -L.cotaMax - 1] }] }))).toBe(msg('md_tn_cota', { max: L.cotaMax }));
    expect(terrainIssue(terreno({ pontosCotados: [L.coordMax + 1, 0] }))).toBe(msg('md_tn_coord', { max: L.coordMax }));
  });

  it('vetores com tamanho errado (múltiplo de 3, de 2 ou de 4)', () => {
    expect(terrainIssue(terreno({ pontos: [1, 2] }))).toBe(msg('md_tn_pontos_tam'));
    expect(terrainIssue(terreno({ linhasRotulo: [0, 0, 1] }))).toBe(msg('md_tn_rotulos', { max: L.linhasRotulo }));
    expect(terrainIssue(terreno({ pontosCotados: [1] }))).toBe(msg('md_tn_cotados', { max: L.pontosCotados }));
  });

  it('curva com menos de 2 pontos ou com número ímpar de coordenadas', () => {
    expect(terrainIssue(terreno({ curvas: [{ z: 1, xy: [0, 0], fechada: false }] }))).toBe(msg('md_tn_curva_tam', { i: 1 }));
    expect(terrainIssue(terreno({ curvas: [{ z: 1, xy: [0, 0, 1, 1, 2], fechada: false }] }))).toBe(msg('md_tn_curva_tam', { i: 1 }));
  });

  it('quebra com menos de 2 pontos ou fora de trios', () => {
    expect(terrainIssue(terreno({ quebras: [{ xyz: [0, 0, 0] }] }))).toBe(msg('md_tn_quebra_tam', { i: 1 }));
    expect(terrainIssue(terreno({ quebras: [{ xyz: [0, 0, 0, 1, 1] }] }))).toBe(msg('md_tn_quebra_tam', { i: 1 }));
  });

  it('borda: 3 ou mais pontos, simples, com área e anti-horária', () => {
    expect(terrainIssue(terreno({ borda: [0, 0, 1, 1] }))).toBe(msg('md_tn_borda_pontos'));
    expect(terrainIssue(terreno({ borda: [0, 0, 4, 4, 4, 0, 0, 4] }))).toBe(msg('md_tn_borda_simples'));
    expect(terrainIssue(terreno({ borda: [0, 0, 5, 0, 10, 0] }))).toBe(msg('md_tn_borda_simples'));
    expect(terrainIssue(terreno({ borda: [0, 0, 5, 8, 10, 0] }))).toBe(msg('md_tn_borda_horario'));
  });

  it('limites de quantidade: curvas, quebras e vértices', () => {
    const curvas: CurvaTerreno[] = Array.from({ length: L.curvas + 1 }, () => ({ z: 0, xy: [0, 0, 1, 1], fechada: false }));
    expect(terrainIssue(terreno({ curvas }))).toBe(msg('md_tn_limite_curvas', { max: L.curvas }));
    const quebras = Array.from({ length: L.quebras + 1 }, () => ({ xyz: [0, 0, 0, 1, 1, 1] }));
    expect(terrainIssue(terreno({ quebras }))).toBe(msg('md_tn_limite_quebras', { max: L.quebras }));
    expect(terrainIssue(terreno({ pontos: new Array<number>((L.vertices + 1) * 3).fill(0) }))).toBe(msg('md_tn_limite_vertices', { max: L.vertices }));
    expect(terrainIssue(terreno({ pontos: new Array<number>(L.vertices * 3).fill(0) }))).toBeNull();
  });

  it('o limite de vértices soma pontos, curvas, quebras e borda', () => {
    const pontos = new Array<number>((L.vertices - 4) * 3).fill(0);
    const tn = terreno({ pontos, curvas: [{ z: 0, xy: [0, 0, 1, 1], fechada: false }], quebras: [{ xyz: [0, 0, 0, 1, 1, 1] }] });
    expect(terrainIssue(tn)).toBeNull();
    expect(terrainIssue({ ...tn, borda: [0, 0, 10, 0, 5, 8] })).toBe(msg('md_tn_limite_vertices', { max: L.vertices }));
  });

  it('intervaloCurvas, mestraCada e espessuraBase na faixa', () => {
    expect(terrainIssue(terreno({ intervaloCurvas: 0.04 }))).toBe(msg('md_tn_intervalo', { min: L.intervaloMin }));
    expect(terrainIssue(terreno({ intervaloCurvas: Number.NaN }))).toBe(msg('md_tn_intervalo', { min: L.intervaloMin }));
    expect(terrainIssue(terreno({ intervaloCurvas: 0.05 }))).toBeNull();
    for (const m of [0, 101, 2.5]) expect(terrainIssue(terreno({ mestraCada: m }))).toBe(msg('md_tn_mestra', { max: L.mestraMax }));
    for (const m of [1, 100]) expect(terrainIssue(terreno({ mestraCada: m }))).toBeNull();
    for (const e of [0.09, 100.1]) expect(terrainIssue(terreno({ espessuraBase: e }))).toBe(msg('md_tn_espessura', { min: L.espessuraMin, max: L.espessuraMax }));
    for (const e of [0.1, 100]) expect(terrainIssue(terreno({ espessuraBase: e }))).toBeNull();
  });

  it('linhas de rótulo (até 64) e pontos cotados (até 256)', () => {
    expect(terrainIssue(terreno({ linhasRotulo: new Array<number>((L.linhasRotulo + 1) * 4).fill(0) }))).toBe(msg('md_tn_rotulos', { max: L.linhasRotulo }));
    expect(terrainIssue(terreno({ linhasRotulo: new Array<number>(L.linhasRotulo * 4).fill(0) }))).toBeNull();
    expect(terrainIssue(terreno({ pontosCotados: new Array<number>((L.pontosCotados + 1) * 2).fill(0) }))).toBe(msg('md_tn_cotados', { max: L.pontosCotados }));
    expect(terrainIssue(terreno({ pontosCotados: new Array<number>(L.pontosCotados * 2).fill(0) }))).toBeNull();
  });
});

describe('terrainRegionIssue (A.3 item 6)', () => {
  it('região válida passa', () => {
    expect(terrainRegionIssue(regiao(), projeto())).toBeNull();
    expect(terrainRegionIssue(regiao({ papel: 'plataforma', cota: 3, inclinacao: 0.02, direcao: 1, taludeCorte: 1.5, taludeAterro: 2 }), projeto())).toBeNull();
  });

  it('terrenoId existe e é terreno', () => {
    expect(terrainRegionIssue(regiao({ terrenoId: 'nada' }), projeto())).toBe(msg('md_tn_reg_terreno'));
    const p = projeto();
    p.elements['lt'] = { id: 'lt', kind: 'lot', levelId: 'lv_0', name: 'x', contorno: tri, lados: [], limites: {}, mostrarEdificavel: true, order: 1 };
    expect(terrainRegionIssue(regiao({ terrenoId: 'lt' }), p)).toBe(msg('md_tn_reg_terreno'));
  });

  it('contorno com 3 a 512 pontos', () => {
    expect(terrainRegionIssue(regiao({ contorno: tri.slice(0, 2) }), projeto())).toBe(msg('md_tn_reg_pontos', { max: L.regiaoPontos }));
    const circulo = (n: number) => Array.from({ length: n }, (_, k) => ({ x: 100 * Math.cos((2 * Math.PI * k) / n), y: 100 * Math.sin((2 * Math.PI * k) / n) }));
    expect(terrainRegionIssue(regiao({ contorno: circulo(L.regiaoPontos + 1) }), projeto())).toBe(msg('md_tn_reg_pontos', { max: L.regiaoPontos }));
    expect(terrainRegionIssue(regiao({ contorno: circulo(L.regiaoPontos) }), projeto())).toBeNull();
  });

  it('contorno simples, com área e anti-horário', () => {
    expect(terrainRegionIssue(regiao({ contorno: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }] }), projeto())).toBe(msg('md_tn_reg_simples'));
    expect(terrainRegionIssue(regiao({ contorno: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }] }), projeto())).toBe(msg('md_tn_reg_simples'));
    expect(terrainRegionIssue(regiao({ contorno: [...tri].reverse() }), projeto())).toBe(msg('md_tn_reg_horario'));
  });

  it('números finitos e dentro de coordMax e cotaMax', () => {
    expect(terrainRegionIssue(regiao({ contorno: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 5, y: 8 }] }), projeto())).toBe(msg('md_tn_numero'));
    expect(terrainRegionIssue(regiao({ contorno: [{ x: 0, y: 0 }, { x: L.coordMax + 1, y: 0 }, { x: 5, y: 8 }] }), projeto())).toBe(msg('md_tn_coord', { max: L.coordMax }));
    expect(terrainRegionIssue(regiao({ cota: L.cotaMax + 1 }), projeto())).toBe(msg('md_tn_cota', { max: L.cotaMax }));
    expect(terrainRegionIssue(regiao({ cota: Number.NaN }), projeto())).toBe(msg('md_tn_cota', { max: L.cotaMax }));
    expect(terrainRegionIssue(regiao({ direcao: Number.NaN }), projeto())).toBe(msg('md_tn_numero'));
  });

  it('inclinação de 0 a 1 e taludes de 0 a 10', () => {
    for (const i of [-0.01, 1.01]) expect(terrainRegionIssue(regiao({ inclinacao: i }), projeto())).toBe(msg('md_tn_reg_inclinacao', { max: L.inclinacaoMax }));
    for (const i of [0, 1]) expect(terrainRegionIssue(regiao({ inclinacao: i }), projeto())).toBeNull();
    for (const x of [-1, 10.01]) {
      expect(terrainRegionIssue(regiao({ taludeCorte: x }), projeto())).toBe(msg('md_tn_reg_talude', { max: L.taludeMax }));
      expect(terrainRegionIssue(regiao({ taludeAterro: x }), projeto())).toBe(msg('md_tn_reg_talude', { max: L.taludeMax }));
    }
    for (const x of [0, 10]) expect(terrainRegionIssue(regiao({ taludeCorte: x, taludeAterro: x }), projeto())).toBeNull();
  });

  it('papel desconhecido é recusado', () => {
    expect(terrainRegionIssue(regiao({ papel: 'outro' as TerrainRegion['papel'] }), projeto())).toBe(msg('md_tn_reg_papel'));
  });

  it('até 256 regiões por terreno', () => {
    const cheias = Array.from({ length: L.regioesPorTerreno }, (_, k) => regiao({ id: `r${k}` }));
    expect(terrainRegionIssue(regiao({ id: 'nova' }), projeto(cheias))).toBe(msg('md_tn_reg_limite', { max: L.regioesPorTerreno }));
    // A própria região já existente não conta contra o limite (edição).
    expect(terrainRegionIssue(cheias[0]!, projeto(cheias))).toBeNull();
    expect(terrainRegionIssue(regiao({ id: 'nova' }), projeto(cheias.slice(1)))).toBeNull();
  });
});

describe('anel: área com sinal e simplicidade', () => {
  it('área positiva no sentido anti-horário e simples só sem cruzamentos', () => {
    expect(areaAnelComSinal(tri)).toBeCloseTo(40, 9);
    expect(areaAnelComSinal([...tri].reverse())).toBeCloseTo(-40, 9);
    expect(anelTerrenoSimples(tri)).toBe(true);
    expect(anelTerrenoSimples([{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }])).toBe(false);
    expect(anelTerrenoSimples([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }])).toBe(false);
  });
});
