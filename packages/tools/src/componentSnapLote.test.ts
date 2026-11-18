import { describe, expect, it } from 'vitest';
import { loteL1, projetoLote } from '@hestia/engine';
import { componentSnapGeometry } from './componentSnap.ts';

describe('captura do lote no motor das ferramentas', () => {
  it('L1: vértices, meios e arestas do contorno e da área edificável chegam à captura do nível', () => {
    const p = projetoLote();
    const g = componentSnapGeometry(p, 'lv_0');
    // Contorno 12 x 30: os quatro vértices do lote estão entre os pontos de captura.
    const cantos: Array<[number, number]> = [[0, 0], [12, 0], [12, 30], [0, 30]];
    for (const [x, y] of cantos) {
      expect(g.points.some((q) => Math.abs(q.x - x) < 1e-9 && Math.abs(q.y - y) < 1e-9), `vértice ${x},${y}`).toBe(true);
    }
    // Área edificável (recuos 5 / 1,5 / 3 / 1,5): o canto (1,5; 5) também captura.
    expect(g.points.some((q) => Math.abs(q.x - 1.5) < 1e-6 && Math.abs(q.y - 5) < 1e-6)).toBe(true);
    expect(g.segments.length).toBeGreaterThanOrEqual(8);
  });

  it('outro nível não recebe a captura do lote; lote sem área edificável não captura o que não se vê', () => {
    const p = projetoLote();
    expect(componentSnapGeometry(p, 'lv_x').points).toHaveLength(0);
    const sem = projetoLote({ ...loteL1(), mostrarEdificavel: false } as ReturnType<typeof loteL1>);
    const g = componentSnapGeometry(sem, 'lv_0');
    expect(g.points.some((q) => Math.abs(q.x - 1.5) < 1e-6 && Math.abs(q.y - 5) < 1e-6)).toBe(false);
  });
});
