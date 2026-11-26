import { ringArea, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { corpoNaPlanta, type CorpoResolvido, type DetalhePlanta, type ResolucaoFamilia } from '@hestia/engine';
import { matrizDoComponente, type Component } from '@hestia/model';
import { mix } from './color.ts';
import { corDoPapel } from './planComponentsGeo.ts';
import type { FillOp, LabelOp, PlanTheme, StrokeOp } from './types.ts';

/*
 * Tubos e conexões MEP na planta (ficha D1, Q1 a Q3). A representação sai dos CORPOS reais da família (extrusão e varredura de
 * perfil circular), sem tabela de diâmetros: o raio é o do contorno externo do perfil resolvido.
 *  - corpo de papel `tubo`: duas linhas paralelas a ±raio do eixo (vertical = anel); sem tampa nas pontas.
 *  - corpo de papel `conexao`: contorno da UNIÃO das pegadas (bolsa = degrau do contorno; tê e luva sem linhas internas; curva =
 *    faixa de arcos concêntricos, pelo caminho da varredura).
 *  - escala pequena (largura do tubo < `LARGURA_MIN_PX`): só o eixo (linha simples), como a parede vira linha abaixo de 5 px.
 * Componente que não é só de corpos circulares tubo/conexão devolve `null` e segue pelo desenho de antes.
 */

/** Abaixo desta largura de tela (px) o tubo vira linha simples; é uma regra de desenho, não de norma. */
export const LARGURA_MIN_PX = 4;
/** A partir desta largura (px) o eixo tracejado aparece entre as duas linhas. */
const LARGURA_EIXO_PX = 16;
const LADOS_CIRCULO = 24;

export interface OpcoesTubo {
  /** Zoom da vista (px/m); ausente = escala adequada (duas linhas, sem eixo). */
  zoom?: number;
  /** Registra o limiar de zoom consultado (a chave da geometria passa a depender dele). */
  limiar?: (z: number) => void;
  /** Rótulo curto (DN e declividade) sobre o tubo. Desligado por padrão. */
  rotulo?: boolean;
}

type Forma = { tipo: 'reta'; a: Vec2; b: Vec2; dz: number } | { tipo: 'caminho'; pts: Vec2[] } | { tipo: 'vertical'; c: Vec2 };
interface Parte { corpo: CorpoResolvido; forma: Forma; raio: number; furo: number }

const noMundo = (m: number[], c: CorpoResolvido, x: number, y: number, z: number): [number, number, number] => {
  const r = c.rotacao;
  const fx = r[0]! * x + r[1]! * y + r[2]! * z + c.origem[0];
  const fy = r[3]! * x + r[4]! * y + r[5]! * z + c.origem[1];
  const fz = r[6]! * x + r[7]! * y + r[8]! * z + c.origem[2];
  return [m[0]! * fx + m[4]! * fy + m[8]! * fz + m[12]!, m[1]! * fx + m[5]! * fy + m[9]! * fz + m[13]!, m[2]! * fx + m[6]! * fy + m[10]! * fz + m[14]!];
};

/** Raio do perfil se for circular (todos os pontos à mesma distância do centro, ±3%); senão `null`. */
function raioCircular(externo: number[]): number | null {
  if (externo.length < 16) return null;
  let max = 0, min = Infinity;
  for (let i = 0; i + 1 < externo.length; i += 2) { const d = Math.hypot(externo[i]!, externo[i + 1]!); if (d > max) max = d; if (d < min) min = d; }
  return max > 1e-6 && min >= max * 0.97 ? max : null;
}

function raioDoFuro(furos: number[][]): number {
  const f = furos[0];
  if (!f || f.length < 6) return 0;
  let m = 0;
  for (let i = 0; i + 1 < f.length; i += 2) m = Math.max(m, Math.hypot(f[i]!, f[i + 1]!));
  return m;
}

function parteDoCorpo(c: CorpoResolvido, m: number[]): Parte | null {
  const f = c.forma;
  if (f.tipo !== 'extrusao' && f.tipo !== 'varredura') return null;
  const raio = raioCircular(f.perfil.externo);
  if (raio === null) return null;
  const furo = raioDoFuro(f.perfil.furos);
  if (f.tipo === 'extrusao') {
    const p0 = noMundo(m, c, 0, 0, 0), p1 = noMundo(m, c, 0, 0, f.comprimento);
    const a = { x: p0[0], y: p0[1] }, b = { x: p1[0], y: p1[1] };
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return { corpo: c, forma: { tipo: 'vertical', c: a }, raio, furo };
    return { corpo: c, forma: { tipo: 'reta', a, b, dz: p1[2] - p0[2] }, raio, furo };
  }
  const pts: Vec2[] = [];
  for (let i = 0; i + 2 < f.caminho.pontos.length; i += 3) {
    const w = noMundo(m, c, f.caminho.pontos[i]!, f.caminho.pontos[i + 1]!, f.caminho.pontos[i + 2]!);
    const ult = pts[pts.length - 1];
    if (!ult || Math.hypot(w[0] - ult.x, w[1] - ult.y) > 1e-6) pts.push({ x: w[0], y: w[1] });
  }
  if (pts.length < 2) return pts.length === 1 ? { corpo: c, forma: { tipo: 'vertical', c: pts[0]! }, raio, furo } : null;
  return { corpo: c, forma: { tipo: 'caminho', pts }, raio, furo };
}

const unit = (dx: number, dy: number): Vec2 => { const l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };

/** Paralelas à polilinha a distância `d` (positiva à esquerda), com quina em esquadro (miter limitado) nos vértices. */
function paralela(pts: readonly Vec2[], d: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const ant = i > 0 ? unit(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y) : null;
    const pro = i < pts.length - 1 ? unit(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y) : null;
    const t = ant && pro ? unit(ant.x + pro.x, ant.y + pro.y) : (ant ?? pro)!;
    const nx = -t.y, ny = t.x;
    const ref = ant ?? pro!;
    const cos = Math.max(0.35, nx * -ref.y + ny * ref.x);
    out.push({ x: pts[i]!.x + (nx * d) / cos, y: pts[i]!.y + (ny * d) / cos });
  }
  return out;
}

function circulo(c: Vec2, r: number): Ring {
  const ring: Ring = [];
  for (let i = 0; i < LADOS_CIRCULO; i++) { const a = (2 * Math.PI * i) / LADOS_CIRCULO; ring.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); }
  return ring;
}

const eixoDe = (f: Forma): Vec2[] => (f.tipo === 'reta' ? [f.a, f.b] : f.tipo === 'caminho' ? f.pts : [f.c]);

function pegada(p: Parte): Ring {
  const f = p.forma;
  if (f.tipo === 'vertical') return circulo(f.c, p.raio);
  const pts = eixoDe(f);
  const ring = [...paralela(pts, p.raio), ...paralela(pts, -p.raio).reverse()];
  return ringArea(ring) < 0 ? ring.reverse() : ring;
}

/** Rótulo curto: DN do componente e, se inclinado, a declividade (tan da inclinação) em %. */
function rotuloDoTubo(c: Component, partes: Parte[]): LabelOp | null {
  const alvo = partes.find((p) => p.corpo.papel === 'tubo' && p.forma.tipo === 'reta');
  if (!alvo || alvo.forma.tipo !== 'reta') return null;
  const dn = c.values?.DN;
  const partesTxt: string[] = [];
  if (typeof dn === 'number') partesTxt.push(`DN ${Math.round(dn)}`);
  const { a, b, dz } = alvo.forma;
  const decl = Math.abs(dz) / Math.hypot(b.x - a.x, b.y - a.y);
  if (decl > 1e-4) partesTxt.push(`${(decl * 100).toFixed(1).replace('.', ',')}%`);
  if (partesTxt.length === 0) return null;
  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  return { at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, text: partesTxt.join('  '), tone: 'soft', fontPx: 10, rotation: -ang, center: true };
}

/**
 * Fills, traços e textos do tubo/conexão na planta, ou `null` se o componente não é de corpos circulares tubo/conexão
 * (sem peças de marcenaria, sem corpo fora desses papéis).
 */
export function tuboNaPlanta(
  c: Component,
  res: Pick<ResolucaoFamilia, 'corpos' | 'pecas'>,
  theme: PlanTheme,
  detalhe: DetalhePlanta,
  sombreado: boolean,
  aramado: boolean,
  opc: OpcoesTubo = {},
): { fills: FillOp[]; strokes: StrokeOp[]; labels: LabelOp[] } | null {
  const corpos = (res.corpos ?? []).filter((q) => corpoNaPlanta(q, detalhe));
  if (corpos.length === 0 || res.pecas.length > 0 || detalhe === 'coarse') return null;
  if (corpos.some((q) => q.papel !== 'tubo' && q.papel !== 'conexao')) return null;
  const m = matrizDoComponente(c);
  const partes: Parte[] = [];
  for (const q of corpos) {
    const p = parteDoCorpo(q, m);
    if (!p) return null;
    partes.push(p);
  }

  const cor = theme.inkSoft;
  const strokes: StrokeOp[] = [];
  const fills: FillOp[] = [];
  const linha = (pts: Vec2[], closed: boolean, extra: Partial<StrokeOp> = {}): void => { strokes.push({ pts, closed, widthPx: 1, color: cor, alpha: 1, ...extra }); };

  const maiorDe = Math.max(...partes.map((p) => 2 * p.raio));
  const zoom = opc.zoom;
  if (zoom !== undefined) opc.limiar?.(LARGURA_MIN_PX / maiorDe);
  const simples = zoom !== undefined && maiorDe * zoom < LARGURA_MIN_PX;

  if (simples) {
    for (const p of partes) {
      if (p.forma.tipo === 'vertical') linha(circulo(p.forma.c, p.raio), true);
      else linha(eixoDe(p.forma), false);
    }
  } else {
    const aneis = partes.map(pegada);
    if (!aramado) {
      const corFill = sombreado ? corDoPapel(c, 'lateral') : undefined;
      fills.push({ polygons: aneis.map((r) => [r]), color: corFill ?? mix(theme.bg, theme.inkSoft, 0.07), alpha: corFill ? 1 : 0.85 });
    }
    const conexoes = partes.filter((p) => p.corpo.papel === 'conexao');
    const solido: MultiPolygon = conexoes.length > 0 ? union(...conexoes.map((p): MultiPolygon => [[pegada(p)]])) : [];
    for (const poly of solido) for (const ring of poly) linha(ring, true);
    for (const p of partes) {
      if (p.corpo.papel !== 'tubo') continue;
      const f = p.forma;
      if (f.tipo === 'vertical') {
        linha(circulo(f.c, p.raio), true);
        if (p.furo > 0) linha(circulo(f.c, p.furo), true, { alpha: 0.6 });
      } else {
        const pts = eixoDe(f);
        linha(paralela(pts, p.raio), false);
        linha(paralela(pts, -p.raio), false);
      }
    }
    if (zoom !== undefined && maiorDe * zoom >= LARGURA_EIXO_PX) {
      opc.limiar?.(LARGURA_EIXO_PX / maiorDe);
      for (const p of partes) if (p.forma.tipo !== 'vertical') linha(eixoDe(p.forma), false, { alpha: 0.5, dash: [8, 3] });
    }
  }
  const rot = opc.rotulo ? rotuloDoTubo(c, partes) : null;
  return { fills, strokes, labels: rot ? [rot] : [] };
}
