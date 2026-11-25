import type { PontoSegmento } from './orientarSegmento.ts';
import { posicionarConexao, TOLERANCIA_ANGULO, type ConexaoEncontro, type PosicaoConexao, type RegrasConexao, type TipoConexao } from './posicaoConexao.ts';
import { resolverNo, type SolucaoNo } from './resolvedorNo.ts';

// `posicionarConexao` e os tipos da decisão moraram aqui até a ficha B2; seguem exportados daqui (e do índice) como antes.
export { posicionarConexao, TOLERANCIA_ANGULO };
export type { ConexaoEncontro, PosicaoConexao, RegrasConexao, TipoConexao };

/*
 * Conexões automáticas de tubos (ficha C6, CONTRATO §7): dado o encontro de trechos, decide qual conexão da família do domínio
 * entra (luva, curva 90°, curva 45°, redução, tê, junção 45°) e como posicionar a instância. Funções puras e determinísticas.
 * Unidades: pontos em metros, diâmetros nominais (DN) em mm, ângulos em graus nas regras e em radianos na orientação.
 */

/** Regras por domínio; domínio sem entrada não ganha conexão automática (a ferramenta avisa). */
export const CONEXOES_POR_DOMINIO: Readonly<Record<string, RegrasConexao>> = {
  esgoto: {
    tubo: 'fam_tubo_esgoto',
    curva90: 'fam_esgoto_curva90',
    curva45: 'fam_esgoto_curva45',
    te: 'fam_esgoto_te',
    juncao45: 'fam_esgoto_juncao45',
    luva: 'fam_esgoto_luva',
    reducao: 'fam_esgoto_reducao',
    tampao: 'fam_esgoto_tampao',
  },
};

/** Família de tubo do primeiro domínio cujo tubo real existe no projeto; `undefined` se nenhum (a ferramenta usa o padrão). */
export function idTuboDoProjeto(familias: Readonly<Record<string, unknown>> | undefined): string | undefined {
  for (const r of Object.values(CONEXOES_POR_DOMINIO)) if (familias?.[r.tubo] !== undefined) return r.tubo;
  return undefined;
}

/** Trecho reto entre `a` e `b` (m) com o diâmetro nominal em mm. */
export interface TrechoEncontro {
  a: PontoSegmento;
  b: PontoSegmento;
  dn: number;
}

/** Resultado de uma avaliação: a conexão (ou `null`) e o aviso em português quando não há conexão a inserir. */
export interface ResultadoConexao {
  conexao: ConexaoEncontro | null;
  aviso: string | null;
}

type V3 = [number, number, number];

/** Direção (não normalizada) de `de` rumo a `para`; o resolvedor normaliza e trata o vetor nulo como trecho nulo. */
const vetor = (de: PontoSegmento, para: PontoSegmento): V3 => [para[0] - de[0], para[1] - de[1], para[2] - de[2]];

/** Traduz a solução do resolvedor para o resultado histórico `{ conexao, aviso }`. `direto` (tipo sem luva) mantém o aviso de peça ausente. */
function emResultado(s: SolucaoNo): ResultadoConexao {
  if (s.status === 'ok') return { conexao: s.conexao, aviso: null };
  if (s.status === 'direto') return { conexao: null, aviso: `Este tipo de tubulação não tem ${NOME_DO_TIPO.luva}: o trecho fica sem essa conexão.` };
  return { conexao: null, aviso: s.motivo };
}

const NOME_DO_TIPO: Record<TipoConexao, string> = { luva: 'luva', curva90: 'joelho ou curva de 90°', curva45: 'joelho ou curva de 45°', reducao: 'redução', te: 'tê', juncao45: 'junção de 45°' };

/**
 * Conexão para o encontro das pontas `pontaA` de `trechoA` e `pontaB` de `trechoB` (as duas no mesmo ponto), com o aviso do motivo
 * quando não há conexão. Camada fina sobre `resolverNo`: ver as regras lá (180° luva ou redução, 90°, 135°, avisos).
 */
export function avaliarEncontro(trechoA: TrechoEncontro, pontaA: 'a' | 'b', trechoB: TrechoEncontro, pontaB: 'a' | 'b', regras: RegrasConexao): ResultadoConexao {
  const sai = (t: TrechoEncontro, p: 'a' | 'b'): V3 => (p === 'a' ? vetor(t.a, t.b) : vetor(t.b, t.a));
  return emResultado(resolverNo({ tipo: { regras }, no: { tipo: 'encontro', trechos: [{ direcao: sai(trechoA, pontaA), dn: trechoA.dn }, { direcao: sai(trechoB, pontaB), dn: trechoB.dn }] } }));
}

/** Conexão do encontro (ou `null`); o motivo da ausência sai de `avaliarEncontro`. */
export function conexaoParaEncontro(trechoA: TrechoEncontro, pontaA: 'a' | 'b', trechoB: TrechoEncontro, pontaB: 'a' | 'b', regras: RegrasConexao): ConexaoEncontro | null {
  return avaliarEncontro(trechoA, pontaA, trechoB, pontaB, regras).conexao;
}

/**
 * Derivação: a ponta `pontaRamal` do ramal toca o MEIO do trecho principal em `ponto` (o principal será dividido em dois).
 * Camada fina sobre `resolverNo`: ramal a 90° do principal tê; a 45° junção 45°; outro ângulo sem conexão e com aviso.
 */
export function avaliarDerivacao(principal: TrechoEncontro, ponto: PontoSegmento, ramal: TrechoEncontro, pontaRamal: 'a' | 'b', regras: RegrasConexao): ResultadoConexao {
  const dirRamal = pontaRamal === 'a' ? vetor(ramal.a, ramal.b) : vetor(ramal.b, ramal.a);
  return emResultado(resolverNo({ tipo: { regras }, no: { tipo: 'derivacao', principal: { rumoA: vetor(ponto, principal.a), rumoB: vetor(ponto, principal.b), dn: principal.dn }, ramal: { direcao: dirRamal, dn: ramal.dn } } }));
}

/** Conexão da derivação (ou `null`). */
export function conexaoParaDerivacao(principal: TrechoEncontro, ponto: PontoSegmento, ramal: TrechoEncontro, pontaRamal: 'a' | 'b', regras: RegrasConexao): ConexaoEncontro | null {
  return avaliarDerivacao(principal, ponto, ramal, pontaRamal, regras).conexao;
}

