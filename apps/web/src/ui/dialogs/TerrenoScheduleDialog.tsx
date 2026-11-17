import { useMemo, useState, type ReactElement } from 'react';
import { buildTerrenoSchedule, terrenoScheduleToCsv, type RotulosCsvTerreno, type TerrenoSchedule, type TerrenoScheduleRow } from '@hestia/engine';
import { formatQuantity, unitSymbol, type PapelRegiaoTerreno, type Project, type Quantity, type ResolvedUnits } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { dictOf, t as translate, useI18n, type Lang } from '../../editor/i18n.ts';
import { saveText } from '../../editor/saveText.ts';
import { useUnits } from '../useUnits.ts';
import { Dialog } from './Dialog.tsx';
import { fecharTerrenoSchedule, useTerrenoScheduleAberta } from './terrenoScheduleAberta.ts';

/**
 * Tabela "Terreno: corte e aterro" (ficha U2, molde: SlabScheduleDialog e GuardaCorpoScheduleDialog): uma linha por região, o total de cada terreno e o
 * total do projeto no rodapé, com exportação CSV. Todos os números vêm do kernel (`buildTerrenoSchedule`); sem kernel só aparece a mensagem do aviso
 * `terreno-sem-kernel`. Áreas e volumes pelas unidades do projeto (`formatQuantity`).
 */
export function TerrenoScheduleDialog(): ReactElement | null {
  return useTerrenoScheduleAberta() ? <TerrenoScheduleCorpo /> : null;
}

/** Textos do CSV no idioma ativo (os mesmos da tabela na tela). */
export function rotulosCsvTerreno(lang: Lang): RotulosCsvTerreno {
  const t = (k: Parameters<typeof translate>[1]): string => translate(lang, k);
  return {
    terreno: t('ui_tn_tab_col_terreno'),
    regiao: t('ui_tn_tab_col_regiao'),
    papel: t('ui_tn_tab_col_papel'),
    areaPlanta: t('ui_tn_tab_col_area_planta'),
    areaSuperficie: t('ui_tn_tab_col_area_superficie'),
    volumeCorte: t('ui_tn_tab_col_corte'),
    volumeAterro: t('ui_tn_tab_col_aterro'),
    saldo: t('ui_tn_tab_col_saldo'),
    papeis: { subdivisao: t('ui_tn_tab_papel_subdivisao'), plataforma: t('ui_tn_tab_papel_plataforma'), nivelada: t('ui_tn_tab_papel_nivelada') },
    totalTerreno: t('ui_tn_tab_total_terreno'),
    totalProjeto: t('ui_tn_tab_total_projeto'),
  };
}

/** CSV da tabela do projeto, no idioma e nas unidades dadas. */
export function csvDoTerreno(s: TerrenoSchedule, units: ResolvedUnits, lang: Lang): string {
  return terrenoScheduleToCsv(s, units, rotulosCsvTerreno(lang), lang);
}

const COLUNAS: ReadonlyArray<{ chave: 'areaPlanta' | 'areaSuperficie' | 'volumeCorte' | 'volumeAterro' | 'saldo'; rotulo: Parameters<typeof translate>[1]; q: Quantity }> = [
  { chave: 'areaPlanta', rotulo: 'ui_tn_tab_col_area_planta', q: 'area' },
  { chave: 'areaSuperficie', rotulo: 'ui_tn_tab_col_area_superficie', q: 'area' },
  { chave: 'volumeCorte', rotulo: 'ui_tn_tab_col_corte', q: 'volume' },
  { chave: 'volumeAterro', rotulo: 'ui_tn_tab_col_aterro', q: 'volume' },
  { chave: 'saldo', rotulo: 'ui_tn_tab_col_saldo', q: 'volume' },
];

const celula = (units: ResolvedUnits, q: Quantity, v: number): string => formatQuantity(units, q, v, { withUnit: false, decimals: q === 'volume' ? 3 : 2 });

const CHAVE_PAPEL: Record<PapelRegiaoTerreno, Parameters<typeof translate>[1]> = {
  subdivisao: 'ui_tn_tab_papel_subdivisao',
  plataforma: 'ui_tn_tab_papel_plataforma',
  nivelada: 'ui_tn_tab_papel_nivelada',
};

function Linha({ r, units, lang }: { r: TerrenoScheduleRow; units: ResolvedUnits; lang: Lang }): ReactElement {
  const total = r.tipo === 'terreno';
  return (
    <tr className={total ? 'total-row' : undefined}>
      <td>{r.terrenoNome}</td>
      <td>{total ? translate(lang, 'ui_tn_tab_total_terreno') : r.regiaoNome}</td>
      <td>{r.papel ? translate(lang, CHAVE_PAPEL[r.papel]) : ''}</td>
      {COLUNAS.map((c) => (
        <td key={c.chave} className="num">{celula(units, c.q, r[c.chave])}</td>
      ))}
    </tr>
  );
}

function TerrenoScheduleCorpo(): ReactElement {
  const p: Project = useProject();
  const lang = useI18n((s) => s.lang);
  const units = useUnits();
  const t = dictOf(lang);
  const schedule = useMemo(() => buildTerrenoSchedule(p, lang), [p, lang]);
  const [msg, setMsg] = useState('');

  const exportar = async (): Promise<void> => {
    const base = p.name.trim() || t.scx_csv_default_project;
    const status = await saveText(`${base}-${t.ui_tn_tab_arquivo}.csv`, csvDoTerreno(schedule, units, lang));
    setMsg(status);
    useUi.setState({ status });
  };

  const tot = schedule.totais;
  return (
    <Dialog
      title={t.ui_tn_tab_titulo}
      sub={t.ui_tn_tab_sub}
      onClose={fecharTerrenoSchedule}
      footer={
        <>
          <span className="wsched-msg" role="status">{msg}</span>
          <button className="btn primary" onClick={() => void exportar()} disabled={schedule.rows.length === 0} title={t.sched_export_tip}>
            {t.sched_export_csv}
          </button>
          <button className="btn" onClick={fecharTerrenoSchedule}>{t.sched_close}</button>
        </>
      }
    >
      {!schedule.pronto ? (
        <p className="hint" role="alert">{schedule.mensagem}</p>
      ) : schedule.rows.length === 0 ? (
        <p className="hint">{t.ui_tn_tab_vazio}</p>
      ) : (
        <div className="wsched-scroll">
          <table className="layers wsched">
            <thead>
              <tr>
                <th>{t.ui_tn_tab_col_terreno}</th>
                <th>{t.ui_tn_tab_col_regiao}</th>
                <th>{t.ui_tn_tab_col_papel}</th>
                {COLUNAS.map((c) => (
                  <th key={c.chave} className="num" title={c.chave === 'saldo' ? t.ui_tn_tab_saldo_tip : undefined}>{`${t[c.rotulo]} (${unitSymbol(units, c.q)})`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.rows.map((r) => (
                <Linha key={`${r.terrenoId}|${r.regiaoId ?? ''}`} r={r} units={units} lang={lang} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>{t.ui_tn_tab_total_projeto}</th>
                {COLUNAS.map((c) => (
                  <td key={c.chave} className="num">{celula(units, c.q, tot[c.chave])}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Dialog>
  );
}
