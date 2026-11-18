/**
 * Cliente de quantitativo e retorno do furo (`furo_quant_vao`, `furo_retorno_vao`, `furo_quant_parede`) contra o wasm real.
 * Só roda com um binário que traga as exportações (o commitado em `packages/geom/assets` as tem; `KERNEL_WASM_PATH` aponta outro).
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from './kernel/caminhoWasm.ts';
import { ErroKernelLeve } from './kernel/v2/erros.ts';
import { carregarFuroQuant, furoQuantCarregado, quantificarParede, quantificarVao, retornoDoContorno, type PontoContorno } from './furoQuant.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
const disponivel = ((): boolean => {
  if (!bytes) return false;
  try {
    const n = WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(bytes))).map((e) => e.name);
    return n.includes('furo_quant_vao') && n.includes('furo_retorno_vao') && n.includes('furo_quant_parede');
  } catch {
    return false;
  }
})();

const retangulo = (w: number, h: number): PontoContorno[] => [[w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0]];
function meiaLua(w: number, h: number, n: number): PontoContorno[] {
  const r = w / 2;
  const p: PontoContorno[] = [[r, 0]];
  for (let i = 0; i <= n; i++) p.push([r * Math.cos((Math.PI * i) / n), h - r + r * Math.sin((Math.PI * i) / n)]);
  p.push([-r, 0]);
  return p;
}
const lancado = (f: () => unknown): unknown => {
  try {
    f();
  } catch (e) {
    return e;
  }
  return null;
};

describe.skipIf(!disponivel)(`furoQuant (wasm com furo_quant_*; pulado sem elas em ${caminho})`, () => {
  beforeAll(async () => {
    await carregarFuroQuant(bytes as Uint8Array);
  });

  it('carrega', () => expect(furoQuantCarregado()).toBe(true));

  it('quantificarVao: retângulo e meia-lua', () => {
    const r = quantificarVao(retangulo(1.2, 2.1));
    expect(r).toMatchObject({ largura: 1.2, altura: 2.1 });
    expect(r.area).toBeCloseTo(2.52, 12);
    expect(r.perimetro).toBeCloseTo(6.6, 12);
    const m = quantificarVao(meiaLua(1, 2.2, 64));
    const exata = 1 * 1.7 + (Math.PI * 0.25) / 2;
    expect(exata - m.area).toBeGreaterThan(0);
    expect(exata - m.area).toBeLessThan(1e-3);
    expect(m.area).toBeLessThan(m.areaEnvelope);
  });

  it('retornoDoContorno: anel, recuo e malha', () => {
    const c = retangulo(1, 2.1);
    const r = retornoDoContorno({ contorno: c, x: 1.5, soleira: 0.1, espessura: 0.02, y0: 0, y1: 0.02 });
    expect(r.areaAnel).toBeCloseTo(2.1 - 0.96 * 2.06, 9);
    expect(r.volume).toBeCloseTo(r.areaAnel * 0.02, 9);
    expect(r.limitada).toBe(false);
    expect(r.indices.length % 3).toBe(0);
    const rr = retornoDoContorno({ contorno: c, x: 1.5, soleira: 0.1, espessura: 0.02, recuo: 0.015, y0: 0, y1: 0.02 });
    expect(rr.areaAnel).toBeCloseTo(0.97 * 2.07 - 0.93 * 2.03, 9);
    expect(retornoDoContorno({ contorno: c, x: 0, soleira: 0, espessura: 0.05, espessuraAcabamento: 0.025, y0: 0, y1: 0.1 }).limitada).toBe(true);
  });

  it('quantificarParede: removido = área do contorno x espessura total', () => {
    const c = meiaLua(0.9, 1.4, 48);
    const area = quantificarVao(c).area;
    const q = quantificarParede([{ contorno: c, x: 1.5, soleira: 0 }], [0.015, 0.02, 0.09, 0.02, 0.015], 3, 2.8);
    expect(q.camadas).toHaveLength(5);
    expect(q.volumeRemovido).toBeCloseTo(area * 0.16, 9);
    for (const k of q.camadas) expect(k.areaFuroNaFace).toBeCloseTo(area, 9);
  });

  it('entradas inválidas viram ErroKernelLeve (sem trap) e o módulo segue usável', () => {
    const horario = [...retangulo(1, 2)].reverse();
    expect(lancado(() => quantificarVao(horario))).toBeInstanceOf(ErroKernelLeve);
    expect(lancado(() => quantificarVao([]))).toBeInstanceOf(ErroKernelLeve);
    expect(lancado(() => quantificarVao([[0, 0], [1, 1], [1, 0], [0, 1]]))).toBeInstanceOf(ErroKernelLeve);
    expect(lancado(() => retornoDoContorno({ contorno: retangulo(1, 2), x: 0, soleira: 0, espessura: 0.6, y0: 0, y1: 0.1 }))).toBeInstanceOf(ErroKernelLeve);
    expect(lancado(() => retornoDoContorno({ contorno: retangulo(1, 2), x: 0, soleira: 0, espessura: Number.NaN, y0: 0, y1: 0.1 }))).toBeInstanceOf(ErroKernelLeve);
    expect(lancado(() => retornoDoContorno({ contorno: retangulo(1, 2), x: 0, soleira: 0, espessura: 0.02, y0: 0.1, y1: 0.1 }))).toBeInstanceOf(ErroKernelLeve);
    expect(lancado(() => quantificarParede([{ contorno: retangulo(1, 2), x: 5, soleira: 0 }], [0.1], 3, 3))).toBeInstanceOf(ErroKernelLeve);
    const grande: PontoContorno[] = Array.from({ length: 5000 }, (_, i) => [i, 0]);
    expect(lancado(() => quantificarVao(grande))).toBeInstanceOf(ErroKernelLeve);
    expect(quantificarVao(retangulo(1, 2)).area).toBeCloseTo(2, 12);
  });
});
