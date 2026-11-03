import { describe, expect, it } from 'vitest';
import { resolverComponente } from '@hestia/engine';
import { FAMILIA_ARMARIO, ProjectStore, createEmptyProject, type Component, type Project } from '@hestia/model';
import {
  aplicarPatchDeComponente,
  aplicarValorDeParametro,
  comumDe,
  grausParaRadianos,
  metrosParaMilimetros,
  milimetrosParaMetros,
  radianosParaGraus,
} from './componentPropAcoes.ts';

const componente = (id: string, extra: Partial<Component> = {}): Component => ({
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
  ...extra,
});

const projeto = (...componentes: Component[]): Project => {
  const p = createEmptyProject('t');
  p.componentFamilies = { [FAMILIA_ARMARIO.id]: structuredClone(FAMILIA_ARMARIO) };
  for (const c of componentes) p.elements[c.id] = c;
  p.nextOrder = componentes.length + 1;
  return p;
};

const ler = (store: ProjectStore, id: string): Component => store.project.elements[id] as Component;

describe('ações do painel de propriedades do componente', () => {
  it('troca o tipo e grava typeId', () => {
    const store = new ProjectStore(projeto(componente('c1', { typeId: 'A60' })));
    aplicarPatchDeComponente(store, ['c1'], { typeId: 'A100' }, 'Trocar tipo');
    expect(ler(store, 'c1').typeId).toBe('A100');
  });

  it('edita parâmetro de instância gravando values em milímetros', () => {
    const store = new ProjectStore(projeto(componente('c1')));
    expect(aplicarValorDeParametro(store, ['c1'], 'L', 1000)).toEqual({ ok: true });
    expect(ler(store, 'c1').values).toEqual({ L: 1000 });
    expect(resolverComponente(store.project, ler(store, 'c1')).env.L).toBe(1000);
  });

  it('↺ remove o valor da instância e volta ao valor do tipo', () => {
    const store = new ProjectStore(projeto(componente('c1', { values: { L: 1000 } })));
    expect(aplicarValorDeParametro(store, ['c1'], 'L', null)).toEqual({ ok: true });
    expect(ler(store, 'c1').values).toBeUndefined();
    expect(resolverComponente(store.project, ler(store, 'c1')).env.L).toBe(800);
  });

  it('valor recusado pela resolução não grava nem cria passo de desfazer', () => {
    const store = new ProjectStore(projeto(componente('c1')));
    const antes = store.project;
    const r = aplicarValorDeParametro(store, ['c1'], 'L', 0);
    expect(r.ok).toBe(false);
    expect(ler(store, 'c1').values).toBeUndefined();
    expect(store.project).toBe(antes);
  });

  it('posição, rotação e espelho viram um patch de instância', () => {
    const store = new ProjectStore(projeto(componente('c1')));
    aplicarPatchDeComponente(store, ['c1'], { x: 2, y: 3, z: 0.5, mirrored: true }, 'Mover componente');
    aplicarPatchDeComponente(store, ['c1'], { rotation: grausParaRadianos(90) }, 'Girar componente');
    const c = ler(store, 'c1');
    expect(c.x).toBe(2);
    expect(c.y).toBe(3);
    expect(c.z).toBe(0.5);
    expect(c.mirrored).toBe(true);
    expect(c.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(radianosParaGraus(c.rotation)).toBeCloseTo(90, 12);
  });

  it('seleção múltipla aplica o mesmo campo a todos em uma transação', () => {
    const store = new ProjectStore(projeto(componente('c1'), componente('c2', { typeId: 'A60' })));
    aplicarPatchDeComponente(store, ['c1', 'c2'], { mark: 'M1' }, 'Alterar marca');
    expect(ler(store, 'c1').mark).toBe('M1');
    expect(ler(store, 'c2').mark).toBe('M1');
    store.undo();
    expect(ler(store, 'c1').mark).toBe('');
    expect(ler(store, 'c2').mark).toBe('');
  });

  it('seleção múltipla grava o parâmetro de instância em todos', () => {
    const store = new ProjectStore(projeto(componente('c1'), componente('c2', { typeId: 'A60' })));
    expect(aplicarValorDeParametro(store, ['c1', 'c2'], 'L', 900)).toEqual({ ok: true });
    expect(ler(store, 'c1').values).toEqual({ L: 900 });
    expect(ler(store, 'c2').values).toEqual({ L: 900 });
  });

  it('valor comum marca como misto quando os componentes diferem', () => {
    const iguais = comumDe([componente('a'), componente('b')], (c) => c.typeId);
    expect(iguais).toEqual({ valor: 'A80', misto: false });
    const diferentes = comumDe([componente('a', { typeId: 'A60' }), componente('b')], (c) => c.typeId);
    expect(diferentes.misto).toBe(true);
  });

  it('converte metros/milímetros e graus/radianos', () => {
    expect(metrosParaMilimetros(0.8)).toBe(800);
    expect(milimetrosParaMetros(800)).toBeCloseTo(0.8, 12);
    expect(radianosParaGraus(grausParaRadianos(180))).toBeCloseTo(180, 12);
  });
});
