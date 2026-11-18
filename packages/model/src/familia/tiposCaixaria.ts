/*
 * CONTRATO de Caixaria paramétrica por árvore de vãos (sobre a base de `Familia`, em MILÍMETROS no modelo e METROS na
 * resolução 3D). A árvore compila para `pecas[]` e `ferragens[]` existentes e preserva peças/fórmulas customizadas.
 */

export type EstruturaCaixa = 'base_topo' | 'laterais_passantes' | 'sem_topo' | 'aberta';

export interface RodapeCaixa {
  tipo: 'nenhum' | 'recuado' | 'pes';
  /** Altura do rodapé ou dos pés (mm). */
  altura: number;
  /** Recuo frontal (mm) quando `tipo === 'recuado'`. */
  recuo: number;
}

export interface FundoCaixa {
  tipo: 'encaixado' | 'pregado' | 'espesso' | 'nenhum';
  /** Espessura do fundo (mm), padrão 6 mm (ou 15/18 mm para `espesso`). */
  espessura: number;
  /** Recuo a partir do fundo traseiro (mm) quando `tipo === 'encaixado'`. */
  recuo: number;
}

export interface RecorteTampo {
  largura: number;
  profundidade: number;
  /** Deslocamento X relativo ao centro do tampo (mm). */
  dx?: number;
  /** Deslocamento Y relativo ao centro do tampo (mm). */
  dy?: number;
}

export interface TampoCaixa {
  espessura: number;
  avancoFrente: number;
  avancoEsq: number;
  avancoDir: number;
  avancoFundo: number;
  engrossado?: boolean;
  espessuraMoldura?: number;
  recorte?: RecorteTampo;
}

export interface TamponamentoCaixa {
  esquerda?: boolean;
  direita?: boolean;
  topo?: boolean;
  base?: boolean;
  espessura?: number;
  avancoFrente?: number;
}

export type ModoDivisao = 'proporcional' | 'fixo_inicio' | 'fixo_fim';

export interface DivisaoItem {
  id: string;
  modo: ModoDivisao;
  /** Se `proporcional`: fração (0..1) da luz útil do vão pai; se `fixo_inicio` ou `fixo_fim`: distância em mm da face interna. */
  valor: number;
  /** Recuo frontal da prateleira ou divisória em relação à frente da caixaria (mm). */
  recuoFrente?: number;
}

export type EstiloPorta = 'giro_1' | 'giro_2' | 'basculante' | 'correr';
export type MontagemFrente = 'sobreposta' | 'embutida';

export type PreenchimentoVao =
  | { tipo: 'nenhum' }
  | {
      tipo: 'porta';
      estilo: EstiloPorta;
      montagem: MontagemFrente;
      dobradicaLado?: 'esquerda' | 'direita';
      folga?: number;
      folhasCorrer?: number;
    }
  | {
      tipo: 'gavetas';
      quantidade: number;
      montagem: MontagemFrente;
      gavetoes?: number;
      folga?: number;
    }
  | { tipo: 'cabideiro'; alturaOffsetTopo?: number }
  | { tipo: 'ripado'; direcao: 'vertical' | 'horizontal'; larguraRipa: number; espacamento: number; profundidadeRipa?: number }
  | { tipo: 'sapateira'; quantidade: number; inclinacaoGraus?: number };

export interface DivisaoVao {
  eixo: 'x' | 'z';
  itens: DivisaoItem[];
}

export interface Vao {
  id: string;
  divisao?: DivisaoVao;
  /** Sempre `itens.length + 1` quando `divisao` estiver presente. */
  filhos?: Vao[];
  preenchimento?: PreenchimentoVao;
}

export interface Caixaria {
  versao: 1;
  estrutura: EstruturaCaixa;
  rodape: RodapeCaixa;
  fundo: FundoCaixa;
  tampo?: TampoCaixa;
  tamponamentos?: TamponamentoCaixa;
  raiz: Vao;
  /** Ids de peças geradas (`cx_*`) cujas fórmulas foram editadas manualmente e não devem ser sobrescritas ao sincronizar. */
  pecasDesvinculadas?: string[];
}

/** Caixa resolvida em METROS de cada vão da árvore para picking/destaque 3D no editor. */
export interface VaoResolvido {
  id: string;
  /** Canto mínimo local em metros [x0, y0, z0]. */
  min: [number, number, number];
  /** Canto máximo local em metros [x1, y1, z1]. */
  max: [number, number, number];
  folha: boolean;
  temDivisao: boolean;
  temPreenchimento: boolean;
  eixoDivisao?: 'x' | 'z';
}

export type FaceExternaCaixa = 'esquerda' | 'direita' | 'topo' | 'base' | 'frente' | 'fundo';
