/** Configuração do despacho das fatias A e B (decisões 0047 §12 e 0050). Fica fora de `kernelDespacho.ts` para o arquivo caber no limite de linhas. */

/** Quais partes do despacho estão ligadas. Vem do ambiente (URL e `localStorage`) na thread principal e viaja no pedido ao worker. */
export interface ConfigDespacho {
  /** Fatia A ligada (`kernelFatiaLigada('A')`). */
  fatiaA: boolean;
  /** Fatia B ligada (`kernelFatiaLigada('B')`): pisos e lajes (a junção segue no TS). */
  fatiaB: boolean;
  /** Modo sombra (`hestia:kernel:sombra`); vale para cada fatia ligada (sem fatia ligada não faz nada). */
  sombra: boolean;
}

export const CONFIG_PADRAO: ConfigDespacho = { fatiaA: false, fatiaB: false, sombra: false };

/** `K` da 0049 para pisos, lajes, camadas e junção (limite `1e-5 + K x perímetro x 1e-6`): o adotado em 0050 (B2 e B3). */
export const K_0049_FATIA_B = 0.08;
