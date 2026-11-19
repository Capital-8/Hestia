import { useSyncExternalStore } from 'react';

/**
 * Abertura da tabela "Terreno: corte e aterro" (ficha U2). Mini-store próprio, como o do `LocalizacaoDialog` e o do `ImportTerrenoDialog`: o diálogo
 * não entra no `DialogKind` (estado.ts). O botão Corte e aterro da faixa chama `abrirTerrenoSchedule()`; o `App` monta `<TerrenoScheduleDialog />`.
 */
let aberto = false;
const ouvintes = new Set<() => void>();
const definir = (v: boolean): void => {
  if (aberto === v) return;
  aberto = v;
  for (const o of ouvintes) o();
};

/** A tabela está aberta? (leitura direta, para testes e para quem não usa React). */
export const terrenoScheduleAberta = (): boolean => aberto;

/** Hook de abertura (também responde na renderização no servidor, usada pelos testes). */
export function useTerrenoScheduleAberta(): boolean {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    terrenoScheduleAberta,
    terrenoScheduleAberta,
  );
}

export const abrirTerrenoSchedule = (): void => definir(true);
export const fecharTerrenoSchedule = (): void => definir(false);
