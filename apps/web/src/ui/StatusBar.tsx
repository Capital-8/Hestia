import type { ReactElement } from 'react';
import { formatQuantity } from '@hestia/model';
import { useUi } from '../editor/state.ts';
import { useAtalhos } from '../editor/shortcutConfig.ts';
import { resolveText, useT, type Dict } from '../editor/i18n.ts';
import { usePerimeter } from '../editor/perimeter.ts';
import { Icon } from './Icon.tsx';
import { IssuesButton } from './IssuesButton.tsx';
import { SnapButton } from './SnapButton.tsx';
import { OrthoButton } from './OrthoButton.tsx';
import { useUnits } from './useUnits.ts';

const SNAP: Record<string, keyof Dict> = {
  endpoint: 'shc_snap_endpoint',
  face: 'shc_snap_face',
  core: 'shc_snap_core',
  midpoint: 'shc_snap_midpoint',
  intersection: 'shc_snap_intersection',
  perpendicular: 'shc_snap_perpendicular',
  nearest: 'shc_snap_nearest',
  alignment: 'shc_snap_alignment',
  ortho: 'shc_snap_ortho',
  polar: 'shc_snap_polar',
  grid: 'shc_snap_grid',
};

export function StatusBar(): ReactElement {
  const units = useUnits();
  const { t, lang } = useT();
  const uiStatus = useUi((s) => s.status);
  const perim = usePerimeter();
  const status = perim.active && perim.status ? perim.status : uiStatus;
  const statusText = resolveText(status, lang);
  const cursor = useUi((s) => s.cursor);
  const snap = useUi((s) => s.snapKind);
  const view = useUi((s) => s.view);
  const pendente = useAtalhos((s) => s.pendente);
  const nSel = useUi((s) => s.selection.length);
  const gpu = useUi((s) => s.gpu);
  const engine = gpu === 'pending' ? '…' : gpu === 'cpu' ? 'CPU' : gpu === 'webgpu' ? 'WebGPU' : 'WebGL2';
  const snapKey = snap ? SNAP[snap] : undefined;
  return (
    <footer className="statusbar" role="status">
      <span className="msg" title={statusText}>{statusText}</span>
      {pendente ? <span className="mono" aria-label={t('shc_sb_shortcut_pending')}>{pendente}…</span> : null}
      {view === 'plan' && cursor ? <span className="mono sb-coords">x {formatQuantity(units, 'length', cursor.x, { lang })}  y {formatQuantity(units, 'length', cursor.y, { lang })}</span> : null}
      {/* Corte/elevação trabalham em (t,z): t é a distância ao longo da linha e z a cota. Não são x/y de planta. */}
      {view === 'section' && cursor ? <span className="mono sb-coords">t {formatQuantity(units, 'length', cursor.x, { lang })}  z {formatQuantity(units, 'length', cursor.y, { lang })}</span> : null}
      <span className="mono sb-snap">{snapKey ? t(snapKey) : view === 'section' && snap ? snap : ''}</span>
      <SnapButton />
      <OrthoButton />
      <span className="sb-filter" title={t(nSel === 1 ? 'shc_sb_filter_one' : 'shc_sb_filter_many', { n: nSel })}>
        <Icon name="funnel" size={12} />
        <span className="mono">:{nSel}</span>
      </span>
      <IssuesButton />
      <span className={`badge sb-engine ${gpu === 'cpu' ? 'cpu' : 'gpu'}`} title={t('tip_engine')}>{engine}</span>
    </footer>
  );
}
