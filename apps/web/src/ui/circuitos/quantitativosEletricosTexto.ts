import type { ContagemPontos, QuantitativosEletricos } from '@hestia/engine';
import { numeroMep } from '../orcamentoMep.ts';

/*
 * Parte pura do diálogo "Quantitativos elétricos" (ficha C6): achata o quantitativo do engine em linhas (uma por item) e monta o CSV
 * no mesmo padrão das instalações do orçamento (separador `;`, decimal com vírgula, campo entre aspas quando preciso). Texto fixo em
 * português, como o diálogo Circuitos. Sem norma: só contagem e comprimento de traçado.
 */

export type UnidadeQuantitativoEletrico = 'm' | 'VA';

export interface LinhaQuantitativoEletrico {
  /** "Projeto" ou o nome do circuito. */
  escopo: string;
  grupo: string;
  item: string;
  quantidade: number;
  /** Comprimento (m) ou potência (VA); `null` quando a linha só conta peças. */
  medida: number | null;
  unidade: UnidadeQuantitativoEletrico | null;
}

export const CABECALHO_QUANTITATIVO_ELETRICO: readonly string[] = ['Escopo', 'Grupo', 'Item', 'Quantidade', 'Medida', 'Unidade'];

const PROJETO = 'Projeto';
/** Grupo da linha do eletroduto corrugado (ficha F2): trecho reto flexível, sem curvas nem luvas. */
const GRUPO_CORRUGADO = 'Eletroduto corrugado';
const SEM_CAMINHO = 'pontos sem eletroduto até o quadro';

/** Rótulo da bitola: "DN 20", ou "sem bitola" quando a família não tem DN. */
export function bitolaTexto(bitola: number | null): string {
  return bitola === null ? 'sem bitola' : `DN ${numeroMep(bitola, 0)}`;
}

/** Linhas de pontos com quantidade maior que zero, na ordem tomada, interruptor, luminária e outro ponto. */
function linhasDePontos(pontos: ContagemPontos): Array<[string, number]> {
  return (
    [
      ['Tomada', pontos.tomadas],
      ['Interruptor', pontos.interruptores],
      ['Luminária', pontos.luminarias],
      ['Outro ponto', pontos.outros],
    ] as Array<[string, number]>
  ).filter(([, n]) => n > 0);
}

/** Achata o quantitativo em linhas: primeiro o projeto (eletrodutos, curvas, luvas, caixas, quadros, pontos, outros), depois cada circuito. */
export function linhasQuantitativoEletrico(q: QuantitativosEletricos): LinhaQuantitativoEletrico[] {
  const linhas: LinhaQuantitativoEletrico[] = [];
  const add = (escopo: string, grupo: string, item: string, quantidade: number, medida: number | null = null, unidade: UnidadeQuantitativoEletrico | null = null): void => {
    linhas.push({ escopo, grupo, item, quantidade, medida, unidade });
  };

  for (const l of q.eletrodutos) add(PROJETO, 'Eletroduto', bitolaTexto(l.bitola), l.trechos, l.comprimentoM, 'm');
  for (const l of q.corrugados ?? []) add(PROJETO, GRUPO_CORRUGADO, `${l.nome}, ${bitolaTexto(l.bitola)}`, l.trechos, l.comprimentoM, 'm');
  for (const l of q.curvas) add(PROJETO, 'Curva', bitolaTexto(l.bitola), l.quantidade);
  for (const l of q.luvas) add(PROJETO, 'Luva', bitolaTexto(l.bitola), l.quantidade);
  for (const l of q.caixas) add(PROJETO, 'Caixa', l.nome, l.quantidade);
  for (const qd of q.quadros) add(PROJETO, 'Quadro', qd.posicoes === null ? qd.nome : `${qd.nome}, ${qd.posicoes} posições`, 1);
  for (const [rotulo, n] of linhasDePontos(q.pontos)) add(PROJETO, 'Ponto', rotulo, n);
  for (const l of q.outros) add(PROJETO, 'Outros', l.nome, l.quantidade);

  for (const c of q.circuitos) {
    add(c.nome, 'Quadro', c.quadroNome ?? 'sem quadro', 1);
    const pontos = c.pontos.tomadas + c.pontos.interruptores + c.pontos.luminarias + c.pontos.outros;
    add(c.nome, 'Potência', `${c.rotuloTipo}, ${pontos} ponto(s)`, pontos, c.totalVA, 'VA');
    for (const [rotulo, n] of linhasDePontos(c.pontos)) add(c.nome, 'Ponto', rotulo, n);
    for (const l of c.eletrodutos) add(c.nome, 'Eletroduto', bitolaTexto(l.bitola), l.trechos, l.comprimentoM, 'm');
    for (const l of c.corrugados ?? []) add(c.nome, GRUPO_CORRUGADO, `${l.nome}, ${bitolaTexto(l.bitola)}`, l.trechos, l.comprimentoM, 'm');
    for (const l of c.curvas) add(c.nome, 'Curva', bitolaTexto(l.bitola), l.quantidade);
    for (const l of c.luvas) add(c.nome, 'Luva', bitolaTexto(l.bitola), l.quantidade);
    for (const l of c.caixas) add(c.nome, 'Caixa', l.nome, l.quantidade);
    if (c.semCaminho > 0) add(c.nome, 'Sem caminho', SEM_CAMINHO, c.semCaminho);
  }
  return linhas;
}

/** Medida com a unidade ("3,500 m", "900 VA"); vazio quando a linha não tem medida. */
export function textoMedidaQuantitativo(l: Pick<LinhaQuantitativoEletrico, 'medida' | 'unidade'>): string {
  if (l.medida === null || l.unidade === null) return '';
  return l.unidade === 'm' ? `${numeroMep(l.medida, 3)} m` : `${numeroMep(l.medida, 0)} VA`;
}

/** Campo CSV: entre aspas duplas quando contém `;`, `"` ou quebra de linha (aspas duplicadas dentro). */
function campoCsv(valor: string): string {
  if (!/[;"\n\r]/.test(valor)) return valor;
  return `"${valor.replace(/"/g, '""')}"`;
}

/** CSV do quantitativo: cabeçalho, uma linha por item, decimal com vírgula e quebra `\n`. */
export function csvQuantitativoEletrico(linhas: readonly LinhaQuantitativoEletrico[]): string {
  const corpo = linhas.map((l) => {
    const campos = [
      l.escopo,
      l.grupo,
      l.item,
      String(l.quantidade),
      l.medida === null ? '' : numeroMep(l.medida, l.unidade === 'm' ? 3 : 0),
      l.unidade ?? '',
    ];
    return campos.map(campoCsv).join(';');
  });
  return [CABECALHO_QUANTITATIVO_ELETRICO.map(campoCsv).join(';'), ...corpo].join('\n');
}
