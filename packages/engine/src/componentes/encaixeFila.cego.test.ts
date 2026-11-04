import { describe, expect, it } from 'vitest';
import type { CaixaLocal, Pose, PreenchimentoDeVao, PosicaoNaFila } from './encaixeTipos.ts';
import { retanguloNoMundo } from './encaixeColisao.ts';
import { ajustarLarguras, posicoesDaFila, preencherVao } from './encaixeFila.ts';

/*
 * Testes CEGOS de `preencherVao`, `ajustarLarguras` e `posicoesDaFila`, escritos só a partir da especificação da
 * ficha T-F2-fila. Cada valor esperado tem a conta feita à mão no comentário ao lado; a função testada NUNCA é
 * usada para calcular o esperado. Tolerância: 1e-9 (9 casas decimais no `toBeCloseTo`).
 */

const CASAS = 9;
const ALTURA = 0.72;

/** Compara o resultado de `preencherVao` com módulos, painel e sobra calculados à mão. */
function esperarPreenchimento(r: PreenchimentoDeVao, modulos: readonly number[], painel: number, sobra: number): void {
  expect(r.modulos).toHaveLength(modulos.length);
  r.modulos.forEach((w, i) => expect(w).toBeCloseTo(modulos[i]!, CASAS));
  expect(r.painel).toBeCloseTo(painel, CASAS);
  expect(r.sobra).toBeCloseTo(sobra, CASAS);
}

/** Compara as novas larguras de `ajustarLarguras` com as calculadas à mão. */
function esperarLarguras(r: readonly number[], esperado: readonly number[]): void {
  expect(r).toHaveLength(esperado.length);
  r.forEach((w, i) => expect(w).toBeCloseTo(esperado[i]!, CASAS));
}

/** Confere que a soma em micrômetros inteiros é exatamente `total` (a especificação exige µm exatos quando cabe). */
function esperarSomaEmMicra(larguras: readonly number[], total: number): void {
  const soma = larguras.reduce((t, w) => t + Math.round(w * 1_000_000), 0);
  expect(soma).toBe(Math.round(total * 1_000_000));
}

/** Caixa local de um módulo da fila: largura × profundidade, apoiada no chão. */
function caixaDaLargura(largura: number, profundidade: number): CaixaLocal {
  return { min: [0, 0, 0], max: [largura, profundidade, ALTURA] };
}

/** Compara uma pose com os valores calculados à mão. */
function esperarPose(p: Pose, x: number, y: number, rotation: number, z = 0): void {
  expect(p.x).toBeCloseTo(x, CASAS);
  expect(p.y).toBeCloseTo(y, CASAS);
  expect(p.rotation).toBeCloseTo(rotation, CASAS);
  expect(p.mirrored).toBe(false);
  expect(p.z).toBeCloseTo(z, CASAS);
}

/** Compara índice, início e largura de uma posição da fila. */
function esperarPosicao(p: PosicaoNaFila, indice: number, inicio: number, largura: number): void {
  expect(p.indice).toBe(indice);
  expect(p.inicio).toBeCloseTo(inicio, CASAS);
  expect(p.largura).toBeCloseTo(largura, CASAS);
}

/** Compara os 4 cantos do retângulo no mundo, na ordem local devolvida por `retanguloNoMundo`. */
function esperarCantos(cantos: ReadonlyArray<{ x: number; y: number }>, esperado: ReadonlyArray<readonly [number, number]>): void {
  expect(cantos).toHaveLength(esperado.length);
  cantos.forEach((p, i) => {
    expect(p.x).toBeCloseTo(esperado[i]![0], CASAS);
    expect(p.y).toBeCloseTo(esperado[i]![1], CASAS);
  });
}

describe('preencherVao', () => {
  it('vão 1,8 m com 0,6 e 0,8: três módulos de 0,6 fecham exato', () => {
    // 3 × 0,6 = 1,8 → painel 0 e sobra 0; ordem não crescente.
    esperarPreenchimento(preencherVao(1.8, [0.6, 0.8]), [0.6, 0.6, 0.6], 0, 0);
  });

  it('vão 1,5 m com 0,6 e 0,8: 0,8 + 0,6 e painel de 0,1', () => {
    // 0,8 + 0,6 = 1,4; resto 0,1 fica na banda do painel → painel 0,1, sobra 0.
    esperarPreenchimento(preencherVao(1.5, [0.6, 0.8]), [0.8, 0.6], 0.1, 0);
  });

  it('vão 0,1 m: painel sozinho fecha o vão', () => {
    // 0,1 ∈ [0,02; 0,15]: nenhum módulo cabe, então módulos [] e painel 0,1.
    esperarPreenchimento(preencherVao(0.1, [0.6]), [], 0.1, 0);
  });

  it('vão 0,01 m: abaixo do painel mínimo, sobra 0,01 sem painel', () => {
    // 0,01 < 0,02: não cabe painel; módulo 0,6 não cabe → sobra 0,01.
    esperarPreenchimento(preencherVao(0.01, [0.6]), [], 0, 0.01);
  });

  it('vão 0: tudo zero', () => {
    // Sem vão, não há módulo nem painel; sobra max(0, 0) = 0.
    esperarPreenchimento(preencherVao(0, [0.6]), [], 0, 0);
  });

  it('sem larguras: sobra é o vão inteiro', () => {
    // Nenhum módulo disponível e 1 m > painelMax → painel 0 e sobra 1.
    esperarPreenchimento(preencherVao(1, []), [], 0, 1);
  });

  it('determinismo: mesma entrada três vezes e ordem embaralhada', () => {
    // Ordem das larguras de entrada não altera a saída (a saída é ordenada de forma não crescente).
    const a = preencherVao(1.5, [0.6, 0.8]);
    const b = preencherVao(1.5, [0.6, 0.8]);
    const c = preencherVao(1.5, [0.8, 0.6]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    esperarPreenchimento(a, [0.8, 0.6], 0.1, 0);
  });

  it('vão 1,4 m: 0,8 + 0,6 fecha exato, sem painel', () => {
    // 0,8 + 0,6 = 1,4 → painel 0 e sobra 0.
    esperarPreenchimento(preencherVao(1.4, [0.6, 0.8]), [0.8, 0.6], 0, 0);
  });

  it('largura igual ao vão: um módulo fecha exato', () => {
    // 0,6 cobre o vão de 0,6 → módulos [0,6], painel 0 e sobra 0.
    esperarPreenchimento(preencherVao(0.6, [0.6]), [0.6], 0, 0);
  });

  it('painel exatamente no mínimo (0,02) ainda fecha o vão', () => {
    // Painel sozinho no limite inferior [painelMin, painelMax] → painel 0,02 e sobra 0.
    esperarPreenchimento(preencherVao(0.02, [0.6]), [], 0.02, 0);
  });

  it('painel exatamente no máximo (0,15) ainda fecha o vão', () => {
    // Painel sozinho no limite superior → painel 0,15 e sobra 0.
    esperarPreenchimento(preencherVao(0.15, [0.6]), [], 0.15, 0);
  });

  it('vão negativo: sobra zero', () => {
    // Vão ≤ 0 não tem o que cobrir: módulos [], painel 0 e sobra max(−1, 0) = 0.
    esperarPreenchimento(preencherVao(-1, [0.6]), [], 0, 0);
  });

  it.skip('vão 0,2 m sem módulo que caiba: o painel é limitado ao painelMax? — a ficha não declara o teto fora dos exemplos', () => {
    // 0,2 > 0,15: a ficha não diz se o painel para em painelMax (sobra 0,05) ou acompanha o resto (sobra 0).
  });

  it.skip('empate de sobra e painel com contagens diferentes: menos módulos ou larguras maiores? — critério de desempate não transcrito na ficha', () => {
    // A ficha cita "o critério declarado" sem transcrevê-lo; não dá para fixar o esperado sem inventar.
  });
});

describe('ajustarLarguras', () => {
  it('divide a diferença igualmente e reparte o resto de µm para os primeiros', () => {
    // Soma atual 1,8; faltam 0,2 = 200 000 µm para 2,0 em 3 flexíveis:
    // 200 000 / 3 = 66 666,67 → 66 667 µm nos dois primeiros e 66 666 µm no último.
    // Larguras: 0,6 + 0,066667 = 0,666667; 0,6 + 0,066666 = 0,666666.
    const r = ajustarLarguras([0.6, 0.6, 0.6], [[0.4, 0.8], [0.4, 0.8], [0.4, 0.8]], 2.0);
    esperarLarguras(r, [0.666667, 0.666667, 0.666666]);
    esperarSomaEmMicra(r, 2.0);
  });

  it('módulo travado no limite não recebe nada; os outros dois dividem 0,2', () => {
    // O primeiro já está no máximo 0,6; sobram 0,2 para os dois flexíveis → 0,1 cada: [0,6; 0,7; 0,7].
    const r = ajustarLarguras([0.6, 0.6, 0.6], [[0.6, 0.6], [0.4, 1.0], [0.4, 1.0]], 2.0);
    esperarLarguras(r, [0.6, 0.7, 0.7]);
    esperarSomaEmMicra(r, 2.0);
  });

  it('total além do máximo possível: todas no máximo', () => {
    // Máximos 0,7 e 0,8 somam 1,5 < 5,0: devolve os limites superiores.
    esperarLarguras(ajustarLarguras([0.6, 0.6], [[0.4, 0.7], [0.5, 0.8]], 5.0), [0.7, 0.8]);
  });

  it('total abaixo do mínimo possível: todas no mínimo', () => {
    // Mínimos 0,5 e 0,55 somam 1,05 > 0,1: devolve os limites inferiores.
    esperarLarguras(ajustarLarguras([0.6, 0.6], [[0.5, 0.7], [0.55, 0.8]], 0.1), [0.5, 0.55]);
  });

  it('um flexível bate no limite e repassa o excedente ao outro', () => {
    // Soma atual 1,2; faltam 0,3, divididos em 0,15 cada. O primeiro para em 0,65 (0,6 + 0,05);
    // os 0,10 restantes vão para o segundo: 0,6 + 0,15 + 0,10 = 0,85.
    const r = ajustarLarguras([0.6, 0.6], [[0.5, 0.65], [0.4, 1.0]], 1.5);
    esperarLarguras(r, [0.65, 0.85]);
    esperarSomaEmMicra(r, 1.5);
  });

  it('módulo não flexível permanece; o flexível recebe toda a diferença', () => {
    // O primeiro tem min = max = 0,6; o segundo absorve os 0,2: 0,6 + 0,2 = 0,8.
    const r = ajustarLarguras([0.6, 0.6], [[0.6, 0.6], [0.4, 1.0]], 1.4);
    esperarLarguras(r, [0.6, 0.8]);
    esperarSomaEmMicra(r, 1.4);
  });

  it('encolhe igualmente quando o total é menor', () => {
    // Soma atual 1,8; faltam −0,3, divididos em −0,1 cada → [0,5; 0,5; 0,5].
    const r = ajustarLarguras([0.6, 0.6, 0.6], [[0.4, 0.8], [0.4, 0.8], [0.4, 0.8]], 1.5);
    esperarLarguras(r, [0.5, 0.5, 0.5]);
    esperarSomaEmMicra(r, 1.5);
  });

  it('encolhendo, o primeiro trava no mínimo e repassa o resto', () => {
    // Soma atual 1,2; faltam −0,2 → −0,1 cada: [0,5; 0,5]; o primeiro sobe para o mínimo 0,55
    // (sobram −0,05) e o segundo recebe o resto: 0,5 − 0,05 = 0,45.
    const r = ajustarLarguras([0.6, 0.6], [[0.55, 0.7], [0.4, 0.8]], 1.0);
    esperarLarguras(r, [0.55, 0.45]);
    esperarSomaEmMicra(r, 1.0);
  });

  it('total igual à soma atual: não muda nada', () => {
    // 0,6 + 0,7 = 1,3 = total → devolve as mesmas larguras.
    esperarLarguras(ajustarLarguras([0.6, 0.7], [[0.4, 0.8], [0.5, 0.9]], 1.3), [0.6, 0.7]);
  });

  it('entrada vazia: devolve lista vazia', () => {
    // Sem módulos não dá para somar 1,0; a lista resultante é vazia.
    expect(ajustarLarguras([], [], 1.0)).toEqual([]);
  });

  it('arredonda e reparte o resto de 1 µm entre os flexíveis', () => {
    // Soma atual 0,999999; falta 1 µm para 1,0: vai inteiro para o primeiro flexível.
    // [0,333333; 0,333333; 0,333333] → [0,333334; 0,333333; 0,333333].
    const r = ajustarLarguras([0.333333, 0.333333, 0.333333], [[0.1, 1], [0.1, 1], [0.1, 1]], 1.0);
    esperarLarguras(r, [0.333334, 0.333333, 0.333333]);
    esperarSomaEmMicra(r, 1.0);
  });

  it('simetria: inverter larguras e limites inverte o resultado', () => {
    // Direto: o segundo (flexível) absorve +0,2 → [0,6; 0,8].
    esperarLarguras(ajustarLarguras([0.6, 0.6], [[0.6, 0.6], [0.4, 1.0]], 1.4), [0.6, 0.8]);
    // Espelhado: o primeiro (flexível) absorve +0,2 → [0,8; 0,6].
    esperarLarguras(ajustarLarguras([0.6, 0.6], [[0.4, 1.0], [0.6, 0.6]], 1.4), [0.8, 0.6]);
  });

  it('idempotência: reajustar o resultado com o mesmo total não muda as larguras', () => {
    // Primeiro ajuste: [0,65; 0,85]; a soma já é 1,5, então o segundo ajuste não mexe.
    const primeira = ajustarLarguras([0.6, 0.6], [[0.5, 0.65], [0.4, 1.0]], 1.5);
    esperarLarguras(primeira, [0.65, 0.85]);
    esperarLarguras(ajustarLarguras(primeira, [[0.5, 0.65], [0.4, 1.0]], 1.5), [0.65, 0.85]);
  });
});

describe('posicoesDaFila', () => {
  it('linha horizontal 0→4: módulos colados a partir de a, frente em y = 0,56', () => {
    // d = (1, 0) → rotação atan2(−0, −1) = π (a ficha fixa π). A origem local cai a `inicio + largura`
    // de a, deslocada 0,56 para a esquerda de d (+y). Índice 0: início 0, largura 0,6 → x = 0,6, y = 0,56.
    // Índice 1: início 0,6, largura 0,8 → x = 0,6 + 0,8 = 1,4, y = 0,56.
    const ps = posicoesDaFila({ x: 0, y: 0 }, { x: 4, y: 0 }, [0.6, 0.8], 0.56);
    expect(ps).toHaveLength(2);
    esperarPosicao(ps[0]!, 0, 0, 0.6);
    esperarPose(ps[0]!.pose, 0.6, 0.56, Math.PI);
    esperarPosicao(ps[1]!, 1, 0.6, 0.8);
    esperarPose(ps[1]!.pose, 1.4, 0.56, Math.PI);

    // Retângulo do módulo 0 (0,6 × 0,56): fundo local y = 0,56 cai em y = 0; frente local y = 0 cai em
    // y = 0,56; x vai de 0 a 0,6. Ordem local: (min,min), (max,min), (max,max), (min,max).
    // R(π)·(lx, ly) = (−lx, −ly), somado a (0,6; 0,56): (0,0)→(0,6; 0,56); (0,6; 0)→(0; 0,56);
    // (0,6; 0,56)→(0; 0); (0; 0,56)→(0,6; 0).
    esperarCantos(retanguloNoMundo(ps[0]!.pose, caixaDaLargura(0.6, 0.56)), [[0.6, 0.56], [0, 0.56], [0, 0], [0.6, 0]]);
  });

  it('linha vertical 0→4: fundo em x = 0 e frente em x = −profundidade', () => {
    // d = (0, 1) → rotação atan2(−1, −0) = −π/2; início 0, largura 0,6 → avanço 0,6.
    // Origem local: x = 0 + 0,6·0 − 0,56·1 = −0,56; y = 0 + 0,6·1 + 0,56·0 = 0,6.
    const ps = posicoesDaFila({ x: 0, y: 0 }, { x: 0, y: 4 }, [0.6], 0.56);
    expect(ps).toHaveLength(1);
    esperarPosicao(ps[0]!, 0, 0, 0.6);
    esperarPose(ps[0]!.pose, -0.56, 0.6, -Math.PI / 2);

    // R(−π/2)·(lx, ly) = (ly, −lx), somado a (−0,56; 0,6): (0,0)→(−0,56; 0,6); (0,6; 0)→(−0,56; 0);
    // (0,6; 0,56)→(0; 0); (0; 0,56)→(0; 0,6). Fundo (ly = 0,56) em x = 0; frente (ly = 0) em x = −0,56.
    esperarCantos(retanguloNoMundo(ps[0]!.pose, caixaDaLargura(0.6, 0.56)), [[-0.56, 0.6], [-0.56, 0], [0, 0], [0, 0.6]]);
  });

  it('sem larguras: fila vazia', () => {
    // Nenhum módulo para posicionar, qualquer que seja a linha.
    expect(posicoesDaFila({ x: 1, y: 2 }, { x: 1, y: 4 }, [], 0.56)).toEqual([]);
  });

  it('leva o z informado para todas as poses', () => {
    // Linha vertical deslocada: a = (1, 2), b = (1, 4), largura 0,5, profundidade 0,3.
    // d = (0, 1), rotação −π/2; origem x = 1 − 0,3 = 0,7; y = 2 + 0,5 = 2,5; z do resultado = 0,8.
    const ps = posicoesDaFila({ x: 1, y: 2 }, { x: 1, y: 4 }, [0.5], 0.3, 0.8);
    expect(ps).toHaveLength(1);
    esperarPosicao(ps[0]!, 0, 0, 0.5);
    esperarPose(ps[0]!.pose, 0.7, 2.5, -Math.PI / 2, 0.8);
  });

  it('determinismo: duas chamadas iguais devolvem o mesmo resultado', () => {
    // Função pura: mesma linha, mesmas larguras e mesma profundidade → mesma lista.
    const a = posicoesDaFila({ x: 0, y: 0 }, { x: 4, y: 0 }, [0.6, 0.8], 0.56);
    const b = posicoesDaFila({ x: 0, y: 0 }, { x: 4, y: 0 }, [0.6, 0.8], 0.56);
    expect(b).toEqual(a);
  });

  it('simetria por rotação de π: posições e rotações giram junto com a linha', () => {
    // Girar a cena π na origem leva a = (0,0), b = (4,0) em a = (0,0), b = (−4,0), e (x, y, rotação)
    // em (−x, −y, rotação + π). Do caso horizontal: (0,6; 0,56; π) → (−0,6; −0,56; 0) e
    // (1,4; 0,56; π) → (−1,4; −0,56; 0). d = (−1, 0) → atan2(−0, 1) = 0.
    const ps = posicoesDaFila({ x: 0, y: 0 }, { x: -4, y: 0 }, [0.6, 0.8], 0.56);
    expect(ps).toHaveLength(2);
    esperarPosicao(ps[0]!, 0, 0, 0.6);
    esperarPose(ps[0]!.pose, -0.6, -0.56, 0);
    esperarPosicao(ps[1]!, 1, 0.6, 0.8);
    esperarPose(ps[1]!.pose, -1.4, -0.56, 0);
  });

  it.skip('linha degenerada (a = b): a especificação não diz o que devolver nem se lança', () => {
    // Não há direção d; inventar um resultado (lista vazia ou erro) seria adivinhar.
  });
});
