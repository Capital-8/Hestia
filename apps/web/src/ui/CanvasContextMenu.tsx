import { useEffect, type ReactElement, type RefObject } from 'react';
import { useUi } from '../editor/state.ts';
import { PopupMenu } from './PopupMenu.tsx';
import { abrirMenuDeContexto, executaComandoDoMenu, fecharMenuDeContexto, useCanvasMenu, viewDoMenu, type Camera3dMenu } from './useCanvasContextMenu.ts';

/**
 * Menu de botão direito da planta, do corte e do 3D. Ligado pelo ViewportCanvas (botão direito sem arrasto) e pelo teclado
 * (Shift+F10 ou a tecla Menu, no centro da vista). Os comandos saem de `executaComandoDoMenu`.
 */
export function CanvasContextMenu({ model, host }: { model: Camera3dMenu; host: RefObject<HTMLDivElement | null> }): ReactElement | null {
  const menu = useCanvasMenu((s) => s.menu);

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
      const ui = useUi.getState();
      // Sem menu na sheet, sem diálogo e sem campo de texto em foco (a tecla é do campo).
      if (useCanvasMenu.getState().menu || ui.view === 'sheet' || ui.dialog !== null || ui.fileMenu) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
      const r = host.current?.getBoundingClientRect();
      if (!r) return;
      e.preventDefault();
      abrirMenuDeContexto(r.left + r.width / 2, r.top + r.height / 2, undefined, viewDoMenu(ui.view));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [host]);

  if (!menu) return null;
  const centro = (): { x: number; y: number } => {
    const r = host.current?.getBoundingClientRect();
    return { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
  };
  return (
    <PopupMenu
      x={menu.x}
      y={menu.y}
      items={menu.items}
      onPick={(id) => executaComandoDoMenu(id, menu.ctx.view, model, centro(), menu.mundo)}
      onClose={fecharMenuDeContexto}
    />
  );
}
