import { describe, expect, it } from 'vitest';
import { ORCAMENTO_TRIANGULOS_GENERICOS, arestasDosLotes, trianguloDosGenericos } from './lotesMalha3d.ts';
import type { LoteSolido } from './solids.ts';

const tri = (cat: string, n: number): LoteSolido =>
  ({ materialId: 'm', category: cat, positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: Array.from({ length: n * 3 }, (_, i) => i % 3), ids: [] }) as unknown as LoteSolido;

describe('orçamento de arestas dos genéricos', () => {
  it('abaixo do limite mantém as arestas dos genéricos', () => {
    const g = arestasDosLotes([tri('generic', 1)], 28);
    expect(g?.getAttribute('position').count).toBe(6);
  });
  it('acima do limite pula só os genéricos e mantém as outras categorias', () => {
    const lotes = [tri('generic', ORCAMENTO_TRIANGULOS_GENERICOS + 1), tri('wall', 1)];
    expect(trianguloDosGenericos(lotes)).toBeGreaterThan(ORCAMENTO_TRIANGULOS_GENERICOS);
    expect(arestasDosLotes(lotes, 28)?.getAttribute('position').count).toBe(6);
    expect(arestasDosLotes([lotes[0]!], 28)).toBeNull();
  });
});
