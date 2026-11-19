import { clipRect, ringSignedArea, type OPt, type OpeningShape } from '@hestia/model';
import type { OpeningPart, PartBox } from './openingModelTypes.ts';
import { prisma } from './openingModelPrisma.ts';

/*
 * Caixilho CONTÍNUO da folha em vão com forma (docs/estudo-esquadrias/39). A moldura da folha de janela (e da porta de vidro) são
 * quatro barras retas (`leaf-<k>-left|right|top|bottom`). Recortar cada uma pelo contorno deixava, num círculo, só as duas
 * pontas laterais e lascas no topo e na base: não havia aro em volta do vidro.
 *
 * Aqui a moldura vira o anel entre dois contornos: o externo (a caixa da folha recortada como as demais peças) e o interno (o
 * polígono do vidro da folha, o mesmo que o vidro usa, então aro e vidro se encostam sem lacuna nem sobreposição). O anel é
 * repartido nas MESMAS quatro peças, com os mesmos ids:
 * - esquerda e direita: o externo cortado nas retas verticais que tocam o interno (`x <= xMin` e `x >= xMax` do interno);
 * - em cima e embaixo: a faixa entre a cadeia superior (ou inferior) do externo e a do interno, entre essas duas retas.
 * As quatro cobrem o anel sem sobra: a soma das áreas é a área do externo menos a do interno (conferida; se não fecha, nada muda).
 * Peça cuja nova forma é a própria caixa continua a mesma peça (folha retangular dentro do contorno não muda).
 */

type Recorte = (part: OpeningPart, shape: OpeningShape, hw: number, H: number, dRef: number) => OPt[] | null;

const EPS = 1e-9;
const BIG = 1e3;

const area = (r: readonly OPt[]): number => Math.abs(ringSignedArea(r));
const caixaRect = (b: PartBox): OPt[] => [[b.t1, b.z0], [b.t1, b.z1], [b.t0, b.z1], [b.t0, b.z0]];
const dedupe = (pts: OPt[]): OPt[] => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) > EPS);

/** Cadeias do anel anti-horário: superior (da direita para a esquerda) e inferior (da esquerda para a direita). `null` se não achar. */
function cadeias(r: readonly OPt[]): { sup: OPt[]; inf: OPt[] } | null {
  const n = r.length;
  if (n < 3) return null;
  let xmin = Infinity;
  let xmax = -Infinity;
  for (const p of r) {
    xmin = Math.min(xmin, p[0]);
    xmax = Math.max(xmax, p[0]);
  }
  const pick = (okx: (x: number) => boolean, maior: boolean): number => {
    let b = -1;
    for (let i = 0; i < n; i++) {
      if (!okx(r[i]![0])) continue;
      if (b < 0 || (maior ? r[i]![1] > r[b]![1] : r[i]![1] < r[b]![1])) b = i;
    }
    return b;
  };
  const dir = (x: number): boolean => x >= xmax - EPS;
  const esq = (x: number): boolean => x <= xmin + EPS;
  const iTR = pick(dir, true);
  const iTL = pick(esq, true);
  const iBL = pick(esq, false);
  const iBR = pick(dir, false);
  const anda = (a: number, b: number): OPt[] | null => {
    const out: OPt[] = [];
    for (let i = a, k = 0; k <= n; i = (i + 1) % n, k++) {
      out.push(r[i]!);
      if (i === b) return out;
    }
    return null;
  };
  const sup = anda(iTR, iTL);
  const inf = anda(iBL, iBR);
  return sup && inf ? { sup, inf } : null;
}

/** A peça nova se for diferente da caixa; a mesma peça quando o anel dá a própria caixa; `[]` quando sobra nada. */
function peca(part: OpeningPart, ring: readonly OPt[]): OpeningPart[] {
  const r = dedupe([...ring]);
  if (r.length < 3 || ringSignedArea(r) <= EPS) return [];
  const b = part.box;
  const xs = r.map((p) => p[0]);
  const zs = r.map((p) => p[1]);
  const igual =
    Math.abs(Math.min(...xs) - b.t0) < EPS && Math.abs(Math.max(...xs) - b.t1) < EPS && Math.abs(Math.min(...zs) - b.z0) < EPS && Math.abs(Math.max(...zs) - b.z1) < EPS && Math.abs(area(r) - (b.t1 - b.t0) * (b.z1 - b.z0)) < 1e-9;
  return igual ? [part] : [prisma(part, r)];
}

/** As quatro barras de uma folha, na ordem esquerda, direita, topo, base. */
interface Barras {
  left: OpeningPart;
  right: OpeningPart;
  top: OpeningPart;
  bottom: OpeningPart;
}

/** Anel da folha repartido em quatro peças (`null` quando o anel não fecha ou a folha não toca o contorno). */
function aneloDaFolha(b: Barras, glass: OpeningPart, shape: OpeningShape, hw: number, H: number, dRef: number, recortada: Recorte): Map<OpeningPart, OpeningPart[]> | null {
  const bs = [b.left, b.right, b.top, b.bottom];
  const ext: PartBox = {
    ...b.left.box,
    t0: Math.min(...bs.map((p) => p.box.t0)),
    t1: Math.max(...bs.map((p) => p.box.t1)),
    z0: Math.min(...bs.map((p) => p.box.z0)),
    z1: Math.max(...bs.map((p) => p.box.z1)),
  };
  const fora = recortada({ ...b.left, box: ext }, shape, hw, H, dRef);
  const polyO = fora === null ? caixaRect(ext) : fora;
  const dentro = recortada(glass, shape, hw, H, dRef);
  const polyI = dentro === null ? caixaRect(glass.box) : dentro;
  if (polyO.length < 3 || polyI.length < 3 || ringSignedArea(polyO) <= EPS || ringSignedArea(polyI) <= EPS) return null;
  if (fora === null && dentro === null) return null; // folha toda dentro do contorno: as quatro barras ficam como são
  const xI0 = Math.min(...polyI.map((p) => p[0]));
  const xI1 = Math.max(...polyI.map((p) => p[0]));
  const esq = clipRect(polyO, -BIG, xI0, -BIG, BIG);
  const dir = clipRect(polyO, xI1, BIG, -BIG, BIG);
  const meio = clipRect(polyO, xI0, xI1, -BIG, BIG);
  const co = meio.length >= 3 ? cadeias(meio) : null;
  const ci = cadeias(polyI);
  if (!co || !ci) return null;
  const topo = [...co.sup, ...[...ci.sup].reverse()];
  const base = [...co.inf, ...[...ci.inf].reverse()];
  const soma = area(esq.length >= 3 ? esq : []) + area(dir.length >= 3 ? dir : []) + (ringSignedArea(dedupe(topo)) > 0 ? area(dedupe(topo)) : 0) + (ringSignedArea(dedupe(base)) > 0 ? area(dedupe(base)) : 0);
  const alvo = area(polyO) - area(polyI);
  if (Math.abs(soma - alvo) > 1e-6 * Math.max(1e-3, area(polyO))) return null;
  const out = new Map<OpeningPart, OpeningPart[]>();
  out.set(b.left, peca(b.left, esq));
  out.set(b.right, peca(b.right, dir));
  out.set(b.top, peca(b.top, topo));
  out.set(b.bottom, peca(b.bottom, base));
  return out;
}

export interface AroDasFolhas {
  /** Barra da folha -> peças que a substituem (pode ser vazio). */
  troca: Map<OpeningPart, OpeningPart[]>;
  /** Recuo do contorno ao vidro da folha (m): as divisões do vidro recortam por ele e encostam no aro. */
  recuoDoVidro: Map<number, number>;
}

/**
 * Aro contínuo de cada folha com as quatro barras e o vidro. Folha sem as quatro barras (porta maciça, vitrô, veneziana) ou cujo
 * anel não fecha fica de fora e segue a regra das demais peças.
 */
export function aroDasFolhas(parts: readonly OpeningPart[], shape: OpeningShape, hw: number, H: number, dRef: number, recortada: Recorte): AroDasFolhas {
  const troca = new Map<OpeningPart, OpeningPart[]>();
  const recuoDoVidro = new Map<number, number>();
  if (process.env.DBG_SEMARO) return { troca, recuoDoVidro }; // DBG-TMP
  const folhas = new Map<string, Partial<Barras> & { glass?: OpeningPart }>();
  for (const p of parts) {
    if (p.profile) continue;
    const m = p.role === 'leaf' ? /^leaf-(.+)-(left|right|top|bottom)$/.exec(p.id) : null;
    const g = p.role === 'glass' ? /^glass-(.+)$/.exec(p.id) : null;
    const chave = m?.[1] ?? g?.[1];
    if (chave === undefined) continue;
    const f = folhas.get(chave) ?? {};
    if (m) f[m[2] as keyof Barras] = p;
    else f.glass = p;
    folhas.set(chave, f);
  }
  for (const f of folhas.values()) {
    if (!f.left || !f.right || !f.top || !f.bottom || !f.glass) continue;
    const anel = aneloDaFolha(f as Barras, f.glass, shape, hw, H, dRef, recortada);
    if (!anel) continue;
    for (const [barra, novas] of anel) troca.set(barra, novas);
    if (f.glass.leaf !== undefined) recuoDoVidro.set(f.glass.leaf, Math.max(0, H - f.glass.box.z1));
  }
  return { troca, recuoDoVidro };
}
