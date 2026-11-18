import {
  clipRect,
  crownBand,
  isPolygonForm,
  outlineInset,
  ringHalves,
  ringSignedArea,
  type OPt,
  type OpeningShape,
} from '@hestia/model';
import type { OpeningModel, OpeningPart, PartBox, PartRole } from './openingModelTypes.ts';
import { prisma } from './openingModelPrisma.ts';
import { clipDeslizante, trilhoNoContorno } from './openingModelContornoCorrer.ts';
import { muntinsDecorativos, type MuntinPadrao } from './openingModelMuntinsContorno.ts';
import { formaDaEsquadria } from './openingShapeEsquadria.ts';
import { poligonal } from './openingModelContornoPoligono.ts';
import { ferraduraNoPescoco } from './openingModelContornoFerradura.ts';

/*
 * Peças da esquadria em vão com forma (docs/estudo-esquadrias/28). Pós-processo do modelo único: o modelo retangular de
 * sempre é montado e, quando o vão tem `forma` (arco pleno, abatido, ogival, círculo), as peças que encostam no contorno
 * passam a segui-lo. Vão retangular (ou forma inválida) devolve o MESMO objeto, sem tocar em nada.
 *
 * Decisões:
 * - Batente: ombreiras retas sobem até o arranque do arco; a travessa (`head`) vira UMA faixa em arco por fatia de `s`
 *   (as fatias do rebaixo do batedor viram prismas `tz` do mesmo grupo, mesmo volume do perfil em L). Círculo: duas metades.
 * - Alizar: mesma regra, com recuo negativo (por fora do vão). A soleira do alizar fica reta.
 * - Vidro, folha, divisores e baguetes: caixa recortada pelo contorno recuado (`outlineInset`), prisma `tz`. A folha que
 *   fica abaixo do arranque (porta com bandeira) NÃO muda: bandeira em arco com folha retangular embaixo é o resultado natural
 *   quando o tipo tem bandeira; sem bandeira a folha acompanha o arco.
 * - Travessa superior da folha de janela: faixa em arco entre o recuo do topo da folha e o do fundo da travessa.
 * Parte do que NÃO muda: verga, contraverga, peitoril, soleira, ferragens e trilhos fora do contorno.
 */

const EPS = 1e-9;
/** Papéis do preenchimento que o contorno recorta. */
export const PREENCHIMENTO: ReadonlySet<PartRole> = new Set<PartRole>(['glass', 'leaf', 'leafPanel', 'muntin', 'bead', 'mullion', 'transom', 'track']);

/** Fatia de `s` da travessa: espessura medida do bordo de fora (`a`) ao de dentro (`b`) do contorno. */
export interface Fatia {
  s0: number;
  s1: number;
  a: number;
  b: number;
}

/** Fatias da travessa pelo perfil `sz` (rebaixo do batedor); sem perfil, uma fatia com a caixa inteira. */
export function fatiasDaTravessa(part: OpeningPart): Fatia[] {
  const bx = part.box;
  if (part.profile?.plane !== 'sz') return [{ s0: bx.s0, s1: bx.s1, a: 0, b: bx.z1 - bx.z0 }];
  const pts = part.profile.pts;
  const cortes = [...new Set(pts.map((p) => Math.round(p[0] * 1e9) / 1e9))].sort((x, y) => x - y);
  const out: Fatia[] = [];
  for (let i = 0; i + 1 < cortes.length; i++) {
    const mid = (cortes[i]! + cortes[i + 1]!) / 2;
    const zs: number[] = [];
    for (let k = 0; k < pts.length; k++) {
      const [sa, za] = pts[k]!;
      const [sb, zb] = pts[(k + 1) % pts.length]!;
      if ((sa - mid) * (sb - mid) < 0) zs.push(za + ((zb - za) * (mid - sa)) / (sb - sa));
    }
    if (zs.length < 2) continue;
    const a = bx.z1 - Math.max(...zs);
    const b = bx.z1 - Math.min(...zs);
    const last = out[out.length - 1];
    if (last && Math.abs(last.a - a) < EPS && Math.abs(last.b - b) < EPS && Math.abs(last.s1 - cortes[i]!) < EPS) last.s1 = cortes[i + 1]!;
    else out.push({ s0: cortes[i]!, s1: cortes[i + 1]!, a, b });
  }
  return out;
}

const area = (r: readonly OPt[]): number => Math.abs(ringSignedArea(r));
const boxArea = (b: PartBox): number => (b.t1 - b.t0) * (b.z1 - b.z0);

/** Recorta uma peça-caixa pelo contorno recuado; `null` = nada a mudar, `[]` = a peça some. */
export function recortada(part: OpeningPart, shape: OpeningShape, hw: number, H: number, dRef: number): OPt[] | null {
  const b = part.box;
  const arcD = Math.max(0, part.role === 'glass' || part.role === 'leaf' ? H - b.z1 : dRef);
  const ladoD = Math.max(-0.5, Math.min(hw - Math.max(Math.abs(b.t0), Math.abs(b.t1)), arcD));
  // Peça que desliza: arco sem prateleira (recuo de arco <= lateral) para a região ser convexa e valer a interseção do curso.
  const regiao = outlineInset(shape, { side: ladoD, arc: part.motion?.kind === 'slide' ? Math.max(0, Math.min(arcD, ladoD)) : arcD, base: 0 });
  if (regiao.length < 3) return null;
  const poly = part.motion?.kind === 'slide' ? clipDeslizante(regiao, b, part.motion) : clipRect(regiao, b.t0, b.t1, b.z0, b.z1);
  if (poly.length < 3) return [];
  return area(poly) >= boxArea(b) - 1e-9 ? null : poly;
}

/** Travessa superior da folha de janela que toca o arco: faixa entre os recuos do topo e do fundo da travessa. */
function travessaDaFolha(part: OpeningPart, shape: OpeningShape, hw: number, H: number): OPt[] | null {
  const b = part.box;
  const faixa = crownBand(shape, Math.max(0, H - b.z1), H - b.z0);
  if (!faixa) return null;
  const xs = hw - (H - b.z0);
  const poly = clipRect(faixa.pts, Math.max(b.t0, -xs), Math.min(b.t1, xs), -1, H + 1);
  return poly.length >= 3 ? poly : null;
}

function arco(m: OpeningModel, shape: OpeningShape): OpeningPart[] {
  const hw = m.width / 2;
  const H = m.height;
  const parts = m.parts;
  const head = parts.find((p) => p.role === 'head' && p.material === 'frame' && p.profile?.plane !== 'tz');
  const dRef = head ? head.box.z1 - head.box.z0 : 0;
  // Faixas do batente: se alguma não cabe no contorno, o batente todo fica como era (nenhuma peça fica pela metade).
  const fatias = head ? fatiasDaTravessa(head) : [];
  const faixas = fatias.map((f) => crownBand(shape, f.a, f.b));
  const batente = head !== undefined && faixas.length > 0 && faixas.every((f) => f !== null);
  const piso = batente ? Math.min(...faixas.map((f) => f!.floor)) : 0;
  const topoPorFolha = new Map<number, number>();
  for (const p of parts) if (p.role === 'leaf' && p.leaf !== undefined) topoPorFolha.set(p.leaf, Math.max(topoPorFolha.get(p.leaf) ?? -Infinity, p.box.z1));
  const out: OpeningPart[] = [];
  const alizar = alizarEmArco(parts, shape, hw, H);
  for (const part of parts) {
    if (batente && part === head) {
      fatias.forEach((f, k) => {
        out.push(prisma(part, faixas[k]!.pts, { id: k === 0 ? part.id : `${part.id}-${k}`, group: part.group ?? part.id }, f));
      });
      continue;
    }
    if (batente && part.role === 'jamb' && part.material === 'frame' && part.profile?.plane !== 'tz' && piso > part.box.z0 + EPS) {
      out.push({ ...part, box: { ...part.box, z1: piso } });
      continue;
    }
    const troca = alizar.get(part);
    if (troca) {
      out.push(...troca);
      continue;
    }
    const trilho = part.role === 'track' && !part.profile ? trilhoNoContorno(part.id, part.box, shape, H) : null;
    if (trilho) {
      trilho.forEach((r, k) => out.push(prisma(part, r, k ? { id: `${part.id}-${k}` } : {})));
      continue;
    }
    if (!PREENCHIMENTO.has(part.role) || part.profile || part.dashed || part.material === 'concrete') {
      out.push(part);
      continue;
    }
    const b = part.box;
    const emTopo = part.role === 'leaf' && part.motion?.kind !== 'slide' && part.leaf !== undefined && b.t1 - b.t0 > 1.5 * (b.z1 - b.z0) && Math.abs(b.z1 - (topoPorFolha.get(part.leaf) ?? NaN)) < 1e-6;
    let ring = recortada(part, shape, hw, H, dRef);
    if (ring && ring.length >= 3 && emTopo) ring = travessaDaFolha(part, shape, hw, H) ?? ring;
    if (ring === null) out.push(part);
    else if (ring.length >= 3) out.push(prisma(part, ring));
  }
  return shape.kind === 'horseshoe' ? out.map((p) => ferraduraNoPescoco(p, shape)) : out;
}

/** Peças do alizar de uma face, por papel no desenho (`left`, `right`, `head`, `sill`). */
export interface AlizarDaFace {
  left?: OpeningPart;
  right?: OpeningPart;
  head?: OpeningPart;
  sill?: OpeningPart;
}

/** Alizar agrupado por face (`casing-<face>`), pelo nome das peças (`casing-<lado>-a|b`). */
export function alizares(parts: readonly OpeningPart[]): Map<string, AlizarDaFace> {
  const out = new Map<string, AlizarDaFace>();
  for (const p of parts) {
    if (p.role !== 'casing' || !p.group) continue;
    const lado = /^casing-(left|right|head|sill)-/.exec(p.id)?.[1] as keyof AlizarDaFace | undefined;
    if (!lado) continue;
    const g = out.get(p.group) ?? {};
    g[lado] = p;
    out.set(p.group, g);
  }
  return out;
}

/** Distâncias de recuo do alizar (laterais e topo) ao contorno do vão: negativas, o alizar fica por fora. */
export function recuosDoAlizar(a: AlizarDaFace, hw: number, H: number): { out: { side: number; arc: number }; inn: { side: number; arc: number } } | null {
  if (!a.left || !a.head) return null;
  return {
    out: { side: hw + a.left.box.t0, arc: H - a.head.box.z1 },
    inn: { side: hw + a.left.box.t1, arc: H - a.head.box.z0 },
  };
}

/** Alizar em arco: a travessa vira faixa, as laterais sobem até o arranque da faixa. `Map` peça -> peças que a substituem. */
function alizarEmArco(parts: readonly OpeningPart[], shape: OpeningShape, hw: number, H: number): Map<OpeningPart, OpeningPart[]> {
  const sub = new Map<OpeningPart, OpeningPart[]>();
  for (const a of alizares(parts).values()) {
    const r = recuosDoAlizar(a, hw, H);
    const faixa = r ? crownBand(shape, r.out, r.inn) : null;
    if (!faixa || !a.head) continue;
    sub.set(a.head, [prisma(a.head, faixa.pts)]);
    for (const lado of [a.left, a.right]) if (lado && faixa.floor > lado.box.z0 + EPS) sub.set(lado, [{ ...lado, box: { ...lado.box, z1: faixa.floor } }]);
  }
  return sub;
}

/** Alizar de círculo: o anel todo vira duas metades por face (laterais, travessa e peitoril saem). */
function alizarEmAnel(parts: readonly OpeningPart[], shape: OpeningShape, hw: number, H: number): Map<OpeningPart, OpeningPart[]> {
  const sub = new Map<OpeningPart, OpeningPart[]>();
  for (const [grupo, a] of alizares(parts)) {
    const r = recuosDoAlizar(a, hw, H);
    const metades = r ? ringHalves(shape, Math.min(r.out.side, r.out.arc), Math.max(r.inn.side, r.inn.arc)) : null;
    if (!metades || !a.left || !a.head) continue;
    const sufixo = a.left.id.slice(-2); // '-a' | '-b'
    const todas = [a.left, a.right, a.head, a.sill].filter((x): x is OpeningPart => x !== undefined);
    todas.forEach((x) => sub.set(x, []));
    sub.set(a.left, [
      prisma(a.left, metades.right, { id: `casing-ring-right${sufixo}`, group: grupo }, { s0: a.left.box.s0, s1: a.left.box.s1 }),
      prisma(a.left, metades.left, { id: `casing-ring-left${sufixo}`, group: grupo }, { s0: a.left.box.s0, s1: a.left.box.s1 }),
    ]);
  }
  return sub;
}

function circulo(m: OpeningModel, shape: OpeningShape): OpeningPart[] {
  const hw = m.width / 2;
  const H = m.height;
  const head = m.parts.find((p) => p.role === 'head' && p.material === 'frame');
  const fatias = head ? fatiasDaTravessa(head) : [];
  const aneis = fatias.map((f) => ringHalves(shape, f.a, f.b));
  const batente = head !== undefined && aneis.length > 0 && aneis.every((a) => a !== null);
  const out: OpeningPart[] = [];
  const alizar = alizarEmAnel(m.parts, shape, hw, H);
  for (const part of m.parts) {
    const troca = alizar.get(part);
    if (troca) {
      out.push(...troca);
      continue;
    }
    const moldura = part.material === 'frame' && (part.role === 'jamb' || part.role === 'head' || part.role === 'sillFrame');
    if (batente && moldura) {
      if (part === head) {
        fatias.forEach((f, k) => {
          out.push(prisma(part, aneis[k]!.right, { id: `jamb-right${k ? `-${k}` : ''}`, role: 'jamb', group: 'frame-ring' }, f));
          out.push(prisma(part, aneis[k]!.left, { id: `jamb-left${k ? `-${k}` : ''}`, role: 'jamb', group: 'frame-ring' }, f));
        });
      }
      continue;
    }
    const trilho = part.role === 'track' && !part.profile ? trilhoNoContorno(part.id, part.box, shape, H) : null;
    if (trilho) {
      trilho.forEach((r, k) => out.push(prisma(part, r, k ? { id: `${part.id}-${k}` } : {})));
      continue;
    }
    if (!PREENCHIMENTO.has(part.role) || part.profile || part.dashed || part.material === 'concrete') {
      out.push(part);
      continue;
    }
    const ring = recortada(part, shape, hw, H, head ? head.box.z1 - head.box.z0 : 0);
    if (ring === null) out.push(part);
    else if (ring.length >= 3) out.push(prisma(part, ring));
  }
  return out;
}

/** O que `poligonal` (formas retas) usa daqui. */
const APOIO = { recortada, preenchimento: PREENCHIMENTO, fatias: fatiasDaTravessa, alizares, recuos: recuosDoAlizar };

/**
 * Modelo com as peças seguindo o contorno do vão. `forma` é a do vão (`OpeningGeometry.forma`, dimensionada pelo vão bruto):
 * aqui largura e altura viram as da esquadria (`m.width` x `m.height`, `formaDaEsquadria`) e a flecha fica como gravada. Forma
 * ausente, retangular ou que não cabe na esquadria devolve `m` sem alteração (o aviso é `forma-esquadria-retangular`).
 * `padrao` (`OpeningType.muntinPattern`) só vale com forma: monta as divisões decorativas do vidro recortadas pelo contorno.
 */
export function contornoDoModelo(m: OpeningModel, forma: OpeningShape | undefined, padrao?: MuntinPadrao | null): OpeningModel {
  if (!forma || forma.kind === 'rect') return m;
  const shape = formaDaEsquadria(forma, m.width, m.height);
  if (!shape) return m;
  const parts = shape.kind === 'circle' ? circulo(m, shape) : isPolygonForm(shape) ? poligonal(m, shape, APOIO) : arco(m, shape);
  return { ...m, parts: padrao ? muntinsDecorativos(parts, shape, padrao) : parts };
}
