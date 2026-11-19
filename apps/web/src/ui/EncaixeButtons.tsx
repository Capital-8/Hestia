import type { ReactElement } from 'react';
import type { ModoEncaixe } from '@hestia/engine';
import { useT, type Dict } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { definirModoEncaixe, proximoModoEncaixe, useEncaixe } from '../editor/encaixeComponente.ts';
import { alternarModoGizmo, useModoGizmo } from '../editor/modoGizmo.ts';

const ROTULO: Record<ModoEncaixe, keyof Dict> = { parede: 'ui_en_parede', parede_vizinho: 'ui_en_parede_vizinho', livre: 'ui_en_livre' };
const STATUS: Record<ModoEncaixe, keyof Dict> = { parede: 'ui_en_status_parede', parede_vizinho: 'ui_en_status_parede_vizinho', livre: 'ui_en_status_livre' };

/** Botões da barra de status: seletor de encaixe do arrasto de móveis e, na 3D com um componente selecionado, o modo do gizmo. */
export function EncaixeButtons(): ReactElement {
  const { t } = useT();
  const modo = useEncaixe((s) => s.modo);
  const gizmo = useModoGizmo((s) => s.modo);
  const em3d = useUi((s) => s.view === '3d' && s.selection.length === 1);
  const temComponente = useModoGizmo((s) => s.id !== null);
  const noGizmo = em3d && temComponente;
  const trocar = (): void => {
    const prox = proximoModoEncaixe(modo);
    definirModoEncaixe(prox);
    useUi.setState({ status: { key: STATUS[prox] } });
  };
  return (
    <>
      {noGizmo ? (
        <button type="button" className="snap-btn" onClick={() => alternarModoGizmo()} title={t('ui_gz_modo_tip')}>
          <span>{t(gizmo === 'mover' ? 'ui_gz_modo_mover' : 'ui_gz_modo_redim')}</span>
          <span className="snap-status-tag">Tab</span>
        </button>
      ) : null}
      <button type="button" className={`snap-btn${modo === 'parede' ? ' snap-btn--disabled' : ''}`} onClick={trocar} title={t('ui_en_tip')}>
        <span>{t('ui_en_nome')}: {t(ROTULO[modo])}</span>
      </button>
    </>
  );
}
