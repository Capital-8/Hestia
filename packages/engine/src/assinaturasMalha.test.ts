import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Generic, type Project } from '@hestia/model';
import { assinaturasDoProjeto } from './assinaturasNivel.ts';

const generico = (id: string, levelId: string, positions: Float32Array | number[], indices: Uint32Array | number[]): Generic => ({
  id,
  kind: 'generic',
  levelId,
  name: id,
  sourceClass: 'IFCBEAM',
  mesh: { positions, indices },
  order: 1,
});

const projetoCom = (g: Generic): Project => {
  const p = createEmptyProject();
  p.elements = { [g.id]: { ...g, levelId: p.levels[0]!.id } };
  return p;
};

const tri = (z: number) => new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]);

describe('assinatura do nível com malha genérica', () => {
  it('muda quando o conteúdo da malha muda e não muda quando é o mesmo conteúdo', () => {
    const lv = createEmptyProject().levels[0]!.id;
    const base = assinaturasDoProjeto(projetoCom(generico('g1', lv, tri(0), new Uint32Array([0, 1, 2]))));
    const igual = assinaturasDoProjeto(projetoCom(generico('g1', lv, tri(0), new Uint32Array([0, 1, 2]))));
    const outra = assinaturasDoProjeto(projetoCom(generico('g1', lv, tri(5), new Uint32Array([0, 1, 2]))));
    const outrosIndices = assinaturasDoProjeto(projetoCom(generico('g1', lv, tri(0), new Uint32Array([0, 2, 1]))));
    expect(igual.nivel.get(lv)).toBe(base.nivel.get(lv));
    expect(outra.nivel.get(lv)).not.toBe(base.nivel.get(lv));
    expect(outrosIndices.nivel.get(lv)).not.toBe(base.nivel.get(lv));
  });

  it('projeto antigo (number[]) e typed array do mesmo conteúdo dão a mesma assinatura', () => {
    const lv = createEmptyProject().levels[0]!.id;
    const a = assinaturasDoProjeto(projetoCom(generico('g1', lv, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2])));
    const b = assinaturasDoProjeto(projetoCom(generico('g1', lv, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]))));
    expect(a.nivel.get(lv)).toBe(b.nivel.get(lv));
  });

  it('uma malha grande é assinada em milissegundos e a segunda chamada reaproveita o hash', () => {
    const lv = createEmptyProject().levels[0]!.id;
    const n = 3_000_000;
    const positions = new Float32Array(n * 3).map((_, i) => (i * 7919) % 1000);
    const indices = new Uint32Array(n).map((_, i) => i);
    const p = projetoCom(generico('g1', lv, positions, indices));
    const t0 = performance.now();
    const a = assinaturasDoProjeto(p);
    const primeira = performance.now() - t0;
    const t1 = performance.now();
    const b = assinaturasDoProjeto(p);
    const segunda = performance.now() - t1;
    expect(b.nivel.get(lv)).toBe(a.nivel.get(lv));
    expect(primeira).toBeLessThan(1500);
    expect(segunda).toBeLessThan(200);
  });
});
