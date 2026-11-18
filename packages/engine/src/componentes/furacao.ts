import type { PecaResolvida, UsinagemResolvida } from './pecas.ts';

/*
 * Furação automática de cavilhas entre peças em contato (marcenaria; ADR 0049 §3.3). FICHA E5-furacao: implementar as três funções
 * abaixo. Testes em `furacao.test.ts`. Pura e numérica (metros); geometria que o Rust vai espelhar. A ideia: onde uma peça encosta
 * em outra, gera os furos das duas, alinhados (um na FACE da chapa que recebe, outro na BORDA da chapa que encosta).
 * Só caixas: `contorno` é ignorado e peças vazias não entram. Mapeamento dos eixos do plano de cada peça (ver `pecas.ts`):
 * eixo x → (U, V, T) = (y, z, x); eixo y → (x, z, y); eixo z → (x, y, z), onde T é o eixo da espessura.
 */

export type EixoMundo = 'x' | 'y' | 'z';

export interface Contato {
  /** Peça do lado de MENOR coordenada no eixo do contato, e a do lado de maior (índices na lista de entrada, `baixo` ≠ `cima`). */
  baixo: number;
  cima: number;
  /** Eixo da normal do plano de contato e a coordenada (m) do plano. */
  eixo: EixoMundo;
  plano: number;
  /** Os outros dois eixos, em ordem x < y < z, e a sobreposição [mín, máx] (m) das duas peças em cada um. */
  eixos: [EixoMundo, EixoMundo];
  faixa1: [number, number];
  faixa2: [number, number];
}

/**
 * Contatos entre caixas: para cada par (i < j) de peças NÃO vazias e para cada eixo, em ordem (i, j, x, y, z), há contato quando a face
 * de uma toca a face da outra (`|max_i − min_j| ≤ tol` ou `|max_j − min_i| ≤ tol`) e a sobreposição nos outros dois eixos é MAIOR
 * que `tol` nos dois. Cada par encosta em no máximo um eixo; se mais de um satisfizer, vale o primeiro na ordem x, y, z.
 */
const EIXOS: readonly EixoMundo[] = ['x', 'y', 'z'];
const INDICE_EIXO: Record<EixoMundo, number> = { x: 0, y: 1, z: 2 };

/** Os dois eixos do plano de uma peça cuja espessura está em `eixo`, em ordem x < y < z (U, V). */
const PLANO_DO_EIXO: Record<EixoMundo, readonly [EixoMundo, EixoMundo]> = {
  x: ['y', 'z'],
  y: ['x', 'z'],
  z: ['x', 'y'],
};

const PAPEIS_SEM_CAVILHA: readonly PecaResolvida['papel'][] = ['porta', 'frente_gaveta', 'fundo'];

/** Faixa [mín, máx] (m) de uma peça em um eixo do mundo. */
function faixaDaPeca(peca: PecaResolvida, eixo: EixoMundo): [number, number] {
  const i = INDICE_EIXO[eixo];
  const inicio = peca.origem[i]!;
  return [inicio, inicio + peca.extensao[i]!];
}

/** Sobreposição [mín, máx] de duas faixas; pode ser vazia (`máx < mín`). */
function sobreposicao(a0: number, a1: number, b0: number, b1: number): [number, number] {
  return [Math.max(a0, b0), Math.min(a1, b1)];
}

function comprimento(faixa: readonly [number, number]): number {
  return faixa[1] - faixa[0];
}

export function detectarContatos(pecas: readonly PecaResolvida[], tol = 1e-6): Contato[] {
  const contatos: Contato[] = [];
  for (let i = 0; i < pecas.length; i += 1) {
    const pi = pecas[i]!;
    if (pi.vazio) continue;
    for (let j = i + 1; j < pecas.length; j += 1) {
      const pj = pecas[j]!;
      if (pj.vazio) continue;
      for (const eixo of EIXOS) {
        const [minI, maxI] = faixaDaPeca(pi, eixo);
        const [minJ, maxJ] = faixaDaPeca(pj, eixo);
        let baixo: number;
        let cima: number;
        let plano: number;
        if (Math.abs(maxI - minJ) <= tol) {
          baixo = i;
          cima = j;
          plano = maxI;
        } else if (Math.abs(maxJ - minI) <= tol) {
          baixo = j;
          cima = i;
          plano = maxJ;
        } else {
          continue;
        }
        const eixos = PLANO_DO_EIXO[eixo];
        const faixa1 = sobreposicao(...faixaDaPeca(pi, eixos[0]), ...faixaDaPeca(pj, eixos[0]));
        const faixa2 = sobreposicao(...faixaDaPeca(pi, eixos[1]), ...faixaDaPeca(pj, eixos[1]));
        if (comprimento(faixa1) <= tol || comprimento(faixa2) <= tol) continue;
        contatos.push({ baixo, cima, eixo, plano, eixos: [eixos[0], eixos[1]], faixa1, faixa2 });
        break;
      }
    }
  }
  return contatos;
}

export interface RegraCavilha {
  /** Diâmetro do furo (m). */
  diametro: number;
  /** Profundidade máxima do furo na FACE da chapa que recebe e na BORDA da chapa que encosta (m). */
  profundidadeFace: number;
  profundidadeBorda: number;
  /** Distância da ponta do contato ao primeiro/último furo (m). */
  margem: number;
  /** Espaçamento máximo entre furos ao longo do contato (m). */
  espacamentoMax: number;
  /** Mínimo de furos por contato (quando couber). */
  minimoPorContato: number;
}

export const REGRA_CAVILHA_PADRAO: RegraCavilha = { diametro: 0.008, profundidadeFace: 0.012, profundidadeBorda: 0.03, margem: 0.05, espacamentoMax: 0.25, minimoPorContato: 2 };

export interface FuracaoGerada {
  /** Índice da peça na lista de entrada. */
  peca: number;
  usinagem: UsinagemResolvida;
}

/** Posições (m) dos furos ao longo da borda, de `s0` a `s0 + L`. */
function posicoesDosFuros(s0: number, L: number, regra: RegraCavilha): number[] {
  const util = L - 2 * regra.margem;
  let n = Math.max(regra.minimoPorContato, Math.ceil(util / regra.espacamentoMax) + 1);
  if (n >= 2 && util / (n - 1) < 2 * regra.diametro) {
    n = Math.floor(util / (2 * regra.diametro)) + 1;
  }
  if (n <= 1) return [s0 + L / 2];
  const passo = util / (n - 1);
  return Array.from({ length: n }, (_, k) => s0 + regra.margem + k * passo);
}

/** Furo na face da peça que recebe (F): coordenadas (u, v) no plano da F. */
function usinagemNaFace(id: string, face: 'a' | 'b', u: number, v: number, regra: RegraCavilha, profundidade: number): UsinagemResolvida {
  return { id, tipo: 'furo', face, u, v, diametro: regra.diametro, largura: 0, comprimento: 0, profundidade };
}

/** Furo na borda da peça que encosta (E). */
function usinagemNaBorda(id: string, face: 'n' | 's' | 'l' | 'o', u: number, v: number, regra: RegraCavilha, profundidade: number): UsinagemResolvida {
  return { id, tipo: 'furo', face, u, v, diametro: regra.diametro, largura: 0, comprimento: 0, profundidade };
}

function recebeCavilha(peca: PecaResolvida): boolean {
  return !PAPEIS_SEM_CAVILHA.includes(peca.papel);
}

/**
 * Gera furos de cavilha. Para cada contato (na ordem de `detectarContatos`) só gera se EXATAMENTE uma das peças tem `eixo` igual ao do
 * contato (a "F", que recebe o furo na FACE) e a outra não (a "E", que recebe na BORDA); face com face ou borda com borda não geram nada.
 *  - Linha dos furos: na E, o eixo da espessura (T) é um dos dois eixos do contato; o outro é o eixo AO LONGO da borda. Sejam `[s0, s1]`
 *    a sobreposição ao longo da borda (comprimento `L = s1 − s0`) e `cT` o meio da sobreposição no eixo T. Se a sobreposição em T for
 *    menor que `regra.diametro`, ou `L < 2·margem`, o contato não gera nada.
 *  - Quantidade: `n = max(minimoPorContato, ceil((L − 2·margem) / espacamentoMax) + 1)`; se o espaçamento resultante,
 *    `(L − 2·margem) / (n − 1)`, ficar menor que `2·diametro`, reduza para `n = floor((L − 2·margem) / (2·diametro)) + 1`; se `n` der 1, um
 *    furo só no MEIO (`s0 + L/2`). Posições com n ≥ 2: `s0 + margem + k·(L − 2·margem)/(n − 1)`, k = 0..n−1.
 *  - Profundidades: na F, `min(profundidadeFace, espessuraF − 0.004)`; na E, `min(profundidadeBorda, extensão da E ao longo do eixo do
 *    contato − 0.004)`. Se qualquer uma ficar ≤ 0.004, o contato inteiro não gera nada.
 *  - Face da F: se a F é a peça `cima` (a chapa começa no plano) o furo entra pela face 'a'; se é a `baixo`, pela 'b'. Posição (u, v) = coordenada
 *    no mundo menos a origem da F, nos eixos (U, V) da F.
 *  - Borda da E: os eixos do plano da E são (U_E, V_E). Se o eixo do contato é U_E: E = `cima` → borda 'o', E = `baixo` → 'l'; se é V_E:
 *    E = `cima` → 's', E = `baixo` → 'n'. Na usinagem da borda, `u` = coordenada ao longo da borda menos a origem da E nesse eixo, `v` =
 *    cT menos a origem da E no eixo T (distância da face 'a').
 *  - Cada furo gera DUAS entradas (primeiro a da F, depois a da E): `tipo: 'furo'`, `diametro` = `regra.diametro`, `largura` = `comprimento` = 0,
 *    `id` = `cav<baixo>-<cima>-<k>` (k = posição do furo no contato, de 0), profundidades acima.
 *  - Peças de papel `porta`, `frente_gaveta` e `fundo` NÃO recebem cavilha: contatos que as envolvem são ignorados por esta função (dobradiça, corrediça
 *    e rasgo de fundo são outros assuntos).
 * Não altera `pecas`. Determinística.
 */
export function gerarCavilhas(pecas: readonly PecaResolvida[], regra: RegraCavilha = REGRA_CAVILHA_PADRAO, tol = 1e-6): FuracaoGerada[] {
  const geradas: FuracaoGerada[] = [];
  for (const contato of detectarContatos(pecas, tol)) {
    const pBaixo = pecas[contato.baixo]!;
    const pCima = pecas[contato.cima]!;
    if (!recebeCavilha(pBaixo) || !recebeCavilha(pCima)) continue;
    const baixoEhFace = pBaixo.eixo === contato.eixo;
    const cimaEhFace = pCima.eixo === contato.eixo;
    if (baixoEhFace === cimaEhFace) continue;
    const iFace = baixoEhFace ? contato.baixo : contato.cima;
    const iBorda = baixoEhFace ? contato.cima : contato.baixo;
    const face = pecas[iFace]!;
    const borda = pecas[iBorda]!;
    const eixoEspessura = contato.eixos.find((eixo) => eixo === borda.eixo);
    if (eixoEspessura === undefined) continue;
    const eixoAoLongo = contato.eixos[0] === eixoEspessura ? contato.eixos[1] : contato.eixos[0];
    const faixaEspessura = contato.eixos[0] === eixoEspessura ? contato.faixa1 : contato.faixa2;
    const faixaAoLongo = contato.eixos[0] === eixoAoLongo ? contato.faixa1 : contato.faixa2;
    if (comprimento(faixaEspessura) < regra.diametro) continue;
    const [s0, s1] = faixaAoLongo;
    const L = s1 - s0;
    if (L < 2 * regra.margem) continue;
    const cT = (faixaEspessura[0] + faixaEspessura[1]) / 2;
    const profundidadeFace = Math.min(regra.profundidadeFace, face.espessura - 0.004);
    const profundidadeBorda = Math.min(regra.profundidadeBorda, borda.extensao[INDICE_EIXO[contato.eixo]]! - 0.004);
    if (profundidadeFace <= 0.004 || profundidadeBorda <= 0.004) continue;
    const [uFace, vFace] = PLANO_DO_EIXO[face.eixo];
    const faceDaFace: 'a' | 'b' = iFace === contato.cima ? 'a' : 'b';
    const [uBorda] = PLANO_DO_EIXO[borda.eixo];
    const faceDaBorda: 'n' | 's' | 'l' | 'o' = contato.eixo === uBorda
      ? (iBorda === contato.cima ? 'o' : 'l')
      : (iBorda === contato.cima ? 's' : 'n');
    const iAoLongo = INDICE_EIXO[eixoAoLongo];
    const iEspessura = INDICE_EIXO[eixoEspessura];
    const posicoes = posicoesDosFuros(s0, L, regra);
    for (let k = 0; k < posicoes.length; k += 1) {
      const s = posicoes[k]!;
      const id = `cav${contato.baixo}-${contato.cima}-${k}`;
      const uFaceFinal = (uFace === eixoAoLongo ? s : cT) - face.origem[INDICE_EIXO[uFace]]!;
      const vFaceFinal = (vFace === eixoAoLongo ? s : cT) - face.origem[INDICE_EIXO[vFace]]!;
      geradas.push({ peca: iFace, usinagem: usinagemNaFace(id, faceDaFace, uFaceFinal, vFaceFinal, regra, profundidadeFace) });
      const uBordaFinal = s - borda.origem[iAoLongo]!;
      const vBordaFinal = cT - borda.origem[iEspessura]!;
      geradas.push({ peca: iBorda, usinagem: usinagemNaBorda(id, faceDaBorda, uBordaFinal, vBordaFinal, regra, profundidadeBorda) });
    }
  }
  return geradas;
}

/** Cópia das peças com as usinagens geradas acrescentadas ao fim da lista de cada peça, na ordem de geração. Não altera a entrada. */
export function aplicarFuracao(pecas: readonly PecaResolvida[], gerada: readonly FuracaoGerada[]): PecaResolvida[] {
  const resultado = pecas.map((peca) => ({ ...peca, usinagens: [...peca.usinagens] }));
  for (const furo of gerada) {
    resultado[furo.peca]?.usinagens.push({ ...furo.usinagem });
  }
  return resultado;
}
