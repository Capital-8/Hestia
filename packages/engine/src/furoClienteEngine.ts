/**
 * Cliente do furo da parede pela ABI de prisma (`furo_prisma_furar`, docs/estudo-esquadrias/25): implementa a porta
 * `ClienteFuroContorno` do despacho. Fica no engine e não em `geom`, porque `geom` não pode depender do engine
 * (scripts/check-boundaries.mjs) e a porta é do engine.
 *
 * Cada camada de espessura da parede vira um prisma de planta retangular `[0, comprimento] x [y0, y1]`, extrudado de z = 0 até
 * a altura. Com planta retangular, o resultado é o mesmo de `furarParedePorContorno` (ABI de parede); o ganho da ABI de prisma
 * aparece quando a planta da camada não é retangular, o que este pedido ainda não carrega (ver `PedidoFuroParede`).
 *
 * Não instala o cliente: `definirClienteFuroContorno(clienteFuroPrisma())` é decisão de quem chama. Só funciona depois de
 * `carregarFuroPrisma`; sem ele, devolve `null` e o chamador segue o caminho retangular. Erros do wasm (ENTRADA, LIMITE,
 * INTERNO) são lançados, como no cliente de parede.
 */
import { furarPrismas, furoPrismaCarregado, type CamadaPrisma } from '@hestia/geom';
import type { ClienteFuroContorno, PedidoFuroParede, ResultadoFuroParede } from './furoContornoDespacho.ts';

/** Cliente da porta `ClienteFuroContorno` sobre a ABI de prisma. */
export function clienteFuroPrisma(): ClienteFuroContorno {
  return {
    furarParede(pedido: PedidoFuroParede): ResultadoFuroParede | null {
      if (!furoPrismaCarregado()) return null;
      const faixas: { y0: number; y1: number }[] = [];
      let y0 = 0;
      for (const e of pedido.espessuras) {
        faixas.push({ y0, y1: y0 + e });
        y0 += e;
      }
      const camadas: CamadaPrisma[] = faixas.map(({ y0: a, y1: b }) => ({
        poligonos: [[[
          [0, a],
          [pedido.comprimento, a],
          [pedido.comprimento, b],
          [0, b],
        ]]],
        z0: 0,
        z1: pedido.altura,
      }));
      const vaos = pedido.vaos.map((v) => ({
        contorno: v.contorno.map(([x, z]) => [x, z] as const),
        x: v.x,
        soleira: v.soleira,
      }));
      const r = furarPrismas(camadas, vaos);
      return {
        camadas: r.camadas.map((c, k) => ({
          y0: faixas[k]!.y0,
          y1: faixas[k]!.y1,
          vertices: c.vertices,
          indices: c.indices,
          volume: c.volume,
          volumeSemFuro: c.volumeSemFuro,
        })),
        volume: r.volume,
        volumeRemovido: r.volumeRemovido,
      };
    },
  };
}
