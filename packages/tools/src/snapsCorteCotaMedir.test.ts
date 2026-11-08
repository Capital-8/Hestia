import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import { sectionInferContext } from './sectionContext.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import type { Inference, SectionToolContext } from './types.ts';
import type { ToolId } from './registry.ts';

/**
 * Cota e Medir na vista de corte: todos os snaps e rastreios da planta, pelo MESMO motor (`infer`), sobre as arestas da
 * vista. Cada caso vale para as duas ferramentas. Geometria (t, z): bloco A (0,0)-(4,3) e bloco C (3,1)-(6,2), que
 * se cruzam em (4,1) e (3,... ) pelas arestas; nada de planta entra.
 */
const v = (x: number, y: number): Vec2 => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];

const section: SectionResult = {
  length: 10,
  zMin: -1,
  zMax: 10,
  cut: [
    { materialId: 'm1', polygons: [[rect(0, 0, 4, 3)]], sources: [] },
    { materialId: 'm1', polygons: [[rect(3, 1, 6, 2)]], sources: [] },
  ],
  silhouette: [],
  beyond: [],
  openings: [],
  membranes: [],
  levels: [],
};

function cena(angle?: { ortho?: boolean; polar?: boolean; polarIncrementDeg?: number }) {
  const ctx = makeEnv();
  const project = createEmptyProject();
  const sec: SectionToolContext = {
    id: 'v1',
    annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
    setAnnotations: () => {},
    inferContext: (extra = {}) => sectionInferContext(section, project, 'lv_0', 0.01, 0.1, { line: { a: v(0, 0), b: v(10, 0) } }, extra),
    result: () => section,
  };
  ctx.env.section = () => sec;
  if (angle) ctx.options.angleMode = angle as never;
  return ctx;
}

/** Primeiro clique em `start`, depois move até `cursor` e devolve a inferência da ferramenta. */
function infer2(id: ToolId, start: Vec2, cursor: Vec2, angle?: { ortho?: boolean; polar?: boolean; polarIncrementDeg?: number }): Inference {
  const { env } = cena(angle);
  const t = tool(id, env);
  // O primeiro ponto está longe de qualquer captura, então o clique grava o ponto livre.
  clickAt(t, start.x, start.y);
  t.move(P(cursor.x, cursor.y));
  return (t as unknown as { inference(): Inference }).inference();
}

const FERRAMENTAS: ToolId[] = ['dimension', 'measure'];

describe.each(FERRAMENTAS)('corte: %s com os snaps da planta', (id) => {
  const longe = v(1, 6);

  it('extremidade', () => {
    const r = infer2(id, longe, v(0.03, 3.02));
    expect(r.kind).toBe('endpoint');
    expect(r.point).toEqual(v(0, 3));
  });

  it('ponto médio', () => {
    const r = infer2(id, longe, v(2.02, 3.01));
    expect(r.kind).toBe('midpoint');
    expect(r.point).toEqual(v(2, 3));
  });

  it('interseção de duas arestas', () => {
    const r = infer2(id, longe, v(4.02, 1.03));
    expect(r.kind).toBe('intersection');
    expect(r.point.x).toBeCloseTo(4, 6);
    expect(r.point.y).toBeCloseTo(1, 6);
  });

  it('perpendicular: pé da perpendicular do primeiro ponto sobre a aresta', () => {
    const r = infer2(id, v(1, 6), v(1.04, 3.03));
    // O pé da perpendicular coincide com o cruzamento do alinhamento vertical do ponto inicial com a aresta; o ponto é o mesmo.
    expect(['perpendicular', 'alignment']).toContain(r.kind);
    expect(r.point).toEqual(v(1, 3));
  });

  it('mais próximo sobre a aresta', () => {
    const r = infer2(id, v(9, 8), v(0.8, 3.02));
    expect(r.kind).toBe('nearest');
    expect(r.point.y).toBeCloseTo(3, 6);
  });

  it('rastreio de extensão: prolonga a aresta vertical além da ponta', () => {
    const r = infer2(id, v(9, 8), v(0.03, 5.5));
    expect(r.kind).toBe('alignment');
    expect(r.point.x).toBeCloseTo(0, 6);
  });

  it('polar: trava no múltiplo do incremento', () => {
    const r = infer2(id, v(8, 5), v(10.5, 7.7), { polar: true, polarIncrementDeg: 45 });
    expect(r.kind).toBe('polar');
    expect((Math.atan2(r.point.y - 5, r.point.x - 8) * 180) / Math.PI).toBeCloseTo(45, 6);
  });

  it('ortogonal: trava na horizontal', () => {
    const r = infer2(id, v(8, 5), v(9.5, 5.3), { ortho: true });
    expect(r.kind).toBe('ortho');
    expect(r.point.y).toBe(5);
  });

  it('orto + extremidade sobre a reta', () => {
    const r = infer2(id, v(-2, 3), v(4.03, 3.05), { ortho: true });
    expect(r.kind).toBe('endpoint');
    expect(r.point).toEqual(v(4, 3));
  });

  it('orto + rastreio de extensão: a reta horizontal cruza o prolongamento da aresta', () => {
    const r = infer2(id, v(-2, 5), v(4.03, 5.04), { ortho: true });
    expect(r.point.x).toBeCloseTo(4, 6);
    expect(r.point.y).toBeCloseTo(5, 6);
    expect(r.kind).toBe('alignment');
  });

  it('orto + interseção da reta com uma aresta', () => {
    const r = infer2(id, v(-2, 1.5), v(4.03, 1.56), { ortho: true });
    expect(r.kind).toBe('intersection');
    expect(r.point.x).toBeCloseTo(4, 6);
    expect(r.point.y).toBeCloseTo(1.5, 6);
  });

  it('polar + rastreio de extensão: a reta a 45 graus cruza o prolongamento da aresta', () => {
    // De (0,5) a 45 graus a reta passa por (4,9); a aresta x = 4 vai até z = 3, e o prolongamento chega lá.
    const r = infer2(id, v(0, 5), v(4.03, 9.06), { polar: true, polarIncrementDeg: 45 });
    expect(r.point.x).toBeCloseTo(4, 6);
    expect(r.point.y).toBeCloseTo(9, 6);
    expect(r.kind).toBe('alignment');
  });

  it('orto e polar ligados juntos: a reta é a ortogonal e os rastreios continuam valendo', () => {
    const r = infer2(id, v(-2, 5), v(4.03, 5.04), { ortho: true, polar: true, polarIncrementDeg: 45 });
    expect(r.point.x).toBeCloseTo(4, 6);
    expect(r.point.y).toBeCloseTo(5, 6);
  });

  it('orto: extremidade fora da reta não puxa o ponto', () => {
    const r = infer2(id, v(-2, 3.2), v(4.02, 3.28), { ortho: true });
    expect(r.point.y).toBeCloseTo(3.2, 6);
  });
});

describe('corte: visibilidade da esquadria é pelo id dela', () => {
  it('parede oculta não tira o snap da esquadria; ocultar a esquadria tira', () => {
    const sec: SectionResult = {
      ...section,
      cut: [],
      openings: [{ openingId: 'op1', t0: 1, t1: 2, z0: 0, z1: 2, polygons: [] } as never],
      membranes: [],
    };
    const project = createEmptyProject();
    const ctx = (hidden: string[]) => sectionInferContext(sec, project, 'lv_0', 0.01, 0.1, { hidden: new Set(hidden) });
    const hosts = (c: ReturnType<typeof ctx>) => (c.extraPoints ?? []).map((p) => (p as { hostId?: string }).hostId);
    expect(hosts(ctx(['w1']))).toContain('op1');
    expect(hosts(ctx(['op1']))).not.toContain('op1');
  });
});
