import { isWall, outline, type Opening, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';

/**
 * Quanto a forma do vão sai do envelope da parede reta (docs/estudo-esquadrias/33 §2.3): o contorno, posto em `offset` e no
 * peitoril, contra o retângulo `[0, comprimento] x [0, altura]` da parede. Devolve o maior excesso (m), 0 se cabe.
 * Vale para parede reta e vertical sem perfil: parede curva, inclinada ou com perfil não passam pelo furo de contorno e a
 * forma já é ignorada nelas. O furo remove só a parte que cabe; este número alimenta o aviso `vao-fora-do-envelope`.
 */
export function excessoForaDoEnvelope(p: Project, o: Opening): number {
  const host = p.elements[o.hostId];
  if (!isWall(host) || host.sag !== 0 || host.tilt || host.topProfile) return 0;
  const f = frameOfWall(p, host.id);
  if (!f) return 0;
  const g = openingGeometry(p, o, f);
  if (!g.forma) return 0;
  const c = outline(g.forma);
  const xs = c.map((q) => g.offset + q[0]);
  const zs = c.map((q) => g.sill + q[1]);
  const exc = Math.max(0 - Math.min(...xs), Math.max(...xs) - f.length, 0 - Math.min(...zs), Math.max(...zs) - host.height, 0);
  return exc > 1e-6 ? exc : 0;
}
