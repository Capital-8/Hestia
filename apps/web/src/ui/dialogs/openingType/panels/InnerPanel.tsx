import type { ReactElement } from 'react';
import { useT } from '../../../../editor/i18n.ts';
import type { PanelProps } from './panelKit.tsx';
import { CasingRows, ClosureSideRow } from './sharedRows.tsx';

/** Lado interno: retorno do acabamento e alizar (o alizar do tipo vale para as duas faces). */
export function InnerPanel(props: PanelProps): ReactElement {
  const { t } = useT();
  return (
    <>
      <ClosureSideRow d={props.d} onChange={props.onChange} lado="interior" />
      <CasingRows {...props} />
      {props.support.threshold ? <p className="hint">{t('dlo_h_threshold_both_sides')}</p> : null}
    </>
  );
}
