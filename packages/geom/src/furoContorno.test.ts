/**
 * Cliente do furo por contorno contra o wasm que traz `furo_contorno_*`.
 *
 * O artefato commitado em `packages/geom/assets` ainda não tem essas exportações, então a suíte só roda com um
 * binário novo apontado por `KERNEL_WASM_PATH`, por exemplo:
 *   node scripts/build-wasm.mjs --saida <pasta>
 *   KERNEL_WASM_PATH=<pasta>/geom_wasm.wasm npx vitest run packages/geom/src/furoContorno.test.ts
 * Sem isso, a suíte é pulada e o título diz por quê.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from './kernel/caminhoWasm.ts';
import { ErroKernelGrave, ErroKernelLeve } from './kernel/v2/erros.ts';
import { CODIGOS } from './kernel/v2/esquema.gerado.ts';
import { carregarFuroContorno, furarParedePorContorno, furoContornoCarregado, type VaoContorno } from './furoContorno.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;

function temExportacaoDeFuro(b: Uint8Array | null): boolean {
  if (!b) return false;
  try {
    return WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(b))).some((e) => e.name === 'furo_contorno_furar');
  } catch {
    return false;
  }
}

const disponivel = temExportacaoDeFuro(bytes);
const titulo = disponivel
  ? 'furarParedePorContorno (wasm com furo_contorno_*)'
  : `furarParedePorContorno (pulado: wasm com furo_contorno_* ausente em ${caminho}; defina KERNEL_WASM_PATH)`;

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

/** Arco abatido w x h com flecha f (mesma construção do teste Rust). */
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

const areaMeiaLuaExata = (w: number, h: number): number => w * (h - w / 2) + (Math.PI * (w / 2) ** 2) / 2;

function areaArcoExata(w: number, h: number, f: number): number {
  const r = ((w * w) / 4 + f * f) / (2 * f);
  const theta = 2 * Math.asin(w / 2 / r);
  return w * (h - f) + (r * r * (theta - Math.sin(theta))) / 2;
}

const CAMADAS = [0.1, 0.2];
const COMPRIMENTO = 3;
const ALTURA = 2.8;

describe.skipIf(!disponivel)(titulo, () => {
  beforeAll(async () => {
    await carregarFuroContorno(bytes as Uint8Array);
  });

  it('carrega e confere a versão', () => {
    expect(furoContornoCarregado()).toBe(true);
  });

  it('meia-lua: volume removido = área do contorno x espessura (por camada e no total)', () => {
    for (const n of [24, 64]) {
      const ring = meiaLua(0.9, 1.4, n);
      const area = areaComSinal(ring);
      const vaos: VaoContorno[] = [{ contorno: ring, x: 1.5, soleira: 0 }];
      const r = furarParedePorContorno(vaos, CAMADAS, COMPRIMENTO, ALTURA);
      expect(r.camadas).toHaveLength(CAMADAS.length);
      r.camadas.forEach((c, k) => {
        expect(Math.abs(c.volumeSemFuro - c.volume - area * (CAMADAS[k] as number))).toBeLessThan(1e-9);
        expect(c.y1 - c.y0).toBeCloseTo((CAMADAS[k] as number), 12);
      });
      const esperadoTotal = area * CAMADAS.reduce((s, e) => s + e, 0);
      expect(Math.abs(r.volumeRemovido - esperadoTotal)).toBeLessThan(1e-9);
      // Contra a curva exata: o polígono inscrito perde área pela sagita (< 0,1 % com 24 cordas).
      const exato = areaMeiaLuaExata(0.9, 1.4) * CAMADAS.reduce((s, e) => s + e, 0);
      expect(Math.abs(r.volumeRemovido - exato) / exato).toBeLessThan(1e-3);
    }
  });

  it('arco abatido: volume removido = área do contorno x espessura, e contra a área exata', () => {
    const ring = arcoAbatido(1.2, 1.5, 0.2, 48);
    const area = areaComSinal(ring);
    const r = furarParedePorContorno([{ contorno: ring, x: 2, soleira: 0 }], [0.16], 4, ALTURA);
    expect(Math.abs(r.volumeRemovido - area * 0.16)).toBeLessThan(1e-9);
    const exato = areaArcoExata(1.2, 1.5, 0.2) * 0.16;
    expect(Math.abs(r.volumeRemovido - exato) / exato).toBeLessThan(1e-3);
  });

  it('dois vãos: o removido é a soma das áreas x espessura', () => {
    const a = meiaLua(0.9, 1.4, 24);
    const b = arcoAbatido(1.2, 1.5, 0.2, 24);
    const area = areaComSinal(a) + areaComSinal(b);
    const vaos: VaoContorno[] = [
      { contorno: a, x: 1, soleira: 0 },
      { contorno: b, x: 3, soleira: 0 },
    ];
    const r = furarParedePorContorno(vaos, CAMADAS, 4.5, ALTURA);
    expect(Math.abs(r.volumeRemovido - area * CAMADAS.reduce((s, e) => s + e, 0))).toBeLessThan(1e-9);
  });

  it('sem vão: devolve a placa inteira (8 vértices e 36 índices por camada), sem volume removido', () => {
    const r = furarParedePorContorno([], CAMADAS, COMPRIMENTO, ALTURA);
    expect(Math.abs(r.volumeRemovido)).toBeLessThan(1e-12);
    expect(r.volumeTotal).toBeCloseTo(COMPRIMENTO * ALTURA * 0.3, 9);
    for (const c of r.camadas) {
      expect(c.vertices).toHaveLength(8 * 3);
      expect(c.indices).toHaveLength(36);
      expect(Math.max(...c.indices)).toBeLessThan(8);
    }
  });

  it('índices são locais e múltiplos de 3, e o vértice x,y,z é o da malha', () => {
    const r = furarParedePorContorno([{ contorno: meiaLua(0.9, 1.4, 24), x: 1.5, soleira: 0 }], CAMADAS, COMPRIMENTO, ALTURA);
    for (const c of r.camadas) {
      expect(c.indices.length % 3).toBe(0);
      const nv = c.vertices.length / 3;
      expect(c.indices.every((i) => i < nv)).toBe(true);
    }
  });

  it('erros: espessura zero, contorno horário e vão fora da parede são ENTRADA (leve)', () => {
    const ring = meiaLua(0.9, 1.4, 24);
    const horario = [...ring].reverse();
    const casos: [string, () => unknown][] = [
      ['espessura zero', () => furarParedePorContorno([{ contorno: ring, x: 1.5, soleira: 0 }], [0], COMPRIMENTO, ALTURA)],
      ['contorno horário', () => furarParedePorContorno([{ contorno: horario, x: 1.5, soleira: 0 }], CAMADAS, COMPRIMENTO, ALTURA)],
      ['vão fora da parede', () => furarParedePorContorno([{ contorno: ring, x: 10, soleira: 0 }], CAMADAS, COMPRIMENTO, ALTURA)],
    ];
    for (const [nome, chamada] of casos) {
      let erro: unknown = null;
      try {
        chamada();
      } catch (e) {
        erro = e;
      }
      expect(erro, nome).toBeInstanceOf(ErroKernelLeve);
      expect((erro as ErroKernelLeve).codigo, nome).toBe(CODIGOS.ENTRADA);
      expect((erro as ErroKernelLeve).message, nome).toMatch(/ENTRADA/);
    }
  });

  it('erro de limite (33 camadas, acima de 32) é LIMITE (leve)', () => {
    const esp = Array.from({ length: 33 }, () => 0.01);
    let erro: unknown = null;
    try {
      furarParedePorContorno([], esp, COMPRIMENTO, ALTURA);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroKernelLeve);
    expect((erro as ErroKernelLeve).codigo).toBe(CODIGOS.LIMITE);
  });

  it('depois de um erro, a chamada seguinte com entrada válida funciona (saídas e erro são limpos)', () => {
    expect(() => furarParedePorContorno([], [0], COMPRIMENTO, ALTURA)).toThrow(ErroKernelLeve);
    const ring = meiaLua(0.9, 1.4, 24);
    const r = furarParedePorContorno([{ contorno: ring, x: 1.5, soleira: 0 }], [0.16], COMPRIMENTO, ALTURA);
    expect(Math.abs(r.volumeRemovido - areaComSinal(ring) * 0.16)).toBeLessThan(1e-9);
  });

  it('ErroKernelGrave não é usado para entrada inválida', () => {
    try {
      furarParedePorContorno([], [-1], COMPRIMENTO, ALTURA);
      expect.unreachable();
    } catch (e) {
      expect(e).not.toBeInstanceOf(ErroKernelGrave);
    }
  });
});
