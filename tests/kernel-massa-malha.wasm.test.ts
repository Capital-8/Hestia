/**
 * Massa conceitual, ficha R1 (docs/massa/PLANO.md, A.4 e A.5): a consulta 140 `massa_malha` pela ABI real do kernel, com a massa de referência
 * M1 (caixa: perfil livre retângulo 10 × 6, extrusão de 9 m, linear, resolução 64). Confere as contagens de grupos, vértices e índices, o volume e
 * os códigos de erro. As seções 140 a 142 são enviadas coluna por coluna (o adaptador `kernelMassa.ts` é da ficha E1).
 * Roda só em `npm run test:wasm`.
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

interface OpcoesM1 {
  resolucao?: number;
  copias?: number;
  zBase?: number;
}

/** Envia a M1 (massa 1, nível 0): uma linha em `massas`, duas em `massa_secoes` e os 8 pontos dos dois retângulos em `massa_pontos`. */
function enviarM1(cena: CenaV2, o: OpcoesM1 = {}): void {
  const copias = o.copias ?? 1;
  cena.definirSecao(
    "massas",
    {
      id_num: [1],
      nivel_num: [0],
      ox: [0],
      oy: [0],
      z_base: [o.zBase ?? 0],
      interp: [0],
      resolucao: [o.resolucao ?? 64],
      arr_n: [copias],
      arr_cx: [copias > 1 ? 20 : 0],
      arr_cy: [0],
      arr_ang: [copias > 1 ? 2 * Math.PI : 0],
    },
    1,
  );
  cena.definirSecao(
    "massa_secoes",
    {
      id_num: [10, 11],
      massa_num: [1, 1],
      ordem: [0, 1],
      z: [0, 9],
      forma: [3, 3],
      p1: [0, 0],
      p2: [0, 0],
      lados: [0, 0],
      rot: [0, 0],
      escala: [1, 1],
      dx: [0, 0],
      dy: [0, 0],
    },
    2,
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

/** Volume com sinal pelo teorema da divergência (positivo com as normais para fora). */
function volume(
  vertices: ArrayLike<number>,
  indices: ArrayLike<number>,
): number {
  let v = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [
      indices[i]! * 3,
      indices[i + 1]! * 3,
      indices[i + 2]! * 3,
    ];
    const [ax, ay, az] = [vertices[a]!, vertices[a + 1]!, vertices[a + 2]!];
    const [bx, by, bz] = [vertices[b]!, vertices[b + 1]!, vertices[b + 2]!];
    const [cx, cy, cz] = [vertices[c]!, vertices[c + 1]!, vertices[c + 2]!];
    v +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return v;
}

/** Cada aresta orientada aparece uma vez e a inversa também (cada aresta em exatamente 2 triângulos, orientação coerente). */
function fechada(indices: ArrayLike<number>): boolean {
  const arestas = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const chave = `${indices[i + k]!}>${indices[i + ((k + 1) % 3)]!}`;
      arestas.set(chave, (arestas.get(chave) ?? 0) + 1);
    }
  }
  for (const [chave, n] of arestas) {
    const [a, b] = chave.split(">");
    if (n !== 1 || arestas.get(`${b}>${a}`) !== 1) return false;
  }
  return arestas.size > 0;
}

describe("massa, ficha R1: consulta 140 (massa_malha) pela ABI real", () => {
  it.skipIf(!bytes)(
    "M1: contagens de grupos, vértices e índices nos três lod",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1(cena);
      for (const lod of [0, 1, 2]) {
        const s = cena.consultar("massa_malha", [0, lod]);
        const [grupos, vertices, indices] = [
          s["grupos"]!,
          s["vertices"]!,
          s["indices"]!,
        ];
        // Extrusão linear sem torção: 2 anéis de 64 pontos (as 4 quinas do retângulo caem na grade de 64).
        expect(vertices.length).toBe(128 * 3);
        // Lateral: 64 quadriláteros = 128 triângulos; cada tampa: 64 - 2 = 62 triângulos.
        expect(indices.length).toBe(3 * (128 + 62 + 62));
        // [massa_num, copia, papel, primeiro_indice, n_indices]: lateral, base e topo.
        expect(Array.from(grupos)).toEqual([
          1, 0, 0, 0, 384, 1, 0, 1, 384, 186, 1, 0, 2, 570, 186,
        ]);
        expect(fechada(indices)).toBe(true);
        expect(Math.abs(volume(vertices, indices) - 540)).toBeLessThan(1e-9);
        // Primeiro vértice: t = 0 no anel da base, onde +x cruza o retângulo. Último anel na cota 9.
        expect(Array.from(vertices.slice(0, 3))).toEqual([5, 0, 0]);
        expect(vertices[vertices.length - 1]).toBe(9);
      }
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "filtro de nível, cota da base, arranjo e determinismo",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1(cena, { copias: 3, zBase: 2.5 });
      const a = cena.consultar("massa_malha", [0, 1]);
      const b = cena.consultar("massa_malha", [0xffffffff, 1]);
      expect(Array.from(a["grupos"]!)).toEqual(Array.from(b["grupos"]!));
      expect(Array.from(a["vertices"]!)).toEqual(Array.from(b["vertices"]!));
      expect(Array.from(a["indices"]!)).toEqual(Array.from(b["indices"]!));
      // 3 cópias, 3 grupos cada, na ordem cópia e papel.
      const g = Array.from(a["grupos"]!);
      expect(g.length).toBe(9 * 5);
      expect(g.filter((_, i) => i % 5 === 1)).toEqual([
        0, 0, 0, 1, 1, 1, 2, 2, 2,
      ]);
      expect(g.filter((_, i) => i % 5 === 2)).toEqual([
        0, 1, 2, 0, 1, 2, 0, 1, 2,
      ]);
      expect(a["vertices"]!.length).toBe(3 * 128 * 3);
      expect(fechada(a["indices"]!)).toBe(true);
      expect(
        Math.abs(volume(a["vertices"]!, a["indices"]!) - 3 * 540),
      ).toBeLessThan(1e-6);
      expect(a["vertices"]![2]).toBe(2.5);
      // Cópia 1 = cópia 0 girada 120° em torno de (20, 0).
      const [x0, y0] = [a["vertices"]![0]!, a["vertices"]![1]!];
      const ang = (2 * Math.PI) / 3;
      expect(a["vertices"]![128 * 3]!).toBeCloseTo(
        20 + (x0 - 20) * Math.cos(ang) - y0 * Math.sin(ang),
        9,
      );
      expect(a["vertices"]![128 * 3 + 1]!).toBeCloseTo(
        (x0 - 20) * Math.sin(ang) + y0 * Math.cos(ang),
        9,
      );
      // Nível sem massa: três saídas vazias.
      const vazio = cena.consultar("massa_malha", [7, 1]);
      expect([
        vazio["grupos"]!.length,
        vazio["vertices"]!.length,
        vazio["indices"]!.length,
      ]).toEqual([0, 0, 0]);
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "erros: lod fora da faixa e massa inválida dão ENTRADA; a cena continua válida",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1(cena);
      expect(codigoDe(() => cena.consultar("massa_malha", [0, 3]))).toBe(
        CODIGOS.ENTRADA,
      );
      // Resolução fora de 16..128: o dado entra, a conferência da consulta recusa.
      enviarM1(cena, { resolucao: 8 });
      expect(codigoDe(() => cena.consultar("massa_malha", [0, 1]))).toBe(
        CODIGOS.ENTRADA,
      );
      // NaN é recusado já ao definir a seção, e a seção anterior fica intacta.
      const nan = {
        id_num: [1],
        nivel_num: [0],
        ox: [Number.NaN],
        oy: [0],
        z_base: [0],
        interp: [0],
        resolucao: [64],
        arr_n: [1],
        arr_cx: [0],
        arr_cy: [0],
        arr_ang: [0],
      };
      expect(codigoDe(() => cena.definirSecao("massas", nan, 1))).toBe(
        CODIGOS.ENTRADA,
      );
      enviarM1(cena);
      expect(cena.consultar("massa_malha", [0, 1])["indices"]!.length).toBe(
        756,
      );
      cena.destruir();
    },
  );
});
