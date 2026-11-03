import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react';
import { setDock } from '../editor/dockActions.ts';
import type { DockPanel } from '../editor/dockLayout.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { applyDrop } from './dockDrag.ts';
import { startDockDrag } from './dockDragSession.ts';

/** Deslocamento (px) a partir do qual o toque vira arrasto: clique simples e duplo clique no cabeçalho não movem nada. */
const DRAG_START = 5;

/**
 * Cabeçalho de painel acoplado (Propriedades, Navegador). O título é a alça: arrastar leva o painel (fantasma no cursor e
 * prévia exata da área de destino, ver `dockDragSession.ts`). Alt+Setas esquerda/direita move o painel com o teclado.
 * O ✕ fecha o painel.
 */
export function PanelHead({ panel, name, closeLabel, extra, children }: {
  panel: DockPanel;
  /** Nome do painel (tooltip do título). */
  name: string;
  closeLabel: string;
  extra?: ReactNode;
  children: ReactNode;
}): ReactElement {
  const { t } = useT();
  /** Ouvintes do gesto em andamento (antes de virar arrasto); null quando não há gesto. */
  const gesture = useRef<(() => void) | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    // O ✕ tem o próprio clique: não pode começar arrasto.
    if (e.button !== 0 || (e.target as HTMLElement).closest('.ph-x')) return;
    gesture.current?.();
    const head = e.currentTarget;
    const r = head.getBoundingClientRect();
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const grab = { dx: x0 - r.left, dy: y0 - r.top };
    // Captura já no clique e escuta na janela: um movimento rápido que sai do cabeçalho antes dos 5 px não perde o gesto.
    try {
      head.setPointerCapture(id);
    } catch {
      // Sem captura, os ouvintes da janela ainda recebem o movimento.
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      gesture.current = null;
    };
    const move = (m: PointerEvent): void => {
      if (m.pointerId !== id || Math.hypot(m.clientX - x0, m.clientY - y0) < DRAG_START) return;
      stop();
      // A partir daqui a sessão cuida de tudo fora do React (sem re-render a cada movimento).
      startDockDrag({ panel, pointerId: id, head, grab, x: m.clientX, y: m.clientY });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    gesture.current = stop;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    setDock(applyDrop(useUi.getState().dock, panel, e.key === 'ArrowLeft' ? 'left' : 'right'));
  };

  const close = (): void => useUi.setState(panel === 'props' ? { propsOpen: false } : { browserOpen: false });

  return (
    <div
      className="panel-head"
      tabIndex={0}
      title={t('shc_panel_drag_hint')}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span className="ph-title" title={name}>{children}</span>
      <span className="ph-right">
        {extra}
        <button className="ph-x" aria-label={closeLabel} title={t('shc_panel_close_hint')} onClick={close}>✕</button>
      </span>
    </div>
  );
}
