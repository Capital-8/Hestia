import { useSyncExternalStore } from 'react';

/**
 * Abertura da tabela "Índices do lote" (ficha P4). Mini-store próprio, como o do `LocalizacaoDialog` e o do `TerrenoScheduleDialog`: o diálogo
 * não entra no `DialogKind` (estado.ts). O botão Índices do lote da faixa chama `abrirLoteSchedule()`; o `App` monta `<LoteScheduleDialog />`.
 */
let aberto = false;
const ouvintes = new Set<() => void>();
const definir = (v: boolean): void => {
  if (aberto === v) return;
  aberto = v;
  for (const o of ouvintes) o();
};

/** A tabela está aberta? (leitura direta, para testes e para quem não usa React). */
export const loteScheduleAberta = (): boolean => aberto;

/** Hook de abertura (também responde na renderização no servidor, usada pelos testes). */
export function useLoteScheduleAberta(): boolean {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    loteScheduleAberta,
    loteScheduleAberta,
  );
}

export const abrirLoteSchedule = (): void => definir(true);
export const fecharLoteSchedule = (): void => definir(false);
