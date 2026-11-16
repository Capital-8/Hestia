import { SPLIT_LIMITS } from '../editor/panes.ts';

/** Espessura da divisória entre dois painéis, em px (igual à do CSS `paneGrid.css`). */
export const DIVISORIA_PX = 6;

/** Passo da divisória com as setas do teclado (fração do espaço). */
export const PASSO_TECLADO = 0.02;

/** Limita a fração ao intervalo de `SPLIT_LIMITS`. Valor não finito cai no meio (0,5). */
export function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return 0.5;
  return Math.min(SPLIT_LIMITS.maxRatio, Math.max(SPLIT_LIMITS.minRatio, r));
}

/**
 * Fração que o primeiro filho ocupa, dado o ponteiro sobre a divisória. `origem` e `extensao` são a posição e o tamanho do
 * contêiner da divisão (no eixo do corte). O espaço livre é `extensao - DIVISORIA_PX` (a divisória ocupa sua espessura),
 * e o centro da divisória fica `DIVISORIA_PX / 2` depois do fim do primeiro filho. Devolve null sem espaço útil.
 */
export function fracaoDoPonteiro(ponteiro: number, origem: number, extensao: number): number | null {
  const livre = extensao - DIVISORIA_PX;
  if (!Number.isFinite(ponteiro) || !Number.isFinite(origem) || !(livre > 0)) return null;
  return clampRatio((ponteiro - origem - DIVISORIA_PX / 2) / livre);
}

/**
 * Fração nova após uma tecla na divisória focada: ← e ↑ diminuem o primeiro filho, → e ↓ aumentam. Outras teclas
 * devolvem null (a tecla não é da divisória). O resultado já vem clampado.
 */
export function passoDaTecla(ratio: number, tecla: string): number | null {
  switch (tecla) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return clampRatio(ratio - PASSO_TECLADO);
    case 'ArrowRight':
    case 'ArrowDown':
      return clampRatio(ratio + PASSO_TECLADO);
    default:
      return null;
  }
}
