import { dot, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { frameOfWall, type SectionResult } from '@hestia/engine';
import { hospedeiroDoGuardaCorpo, isGuardaCorpo, isOpening, isWall, type Id, type Opening, type Project } from '@hestia/model';
import { massaCortePieces } from './massCortePecas.ts';
import type { Piece } from './sectionEditTools.ts';
import type { PreviewItem, ToolEnv } from './types.ts';

/**
 * Prévia (fantasma) do Mover e do Copiar na vista de corte e elevação: o CONTORNO que a vista já desenha para cada elemento
 * selecionado, deslocado de `(dt, dz)` no plano (t, z), como a planta mostra o contorno deslocado (`ghostBands`).
 *
 * O desenho vem das mesmas peças que a vista usa para escolher o elemento sob o cursor (`resultPieces` e `guardaCorpoPieces`):
 * escada, rampa, laje, piso, telhado, parede, guarda-corpo e massa saem com o contorno que o corte desenha. A parede só anda na
 * horizontal (a cota dela vem do nível), então o fantasma dela nunca sobe. O que segue um hospedeiro (guarda-corpo da escada ou
 * da rampa, vão da parede) anda com ele.
 */

/** O que o Mover leva: elementos de modelo, aberturas soltas (sem a parede) e as anotações selecionadas da vista. */
export interface AlvosDoMover {
  /** Elementos que o `transform` leva (`moveisDoCorte`). */
  movidos: readonly Id[];
  /** Aberturas selecionadas cuja parede não anda junto (só no Mover). */
  aberturas: readonly Opening[];
  /** Formas das anotações selecionadas (só no Mover). */
  notas: FormasDasNotas;
}

export interface FormasDasNotas {
  linhas: Array<readonly [Vec2, Vec2]>;
  poligonos: Vec2[][];
  pontos: Vec2[];
  /** Quantas anotações entram (uma cota, um texto, uma linha...). */
  total: number;
}

export const SEM_NOTAS: FormasDasNotas = { linhas: [], poligonos: [], pontos: [], total: 0 };

/** Formas (linhas, contornos e pontos) das anotações selecionadas da vista, para o fantasma. */
export function formasDasNotas(env: ToolEnv, selection: readonly Id[]): FormasDasNotas {
  const sec = env.section?.();
  if (!sec || selection.length === 0) return SEM_NOTAS;
  const a = sec.annotations();
  const want = new Set(selection);
  const out: FormasDasNotas = { linhas: [], poligonos: [], pontos: [], total: 0 };
  for (const d of a.dimensions) if (want.has(d.id)) { out.linhas.push([d.a, d.b]); if (d.textAt) out.pontos.push(d.textAt); out.total++; }
  for (const t of a.texts) if (want.has(t.id)) { out.pontos.push(t.at); if (t.leader && t.leader.length > 1) for (let i = 1; i < t.leader.length; i++) out.linhas.push([t.leader[i - 1]!, t.leader[i]!]); out.total++; }
  for (const l of a.detailLines) if (want.has(l.id)) { out.linhas.push([l.a, l.b]); out.total++; }
  for (const r of a.detailRegions) if (want.has(r.id)) { out.poligonos.push([...r.boundary]); out.total++; }
  for (const g of a.tags) if (want.has(g.id)) { out.pontos.push(g.at); out.total++; }
  return out;
}

const porDono = new WeakMap<readonly Piece[], Map<Id, Piece[]>>();
/** Peças por dono, cacheadas pela lista (que já é cacheada por resultado): mover o mouse não reagrupa nada. */
function pecasDe(lista: readonly Piece[], dono: Id): readonly Piece[] {
  let m = porDono.get(lista);
  if (!m) {
    m = new Map();
    for (const q of lista) {
      const g = m.get(q.hostId);
      if (g) g.push(q); else m.set(q.hostId, [q]);
    }
    porDono.set(lista, m);
  }
  return m.get(dono) ?? [];
}

const aneis = (polys: MultiPolygon): Vec2[][] => polys.flatMap((poly) => poly.filter((ring) => ring.length >= 2));
const rect = (t0: number, z0: number, t1: number, z1: number): Vec2[] => [{ x: t0, y: z0 }, { x: t1, y: z0 }, { x: t1, y: z1 }, { x: t0, y: z1 }];

/**
 * Itens de prévia do deslocamento `(dt, dz)` (já restrito pela ferramenta). `u` é a direção do corte em planta: o vão solto anda ao
 * longo da PRÓPRIA parede, então só a componente do deslocamento nessa direção conta.
 */
export function fantasmaDoMover(
  p: Project,
  result: SectionResult,
  pecas: readonly Piece[],
  pecasGuardaCorpo: readonly Piece[],
  alvos: AlvosDoMover,
  u: Vec2,
  dt: number,
  dz: number,
): PreviewItem[] {
  const out: PreviewItem[] = [];
  const movidos = new Set(alvos.movidos);
  const poligono = (ring: Vec2[], x: number, y: number): void => {
    out.push({ kind: 'polygon', ring: ring.map((q) => ({ x: q.x + x, y: q.y + y })), dashed: true });
  };
  for (const id of movidos) {
    // Parede: só horizontal. Os demais levam o deslocamento inteiro (escada, rampa, laje, piso, telhado, guarda-corpo manual).
    const y = isWall(p.elements[id]) ? 0 : dz;
    for (const q of pecasDe(pecas, id)) for (const ring of aneis(q.polygons)) poligono(ring, dt, y);
  }
  // Guarda-corpo: manual na seleção, ou hospedado cujo hospedeiro anda junto.
  for (const q of pecasGuardaCorpo) {
    const e = p.elements[q.hostId];
    if (!isGuardaCorpo(e)) continue;
    const host = hospedeiroDoGuardaCorpo(e);
    if (!(host === null ? movidos.has(e.id) : movidos.has(host))) continue;
    for (const ring of aneis(q.polygons)) poligono(ring, dt, dz);
  }
  // Massa (ficha T1c): o anel de cada cópia no corte, do kernel; anda o deslocamento inteiro, como a escada e a laje (sem hospedeiro).
  for (const q of massaCortePieces(p, result)) {
    if (!movidos.has(q.hostId)) continue;
    for (const ring of aneis(q.polygons)) poligono(ring, dt, dz);
  }
  // Vãos: andam com a parede (só horizontal) ou sozinhos ao longo dela, com o peitoril na vertical.
  const soltas = new Map(alvos.aberturas.map((o) => [o.id, o] as const));
  for (const o of result.openings ?? []) {
    const el = p.elements[o.openingId];
    if (!isOpening(el)) continue;
    if (movidos.has(el.hostId)) { poligono(rect(o.t0, o.z0, o.t1, o.z1), dt, 0); continue; }
    if (!soltas.has(el.id)) continue;
    const f = frameOfWall(p, el.hostId);
    if (!f) continue;
    const alongWall = dot(u, f.u);
    poligono(rect(o.t0, o.z0, o.t1, o.z1), dt * alongWall * alongWall, dz);
  }
  // Anotações da vista: andam no plano inteiro.
  for (const [a, b] of alvos.notas.linhas) out.push({ kind: 'line', a: { x: a.x + dt, y: a.y + dz }, b: { x: b.x + dt, y: b.y + dz }, dashed: true });
  for (const ring of alvos.notas.poligonos) poligono(ring, dt, dz);
  for (const q of alvos.notas.pontos) out.push({ kind: 'point', at: { x: q.x + dt, y: q.y + dz } });
  return out;
}
