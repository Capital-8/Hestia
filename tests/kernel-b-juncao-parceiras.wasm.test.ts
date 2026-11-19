/**
 * Junção entre níveis (`packages/engine/src/resolveParceiras.ts`) com o kernel Rust de verdade: a parede de outro nível que tem
 * altura em comum com a de baixo entra como parceira, e o resultado sai igual pelo TypeScript e pelo despacho do Rust (fatia A),
 * parede por parede, camada por camada e faixa por faixa, dentro de 1e-6 m. Os valores de referência são os do TypeScript.
 * Roda só em `npm run test:wasm` (vitest.wasm.config.ts inclui `tests/kernel-b*.wasm.test.ts`). Sem o binário com o ABI v2 o
 * teste FALHA (não pula): um gate de paridade que pula em silêncio não prova nada.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { multiArea, type MultiPolygon } from '@hestia/geom';
import { createEmptyProject, makeLevel, makeWall, ProjectStore, type Project } from '@hestia/model';
import { resolveLevel } from '../packages/engine/src/resolve.ts';
import { instalarDespachoKernel, removerDespachoKernel, type ConfigDespacho, type DespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  ger = await GerenciadorKernelV2.dosBytes(bytes).catch(() => null);
});
afterEach(() => removerDespachoKernel());
afterAll(() => removerDespachoKernel());

const DESPACHO: ConfigDespacho = { fatiaA: true, fatiaB: false, sombra: false };
const butt = { kind: 'butt', flip: false } as const;

/**
 * Projeto de teste (coordenadas inventadas): níveis lv_0@0, lv_1@3, lv_2@6, lv_3@9; W1 no térreo de (0,0) a (6,0), base 0, topo em
 * lv_3 (ou `topoW1`); W2 em lv_1 de (5,8;-1,4) a (6;0), base 0, topo em lv_2. Tipo de alvenaria com camadas (wt_alv14); W1 criada antes.
 */
function projeto(topoW1 = 'lv_3'): Project {
  const base = createEmptyProject();
  base.levels = [
    makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }),
    makeLevel({ id: 'lv_1', name: 'Nível 1', elevation: 3 }),
    makeLevel({ id: 'lv_2', name: 'Nível 2', elevation: 6 }),
    makeLevel({ id: 'lv_3', name: 'Nível 3', elevation: 9 }),
  ];
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'W1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, topLevelId: topoW1, joinStart: butt, joinEnd: butt }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'W2', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 5.8, y: -1.4 }, b: { x: 6, y: 0 }, topLevelId: 'lv_2', joinStart: butt, joinEnd: butt }) });
  return s.project;
}

interface Camada {
  area: number;
  /** x mínimo, y mínimo, x máximo, y máximo do fragmento; `null` quando vazio. */
  caixa: [number, number, number, number] | null;
  bandas: Array<[number, number]>;
}

const caixaDe = (m: MultiPolygon): [number, number, number, number] => {
  const pts = m.flat(2);
  return [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
};

/** Resumo de um nível resolvido: por parede, uma entrada por camada (área, caixa envolvente e faixas de altura). */
type Resumo = Record<string, Camada[]>;
/** Os dois níveis do teste (lv_0 e lv_1), cada um com o seu resumo. */
interface Niveis { lv_0: Resumo; lv_1: Resumo; }

function resumir(p: Project, lv: string): Resumo {
  const r = resolveLevel(p, lv, new Map());
  return Object.fromEntries(
    Object.entries(r.walls).map(([id, w]) => [
      id,
      w.layers.map((l) => ({
        area: multiArea(l.fragment),
        caixa: l.fragment.length > 0 ? caixaDe(l.fragment) : null,
        bandas: l.bands.map((b): [number, number] => [b.z0, b.z1]),
      })),
    ]),
  );
}

const TOL = 1e-6;

/** Divergências entre a referência (TS) e o Rust, em texto com os números; lista vazia = paridade. */
function divergencias(ts: Record<string, Camada[]>, rust: Record<string, Camada[]>): string[] {
  const out: string[] = [];
  const ids = Object.keys(ts);
  if (JSON.stringify(Object.keys(rust)) !== JSON.stringify(ids)) out.push(`paredes: ts=[${ids}] rust=[${Object.keys(rust)}]`);
  for (const id of ids) {
    const a = ts[id]!;
    const b = rust[id];
    if (!b || a.length !== b.length) {
      out.push(`${id}: ${a.length} camadas no TS, ${b?.length ?? 0} no Rust`);
      continue;
    }
    a.forEach((ca, k) => {
      const cb = b[k]!;
      const tag = `${id} camada ${k}`;
      if (Math.abs(ca.area - cb.area) > TOL) out.push(`${tag}: área ts=${ca.area} rust=${cb.area}`);
      if (ca.caixa === null || cb.caixa === null) {
        if (ca.caixa !== cb.caixa) out.push(`${tag}: fragmento vazio só num dos caminhos`);
      } else {
        ca.caixa.forEach((v, i) => {
          if (Math.abs(v - cb.caixa![i]!) > TOL) out.push(`${tag}: caixa[${i}] ts=${v} rust=${cb.caixa![i]}`);
        });
      }
      if (ca.bandas.length !== cb.bandas.length) out.push(`${tag}: ${ca.bandas.length} faixas no TS, ${cb.bandas.length} no Rust`);
      else
        ca.bandas.forEach(([z0, z1], i) => {
          const [r0, r1] = cb.bandas[i]!;
          if (Math.abs(z0 - r0) > TOL || Math.abs(z1 - r1) > TOL) out.push(`${tag}: faixa ${i} ts=[${z0},${z1}] rust=[${r0},${r1}]`);
        });
    });
  }
  return out;
}

/** Resolve os dois níveis pelo TS (sem despacho) e depois pelo Rust (despacho instalado), e devolve os resumos e o diagnóstico. */
function doisCaminhos(p: Project): { ts: Niveis; rust: Niveis; diag: ReturnType<DespachoKernel['diagnostico']> } {
  removerDespachoKernel();
  const ts: Niveis = { lv_0: resumir(p, 'lv_0'), lv_1: resumir(p, 'lv_1') };
  expect(ger, 'o binário commitado precisa do ABI v2 (resolver_nivel): sem ele o gate não roda').not.toBeNull();
  const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => DESPACHO });
  const rust: Niveis = { lv_0: resumir(p, 'lv_0'), lv_1: resumir(p, 'lv_1') };
  return { ts, rust, diag: d.diagnostico() };
}

describe('junção entre níveis: TypeScript x Rust (despacho da fatia A, wasm real)', () => {
  it('W1 (lv_0) e W2 (lv_1) com altura em comum: mesmas paredes, áreas, caixas e faixas nos dois caminhos', () => {
    const p = projeto();
    const { ts, rust, diag } = doisCaminhos(p);
    // (a) cada parede aparece uma só vez, no nível dono
    expect(Object.keys(ts.lv_0)).toEqual(['W1']);
    expect(Object.keys(ts.lv_1)).toEqual(['W2']);
    expect(Object.keys(rust.lv_0)).toEqual(['W1']);
    expect(Object.keys(rust.lv_1)).toEqual(['W2']);
    // o teste não pode ser vazio: as camadas têm área
    expect(ts.lv_0.W1!.reduce((s, c) => s + c.area, 0)).toBeGreaterThan(0);
    expect(ts.lv_1.W2!.reduce((s, c) => s + c.area, 0)).toBeGreaterThan(0);
    // (b) e (c): área, caixa envolvente e faixas de altura, por camada
    expect(divergencias(ts.lv_0, rust.lv_0), 'lv_0').toEqual([]);
    expect(divergencias(ts.lv_1, rust.lv_1), 'lv_1').toEqual([]);
    // o Rust de verdade respondeu (não caiu no TS por falha) e a fatia não voltou por erro
    expect(diag.entreguesPeloRust, 'níveis entregues pelo Rust').toBe(2);
    expect(diag.voltasLeves + diag.voltasGraves).toBe(0);
  });

  it('topo de W1 em 3,0 (encosta na base de W2): não se unem; os dois caminhos iguais e a ponta de W1 é reta (x = 6)', () => {
    const p = projeto('lv_1');
    const { ts, rust, diag } = doisCaminhos(p);
    expect(Object.keys(rust.lv_0)).toEqual(['W1']);
    expect(Object.keys(rust.lv_1)).toEqual(['W2']);
    expect(divergencias(ts.lv_0, rust.lv_0), 'lv_0').toEqual([]);
    expect(divergencias(ts.lv_1, rust.lv_1), 'lv_1').toEqual([]);
    // ponta reta: a face da ponta de W1 cai em x = 6 (corte perpendicular ao eixo horizontal), em todas as camadas
    for (const camada of rust.lv_0.W1!) expect(Math.abs(camada.caixa![2] - 6)).toBeLessThanOrEqual(TOL);
    expect(diag.entreguesPeloRust).toBe(2);
    expect(diag.voltasLeves + diag.voltasGraves).toBe(0);
  });
});
