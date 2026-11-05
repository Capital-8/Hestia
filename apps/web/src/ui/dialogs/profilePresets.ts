import { profileHeightAt, type ProfilePoint } from '@hestia/model';
import { t as translate, type Lang } from '../../editor/i18n.ts';

/** Topo reto: a mesma altura nas duas extremidades. É o ponto de partida da tabela quando não há perfil. */
export const straightProfile = (length: number, height: number): ProfilePoint[] => [
  { t: 0, h: height },
  { t: length, h: height },
];

/** Topo inclinado: altura `hA` em a e `hB` em b. */
export const presetInclinado = (length: number, hA: number, hB: number): ProfilePoint[] => [
  { t: 0, h: hA },
  { t: length, h: hB },
];

/** Empena (duas águas): altura nos extremos e a cumeeira em t = L/2. */
export const presetEmpena = (length: number, hExt: number, hRidge: number): ProfilePoint[] => [
  { t: 0, h: hExt },
  { t: length / 2, h: hRidge },
  { t: length, h: hExt },
];

/** Degrau: `hLow` até `tStep`, `hHigh` depois. Dois pontos com o mesmo t formam o degrau. */
export const presetDegrau = (length: number, hLow: number, hHigh: number, tStep = length / 2): ProfilePoint[] => [
  { t: 0, h: hLow },
  { t: tStep, h: hLow },
  { t: tStep, h: hHigh },
  { t: length, h: hHigh },
];

/**
 * Novo ponto no meio do maior intervalo entre as bordas (0 e L) e os pontos existentes.
 * A altura é a do próprio perfil naquele t, então a forma não muda ao inserir.
 */
export function insertPoint(pts: ProfilePoint[], length: number): ProfilePoint[] {
  const ts = [0, ...pts.map((q) => q.t), length];
  let best = 0;
  let bestGap = -Infinity;
  for (let i = 0; i + 1 < ts.length; i++) {
    const gap = ts[i + 1]! - ts[i]!;
    if (gap > bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  const t = (ts[best]! + ts[best + 1]!) / 2;
  // ts[i] é a borda (i = 0) ou pts[i - 1]: o novo ponto entra na posição `best` da lista.
  return [...pts.slice(0, best), { t, h: profileHeightAt(pts, t) }, ...pts.slice(best)];
}

/** Posições fora de [0, L] (o erro de ordem e de altura fica em `profileError`). */
export function profileRangeError(pts: ProfilePoint[], length: number, lang: Lang = 'pt'): string | null {
  const EPS = 1e-9;
  return pts.some((q) => q.t < -EPS || q.t > length + EPS) ? translate(lang, 'dlt_profile_range_error') : null;
}
