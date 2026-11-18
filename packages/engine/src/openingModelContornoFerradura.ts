import type { OpeningShape } from '@hestia/model';
import type { OpeningPart } from './openingModelTypes.ts';

/*
 * Ferradura (docs/estudo-esquadrias/32): a caixa do vão tem a largura do arco (o círculo), mas as ombreiras retas ficam na
 * abertura `neck`, mais estreita. O modelo retangular põe ombreiras, alizar lateral e soleiras na borda da caixa; aqui elas
 * entram `delta = (width - neck) / 2` para o pescoço. O que é recortado pelo contorno (vidro, folha) já acompanha a ferradura;
 * a coroa do batente e do alizar vem de `crownBand`. Ferragens (dobradiças) NÃO se movem: [I] ficam na borda da caixa.
 */

const EPS = 1e-9;

/** A peça com a posição em t corrigida para o pescoço da ferradura; outras formas e outras peças voltam como vieram. */
export function ferraduraNoPescoco(part: OpeningPart, shape: OpeningShape): OpeningPart {
  if (shape.kind !== 'horseshoe' || part.profile?.plane === 'tz') return part;
  const delta = (shape.width - shape.neck) / 2;
  const b = part.box;
  const lateral = part.material === 'frame' && part.role === 'jamb';
  const alizarLateral = part.role === 'casing' && /^casing-(left|right)-/.test(part.id);
  const larga = (part.material === 'frame' && (part.role === 'sillFrame' || part.role === 'threshold')) || (part.role === 'casing' && /^casing-sill-/.test(part.id));
  let dt0 = 0;
  let dt1 = 0;
  if ((lateral || alizarLateral) && Math.abs(b.t0 + b.t1) > EPS) {
    const d = b.t0 + b.t1 < 0 ? delta : -delta; // a ombreira da esquerda vai para a direita e vice-versa
    dt0 = d;
    dt1 = d;
  } else if (larga && b.t0 < -EPS && b.t1 > EPS) {
    dt0 = delta;
    dt1 = -delta;
  }
  if (dt0 === 0 && dt1 === 0) return part;
  const profile = part.profile?.plane === 'ts' ? { plane: 'ts' as const, pts: part.profile.pts.map(([t, s]): [number, number] => [t + (b.t0 + b.t1 < 0 ? dt0 : dt1), s]) } : part.profile;
  return { ...part, box: { ...b, t0: b.t0 + dt0, t1: b.t1 + dt1 }, ...(profile ? { profile } : {}) };
}
