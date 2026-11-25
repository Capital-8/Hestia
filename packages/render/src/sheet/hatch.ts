import type { HatchKind } from '@hestia/model';
import { PRIM_HATCHES } from '../plan/hatchDefs.ts';
import { emptyParts, type SheetFill, type SheetPath, type SheetPoint, type ViewportParts } from './types.ts';

/**
 * Hachura de padrão de superfície na folha (B6 do roteiro de pranchas). A planta desenha a hachura com um padrão de
 * tela de 8 px; no papel o mesmo desenho sai em traços vetoriais de 0,15 mm, recortados ao polígono da superfície
 * pela regra par-ímpar (furos ficam vazios). Espaçamento em mm de papel, fixo, como o padrão de tela.
 */
/** Passo entre retas paralelas de `diagonal` e `cross` (mm de papel). */
export const HATCH_PITCH_MM = 1.5;
/** Passo da malha de pontos de `dots` (mm de papel). */
export const DOT_PITCH_MM = 2.1;
/** Lado do ponto de `dots` (mm de papel). */
const DOT_MM = 0.3;
/** Espessura dos traços de hachura (mm de papel). */
const LINE_MM = 0.15;

type Poly = SheetPoint[][];
interface Edge { ka: number; kb: number; sa: number; sb: number }
interface Chord { c: number; s0: number; s1: number }

const SQRT1_2 = Math.SQRT1_2;
const EPS = 1e-9;

/** Ponto dentro do conjunto de anéis pela regra par-ímpar (furos ficam de fora). */
function insideRings(polys: Poly[], x: number, y: number): boolean {
  let inside = false;
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        if (a.y > y !== b.y > y && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside;
      });
    }
  }
  return inside;
}

/** Arestas de todos os anéis do conjunto, projetadas sobre a normal `n` (c) e a direção `dir` (s). */
function edgesOf(polys: Poly[], dir: SheetPoint, n: SheetPoint): Edge[] {
  const out: Edge[] = [];
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        out.push({ ka: a.x * n.x + a.y * n.y, kb: b.x * n.x + b.y * n.y, sa: a.x * dir.x + a.y * dir.y, sb: b.x * dir.x + b.y * dir.y });
      });
    }
  }
  return out;
}

/**
 * Trechos de uma família de retas paralelas à direção `dir` (unitária), com passo `pitch` e origem 0, que ficam dentro
 * do conjunto de anéis. Cada trecho é a reta c (distância, ao longo de `n`) e o intervalo [s0, s1] ao longo de `dir`.
 */
function chordsOf(polys: Poly[], dir: SheetPoint, pitch: number): Chord[] {
  const n = { x: -dir.y, y: dir.x };
  const edges = edgesOf(polys, dir, n);
  if (edges.length === 0) return [];
  const cMin = Math.min(...edges.map((e) => Math.min(e.ka, e.kb)));
  const cMax = Math.max(...edges.map((e) => Math.max(e.ka, e.kb)));
  const out: Chord[] = [];
  for (let i = Math.ceil(cMin / pitch); i * pitch <= cMax; i++) {
    const c = i * pitch;
    const crossings: number[] = [];
    for (const e of edges) {
      // Meia-aberto: um vértice sobre a reta conta uma vez só.
      if ((e.ka <= c && c < e.kb) || (e.kb <= c && c < e.ka)) crossings.push(e.sa + ((c - e.ka) / (e.kb - e.ka)) * (e.sb - e.sa));
    }
    crossings.sort((p, q) => p - q);
    // Trechos de comprimento zero (reta que só toca um vértice) não são traço.
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      if (crossings[k + 1]! - crossings[k]! > EPS) out.push({ c, s0: crossings[k]!, s1: crossings[k + 1]! });
    }
  }
  return out;
}

/** Ponto da folha no sistema (c, s): c ao longo da normal (-dir.y, dir.x), s ao longo de `dir`. */
const at = (dir: SheetPoint, c: number, s: number): SheetPoint => ({ x: -c * dir.y + s * dir.x, y: c * dir.x + s * dir.y });

/** Traços de uma família de retas em `dir`, recortados ao polígono. */
function linesOf(polys: Poly[], dir: SheetPoint, color: string, pitch = HATCH_PITCH_MM, lw = LINE_MM): SheetPath[] {
  return chordsOf(polys, dir, pitch).map((ch) => ({
    pts: [at(dir, ch.c, ch.s0), at(dir, ch.c, ch.s1)],
    closed: false,
    widthMm: lw,
    color,
  }));
}

/** Traços de um tracejado em `dir`: fase 0 na origem da reta, pintado `on` e vazio `gap` (mm de papel). */
function dashedLinesOf(polys: Poly[], dir: SheetPoint, pitch: number, on: number, gap: number, color: string, lw = LINE_MM, phase = 0): SheetPath[] {
  const period = on + gap;
  const out: SheetPath[] = [];
  for (const ch of chordsOf(polys, dir, pitch)) {
    for (let k = Math.floor((ch.s0 - phase) / period); k * period + phase < ch.s1; k++) {
      const s0 = Math.max(ch.s0, k * period + phase);
      const s1 = Math.min(ch.s1, k * period + phase + on);
      if (s1 - s0 > EPS) out.push({ pts: [at(dir, ch.c, s0), at(dir, ch.c, s1)], closed: false, widthMm: lw, color });
    }
  }
  return out;
}

/** Pontos de `concrete`: malha de 1,3 × o passo, com as linhas ímpares deslocadas meio passo. */
function concreteDotsOf(polys: Poly[], color: string, dot = DOT_MM, stepK = 1.3): SheetFill[] {
  const step = stepK * HATCH_PITCH_MM;
  const h = dot / 2;
  const squares: Poly[] = [];
  const dir = { x: 1, y: 0 };
  for (const ch of chordsOf(polys, dir, step)) {
    const offset = Math.round(ch.c / step) % 2 !== 0 ? step / 2 : 0;
    for (let s = Math.ceil((ch.s0 - offset) / step) * step + offset; s <= ch.s1 + EPS; s += step) {
      if (s < ch.s0 - EPS) continue;
      const q = at(dir, ch.c, s);
      const corners = [{ x: q.x - h, y: q.y - h }, { x: q.x + h, y: q.y - h }, { x: q.x + h, y: q.y + h }, { x: q.x - h, y: q.y + h }];
      // Ponto que encosta na borda sairia pela metade: só entra o quadradinho inteiro dentro do polígono.
      if (corners.every((c) => insideRings(polys, c.x, c.y))) squares.push([corners]);
    }
  }
  return squares.length > 0 ? [{ polygons: squares, color }] : [];
}

/** Pontos de `dots`: uma malha de quadradinhos nos nós de DOT_PITCH_MM que caem dentro do conjunto. */
function dotsOf(polys: Poly[], color: string, dot = DOT_MM): SheetFill[] {
  const h = dot / 2;
  const squares: Poly[] = [];
  for (const ch of chordsOf(polys, { x: 1, y: 0 }, DOT_PITCH_MM)) {
    for (let s = Math.ceil(ch.s0 / DOT_PITCH_MM) * DOT_PITCH_MM; s <= ch.s1; s += DOT_PITCH_MM) {
      const q = at({ x: 1, y: 0 }, ch.c, s);
      const corners = [{ x: q.x - h, y: q.y - h }, { x: q.x + h, y: q.y - h }, { x: q.x + h, y: q.y + h }, { x: q.x - h, y: q.y + h }];
      // Ponto que encosta na borda sairia pela metade: só entra o quadradinho inteiro dentro do polígono.
      if (corners.every((c) => insideRings(polys, c.x, c.y))) squares.push([corners]);
    }
  }
  return squares.length > 0 ? [{ polygons: squares, color }] : [];
}

/**
 * Partes de hachura de um polígono (já em mm de papel) para o padrão `kind`, na cor `color` (já misturada ao papel).
 * `solid` cobre o polígono com a cor da hachura; `none` não desenha nada.
 */
export function hatchPartsOf(polys: Poly[], kind: HatchKind, color: string, papel?: { lineMm: number; dotMm: number }): ViewportParts {
  const parts = emptyParts();
  // Estilo de prancha: a espessura da linha e do ponto vem do papel na escala da vista; sem ele, as de sempre.
  const lw = papel?.lineMm ?? LINE_MM;
  const dot = papel?.dotMm ?? DOT_MM;
  if (kind === 'none') return parts;
  if (kind === 'solid') parts.fills.push({ polygons: polys, color });
  if (kind === 'dots') parts.fills.push(...dotsOf(polys, color, dot));
  if (kind === 'diagonal' || kind === 'cross') parts.paths.push(...linesOf(polys, { x: SQRT1_2, y: SQRT1_2 }, color, HATCH_PITCH_MM, lw));
  if (kind === 'cross') parts.paths.push(...linesOf(polys, { x: SQRT1_2, y: -SQRT1_2 }, color, HATCH_PITCH_MM, lw));
  if (kind === 'brick') {
    // Alvenaria: família principal a 45° no passo base e a cruzada a −45° três vezes mais espaçada.
    parts.paths.push(...linesOf(polys, { x: SQRT1_2, y: SQRT1_2 }, color, HATCH_PITCH_MM, lw));
    parts.paths.push(...linesOf(polys, { x: SQRT1_2, y: -SQRT1_2 }, color, 3 * HATCH_PITCH_MM, lw));
  }
  if (kind === 'concrete') {
    // Concreto: poucas retas a 45° e a malha de pontos deslocada meio passo nas linhas ímpares.
    parts.paths.push(...linesOf(polys, { x: SQRT1_2, y: SQRT1_2 }, color, 3 * HATCH_PITCH_MM, lw));
    parts.fills.push(...concreteDotsOf(polys, color, dot));
  }
  if (kind === 'timber') parts.paths.push(...linesOf(polys, { x: 1, y: 0 }, color, 0.8 * HATCH_PITCH_MM, lw));
  if (kind === 'insulation') {
    // Isolante: tracejado a 45° no passo base; pintado 1,5p, vazio 0,75p.
    parts.paths.push(...dashedLinesOf(polys, { x: SQRT1_2, y: SQRT1_2 }, HATCH_PITCH_MM, 1.5 * HATCH_PITCH_MM, 0.75 * HATCH_PITCH_MM, color, lw));
  }
  const prims = PRIM_HATCHES[kind];
  if (prims) {
    for (const pr of prims) {
      if (pr.t === 'dots') {
        parts.fills.push(...concreteDotsOf(polys, color, dot, pr.pitch));
        continue;
      }
      const a = (pr.ang * Math.PI) / 180;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      if (pr.on === undefined || pr.off === undefined) parts.paths.push(...linesOf(polys, dir, color, pr.pitch * HATCH_PITCH_MM, lw));
      else parts.paths.push(...dashedLinesOf(polys, dir, pr.pitch * HATCH_PITCH_MM, pr.on * HATCH_PITCH_MM, pr.off * HATCH_PITCH_MM, color, lw, (pr.phase ?? 0) * HATCH_PITCH_MM));
    }
  }
  if (kind === 'earth') {
    // Terra: tracejado a −45° com passo 2p; pintado p, vazio p.
    parts.paths.push(...dashedLinesOf(polys, { x: SQRT1_2, y: -SQRT1_2 }, 2 * HATCH_PITCH_MM, HATCH_PITCH_MM, HATCH_PITCH_MM, color, lw));
  }
  return parts;
}
