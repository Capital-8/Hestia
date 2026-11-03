import type { ReactElement } from 'react';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Row } from './fields.tsx';

/** Pavimento de referência do Subpavimento: o de baixo (automático) ou qualquer nível abaixo do atual. */
export function UnderlayRow(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const s = useUi();
  const idx = p.levels.findIndex((l) => l.id === s.levelId);
  const abaixo = idx > 0 ? p.levels.slice(0, idx) : [];
  return (
    <Row label={t('prd_fld_reference_level')} htmlFor="v-underlay-level">
      <select
        id="v-underlay-level"
        className="select"
        disabled={!s.showUnderlay || abaixo.length === 0}
        value={s.underlayLevel ?? ''}
        onChange={(e) => useUi.setState({ underlayLevel: e.target.value || null })}
      >
        <option value="">{t('prd_opt_underlay_below_auto')}</option>
        {abaixo.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </Row>
  );
}
