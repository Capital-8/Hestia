import type { ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { safeSet } from '../editor/storage.ts';
import { Check, Row } from './fields.tsx';

/** Pavimento de referência do Subpavimento: o de baixo (automático) ou qualquer nível abaixo do atual. */
export function UnderlayRow(): ReactElement {
  const { t } = useT();
  const p = useProject();
  // Só o que esta linha lê: mudanças de `previewTick` na órbita não re-renderizam o seletor (WP-A1).
  const s = useUi(useShallow((u) => ({ levelId: u.levelId, showUnderlay: u.showUnderlay, underlayLevel: u.underlayLevel })));
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

/** Eixos X, Y e Z da origem na planta e no 3D: preferência da tela (guardada no navegador), ligada por padrão. */
export function OrigemEixosRow(): ReactElement {
  const { t } = useT();
  const on = useUi((s) => s.showOrigemEixos);
  return (
    <Row label={t('prd_fld_origin_axes')}>
      <Check id="v-origem-eixos" checked={on} onChange={(v) => { useUi.setState({ showOrigemEixos: v }); safeSet('hestia.origemEixos', v ? 'true' : 'false'); }} />
    </Row>
  );
}
