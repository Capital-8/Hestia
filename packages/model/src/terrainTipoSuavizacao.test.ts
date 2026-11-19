import { describe, expect, it } from 'vitest';
import { TERRAIN_TYPE_LIMITES, TERRAIN_TYPES_DEFAULT, TOLERANCIA_SUAVIZACAO_PADRAO, terrainTypeIssue, toleranciaCurvasDoTerreno, type TerrainType } from './index.ts';

const base: TerrainType = { ...TERRAIN_TYPES_DEFAULT[0]! };
const tipo = (extra: Partial<TerrainType>): TerrainType => ({ ...base, id: 'tt_s', ...extra });
const ajustes = (...tipos: TerrainType[]): { terrainTypes: TerrainType[] } => ({ terrainTypes: tipos });
const com = { tipoId: 'tt_s' };

describe('suavização das curvas de nível do tipo (valores literais)', () => {
  it('constantes: padrão 2 cm e limites de 0,1 cm a 50 cm', () => {
    expect(TOLERANCIA_SUAVIZACAO_PADRAO).toBe(0.02);
    expect(TERRAIN_TYPE_LIMITES.toleranciaMin).toBe(0.001);
    expect(TERRAIN_TYPE_LIMITES.toleranciaMax).toBe(0.5);
  });

  it('terreno sem tipo: curvas exatas (0)', () => {
    expect(toleranciaCurvasDoTerreno(ajustes(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.005 })), {})).toBe(0);
  });

  it('tipo sem suavizar (ausente ou false): curvas exatas (0), mesmo com tolerância gravada', () => {
    expect(toleranciaCurvasDoTerreno(ajustes(tipo({})), com)).toBe(0);
    expect(toleranciaCurvasDoTerreno(ajustes(tipo({ suavizarCurvas: false, toleranciaSuavizacao: 0.005 })), com)).toBe(0);
  });

  it('suavizar sem tolerância: 0,02 m', () => {
    expect(toleranciaCurvasDoTerreno(ajustes(tipo({ suavizarCurvas: true })), com)).toBe(0.02);
  });

  it('suavizar com tolerância: a do tipo, incluindo os limites 0,001 e 0,5', () => {
    expect(toleranciaCurvasDoTerreno(ajustes(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.005 })), com)).toBe(0.005);
    expect(toleranciaCurvasDoTerreno(ajustes(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.001 })), com)).toBe(0.001);
    expect(toleranciaCurvasDoTerreno(ajustes(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.5 })), com)).toBe(0.5);
  });

  it('tolerância inválida ou fora de [0,001; 0,5] cai no padrão 0,02', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, 0, 0.0005, 0.6, -0.01]) {
      expect(toleranciaCurvasDoTerreno(ajustes(tipo({ suavizarCurvas: true, toleranciaSuavizacao: v })), com)).toBe(0.02);
    }
  });

  it('terrainTypeIssue: tolerância fora de [0,001; 0,5] é recusada com md_tn_tolerancia (params em m)', () => {
    const esperado = { key: 'md_tn_tolerancia', params: { min: 0.001, max: 0.5 } };
    expect(terrainTypeIssue(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.0005 }))).toEqual(esperado);
    expect(terrainTypeIssue(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.6 }))).toEqual(esperado);
    expect(terrainTypeIssue(tipo({ suavizarCurvas: true, toleranciaSuavizacao: Number.NaN }))).toEqual(esperado);
  });

  it('terrainTypeIssue: limites e padrão são válidos; sem tolerância gravada também', () => {
    expect(terrainTypeIssue(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.001 }))).toBeNull();
    expect(terrainTypeIssue(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.5 }))).toBeNull();
    expect(terrainTypeIssue(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.02 }))).toBeNull();
    expect(terrainTypeIssue(tipo({ suavizarCurvas: true }))).toBeNull();
  });

  it('terrainTypeIssue: tolerância só é checada quando a suavização está ligada; intervalo ainda vem antes', () => {
    expect(terrainTypeIssue(tipo({ suavizarCurvas: false, toleranciaSuavizacao: 0.6 }))).toBeNull();
    expect(terrainTypeIssue(tipo({ suavizarCurvas: true, toleranciaSuavizacao: 0.6, intervaloCurvas: 0.01 }))).toEqual({ key: 'md_tn_intervalo', params: { min: 0.05 } });
  });

  it('projeto antigo (tipo gravado sem os campos novos, ida e volta pelo JSON): exato e sem aviso', () => {
    const antigo = JSON.parse(JSON.stringify(base)) as TerrainType;
    expect(antigo.suavizarCurvas).toBeUndefined();
    expect(toleranciaCurvasDoTerreno(ajustes(antigo), { tipoId: base.id })).toBe(0);
    expect(terrainTypeIssue(antigo)).toBeNull();
  });
});
