import { makeRenderCamera, type Id, type RenderCamera, type SheetView3DCamera } from '@hestia/model';

/**
 * Captura de câmera de render (H12): funções puras, sem tela nem projeto. A tela (Views e a moldura sobre o 3D) só as
 * chama, e o teste roda sem o controlador.
 */

/** Campo de visão vertical da vista 3D ao vivo (`OrbitCamera.perspective`, 38°). */
export const FOV_VERTICAL_VIEWPORT_DEG = 38;

/** Proporções oferecidas na captura (largura:altura). */
export const PROPORCOES_RENDER = [
  { rotulo: '16:9', aspect: { w: 16, h: 9 } },
  { rotulo: '4:3', aspect: { w: 4, h: 3 } },
  { rotulo: '1:1', aspect: { w: 1, h: 1 } },
] as const;

/**
 * Campo de visão horizontal (o `fovDeg` do modelo) que corresponde ao vertical `fovVDeg` numa proporção `aspect` (w/h):
 * fovH = 2·atan(tan(fovV/2)·aspect). Com fovV 38° e 16:9 dá cerca de 63°. Fica igual à altura da vista 3D no quadro.
 */
export function fovHorizontalDeg(fovVDeg: number, aspect: number): number {
  const rad = (Math.PI / 180) * fovVDeg;
  return (360 / Math.PI) * Math.atan(Math.tan(rad / 2) * aspect);
}

/**
 * Converte a câmera da vista 3D (órbita: azimute, elevação, distância e alvo) em câmera de render. A posição usa a mesma
 * fórmula da órbita (`OrbitCamera.eye`): alvo + distância·(cos e·cos az, cos e·sin az, sin e), com Z para cima. O alvo
 * é copiado, e position/target são objetos novos (nada compartilhado com a órbita). O `fovDeg` vem de 38° vertical
 * convertido para horizontal na proporção escolhida (`fovHorizontalDeg`). A projeção ortogonal da tela não entra: a
 * câmera de render é sempre em perspectiva.
 */
export function cameraParaRenderCamera(
  camera3d: SheetView3DCamera,
  nivelId: Id,
  aspect: { w: number; h: number },
  nome: string,
): RenderCamera {
  const ce = Math.cos(camera3d.elevation);
  const { target, distance, azimuth, elevation } = camera3d;
  const position = {
    x: target.x + distance * ce * Math.cos(azimuth),
    y: target.y + distance * ce * Math.sin(azimuth),
    z: target.z + distance * Math.sin(elevation),
  };
  return makeRenderCamera(
    {
      levelId: nivelId,
      position,
      target: { x: target.x, y: target.y, z: target.z },
      fovDeg: fovHorizontalDeg(FOV_VERTICAL_VIEWPORT_DEG, aspect.w / aspect.h),
      aspect: { w: aspect.w, h: aspect.h },
    },
    nome,
  );
}

/** Retângulo da moldura (em px do canvas). */
export interface RetanguloPrevia {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Maior retângulo com a proporção `aspect` (w/h) que cabe no canvas, centralizado. Com o 3D a 38° vertical, o quadro
 * do render tem a altura inteira do canvas quando cabe; se a proporção for mais larga que o canvas, o retângulo é
 * limitado pela largura (e a moldura fica menor que a altura). Entradas inválidas devolvem retângulo vazio.
 */
export function retanguloDaPrevia(larguraDoCanvas: number, alturaDoCanvas: number, aspect: number): RetanguloPrevia {
  const vazio = { x: 0, y: 0, w: 0, h: 0 };
  if (!(larguraDoCanvas > 0 && alturaDoCanvas > 0 && aspect > 0 && Number.isFinite(aspect))) return vazio;
  let w = larguraDoCanvas;
  let h = w / aspect;
  if (h > alturaDoCanvas) {
    h = alturaDoCanvas;
    w = h * aspect;
  }
  return { x: (larguraDoCanvas - w) / 2, y: (alturaDoCanvas - h) / 2, w, h };
}
