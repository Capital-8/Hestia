import { arcFromSagitta, arcPointAt, dist, lerp, sagFromThreePoints, type Arc, type Vec2 } from '@hestia/geom';
import type { Command } from './commands.ts';
import { DEFAULT_JOIN } from './wall.ts';
import { splitProfile } from './profile.ts';
import { isOpening, isWall, type Opening, type Project, type Wall } from './types.ts';
import { openingTypeById } from './openingNominal.ts';
import { t, type Lang } from './i18n.ts';

const EPS = 1e-9;
/** Largura usada quando o tipo de abertura não existe (mesmo padrão de clampOffset). */
const DEFAULT_WIDTH = 0.8;

/**
 * Divide uma parede reta ou em arco em duas (Revit: Split Wall / Split with Gap).
 * `t` é a distância ao longo do eixo (comprimento do arco, se curva) a partir de `a`. Com `gap`, o trecho
 * [t−gap/2, t+gap/2] é removido. A original vai de `a` até t−gap/2; a nova (`newId`) vai de t+gap/2 até `b`.
 * Nas paredes em arco, as duas metades são recalculadas sobre a mesma circunferência (novo `sag`).
 * Aberturas com centro antes do corte ficam na original; as depois, na nova (offset recalculado);
 * as que não cabem no novo comprimento, ou caem no intervalo removido, são apagadas.
 * Tudo ocorre dentro de um único `produce`: se a validação falhar, o projeto não muda.
 */
export function splitWall(p: Project, c: Extract<Command, { type: 'splitWall' }>, lang: Lang = 'pt'): void {
  const w = p.elements[c.id];
  if (!isWall(w)) throw new Error(t(lang, 'md_cmd_wall_missing'));
  if (p.elements[c.newId]) throw new Error(t(lang, 'md_cmd_wall_id_exists'));

  const gap = c.gap ?? 0;
  const arc = arcFromSagitta(w.a, w.b, w.sag);
  const L = arc ? arc.length : dist(w.a, w.b);
  const lo = c.t - gap / 2;
  const hi = c.t + gap / 2;
  // Negações escritas como comparações positivas: NaN também é rejeitado.
  if (!(gap >= 0 && lo > EPS && hi < L - EPS)) throw new Error(t(lang, 'md_cmd_cut_invalid'));

  const a = { x: w.a.x, y: w.a.y };
  const b = { x: w.b.x, y: w.b.y };
  const pointAt = (t: number): Vec2 => (arc ? arcPointAt(arc, t) : lerp(a, b, t / L));
  const cutStart = pointAt(lo);
  const cutEnd = pointAt(hi);
  const newLen = L - hi;

  for (const o of Object.values(p.elements).filter(isOpening).filter((x) => x.hostId === w.id)) {
    const half = (openingTypeById(p, o.typeId)?.width ?? DEFAULT_WIDTH) / 2;
    if (o.offset < lo) {
      // Fica na original: só cabe se o vão terminar antes do novo fim.
      if (o.offset - half < -EPS || o.offset + half > lo + EPS) delete p.elements[o.id];
      continue;
    }
    const off = o.offset - hi;
    if (o.offset >= hi && off - half >= -EPS && off + half <= newLen + EPS) {
      moveOpening(p, o, c.newId, off, c.idMap?.[o.id] ?? o.id, lang);
    } else {
      delete p.elements[o.id];
    }
  }

  const joinEnd = { ...w.joinEnd };
  const noJoinEnd = w.noJoinEnd;
  const [profL, profR] = w.topProfile ? splitProfile(w.topProfile, lo, hi) : [null, null];
  const right: Wall = {
    ...w,
    topProfile: profR,
    id: c.newId,
    a: cutEnd,
    b,
    sag: arc ? subArcSag(arc, hi, L) : w.sag,
    joinStart: { ...DEFAULT_JOIN },
    noJoinStart: false,
    joinEnd,
    noJoinEnd,
    order: p.nextOrder++,
  };
  p.elements[c.newId] = right;

  w.b = cutStart;
  w.sag = arc ? subArcSag(arc, 0, lo) : w.sag;
  w.topProfile = profL;
  w.joinEnd = { ...DEFAULT_JOIN };
  w.noJoinEnd = false;
}

/** Flecha do trecho t0→t1 do mesmo arco, para a metade continuar sobre a mesma circunferência. */
function subArcSag(arc: Arc, t0: number, t1: number): number {
  const p0 = arcPointAt(arc, t0);
  const pm = arcPointAt(arc, (t0 + t1) / 2);
  const p1 = arcPointAt(arc, t1);
  return sagFromThreePoints(p0, pm, p1);
}

function moveOpening(p: Project, o: Opening, hostId: string, offset: number, newOpeningId: string, lang: Lang): void {
  if (newOpeningId !== o.id && p.elements[newOpeningId]) throw new Error(t(lang, 'md_cmd_opening_id_exists'));
  delete p.elements[o.id];
  p.elements[newOpeningId] = { ...o, id: newOpeningId, hostId, offset };
}
