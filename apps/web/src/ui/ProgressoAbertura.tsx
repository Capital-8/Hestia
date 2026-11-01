import type { CSSProperties, ReactElement } from 'react';
import { textoDoProgresso, useProgressoAbertura } from './progressoAbertura.ts';

/** Mesmo estilo discreto da barra da montagem 3D (`Progresso3D`), mas no canto de baixo para não competir com ela. */
const CAIXA: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 16,
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

/** Barra geral de abertura de projeto: lendo, pavimento ativo e preparo em segundo plano. Some quando termina. Não é modal. */
export function ProgressoAbertura(): ReactElement | null {
  const p = useProgressoAbertura();
  if (!p) return null;
  const pct = p.fase === 'projeto' ? Math.round((p.feitas / Math.max(1, p.total)) * 100) : p.fase === 'ativo' ? 15 : 5;
  return (
    <div role="progressbar" aria-label="Abrindo o projeto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={CAIXA}>
      <div>{textoDoProgresso(p)}</div>
      <div style={TRILHO}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent, #4a90d9)', transition: 'width 120ms linear' }} />
      </div>
    </div>
  );
}
