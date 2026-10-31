import type { Vec2 } from '@hestia/geom';
import type { Command, DimensionElementRef, Element, Id, OpeningDimRef, Project, Quantity, ResolvedDimensionSettings, WallDimRef } from '@hestia/model';

/** Tipo de elemento ao qual um provedor de cotas se liga (o campo `kind` do elemento). */
export type ElementKind = Element['kind'];

/**
 * Sujeitos de cota que não são elementos de `project.elements` (e por isso não têm `kind`): linhas de detalhe,
 * linhas de perímetro do rascunho e grades/eixos. O provedor registrado resolve o sujeito pelo id da seleção.
 */
export type NonElementKind = 'detailLine' | 'perimeterLine' | 'grid';

/** Chave de registro de um provedor: o tipo do elemento ou um sujeito fora de `project.elements`. */
export type DimSubjectKind = ElementKind | NonElementKind;

/** Ordem em que a seleção tenta os sujeitos fora de `project.elements` (os ids são únicos por tipo). */
export const NON_ELEMENT_KINDS: readonly NonElementKind[] = ['detailLine', 'perimeterLine', 'grid'];

/** Uma referência de cota de qualquer vocabulário (parede ou esquadria). */
export type DimRef = WallDimRef | OpeningDimRef;

/** Uma ponta da cota: o ponto medido, qual vocabulário vale e a referência em uso. */
export interface DimEnd {
  /** Ponto medido (mundo). */
  at: Vec2;
  /** Identifica a ponta dentro do provedor ('wallLeft', 'openLeft'...); compõe a chave de `overrides`. */
  slot: string;
  kind: 'wall' | 'opening';
  current: DimRef;
  /** As referências que esta ponta aceita, na ordem em que a alça as percorre. */
  options: ReadonlyArray<DimRef>;
}

/** Resultado puro de uma edição: comandos para executar (num único passo) ou a mensagem que explica a recusa. */
export type DimEditResult = { commands: Command[]; note?: string } | { error: string };

/** Medida informativa exibida junto do valor principal (ex.: o ângulo do deslocamento). Sempre só de leitura. */
export interface DimSecondaryMeasure {
  quantity: 'length' | 'angle';
  /** Valor em SI (metros ou radianos), como `TempDim.value`. */
  value: number;
}

export interface TempDim {
  /** Estável entre quadros: `${provider}:${subjectId}:${slot}`. */
  key: string;
  a: Vec2;
  b: Vec2;
  /** Afastamento da linha de cota (m): positivo = lado esquerdo de a→b, negativo = direito. */
  offset: number;
  /** Medida principal em SI: metros para `length`, radianos para `angle`. */
  value: number;
  /** Grandeza de `value` (padrão `'length'`); o overlay formata pela unidade do projeto. */
  quantity?: Quantity;
  /** Medida informativa exibida ao lado da principal (ex.: ângulo do deslocamento). */
  secondary?: DimSecondaryMeasure;
  /**
   * Feições de elemento a que `a`/`b` se prendem, quando o provedor as conhece (viram `Dimension.refs`: a cota permanente
   * acompanha o elemento). Ausente numa ponta = ponto livre.
   */
  refs?: { a?: DimensionElementRef; b?: DimensionElementRef };
  /** Pontas na ordem de `a` e `b`. */
  ends: [DimEnd, DimEnd];
  tone?: 'valid' | 'invalid';
  /** Ausente = só leitura. Pura: devolve comandos, nunca os executa. */
  edit?: (valueSI: number) => DimEditResult;
}

export interface DimContext {
  project: Project;
  levelId: Id;
  settings: ResolvedDimensionSettings;
  /** `${providerId}:${slot}` (ou chave global do provedor) → referência escolhida na sessão. */
  overrides: Readonly<Record<string, DimRef>>;
}

/**
 * Provedor de cotas de um tipo de sujeito. Para entrar no sistema basta o tipo do sujeito, `compute` (com `edit`
 * opcional em cada cota) e uma linha de registro; `selectionSubject` só é preciso para cotar o elemento selecionado.
 */
export interface DimProvider<S> {
  id: string;
  compute(ctx: DimContext, subject: S): TempDim[];
  /**
   * Sujeito do que está selecionado; null se este provedor não cota esse id. Vale para elementos (com o id do
   * elemento) e para os `NonElementKind` (com o id da linha ou da grade); `levelId` é o nível ativo.
   */
  selectionSubject?(project: Project, selectionId: Id, levelId?: Id): S | null;
}
