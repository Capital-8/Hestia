import type { WallFrame } from './frame.ts';
import { tangentAt } from './frame.ts';
import type { Relation } from './wallTiltJoin.ts';
import type { Cunha } from './wallTiltJoinLevel.ts';

export type Par = Relation & { kind: 'pair' };
/** Continuação: eixos tangentes no nó e saindo em sentidos opostos (paredes em linha ou arcos tangentes). */
export function emContinuacao(fa: WallFrame, fb: WallFrame, r: Par): boolean {
  const ua = tangentAt(fa, r.a.end === 'a' ? 0 : fa.length), ub = tangentAt(fb, r.b.end === 'a' ? 0 : fb.length);
  const sa = r.a.end === 'a' ? 1 : -1, sb = r.b.end === 'a' ? 1 : -1; // sentido do eixo saindo do nó
  const dot = (ua.x * ub.x + ua.y * ub.y) * sa * sb; // < 0: os eixos saem do nó em sentidos opostos (continuação)
  return Math.abs(ua.x * ub.y - ua.y * ub.x) < 1e-4 && dot < 0;
}

/** Cunha da junção reta×reta quando a parede dona (a mais antiga) pede `transicao: 'cunha'` na ponta ligada; senão null. */
export function cunhaDe(fa: WallFrame, fb: WallFrame, r: Par, H: number): Cunha | null {
  const dona = fa.wall.order <= fb.wall.order ? { f: fa, end: r.a.end } : { f: fb, end: r.b.end };
  const cfg = dona.end === 'a' ? dona.f.wall.joinStart : dona.f.wall.joinEnd;
  if (cfg?.transicao !== 'cunha') return null;
  const sa = r.a.end === 'b' ? 1 : -1, sb = r.b.end === 'a' ? 1 : -1; // +1: a→b da parede acompanha o eixo da continuação
  const u = { x: fa.u.x * sa, y: fa.u.y * sa };
  const n = { x: -u.y, y: u.x };
  const tan = (f: WallFrame, s: number): number => s * H * Math.tan(((f.wall.tilt ?? 0) * Math.PI) / 180);
  const offA = tan(fa, sa), offB = tan(fb, sb);
  const t = Math.max(fa.thickness, fb.thickness);
  const node = r.a.end === 'a' ? fa.a : fa.b;
  return { wallId: dona.f.wall.id, node, u, n, H, t, offA, offB, volume: (t * H * Math.abs(offA - offB)) / 2 };
}

