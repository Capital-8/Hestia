import { useMemo, useState, type ReactElement } from 'react';
import { buildLoteSchedule, loteScheduleToCsv, LIMITE_AUSENTE, type IndiceLote, type LoteSchedule, type LoteScheduleRow, type RotulosCsvLote } from '@hestia/engine';
import { formatQuantity, unitSymbol, type Project, type ResolvedUnits } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { dictOf, t as translate, useI18n, type Lang } from '../../editor/i18n.ts';
import { saveText } from '../../editor/saveText.ts';
import { useUnits } from '../useUnits.ts';
import { Dialog } from './Dialog.tsx';
import { fecharLoteSchedule, useLoteScheduleAberta } from './loteScheduleAberta.ts';

type Chave = Parameters<typeof translate>[1];

/**
 * Tabela "Índices do lote" (ficha P4, molde: TerrenoScheduleDialog): uma linha por lote, com área, área edificável, projeção, área construída e, para
 * taxa de ocupação, coeficiente e permeabilidade, o valor, o limite e a marca "dentro" ou "excede". Os números vêm do motor do lote (`buildLoteSchedule`,
 * sem kernel) e são recalculados a cada renderização: criar uma laje com a tabela aberta atualiza a tabela sem reabrir. Áreas pela unidade do projeto
 * (`formatQuantity`); percentuais como porcentagem.
 */
export function LoteScheduleDialog(): ReactElement | null {
  return useLoteScheduleAberta() ? <LoteScheduleCorpo /> : null;
}

/** Textos do CSV no idioma ativo (os mesmos da tabela na tela). */
export function rotulosCsvLote(lang: Lang): RotulosCsvLote {
  const t = (k: Chave): string => translate(lang, k);
  return {
    lote: t('ui_lt_tab_col_lote'),
    area: t('ui_lt_tab_col_area'),
    areaEdificavel: t('ui_lt_tab_col_edificavel'),
    areaProjecao: t('ui_lt_tab_col_projecao'),
    areaConstruida: t('ui_lt_tab_col_construida'),
    taxaOcupacao: t('ui_lt_tab_col_ocupacao'),
    coefAproveitamento: t('ui_lt_tab_col_coef'),
    permeabilidade: t('ui_lt_tab_col_perm'),
    limite: t('ui_lt_tab_col_limite'),
    marca: t('ui_lt_tab_col_marca'),
    dentro: t('ui_lt_tab_dentro'),
    excede: t('ui_lt_tab_excede'),
  };
}

/** CSV da tabela do projeto, no idioma e nas unidades dadas. */
export function csvDoLote(s: LoteSchedule, units: ResolvedUnits, lang: Lang): string {
  return loteScheduleToCsv(s, units, rotulosCsvLote(lang), lang);
}

/** Número sem unidade, com as casas dadas (o separador segue as unidades do projeto). */
const numero = (units: ResolvedUnits, v: number, decimais = 2): string => formatQuantity(units, 'currency', v, { withUnit: false, decimals: decimais });
const area = (units: ResolvedUnits, v: number): string => formatQuantity(units, 'area', v, { withUnit: false, decimals: 2 });
const porcentagem = (units: ResolvedUnits, v: number): string => `${numero(units, v * 100)} %`;

/** Texto da marca: "dentro" ou "excede" (traduzidos); sem limite, o travessão. */
const marcaDo = (ind: IndiceLote, t: ReturnType<typeof dictOf>): string =>
  ind.situacao === 'dentro' ? t.ui_lt_tab_dentro : ind.situacao === 'excede' ? t.ui_lt_tab_excede : LIMITE_AUSENTE;

/** As três células de um índice: valor, limite (ou travessão) e marca. */
function celulasDoIndice(ind: IndiceLote, fmt: (v: number) => string, t: ReturnType<typeof dictOf>): ReactElement[] {
  return [
    <td key="v" className="num">{fmt(ind.valor)}</td>,
    <td key="l" className="num">{ind.limite === null ? LIMITE_AUSENTE : fmt(ind.limite)}</td>,
    <td key="m">{marcaDo(ind, t)}</td>,
  ];
}

function Linha({ r, units, t }: { r: LoteScheduleRow; units: ResolvedUnits; t: ReturnType<typeof dictOf> }): ReactElement {
  return (
    <tr>
      <td>{r.nome}</td>
      <td className="num">{area(units, r.area)}</td>
      <td className="num">{area(units, r.areaEdificavel)}</td>
      <td className="num">{area(units, r.areaProjecao)}</td>
      <td className="num">{area(units, r.areaConstruida)}</td>
      {celulasDoIndice(r.taxaOcupacao, (v) => porcentagem(units, v), t)}
      {celulasDoIndice(r.coefAproveitamento, (v) => numero(units, v), t)}
      {celulasDoIndice(r.permeabilidade, (v) => porcentagem(units, v), t)}
    </tr>
  );
}

function LoteScheduleCorpo(): ReactElement {
  const p: Project = useProject();
  const lang = useI18n((s) => s.lang);
  const units = useUnits();
  const t = dictOf(lang);
  const schedule = useMemo(() => buildLoteSchedule(p), [p]);
  const [msg, setMsg] = useState('');

  const exportar = async (): Promise<void> => {
    const base = p.name.trim() || t.scx_csv_default_project;
    const status = await saveText(`${base}-${t.ui_lt_tab_arquivo}.csv`, csvDoLote(schedule, units, lang));
    setMsg(status);
    useUi.setState({ status });
  };

  return (
    <Dialog
      title={t.ui_lt_tab_titulo}
      sub={t.ui_lt_tab_sub}
      onClose={fecharLoteSchedule}
      footer={
        <>
          <span className="wsched-msg" role="status">{msg}</span>
          <button className="btn primary" onClick={() => void exportar()} disabled={schedule.rows.length === 0} title={t.sched_export_tip}>
            {t.sched_export_csv}
          </button>
          <button className="btn" onClick={fecharLoteSchedule}>{t.sched_close}</button>
        </>
      }
    >
      {schedule.rows.length === 0 ? (
        <p className="hint">{t.ui_lt_tab_vazio}</p>
      ) : (
        <div className="wsched-scroll">
          <table className="layers wsched">
            <thead>
              <tr>
                <th>{t.ui_lt_tab_col_lote}</th>
                <th className="num">{`${t.ui_lt_tab_col_area} (${unitSymbol(units, 'area')})`}</th>
                <th className="num">{`${t.ui_lt_tab_col_edificavel} (${unitSymbol(units, 'area')})`}</th>
                <th className="num">{`${t.ui_lt_tab_col_projecao} (${unitSymbol(units, 'area')})`}</th>
                <th className="num">{`${t.ui_lt_tab_col_construida} (${unitSymbol(units, 'area')})`}</th>
                <th className="num">{`${t.ui_lt_tab_col_ocupacao} (%)`}</th>
                <th className="num">{t.ui_lt_tab_col_limite}</th>
                <th title={t.ui_lt_tab_marca_tip}>{t.ui_lt_tab_col_marca}</th>
                <th className="num">{t.ui_lt_tab_col_coef}</th>
                <th className="num">{t.ui_lt_tab_col_limite}</th>
                <th title={t.ui_lt_tab_marca_tip}>{t.ui_lt_tab_col_marca}</th>
                <th className="num">{`${t.ui_lt_tab_col_perm} (%)`}</th>
                <th className="num">{t.ui_lt_tab_col_limite}</th>
                <th title={t.ui_lt_tab_marca_tip}>{t.ui_lt_tab_col_marca}</th>
              </tr>
            </thead>
            <tbody>
              {schedule.rows.map((r) => (
                <Linha key={r.loteId} r={r} units={units} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
