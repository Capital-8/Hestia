import { useMemo, type ReactElement } from 'react';
import { formatScheduleValue, projectUnitSymbol, scheduleColumnQuantities, type ResolvedUnits, type ScheduleCell, type ScheduleQuantity } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { entregarArquivo } from '../editor/entregarArquivo.ts';
import { fmtNum, useT, type Lang } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { buildPluginSchedule, scheduleCsvFile } from '../plugins/pluginSchedules.ts';
import { pluginRegistry, usePluginRegistryVersion } from '../plugins/registry.ts';
import { Dialog } from './dialogs/Dialog.tsx';
import { useUnits } from './useUnits.ts';
import { txt } from './ribbon/model.ts';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

/**
 * Célula da tabela. Coluna de comprimento, área ou volume sai nas unidades e casas decimais do projeto; outro número
 * sai com até 3 casas; texto e booleano saem como estão.
 */
function celula(c: ScheduleCell, q: ScheduleQuantity | undefined, u: ResolvedUnits, lang: Lang): string {
  if (c === null) return '';
  if (typeof c === 'number') return q ? formatScheduleValue(u, q, c, lang) : fmtNum(c, Number.isInteger(c) ? 0 : 3, lang);
  return String(c);
}

/**
 * Quantitativo de suplemento (`DialogKind` 'pluginSchedule'; `dialogArg` = `<pluginId>:<id>`). Tabela com colunas,
 * filtro, agrupamento e totais declarados no manifesto; exporta CSV. Texto vindo do suplemento é desenhado como texto
 * simples (o React escapa). Recalcula quando o projeto muda; quantitativo de suplemento desativado fecha com um aviso.
 */
export function PluginSchedule(): ReactElement | null {
  const { t, lang } = useT();
  const arg = useUi((s) => s.dialogArg);
  const version = usePluginRegistryVersion();
  const project = useProject();
  const units = useUnits();
  const reg = useMemo(() => (arg ? pluginRegistry.schedule(arg) : undefined), [arg, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const built = useMemo(() => (reg ? buildPluginSchedule(project, reg, lang) : null), [reg, project, lang]);
  if (!arg) return null;
  if (!reg || !built) {
    return (
      <Dialog title={t('sup_title')} size="narrow" onClose={fechar} footer={<button className="btn primary" onClick={fechar}>{t('dlm_btn_close')}</button>}>
        <p>{t('sup_e_missing')}</p>
      </Dialog>
    );
  }
  const { table } = built;
  const quantities = scheduleColumnQuantities(table);
  const exportar = (): void => { void entregarArquivo(scheduleCsvFile(reg, table, lang, t('sup_e_total'), units)); };
  return (
    <Dialog
      title={txt(reg.title, lang)}
      sub={reg.pluginName}
      size="wide"
      onClose={fechar}
      footer={(
        <>
          <button className="btn" onClick={exportar}>{t('sup_e_csv')}</button>
          <button className="btn primary" onClick={fechar}>{t('dlm_btn_close')}</button>
        </>
      )}
    >
      {table.rows.length === 0 ? <p>{t('sup_e_empty')}</p> : (
        <table className="layers wsched">
          <thead>
            <tr>{table.columns.map((c, j) => { const q = quantities[j]; const unit = q ? projectUnitSymbol(units, q) : c.unit; return <th key={c.key} scope="col">{unit ? `${c.title} (${unit})` : c.title}</th>; })}</tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => <tr key={i}>{r.cells.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : undefined}>{celula(c, quantities[j], units, lang)}</td>)}</tr>)}
          </tbody>
          {table.totals && (
            <tfoot>
              <tr>{table.totals.map((c, j) => <th key={j} scope="row" className={typeof c === 'number' ? 'num' : undefined}>{j === 0 && c === null ? t('sup_e_total') : celula(c, quantities[j], units, lang)}</th>)}</tr>
            </tfoot>
          )}
        </table>
      )}
      {table.errors > 0 && <p role="status">{t('sup_e_errors', { n: table.errors })}</p>}
      {table.truncated && <p role="status">{t('sup_e_truncated', { n: table.rows.length })}</p>}
    </Dialog>
  );
}
