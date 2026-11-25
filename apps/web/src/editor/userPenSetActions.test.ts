import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, graphicsOf, type UserPenSet } from '@hestia/model';
import { emUso } from '../ui/dialogs/penSetsLogic.ts';
import { applyPenSet, deleteUserPenSet, saveCurrentAsPenSet } from './penSetActions.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());

describe('salvar o ajuste atual como conjunto do usuário', () => {
  it('devolve ps_1 e guarda o nome sem espaços nas pontas', () => {
    const s = store();
    const r = saveCurrentAsPenSet(s, ' Meu conjunto ');
    expect(r).toEqual({ ok: true, error: null, id: 'ps_1' });
    expect(s.project.penSets?.ps_1?.name).toBe('Meu conjunto');
  });

  it('guarda os pesos atuais e o estilo de prancha sempre falso', () => {
    const s = store();
    expect(applyPenSet(s, 'heavy').ok).toBe(true);
    const r = saveCurrentAsPenSet(s, 'Executivo meu');
    expect(s.project.penSets?.[r.id!]?.categories.wall.cutWeight).toBe(6);
    expect(s.project.penSets?.[r.id!]?.estiloPrancha).toBe(false);
  });

  it('o segundo salvar devolve ps_2', () => {
    const s = store();
    expect(saveCurrentAsPenSet(s, 'Primeiro').id).toBe('ps_1');
    expect(saveCurrentAsPenSet(s, 'Segundo').id).toBe('ps_2');
  });

  it('aplica os pesos do conjunto salvo pelo id', () => {
    const s = store();
    saveCurrentAsPenSet(s, 'Padrão meu');
    expect(applyPenSet(s, 'heavy').ok).toBe(true);
    expect(graphicsOf(s.project).categories.wall.cutWeight).toBe(6);
    expect(applyPenSet(s, 'ps_1').ok).toBe(true);
    expect(graphicsOf(s.project).categories.wall.cutWeight).toBe(5);
  });

  it('apagar ps_1 e salvar de novo reutiliza ps_1', () => {
    const s = store();
    saveCurrentAsPenSet(s, 'Primeiro');
    saveCurrentAsPenSet(s, 'Segundo');
    expect(deleteUserPenSet(s, 'ps_1').ok).toBe(true);
    expect(saveCurrentAsPenSet(s, 'Terceiro').id).toBe('ps_1');
  });

  it('recusa apagar um conjunto embutido', () => {
    const s = store();
    const r = deleteUserPenSet(s, 'standard');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(s.project.penSets).toBeUndefined();
  });
});

describe('conjunto do usuário em uso', () => {
  it('o embutido tem precedência sobre um conjunto igual do usuário', () => {
    const s = store();
    saveCurrentAsPenSet(s, 'Ajuste atual');
    expect(emUso(s.project)).toBe('standard');
  });

  it('depois de aplicar um conjunto do usuário adulterado, ele fica em uso', () => {
    const s = store();
    saveCurrentAsPenSet(s, 'Ajuste atual');
    const g = graphicsOf(s.project);
    const adulterado: UserPenSet = {
      id: 'ps_1',
      name: 'Parede mais grossa',
      lineWeights: g.lineWeights,
      categories: { ...g.categories, wall: { ...g.categories.wall, cutWeight: 7 } },
      estiloPrancha: false,
    };
    s.exec({ type: 'savePenSet', penSet: adulterado });
    expect(applyPenSet(s, 'ps_1').ok).toBe(true);
    expect(emUso(s.project)).toBe('ps_1');
  });
});
