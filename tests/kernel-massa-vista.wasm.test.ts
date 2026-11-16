/**
 * Massa no corte e na elevação, ficha V3 (docs/massa/PLANO.md, A.4 regra 9 e A.5): a cadeia inteira com o kernel Rust REAL. O projeto tem só a
 * massa M1 (caixa 10 × 6 × 9 m, origem (0, 0), nível de cota 0); o plano de corte passa em y = 0, ao longo de x. A consulta 143 (`massa_corte`)
 * vem pelo serviço singleton (`servicoMassa`), o mesmo que a vista usa; o clique e a caixa saem das linhas que o kernel devolveu. Roda só em
 * `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyProject, makeLevel, ProjectStore, type Project } from '@hestia/model';
import { ESTILO_CORTE_MASSA, definirGerenciadorDaMassa, linhasCorteDaMassa, massaNoPonto, massasNaCaixa, type SectionResult } from '../packages/engine/src/index.ts';
import { massaM1 } from '../packages/engine/src/fixtureMassa.ts';
import { gerenciadorDoKernel } from '../packages/engine/src/kernelDespacho.ts';
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
  if (ger) definirGerenciadorDaMassa(() => ger);
});

afterAll(() => {
  definirGerenciadorDaMassa(gerenciadorDoKernel);
});

/** Projeto só com a M1 no nível de cota 0. */
function projetoM1(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  s.exec({ type: 'addMass', mass: massaM1() });
  return s.project;
}

/** Seção de (−20, 0) a (−19, 0): a direção é +x, então s = x + 20 e a M1 (x de −5 a 5) fica entre s 15 e 25. */
const secao = (): SectionResult =>
  ({ length: 40, zMin: 0, zMax: 12, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [], plano: { a: { x: -20, y: 0 }, b: { x: -19, y: 0 }, depth: 30 } }) as unknown as SectionResult;

describe('massa no corte com o kernel real (ficha V3)', () => {
  it('a consulta 143 devolve o corte cortado da M1: retângulo de s 15 a 25 e z 0 a 9', () => {
    const p = projetoM1();
    const linhas = linhasCorteDaMassa(p, secao());
    expect(linhas).not.toBeNull();
    const cortado = linhas!.filter((l) => l.massaId === 'm1' && l.estilo === ESTILO_CORTE_MASSA.cortado);
    expect(cortado).toHaveLength(1);
    const pts = cortado[0]!.pontos;
    const ss = pts.map((q) => q.s);
    const zs = pts.map((q) => q.z);
    expect(Math.min(...ss)).toBeCloseTo(15, 6);
    expect(Math.max(...ss)).toBeCloseTo(25, 6);
    expect(Math.min(...zs)).toBeCloseTo(0, 6);
    expect(Math.max(...zs)).toBeCloseTo(9, 6);
  });

  it('clique sobre o corte da M1 pega a M1; longe dela, nada', () => {
    const p = projetoM1();
    const linhas = linhasCorteDaMassa(p, secao())!;
    expect(massaNoPonto(linhas, new Set(), { x: 20, y: 4.5 }, 0.1)).toBe('m1');
    expect(massaNoPonto(linhas, new Set(), { x: 40, y: 4.5 }, 0.1)).toBeNull();
  });

  it('caixa de janela que cobre a M1 inteira pega a M1; a mesma caixa com a M1 oculta não pega nada', () => {
    const p = projetoM1();
    const linhas = linhasCorteDaMassa(p, secao())!;
    expect(massasNaCaixa(linhas, new Set(), { x: 14, y: -1 }, { x: 26, y: 12 })).toEqual(['m1']);
    expect(massasNaCaixa(linhas, new Set(['m1']), { x: 14, y: -1 }, { x: 26, y: 12 })).toEqual([]);
  });
});
