import { describe, expect, it } from 'vitest';
import type { CaixaLocal, Corpo, EncaixeNoVizinho, Guia, LadoDeUniao, Pose } from './encaixeTipos.ts';
import { retanguloNoMundo } from './encaixeColisao.ts';
import { encaixarNoVizinho, guiasDeAlinhamento } from './encaixeVizinho.ts';

/*
 * Testes CEGOS de `encaixarNoVizinho` e `guiasDeAlinhamento`, escritos só a partir da especificação da ficha
 * T-F2-vizinho. Cada valor esperado tem a conta feita à mão no comentário ao lado; a função testada NUNCA é usada
 * para calcular o esperado. Tolerância: 1e-9 (9 casas decimais no `toBeCloseTo`).
 */

const caixaBase: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 0.72] };

function pose(x: number, y: number, extra: Partial<Pose> = {}): Pose {
  return { x, y, rotation: 0, mirrored: false, z: 0, ...extra };
}

function corpo(id: string, x: number, y: number, extra: Partial<Pose> = {}, caixa: CaixaLocal = caixaBase): Corpo {
  return { id, pose: pose(x, y, extra), caixa };
}

interface EncaixeEsperado {
  vizinho: string;
  x: number;
  y: number;
  rotation: number;
  lado: LadoDeUniao;
  folga: number;
  z?: number;
}

/** Compara o resultado do encaixe com os valores calculados à mão. */
function esperarEncaixe(r: EncaixeNoVizinho | null, e: EncaixeEsperado): void {
  expect(r).not.toBeNull();
  if (r === null) return;
  expect(r.vizinho).toBe(e.vizinho);
  expect(r.lado).toBe(e.lado);
  expect(r.folga).toBeCloseTo(e.folga, 9);
  expect(r.pose.x).toBeCloseTo(e.x, 9);
  expect(r.pose.y).toBeCloseTo(e.y, 9);
  expect(r.pose.rotation).toBeCloseTo(e.rotation, 9);
  if (e.z !== undefined) expect(r.pose.z).toBeCloseTo(e.z, 9);
}

/** Tipo do corpo móvel no mundo: pose + caixa (o id não importa para a cobertura da guia). */
interface CorpoNoMundo {
  pose: Pose;
  caixa: CaixaLocal;
}

/** Compara as duas pontas da guia como conjunto ordenado (a ordem `a`/`b` do contrato não é afirmada). */
function esperarPontas(g: Guia, p1: readonly [number, number], p2: readonly [number, number]): void {
  const a: readonly [number, number] = [g.a.x, g.a.y];
  const b: readonly [number, number] = [g.b.x, g.b.y];
  const troca = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const primeira = troca ? b : a;
  const segunda = troca ? a : b;
  expect(primeira[0]).toBeCloseTo(p1[0], 9);
  expect(primeira[1]).toBeCloseTo(p1[1], 9);
  expect(segunda[0]).toBeCloseTo(p2[0], 9);
  expect(segunda[1]).toBeCloseTo(p2[1], 9);
}

/** A guia, projetada na própria direção, tem de conter os cantos dos dois retângulos (cobre ambos). */
function esperarCobre(g: Guia, corpos: readonly CorpoNoMundo[]): void {
  const dx = g.b.x - g.a.x;
  const dy = g.b.y - g.a.y;
  const comprimento = Math.hypot(dx, dy);
  expect(comprimento).toBeGreaterThan(0);
  const ux = dx / comprimento;
  const uy = dy / comprimento;
  for (const c of corpos) {
    for (const p of retanguloNoMundo(c.pose, c.caixa)) {
      const t = (p.x - g.a.x) * ux + (p.y - g.a.y) * uy;
      expect(t).toBeGreaterThanOrEqual(-1e-9);
      expect(t).toBeLessThanOrEqual(comprimento + 1e-9);
    }
  }
}

describe('encaixarNoVizinho', () => {
  it('B mais perto da direita de A: encosta pela esquerda, alinha rotação e frente', () => {
    // B em x 0,63 (largura 0,6): lateral esquerda 0,63; direita de A 0,6 → folga 0,03. Escolhe 'esquerda'.
    // Rotação 0,05 → múltiplo mais próximo 0 (diferença 0,05 ≤ 15°). Frente: y mínimo 0.
    // Ao encostar, a esquerda de B vai para 0,6 → origem x = 0,6 (min x da caixa = 0).
    const r = encaixarNoVizinho(pose(0.63, 0.02, { rotation: 0.05 }), caixaBase, [corpo('A', 0, 0)]);
    esperarEncaixe(r, { vizinho: 'A', x: 0.6, y: 0, rotation: 0, lado: 'esquerda', folga: 0 });
  });

  it('B mais perto da esquerda de A: encosta pela direita', () => {
    // B em x −0,63: direita de B = −0,63 + 0,6 = −0,03; esquerda de A = 0 → folga 0,03. Escolhe 'direita'.
    // Ao encostar, a direita de B vai para 0 → origem x = 0 − 0,6 = −0,6. Frente y = 0.
    const r = encaixarNoVizinho(pose(-0.63, 0.02, { rotation: -0.05 }), caixaBase, [corpo('A', 0, 0)]);
    esperarEncaixe(r, { vizinho: 'A', x: -0.6, y: 0, rotation: 0, lado: 'direita', folga: 0 });
  });

  it('folga 0,002 afasta 2 mm a face encostada', () => {
    // Mesma cena do primeiro caso: esquerda de B = direita de A (0,6) + folga 0,002 = 0,602.
    const r = encaixarNoVizinho(pose(0.63, 0.02, { rotation: 0.05 }), caixaBase, [corpo('A', 0, 0)], { folga: 0.002 });
    esperarEncaixe(r, { vizinho: 'A', x: 0.602, y: 0, rotation: 0, lado: 'esquerda', folga: 0.002 });
  });

  it('distância entre laterais 0,2: rejeita no padrão 0,10 e aceita com distanciaMax 0,25', () => {
    // B em x 0,8: esquerda de B 0,8 − direita de A 0,6 = 0,2 > 0,10.
    const a = corpo('A', 0, 0);
    expect(encaixarNoVizinho(pose(0.8, 0.02), caixaBase, [a])).toBeNull();
    // Com distanciaMax 0,25, encaixa: esquerda de B volta a 0,6.
    const r = encaixarNoVizinho(pose(0.8, 0.02), caixaBase, [a], { distanciaMax: 0.25 });
    esperarEncaixe(r, { vizinho: 'A', x: 0.6, y: 0, rotation: 0, lado: 'esquerda', folga: 0 });
  });

  it('vizinho girado π/2: alinha a rotação a π/2 e a frente no sistema do vizinho', () => {
    // A em (0,0), rotação π/2: retângulo no mundo x ∈ [−0,56, 0], y ∈ [0, 0,6].
    // B parte em (0,03; 0,63) com rotação π/2 + 0,05 (diferença 0,05). No sistema local de A (R(−π/2)),
    // a caixa de B cai em x ∈ [≈0,602, ≈1,229], y ∈ [≈−0,03, ≈0,559]: encosta pela esquerda (folga ≈0,002).
    // Encaixada: origem local (0,6; 0) → mundo R(π/2)·(0,6;0) = (0; 0,6). Rotação resultante π/2.
    const r = encaixarNoVizinho(pose(0.03, 0.63, { rotation: Math.PI / 2 + 0.05 }), caixaBase, [corpo('A', 0, 0, { rotation: Math.PI / 2 })]);
    esperarEncaixe(r, { vizinho: 'A', x: 0, y: 0.6, rotation: Math.PI / 2, lado: 'esquerda', folga: 0 });
  });

  it('diferença de 30° ao múltiplo de 90°: null', () => {
    // Rotação π/6 = 30°; múltiplo de 90° mais próximo = 0; 30° > 15° padrão.
    expect(encaixarNoVizinho(pose(0.63, 0.02, { rotation: Math.PI / 6 }), caixaBase, [corpo('A', 0, 0)])).toBeNull();
  });

  it('altura: vizinho sem sobreposição é ignorado; com sobreposição é considerado', () => {
    // A a z 1,5 com altura 0,72 → faixa [1,5; 2,22]; B a z 0 → [0; 0,72]: sem sobreposição, ignora.
    const aAlto = corpo('A', 0, 0, { z: 1.5 });
    expect(encaixarNoVizinho(pose(0.63, 0.02), caixaBase, [aAlto])).toBeNull();
    // B a z 1,0 → [1,0; 1,72] sobrepõe 0,22 com A: considera; o z do resultado fica 1,0.
    const r = encaixarNoVizinho(pose(0.63, 0.02, { z: 1.0 }), caixaBase, [aAlto]);
    esperarEncaixe(r, { vizinho: 'A', x: 0.6, y: 0, rotation: 0, lado: 'esquerda', folga: 0, z: 1.0 });
  });

  it('vários vizinhos: menor distância vence; empate desempata pelo menor id', () => {
    // B em x 0,63: distância 0,03 até A (direita 0,6) e 0,01 até C (esquerda 1,24) → escolhe C.
    // C está à direita: direita de B toca 1,24 → origem x = 1,24 − 0,6 = 0,64.
    const r = encaixarNoVizinho(pose(0.63, 0.02), caixaBase, [corpo('A', 0, 0), corpo('C', 1.24, 0)]);
    esperarEncaixe(r, { vizinho: 'C', x: 0.64, y: 0, rotation: 0, lado: 'direita', folga: 0 });

    // Empate: A(z) à esquerda (lateral 0,6) e a(a) à direita (lateral 1,26) ficam a 0,03 de B.
    // Menor id 'a' vence: direita de B toca 1,26 → origem x = 1,26 − 0,6 = 0,66.
    const z = corpo('z', 0, 0);
    const aa = corpo('a', 1.26, 0);
    const empate = encaixarNoVizinho(pose(0.63, 0.02), caixaBase, [z, aa]);
    esperarEncaixe(empate, { vizinho: 'a', x: 0.66, y: 0, rotation: 0, lado: 'direita', folga: 0 });

    // Determinismo: a ordem da lista de vizinhos não muda o resultado.
    const outraOrdem = encaixarNoVizinho(pose(0.63, 0.02), caixaBase, [aa, z]);
    expect(outraOrdem).toEqual(empate);
  });

  it('idempotência: encaixar de novo a pose já encaixada dá a mesma pose', () => {
    // Primeiro encaixe: esquerda de B em 0,6, frente y = 0.
    const a = corpo('A', 0, 0);
    const r1 = encaixarNoVizinho(pose(0.63, 0.02, { rotation: 0.05 }), caixaBase, [a]);
    expect(r1).not.toBeNull();
    if (r1 === null) return;
    // Repetindo com a pose resultante (folga 0): distância 0, esquerda continua em 0,6 e y em 0.
    const r2 = encaixarNoVizinho(r1.pose, caixaBase, [a]);
    esperarEncaixe(r2, { vizinho: 'A', x: 0.6, y: 0, rotation: 0, lado: 'esquerda', folga: 0 });
  });

  it('simetria: espelhar a cena em x espelha o encaixe e troca o lado', () => {
    // Caso 1: x = 0,6, 'esquerda'. Reflexo (x → −x, rotação → −rotação): x = −0,6, 'direita'.
    const dir = encaixarNoVizinho(pose(0.63, 0.02, { rotation: 0.05 }), caixaBase, [corpo('A', 0, 0)]);
    const esq = encaixarNoVizinho(pose(-0.63, 0.02, { rotation: -0.05 }), caixaBase, [corpo('A', 0, 0)]);
    expect(dir).not.toBeNull();
    expect(esq).not.toBeNull();
    if (dir === null || esq === null) return;
    expect(dir.pose.x).toBeCloseTo(0.6, 9);
    expect(esq.pose.x).toBeCloseTo(-0.6, 9);
    expect(dir.pose.y).toBeCloseTo(0, 9);
    expect(esq.pose.y).toBeCloseTo(0, 9);
    expect(dir.lado).toBe('esquerda');
    expect(esq.lado).toBe('direita');
  });

  it('limite de distância: 0,10 exato ainda encaixa (≤ distanciaMax)', () => {
    // B em x 0,7: esquerda de B 0,7 − direita de A 0,6 = 0,10 = máximo padrão.
    const r = encaixarNoVizinho(pose(0.7, 0.02), caixaBase, [corpo('A', 0, 0)]);
    esperarEncaixe(r, { vizinho: 'A', x: 0.6, y: 0, rotation: 0, lado: 'esquerda', folga: 0 });
  });

  it('limite de ângulo: diferença igual a anguloMax ainda alinha (≤)', () => {
    // Rotação 0,3 rad e anguloMax 0,3. distanciaMax folgado (0,5) para isolar o teste do ângulo.
    // Alinhada a rotação a 0, a esquerda de B vai para 0,6 e a frente para y = 0.
    const r = encaixarNoVizinho(pose(0.63, 0.02, { rotation: 0.3 }), caixaBase, [corpo('A', 0, 0)], { anguloMax: 0.3, distanciaMax: 0.5 });
    esperarEncaixe(r, { vizinho: 'A', x: 0.6, y: 0, rotation: 0, lado: 'esquerda', folga: 0 });
  });

  it('entradas vazias: sem vizinhos, null', () => {
    expect(encaixarNoVizinho(pose(0, 0), caixaBase, [])).toBeNull();
  });

  it.skip('móvel espelhado: posição e lado — a especificação não diz se o espelho do móvel/vizinho entra no sistema local', () => {
    // Ambíguo: não dá para calcular o esperado à mão sem inventar uma convenção.
  });
});

describe('guiasDeAlinhamento', () => {
  it('mesma linha: frente, fundo e uma guia de centro, cobrindo os dois móveis', () => {
    // Móveis em (0,0) e (0,7,0), caixa 0,6 × 0,56. Frente y = 0; fundo y = 0,56;
    // centro em y = (0 + 0,56)/2 = 0,28. Ao longo de x as caixas vão de 0 a 0,7 + 0,6 = 1,3.
    // (O nome centro-x/centro-y é ambíguo — ver it.skip no fim; só se exige uma guia horizontal de centro.)
    const alvo = pose(0, 0);
    const outro = corpo('b', 0.7, 0);
    const gs = guiasDeAlinhamento(alvo, caixaBase, [outro]);
    expect(gs).toHaveLength(3);
    expect(gs[0]!.tipo).toBe('frente');
    expect(gs[1]!.tipo).toBe('fundo');
    expect(['centro-x', 'centro-y']).toContain(gs[2]!.tipo);
    expect(gs.map((g) => g.com)).toEqual(['b', 'b', 'b']);
    esperarPontas(gs[0]!, [0, 0], [1.3, 0]);
    esperarPontas(gs[1]!, [0, 0.56], [1.3, 0.56]);
    esperarPontas(gs[2]!, [0, 0.28], [1.3, 0.28]);
    const dois: CorpoNoMundo[] = [{ pose: alvo, caixa: caixaBase }, outro];
    for (const g of gs) esperarCobre(g, dois);
  });

  it('frentes deslocadas 0,005 (dentro da tolerância 0,01): guia frente cobre ambos', () => {
    // Frente do alvo y = 0; do outro y = 0,005; |0,005| ≤ 0,01 → guia. A reta fica entre 0 e 0,005.
    const alvo = pose(0, 0);
    const outro = corpo('b', 0.7, 0.005);
    const gs = guiasDeAlinhamento(alvo, caixaBase, [outro]);
    const frente = gs.find((g) => g.tipo === 'frente');
    expect(frente).toBeDefined();
    if (frente === undefined) return;
    expect(frente.com).toBe('b');
    expect(frente.a.y).toBeGreaterThanOrEqual(-1e-9);
    expect(frente.a.y).toBeLessThanOrEqual(0.005 + 1e-9);
    expect(Math.abs(frente.b.y - frente.a.y)).toBeLessThanOrEqual(1e-9);
    esperarCobre(frente, [{ pose: alvo, caixa: caixaBase }, outro]);
  });

  it('frentes deslocadas 0,02 (fora da tolerância 0,01): nenhuma guia', () => {
    // Frente 0 vs 0,02; fundo 0,56 vs 0,58; centro-y 0,28 vs 0,30: todas 0,02 > 0,01.
    expect(guiasDeAlinhamento(pose(0, 0), caixaBase, [corpo('b', 0.7, 0.02)])).toEqual([]);
  });

  it('rotação não paralela (30°): nenhuma guia', () => {
    // Diferença π/6 = 30°, que não é múltipla de 90°.
    expect(guiasDeAlinhamento(pose(0, 0), caixaBase, [corpo('b', 0.7, 0, { rotation: Math.PI / 6 })])).toEqual([]);
  });

  it('aresta vertical: esquerda em x = 0 cobre os dois móveis', () => {
    // 'a' em (0,0.7) com caixa 0,5 × 0,5: esquerda x = 0 coincide; direita 0,5 ≠ 0,6 e centro 0,25 ≠ 0,3.
    // A guia vertical vai de y = 0 (alvo) a 0,7 + 0,5 = 1,2 (outro).
    const caixaEstreita: CaixaLocal = { min: [0, 0, 0], max: [0.5, 0.5, 0.72] };
    const alvo = pose(0, 0);
    const a = corpo('a', 0, 0.7, {}, caixaEstreita);
    const gs = guiasDeAlinhamento(alvo, caixaBase, [a]);
    expect(gs).toHaveLength(1);
    expect(gs[0]!.tipo).toBe('esquerda');
    expect(gs[0]!.com).toBe('a');
    esperarPontas(gs[0]!, [0, 0], [0, 1.2]);
    esperarCobre(gs[0]!, [{ pose: alvo, caixa: caixaBase }, a]);
  });

  it('ordem determinística: por id do outro e depois pelo tipo', () => {
    // 'a' em (0,7,0): frente y = 0, fundo y = 0,56 e centro em y = 0,28 (três guias horizontais).
    // 'z' em (0,0.7): esquerda x = 0, direita x = 0,6 e centro em x = 0,3 (três guias verticais).
    // Ordem: 'a' < 'z'; dentro de cada id, frente, fundo, esquerda, direita e por fim centro.
    const alvo = pose(0, 0);
    const a = corpo('a', 0.7, 0);
    const z = corpo('z', 0, 0.7);
    const gs = guiasDeAlinhamento(alvo, caixaBase, [z, a]);
    expect(gs).toHaveLength(6);
    expect(gs.map((g) => g.com)).toEqual(['a', 'a', 'a', 'z', 'z', 'z']);
    const semCentro = gs.filter((g) => g.tipo !== 'centro-x' && g.tipo !== 'centro-y').map((g) => `${g.com}:${g.tipo}`);
    expect(semCentro).toEqual(['a:frente', 'a:fundo', 'z:esquerda', 'z:direita']);
    expect(gs.filter((g) => g.tipo === 'centro-x' || g.tipo === 'centro-y')).toHaveLength(2);
  });

  it('entradas vazias: sem outros, lista vazia', () => {
    expect(guiasDeAlinhamento(pose(0, 0), caixaBase, [])).toEqual([]);
  });

  it.skip('guia com diferença exatamente igual à tolerância (0,01): inclui ou exclui? — ambíguo', () => {
    // "dentro de tolerância" não define se o limite entra; os testes vizinhos usam margem (0,005 e 0,02).
  });

  it.skip('centro-x/centro-y: a reta é paralela ao eixo ou tem coordenada fixa no eixo? — ambíguo', () => {
    // "linhas pelo centro em cada eixo local" pode significar x = centroX (vertical) ou reta paralela a x em
    // y = centroY (horizontal). Por isso os testes acima só exigem uma guia de centro, sem fixar o nome.
  });
});
