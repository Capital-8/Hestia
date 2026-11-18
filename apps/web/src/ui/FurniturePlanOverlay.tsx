import { useMemo, type ReactElement } from 'react';
import { isFurniture } from '@hestia/model';
import { worldToScreen } from '@hestia/render';
import { furnitureOutline } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';

/**
 * Contorno em planta dos móveis importados do nível ativo (a vista 3D desenha a malha). Não captura o mouse: o clique
 * segue para o canvas, onde a seleção acha o móvel pelo mesmo contorno (`furnitureAt`).
 */
export function FurniturePlanOverlay(): ReactElement | null {
  const p = useProject();
  const tick = useUi((s) => s.previewTick);
  const levelId = useUi((s) => s.levelId);
  const selection = useUi((s) => s.selection);
  // `tick` muda a cada pan/zoom (previewTick): a leitura do viewport acompanha.
  void tick;
  const viewport = editor.viewport();
  const items = useMemo(
    () => Object.values(p.elements).filter(isFurniture).filter((f) => f.levelId === levelId),
    [p, levelId],
  );
  if (!viewport || items.length === 0) return null;
  const sel = new Set(selection);
  return (
    <svg data-testid="furniture-plan" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
      {items.map((f) => {
        const asset = p.furniture?.assets[f.assetId];
        if (!asset) return null;
        const pts = furnitureOutline(f, asset).map((q) => worldToScreen(viewport, q));
        const on = sel.has(f.id);
        const c = pts.reduce((a, q) => ({ x: a.x + q.x / pts.length, y: a.y + q.y / pts.length }), { x: 0, y: 0 });
        return (
          <g key={f.id}>
            <polygon
              points={pts.map((q) => `${q.x},${q.y}`).join(' ')}
              fill={on ? 'var(--accent)' : 'currentColor'}
              fillOpacity={on ? 0.28 : 0.1}
              stroke={on ? 'var(--accent)' : 'currentColor'}
              strokeWidth={on ? 2 : 1}
            />
            <text x={c.x} y={c.y} fontSize={11} textAnchor="middle" fill="currentColor" style={{ paintOrder: 'stroke' }}>{f.name}</text>
          </g>
        );
      })}
    </svg>
  );
}
