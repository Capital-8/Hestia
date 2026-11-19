import type { Vec2 } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { colisoes, retanguloNoMundo } from './encaixeColisao.ts';
import type { CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';

/*
 * Testes CEGOS de `colisoes` e `retanguloNoMundo` (F2): escritos só a partir da especificação, com cada
 * esperado calculado à mão no comentário ao lado do `expect` (nunca chamando a função testada). A ordem dos
 * cantos de `retanguloNoMundo` não é especificação, por isso `conferirCantos` compara como conjunto.
 */

/** Vizinhança exata dos 1 mm em binário: 2^-10 = 0,0009765625 < 1 mm < 2^-9 = 0,001953125 (contas exatas). */
const DEBAIXO_1MM = 2 ** -10;
const ACIMA_1MM = 2 ** -9;
/** Tolerância de comparação das coordenadas (1e-9, a da ficha). */
const EPS = 1e-9;

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Caixa local padrão 0,6 × 0,56 × 0,72 com origem no canto (x = largura, y = profundidade, z = altura). */
function caixa(larg = 0.6, prof = 0.56, alt = 0.72): CaixaLocal {
  return { min: [0, 0, 0], max: [larg, prof, alt] };
}

/** Móvel de teste: pose sem giro e sem espelho por padrão. */
function corpo(id: string, x: number, y: number, extra: Partial<Pose> = {}, base: CaixaLocal = caixa()): Corpo {
  return { id, pose: { x, y, rotation: 0, mirrored: false, z: 0, ...extra }, caixa: base };
}

/**
 * Face a=(0;0)→b=(4;0): pela convenção de `encaixeTipos`, a parte livre da sala fica à esquerda de a→b
 * (y ≥ 0) e o lado sólido é o direito (y < 0).
 */
const FACE: FaceDeParede = { a: v(0, 0), b: v(4, 0) };

/** Compara os cantos como conjunto, com tolerância EPS (a ordem devolvida por `retanguloNoMundo` não é spec). */
function conferirCantos(obtidos: readonly Vec2[], esperados: readonly Vec2[]): void {
  const sobra = [...obtidos];
  for (const esp of esperados) {
    const i = sobra.findIndex((c) => Math.abs(c.x - esp.x) <= EPS && Math.abs(c.y - esp.y) <= EPS);
    expect(i, `canto (${esp.x}, ${esp.y}) não encontrado em ${JSON.stringify(sobra)}`).toBeGreaterThanOrEqual(0);
    sobra.splice(i, 1);
  }
  expect(sobra, 'sobraram cantos fora do esperado').toEqual([]);
}

describe('retanguloNoMundo', () => {
  const k = caixa();
  const pose = (extra: Partial<Pose>): Pose => ({ x: 1, y: 2, rotation: 0, mirrored: false, z: 0, ...extra });

  it('sem giro: soma a pose aos quatro cantos locais', () => {
    // (0;0)+(1;2)=(1;2) | (0,6;0)+(1;2)=(1,6;2) | (0,6;0,56)+(1;2)=(1,6;2,56) | (0;0,56)+(1;2)=(1;2,56)
    conferirCantos(retanguloNoMundo(pose({}), k), [v(1, 2), v(1.6, 2), v(1.6, 2.56), v(1, 2.56)]);
  });

  it('girada 90°: o x local vira y e o y local vira −x', () => {
    // R(90°)·(0;0)=(0;0)→(1;2) | (0,6;0)→(0;0,6)→(1;2,6) | (0,6;0,56)→(−0,56;0,6)→(0,44;2,6) | (0;0,56)→(−0,56;0)→(0,44;2)
    conferirCantos(retanguloNoMundo(pose({ rotation: Math.PI / 2 }), k), [v(1, 2), v(1, 2.6), v(0.44, 2.6), v(0.44, 2)]);
  });

  it('espelhada: nega o x local antes de somar a pose', () => {
    // (−0;0)+(1;2)=(1;2) | (−0,6;0)+(1;2)=(0,4;2) | (−0,6;0,56)+(1;2)=(0,4;2,56) | (−0;0,56)+(1;2)=(1;2,56)
    conferirCantos(retanguloNoMundo(pose({ mirrored: true }), k), [v(1, 2), v(0.4, 2), v(0.4, 2.56), v(1, 2.56)]);
  });

  it('girada 45° e espelhada juntas: o espelho entra antes da rotação', () => {
    // s = √2/2 ≈ 0,7071067812; E nega o x local e depois R(45°) gira:
    // (0;0)→(0;0)→(1;2) | (0,6;0)→(−0,6;0)→(−0,6s;−0,6s)→(0,5757;1,5757)
    // (0,6;0,56)→(−0,6;0,56)→(−(0,6+0,56)s;(−0,6+0,56)s)=(−0,8202;−0,0283)→(0,1798;1,9717)
    // (0;0,56)→(0;0,56)→(−0,56s;0,56s)=(−0,3960;0,3960)→(0,6040;2,3960)
    const s = Math.SQRT1_2;
    conferirCantos(retanguloNoMundo(pose({ rotation: Math.PI / 4, mirrored: true }), k), [
      v(1, 2), v(1 - 0.6 * s, 2 - 0.6 * s), v(1 - 1.16 * s, 2 - 0.04 * s), v(1 - 0.56 * s, 2 + 0.56 * s),
    ]);
  });
});

describe('colisoes: casos da especificação', () => {
  it('dois móveis 0,6 × 0,56 com origens (0;0) e (0,3;0,2) sobrepõem', () => {
    // planta: x [0;0,6] ∩ [0,3;0,9] = 0,3 > 1 mm e y [0;0,56] ∩ [0,2;0,76] = 0,36 > 1 mm; altura: ambos [0;0,72] = 0,72
    expect(colisoes(corpo('a', 0, 0), [corpo('b', 0.3, 0.2)], [])).toEqual({ moveis: ['b'], paredes: [] });
  });

  it('com a origem em (0,6;0) ficam encostados: não colide', () => {
    // invasão em x = 0,6 − 0,6 = 0 (encostar não conta) → o eixo x separa
    expect(colisoes(corpo('a', 0, 0), [corpo('b', 0.6, 0)], [])).toEqual({ moveis: [], paredes: [] });
  });

  it('com a origem em (0,6005;0) a folga de 0,5 mm não colide', () => {
    // folga em x = 0,6005 − 0,6 = 0,0005 < 1 mm → eixo separador
    expect(colisoes(corpo('a', 0, 0), [corpo('b', 0.6005, 0)], [])).toEqual({ moveis: [], paredes: [] });
  });

  it('com a origem em (0,598;0) a invasão de 2 mm colide', () => {
    // x: 0,6 − 0,598 = 0,002 > 1 mm; y: 0,56 − 0 = 0,56 > 1 mm; altura: 0,72 > 1 mm
    expect(colisoes(corpo('a', 0, 0), [corpo('b', 0.598, 0)], [])).toEqual({ moveis: ['b'], paredes: [] });
  });

  it('caixa girada 45° com o canto 1 cm dentro da lateral do móvel colide', () => {
    // s = √2/2 ≈ 0,7071067812. Canto local (0;0,56) após R(45°): (−0,56s; 0,56s) = (−0,39598; 0,39598).
    // Pose x = 0,59 − (−0,39598) = 0,98598 põe esse canto em x = 0,59, isto é, 1 cm além da face x = 0,6.
    // Eixos da SAT (intervalos projetados): x → 0,6 − 0,59 = 0,01; y → 0,56 − 0 = 0,56;
    // eixo (s;s) → 0,82024 − 0,69720 = 0,12304; eixo (−s;s) → −0,13720 − (−0,42426) = 0,28706: todos > 1 mm.
    const xDoCanto = -0.56 * Math.sin(Math.PI / 4);
    const girada = corpo('b', 0.59 - xDoCanto, 0, { rotation: Math.PI / 4 });
    expect(colisoes(corpo('a', 0, 0), [girada], [])).toEqual({ moveis: ['b'], paredes: [] });
  });

  it('a mesma caixa recuada 1 cm (canto exatamente na face) não colide', () => {
    // recuar 1 cm a partir de 1 cm de invasão deixa o canto em x = 0,60: a invasão em x vira 0,6 − 0,6 = 0
    // (encostar não conta) e o eixo x separa; os demais eixos não são examinados.
    const xDoCanto = -0.56 * Math.sin(Math.PI / 4);
    const recuada = corpo('b', 0.6 - xDoCanto, 0, { rotation: Math.PI / 4 });
    expect(colisoes(corpo('a', 0, 0), [recuada], [])).toEqual({ moveis: [], paredes: [] });
  });

  it('aéreo com z base 1,4 não colide com o móvel de 0,72; com z base 0,6 colide', () => {
    const armario = corpo('a', 0, 0); // caixa z [0;0,72]
    const aereo = corpo('b', 0.3, 0.2, { z: 1.4 }, { min: [0, 0, 0], max: [0.6, 0.56, 0.7] });
    // a planta sobrepõe (x [0,3;0,9] ∩ [0;0,6] = 0,3 e y [0,2;0,76] ∩ [0;0,56] = 0,36), mas a altura
    // [1,4;2,1] ∩ [0;0,72] = vazio → sem invasão em altura
    expect(colisoes(armario, [aereo], [])).toEqual({ moveis: [], paredes: [] });
    // z = 0,6 → [0,6;1,3] ∩ [0;0,72] = 0,72 − 0,6 = 0,12 > 1 mm → colide
    const descido = { ...aereo, pose: { ...aereo.pose, z: 0.6 } };
    expect(colisoes(armario, [descido], [])).toEqual({ moveis: ['b'], paredes: [] });
  });

  it('móvel com o id do alvo é ignorado', () => {
    // o próprio id não pode aparecer na saída, mesmo se a caixa dele sobrepõe (invasão 0,3 e 0,36)
    expect(colisoes(corpo('a', 0, 0), [corpo('a', 0.3, 0.2)], [])).toEqual({ moveis: [], paredes: [] });
  });

  it('o id igual ao do alvo não esconde os demais móveis', () => {
    expect(colisoes(corpo('a', 0, 0), [corpo('a', 0.3, 0.2), corpo('b', 0.3, 0.2)], [])).toEqual({ moveis: ['b'], paredes: [] });
  });

  it('canto 5 cm no lado sólido da face, com a projeção dentro do comprimento: parede 0', () => {
    // pose (1;−0,05): cantos em x ∈ [1;1,6] ⊂ [0;4] e y ∈ [−0,05;0,51]; o canto (1;−0,05) está
    // 0,05 m > 1 mm no lado sólido (y < 0) da face (0;0)→(4;0)
    expect(colisoes(corpo('a', 1, -0.05), [], [FACE])).toEqual({ moveis: [], paredes: [0] });
  });

  it('móvel todo no lado livre (y ≥ 0) não atravessa a face', () => {
    // cantos em y ∈ [0;0,56]: a menor profundidade no sólido é 0 (encostar não conta) → nenhuma parede
    expect(colisoes(corpo('a', 1, 0), [], [FACE])).toEqual({ moveis: [], paredes: [] });
  });

  it('móvel fora do comprimento da face (x > 4,2) não conta', () => {
    // cantos em x ∈ [4,2;4,8]: a projeção de todos fica além de b = (4;0), fora do comprimento da face
    expect(colisoes(corpo('a', 4.2, -0.05), [], [FACE])).toEqual({ moveis: [], paredes: [] });
  });

  it('três móveis dados fora de ordem saem ordenados por id', () => {
    // todos se sobrepõem ao alvo em (0;0): m1 em x [0,2;0,8], m2 em [0,15;0,75], m3 em [0,1;0,7];
    // a ordem da lista não importa, a de saída é 'm1' < 'm2' < 'm3'
    const alvo = corpo('alvo', 0, 0);
    const outros = [corpo('m3', 0.1, 0.1), corpo('m1', 0.2, 0.2), corpo('m2', 0.15, 0.15)];
    expect(colisoes(alvo, outros, [])).toEqual({ moveis: ['m1', 'm2', 'm3'], paredes: [] });
  });
});

describe('colisoes: casos próprios', () => {
  it('borda da tolerância na planta: 2^-10 não colide e 2^-9 colide', () => {
    // alvo largo 0,5 em x [0;0,5]; o outro (também 0,5) em x = 0,5 − 2^-10 → invasão exata
    // 0,5 − 0,4990234375 = 0,0009765625 < 1 mm (conta exata em binário) → separa no eixo x
    const alvo = corpo('a', 0, 0, {}, caixa(0.5));
    const porBaixo = corpo('b', 0.5 - DEBAIXO_1MM, 0.2, {}, caixa(0.5));
    expect(colisoes(alvo, [porBaixo], [])).toEqual({ moveis: [], paredes: [] });
    // em x = 0,5 − 2^-9 → invasão 0,001953125 > 1 mm; y [0,2;0,76] ∩ [0;0,56] = 0,36 > 1 mm → colide
    const porCima = corpo('b', 0.5 - ACIMA_1MM, 0.2, {}, caixa(0.5));
    expect(colisoes(alvo, [porCima], [])).toEqual({ moveis: ['b'], paredes: [] });
  });

  it('borda da tolerância na altura: 2^-10 não colide e 2^-9 colide', () => {
    // alvo com caixa z [0;0,5]; o outro com altura 0,3 e z base 0,5 − 2^-10 →
    // [0,4990234375;0,7990234375] ∩ [0;0,5] = 0,5 − 0,4990234375 = 0,0009765625 < 1 mm → sem invasão
    const alvo = corpo('a', 0, 0, {}, caixa(0.6, 0.56, 0.5));
    const aereo = corpo('b', 0.1, 0.1, { z: 0.5 - DEBAIXO_1MM }, { min: [0, 0, 0], max: [0.4, 0.4, 0.3] });
    expect(colisoes(alvo, [aereo], [])).toEqual({ moveis: [], paredes: [] });
    // z base 0,5 − 2^-9 → invasão 0,5 − 0,498046875 = 0,001953125 > 1 mm; a planta sobrepõe
    // (x [0,1;0,5] ∩ [0;0,6] = 0,4 e y [0,1;0,5] ∩ [0;0,56] = 0,4) → colide
    const maisBaixo = { ...aereo, pose: { ...aereo.pose, z: 0.5 - ACIMA_1MM } };
    expect(colisoes(alvo, [maisBaixo], [])).toEqual({ moveis: ['b'], paredes: [] });
  });

  it('parede na tolerância: 0,5 mm não conta, exatamente 1 mm não conta, 1,5 mm conta', () => {
    // face horizontal com |d| = 4, então a profundidade é exatamente −y do canto:
    // 0,0005 < 0,001 → []; 0,001 não é "mais de 1 mm" → []; 0,0015 > 0,001 → [0]
    expect(colisoes(corpo('a', 1, -0.0005), [], [FACE])).toEqual({ moveis: [], paredes: [] });
    expect(colisoes(corpo('a', 1, -0.001), [], [FACE])).toEqual({ moveis: [], paredes: [] });
    expect(colisoes(corpo('a', 1, -0.0015), [], [FACE])).toEqual({ moveis: [], paredes: [0] });
  });

  it('parede: um canto projetado dentro do comprimento basta; todos fora não contam', () => {
    // pose (3,999;−0,05): cantos em x ∈ [3,999;4,599]; o canto (3,999;−0,05) está 0,05 m no sólido e
    // projetado em x = 3,999 ∈ [0;4] → [0], mesmo com os outros cantos além de b
    expect(colisoes(corpo('a', 3.999, -0.05), [], [FACE])).toEqual({ moveis: [], paredes: [0] });
    // pose (4,001;−0,05): todos os cantos no sólido projetados em x ≥ 4,001 > 4 → fora do comprimento → []
    expect(colisoes(corpo('a', 4.001, -0.05), [], [FACE])).toEqual({ moveis: [], paredes: [] });
  });

  it('espelhar a cena em x espelha o resultado (móveis e paredes)', () => {
    const alvo = corpo('a', 1, -0.05);
    const outro = corpo('b', 1.2, 0);
    const original = colisoes(alvo, [outro], [FACE]);
    // cenário original: alvo com canto (1;−0,05) no sólido (projeção x = 1 ∈ [0;4]) → parede 0;
    // o outro sobrepõe em x [1,2;1,6] ∩ [1;1,6] = 0,4 e y [0;0,56] ∩ [−0,05;0,51] = 0,51 → móvel 'b'
    expect(original).toEqual({ moveis: ['b'], paredes: [0] });
    // Espelho x → −x: a pose muda de sinal em x, a rotação também e `mirrored` inverte (E entra antes de R).
    // O espelho inverte a orientação do plano, então em a→b a troca mantém o sólido espelhado (y < 0 de novo).
    const espelhar = (c: Corpo): Corpo => ({
      ...c, pose: { ...c.pose, x: -c.pose.x, rotation: -c.pose.rotation, mirrored: !c.pose.mirrored },
    });
    const faceEspelhada: FaceDeParede = { a: v(-FACE.b.x, FACE.b.y), b: v(-FACE.a.x, FACE.a.y) };
    expect(colisoes(espelhar(alvo), [espelhar(outro)], [faceEspelhada])).toEqual(original);
  });

  it('trocar o alvo e o outro não muda quem colide', () => {
    // os mesmos quatro eixos do caso de 45°: as invasões (0,01; 0,56; 0,12304; 0,28706 m) não dependem
    // de qual dos dois é o alvo, então os dois sentidos colidem
    const xDoCanto = -0.56 * Math.sin(Math.PI / 4);
    const girada = corpo('g', 0.59 - xDoCanto, 0, { rotation: Math.PI / 4 });
    const parado = corpo('p', 0, 0);
    expect(colisoes(parado, [girada], []).moveis).toEqual(['g']);
    expect(colisoes(girada, [parado], []).moveis).toEqual(['p']);
  });

  it('é determinística e idempotente, e a ordem de `outros` não muda o resultado', () => {
    const alvo = corpo('a', 0, 0);
    const m1 = corpo('m1', 0.3, 0.2); // invasões 0,3 em x e 0,36 em y → colide
    const m2 = corpo('m2', 5, 5); // x [5;5,6] ∩ [0;0,6] = vazio → não colide
    const m3 = corpo('m3', 0.59, 0); // invasão 0,6 − 0,59 = 0,01 > 1 mm → colide
    const esperado = { moveis: ['m1', 'm3'], paredes: [] };
    expect(colisoes(alvo, [m1, m2, m3], [FACE])).toEqual(esperado);
    expect(colisoes(alvo, [m1, m2, m3], [FACE])).toEqual(esperado); // idempotência
    expect(colisoes(alvo, [m3, m1, m2], [FACE])).toEqual(esperado); // embaralhada
    expect(colisoes(alvo, [m2, m3, m1], [FACE])).toEqual(esperado); // embaralhada
  });

  it('entradas vazias: sem outros e sem faces devolvem vazio', () => {
    expect(colisoes(corpo('a', 0, 0), [], [])).toEqual({ moveis: [], paredes: [] });
    // com o alvo no lado livre da única face, a lista de paredes também fica vazia
    expect(colisoes(corpo('a', 1, 0.2), [], [FACE])).toEqual({ moveis: [], paredes: [] });
  });

  it('caixa com y mínimo negativo (porta que sobra à frente) conta na sobreposição', () => {
    // alvo com caixa y ∈ [−0,1;0,5]; o outro pequeno (0,2 × 0,02) fica todo em y ∈ [−0,09;−0,07],
    // isto é, só na sobra da porta: sem contar o y mínimo negativo os intervalos não se encontrariam
    const alvo = corpo('a', 0, 0, {}, { min: [0, -0.1, 0], max: [0.6, 0.5, 0.72] });
    const naSobra = corpo('b', 0.2, -0.09, {}, { min: [0, 0, 0], max: [0.2, 0.02, 0.3] });
    // y: [−0,09;−0,07] ∩ [−0,1;0,5] = 0,02 > 1 mm; x: [0,2;0,4] ∩ [0;0,6] = 0,2; altura: [0;0,3] ∩ [0;0,72] = 0,3
    expect(colisoes(alvo, [naSobra], [])).toEqual({ moveis: ['b'], paredes: [] });
  });

  it('ids repetidos em `outros` aparecem uma única vez', () => {
    // os dois 'z' se sobrepõem ao alvo (x 0,3 e 0,4 com invasão 0,3 e 0,2; y com invasão 0,36 e 0,46),
    // mas a saída não repete o id
    const alvo = corpo('a', 0, 0);
    expect(colisoes(alvo, [corpo('z', 0.3, 0.2), corpo('z', 0.4, 0.1)], [])).toEqual({ moveis: ['z'], paredes: [] });
  });

  it('parede e móvel ao mesmo tempo', () => {
    // alvo em (1;−0,05): canto 0,05 m no sólido com projeção x = 1 ∈ [0;4] → parede 0;
    // o outro em (1,2;0) sobrepõe em x [1,2;1,6] ∩ [1;1,6] = 0,4 e y [0;0,56] ∩ [−0,05;0,51] = 0,51
    expect(colisoes(corpo('a', 1, -0.05), [corpo('b', 1.2, 0)], [FACE])).toEqual({ moveis: ['b'], paredes: [0] });
  });

  it.skip('projeção exatamente na ponta da face (x = 4): dentro ou fora do comprimento é ambíguo', () => {
    // A spec diz "a projeção dentro do comprimento da face": com o canto projetado exatamente em b = (4;0)
    // não fica claro se [0;4] é fechado. A leitura fechada daria [0] e a aberta, [].
    expect(colisoes(corpo('a', 4, -0.05), [], [FACE])).toEqual({ moveis: [], paredes: [0] });
  });

  it.skip('caixa maior que a face cobre o segmento sem canto projetado dentro: "atravessa" x regra do canto', () => {
    // Caixa x ∈ [−1;5], y ∈ [−0,05;0,5] atravessa o segmento [0;4], mas os dois cantos no sólido estão
    // projetados em x = −1 e x = 5, fora do comprimento: a regra do canto da spec diria [] e o comentário
    // de `Colisoes` em `encaixeTipos` ("faces que o móvel atravessa") diria [0].
    const grande = corpo('a', -1, -0.05, {}, { min: [0, 0, 0], max: [6, 0.55, 0.72] });
    expect(colisoes(grande, [], [FACE])).toEqual({ moveis: [], paredes: [0] });
  });
});
