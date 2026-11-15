import { describe, expect, it } from 'vitest';
import type { Project } from '@hestia/model';
import { ORCAMENTO_TRIANGULOS_GENERICOS, arestasDosLotes, genericosAcimaDoOrcamento, trianguloDosGenericos } from './lotesMalha3d.ts';
import type { LoteSolido } from './solids.ts';

const tri = (cat: string, n: number): LoteSolido =>
  ({ materialId: 'm', category: cat, positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: Array.from({ length: n * 3 }, (_, i) => i % 3), ids: [] }) as unknown as LoteSolido;

/** Elementos só com o tamanho da malha (o orçamento lê `mesh.indices.length`; o resto não entra no cálculo). */
const elementos = (...itens: Array<{ kind: 'generic' | 'wall'; tris: number }>): Project['elements'] => {
  const out: Record<string, unknown> = {};
  itens.forEach((it, i) => {
    out[`e${i}`] = { id: `e${i}`, kind: it.kind, mesh: { positions: [], indices: { length: it.tris * 3 } } };
  });
  return out as unknown as Project['elements'];
};

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
  it('semGenericos definido manda: true pula o genérico pequeno; false mantém (a decisão por chamada não entra)', () => {
    expect(arestasDosLotes([tri('generic', 1)], 28, true)).toBeNull();
    expect(arestasDosLotes([tri('generic', 1)], 28, false)?.getAttribute('position').count).toBe(6);
  });
  it('semGenericos = true nunca pula paredes', () => {
    const g = arestasDosLotes([tri('generic', 1), tri('wall', 1)], 28, true);
    expect(g?.getAttribute('position').count).toBe(6);
  });
});

describe('orçamento do projeto inteiro (genericosAcimaDoOrcamento)', () => {
  it('soma os genéricos de todos os níveis: cada metade abaixo do limite, o total acima', () => {
    const metade = Math.floor(ORCAMENTO_TRIANGULOS_GENERICOS / 2) + 1;
    const els = elementos({ kind: 'generic', tris: metade }, { kind: 'generic', tris: metade });
    expect(metade).toBeLessThan(ORCAMENTO_TRIANGULOS_GENERICOS);
    expect(genericosAcimaDoOrcamento(els)).toBe(true);
  });
  it('total igual ao limite não passa do orçamento', () => {
    expect(genericosAcimaDoOrcamento(elementos({ kind: 'generic', tris: ORCAMENTO_TRIANGULOS_GENERICOS }))).toBe(false);
    expect(genericosAcimaDoOrcamento(elementos({ kind: 'generic', tris: ORCAMENTO_TRIANGULOS_GENERICOS + 1 }))).toBe(true);
  });
  it('paredes e demais categorias não contam no orçamento', () => {
    expect(genericosAcimaDoOrcamento(elementos({ kind: 'wall', tris: ORCAMENTO_TRIANGULOS_GENERICOS * 4 }))).toBe(false);
  });
  it('projeto vazio fica abaixo do orçamento', () => {
    expect(genericosAcimaDoOrcamento({} as Project['elements'])).toBe(false);
  });
});
