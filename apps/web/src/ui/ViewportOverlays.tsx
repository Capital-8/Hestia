import type { ReactElement, RefObject } from 'react';
import type { Id } from '@hestia/model';
import type { Backend, ModelScene } from '@hestia/render';
import { editor } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import type { ViewKind } from '../editor/state.ts';
import { SectionBadge } from './SectionCanvas.tsx';
import { ViewCube } from './ViewCube.tsx';
import { OpeningFlipGrips } from './OpeningFlipGrips.tsx';
import { TempDimsOverlay } from './dims/TempDimsOverlay.tsx';
import { DimValueEditor } from './dims/DimValueEditor.tsx';
import { NavBar } from './NavBar.tsx';
import { CanvasContextMenu } from './CanvasContextMenu.tsx';

/** Sobreposições HTML do canvas, na mesma ordem em que entram na árvore da vista. */
export function ViewportOverlays({
  host,
  model,
  selection,
  ui,
}: {
  host: RefObject<HTMLDivElement | null>;
  model: ModelScene;
  selection: Id[];
  ui: { view: ViewKind; gpu: Backend | 'cpu' | 'pending'; prompt: string | null; typed: string };
}): ReactElement {
  const { t } = useT();
  const only = selection.length === 1 ? editor.project.elements[selection[0]!] : undefined;
  const selectedOpeningId = only && (only.kind === 'door' || only.kind === 'window') ? only.id : null;
  const center = (): { x: number; y: number } => {
    const r = host.current?.getBoundingClientRect();
    return { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
  };
  return (
    <>
      {ui.view === 'plan' && selectedOpeningId ? <OpeningFlipGrips openingId={selectedOpeningId} /> : null}
      {ui.view === 'plan' ? <TempDimsOverlay /> : null}
      {ui.view === 'plan' || ui.view === 'section' ? <DimValueEditor /> : null}
      {ui.gpu === 'cpu' && <div className="cpu-note">{t('cvv_cpu_note')}</div>}
      {ui.gpu === 'cpu' && ui.view === '3d' && (
        <div className="hint" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--sheet)' }}>
          {t('cvv_no_webgl')}
        </div>
      )}
      <NavBar model={model} center={center} />
      <CanvasContextMenu model={model} host={host} />
      {ui.view === '3d' && ui.gpu !== 'cpu' ? <ViewCube model={model} /> : null}
      {ui.view === 'section' ? <SectionBadge /> : null}
      {ui.view === 'plan' && ui.prompt ? (
        <div className="typebox" role="status">
          <span className="cap">{ui.prompt}</span>
          <span className="buf" aria-live="polite">{ui.typed}</span>
          <span className="cap">{t('cvv_enter_confirms')}</span>
        </div>
      ) : null}
    </>
  );
}
