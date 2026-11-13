/**
 * Estrutura, ficha K3 (docs/estrutura/PLANO.md): a consulta 200 `estr_malha` com fundações pelo wasm REAL (ABI v2), seções 19 e 202/205 montadas à
 * mão. Fixtures da A.10: E7 (sapata com pescoço) e E8 (baldrame). Roda só em `npm run test:wasm`.
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
const nan = (n: number): number[] => Array<number>(n).fill(NaN);

/** Tipo 1: sapata isolada 0,80×0,80×0,30 com pescoço 0,25×0,25×0,50 (E7); tipo 2: baldrame 0,40×0,30 (E8). Fundação 1 (tipo 1, topo -0,1) e 2 (tipo 2, de (0,0) a (6,0), topo 0). */
function montar(cena: CenaV2, fundacoes = 2): void {
  cena.definirSecao('niveis', { id_num: u32([1]), nivel_num: u32([0]), cota: f64([0]) }, 1);
  cena.definirSecao(
    'tipos_fundacao',
    {
      id_num: u32([1, 2]), modo: u8([0, 1]), forma: u8([0, 0]),
      base_forma: u8([0, 0]), base_p0: f64([0.8, 0.4]), base_p1: f64([0.8, 0.3]), base_p2: f64(nan(2)), base_p3: f64(nan(2)), base_p4: f64(nan(2)), base_p5: f64(nan(2)), base_perfil_num: u32([AUSENTE, AUSENTE]),
      altura_base: f64([0.3, 0.3]),
      pescoco_forma: u8([0, 255]), pescoco_p0: f64([0.25, NaN]), pescoco_p1: f64([0.25, NaN]), pescoco_p2: f64(nan(2)), pescoco_p3: f64(nan(2)), pescoco_p4: f64(nan(2)), pescoco_p5: f64(nan(2)), pescoco_perfil_num: u32([AUSENTE, AUSENTE]),
      altura_pescoco: f64([0.5, NaN]), material_num: u32([5, 6]),
    },
    2,
  );
  cena.definirSecao(
    'fundacoes',
    {
      id_num: u32([1, 2].slice(0, fundacoes)), nivel_num: u32([0, 0].slice(0, fundacoes)), tipo_num: u32([1, 2].slice(0, fundacoes)),
      px: f64([2, NaN].slice(0, fundacoes)), py: f64([3, NaN].slice(0, fundacoes)), rotacao: f64([0, 0].slice(0, fundacoes)),
      ax: f64([NaN, 0].slice(0, fundacoes)), ay: f64([NaN, 0].slice(0, fundacoes)), bx: f64([NaN, 6].slice(0, fundacoes)), by: f64([NaN, 0].slice(0, fundacoes)),
      hosp_num: u32([AUSENTE, AUSENTE].slice(0, fundacoes)), deslocamento_topo: f64([-0.1, 0].slice(0, fundacoes)),
    },
    fundacoes,
  );
}

function volumeDoGrupo(v: ArrayLike<number>, idx: ArrayLike<number>, primeiro: number, n: number): number {
  let s = 0;
  for (let i = primeiro; i < primeiro + n; i += 3) {
    const [a, b, c] = [idx[i]!, idx[i + 1]!, idx[i + 2]!].map((k) => [v[3 * k]!, v[3 * k + 1]!, v[3 * k + 2]!] as const);
    s += (a![0] * (b![1] * c![2] - b![2] * c![1]) - a![1] * (b![0] * c![2] - b![2] * c![0]) + a![2] * (b![0] * c![1] - b![1] * c![0])) / 6;
  }
  return s;
}

describe('estrutura, ficha K3: fundações na consulta 200 do Rust real', () => {
  it.skipIf(!bytes)('estr_malha devolve base, pescoço e baldrame com os volumes de E7 e E8', () => {
    const cena = CenaV2.criar(ger!, (c) => montar(c));
    const s = cena.consultar('estr_malha', [NIVEL_TODOS, 2]);
    const g = Array.from(s['grupos']!);
    expect(g.length).toBe(18);
    // Ordem: categoria (2 = fundação), elemento, parte (1 base, 2 pescoço); material do tipo.
    expect([0, 1, 2].map((k) => g.slice(6 * k, 6 * k + 4))).toEqual([[1, 2, 1, 5], [1, 2, 2, 5], [2, 2, 1, 6]]);
    const vol = (k: number) => volumeDoGrupo(s['vertices']!, s['indices']!, g[6 * k + 4]!, g[6 * k + 5]!);
    expect(vol(0)).toBeCloseTo(0.192, 12);
    expect(vol(0) + vol(1)).toBeCloseTo(0.22325, 12);
    expect(vol(2)).toBeCloseTo(0.72, 12);
    cena.destruir();
  });

  it.skipIf(!bytes)('fundação com eixo nulo dá ENTRADA sem derrubar o kernel', () => {
    const cena = CenaV2.criar(ger!, (c) => {
      montar(c, 1);
      c.definirSecao('fundacoes', { id_num: u32([1]), nivel_num: u32([0]), tipo_num: u32([2]), px: f64([NaN]), py: f64([NaN]), rotacao: f64([0]), ax: f64([1]), ay: f64([1]), bx: f64([1]), by: f64([1]), hosp_num: u32([AUSENTE]), deslocamento_topo: f64([0]) }, 1);
    });
    try {
      cena.consultar('estr_malha', [NIVEL_TODOS, 2]);
      expect.unreachable('devia dar ENTRADA');
    } catch (e) {
      expect(e).toBeInstanceOf(ErroKernelLeve);
      expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.ENTRADA);
    }
    cena.destruir();
  });
});
