import type { ReactElement } from 'react';
import { openingHeight, type Id, type Opening, type OpeningType } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { fmtNum, useT } from '../editor/i18n.ts';
import { usarAlturaDoTipo } from '../editor/openingTypeActions.ts';
import { useUi } from '../editor/state.ts';
import { NumField, Row } from './fields.tsx';

/**
 * Altura da abertura selecionada: o campo (a do tipo, ou a própria da instância), o selo "Altura própria" quando há
 * override e o botão que devolve a altura do tipo (um comando; desfazer restaura a própria).
 */
export function AlturaDaAbertura({ ids, abertura, tipo }: { ids: Id[]; abertura: Opening; tipo: OpeningType | null }): ReactElement {
  const { t, lang } = useT();
  const propria = typeof abertura.heightOverride === 'number';
  return (
    <>
      <Row label={t('prc_fld_opening_height')} htmlFor="p-height">
        <NumField
          id="p-height"
          value={tipo ? openingHeight(tipo, abertura) : 0}
          onCommit={(v) => editor.store.exec({ type: 'updateElements', ids, patch: { heightOverride: v } })}
          quantity="length"
          min={0.1}
          onInvalid={() => useUi.setState({ status: { key: 'prc_msg_invalid_height', args: { v: fmtNum(1.2, 2, lang) } } })}
          onValid={() => { const st = useUi.getState().status; if (typeof st !== 'string' && st.key === 'prc_msg_invalid_height') useUi.setState({ status: { key: 'prc_msg_ready' } }); }}
        />
        {propria ? <span className="tmark" title={t('prc_tip_own_height')}>{t('prc_badge_own_height')}</span> : null}
      </Row>
      {propria ? (
        <div className="prow"><span /><button className="chiplink" onClick={() => usarAlturaDoTipo(editor.store, ids)}>{t('prc_btn_use_type_height')}</button></div>
      ) : null}
    </>
  );
}
