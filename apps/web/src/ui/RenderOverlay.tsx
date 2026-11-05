import type { ReactElement } from 'react';
import { useRenderJob } from '../editor/renderProgress.ts';
import './RenderOverlay.css';

const FASE: Record<string, string> = {
  preparing: 'Preparando',
  rendering: 'Renderizando',
  encoding: 'Codificando',
  saving: 'Salvando',
};

/** Barra flutuante do render em andamento (vídeo ou imagem). */
export function RenderOverlay(): ReactElement | null {
  const progress = useRenderJob((s) => s.progress);
  const cancelar = useRenderJob((s) => s.cancelar);
  if (!progress) return null;
  const pct = Math.round(progress.fraction * 100);
  const eta = progress.etaMs !== null && progress.etaMs > 0 ? ` · ~${Math.ceil(progress.etaMs / 1000)} s` : '';
  return (
    <div className="render-overlay" role="status" aria-live="polite">
      <div className="render-card">
        <div className="render-head">
          <b>{FASE[progress.phase] ?? 'Renderizando'}</b>
          <span className="mono">{pct}%</span>
        </div>
        <div className="render-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="render-foot">
          <span>{progress.message ?? ''}{progress.total > 0 ? ` · ${progress.frame}/${progress.total}` : ''}{eta}</span>
          {cancelar ? <button className="btn small" onClick={cancelar}>Cancelar</button> : null}
        </div>
      </div>
    </div>
  );
}
