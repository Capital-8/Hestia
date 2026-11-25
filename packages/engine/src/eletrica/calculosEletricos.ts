import type { TipoCircuito } from '@hestia/model';
import { chaveSecao, type EstadoTabelas, type TabelasEletricas } from './tabelasEletricas.ts';

/*
 * Cálculos PUROS do circuito elétrico (ficha C5): potência, corrente de projeto, fator de demanda, seção, disjuntor e queda de
 * tensão. Só circuito MONOFÁSICO (fase + neutro) por enquanto: não há trifásico. Todo valor de norma vem da `TabelasEletricas`
 * recebida (provisória, CONFERIR); a função devolve as ENTRADAS e a TABELA usada para auditoria e nunca afirma conformidade com
 * norma. Sem unidades do projeto: tensão em V, potência em VA/W, corrente em A, seção em mm², comprimento em m.
 */

/** Potência ativa (W) a partir da aparente (VA) e do fator de potência. */
export const potenciaAtivaW = (va: number, fp: number): number => va * fp;

/** Corrente de projeto monofásica (A): I = P / (V · fp). `NaN` se a tensão ou o fator não forem positivos. */
export function correnteProjetoA(potenciaW: number, tensaoV: number, fp: number): number {
  return tensaoV > 0 && fp > 0 ? potenciaW / (tensaoV * fp) : Number.NaN;
}

/** Queda de tensão (%) de circuito monofásico fase + neutro: ΔV% = 2 · ρ · L · I / (S · V) · 100. */
export function quedaTensaoPct(rho: number, comprimentoM: number, correnteA: number, secaoMm2: number, tensaoV: number): number {
  return secaoMm2 > 0 && tensaoV > 0 ? ((2 * rho * comprimentoM * correnteA) / (secaoMm2 * tensaoV)) * 100 : Number.NaN;
}

/** Capacidade (A) da seção na tabela, ou `null` se a seção não está nela. */
export const capacidadeDaSecao = (t: TabelasEletricas, secao: number): number | null => t.capacidadeA[chaveSecao(secao)] ?? null;

/** Menor disjuntor padronizado com `corrente <= disjuntor <= capacidade`; `null` se não houver (capacidade `null` = sem teto). */
export function escolherDisjuntor(t: TabelasEletricas, correnteA: number, capacidadeA: number | null): number | null {
  const lista = [...t.disjuntoresA].sort((a, b) => a - b);
  return lista.find((d) => d >= correnteA && (capacidadeA === null || d <= capacidadeA)) ?? null;
}

export type MotivoSemSecao = 'corrente' | 'queda' | 'sem_tabela';

export interface EscolhaSecao {
  /** Menor seção da tabela que atende todos os critérios, ou `null`. */
  secaoMm2: number | null;
  /** Por que nenhuma serviu: `corrente` (capacidade ou disjuntor), `queda` (só a queda de tensão falhou) ou `sem_tabela`. */
  motivo: MotivoSemSecao | null;
}

/**
 * Escolhe a MENOR seção da tabela que atende: capacidade >= corrente, seção >= mínima do tipo, existe disjuntor padronizado entre a
 * corrente e a capacidade, e queda de tensão <= limite no comprimento dado. Sem comprimento (`null`) a queda não é verificada.
 */
export function escolherSecao(t: TabelasEletricas, tipo: TipoCircuito, correnteA: number, tensaoV: number, comprimentoM: number | null): EscolhaSecao {
  const secoes = [...t.secoes].sort((a, b) => a - b);
  if (secoes.length === 0) return { secaoMm2: null, motivo: 'sem_tabela' };
  let falhouSoQueda = false;
  for (const s of secoes) {
    const cap = capacidadeDaSecao(t, s);
    if (cap === null || s < t.secaoMinimaMm2[tipo] || cap < correnteA || escolherDisjuntor(t, correnteA, cap) === null) continue;
    if (comprimentoM !== null && quedaTensaoPct(t.resistividadeCobre, comprimentoM, correnteA, s, tensaoV) > t.quedaMaximaPct) {
      falhouSoQueda = true;
      continue;
    }
    return { secaoMm2: s, motivo: null };
  }
  return { secaoMm2: null, motivo: falhouSoQueda ? 'queda' : 'corrente' };
}

/** Entradas do cálculo de um circuito. `totalVA` já traz o fator de cada ponto; o fator de demanda é aplicado aqui. */
export interface EntradaCircuito {
  tipo: TipoCircuito;
  tensaoV: number;
  totalVA: number;
  /** Fator de potência do circuito; ausente = o padrão da tabela. */
  fp?: number;
  /** Comprimento (m) do quadro ao ponto mais distante; `null` = sem comprimento (a rede não conecta). */
  comprimentoM: number | null;
  /** Seção (mm²) escolhida pelo projetista; ausente = a calculada. */
  secaoAdotadaMm2?: number;
  /** Disjuntor (A) escolhido pelo projetista; ausente = o calculado. */
  disjuntorAdotadoA?: number;
}

export interface ResultadoCircuito {
  /** Entradas e tabela usadas, para auditoria. */
  entrada: EntradaCircuito;
  tabela: TabelasEletricas;
  estadoTabelas: EstadoTabelas;
  fp: number;
  fatorDemanda: number;
  potenciaAtivaW: number;
  potenciaAplicadaVA: number;
  potenciaAplicadaW: number;
  correnteA: number;
  comprimentoM: number | null;
  secaoCalculadaMm2: number | null;
  /** Seção em uso: a adotada ou, na falta dela, a calculada. */
  secaoMm2: number | null;
  capacidadeA: number | null;
  disjuntorCalculadoA: number | null;
  /** Disjuntor em uso: o adotado ou, na falta dele, o calculado. */
  disjuntorA: number | null;
  quedaPct: number | null;
  quedaMaximaPct: number;
  /** Corrente de projeto acima da capacidade da seção em uso, ou acima do disjuntor, ou nenhuma seção da tabela serve. */
  sobrecarregado: boolean;
  quedaExcedida: boolean;
  avisos: string[];
}

/** Dimensiona um circuito monofásico com as tabelas dadas. Nunca lança; o que não dá para calcular vira aviso. */
export function dimensionarCircuito(entrada: EntradaCircuito, tabela: TabelasEletricas): ResultadoCircuito {
  const avisos: string[] = [];
  const fp = entrada.fp ?? tabela.fatorPotenciaPadrao;
  const fatorDemanda = tabela.fatorDemanda[entrada.tipo];
  const potenciaAplicadaVA = entrada.totalVA * fatorDemanda;
  const ativa = potenciaAtivaW(entrada.totalVA, fp);
  const aplicadaW = ativa * fatorDemanda;
  const correnteA = correnteProjetoA(aplicadaW, entrada.tensaoV, fp);
  const L = entrada.comprimentoM;
  if (L === null) avisos.push('Sem comprimento: a rede de eletrodutos não liga o quadro aos pontos; queda de tensão não verificada.');
  const escolha = Number.isFinite(correnteA) ? escolherSecao(tabela, entrada.tipo, correnteA, entrada.tensaoV, L) : { secaoMm2: null, motivo: 'sem_tabela' as const };
  const secao = entrada.secaoAdotadaMm2 ?? escolha.secaoMm2;
  const cap = secao === null ? null : capacidadeDaSecao(tabela, secao);
  if (secao !== null && cap === null) avisos.push(`A seção ${secao} não está na tabela de capacidades.`);
  const calculado = Number.isFinite(correnteA) ? escolherDisjuntor(tabela, correnteA, cap) : null;
  const disjuntor = entrada.disjuntorAdotadoA ?? calculado;
  const quedaRef = secao ?? tabela.secoes.reduce((m, s) => Math.max(m, s), 0);
  const queda = L !== null && Number.isFinite(correnteA) && quedaRef > 0 ? quedaTensaoPct(tabela.resistividadeCobre, L, correnteA, quedaRef, entrada.tensaoV) : null;
  const semSecao = secao === null;
  const sobrecarregado = !Number.isFinite(correnteA) ? false : (semSecao && escolha.motivo === 'corrente') || (cap !== null && correnteA > cap) || (secao !== null && cap === null) || (disjuntor !== null && correnteA > disjuntor);
  const quedaExcedida = queda !== null && queda > tabela.quedaMaximaPct;
  if (semSecao && escolha.motivo === 'queda') avisos.push('Nenhuma seção da tabela mantém a queda de tensão dentro do limite neste comprimento.');
  if (semSecao && escolha.motivo === 'corrente') avisos.push('Nenhuma seção da tabela suporta a corrente de projeto.');
  if (!Number.isFinite(correnteA)) avisos.push('Corrente não calculável: confira a tensão e o fator de potência.');
  return {
    entrada, tabela, estadoTabelas: tabela.estado, fp, fatorDemanda, potenciaAtivaW: ativa, potenciaAplicadaVA, potenciaAplicadaW: aplicadaW, correnteA,
    comprimentoM: L, secaoCalculadaMm2: escolha.secaoMm2, secaoMm2: secao, capacidadeA: cap, disjuntorCalculadoA: calculado, disjuntorA: disjuntor,
    quedaPct: queda, quedaMaximaPct: tabela.quedaMaximaPct, sobrecarregado, quedaExcedida, avisos,
  };
}
