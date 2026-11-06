import type { RenderCamera, SheetView3DCamera } from '@hestia/model';
import { OrbitCamera } from './orbit.ts';

/**
 * Câmera explícita da exportação de render: a câmera de render escolhida pelo usuário, no formato que o snapshot
 * consome. Posição e alvo em metros (Z para cima); `fovVerticalDeg` é o campo de visão VERTICAL (como o
 * `PerspectiveCamera` do three) e `aspect` é largura/altura do quadro.
 */
export interface CameraDeRenderSnapshot {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fovVerticalDeg: number;
  aspect: number;
}

/**
 * Converte uma `RenderCamera` do projeto (FOV HORIZONTAL, em `fovDeg`) para a forma do snapshot (FOV VERTICAL).
 * Com meia largura do quadro = d·tan(fovH/2) e meia altura = meia largura / aspect, vale
 * fovV = 2·atan(tan(fovH/2) / aspect). Posição e alvo são cópias: nada compartilhado com a câmera do projeto.
 */
export function cameraDeRenderParaSnapshot(cam: RenderCamera): CameraDeRenderSnapshot {
  const aspect = cam.aspect.w / cam.aspect.h;
  const meiaHorizontal = (Math.PI / 180) * cam.fovDeg / 2;
  const fovVerticalDeg = (360 / Math.PI) * Math.atan(Math.tan(meiaHorizontal) / aspect);
  return {
    position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
    target: { x: cam.target.x, y: cam.target.y, z: cam.target.z },
    fovVerticalDeg,
    aspect,
  };
}

/**
 * Azimute, elevação e distância (a forma da órbita) de uma posição olhando para um alvo. Sem limite de distância:
 * a câmera explícita tem de sair exatamente onde foi colocada (a órbita da tela limita a distância; esta não).
 */
export function vistaDaPosicao(position: CameraDeRenderSnapshot['position'], target: CameraDeRenderSnapshot['target']): SheetView3DCamera {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const horizontal = Math.hypot(dx, dy);
  return {
    azimuth: Math.atan2(dy, dx),
    elevation: Math.atan2(dz, horizontal),
    distance: Math.hypot(dx, dy, dz),
    target: { x: target.x, y: target.y, z: target.z },
    ortho: false,
  };
}

/**
 * Aplica a câmera explícita na órbita do snapshot, sem o limite de distância de `aplicarCameraNaOrbita`. Mesma
 * convenção da órbita (Z para cima, `apply` recalcula a posição e os planos de recorte). A proporção é dada depois,
 * pelo chamador (`setAspect`), como no enquadramento automático.
 */
export function aplicarCameraDeRenderNaOrbita(o: OrbitCamera, c: CameraDeRenderSnapshot): void {
  o.cancelAnimation();
  const vista = vistaDaPosicao(c.position, c.target);
  o.azimuth = vista.azimuth;
  o.elevation = vista.elevation;
  o.distance = vista.distance;
  o.target.set(c.target.x, c.target.y, c.target.z);
  o.ortho = false;
  o.perspective.fov = c.fovVerticalDeg;
  o.apply();
}
