import type { CSSProperties, ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import { useProgresso3d } from './progresso3d.ts';

const CAIXA: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 16,
  transform: 'translateX(-50%)',
  minWidth: 240,
  padding: '8px 12px',
  borderRadius: 6,
  background: 'var(--panel, rgba(30,30,30,0.9))',
  border: '1px solid var(--border, rgba(128,128,128,0.4))',
  color: 'var(--fg, inherit)',
  fontSize: 12,
  pointerEvents: 'none',
  zIndex: 20,
};

const TRILHO: CSSProperties = { height: 4, marginTop: 6, borderRadius: 2, background: 'rgba(128,128,128,0.3)', overflow: 'hidden' };

/** Barra de progresso da montagem da vista 3D (pavimentos montados / total). Some quando a montagem termina. */
export function Progresso3D(): ReactElement | null {
  const { t } = useT();
  const p = useProgresso3d();
  if (!p) return null;
  const pct = Math.round((p.montados / p.total) * 100);
  return (
    <div role="progressbar" aria-label={t('cvv_prog_3d_aria')} aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.montados} style={CAIXA}>
      <div>{t('cvv_prog_3d_text', { n: p.montados, total: p.total })}</div>
      <div style={TRILHO}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent, #4a90d9)', transition: 'width 120ms linear' }} />
      </div>
    </div>
  );
}
