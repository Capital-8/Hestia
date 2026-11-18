import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { formatQuantity, type Quantity, type ResolvedUnits } from '@hestia/model';
import { OPENING_EXEC_KEYS, OPENING_EXEC_TEXT_KEYS, buildOpeningSchedule, filterOpeningRows, openingExecHeader, openingExecValue, openingRowLabel, openingScheduleToCsv, sumOpeningRows, type OpeningExecKey, type OpeningExtraKey, type OpeningScheduleRow } from '@hestia/engine';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { cmpTexto, resolveText, t as translate, useI18n, dictOf, I18N, type Lang, type TextLike } from '../../editor/i18n.ts';
import { saveText } from '../../editor/saveText.ts';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { scheduleCell, scheduleHeader, scheduleNumber } from './scheduleUnits.ts';
import { useUnits } from '../useUnits.ts';

interface Col {
  key: keyof OpeningScheduleRow;
  /** Chave do rótulo em I18N (PT/EN). */
  labelKey: keyof typeof I18N.pt;
  /** Presente nas colunas numéricas: casas decimais e alinhamento à direita. */
  decimals?: number;
  /** Grandeza da coluna: converte o valor SI para a unidade do projeto. */
  quantity?: Quantity;
}

const COLS: Col[] = [
  { key: 'code', labelKey: 'col_code' },
  { key: 'typeName', labelKey: 'col_type' },
  { key: 'familyName', labelKey: 'col_family' },
  { key: 'kind', labelKey: 'col_category' },
  { key: 'width', labelKey: 'col_width', decimals: 2, quantity: 'length' },
  { key: 'height', labelKey: 'col_height', decimals: 2, quantity: 'length' },
  { key: 'roughWidth', labelKey: 'col_rough_width', decimals: 2, quantity: 'length' },
  { key: 'roughHeight', labelKey: 'col_rough_height', decimals: 2, quantity: 'length' },
  { key: 'sill', labelKey: 'col_sill', decimals: 2, quantity: 'length' },
  { key: 'leaves', labelKey: 'col_leaves', decimals: 0 },
  { key: 'lintelLength', labelKey: 'col_lintel', decimals: 2, quantity: 'length' },
  { key: 'sillBeamLength', labelKey: 'col_sill_beam', decimals: 2, quantity: 'length' },
  { key: 'count', labelKey: 'col_count', decimals: 0 },
  { key: 'unitArea', labelKey: 'col_unit_area', decimals: 2, quantity: 'area' },
  { key: 'totalArea', labelKey: 'col_total_area', decimals: 2, quantity: 'area' },
  { key: 'leafWidth', labelKey: 'col_leaf_width', decimals: 2, quantity: 'length' },
  { key: 'leafHeight', labelKey: 'col_leaf_height', decimals: 2, quantity: 'length' },
  { key: 'frameMaterial', labelKey: 'col_frame_material' },
  { key: 'sense', labelKey: 'col_sense' },
  { key: 'leafMaterial', labelKey: 'col_leaf_material' },
  { key: 'hardware', labelKey: 'col_hardware' },
];

/** Colunas opcionais, desligadas por padrão: dados do tipo que o quadro não mostrava. Saem depois das fixas, nesta ordem. */
const OPTIONAL_COLS: Array<Col & { key: OpeningExtraKey }> = [
  { key: 'fireRating', labelKey: 'dlo_f_fire_rating' },
  { key: 'acousticRw', labelKey: 'col_rw', decimals: 0 },
  { key: 'uValue', labelKey: 'col_u_value', decimals: 2 },
  { key: 'description', labelKey: 'dlo_f_description' },
  { key: 'manufacturer', labelKey: 'dlo_f_manufacturer' },
  { key: 'unitCost', labelKey: 'col_unit_cost', decimals: 2, quantity: 'currency' },
  { key: 'totalCost', labelKey: 'col_total_cost', decimals: 2, quantity: 'currency' },
  { key: 'solarFactor', labelKey: 'dlo_f_solar_factor', decimals: 2 },
];

/** Colunas da tabela: as fixas e, depois, as opcionais ligadas. */
export const openingCols = (extras: ReadonlySet<OpeningExtraKey>): Col[] => [...COLS, ...OPTIONAL_COLS.filter((c) => extras.has(c.key))];

/** Coluna do quadro executivo: o texto vem do engine (mesma regra do CSV); não ordena. */
export interface ExecCol {
  execKey: OpeningExecKey;
  label: string;
  numeric: boolean;
}
export type TableCol = Col | ExecCol;
const isExec = (c: TableCol): c is ExecCol => 'execKey' in c;

/** Colunas da tabela com o quadro executivo ligado: as do quadro padrão e, depois, as executivas. */
export const openingTableCols = (extras: ReadonlySet<OpeningExtraKey>, executivo: boolean, units: ResolvedUnits, lang: Lang): TableCol[] => [
  ...openingCols(extras),
  ...(executivo ? OPENING_EXEC_KEYS.map((k): ExecCol => ({ execKey: k, label: openingExecHeader(k, units, lang), numeric: k !== 'mirrored' && !OPENING_EXEC_TEXT_KEYS.has(k) })) : []),
];

interface Sort {
  key: keyof OpeningScheduleRow;
  dir: 1 | -1;
}

const compare = (a: OpeningScheduleRow, b: OpeningScheduleRow, s: Sort, lang: Lang): number => {
  const x = a[s.key];
  const y = b[s.key];
  if (x === null || y === null) return (x === null ? 1 : 0) - (y === null ? 1 : 0); // sem valor vai para o fim, em qualquer sentido
  const r = typeof x === 'number' && typeof y === 'number' ? x - y : cmpTexto(String(x ?? ''), String(y ?? ''), lang);
  return r * s.dir;
};

/** Textos das células de categoria e de valores vazios; PT/EN passados pelo diálogo. */
const cellValue = (r: OpeningScheduleRow, c: Col, kindText: (k: string) => string, units: ResolvedUnits): ReactNode => {
  if (c.key === 'kind') return kindText(r.kind);
  if (c.key === 'typeName') return openingRowLabel(r); // com o desvio ("altura própria 1,84 m") quando a linha tem
  const v = r[c.key];
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return '—';
  if (typeof v !== 'number') return v;
  if (c.quantity) return scheduleCell(units, c.quantity, v, c.decimals);
  return c.decimals !== undefined ? scheduleNumber(units, v, c.decimals) : String(v);
};

type Dict = ReturnType<typeof dictOf>;

/** Cabeçalho e linhas da tabela de portas e janelas (ordenação pelo cabeçalho, sem estado próprio). */
export function OpeningScheduleTable(props: {
  rows: OpeningScheduleRow[];
  cols: TableCol[];
  units: ResolvedUnits;
  /** Idioma das colunas executivas (pt por padrão). */
  lang?: Lang;
  sort: Sort | null;
  onSort: (key: keyof OpeningScheduleRow) => void;
  t: Dict;
}): ReactElement {
  const { rows, cols, units, lang = 'pt', sort, onSort, t } = props;
  return (
    <table className="layers wsched">
      <thead>
        <tr>
          {cols.map((c) =>
            isExec(c) ? (
              <th key={c.execKey} className={c.numeric ? 'num' : undefined}>{c.label}</th>
            ) : (
              <th key={c.key} className={c.decimals !== undefined ? 'num' : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                <button type="button" className="sortbtn" onClick={() => onSort(c.key)} title={t.sched_sort_col}>
                  {c.quantity ? scheduleHeader(units, t[c.labelKey], c.quantity) : t[c.labelKey]}
                  {sort?.key === c.key ? <Icon name={sort.dir === 1 ? 'up' : 'down'} size={11} /> : null}
                </button>
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.typeId}|${r.height}|${r.sill}|${r.exec?.mirrored ? 'espelhada' : ''}`}>
            {cols.map((c) =>
              isExec(c) ? (
                <td key={c.execKey} className={c.numeric ? 'num' : undefined}>{openingExecValue(r, c.execKey, units, lang) || '—'}</td>
              ) : (
                <td key={c.key} className={c.decimals !== undefined ? 'num' : undefined}>
                  {cellValue(r, c, (k) => (k === 'door' ? t.sched_kind_door : t.sched_kind_window), units)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tabela de portas e janelas com ordenação, filtro por categoria, colunas opcionais, totais e exportação CSV (padrão da tabela de escadas). */
export function OpeningScheduleDialog(): ReactElement {
  const p = useProject();
  const lang = useI18n((s) => s.lang);
  const t = dictOf(lang);
  const units = useUnits();
  const [executivo, setExecutivo] = useState(false);
  const schedule = useMemo(() => buildOpeningSchedule(p, lang, { executivo }), [p, lang, executivo]);
  const [kind, setKind] = useState<'' | 'door' | 'window'>('');
  const [sort, setSort] = useState<Sort | null>(null);
  const [extras, setExtras] = useState<ReadonlySet<OpeningExtraKey>>(() => new Set());
  const [msg, setMsg] = useState<TextLike>('');

  const cols = useMemo(() => openingTableCols(extras, executivo, units, lang), [extras, executivo, units, lang]);
  const extraKeys = useMemo(() => OPTIONAL_COLS.map((c) => c.key).filter((k) => extras.has(k)), [extras]);

  const visible = useMemo(() => {
    const list = filterOpeningRows(schedule.rows, { kind: kind || undefined });
    return sort ? [...list].sort((a, b) => compare(a, b, sort, lang)) : list;
  }, [schedule, kind, sort, lang]);

  const totals = useMemo(() => sumOpeningRows(visible), [visible]);

  const toggleSort = (key: keyof OpeningScheduleRow): void =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const toggleExtra = (key: OpeningExtraKey): void =>
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

  const exportCsv = async (): Promise<void> => {
    const base = p.name.trim() || t.scx_csv_default_project;
    // i18n: passar `lang` e os nomes de categoria quando o engine aceitar (cabeçalho, células e separador decimal do CSV).
    const status = await saveText(`${base}-${t.scx_csv_file_opening}.csv`, openingScheduleToCsv(visible, totals, units, lang, extraKeys, executivo));
    setMsg(status);
    useUi.setState({ status });
  };

  return (
    <Dialog
      title={t.sched_title_opening}
      sub={translate(lang, schedule.rows.length === 1 ? 'scx_sub_opening_one' : 'scx_sub_opening_many', { shown: visible.length, total: schedule.rows.length })}
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
        <label htmlFor="osc-kind">{t.col_category}</label>
        <select id="osc-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as '' | 'door' | 'window')}>
          <option value="">{t.sched_cat_both}</option>
          <option value="door">{t.sched_cat_door}</option>
          <option value="window">{t.sched_cat_window}</option>
        </select>
        <button type="button" className="btn" aria-pressed={executivo} onClick={() => setExecutivo((v) => !v)}>
          {t.sched_exec_toggle}
        </button>
      </div>
      <fieldset className="wsched-opt">
        <legend>{t.sched_optional_cols}</legend>
        {OPTIONAL_COLS.map((c) => (
          <label key={c.key}>
            <input type="checkbox" checked={extras.has(c.key)} onChange={() => toggleExtra(c.key)} />
            {t[c.labelKey]}
          </label>
        ))}
      </fieldset>

      {visible.length === 0 ? (
        <p className="hint">{schedule.rows.length === 0 ? t.sched_empty_opening : t.sched_none_opening}</p>
      ) : (
        <>
          <div className="wsched-scroll">
            <OpeningScheduleTable rows={visible} cols={cols} units={units} lang={lang} sort={sort} onSort={toggleSort} t={t} />
          </div>
          <div className="total">
            <span>{totals.count} {t[totals.count === 1 ? 'scx_total_opening_one' : 'scx_total_opening_many']}</span>
            <span>{t.sched_total_doors} {totals.doorCount}</span>
            <span>{t.sched_total_windows} {totals.windowCount}</span>
            <span>{t.sched_total_total_area} {formatQuantity(units, 'area', totals.totalArea, { decimals: 2 })}</span>
            {extras.has('totalCost') ? <span>{t.sched_total_cost} {formatQuantity(units, 'currency', totals.totalCost, { decimals: 2 })}</span> : null}
          </div>
        </>
      )}
    </Dialog>
  );
}
