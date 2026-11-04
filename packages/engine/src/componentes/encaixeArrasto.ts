import type { EntradaArrasto, OpcoesArrasto, ResultadoArrasto } from './encaixeTipos.ts';

/**
 * Compõe o encaixe de um arrasto: primeiro a parede (`encaixarNaParede`), depois o vizinho (`encaixarNoVizinho`) sobre a pose já
 * encostada na parede, sem desfazer o encosto (o vizinho só desliza o móvel ao longo da parede), depois `colisoes` e `guiasDeAlinhamento`
 * na pose final. Com `semEncaixe` devolve a pose desejada com as colisões e sem guias. Nunca lança: sem encaixe, a pose é a desejada.
 */
export function posarArrastado(_entrada: EntradaArrasto, _opcoes: OpcoesArrasto = {}): ResultadoArrasto {
  throw new Error('não implementado');
}
