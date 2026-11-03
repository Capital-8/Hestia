import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Command, type Component, type Project } from '@hestia/model';
import { malhaDoComponente, resolverComponente, volumeDaMalha } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { buildComponentSolids, MATERIAIS_DE_COMPONENTE } from './componentSolids.ts';

const ap = (p: Project, c: Command): Project => { const q = structuredClone(p); aplicar(q, c); return q; };
const base = (): Project => ap(createEmptyProject('t'), { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
const comp = (p: Project, id: string, extra: Partial<Component> = {}): Component => ({
  id, kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: id, ...extra,
});
const com = (p: Project, ...cs: Component[]): Project => { const q = structuredClone(p); for (const c of cs) q.elements[c.id] = c; return q; };

/** Volume (m3) de um lote pela soma dos tetraedros assinados. */
function volumeDoLote(b: { positions: number[]; indices: number[] }): number {
  return volumeDaMalha({ positions: b.positions, normals: [], indices: b.indices, pecaDoTriangulo: [] });
}

describe('materiais de componente', () => {
  it('cada id da paleta tem a cor do 3D do editor', () => {
    expect(Object.keys(MATERIAIS_DE_COMPONENTE).sort()).toEqual(['comp_corpo', 'comp_fundo', 'comp_porta', 'comp_rodape', 'comp_tampo']);
    for (const [id, m] of Object.entries(MATERIAIS_DE_COMPONENTE)) { expect(m.id).toBe(id); expect(m.color).toMatch(/^#[0-9a-f]{6}$/); }
  });
});

describe('buildComponentSolids', () => {
  it('sem componentes: lista vazia; outro nível: vazia', () => {
    const p = base();
    expect(buildComponentSolids(p, p.levels[0]!.id)).toEqual([]);
    const q = com(p, comp(p, 'c1', { levelId: 'outro' as never }));
    expect(buildComponentSolids(q, p.levels[0]!.id)).toEqual([]);
  });
  it('um componente: lotes por material, categoria genérica, ordenados, com a faixa do elemento e o volume das peças', () => {
    const p0 = base();
    const c = comp(p0, 'c1');
    const p = com(p0, c);
    const lotes = buildComponentSolids(p, p.levels[0]!.id);
    expect(lotes.map((l) => l.materialId)).toEqual(['comp_corpo', 'comp_fundo', 'comp_porta', 'comp_rodape', 'comp_tampo']);
    for (const l of lotes) {
      expect(l.category).toBe('generic');
      expect(l.positions.length).toBe(l.normals.length);
      expect(l.ids.length).toBeGreaterThan(0);
      for (const r of l.ids) { expect(r.id).toBe('c1'); expect(r.count % 3).toBe(0); expect(r.start + r.count).toBeLessThanOrEqual(l.indices.length); }
      expect(l.indices.every((i) => i >= 0 && i < l.positions.length / 3)).toBe(true);
    }
    const total = lotes.reduce((s, l) => s + volumeDoLote(l), 0);
    const m = malhaDoComponente(p, c, resolverComponente(p, c));
    expect(total).toBeCloseTo(volumeDaMalha(m.solidas), 9);
  });
  it('dois componentes no mesmo lote ficam em faixas separadas, uma por id; posições no mundo', () => {
    const p0 = base();
    const p = com(p0, comp(p0, 'a', { x: 0 }), comp(p0, 'b', { x: 5, rotation: Math.PI / 2, mirrored: true }));
    const corpo = buildComponentSolids(p, p.levels[0]!.id).find((l) => l.materialId === 'comp_corpo')!;
    expect(new Set(corpo.ids.map((r) => r.id))).toEqual(new Set(['a', 'b']));
    const xs = corpo.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeLessThan(1);
    expect(Math.max(...xs)).toBeGreaterThan(4.5);
  });
  it('família ausente ou sem peças não gera nada e não lança; vazias não aparecem', () => {
    const p0 = createEmptyProject('t');
    const q = com(p0, comp(p0, 'c1'));
    expect(buildComponentSolids(q, q.levels[0]!.id)).toEqual([]);
    const f = structuredClone(FAMILIA_ARMARIO);
    f.pecas.push({ id: 'cuba', nome: 'Cuba', papel: 'bloco', vazio: true, eixo: 'z', origem: ['100', '100', 'A - 100'], tamanho: ['200', '200'], espessura: '100' });
    const p = com(ap(p0, { type: 'upsertFamily', family: f }), comp(p0, 'c1'));
    const lotes = buildComponentSolids(p, p.levels[0]!.id);
    expect(lotes.some((l) => l.materialId === 'comp_corpo')).toBe(true);
    expect(lotes.flatMap((l) => l.ids).length).toBe(lotes.length);
  });
  it('é determinística', () => {
    const p0 = base();
    const p = com(p0, comp(p0, 'c1'));
    expect(buildComponentSolids(p, p.levels[0]!.id)).toEqual(buildComponentSolids(p, p.levels[0]!.id));
  });
});
