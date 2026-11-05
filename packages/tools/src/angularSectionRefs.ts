import { closestOnSegment, dist, norm, sub, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { AlignFeature } from './alignFeatures.ts';
import { sectionSnapIndex } from './sectionSnapIndex.ts';
import type { SectionToolContext } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Referências da cota angular no corte/elevação. As retas vêm do índice de captura da vista (arestas e trilhas já em
 * (t, z)), não da planta. A forma é a mesma `AlignFeature` da planta, para reaproveitar a geometria angular.
 *
 * Limitação: a referência é guardada por coordenada (chave `sec:`), não por elemento. Se o elemento mudar de lugar,
 * a cota fica onde foi gravada (não acompanha a parede/abertura, como a cota linear do corte).
 */

const TOL_PX = 8;
const AXIS_KEYS = { h: 'tl_axis_horizontal', v: 'tl_axis_vertical', d: 'tl_axis_inclined' } as const;

/** Feição de corte: a chave começa com `sec:` e a reta vem das pontas da aresta (`seg`). */
export const isSectionRef = (f: AlignFeature): boolean => f.key.startsWith('sec:');

const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const pt = (p: Vec2): string => `${r6(p.x)},${r6(p.y)}`;

/**
 * Arestas da vista sob o cursor, da mais próxima para a mais distante. Só lê o índice (`sectionSnapIndex`); sem
 * resultado de corte devolve lista vazia. Elementos ocultos na vista não são referência.
 */
export function sectionRefFeatures(sec: SectionToolContext, at: Vec2, mpp: number, hidden?: ReadonlySet<Id>, lang: Lang = 'pt'): AlignFeature[] {
  let index;
  try {
    index = sectionSnapIndex(sec.result());
  } catch {
    return [];
  }
  const tol = TOL_PX * mpp;
  const seen = new Set<string>();
  const out: Array<AlignFeature> = [];
  for (const track of index.tracks) {
    if (track.hostId !== undefined && hidden?.has(track.hostId)) continue;
    const len = dist(track.a, track.b);
    if (len < 1e-9) continue;
    const anchor = closestOnSegment(at, track.a, track.b);
    const d = dist(anchor, at);
    if (d > tol) continue;
    const key = `sec:${pt(track.a)}|${pt(track.b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      line: { p: anchor, d: norm(sub(track.b, track.a)) },
      kind: 'arestaAnel',
      label: translate(lang, 'tl_msg_angular_edge', { axis: translate(lang, AXIS_KEYS[track.axis]) }),
      ownerId: track.hostId ?? 'section',
      move: { policy: 'nenhum' },
      seg: { a: { x: track.a.x, y: track.a.y }, b: { x: track.b.x, y: track.b.y } },
      distance: d,
    });
  }
  return out.sort((x, y) => x.distance - y.distance);
}
