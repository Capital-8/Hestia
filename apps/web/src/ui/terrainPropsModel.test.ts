import { describe, expect, it } from 'vitest';
import { loteL2, projetoLote, projetoTerreno } from '@hestia/engine';
import { createEmptyProject, isLot, isTerrain, isTerrainRegion, makeTerrain, type Lot, type Terrain } from '@hestia/model';
import {
  comLadoAlterado,
  comLimite,
  contarVerticesTerreno,
  fracaoParaPercentual,
  ladosDoLote,
  leiturasDaRegiao,
  leiturasDoLote,
  leiturasDoTerreno,
  percentualParaFracao,
  rotuloDoSitio,
} from './terrainPropsModel.ts';

const terreno = (id = 'tn_t5'): Terrain => Object.values(projetoTerreno('T5').elements).find((e): e is Terrain => isTerrain(e) && e.id === id)!;
const lote = (p = projetoLote()): Lot => Object.values(p.elements).find(isLot)!;

describe('contagem de vértices do terreno', () => {
  it('soma pontos, vértices de curvas, de quebras e da borda', () => {
    expect(contarVerticesTerreno(terreno())).toBe(4);
    const tn = makeTerrain({ id: 'x', levelId: 'lv_0', pontos: [0, 0, 1, 1, 1, 2], curvas: [{ z: 1, xy: [0, 0, 1, 1, 2, 2], fechada: false }], quebras: [{ xyz: [0, 0, 1, 1, 1, 2] }], borda: [0, 0, 1, 0, 1, 1] });
    expect(contarVerticesTerreno({ ...tn, order: 0 })).toBe(2 + 3 + 2 + 3);
  });
});

describe('leituras do terreno e da região vêm do serviço do kernel', () => {
  const p = projetoTerreno('T5');
  const serv = {
    quantidades: () => [{ terrenoId: 'tn_t5', areaPlanta: 400, areaSuperficieExistente: 400, areaSuperficieProposta: 401, zMin: 8, zMax: 10, volumeCorte: 12.5, volumeAterro: 0, nTriangulos: 6 }],
    quantidadesRegioes: () => [{ regiaoId: 'rg_t5', terrenoId: 'tn_t5', areaPlanta: 100, areaSuperficie: 100, volumeCorte: 200, volumeAterro: 3 }],
  };

  it('devolve os valores calculados e a contagem das fontes', () => {
    expect(leiturasDoTerreno(p, terreno(), serv)).toEqual({ vertices: 4, areaPlanta: 400, zMin: 8, zMax: 10, volumeCorte: 12.5, volumeAterro: 0 });
    const r = Object.values(p.elements).find(isTerrainRegion)!;
    expect(leiturasDaRegiao(p, r, serv)).toEqual({ areaPlanta: 100, areaSuperficie: 100, volumeCorte: 200, volumeAterro: 3 });
  });

  it('sem kernel (serviço devolve null) os valores calculados são null, mas os vértices continuam', () => {
    const semKernel = { quantidades: () => null, quantidadesRegioes: () => null };
    expect(leiturasDoTerreno(p, terreno(), semKernel)).toEqual({ vertices: 4, areaPlanta: null, zMin: null, zMax: null, volumeCorte: null, volumeAterro: null });
    const r = Object.values(p.elements).find(isTerrainRegion)!;
    expect(leiturasDaRegiao(p, r, semKernel)).toEqual({ areaPlanta: null, areaSuperficie: null, volumeCorte: null, volumeAterro: null });
  });
});

describe('leituras do lote (motor)', () => {
  it('L1: área 360, perímetro 84, edificável 198', () => {
    const l = leiturasDoLote(lote());
    expect(l.area).toBeCloseTo(360, 6);
    expect(l.perimetro).toBeCloseTo(84, 6);
    expect(l.areaEdificavel).toBeCloseTo(198, 6);
  });

  it('L2 (em L): área 300 e edificável 156,86', () => {
    const l = leiturasDoLote(lote(projetoLote(loteL2())));
    expect(l.area).toBeCloseTo(300, 6);
    expect(l.areaEdificavel).toBeCloseTo(156.86, 1);
  });

  it('tabela de lados: comprimento e azimute do motor, papel e recuo do modelo', () => {
    const lados = ladosDoLote(createEmptyProject(), lote());
    expect(lados.map((l) => l.comprimento)).toEqual([12, 30, 12, 30]);
    expect(lados.map((l) => Math.round(l.azimute))).toEqual([90, 0, 270, 180]);
    expect(lados.map((l) => l.papel)).toEqual(['frente', 'lateral', 'fundo', 'lateral']);
    expect(lados.map((l) => l.recuo)).toEqual([5, 1.5, 3, 1.5]);
  });

  it('o azimute usa o norte verdadeiro do projeto (A.4 regra 19)', () => {
    const p = createEmptyProject();
    p.localizacao = { origemE: 0, origemN: 0, cotaZero: 0, norteVerdadeiro: Math.PI / 2, sistema: undefined };
    const sem = ladosDoLote(createEmptyProject(), lote()).map((l) => l.azimute);
    const com = ladosDoLote(p, lote()).map((l) => l.azimute);
    // Emenda E4: azimute = direção a partir de +y (horário) − norte verdadeiro.
    expect(com[0]).toBeCloseTo(((sem[0]! - 90) % 360 + 360) % 360, 6);
  });
});

describe('edição pura de lados e limites', () => {
  it('comLadoAlterado troca só o lado pedido e não mexe no original', () => {
    const l = lote();
    const novos = comLadoAlterado(l.lados, 2, { recuo: 4, papel: 'lateral' });
    expect(novos[2]).toEqual({ papel: 'lateral', recuo: 4 });
    expect(novos[0]).toEqual(l.lados[0]);
    expect(l.lados[2]).toEqual({ papel: 'fundo', recuo: 3 });
  });

  it('comLimite define e remove um limite, preservando os outros', () => {
    const a = comLimite({}, 'taxaOcupacaoMax', 0.5);
    expect(a).toEqual({ taxaOcupacaoMax: 0.5 });
    const b = comLimite(a, 'gabaritoMax', 12);
    expect(b).toEqual({ taxaOcupacaoMax: 0.5, gabaritoMax: 12 });
    expect(comLimite(b, 'taxaOcupacaoMax', undefined)).toEqual({ gabaritoMax: 12 });
    expect(b).toEqual({ taxaOcupacaoMax: 0.5, gabaritoMax: 12 });
  });

  it('fração e percentual, sem ruído de ponto flutuante', () => {
    expect(fracaoParaPercentual(0.07)).toBe(7);
    expect(fracaoParaPercentual(0.1 + 0.2)).toBe(30);
    expect(percentualParaFracao(50)).toBe(0.5);
  });
});

describe('rótulo do cabeçalho da paleta', () => {
  const c = { terrains: 0, regions: 0, lots: 0, outros: 0 };
  it('singular, plural e seleção que não é só do terreno', () => {
    expect(rotuloDoSitio({ ...c, terrains: 1 }, 'pt')).toBe('Terreno');
    expect(rotuloDoSitio({ ...c, terrains: 2 }, 'pt')).toBe('Terrenos');
    expect(rotuloDoSitio({ ...c, regions: 1 }, 'en')).toBe('Terrain region');
    expect(rotuloDoSitio({ ...c, lots: 3 }, 'pt')).toBe('Lotes');
    expect(rotuloDoSitio({ ...c, terrains: 1, outros: 1 }, 'pt')).toBeNull();
    expect(rotuloDoSitio({ ...c, terrains: 1, lots: 1 }, 'pt')).toBeNull();
    expect(rotuloDoSitio(c, 'pt')).toBeNull();
  });
});
