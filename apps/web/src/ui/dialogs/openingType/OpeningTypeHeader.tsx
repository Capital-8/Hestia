import type { ReactElement } from 'react';
import type { OpeningFamily } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';

interface OpeningTypeHeaderProps {
  families: readonly OpeningFamily[];
  familyId: string | null;
  types: ReadonlyArray<{ id: string; name: string }>;
  currentId: string;
  nameFieldId: string;
  favorite: boolean;
  onFamily: (id: string) => void;
  onType: (id: string) => void;
  onDuplicate: () => void;
  onFavorite: () => void;
  /** Chamado antes de focar o nome (o diálogo abre o componente que tem o campo). */
  onBeforeRename?: () => void;
}

/** Cabeçalho do diálogo: família (seletor), tipo, duplicar, renomear e favorito. */
export function OpeningTypeHeader({
  families,
  familyId,
  types,
  currentId,
  nameFieldId,
  favorite,
  onFamily,
  onType,
  onDuplicate,
  onFavorite,
  onBeforeRename,
}: OpeningTypeHeaderProps): ReactElement {
  const { t } = useT();
  const focusName = (): void => {
    const el = document.getElementById(nameFieldId);
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.select();
    }
  };
  const rename = (): void => {
    if (!onBeforeRename) return focusName();
    onBeforeRename();
    // O campo só existe depois de o painel trocar.
    window.setTimeout(focusName, 0);
  };
  return (
    <div className="tdlg-bar op-head">
      <label htmlFor="op-family">{t('dlo_f_family')}</label>
      <select id="op-family" className="select" value={familyId ?? ''} onChange={(e) => onFamily(e.target.value)}>
        {familyId === null ? <option value="">{t('dlo_family_other')}</option> : null}
        {families.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      <span />
      <label htmlFor="op-type">{t('dlo_f_type')}</label>
      <select id="op-type" className="select" value={currentId} onChange={(e) => onType(e.target.value)}>
        {types.map((type) => (
          <option key={type.id} value={type.id}>{type.name}</option>
        ))}
      </select>
      <div className="btns">
        <button type="button" className="btn small" onClick={onDuplicate}>{t('dlo_btn_duplicate')}</button>
        <button type="button" className="btn small" onClick={rename}>{t('dlo_btn_rename')}</button>
        <button
          type="button"
          className="btn small op-star"
          aria-label={favorite ? t('dlo_cmd_unfavorite') : t('dlo_aria_favorite')}
          title={favorite ? t('dlo_tip_unfavorite') : t('dlo_tip_favorite')}
          onClick={onFavorite}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>
    </div>
  );
}
