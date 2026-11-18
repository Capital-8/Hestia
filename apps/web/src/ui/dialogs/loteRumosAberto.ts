import { useSyncExternalStore } from 'react';

/**
 * Abertura do diálogo "Por tabela…" das linhas de propriedade (ficha P3). Mini-store próprio, como o do `LocalizacaoDialog`: o diálogo não
 * entra no `DialogKind` (state.ts). A faixa chama `abrirLoteRumos()`; o `App` monta `<LoteRumosDialog />`.
 *
 * Três estados: `fechado`; `aberto`; `escolhendo` (o diálogo some enquanto o usuário clica o ponto inicial na planta, mas continua montado,
 * então a tabela digitada não se perde).
 */
export type EstadoLoteRumos = 'fechado' | 'aberto' | 'escolhendo';

let estado: EstadoLoteRumos = 'fechado';
const ouvintes = new Set<() => void>();
const definir = (v: EstadoLoteRumos): void => {
  if (estado === v) return;
  estado = v;
  for (const o of ouvintes) o();
};

/** Estado atual (leitura direta, para testes e para quem não usa React). */
export const estadoLoteRumos = (): EstadoLoteRumos => estado;

/** O diálogo está aberto (ou escondido só enquanto se escolhe o ponto)? */
export const loteRumosAberto = (): boolean => estado !== 'fechado';

/** Hook do estado (também responde na renderização no servidor, usada pelos testes). */
export function useEstadoLoteRumos(): EstadoLoteRumos {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    estadoLoteRumos,
    estadoLoteRumos,
  );
}

export const abrirLoteRumos = (): void => definir('aberto');
export const fecharLoteRumos = (): void => definir('fechado');
/** Esconde o diálogo enquanto o usuário escolhe o ponto inicial na planta. */
export const escolherPontoNaPlanta = (): void => definir('escolhendo');
/** Volta a mostrar o diálogo depois da escolha (ou do cancelamento). */
export const voltarDaEscolha = (): void => {
  if (estado === 'escolhendo') definir('aberto');
};
