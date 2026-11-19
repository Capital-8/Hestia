import { shapeCompat, type OpeningShapeKind, type OpeningType, type ShapeCompat, type ShapeVerdict } from '@hestia/model';
import type { Dict } from '../../../editor/i18n.ts';

/*
 * Veredito "tipo x forma" no seletor de forma do diálogo (docs/estudo-esquadrias/40): a operação do tipo (giro, correr,
 * guilhotina, basculante...) funciona na forma (`ok`), é adaptada a ela (`adaptado`) ou não funciona (`incompatível`: o motor
 * trata a esquadria como fixa, aro + vidro, e o furo na parede segue a forma). A matriz é `shapeCompat` de
 * `packages/model/src/openingShapeCompat.ts` (docs/estudo-esquadrias/39); aqui só a leitura para a interface.
 */

export type { ShapeVerdict };

/** Veredito (com a regra e o motivo, em português, da matriz) do rascunho do tipo para uma forma. Retangular é sempre `ok`. */
export function shapeVerdictOf(d: OpeningType, kind: OpeningShapeKind): ShapeCompat {
  return shapeCompat(d, kind);
}

/** Marca curta ao lado do nome da forma no seletor (ícone + palavra), ou null quando é compatível. */
export function verdictMark(v: ShapeVerdict): { icon: string; key: keyof Dict } | null {
  if (v === 'adaptado') return { icon: '⚠', key: 'dsh_mark_adapted' };
  if (v === 'incompatível') return { icon: '✕', key: 'dsh_mark_bad' };
  return null;
}

/** Chave da mensagem que explica o veredito (a operação do tipo na forma), ou null quando é compatível. */
export function verdictMessageKey(v: ShapeVerdict): keyof Dict | null {
  if (v === 'adaptado') return 'dsh_compat_adapted';
  if (v === 'incompatível') return 'dsh_compat_bad';
  return null;
}
