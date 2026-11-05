import { useCallback, useEffect, useMemo, type CSSProperties, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { frameOfWall } from '@hestia/engine';
import { openingTypeById, isOpening, type Id } from '@hestia/model';
import { worldToScreen } from '@hestia/render';
import { nextOpeningFlip, openingGripPlacements, openingHasHinge, type OpeningFlipKind } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';

const BASE: CSSProperties = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  width: 26,
  height: 26,
  padding: 0,
  borderRadius: '50%',
  border: '1px solid var(--accent)',
  background: 'var(--panel)',
  color: 'var(--fg)',
  display: 'grid',
  placeItems: 'center',
  font: '600 13px var(--font-ui)',
  lineHeight: 1,
  cursor: 'pointer',
  pointerEvents: 'auto',
  boxShadow: 'var(--shadow)',
};

/**
 * Só o botão esquerdo pertence à alça. Meio e direito precisam seguir para o canvas: o meio inicia o pan e o direito
 * abre o menu de contexto. Antes, a alça consumia qualquer botão (e invertia a abertura no meio).
 */
export function deveTratarGrip(button: number): boolean {
  return button === 0;
}

/** Contém o ponteiro para não competir com a seleção do canvas; nos demais botões deixa o evento seguir. */
const conterSeEsquerdo = (e: RPointerEvent<HTMLElement>): void => {
  if (deveTratarGrip(e.button)) e.stopPropagation();
};

/**
 * Alças de inverter a abertura selecionada na planta (Revit: flip controls). Ficam do lado oposto ao da abertura,
 * acompanham pan/zoom (posição calculada do mundo para a tela) e gravam pelo comando `updateElements`, num passo de
 * desfazer. Tab inverte o sentido e Espaço a dobradiça, com a Selecionar ativa.
 */
export function OpeningFlipGrips({ openingId }: { openingId: Id }): ReactElement | null {
  const { t } = useT();
  const p = useProject();
  const tick = useUi((s) => s.previewTick);
  const apply = useCallback((kind: OpeningFlipKind): void => {
    const current = editor.project.elements[openingId];
    if (!current || !isOpening(current)) return;
    editor.store.exec({ type: 'updateElements', ids: [openingId], patch: nextOpeningFlip(current, kind) });
    useUi.setState({ status: { key: kind === 'facing' ? 'msc_flip_facing_done' : 'msc_flip_hand_done' } });
  }, [openingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isFacing = e.key === 'Tab';
      const isHand = e.code === 'Space';
      if ((!isFacing && !isHand) || e.ctrlKey || e.altKey || e.metaKey) return;
      const st = useUi.getState();
      if (st.tool !== 'select' || st.view !== 'plan' || st.typed || st.dialog || st.fileMenu) return;
      if (st.selection.length !== 1 || st.selection[0] !== openingId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.tagName === 'BUTTON' || target.tagName === 'A' || target.isContentEditable)) return;
      const current = editor.project.elements[openingId];
      if (!current || !isOpening(current)) return;
      if (isHand) {
        const type = openingTypeById(editor.project, current.typeId);
        if (!type || !openingHasHinge(type)) return;
      }
      e.preventDefault();
      e.stopPropagation();
      apply(isFacing ? 'facing' : 'hand');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openingId, apply]);

  const viewport = useMemo(() => editor.viewport(), [tick]);
  const opening = p.elements[openingId];
  if (!opening || !isOpening(opening) || !viewport) return null;
  const frame = frameOfWall(p, opening.hostId);
  const type = openingTypeById(p, opening.typeId);
  if (!frame || !type) return null;
  const grips = openingGripPlacements(frame, opening, type);
  const facing = worldToScreen(viewport, grips.facing);
  const hand = grips.hand ? worldToScreen(viewport, grips.hand) : null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 12, pointerEvents: 'none' }}>
      <button
        type="button"
        title={t('msc_flip_facing_tip')}
        aria-label={t('dlo_prev_flip_facing')}
        style={{ ...BASE, left: facing.x, top: facing.y }}
        onPointerDown={conterSeEsquerdo}
        onPointerUp={conterSeEsquerdo}
        onClick={(e) => {
          if (!deveTratarGrip(e.button)) return;
          e.stopPropagation();
          apply('facing');
        }}
      >
        ⇅
      </button>
      {hand && (
        <button
          type="button"
          title={t('msc_flip_hand_tip')}
          aria-label={t('dlo_prev_flip_hand')}
          style={{ ...BASE, left: hand.x, top: hand.y }}
          onPointerDown={conterSeEsquerdo}
          onPointerUp={conterSeEsquerdo}
          onClick={(e) => {
            if (!deveTratarGrip(e.button)) return;
            e.stopPropagation();
            apply('hand');
          }}
        >
          ⇄
        </button>
      )}
    </div>
  );
}
