import type { Command, Id } from '@hestia/model';
import type { MintId } from '../clipboard.ts';

/** Opções do colar alinhado a vários níveis. `link` guarda o vínculo de andar-tipo (padrão: falso). */
export interface PasteLevelsOptions {
  link?: boolean;
  mint?: MintId;
  /** Pula a contagem de avisos (sobreposição/ambiente aberto); usado no pré-cálculo da prévia, onde só a geometria importa. */
  semAvisos?: boolean;
}

/** Ids criados em um nível de destino, por categoria. */
export interface PasteIds {
  walls: Id[];
  openings: Id[];
  floors: Id[];
  slabs: Id[];
  ceilings: Id[];
  roofs: Id[];
  stairs: Id[];
  ramps: Id[];
  rooms: Id[];
  generics: Id[];
  cad: Id[];
  /** Guarda-corpos colados (fora do vínculo de andar-tipo, decisão 0055 §11). */
  railings: Id[];
}

/**
 * Aviso do colar, agregado por nível. `roof-unlinked` é a extensão do W1 para a parede que tinha o topo
 * anexado a um telhado fora do buffer: o vínculo é limpo e o telhado não vem junto.
 */
export type PasteWarningKind =
  | 'overlap'
  | 'opening-dropped'
  | 'too-tall'
  | 'top-overflow'
  | 'room-open'
  | 'ceiling-unlinked'
  | 'roof-unlinked';

export interface PasteWarning {
  levelId: Id;
  kind: PasteWarningKind;
  count: number;
}

/** Resultado do colar: um único batch e os ids por nível. */
export interface PasteLevelsResult {
  command: Command;
  byLevel: Record<Id, PasteIds>;
  warnings: PasteWarning[];
}
