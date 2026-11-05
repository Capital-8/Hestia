import { useState, type ReactElement } from 'react';
import { GRAPHICS_CATEGORIES, graphicsOf, type GraphicsCategory, type ProjectGraphics } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { editProjectGraphics, restoreProjectGraphicsDefault, type ProjectGraphicsPatch } from '../../editor/graphicsActions.ts';
import { useUi } from '../../editor/state.ts';
import { categoryLabel, WEIGHTS } from '../graphicsLabels.ts';
import { NumField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { useT } from '../../editor/i18n.ts';

const SCALE_COLUMNS = ['1:50', '1:100', '1:200'] as const;

/**
 * Pesos de linha do projeto (decisão 0015 §3, diálogo de projeto em Projeto): tabela de 16 pesos × 3 escalas em mm de papel,
 * pesos de corte e projeção por categoria e limites de detalhe (fino até 1:__, médio até 1:__). Cada edição é um comando.
 */
export function LineWeightsDialog(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const g = graphicsOf(p);
  const [error, setError] = useState<string | null>(null);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const run = (patch: ProjectGraphicsPatch): void => setError(editProjectGraphics(editor.store, patch).error);
  const setCell = (row: number, col: number, mm: number): void => {
    const table = g.lineWeights.map((r) => [...r] as [number, number, number]);
    table[row]![col] = mm;
    run({ lineWeights: table });
  };
  const setCategory = (c: GraphicsCategory, key: 'cutWeight' | 'projectionWeight', weight: number): void =>
    run({ categories: { [c]: { [key]: weight } } as ProjectGraphicsPatch['categories'] });
  const setDetail = (key: keyof ProjectGraphics['detailByScale'], scale: number): void => run({ detailByScale: { [key]: scale } });
  return (
    <Dialog
      title={t('dlt_lw_title')}
      sub={t('dlt_lw_sub')}
      onClose={close}
      size="mid"
      footer={
        <>
          <button className="btn" onClick={() => setError(restoreProjectGraphicsDefault(editor.store).error)}>{t('dlt_restore_default')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={close}>{t('stt_close')}</button>
        </>
      }
    >
      <h3 style={{ fontSize: 12, margin: '4px 0 6px' }}>{t('dlt_lw_section_width')}</h3>
      <table className="layers" aria-label={t('dlt_a11y_lw_table')}>
        <thead>
          <tr>
            <th>{t('dlt_col_weight')}</th>
            {SCALE_COLUMNS.map((s) => <th key={s}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {g.lineWeights.map((row, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {row.map((mm, col) => (
                <td key={col}>
                  <NumField id={`lw-${i + 1}-${col}`} value={mm} decimals={2} min={0.01} width={72} onCommit={(v) => setCell(i, col, v)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 12, margin: '12px 0 6px' }}>{t('dlt_lw_section_category')}</h3>
      <table className="layers" aria-label={t('dlt_a11y_lw_categories')}>
        <thead>
          <tr>
            <th>{t('dlt_col_category')}</th>
            <th>{t('dlt_col_cut')}</th>
            <th>{t('dlt_col_projection')}</th>
          </tr>
        </thead>
        <tbody>
          {GRAPHICS_CATEGORIES.map((c) => (
            <tr key={c}>
              <td>{categoryLabel(c, lang)}</td>
              {(['cutWeight', 'projectionWeight'] as const).map((key) => (
                <td key={key}>
                  <select
                    id={`lwc-${c}-${key}`}
                    className="select"
                    aria-label={key === 'cutWeight' ? t('dlt_a11y_cut_weight_of', { category: categoryLabel(c, lang) }) : t('dlt_a11y_projection_weight_of', { category: categoryLabel(c, lang) })}
                    value={g.categories[c][key]}
                    onChange={(e) => setCategory(c, key, Number(e.target.value))}
                  >
                    {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 12, margin: '12px 0 6px' }}>{t('dlt_lw_section_detail')}</h3>
      <div className="field-row">
        <label htmlFor="lw-fine">{t('dlt_lw_fine')}</label>
        <NumField id="lw-fine" value={g.detailByScale.fineMax} decimals={0} min={1} width={72} onCommit={(v) => setDetail('fineMax', v)} />
      </div>
      <div className="field-row">
        <label htmlFor="lw-medium">{t('dlt_lw_medium')}</label>
        <NumField id="lw-medium" value={g.detailByScale.mediumMax} decimals={0} min={1} width={72} onCommit={(v) => setDetail('mediumMax', v)} />
      </div>
      <p className="hint">{t('dlt_lw_help')}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </Dialog>
  );
}
