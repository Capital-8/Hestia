/**
 * Massa conceitual, ficha R2 (docs/massa/PLANO.md, A.4 regras 8, 10, 11 e 12; A.5): as consultas 141 `massa_planta`, 142 `massa_fatias`,
 * 144 `quant_massa` e 145 `massa_avisos` pela ABI real do kernel, com as massas de referência M1 (caixa: perfil livre retângulo 10 × 6, extrusão
 * de 9 m) e M3 (torre torcida: quadrado de lado 8, 30 m, rotação de 0 a π/2). As seções 140 a 142 e `niveis` são enviadas coluna por coluna (o
 * adaptador `kernelMassa.ts` é da ficha E1). Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { caminhoDoWasm } from "../packages/geom/src/kernel/caminhoWasm.ts";
import {
  CenaV2,
  type NomeConsulta,
} from "../packages/geom/src/kernel/v2/cena.ts";
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

interface Opcoes {
  /** Cópias da M1 em arranjo de volta completa em torno de (0, 0); 1 = sem arranjo. */
  copiasM1?: number;
}

/** Envia a M1 (massa 1) e a M3 (massa 3), as duas no nível 0 com a base na cota 0. */
function enviarM1eM3(cena: CenaV2, o: Opcoes = {}): void {
  const copias = o.copiasM1 ?? 1;
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
      arr_n: [copias, 1],
      arr_cx: [0, 0],
      arr_cy: [0, 0],
      arr_ang: [copias > 1 ? 2 * Math.PI : 0, 0],
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

/** Níveis de 3 em 3 m, de 0 a 30 (nivel_num 0 a 10). */
function enviarNiveis(cena: CenaV2): void {
  const n = Array.from({ length: 11 }, (_, i) => i);
  cena.definirSecao(
    "niveis",
    {
      id_num: n.map((i) => i + 1),
      nivel_num: n,
      cota: n.map((i) => i * 3),
    },
    n.length,
  );
}

/** Linhas de largura `k` de uma saída plana. */
function linhas(v: ArrayLike<number>, k: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < v.length; i += k)
    out.push(Array.from({ length: k }, (_, j) => v[i + j]!));
  return out;
}

/** Área (em módulo) de um anel `[x, y, x, y, ...]`. */
function area(p: ArrayLike<number>, inicio: number, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const [a, b] = [inicio + 2 * i, inicio + 2 * ((i + 1) % n)];
    s += p[a]! * p[b + 1]! - p[b]! * p[a + 1]!;
  }
  return Math.abs(s) / 2;
}

describe("massa, ficha R2: consultas 141, 142, 144 e 145 pela ABI real", () => {
  it.skipIf(!bytes)(
    "141 massa_planta: M1 e M3 com corte a 1,20 m (cortado, base projetada, topo acima)",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      const s = cena.consultar("massa_planta", [0, 1.2, 0, 1.2]);
      const l = linhas(s["linhas"]!, 4);
      // [massa_num, copia, estilo, n_pontos]: em cada massa o cortado, a seção da base (projetada) e a do topo (acima).
      expect(l).toEqual([
        [1, 0, 0, 64],
        [1, 0, 1, 64],
        [1, 0, 2, 64],
        [3, 0, 0, 64],
        [3, 0, 1, 64],
        [3, 0, 2, 64],
      ]);
      const p = s["pontos"]!;
      expect(p.length).toBe(2 * 6 * 64);
      // M1: os três anéis são o retângulo 10 × 6; o primeiro ponto é onde +x cruza o perfil.
      expect(Array.from(p.slice(0, 2))).toEqual([5, 0]);
      for (let i = 0; i < 3; i++)
        expect(Math.abs(area(p, i * 128, 64) - 60)).toBeLessThan(1e-9);
      // M3: os três anéis têm área 64; o cortado está girado 1,2 / 30 de 90° e o do topo, 90°.
      for (let i = 3; i < 6; i++)
        expect(Math.abs(area(p, i * 128, 64) - 64)).toBeLessThan(1e-6);
      const angulo = (i: number) => Math.atan2(p[i * 128 + 1]!, p[i * 128]!);
      expect(angulo(3)).toBeCloseTo(((1.2 / 30) * Math.PI) / 2, 12);
      expect(angulo(4)).toBeCloseTo(0, 12);
      expect(angulo(5)).toBeCloseTo(Math.PI / 2, 12);
      // Corte acima da M1 (9 m) e dentro da M3: a M1 não tem cortado nem acima; a faixa de vista só deixa a seção do topo dela.
      const alto = linhas(
        cena.consultar("massa_planta", [0, 10, 8, 10])["linhas"]!,
        4,
      );
      expect(alto.map((x) => [x[0], x[2]])).toEqual([
        [1, 1],
        [3, 0],
        [3, 2],
      ]);
      // Nível sem massa: saídas vazias. Cota não finita: ENTRADA.
      const vazio = cena.consultar("massa_planta", [7, 1.2, 0, 1.2]);
      expect([vazio["linhas"]!.length, vazio["pontos"]!.length]).toEqual([
        0, 0,
      ]);
      expect(
        codigoDe(() => cena.consultar("massa_planta", [0, Number.NaN, 0, 1])),
      ).toBe(CODIGOS.ENTRADA);
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "142 massa_fatias: M1 com 60 m² e 32 m, M3 com 64 m² em todos os níveis",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      // Sem a seção `niveis` não há fatia.
      const sem = cena.consultar("massa_fatias", [0]);
      expect(sem["fatias"]!.length).toBe(0);
      enviarNiveis(cena);
      const s = cena.consultar("massa_fatias", [0]);
      const f = linhas(s["fatias"]!, 4);
      const v = linhas(s["valores"]!, 3);
      // M1 (0 a 9 m): níveis 0 a 3. M3 (0 a 30 m): níveis 0 a 10. [massa_num, copia, nivel_alvo_num, n_pontos].
      expect(f).toEqual([
        ...[0, 1, 2, 3].map((n) => [1, 0, n, 64]),
        ...Array.from({ length: 11 }, (_, n) => [3, 0, n, 64]),
      ]);
      expect(s["pontos"]!.length).toBe(2 * 15 * 64);
      f.forEach((linha, i) => {
        const [a, per, z] = v[i]!;
        expect(z).toBe(linha[2]! * 3);
        if (linha[0] === 1) {
          expect(Math.abs(a! - 60)).toBeLessThan(1e-9);
          expect(Math.abs(per! - 32)).toBeLessThan(1e-9);
        } else {
          expect(Math.abs(a! - 64)).toBeLessThan(1e-6);
          expect(Math.abs(per! - 32)).toBeLessThan(1e-6);
        }
        expect(Math.abs(area(s["pontos"]!, i * 128, 64) - a!)).toBeLessThan(
          1e-9,
        );
      });
      // A fatia não depende do lod: pedir a malha em cada lod não muda a resposta.
      for (const lod of [0, 1, 2]) {
        cena.consultar("massa_malha", [0, lod]);
        const de_novo = cena.consultar("massa_fatias", [0]);
        expect(Array.from(de_novo["pontos"]!)).toEqual(
          Array.from(s["pontos"]!),
        );
        expect(Array.from(de_novo["valores"]!)).toEqual(
          Array.from(s["valores"]!),
        );
      }
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "144 quant_massa: M1 exata e M3 com o volume da malha lod 2",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      const s = cena.consultar("quant_massa", [0xffffffff]);
      expect(Array.from(s["linhas"]!)).toEqual([1, 3]);
      const v = linhas(s["valores"]!, 5);
      // [volume, area_lateral, area_base, area_topo, altura].
      const [m1, m3] = [v[0]!, v[1]!];
      expect(Math.abs(m1[0]! - 540)).toBeLessThan(1e-9);
      expect(Math.abs(m1[1]! - 32 * 9)).toBeLessThan(1e-9);
      expect(Math.abs(m1[2]! - 60)).toBeLessThan(1e-9);
      expect(Math.abs(m1[3]! - 60)).toBeLessThan(1e-9);
      expect(m1[4]).toBe(9);
      expect(Math.abs(m3[0]! - 1920)).toBeLessThanOrEqual(1920 * 0.005);
      expect(Math.abs(m3[2]! - 64)).toBeLessThan(1e-6);
      expect(Math.abs(m3[3]! - 64)).toBeLessThan(1e-6);
      expect(m3[4]).toBe(30);
      // A face torcida é maior que a do prisma reto de mesmo perímetro.
      expect(m3[1]!).toBeGreaterThan(32 * 30);
      // O volume da M3 é o da malha lod 2 (teorema da divergência sobre os triângulos).
      const malha = cena.consultar("massa_malha", [0, 2]);
      const [g, vt, ix] = [
        linhas(malha["grupos"]!, 5),
        malha["vertices"]!,
        malha["indices"]!,
      ];
      let vol = 0;
      for (const grupo of g.filter((x) => x[0] === 3)) {
        for (let i = grupo[3]!; i < grupo[3]! + grupo[4]!; i += 3) {
          const [a, b, c] = [ix[i]! * 3, ix[i + 1]! * 3, ix[i + 2]! * 3];
          vol +=
            (vt[a]! * (vt[b + 1]! * vt[c + 2]! - vt[b + 2]! * vt[c + 1]!) -
              vt[a + 1]! * (vt[b]! * vt[c + 2]! - vt[b + 2]! * vt[c]!) +
              vt[a + 2]! * (vt[b]! * vt[c + 1]! - vt[b + 1]! * vt[c]!)) /
            6;
        }
      }
      expect(Math.abs(m3[0]! - vol)).toBeLessThan(1e-9 * vol);
      // Arranjo: 4 cópias da M1 valem 4 vezes o volume e as áreas.
      enviarM1eM3(cena, { copiasM1: 4 });
      const q4 = linhas(cena.consultar("quant_massa", [0])["valores"]!, 5)[0]!;
      expect(Math.abs(q4[0]! - 4 * 540)).toBeLessThan(1e-6);
      expect(Math.abs(q4[1]! - 4 * 288)).toBeLessThan(1e-6);
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "145 massa_avisos: M1 sem aviso, M3 com face inclinada por pavimento, cópias sobrepostas",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      // Sem níveis não há pavimento a medir: nenhum aviso.
      const sem = cena.consultar("massa_avisos", [0]);
      expect([sem["avisos"]!.length, sem["valores"]!.length]).toEqual([0, 0]);
      enviarNiveis(cena);
      const s = cena.consultar("massa_avisos", [0]);
      const a = linhas(s["avisos"]!, 4);
      const v = linhas(s["valores"]!, 5);
      // [massa_num, codigo, copia, indice]: só a M3, código 4, um por pavimento (níveis 0 a 9; o nível do topo não abre pavimento).
      expect(a).toEqual(Array.from({ length: 10 }, (_, n) => [3, 4, 0, n]));
      // [medido, limite, x, y, z]: inclinação em graus acima do limite de 5°.
      for (const [medido, limite, x, y, z] of v) {
        expect(limite).toBe(5);
        expect(medido!).toBeGreaterThan(11);
        expect(medido!).toBeLessThan(11.7);
        expect([x, y, z].every((n) => Number.isFinite(n))).toBe(true);
      }
      // M1 em 4 cópias em volta do próprio centro: aviso 2 em cada nível dentro dela (0 a 3), com os 6 pares sobrepostos.
      enviarM1eM3(cena, { copiasM1: 4 });
      const c = cena.consultar("massa_avisos", [0]);
      const da_m1 = linhas(c["avisos"]!, 4).filter((x) => x[0] === 1);
      expect(da_m1).toEqual([0, 1, 2, 3].map((n) => [1, 2, 0, n]));
      const valores_m1 = linhas(c["valores"]!, 5).slice(0, 4);
      expect(valores_m1.map((x) => [x[0], x[1], x[4]])).toEqual(
        [0, 3, 6, 9].map((z) => [6, 0, z]),
      );
      // Determinismo: a mesma consulta devolve os mesmos números.
      const d = cena.consultar("massa_avisos", [0]);
      expect(Array.from(d["avisos"]!)).toEqual(Array.from(c["avisos"]!));
      expect(Array.from(d["valores"]!)).toEqual(Array.from(c["valores"]!));
      cena.destruir();
    },
  );

  it.skipIf(!bytes)(
    "erros: massa inválida dá ENTRADA nas quatro consultas (e na 143, da ficha R3)",
    () => {
      const cena = CenaV2.criar(ger!);
      enviarM1eM3(cena);
      enviarNiveis(cena);
      expect(codigoDe(() => cena.consultar("massa_fatias", [0]))).toBe(null);
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
      const consultas: [NomeConsulta, number[]][] = [
        ["massa_planta", [0, 1.2, 0, 1.2]],
        ["massa_fatias", [0]],
        ["quant_massa", [0]],
        ["massa_avisos", [0]],
      ];
      for (const [nome, args] of consultas)
        expect(codigoDe(() => cena.consultar(nome, args))).toBe(
          CODIGOS.ENTRADA,
        );
      expect(
        codigoDe(() => cena.consultar("massa_corte", [0, 0, 0, 1, 0, 100])),
      ).toBe(CODIGOS.ENTRADA);
      cena.destruir();
    },
  );
});
