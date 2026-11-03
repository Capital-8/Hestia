import type { Vec2 } from '@hestia/geom';
import { dimensionGeometry, isWallDimRef, openingDimRefLabels, wallDimRefLabels, type Command, type FormatOptions, type OpeningDimRef, type Quantity, type WallDimRef } from '@hestia/model';
import { dimElementRefLabel, type DimEnd, type DimRef, type TempDim } from '@hestia/tools';
import { t, type Lang } from '../../editor/i18n.ts';

/** Formata uma grandeza em SI na unidade do projeto (o mesmo `useFormat()` do overlay). */
export type DimFormatter = (q: Quantity, si: number, o?: FormatOptions) => string;

/** Tamanho de tela fixo da cota: milímetros de papel por pixel (independe do zoom). */
export const PX_PER_MM = 3.78;

export interface GripView {
  slot: string;
  /** Chave de `dimOverrides`: `${provedor}:${ponta}`. */
  overrideKey: string;
  at: Vec2;
  /** Cota dinâmica de parede/esquadria: a troca é a referência da sessão (`dimOverrides`). */
  current?: DimRef;
  next?: DimRef;
  /** Cota permanente: o clique grava a nova referência no modelo (os comandos devolvidos). */
  onAlternate?: () => Command[];
  /** Aceita escolher outro elemento (Shift+clique abre o modo de escolha na planta). */
  pickable?: boolean;
  title: string;
}

export interface DimView {
  key: string;
  /** Segmentos em pixels de tela: linha de cota, linhas de chamada e tracinhos. */
  line: [Vec2, Vec2];
  extensions: Array<[Vec2, Vec2]>;
  ticks: Array<[Vec2, Vec2]>;
  textAt: Vec2;
  textRotation: number;
  editable: boolean;
  invalid: boolean;
  grips: GripView[];
}

/** Próxima referência da ponta, em ciclo; referência fora das opções volta à primeira. */
export function nextRef(options: ReadonlyArray<DimRef>, current: DimRef): DimRef {
  const i = options.indexOf(current);
  return options[(i + 1) % options.length] ?? current;
}

/** Nome por extenso da referência, para a dica da alça. */
export function refLabel(ref: DimRef, lang: Lang = 'pt'): string {
  return isWallDimRef(ref) ? wallDimRefLabels(lang)[ref as WallDimRef] : openingDimRefLabels(lang)[ref as OpeningDimRef];
}

/**
 * Cota permanente selecionada: o desenho dela já sai do renderizador da planta (na cor de seleção). A cota dinâmica
 * fica só com alças e campo de valor; o desenho dela some para não duplicar o texto. Enquanto se digita, o texto aparece.
 */
export const ehPermanente = (dim: TempDim): boolean => providerOf(dim) === 'dimension';

export const ocultaDesenhoPermanente = (dim: TempDim, editingKey: string | null): boolean =>
  ehPermanente(dim) && editingKey !== dim.key;

/** O provedor é o primeiro trecho da chave da cota (`${provedor}:${sujeito}:${ponta}`). */
export const providerOf = (dim: TempDim): string => dim.key.split(':')[0] ?? '';

/**
 * A cota oferece ação ao clique (editar o valor)? Sem `edit` é de leitura — caso dos rascunhos das ferramentas
 * (parede, grade): não capturam o ponteiro e não deixam fantasma depois de terminar o traço.
 */
export const dimAcionavel = (dim: TempDim): boolean => dim.edit !== undefined;

/**
 * Texto mostrado no campo da cota: valor principal e, quando houver, a medida informativa (ex.: "5,00 · 53,1°").
 * Comprimentos vão sem unidade (o campo já pertence à grandeza); ângulos levam o símbolo, que os distingue do número.
 */
export function dimText(dim: TempDim, format: DimFormatter): string {
  const q = dim.quantity ?? 'length';
  const main = format(q, dim.value, q === 'angle' ? { trim: true } : { withUnit: false, trim: true });
  if (!dim.secondary) return main;
  return `${main} · ${format(dim.secondary.quantity, dim.secondary.value, { trim: true })}`;
}

export function gripOf(dim: TempDim, end: DimEnd, toScreen: (p: Vec2) => Vec2, lang: Lang = 'pt'): GripView {
  const alt = end.alt;
  if (alt) {
    const n = alt.options.length;
    const next = alt.options[(alt.current + 1) % n]!;
    return {
      slot: end.slot,
      overrideKey: `${providerOf(dim)}:${end.slot}`,
      at: toScreen(end.at),
      onAlternate: () => alt.apply(next),
      pickable: true,
      title: t(lang, 'cvv_dim_grip_alt', { label: dimElementRefLabel(alt.options[alt.current]!, lang) }),
    };
  }
  return {
    slot: end.slot,
    overrideKey: `${providerOf(dim)}:${end.slot}`,
    at: toScreen(end.at),
    current: end.current,
    next: nextRef(end.options, end.current),
    title: t(lang, 'cvv_dim_grip', { label: refLabel(end.current, lang) }),
  };
}

/** Geometria de tela de uma cota dinâmica; `invalidKey` destaca em vermelho a cota recusada. */
export function viewOfDim(dim: TempDim, toScreen: (p: Vec2) => Vec2, metersPerPixel: number, invalidKey: string | null, lang: Lang = 'pt'): DimView {
  const g = dimensionGeometry(dim.a, dim.b, dim.offset, metersPerPixel * PX_PER_MM);
  const seg = ([a, b]: [Vec2, Vec2]): [Vec2, Vec2] => [toScreen(a), toScreen(b)];
  return {
    key: dim.key,
    line: seg(g.line),
    extensions: g.extensions.map(seg),
    ticks: g.ticks.map(seg),
    textAt: toScreen(g.textAt),
    textRotation: g.textRotation,
    editable: dimAcionavel(dim),
    invalid: dim.tone === 'invalid' || invalidKey === dim.key,
    // Ponta com uma só referência não tem o que alternar: sem alça (ela só cobriria as alças de vértice do elemento).
    grips: dim.ends.filter((e) => e.options.length >= 2 || (e.alt?.options.length ?? 0) >= 2).map((e) => gripOf(dim, e, toScreen, lang)),
  };
}
