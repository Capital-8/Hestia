import { dist, type SketchDraft, type SketchSeg } from '@hestia/geom';
import { withGeom, type Geom } from './perimeterModifyCurve.ts';

/** Linha pelo id, ou undefined. */
export function findSeg(d: SketchDraft, id: string): SketchSeg | undefined {
  return d.segs.find((s) => s.id === id);
}

/** Id `sN` livre no rascunho, registrado em `taken`. Mesmo critério de `addSegs`. */
export function freshId(taken: Set<string>): string {
  let k = 1;
  while (taken.has(`s${k}`)) k++;
  const id = `s${k}`;
  taken.add(id);
  return id;
}

/** Troca as linhas com o mesmo id pelas novas (ordem e demais linhas preservadas). Seleção intacta. */
export function replaceById(d: SketchDraft, next: Map<string, SketchSeg>): SketchDraft {
  return { ...d, segs: d.segs.map((s) => next.get(s.id) ?? s) };
}

/**
 * Troca uma linha por uma ou mais partes, na mesma posição. A primeira parte fica com o id original; as demais ganham
 * ids novos. Todas herdam os flags de telhado da linha original. Null se o id não existe.
 */
export function spliceSeg(d: SketchDraft, id: string, parts: Geom[]): SketchDraft | null {
  const at = d.segs.findIndex((s) => s.id === id);
  if (at < 0 || parts.length === 0) return null;
  const seg = d.segs[at]!;
  const taken = new Set(d.segs.map((s) => s.id));
  const made = parts.map((g, i): SketchSeg => {
    const next = withGeom(seg, g);
    return i === 0 ? next : { ...next, id: freshId(taken) };
  });
  return { ...d, segs: [...d.segs.slice(0, at), ...made, ...d.segs.slice(at + 1)] };
}

/** Linha reta mais curta que isto (m) é um degrau de união, não um lado do desenho. */
export const MICRO_SEG = 0.01;
/** As pontas da micro e as das vizinhas são o mesmo ponto gravado: coincidem a menos disto (m). */
const WELD_EPS = 1e-6;

/**
 * Solda as linhas retas micro (menos de 1 cm) que ligam duas outras: some a micro e as duas pontas vizinhas vão para o ponto médio dela.
 * A união de paredes quase alinhadas deixa degraus de 2 mm; aparar ou refazer uma linha ao lado deles deixava uma ponta a 2 mm do vértice
 * (acima de `SKETCH_TOL`), que a validação lê como laço aberto e linha que se cruza. Linha micro sem vizinha nas duas pontas fica como está.
 */
export function weldMicroSegs(d: SketchDraft, micro = MICRO_SEG): SketchDraft {
  let segs = d.segs;
  let changed = false;
  for (let guard = 0; guard < 64; guard++) {
    const m = segs.find((s) => !s.sag && dist(s.a, s.b) < micro);
    if (!m) break;
    const touching = (p: { x: number; y: number }): number => segs.filter((s) => s !== m && (dist(s.a, p) <= WELD_EPS || dist(s.b, p) <= WELD_EPS)).length;
    if (touching(m.a) !== 1 || touching(m.b) !== 1) break;
    const mid = { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 };
    const near = (p: { x: number; y: number }): boolean => dist(p, m.a) <= WELD_EPS || dist(p, m.b) <= WELD_EPS;
    segs = segs.filter((s) => s !== m).map((s) => ({ ...s, a: near(s.a) ? mid : s.a, b: near(s.b) ? mid : s.b }));
    changed = true;
  }
  if (!changed) return d;
  const alive = new Set(segs.map((s) => s.id));
  return { ...d, segs, selected: d.selected.filter((id) => alive.has(id)) };
}
