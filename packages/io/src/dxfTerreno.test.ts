import { describe, expect, it } from 'vitest';
import levantamento from '../../../tests/fixtures/terreno/levantamento.dxf?raw';
import { lerLevantamentoDxf } from './dxfTerreno.ts';

/** Monta um DXF mínimo: cabeçalho opcional com `$INSUNITS` e as entidades (cada uma é uma lista de pares código/valor). */
function dxf(entidades: Array<Array<[number, string | number]>>, insunits?: number): string {
  const l: Array<string | number> = [0, 'SECTION', 2, 'HEADER'];
  if (insunits !== undefined) l.push(9, '$INSUNITS', 70, insunits);
  l.push(0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  for (const e of entidades) for (const [c, v] of e) l.push(c, v);
  l.push(0, 'ENDSEC', 0, 'EOF');
  return l.join('\n');
}

const ponto = (x: number, y: number, z: number, camada = 'P'): Array<[number, string | number]> => [[0, 'POINT'], [8, camada], [10, x], [20, y], [30, z]];
const lw = (z: number | null, v: Array<[number, number]>, flag = 0, camada = 'C'): Array<[number, string | number]> => [
  [0, 'LWPOLYLINE'], [8, camada], [90, v.length], [70, flag], ...(z === null ? [] : [[38, z] as [number, number]]),
  ...v.flatMap(([x, y]) => [[10, x], [20, y]] as Array<[number, number]>),
];

describe('lerLevantamentoDxf: uma entidade por vez', () => {
  it('POINT: x, y e z viram ponto solto', () => {
    const r = lerLevantamentoDxf(dxf([ponto(1, 2, 3)]));
    expect(r.camadas).toHaveLength(1);
    expect(r.camadas[0]!.nome).toBe('P');
    expect(r.camadas[0]!.pontos).toEqual([1, 2, 3]);
    expect(r.camadas[0]!.contagem).toMatchObject({ entidades: 1, pontos: 1, semCota: 0 });
    expect([r.zMin, r.zMax]).toEqual([3, 3]);
  });

  it('LWPOLYLINE com elevação (38) e z constante é candidata a curva; fechada guarda a flag', () => {
    const r = lerLevantamentoDxf(dxf([lw(5, [[0, 0], [10, 0], [10, 10]], 1)]));
    const c = r.camadas[0]!;
    expect(c.constantes).toEqual([{ z: 5, xy: [0, 0, 10, 0, 10, 10], fechada: true }]);
    expect(c.variaveis).toEqual([]);
    expect(c.contagem).toMatchObject({ constantes: 1, entidades: 1 });
  });

  it('POLYLINE 3D com VERTEX de cota diferente é candidata a quebra', () => {
    const t = dxf([
      [[0, 'POLYLINE'], [8, 'Q'], [70, 8]],
      [[0, 'VERTEX'], [8, 'Q'], [10, 0], [20, 0], [30, 1], [70, 32]],
      [[0, 'VERTEX'], [8, 'Q'], [10, 5], [20, 0], [30, 2], [70, 32]],
      [[0, 'VERTEX'], [8, 'Q'], [10, 9], [20, 3], [30, 4], [70, 32]],
      [[0, 'SEQEND'], [8, 'Q']],
    ]);
    const c = lerLevantamentoDxf(t).camadas[0]!;
    expect(c.variaveis).toEqual([[0, 0, 1, 5, 0, 2, 9, 3, 4]]);
    expect(c.constantes).toEqual([]);
    expect(c.zMin).toBe(1);
    expect(c.zMax).toBe(4);
  });

  it('POLYLINE 2D usa a elevação do cabeçalho (código 30) e vira curva; fechada em cota variável repete o primeiro vértice', () => {
    const plana = dxf([
      [[0, 'POLYLINE'], [8, 'C'], [66, 1], [10, 0], [20, 0], [30, 7], [70, 0]],
      [[0, 'VERTEX'], [8, 'C'], [10, 0], [20, 0]],
      [[0, 'VERTEX'], [8, 'C'], [10, 4], [20, 0]],
      [[0, 'SEQEND']],
    ]);
    expect(lerLevantamentoDxf(plana).camadas[0]!.constantes).toEqual([{ z: 7, xy: [0, 0, 4, 0], fechada: false }]);
    const fechada3d = dxf([
      [[0, 'POLYLINE'], [8, 'Q'], [70, 9]],
      [[0, 'VERTEX'], [10, 0], [20, 0], [30, 1], [70, 32]],
      [[0, 'VERTEX'], [10, 4], [20, 0], [30, 2], [70, 32]],
      [[0, 'VERTEX'], [10, 4], [20, 4], [30, 3], [70, 32]],
      [[0, 'SEQEND']],
    ]);
    expect(lerLevantamentoDxf(fechada3d).camadas[0]!.variaveis).toEqual([[0, 0, 1, 4, 0, 2, 4, 4, 3, 0, 0, 1]]);
  });

  it('LINE com z: cota igual nas pontas é curva de 2 pontos; cota diferente é quebra', () => {
    const t = dxf([
      [[0, 'LINE'], [8, 'L'], [10, 0], [20, 0], [30, 2], [11, 3], [21, 4], [31, 2]],
      [[0, 'LINE'], [8, 'L'], [10, 0], [20, 0], [30, 2], [11, 3], [21, 4], [31, 5]],
    ]);
    const c = lerLevantamentoDxf(t).camadas[0]!;
    expect(c.constantes).toEqual([{ z: 2, xy: [0, 0, 3, 4], fechada: false }]);
    expect(c.variaveis).toEqual([[0, 0, 2, 3, 4, 5]]);
  });

  it('3DFACE: só os vértices, como pontos; o 4º igual ao 3º e vértices repetidos entre faces contam uma vez', () => {
    const face = (v: number[][]): Array<[number, string | number]> => [[0, '3DFACE'], [8, 'F'], ...v.flatMap((p, k) => [[10 + k, p[0]!], [20 + k, p[1]!], [30 + k, p[2]!]] as Array<[number, number]>)];
    const t = dxf([
      face([[0, 0, 1], [10, 0, 2], [10, 10, 3], [10, 10, 3]]),
      face([[0, 0, 1], [10, 10, 3], [0, 10, 4], [0, 10, 4]]),
    ]);
    const c = lerLevantamentoDxf(t).camadas[0]!;
    expect(c.pontos).toEqual([0, 0, 1, 10, 0, 2, 10, 10, 3, 0, 10, 4]);
    expect(c.contagem.pontos).toBe(4);
  });
});

describe('lerLevantamentoDxf: unidade, camadas e entidades sem cota', () => {
  it('aplica a unidade do arquivo em x, y e z (mm) e permite forçar outra', () => {
    const t = dxf([ponto(1000, 2000, 3000)], 4);
    const r = lerLevantamentoDxf(t);
    expect(r.unit).toBe('mm');
    expect(r.camadas[0]!.pontos).toEqual([1, 2, 3]);
    const forcada = lerLevantamentoDxf(t, 'x', { unit: 'cm' });
    expect(forcada.unit).toBe('cm');
    expect(forcada.unitDetectada).toBe('mm');
    expect(forcada.camadas[0]!.pontos).toEqual([10, 20, 30]);
  });

  it('separa por camada e calcula a faixa de z por camada e geral', () => {
    const r = lerLevantamentoDxf(dxf([ponto(0, 0, 10, 'A'), ponto(1, 1, 14, 'A'), lw(20, [[0, 0], [1, 1]], 0, 'B')]));
    expect(r.camadas.map((c) => c.nome)).toEqual(['A', 'B']);
    expect([r.camadas[0]!.zMin, r.camadas[0]!.zMax]).toEqual([10, 14]);
    expect([r.camadas[1]!.zMin, r.camadas[1]!.zMax]).toEqual([20, 20]);
    expect([r.zMin, r.zMax]).toEqual([10, 20]);
  });

  it('z = 0 em arquivo com outras cotas é contado à parte e ignorado por padrão', () => {
    const t = dxf([ponto(0, 0, 0), ponto(1, 1, 5), lw(null, [[0, 0], [5, 5]]), lw(8, [[0, 0], [5, 5]])]);
    const r = lerLevantamentoDxf(t);
    expect(r.temCotas).toBe(true);
    const todas = r.camadas.reduce((s, c) => s + c.contagem.semCota, 0);
    expect(todas).toBe(2);
    expect(r.camadas.flatMap((c) => c.pontos)).toEqual([1, 1, 5]);
    expect(r.camadas.flatMap((c) => c.constantes).map((c) => c.z)).toEqual([8]);
    const incluindo = lerLevantamentoDxf(t, 'x', { incluirSemCota: true });
    expect(incluindo.camadas.reduce((s, c) => s + c.contagem.semCota, 0)).toBe(0);
    expect(incluindo.camadas.flatMap((c) => c.pontos)).toEqual([0, 0, 0, 1, 1, 5]);
  });

  it('arquivo sem nenhuma cota (tudo plano) não conta nada como sem cota', () => {
    const r = lerLevantamentoDxf(dxf([ponto(0, 0, 0), ponto(1, 1, 0)]));
    expect(r.temCotas).toBe(false);
    expect(r.camadas[0]!.contagem).toMatchObject({ pontos: 2, semCota: 0 });
  });

  it('avisa de bulge, malha e bloco e ignora o resto', () => {
    const t = dxf([
      [[0, 'LWPOLYLINE'], [8, 'C'], [90, 2], [70, 0], [38, 1], [10, 0], [20, 0], [42, 0.5], [10, 4], [20, 0]],
      [[0, 'POLYLINE'], [8, 'M'], [70, 16]],
      [[0, 'VERTEX'], [10, 0], [20, 0], [30, 0], [70, 64]],
      [[0, 'SEQEND']],
      [[0, 'INSERT'], [8, 'B'], [2, 'ARVORE'], [10, 0], [20, 0]],
      [[0, 'TEXT'], [8, 'T'], [10, 0], [20, 0], [1, 'oi']],
    ]);
    const r = lerLevantamentoDxf(t);
    expect(r.avisos.map((a) => a.codigo)).toEqual(['bulge', 'malha', 'bloco']);
    expect(r.camadas.map((c) => c.nome)).toEqual(['C']);
  });
});

describe('levantamento.dxf', () => {
  const r = lerLevantamentoDxf(levantamento, 'levantamento');

  it('tem 12 curvas fechadas de 1 em 1 m e 40 pontos cotados, em coordenadas locais pequenas', () => {
    const curvas = r.camadas.find((c) => c.nome === 'CURVAS')!;
    const pontos = r.camadas.find((c) => c.nome === 'PONTOS')!;
    expect(curvas.constantes.map((c) => c.z)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(curvas.constantes.every((c) => c.fechada && c.xy.length === 48)).toBe(true);
    expect(curvas.contagem).toMatchObject({ entidades: 12, constantes: 12, variaveis: 0, semCota: 0 });
    expect(pontos.contagem).toMatchObject({ entidades: 40, pontos: 40, semCota: 0 });
    expect(pontos.pontos).toHaveLength(120);
    expect(r.unit).toBe('m');
    expect(r.avisos).toEqual([]);
    const coords = [...curvas.constantes.flatMap((c) => c.xy), ...pontos.pontos.filter((_, k) => k % 3 !== 2)];
    expect(Math.max(...coords.map(Math.abs))).toBeLessThan(200);
    expect(r.zMin).toBe(1);
    expect(r.zMax).toBeGreaterThan(12);
  });
});
