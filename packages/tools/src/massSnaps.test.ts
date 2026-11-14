import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESTILO_PLANTA_MASSA, servicoMassa, type LinhaPlantaMassaProjeto } from '@hestia/engine';
import { massaM1 } from '@hestia/engine/src/fixtureMassa.ts';
import { dist, type Vec2 } from '@hestia/geom';
import { dimensionPoints, isMass, levelDimensions, type Project } from '@hestia/model';
import { ToolBase } from './base.ts';
import { componentSnapGeometry } from './componentSnap.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import type { Inference, PointerInfo } from './types.ts';

/**
 * Captura de planta da MASSA pelo mesmo motor das paredes (`ToolBase.ctx` -> `componentSnapIndex` -> `geometryOfLevel` -> `apoioDoElemento`):
 * Medir e Cota por clique pegam vértice e meio de aresta do anel cortado. O kernel é simulado (consulta 141).
 */
afterEach(() => vi.restoreAllMocks());

const v = (x: number, y: number): Vec2 => ({ x, y });
const near = (a: Vec2, b: Vec2, tol = 1e-6): void => expect(dist(a, b)).toBeLessThan(tol);

/** Kernel simulado: o anel cortado de cada massa é o retângulo 10 x 6 da M1 na origem DELA (repete o primeiro ponto no fim); memorizado por projeto. */
function kernelSimulado(): void {
  const memo = new WeakMap<Project, LinhaPlantaMassaProjeto[]>();
  vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(true);
  vi.spyOn(servicoMassa(), 'planta').mockImplementation((p: Project): LinhaPlantaMassaProjeto[] => {
    let l = memo.get(p);
    if (!l) {
      l = Object.values(p.elements).filter(isMass).map((m) => {
        const r = [v(-5, -3), v(5, -3), v(5, 3), v(-5, 3), v(-5, -3)].map((q) => v(m.origem.x + q.x, m.origem.y + q.y));
        return { massaId: m.id, copia: 0, estilo: ESTILO_PLANTA_MASSA.cortado, pontos: r };
      });
      memo.set(p, l);
    }
    return l;
  });
}

class Probe extends ToolBase {
  readonly id = 'probe';
  readonly label = 'Probe';
  readonly hint = '';
  protected reset(): void {}
  protected busy(): boolean {
    return false;
  }
  probe(p: PointerInfo): Inference {
    return this.snap(p, {});
  }
}

function cena() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addMass', mass: massaM1() });
  const dicas: string[] = [];
  ctx.env.say = (m: string) => { dicas.push(m); };
  return { ctx, dicas };
}

describe('massa: snaps de planta (Cota e Medir por clique)', () => {
  it('a geometria de captura do nível traz os vértices e os meios das arestas do anel cortado, com o dono', () => {
    kernelSimulado();
    const { ctx } = cena();
    const g = componentSnapGeometry(ctx.store.project, 'lv_0');
    expect(g.points.filter((q) => q.kind === 'endpoint' && q.hostId === 'm1')).toHaveLength(4);
    expect(g.points.filter((q) => q.kind === 'midpoint' && q.hostId === 'm1')).toHaveLength(4);
    expect(g.segments.filter((s) => s.hostId === 'm1')).toHaveLength(4);
  });

  it('sem kernel a massa não fornece pontos (nenhuma geometria em TypeScript no lugar do kernel)', () => {
    vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(false);
    const { ctx } = cena();
    expect(componentSnapGeometry(ctx.store.project, 'lv_0').points).toHaveLength(0);
  });

  it('o motor captura o vértice (endpoint) e o meio da aresta (midpoint) do anel cortado', () => {
    kernelSimulado();
    const { ctx } = cena();
    const probe = new Probe(ctx.env);
    probe.start();
    const vertice = probe.probe(P(5.003, 3.002));
    expect(vertice.kind).toBe('endpoint');
    expect(vertice.hostId).toBe('m1');
    near(vertice.point, v(5, 3));
    const meio = probe.probe(P(0.004, 3.003));
    expect(meio.kind).toBe('midpoint');
    near(meio.point, v(0, 3));
  });

  it('Medir por clique: do vértice ao meio da aresta mede exatamente 5 m', () => {
    kernelSimulado();
    const { ctx, dicas } = cena();
    const t = tool('measure', ctx.env);
    clickAt(t, 5.003, 3.002);
    clickAt(t, 0.004, 3.003);
    expect(dicas.at(-1)).toMatch(/5[.,]00/);
  });

  it('Cota por clique: as pontas da cota caem exatamente nos vértices do anel cortado', () => {
    kernelSimulado();
    const { ctx } = cena();
    ctx.options.dimensionMode = 'aligned';
    const t = tool('dimension', ctx.env);
    clickAt(t, 5.003, 3.002);
    clickAt(t, -5.003, -3.002);
    clickAt(t, 1.2, 6.5);
    const d = levelDimensions(ctx.store.project, 'lv_0')[0]!;
    const pts = dimensionPoints(ctx.store.project, d);
    near(pts.a, v(5, 3));
    near(pts.b, v(-5, -3));
  });

  // A cota ASSOCIATIVA à massa (a ponta acompanhar a massa ao movê-la) é testada em massaCotaAssociativa.test.ts; aqui só a captura de posição.
});
