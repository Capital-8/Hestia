import { BIBLIOTECA_BASE, ProjectStore, createEmptyProject } from '@hestia/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, useUi } from '../editor/state.ts';
import {
  aplicarEscolhaDeFamilia,
  familiaInicial,
  familiasDaBiblioteca,
  familiasDoProjeto,
  resolverEscolhaDeFamilia,
  tiposDaFamilia,
} from './ComponentOptionsBar.tsx';

beforeEach(() => {
  useUi.setState({ options: { ...DEFAULT_OPTIONS } });
});

describe('barra de opções do componente', () => {
  it('lista as famílias do projeto e as da biblioteca ainda não carregadas', () => {
    const store = new ProjectStore(createEmptyProject('teste'));
    const vazio = store.project;
    expect(familiasDoProjeto(vazio)).toEqual([]);
    expect(familiasDaBiblioteca(vazio)).toHaveLength(BIBLIOTECA_BASE.length);
    const alvo = BIBLIOTECA_BASE[0]!;
    store.exec({ type: 'upsertFamily', family: structuredClone(alvo) }, 'Carregar família');
    expect(familiasDoProjeto(store.project).map((f) => f.id)).toEqual([alvo.id]);
    expect(familiasDaBiblioteca(store.project).map((f) => f.id)).not.toContain(alvo.id);
  });

  it('escolher uma família da biblioteca carrega no projeto e muda componentFamilyId', () => {
    const store = new ProjectStore(createEmptyProject('teste'));
    const alvo = BIBLIOTECA_BASE[0]!;
    const escolha = aplicarEscolhaDeFamilia(store, alvo.id);
    expect(escolha?.familia.id).toBe(alvo.id);
    expect(store.project.componentFamilies?.[alvo.id]).toBeDefined();
    expect(escolha?.opcoes.componentFamilyId).toBe(alvo.id);
    expect(escolha?.opcoes.componentTypeId).toBeNull();
    useUi.setState((s) => ({ options: { ...s.options, ...escolha!.opcoes } }));
    expect(useUi.getState().options.componentFamilyId).toBe(alvo.id);
  });

  it('escolher uma família já carregada não cria outra entrada nem mexe no tipo escolhido depois', () => {
    const store = new ProjectStore(createEmptyProject('teste'));
    const alvo = BIBLIOTECA_BASE[0]!;
    store.exec({ type: 'upsertFamily', family: structuredClone(alvo) }, 'Carregar família');
    const escolha = aplicarEscolhaDeFamilia(store, alvo.id);
    expect(escolha?.familia.id).toBe(alvo.id);
    expect(Object.keys(store.project.componentFamilies ?? {})).toEqual([alvo.id]);
    useUi.setState((s) => ({ options: { ...s.options, ...escolha!.opcoes, componentTypeId: 'A80' } }));
    expect(useUi.getState().options.componentTypeId).toBe('A80');
  });

  it('a família inicial é a primeira do projeto, senão a primeira da biblioteca', () => {
    const store = new ProjectStore(createEmptyProject('teste'));
    expect(familiaInicial(store.project)?.id).toBe(BIBLIOTECA_BASE[0]!.id);
    const alvo = BIBLIOTECA_BASE[3]!;
    store.exec({ type: 'upsertFamily', family: structuredClone(alvo) }, 'Carregar família');
    expect(familiaInicial(store.project)?.id).toBe(alvo.id);
  });

  it('resolve o id para projeto ou biblioteca e devolve null quando não existe', () => {
    const store = new ProjectStore(createEmptyProject('teste'));
    const alvo = BIBLIOTECA_BASE[0]!;
    expect(resolverEscolhaDeFamilia(store.project, alvo.id)).toMatchObject({ familia: { id: alvo.id }, carregar: true });
    store.exec({ type: 'upsertFamily', family: structuredClone(alvo) }, 'Carregar família');
    expect(resolverEscolhaDeFamilia(store.project, alvo.id)).toMatchObject({ familia: { id: alvo.id }, carregar: false });
    expect(resolverEscolhaDeFamilia(store.project, 'nao_existe')).toBeNull();
  });

  it('os tipos vêm da família escolhida (vazio sem família)', () => {
    const alvo = BIBLIOTECA_BASE[0]!;
    expect(tiposDaFamilia(alvo).map((tp) => tp.id)).toEqual(alvo.tipos.map((tp) => tp.id));
    expect(tiposDaFamilia(null)).toEqual([]);
  });
});
