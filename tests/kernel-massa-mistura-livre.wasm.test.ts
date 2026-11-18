/**
 * Mistura pelo esboço: base `livre` de 4 pontos (quadrado 4 x 4) e topo `livre` de 64 pontos (círculo de raio 2), 6 m de altura, pelo kernel REAL.
 * O kernel parametriza cada perfil livre por comprimento de arco normalizado e junta os vértices dos dois (conjunto T), então tamanhos diferentes
 * interpolam sem reamostragem. Confere malha fechada, z do topo, volume entre os limites calculados à mão e nenhum aviso de erro (só o 4, face inclinada). Só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEmptyProject, makeMass, massIssue, ProjectStore, type SecaoMassa } from '@hestia/model';
import { ServicoMassa, type MalhaMassaProjeto } from '../packages/engine/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;
beforeAll(async () => {
  if (!bytes) return;
  try { ger = await GerenciadorKernelV2.dosBytes(bytes); } catch { ger = null; }
});

const sec = (z: number, pontos: Array<{ x: number; y: number }>): SecaoMassa => ({ z, perfil: { forma: 'livre', pontos }, rotacao: 0, escala: 1, dx: 0, dy: 0 });
const quadrado = [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }];
const circulo = Array.from({ length: 64 }, (_, k) => ({ x: 2 * Math.cos((2 * Math.PI * k) / 64), y: 2 * Math.sin((2 * Math.PI * k) / 64) }));

function volume(m: MalhaMassaProjeto): number {
  let v = 0;
  for (const g of m.grupos) for (let k = g.primeiro; k < g.primeiro + g.n; k += 3) {
    const p = [0, 1, 2].map((q) => [m.vertices[3 * m.indices[k + q]!]!, m.vertices[3 * m.indices[k + q]! + 1]!, m.vertices[3 * m.indices[k + q]! + 2]!]);
    const [a, b, c] = p as [number[], number[], number[]];
    v += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
  }
  return v;
}

describe('mistura livre de tamanhos diferentes (quadrado 4 pontos -> círculo 64 pontos)', () => {
  it.skipIf(!bytes)('malha fechada, topo em z = 6, volume entre 12,5·6 e 16·6 e sem avisos', () => {
    const store = new ProjectStore(createEmptyProject());
    const massa = makeMass({ id: 'ms_mx', levelId: 'lv_0', secoes: [sec(0, quadrado), sec(6, circulo)] });
    expect(massIssue({ ...massa, order: 0 })).toBeNull();
    store.exec({ type: 'addMass', mass: massa });
    const srv = new ServicoMassa(() => ger);
    const m = srv.malha(store.project)!;
    expect(m).not.toBeNull();
    // fechada: cada aresta dirigida tem a oposta
    const chave = (i: number): string => [0, 1, 2].map((q) => m.vertices[3 * i + q]!.toFixed(9)).join(',');
    const ar = new Map<string, number>();
    for (const g of m.grupos) for (let k = g.primeiro; k < g.primeiro + g.n; k += 3) for (const [u, v] of [[0, 1], [1, 2], [2, 0]] as const) {
      const key = `${chave(m.indices[k + u]!)}>${chave(m.indices[k + v]!)}`;
      ar.set(key, (ar.get(key) ?? 0) + 1);
    }
    expect([...ar].every(([a, n]) => n === 1 && ar.get(a.split('>').reverse().join('>')) === 1)).toBe(true);
    let zmax = -Infinity;
    for (let i = 0; i < m.vertices.length / 3; i++) zmax = Math.max(zmax, m.vertices[3 * i + 2]!);
    expect(zmax).toBeCloseTo(6, 9);
    const v = volume(m);
    // círculo inscrito de 64 lados: 12,5 m² (menor); quadrado: 16 m² (maior)
    expect(v).toBeGreaterThan(12.5 * 6);
    expect(v).toBeLessThan(16 * 6);
    // Avisos do kernel: 1 anel autointersecta, 2 cópias sobrepostas, 3 limite, 4 face inclinada (informativo, esperado num tronco que muda de forma).
    const codigos = (srv.avisos(store.project) ?? []).map((a) => a.codigo);
    expect(codigos.filter((c) => c !== 4)).toEqual([]);
  });
});
