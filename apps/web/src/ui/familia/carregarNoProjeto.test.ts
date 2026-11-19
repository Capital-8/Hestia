import { FAMILIA_ARMARIO, ProjectStore, createEmptyProject, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { carregarNoProjeto, validarParaCarregar } from './carregarNoProjeto.ts';

const armario = (): Familia => structuredClone(FAMILIA_ARMARIO);

describe('carregar a família no projeto', () => {
  it('grava a família em project.componentFamilies num passo de desfazer', () => {
    const store = new ProjectStore(createEmptyProject('teste'));
    const r = carregarNoProjeto(store, armario());
    expect(r.ok).toBe(true);
    expect(store.project.componentFamilies?.[FAMILIA_ARMARIO.id]).toEqual(FAMILIA_ARMARIO);
    expect(store.undoLabel).toBe('Carregar família no projeto');
  });

  it('recusa família com erro de validação e não altera o projeto', () => {
    const store = new ProjectStore(createEmptyProject('teste'));
    const ruim: Familia = { ...armario(), parametros: [] };
    expect(validarParaCarregar(ruim)).toContain('Não foi possível carregar');
    const r = carregarNoProjeto(store, ruim);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain(FAMILIA_ARMARIO.nome);
    expect(store.project.componentFamilies).toBeUndefined();
    expect(store.canUndo).toBe(false);
  });
});

describe('carregar traz os módulos aninhados da biblioteca', () => {
  it('a cômoda leva a gaveta junto, num único passo de desfazer, e resolve sem erros', async () => {
    const { BIBLIOTECA_BASE } = await import('@hestia/model');
    const { resolverComponente } = await import('@hestia/engine');
    const comoda = BIBLIOTECA_BASE.find((f) => f.id === 'fam_comoda')!;
    const store = new ProjectStore(createEmptyProject('teste'));
    const r = carregarNoProjeto(store, structuredClone(comoda));
    expect(r.ok).toBe(true);
    expect(store.project.componentFamilies?.['fam_gaveta']).toBeDefined();
    const c = { id: 'c1', kind: 'component' as const, familyId: 'fam_comoda', typeId: null, levelId: 'lv_0', order: 0, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: '' };
    expect(resolverComponente(store.project, c).erros).toEqual([]);
    store.undo();
    expect(store.project.componentFamilies?.['fam_comoda']).toBeUndefined();
    expect(store.project.componentFamilies?.['fam_gaveta']).toBeUndefined();
  }, 30000);
});
