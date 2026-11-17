import { useCallback, useRef, useState, type ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import type { MenuEntry } from '../editor/contextMenu.ts';
import type { LayoutPresetId } from '../editor/panes.ts';
import { applyPresetAligned } from '../editor/paneActivation.ts';
import { PopupMenu } from './PopupMenu.tsx';

/** Layouts prontos, na ordem do menu. */
const PRESETS: readonly { id: LayoutPresetId; key: 'pane_layout_single' | 'pane_layout_two_columns' | 'pane_layout_two_rows' | 'pane_layout_one_and_two' | 'pane_layout_grid' }[] = [
  { id: 'single', key: 'pane_layout_single' },
  { id: 'twoColumns', key: 'pane_layout_two_columns' },
  { id: 'twoRows', key: 'pane_layout_two_rows' },
  { id: 'oneAndTwo', key: 'pane_layout_one_and_two' },
  { id: 'grid', key: 'pane_layout_grid' },
];

/** Botão com o menu dos layouts prontos (ao lado das abas de vistas). Escolher um item aplica o layout. */
export function PaneLayoutMenu(): ReactElement {
  const { t } = useT();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Estava aberto quando o botão foi pressionado? O clique então só fecha (o menu já fechou no pointerdown fora).
  const estavaAberto = useRef(false);
  const fecha = useCallback(() => setPos(null), []);
  const itens: MenuEntry[] = PRESETS.map((p) => ({ id: p.id, label: t(p.key) }));

  return (
    <>
      <button
        type="button"
        className="ibtn"
        aria-label={t('pane_layout_btn')}
        title={t('pane_layout_btn')}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        onPointerDown={() => {
          estavaAberto.current = pos !== null;
        }}
        onClick={(e) => {
          if (estavaAberto.current) {
            setPos(null);
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: r.left, y: r.bottom + 2 });
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      {pos && (
        <PopupMenu
          x={pos.x}
          y={pos.y}
          items={itens}
          onPick={(id) => applyPresetAligned(id as LayoutPresetId)}
          onClose={fecha}
        />
      )}
    </>
  );
}
