import type { Parametro, Tipo, Valor } from '../tipos.ts';
import type { Corpo } from '../tiposCorpo.ts';
import type { CotaFamilia, DetalheFamilia, TabelaFamilia, Verificacao } from '../tiposRepresentacao.ts';
import { corpoCaixa, parametroNumero } from './caixasHidroApoio.ts';
import { derivado, inteiro } from './novosApoio.ts';
import { dimensao } from './tuboEsgotoApoio.ts';

/*
 * Apoio das fossas, filtro, sumidouro e vala (ficha F4, ADR 0061). Dimensões em mm; volumes em litros (mm³ / 10^6).
 * AVISO: a fórmula do volume útil e todos os valores abaixo são DE MEMÓRIA e RAZOÁVEIS. Nenhuma família afirma atender à norma:
 * tudo é parâmetro editável. Cada valor de norma leva o comentário `CONFERIR: NBR 7229 (norma vigente)`.
 * Eixos: X largura (L), Y profundidade (P), Z altura (A), fundo em z = 0.
 */

/** π, escrito uma vez só e interpolado nas fórmulas (a linguagem de fórmulas não tem constante π). */
export const PI = 3.141592653589793;
/** DNs de entrada e saída das fossas: 100 e 150. CONFERIR: NBR 7229 (norma vigente). */
export const DNS_FOSSA = [100, 150] as const;

// CONFERIR: NBR 7229 (norma vigente): contribuição diária de esgoto por pessoa (L/pessoa·dia).
export const PADRAO_CONTRIBUICAO = 130;
// CONFERIR: NBR 7229 (norma vigente): tempo de detenção (dias).
export const PADRAO_DETENCAO = 1;
// CONFERIR: NBR 7229 (norma vigente): taxa de acúmulo de lodo K (dias, conforme o intervalo de limpeza e a temperatura).
export const PADRAO_TAXA_LODO = 65;
// CONFERIR: NBR 7229 (norma vigente): contribuição de lodo fresco Lf (L/pessoa·dia).
export const PADRAO_LODO_FRESCO = 1;
// CONFERIR: NBR 13969 (norma vigente): tempo de detenção do filtro anaeróbio (dias) e fator do volume útil.
export const PADRAO_DETENCAO_FILTRO = 0.5;
export const FATOR_FILTRO = 1.6;
// CONFERIR: taxa de infiltração do solo (L/m²·dia): só o ensaio de percolação do terreno define.
export const PADRAO_TAXA_INFILTRACAO = 60;

/** Volume exigido (L) = 1000 + N · (C · T + K · Lf). CONFERIR: NBR 7229 (norma vigente). */
export const FORMULA_VOLUME_EXIGIDO = '1000 + nContrib * (contribDia * tempoDetencao + taxaLodo * lodoFresco)';
/** Volume exigido do filtro (L) = fator · N · C · T. CONFERIR: NBR 13969 (norma vigente). */
export const FORMULA_VOLUME_FILTRO = 'fatorFiltro * nContrib * contribDia * tempoDetencao';

/** Volume exigido (L) em TypeScript, com a mesma fórmula, para dimensionar os tipos. */
export const volumeExigido = (n: number): number => 1000 + n * (PADRAO_CONTRIBUICAO * PADRAO_DETENCAO + PADRAO_TAXA_LODO * PADRAO_LODO_FRESCO);
export const volumeExigidoFiltro = (n: number): number => FATOR_FILTRO * n * PADRAO_CONTRIBUICAO * PADRAO_DETENCAO_FILTRO;
/** Área de infiltração exigida (m²) = vazão diária / taxa de infiltração. */
export const areaExigida = (n: number): number => (n * PADRAO_CONTRIBUICAO) / PADRAO_TAXA_INFILTRACAO;

/** Arredonda para cima ao múltiplo de `passo` (mm). */
export const acima = (x: number, passo = 50): number => Math.ceil(x / passo - 1e-9) * passo;

/** DN da fossa (enum 100 e 150) com o escopo `tipo`. */
export function parametroDnFossa(): Parametro {
  return { id: 'DN', nome: 'Diâmetro nominal (DN)', tipo: 'enum', escopo: 'tipo', padrao: 100, grupo: 'Bitola', opcoes: DNS_FOSSA.map((dn) => ({ valor: dn, rotulo: `DN ${dn}` })) };
}

/** Parâmetros de dimensionamento (padrões editáveis, todos CONFERIR) e o volume exigido, conforme o tipo de família. */
export function parametrosNorma(exigido: 'fossa' | 'filtro' | 'infiltracao'): Parametro[] {
  const g = 'Dimensionamento (CONFERIR)';
  const base: Parametro[] = [{ ...inteiro('nContrib', 'Número de contribuintes', 5, 1, 500, 'instancia'), grupo: g }];
  const c = (id: string, nome: string, padrao: number, min: number, max: number): Parametro => ({ ...parametroNumero(id, nome, padrao, min, max, 'tipo', g), passo: 0.5 });
  if (exigido === 'infiltracao') {
    return [
      ...base,
      c('contribDia', 'Contribuição diária (L/pessoa·dia)', PADRAO_CONTRIBUICAO, 20, 600),
      c('taxaInfiltracao', 'Taxa de infiltração do solo (L/m²·dia)', PADRAO_TAXA_INFILTRACAO, 5, 500),
      derivado('areaExigida', 'Área de infiltração exigida (m²)', 'nContrib * contribDia / taxaInfiltracao'),
    ];
  }
  if (exigido === 'filtro') {
    return [
      ...base,
      c('contribDia', 'Contribuição diária (L/pessoa·dia)', PADRAO_CONTRIBUICAO, 20, 600),
      c('tempoDetencao', 'Tempo de detenção do filtro (dias)', PADRAO_DETENCAO_FILTRO, 0.1, 5),
      c('fatorFiltro', 'Fator do volume do filtro', FATOR_FILTRO, 0.5, 5),
      derivado('volumeExigido', 'Volume útil exigido (litros)', FORMULA_VOLUME_FILTRO),
    ];
  }
  return [
    ...base,
    c('contribDia', 'Contribuição diária C (L/pessoa·dia)', PADRAO_CONTRIBUICAO, 20, 600),
    c('tempoDetencao', 'Tempo de detenção T (dias)', PADRAO_DETENCAO, 0.2, 5),
    c('taxaLodo', 'Taxa de acúmulo de lodo K (dias)', PADRAO_TAXA_LODO, 10, 500),
    c('lodoFresco', 'Lodo fresco Lf (L/pessoa·dia)', PADRAO_LODO_FRESCO, 0.1, 10),
    derivado('volumeExigido', 'Volume útil exigido (litros)', FORMULA_VOLUME_EXIGIDO),
  ];
}

/** Construção comum: DN, espessuras, espaço livre, L, P, A, cotas de fundo das tubulações e face da entrada. */
export function parametrosConstrucao(): Parametro[] {
  return [
    parametroDnFossa(),
    parametroNumero('e', 'Espessura da parede', 100, 40, 400, 'tipo'),
    parametroNumero('ef', 'Espessura do fundo', 100, 50, 400, 'tipo'),
    parametroNumero('et', 'Espessura da tampa', 80, 40, 300, 'tipo'),
    parametroNumero('hLivre', 'Espaço livre acima do líquido', 300, 100, 1000, 'tipo'),
    dimensao('L', 'Largura (diâmetro externo, se cilíndrica)'),
    dimensao('P', 'Profundidade (igual a L, se cilíndrica)'),
    dimensao('A', 'Altura (profundidade total)'),
    parametroNumero('cotaEntrada', 'Cota de fundo da entrada', 1000, 0, 10000, 'instancia', 'Tubulações'),
    parametroNumero('cotaSaida', 'Cota de fundo da saída', 950, 0, 10000, 'instancia', 'Tubulações'),
    { id: 'faceEntrada', nome: 'Face da entrada', tipo: 'enum', escopo: 'instancia', padrao: 'esquerda', grupo: 'Construção', opcoes: [{ valor: 'esquerda', rotulo: 'Esquerda (−X)' }, { valor: 'direita', rotulo: 'Direita (+X)' }] },
  ];
}

/** Valores de um tipo: entrada com o topo do tubo a 100 mm sob a tampa e saída 50 mm abaixo da entrada. CONFERIR. */
export function valoresTipo(n: number, dn: number, dims: Record<string, number>, extra: Record<string, Valor> = {}): Record<string, Valor> {
  const topo = (dims['A'] ?? 0) - 80;
  return { nContrib: n, DN: dn, ...dims, cotaEntrada: topo - dn - 100, cotaSaida: topo - dn - 150, ...extra };
}

export const tipoDe = (id: string, nome: string, valores: Record<string, Valor>): Tipo => ({ id, nome, valores });

/** Verificação de volume útil abaixo do exigido (contribuintes demais): AVISO, porque a fórmula e as tabelas são CONFERIR. */
export function verificacaoVolume(): Verificacao {
  return { id: 'volumeInsuficiente', severidade: 'aviso', condicao: 'volumeUtil < volumeExigido', mensagem: 'Volume útil de {volumeUtil} L menor que o exigido de {volumeExigido} L para {nContrib} contribuintes (CONFERIR: NBR 7229, norma vigente)' };
}

/** Verificações geométricas comuns: DN cabe, entrada abaixo da tampa, saída acima da entrada. */
export function verificacoesFossa(extra: Verificacao[] = []): Verificacao[] {
  return [
    { id: 'diametroCabe', severidade: 'erro', condicao: 'DN > L - 2 * e', mensagem: 'Tubulação DN {DN} não cabe na largura interna' },
    { id: 'entradaAcimaDaTampa', severidade: 'erro', condicao: 'cotaEntrada + DN / 2 > A - et', mensagem: 'Entrada com cota de {cotaEntrada} mm fica acima da tampa' },
    { id: 'saidaAcimaDaEntrada', severidade: 'aviso', condicao: 'cotaSaida > cotaEntrada', mensagem: 'Saída com cota de {cotaSaida} mm acima da entrada ({cotaEntrada} mm)' },
    ...extra,
  ];
}

/** Tabela de dimensões por tipo; `volume` é o id do parâmetro de volume (ou área) da família. */
export function tabelaFossa(coluna: { titulo: string; valor: string; unidade: string }): TabelaFamilia[] {
  return [
    {
      id: 'dimensoes',
      nome: 'Dimensões',
      porTipo: true,
      colunas: [{ titulo: 'Contribuintes', valor: 'nContrib' }, { titulo: 'Largura', valor: 'L', unidade: 'mm' }, { titulo: 'Altura', valor: 'A', unidade: 'mm' }, coluna],
    },
  ];
}

/**
 * Detalhe de corte longitudinal (plano XZ em y = 0) com as cotas de profundidade total, de fundo da entrada e de fundo da saída,
 * todas dirigidas pelos parâmetros (D4), e a altura útil medida (sem parâmetro). Entrada e saída ficam nas faces ±L/2.
 */
export function detalheCorte(opcoes: { saida?: boolean; fundo?: boolean } = {}): DetalheFamilia {
  const { saida = true, fundo = true } = opcoes;
  const xEntrada = 'faceEntrada == "direita" ? L / 2 : 0 - L / 2';
  const xSaida = 'faceEntrada == "direita" ? 0 - L / 2 : L / 2';
  const cotas: CotaFamilia[] = [
    { id: 'profundidade', de: { tipo: 'ponto', ponto: ['0', '0', '0'] }, ate: { tipo: 'ponto', ponto: ['0', '0', 'A'] }, deslocamento: 'L / 2 + 200', parametro: 'A' },
    { id: 'fundoEntrada', de: { tipo: 'ponto', ponto: [xEntrada, '0', '0'] }, ate: { tipo: 'ponto', ponto: [xEntrada, '0', 'cotaEntrada'] }, deslocamento: '300', parametro: 'cotaEntrada' },
  ];
  if (saida) cotas.push({ id: 'fundoSaida', de: { tipo: 'ponto', ponto: [xSaida, '0', '0'] }, ate: { tipo: 'ponto', ponto: [xSaida, '0', 'cotaSaida'] }, deslocamento: '300', parametro: 'cotaSaida' });
  cotas.push({ id: 'alturaUtil', de: { tipo: 'ponto', ponto: ['0', '0', fundo ? 'ef' : '0'] }, ate: { tipo: 'ponto', ponto: ['0', '0', fundo ? 'A - et - hLivre' : 'A - et'] }, deslocamento: '0 - L / 2 - 200' });
  return { id: 'corteLongitudinal', nome: 'Corte longitudinal', vista: 'corte', plano: { eixo: 'y', posicao: '0' }, escala: 25, cotas };
}

/** Parede, fundo e tampa de fossa cilíndrica (L é o diâmetro externo). */
export function corposCilindro(): Corpo[] {
  return [
    corpoCaixa('parede', 'Parede', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'anel', diametroExterno: 'L', diametroInterno: 'L - 2 * e' }, comprimento: 'A - ef' }, { origem: ['0', '0', 'ef'] }),
    corpoCaixa('fundo', 'Fundo', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L' }, comprimento: 'ef' }, { origem: ['0', '0', '0'] }),
    corpoCaixa('tampa', 'Tampa', 'tampa', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L - 2 * e' }, comprimento: 'et' }, { origem: ['0', '0', 'A - et'] }),
  ];
}
