import { clipRect, edgeStrips, outline, polygonInset, type OPt, type PolygonFormShape } from '@hestia/model';
import type { OpeningModel, OpeningPart, PartRole } from './openingModelTypes.ts';
import { prisma } from './openingModelPrisma.ts';
import type { AroDasFolhas } from './openingModelContornoFolha.ts';

/*
 * Peças da esquadria em vão de contorno reto: empena, trapézio e polígono livre (docs/estudo-esquadrias/32). Mesmo princípio de
 * `openingModelContorno.ts` (pós-processo do modelo retangular), com uma diferença: não há coroa de arco, então o batente e o
 * alizar viram FAIXAS POR ARESTA (quadriláteros de junta em meia-esquadria, `edgeStrips`) em volta do contorno todo, sem a base
 * (soleira e peitoril ficam retos). Cada faixa leva `role` 'jamb' (aresta lateral) ou 'head' (topo, telhado) e o `group` do batente.
 *
 * - Batente: ombreiras e travessa saem, e entram as faixas, uma série por fatia de `s` do rebaixo da travessa (`fatias`). A
 *   espessura das ombreiras é a da travessa (o perfil em L é o mesmo nas duas).
 * - Alizar: as três peças da face saem; entram as faixas entre o recuo de fora e o de dentro; a soleira do alizar fica reta.
 * - Preenchimento (vidro, folha, divisores, baguetes, trilhos): caixa recortada pelo contorno recuado, como nos arcos.
 * - Soleira do batente e soleira do vão ficam retas, aparadas à largura da base (trapézio com base menor que a caixa).
 * Recuo recusado (polígono côncavo cujo recuo se auto-intersecta, aresta que colapsa): a peça fica como era e a forma avisa
 * (`forma-vao-poligono-concavo`).
 */

/** Fatia de `s` da travessa: espessura medida do bordo de fora (`a`) ao de dentro (`b`) do contorno. */
export interface FatiaApoio {
  s0: number;
  s1: number;
  a: number;
  b: number;
}

/** Alizar de uma face (peças por papel no desenho). */
export interface AlizarApoio {
  left?: OpeningPart;
  right?: OpeningPart;
  head?: OpeningPart;
  sill?: OpeningPart;
}

/** O que `openingModelContorno.ts` empresta (as funções dele são as mesmas dos arcos; sem importar de volta, sem ciclo). */
export interface ApoioContorno {
  recortada: (part: OpeningPart, shape: PolygonFormShape, hw: number, H: number, dRef: number) => OPt[] | null;
  preenchimento: ReadonlySet<PartRole>;
  fatias: (head: OpeningPart) => FatiaApoio[];
  alizares: (parts: readonly OpeningPart[]) => Map<string, AlizarApoio>;
  recuos: (a: AlizarApoio, hw: number, H: number) => { out: { side: number; arc: number }; inn: { side: number; arc: number } } | null;
  /** Aro contínuo das folhas (docs/estudo-esquadrias/39) e o recuo de referência das divisões do vidro. */
  aro: (parts: readonly OpeningPart[], shape: PolygonFormShape, hw: number, H: number, dRef: number) => AroDasFolhas;
  recuoDe: (part: OpeningPart, aro: AroDasFolhas, dRef: number) => number;
}

const EPS = 1e-9;

const molduraDoBatente = (p: OpeningPart): boolean => p.material === 'frame' && (p.role === 'jamb' || p.role === 'head') && p.profile?.plane !== 'tz';

/** Aresta de ombreira (vertical ou que toca a base: perna do trapézio) ou de topo (telhado da empena, topo)? */
const ehOmbreira = (o: readonly OPt[], edge: number): boolean => {
  const a = o[edge]!;
  const b = o[(edge + 1) % o.length]!;
  return Math.abs(b[0] - a[0]) < EPS || Math.min(a[1], b[1]) < EPS;
};

/** Faixas recortadas pelo piso `zMin`, como peças `tz` de `modelo`. `contorno`: o papel sai da aresta ('jamb' ou 'head'); sem ele, o de `modelo`. */
function pecasDasFaixas(modelo: OpeningPart, faixas: ReadonlyArray<{ ring: OPt[]; edge: number }>, zMin: number, id: string, extra: Partial<OpeningPart>, s: { s0: number; s1: number }, contorno?: readonly OPt[]): OpeningPart[] {
  const out: OpeningPart[] = [];
  for (const f of faixas) {
    const ring = clipRect(f.ring, -1e3, 1e3, zMin, 1e3);
    const papel: Partial<OpeningPart> = contorno ? { role: ehOmbreira(contorno, f.edge) ? 'jamb' : 'head' } : {};
    if (ring.length >= 3) out.push(prisma(modelo, ring, { ...extra, ...papel, id: `${id}-e${f.edge}` }, s));
  }
  return out;
}

/** Peças do modelo com batente, alizar e preenchimento seguindo o contorno reto. */
export function poligonal(m: OpeningModel, shape: PolygonFormShape, ap: ApoioContorno): OpeningPart[] {
  const hw = m.width / 2;
  const H = m.height;
  const parts = m.parts;
  const head = parts.find((p) => p.role === 'head' && p.material === 'frame' && p.profile?.plane !== 'tz');
  const dRef = head ? head.box.z1 - head.box.z0 : 0;
  const fatias = head ? ap.fatias(head) : [];
  const faixas = fatias.map((f) => edgeStrips(shape, { side: f.a, arc: f.a }, { side: f.b, arc: f.b }));
  const batente = head !== undefined && fatias.length > 0 && faixas.every((f) => f !== null);
  const ombreiras = parts.filter((p) => p.role === 'jamb' && molduraDoBatente(p));
  const piso = ombreiras.length > 0 ? Math.min(...ombreiras.map((p) => p.box.z0)) : 0;
  const contorno = outline(shape);
  const sub = new Map<OpeningPart, OpeningPart[]>();
  for (const [grupo, a] of ap.alizares(parts)) {
    const r = ap.recuos(a, hw, H);
    const tiras = r && a.head ? edgeStrips(shape, r.out, r.inn) : null;
    if (!tiras || !a.head) continue;
    const zMin = Math.min(...[a.left, a.right].filter((x): x is OpeningPart => x !== undefined).map((x) => x.box.z0));
    sub.set(a.head, pecasDasFaixas(a.head, tiras, Number.isFinite(zMin) ? zMin : 0, a.head.id, { group: grupo }, { s0: a.head.box.s0, s1: a.head.box.s1 }));
    for (const lado of [a.left, a.right]) if (lado) sub.set(lado, []);
  }
  // Soleira reta: a largura da base do contorno (o trapézio de base menor que a caixa não deixa a soleira para fora).
  const base = polygonInset(shape, { side: 0, arc: 0, base: 0 }).filter((p) => p[1] < EPS).map((p) => Math.abs(p[0]));
  const meiaBase = base.length > 0 ? Math.max(...base) : hw;
  const out: OpeningPart[] = [];
  const aro = ap.aro(parts, shape, hw, H, dRef);
  for (const part of parts) {
    const troca = sub.get(part) ?? aro.troca.get(part);
    if (troca) {
      out.push(...troca);
      continue;
    }
    if (batente && molduraDoBatente(part)) {
      if (part === head) {
        fatias.forEach((f, k) => out.push(...pecasDasFaixas(part, faixas[k]!, piso, k === 0 ? part.id : `${part.id}-${k}`, { group: part.group ?? part.id }, f, contorno)));
      }
      continue;
    }
    if ((part.role === 'sillFrame' || part.role === 'threshold') && !part.profile && meiaBase < hw - EPS) {
      out.push({ ...part, box: { ...part.box, t0: Math.max(part.box.t0, -meiaBase), t1: Math.min(part.box.t1, meiaBase) } });
      continue;
    }
    if (!ap.preenchimento.has(part.role) || part.profile || part.dashed || part.material === 'concrete') {
      out.push(part);
      continue;
    }
    const ring = ap.recortada(part, shape, hw, H, ap.recuoDe(part, aro, dRef));
    if (ring === null) out.push(part);
    else if (ring.length >= 3) out.push(prisma(part, ring));
  }
  return out;
}

