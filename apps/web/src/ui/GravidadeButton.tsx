import type { ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import { toggleGravidade, useUi } from '../editor/state.ts';

/** Botão Gravidade da barra de status (ficha G1): ligado, o elemento novo nasce na cota do terreno proposto sob o primeiro clique. */
export function GravidadeButton(): ReactElement {
  const { t } = useT();
  const ligada = useUi((s) => s.gravidade);
  return (
    <button
      type="button"
      className={`snap-btn${ligada ? '' : ' snap-btn--disabled'}`}
      aria-pressed={ligada}
      onClick={() => toggleGravidade()}
      title={t(ligada ? 'ui_gv_on' : 'ui_gv_off')}
    >
      <span>{t('ui_gv_nome')}</span>
      {ligada ? null : <span className="snap-status-tag off">OFF</span>}
    </button>
  );
}
