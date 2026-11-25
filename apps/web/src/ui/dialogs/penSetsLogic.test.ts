import { describe, expect, it } from 'vitest';
import { createEmptyProject, graphicsOf, penSetById, ProjectStore, type UserPenSet } from '@hestia/model';
import { editProjectGraphics } from '../../editor/graphicsActions.ts';
import { applyPenSet, saveCurrentAsPenSet } from '../../editor/penSetActions.ts';
import { conjuntosDoUsuario, emUso, nomeValido, paredeCortada } from './penSetsLogic.ts';

const novoProjeto = (): ProjectStore => new ProjectStore(createEmptyProject());

describe('conjunto de penas em uso', () => {
  it('projeto vazio usa o padrão do Hestia', () => {
    expect(emUso(novoProjeto().project)).toBe('standard');
  });

  it('acompanha o conjunto aplicado (executivo e anteprojeto)', () => {
    const store = novoProjeto();
    expect(applyPenSet(store, 'heavy').ok).toBe(true);
    expect(emUso(store.project)).toBe('heavy');
    expect(applyPenSet(store, 'light').ok).toBe(true);
    expect(emUso(store.project)).toBe('light');
  });

  it('peso adulterado deixa o conjunto como personalizado', () => {
    const store = novoProjeto();
    expect(editProjectGraphics(store, { categories: { wall: { cutWeight: 7 } } }).ok).toBe(true);
    expect(emUso(store.project)).toBeNull();
  });
});

describe('amostra da parede cortada em 1:100', () => {
  it('padrão do Hestia: 0,50 mm; executivo: 0,70 mm', () => {
    expect(paredeCortada(penSetById('standard')!, 100, 'pt')).toBe('0,50 mm');
    expect(paredeCortada(penSetById('heavy')!, 100, 'pt')).toBe('0,70 mm');
  });
});

describe('nome de conjunto do usuário', () => {
  it('recusa vazio e só espaços', () => {
    expect(nomeValido('')).toBe(false);
    expect(nomeValido('   ')).toBe(false);
  });

  it('aceita nome aparado com até 60 caracteres', () => {
    expect(nomeValido(' Meu ')).toBe(true);
    expect(nomeValido('x'.repeat(60))).toBe(true);
    expect(nomeValido('x'.repeat(61))).toBe(false);
  });
});

describe('conjuntos do usuário', () => {
  it('projeto sem penSets devolve lista vazia', () => {
    expect(conjuntosDoUsuario(novoProjeto().project)).toEqual([]);
  });

  it('ordena pelo número do id: ps_2 antes de ps_10', () => {
    const store = novoProjeto();
    const g = graphicsOf(store.project);
    for (const id of ['ps_10', 'ps_2', 'ps_1']) {
      const penSet: UserPenSet = { id, name: id, lineWeights: g.lineWeights, categories: g.categories, estiloPrancha: false };
      store.exec({ type: 'savePenSet', penSet });
    }
    expect(conjuntosDoUsuario(store.project).map((s) => s.id)).toEqual(['ps_1', 'ps_2', 'ps_10']);
  });

  it('emUso devolve o ps_N salvo com peso adulterado e aplicado', () => {
    const store = novoProjeto();
    expect(editProjectGraphics(store, { categories: { wall: { cutWeight: 7 } } }).ok).toBe(true);
    const salvo = saveCurrentAsPenSet(store, 'Corte sete');
    expect(salvo.ok).toBe(true);
    expect(salvo.id).toBe('ps_1');
    expect(editProjectGraphics(store, { categories: { wall: { cutWeight: 5 } } }).ok).toBe(true);
    expect(emUso(store.project)).toBe('standard');
    expect(applyPenSet(store, 'ps_1').ok).toBe(true);
    expect(emUso(store.project)).toBe('ps_1');
  });
});
