/**
 * Vistas de um vão com contorno (`OpeningShape`): elevação, corte horizontal (hachura e planta), corte vertical e o
 * símbolo em planta. Funções puras, sem interface.
 *
 * Convenções: `along` é a posição do centro do vão ao longo da parede (m); `sill` é a cota da soleira (m); as cotas de
 * corte são absolutas (m). O contorno de `outline` é relativo ao vão (base em z = 0), então as funções que leem a cota
 * subtraem a soleira. Os cortes leem o próprio anel de `outline`: a elevação, a hachura e o perfil usam a mesma curva.
 */
import { dot, sub, type Vec2, type OpeningSymbolInput, type OpeningSymbolStroke, openingSymbolPaths } from '@hestia/geom';
import { outline, type OpeningShape, type OPt } from '@hestia/model/src/openingShape.ts';

/** Posição do vão na parede: `along` = centro ao longo da parede (m); `sill` = cota da soleira (m). */
export interface OpeningPlace {
  along: number;
  sill: number;
}

const EPS = 1e-9;
const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

/** Arestas do anel fechado (o último ponto volta ao primeiro). */
function edges(ring: readonly OPt[]): [OPt, OPt][] {
  return ring.map((p, i): [OPt, OPt] => [p, ring[(i + 1) % ring.length]!]);
}

/**
 * Cruzamentos do anel com a reta `eixo = v`. `eixo` 0 corta em x = v e devolve as cotas z; `eixo` 1 corta em z = v e
 * devolve as coordenadas x. Aresta contida na reta entra pelas duas pontas; o vértice compartilhado entra duas vezes.
 */
function crossings(ring: readonly OPt[], eixo: 0 | 1, v: number): number[] {
  const o = eixo === 0 ? 1 : 0;
  const out: number[] = [];
  for (const [p, q] of edges(ring)) {
    const a = p[eixo];
    const b = q[eixo];
    if (v < Math.min(a, b) - EPS || v > Math.max(a, b) + EPS) continue;
    if (Math.abs(b - a) < EPS) {
      out.push(p[o], q[o]);
      continue;
    }
    out.push(p[o] + ((v - a) / (b - a)) * (q[o] - p[o]));
  }
  return out;
}

/** Contorno do vão na parede, em coordenadas da parede: x = posição ao longo da parede, z = cota absoluta. */
export function elevationOutline(shape: OpeningShape, place: OpeningPlace, tol?: number): OPt[] {
  return outline(shape, tol).map(([x, z]): OPt => [x + place.along, z + place.sill]);
}

/**
 * Meia-largura do vão na cota absoluta `cutZ`: é o que abre a hachura da parede e o caixilho em planta naquela cota.
 * Zero quando a cota fica fora do vão ou só toca o vão num ponto (o topo de um arco, o vértice de base de uma elipse).
 */
export function cutHalfWidth(shape: OpeningShape, place: OpeningPlace, cutZ: number, tol?: number): number {
  const xs = crossings(outline(shape, tol), 1, cutZ - place.sill);
  if (xs.length === 0) return 0;
  return (Math.max(...xs) - Math.min(...xs)) / 2;
}

/**
 * Perfil do vão no plano de corte vertical, perpendicular à parede na posição `cutAlong` (m, ao longo da parede).
 * Devolve os intervalos [cota de baixo, cota de cima] em que há vão, em cota absoluta. Retângulo e arco: um intervalo
 * da soleira até a curva. Elipse: um intervalo entre as duas bordas. Vazio quando o plano cai fora do vão.
 */
export function verticalCutProfile(shape: OpeningShape, place: OpeningPlace, cutAlong: number, tol?: number): [number, number][] {
  const zs = crossings(outline(shape, tol), 0, cutAlong - place.along).sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const z of zs) if (uniq.length === 0 || z - uniq[uniq.length - 1]! > EPS) uniq.push(z);
  const out: [number, number][] = [];
  // Número ímpar de cruzamentos só acontece num toque tangente (a borda de uma elipse): não há intervalo a abrir.
  for (let i = 0; i + 1 < uniq.length; i += 2) out.push([uniq[i]! + place.sill, uniq[i + 1]! + place.sill]);
  return out;
}

/**
 * Símbolo de planta do vão no corte horizontal `cutZ`. É o `openingSymbolPaths` com os traços de caixilho (faces, meio
 * do caixilho, verga do vão livre e ombreiras) na meia-largura real da cota. Folhas e arcos de abertura não mudam: ficam
 * pela largura `w`. Com forma retangular, devolve o símbolo atual sem alteração. Com a cota fora do vão, os traços de
 * caixilho saem (o chamador não deve desenhar o vão nessa cota).
 *
 * `input.width` tem que ser a largura de `shape`. `input.u` e `input.n` são unitários.
 */
export function openingPlanSymbolPaths(
  input: OpeningSymbolInput,
  shape: OpeningShape,
  place: OpeningPlace,
  cutZ: number,
  tol?: number,
): OpeningSymbolStroke[] {
  const base = openingSymbolPaths(input);
  if (shape.kind === 'rect') return base;
  if (Math.abs(input.width - shape.width) > EPS) throw new Error('largura do símbolo difere da largura da forma do vão');
  const hw = input.width / 2;
  const hc = cutHalfWidth(shape, place, cutZ, tol);
  const sMid = (input.sHi + input.sLo) / 2;
  const { center: c, u, n } = input;
  const tOf = (p: Vec2): number => dot(sub(p, c), u);
  const sOf = (p: Vec2): number => dot(sub(p, c), n) + sMid;
  const isFrame = (s: OpeningSymbolStroke): boolean => {
    if (s.tone !== 'ink' || s.pts.length !== 2) return false;
    const [p, q] = s.pts as [Vec2, Vec2];
    const tp = tOf(p);
    const tq = tOf(q);
    const sp = sOf(p);
    const sq = sOf(q);
    // Faces e meio do caixilho, verga do vão livre: traço horizontal de uma ombreira à outra.
    if (near(sp, sq) && near(Math.abs(tp), hw) && near(tp, -tq)) return true;
    // Ombreira: traço perpendicular à parede, na borda do vão, de uma face à outra. Folha de porta não cumpre isso.
    const faces = (near(sp, input.sHi) && near(sq, input.sLo)) || (near(sp, input.sLo) && near(sq, input.sHi));
    return near(tp, tq) && near(Math.abs(tp), hw) && faces;
  };
  return base.flatMap((s): OpeningSymbolStroke[] => {
    if (!isFrame(s)) return [s];
    if (hc <= 0) return [];
    const pts = s.pts.map((p): Vec2 => {
      const t = tOf(p);
      const dt = Math.sign(t) * hc - t;
      return { x: p.x + u.x * dt, y: p.y + u.y * dt };
    });
    return [{ ...s, pts }];
  });
}
