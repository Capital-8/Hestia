import { useCallback, useSyncExternalStore } from 'react';
import { formatQuantity, unitsOf, type FormatOptions, type Quantity, type ResolvedUnits } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { useI18n } from '../editor/i18n.ts';

const subscribe = (cb: () => void): (() => void) => editor.store.subscribe(cb);
const snapshot = (): ResolvedUnits => unitsOf(editor.project);

/**
 * Unidades do projeto atual. A referência de `unitsOf` só muda quando `settings.units` muda, então a
 * edição de outros campos do projeto não re-renderiza quem só formata medidas.
 */
export function useUnits(): ResolvedUnits {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Unidades do projeto atual para handlers fora do React. */
export function currentUnits(): ResolvedUnits {
  return unitsOf(editor.project);
}

/** Função estável de formatação na unidade configurada (muda quando as unidades mudam). */
export function useFormat(): (q: Quantity, si: number, o?: FormatOptions) => string {
  const units = useUnits();
  const lang = useI18n((s) => s.lang);
  return useCallback((q: Quantity, si: number, o?: FormatOptions) => formatQuantity(units, q, si, { ...o, lang }), [units, lang]);
}
