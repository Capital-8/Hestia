/*
 * CONTRATO da família de componentes (ADR 0049 §3). SÓ tipos e constantes: nada aqui tem lógica.
 *
 * Unidade: o TEXTO da família (fórmulas, valores, padrões) é sempre em MILÍMETROS (`unidade: 'mm'`), porque é assim que o
 * marceneiro escreve (`L - 2 * esp`, 80, 18). A RESOLUÇÃO (fase E2) devolve metros, arredondados a 1 µm, e é isso que o
 * núcleo numérico (TS hoje, Rust depois) recebe: nunca texto, nunca fórmula. Ângulos em graus no texto, radianos na saída.
 * Eixos locais da família: X = largura (esquerda → direita visto de frente), Y = profundidade (frente → fundo), Z = altura.
 */

export const FAMILIA_FORMATO = 'hestia-familia';
export const FAMILIA_VERSAO = 1;

/** Limites duros (defesa e determinismo). Estourar é erro de validação, nunca laço infinito. */
export const LIMITES = {
  parametros: 256,
  pecas: 512,
  planos: 64,
  aninhados: 64,
  ferragens: 128,
  tipos: 256,
  formula: 512,
  parenteses: 32,
  repeticao: 64,
  nome: 80,
} as const;

export type Valor = number | string | boolean;
export type Expr = string;

export type CategoriaFamilia = 'marcenaria' | 'mobiliario' | 'loucas' | 'equipamento' | 'generico';
export type Hospedagem = 'nivel' | 'parede';
export type OrigemFamilia = 'canto' | 'centro';

// ───────────────────────── parâmetros ─────────────────────────

export type TipoParametro = 'comprimento' | 'numero' | 'inteiro' | 'booleano' | 'texto' | 'enum' | 'chapa' | 'material';
/** `tipo`: vale para todas as instâncias do tipo; `instancia`: cada móvel colocado pode mudar. */
export type Escopo = 'tipo' | 'instancia';

export interface OpcaoParametro {
  valor: string | number;
  rotulo?: string;
  /** Só em `chapa`: espessura nominal em mm (vira `nome.esp` nas fórmulas). Na fase E5 passa a vir do cadastro de chapas. */
  esp?: number;
}

export interface Parametro {
  /** Identificador da fórmula: letra ou `_` seguida de letras, dígitos ou `_`; único na família; diferencia maiúscula. */
  id: string;
  nome: string;
  tipo: TipoParametro;
  escopo: Escopo;
  padrao: Valor;
  min?: number;
  max?: number;
  passo?: number;
  /** `enum` e `chapa`. */
  opcoes?: OpcaoParametro[];
  /** Calculado: o valor vem da fórmula e o campo fica somente leitura. Ausente = valor livre. */
  formula?: Expr;
  grupo?: string;
}

/** Ids que toda família tem, nesta ordem: largura, altura e profundidade (comprimento, escopo `instancia`). */
export const PARAMETROS_PADRAO = ['L', 'A', 'P'] as const;

/** Posição nomeada em um eixo, dada por fórmula. Não há solver: é só um valor calculado que as peças usam pelo id. */
export interface PlanoReferencia {
  id: string;
  nome: string;
  eixo: Eixo;
  posicao: Expr;
}

// ───────────────────────── peças ─────────────────────────

export type Eixo = 'x' | 'y' | 'z';
export type PapelPeca =
  | 'lateral' | 'base' | 'topo' | 'travessa' | 'prateleira' | 'divisoria' | 'fundo' | 'porta' | 'frente_gaveta'
  | 'tampo' | 'rodape' | 'painel' | 'bloco' | 'generica';
export type NivelDetalhe = 'grosso' | 'medio' | 'fino';

/** Contorno no plano da chapa, em (u, v) com origem no canto mínimo. Ausente = retângulo `tamanho[0] × tamanho[1]`. */
export type Contorno = { tipo: 'retangulo' } | { tipo: 'poligono'; pontos: Array<[Expr, Expr]> };

/**
 * Onde a usinagem entra: `a` (face da origem) ou `b` (face oposta) são as faces da chapa; `n`, `s`, `l`, `o` são as BORDAS
 * (norte = lado de maior v, sul = menor v, leste = maior u, oeste = menor u). Em borda só cabe `furo`: `posicao[0]` é a posição
 * AO LONGO da borda e `posicao[1]` é a distância da face `a` ao longo da espessura (o furo entra perpendicular à borda).
 */
export type FaceUsinagem = 'a' | 'b' | 'n' | 's' | 'l' | 'o';
export interface Usinagem {
  id: string;
  tipo: 'furo' | 'rasgo' | 'recorte';
  face: FaceUsinagem;
  /** Centro (furo) ou canto mínimo (rasgo e recorte), em (u, v) do plano da chapa. */
  posicao: [Expr, Expr];
  diametro?: Expr;
  largura?: Expr;
  comprimento?: Expr;
  /** `'passante'` fura a espessura inteira. */
  profundidade: Expr | 'passante';
  quantidade?: Expr;
  quando?: Expr;
}

export interface Peca {
  id: string;
  nome: string;
  papel: PapelPeca;
  /** Direção da espessura. x → tamanho = [profundidade, altura]; y → [largura, altura]; z → [largura, profundidade]. */
  eixo: Eixo;
  /** Canto mínimo da peça no sistema local da família. */
  origem: [Expr, Expr, Expr];
  tamanho: [Expr, Expr];
  espessura: Expr;
  contorno?: Contorno;
  /** Vazio (Revit): subtrai dos sólidos da família em vez de somar. */
  vazio?: boolean;
  /** Id de parâmetro `material` ou `chapa`, ou id de material do projeto. */
  material?: string;
  /** Fita de borda por lado do plano da chapa (norte, sul, leste, oeste): id de fita ou 'nenhuma'. */
  fita?: { n?: string; s?: string; l?: string; o?: string };
  veio?: 'a' | 'b' | 'livre';
  usinagens?: Usinagem[];
  /** `i` (1..n) e `n` ficam disponíveis nas fórmulas da peça. */
  repetir?: Expr;
  /** A peça só existe quando a fórmula é verdadeira. */
  quando?: Expr;
  detalhe3d?: NivelDetalhe[];
  grupo?: string;
}

/** Outra família dentro desta (guarda-roupa de módulos, cozinha). Os `valores` são fórmulas desta família. */
export interface Aninhado {
  id: string;
  nome: string;
  familiaId: string;
  tipoId?: string;
  valores: Record<string, Expr>;
  origem: [Expr, Expr, Expr];
  /** Graus em torno de Z; múltiplos de 90 no v1. */
  rotacao?: Expr;
  repetir?: Expr;
  quando?: Expr;
}

export interface Ferragem {
  id: string;
  nome: string;
  codigo?: string;
  quantidade: Expr;
  custo?: number;
  quando?: Expr;
}

export interface Tipo {
  id: string;
  nome: string;
  codigo?: string;
  descricao?: string;
  /**
   * Qualquer parâmetro sem fórmula. Para escopo `tipo` é o valor do tipo; para `instancia` é o PADRÃO do tipo (cada móvel
   * colocado pode mudar). O que faltar vale o `padrao` do parâmetro.
   */
  valores: Record<string, Valor>;
}

// ───────────────────────── conectores e escolhas (modelagem fluida, F1/F4) ─────────────────────────

/** Face do móvel (sistema local: x = largura, y = profundidade com a FRENTE em y = 0 e o fundo em y = P, z = altura). */
export type LadoConector = 'esquerda' | 'direita' | 'frente' | 'fundo' | 'base' | 'topo';

/** Ponto de encaixe do módulo: onde ele se une a outro, a uma parede ou a uma bancada. Só dados; o encaixe é calculado no motor. */
export interface Conector {
  id: string;
  nome: string;
  lado: LadoConector;
  /** Papel do módulo nessa união: `base`, `aereo`, `torre`, `tampo`, `painel`... (texto livre, comparado com `aceita`). */
  etiqueta: string;
  /** Etiquetas de conectores do OUTRO lado com que este se une; vazio ou ausente = qualquer. */
  aceita?: string[];
  /** Folga (mm, fórmula) deixada entre as faces unidas. */
  folga?: Expr;
}

/**
 * Escolha interna do módulo (porta lisa, vidro, gaveta alta, nicho): o usuário clica na zona e escolhe a opção.
 * `parametro` é o id de um parâmetro `enum`, `booleano` ou `inteiro` da família; as opções vêm do próprio parâmetro.
 * `zona` é o `grupo` das peças onde se clica (`Peca.grupo`).
 */
export interface Escolha {
  id: string;
  nome: string;
  parametro: string;
  zona: string;
}

export interface Familia {
  formato: typeof FAMILIA_FORMATO;
  versao: number;
  id: string;
  nome: string;
  categoria: CategoriaFamilia;
  descricao?: string;
  unidade: 'mm';
  hospedagem: Hospedagem;
  origem: OrigemFamilia;
  parametros: Parametro[];
  planos: PlanoReferencia[];
  pecas: Peca[];
  aninhados: Aninhado[];
  ferragens: Ferragem[];
  /** Pontos de encaixe do módulo (F1); ausente = o módulo usa só a caixa. */
  conectores?: Conector[];
  /** Escolhas internas por clique (F4); ausente = nenhuma. */
  escolhas?: Escolha[];
  tipos: Tipo[];
  tipoPadrao?: string;
}
