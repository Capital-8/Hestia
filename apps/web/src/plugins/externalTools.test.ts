import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, pluginViewOverrides, view3dOf } from '@hestia/model';
import { useUi } from '../editor/state.ts';
import { ACTIONS } from '../ui/ribbon/actions.ts';
import { TABS } from '../ui/ribbon/tabs.ts';
import { fromSceneCamera, toSceneCamera } from './cameraConvert.ts';
import { buildSceneContent, extractElementMeshes, extractLights, extractSite } from './sceneExport.ts';

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
});

describe('exportação de cena (protocolo 1.3)', () => {
  /** Duas malhas de lotes de materiais diferentes, com faixas do MESMO elemento (parede de duas camadas). */
  function lote(materialId: string, x: number, ranges: Array<{ id: string; start: number; count: number }>): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x, 0, 0, x + 1, 0, 0, x, 1, 0]), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    g.setIndex([0, 1, 2]);
    const m = new THREE.Mesh(g);
    m.userData = { materialId, ranges };
    return m;
  }

  it('grupos por material: cada faixa vai para o grupo do material do seu lote; normais acompanham os vértices', () => {
    const root = new THREE.Group();
    root.add(lote('mat-reboco', 0, [{ id: 'w', start: 0, count: 3 }]), lote('mat-bloco', 5, [{ id: 'w', start: 0, count: 3 }]));
    const m = extractElementMeshes(root).get('w')!;
    expect(m.groups).toEqual([{ start: 0, count: 3, materialId: 'mat-reboco' }, { start: 3, count: 3, materialId: 'mat-bloco' }]);
    expect(m.positions).toHaveLength(18);
    expect(m.normals).toHaveLength(18);
    expect(m.normals!.slice(0, 3)).toEqual([0, 0, 1]);
  });

  it('normais são giradas junto com a malha; hash muda se o material do grupo muda', () => {
    const a = new THREE.Group();
    const la = lote('m1', 0, [{ id: 'e', start: 0, count: 3 }]);
    la.rotation.x = Math.PI / 2;
    a.add(la);
    const ma = extractElementMeshes(a).get('e')!;
    expect(ma.normals![0]).toBeCloseTo(0, 6);
    expect(Math.abs(ma.normals![1]!)).toBeCloseTo(1, 6);
    const b = new THREE.Group();
    const lb = lote('m2', 0, [{ id: 'e', start: 0, count: 3 }]);
    lb.rotation.x = Math.PI / 2;
    b.add(lb);
    expect(extractElementMeshes(b).get('e')!.hash).not.toBe(ma.hash);
  });

  it('lote sem normais ou sem material: entidade sem normais e grupo com materialId null', () => {
    const l = lote('x', 0, [{ id: 'e', start: 0, count: 3 }]);
    l.geometry.deleteAttribute('normal');
    delete l.userData.materialId;
    const root = new THREE.Group();
    root.add(l);
    const m = extractElementMeshes(root).get('e')!;
    expect(m.normals).toBeUndefined();
    expect(m.groups[0]!.materialId).toBeNull();
  });

  it('luzes: modelo sem luminárias dá lista vazia; luminária IFC vira luz pontual no centro da caixa', () => {
    const p = createEmptyProject('pt');
    expect(buildSceneContent(p, null).lights).toEqual([]);
    const lvl = Object.keys(p.levels)[0]!;
    (p.elements as Record<string, unknown>).lum1 = {
      id: 'lum1', kind: 'generic', levelId: lvl, name: 'Luminária', sourceClass: 'IfcLightFixture', order: 0,
      mesh: { positions: [0, 0, 2, 1, 0, 2, 0, 1, 3], indices: [0, 1, 2] },
      ifcProperties: [{ name: 'LuminousIntensity', value: 1200, pset: 'Pset_LightFixtureTypeCommon' }],
    };
    (p.elements as Record<string, unknown>).viga = {
      id: 'viga', kind: 'generic', levelId: lvl, name: 'Viga', sourceClass: 'IFCBEAM', order: 1, mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    };
    const luzes = extractLights(p);
    expect(luzes).toEqual([{ id: 'light:lum1', kind: 'point', position: { x: 0.5, y: 0.5, z: 2.5 }, color: '#ffffff', intensity: 1200 }]);
  });

  it('site: sol da vista 3D em radiano; latitude, longitude, norte e fuso não existem no modelo e não saem', () => {
    const p = createEmptyProject('pt');
    const s = extractSite(p)!;
    expect(s.latitude).toBeUndefined();
    expect(s.timezone).toBeUndefined();
    const v = view3dOf(p);
    expect(s.sun!.azimuth).toBeCloseTo((v.sunAzimuth * Math.PI) / 180, 9);
    expect(s.sun!.elevation).toBeCloseTo((v.sunElevation * Math.PI) / 180, 9);
    expect(buildSceneContent(p, null).site).toEqual(s);
  });

  it('materiais do tipo do elemento entram em materialIds (base dos grupos)', () => {
    const p = createEmptyProject('pt');
    const tipo = Object.values(p.wallTypes)[0];
    if (!tipo) return;
    const mats = [...new Set(tipo.layers.map((l) => l.materialId))];
    (p.elements as Record<string, unknown>).wx = { id: 'wx', kind: 'wall', typeId: tipo.id, levelId: Object.keys(p.levels)[0], name: 'P' };
    const e = buildSceneContent(p, null).entities.find((x) => x.id === 'wx')!;
    expect(e.materialIds).toEqual(mats);
  });
});
