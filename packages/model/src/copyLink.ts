import type { Id } from './types.ts';

/**
 * Vínculo de andar-tipo: as cópias coladas em vários níveis lembram qual elemento de origem
 * representam. Não é grupo: cada elemento continua independente e editável. O vínculo só
 * habilita "Sincronizar cópias vinculadas" e "Desvincular".
 *
 * `sourceIds[i]` é representado por `members[].ids[i]` em cada nível.
 * Implementação das funções: agente W3 (ver docs/colar-niveis/CONTRATO.md).
 */
export interface CopyLink {
  id: Id;
  sourceIds: Id[];
  members: { levelId: Id; ids: Id[] }[];
  createdAt: number;
}
