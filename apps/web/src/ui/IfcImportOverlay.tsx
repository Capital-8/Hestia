import type { ReactElement } from 'react';
import { useT, type Dict } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import type { FaseImportacao } from '../editor/ifcImport.ts';
import './IfcImportOverlay.css';

const IFC_STAGE: Record<FaseImportacao, keyof Dict> = {
  read: 'shc_ifc_read',
  parse: 'shc_ifc_parse',
  relations: 'shc_ifc_relations',
  levels: 'shc_ifc_levels',
  walls: 'shc_ifc_walls',
  openings: 'shc_ifc_openings',
  slabs: 'shc_ifc_slabs',
  generic: 'shc_ifc_generic',
  finish: 'shc_ifc_finish',
};

/**
 * Barra de progresso da importação IFC. O trabalho pesado roda no worker; aqui só se lê o andamento que ele manda,
 * então a janela continua respondendo e o usuário vê em que fase o arquivo está.
 */
export function IfcImportOverlay(): ReactElement | null {
  const { t } = useT();
  const progresso = useUi((s) => s.ifcImport);
  if (!progresso) return null;
  const pct = Math.max(0, Math.min(100, Math.round(progresso.fracao * 100)));
  const etapa = t(IFC_STAGE[progresso.fase]);
  const contagem = progresso.total > 1 && progresso.fase !== 'read' && progresso.fase !== 'parse'
    ? ` ${Math.min(progresso.feito, progresso.total)}/${progresso.total}`
    : '';
  return (
    <div className="ifc-progress" role="status" aria-live="polite" aria-label={t('shc_ifc_importing')}>
      <div className="ifc-progress-card">
        <div className="ifc-progress-head">
          <b>{t('shc_ifc_importing')}</b>
          <span className="mono">{pct}%</span>
        </div>
        <div
          className="ifc-progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="ifc-progress-stage">{etapa}{contagem}</div>
        <p className="ifc-progress-hint">{t('shc_ifc_hint')}</p>
      </div>
    </div>
  );
}
