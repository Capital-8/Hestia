import type { DxfPoint } from './dxf.ts';

/**
 * Camadas do terreno e do lote na PLANTA do DXF (A.7 do plano do terreno, ficha X1). O io não calcula nada: quem monta (apps/web) traz as curvas e a
 * borda do kernel e os contornos do modelo. As curvas de nível saem como LWPOLYLINE com a ELEVAÇÃO (código 38) igual à COTA EXIBIDA da curva
 * (z do projeto mais `localizacao.cotaZero`; sem localização, o próprio z): quem abre o arquivo no CAD vê a altitude real. As demais saem planas.
 * No corte o terreno sai em `CORTE_TERRENO` (`dxfSectionLayerOf('site')`), em coordenadas `(s, z)` do plano da vista, como o resto do corte.
 */
export const DXF_LAYER_TERRENO_CURVAS = 'TERRENO_CURVAS';
export const DXF_LAYER_TERRENO_CURVAS_MESTRAS = 'TERRENO_CURVAS_MESTRAS';
export const DXF_LAYER_TERRENO_BORDA = 'TERRENO_BORDA';
export const DXF_LAYER_TERRENO_REGIAO = 'TERRENO_REGIAO';
export const DXF_LAYER_LOTE = 'LOTE';
export const DXF_LAYER_LOTE_EDIFICAVEL = 'LOTE_EDIFICAVEL';

/** Camadas do terreno (categoria `site`) e do lote (categoria `lot`) na planta. */
export const DXF_LAYERS_TERRENO: readonly string[] = [DXF_LAYER_TERRENO_CURVAS, DXF_LAYER_TERRENO_CURVAS_MESTRAS, DXF_LAYER_TERRENO_BORDA, DXF_LAYER_TERRENO_REGIAO];
export const DXF_LAYERS_LOTE: readonly string[] = [DXF_LAYER_LOTE, DXF_LAYER_LOTE_EDIFICAVEL];

/** Polilinha do terreno ou do lote na planta: `elevation` (m, cota exibida) só nas curvas de nível; `dashed` põe o tracejado no próprio traço. */
export interface DxfTerrenoPath {
  layer: string;
  pts: DxfPoint[];
  closed: boolean;
  elevation?: number;
  dashed?: boolean;
}
