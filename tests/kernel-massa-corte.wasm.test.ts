/**
 * Massa conceitual, ficha R3 (docs/massa/PLANO.md, A.4 regra 9; A.5): a consulta 143 `massa_corte` pela ABI real do kernel, com as massas de
 * referência M1 (caixa: perfil livre retângulo 10 × 6, extrusão de 9 m) e M3 (torre torcida: quadrado de lado 8, 30 m, rotação de 0 a π/2).
 * As seções 140 a 142 são enviadas coluna por coluna (o adaptador `kernelMassa.ts` é da ficha E1). Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { caminhoDoWasm } from "../packages/geom/src/kernel/caminhoWasm.ts";
import { CenaV2 } from "../packages/geom/src/kernel/v2/cena.ts";
import { ErroKernelLeve } from "../packages/geom/src/kernel/v2/erros.ts";
import { CODIGOS } from "../packages/geom/src/kernel/v2/esquema.gerado.ts";
import { GerenciadorKernelV2 } from "../packages/geom/src/kernel/v2/gerenciador.ts";

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

const codigoDe = (f: () => unknown): number | null => {
  try {
    f();
    return null;
  } catch (e) {
    if (e instanceof ErroKernelLeve) return e.codigo;
    throw e;
  }
};

/** Envia a M1 (massa 1) e a M3 (massa 3), as duas no nível 0 com a base na cota 0. */
function enviarM1eM3(cena: CenaV2): void {
  cena.definirSecao(
    "massas",
    {
      id_num: [1, 3],
      nivel_num: [0, 0],
      ox: [0, 0],
      oy: [0, 0],
      z_base: [0, 0],
      interp: [0, 0],
      resolucao: [64, 64],
      arr_n: [1, 1],
      arr_cx: [0, 0],
      arr_cy: [0, 0],
      arr_ang: [0, 0],
    },
    2,
  );
  // M1: seções 10 e 11 (livre). M3: seções 30 e 31 (polígono de 4 lados, raio 4·√2, emenda E3).
  const raio = 4 * Math.SQRT2;
  cena.definirSecao(
    "massa_secoes",
    {
      id_num: [10, 11, 30, 31],
      massa_num: [1, 1, 3, 3],
      ordem: [0, 1, 0, 1],
      z: [0, 9, 0, 30],
      forma: [3, 3, 2, 2],
      p1: [0, 0, raio, raio],
      p2: [0, 0, 0, 0],
      lados: [0, 0, 4, 4],
      rot: [0, 0, 0, Math.PI / 2],
      escala: [1, 1, 1, 1],
      dx: [0, 0, 0, 0],
      dy: [0, 0, 0, 0],
    },
    4,
  );
  const ret = [
    [-5, -3],
    [5, -3],
    [5, 3],
    [-5, 3],
  ];
  cena.definirSecao(
    "massa_pontos",
    {
      id_num: [1, 2, 3, 4, 5, 6, 7, 8],
      secao_num: [10, 10, 10, 10, 11, 11, 11, 11],
      ordem: [0, 1, 2, 3, 0, 1, 2, 3],
      x: [...ret, ...ret].map((p) => p[0]!),
      y: [...ret, ...ret].map((p) => p[1]!),
    },
    8,
  );
}

/** Uma linha do corte: `[massa_num, copia, estilo, n_pontos]` e os pontos `(s, z)`. */
interface Linha {
  massa: number;
  copia: number;
  estilo: number;
  pontos: [number, number][];
}

function ler(
  l: ArrayLike<number>,
  p: ArrayLike<number>,
): { linhas: Linha[]; usados: number } {
  const linhas: Linha[] = [];
  let k = 0;
  for (let i = 0; i < l.length; i += 4) {
    const n = l[i + 3]!;
    const pontos: [number, number][] = [];
    for (let j = 0; j < n; j++) pontos.push([p[k++]!, p[k++]!]);
    linhas.push({ massa: l[i]!, copia: l[i + 1]!, estilo: l[i + 2]!, pontos });
  }
  return { linhas, usados: k };
}

function corte(
  cena: CenaV2,
  args: number[],
  esperado = true,
): { linhas: Linha[]; bruto: Record<string, ArrayLike<number>> } {
  const s = cena.consultar("massa_corte", args);
  const { linhas, usados } = ler(s["linhas"]!, s["pontos"]!);
  // A saída é toda consumida pelas linhas, e finita.
  if (esperado) expect(usados).toBe(s["pontos"]!.length);
  expect(Array.from(s["pontos"]!).every((v) => Number.isFinite(v))).toBe(true);
  return { linhas, bruto: s };
}

/** Área (em módulo) de um laço fechado que repete o primeiro ponto no fim. */
function area(p: [number, number][]): number {
  let s = 0;
  for (let i = 0; i + 1 < p.length; i++)
    s += p[i]![0] * p[i + 1]![1] - p[i + 1]![0] * p[i]![1];
  return Math.abs(s) / 2;
}

function caixa(p: [number, number][]): [number, number, number, number] {
  const s = p.map((q) => q[0]);
  const z = p.map((q) => q[1]);
  return [Math.min(...s), Math.max(...s), Math.min(...z), Math.max(...z)];
}

describe("massa, ficha R3: consulta 143 massa_corte pela ABI real", () => {
  it.skipIf(!bytes)(
    "M1 cortada pelo meio: um polígono cortado de 10 × 9 (e de 6 × 9 pela outra direção)",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      const { linhas } = corte(cena, [0, 0, 0, 1, 0, 50]);
      const c = linhas.filter((l) => l.massa === 1 && l.estilo === 0);
      expect(c.length).toBe(1);
      // Quatro cantos mais o primeiro repetido: laço fechado, como o guarda_corte.
      expect(c[0]!.pontos.length).toBe(5);
      expect(c[0]!.pontos[0]).toEqual(c[0]!.pontos[4]);
      expect(Math.abs(area(c[0]!.pontos) - 90)).toBeLessThan(1e-9);
      const [s0, s1, z0, z1] = caixa(c[0]!.pontos);
      expect([s1 - s0, z0, z1]).toEqual([10, 0, 9]);
      const y = corte(cena, [0, 0, 0, 0, 1, 50]).linhas.filter(
        (l) => l.massa === 1 && l.estilo === 0,
      );
      expect(Math.abs(area(y[0]!.pontos) - 54)).toBeLessThan(1e-9);
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "M1 em elevação: sem polígono cortado, contorno projetado igual à fachada 10 × 9",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      // Plano em y = -20 ao longo de x, olhando para +y, profundidade grande.
      const { linhas } = corte(cena, [0, 0, -20, 1, 0, 100]);
      const m1 = linhas.filter((l) => l.massa === 1);
      expect(m1.filter((l) => l.estilo === 0).length).toBe(0);
      const p = m1.filter((l) => l.estilo === 1);
      expect(p.length).toBe(1);
      expect(p[0]!.pontos.length).toBe(5);
      const [s0, s1, z0, z1] = caixa(p[0]!.pontos);
      expect([s0, s1, z0, z1]).toEqual([-5, 5, 0, 9]);
      expect(Math.abs(area(p[0]!.pontos) - 90)).toBeLessThan(1e-9);
      // De costas (direção invertida) a massa fica fora do lado visível: nada da M1.
      const costas = corte(cena, [0, 0, -20, -1, 0, 100]).linhas;
      expect(costas.length).toBe(0);
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "M3 (torre torcida): corte fechado ao longo de toda a altura e feições de elevação",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      // Corte pelo eixo: um polígono fechado de 0 a 30 m, com a largura entre os lados (4) e a diagonal (5,657 · 2).
      const { linhas } = corte(cena, [0, 0, 0, 1, 0, 50]);
      const c = linhas.filter((l) => l.massa === 3 && l.estilo === 0);
      expect(c.length).toBe(1);
      expect(c[0]!.pontos[0]).toEqual(c[0]!.pontos[c[0]!.pontos.length - 1]);
      const [s0, s1, z0, z1] = caixa(c[0]!.pontos);
      expect([z0, z1]).toEqual([0, 30]);
      expect(s1 - s0).toBeGreaterThan(8);
      expect(s1 - s0).toBeLessThanOrEqual(8 * Math.SQRT2 + 1e-6);
      expect(area(c[0]!.pontos)).toBeGreaterThan(0);
      // Elevação por y = -20: duas horizontais (seções z = 0 e 30) e as curvas das duas quinas voltadas ao observador.
      const e = corte(cena, [0, 0, -20, 1, 0, 100]).linhas.filter(
        (l) => l.massa === 3,
      );
      expect(e.filter((l) => l.estilo === 0).length).toBe(0);
      expect(e.filter((l) => l.estilo === 1).length).toBe(1);
      const f = e.filter((l) => l.estilo === 3);
      const horizontais = f.filter((l) => l.pontos.length === 2);
      const curvas = f.filter((l) => l.pontos.length > 2);
      expect(horizontais.map((l) => l.pontos[0]![1]).sort((a, b) => a - b)).toEqual(
        [0, 30],
      );
      expect(curvas.length).toBe(2);
      // As feições não repetem o primeiro ponto, e as curvas sobem.
      for (const k of curvas)
        for (let i = 1; i < k.pontos.length; i++)
          expect(k.pontos[i]![1]).toBeGreaterThan(k.pontos[i - 1]![1]);
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "determinismo, nível sem massa, entrada com NaN e massa inválida",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      const a = cena.consultar("massa_corte", [0, 0.3, -1, 1, 0.4, 100]);
      const b = cena.consultar("massa_corte", [0, 0.3, -1, 1, 0.4, 100]);
      expect(Array.from(b["linhas"]!)).toEqual(Array.from(a["linhas"]!));
      expect(Array.from(b["pontos"]!)).toEqual(Array.from(a["pontos"]!));
      expect(a["linhas"]!.length).toBeGreaterThan(0);
      // Nível sem massa e direção nula: saídas vazias.
      for (const args of [
        [7, 0, 0, 1, 0, 50],
        [0, 0, 0, 0, 0, 50],
        [0, 0, 0, 1, 0, -1],
      ]) {
        const v = cena.consultar("massa_corte", args);
        expect([v["linhas"]!.length, v["pontos"]!.length]).toEqual([0, 0]);
      }
      expect(
        codigoDe(() => cena.consultar("massa_corte", [0, Number.NaN, 0, 1, 0, 50])),
      ).toBe(CODIGOS.ENTRADA);
      // Resolução fora de 16..128: o dado entra, a conferência da consulta recusa.
      cena.upsert(
        "massas",
        {
          id_num: [1],
          nivel_num: [0],
          ox: [0],
          oy: [0],
          z_base: [0],
          interp: [0],
          resolucao: [8],
          arr_n: [1],
          arr_cx: [0],
          arr_cy: [0],
          arr_ang: [0],
        },
        1,
      );
      expect(
        codigoDe(() => cena.consultar("massa_corte", [0, 0, 0, 1, 0, 50])),
      ).toBe(CODIGOS.ENTRADA);
      cena.destruir();
    },
  );
});
