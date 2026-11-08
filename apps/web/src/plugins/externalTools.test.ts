import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, pluginViewOverrides } from '@hestia/model';
import { useUi } from '../editor/state.ts';
import { ACTIONS } from '../ui/ribbon/actions.ts';
import { TABS } from '../ui/ribbon/tabs.ts';
import { fromSceneCamera, toSceneCamera } from './cameraConvert.ts';
import { buildSceneContent, extractElementMeshes } from './sceneExport.ts';

describe('Suplementos › Ferramentas externas', () => {
  it('é a única entrada habilitada da aba e abre o diálogo', () => {
    const tab = TABS.find((t) => t.id === 'suplementos')!;
    const items = tab.panels.flatMap((p) => p.items);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'action', action: 'externalTools' });
    useUi.setState({ dialog: null });
    ACTIONS.externalTools.run();
    expect(useUi.getState().dialog).toBe('externalTools');
  });
  it('as demais abas "em breve" continuam desabilitadas', () => {
    const soon = TABS.filter((t) => t.id === 'colaborar').flatMap((t) => t.panels.flatMap((p) => p.items));
    expect(soon.every((i) => i.kind === 'soon')).toBe(true);
  });
});

describe('câmera: conversão sem perda', () => {
  it('órbita → contrato → órbita volta ao mesmo ponto', () => {
    const o = { azimuth: -0.7, elevation: 0.5, distance: 23, target: { x: 3, y: 4, z: 1 }, ortho: false };
    const back = fromSceneCamera(toSceneCamera(o));
    expect(back.azimuth).toBeCloseTo(o.azimuth, 9);
    expect(back.elevation).toBeCloseTo(o.elevation, 9);
    expect(back.distance).toBeCloseTo(o.distance, 9);
    expect(back.target).toEqual(o.target);
  });
});

describe('substituição de visualização no projeto', () => {
  it('grava por plugin e material de origem, sem tocar no material; persiste no JSON; recusa material inexistente', () => {
    const store = new ProjectStore(createEmptyProject('pt'));
    const matId = Object.keys(store.project.materials)[0]!;
    const original = structuredClone(store.project.materials[matId]);
    store.exec({ type: 'setPluginViewOverride', pluginId: 'dev.x.r', materialId: matId, override: { color: '#ABCDEF', params: { rough: 0.3 } } });
    expect(pluginViewOverrides(store.project, 'dev.x.r')[matId]).toEqual({ color: '#abcdef', params: { rough: 0.3 } });
    expect(store.project.materials[matId]).toEqual(original);
    const reloaded = JSON.parse(JSON.stringify(store.project));
    expect(reloaded.plugins.viewOverrides['dev.x.r'][matId].color).toBe('#abcdef');
    expect(() => store.exec({ type: 'setPluginViewOverride', pluginId: 'p', materialId: 'nao-existe', override: { color: '#000000' } })).toThrow();
    expect(() => store.exec({ type: 'setPluginViewOverride', pluginId: 'p', materialId: matId, override: { opacity: 3 } })).toThrow();
    store.exec({ type: 'clearPluginViewOverride', pluginId: 'dev.x.r', materialId: matId });
    expect(pluginViewOverrides(store.project, 'dev.x.r')[matId]).toBeUndefined();
    store.exec({ type: 'ensurePluginProjectUid', uid: 'prj_12345678' });
    store.exec({ type: 'ensurePluginProjectUid', uid: 'outro_87654321' });
    expect(store.project.plugins?.projectUid).toBe('prj_12345678');
  });
});

describe('exportação de cena', () => {
  it('extrai a malha por elemento em coordenadas de mundo a partir das faixas', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]), 3));
    const mesh = new THREE.Mesh(g);
    mesh.position.set(10, 0, 0);
    mesh.userData = { ranges: [{ id: 'a', start: 0, count: 3 }, { id: 'b', start: 3, count: 3 }] };
    g.setIndex([0, 1, 2, 3, 4, 5]);
    const root = new THREE.Group();
    root.add(mesh);
    const m = extractElementMeshes(root);
    expect([...m.keys()]).toEqual(['a', 'b']);
    expect(m.get('a')!.positions.slice(0, 3)).toEqual([10, 0, 0]);
    expect(m.get('a')!.hash).not.toBe(m.get('b')!.hash);
  });
  it('conteúdo: materiais e entidades com IDs do modelo; sem cena 3D, sem geometria', () => {
    const p = createEmptyProject('pt');
    const c = buildSceneContent(p, null);
    expect(c.materials.map((x) => x.id).sort()).toEqual(Object.keys(p.materials).sort());
    expect(c.entities.every((e) => e.mesh === null)).toBe(true);
  });
  it('posições saem com resolução de 1 µm (JSON compacto, sem float32 longo)', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0.1, 0.2, 0.3, 1.1, 0.2, 0.3, 0.1, 1.2, 0.3]), 3));
    g.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(g);
    mesh.userData = { ranges: [{ id: 'a', start: 0, count: 3 }] };
    const root = new THREE.Group();
    root.add(mesh);
    const pos = extractElementMeshes(root).get('a')!.positions;
    expect(pos.every((n) => Math.round(n * 1e6) / 1e6 === n)).toBe(true);
    expect(JSON.stringify(pos)).not.toMatch(/\d{8,}/);
  });
});
