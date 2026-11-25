import type { PontoSegmento } from '@hestia/engine';
import type { ModoCota } from './tuboPrumada.ts';

/*
 * Caminho em 90° que RESPEITA a direção das entradas (ficha C8a). Uma entrada de caixa ou dispositivo só encaixa o eletroduto que
 * chega de frente para ela (`ligacoesCompativeis`: direções opostas): o primeiro trecho sai da entrada de partida no sentido dela e
 * o último chega à entrada de destino no sentido contrário ao dela. Antes o traçado ignorava isso (ia direto, ou subia primeiro) e a
 * rede acusava "incompatível". Aqui o caminho vem de uma busca: sequências de trechos em eixos (±X, ±Y, ±Z) com cada joelho de
 * 90°, a primeira e a última direção fixadas pelas entradas, o menor número de trechos primeiro. O número de trechos e de curvas
 * é RESULTADO do cálculo, não uma regra: lateral → lateral com desnível dá horizontal, vertical e horizontal (2 curvas); lateral →
 * base ou topo dá horizontal e vertical (1 curva); entradas que não se enxergam ganham um desvio em U ou em Z.
 */

/** Vetor unitário de um eixo do mundo. */
export type Eixo = readonly [number, number, number];

const DIRECOES: readonly Eixo[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/** Componente (m) abaixo da qual o desvio ao longo de um eixo é tratado como nulo (a última perna termina no ponto exato). */
const TOLERANCIA = 0.005;
/** Máximo de trechos procurados (4 joelhos). Acima disso não há caminho e o traçado cai no comportamento de antes, com aviso. */
const MAXIMO_TRECHOS = 5;
/** Cosseno mínimo para tratar uma direção como um eixo do mundo (2,56°, a mesma tolerância da compatibilidade de ligações). */
const COSSENO_EIXO = 0.999;

/** Eixo do mundo mais próximo de `d` (unitário), ou null se a direção não é axial (peça girada fora de múltiplos de 90°). */
export function eixoDaDirecao(d: readonly [number, number, number]): Eixo | null {
  return DIRECOES.find((e) => e[0] * d[0] + e[1] * d[1] + e[2] * d[2] >= COSSENO_EIXO) ?? null;
}

/** Eixo oposto a `e` (o mesmo objeto da tabela, para a comparação por identidade da busca). */
export function eixoOposto(e: Eixo): Eixo {
  return DIRECOES.find((x) => x[0] === -e[0] && x[1] === -e[1] && x[2] === -e[2]) ?? e;
}

/** Caminho calculado: pontos intermediários (cada um vira um joelho) e o número de trechos. */
export interface CaminhoOrtogonal {
  intermediarios: PontoSegmento[];
  trechos: number;
}

interface Candidato {
  caminho: CaminhoOrtogonal;
  comprimento: number;
  verticalidade: number;
}

const eixoDe = (e: Eixo): number => (e[0] !== 0 ? 0 : e[1] !== 0 ? 1 : 2);
const sinalDe = (e: Eixo): number => e[eixoDe(e)] ?? 0;

/**
 * Comprimentos dos trechos de uma sequência de direções que levam `a` a `b`, ou null se a sequência não serve. Por eixo: um trecho
 * leva todo o desvio; vários no mesmo sentido dividem o desvio por igual; sentidos contrários (U ou Z) fazem o contrário andar
 * `desvio` e o outro compensar. Todo trecho precisa ter pelo menos `minimo` (cabe a curva em cada ponta).
 */
function comprimentos(seq: readonly Eixo[], delta: readonly number[], minimo: number, desvio: number): number[] | null {
  const out = new Array<number>(seq.length).fill(0);
  for (let eixo = 0; eixo < 3; eixo++) {
    const idx = seq.flatMap((e, i) => (eixoDe(e) === eixo ? [i] : []));
    const d = delta[eixo] ?? 0;
    if (idx.length === 0) {
      if (Math.abs(d) > TOLERANCIA) return null;
      continue;
    }
    const pos = idx.filter((i) => sinalDe(seq[i] as Eixo) > 0);
    const neg = idx.filter((i) => sinalDe(seq[i] as Eixo) < 0);
    const unico = seq.length === 1;
    const piso = unico ? TOLERANCIA : minimo;
    if (pos.length === 0 || neg.length === 0) {
      const sinal = pos.length > 0 ? 1 : -1;
      const parte = (d * sinal) / idx.length;
      if (parte < piso) return null;
      for (const i of idx) out[i] = parte;
    } else {
      const extraNeg = d >= 0 ? desvio : (-d + pos.length * desvio) / neg.length;
      const extraPos = d >= 0 ? (d + neg.length * desvio) / pos.length : desvio;
      if (Math.min(extraNeg, extraPos) < piso) return null;
      for (const i of pos) out[i] = extraPos;
      for (const i of neg) out[i] = extraNeg;
    }
  }
  return out;
}

/**
 * Planeja `a`→`b` (m) em 90°. `saida` = sentido em que o primeiro trecho deixa `a` (direção da entrada de partida, ou null se `a` é
 * livre); `chegada` = sentido do último trecho ao chegar em `b` (oposto à direção da entrada de destino, ou null). `minimo` (m) é o
 * menor trecho que cabe com as curvas; `desvio` (m), o quanto um desvio em U ou em Z anda para fora. Devolve null sem caminho.
 * Empate de trechos: menor comprimento total, depois o `modo` (subir antes ou depois).
 */
export function planejarCaminhoOrtogonal(a: PontoSegmento, b: PontoSegmento, saida: Eixo | null, chegada: Eixo | null, modo: ModoCota, minimo: number, desvio: number): CaminhoOrtogonal | null {
  const delta = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  let melhor: Candidato | null = null;
  const melhorQue = (c: Candidato): boolean => {
    if (!melhor) return true;
    if (c.caminho.trechos !== melhor.caminho.trechos) return c.caminho.trechos < melhor.caminho.trechos;
    if (Math.abs(c.comprimento - melhor.comprimento) > 1e-9) return c.comprimento < melhor.comprimento;
    return c.verticalidade < melhor.verticalidade;
  };
  const avaliar = (seq: readonly Eixo[]): void => {
    if (chegada && seq[seq.length - 1] !== chegada) return;
    const ls = comprimentos(seq, delta, minimo, desvio);
    if (!ls) return;
    const pontos: PontoSegmento[] = [];
    let p: PontoSegmento = [a[0], a[1], a[2]];
    seq.slice(0, -1).forEach((e, i) => {
      const l = ls[i] as number;
      p = [p[0] + e[0] * l, p[1] + e[1] * l, p[2] + e[2] * l];
      pontos.push(p);
    });
    // 'subir primeiro' prefere trecho vertical cedo; 'andar primeiro', tarde.
    const verticais = seq.flatMap((e, i) => (eixoDe(e) === 2 ? [i] : []));
    const soma = verticais.reduce((s, i) => s + i, 0);
    const c: Candidato = { caminho: { intermediarios: pontos, trechos: seq.length }, comprimento: ls.reduce((s, l) => s + l, 0), verticalidade: modo === 'andar_primeiro' ? -soma : soma };
    if (melhorQue(c)) melhor = c;
  };
  const gerar = (seq: Eixo[]): void => {
    if (seq.length > 0) avaliar(seq);
    if (seq.length >= MAXIMO_TRECHOS) return;
    for (const e of DIRECOES) {
      const ultimo = seq[seq.length - 1];
      // Joelho de 90°: o trecho seguinte é perpendicular ao anterior; o primeiro sai no sentido da entrada de partida.
      if (ultimo ? eixoDe(ultimo) === eixoDe(e) : saida !== null && e !== saida) continue;
      gerar([...seq, e]);
    }
  };
  gerar([]);
  return melhor === null ? null : (melhor as Candidato).caminho;
}
