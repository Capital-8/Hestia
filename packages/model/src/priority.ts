import { t, type Lang } from './i18n.ts';
import type { Layer, LayerFunction } from './types.ts';

/**
 * Prioridade de junção por função (menor número vence, decisão 0023 §1.1): estrutura 1, substrato 2, térmica 3,
 * membrana 3 (aprovada em P-1, `MEMBRANE_PRIORITY`), acabamento 1 = 4 e acabamento 2 = 5. Valores centralizados aqui
 * para ajuste sem mexer no motor (decisão 0002). O `priority` da camada, quando existe, sobrescreve a função.
 */
export const FUNCTION_PRIORITY: Record<LayerFunction, number> = {
  structure: 1,
  substrate: 2,
  thermal: 3,
  membrane: 3,
  finish1: 4,
  finish2: 5,
};

/** Rótulos das funções de camada no idioma pedido. */
export function functionLabels(lang: Lang = 'pt'): Record<LayerFunction, string> {
  return {
    structure: t(lang, 'md_layer_structure'),
    substrate: t(lang, 'md_layer_substrate'),
    thermal: t(lang, 'md_layer_thermal'),
    membrane: t(lang, 'md_layer_membrane'),
    finish1: t(lang, 'md_layer_finish1'),
    finish2: t(lang, 'md_layer_finish2'),
  };
}

/** Rótulos em PT (compatibilidade); use `functionLabels(lang)` para o idioma ativo. */
export const FUNCTION_LABEL: Record<LayerFunction, string> = functionLabels('pt');

/** Prioridade efetiva da camada: `priority` quando definido, senão a da função. Vale para parede, piso e laje. */
export const layerPriority = (l: Layer): number => l.priority ?? FUNCTION_PRIORITY[l.function];

/**
 * Dica (não bloqueia, decisão 0023 §7): há duas camadas de funções diferentes com a mesma prioridade efetiva. Elas não
 * se cortam e deixam linha de fronteira; o usuário pode querer números distintos.
 */
export const temPrioridadeEmpatada = (layers: readonly Layer[]): boolean =>
  layers.some((a, i) => layers.some((b, j) => j > i && a.function !== b.function && layerPriority(a) === layerPriority(b)));
