import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate, makeView3DView, view3dOf, view3dViewOf, view3dViewsOf, type Camera3D } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { viewKey as openViewKey } from './openViews.ts';
import { identityOfFields, viewKey, visibilityKeyOfFields, type ViewIdentityFields } from './viewIdentity.ts';
import { tabOf } from './viewTabActions.ts';
import { hideInView, unhideAllInView, visibilityKeyOf, visibilityOf } from './viewVisibility.ts';
import { abrirVista3dAction, cameraDaVista3d, duplicarVista3dAction, excluirVista3dAction, gravarCameraDaVista3dAction, renomearVista3dAction } from './vista3dSalvaAcoes.ts';

const piso = { view: 'plan', levelId: 'lv_1', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, planViewId: null, view3dViewId: null } satisfies ViewIdentityFields;

const CAM_A: Camera3D = { azimuth: 10, elevation: 20, distance: 15, target: { x: 1, y: 2, z: 3 }, ortho: true };
const CAM_B: Camera3D = { azimuth: 30, elevation: 40, distance: 25, target: { x: 4, y: 5, z: 6 }, ortho: false };

/** Projeto com duas vistas 3D salvas, carregado no controlador (estado real de sessão). */
function abre(): void {
  const p = structuredClone(buildTemplate('house2'));
  p.view3dViews = [
    makeView3DView(p, { id: 'v3d_a', name: 'Fachada Norte', camera: CAM_A }),
    makeView3DView(p, { id: 'v3d_b', name: 'Corte 3D', camera: CAM_B }),
  ];
  editor.load(p, 'x.hestia.json');
}

afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, view3dViewId: null, sectionId: null, viewTemp: {}, selection: [], openViews: [{ kind: 'plan', levelId: 'lv_0' }] }));

describe('identidade da vista 3D salva', () => {
  it('chave `3d` no padrão e `3d:<id>` na salva, em todos os pontos de uso', () => {
    expect(viewKey({ kind: '3d' })).toBe('3d');
    expect(viewKey({ kind: '3d', viewId: 'v3d_a' })).toBe('3d:v3d_a');
    expect(identityOfFields({ ...piso, view: '3d' })).toEqual({ kind: '3d' });
    expect(identityOfFields({ ...piso, view: '3d', view3dViewId: 'v3d_a' })).toEqual({ kind: '3d', viewId: 'v3d_a' });
    expect(visibilityKeyOfFields({ ...piso, view: '3d', view3dViewId: 'v3d_a' })).toBe('3d:v3d_a');
    expect(visibilityKeyOfFields({ ...piso, view: '3d' })).toBe('3d');
  });
});

describe('navegador: abrir, duplicar, renomear e excluir', () => {
  it('abre a aba 3d:<id> com o nome da vista e não duplica a aba ao reabrir', () => {
    abre();
    expect(abrirVista3dAction('v3d_a')).toBeNull();
    expect(useUi.getState().view).toBe('3d');
    expect(useUi.getState().view3dViewId).toBe('v3d_a');
    expect(useUi.getState().openViews.map(openViewKey)).toContain('3d:v3d_a');
    abrirVista3dAction('v3d_a');
    expect(useUi.getState().openViews.map(openViewKey).filter((k) => k === '3d:v3d_a')).toEqual(['3d:v3d_a']);
  });

  it('duplica com `duplicateView3d` e abre a cópia, com nome único', () => {
    abre();
    const r = duplicarVista3dAction(editor.store, 'v3d_a', 'v3d_copia');
    expect(r).toEqual({ id: 'v3d_copia' });
    expect(view3dViewOf(editor.store.project, 'v3d_copia')?.name).toBe('Fachada Norte (2)');
    expect(cameraDaVista3d(editor.store, 'v3d_copia')).toEqual(CAM_A);
    expect(useUi.getState().view3dViewId).toBe('v3d_copia');
    expect(useUi.getState().openViews.map(openViewKey)).toContain('3d:v3d_copia');
  });

  it('renomeia a vista salva e a aba passa a mostrar o nome novo', () => {
    abre();
    expect(renomearVista3dAction(editor.store, 'v3d_a', 'Fachada Sul')).toBeNull();
    expect(editor.project.view3dViews?.map((v) => [v.id, v.name])).toEqual([['v3d_a', 'Fachada Sul'], ['v3d_b', 'Corte 3D']]);
    expect(tabOf(editor.project, { kind: '3d', viewId: 'v3d_a' })).toEqual({ icon: 'cube', label: 'Fachada Sul' });
  });

  it('excluir remove a vista e a aba; se era a ativa, volta ao 3D padrão', () => {
    abre();
    abrirVista3dAction('v3d_a');
    expect(excluirVista3dAction(editor.store, 'v3d_a')).toBeNull();
    expect(view3dViewsOf(editor.store.project).map((v) => v.id)).toEqual(['v3d_b']);
    expect(useUi.getState().view3dViewId).toBeNull();
    expect(useUi.getState().openViews.map(openViewKey)).not.toContain('3d:v3d_a');
  });
});

describe('abas', () => {
  it('a aba mostra o nome da vista salva; fechar não apaga a vista', () => {
    abre();
    abrirVista3dAction('v3d_a');
    expect(tabOf(editor.project, { kind: '3d', viewId: 'v3d_a' })).toEqual({ icon: 'cube', label: 'Fachada Norte' });
    expect(tabOf(editor.project, { kind: '3d' })).toEqual({ icon: 'cube', label: 'Modelo 3D' });
    useUi.setState({ openViews: useUi.getState().openViews.filter((v) => openViewKey(v) !== '3d:v3d_a') });
    expect(view3dViewOf(editor.project, 'v3d_a')?.name).toBe('Fachada Norte');
  });
});

describe('câmera de cada vista salva', () => {
  it('gravar a câmera de uma não altera a outra nem a vista padrão', () => {
    abre();
    expect(cameraDaVista3d(editor.store, 'v3d_a')).toEqual(CAM_A);
    expect(gravarCameraDaVista3dAction(editor.store, 'v3d_a', { ...CAM_A, azimuth: 11 })).toBeNull();
    expect(cameraDaVista3d(editor.store, 'v3d_a')?.azimuth).toBe(11);
    expect(cameraDaVista3d(editor.store, 'v3d_b')).toEqual(CAM_B);
    expect(view3dViewOf(editor.store.project, 'v3d_a')?.camera).toEqual({ ...CAM_A, azimuth: 11 });
    expect(view3dViewOf(editor.store.project, 'v3d_b')?.camera).toEqual(CAM_B);
  });

  it('gravar a mesma câmera não gera passo de desfazer', () => {
    abre();
    const versao = editor.store.version;
    expect(gravarCameraDaVista3dAction(editor.store, 'v3d_b', CAM_B)).toBeNull();
    expect(editor.store.version).toBe(versao);
  });
});

describe('Hide in View da vista 3D salva', () => {
  function abreComOcultos(): { parede: string; porta: string } {
    const p = structuredClone(buildTemplate('house2'));
    const parede = Object.values(p.elements).find((e) => e.kind === 'wall')!;
    const porta = Object.values(p.elements).find((e) => e.kind === 'door')!;
    p.view3d = { ...view3dOf({}), hidden: { elements: [porta.id] } };
    p.view3dViews = [makeView3DView(p, { id: 'v3d_a', name: 'A' }), makeView3DView(p, { id: 'v3d_b', name: 'B' })];
    editor.load(p, 'x.hestia.json');
    return { parede: parede.id, porta: porta.id };
  }

  it('grava em settings.hidden da vista salva, sem tocar na 3D padrão nem na outra salva', () => {
    const { parede, porta } = abreComOcultos();
    useUi.setState({ view: '3d', view3dViewId: 'v3d_a', selection: [] });
    hideInView([parede]);
    expect(view3dViewOf(editor.project, 'v3d_a')?.settings.hidden).toEqual({ elements: [parede] });
    expect(editor.project.view3d?.hidden).toEqual({ elements: [porta] });
    expect(view3dViewOf(editor.project, 'v3d_b')?.settings.hidden).toBeUndefined();
    const vis = visibilityOf(editor.project, useUi.getState());
    expect(vis.hidden.has(parede)).toBe(true);
    expect(vis.hidden.has(porta)).toBe(false);
  });

  it('HR limpa o hidden da vista salva (um undo restaura); a 3D padrão mantém o seu', () => {
    const { parede, porta } = abreComOcultos();
    useUi.setState({ view: '3d', view3dViewId: 'v3d_a', selection: [] });
    hideInView([parede]);
    const chave = visibilityKeyOf(useUi.getState());
    expect(chave).toBe('3d:v3d_a');
    useUi.setState({ viewTemp: { '3d:v3d_a': { hidden: { elements: [parede] }, reveal: true } } });
    unhideAllInView();
    expect(view3dViewOf(editor.project, 'v3d_a')?.settings.hidden).toBeUndefined();
    expect(useUi.getState().viewTemp['3d:v3d_a']).toBeUndefined();
    expect(editor.project.view3d?.hidden).toEqual({ elements: [porta] });
    editor.store.undo();
    expect(view3dViewOf(editor.project, 'v3d_a')?.settings.hidden).toEqual({ elements: [parede] });
    useUi.setState({ view: '3d', view3dViewId: null, viewTemp: {} });
    const padrao = visibilityOf(editor.project, useUi.getState());
    expect(padrao.hidden.has(porta)).toBe(true);
    expect(padrao.hidden.has(parede)).toBe(false);
  });
});
