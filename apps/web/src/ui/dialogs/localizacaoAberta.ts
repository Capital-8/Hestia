import { useSyncExternalStore } from 'react';

/**
 * Abertura do diálogo "Localização" (ficha U1). Mini-store próprio, como o do `ImportTerrenoDialog`: o diálogo não entra no `DialogKind`
 * (estado.ts). A faixa chama `abrirLocalizacao()`; o `App` monta `<LocalizacaoDialog />`.
 */
let aberto = false;
const ouvintes = new Set<() => void>();
const definir = (v: boolean): void => {
  if (aberto === v) return;
  aberto = v;
  for (const o of ouvintes) o();
};

/** O diálogo está aberto? (leitura direta, para testes e para quem não usa React). */
export const localizacaoAberta = (): boolean => aberto;

/** Hook de abertura (também responde na renderização no servidor, usada pelos testes). */
export function useLocalizacaoAberta(): boolean {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    localizacaoAberta,
    localizacaoAberta,
  );
}

export const abrirLocalizacao = (): void => definir(true);
export const fecharLocalizacao = (): void => definir(false);
