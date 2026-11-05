import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { formatQuantity, type Quantity, type ResolvedUnits } from '@hestia/model';
import { buildStairSchedule, filterStairRows, stairScheduleToCsv, sumStairRows, type StairScheduleRow } from '@hestia/engine';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { cmpTexto, resolveText, t as translate, useI18n, I18N, type Lang, type TextLike } from '../../editor/i18n.ts';
import { saveText } from '../../editor/saveText.ts';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { scheduleCell, scheduleHeader } from './scheduleUnits.ts';
import { useUnits } from '../useUnits.ts';

interface Col {
  key: keyof StairScheduleRow;
  /** Chave do rótulo em I18N (PT/EN). */
  labelKey: keyof typeof I18N.pt;
  /** Presente nas colunas numéricas: casas decimais e alinhamento à direita. */
  decimals?: number;
  /** Grandeza da coluna: converte o valor SI para a unidade do projeto. */
  quantity?: Quantity;
}

const COLS: Col[] = [
  { key: 'mark', labelKey: 'col_mark' },
  { key: 'typeName', labelKey: 'col_type' },
  { key: 'typeCode', labelKey: 'col_code' },
  { key: 'baseLevelName', labelKey: 'col_base_level' },
  { key: 'topLevelName', labelKey: 'col_top_level' },
  { key: 'riserCount', labelKey: 'col_risers', decimals: 0 },
  { key: 'riserHeight', labelKey: 'scx_col_riser_height', decimals: 3, quantity: 'length' },
  { key: 'treadMean', labelKey: 'scx_col_tread', decimals: 3, quantity: 'length' },
  { key: 'width', labelKey: 'col_width', decimals: 2, quantity: 'length' },
  { key: 'planArea', labelKey: 'col_plan_area', decimals: 2, quantity: 'area' },
  { key: 'volume', labelKey: 'col_volume', decimals: 3, quantity: 'volume' },
];

interface Sort {
  key: keyof StairScheduleRow;
  dir: 1 | -1;
}

const compare = (a: StairScheduleRow, b: StairScheduleRow, s: Sort, lang: Lang): number => {
  const x = a[s.key];
  const y = b[s.key];
  const r = typeof x === 'number' && typeof y === 'number' ? x - y : cmpTexto(String(x ?? ''), String(y ?? ''), lang);
  return r * s.dir;
};

const cellValue = (r: StairScheduleRow, c: Col, units: ResolvedUnits): ReactNode => {
  const v = r[c.key];
  if (v === null || v === undefined || v === '') return '—';
  return typeof v === 'number' ? (c.quantity ? scheduleCell(units, c.quantity, v, c.decimals) : String(v)) : v;
};

/** Tabela de escadas com ordenação, filtros por tipo e nível de base, totais e exportação CSV (padrão da tabela de telhados). */
export function StairScheduleDialog(): ReactElement {
  const p = useProject();
  const lang = useI18n((s) => s.lang);
  const t = I18N[lang];
  const units = useUnits();
  const schedule = useMemo(() => buildStairSchedule(p), [p]);
  const [levelId, setLevelId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);
  const [msg, setMsg] = useState<TextLike>('');

  const types = useMemo(() => {
    const byId = new Map(schedule.rows.map((r) => [r.typeId, r.typeName] as const));
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => cmpTexto(a.name, b.name, lang));
  }, [schedule, lang]);

  const visible = useMemo(() => {
    const list = filterStairRows(schedule.rows, { levelId: levelId || undefined, typeId: typeId || undefined });
    return sort ? [...list].sort((a, b) => compare(a, b, sort, lang)) : list;
  }, [schedule, levelId, typeId, sort, lang]);

  const totals = useMemo(() => sumStairRows(visible), [visible]);

  const toggleSort = (key: keyof StairScheduleRow): void =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

  const exportCsv = async (): Promise<void> => {
    const base = p.name.trim() || t.scx_csv_default_project;
    // i18n: passar `lang` quando o engine aceitar (cabeçalho e separador decimal do CSV).
    const status = await saveText(`${base}-${t.scx_csv_file_stair}.csv`, stairScheduleToCsv(visible, totals, units, lang));
    setMsg(status);
    useUi.setState({ status });
  };

  return (
    <Dialog
      title={t.sched_title_stair}
      sub={translate(lang, schedule.rows.length === 1 ? 'scx_sub_stair_one' : 'scx_sub_stair_many', { shown: visible.length, total: schedule.rows.length })}
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
        <label htmlFor="ssc-level">{t.col_level}</label>
        <select id="ssc-level" className="select" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="">{t.sched_all_levels}</option>
          {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label htmlFor="ssc-type">{t.col_type}</label>
        <select id="ssc-type" className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">{t.sched_all_types}</option>
          {types.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="hint">{schedule.rows.length === 0 ? t.sched_empty_stair : t.sched_none_stair}</p>
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
                  <tr key={r.stairId}>
                    {COLS.map((c) => (
                      <td key={c.key} className={c.decimals !== undefined ? 'num' : undefined}>
                        {cellValue(r, c, units)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="total">
            <span>{totals.count} {totals.count === 1 ? t.sched_noun_stair_one : t.sched_noun_stair}</span>
            <span>{t.sched_total_plan_area} {formatQuantity(units, 'area', totals.planArea, { decimals: 2 })}</span>
            <span>{t.sched_total_volume} {formatQuantity(units, 'volume', totals.volume, { decimals: 3 })}</span>
          </div>
        </>
      )}
    </Dialog>
  );
}
