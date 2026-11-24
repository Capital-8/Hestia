import type { Eixo, Expr, NivelDetalhe } from './tipos.ts';
import type { Ponto2, Ponto3 } from './tiposCorpo.ts';

/*
 * CONTRATO das REPRESENTAÇÕES e do DETALHAMENTO da família (ADR 0061 §D4 e §D5, CONTRATO.md §4 e §5).
 * SÓ tipos e constantes. Texto em milímetros e graus. Os símbolos 2D usam eixos locais da família: `xy` = planta (x
 * largura, y profundidade), `xz` = elevação frontal (x, z), `yz` = elevação lateral (y, z).
 */

export const LIMITES_REPRESENTACAO = { simbolos: 64, primitivos: 256, detalhes: 16, cotas: 64, tabelas: 8, colunas: 16, verificacoes: 64 } as const;

export type PlanoSimbolo = 'xy' | 'xz' | 'yz';
export type VistaSimbolo = 'planta' | 'corte' | 'elevacao';

export type Primitivo2D =
  | { tipo: 'linha'; de: Ponto2; ate: Ponto2 }
  | { tipo: 'circulo'; centro: Ponto2; raio: Expr }
  | { tipo: 'arco'; centro: Ponto2; raio: Expr; deGraus: Expr; ateGraus: Expr }
  | { tipo: 'polilinha'; pontos: Ponto2[]; fechada?: boolean }
  | { tipo: 'texto'; posicao: Ponto2; texto: Expr; altura: Expr };

export interface Simbolo2D {
  id: string;
  nome: string;
  vistas: VistaSimbolo[];
  plano: PlanoSimbolo;
  primitivos: Primitivo2D[];
  /** Quando `true`, esconde a projeção automática dos corpos e peças nas mesmas vistas (o símbolo manda). */
  substituiGeometria?: boolean;
  detalhe?: NivelDetalhe[];
  quando?: Expr;
}

/** Ponto de referência de cota: plano nomeado da família, ponto livre ou ligação. */
export type ReferenciaCota =
  | { tipo: 'plano'; id: string }
  | { tipo: 'ponto'; ponto: Ponto3 }
  | { tipo: 'ligacao'; id: string };

export interface CotaFamilia {
  id: string;
  de: ReferenciaCota;
  ate: ReferenciaCota;
  /** Afastamento da linha de cota (mm). */
  deslocamento?: Expr;
  /** Parâmetro que a cota dirige (cadeado); ausente = só mostra o valor medido. */
  parametro?: string;
  /** Texto fixo (fórmula de texto) no lugar do valor medido. */
  texto?: Expr;
}

/** Vista nomeada da própria família: sai no detalhamento sempre que a família é inserida numa prancha. */
export interface DetalheFamilia {
  id: string;
  nome: string;
  vista: VistaSimbolo;
  /** Plano de corte (vista `corte`) ou lado de observação (vista `elevacao`): eixo normal e posição (mm). */
  plano?: { eixo: Eixo; posicao: Expr; sentido?: 1 | -1 };
  /** Denominador da escala (20 = 1:20). */
  escala: number;
  cotas?: CotaFamilia[];
  simbolos?: string[];
}

export interface ColunaTabela {
  titulo: string;
  /** Fórmula sobre os parâmetros da família. */
  valor: Expr;
  unidade?: string;
}

/** Tabela de dimensões da família (uma linha por tipo, ou uma linha só da instância). */
export interface TabelaFamilia {
  id: string;
  nome: string;
  porTipo: boolean;
  colunas: ColunaTabela[];
}

/** Regra de verificação: se `condicao` é verdadeira, a mensagem aparece (ex.: volume útil abaixo do exigido). */
export interface Verificacao {
  id: string;
  severidade: 'aviso' | 'erro';
  condicao: Expr;
  mensagem: string;
}

/** Classe IFC de exportação; ausente = decidida pela categoria (CONTRATO.md §6). */
export type ClasseIfc =
  | 'IFCFURNITURE'
  | 'IFCPIPESEGMENT'
  | 'IFCPIPEFITTING'
  | 'IFCDUCTSEGMENT'
  | 'IFCDUCTFITTING'
  | 'IFCCABLECARRIERSEGMENT'
  | 'IFCCABLECARRIERFITTING'
  | 'IFCCABLESEGMENT'
  | 'IFCSANITARYTERMINAL'
  | 'IFCFLOWTERMINAL'
  | 'IFCLIGHTFIXTURE'
  | 'IFCELECTRICAPPLIANCE'
  | 'IFCOUTLET'
  | 'IFCSWITCHINGDEVICE'
  | 'IFCAIRTERMINAL'
  | 'IFCTANK'
  | 'IFCSTRUCTURALMEMBER'
  | 'IFCMEMBER'
  | 'IFCPLATE'
  | 'IFCBUILDINGELEMENTPROXY';
