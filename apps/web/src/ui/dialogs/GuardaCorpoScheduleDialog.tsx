import { useMemo, type ReactElement } from 'react';
import { buildGuardaCorpoSchedule } from '@hestia/engine';
import { formatQuantity, unitSymbol, type Quantity } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { useI18n } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { useUnits } from '../useUnits.ts';
import { Dialog } from './Dialog.tsx';

const TXT = {
  pt: { title: 'Tabela de guarda-corpos', cols: ['Tipo', 'Nível', 'Hospedeiro', 'Eixo', 'Desenvolvido', 'Corrimão', 'Trilhos', 'Balaústres', 'Postes', 'Painéis', 'Volume'], total: 'Total', empty: 'Nenhum guarda-corpo no projeto.', wait: 'Calculando no kernel Rust…', close: 'Fechar', host: { escada: 'Escada', rampa: 'Rampa', manual: 'Manual' } },
  en: { title: 'Railing schedule', cols: ['Type', 'Level', 'Host', 'Axis', 'Developed', 'Handrail', 'Rails', 'Balusters', 'Posts', 'Panels', 'Volume'], total: 'Total', empty: 'No railings in the project.', wait: 'Calculating in the Rust kernel…', close: 'Close', host: { escada: 'Stair', rampa: 'Ramp', manual: 'Manual' } },
} as const;

/** Grandeza de cada coluna da tabela (a unidade vem das unidades do projeto). */
const COL_Q: ReadonlyArray<Quantity | null> = [null, null, null, 'length', 'length', 'length', 'length', null, null, 'area', 'volume'];

/** Tabela de guarda-corpos (decisão 0055): linhas e totais vêm de `quant_guarda` (kernel), a mesma fonte do desenho. */
export function GuardaCorpoScheduleDialog(): ReactElement {
  const p = useProject();
  const lang = useI18n((s) => s.lang);
  const units = useUnits();
  const f = (n: number, q: Quantity): string => formatQuantity(units, q, n, { withUnit: false, ...(q === 'volume' ? { decimals: 4 } : {}) });
  const t = lang === 'en' ? TXT.en : TXT.pt;
  const sch = useMemo(() => buildGuardaCorpoSchedule(p), [p]);
  const tot = sch.rows.reduce(
    (a, r) => ({ eixo: a.eixo + r.comprimentoEixo, dev: a.dev + r.comprimentoDesenvolvido, co: a.co + r.metrosCorrimao, tr: a.tr + r.metrosTrilho, ba: a.ba + r.balaustres, po: a.po + r.postes, ar: a.ar + r.areaPaineis, vo: a.vo + r.volume }),
    { eixo: 0, dev: 0, co: 0, tr: 0, ba: 0, po: 0, ar: 0, vo: 0 },
  );
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  return (
    <Dialog title={t.title} onClose={close} footer={<button className="btn" onClick={close}>{t.close}</button>}>
      {!sch.pronto ? (
        <p className="hint">{t.wait}</p>
      ) : sch.rows.length === 0 ? (
        <p className="hint">{t.empty}</p>
      ) : (
        <div className="wsched-scroll">
          <table className="layers wsched">
            <thead>
              <tr>{t.cols.map((c, i) => { const q = COL_Q[i]; return <th key={c} className={i >= 3 ? 'num' : undefined}>{q ? `${c} (${unitSymbol(units, q)})` : c}</th>; })}</tr>
            </thead>
            <tbody>
              {sch.rows.map((r) => (
                <tr key={r.guardaId}>
                  <td>{r.typeName}</td>
                  <td>{r.levelName}</td>
                  <td>{t.host[r.hospedeiro]}</td>
                  <td className="num">{f(r.comprimentoEixo, 'length')}</td>
                  <td className="num">{f(r.comprimentoDesenvolvido, 'length')}</td>
                  <td className="num">{f(r.metrosCorrimao, 'length')}</td>
                  <td className="num">{f(r.metrosTrilho, 'length')}</td>
                  <td className="num">{r.balaustres}</td>
                  <td className="num">{r.postes}</td>
                  <td className="num">{f(r.areaPaineis, 'area')}</td>
                  <td className="num">{f(r.volume, 'volume')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>{t.total}</th>
                <td className="num">{f(tot.eixo, 'length')}</td>
                <td className="num">{f(tot.dev, 'length')}</td>
                <td className="num">{f(tot.co, 'length')}</td>
                <td className="num">{f(tot.tr, 'length')}</td>
                <td className="num">{tot.ba}</td>
                <td className="num">{tot.po}</td>
                <td className="num">{f(tot.ar, 'area')}</td>
                <td className="num">{f(tot.vo, 'volume')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Dialog>
  );
}
