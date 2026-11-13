/**
 * Estrutura, ficha K4 (docs/estrutura/PLANO.md): as consultas 201 `estr_planta`, 202 `estr_corte`, 203 `estr_quant`, 204 `estr_avisos`,
 * 206 `estr_juncoes` e 207 `estr_apoio` pelo wasm REAL (ABI v2), com as seções montadas à mão (o adaptador TS é da ficha R1).
 * Roda só em `npm run test:wasm`. Fixtures da A.10: E1, E5, E6 e E7.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from '../caminhoWasm.ts';
import { CenaV2 } from './cena.ts';
import { NIVEL_TODOS } from './esquema.gerado.ts';
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
const nan = (n: number): number[] => Array<number>(n).fill(NaN);

/** E6: pilares estruturais E1 (0,20 × 0,40, altura 3,00) em (0, 0) e (5, 0); viga E5 de (0, 0) a (5, 0) com o topo em 3,00; sapata E7 sob o pilar 1. */
function montar(cena: CenaV2): void {
  cena.definirSecao('niveis', { id_num: u32([1]), nivel_num: u32([0]), cota: f64([0]) }, 1);
  cena.definirSecao(
    'tipos_pilar',
    { id_num: u32([1]), disciplina: u8([1]), forma: u8([0]), p0: f64([0.2]), p1: f64([0.4]), p2: f64(nan(1)), p3: f64(nan(1)), p4: f64(nan(1)), p5: f64(nan(1)), perfil_num: u32([AUSENTE]), material_num: u32([7]), espessura_camadas: f64([0]) },
    1,
  );
  cena.definirSecao(
    'pilares',
    { id_num: u32([1, 2]), nivel_num: u32([0, 0]), tipo_num: u32([1, 1]), disciplina: u8([1, 1]), px: f64([0, 5]), py: f64([0, 0]), rotacao: f64([0, 0]), deslocamento_base: f64([0, 0]), nivel_topo_num: u32([AUSENTE, AUSENTE]), deslocamento_topo: f64([0, 0]), altura: f64([3, 3]), hosp_num: u32([AUSENTE, AUSENTE]) },
    2,
  );
  cena.definirSecao('tipos_viga', { id_num: u32([1]), forma: u8([0]), p0: f64([0.15]), p1: f64([0.4]), p2: f64([NaN]), p3: f64([NaN]), p4: f64([NaN]), p5: f64([NaN]), perfil_num: u32([AUSENTE]), material_num: u32([9]) }, 1);
  cena.definirSecao(
    'vigas',
    { id_num: u32([5]), nivel_num: u32([0]), tipo_num: u32([1]), ax: f64([0]), ay: f64([0]), bx: f64([5]), by: f64([0]), deslocamento_z_a: f64([3]), deslocamento_z_b: f64([3]), alinhamento: u8([0]), rotacao: f64([0]), extremidade_a: u8([0]), extremidade_b: u8([0]) },
    1,
  );
  cena.definirSecao(
    'tipos_fundacao',
    {
      id_num: u32([1]), modo: u8([0]), forma: u8([0]),
      base_forma: u8([0]), base_p0: f64([0.8]), base_p1: f64([0.8]), base_p2: f64(nan(1)), base_p3: f64(nan(1)), base_p4: f64(nan(1)), base_p5: f64(nan(1)), base_perfil_num: u32([AUSENTE]),
      altura_base: f64([0.3]),
      pescoco_forma: u8([0]), pescoco_p0: f64([0.25]), pescoco_p1: f64([0.25]), pescoco_p2: f64(nan(1)), pescoco_p3: f64(nan(1)), pescoco_p4: f64(nan(1)), pescoco_p5: f64(nan(1)), pescoco_perfil_num: u32([AUSENTE]),
      altura_pescoco: f64([0.5]), material_num: u32([5]),
    },
    1,
  );
  cena.definirSecao(
    'fundacoes',
    { id_num: u32([1]), nivel_num: u32([0]), tipo_num: u32([1]), px: f64([0]), py: f64([0]), rotacao: f64([0]), ax: f64([NaN]), ay: f64([NaN]), bx: f64([NaN]), by: f64([NaN]), hosp_num: u32([AUSENTE]), deslocamento_topo: f64([-0.1]) },
    1,
  );
}

/** Linhas `[elemento, categoria, estilo, papel]` de uma saída de planta ou corte. */
const chavesDasLinhas = (linhas: ArrayLike<number>): number[][] => {
  const out: number[][] = [];
  for (let i = 0; i < linhas.length; i += 5) out.push([linhas[i]!, linhas[i + 1]!, linhas[i + 2]!, linhas[i + 3]!]);
  return out;
};

describe('estrutura, ficha K4: consultas 201 a 204, 206 e 207 no Rust real', () => {
  it.skipIf(!bytes)('estr_planta corta os pilares, traceja a viga e a sapata abaixo do corte', () => {
    const cena = CenaV2.criar(ger!, montar);
    const s = cena.consultar('estr_planta', [NIVEL_TODOS, 3.5, 1]);
    expect(Object.keys(s)).toEqual(['linhas', 'pontos']);
    // Corte acima de tudo: pilares projetados cheios, viga e fundação (base e pescoço) tracejadas.
    expect(chavesDasLinhas(s['linhas']!)).toEqual([[1, 0, 0, 2], [2, 0, 0, 2], [5, 1, 1, 2], [1, 2, 1, 2], [1, 2, 1, 2]]);
    const corte = cena.consultar('estr_planta', [0, 1.2, 1]);
    expect(chavesDasLinhas(corte['linhas']!).slice(0, 2)).toEqual([[1, 0, 0, 0], [2, 0, 0, 0]]);
    // A viga aparada: x de 0,10 a 4,90 (os 5 pontos do anel fechado da viga são os pontos 10 a 14).
    const xs = Array.from(s['pontos']!).filter((_, i) => i % 2 === 0).slice(10, 15);
    expect(Math.min(...xs)).toBeCloseTo(0.1, 12);
    expect(Math.max(...xs)).toBeCloseTo(4.9, 12);
    cena.destruir();
  });

  it.skipIf(!bytes)('estr_corte devolve a seção hachurável e as arestas projetadas', () => {
    const cena = CenaV2.criar(ger!, montar);
    const s = cena.consultar('estr_corte', [NIVEL_TODOS, -1, 0, 1, 0, 5]);
    expect(Object.keys(s)).toEqual(['linhas', 'pontos']);
    const chaves = chavesDasLinhas(s['linhas']!);
    // O plano y = 0 corta os dois pilares (seção cheia, papel 0) e a viga ao longo (seção, papel 0).
    expect(chaves.filter((c) => c[2] === 0 && c[3] === 0).map((c) => [c[0], c[1]])).toEqual([[1, 0], [2, 0], [5, 1], [1, 2], [1, 2]]);
    expect(chaves.every((c) => (c[2] === 0 && (c[3] === 0 || c[3] === 1)) || (c[2] === 1 && c[3] === 2))).toBe(true);
    cena.destruir();
  });

  it.skipIf(!bytes)('estr_quant devolve volume, forma, comprimento e seção por elemento', () => {
    const cena = CenaV2.criar(ger!, montar);
    const s = cena.consultar('estr_quant', [NIVEL_TODOS]);
    expect(Array.from(s['linhas']!)).toEqual([1, 0, 1, 7, 2, 0, 1, 7, 5, 1, 1, 9, 1, 2, 1, 5]);
    const v = Array.from(s['valores']!);
    [0.24, 3.6, 3, 0.08].forEach((x, k) => expect(v[k]).toBeCloseTo(x, 12));
    [0.3, 5.5, 5, 0.06].forEach((x, k) => expect(v[8 + k]).toBeCloseTo(x, 12));
    expect(v[12]).toBeCloseTo(0.22325, 12);
    cena.destruir();
  });

  it.skipIf(!bytes)('estr_avisos aponta o pilar sem fundação', () => {
    const cena = CenaV2.criar(ger!, montar);
    const s = cena.consultar('estr_avisos', [NIVEL_TODOS]);
    expect(Array.from(s['avisos']!)).toEqual([2, 0, 4, AUSENTE]);
    expect(Array.from(s['valores']!)).toEqual([0, 1, 5, 0, 0]);
    cena.destruir();
  });

  it.skipIf(!bytes)('estr_juncoes apara a viga E6 (comprimento livre 4,80) e estr_apoio dá chaves estáveis', () => {
    const cena = CenaV2.criar(ger!, montar);
    const j = cena.consultar('estr_juncoes', [NIVEL_TODOS]);
    expect(Object.keys(j)).toEqual(['recortes', 'recortes_z', 'pontos', 'aparos', 'aparos_recuo', 'unioes']);
    expect(Array.from(j['aparos']!)).toEqual([5, 0, 1, 5, 1, 2]);
    const recuo = Array.from(j['aparos_recuo']!);
    expect(5 - recuo[0]! - recuo[1]!).toBeCloseTo(4.8, 12);
    expect(j['recortes']!.length + j['unioes']!.length).toBe(0);
    const a = cena.consultar('estr_apoio', [NIVEL_TODOS]);
    const b = cena.consultar('estr_apoio', [NIVEL_TODOS]);
    expect(Array.from(a['pontos']!)).toEqual(Array.from(b['pontos']!));
    expect(Array.from(a['pontos']!).slice(0, 4)).toEqual([1, 0, 0, 0]);
    expect(Array.from(a['pontos_xy']!).slice(0, 2)).toEqual([-0.1, -0.2]);
    expect(a['segmentos_xy']!.length).toBe(a['segmentos']!.length);
    cena.destruir();
  });
});
