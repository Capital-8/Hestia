import type { Familia } from '@hestia/model';
import { posicionarConexao, TOLERANCIA_ANGULO, type ConexaoEncontro, type RegrasConexao, type TipoConexao } from './posicaoConexao.ts';

/*
 * Resolvedor de nó (fase 3, ficha B1): dado um nó da rede de tubulação (encontro de dois trechos ou derivação), decide qual peça entra.
 * Função PURA e determinística: sem estado, relógio nem aleatoriedade; a mesma entrada dá sempre a mesma solução. É o ponto único de
 * decisão para todo evento que muda a rede (traçar, trocar bitola, mover, mudar cota, apagar); `avaliarEncontro` e `avaliarDerivacao`
 * são camadas finas sobre ele. Unidades: direções adimensionais (unitárias), DN em mm, cota em m, ângulos em graus.
 */

type V3 = readonly [number, number, number];

/** Trecho que chega ao nó. */
export interface TrechoNo {
  /** Direção saindo do nó rumo ao trecho. Pode vir sem normalizar; o resolvedor normaliza. Vetor nulo = trecho de comprimento nulo. */
  direcao: V3;
  /** Diâmetro nominal (mm). */
  dn: number;
  /** Cota do nó neste trecho (m). Informativa por ora (reservada para prumadas, B4); não altera a decisão. */
  cota?: number;
}

/** Tipo de tubulação visto pelo resolvedor: o subconjunto de `TipoTubulacao` de que a decisão precisa. */
export interface TipoParaNo {
  /** Famílias das peças; id vazio = o tipo não oferece a peça. */
  regras: RegrasConexao;
  /** DN (mm) permitidos; `null` ou ausente = qualquer. */
  bitolas?: readonly number[] | null;
  /** Nome curto da linha de produto, usado no motivo de bitola fora da lista. */
  linha?: string;
}

/** Nó de encontro: as pontas de dois trechos se tocam. */
export interface EncontroNo {
  tipo: 'encontro';
  trechos: readonly [TrechoNo, TrechoNo];
}

/** Nó de derivação: o ramal toca o meio do principal (que será dividido em dois sentidos, `a` e `b`). */
export interface DerivacaoNo {
  tipo: 'derivacao';
  /** Direções saindo do nó rumo a cada ponta do principal; o DN é o mesmo nos dois. */
  principal: { rumoA: V3; rumoB: V3; dn: number; cota?: number };
  ramal: TrechoNo;
}

/** Entrada do resolvedor. */
export interface EntradaNo {
  /** Tipo de tubulação (regras de conexão e bitolas). */
  tipo: TipoParaNo;
  no: EncontroNo | DerivacaoNo;
  /**
   * Famílias do projeto por id, opcional. Com ela o resolvedor posiciona a peça e devolve os recuos reais (bolsa); sem ela, ou se a
   * família da peça não está no mapa, `recuos` vem zerado (um zero por trecho do nó).
   */
  familias?: Readonly<Record<string, Familia>>;
}

/** Peça de uma solução ajustada (reservado, ficha B3). */
export interface PecaAjuste {
  tipo: TipoConexao;
  familiaId: string;
  /** DN (mm) das bocas, na ordem das direções do nó. */
  diametros: number[];
}

/** Códigos estáveis de `sem_solucao`. Nunca renomear: a interface e os testes dependem deles. */
export type CodigoSemSolucao = 'angulo_sem_peca' | 'bitola_fora_da_lista' | 'tipo_sem_peca' | 'trecho_nulo' | 'bitolas_diferentes_em_curva';

/**
 * Solução do nó:
 * - `ok`: uma peça resolve; `conexao` é a decisão e `recuos` (m) quanto cada trecho recua do nó, na ordem das direções da conexão;
 * - `direto`: trechos colineares do mesmo DN num tipo sem luva: os trechos se emendam sem peça;
 * - `ajustada`: RESERVADO para a ficha B3 (troca de bitola): conjunto de `pecas` que substitui a peça pedida (por exemplo uma redução
 *   a mais) com o `motivo` do ajuste. O resolvedor atual NÃO produz este status;
 * - `sem_solucao`: nenhuma peça serve; `codigo` fixo e `motivo` em português, com o texto dos avisos da ferramenta Tubo.
 */
export type SolucaoNo =
  | { status: 'ok'; conexao: ConexaoEncontro; recuos: number[] }
  | { status: 'direto' }
  | { status: 'ajustada'; pecas: PecaAjuste[]; motivo: string }
  | { status: 'sem_solucao'; codigo: CodigoSemSolucao; motivo: string };

const TOLERANCIA_DN = 0.5;
const RAD = Math.PI / 180;

const NOME_DO_TIPO: Record<TipoConexao, string> = { luva: 'luva', curva90: 'joelho ou curva de 90°', curva45: 'joelho ou curva de 45°', reducao: 'redução', te: 'tê', juncao45: 'junção de 45°' };

const semSolucao = (codigo: CodigoSemSolucao, motivo: string): SolucaoNo => ({ status: 'sem_solucao', codigo, motivo });

function unitario(u: V3): [number, number, number] | null {
  const n = Math.hypot(u[0], u[1], u[2]);
  return n < 1e-12 ? null : [u[0] / n, u[1] / n, u[2] / n];
}

/** Ângulo (graus) entre dois vetores unitários. */
function anguloGraus(u: V3, v: V3): number {
  return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) / RAD;
}

const iguais = (x: number, y: number): boolean => Math.abs(x - y) <= TOLERANCIA_DN;

/** Primeiro DN fora da lista do tipo (ou `undefined` se todos servem). */
function bitolaInvalida(tipo: TipoParaNo, dns: readonly number[]): string | undefined {
  const lista = tipo.bitolas;
  if (!lista) return undefined;
  const ruim = dns.find((d) => !lista.includes(d));
  return ruim === undefined ? undefined : `DN ${ruim} não existe na linha ${tipo.linha ?? 'deste tipo'}. Bitolas: ${lista.join(', ')}.`;
}

/** Fecha a decisão: id de família vazio = peça que o tipo não tem; senão `ok` com os recuos (zerados sem `familias`). */
function fecha(entrada: EntradaNo, tipo: TipoConexao, familiaId: string, direcoes: [number, number, number][], diametros: number[]): SolucaoNo {
  if (familiaId === '') return semSolucao('tipo_sem_peca', `Este tipo de tubulação não tem ${NOME_DO_TIPO[tipo]}: o trecho fica sem essa conexão.`);
  const conexao: ConexaoEncontro = { tipo, familiaId, direcoes, diametros };
  const familia = entrada.familias?.[familiaId];
  const ponto = [0, 0, 0] as [number, number, number];
  const posicao = familia ? posicionarConexao(familia, ponto, conexao) : null;
  return { status: 'ok', conexao, recuos: posicao ? posicao.recuos : direcoes.map(() => 0) };
}

function resolverEncontro(entrada: EntradaNo, no: EncontroNo): SolucaoNo {
  const [ta, tb] = no.trechos;
  const ua = unitario(ta.direcao);
  const ub = unitario(tb.direcao);
  if (!ua || !ub) return semSolucao('trecho_nulo', 'Trecho de comprimento nulo: nada a conectar.');
  const fora = bitolaInvalida(entrada.tipo, [ta.dn, tb.dn]);
  if (fora) return semSolucao('bitola_fora_da_lista', fora);
  const regras = entrada.tipo.regras;
  const angulo = anguloGraus(ua, ub);
  const diametros = [ta.dn, tb.dn];
  const mesmoDn = iguais(ta.dn, tb.dn);
  const faz = (tipo: TipoConexao, id: string): SolucaoNo => fecha(entrada, tipo, id, [ua, ub], diametros);
  if (angulo >= 180 - TOLERANCIA_ANGULO) {
    if (!mesmoDn) return faz('reducao', regras.reducao);
    return regras.luva === '' ? { status: 'direto' } : faz('luva', regras.luva);
  }
  if (!mesmoDn) return semSolucao('bitolas_diferentes_em_curva', 'Curva entre bitolas diferentes: coloque uma redução num trecho reto antes da curva.');
  if (Math.abs(angulo - 90) <= TOLERANCIA_ANGULO) return faz('curva90', regras.curva90);
  if (Math.abs(angulo - 135) <= TOLERANCIA_ANGULO) return faz('curva45', regras.curva45);
  return semSolucao('angulo_sem_peca', `Ângulo de ${Math.round(180 - angulo)}° sem conexão automática (só 0°, 45° e 90°).`);
}

function resolverDerivacao(entrada: EntradaNo, no: DerivacaoNo): SolucaoNo {
  const ua = unitario(no.principal.rumoA);
  const ub = unitario(no.principal.rumoB);
  const ur = unitario(no.ramal.direcao);
  if (!ua || !ub || !ur) return semSolucao('trecho_nulo', 'Derivação sobre a ponta do trecho ou trecho nulo: nada a dividir.');
  const fora = bitolaInvalida(entrada.tipo, [no.principal.dn, no.ramal.dn]);
  if (fora) return semSolucao('bitola_fora_da_lista', fora);
  const regras = entrada.tipo.regras;
  const angulo = Math.min(anguloGraus(ur, ua), anguloGraus(ur, ub));
  const faz = (tipo: TipoConexao, id: string): SolucaoNo => fecha(entrada, tipo, id, [ua, ub, ur], [no.principal.dn, no.principal.dn, no.ramal.dn]);
  if (Math.abs(anguloGraus(ur, ua) - 90) <= TOLERANCIA_ANGULO) return faz('te', regras.te);
  if (Math.abs(angulo - 45) <= TOLERANCIA_ANGULO) return faz('juncao45', regras.juncao45);
  return semSolucao('angulo_sem_peca', 'Derivação só a 90° (tê) ou 45° (junção): outro ângulo fica sem conexão.');
}

/**
 * Resolve o nó. Encontro: ângulo interno entre os trechos 180° (colinear) = luva (ou `direto` se o tipo não tem luva) ou redução se o DN
 * muda; 90° = curva 90°; 135° (desvio de 45°) = curva 45°; curva com DN diferente, ou outro ângulo, não tem solução. Derivação: ramal
 * a 90° do principal = tê; a 45° de um dos sentidos = junção 45°; outro ângulo não tem solução. Antes disso: trecho nulo e DN fora da
 * lista de bitolas do tipo (`bitolas`, quando declarada) são recusados com código próprio.
 */
export function resolverNo(entrada: EntradaNo): SolucaoNo {
  return entrada.no.tipo === 'encontro' ? resolverEncontro(entrada, entrada.no) : resolverDerivacao(entrada, entrada.no);
}
