import { closestOnSegment, dist, norm, sub, type Vec2 } from '@hestia/geom';
import { aneisDaMassaNoNivel } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import type { AlignFeature } from './alignFeatures.ts';

/**
 * Arestas do anel cortado da massa (o do kernel; sem kernel, o contorno da base), segmento a segmento, como feições do Alinhar. A massa é
 * feição que se move (política `transladar`, o mesmo `transform` da planta). O alvo `'guardaCorpo'` só diz "elemento avulso que o `transform`
 * translada": o Alinhar só distingue a parede dos demais alvos (`applyAlign` executa o `transform` do id), então a massa usa o mesmo caminho
 * (um alvo `'massa'` pediria mexer em `alignSolve.ts`, fora da lista desta ficha). O rótulo é o nome da massa.
 */
export function massFeatures(p: Project, levelId: Id, at: Vec2, mpp: number, tolPx: number, hidden?: ReadonlySet<Id>): AlignFeature[] {
  const tol = tolPx * mpp;
  const out: AlignFeature[] = [];
  for (const [id, aneis] of aneisDaMassaNoNivel(p, levelId)) {
    const m = p.elements[id];
    if (!m || m.kind !== 'mass' || hidden?.has(id)) continue;
    aneis.forEach((anel, k) => {
      anel.forEach((a, i) => {
        const b = anel[(i + 1) % anel.length]!;
        if (dist(a, b) < 1e-9) return;
        const d = dist(at, closestOnSegment(at, a, b));
        if (d > tol) return;
        out.push({ key: `${id}:massa:${k}:${i}`, kind: 'arestaMassa', label: m.name, ownerId: id, line: { p: a, d: norm(sub(b, a)) }, move: { policy: 'transladar', target: 'guardaCorpo', id }, distance: d, seg: { a, b } });
      });
    });
  }
  return out;
}
