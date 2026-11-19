import { outline, type OPt, type OpeningShape } from '@hestia/model';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { bandVolume } from './profile.ts';
import { furosDe } from './resolveMemo.ts';
import { openingHole } from './openingCut.ts';
import { clienteFuroContorno, formaDoVao, furarPrismaPorContorno, quantificarParedePorContorno, retornoPorContorno, type MalhaPrismaFurada, type PedidoFuroPrisma, type ResultadoRetornoVao, type VaoComContorno } from './furoContornoDespacho.ts';
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
export function bandasRetangulares(bands: LayerBand[], gs: OpeningGeometry[]): LayerBand[] {
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

/**
 * Topo inclinado de uma faixa no referencial (u, s) da parede, ou `undefined` se a faixa é plana. `null` quando o plano não é
 * um plano em u da parede (direção ou origem diferentes de `a`, `u`): o chamador recua para faixas retangulares.
 */
export function topoDaFaixa(rw: Pick<ResolvedWall, 'a' | 'u'>, b: LayerBand): { t0: number; t1: number; h0: number; h1: number } | undefined | null {
  const s = b.slope;
  if (!s) return undefined;
  const mesmoEixo = Math.abs(s.d.x - rw.u.x) < 1e-9 && Math.abs(s.d.y - rw.u.y) < 1e-9 && Math.hypot(s.o.x - rw.a.x, s.o.y - rw.a.y) < 1e-9;
  if (!mesmoEixo || !(s.t1 > s.t0)) return null;
  const c = (h: number): number => Math.min(b.z1, Math.max(b.z0, h));
  return { t0: s.t0, t1: s.t1, h0: c(s.h0), h1: c(s.h1) };
}

export interface CamadaFurada {
  /** Faixas efetivas: as mesmas de entrada quando o cliente furou; recortadas em retângulo no recuo. */
  bands: LayerBand[];
  /** Malhas furadas (uma por faixa não vazia, na ordem de `bands`); `null` no recuo retangular. */
  malhas: Array<{ banda: LayerBand; malha: MalhaPrismaFurada }> | null;
  /** Retornos do acabamento que seguem o contorno (só na camada envolvente). */
  retornos: ResultadoRetornoVao[];
  // units-ok: comentário
  /** Volume removido pelos contornos (m³); 0 no recuo retangular (as faixas já vêm furadas). */
  removido: number;
  // units-ok: comentário
  /** Volume líquido da camada (m³): faixas, menos o removido, mais os retornos. */
  volume: number;
  // units-ok: comentário
  /** Volume das faixas efetivas inteiras, sem o furo e sem o retorno (m³). */
  volumeBruto: number;
  /**
   * units-ok: comentário.
   * Área do(s) contorno(s) na face da camada (m²): a medida na malha da placa pela `furo_quant_parede` (via cliente) quando
   * há; senão `null` (a área de face cai em `removido` ÷ espessura). Nula no recuo retangular (as faixas já vêm furadas).
   */
  areaFuroNaFace: number | null;
}

/**
 * Raio assinado do eixo (`k * R`, `k = +1` com o centro à direita de a -> b) quando a parede é curva, senão `undefined`. Todos os
 * vãos da parede têm o mesmo arco (`OpeningGeometry.curve`). O referencial local do Rust (origem em `a`, `u` = tangente em `a`) é
 * o de `paraPlanta`/`malhaParaMundo`.
 */
export function raioDaParede(fc: readonly FuroContornoDaParede[]): number | undefined {
  const arc = fc.find((f) => f.g.curve)?.g.curve?.arc;
  return arc ? arc.k * arc.radius : undefined;
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
  const raio = raioDaParede(fc);
  const prismas = bands.filter((b) => b.poly.length > 0);
  let malhas: CamadaFurada['malhas'] = null;
  const topos = prismas.map((b) => topoDaFaixa(rw, b));
  // Faixa com topo inclinado só segue por contorno com o cliente que o aceita; sem ele (ou com plano fora do eixo), recua para retângulo.
  // Parede curva: o prisma não tem topo inclinado (o perfil já a deixa retangular na rota); faixa com `slope` recua para retângulo.
  if (prismas.length > 0 && topos.every((t) => t !== null) && (clienteFuroContorno()?.topoInclinado === true || topos.every((t) => t === undefined)) && (raio === undefined || topos.every((t) => t === undefined))) {
    const feitas: NonNullable<CamadaFurada['malhas']> = [];
    for (let i = 0; i < prismas.length; i += LIMITE_PRISMAS) {
      const parte = prismas.slice(i, i + LIMITE_PRISMAS);
      const r = furarPrismaPorContorno({ wallId: rw.wallId, camadas: parte.map((b, k) => {
          const topo = topos[i + k];
          return { poligonos: paraPlanta(rw, b.poly), z0: b.z0, z1: b.z1, ...(topo ? { topo } : {}) };
        }), vaos, ...(raio !== undefined ? { raio } : {}) });
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
      if (r.recorte && r.recorte.length === 0) continue; // a vizinha cobre toda a pegada do retorno
      const contorno = outline(f.g.forma);
      // Vão que toca o piso (peitoril 0): o retorno não reveste a soleira, como o do vão retangular (docs/estudo-esquadrias/33 §2.1).
      const semBase = f.g.sill + Math.min(...contorno.map((q) => q[1])) <= 1e-6;
      const res = retornoPorContorno({ contorno, x: f.g.offset, soleira: f.g.sill, espessura: r.espessura, recuo: r.recuo, y0: r.y0, y1: r.y1, ...(semBase ? { semBase } : {}), ...(r.recorte ? { recorte: paraPlanta(rw, r.recorte) } : {}), ...(raio !== undefined ? { raio } : {}) });
      if (res) retornos.push(res);
    }
  }
  const efetivas = malhas ? bands : bandasRetangulares(bands, fc.map((f) => f.g));
  const removido = malhas ? malhas.reduce((s, m) => s + (m.malha.volumeSemFuro - m.malha.volume), 0) : 0;
  const volumeBruto = efetivas.reduce((s, b) => s + bandVolume(b), 0);
  const volume = volumeBruto - removido + retornos.reduce((s, r) => s + r.volume, 0);
  return { bands: efetivas, malhas, retornos, removido, volume, volumeBruto, areaFuroNaFace: malhas && raio === undefined ? areaFuroNaFaceDaParede(rw, vaos) : null };
}

/**
 * Área dos contornos na face da parede, medida na malha da placa pela `furo_quant_parede` (via cliente): contorno recortado pela
 * placa `comprimento x altura`. `null` sem cliente, sem a medição ou se a placa não comporta os vãos (o cliente recusa; por
 * exemplo, topo em perfil mais baixo que o arco). A camada é a mesma para qualquer espessura, então a placa é de 0,1 m.
 */
function areaFuroNaFaceDaParede(rw: ResolvedWall, vaos: VaoComContorno[]): number | null {
  // Perfil de topo ou de base: o furo na face é recortado pelo perfil, não pela placa retangular; a malha das faixas é a medida.
  if (rw.profileTop || rw.profileBottom) return null;
  const altura = Math.max(...(rw.layers.flatMap((l) => l.bands.map((b) => b.z1))), 0);
  if (!(altura > 0) || !(rw.length > 0)) return null;
  const r = quantificarParedePorContorno({ wallId: rw.wallId, comprimento: rw.length, altura, vaos });
  return r ? r.areaFuroNaFace : null;
}

/**
 * units-ok: comentário.
 * Área do vão de um tipo no quadro (m²): a REAL do contorno quando há forma válida e cliente do furo (o vão fura por contorno),
 * senão `largura x altura` como sempre. A forma vem do vão bruto (`openingShapeOf`); [I] parede curva/inclinada também mostra a real.
 */
export function areaDoVaoDoTipo(t: Parameters<typeof formaDoVao>[0], height: number): number {
  const { forma } = clienteFuroContorno() ? formaDoVao(t, height) : { forma: undefined };
  return forma ? areaPerimetroDoContorno(forma).area : t.width * height;
}
