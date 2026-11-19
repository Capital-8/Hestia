import type { ReactElement } from 'react';
import { OPENING_SHAPE_KINDS, type OpeningShapeKind } from '@hestia/model';
import { Check, NumField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { PolygonPointsEditor } from '../PolygonPointsEditor.tsx';
import { ShapePreview } from '../ShapePreview.tsx';
import { shapeGeometry } from '../shapePreview.ts';
import { shapeIssueKey, shapeIssues, shapeKindKey, shapeKindOf, storedShape, withPolygonSymmetric, withShapeKind, withShapeNumber } from '../openingTypeShape.ts';
import type { PanelProps } from './panelKit.tsx';

/**
 * Forma do vão: seletor (retangular, arcos, círculo, empena, trapézio, ferradura, polígono), os parâmetros de cada forma
 * (`OPENING_SHAPE_PARAMS`), a validação ao vivo com a mensagem de cada problema e a prévia 2D com cotas e a esquadria recuada.
 * Retangular tira o campo `shape` do tipo: o tipo fica igual ao que era sem forma. Com problema, o diálogo bloqueia o salvar.
 */
export function ShapePanel({ d, onChange }: PanelProps): ReactElement {
  const { t } = useT();
  const kind = shapeKindOf(d);
  const shape = storedShape(d);
  const issues = shapeIssues(d);
  const g = shapeGeometry(d);
  return (
    <>
      <div className="field-row">
        <label htmlFor="op-shape-kind">{t('dsh_kind')}</label>
        <select id="op-shape-kind" className="select" value={kind} onChange={(e) => onChange(withShapeKind(d, e.target.value as OpeningShapeKind))}>
          {OPENING_SHAPE_KINDS.map((k) => <option key={k} value={k}>{t(shapeKindKey(k))}</option>)}
        </select>
      </div>
      {shape && 'rise' in shape ? (
        <div className="field-row"><label htmlFor="op-shape-rise">{t('dsh_f_rise')}</label><NumField id="op-shape-rise" value={shape.rise} quantity="smallLength" min={0.01} invalid={issues.length > 0} onCommit={(v) => onChange(withShapeNumber(d, 'rise', v))} /></div>
      ) : null}
      {shape?.kind === 'horseshoe' ? (
        <div className="field-row"><label htmlFor="op-shape-neck">{t('dsh_f_neck')}</label><NumField id="op-shape-neck" value={shape.neck} quantity="smallLength" min={0.01} invalid={issues.length > 0} onCommit={(v) => onChange(withShapeNumber(d, 'neck', v))} /></div>
      ) : null}
      {shape?.kind === 'trapezoid' ? (
        <>
          <div className="field-row"><label htmlFor="op-shape-top">{t('dsh_f_top')}</label><NumField id="op-shape-top" value={shape.topWidth} quantity="smallLength" min={0.01} invalid={issues.length > 0} onCommit={(v) => onChange(withShapeNumber(d, 'topWidth', v))} /></div>
          <div className="field-row"><label htmlFor="op-shape-base" title={t('dsh_f_base_tip')}>{t('dsh_f_base')}</label><NumField id="op-shape-base" value={shape.baseWidth ?? null} quantity="smallLength" min={0.01} placeholder={t('dsh_f_base_tip')} onCommit={(v) => onChange(withShapeNumber(d, 'baseWidth', v))} onClear={() => onChange(withShapeNumber(d, 'baseWidth', undefined))} /></div>
        </>
      ) : null}
      {shape?.kind === 'polygon' ? (
        <div className="field-row"><label htmlFor="op-shape-sym">{t('dsh_f_symmetric')}</label><Check id="op-shape-sym" checked={shape.symmetric === true} onChange={(v) => onChange(withPolygonSymmetric(d, v))} /></div>
      ) : null}
      {kind !== 'rect' ? <p className="hint" style={{ padding: '0 0 8px' }}>{t('dsh_dims_hint')}</p> : null}
      {issues.length > 0 ? (
        <ul className="error op-shape-issues" role="alert" id="op-shape-issues">
          {issues.map((code) => <li key={code} data-issue={code}>{t(shapeIssueKey(code))}</li>)}
        </ul>
      ) : kind !== 'rect' ? (
        <p className="hint op-shape-valid" id="op-shape-valid">{t('dsh_valid')}</p>
      ) : null}
      {g.frameFallsBack && issues.length === 0 ? <p className="hint" style={{ color: 'var(--warn)' }}>{t('dsh_frame_rect')}</p> : null}
      <ShapePreview d={d} onChange={onChange} />
      {shape?.kind === 'polygon' ? <PolygonPointsEditor d={d} onChange={onChange} /> : null}
    </>
  );
}
