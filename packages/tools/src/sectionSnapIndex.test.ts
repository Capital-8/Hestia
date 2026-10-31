import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject } from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import { infer } from './infer.ts';
import { sectionInferContext } from './sectionContext.ts';
import { buildSectionSnapIndex, sectionSnapIndex } from './sectionSnapIndex.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ring = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];

const emptySection = (over: Partial<SectionResult> = {}): SectionResult => ({
  length: 4,
  zMin: 0,
  zMax: 3,
  cut: [],
  silhouette: [],
  beyond: [],
  openings: [],
  membranes: [],
  levels: [],
  ...over,
});

describe('índice de captura da seção', () => {
  it('classifica arestas h/v como trilhas e mantém inclinadas fora delas', () => {
    const section = emptySection({
      cut: [{ materialId: 'm1', polygons: [[ring(0, 0, 4, 3)]], sources: [{ wallId: 'w1' }] }],
      // Triângulo (água de telhado): a hipotenusa não pode virar trilha.
      beyond: [{ materialId: 'm2', layerIndex: 0, depth: 1, roofId: 'r1', polygons: [[[v(0, 3), v(2, 4), v(4, 3)]]] }],
    });
    const index = buildSectionSnapIndex(section);
    expect(index.tracks.length).toBeGreaterThan(0);
    expect(index.tracks.every((tr) => tr.axis === 'h' || tr.axis === 'v')).toBe(true);
    expect(index.tracks.some((tr) => tr.hostId === 'w1' && tr.axis === 'h')).toBe(true);
    expect(index.tracks.some((tr) => tr.hostId === 'r1')).toBe(true);
    // A hipotenusa continua em `segments` (captura de aresta), mas não em `tracks`.
    expect(index.segments.some((e) => e.hostId === 'r1' && Math.abs(e.a.y - e.b.y) > 1e-6 && Math.abs(e.a.x - e.b.x) > 1e-6)).toBe(true);
    // byHost separa o que pertence a cada elemento.
    expect(index.byHost.get('w1')?.tracks.length).toBeGreaterThan(0);
  });

  it('preserva pontas, meios e interseções como antes', () => {
    const section = emptySection({ cut: [{ materialId: 'm1', polygons: [[ring(0, 0, 4, 3)]], sources: [] }] });
    const index = buildSectionSnapIndex(section);
    expect(index.points.some((p) => p.kind === 'endpoint' && p.x === 0 && p.y === 0)).toBe(true);
    expect(index.points.some((p) => p.kind === 'midpoint' && p.x === 2 && p.y === 0)).toBe(true);
    expect(index.segments).toHaveLength(4);
  });

  it('cacheia por identidade do SectionResult e reaproveita na segunda chamada', () => {
    const section = emptySection({ cut: [{ materialId: 'm1', polygons: [[ring(0, 0, 4, 3)]], sources: [] }] });
    const first = sectionSnapIndex(section);
    const second = sectionSnapIndex(section);
    expect(second).toBe(first);
    // Outro resultado (mesmo conteúdo) é outra entrada: a vista nova é reindexada uma vez.
    const other = sectionSnapIndex(structuredClone(section));
    expect(other).not.toBe(first);
    expect(other.points).toEqual(first.points);
  });
});

/** 5.000 arestas: 1.250 retângulos de 10 cm numa malha de 20 cm. */
function bigSection(count = 1250): SectionResult {
  const beyond: SectionResult['beyond'] = [];
  for (let i = 0; i < count; i++) {
    const x = (i % 50) * 0.2;
    const y = Math.floor(i / 50) * 0.2;
    beyond.push({ materialId: 'm1', layerIndex: 0, depth: 1, wallId: `w${i}`, polygons: [[ring(x, y, x + 0.1, y + 0.1)]] });
  }
  return emptySection({ length: 10, zMin: 0, zMax: 10, beyond });
}

describe('desempenho do rastreamento na seção', () => {
  it('5.000 arestas: a segunda leitura do índice é cacheada e infer não explode', () => {
    const section = bigSection();
    expect(sectionSnapIndex(section).segments).toHaveLength(5000);

    const t0 = performance.now();
    const built = buildSectionSnapIndex(section);
    const buildMs = performance.now() - t0;

    // A primeira `sectionSnapIndex` popula o cache; as seguintes devolvem a mesma referência (sem reindexar).
    const first = sectionSnapIndex(section);
    const t1 = performance.now();
    const cached = sectionSnapIndex(section);
    const cachedMs = performance.now() - t1;
    expect(cached).toBe(first);
    expect(cached.segments).toBe(first.segments);
    expect(cached.points).toBe(first.points);
    expect(cached.tracks).toBe(first.tracks);
    expect(built.segments).toHaveLength(5000);
    expect(cachedMs).toBeLessThan(Math.max(2, buildMs));

    const ctx = sectionInferContext(section, createEmptyProject(), 'lv_0', 0.01, 0.1, { line: { a: v(0, 0), b: v(10, 0) } });
    const calls = 50;
    const runInfer = (target: ReturnType<typeof sectionInferContext>): { ms: number; hits: number } => {
      let hits = 0;
      const start = performance.now();
      for (let k = 0; k < calls; k++) {
        // Cursor percorrendo cantos locais da malha (não o conjunto inteiro de arestas).
        const cursor = v(0.02 + (k % 10) * 0.2, 0.02 + (Math.floor(k / 10) % 10) * 0.2);
        if (infer(cursor, target).kind !== 'none') hits += 1;
      }
      return { ms: performance.now() - start, hits };
    };
    const big = runInfer(ctx);
    // Mesmo laço com 500 arestas: o custo deve acompanhar o número de arestas (linear), não o quadrado.
    const smallSection = bigSection(125);
    const smallCtx = sectionInferContext(smallSection, createEmptyProject(), 'lv_0', 0.01, 0.1, { line: { a: v(0, 0), b: v(10, 0) } });
    const small = runInfer(smallCtx);
    // Limite absoluto folgado: o que se verifica é que o custo acompanha as arestas perto do cursor, não o total.
    console.log(`índice 5.000 arestas: build ${buildMs.toFixed(1)} ms · cache ${cachedMs.toFixed(2)} ms · ${calls} infer ${big.ms.toFixed(1)} ms`);
    console.log(`índice 500 arestas: ${calls} infer ${small.ms.toFixed(1)} ms · razão 5.000/500 ${(big.ms / small.ms).toFixed(1)}`);
    expect(big.hits).toBeGreaterThan(0);
    expect(big.ms).toBeLessThan(2000);
    expect(big.ms / small.ms).toBeLessThan(25);
  });
});
