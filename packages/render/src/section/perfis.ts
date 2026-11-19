import { CLOSED, projectParts, type OpeningModel, type OpenState, type ProjectedRing } from '@hestia/engine';

/**
 * Projeção das peças para o corte/elevação com as seções do modelo (`OpeningPart.profile`). O motor projeta a caixa
 * envolvente; aqui a peça com seção troca o anel pela seção real:
 *
 * - corte transversal (`axis = 't'`): a travessa (`plane 'sz'`) é o próprio L em (s, z), com 6 vértices; a ombreira
 *   (`plane 'ts'`, extrudada em z) aparece como retângulo, a projeção do L ao longo de t;
 * - elevação (`axis = 's'`): as duas seções aparecem como o retângulo envolvente (projeção ao longo de s).
 *
 * Sem `profile`, o anel é o de `projectParts`, sem mudança.
 */
export function projetarComPerfis(m: OpeningModel, axis: 's' | 't', state: OpenState = CLOSED, fatiaEmT?: number): ProjectedRing[] {
  return projectParts(m, axis, state).flatMap((item): ProjectedRing[] => {
    const profile = item.part.profile;
    if (!profile) return [item];
    if (axis === 't' && fatiaEmT !== undefined && profile.plane === 'tz') {
      const b = item.part.box;
      // Só a peça que o plano de corte atravessa é fatiada; a que fica antes ou depois dele segue como projeção (a caixa).
      if (b.t0 - 1e-9 <= fatiaEmT && b.t1 + 1e-9 >= fatiaEmT) return fatiaTz(item, profile.pts, fatiaEmT);
      return [item];
    }
    if (axis !== 't' || profile.plane !== 'sz') return [item];
    return [{ ...item, ring: profile.pts.map(([s, z]) => ({ u: s, z })) }];
  });
}

/**
 * Corte de um prisma `tz` (seção (t, z) extrudada em s entre `box.s0` e `box.s1`) pelo plano `t = c`: os intervalos de z
 * em que a reta vertical está dentro da seção viram retângulos (s, z). É o que o corte transversal mostra de uma peça
 * recortada pelo contorno do vão (o arco do batente, a folha sob o arco).
 */
function fatiaTz(item: ProjectedRing, pts: ReadonlyArray<readonly [number, number]>, c: number): ProjectedRing[] {
  const zs: number[] = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ti, zi] = pts[i]!;
    const [tj, zj] = pts[j]!;
    if (ti > c === tj > c) continue;
    zs.push(zi + ((c - ti) * (zj - zi)) / (tj - ti));
  }
  zs.sort((a, b) => a - b);
  const { s0, s1 } = item.part.box;
  const out: ProjectedRing[] = [];
  for (let k = 0; k + 1 < zs.length; k += 2) {
    const [lo, hi] = [zs[k]!, zs[k + 1]!];
    if (hi - lo < 1e-6) continue;
    out.push({ ...item, ring: [{ u: s0, z: lo }, { u: s1, z: lo }, { u: s1, z: hi }, { u: s0, z: hi }] });
  }
  return out;
}
