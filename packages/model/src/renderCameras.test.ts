import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  defaultRenderCameraName,
  makeRenderCamera,
  projectRenderCameras,
  renderCameraOf,
  type RenderCamera,
} from './index.ts';

const base = (levelId: string, over: Partial<Omit<RenderCamera, 'id' | 'name'>> = {}): Omit<RenderCamera, 'id' | 'name'> => ({
  levelId,
  position: { x: 1, y: 2, z: 1.6 },
  target: { x: 5, y: 6, z: 1.2 },
  fovDeg: 60,
  aspect: { w: 16, h: 9 },
  ...over,
});

const comNivel = () => {
  const s = new ProjectStore(createEmptyProject());
  const levelId = s.project.levels[0]!.id;
  return { s, levelId };
};

describe('câmeras de render', () => {
  it('T1: adiciona, lê de volta e não compartilha position com o original', () => {
    const { s, levelId } = comNivel();
    const cam = makeRenderCamera(base(levelId), 'Câmera 1');
    s.exec({ type: 'addRenderCamera', camera: cam });
    expect(projectRenderCameras(s.project)).toHaveLength(1);
    const lida = renderCameraOf(s.project, cam.id)!;
    expect(lida.position).toEqual(cam.position);
    expect(lida.position).not.toBe(cam.position);
    cam.position.x = 999;
    expect(s.project.renderCameras![0]!.position.x).toBe(1);
  });

  it('T2: nível inexistente lança erro em pt-BR', () => {
    const { s, levelId } = comNivel();
    expect(() => s.exec({ type: 'addRenderCamera', camera: makeRenderCamera(base('nivel_x'), 'Câmera 1') })).toThrow(/nível/);
    expect(() => s.exec({ type: 'addRenderCamera', camera: makeRenderCamera(base(levelId), 'Câmera 1') })).not.toThrow();
  });

  it('T3: fovDeg fora de [10, 120] lança; 60 aceita', () => {
    const { s, levelId } = comNivel();
    expect(() => s.exec({ type: 'addRenderCamera', camera: makeRenderCamera(base(levelId, { fovDeg: 5 }), 'A') })).toThrow(/campo de visão/);
    expect(() => s.exec({ type: 'addRenderCamera', camera: makeRenderCamera(base(levelId, { fovDeg: 130 }), 'B') })).toThrow(/campo de visão/);
    expect(() => s.exec({ type: 'addRenderCamera', camera: makeRenderCamera(base(levelId, { fovDeg: 60 }), 'C') })).not.toThrow();
  });

  it('T4: alvo igual à posição lança', () => {
    const { s, levelId } = comNivel();
    const cam = makeRenderCamera(base(levelId, { target: { x: 1, y: 2, z: 1.6 } }), 'Câmera 1');
    expect(() => s.exec({ type: 'addRenderCamera', camera: cam })).toThrow(/alvo/);
  });

  it('T5: update de nome vazio lança; update de position atualiza sem mexer nas outras câmeras', () => {
    const { s, levelId } = comNivel();
    const a = makeRenderCamera(base(levelId), 'Câmera 1');
    const b = makeRenderCamera(base(levelId, { position: { x: 3, y: 3, z: 1.6 } }), 'Câmera 2');
    s.exec({ type: 'addRenderCamera', camera: a });
    s.exec({ type: 'addRenderCamera', camera: b });
    expect(() => s.exec({ type: 'updateRenderCamera', id: a.id, patch: { name: '   ' } })).toThrow(/nome/);
    const novaPos = { x: 7, y: 8, z: 1.5 };
    s.exec({ type: 'updateRenderCamera', id: a.id, patch: { position: novaPos } });
    expect(renderCameraOf(s.project, a.id)!.position).toEqual(novaPos);
    expect(renderCameraOf(s.project, a.id)!.name).toBe('Câmera 1');
    expect(renderCameraOf(s.project, b.id)).toEqual(b);
  });

  it('T6: remove apaga a câmera; remove de id inexistente lança', () => {
    const { s, levelId } = comNivel();
    const a = makeRenderCamera(base(levelId), 'Câmera 1');
    s.exec({ type: 'addRenderCamera', camera: a });
    s.exec({ type: 'removeRenderCamera', id: a.id });
    expect(projectRenderCameras(s.project)).toHaveLength(0);
    expect(() => s.exec({ type: 'removeRenderCamera', id: 'inexistente' })).toThrow(/inexistente/);
  });

  it('T7: setRenderCameraOrder com ids faltando lança; com a mesma lista reordena', () => {
    const { s, levelId } = comNivel();
    const a = makeRenderCamera(base(levelId), 'Câmera 1');
    const b = makeRenderCamera(base(levelId), 'Câmera 2');
    s.exec({ type: 'addRenderCamera', camera: a });
    s.exec({ type: 'addRenderCamera', camera: b });
    expect(() => s.exec({ type: 'setRenderCameraOrder', ids: [a.id] })).toThrow(/incompleta/);
    s.exec({ type: 'setRenderCameraOrder', ids: [b.id, a.id] });
    expect(s.project.renderCameras?.map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it('T8: desfazer e refazer de add, update e remove devolvem o estado certo', () => {
    const { s, levelId } = comNivel();
    const a = makeRenderCamera(base(levelId), 'Câmera 1');
    s.exec({ type: 'addRenderCamera', camera: a }, 'Criar câmera de render');
    expect(projectRenderCameras(s.project)).toHaveLength(1);
    s.undo();
    expect(projectRenderCameras(s.project)).toHaveLength(0);
    s.redo();
    expect(renderCameraOf(s.project, a.id)?.name).toBe('Câmera 1');

    s.exec({ type: 'updateRenderCamera', id: a.id, patch: { name: 'Hall', fovDeg: 40 } });
    expect(renderCameraOf(s.project, a.id)).toMatchObject({ name: 'Hall', fovDeg: 40 });
    s.undo();
    expect(renderCameraOf(s.project, a.id)).toMatchObject({ name: 'Câmera 1', fovDeg: 60 });
    s.redo();
    expect(renderCameraOf(s.project, a.id)).toMatchObject({ name: 'Hall', fovDeg: 40 });

    s.exec({ type: 'removeRenderCamera', id: a.id });
    expect(projectRenderCameras(s.project)).toHaveLength(0);
    s.undo();
    expect(renderCameraOf(s.project, a.id)).toMatchObject({ name: 'Hall', fovDeg: 40 });
    expect(renderCameraOf(s.project, a.id)!.position).toEqual(base(levelId).position);
    s.redo();
    expect(projectRenderCameras(s.project)).toHaveLength(0);
  });

  it('T9: projeto sem renderCameras não quebra; nome padrão pula nomes usados', () => {
    const p = createEmptyProject();
    expect('renderCameras' in p).toBe(false);
    expect(projectRenderCameras(p)).toEqual([]);
    expect(defaultRenderCameraName(p)).toBe('Câmera 1');
    const { s, levelId } = comNivel();
    s.exec({ type: 'addRenderCamera', camera: makeRenderCamera(base(levelId), 'Câmera 1') });
    expect(defaultRenderCameraName(s.project)).toBe('Câmera 2');
  });
});
