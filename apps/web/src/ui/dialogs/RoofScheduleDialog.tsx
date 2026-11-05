import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { buildRoofSchedule, filterRoofRows, roofScheduleToCsv, ROOF_SHAPE_LABEL, sumRoofRows, type RoofScheduleRow } from '@hestia/engine';
import { formatQuantity, type Quantity, type ResolvedUnits, type RoofShape } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { cmpTexto, resolveText, t as translate, useI18n, I18N, type Lang, type TextLike } from '../../editor/i18n.ts';
import { saveText } from '../../editor/saveText.ts';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { scheduleCell, scheduleHeader } from './scheduleUnits.ts';
import { useUnits } from '../useUnits.ts';

interface Col {
  key: keyof RoofScheduleRow;
  /** Chave do rótulo em I18N (PT/EN). */
  labelKey: keyof typeof I18N.pt;
  /** Presente nas colunas numéricas: casas decimais e alinhamento à direita. */
  decimals?: number;
  /** Grandeza da coluna: converte o valor SI para a unidade do projeto. */
  quantity?: Quantity;
  /** Multiplicador antes da conversão (percentual → razão). */
  factor?: number;
}

const COLS: Col[] = [
  { key: 'mark', labelKey: 'col_mark' },
  { key: 'typeName', labelKey: 'col_type' },
  { key: 'typeCode', labelKey: 'col_code' },
  { key: 'levelName', labelKey: 'col_level' },
  { key: 'shapeLabel', labelKey: 'col_shape' },
  { key: 'slopePercent', labelKey: 'col_slope', decimals: 1, quantity: 'slope', factor: 0.01 },
  { key: 'planArea', labelKey: 'col_plan_area', decimals: 2, quantity: 'area' },
  { key: 'faceArea', labelKey: 'col_real_area', decimals: 2, quantity: 'area' },
  { key: 'ridgeLength', labelKey: 'col_ridge', decimals: 2, quantity: 'length' },
  { key: 'eaveLength', labelKey: 'col_eave', decimals: 2, quantity: 'length' },
  { key: 'volume', labelKey: 'col_volume', decimals: 3, quantity: 'volume' },
];

interface Sort {
  key: keyof RoofScheduleRow;
  dir: 1 | -1;
}

const compare = (a: RoofScheduleRow, b: RoofScheduleRow, s: Sort, lang: Lang, label?: (r: RoofScheduleRow) => string): number => {
  const x = label ? label(a) : a[s.key];
  const y = label ? label(b) : b[s.key];
  const r = typeof x === 'number' && typeof y === 'number' ? x - y : cmpTexto(String(x ?? ''), String(y ?? ''), lang);
  return r * s.dir;
};

const cellValue = (r: RoofScheduleRow, c: Col, shapeName: (s: RoofShape) => string, units: ResolvedUnits): ReactNode => {
  if (c.key === 'shapeLabel') return shapeName(r.shape);
  const v = r[c.key];
  if (v === null) return '—';
  return typeof v === 'number' ? (c.quantity ? scheduleCell(units, c.quantity, v * (c.factor ?? 1), c.decimals) : String(v)) : v;
};

const SHAPES = Object.keys(ROOF_SHAPE_LABEL) as RoofShape[];

/** Tabela de telhados com ordenação, filtros por nível, tipo e forma, totais e exportação CSV (padrão da tabela de lajes). */
export function RoofScheduleDialog(): ReactElement {
  const p = useProject();
  const lang = useI18n((s) => s.lang);
  const t = I18N[lang];
  const units = useUnits();
  /** Nome da forma no idioma ativo (o rótulo do engine é só PT). */
  const shapeName = (s: RoofShape): string => t[`roof_shape_${s}` as keyof typeof I18N.pt];
  const schedule = useMemo(() => buildRoofSchedule(p), [p]);
  const [levelId, setLevelId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [shape, setShape] = useState<RoofShape | ''>('');
  const [sort, setSort] = useState<Sort | null>(null);
  const [msg, setMsg] = useState<TextLike>('');

  const types = useMemo(() => {
    const byId = new Map(schedule.rows.map((r) => [r.typeId, r.typeName] as const));
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => cmpTexto(a.name, b.name, lang));
  }, [schedule, lang]);

  const visible = useMemo(() => {
    const list = filterRoofRows(schedule.rows, { levelId: levelId || undefined, typeId: typeId || undefined, shape: shape || undefined });
    // A coluna Forma guarda o rótulo PT no engine: ordena pelo nome já traduzido.
    const shapeOf = I18N[lang];
    const sortLabel = sort?.key === 'shapeLabel' ? (r: RoofScheduleRow) => shapeOf[`roof_shape_${r.shape}` as keyof typeof I18N.pt] : undefined;
    return sort ? [...list].sort((a, b) => compare(a, b, sort, lang, sortLabel)) : list;
  }, [schedule, levelId, typeId, shape, sort, lang]);

  const totals = useMemo(() => sumRoofRows(visible), [visible]);

  const toggleSort = (key: keyof RoofScheduleRow): void =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

  const exportCsv = async (): Promise<void> => {
    const base = p.name.trim() || t.scx_csv_default_project;
    // i18n: passar `lang` e o nome da forma quando o engine aceitar (cabeçalho, célula e separador decimal do CSV).
    const status = await saveText(`${base}-${t.scx_csv_file_roof}.csv`, roofScheduleToCsv(visible, totals, units, lang));
    setMsg(status);
    useUi.setState({ status });
  };

  return (
    <Dialog
      title={t.sched_title_roof}
      sub={translate(lang, schedule.rows.length === 1 ? 'scx_sub_roof_one' : 'scx_sub_roof_many', { shown: visible.length, total: schedule.rows.length })}
      onClose={close}
      footer={
        <>
          <span className="wsched-msg" role="status">{resolveText(msg, lang)}</span>
          <button className="btn primary" onClick={() => void exportCsv()} disabled={visible.length === 0} title={t.sched_export_tip}>
            {t.sched_export_csv}
          </button>
          <button className="btn" onClick={close}>{t.sched_close}</button>
        </>
      }
    >
      <div className="wsched-bar">
        <label htmlFor="rsc-level">{t.col_level}</label>
        <select id="rsc-level" className="select" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="">{t.sched_all_levels}</option>
          {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label htmlFor="rsc-type">{t.col_type}</label>
        <select id="rsc-type" className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">{t.sched_all_types}</option>
          {types.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
        </select>
        <label htmlFor="rsc-shape">{t.col_shape}</label>
        <select id="rsc-shape" className="select" value={shape} onChange={(e) => setShape(e.target.value as RoofShape | '')}>
          <option value="">{t.sched_all_shapes}</option>
          {SHAPES.map((s) => <option key={s} value={s}>{shapeName(s)}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="hint">{schedule.rows.length === 0 ? t.sched_empty_roof : t.sched_none_roof}</p>
      ) : (
        <>
          <div className="wsched-scroll">
            <table className="layers wsched">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={c.decimals !== undefined ? 'num' : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                      <button type="button" className="sortbtn" onClick={() => toggleSort(c.key)} title={t.sched_sort_col}>
                        {c.quantity ? scheduleHeader(units, t[c.labelKey], c.quantity) : t[c.labelKey]}
                        {sort?.key === c.key ? <Icon name={sort.dir === 1 ? 'up' : 'down'} size={11} /> : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.roofId}>
                    {COLS.map((c) => (
                      <td key={c.key} className={c.decimals !== undefined ? 'num' : undefined}>
                        {cellValue(r, c, shapeName, units)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="total">
            <span>{totals.count} {totals.count === 1 ? t.sched_noun_roof_one : t.sched_noun_roof}</span>
            <span>{t.sched_total_plan_area} {formatQuantity(units, 'area', totals.planArea, { decimals: 2 })}</span>
            <span>{t.sched_total_face_area} {formatQuantity(units, 'area', totals.faceArea, { decimals: 2 })}</span>
            <span>{t.sched_total_ridge} {formatQuantity(units, 'length', totals.ridgeLength, { decimals: 2 })}</span>
            <span>{t.sched_total_eave} {formatQuantity(units, 'length', totals.eaveLength, { decimals: 2 })}</span>
            <span>{t.sched_total_volume} {formatQuantity(units, 'volume', totals.volume, { decimals: 3 })}</span>
          </div>
        </>
      )}
    </Dialog>
  );
}
