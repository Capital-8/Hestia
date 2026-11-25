import type { Polygon, Vec2 } from '@hestia/geom';
import type { HatchKind } from '@hestia/model';
import { PRIM_HATCHES, type HatchPrim } from './hatchDefs.ts';
import type { HachuraPapel } from './types.ts';

/** Espaçamento entre linhas paralelas da hachura, em metros (o mesmo passo do padrão anterior de 16 px por 0,2 m). */
export const HATCH_SPACING = 0.05;
/** Espessura das linhas de hachura, em pixels de tela: não engrossa nem afina com o zoom. */
export const HATCH_PX = 1;
/** Espessura e comprimento do ponto do padrão `dots`. */
export const DOT_PX = 2;
export const DOT_LEN = 0.0125;

/** Segmento de hachura em metros. `dot` marca um ponto (traço curto de `DOT_PX`) em vez de uma linha de `HATCH_PX`. */
export interface HatchSegment {
  a: Vec2;
  b: Vec2;
  dot?: boolean;
}

const cache = new WeakMap<Polygon, Map<string, HatchSegment[]>>();

/**
 * Hachura vetorial de um contorno: segmentos recortados à região (regra par-ímpar, então furos ficam vazios), em metros.
 * `solid` não tem linhas: é só a cor de preenchimento, desenhada pelo chamador. Resultado por contorno fica em cache, com
 * a mesma identidade que o triangulado de `gpuPlan` usa. `spacing` é o passo base em metros (padrão `HATCH_SPACING`); o
 * estilo de prancha o calcula em mm de papel pela escala da vista, e o comprimento do ponto acompanha (um quarto do passo).
 */
export function hatchSegments(poly: Polygon, kind: HatchKind, spacing: number = HATCH_SPACING): HatchSegment[] {
  if (kind === 'none' || kind === 'solid') return [];
  let byKind = cache.get(poly);
  if (!byKind) {
    byKind = new Map();
    cache.set(poly, byKind);
  }
  const key = `${kind}@${spacing}`;
  let out = byKind.get(key);
  if (!out) {
    out = build(poly, kind, spacing);
    byKind.set(key, out);
  }
  return out;
}

function build(poly: Polygon, kind: HatchKind, spacing: number): HatchSegment[] {
  const P = spacing;
  const dotLen = P / 4;
  const gessoOn = (10 / 16) * P;
  const out: HatchSegment[] = [];
  const line = (a: Vec2, b: Vec2): void => {
    out.push({ a, b });
  };
  if (kind === 'diagonal') scanLines(poly, Math.PI / 4, P, line);
  if (kind === 'cross') {
    scanLines(poly, Math.PI / 4, P, line);
    scanLines(poly, -Math.PI / 4, P, line);
  }
  if (kind === 'gesso') {
    scanLines(poly, 0, P, (a, b, _d, u0, u1) => {
      // Trechos pintados a cada passo: a linha horizontal é cortada em traços de gessoOn.
      for (let k = Math.floor(u0 / P); k * P < u1; k++) {
        const s = Math.max(u0, k * P);
        const e = Math.min(u1, k * P + gessoOn);
        if (e - s > 1e-9) line(pointAt(a, b, s, u0, u1), pointAt(a, b, e, u0, u1));
      }
    });
  }
  if (kind === 'dots') {
    scanLines(poly, 0, P, (a, b, _d, u0, u1) => {
      // Um ponto por passo, no meio do passo: a grade é a mesma das linhas, deslocada meio passo.
      for (let k = Math.floor(u0 / P); k * P < u1; k++) {
        const s = k * P + P / 2;
        if (s < u0 || s + dotLen > u1) continue;
        out.push({ a: pointAt(a, b, s, u0, u1), b: pointAt(a, b, s + dotLen, u0, u1), dot: true });
      }
    });
  }
  if (kind === 'brick') {
    // Alvenaria: família principal a 45° no passo base e a família cruzada a −45° três vezes mais espaçada.
    scanLines(poly, Math.PI / 4, P, line);
    scanLines(poly, -Math.PI / 4, 3 * P, line);
  }
  if (kind === 'concrete') {
    // Concreto: poucas retas a 45° e uma malha de pontos com linhas alternadas deslocadas meio passo.
    scanLines(poly, Math.PI / 4, 3 * P, line);
    const step = 1.3 * P;
    scanLines(poly, 0, step, (a, b, _d, u0, u1) => {
      const offset = Math.round(a.y / step) % 2 !== 0 ? step / 2 : 0;
      for (let s = Math.ceil((u0 - offset) / step) * step + offset; s + dotLen <= u1 + 1e-9; s += step) {
        if (s < u0 - 1e-9) continue;
        out.push({ a: pointAt(a, b, s, u0, u1), b: pointAt(a, b, s + dotLen, u0, u1), dot: true });
      }
    });
  }
  if (kind === 'timber') scanLines(poly, 0, 0.8 * P, line);
  if (kind === 'insulation') {
    // Isolante: tracejado a 45° no passo base; pintado 1,5p, vazio 0,75p, fase 0 na origem da reta.
    scanLines(poly, Math.PI / 4, P, (a, b, _d, u0, u1) =>
      dashed(a, b, u0, u1, 1.5 * P, 0.75 * P, line),
    );
  }
  if (kind === 'earth') {
    // Terra: tracejado a −45° com passo 2p; pintado p, vazio p, fase 0 na origem da reta.
    scanLines(poly, -Math.PI / 4, 2 * P, (a, b, _d, u0, u1) =>
      dashed(a, b, u0, u1, P, P, line),
    );
  }
  const prims = PRIM_HATCHES[kind];
  if (prims) for (const pr of prims) primSegments(poly, pr, P, dotLen, out);
  return out;
}

/** Segmentos de uma primitiva de `hatchDefs.ts` num contorno, com o passo base `P` e o ponto de `dotLen`. */
function primSegments(poly: Polygon, pr: HatchPrim, P: number, dotLen: number, out: HatchSegment[]): void {
  if (pr.t === 'line') {
    const dashedLine = pr.on !== undefined && pr.off !== undefined;
    scanLines(poly, (pr.ang * Math.PI) / 180, pr.pitch * P, (a, b, _d, u0, u1) => {
      if (!dashedLine) out.push({ a, b });
      else dashed(a, b, u0, u1, pr.on! * P, pr.off! * P, (p, q) => out.push({ a: p, b: q }), (pr.phase ?? 0) * P);
    });
    return;
  }
  const step = pr.pitch * P;
  scanLines(poly, 0, step, (a, b, _d, u0, u1) => {
    const offset = Math.round(a.y / step) % 2 !== 0 ? step / 2 : 0;
    for (let s = Math.ceil((u0 - offset) / step) * step + offset; s + dotLen <= u1 + 1e-9; s += step) {
      if (s < u0 - 1e-9) continue;
      out.push({ a: pointAt(a, b, s, u0, u1), b: pointAt(a, b, s + dotLen, u0, u1), dot: true });
    }
  });
}

type Emit = (a: Vec2, b: Vec2, d: Vec2, u0: number, u1: number) => void;

/**
 * Linhas paralelas à direção `ang`, espaçadas em `spacing` (perpendicular). Para cada linha, as interseções com as arestas
 * de todos os anéis são ordenadas ao longo da direção e pareadas: o trecho entre a 1ª e a 2ª fica dentro, o seguinte fora.
 * Vértices exatamente sobre a linha contam pelo lado de baixo (regra de meia-aberta), para não duplicar nem perder cruzamentos.
 */
function scanLines(poly: Polygon, ang: number, spacing: number, emit: Emit): void {
  const d = { x: Math.cos(ang), y: Math.sin(ang) };
  const n = { x: -d.y, y: d.x };
  let lo = Infinity;
  let hi = -Infinity;
  for (const ring of poly) {
    for (const p of ring) {
      const s = p.x * n.x + p.y * n.y;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
  }
  if (!Number.isFinite(lo)) return;
  for (let k = Math.ceil(lo / spacing); k * spacing <= hi; k++) {
    const c = k * spacing;
    const us: number[] = [];
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        const s0 = p.x * n.x + p.y * n.y - c;
        const s1 = q.x * n.x + q.y * n.y - c;
        if ((s0 > 0) === (s1 > 0)) continue;
        const t = s0 / (s0 - s1);
        const x = p.x + (q.x - p.x) * t;
        const y = p.y + (q.y - p.y) * t;
        us.push(x * d.x + y * d.y);
      }
    }
    us.sort((x, y) => x - y);
    for (let j = 0; j + 1 < us.length; j += 2) {
      const u0 = us[j]!;
      const u1 = us[j + 1]!;
      if (u1 - u0 < 1e-9) continue;
      const a = { x: n.x * c + d.x * u0, y: n.y * c + d.y * u0 };
      const b = { x: n.x * c + d.x * u1, y: n.y * c + d.y * u1 };
      emit(a, b, d, u0, u1);
    }
  }
}

/** Ponto na linha `a`→`b` (extremos de `u0`..`u1`) no parâmetro `u`, em metros. */
function pointAt(a: Vec2, b: Vec2, u: number, u0: number, u1: number): Vec2 {
  const t = (u - u0) / (u1 - u0);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Trechos pintados de um tracejado com fase 0 na origem da reta (parâmetro `u`), recortados a `[u0, u1]`. */
function dashed(a: Vec2, b: Vec2, u0: number, u1: number, on: number, gap: number, emit: (a: Vec2, b: Vec2) => void, phase = 0): void {
  const period = on + gap;
  for (let k = Math.floor((u0 - phase) / period); k * period + phase < u1; k++) {
    const s = Math.max(u0, k * period + phase);
    const e = Math.min(u1, k * period + phase + on);
    if (e - s > 1e-9) emit(pointAt(a, b, s, u0, u1), pointAt(a, b, e, u0, u1));
  }
}

/** Passo base da hachura em prancha, em mm de papel (o mesmo da folha: `HATCH_PITCH_MM`). */
export const PRANCHA_PITCH_MM = 1.5;
/** Espessura do ponto em prancha, em mm de papel (a mesma da folha). */
export const PRANCHA_DOT_MM = 0.3;

/** Hachura de prancha na escala 1:`escala`: linha de 0,13 mm até 1:75 e de 0,09 mm nas escalas menores. */
export function hachuraDePrancha(escala: number): HachuraPapel {
  return { pitchMm: PRANCHA_PITCH_MM, lineMm: escala <= 75 ? 0.13 : 0.09, dotMm: PRANCHA_DOT_MM, escala };
}

/** Teto da linha de hachura de prancha com "Linhas finas (tela)" ligada, em pixels: um fio. */
export const FINA_LINHA_PX = 1;
/** Teto do ponto de hachura de prancha com "Linhas finas (tela)" ligada, em pixels. */
export const FINA_PONTO_PX = 1.5;
/** Piso da linha e do ponto de hachura de prancha, em pixels (abaixo disso a cobertura parcial os deixa como um fio claro). */
export const PISO_LINHA_PX = 0.5;
export const PISO_PONTO_PX = 0.6;

/**
 * Medidas da hachura em coordenadas do mundo (metros) e em pixels para o `zoom` (px/m); sem `papel`, as de sempre. Em
 * prancha o passo e a espessura vêm do papel na escala da vista (a hachura acompanha o desenho e engrossa com o zoom, como
 * os contornos). Com `fina` ("Linhas finas (tela)"), a espessura fica limitada a um fio, como já acontece com os contornos.
 */
export function medidasDaHachura(papel: HachuraPapel | undefined, zoom: number, fina = false): { espaco: number; linhaPx: number; pontoPx: number } {
  if (!papel) return { espaco: HATCH_SPACING, linhaPx: HATCH_PX, pontoPx: DOT_PX };
  const k = papel.escala / 1000;
  const linhaPx = Math.max(PISO_LINHA_PX, papel.lineMm * k * zoom);
  const pontoPx = Math.max(PISO_PONTO_PX, papel.dotMm * k * zoom);
  return { espaco: papel.pitchMm * k, linhaPx: fina ? Math.min(FINA_LINHA_PX, linhaPx) : linhaPx, pontoPx: fina ? Math.min(FINA_PONTO_PX, pontoPx) : pontoPx };
}
