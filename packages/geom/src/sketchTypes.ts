import type { Vec2 } from './vec.ts';

/** Alvo do esboço de perímetro: qual elemento nasce quando o usuário conclui. */
export type SketchTarget = 'roof' | 'floor' | 'slab' | 'ceiling' | 'mass';

/**
 * Linha de esboço: segmento reto ou arco (flecha `sag` como em `arcFromSagitta`, 0/ausente = reta).
 * As linhas ficam soltas no rascunho, como no Revit; os laços são deduzidos pela conexão das pontas.
 */
export interface SketchSeg {
  id: string;
  a: Vec2;
  b: Vec2;
  sag?: number;
  /** Só telhado: a aresta define inclinação. Ausente = usa o padrão do rascunho. */
  definesSlope?: boolean;
  /** Só telhado: inclinação própria da aresta em %. Ausente = padrão do rascunho. */
  slopePct?: number;
  /** Só telhado: balanço próprio da aresta em metros. Ausente = padrão do rascunho. */
  overhang?: number;
}

/** Laço fechado deduzido do rascunho. Os laços ordenam do maior para o menor; o primeiro é o externo. */
export interface SketchLoop {
  role: 'outer' | 'hole';
  segs: SketchSeg[];
  /** Polilinha do laço (arcos amostrados), sem repetir o primeiro ponto. */
  ring: Vec2[];
}

export type SketchIssueCode =
  | 'open' /** laço aberto: ponta sem par */
  | 'too-few' /** menos de 3 lados */
  | 'zero-length'
  | 'self-cross' /** linha cruza outra do mesmo laço */
  | 'overlap' /** linhas colineares sobrepostas */
  | 'loops-cross' /** laços se cruzam */
  | 'loops-touch' /** laços se tocam, mesmo num ponto */
  | 'hole-outside' /** furo não fica inteiro dentro do externo */
  | 'hole-in-hole' /** laço dentro de furo (não permitido) */
  | 'multi-outer' /** dois laços externos disjuntos */
  | 'empty';

export interface SketchIssue {
  code: SketchIssueCode;
  message: string;
  /** Linhas envolvidas, para realçar em vermelho. */
  segIds: string[];
  /** Posição do problema, para o balão/zoom. */
  at?: Vec2;
}

export interface SketchResult {
  loops: SketchLoop[];
  issues: SketchIssue[];
  /** Verdadeiro quando há ao menos um laço externo e nenhum problema: Concluir fica habilitado. */
  ok: boolean;
}

/** Rascunho do modo "Criar/Editar perímetro". Sempre dado puro (imutável nas funções da sessão). */
export interface SketchDraft {
  target: SketchTarget;
  segs: SketchSeg[];
  selected: string[];
  /** Id do elemento sendo editado ("Editar perímetro"); ausente = criando. */
  editing?: string;
  /** Padrões do telhado, usados quando a linha não traz valor próprio. */
  defaults: { definesSlope: boolean; slopePct: number; overhang: number };
}
