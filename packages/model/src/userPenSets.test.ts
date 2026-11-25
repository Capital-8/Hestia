import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  graphicsOf,
  migrateProject,
  serializeProject,
  type Project,
  type UserPenSet,
} from './index.ts';

const setOf = (p: Project, over: Partial<UserPenSet> = {}): UserPenSet => {
  const g = graphicsOf(p);
  return {
    id: 'ps_1',
    name: 'Meu conjunto',
    lineWeights: g.lineWeights,
    categories: g.categories,
    estiloPrancha: false,
    ...over,
  };
};

describe('salvar conjunto de penas do usuário', () => {
  it('grava uma cópia em project.penSets[ps_1]', () => {
    const s = new ProjectStore(createEmptyProject());
    const set = setOf(s.project);
    s.exec({ type: 'savePenSet', penSet: set });
    expect(s.project.penSets?.ps_1?.name).toBe('Meu conjunto');
    expect(s.project.penSets?.ps_1?.categories.wall.cutWeight).toBe(5);
    set.name = 'Outro nome';
    set.categories.wall.cutWeight = 9;
    expect(s.project.penSets?.ps_1?.name).toBe('Meu conjunto');
    expect(s.project.penSets?.ps_1?.categories.wall.cutWeight).toBe(5);
  });

  it('substitui o conjunto de mesmo id', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'savePenSet', penSet: setOf(s.project, { name: 'Primeiro' }) });
    s.exec({ type: 'savePenSet', penSet: setOf(s.project, { name: 'Segundo' }) });
    expect(Object.keys(s.project.penSets ?? {})).toEqual(['ps_1']);
    expect(s.project.penSets?.ps_1?.name).toBe('Segundo');
  });

  it('recusa nome só com espaços sem alterar o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    const antes = s.project;
    expect(() => s.exec({ type: 'savePenSet', penSet: setOf(s.project, { name: '  ' }) })).toThrow();
    expect(s.project).toBe(antes);
  });

  it('recusa id de conjunto embutido', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'savePenSet', penSet: setOf(s.project, { id: 'standard' }) })).toThrow();
    expect(s.project.penSets).toBeUndefined();
  });

  it('recusa id sem o prefixo ps_', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'savePenSet', penSet: setOf(s.project, { id: 'x1' }) })).toThrow();
    expect(s.project.penSets).toBeUndefined();
  });
});

describe('excluir conjunto de penas do usuário', () => {
  it('remove o conjunto', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'savePenSet', penSet: setOf(s.project) });
    s.exec({ type: 'deletePenSet', id: 'ps_1' });
    expect(s.project.penSets).toBeUndefined();
  });

  it('recusa id inexistente sem alterar o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    const antes = s.project;
    expect(() => s.exec({ type: 'deletePenSet', id: 'ps_9' })).toThrow();
    expect(s.project).toBe(antes);
  });
});

describe('histórico e arquivo', () => {
  it('desfazer o salvar volta a penSets ausente', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'savePenSet', penSet: setOf(s.project) });
    expect(s.project.penSets?.ps_1).toBeDefined();
    s.undo();
    expect(s.project.penSets).toBeUndefined();
  });

  it('ida e volta no JSON mantém penSets', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'savePenSet', penSet: setOf(s.project, { name: 'Guardado' }) });
    const volta = migrateProject(JSON.parse(serializeProject(s.project)));
    expect(volta.penSets?.ps_1?.name).toBe('Guardado');
    expect(volta.penSets?.ps_1?.categories.wall.cutWeight).toBe(5);
  });

  it('projeto sem penSets abre sem ganhar a chave', () => {
    const volta = migrateProject(JSON.parse(serializeProject(createEmptyProject())));
    expect(Object.keys(volta)).not.toContain('penSets');
    expect(volta.penSets).toBeUndefined();
  });
});
