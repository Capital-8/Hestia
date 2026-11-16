import type { Vec2 } from '@hestia/geom';
import type { DetailLine, Id, Project } from '@hestia/model';
import { viewAnnotationsOf } from './annotationPick.ts';
import type { SnapPoint } from './infer.ts';

/**
 * Segmentos de uma linha de detalhe para a captura. Hoje a linha é reta (a→b). Este é o ÚNICO ponto a trocar quando a
 * linha ganhar arco: a versão com `detailLineSegments` (modelo) entra aqui, e o resto do módulo não muda.
 */
export function segmentosDaLinha(l: DetailLine): Array<{ a: Vec2; b: Vec2 }> {
  return [{ a: l.a, b: l.b }];
}

/**
 * Linhas de detalhe da vista (planta de piso ou planta de área, pelo `planId`), sem as ocultas na vista. As linhas
 * ocultas (temporárias, permanentes ou isoladas para fora) não são alvo de captura, como não são de clique.
 */
function linhasDaVista(p: Project, levelId: Id, planId?: Id, hidden?: ReadonlySet<Id>): DetailLine[] {
  return viewAnnotationsOf(p, levelId, planId).detailLines.filter((l) => !hidden?.has(l.id));
}

/** Arestas das linhas de detalhe da vista, com o dono (`hostId`) para o `ignore` do motor de captura. */
export function detailEdges(p: Project, levelId: Id, planId?: Id, hidden?: ReadonlySet<Id>): Array<{ a: Vec2; b: Vec2; hostId: Id }> {
  return linhasDaVista(p, levelId, planId, hidden).flatMap((l) => segmentosDaLinha(l).map(({ a, b }) => ({ a, b, hostId: l.id })));
}

/** Pontas e ponto médio de cada linha de detalhe da vista: extremidade (`endpoint`) e centro (`midpoint`). */
export function detailPoints(p: Project, levelId: Id, planId?: Id, hidden?: ReadonlySet<Id>): SnapPoint[] {
  return linhasDaVista(p, levelId, planId, hidden).flatMap((l) => [
    { x: l.a.x, y: l.a.y, hostId: l.id, kind: 'endpoint' as const },
    { x: l.b.x, y: l.b.y, hostId: l.id, kind: 'endpoint' as const },
    { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2, hostId: l.id, kind: 'midpoint' as const },
  ]);
}
