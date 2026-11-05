import type { ReactElement } from 'react';
import { applyRoofPatch } from '../editor/roofEdgeActions.ts';
import { editor } from '../editor/controller.ts';
import { lowestVertex, roofSlopeError } from '@hestia/tools';
import type { Roof, RoofPlaneDef } from '@hestia/model';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row } from './fields.tsx';

/** Ângulo da subida em graus, entre 0° e 360°. */
const upDeg = (pl: RoofPlaneDef): number => (((Math.atan2(pl.up.y, pl.up.x) * 180) / Math.PI) % 360 + 360) % 360;

/** Água livre a partir da direção (graus): a subida passa a ser essa direção e o beiral fica no vértice mais baixo. */
function planeWith(r: Roof, pl: RoofPlaneDef, patch: { percent?: number; deg?: number }): RoofPlaneDef {
  if (patch.deg === undefined) return { ...pl, percent: patch.percent ?? pl.percent };
  const t = (patch.deg * Math.PI) / 180;
  const up = { x: Math.cos(t), y: Math.sin(t) };
  return { ...pl, up, origin: lowestVertex(r.boundary, up), percent: patch.percent ?? pl.percent };
}

/**
 * Lista das águas livres do telhado (forma 'free'): inclinação e direção de subida de cada água, excluir e acrescentar.
 * Cada água cobre o contorno inteiro; a seta de inclinação da barra de ferramentas acrescenta águas por dois cliques.
 */
export function RoofPlanesSection({ roof }: { roof: Roof }): ReactElement {
  const { t } = useT();
  const set = (planes: RoofPlaneDef[]): void => void applyRoofPatch(editor.store, [roof.id], { planes });
  const setPlane = (i: number, patch: { percent?: number; deg?: number }): void => {
    if (patch.percent !== undefined) {
      const err = roofSlopeError(patch.percent);
      if (err) return void useUi.setState({ status: err });
    }
    set(roof.planes.map((pl, k) => (k === i ? planeWith(roof, pl, patch) : pl)));
  };
  const addPlane = (): void => {
    const up = { x: roof.dir.x, y: roof.dir.y };
    set([...roof.planes, { polygon: roof.boundary, origin: lowestVertex(roof.boundary, up), up, percent: roof.slopePercent, z0: 0 }]);
  };
  return (
    <Group title={t('msc_roof_planes_count', { n: roof.planes.length })}>
      {roof.planes.length === 0 && <div className="hint">{t('msc_roof_planes_empty')}</div>}
      {roof.planes.map((pl, i) => (
        <div key={i}>
          <Row label={t('msc_roof_plane_slope', { n: i + 1 })} htmlFor={`p-pl${i}`}>
            <NumField id={`p-pl${i}`} value={pl.percent / 100} quantity="slope" min={0.001} max={2} onCommit={(v) => setPlane(i, { percent: v * 100 })} />
          </Row>
          <Row label={t('msc_roof_plane_rise', { n: i + 1 })} htmlFor={`p-pld${i}`}>
            <NumField id={`p-pld${i}`} value={(upDeg(pl) * Math.PI) / 180} quantity="angle" onCommit={(v) => setPlane(i, { deg: (v * 180) / Math.PI })} />
          </Row>
          <div className="row">
            <button className="btn small" aria-label={t('msc_roof_plane_delete', { n: i + 1 })} onClick={() => set(roof.planes.filter((_, k) => k !== i))}>
              {t('msc_roof_plane_delete', { n: i + 1 })}
            </button>
          </div>
        </div>
      ))}
      <div className="row">
        <button className="btn small" onClick={addPlane}>{t('msc_roof_plane_add')}</button>
      </div>
      <div className="hint">{t('msc_roof_planes_overlap_hint')}</div>
    </Group>
  );
}
