import { outline, type OPt, type OpeningShape } from '@hestia/model';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { bandVolume } from './profile.ts';
import { furosDe } from './resolveMemo.ts';
import { openingHole } from './openingCut.ts';
import { furarPrismaPorContorno, retornoPorContorno, type MalhaPrismaFurada, type PedidoFuroPrisma, type ResultadoRetornoVao, type VaoComContorno } from './furoContornoDespacho.ts';
import type { FuroContornoDaParede, LayerBand, OpeningGeometry, ResolvedLayer, ResolvedWall } from './types.ts';

/**
 * Troca atômica do furo por contorno (docs/estudo-esquadrias/26): o que 3D e quantitativo fazem com uma camada de parede
 * que tem vão com forma. A camada chega INTEIRA em `bands` (o vão não a corta mais); aqui ela é furada pelo cliente, ou, se
 * o cliente não responde, em retângulo (a parede nunca fica sem vão).
 */

/** Área e perímetro REAIS do contorno (shoelace e soma das cordas), no lugar de `W x H` (docs/estudo-esquadrias/22 §5). */
export function areaPerimetroDoContorno(forma: OpeningShape): { area: number; perimetro: number } {
  const r: readonly OPt[] = outline(forma);
  let a2 = 0;
  let per = 0;
  r.forEach(([x, z], i) => {
    const [x2, z2] = r[(i + 1) % r.length]!;
    a2 += x * z2 - x2 * z;
    per += Math.hypot(x2 - x, z2 - z);
  });
  return { area: Math.abs(a2) / 2, perimetro: per };
}

/** Os vãos da parede no formato do cliente (contorno anti-horário, x = offset, soleira = peitoril). */
export const vaosDoContorno = (fc: readonly FuroContornoDaParede[]): VaoComContorno[] =>
  fc.filter((f) => f.g.forma).map(({ g }) => ({ openingId: g.openingId, contorno: outline(g.forma!), x: g.offset, soleira: g.sill }));

/** Ponto da malha do cliente (x = u, y = s, z relativo) no mundo. */
export function malhaParaMundo(rw: Pick<ResolvedWall, 'a' | 'u' | 'n' | 'baseZ'>, x: number, y: number, z: number): [number, number, number] {
  return [rw.a.x + rw.u.x * x + rw.n.x * y, rw.a.y + rw.u.y * x + rw.n.y * y, rw.baseZ + z];
}

/** Faixas com os vãos recortados em retângulo (o furo de sempre, o da rota retangular): rede de segurança sem cliente que sirva. */
function bandasRetangulares(bands: LayerBand[], gs: OpeningGeometry[]): LayerBand[] {
  const out: LayerBand[] = [];
  for (const b of bands) {
    const zs = new Set([b.z0, b.z1]);
    for (const g of gs) for (const z of [g.sill, g.sill + g.roughHeight]) if (z > b.z0 + 1e-6 && z < b.z1 - 1e-6) zs.add(z);
    const ord = [...zs].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ord.length; k++) {
      const mid = (ord[k]! + ord[k + 1]!) / 2;
      const holes = gs.filter((g) => mid > g.sill && mid < g.sill + g.roughHeight).map(openingHole);
      out.push({ ...b, z0: ord[k]!, z1: ord[k + 1]!, poly: holes.length ? furosDe(b.poly, holes) : b.poly });
    }
  }
  return out;
}

const paraPlanta = (rw: ResolvedWall, m: MultiPolygon): PedidoFuroPrisma['camadas'][number]['poligonos'] =>
  m.map((poly) => poly.map((ring) => ring.map((q: Vec2): [number, number] => [(q.x - rw.a.x) * rw.u.x + (q.y - rw.a.y) * rw.u.y, (q.x - rw.a.x) * rw.n.x + (q.y - rw.a.y) * rw.n.y])));

export interface CamadaFurada {
  /** Faixas efetivas: as mesmas de entrada quando o cliente furou; recortadas em retângulo no recuo. */
  bands: LayerBand[];
  /** Malhas furadas (uma por faixa não vazia, na ordem de `bands`); `null` no recuo retangular. */
  malhas: Array<{ banda: LayerBand; malha: MalhaPrismaFurada }> | null;
  /** Retornos do acabamento que seguem o contorno (só na camada envolvente). */
  retornos: ResultadoRetornoVao[];
  /** Volume removido pelos contornos (m³); 0 no recuo retangular (as faixas já vêm furadas). */
  removido: number;
  /** Volume líquido da camada (m³): faixas, menos o removido, mais os retornos. */
  volume: number;
}

const LIMITE_PRISMAS = 32; // limite de camadas por chamada da ABI (doc 25 §4)

/**
 * A camada `l` com os vãos de contorno de `rw`, sobre as faixas `bands` (as de `l.bands` no quantitativo; as pós-junção no 3D).
 * `null` quando a parede não tem vão por contorno.
 */
export function camadaFurada(rw: ResolvedWall, l: ResolvedLayer, bands: LayerBand[]): CamadaFurada | null {
  const fc = rw.furosContorno;
  if (!fc?.length) return null;
  const vaos = vaosDoContorno(fc);
  const prismas = bands.filter((b) => b.poly.length > 0);
  let malhas: CamadaFurada['malhas'] = null;
  if (prismas.length > 0 && prismas.every((b) => !b.slope)) {
    const feitas: NonNullable<CamadaFurada['malhas']> = [];
    for (let i = 0; i < prismas.length; i += LIMITE_PRISMAS) {
      const parte = prismas.slice(i, i + LIMITE_PRISMAS);
      const r = furarPrismaPorContorno({ wallId: rw.wallId, camadas: parte.map((b) => ({ poligonos: paraPlanta(rw, b.poly), z0: b.z0, z1: b.z1 })), vaos });
      if (!r || r.camadas.length !== parte.length) {
        feitas.length = 0;
        break;
      }
      r.camadas.forEach((malha, k) => feitas.push({ banda: parte[k]!, malha }));
    }
    if (feitas.length === prismas.length) malhas = feitas;
  }
  const retornos: ResultadoRetornoVao[] = [];
  for (const f of fc) {
    for (const r of f.retornos) {
      if (r.layerIndex !== l.layerIndex || !f.g.forma) continue;
      const res = retornoPorContorno({ contorno: outline(f.g.forma), x: f.g.offset, soleira: f.g.sill, espessura: r.espessura, recuo: r.recuo, y0: r.y0, y1: r.y1 });
      if (res) retornos.push(res);
    }
  }
  const efetivas = malhas ? bands : bandasRetangulares(bands, fc.map((f) => f.g));
  const removido = malhas ? malhas.reduce((s, m) => s + (m.malha.volumeSemFuro - m.malha.volume), 0) : 0;
  const volume = efetivas.reduce((s, b) => s + bandVolume(b), 0) - removido + retornos.reduce((s, r) => s + r.volume, 0);
  return { bands: efetivas, malhas, retornos, removido, volume };
}
