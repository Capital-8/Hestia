import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { formatQuantity, profileMax, type Wall } from '@hestia/model';
import { useT } from '../editor/i18n.ts';
import { ProfileDialog } from './dialogs/ProfileDialog.tsx';
import { Row } from './fields.tsx';
import { useUnits } from './useUnits.ts';

/**
 * Linha "Perfil superior" das restrições da parede. Só edita com UMA parede reta selecionada.
 * Montada com `key` pela seleção (Properties), então o diálogo fecha sozinho ao mudar a seleção.
 */
export function ProfileRow({ walls }: { walls: Wall[] }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const [open, setOpen] = useState(false);
  const single = walls.length === 1 ? walls[0]! : null;
  const curved = !!single && single.sag !== 0;
  const editable = !!single && !curved;
  const curvedText = t('prc_msg_profile_straight_only');
  const value = !single
    ? t('prc_msg_select_a_wall')
    : single.topProfile
      ? t('prc_msg_profile_polygonal_max', { value: formatQuantity(units, 'length', profileMax(single.topProfile)) })
      : t('prc_opt_profile_straight');
  return (
    <>
      <Row label={t('prc_fld_top_profile')} htmlFor="p-profile">
        <span className="profile-cell">
          <span className="val soft">{value}</span>
          <button id="p-profile" className="btn small" disabled={!editable} onClick={() => setOpen(true)} title={curved ? curvedText : !single ? t('prc_msg_select_a_wall') : undefined}>
            {t('prc_btn_edit')}
          </button>
        </span>
      </Row>
      {curved && <div className="profile-note">{curvedText}</div>}
      {open && single && createPortal(<ProfileDialog wallId={single.id} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
