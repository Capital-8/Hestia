import { polygonArea, union, type SketchDraft, type Vec2 } from '@hestia/geom';
import { addSegs, closeAnalysis, removeSegs, type NewSeg } from './perimeterSession.ts';

/**
 * "Unir formas" do esboço: todas as formas FECHADAS do rascunho (laços deduzidos pelas pontas) viram o contorno da união 2D
 * (`union` de @hestia/geom, a mesma de `uniaoDeAneis` dos pisos da massa). As linhas dos laços saem e entram as do contorno
 * resultante: cordas retas (arcos e círculos já chegam amostrados a 2 mm; não se preservam arcos). Linhas abertas ficam.
 * Recusa, sem mudar nada, quando: há menos de 2 formas fechadas (`few`), nenhuma se sobrepõe (`none`) ou o resultado tem mais de
 * um componente (`separate`: formas separadas, ou só algumas se encontram). Furos da união (formas em anel) viram laços internos.
 */
export type UnirResultado = { ok: true; draft: SketchDraft; before: number; after: number; area: number } | { ok: false; reason: 'few' | 'none' | 'separate' };

const semFechar = (r: Vec2[]): Vec2[] => r;
/** Anel sem o ponto final repetido (alguns resultados booleanos fecham o anel repetindo o primeiro ponto). */
const aberto = (r: Vec2[]): Vec2[] => (r.length > 3 && Math.hypot(r[0]!.x - r[r.length - 1]!.x, r[0]!.y - r[r.length - 1]!.y) < 1e-9 ? r.slice(0, -1) : r);

export function unirFormas(d: SketchDraft): UnirResultado {
  const loops = closeAnalysis(d).loops;
  if (loops.length < 2) return { ok: false, reason: 'few' };
  const u = union(...loops.map((l) => [[semFechar(l.ring)]]));
  if (u.length === 0) return { ok: false, reason: 'few' };
  if (u.length > 1) return { ok: false, reason: loops.length === u.length ? 'none' : 'separate' };
  const poly = u[0]!;
  const novas: NewSeg[] = poly.map(aberto).flatMap((anel) => anel.map((a, i) => ({ a, b: anel[(i + 1) % anel.length]! })));
  const draft = addSegs(removeSegs(d, loops.flatMap((l) => l.segs.map((s) => s.id))), novas);
  return { ok: true, draft, before: loops.length, after: poly.length, area: Math.abs(polygonArea(poly)) };
}
