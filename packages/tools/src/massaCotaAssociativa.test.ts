import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESTILO_PLANTA_MASSA, servicoMassa, type LinhaPlantaMassaProjeto } from '@hestia/engine';
import { massaM1 } from '@hestia/engine/src/fixtureMassa.ts';
import { dimensionPoints, isMass, levelDimensions, type Project } from '@hestia/model';
import { dist, type Vec2 } from '@hestia/geom';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/**
 * Cota ASSOCIATIVA à massa (ficha T1c, item e): a cota por clique num vértice do anel cortado grava `refs` com feição `part` (chave
 * `m<cópia>.l<laço>.v<índice>`), e a ponta acompanha a massa ao movê-la. O kernel é simulado (consulta 141), como em `massSnaps.test.ts`.
 */
afterEach(() => vi.restoreAllMocks());

const v = (x: number, y: number): Vec2 => ({ x, y });
const near = (a: Vec2, b: Vec2): void => expect(dist(a, b)).toBeLessThan(1e-6);

/** Anel cortado de cada massa: o retângulo 10 x 6 da M1 na origem DELA (repete o primeiro ponto no fim). */
function kernelSimulado(): void {
  vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(true);
  vi.spyOn(servicoMassa(), 'planta').mockImplementation((p: Project): LinhaPlantaMassaProjeto[] =>
    Object.values(p.elements).filter(isMass).map((m) => {
      const r = [v(-5, -3), v(5, -3), v(5, 3), v(-5, 3), v(-5, -3)].map((q) => v(m.origem.x + q.x, m.origem.y + q.y));
      return { massaId: m.id, copia: 0, estilo: ESTILO_PLANTA_MASSA.cortado, pontos: r };
    }),
  );
}

describe('cota associativa à massa (captura de vértice pela ferramenta Cota)', () => {
  it('as pontas gravam referências `part` na massa e acompanham a massa ao mover', () => {
    kernelSimulado();
    const ctx = makeEnv();
    ctx.store.exec({ type: 'addMass', mass: massaM1() });
    ctx.options.dimensionMode = 'aligned';
    const t = tool('dimension', ctx.env);
    clickAt(t, 5.003, 3.002); // vértice (5, 3) do anel
    clickAt(t, -5.003, -3.002); // vértice (-5, -3)
    clickAt(t, 1.2, 6.5); // lado da linha de cota
    const d = levelDimensions(ctx.store.project, 'lv_0')[0]!;
    expect(d.refs?.a).toMatchObject({ elementId: 'm1', feature: 'part' });
    expect(d.refs?.b).toMatchObject({ elementId: 'm1', feature: 'part' });
    near(dimensionPoints(ctx.store.project, d).a, v(5, 3));
    near(dimensionPoints(ctx.store.project, d).b, v(-5, -3));
    // Mover a massa (comando genérico `transform`): as duas pontas vão junto.
    ctx.store.exec({ type: 'transform', ids: ['m1'], transform: { kind: 'translate', d: v(3, 1) } });
    const depois = dimensionPoints(ctx.store.project, levelDimensions(ctx.store.project, 'lv_0')[0]!);
    near(depois.a, v(8, 4));
    near(depois.b, v(-2, -2));
    ctx.store.undo();
    near(dimensionPoints(ctx.store.project, levelDimensions(ctx.store.project, 'lv_0')[0]!).a, v(5, 3));
  });
});
