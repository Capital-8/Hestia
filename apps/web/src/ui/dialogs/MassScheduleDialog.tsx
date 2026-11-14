import { useEffect, useState, type ReactElement } from 'react';
import { buildMassSchedule, massScheduleToCsv, servicoMassa, type MassScheduleRow } from '@hestia/engine';
import { formatQuantity, type Quantity } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { dictOf, resolveText, useI18n, type TextLike } from '../../editor/i18n.ts';
import { saveText } from '../../editor/saveText.ts';
import { useUi } from '../../editor/state.ts';
import { useUnits } from '../useUnits.ts';
import { Dialog } from './Dialog.tsx';
import { scheduleCell, scheduleHeader } from './scheduleUnits.ts';

/**
 * Tabela "Massas por pavimento" (plano de massa, ficha U2): uma linha por massa e pavimento, com área e perímetro somados por cópia do arranjo,
 * rodapé com volume, áreas e altura, exportação CSV e seleção da massa ao clicar na linha. Os números vêm do kernel (`buildMassSchedule`); sem
 * kernel a tabela mostra a mensagem, nunca zeros. A linha com aviso 2 (cópias sobrepostas) traz a nota de que a área pode contar em dobro.
 */
export function MassScheduleDialog(): ReactElement {
  const p = useProject();
  const lang = useI18n((s) => s.lang);
  const units = useUnits();
  const t = dictOf(lang);
  // O kernel pode ficar pronto depois de abrir o diálogo: a tabela é refeita quando isso acontece.
  const [, refazer] = useState(0);
  useEffect(() => servicoMassa().aoMudarPronto(() => refazer((n) => n + 1)), []);
  // Sem memo próprio: o serviço já guarda as respostas por projeto, e o rerender por `versao` refaz só o que mudou.
  const sch = buildMassSchedule(p, servicoMassa());
  const [msg, setMsg] = useState<TextLike>('');
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const f = (si: number, q: Quantity, decimals?: number): string => scheduleCell(units, q, si, decimals);

  const exportCsv = async (): Promise<void> => {
    if (!sch) return;
    const base = p.name.trim() || t.scx_csv_default_project;
    const status = await saveText(`${base}-${t.edc_mass_sched_csv_file}.csv`, massScheduleToCsv(sch, units, lang));
    setMsg(status);
    useUi.setState({ status });
  };

  const selecionar = (r: MassScheduleRow): void => useUi.setState({ selection: [r.massaId] });

  return (
    <Dialog
      title={t.edc_mass_sched_title}
      onClose={close}
      footer={
        <>
          <span className="wsched-msg" role="status">{resolveText(msg, lang)}</span>
          <button className="btn primary" onClick={() => void exportCsv()} disabled={!sch || sch.rows.length === 0} title={t.sched_export_tip}>
            {t.sched_export_csv}
          </button>
          <button className="btn" onClick={close}>{t.sched_close}</button>
        </>
      }
    >
      {!sch ? (
        <p className="hint">{t.edc_mass_sched_no_kernel}</p>
      ) : sch.rows.length === 0 ? (
        <p className="hint">{t.edc_mass_sched_empty}</p>
      ) : (
        <>
          <div className="wsched-scroll">
            <table className="layers wsched">
              <thead>
                <tr>
                  <th>{t.edc_mass_sched_col_mass}</th>
                  <th>{t.edc_mass_sched_col_floor}</th>
                  <th className="num">{scheduleHeader(units, t.sched_total_area, 'area')}</th>
                  <th className="num">{scheduleHeader(units, t.sched_total_perimeter, 'length')}</th>
                  <th>{t.edc_mass_sched_col_warning}</th>
                </tr>
              </thead>
              <tbody>
                {sch.rows.map((r) => (
                  <tr key={`${r.massaId}|${r.levelId}`} onClick={() => selecionar(r)} className={r.sobreposta ? 'warn' : undefined}>
                    <td>{r.massaName}</td>
                    <td>{r.levelName}</td>
                    <td className="num">{f(r.area, 'area', 2)}</td>
                    <td className="num">{f(r.perimeter, 'length', 2)}</td>
                    <td>{r.sobreposta ? t.edc_mass_sched_overlap : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>{t.edc_mass_sched_total}</th>
                  <td className="num">{f(sch.totals.area, 'area', 2)}</td>
                  <td className="num">{f(sch.totals.perimeter, 'length', 2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="total">
            <span>{t.sched_total_volume} {formatQuantity(units, 'volume', sch.totals.volume, { decimals: 3 })}</span>
            <span>{t.edc_mass_sched_lateral} {formatQuantity(units, 'area', sch.totals.areaLateral, { decimals: 2 })}</span>
            <span>{t.edc_mass_sched_base} {formatQuantity(units, 'area', sch.totals.areaBase, { decimals: 2 })}</span>
            <span>{t.edc_mass_sched_topo} {formatQuantity(units, 'area', sch.totals.areaTopo, { decimals: 2 })}</span>
            <span>{t.edc_mass_sched_altura} {formatQuantity(units, 'length', sch.totals.altura, { decimals: 3 })}</span>
          </div>
        </>
      )}
    </Dialog>
  );
}
