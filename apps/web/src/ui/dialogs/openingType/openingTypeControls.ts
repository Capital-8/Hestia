import { HARDWARE_DEFAULTS, OPENING_SPAN_GAP_DEFAULTS, formatQuantity, openingSpanGap, type OpeningGlassKind, type OpeningType, type ResolvedUnits } from '@hestia/model';
import type { Dict } from '../../../editor/i18n.ts';
import { withOpeningField } from './openingTypeFields.ts';

/** Metros com 0,1 mm (a digitação em cm não deixa resto de ponto flutuante fora do padrão). */
export const arredondaMetros = (m: number): number => Math.round(m * 1e4) / 1e4;

/** Metros no texto de medida pequena do projeto (cm por padrão: 88 ou 87,5). */
export const cmTexto = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'smallLength', m, { decimals: 1 });

/** Ferragem e folga com padrão do modelo (`HARDWARE_DEFAULTS`): o padrão tira o campo, que volta à leitura. */
const ferragem = (t: OpeningType, campo: 'leafUndercut' | 'handleHeight' | 'handleInset' | 'hinges', valor: number): OpeningType =>
  withOpeningField(t, campo, valor, HARDWARE_DEFAULTS[campo]);

export const setLeafUndercut = (t: OpeningType, metros: number): OpeningType => ferragem(t, 'leafUndercut', arredondaMetros(metros));
export const setHandleHeight = (t: OpeningType, metros: number): OpeningType => ferragem(t, 'handleHeight', arredondaMetros(metros));
export const setHandleInset = (t: OpeningType, metros: number): OpeningType => ferragem(t, 'handleInset', arredondaMetros(metros));
export const setHinges = (t: OpeningType, quantidade: number): OpeningType => ferragem(t, 'hinges', Math.round(quantidade));

/** Folga do vão (m) de um eixo ('w' ou 'h'); o outro eixo mantém o valor efetivo. Igual ao padrão NBR 15930-2 tira o campo. */
export function setSpanGap(t: OpeningType, eixo: 'w' | 'h', metros: number): OpeningType {
  return withOpeningField(t, 'spanGap', { ...openingSpanGap(t), [eixo]: arredondaMetros(metros) }, OPENING_SPAN_GAP_DEFAULTS);
}

/** Recuo do batente (m): zero tira o campo, que volta ao padrão por leitura (0). Preserva a âncora. */
export function setRevealDepth(t: OpeningType, depth: number): OpeningType {
  const next: OpeningType = { ...t };
  if (depth <= 0) delete next.reveal;
  else next.reveal = { ...t.reveal, depth };
  return next;
}

/** Soleira: sem peça, plana (2 cm) ou degrau (3 cm). O schema não guarda o tipo; a espessura é o que o distingue. */
export type OpeningThresholdKind = 'none' | 'flat' | 'step';
export const THRESHOLD_KINDS: ReadonlyArray<readonly [OpeningThresholdKind, keyof Dict]> = [
  ['none', 'dlo_o_threshold_none'],
  ['flat', 'dlo_o_threshold_flat'],
  ['step', 'dlo_o_threshold_step'],
];
export const THRESHOLD_THICKNESS = { flat: 0.02, step: 0.03 } as const;

/** Tipo da soleira lido da espessura: degrau a partir de 3 cm; abaixo disso, plana. */
export function thresholdKind(t: Pick<OpeningType, 'threshold'>): OpeningThresholdKind {
  if (!t.threshold) return 'none';
  return t.threshold.thickness >= THRESHOLD_THICKNESS.step ? 'step' : 'flat';
}

const soleira = (t: Pick<OpeningType, 'threshold'>, thickness: number): OpeningType['threshold'] =>
  t.threshold?.materialId === undefined ? { thickness } : { thickness, materialId: t.threshold.materialId };

/** Troca o tipo da soleira; "Nenhuma" tira o campo e o material é preservado ao religar. */
export function setThresholdKind(t: OpeningType, kind: OpeningThresholdKind): OpeningType {
  const next: OpeningType = { ...t };
  if (kind === 'none') delete next.threshold;
  else next.threshold = soleira(t, THRESHOLD_THICKNESS[kind]);
  return next;
}

/** Altura (espessura) da soleira; o material existente é preservado. */
export function setThresholdThickness(t: OpeningType, thickness: number): OpeningType {
  return { ...t, threshold: soleira(t, thickness) };
}

/** Eixo da basculante como fração da altura: 0,5 (central) tira o campo; o excêntrico grava o valor. */
export function setTiltAxis(t: OpeningType, axis: number): OpeningType {
  return withOpeningField(t, 'tiltAxis', axis, 0.5);
}

/** Tipos de vidro do schema (`OpeningGlassKind`), com o rótulo da interface. */
export const GLASS_KINDS: ReadonlyArray<readonly [OpeningGlassKind, keyof Dict]> = [
  ['clear', 'dlo_o_glass_clear'],
  ['ribbed', 'dlo_o_glass_ribbed'],
  ['smoke', 'dlo_o_glass_smoke'],
  ['green', 'dlo_o_glass_green'],
  ['bronze', 'dlo_o_glass_bronze'],
  ['frosted', 'dlo_o_glass_frosted'],
  ['wired', 'dlo_o_glass_wired'],
  ['laminated', 'dlo_o_glass_laminated'],
  ['tempered', 'dlo_o_glass_tempered'],
];

/** Tipo de vidro: 'clear' (liso) é o padrão por leitura e tira o campo. */
export function setGlassKind(t: OpeningType, kind: OpeningGlassKind): OpeningType {
  return withOpeningField(t, 'glassKind', kind, 'clear');
}

/** Material da folha: ausente vale o do batente, então escolher o mesmo material tira o campo. */
export function setLeafMaterialId(t: OpeningType, id: string): OpeningType {
  return withOpeningField(t, 'leafMaterialId', id, t.frameMaterialId);
}
