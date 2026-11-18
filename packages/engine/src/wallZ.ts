import { profileMax, wallBaseElevation, wallMaxHeight, wallThicknessOf, type Project, type ProfilePoint, type Wall } from '@hestia/model';
import { attachSpans, MIN_HEIGHT, type AttachSpan } from './wallAttach.ts';
import { resolveAllFloors, type ResolvedFloor } from './floors.ts';
import { resolveAllRoofs, type ResolvedRoof } from './roofs.ts';
import { roofWallProfile } from './roofWall.ts';
import { resolveAllSlabs, type ResolvedSlab } from './slabs.ts';

/** Cota absoluta da base e altura máxima de uma parede, já com os anexos a piso. */
export interface WallZ {
  /** Cota absoluta da base (a menor base ao longo do eixo; é a referência dos perfis). */
  z0: number;
  /** Altura máxima (o perfil superior, quando há, define a maior altura). */
  height: number;
  /** Perfil superior (relativo a z0): do telhado (attachTopToRoof) ou do piso/laje do nível de topo. Ausente se reto. */
  profile?: ProfilePoint[];
  /** Perfil da base (relativo a z0), só quando a base não é uniforme: degraus onde o piso ou laje cobre só parte do eixo. */
  bottomProfile?: ProfilePoint[];
}

/** Metade da espessura (m) usada no corte do topo pelo telhado; 0 sem `attachTopRoofFull` ou sem tipo de parede. */
function halfThickness(p: Project, w: Wall): number {
  const t = w.attachTopRoofFull === true ? p.wallTypes[w.typeId] : undefined;
  return t ? wallThicknessOf(t) / 2 : 0;
}

/**
 * Perfil em degraus de uma grandeza por trecho (base ou topo), relativo a `ref`. Trechos vizinhos de mesma cota fundem;
 * sem variação (cota única) não há perfil (null). Cada mudança de cota é um degrau: dois pontos com o mesmo `t`.
 * `minH` é a altura mínima do ponto (topo: 1 cm; base: 0).
 */
function stepProfile(spans: AttachSpan[], pick: (s: AttachSpan) => number, ref: number, minH: number): ProfilePoint[] | null {
  const steps: Array<{ t0: number; t1: number; z: number }> = [];
  for (const s of spans) {
    const z = pick(s);
    const last = steps[steps.length - 1];
    if (last && Math.abs(last.z - z) < 1e-9) last.t1 = s.t1;
    else steps.push({ t0: s.t0, t1: s.t1, z });
  }
  if (steps.length < 2) return null;
  const pt = (t: number, z: number): ProfilePoint => ({ t, h: Math.max(minH, z - ref) });
  const out = [pt(steps[0]!.t0, steps[0]!.z)];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!;
    const cur = steps[i]!;
    out.push(pt(cur.t0, prev.z), pt(cur.t0, cur.z));
  }
  const last = steps[steps.length - 1]!;
  out.push(pt(last.t1, last.z));
  return out;
}

/**
 * Base e altura da parede (Revit: base e topo anexados ao piso ou à laje, docs/paridade/pisos C1 e lajes C1, decisão 0006
 * item 6 e decisão 0007). Decisão 0023 §6 (P9): a cota vale POR TRECHO do eixo, não só no ponto médio. Com
 * `attachBottomToFloor`, cada trecho coberto por piso ou laje do mesmo nível vai para a face superior dele (a mais alta
 * entre os que cobrem); o trecho descoberto fica na cota do modelo. Com `attachTopToFloor`, cada trecho coberto vai para
 * a face inferior do elemento do nível `topLevelId` (a mais baixa). Laje inclinada usa a cota da face no ponto médio do
 * trecho. A parede continua uma só: o resultado é um perfil derivado (`bottomProfile`, `profile`), não guardado.
 * Uma base uniforme (parede toda coberta por uma cota, ou sem cobertura) sai como antes: `z0` e `height`, sem perfil.
 * Sem piso, ou se o ajuste deixasse a parede sem altura, o ajuste é ignorado. Parede com perfil superior não recebe o topo
 * anexado (o perfil já define o topo). Sem os flags, devolve exatamente a base e a altura do modelo.
 * Com `attachTopToRoof` (decisão 0008, item 6), o topo vai para a face inferior do telhado ao longo do eixo (`roofWallProfile`);
 * só o trecho coberto pelo telhado segue a face inferior; o trecho sem telhado fica na altura normal (`roofWallProfile`).
 * `roofs` vem do engine (resolveAllRoofs); sem ele, é resolvido aqui.
 */
export function wallZRange(
  p: Project,
  w: Wall,
  floors: ResolvedFloor[] = resolveAllFloors(p),
  slabs: ResolvedSlab[] = resolveAllSlabs(p),
  roofs?: ResolvedRoof[],
): WallZ {
  const base = wallBaseElevation(p, w);
  const height = wallMaxHeight(p, w);
  const profiled = Boolean(w.topProfile && w.sag === 0);
  const wantsBottom = w.attachBottomToFloor === true;
  const wantsRoof = w.attachTopToRoof === true;
  const wantsTop = w.attachTopToFloor === true && w.topLevelId !== null && !profiled;
  if (!wantsBottom && !wantsTop && !wantsRoof) return { z0: base, height };
  const top0 = base + height;
  const spans = attachSpans(w, base, top0, wantsBottom ? w.levelId : null, wantsTop ? w.topLevelId : null, floors, slabs);
  const z0 = Math.min(...spans.map((s) => s.bottom));
  const bottomProfile = stepProfile(spans, (s) => s.bottom, z0, 0);
  const extra = bottomProfile ? { bottomProfile } : {};
  if (wantsRoof) {
    const profile = roofWallProfile(w, roofs ?? resolveAllRoofs(p), z0, top0, halfThickness(p, w));
    if (profile) return { z0, height: profileMax(profile), profile, ...extra };
  }
  const topProfile = wantsTop ? stepProfile(spans, (s) => s.top, z0, MIN_HEIGHT) : null;
  if (topProfile) return { z0, height: profileMax(topProfile), profile: topProfile, ...extra };
  const top = Math.max(...spans.map((s) => s.top));
  if (z0 === base && top === top0 && !bottomProfile) return { z0: base, height };
  return { z0, height: top - z0, ...extra };
}
