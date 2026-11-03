import type { ReactElement } from 'react';
import { formatQuantity } from '@hestia/model';
import { useUi } from '../editor/state.ts';
import { useAtalhos } from '../editor/shortcutConfig.ts';
import { resolveText, useI18n } from '../editor/i18n.ts';
import { usePerimeter } from '../editor/perimeter.ts';
import { Icon } from './Icon.tsx';
import { IssuesButton } from './IssuesButton.tsx';
import { SnapButton } from './SnapButton.tsx';
import { OrthoButton } from './OrthoButton.tsx';
import { useUnits } from './useUnits.ts';

const SNAP: Record<string, string> = {
  endpoint: 'Extremidade',
  face: 'Canto da face',
  core: 'Face do núcleo',
  midpoint: 'Ponto médio',
  intersection: 'Interseção',
  perpendicular: 'Perpendicular',
  nearest: 'Sobre a parede',
  alignment: 'Alinhamento',
  ortho: 'Ortogonal',
  polar: 'Polar',
  grid: 'Grade',
};

export function StatusBar(): ReactElement {
  const units = useUnits();
  const lang = useI18n((s) => s.lang);
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
  const pt = lang === 'pt';
  const engine = gpu === 'pending' ? '…' : gpu === 'cpu' ? 'CPU' : gpu === 'webgpu' ? 'WebGPU' : 'WebGL2';
  return (
    <footer className="statusbar" role="status">
      <span className="msg" title={statusText}>{statusText}</span>
      {pendente ? <span className="mono" aria-label="Sequência de atalho em andamento">{pendente}…</span> : null}
      {view === 'plan' && cursor ? <span className="mono sb-coords">x {formatQuantity(units, 'length', cursor.x)}  y {formatQuantity(units, 'length', cursor.y)}</span> : null}
      {/* Corte/elevação trabalham em (t,z): t é a distância ao longo da linha e z a cota. Não são x/y de planta. */}
      {view === 'section' && cursor ? <span className="mono sb-coords">t {formatQuantity(units, 'length', cursor.x)}  z {formatQuantity(units, 'length', cursor.y)}</span> : null}
      <span className="mono sb-snap">{view === 'plan' ? (snap && SNAP[snap] ? SNAP[snap] : '') : view === 'section' && snap ? (SNAP[snap] ?? snap) : ''}</span>
      <SnapButton />
      <OrthoButton />
      <span className="sb-filter" title={pt ? `Filtro de seleção: ${nSel} elemento${nSel === 1 ? '' : 's'} selecionado${nSel === 1 ? '' : 's'}` : `Selection filter: ${nSel} selected`}>
        <Icon name="funnel" size={12} />
        <span className="mono">:{nSel}</span>
      </span>
      <IssuesButton />
      <span className={`badge sb-engine ${gpu === 'cpu' ? 'cpu' : 'gpu'}`} title={pt ? 'Motor de desenho em uso' : 'Rendering engine in use'}>{engine}</span>
    </footer>
  );
}
