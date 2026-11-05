import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react';
import { useT } from '../editor/i18n.ts';
import { safeGet, safeSet } from '../editor/storage.ts';

/** Fração da largura para a coluna de rótulos da paleta (como o Revit, a divisória rótulo|valor se arrasta). */
const KEY = 'hestia.labelSplit';
const MIN = 32;
const MAX = 66;
const DEFAULT = 46;
const clamp = (n: number): number => Math.min(MAX, Math.max(MIN, n));

function load(): number {
  const n = Number(safeGet(KEY));
  return Number.isFinite(n) && n > 0 ? clamp(n) : DEFAULT;
}

/**
 * Área rolável da paleta de propriedades com a divisória de colunas arrastável. A divisória fica fixa no topo da área
 * (sticky) e cobre a altura visível; `--lbl` é lido por `.prow` para dividir rótulo e valor.
 */
export function LabelScroll({ children }: { children: ReactNode }): ReactElement {
  const { t } = useT();
  const [pct, setPct] = useState(load);
  const [h, setH] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const start = (e: ReactPointerEvent): void => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const width = box.current?.clientWidth ?? 1;
    const left = box.current?.getBoundingClientRect().left ?? 0;
    let last = pct;
    const move = (m: PointerEvent): void => {
      last = clamp(((m.clientX - left) / width) * 100);
      setPct(last);
    };
    const up = (): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      safeSet(KEY, String(Math.round(last * 10) / 10));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div ref={box} className="panel-scroll" style={{ '--lbl': `${pct}%` } as React.CSSProperties}>
      <div className="lbl-split-wrap">
        <div className="lbl-split" style={{ height: h }} role="separator" aria-orientation="vertical" aria-label={t('shc_label_width')} title={t('shc_label_drag')} onPointerDown={start} onDoubleClick={() => { setPct(DEFAULT); safeSet(KEY, String(DEFAULT)); }} />
      </div>
      {children}
    </div>
  );
}
