import type { SheetView3DCamera } from '@hestia/model';

/** Câmera da prévia do Estúdio de animação, para a imagem final usar o mesmo enquadramento. */
type Fonte = () => SheetView3DCamera | null;
let fonte: Fonte | null = null;

export function registrarCameraPreview(f: Fonte | null): void {
  fonte = f;
}

export function cameraPreviewAtual(): SheetView3DCamera | null {
  return fonte ? fonte() : null;
}
