/**
 * Estrutura, ficha K2 (docs/estrutura/PLANO.md): as consultas 200 `estr_malha` e 205 `estr_perfil` pelo wasm REAL (ABI v2), com as seções 19 e
 * 200 a 204 montadas à mão (o adaptador TS é da ficha R1). Roda só em `npm run test:wasm`. Fixtures da A.10: E1, E3, E5 e E9.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from '../caminhoWasm.ts';
import { CenaV2 } from './cena.ts';
import { ErroKernelLeve } from './erros.ts';
import { CODIGOS, NIVEL_TODOS } from './esquema.gerado.ts';
import { GerenciadorKernelV2 } from './gerenciador.ts';

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

const AUSENTE = 4294967295;
const u32 = (xs: number[]): Uint32Array => Uint32Array.from(xs);
const f64 = (xs: number[]): Float64Array => Float64Array.from(xs);
const u8 = (xs: number[]): Uint8Array => Uint8Array.from(xs);

/** Pilar E1 (0,20 × 0,40, altura 3,00, no nível 0) com o tipo 1; pilar 2 do tipo 2 (perfil I da E3) no nível 1; viga E5 do tipo 1. */
function montar(cena: CenaV2): void {
  cena.definirSecao('niveis', { id_num: u32([1, 2]), nivel_num: u32([0, 1]), cota: f64([0, 3]) }, 2);
  const nan = [NaN, NaN];
  cena.definirSecao(
    'tipos_pilar',
    { id_num: u32([1, 2]), disciplina: u8([1, 1]), forma: u8([0, 4]), p0: f64([0.2, 0.1]), p1: f64([0.4, 0.2]), p2: f64([NaN, 0.008]), p3: f64([NaN, 0.005]), p4: f64(nan), p5: f64(nan), perfil_num: u32([AUSENTE, AUSENTE]), material_num: u32([7, 8]), espessura_camadas: f64([0, 0]) },
    2,
  );
  cena.definirSecao(
    'pilares',
    { id_num: u32([1, 2]), nivel_num: u32([0, 1]), tipo_num: u32([1, 2]), disciplina: u8([1, 1]), px: f64([0, 4]), py: f64([0, 0]), rotacao: f64([0, 0.5]), deslocamento_base: f64([0, 0]), nivel_topo_num: u32([AUSENTE, AUSENTE]), deslocamento_topo: f64([0, 0]), altura: f64([3, 3]), hosp_num: u32([AUSENTE, AUSENTE]) },
    2,
  );
  cena.definirSecao('tipos_viga', { id_num: u32([1]), forma: u8([0]), p0: f64([0.15]), p1: f64([0.4]), p2: f64([NaN]), p3: f64([NaN]), p4: f64([NaN]), p5: f64([NaN]), perfil_num: u32([AUSENTE]), material_num: u32([9]) }, 1);
  cena.definirSecao(
    'vigas',
    { id_num: u32([5]), nivel_num: u32([0]), tipo_num: u32([1]), ax: f64([0]), ay: f64([0]), bx: f64([5]), by: f64([0]), deslocamento_z_a: f64([3]), deslocamento_z_b: f64([3]), alinhamento: u8([0]), rotacao: f64([0]), extremidade_a: u8([0]), extremidade_b: u8([0]) },
    1,
  );
}

/** Volume com sinal dos triângulos de um grupo (divergência). */
function volumeDoGrupo(v: ArrayLike<number>, idx: ArrayLike<number>, primeiro: number, n: number): number {
  let s = 0;
  for (let i = primeiro; i < primeiro + n; i += 3) {
    const [a, b, c] = [idx[i]!, idx[i + 1]!, idx[i + 2]!].map((k) => [v[3 * k]!, v[3 * k + 1]!, v[3 * k + 2]!] as const);
    s += (a![0] * (b![1] * c![2] - b![2] * c![1]) - a![1] * (b![0] * c![2] - b![2] * c![0]) + a![2] * (b![0] * c![1] - b![1] * c![0])) / 6;
  }
  return s;
}

const codigoDe = (f: () => unknown): number | null => {
  try {
    f();
    return null;
  } catch (e) {
    if (e instanceof ErroKernelLeve) return e.codigo;
    throw e;
  }
};

describe('estrutura, ficha K2: consultas 200 e 205 no Rust real', () => {
  it.skipIf(!bytes)('estr_malha devolve pilares e vigas com os volumes da A.10', () => {
    const cena = CenaV2.criar(ger!, montar);
    const s = cena.consultar('estr_malha', [NIVEL_TODOS, 2]);
    expect(Object.keys(s)).toEqual(['grupos', 'vertices', 'indices']);
    const g = Array.from(s['grupos']!);
    expect(g.length).toBe(18);
    // Ordem: categoria (0 pilar, 1 viga), elemento, parte; material do tipo.
    const chaves = [0, 1, 2].map((k) => g.slice(6 * k, 6 * k + 4));
    expect(chaves).toEqual([[1, 0, 0, 7], [2, 0, 0, 8], [5, 1, 0, 9]]);
    const vol = (k: number) => volumeDoGrupo(s['vertices']!, s['indices']!, g[6 * k + 4]!, g[6 * k + 5]!);
    expect(vol(0)).toBeCloseTo(0.24, 12);
    expect(vol(1)).toBeCloseTo(0.00756, 12);
    expect(vol(2)).toBeCloseTo(0.3, 12);
    // Só o nível 0: o pilar 1 e a viga 5.
    const s0 = cena.consultar('estr_malha', [0, 1]);
    expect(Array.from(s0['grupos']!).filter((_, i) => i % 6 === 0)).toEqual([1, 5]);
    expect(codigoDe(() => cena.consultar('estr_malha', [0, 3]))).toBe(CODIGOS.ENTRADA);
    cena.destruir();
  });

  it.skipIf(!bytes)('estr_perfil devolve anéis, furos e medidas; perfil inválido dá ENTRADA', () => {
    const cena = CenaV2.criar(ger!, () => {});
    const tubo = cena.consultar('estr_perfil', [NIVEL_TODOS, 6, 0.1, 0.1, 0.005, NaN, NaN, NaN, 0]);
    expect(Array.from(tubo['aneis']!)).toEqual([0, 4, 1, 4]);
    expect(tubo['pontos']!.length).toBe(16);
    expect(tubo['medidas']![0]).toBeCloseTo(0.0019, 12);
    const circulo = cena.consultar('estr_perfil', [0, 1, 0.3, NaN, NaN, NaN, NaN, NaN, 0]);
    expect(Array.from(circulo['aneis']!)).toEqual([0, 96]);
    // E9: L personalizado de 6 vértices (área por Shoelace), recentrado na caixa.
    const l = [0, 0, 0.3, 0, 0.3, 0.05, 0.05, 0.05, 0.05, 0.4, 0, 0.4];
    const perso = cena.consultar('estr_perfil', [0, 8, NaN, NaN, NaN, NaN, NaN, NaN, 1, 6, ...l]);
    expect(Array.from(perso['aneis']!)).toEqual([0, 6]);
    expect(perso['medidas']![0]).toBeCloseTo(0.3 * 0.05 + 0.35 * 0.05, 12);
    expect(Math.min(...Array.from(perso['pontos']!).filter((_, i) => i % 2 === 1))).toBeCloseTo(-0.2, 12);
    // E10: I com tf >= h/2 e anel cruzado.
    expect(codigoDe(() => cena.consultar('estr_perfil', [0, 4, 0.1, 0.2, 0.1, 0.005, NaN, NaN, 0]))).toBe(CODIGOS.ENTRADA);
    expect(codigoDe(() => cena.consultar('estr_perfil', [0, 8, NaN, NaN, NaN, NaN, NaN, NaN, 1, 4, 0, 0, 1, 1, 1, 0, 0, 1]))).toBe(CODIGOS.ENTRADA);
    cena.destruir();
  });
});
