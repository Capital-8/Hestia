import { useMemo, type ReactElement } from 'react';
import { DXF_LINE_WEIGHTS, DXF_LINE_WEIGHT_DEFAULT, dxfLineWeightLabel, type DxfLayerStyle } from '@hestia/model';
import { useT, type Dict } from '../../editor/i18n.ts';
import type { DxfLayerRow } from '../../editor/dxfExport.ts';

/** Cores ACI oferecidas na tabela (as do AutoCAD clássico); um valor gravado fora delas vira uma opção a mais. */
const COLOR_KEYS: ReadonlyArray<[number, keyof Dict]> = [
  [1, 'dlc_dxf_color_red'],
  [2, 'dlc_dxf_color_yellow'],
  [3, 'dlc_dxf_color_green'],
  [4, 'dlc_dxf_color_cyan'],
  [5, 'dlc_dxf_color_blue'],
  [6, 'dlc_dxf_color_magenta'],
  [7, 'dlc_dxf_color_white'],
  [8, 'dlc_dxf_color_darkgray'],
  [9, 'dlc_dxf_color_lightgray'],
];

const LINETYPE_KEYS: ReadonlyArray<[DxfLayerStyle['linetype'], keyof Dict]> = [
  ['CONTINUOUS', 'dlc_dxf_linetype_continuous'],
  ['DASHED', 'dlc_dxf_linetype_dashed'],
];

interface Props {
  rows: readonly DxfLayerRow[];
  onStyle: (layer: string, patch: Partial<DxfLayerStyle>) => void;
}

/**
 * Tabela de camadas do DXF (fase 3): cor ACI, tipo de linha e espessura por camada, com o padrão já montado. É
 * apresentação pura: quem chama guarda a edição no projeto (comando `setDxfLayerStyle`).
 */
export function DxfLayerTable({ rows, onStyle }: Props): ReactElement {
  const { t, lang } = useT();
  const options = useMemo(() => [DXF_LINE_WEIGHT_DEFAULT, ...DXF_LINE_WEIGHTS], []);
  const colors = useMemo(() => COLOR_KEYS.map(([c, key]) => [c, t(key)] as [number, string]), [t]);
  const linetypes = useMemo(() => LINETYPE_KEYS.map(([value, key]) => [value, t(key)] as [DxfLayerStyle['linetype'], string]), [t]);
  return (
    <table className="layers" aria-label={t('dlc_aria_dxf_layers')}>
      <thead>
        <tr>
          <th>{t('dlc_col_layer')}</th>
          <th>{t('dlc_col_color')}</th>
          <th>{t('dlc_col_linetype')}</th>
          <th>{t('col_thickness')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ name, style }) => (
          <tr key={name}>
            <td style={{ fontFamily: 'monospace' }}>{name}</td>
            <td>
              <select aria-label={t('dlc_aria_dxf_layer_color', { name })} value={style.color} onChange={(e) => onStyle(name, { color: Number(e.target.value) })}>
                {(colors.some(([c]) => c === style.color) ? colors : [...colors, [style.color, `ACI ${style.color}`] as [number, string]]).map(([c, label]) => (
                  <option key={c} value={c}>{c} · {label}</option>
                ))}
              </select>
            </td>
            <td>
              <select aria-label={t('dlc_aria_dxf_layer_linetype', { name })} value={style.linetype} onChange={(e) => onStyle(name, { linetype: e.target.value as DxfLayerStyle['linetype'] })}>
                {linetypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </td>
            <td>
              <select aria-label={t('dlc_aria_dxf_layer_weight', { name })} value={style.lineWeight} onChange={(e) => onStyle(name, { lineWeight: Number(e.target.value) })}>
                {options.map((w) => <option key={w} value={w}>{dxfLineWeightLabel(w, lang)}</option>)}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
