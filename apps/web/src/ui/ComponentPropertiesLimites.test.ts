import { resolverComponente } from '@hestia/engine';
import { FAMILIA_ARMARIO, ProjectStore, createEmptyProject, type Component, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { aplicarValorDeParametro } from './componentPropAcoes.ts';

const componente = (id: string): Component => ({
  id,
  kind: 'component',
  familyId: FAMILIA_ARMARIO.id,
  typeId: 'A80',
  levelId: 'lv_0',
  order: 0,
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: '',
});

const projeto = (): Project => {
  const p = createEmptyProject('limites');
  p.componentFamilies = { [FAMILIA_ARMARIO.id]: structuredClone(FAMILIA_ARMARIO) };
  p.elements.c1 = componente('c1');
  p.nextOrder = 2;
  return p;
};

const ler = (store: ProjectStore): Component => store.project.elements.c1 as Component;

describe('limites do parâmetro de instância no painel do componente', () => {
  it('valor acima do máximo não grava em values', () => {
    const store = new ProjectStore(projeto());
    const r = aplicarValorDeParametro(store, ['c1'], 'L', 5000);
    expect(r.ok).toBe(false);
    expect(ler(store).values).toBeUndefined();
    expect(resolverComponente(store.project, ler(store)).env.L).toBe(800);
  });

  it('valor abaixo do mínimo não grava em values', () => {
    const store = new ProjectStore(projeto());
    const r = aplicarValorDeParametro(store, ['c1'], 'L', 200);
    expect(r.ok).toBe(false);
    expect(ler(store).values).toBeUndefined();
  });

  it('valor dentro da faixa continua gravando', () => {
    const store = new ProjectStore(projeto());
    expect(aplicarValorDeParametro(store, ['c1'], 'L', 1000)).toEqual({ ok: true });
    expect(ler(store).values).toEqual({ L: 1000 });
    expect(resolverComponente(store.project, ler(store)).env.L).toBe(1000);
  });
});
