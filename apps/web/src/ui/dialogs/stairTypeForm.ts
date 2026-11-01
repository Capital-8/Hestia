import { newId, type StairCalcRule, type StairRunStyle, type StairType } from '@hestia/model';

/** Limites de um campo numérico do diálogo: metros internos, exibição em `scale` e casas decimais. */
export interface StairFieldLimit {
  min: number;
  max: number;
  decimals: number;
  unit: 'cm' | 'm' | 'R$' | '';
  scale: number;
}

/** Limites por campo da especificação §3.2 (valores internos em metros). */
export const STAIR_FIELD_LIMITS = {
  maxRiser: { min: 0.1, max: 0.25, decimals: 1, unit: 'cm', scale: 100 },
  minRiser: { min: 0.05, max: 0.25, decimals: 1, unit: 'cm', scale: 100 },
  minTread: { min: 0.15, max: 0.45, decimals: 1, unit: 'cm', scale: 100 },
  minRunWidth: { min: 0.4, max: 3, decimals: 1, unit: 'cm', scale: 100 },
  minHeadroom: { min: 1.8, max: 3, decimals: 2, unit: 'm', scale: 1 },
  nosing: { min: 0, max: 0.44, decimals: 1, unit: 'cm', scale: 100 },
  calcRiserFactor: { min: 0.5, max: 4, decimals: 2, unit: '', scale: 1 },
  calcTreadFactor: { min: 0.5, max: 4, decimals: 2, unit: '', scale: 1 },
  calcTarget: { min: 0.4, max: 1, decimals: 1, unit: 'cm', scale: 100 },
  calcMin: { min: 0.4, max: 1, decimals: 1, unit: 'cm', scale: 100 },
  calcMax: { min: 0.4, max: 1, decimals: 1, unit: 'cm', scale: 100 },
  maxTread: { min: 0.15, max: 0.6, decimals: 1, unit: 'cm', scale: 100 },
  structuralDepth: { min: 0.05, max: 0.6, decimals: 1, unit: 'cm', scale: 100 },
  treadThickness: { min: 0.005, max: 0.15, decimals: 1, unit: 'cm', scale: 100 },
  riserThickness: { min: 0.005, max: 0.1, decimals: 1, unit: 'cm', scale: 100 },
  treadOverlap: { min: 0, max: 0.149, decimals: 1, unit: 'cm', scale: 100 },
  landingThickness: { min: 0.05, max: 0.5, decimals: 1, unit: 'cm', scale: 100 },
  cost: { min: 0, max: Number.POSITIVE_INFINITY, decimals: 2, unit: 'R$', scale: 1 },
} as const;

export type StairFieldName = keyof typeof STAIR_FIELD_LIMITS;

/** Problema de validação: a UI traduz pelo `code` e pelos `params` (nada de português fixo). */
export interface StairTypeIssue {
  field: string;
  severity: 'error' | 'warning';
  code: string;
  params: Record<string, number | string>;
}

/** Entrada da validação: aceita chamadas antigas (campos de cálculo e de estilo opcionais). */
export type StairValidationInput = Pick<
  StairType,
  'name' | 'maxRiser' | 'minTread' | 'minRunWidth' | 'runStyle' | 'structuralDepth' | 'treadThickness' | 'riserThickness' | 'landingThickness' | 'minHeadroom' | 'nosing'
> &
  Partial<Pick<StairType, 'minRiser' | 'treadOverlap' | 'materialId' | 'postMaterialId' | 'cost' | 'maxTread' | keyof StairCalcRule>>;

const err = (field: string, code: string, params: Record<string, number | string> = {}): StairTypeIssue => ({ field, severity: 'error', code, params });
const warn = (field: string, code: string, params: Record<string, number | string> = {}): StairTypeIssue => ({ field, severity: 'warning', code, params });

const positive = (v: number): boolean => Number.isFinite(v) && v > 0;

/**
 * Valida o tipo de escada reportando TODOS os problemas de uma vez (erros e avisos). As regras cruzadas são as da
 * especificação §3.5; os materiais só são conferidos quando `materialIds` é fornecido.
 */
export function validateStairType(t: StairValidationInput, materialIds?: Iterable<string>): StairTypeIssue[] {
  const out: StairTypeIssue[] = [];
  if (!t.name.trim()) out.push(err('name', 'stt-name-empty'));
  if (!positive(t.maxRiser)) out.push(err('maxRiser', 'stt-riser'));
  // Espelho mínimo (NBR 9050: 0,16–0,18 m): 0 < mínimo < máximo. Chamadas antigas sem o campo não o validam.
  if (t.minRiser !== undefined) {
    if (!positive(t.minRiser)) out.push(err('minRiser', 'stt-riser-min'));
    else if (positive(t.maxRiser) && !(t.minRiser < t.maxRiser)) out.push(err('minRiser', 'stt-riser-min-range'));
  }
  if (!positive(t.minTread)) out.push(err('minTread', 'stt-tread'));
  if (!positive(t.minRunWidth)) out.push(err('minRunWidth', 'stt-width'));
  if (!positive(t.minHeadroom)) out.push(err('minHeadroom', 'stt-headroom'));
  if (!positive(t.landingThickness)) out.push(err('landingThickness', 'stt-landing'));
  if (!(t.nosing >= 0)) out.push(err('nosing', 'stt-nosing-negative'));
  if (t.cost !== undefined && !(t.cost >= 0)) out.push(err('cost', 'stt-cost'));
  if (t.treadOverlap !== undefined && !(t.treadOverlap >= 0)) out.push(err('treadOverlap', 'stt-overlap-negative'));

  if (t.runStyle === 'monolithic' && !positive(t.structuralDepth)) out.push(err('structuralDepth', 'stt-mono-depth'));
  if (t.runStyle === 'assembled' && !(positive(t.treadThickness) && positive(t.riserThickness))) out.push(err('treadThickness', 'stt-assembled'));
  if (t.runStyle === 'post' && !positive(t.treadThickness)) out.push(err('treadThickness', 'stt-post-tread'));

  if (t.maxTread !== undefined && t.maxTread < t.minTread) out.push(err('maxTread', 'stt-tread-range'));
  if (t.calcMin !== undefined && t.calcTarget !== undefined && t.calcMax !== undefined && !(t.calcMin <= t.calcTarget && t.calcTarget <= t.calcMax)) {
    out.push(err('calcTarget', 'stt-calc-range'));
  }
  if (t.calcRiserFactor !== undefined && !positive(t.calcRiserFactor)) out.push(err('calcRiserFactor', 'stt-factor', { factor: 'a' }));
  if (t.calcTreadFactor !== undefined && !positive(t.calcTreadFactor)) out.push(err('calcTreadFactor', 'stt-factor', { factor: 'b' }));
  if (t.nosing >= 0 && t.nosing >= t.minTread) out.push(err('nosing', 'stt-nosing'));
  if (t.runStyle === 'post' && positive(t.treadThickness) && t.treadOverlap !== undefined && !(t.treadOverlap < t.treadThickness)) {
    out.push(err('treadOverlap', 'stt-overlap'));
  }

  if (materialIds) {
    const ids = new Set(materialIds);
    if (t.materialId !== undefined && !ids.has(t.materialId)) out.push(err('materialId', 'stt-material', { slot: 'material' }));
    if (t.runStyle === 'post' && t.postMaterialId !== undefined && !ids.has(t.postMaterialId)) out.push(err('postMaterialId', 'stt-material', { slot: 'post' }));
  }

  if (
    t.calcRiserFactor !== undefined && t.calcTreadFactor !== undefined && t.calcMin !== undefined && t.calcMax !== undefined &&
    positive(t.calcRiserFactor) && positive(t.calcTreadFactor)
  ) {
    const sum = t.calcRiserFactor * t.maxRiser + t.calcTreadFactor * t.minTread;
    if (sum < t.calcMin - 1e-9 || sum > t.calcMax + 1e-9) out.push(warn('calcTarget', 'stt-warn-sum', { sum }));
  }
  if (t.maxRiser > 0.19) out.push(warn('maxRiser', 'stt-warn-riser'));
  if (t.minTread > 0 && t.minTread < 0.25) out.push(warn('minTread', 'stt-warn-tread'));
  return out;
}

const STYLE_FIELDS: Record<StairRunStyle, ReadonlyArray<keyof StairType>> = {
  monolithic: ['structuralDepth', 'undersideStyle'],
  assembled: ['treadThickness', 'riserThickness'],
  post: ['treadThickness', 'treadOverlap', 'postMaterialId'],
};

const STYLE_DEFAULTS: Record<StairRunStyle, Partial<StairType>> = {
  monolithic: { structuralDepth: 0.2 },
  assembled: { treadThickness: 0.03, riserThickness: 0.02 },
  post: { treadThickness: 0.05, treadOverlap: 0.025 },
};

/** Guarda os valores dos campos que deixam de valer e restaura os da nova forma ao trocar o estilo (sem perder o digitado). */
export function preserveOnStyleChange(
  draft: StairType,
  newStyle: StairRunStyle,
  store: { current: Partial<StairType> },
): StairType {
  if (draft.runStyle === newStyle) return draft;
  const saved = store.current as Record<string, unknown>;
  for (const field of STYLE_FIELDS[draft.runStyle]) saved[field] = draft[field];
  const patch: Record<string, unknown> = { runStyle: newStyle };
  for (const field of STYLE_FIELDS[newStyle]) {
    const v = saved[field];
    if (v !== undefined) patch[field] = v;
  }
  return { ...draft, ...STYLE_DEFAULTS[newStyle], ...patch };
}

/** Zera os campos de estilo que não se aplicam ao estilo escolhido (exigência do modelo no upsert). */
export function finalizeForSave(draft: StairType): StairType {
  const next: StairType = { ...draft };
  if (next.runStyle === 'monolithic') {
    next.treadThickness = 0;
    next.riserThickness = 0;
  } else if (next.runStyle === 'assembled') {
    next.structuralDepth = 0;
  } else {
    next.structuralDepth = 0;
    next.riserThickness = 0;
  }
  return next;
}

/** O rascunho difere do tipo salvo? (alterações ainda não aplicadas.) */
export function hasUnsavedChanges(draft: StairType | null, saved: StairType | null): boolean {
  return Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
}

/** Cópia do rascunho atual (com as alterações não salvas), com id novo e nome "(cópia)". */
export function duplicateDraft(draft: StairType, id: string = newId('stt')): StairType {
  return { ...structuredClone(draft), id, name: `${draft.name} (cópia)` };
}
