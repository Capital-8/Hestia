import { LIMITES_DECLIVIDADE } from './diagnosticoRede.ts';
import type { DominioLigacao } from '@hestia/model';

/*
 * Viabilidade geométrica de um nó da rede de tubulação (fase 3, ficha B2). Função PURA e determinística: diz se a conexão "fica bem
 * feita" com os recuos reais das peças, antes de qualquer coisa ser gravada. Quem muda a rede (ferramenta Tubo, troca de bitola,
 * prumada) chama `verificarViabilidade` e, se vier `bloqueio`, não cria nada e mostra o `motivo`.
 *
 * UNIDADES: tudo em MILÍMETROS (comprimentos, recuos, diâmetros) e declividade em %. A ferramenta converte de metros.
 *
 * Códigos (estáveis, nunca renomear):
 * - `trecho_curto` (bloqueio): o comprimento do trecho depois dos recuos dos dois nós fica menor que `COMPRIMENTO_MINIMO_TRECHO`;
 * - `conexoes_se_tocam` (bloqueio): as conexões das duas pontas do MESMO tubo (recuos somados) não cabem entre os centros dos nós;
 * - `cota_insuficiente` (bloqueio): a mudança de cota é menor que a prumada precisa (menor que o diâmetro externo da peça de mudança
 *   de direção, ou o trecho vertical, depois dos recuos dos dois joelhos, ficaria menor que o mínimo);
 * - `declividade_fora_do_limite` (AVISO, não bloqueia): trecho fora de `LIMITES_DECLIVIDADE`, faixa ainda marcada CONFERIR.
 */

/**
 * Comprimento mínimo (mm) do trecho de tubo que sobra entre as conexões. CONFERIR: valor de projeto adotado como regra de ofício
 * (um tubo menor que isso não se corta nem se encaixa); não vem de norma nem de catálogo. Confirmar com o dono antes de liberar.
 */
export const COMPRIMENTO_MINIMO_TRECHO = 10;

/** Folga numérica (mm) para a comparação com os limites exatos não depender de arredondamento de ponto flutuante. */
const FOLGA = 1e-6;

/** Códigos de viabilidade. */
export type CodigoViabilidade = 'trecho_curto' | 'conexoes_se_tocam' | 'cota_insuficiente' | 'declividade_fora_do_limite';

/** Trecho entre dois nós: comprimento entre os CENTROS (mm) e quanto cada ponta recua para dentro da conexão (0 = sem encaixe). */
export interface TrechoViabilidade {
  comprimento: number;
  recuoInicio: number;
  recuoFim: number;
  /** O tubo fica entre duas conexões (a do outro lado já existe): vale o mínimo mesmo sem recuo nesta ponta (ficha F1). */
  entreConexoes?: boolean;
  /** Índice que o chamador usa para localizar o trecho (devolvido em `trechoAfetado`); padrão: a posição na lista. */
  indice?: number;
}

/** Prumada: trecho vertical entre dois joelhos (ou outra peça de mudança de direção). */
export interface PrumadaViabilidade {
  /** Mudança de cota (mm), em módulo; 0 não é prumada e é ignorada. */
  desvioVertical: number;
  /** Diâmetro externo (mm) da peça de mudança de direção. */
  diametroExterno: number;
  /** Recuos (mm) das peças de baixo e de cima, se conhecidos (0 = não considerar). */
  recuoBaixo?: number;
  recuoCima?: number;
  indice?: number;
}

/** Trecho inclinado cuja declividade se confere (só esgoto tem faixa em `LIMITES_DECLIVIDADE`). */
export interface DeclividadeViabilidade {
  /** Declividade (%), em módulo: |desnível| / distância em planta × 100. */
  percentual: number;
  dominio: DominioLigacao;
  /** Diâmetro nominal (mm). */
  dn: number;
  indice?: number;
}

/** Entrada: tudo o que o evento mudou. Listas ausentes = nada a conferir daquele tipo. */
export interface EntradaViabilidade {
  trechos?: readonly TrechoViabilidade[];
  prumadas?: readonly PrumadaViabilidade[];
  declividades?: readonly DeclividadeViabilidade[];
  /** Tubo mínimo (mm) entre conexões do tipo de tubulação (ficha F1); ausente = `COMPRIMENTO_MINIMO_TRECHO`. */
  trechoMinimo?: number;
}

/** Resultado: `{ ok: true }` ou o primeiro problema, com bloqueio antes de aviso. */
export type ResultadoViabilidade =
  | { ok: true }
  | { ok: false; severidade: 'bloqueio' | 'aviso'; codigo: CodigoViabilidade; motivo: string; trechoAfetado?: number; faltam?: number };

type Problema = Extract<ResultadoViabilidade, { ok: false }>;

/** Número com vírgula decimal e até `casas` casas (sem zeros à direita). */
// units-ok: mensagem de motivo em mm por contrato do engine (a ferramenta converte de metros); não é exibição de quantidade do projeto
const num = (v: number, casas: number): string => String(Math.round(v * 10 ** casas) / 10 ** casas).replace('.', ',');

const mm = (v: number): string => `${num(v, 1)} mm`;

function conferirTrecho(t: TrechoViabilidade, i: number, minimo: number): Problema | null {
  const indice = t.indice ?? i;
  const recuos = Math.max(0, t.recuoInicio) + Math.max(0, t.recuoFim);
  const restante = t.comprimento - recuos;
  if (t.recuoInicio > 0 && t.recuoFim > 0 && restante < -FOLGA) {
    return { ok: false, severidade: 'bloqueio', codigo: 'conexoes_se_tocam', trechoAfetado: indice, motivo: `As conexões das duas pontas do tubo se sobrepõem: juntas ocupam ${mm(recuos)} e o tubo tem só ${mm(t.comprimento)} entre os centros (faltam ${mm(-restante)}).` };
  }
  if ((recuos > 0 || t.entreConexoes === true) && restante < minimo - FOLGA) {
    return { ok: false, severidade: 'bloqueio', codigo: 'trecho_curto', trechoAfetado: indice, motivo: `Trecho curto demais: depois das conexões sobram ${mm(Math.max(0, restante))} de tubo (mínimo ${mm(minimo)}; faltam ${mm(minimo - restante)}).` };
  }
  return null;
}

function conferirPrumada(p: PrumadaViabilidade, i: number, minimo: number): Problema | null {
  const desvio = Math.abs(p.desvioVertical);
  if (desvio < FOLGA) return null;
  const indice = p.indice ?? i;
  const recuos = Math.max(0, p.recuoBaixo ?? 0) + Math.max(0, p.recuoCima ?? 0);
  const preciso = Math.max(p.diametroExterno, recuos > 0 ? recuos + minimo : 0);
  if (desvio >= preciso - FOLGA) return null;
  const porDiametro = desvio < p.diametroExterno - FOLGA;
  const causa = porDiametro ? `menor que o diâmetro externo da peça de mudança de direção (${mm(p.diametroExterno)}): o joelho de cima e o de baixo se sobreporiam` : `o trecho vertical, depois dos recuos das duas peças (${mm(recuos)}), ficaria menor que o mínimo de ${mm(minimo)}`;
  return { ok: false, severidade: 'bloqueio', codigo: 'cota_insuficiente', trechoAfetado: indice, faltam: preciso - desvio, motivo: `Mudança de cota de ${mm(desvio)} insuficiente para a prumada: ${causa}. Precisa de pelo menos ${mm(preciso)} (faltam ${mm(preciso - desvio)}).` };
}

function conferirDeclividade(d: DeclividadeViabilidade, i: number): Problema | null {
  const limite = LIMITES_DECLIVIDADE[d.dominio];
  if (!limite || d.dn > limite.dnMaxMm) return null;
  const pct = Math.abs(d.percentual);
  if (pct >= limite.minPercentual - FOLGA && pct <= limite.maxPercentual + FOLGA) return null;
  const pct1 = num(pct, 2);
  return { ok: false, severidade: 'aviso', codigo: 'declividade_fora_do_limite', trechoAfetado: d.indice ?? i, motivo: `Declividade de ${pct1} % fora da faixa de ${limite.minPercentual} % a ${limite.maxPercentual} % para esgoto até DN ${limite.dnMaxMm} (faixa a CONFERIR com a norma).` };
}

/** Todos os problemas, na ordem fixa: trechos, prumadas, declividades. */
export function listarProblemasDeViabilidade(entrada: EntradaViabilidade): Problema[] {
  const saida: Problema[] = [];
  const minimo = entrada.trechoMinimo ?? COMPRIMENTO_MINIMO_TRECHO;
  (entrada.trechos ?? []).forEach((t, i) => { const p = conferirTrecho(t, i, minimo); if (p) saida.push(p); });
  (entrada.prumadas ?? []).forEach((t, i) => { const p = conferirPrumada(t, i, minimo); if (p) saida.push(p); });
  (entrada.declividades ?? []).forEach((t, i) => { const p = conferirDeclividade(t, i); if (p) saida.push(p); });
  return saida;
}

/** Primeiro problema, com bloqueio antes de aviso; `{ ok: true }` se tudo certo. Ver o cabeçalho do arquivo. */
export function verificarViabilidade(entrada: EntradaViabilidade): ResultadoViabilidade {
  const todos = listarProblemasDeViabilidade(entrada);
  return todos.find((p) => p.severidade === 'bloqueio') ?? todos[0] ?? { ok: true };
}
