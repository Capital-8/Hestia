import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { DEFAULT_SNAP, type SnapOptions } from '@hestia/tools';
import { useT, type Dict } from '../editor/i18n.ts';
import { setSnap, useUi } from '../editor/state.ts';
import { Check } from './fields.tsx';

interface SnapItemDef {
  key: keyof SnapOptions;
  label: keyof Dict;
  symbol: string;
  shortcut?: string;
  hint: keyof Dict;
}

/** Capturas do popover, inspiradas no AutoCAD e Revit. */
const ITEMS: SnapItemDef[] = [
  { key: 'endpoint', label: 'shc_snap_endpoint', symbol: '□', hint: 'shc_snap_endpoint_hint' },
  { key: 'midpoint', label: 'shc_snap_midpoint', symbol: '△', hint: 'shc_snap_midpoint_hint' },
  { key: 'axis', label: 'shc_snap_axis', symbol: '┼', hint: 'shc_snap_axis_hint' },
  { key: 'intersections', label: 'shc_snap_intersection', symbol: '✕', hint: 'shc_snap_intersection_hint' },
  { key: 'perpendicular', label: 'shc_snap_perpendicular', symbol: '⟂', hint: 'shc_snap_perpendicular_hint' },
  { key: 'alignment', label: 'shc_snap_dynamic_tracking', symbol: '☩', shortcut: 'F11', hint: 'shc_snap_alignment_hint' },
  { key: 'faces', label: 'shc_snap_faces', symbol: '⚏', hint: 'shc_snap_faces_hint' },
  { key: 'core', label: 'shc_snap_core_faces', symbol: '◇', hint: 'shc_snap_core_faces_hint' },
  { key: 'cad', label: 'shc_snap_cad', symbol: '⠿', hint: 'shc_snap_cad_hint' },
  { key: 'grid', label: 'shc_snap_by_grid', symbol: '⊞', hint: 'shc_snap_grid_hint' },
];

const ALL_ON: SnapOptions = {
  enabled: true,
  grid: true,
  axis: true,
  faces: true,
  core: true,
  intersections: true,
  perpendicular: true,
  alignment: true,
  endpoint: true,
  midpoint: true,
  cad: true,
};

const ALL_OFF: SnapOptions = {
  enabled: false,
  grid: false,
  axis: false,
  faces: false,
  core: false,
  intersections: false,
  perpendicular: false,
  alignment: false,
  endpoint: false,
  midpoint: false,
  cad: false,
};

/** Botão Snap da barra de status com checklist de capturas (AutoCAD Object Snap / Revit Snaps). */
export function SnapButton(): ReactElement {
  const { t } = useT();
  const snap = useUi((s) => s.options.snap) ?? DEFAULT_SNAP;
  const isEnabled = snap.enabled !== false;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const popId = useId();

  const activeCount = ITEMS.filter((i) => snap[i.key] !== false).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      const target = e.target;
      if (target instanceof Node && anchor.current && !anchor.current.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open]);

  return (
    <div className="snap-anchor" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className={`snap-btn${!isEnabled ? ' snap-btn--disabled' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
        title={t('shc_snap_btn_tip')}
      >
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
        <span>Snap</span>
        {isEnabled ? (
          <span className="snap-count">{activeCount}/{ITEMS.length}</span>
        ) : (
          <span className="snap-status-tag off">OFF [F3]</span>
        )}
      </button>

      {open && (
        <div id={popId} ref={pop} role="dialog" aria-label={t('shc_snap_pop_title')} className="snap-pop" tabIndex={-1}>
          <div className="snap-master-row">
            <div className="snap-master-info">
              <strong>{t('shc_snap_master_title')}</strong>
              <span className="snap-master-hint">{t('shc_snap_master_hint')} <code>F3</code></span>
            </div>
            <button
              type="button"
              className={`btn small ${isEnabled ? 'primary' : ''}`}
              onClick={() => setSnap({ enabled: !isEnabled })}
            >
              {t(isEnabled ? 'shc_snap_on' : 'shc_snap_off')}
            </button>
          </div>

          <div role="group" aria-label={t('shc_snap_checklist_aria')}>
            {ITEMS.map((i) => {
              const val = snap[i.key] !== false;
              return (
                <div key={i.key} className="snap-row">
                  <Check
                    id={`snap-${i.key}`}
                    checked={val}
                    onChange={(v) => setSnap({ [i.key]: v })}
                  >
                    <span className="snap-item-label">
                      <span className="snap-sym">{i.symbol}</span>
                      <span>{t(i.label)}</span>
                      {i.shortcut && <span className="snap-shortcut">{i.shortcut}</span>}
                    </span>
                  </Check>
                  <span className="snap-desc">{t(i.hint)}</span>
                </div>
              );
            })}
          </div>

          <div className="snap-actions">
            <button type="button" className="btn small" onClick={() => setSnap(ALL_ON)}>{t('shc_snap_all')}</button>
            <button type="button" className="btn small" onClick={() => setSnap(DEFAULT_SNAP)}>{t('shc_snap_default')}</button>
            <button type="button" className="btn small" onClick={() => setSnap(ALL_OFF)}>{t('shc_snap_none')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
