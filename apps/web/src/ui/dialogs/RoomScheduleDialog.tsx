import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { formatQuantity, type Quantity, type ResolvedUnits } from '@hestia/model';
import { buildRoomSchedule, filterRoomRows, roomScheduleToCsv, sumRoomRows, type RoomScheduleRow } from '@hestia/engine';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { sufixoAtalho } from '../../editor/shortcutConfig.ts';
import { cmpTexto, resolveText, t as translate, useI18n, dictOf, I18N, type Lang, type TextLike } from '../../editor/i18n.ts';
import { saveText } from '../../editor/saveText.ts';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { scheduleCell, scheduleHeader } from './scheduleUnits.ts';
import { useUnits } from '../useUnits.ts';

interface Col {
  key: keyof RoomScheduleRow;
  /** Chave do rótulo em I18N (PT/EN). */
  labelKey: keyof typeof I18N.pt;
  /** Presente nas colunas numéricas: casas decimais e alinhamento à direita. */
  decimals?: number;
  /** Grandeza da coluna: converte o valor SI para a unidade do projeto. */
  quantity?: Quantity;
}

const COLS: Col[] = [
  { key: 'number', labelKey: 'col_number' },
  { key: 'name', labelKey: 'col_name' },
  { key: 'levelName', labelKey: 'col_level' },
  { key: 'area', labelKey: 'col_area', decimals: 2, quantity: 'area' },
  { key: 'perimeter', labelKey: 'col_perimeter', decimals: 2, quantity: 'length' },
  { key: 'ceilingHeight', labelKey: 'col_ceiling_height', decimals: 2, quantity: 'length' },
  { key: 'volume', labelKey: 'col_volume', decimals: 3, quantity: 'volume' },
  { key: 'floorFinish', labelKey: 'col_floor_finish' },
  { key: 'wallFinish', labelKey: 'col_wall_finish' },
  { key: 'ceilingFinish', labelKey: 'col_ceiling_finish' },
];

interface Sort {
  key: keyof RoomScheduleRow;
  dir: 1 | -1;
}

const compare = (a: RoomScheduleRow, b: RoomScheduleRow, s: Sort, lang: Lang): number => {
  const x = a[s.key];
  const y = b[s.key];
  const r = typeof x === 'number' && typeof y === 'number' ? x - y : cmpTexto(String(x), String(y), lang);
  return r * s.dir;
};

const cellValue = (r: RoomScheduleRow, c: Col, units: ResolvedUnits): ReactNode => {
  const v = r[c.key];
  return typeof v === 'number' ? (c.quantity ? scheduleCell(units, c.quantity, v, c.decimals) : String(v)) : v;
};

/** Tabela de ambientes com ordenação, filtro por nível, totais e exportação CSV (padrão da tabela de pisos). */
export function RoomScheduleDialog(): ReactElement {
  const p = useProject();
  const lang = useI18n((s) => s.lang);
  const t = dictOf(lang);
  const units = useUnits();
  const schedule = useMemo(() => buildRoomSchedule(p), [p]);
  const [levelId, setLevelId] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);
  const [msg, setMsg] = useState<TextLike>('');

  const visible = useMemo(() => {
    const list = filterRoomRows(schedule.rows, { levelId: levelId || undefined });
    return sort ? [...list].sort((a, b) => compare(a, b, sort, lang)) : list;
  }, [schedule, levelId, sort, lang]);

  const totals = useMemo(() => sumRoomRows(visible), [visible]);

  const toggleSort = (key: keyof RoomScheduleRow): void =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

  const exportCsv = async (): Promise<void> => {
    const base = p.name.trim() || t.scx_csv_default_project;
    // i18n: passar `lang` quando o engine aceitar (cabeçalho e separador decimal do CSV).
    const status = await saveText(`${base}-${t.scx_csv_file_room}.csv`, roomScheduleToCsv(visible, totals, units, lang));
    setMsg(status);
    useUi.setState({ status });
  };

  return (
    <Dialog
      title={t.sched_title_room}
      sub={translate(lang, schedule.rows.length === 1 ? 'scx_sub_room_one' : 'scx_sub_room_many', { shown: visible.length, total: schedule.rows.length })}
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
      </div>

      {visible.length === 0 ? (
        <p className="hint">{schedule.rows.length === 0 ? translate(lang, 'scx_empty_room', { key: sufixoAtalho('room') }) : t.sched_none_room}</p>
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
                  <tr key={r.roomId}>
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
            <span>{totals.count} {totals.count === 1 ? t.sched_noun_room_one : t.sched_noun_room}</span>
            <span>{t.sched_total_area} {formatQuantity(units, 'area', totals.area, { decimals: 2 })}</span>
            <span>{t.sched_total_perimeter} {formatQuantity(units, 'length', totals.perimeter, { decimals: 2 })}</span>
            <span>{t.sched_total_volume} {formatQuantity(units, 'volume', totals.volume, { decimals: 3 })}</span>
          </div>
        </>
      )}
    </Dialog>
  );
}
