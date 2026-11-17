/**
 * Cliente do furo de prisma contra o wasm que traz `furo_prisma_*` (e `furo_contorno_*`, para a paridade).
 *
 * O artefato commitado em `packages/geom/assets` ainda não tem essas exportações, então a suíte só roda com um binário novo
 * apontado por `KERNEL_WASM_PATH`, por exemplo:
 *   node scripts/build-wasm.mjs --saida <pasta>
 *   KERNEL_WASM_PATH=<pasta>/geom_wasm.wasm npx vitest run packages/geom/src/furoPrisma.test.ts
 * Sem isso, a suíte é pulada e o título diz por quê.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from './kernel/caminhoWasm.ts';
import { ErroKernelGrave, ErroKernelLeve } from './kernel/v2/erros.ts';
import { CODIGOS } from './kernel/v2/esquema.gerado.ts';
import { carregarFuroContorno, furarParedePorContorno, type VaoContorno } from './furoContorno.ts';
import { carregarFuroPrisma, furarPrismas, furoPrismaCarregado, type CamadaPrisma, type PoligonoPlanta } from './furoPrisma.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;

function exportaFuroPrisma(b: Uint8Array | null): boolean {
  if (!b) return false;
  try {
    const nomes = WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(b))).map((e) => e.name);
    return nomes.includes('furo_prisma_furar') && nomes.includes('furo_contorno_furar');
  } catch {
    return false;
  }
}

const disponivel = exportaFuroPrisma(bytes);
const titulo = disponivel
  ? 'furarPrismas (wasm com furo_prisma_* e furo_contorno_*)'
  : `furarPrismas (pulado: wasm com furo_prisma_* ausente em ${caminho}; defina KERNEL_WASM_PATH)`;

type Ponto = [number, number];

/** Meia-lua w x h, nascença em h - w/2, aberto, anti-horário, origem no meio da base. */
function meiaLua(w: number, h: number, n: number): Ponto[] {
  const r = w / 2;
  const nasc = h - r;
  const p: Ponto[] = [[r, 0]];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n;
    p.push([r * Math.cos(a), nasc + r * Math.sin(a)]);
  }
  p.push([-r, 0]);
  return p;
}

/** Arco abatido w x h com flecha f (a mesma construção de `furoContorno.test.ts`). */
function arcoAbatido(w: number, h: number, f: number, n: number): Ponto[] {
  const r = (w * w) / 4 + f * f;
  const raio = r / (2 * f);
  const zc = h - raio;
  const nasc = h - f;
  const a0 = Math.atan((nasc - zc) / (w / 2));
  const a1 = Math.PI - a0;
  const p: Ponto[] = [[w / 2, 0]];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push([raio * Math.cos(a), zc + raio * Math.sin(a)]);
  }
  p.push([-w / 2, 0]);
  return p;
}

/** Área com sinal (shoelace): positiva para anti-horário. */
function areaComSinal(ring: readonly Ponto[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i] as Ponto;
    const [x2, y2] = ring[(i + 1) % ring.length] as Ponto;
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Área líquida de um polígono em planta: externo menos furos, em valor absoluto. */
function areaPoligono(pol: PoligonoPlanta): number {
  const [externo, ...furos] = pol;
  return Math.abs(areaComSinal(externo as Ponto[])) - furos.reduce((s, f) => s + Math.abs(areaComSinal(f as Ponto[])), 0);
}

const retangulo = (u0: number, u1: number, s0: number, s1: number): Ponto[] => [
  [u0, s0],
  [u1, s0],
  [u1, s1],
  [u0, s1],
];

const areaMeiaLuaExata = (w: number, h: number): number => w * (h - w / 2) + (Math.PI * (w / 2) ** 2) / 2;

function areaArcoExata(w: number, h: number, f: number): number {
  const r = ((w * w) / 4 + f * f) / (2 * f);
  const theta = 2 * Math.asin(w / 2 / r);
  return w * (h - f) + (r * r * (theta - Math.sin(theta))) / 2;
}

const CAMADAS = [0.1, 0.2];
const ESPESSURA_TOTAL = CAMADAS.reduce((s, e) => s + e, 0);
const COMPRIMENTO = 3;
const ALTURA = 2.8;

/** Parede de camadas retangulares: cada camada é `[0, comprimento] x [y0, y1]` em planta, de z = 0 a `altura`. */
function paredeRetangular(espessuras: readonly number[], comprimento: number, altura: number): CamadaPrisma[] {
  let y0 = 0;
  return espessuras.map((e) => {
    const y1 = y0 + e;
    const camada: CamadaPrisma = { poligonos: [[retangulo(0, comprimento, y0, y1)]], z0: 0, z1: altura };
    y0 = y1;
    return camada;
  });
}

function lancado(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  return null;
}

describe.skipIf(!disponivel)(titulo, () => {
  beforeAll(async () => {
    await carregarFuroContorno(bytes as Uint8Array);
    await carregarFuroPrisma(bytes as Uint8Array);
  });

  it('carrega e confere a versão', () => {
    expect(furoPrismaCarregado()).toBe(true);
  });

  it('meia-lua numa parede retangular: volume removido = área do contorno x espessura (por camada e no total)', () => {
    for (const n of [24, 64]) {
      const ring = meiaLua(0.9, 1.4, n);
      const area = areaComSinal(ring);
      const vaos: VaoContorno[] = [{ contorno: ring, x: 1.5, soleira: 0 }];
      const r = furarPrismas(paredeRetangular(CAMADAS, COMPRIMENTO, ALTURA), vaos);
      expect(r.camadas).toHaveLength(CAMADAS.length);
      r.camadas.forEach((c, k) => {
        const e = CAMADAS[k] as number;
        expect(Math.abs(c.volumeSemFuro - COMPRIMENTO * e * ALTURA)).toBeLessThan(1e-9);
        expect(Math.abs(c.volumeSemFuro - c.volume - area * e)).toBeLessThan(1e-9);
      });
      expect(Math.abs(r.volumeRemovido - area * ESPESSURA_TOTAL)).toBeLessThan(1e-9);
      // Contra a curva exata: o polígono inscrito perde área pela sagita (< 0,1 % com 24 cordas).
      const exato = areaMeiaLuaExata(0.9, 1.4) * ESPESSURA_TOTAL;
      expect(Math.abs(r.volumeRemovido - exato) / exato).toBeLessThan(1e-3);
    }
  });

  it('arco abatido numa parede retangular: volume removido = área do contorno x espessura, e contra a área exata', () => {
    const ring = arcoAbatido(1.2, 1.5, 0.2, 48);
    const area = areaComSinal(ring);
    const r = furarPrismas(paredeRetangular([0.16], 4, ALTURA), [{ contorno: ring, x: 2, soleira: 0 }]);
    expect(Math.abs(r.volumeRemovido - area * 0.16)).toBeLessThan(1e-9);
    const exato = areaArcoExata(1.2, 1.5, 0.2) * 0.16;
    expect(Math.abs(r.volumeRemovido - exato) / exato).toBeLessThan(1e-3);
  });

  it('paridade com furarParedePorContorno na parede retangular: volumes por camada, removido e malha batem', () => {
    const vaos: VaoContorno[] = [
      { contorno: meiaLua(0.9, 1.4, 24), x: 1, soleira: 0 },
      { contorno: arcoAbatido(1.2, 1.5, 0.2, 24), x: 2.4, soleira: 0 },
    ];
    const a = furarPrismas(paredeRetangular(CAMADAS, COMPRIMENTO, ALTURA), vaos);
    const b = furarParedePorContorno(vaos, CAMADAS, COMPRIMENTO, ALTURA);
    expect(Math.abs(a.volumeRemovido - b.volumeRemovido)).toBeLessThan(1e-9);
    expect(Math.abs(a.volume - b.volumeTotal)).toBeLessThan(1e-9);
    a.camadas.forEach((c, k) => {
      const d = b.camadas[k]!;
      expect(Math.abs(c.volume - d.volume)).toBeLessThan(1e-9);
      expect(Math.abs(c.volumeSemFuro - d.volumeSemFuro)).toBeLessThan(1e-9);
      expect(c.indices).toHaveLength(d.indices.length);
    });
  });

  it('esquadria em planta (ponta a 45 graus): meia-lua longe da ponta remove área x espessura da planta', () => {
    // Planta em (u, s): trapézio com a ponta em u = 0. Entre u = 0,3 e u = 3 a espessura é 0,30.
    const planta: PoligonoPlanta = [
      [
        [0, 0],
        [3, 0],
        [3, 0.3],
        [0.3, 0.3],
      ],
    ];
    const ring = meiaLua(0.9, 1.4, 24);
    const area = areaComSinal(ring);
    const r = furarPrismas([{ poligonos: [planta], z0: 0, z1: ALTURA }], [{ contorno: ring, x: 1.5, soleira: 0 }]);
    expect(Math.abs(r.camadas[0]!.volumeSemFuro - areaPoligono(planta) * ALTURA)).toBeLessThan(1e-9);
    expect(Math.abs(r.volumeRemovido - area * 0.3)).toBeLessThan(1e-9);
    expect(r.volumeRemovido).toBeLessThan(area * 0.3 + 1e-12);
  });

  it('recorte em planta (furo interno que não cruza o vão): removido = área x espessura, líquido = área externa - furo', () => {
    const externo = retangulo(0, 3, 0, 0.3);
    const furo = retangulo(2.4, 2.6, 0.1, 0.2);
    const planta: PoligonoPlanta = [externo, furo];
    const ring = meiaLua(0.9, 1.4, 24);
    const r = furarPrismas([{ poligonos: [planta], z0: 0, z1: ALTURA }], [{ contorno: ring, x: 1.5, soleira: 0 }]);
    const liquida = areaPoligono(planta);
    expect(liquida).toBeCloseTo(0.9 - 0.02, 12);
    expect(Math.abs(r.camadas[0]!.volumeSemFuro - liquida * ALTURA)).toBeLessThan(1e-9);
    expect(Math.abs(r.volumeRemovido - areaComSinal(ring) * 0.3)).toBeLessThan(1e-9);
  });

  it('dois polígonos disjuntos na mesma camada: volume líquido é a soma', () => {
    const p1: PoligonoPlanta = [retangulo(0, 1, 0, 0.3)];
    const p2: PoligonoPlanta = [retangulo(2, 3, 0, 0.3)];
    const r = furarPrismas([{ poligonos: [p1, p2], z0: 0, z1: ALTURA }], []);
    expect(Math.abs(r.camadas[0]!.volumeSemFuro - 2 * 0.3 * ALTURA)).toBeLessThan(1e-9);
    expect(Math.abs(r.volume - 2 * 0.3 * ALTURA)).toBeLessThan(1e-9);
  });

  it('sem vão: devolve a placa inteira, sem volume removido, com índices locais e múltiplos de 3', () => {
    const r = furarPrismas(paredeRetangular(CAMADAS, COMPRIMENTO, ALTURA), []);
    expect(Math.abs(r.volumeRemovido)).toBeLessThan(1e-12);
    expect(Math.abs(r.volume - COMPRIMENTO * ALTURA * ESPESSURA_TOTAL)).toBeLessThan(1e-9);
    for (const c of r.camadas) {
      expect(c.indices.length % 3).toBe(0);
      const nv = c.vertices.length / 3;
      expect(c.indices.every((i) => i < nv)).toBe(true);
    }
  });

  it('a malha de cada camada fica no seu prisma: y (espessura) entre a planta e z entre z0 e z1', () => {
    const r = furarPrismas(paredeRetangular(CAMADAS, COMPRIMENTO, ALTURA), [{ contorno: meiaLua(0.9, 1.4, 24), x: 1.5, soleira: 0 }]);
    let y0 = 0;
    r.camadas.forEach((c, k) => {
      const e = CAMADAS[k] as number;
      for (let i = 0; i < c.vertices.length; i += 3) {
        const x = c.vertices[i]!;
        const y = c.vertices[i + 1]!;
        const z = c.vertices[i + 2]!;
        expect(x).toBeGreaterThanOrEqual(-1e-12);
        expect(x).toBeLessThanOrEqual(COMPRIMENTO + 1e-12);
        expect(y).toBeGreaterThanOrEqual(y0 - 1e-12);
        expect(y).toBeLessThanOrEqual(y0 + e + 1e-12);
        expect(z).toBeGreaterThanOrEqual(-1e-12);
        expect(z).toBeLessThanOrEqual(ALTURA + 1e-12);
      }
      y0 += e;
    });
  });

  it('erros de entrada são ENTRADA (leve), e o de limite é LIMITE', () => {
    const ring = meiaLua(0.9, 1.4, 24);
    const horario = [...ring].reverse();
    const parede = paredeRetangular(CAMADAS, COMPRIMENTO, ALTURA);
    const casos: [string, () => unknown, number][] = [
      ['camada sem polígono', () => furarPrismas([{ poligonos: [], z0: 0, z1: ALTURA }], []), CODIGOS.ENTRADA],
      ['z1 <= z0', () => furarPrismas([{ poligonos: [[retangulo(0, 1, 0, 0.1)]], z0: 1, z1: 1 }], []), CODIGOS.ENTRADA],
      ['contorno horário', () => furarPrismas(parede, [{ contorno: horario, x: 1.5, soleira: 0 }]), CODIGOS.ENTRADA],
      ['vão fora da parede', () => furarPrismas(parede, [{ contorno: ring, x: 10, soleira: 0 }]), CODIGOS.ENTRADA],
      ['33 camadas', () => furarPrismas(paredeRetangular(Array.from({ length: 33 }, () => 0.01), COMPRIMENTO, ALTURA), []), CODIGOS.LIMITE],
    ];
    for (const [nome, chamada, codigo] of casos) {
      const erro = lancado(chamada);
      expect(erro, nome).toBeInstanceOf(ErroKernelLeve);
      expect((erro as ErroKernelLeve).codigo, nome).toBe(codigo);
      expect(erro, nome).not.toBeInstanceOf(ErroKernelGrave);
    }
  });

  it('depois de um erro, a chamada seguinte com entrada válida funciona (saídas e erro são limpos)', () => {
    expect(lancado(() => furarPrismas([{ poligonos: [], z0: 0, z1: ALTURA }], []))).toBeInstanceOf(ErroKernelLeve);
    const ring = meiaLua(0.9, 1.4, 24);
    const r = furarPrismas(paredeRetangular([0.16], COMPRIMENTO, ALTURA), [{ contorno: ring, x: 1.5, soleira: 0 }]);
    expect(Math.abs(r.volumeRemovido - areaComSinal(ring) * 0.16)).toBeLessThan(1e-9);
  });
});
