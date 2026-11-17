/**
 * Adaptador `clienteFuroPrisma` contra o cliente de parede (`furarParedePorContorno`) no mesmo wasm.
 * Só roda com `KERNEL_WASM_PATH` apontando para um binário que traga `furo_prisma_*` e `furo_contorno_*`; sem isso, pula.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { carregarFuroContorno, carregarFuroPrisma, furarParedePorContorno, type VaoContorno } from '@hestia/geom';
import { clienteFuroPrisma } from './furoClienteEngine.ts';
import type { PedidoFuroParede } from './furoContornoDespacho.ts';

const caminho = process.env.KERNEL_WASM_PATH ?? '';
const bytes = caminho && existsSync(caminho) ? readFileSync(caminho) : null;

function temAsDuasAbis(b: Uint8Array | null): boolean {
  if (!b) return false;
  try {
    const nomes = WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(b))).map((e) => e.name);
    return nomes.includes('furo_prisma_furar') && nomes.includes('furo_contorno_furar');
  } catch {
    return false;
  }
}

/** Meia-lua w x h, aberta, anti-horário, origem no meio da base. */
function meiaLua(w: number, h: number, n: number): [number, number][] {
  const r = w / 2;
  const nasc = h - r;
  const p: [number, number][] = [[r, 0]];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n;
    p.push([r * Math.cos(a), nasc + r * Math.sin(a)]);
  }
  p.push([-r, 0]);
  return p;
}

describe.skipIf(!temAsDuasAbis(bytes))('clienteFuroPrisma (pulado sem KERNEL_WASM_PATH com furo_prisma_* e furo_contorno_*)', () => {
  beforeAll(async () => {
    await carregarFuroContorno(bytes as Uint8Array);
    await carregarFuroPrisma(bytes as Uint8Array);
  });

  it('dá o mesmo volume e removido que o cliente de parede para uma parede com duas camadas e um vão', () => {
    const contorno = meiaLua(0.9, 1.4, 24);
    const pedido: PedidoFuroParede = {
      wallId: 'p1',
      comprimento: 3,
      altura: 2.8,
      espessuras: [0.1, 0.2],
      vaos: [{ openingId: 'v1', contorno, x: 1.5, soleira: 0 }],
    };
    const r = clienteFuroPrisma().furarParede(pedido);
    expect(r).not.toBeNull();
    const vaos: VaoContorno[] = [{ contorno, x: 1.5, soleira: 0 }];
    const ref = furarParedePorContorno(vaos, [0.1, 0.2], 3, 2.8);
    expect(r!.camadas.map((c) => [c.y0, c.y1])).toEqual([
      [0, 0.1],
      [0.1, 0.1 + 0.2],
    ]);
    expect(Math.abs(r!.volumeRemovido - ref.volumeRemovido)).toBeLessThan(1e-9);
    expect(Math.abs(r!.volume - ref.volumeTotal)).toBeLessThan(1e-9);
    r!.camadas.forEach((c, k) => {
      expect(Math.abs(c.volume - ref.camadas[k]!.volume)).toBeLessThan(1e-9);
      expect(c.indices.length).toBe(ref.camadas[k]!.indices.length);
    });
  });
});
