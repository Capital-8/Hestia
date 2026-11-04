import { describe, expect, it } from 'vitest';
import { applyCommand as aplicarNoLugar, type Command } from './commands.ts';
import { componentCommandLabel } from './componentCommands.ts';
import { FAMILIA_ARMARIO } from './familia/exemplos.ts';
import { ProjectStore } from './history.ts';
import { migrateProject } from './migrate.ts';
import { createEmptyProject } from './defaults.ts';
import { SCHEMA_VERSION, type Component, type ComponentGroup, type Project } from './types.ts';

/** `applyCommand` altera o projeto no lugar (o histórico passa um rascunho); aqui trabalhamos em cópias. */
const applyCommand = (p: Project, c: Command): Project => {
  const q = structuredClone(p);
  aplicarNoLugar(q, c);
  return q;
};

const base = (): Project => {
  const p = createEmptyProject('t');
  return applyCommand(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
};

const comp = (id: string, extra: Partial<Component> = {}): Omit<Component, 'order'> => ({
  id,
  kind: 'component',
  familyId: FAMILIA_ARMARIO.id,
  typeId: 'A80',
  levelId: 'lv_0',
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: id,
  ...extra,
});

const comComponentes = (componentes: string[] = ['c1', 'c2', 'c3']): Project => {
  let p = base();
  for (const id of componentes) p = applyCommand(p, { type: 'addComponent', component: comp(id) });
  return p;
};

const grupo = (extra: Partial<ComponentGroup> = {}): ComponentGroup => ({
  id: 'g1',
  nome: 'Conjunto',
  levelId: 'lv_0',
  membros: ['c1', 'c2', 'c3'],
  ...extra,
});

const crer = (p: Project, g: ComponentGroup = grupo()): Project => applyCommand(p, { type: 'upsertComponentGroup', group: g });
const componente = (p: Project, id: string): Component => p.elements[id] as Component;

describe('comandos de conjunto', () => {
  it('cria o conjunto com os três membros, grava o groupId e desfaz', () => {
    const s = new ProjectStore(comComponentes());
    s.exec({ type: 'upsertComponentGroup', group: grupo() });
    expect(s.project.componentGroups?.g1?.membros).toEqual(['c1', 'c2', 'c3']);
    for (const id of ['c1', 'c2', 'c3']) expect(componente(s.project, id).groupId).toBe('g1');
    s.undo();
    expect(s.project.componentGroups?.g1).toBeUndefined();
    for (const id of ['c1', 'c2', 'c3']) expect(componente(s.project, id).groupId).toBeUndefined();
  });

  it('recusa membro inexistente, de outro nível, repetido e nome vazio', () => {
    const p = comComponentes();
    expect(() => crer(p, grupo({ membros: ['c1', 'nope'] }))).toThrow(/não existe/);
    const comOutroNivel = applyCommand(p, { type: 'addComponent', component: comp('c4', { levelId: 'lv_1' }) });
    expect(() => crer(comOutroNivel, grupo({ membros: ['c1', 'c4'] }))).toThrow(/outro nível/);
    expect(() => crer(p, grupo({ membros: ['c1', 'c1'] }))).toThrow(/repetido/);
    expect(() => crer(p, grupo({ nome: '   ' }))).toThrow(/nome/);
  });

  it('recusa membro que já está em outro conjunto e linha com a = b', () => {
    const comGrupo = crer(comComponentes());
    expect(() => crer(comGrupo, grupo({ id: 'g2', membros: ['c1'] }))).toThrow(/outro conjunto/);
    expect(() => crer(comComponentes(), grupo({ linha: { a: { x: 1, y: 2 }, b: { x: 1, y: 2 } } }))).toThrow(/dois pontos/);
  });

  it('trocar os membros solta os que saíram da lista', () => {
    const comGrupo = crer(comComponentes());
    const trocado = crer(comGrupo, grupo({ membros: ['c1', 'c2'] }));
    expect(trocado.componentGroups?.g1?.membros).toEqual(['c1', 'c2']);
    expect(componente(trocado, 'c3').groupId).toBeUndefined();
    expect(componente(trocado, 'c1').groupId).toBe('g1');
  });

  it('apaga o conjunto, mantém os componentes e limpa o groupId', () => {
    const comGrupo = crer(comComponentes());
    const semGrupo = applyCommand(comGrupo, { type: 'deleteComponentGroup', id: 'g1' });
    expect(semGrupo.componentGroups?.g1).toBeUndefined();
    for (const id of ['c1', 'c2', 'c3']) {
      expect(semGrupo.elements[id]).toBeTruthy();
      expect(componente(semGrupo, id).groupId).toBeUndefined();
    }
  });

  it('move o conjunto e a linha', () => {
    const comGrupo = crer(comComponentes(), grupo({ linha: { a: { x: 1, y: 0 }, b: { x: 3, y: 0 } } }));
    const movido = applyCommand(comGrupo, { type: 'moveComponentGroup', id: 'g1', dx: 1, dy: 2 });
    expect(componente(movido, 'c1')).toMatchObject({ x: 1, y: 2 });
    expect(componente(movido, 'c2')).toMatchObject({ x: 1, y: 2 });
    expect(movido.componentGroups?.g1?.linha?.a).toEqual({ x: 2, y: 2 });
    expect(movido.componentGroups?.g1?.linha?.b).toEqual({ x: 4, y: 2 });
  });

  it('gira o conjunto 90° em torno de (0, 0), soma a rotação e gira a linha', () => {
    let p = base();
    p = applyCommand(p, { type: 'addComponent', component: comp('c1', { x: 1, y: 0 }) });
    p = applyCommand(p, { type: 'addComponent', component: comp('c2', { x: 2, y: 0 }) });
    p = applyCommand(p, { type: 'addComponent', component: comp('c3', { x: 3, y: 0 }) });
    p = crer(p, grupo({ linha: { a: { x: 1, y: 0 }, b: { x: 3, y: 0 } } }));
    const girado = applyCommand(p, { type: 'rotateComponentGroup', id: 'g1', centro: { x: 0, y: 0 }, angulo: Math.PI / 2 });
    const c1 = componente(girado, 'c1');
    expect(c1.x).toBeCloseTo(0);
    expect(c1.y).toBeCloseTo(1);
    expect(c1.rotation).toBeCloseTo(Math.PI / 2);
    expect(girado.componentGroups?.g1?.linha?.a.x).toBeCloseTo(0);
    expect(girado.componentGroups?.g1?.linha?.a.y).toBeCloseTo(1);
    expect(girado.componentGroups?.g1?.linha?.b.x).toBeCloseTo(0);
    expect(girado.componentGroups?.g1?.linha?.b.y).toBeCloseTo(3);
  });

  it('os rótulos são os pedidos', () => {
    expect(componentCommandLabel({ type: 'upsertComponentGroup', group: grupo() })).toBe('Criar conjunto');
    expect(componentCommandLabel({ type: 'deleteComponentGroup', id: 'g1' })).toBe('Desfazer conjunto');
    expect(componentCommandLabel({ type: 'moveComponentGroup', id: 'g1', dx: 0, dy: 0 })).toBe('Mover conjunto');
    expect(componentCommandLabel({ type: 'rotateComponentGroup', id: 'g1', centro: { x: 0, y: 0 }, angulo: 0 })).toBe('Girar conjunto');
  });
});

describe('integridade do conjunto', () => {
  it('excluir um membro tira ele do conjunto e mantém o restante', () => {
    const comGrupo = crer(comComponentes());
    const semC2 = applyCommand(comGrupo, { type: 'deleteElements', ids: ['c2'] });
    expect(semC2.componentGroups?.g1?.membros).toEqual(['c1', 'c3']);
    expect(componente(semC2, 'c1').groupId).toBe('g1');
  });

  it('excluir todos os membros remove o conjunto', () => {
    const comGrupo = crer(comComponentes());
    const semTodos = applyCommand(comGrupo, { type: 'deleteElements', ids: ['c1', 'c2', 'c3'] });
    expect(semTodos.componentGroups?.g1).toBeUndefined();
  });

  it('recusa componente com groupId de conjunto inexistente no add e no update', () => {
    const p = comComponentes();
    expect(() => applyCommand(p, { type: 'addComponent', component: comp('c9', { groupId: 'nao' }) })).toThrow(/Conjunto/);
    expect(() => applyCommand(p, { type: 'updateComponent', id: 'c1', patch: { groupId: 'nao' } })).toThrow(/Conjunto/);
  });
});

describe('transformação padrão e linhas', () => {
  const comLinha = (): Project => crer(comComponentes(), grupo({ linha: { a: { x: 1, y: 0 }, b: { x: 3, y: 0 } } }));

  it('mover TODOS os membros leva a linha junto', () => {
    const movido = applyCommand(comLinha(), {
      type: 'transform',
      ids: ['c1', 'c2', 'c3'],
      transform: { kind: 'translate', d: { x: 5, y: 0 } },
    });
    expect(componente(movido, 'c1').x).toBe(5);
    expect(movido.componentGroups?.g1?.linha?.a).toEqual({ x: 6, y: 0 });
    expect(movido.componentGroups?.g1?.linha?.b).toEqual({ x: 8, y: 0 });
  });

  it('mover só um membro tira a linha e mantém os membros', () => {
    const movido = applyCommand(comLinha(), {
      type: 'transform',
      ids: ['c1'],
      transform: { kind: 'translate', d: { x: 5, y: 0 } },
    });
    expect(componente(movido, 'c1').x).toBe(5);
    expect(movido.componentGroups?.g1?.linha).toBeUndefined();
    expect(movido.componentGroups?.g1?.membros).toEqual(['c1', 'c2', 'c3']);
  });
});

describe('migração', () => {
  it('projeto v24 sem grupos migra para 25 sem componentGroups', () => {
    const antigo = JSON.parse(JSON.stringify(createEmptyProject('antigo'))) as Record<string, unknown>;
    antigo.schemaVersion = 24;
    delete antigo.componentGroups;
    const p = migrateProject(antigo);
    expect(SCHEMA_VERSION).toBe(25);
    expect(p.schemaVersion).toBe(25);
    expect(p.componentGroups).toBeUndefined();
  });
});
