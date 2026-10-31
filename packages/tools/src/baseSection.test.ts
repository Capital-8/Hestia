import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { ToolBase } from './base.ts';
import type { InferContext } from './infer.ts';
import { sectionInferContext } from './sectionContext.ts';
import { makeEnv, P, clickAt, tool } from './testEnv.ts';
import type { SectionToolContext } from './types.ts';
import type { SectionResult } from '@hestia/engine';

/** Ferramenta mínima que expõe o contexto montado por `ToolBase.ctx`. */
class CtxTool extends ToolBase {
  readonly id = 'ctx-test';
  readonly label = 'Contexto';
  readonly hint = 'Contexto';
  protected reset(): void {}
  protected busy(): boolean {
    return false;
  }
  context(extra: Partial<InferContext> = {}): InferContext {
    return this.ctx(extra);
  }
}

const v = (x: number, y: number) => ({ x, y });

const section: SectionResult = {
  length: 4,
  zMin: 0,
  zMax: 3,
  cut: [{ materialId: 'm1', polygons: [[[v(0, 0), v(4, 0), v(4, 3), v(0, 3)]]], sources: [] }],
  silhouette: [],
  beyond: [],
  openings: [],
  membranes: [],
  levels: [],
};

describe('ToolBase.ctx', () => {
  it('usa o contexto da seção quando a vista de corte está ativa', () => {
    const { env, options } = makeEnv();
    options.orthoLock = true;
    const project = createEmptyProject();
    const sec: SectionToolContext = {
      id: 'v1',
      annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
      setAnnotations: () => {},
      inferContext: (extra = {}) =>
        sectionInferContext(section, project, 'lv_0', 0.01, 0.1, { line: { a: v(0, 0), b: v(4, 0) } }, extra),
    };
    env.section = () => sec;
    const t = new CtxTool(env);
    const extra = { from: v(1, 1), extraPoints: [{ ...v(2, 2), kind: 'endpoint' as const }] };
    const ctx = t.context(extra);
    expect(ctx.section).toBe(true);
    expect(ctx.isVisible?.(undefined as never)).toBe(false);
    expect(ctx.noGrid).toBe(true);
    expect(ctx.from).toEqual(v(1, 1));
    expect(ctx.orthoLock).toBe(true);
    // As arestas da seção entram e o ponto da ferramenta soma-se a elas.
    expect(ctx.extraSegments?.length).toBeGreaterThan(0);
    expect(ctx.extraPoints?.some((p) => p.x === 2 && p.y === 2)).toBe(true);
  });

  it('mantém o caminho da planta intacto quando não há seção', () => {
    const { env } = makeEnv();
    const wall = tool('wall', env);
    clickAt(wall, 1, 1);
    clickAt(wall, 3, 1);
    wall.cancel();
    const t = new CtxTool(env);
    const ctx = t.context();
    expect(ctx.section).toBeUndefined();
    expect(ctx.isVisible).toBeUndefined();
    expect(ctx.project).toBe(env.project());
    expect(ctx.levelId).toBe('lv_0');
    // A captura da planta continua achando a parede desenhada.
    const measure = tool('measure', env);
    measure.move(P(1.01, 1.01));
    expect(measure.inference()?.kind).toBe('endpoint');
    expect(measure.inference()?.point).toEqual(v(1, 1));
  });

  it('não lê a planta quando a seção está ativa', () => {
    const { env } = makeEnv();
    let reads = 0;
    const original = env.project;
    env.project = () => {
      reads += 1;
      return original();
    };
    env.section = () => ({
      id: 'v1',
      annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
      setAnnotations: () => {},
      inferContext: () => sectionInferContext(section, original(), 'lv_0', 0.01, 0.1, { line: { a: v(0, 0), b: v(4, 0) } }),
    });
    const t = new CtxTool(env);
    t.context();
    expect(reads).toBe(0);
  });
});
