import { Fragment, useRef, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { setDock } from '../editor/dockActions.ts';
import { dockPanels, saveDock, type DockSide } from '../editor/dockLayout.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Browser } from './Browser.tsx';
import { Properties } from './Properties.tsx';
import { useNarrow } from './useNarrow.ts';

/** Arrasto com o ponteiro capturado: `move` recebe o deslocamento desde o início; ao soltar, guarda a disposição. */
function drag(e: ReactPointerEvent, move: (dx: number, dy: number) => void): void {
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const x0 = e.clientX;
  const y0 = e.clientY;
  const onMove = (m: PointerEvent): void => move(m.clientX - x0, m.clientY - y0);
  const onUp = (): void => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    saveDock(useUi.getState().dock);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

/**
 * Dock de painéis: mostra os painéis abertos que estão deste lado, na ordem `first` (de cima para baixo). Uma divisória
 * vertical muda a largura do dock; quando há dois painéis, uma horizontal muda a altura do de cima.
 */
export function Dock({ side }: { side: DockSide }): ReactElement {
  const { t } = useT();
  const propsOpen = useUi((s) => s.propsOpen);
  const browserOpen = useUi((s) => s.browserOpen);
  const dock = useUi((s) => s.dock);
  const narrow = useNarrow();
  const ref = useRef<HTMLDivElement>(null);
  const panels = dockPanels(dock, side, { props: propsOpen, browser: browserOpen });
  if (panels.length === 0) return <div className={`dock ${side} empty`} />;
  const w = side === 'left' ? dock.leftW : dock.rightW;
  const both = panels.length === 2;

  const resizeWidth = (e: ReactPointerEvent): void => {
    const w0 = w;
    drag(e, (dx) => setDock(side === 'left' ? { leftW: w0 + dx } : { rightW: w0 - dx }, false));
  };
  const resizeSplit = (e: ReactPointerEvent): void => {
    const h = ref.current?.getBoundingClientRect().height ?? 1;
    const s0 = dock.split;
    drag(e, (_dx, dy) => setDock({ split: s0 + dy / h }, false));
  };

  return (
    <div ref={ref} className={`dock ${side}`} style={{ width: w, maxWidth: narrow ? '86vw' : undefined }}>
      {panels.map((p, i) => (
        <Fragment key={p}>
          {both && i === 1 && (
            <div className="dock-split h" role="separator" aria-orientation="horizontal" aria-label={t('shc_dock_resize_height')} tabIndex={0} onPointerDown={resizeSplit}
              onKeyDown={(e) => { if (e.key === 'ArrowUp') setDock({ split: dock.split - 0.03 }); if (e.key === 'ArrowDown') setDock({ split: dock.split + 0.03 }); }} />
          )}
          <div className="dock-pane" data-dock-panel={p} style={{ flex: both ? `${i === 0 ? dock.split : 1 - dock.split} 1 0` : 1 }}>
            {p === 'props' ? <Properties /> : <Browser />}
          </div>
        </Fragment>
      ))}
      <div className={`dock-split v ${side}`} role="separator" aria-orientation="vertical" aria-label={t('shc_dock_resize_width')} tabIndex={0} onPointerDown={resizeWidth}
        onKeyDown={(e) => { const d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0; if (d) setDock(side === 'left' ? { leftW: w + d } : { rightW: w - d }); }} />
    </div>
  );
}
