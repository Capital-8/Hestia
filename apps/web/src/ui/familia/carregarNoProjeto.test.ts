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
