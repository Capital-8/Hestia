import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { formatQuantity, type Quantity, type ResolvedUnits } from '@hestia/model';
import { buildCurtainSchedule, buildWallSchedule, scheduleToCsv, sumWallRows, type CurtainScheduleRow, type WallScheduleRow } from '@hestia/engine';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { cmpTexto, resolveText, t as translate, useI18n, dictOf, I18N, type Lang, type TextLike } from '../../editor/i18n.ts';
import { saveText } from '../../editor/saveText.ts';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { scheduleCell, scheduleHeader } from './scheduleUnits.ts';
import { useUnits } from '../useUnits.ts';

interface Col {
  key: keyof WallScheduleRow;
  /** Chave do rótulo em I18N (PT/EN). */
  labelKey: keyof typeof I18N.pt;
  /** Presente nas colunas numéricas: casas decimais e alinhamento à direita. */
  decimals?: number;
  /** Grandeza da coluna: converte o valor SI para a unidade do projeto. */
  quantity?: Quantity;
  sortable?: boolean;
}

const COLS: Col[] = [
  { key: 'mark', labelKey: 'col_mark' },
  { key: 'typeName', labelKey: 'col_type' },
  { key: 'levelName', labelKey: 'col_level' },
  { key: 'thickness', labelKey: 'col_thickness', decimals: 3, quantity: 'smallLength' },
  { key: 'length', labelKey: 'col_length', decimals: 2, quantity: 'length' },
  { key: 'height', labelKey: 'col_height', decimals: 2, quantity: 'length' },
  { key: 'grossFaceArea', labelKey: 'col_gross_area', decimals: 2, quantity: 'area' },
  { key: 'openingsArea', labelKey: 'col_openings_area', decimals: 2, quantity: 'area' },
  { key: 'netFaceArea', labelKey: 'col_net_area', decimals: 2, quantity: 'area' },
  { key: 'volume', labelKey: 'col_volume', decimals: 3, quantity: 'volume' },
  { key: 'layersSummary', labelKey: 'scx_col_layers', sortable: false },
];

interface Sort {
  key: keyof WallScheduleRow;
  dir: 1 | -1;
}

const compare = (a: WallScheduleRow, b: WallScheduleRow, s: Sort, lang: Lang): number => {
  const x = a[s.key];
  const y = b[s.key];
  const r = typeof x === 'number' && typeof y === 'number' ? x - y : cmpTexto(String(x), String(y), lang);
  return r * s.dir;
};

const cellValue = (r: WallScheduleRow, c: Col, units: ResolvedUnits): ReactNode => {
  const v = r[c.key];
  return typeof v === 'number' ? (c.quantity ? scheduleCell(units, c.quantity, v, c.decimals) : String(v)) : v;
};

/** Tabela de paredes com ordenação, filtros por nível e tipo, totais e exportação CSV. */
export function WallScheduleDialog(): ReactElement {
  const p = useProject();
  const lang = useI18n((s) => s.lang);
  const t = dictOf(lang);
  const units = useUnits();
  const schedule = useMemo(() => buildWallSchedule(p), [p]);
  const curtain = useMemo(() => buildCurtainSchedule(p), [p]);
  const [levelId, setLevelId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);
  const [msg, setMsg] = useState<TextLike>('');

  const types = useMemo(() => {
    const byId = new Map(schedule.rows.map((r) => [r.typeId, r.typeName] as const));
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => cmpTexto(a.name, b.name, lang));
  }, [schedule, lang]);

  const visible = useMemo(() => {
    const list = schedule.rows.filter((r) => (!levelId || r.levelId === levelId) && (!typeId || r.typeId === typeId));
    return sort ? list.sort((a, b) => compare(a, b, sort, lang)) : list;
  }, [schedule, levelId, typeId, sort, lang]);

  const totals = useMemo(() => sumWallRows(visible), [visible]);

  const toggleSort = (key: keyof WallScheduleRow): void =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

  const exportCsv = async (): Promise<void> => {
    const base = p.name.trim() || t.scx_csv_default_project;
    // i18n: passar `lang` quando o engine aceitar (cabeçalho e separador decimal do CSV).
    const status = await saveText(`${base}-${t.scx_csv_file_wall}.csv`, scheduleToCsv(visible, totals, units, lang));
    setMsg(status);
    useUi.setState({ status });
  };

  return (
    <Dialog
      title={t.sched_title_wall}
      sub={translate(lang, schedule.rows.length === 1 ? 'scx_sub_wall_one' : 'scx_sub_wall_many', { shown: visible.length, total: schedule.rows.length })}
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
        <label htmlFor="wsc-level">{t.col_level}</label>
        <select id="wsc-level" className="select" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="">{t.sched_all_levels}</option>
          {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label htmlFor="wsc-type">{t.col_type}</label>
        <select id="wsc-type" className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">{t.sched_all_types}</option>
          {types.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="hint">{schedule.rows.length === 0 ? t.sched_empty_wall : t.sched_none_wall}</p>
      ) : (
        <>
          <div className="wsched-scroll">
            <table className="layers wsched">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={c.decimals !== undefined ? 'num' : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                      {c.sortable === false ? (
                        c.quantity ? scheduleHeader(units, t[c.labelKey], c.quantity) : t[c.labelKey]
                      ) : (
                        <button type="button" className="sortbtn" onClick={() => toggleSort(c.key)} title={t.sched_sort_col}>
                          {c.quantity ? scheduleHeader(units, t[c.labelKey], c.quantity) : t[c.labelKey]}
                          {sort?.key === c.key ? <Icon name={sort.dir === 1 ? 'up' : 'down'} size={11} /> : null}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.wallId}>
                    {COLS.map((c) => (
                      <td key={c.key} className={c.decimals !== undefined ? 'num' : c.sortable === false ? 'layers-cell' : undefined} title={c.sortable === false ? r.layersSummary : undefined}>
                        {cellValue(r, c, units)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="total">
            <span>{totals.count} {totals.count === 1 ? t.sched_noun_wall_one : t.sched_noun_wall}</span>
            <span>{t.sched_total_length} {formatQuantity(units, 'length', totals.length, { decimals: 2 })}</span>
            <span>{t.sched_total_net_area} {formatQuantity(units, 'area', totals.netFaceArea, { decimals: 2 })}</span>
            <span>{t.sched_total_volume} {formatQuantity(units, 'volume', totals.volume, { decimals: 3 })}</span>
            {Math.abs(totals.grossVolume - totals.volume) > 1e-9 && <span>{t.sched_total_gross_volume} {formatQuantity(units, 'volume', totals.grossVolume, { decimals: 3 })}</span>}
          </div>
        </>
      )}

      {curtain.rows.length > 0 && (
        <CurtainSection rows={curtain.rows} pronto={curtain.pronto} totals={curtain.totals} lang={lang} units={units} />
      )}

      <h3 className="wsched-h">{t.sched_material_volume}</h3>
      <table className="layers">
        <thead>
          <tr>
            <th>{t.sched_material}</th>
            <th className="num">{t.col_volume}</th>
          </tr>
        </thead>
        <tbody>
          {schedule.volumeByMaterial.map((m) => (
            <tr key={m.materialId}>
              <td>{m.name}</td>
              <td className="num">{formatQuantity(units, 'volume', m.volume, { decimals: 3 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

type CurtainTotals = ReturnType<typeof buildCurtainSchedule>['totals'];

/** Seção das paredes cortina: quantidades do kernel. Sem kernel, a linha aparece com o aviso e os campos vazios, nunca zero. */
function CurtainSection({ rows, pronto, totals, lang, units }: { rows: CurtainScheduleRow[]; pronto: boolean; totals: CurtainTotals; lang: Lang; units: ResolvedUnits }): ReactElement {
  const tr = (k: keyof typeof I18N.pt): string => translate(lang, k);
  const q = (v: number | null, quantidade: Quantity, casas: number): string => (v === null ? '—' : formatQuantity(units, quantidade, v, { decimals: casas }));
  const n = (v: number | null): string => (v === null ? '—' : String(v));
  const dinheiro = (v: number | null): string => (v === null ? '—' : v.toFixed(2));
  return (
    <>
      <h3 className="wsched-h">{tr('pct_sch_title')}</h3>
      {!pronto && <p className="hint" role="status">{tr('pct_sch_kernel_off')}</p>}
      <div className="wsched-scroll">
        <table className="layers wsched">
          <thead>
            <tr>
              <th>{translate(lang, 'col_mark')}</th>
              <th>{translate(lang, 'col_type')}</th>
              <th>{translate(lang, 'col_level')}</th>
              <th className="num">{tr('pct_sch_length')}</th>
              <th className="num">{tr('pct_sch_height')}</th>
              <th className="num">{tr('pct_sch_area')}</th>
              <th className="num">{tr('pct_sch_glass_gross')}</th>
              <th className="num">{tr('pct_sch_glass_net')}</th>
              <th className="num">{tr('pct_sch_solid')}</th>
              <th className="num">{tr('pct_sch_mullion_m')}</th>
              <th className="num">{tr('pct_sch_mullion_n')}</th>
              <th className="num">{tr('pct_sch_panel_n')}</th>
              <th className="num">{tr('pct_sch_cost')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.wallId}>
                <td>{r.mark}</td>
                <td>{r.typeName}</td>
                <td>{r.levelName}</td>
                <td className="num">{q(r.comprimento, 'length', 2)}</td>
                <td className="num">{q(r.altura, 'length', 2)}</td>
                <td className="num">{q(r.areaBruta, 'area', 2)}</td>
                <td className="num">{q(r.vidroBruta, 'area', 2)}</td>
                <td className="num">{q(r.vidroVisivel, 'area', 2)}</td>
                <td className="num">{q(r.areaSolida, 'area', 2)}</td>
                <td className="num">{q(r.metrosMontante, 'length', 2)}</td>
                <td className="num">{n(r.quantidadeMontantes)}</td>
                <td className="num">{n(r.quantidadePaineis)}</td>
                <td className="num">{dinheiro(r.custo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pronto && (
        <div className="total">
          <span>{totals.count}</span>
          <span>{formatQuantity(units, 'length', totals.comprimento, { decimals: 2 })}</span>
          <span>{formatQuantity(units, 'area', totals.vidroBruta, { decimals: 2 })}</span>
          <span>{formatQuantity(units, 'length', totals.metrosMontante, { decimals: 2 })}</span>
          <span>{totals.custo.toFixed(2)}</span>
        </div>
      )}
    </>
  );
}
