import type { StairRunStyle } from '@hestia/model';
import type { StairFieldName } from './stairTypeForm.ts';

/** Campos do tipo de escada que dependem do estilo (os de identificação e o próprio estilo ficam de fora). */
export type StairFormField = StairFieldName | 'materialId' | 'postMaterialId' | 'undersideStyle' | 'preset';

/** Ordem de exibição usada por `visibleStairFields` (a mesma das seções do modal). */
const ORDER: readonly StairFormField[] = [
  'maxRiser',
  'minRiser',
  'minTread',
  'minRunWidth',
  'minHeadroom',
  'nosing',
  'preset',
  'calcRiserFactor',
  'calcTreadFactor',
  'calcTarget',
  'calcMin',
  'calcMax',
  'maxTread',
  'materialId',
  'postMaterialId',
  'structuralDepth',
  'undersideStyle',
  'treadThickness',
  'riserThickness',
  'treadOverlap',
  'landingThickness',
  'cost',
];

/** Campos ocultos por estilo (§8 da especificação): o valor continua guardado, só não é editado. */
const HIDDEN: Record<StairRunStyle, ReadonlySet<StairFormField>> = {
  monolithic: new Set<StairFormField>(['postMaterialId', 'treadThickness', 'riserThickness', 'treadOverlap', 'landingThickness']),
  assembled: new Set<StairFormField>(['postMaterialId', 'structuralDepth', 'undersideStyle', 'treadOverlap']),
  post: new Set<StairFormField>(['nosing', 'structuralDepth', 'undersideStyle', 'riserThickness', 'landingThickness']),
};

/** O campo aparece e é editável no estilo dado? */
export function isStairFieldVisible(style: StairRunStyle, field: StairFormField): boolean {
  return !HIDDEN[style].has(field);
}

/** Campos visíveis no estilo, na ordem do modal. */
export function visibleStairFields(style: StairRunStyle): StairFormField[] {
  return ORDER.filter((field) => isStairFieldVisible(style, field));
}

/** Rótulos que mudam por estilo (o padrão vem de `FIELD_LABEL`). */
export type FieldLabelOverride =
  | 'stt_f_material_lance'
  | 'stt_f_material_pisos'
  | 'stt_f_material_degraus'
  | 'stt_f_minTread_walk'
  | 'stt_f_treadThickness_post';

/** Rótulo específico do estilo para o campo, ou `null` para usar o rótulo padrão. */
export function fieldLabelOverride(style: StairRunStyle, field: StairFormField): FieldLabelOverride | null {
  if (field === 'materialId') {
    return style === 'monolithic'
      ? 'stt_f_material_lance'
      : style === 'assembled'
        ? 'stt_f_material_pisos'
        : 'stt_f_material_degraus';
  }
  if (field === 'minTread' && style === 'post') return 'stt_f_minTread_walk';
  if (field === 'treadThickness' && style === 'post') return 'stt_f_treadThickness_post';
  return null;
}
