/**
 * Parede cortina inclinada (frente massa-paredes-torcidas, fase 1b) sobre o Rust REAL: a cortina reta de 6 m x 3 m com `tilt` de 30° tem a malha 3D girada em
 * torno da linha de base: a altura vertical continua 3 m, o topo se desloca 3·tan30° = 1,7321 m para a esquerda de a→b (+y) e a grade mantém 4 x 2 células
 * medidas na face inclinada (altura 3/cos30° = 3,4641 m). A cortina vertical segue como antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore } from '@hestia/model';
import { ServicoCortina } from '../packages/engine/src/index.ts';
import { projetoComCortina } from '../packages/engine/src/fixtureCortina.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

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

/** Caixa (min/max por eixo) dos vértices do mundo de todas as instâncias e peças avulsas da cortina `ct1`. */
function caixa(m: NonNullable<ReturnType<ServicoCortina['malha']>>): { min: number[]; max: number[]; n: number } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  const ponto = (x: number, y: number, z: number): void => {
    [x, y, z].forEach((v, i) => {
      min[i] = Math.min(min[i]!, v);
      max[i] = Math.max(max[i]!, v);
    });
  };
  for (const g of m.instancias.filter((i) => i.wallId === 'ct1')) {
    const pr = m.protos.get(g.proto)!;
    n += g.n;
    for (let k = 0; k < g.n; k++) {
      const M = g.matrizes.subarray(12 * k, 12 * k + 12);
      for (let v = 0; v + 2 < pr.vertices.length; v += 3) {
        const [x, y, z] = [pr.vertices[v]!, pr.vertices[v + 1]!, pr.vertices[v + 2]!];
        ponto(M[0]! * x + M[1]! * y + M[2]! * z + M[3]!, M[4]! * x + M[5]! * y + M[6]! * z + M[7]!, M[8]! * x + M[9]! * y + M[10]! * z + M[11]!);
      }
    }
  }
  for (const g of m.grupos.filter((i) => i.wallId === 'ct1')) for (let v = 0; v + 2 < g.vertices.length; v += 3) ponto(g.vertices[v]!, g.vertices[v + 1]!, g.vertices[v + 2]!);
  return { min, max, n };
}

describe('parede cortina inclinada sobre o Rust real', () => {
  it.skipIf(!bytes)('30°: altura vertical 3 m, topo deslocado 1,7321 m para +y, mesma grade; a vertical não muda', () => {
    const srv = new ServicoCortina(() => ger);
    const vertical = caixa(srv.malha(projetoComCortina())!);
    const s = new ProjectStore(projetoComCortina());
    s.exec({ type: 'setWallTilt', ids: ['ct1'], tilt: 30 });
    const incl = caixa(srv.malha(s.project)!);
    expect(incl.n).toBe(vertical.n);
    // Vertical: z de 0 a 3. Inclinada: o topo continua na cota 3 (altura vertical) e a base em 0.
    // (o perfil do montante gira junto: a espessura de ±0,05 m deixa o topo em 3,025 e a base em ~-0,025)
    expect(vertical.max[2]!).toBeCloseTo(3, 3);
    expect(incl.max[2]!).toBeCloseTo(3.025, 3);
    expect(incl.min[2]!).toBeCloseTo(-0.025, 3);
    // O deslocamento do centro do topo: 3·tan30° = 1,7321 (a espessura do perfil só soma uma fração de ±0,05 m).
    expect(incl.max[1]! - vertical.max[1]!).toBeGreaterThan(1.7);
    expect(incl.max[1]! - vertical.max[1]!).toBeLessThan(1.85);
    // Ao longo de a→b (x) nada muda.
    expect(incl.min[0]!).toBeCloseTo(vertical.min[0]!, 3);
    expect(incl.max[0]!).toBeCloseTo(vertical.max[0]!, 3);
    srv.encerrar();
  });
});
