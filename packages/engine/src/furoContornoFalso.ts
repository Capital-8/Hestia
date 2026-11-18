import type { OPt } from '@hestia/model';
import type { ClienteFuroContorno, MalhaPrismaFurada, PedidoFuroPrisma, PedidoRetornoVao, ResultadoFuroPrisma, ResultadoRetornoVao } from './furoContornoDespacho.ts';

/**
 * Cliente FALSO e determinístico do furo por contorno, para testes e para desenvolver antes do wasm (docs/estudo-esquadrias/26).
 * Não faz booleana: mede por geometria analítica (área do polígono recortada pela caixa do prisma x área do contorno convexo) e
 * devolve como "malha" a caixa do prisma. Vale para prismas sem recorte interno e contornos convexos (todas as formas do modelo).
 */
type Pt = readonly [number, number];

const areaDe = (r: readonly Pt[]): number => Math.abs(r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length]![1] - r[(i + 1) % r.length]![0] * y, 0)) / 2;

/** Sutherland-Hodgman contra o semiplano `eixo` >= v (ou <= v com `maior` falso). */
function corta(r: readonly Pt[], eixo: 0 | 1, v: number, maior: boolean): Pt[] {
  const dentro = (p: Pt): boolean => (maior ? p[eixo] >= v : p[eixo] <= v);
  const out: Pt[] = [];
  r.forEach((p, i) => {
    const q = r[(i + 1) % r.length]!;
    if (dentro(p)) out.push(p);
    if (dentro(p) !== dentro(q)) {
      const t = (v - p[eixo]) / (q[eixo] - p[eixo]);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  });
  return out;
}

const perimetroDe = (r: readonly OPt[]): number => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length]![0] - p[0], r[(i + 1) % r.length]![1] - p[1]), 0);

function caixa(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): { vertices: Float64Array; indices: Uint32Array } {
  const v: number[] = [];
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) v.push(x, y, z);
  return { vertices: new Float64Array(v), indices: new Uint32Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]) };
}

export interface ClienteFalso extends ClienteFuroContorno {
  chamadas: { prisma: number; retorno: number };
}

/** `prisma: false` / `retorno: false` omitem o método da porta (para provar o recuo retangular e a ausência de retorno). */
export function clienteFuroContornoFalso(opts: { prisma?: boolean; retorno?: boolean } = {}): ClienteFalso {
  const chamadas = { prisma: 0, retorno: 0 };
  const furarPrisma = (pedido: PedidoFuroPrisma): ResultadoFuroPrisma => {
    chamadas.prisma++;
    const camadas = pedido.camadas.map((c): MalhaPrismaFurada => {
      const area = c.poligonos.reduce((s, poly) => s + poly.reduce((a, ring, i) => a + (i === 0 ? 1 : -1) * areaDe(ring), 0), 0);
      const pts = c.poligonos.flatMap((p) => p[0]!);
      const u0 = Math.min(...pts.map((q) => q[0])), u1 = Math.max(...pts.map((q) => q[0]));
      const s0 = Math.min(...pts.map((q) => q[1])), s1 = Math.max(...pts.map((q) => q[1]));
      let removido = 0;
      for (const v of pedido.vaos) {
        let r: Pt[] = v.contorno.map(([x, z]): Pt => [x + v.x, z + v.soleira]);
        r = corta(corta(corta(corta(r, 1, c.z0, true), 1, c.z1, false), 0, u0, true), 0, u1, false);
        if (r.length >= 3) removido += areaDe(r) * (s1 - s0);
      }
      const m = caixa(u0, s0, c.z0, u1, s1, c.z1);
      return { z0: c.z0, z1: c.z1, ...m, volume: area * (c.z1 - c.z0) - removido, volumeSemFuro: area * (c.z1 - c.z0) };
    });
    return { camadas, volume: camadas.reduce((s, m) => s + m.volume, 0), volumeRemovido: camadas.reduce((s, m) => s + m.volumeSemFuro - m.volume, 0) };
  };
  const retornoDoVao = (p: PedidoRetornoVao): ResultadoRetornoVao => {
    chamadas.retorno++;
    const xs = p.contorno.map((q) => q[0] + p.x), zs = p.contorno.map((q) => q[1] + p.soleira);
    const m = caixa(Math.min(...xs), p.y0, Math.min(...zs), Math.max(...xs), p.y1, Math.max(...zs));
    return { ...m, volume: perimetroDe(p.contorno) * p.espessura * (p.y1 - p.y0), areaExposta: perimetroDe(p.contorno) * (p.y1 - p.y0) };
  };
  return {
    chamadas,
    furarParede: () => null,
    ...(opts.prisma === false ? {} : { furarPrisma }),
    ...(opts.retorno === false ? {} : { retornoDoVao }),
  };
}
