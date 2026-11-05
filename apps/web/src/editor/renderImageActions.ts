import { useUi } from './state.ts';

/** Abre o diálogo de imagem. A captura em si fica em `captureView.ts`. */
export function openRenderImageDialog(): void {
  useUi.setState({ dialog: 'renderImage', dialogArg: null });
}
