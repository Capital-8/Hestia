import { BIBLIOTECA_MEP, createEmptyProject, type Component, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { buildComponentSolids } from './componentSolids.ts';

/*
 * Fichas K1 e K4: no 3D do projeto, o corpo sai com o material da família (PVC branco no esgoto, PVC marrom no soldável, aço no
 * perfil), nunca mais com a madeira fixa `comp_corpo`.
 */

function projetoCom(familyId: string, tipoId: string): Project {
  const familia = BIBLIOTECA_MEP.find((f) => f.id === familyId);
  if (!familia) throw new Error(familyId);
  const base = createEmptyProject('t');
  const nivel = Object.keys(base.levels)[0];
  if (!nivel) throw new Error('sem nível');
  const comp: Component = { id: 'c1', kind: 'component', familyId, typeId: tipoId, levelId: nivel, order: 0, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: '' };
  return { ...base, componentFamilies: { [familyId]: familia }, elements: { ...base.elements, c1: comp } };
}

const materiais = (p: Project): string[] => {
  const nivel = Object.keys(p.levels)[0] ?? '';
  return buildComponentSolids(p, nivel).map((b) => b.materialId).sort();
};

describe('material dos corpos no projeto', () => {
  it('tubo de esgoto da Krona: PVC branco, sem madeira', () => {
    expect(materiais(projetoCom('fam_krona_esgoto_tubo', 'dn100'))).toEqual(['comp_pvc_branco']);
  });
  it('joelho soldável da Krona: PVC marrom', () => {
    expect(materiais(projetoCom('fam_krona_soldavel_joelho90', 'dn25'))).toEqual(['comp_pvc_marrom']);
  });
  it('perfil estrutural: o material de aço do próprio projeto (id mat_aco, editável pelo usuário)', () => {
    const f = BIBLIOTECA_MEP.find((x) => x.id === 'fam_perfil_i');
    expect(f).toBeDefined();
    expect(materiais(projetoCom('fam_perfil_i', f?.tipos[0]?.id ?? ''))).toEqual(['mat_aco']);
  });
  it('família antiga com mat_pvc usa o PVC do projeto (id mat_pvc), não a madeira fixa', () => {
    const r = materiais(projetoCom('fam_tubo_esgoto', 'dn100'));
    expect(r).toEqual(['mat_pvc']);
    expect(r).not.toContain('comp_corpo');
  });
});
