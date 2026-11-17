import type { ReactElement } from 'react';
import { LADOS_ESBOCO_MAX, LADOS_ESBOCO_MIN, ladosDoEsboco } from '@hestia/tools';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { NumField } from '../fields.tsx';

/** Grava os lados dos polígonos do esboço (3 a 64) nas opções; vale para o próximo polígono inscrito ou circunscrito. */
export function ajustarLadosDoEsboco(n: number): void {
  const lados = ladosDoEsboco(Math.round(n));
  useUi.setState((s) => ({ options: { ...s.options, sketchSides: lados } }));
}

/** Campo "Lados" da barra do esboço (todos os alvos: massa, piso, laje, forro, telhado). */
export function SketchSidesField(): ReactElement {
  const { t } = useT();
  const v = ladosDoEsboco(useUi((s) => s.options.sketchSides));
  return (
    <label title={t('ui_ms_opt_lados')}>
      {t('ui_ms_opt_lados')}
      <NumField id="opt-pm-lados" value={v} decimals={0} min={LADOS_ESBOCO_MIN} max={LADOS_ESBOCO_MAX} onCommit={ajustarLadosDoEsboco} />
    </label>
  );
}
