/**
 * Sólido de uma peça da esquadria (batente, folha, vidro, alizar...). Peça sem seção própria sai como caixa, como sempre.
 * Peça com `profile` (vão com forma: a peça foi recortada pelo contorno) sai com a seção real, em IfcArbitraryClosedProfileDef
 * (polilinha) extrudado ao longo da espessura da parede, no plano certo:
 *
 * - `ts` (t, s) extrudado em z de `z0` a `z1` (ombreira com rebaixo, peça de topo redonda);
 * - `sz` (s, z) extrudado em t de `t0` a `t1` (travessa com rebaixo);
 * - `tz` (t, z) extrudado em s de `s0` a `s1` (prisma do arco: batente em arco, alizar, vidro, folha recortada).
 *
 * As coordenadas são as do sistema local do vão (`t` ao longo da parede, `s` na espessura, `z` acima do peitoril), as
 * mesmas da caixa; o posicionamento do sólido só troca o plano da seção. Sem estado global.
 */
import { extrudeHorizontalProfile, extrudeSolid } from './ifcSolids.ts';
import type { StepWriter } from './ifcStep.ts';
import type { IfcOpeningPartGeo, IfcPolygon, IfcRing } from './ifcTypes.ts';

/** Retângulo da peça no plano local do vão (x = `t`, y = `s`), pronto para a extrusão vertical. */
export function rectOfPart(part: IfcOpeningPartGeo): IfcPolygon {
  return [
    [
      { x: part.t0, y: part.s0 },
      { x: part.t1, y: part.s0 },
      { x: part.t1, y: part.s1 },
      { x: part.t0, y: part.s1 },
    ],
  ];
}

/** Id do IFCEXTRUDEDAREASOLID da peça. Peças sem `profile` mantêm exatamente o caminho retangular de antes (mesmas linhas). */
export function openingPartSolid(w: StepWriter, part: IfcOpeningPartGeo): number {
  const dz = part.z1 - part.z0;
  const pr = part.profile;
  if (!pr) return extrudeSolid(w, rectOfPart(part), part.z0, dz);
  const ring: IfcRing = pr.pts.map(([x, y]) => ({ x, y }));
  if (pr.plane === 'ts') return extrudeSolid(w, [ring], part.z0, dz);
  // `sz`: eixo de extrusão = +t; eixo local X = +s, local Y = +z (Z × X = Y).
  if (pr.plane === 'sz') return extrudeHorizontalProfile(w, ring, [part.t0, 0, 0], [1, 0, 0], [0, 1, 0], part.t1 - part.t0);
  // `tz`: a origem fica na face s1 e a extrusão vai para -s até s0; eixo local X = +t, local Y = +z (Z × X = Y).
  return extrudeHorizontalProfile(w, ring, [0, part.s1, 0], [0, -1, 0], [1, 0, 0], part.s1 - part.s0);
}
