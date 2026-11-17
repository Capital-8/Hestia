import { describe, expect, it } from 'vitest';
import { decodificarCorteAterroTN, decodificarCorteTN, decodificarCotasTN, decodificarCurvasTN, decodificarMalhaTN, decodificarPlantaTN } from './terrenoVista.ts';

const AUSENTE = 0xffffffff;
const terreno = (n: number): string | undefined => (n === 1 ? 'tn_a' : n === 2 ? 'tn_b' : undefined);
const regiao = (n: number): string | undefined => (n === 7 ? 'rg_x' : undefined);

describe('decodificarMalhaTN', () => {
  it('uma parte por (terreno, região, papel) com os vértices compactados; terreno desconhecido some', () => {
    // vértices 0..3 formam dois triângulos da superfície sem região; o grupo seguinte reaproveita o vértice 3 e traz a saia com região 7.
    const vertices = [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 5, 5, 0, 6, 5, 0, 5, 6, 0];
    const indices = [0, 1, 2, 0, 2, 3, 3, 4, 5, 9, 9, 9];
    const grupos = [1, AUSENTE, 0, 0, 6, 1, 7, 1, 6, 3, 9, 7, 2, 9, 3];
    const m = decodificarMalhaTN(grupos, vertices, indices, terreno, regiao);
    expect(m).toHaveLength(1);
    expect(m[0]!.terrenoId).toBe('tn_a');
    expect(m[0]!.partes.map((x) => [x.regiaoId, x.papel, x.indices.length])).toEqual([
      [null, 'superficie', 6],
      ['rg_x', 'saia', 3],
    ]);
    expect(m[0]!.partes[0]!.positions).toEqual([0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
    expect(m[0]!.partes[0]!.indices).toEqual([0, 1, 2, 0, 2, 3]);
    expect(m[0]!.partes[1]!.positions).toEqual([0, 1, 1, 5, 5, 0, 6, 5, 0]);
    expect(m[0]!.partes[1]!.indices).toEqual([0, 1, 2]);
  });
  it('vazio quando o Rust não devolve grupos', () => {
    expect(decodificarMalhaTN([], [], [], terreno, regiao)).toEqual([]);
  });
});

describe('decodificarCurvasTN e decodificarPlantaTN', () => {
  it('curvas: cota, mestra e fechada por linha, pontos consumidos na ordem', () => {
    const linhas = [1, 0, 0, 2, 2, 1, 1, 3, 9, 0, 0, 2];
    const pontos = [0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 7, 7, 8, 8];
    const c = decodificarCurvasTN(linhas, pontos, [10.5, 11, 12], terreno);
    expect(c.map((x) => [x.terrenoId, x.z, x.mestra, x.fechada, x.pontos.length])).toEqual([
      ['tn_a', 10.5, false, false, 2],
      ['tn_b', 11, true, true, 3],
    ]);
    expect(c[1]!.pontos[2]).toEqual({ x: 1, y: 1 });
  });
  it('planta: laço fechado da borda', () => {
    const l = decodificarPlantaTN([2, 0, 1, 3], [0, 0, 4, 0, 4, 4], terreno);
    expect(l).toEqual([{ terrenoId: 'tn_b', fechada: true, pontos: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }] }]);
  });
});

describe('decodificarCorteTN, decodificarCorteAterroTN e decodificarCotasTN', () => {
  it('corte: papel por nome e pontos em (s, z)', () => {
    const l = decodificarCorteTN([1, 0, 1, 3, 1, 2, 0, 2], [0, 1, 2, 1, 2, 0, 5, 6, 7, 8], terreno);
    expect(l.map((x) => [x.papel, x.fechada, x.pontos.length])).toEqual([
      ['cortado', true, 3],
      ['silhueta', false, 2],
    ]);
    expect(l[1]!.pontos).toEqual([{ s: 5, z: 6 }, { s: 7, z: 8 }]);
  });
  it('mapa de corte e aterro: triângulos x, y por grupo', () => {
    const g = decodificarCorteAterroTN([1, 0, 0, 3, 1, 1, 3, 3], [0, 0, 1, 0, 0, 1, 5, 5, 6, 5, 5, 6], terreno);
    expect(g.map((x) => [x.tipo, x.pontos.length])).toEqual([
      ['corte', 6],
      ['aterro', 6],
    ]);
  });
  it('cotas: ponto fora de todo terreno vira null; a ordem é a das sondas', () => {
    const r = decodificarCotasTN([0, AUSENTE, 1, 2, 2, 1], [0, 0, 11.25, 0.1, 9, 0.2], terreno);
    expect(r).toEqual([null, { z: 11.25, declividade: 0.1, terrenoId: 'tn_b' }, { z: 9, declividade: 0.2, terrenoId: 'tn_a' }]);
  });
});
