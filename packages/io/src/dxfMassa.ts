import type { DxfPoint } from './dxf.ts';

/**
 * Massa conceitual na planta do DXF (plano de massa, ficha X1): as linhas de `massa_planta` (cortado, projetado e acima) numa camada só, `MASSA`.
 * O io não conhece o kernel: quem monta a geometria é o app (`dxfExportMassa.ts`), que entrega os anéis já em planta. O corte e a elevação usam a
 * camada de corte da categoria (`CORTE_MASSA`, de `dxfSection.ts`), então não há nada novo aqui para eles.
 */

/** Camada da massa na planta (todas as linhas dela, a faixa de vista inteira). */
export const DXF_LAYER_MASS = 'MASSA';

/** Polilinha da massa em planta: pontos em metros; o anel das seções e do corte é fechado e o `dashed` põe o tracejado (seção acima do corte). */
export interface DxfMassPath {
  pts: DxfPoint[];
  closed: boolean;
  dashed?: boolean;
}
