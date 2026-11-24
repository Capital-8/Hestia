import { describe, expect, it } from 'vitest';
import { computeSection, corposNoCorte, type SectionResult } from '@hestia/engine';
import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Corpo, type Familia, type Project } from '@hestia/model';
import { pickSection } from './pick.ts';

/*
 * Pick no corte dos corpos (ficha B5): o laço do corpo (B4) entra no corte com a origem `componentId`, e o clique dentro
 * do laço devolve o id da INSTÂNCIA, como as peças. Cilindro Ø100 × 600 mm em pé, instância em (1, 2), corte em y = 2.
 */

const cilindro = (): Corpo => ({
  id: 'cil',
  nome: 'Cilindro',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '100' }, comprimento: '600' },
  quadro: { origem: ['0', '0', '0'], rotacao: ['0', '0', '0'] },
});

function cena(corpos?: Corpo[]): Project {
  const p = createEmptyProject('t');
  const familia: Familia = { ...structuredClone(FAMILIA_ARMARIO), ...(corpos ? { corpos } : {}) };
  aplicar(p, { type: 'upsertFamily', family: familia });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: familia.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'c1' };
  return p;
}

/** Corte como o motor monta com o corpo: a seção do projeto mais os laços dos corpos, na origem `componentId`. */
function corteComCorpos(p: Project): SectionResult {
  const line = { a: { x: 0, y: 2 }, b: { x: 3, y: 2 }, depth: 1.5 };
  const base = computeSection(p, line);
  const corpos = corposNoCorte(p, line);
  const cut = corpos.cut.map((c) => ({ materialId: c.materialId, polygons: c.polygons, sources: [{ componentId: c.componentId }] }));
  return { ...base, cut: [...base.cut, ...cut] };
}

describe('pick no corte dos corpos (ficha B5)', () => {
  it('clique dentro do laço do cilindro devolve a instância', () => {
    const p = cena([cilindro()]);
    // t = x (0 a 3 m), z = cota. O cilindro está em t = 1 e vai de z = 0 a 0,6.
    expect(pickSection(corteComCorpos(p), { x: 1, y: 0.3 }, 0, undefined, p)?.id).toBe('c1');
  });

  it('clique fora do laço (ao lado e acima do cilindro) não acha a instância', () => {
    const p = cena([cilindro()]);
    const s = corteComCorpos(p);
    expect(pickSection(s, { x: 2.5, y: 0.3 }, 0, undefined, p)).toBeNull();
    expect(pickSection(s, { x: 1, y: 0.8 }, 0, undefined, p)).toBeNull();
  });

  it('família sem corpos: não há laço de corpo e o pick no mesmo ponto é o da seção de sempre (peças do armário)', () => {
    const p = cena();
    const line = { a: { x: 0, y: 2 }, b: { x: 3, y: 2 }, depth: 1.5 };
    expect(corposNoCorte(p, line).cut).toEqual([]);
    const ponto = { x: 1, y: 0.3 };
    expect(pickSection(corteComCorpos(p), ponto, 0, undefined, p)).toEqual(pickSection(computeSection(p, line), ponto, 0, undefined, p));
  });
});
