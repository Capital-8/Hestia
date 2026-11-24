import type { Expr } from './tipos.ts';
import type { Ponto3 } from './tiposCorpo.ts';

/*
 * CONTRATO das LIGAÇÕES (pontos de conexão tipados de MEP e estrutura; ADR 0061 §D3, CONTRATO.md §3).
 * Diferente do `Conector` da marcenaria (face da caixa para encaixar móveis), a `Ligacao` é um PONTO com direção, domínio
 * e seção. SÓ tipos e constantes. Texto em milímetros; direção é vetor (não precisa ser unitário, o resolvedor normaliza).
 */

export const LIMITES_LIGACAO = { ligacoes: 32, propriedades: 16 } as const;

export type DominioLigacao =
  | 'agua_fria'
  | 'agua_quente'
  | 'esgoto'
  | 'ventilacao'
  | 'pluvial'
  | 'gas'
  | 'incendio'
  | 'eletrica_forca'
  | 'eletrica_dados'
  | 'eletroduto'
  | 'eletrocalha'
  | 'ar_insuflamento'
  | 'ar_retorno'
  | 'refrigerante'
  | 'estrutural';

export type SecaoLigacao = 'redonda' | 'retangular';
export type FluxoLigacao = 'entrada' | 'saida' | 'ambos';

/**
 * Encaixe físico de uma ligação (fase 2, ficha P1): `bolsa` recebe a ponta de outra peça até `profundidade` (mm, fórmula);
 * `ponta` é a extremidade lisa que entra. Duas ligações só se conectam bolsa × ponta, salvo se alguma declarar `aceitaMesmoTipo`
 * (luva dupla, manga de correr). Ligação sem `encaixe` mantém o comportamento anterior (não participa da regra).
 */
export type TipoEncaixe = 'bolsa' | 'ponta';

export interface EncaixeLigacao {
  tipo: TipoEncaixe;
  /** Profundidade da bolsa (mm, fórmula); obrigatória na bolsa, proibida na ponta. */
  profundidade?: Expr;
  aceitaMesmoTipo?: boolean;
}

export interface Ligacao {
  id: string;
  nome: string;
  dominio: DominioLigacao;
  /** Nome do sistema padrão ao conectar (ex.: "Esgoto primário"); texto livre. */
  sistema?: string;
  secao: SecaoLigacao;
  /** Posição no sistema local da família (mm). */
  posicao: Ponto3;
  /** Sentido PARA FORA do corpo (por onde o tubo sai). */
  direcao: Ponto3;
  diametro?: Expr;
  largura?: Expr;
  altura?: Expr;
  fluxo: FluxoLigacao;
  encaixe?: EncaixeLigacao;
  /** Domínios com que pode se unir; ausente = só o próprio domínio. */
  aceita?: DominioLigacao[];
  /** Dados do ponto (vazão, pressão, potência, tensão...), fórmulas ou números. Só informação; alimenta tabelas e verificações. */
  propriedades?: Record<string, Expr>;
  /** Id de parâmetro de instância sobrescrito pela seção da ligação a que este ponto se conectar (propagação de bitola). */
  propagaParametro?: string;
  quando?: Expr;
}
