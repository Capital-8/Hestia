import { openingRevealApplied, type OpeningType } from '@hestia/model';
import type { WallFrame } from './frame.ts';

/**
 * Centro do batente em `s` (relativo ao plano médio) depois do recuo `reveal` do tipo: desloca `Cd` para o lado interno da
 * parede pelo recuo efetivo (limitado para o batente não sair da parede). Sem recuo devolve `Cd` intacto. É a ÚNICA fonte do
 * deslocamento: o modelo de peças (3D, corte, planta, IFC) e o recorte do retorno leem o `Cd` daqui.
 */
export function revealedCenter(f: WallFrame, t: Pick<OpeningType, 'reveal'>, D: number, Cd: number): number {
  const dir = Math.sign(f.sInt - f.sExt) || 1;
  const applied = openingRevealApplied(t, f.thickness, dir * Cd, D);
  return applied > 0 ? Cd + dir * applied : Cd;
}
