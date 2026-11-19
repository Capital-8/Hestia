/**
 * Vão com contorno (`OpeningShape`) nas vistas 2D: o furo da parede no corte (faixas e hachura), o vão do corte e da elevação
 * com o perfil real, o furo da face na elevação e o símbolo de planta em DXF. Só age sobre os vãos que vão por contorno
 * (`ResolvedWall.furosContorno`); vão retangular ou sem cliente não passa por aqui e sai como antes.
 *
 * Duas direções de corte (docs/estudo-esquadrias/29): o plano PERPENDICULAR à parede (corte transversal: o perfil é
 * `verticalCutProfile` na posição da linha) e o plano PARALELO à parede (elevação: o contorno inteiro, `elevationOutline`).
 * Plano oblíquo fica de fora: o vão sai como antes (retângulo, sem furo de contorno).
 */
import type { MultiPolygon, OpeningSymbolStroke, Ring, Vec2 } from '@hestia/geom';
import { outlineSegments, type Id, type OpeningSegment } from '@hestia/model';
import { fuseBands } from './bandFuse.ts';
import type { FuroContornoDaParede, LayerBand, OpeningGeometry } from './types.ts';
import { bandasRetangulares } from './furoContornoParede.ts';
import { elevationOutline, openingPlanSymbolPaths, verticalCutProfile } from './openingShapeViews.ts';

const EPS = 1e-9;
/** Tolerância de paralelismo/perpendicularidade entre a linha de corte e o eixo do vão (cosseno). */
const COS_TOL = 1e-6;

/** Segmento do corte ou da elevação, em (t, z) da vista; `bulge` como em `OpeningSegment` (já com o sentido da vista). */
export interface SecaoSegmento {
  a: Vec2;
  b: Vec2;
  bulge: number;
}

/** Vão com contorno visto no corte ou na elevação: polígonos visíveis e os mesmos anéis em segmentos (para o DXF). */
export interface ContornoDoVaoSecao {
  polygons: MultiPolygon;
  aneis: SecaoSegmento[][];
}

/** Linha de corte: origem `a` e direção unitária `d` (a de `sectionFrame`). */
export interface LinhaDeCorte {
  a: Vec2;
  d: Vec2;
}

/** Vão de contorno da parede, com a cota absoluta da soleira (`rw.baseZ + g.sill`). */
export interface VaoDeContorno {
  g: OpeningGeometry & { forma: NonNullable<OpeningGeometry['forma']> };
  sillAbs: number;
}

/** Vãos de contorno de uma parede resolvida (vazio quando nenhum vão vai por contorno: o caso de sempre). */
export function vaosDeContornoDaParede(rw: { baseZ: number; furosContorno?: FuroContornoDaParede[] }): VaoDeContorno[] {
  return (rw.furosContorno ?? []).flatMap((f): VaoDeContorno[] => (f.g.forma ? [{ g: { ...f.g, forma: f.g.forma }, sillAbs: rw.baseZ + f.g.sill }] : []));
}

/** Direção do corte em relação ao eixo do vão: 'corte' (perpendicular), 'elevacao' (paralelo) ou `null` (oblíquo, fora). */
function modoDoVao(g: OpeningGeometry, d: Vec2): 'corte' | 'elevacao' | null {
  const c = Math.abs(d.x * g.u.x + d.y * g.u.y);
  if (c < COS_TOL) return 'corte';
  if (c > 1 - COS_TOL) return 'elevacao';
  return null;
}

/**
 * Vãos de parede CURVA que o corte/elevação não atende por contorno (linha oblíqua ao eixo do vão no centro, docs/estudo-esquadrias/33
 * §4): a vista os fura com o retângulo de sempre (`bandasRetangulares`), para a parede curva não aparecer maciça no vão.
 */
export const vaosCurvosSemContornoNaVista = (vaos: readonly VaoDeContorno[], linha: LinhaDeCorte): OpeningGeometry[] =>
  vaos.filter((v) => v.g.curve && modoDoVao(v.g, linha.d) === null).map((v) => v.g);

/** As faixas de uma camada para a vista: com o furo retangular nos vãos curvos que a linha não atende por contorno (senão, as mesmas). */
export function faixasNaVista(faixas: LayerBand[], vaos: readonly VaoDeContorno[], linha: LinhaDeCorte): LayerBand[] {
  const curvos = vaosCurvosSemContornoNaVista(vaos, linha);
  return curvos.length > 0 ? fuseBands(bandasRetangulares(faixas, curvos)) : faixas;
}

/** Posição do corte no eixo do vão (m, a partir do centro): é o `along` do perfil. */
const cortePelaLinha = (g: OpeningGeometry, linha: LinhaDeCorte): number => (linha.a.x - g.center.x) * g.u.x + (linha.a.y - g.center.y) * g.u.y;

/** Contorno do vão na vista da elevação: `t = t_centro + sinal(d·u)·x`, `z = soleira + z`. */
/** Pontos tesselados do contorno na elevação (preenchimento e furo da face): `t = t_centro + sinal(d·u)·x`, `z = soleira + z`. */
function pontosDaElevacao(v: VaoDeContorno, linha: LinhaDeCorte): Vec2[] {
  const sgn = v.g.u.x * linha.d.x + v.g.u.y * linha.d.y >= 0 ? 1 : -1;
  const tc = (v.g.center.x - linha.a.x) * linha.d.x + (v.g.center.y - linha.a.y) * linha.d.y;
  return elevationOutline(v.g.forma, { along: 0, sill: v.sillAbs }).map(([x, z]): Vec2 => ({ x: tc + sgn * x, y: z }));
}

/** Segmentos do contorno na elevação (com `bulge`, para o DXF): mesma transformação de `pontosDaElevacao`. */
function segmentosDaElevacao(v: VaoDeContorno, linha: LinhaDeCorte): SecaoSegmento[] {
  const sgn = v.g.u.x * linha.d.x + v.g.u.y * linha.d.y >= 0 ? 1 : -1;
  const tc = (v.g.center.x - linha.a.x) * linha.d.x + (v.g.center.y - linha.a.y) * linha.d.y;
  const map = (p: readonly [number, number]): Vec2 => ({ x: tc + sgn * p[0], y: v.sillAbs + p[1] });
  return outlineSegments(v.g.forma).map((s: OpeningSegment): SecaoSegmento => ({ a: map(s.a), b: map(s.b), bulge: sgn < 0 ? -s.bulge : s.bulge }));
}

/** Retângulo (t0..t1 x z0..z1) no formato de `rect` de sectionGeom. */
function rectRing(t0: number, t1: number, z0: number, z1: number): Ring {
  return [
    { x: t0, y: z0 },
    { x: t1, y: z0 },
    { x: t1, y: z1 },
    { x: t0, y: z1 },
  ];
}

/** Intervalos de z (cota absoluta) em que o plano de corte perpendicular atravessa cada vão de contorno. */
export function vaziosDoCorte(vaos: readonly VaoDeContorno[], linha: LinhaDeCorte): [number, number][] {
  return vaos.flatMap(({ g, sillAbs }): [number, number][] => (modoDoVao(g, linha.d) === 'corte' ? verticalCutProfile(g.forma, { along: 0, sill: sillAbs }, cortePelaLinha(g, linha)) : []));
}

/** Subtrai intervalos de z de uma faixa [z0, z1]: os pedaços que sobram (sem os de largura nula). */
export function faixasSemVazio(z0: number, z1: number, vazios: readonly [number, number][]): [number, number][] {
  let cur: [number, number][] = [[z0, z1]];
  for (const [a, b] of vazios) {
    cur = cur.flatMap(([p, q]): [number, number][] => {
      if (b <= p || a >= q) return [[p, q]];
      const out: [number, number][] = [];
      if (a > p) out.push([p, a]);
      if (b < q) out.push([b, q]);
      return out;
    });
  }
  return cur.filter(([p, q]) => q - p > EPS);
}

/**
 * Furo do vão na face da parede vista além do plano (`beyond`), no intervalo de `t` do item: o perfil (corte) como retângulos
 * até as bordas do item, ou o contorno inteiro (elevação). Vazio quando a parede não tem vão de contorno nessa direção.
 */
export function vazioDoVaoNaVista(vaos: readonly VaoDeContorno[], linha: LinhaDeCorte, tMin: number, tMax: number): MultiPolygon {
  const out: MultiPolygon = [];
  for (const v of vaos) {
    const modo = modoDoVao(v.g, linha.d);
    if (modo === 'corte') {
      for (const [a, b] of verticalCutProfile(v.g.forma, { along: 0, sill: v.sillAbs }, cortePelaLinha(v.g, linha))) {
        out.push([rectRing(tMin - 1e-3, tMax + 1e-3, a, b)]);
      }
    } else if (modo === 'elevacao') {
      out.push([pontosDaElevacao(v, linha)]);
    }
  }
  return out;
}

/**
 * Vão de contorno no corte ou na elevação: os polígonos visíveis e os anéis em segmentos. No corte perpendicular, um retângulo
 * por intervalo do perfil (largura `t0..t1`, a espessura do vão). Na elevação, o contorno inteiro. `null` quando o vão não é de
 * contorno nessa direção (oblíquo): o chamador usa o retângulo de sempre.
 */
export function contornoDoVaoNaSecao(v: VaoDeContorno, linha: LinhaDeCorte, t0: number, t1: number): ContornoDoVaoSecao | null {
  const modo = modoDoVao(v.g, linha.d);
  if (modo === 'corte') {
    const perfil = verticalCutProfile(v.g.forma, { along: 0, sill: v.sillAbs }, cortePelaLinha(v.g, linha));
    return {
      polygons: perfil.map(([a, b]): Ring[] => [rectRing(t0, t1, a, b)]),
      aneis: perfil.map(([a, b]): SecaoSegmento[] => {
        const p: Vec2[] = [
          { x: t0, y: a },
          { x: t1, y: a },
          { x: t1, y: b },
          { x: t0, y: b },
        ];
        return p.map((q, i): SecaoSegmento => ({ a: q, b: p[(i + 1) % p.length]!, bulge: 0 }));
      }),
    };
  }
  if (modo === 'elevacao') {
    return { polygons: [[pontosDaElevacao(v, linha)]], aneis: [segmentosDaElevacao(v, linha)] };
  }
  return null;
}

/** Contorno do vão `openingId` no corte ou na elevação, se a parede o tem de contorno; `null` (retângulo, oblíquo) senão. */
export function contornoDoOpeningNaSecao(vaos: readonly VaoDeContorno[], openingId: Id, linha: LinhaDeCorte, t0: number, t1: number): ContornoDoVaoSecao | null {
  const v = vaos.find((x) => x.g.openingId === openingId);
  return v ? contornoDoVaoNaSecao(v, linha, t0, t1) : null;
}

/**
 * Símbolo de planta do vão com contorno, folha zero: o `openingPlanSymbolPaths` com os traços de caixilho na meia-largura real
 * da cota `cutAbs` (cota absoluta). `null` sem forma ou com folha (o símbolo do modelo segue, fase 3).
 */
export function simboloPlantaDoContorno(g: OpeningGeometry, baseZ: number, cutAbs: number): OpeningSymbolStroke[] | null {
  if (!g.forma || g.leaves !== 0) return null;
  return openingPlanSymbolPaths(
    { kind: g.kind, center: g.center, u: g.u, n: g.n, width: g.forma.width, thickness: g.thickness, sHi: g.sHi, sLo: g.sLo, leaves: g.leaves, plan: g.plan, flipHand: g.flipHand, flipFacing: g.flipFacing },
    g.forma,
    { along: g.offset, sill: baseZ + g.sill },
    cutAbs,
  );
}

/** Identificadores dos vãos que vão por contorno nesta parede. */
export function idsDeContorno(rw: { furosContorno?: FuroContornoDaParede[] }): Set<Id> {
  return new Set((rw.furosContorno ?? []).map((f) => f.g.openingId));
}
