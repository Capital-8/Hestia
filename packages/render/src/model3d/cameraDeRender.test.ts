import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createEmptyProject, makeRenderCamera, makeWall, view3dOf, type Project, type RenderCamera, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { aplicarCameraDeRenderNaOrbita, cameraDeRenderParaSnapshot, vistaDaPosicao, type CameraDeRenderSnapshot } from './cameraDeRender.ts';
import { OrbitCamera } from './orbit.ts';
import { ModelScene } from './scene3d.ts';

const RAD = Math.PI / 180;

function camera(fovDeg: number, aspect: { w: number; h: number }): RenderCamera {
  return makeRenderCamera(
    {
      levelId: 'lv_0',
      position: { x: 10, y: -6, z: 7 },
      target: { x: 2, y: 1, z: 1.5 },
      fovDeg,
      aspect,
    },
    'Câmera teste',
  );
}

describe('cameraDeRenderParaSnapshot', () => {
  it('converte 60° horizontal em 16:9 para o vertical da conta 2·atan(tan(30°)/(16/9)) ≈ 35,983°', () => {
    const s = cameraDeRenderParaSnapshot(camera(60, { w: 16, h: 9 }));
    expect(s.aspect).toBeCloseTo(16 / 9, 12);
    expect(s.fovVerticalDeg).toBeCloseTo(2 * (Math.atan(Math.tan(30 * RAD) / (16 / 9)) / RAD), 9);
    expect(s.fovVerticalDeg).toBeCloseTo(35.98339777, 6);
  });

  it('em 1:1 o FOV vertical é igual ao horizontal', () => {
    expect(cameraDeRenderParaSnapshot(camera(60, { w: 1, h: 1 })).fovVerticalDeg).toBeCloseTo(60, 9);
  });

  it('preserva posição e alvo sem compartilhar objetos com a câmera do projeto', () => {
    const cam = camera(60, { w: 4, h: 3 });
    const s = cameraDeRenderParaSnapshot(cam);
    expect(s.position).toEqual(cam.position);
    expect(s.target).toEqual(cam.target);
    expect(s.position).not.toBe(cam.position);
    expect(s.target).not.toBe(cam.target);
    s.position.x = 999;
    s.target.z = 999;
    expect(cam.position.x).toBe(10);
    expect(cam.target.z).toBe(1.5);
  });
});

describe('vistaDaPosicao e aplicarCameraDeRenderNaOrbita', () => {
  it('a órbita reconstrói exatamente a posição escolhida (sem limite de distância)', () => {
    const c: CameraDeRenderSnapshot = { position: { x: 10, y: -6, z: 7 }, target: { x: 2, y: 1, z: 1.5 }, fovVerticalDeg: 40, aspect: 4 / 3 };
    const o = new OrbitCamera();
    aplicarCameraDeRenderNaOrbita(o, c);
    o.setAspect(4 / 3, 1);
    o.apply();
    expect(o.camera.position.x).toBeCloseTo(10, 9);
    expect(o.camera.position.y).toBeCloseTo(-6, 9);
    expect(o.camera.position.z).toBeCloseTo(7, 9);
    expect(o.perspective.fov).toBeCloseTo(40, 9);
  });

  it('distância acima do limite da órbita da tela não é cortada', () => {
    const v = vistaDaPosicao({ x: 0, y: -900, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(v.distance).toBeCloseTo(900, 9);
    expect(v.ortho).toBe(false);
  });
});

function parede(): Project {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 };
  return p;
}

describe('exportarCenaDeRender com câmera explícita', () => {
  const explicita: CameraDeRenderSnapshot = {
    position: { x: 10, y: -6, z: 7 },
    target: { x: 2, y: 1, z: 1.5 },
    fovVerticalDeg: 40,
    aspect: 4 / 3,
  };

  function snapshot(cam: { cameraExplicita?: CameraDeRenderSnapshot; camera?: SheetView3DCamera; aspect?: number }) {
    const p = parede();
    const realista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(realista, p.levels.map((l) => resolveLevel(realista, l.id)), { dark: false, edges: true, shadows: true });
      return cena.exportarCenaDeRender(cam);
    } finally {
      cena.dispose();
    }
  }

  it('a view olha da posição para o alvo: o alvo tem profundidade negativa e cai no centro da imagem', () => {
    const snap = snapshot({ cameraExplicita: explicita });
    const view = new THREE.Matrix4().fromArray(snap.camera.view);
    const proj = new THREE.Matrix4().fromArray(snap.camera.projection);
    const alvo = new THREE.Vector3(explicita.target.x, explicita.target.y, explicita.target.z);
    const emCamera = alvo.clone().applyMatrix4(view);
    expect(emCamera.z).toBeLessThan(0);
    const clip = alvo.clone().applyMatrix4(view).applyMatrix4(proj);
    expect(Math.abs(clip.x)).toBeLessThan(1e-4);
    expect(Math.abs(clip.y)).toBeLessThan(1e-4);
    // A distância da câmera ao alvo é a da posição escolhida.
    const distancia = Math.hypot(10 - 2, -6 - 1, 7 - 1.5);
    expect(-emCamera.z).toBeCloseTo(distancia, 6);
  });

  it('posição exportada e projeção batem com a câmera escolhida (FOV vertical e proporção)', () => {
    const snap = snapshot({ cameraExplicita: explicita });
    expect(snap.camera.position[0]).toBeCloseTo(10, 6);
    expect(snap.camera.position[1]).toBeCloseTo(-6, 6);
    expect(snap.camera.position[2]).toBeCloseTo(7, 6);
    const proj = snap.camera.projection;
    // Perspectiva: P[5] = 1/tan(fovV/2) e P[0] = P[5] / aspect.
    expect(proj[5]).toBeCloseTo(1 / Math.tan((40 * RAD) / 2), 6);
    expect(proj[0]! / proj[5]!).toBeCloseTo(3 / 4, 6);
  });

  it('a proporção explícita vence o aspect pedido (o quadro é o da câmera escolhida)', () => {
    const snap = snapshot({ cameraExplicita: explicita, aspect: 16 / 9 });
    const proj = snap.camera.projection;
    expect(proj[0]! / proj[5]!).toBeCloseTo(3 / 4, 6);
  });
});
