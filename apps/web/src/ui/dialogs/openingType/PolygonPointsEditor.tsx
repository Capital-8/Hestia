import type { ReactElement } from 'react';
import { MAX_POLYGON_POINTS, type OpeningType } from '@hestia/model';
import { NumField } from '../../fields.tsx';
import { useT } from '../../../editor/i18n.ts';
import { addPolygonPoint, movePolygonPoint, polygonPointsOf, removePolygonPoint, reversePolygon, withPolygonPoints } from './openingTypeShape.ts';

/**
 * Lista de pontos do polígono livre: u (a partir da borda esquerda) e v (a partir da base), em unidades do projeto, com
 * adicionar, remover e inverter o sentido. Toda mudança grava no rascunho; a validação ao vivo fica no painel da forma.
 */
export function PolygonPointsEditor({ d, onChange }: { d: OpeningType; onChange: (next: OpeningType) => void }): ReactElement {
  const { t } = useT();
  const points = polygonPointsOf(d);
  const set = (next: typeof points): void => onChange(withPolygonPoints(d, next));
  return (
    <div className="op-shape-points" role="group" aria-label={t('dsh_pts_title', { n: points.length })}>
      <div className="op-shape-points-head">
        <strong>{t('dsh_pts_title', { n: points.length })}</strong>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn small" disabled={points.length >= MAX_POLYGON_POINTS} onClick={() => set(addPolygonPoint(points))}>{t('dsh_pts_add')}</button>
        <button type="button" className="btn small" onClick={() => set(reversePolygon(points))}>{t('dsh_pts_reverse')}</button>
      </div>
      <p className="hint">{t('dsh_pts_hint')}</p>
      <ol className="op-shape-points-list">
        {points.map((p, i) => (
          <li key={i}>
            <span className="op-shape-n">{i + 1}</span>
            <NumField id={`op-pt-u-${i}`} value={p.u} quantity="smallLength" min={0} max={d.width} width={64} onCommit={(v) => set(movePolygonPoint(points, i, v, p.v, d.width, d.height))} />
            <NumField id={`op-pt-v-${i}`} value={p.v} quantity="smallLength" min={0} max={d.height} width={64} onCommit={(v) => set(movePolygonPoint(points, i, p.u, v, d.width, d.height))} />
            <button type="button" className="btn small" aria-label={t('dsh_pts_remove', { n: i + 1 })} title={t('dsh_pts_remove', { n: i + 1 })} disabled={points.length <= 3} onClick={() => set(removePolygonPoint(points, i))}>×</button>
          </li>
        ))}
      </ol>
      <p className="hint">{t('dsh_pts_u')} · {t('dsh_pts_v')}</p>
    </div>
  );
}
