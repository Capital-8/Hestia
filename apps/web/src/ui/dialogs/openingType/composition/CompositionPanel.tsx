import { useState, type ReactElement } from 'react';
import { compositionCells, compositionLeafSize, compositionSpan, openingCompositionOf } from '@hestia/model';
import { useT, type Dict } from '../../../../editor/i18n.ts';
import type { PanelProps } from '../panels/panelKit.tsx';
import { CellEditor } from './CellEditor.tsx';
import { LayoutTree } from './LayoutTree.tsx';
import { useUnits } from '../../../useUnits.ts';
import { ACOES_JANELA, ACOES_PORTA, aplicaAcao, issueDe, metrosTexto, podeRemover, removeModulo, type Acao } from './compositionControls.ts';

/**
 * Painel "Módulos": a composição do tipo (células e divisões), as ações rápidas e a célula selecionada.
 * O erro de `compositionIssue` aparece logo abaixo; o modelo confere de novo ao salvar.
 */
export function CompositionPanel({ d, onChange }: PanelProps): ReactElement {
  const units = useUnits();
  const { t } = useT();
  const c = openingCompositionOf(d);
  const cells = compositionCells(c);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const atual = cells.find((x) => x.id === escolhida) ?? cells[0] ?? null;
  const span = compositionSpan(c);
  const folha = compositionLeafSize(c);
  const acoes: ReadonlyArray<readonly [Acao, keyof Dict]> = d.kind === 'door' ? ACOES_PORTA : ACOES_JANELA;
  const erro = issueDe(d);

  return (
    <>
      <p className="hint" style={{ padding: '0 0 8px' }}>
        {t('dlo_comp_summary', {
          a: metrosTexto(units, span.width),
          b: metrosTexto(units, span.height),
          c: metrosTexto(units, folha.width),
          d: metrosTexto(units, folha.height),
        })}
      </p>
      <div className="op-choices" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        {acoes.map(([acao, labelKey]) => (
          <button key={acao} type="button" className="btn small" onClick={() => onChange(aplicaAcao(d, acao))}>
            {t(labelKey)}
          </button>
        ))}
        <button type="button" className="btn small" disabled={!atual || !podeRemover(c, atual.id)} onClick={() => atual && onChange(removeModulo(d, atual.id))}>
          {t('dlo_comp_remove_module')}
        </button>
      </div>
      <LayoutTree c={c} selected={atual?.id ?? null} onSelect={setEscolhida} />
      {atual ? <CellEditor d={d} onChange={onChange} cellId={atual.id} /> : null}
      {erro ? <p className="error" role="alert">{erro}</p> : null}
    </>
  );
}
