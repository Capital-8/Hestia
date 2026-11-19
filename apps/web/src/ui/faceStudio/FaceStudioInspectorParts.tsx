import type { ReactElement } from 'react';
import { concaveSlatMinGap, type SlatsSpec } from '@hestia/geom';
import type { UnwrappedFace } from '@hestia/engine';
import { formatQuantity, type FaceDxfOverlay, type FaceRegion, type Material } from '@hestia/model';
import { t, type Lang } from '../../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from '../fields.tsx';
import { useUnits } from '../useUnits.ts';
import { FaceSelect, MatSelect } from './FaceSelect.tsx';

export { MatSelect };

export function RegionInspector({
  region,
  materials,
  unwrapped,
  lang,
  onPatch,
  onDelete,
  onBackToBase,
}: {
  region: FaceRegion;
  materials: Record<string, Material>;
  unwrapped: UnwrappedFace;
  lang: Lang;
  onPatch: (patch: Partial<FaceRegion>) => void;
  onDelete: () => void;
  onBackToBase: () => void;
}): ReactElement {
  const units = useUnits();
  const slats = region.slats;
  const minGap =
    unwrapped.isCurved && unwrapped.concave && slats
      ? concaveSlatMinGap(unwrapped.curveRadius ?? 0, slats.width, slats.depth)
      : 0;
  const hasSlatCollision = Boolean(slats && unwrapped.isCurved && unwrapped.concave && slats.gap < minGap);

  const patchSlats = (patch: Partial<SlatsSpec>): void => {
    if (!slats) return;
    onPatch({ slats: { ...slats, ...patch } });
  };

  return (
    <>
      <Group title={t(lang, 'fs_selected_region')} stateKey="fs_region">
        <Row label={t(lang, 'fs_name')} htmlFor="fs-reg-name">
          <TextField id="fs-reg-name" value={region.name ?? ''} placeholder={t(lang, 'fs_region')} onCommit={(name) => onPatch({ name })} />
        </Row>
        <Row label={t(lang, 'fs_material')} htmlFor="fs-reg-mat">
          <MatSelect id="fs-reg-mat" value={region.materialId} materials={materials} onChange={(materialId) => onPatch({ materialId })} />
        </Row>
        <Row label={t(lang, 'fs_order')} htmlFor="fs-reg-order">
          <NumField id="fs-reg-order" value={region.order} decimals={0} min={0} max={9999} onCommit={(order) => onPatch({ order: Math.round(order) })} />
        </Row>
        <Row label={t(lang, 'fs_cut_mode')} htmlFor="fs-reg-cut">
          <FaceSelect
            id="fs-reg-cut"
            value={region.cutMode ?? 'clipBelow'}
            options={[
              { value: 'clipBelow', label: t(lang, 'fs_clip_below_non_colliding') },
              { value: 'overlay', label: t(lang, 'fs_overlay') },
            ]}
            onChange={(v) => onPatch({ cutMode: v as 'clipBelow' | 'overlay' })}
          />
        </Row>
        <Row label={t(lang, 'fs_base_offset')} htmlFor="fs-reg-boff">
          <NumField id="fs-reg-boff" value={region.baseOffset ?? 0} quantity="smallLength" onCommit={(baseOffset) => onPatch({ baseOffset })} />
        </Row>
        <Row label={t(lang, 'fs_thickness')} htmlFor="fs-reg-thick">
          <NumField id="fs-reg-thick" value={region.thickness ?? 0} quantity="smallLength" onCommit={(thickness) => onPatch({ thickness })} />
        </Row>
      </Group>

      <Group title={t(lang, 'fs_parametric_slats')} stateKey="fs_slats">
        <Row label={t(lang, 'fs_enable_slats')} htmlFor="fs-slat-on">
          <Check
            id="fs-slat-on"
            checked={Boolean(slats)}
            onChange={(on) =>
              onPatch({
                slats: on
                  ? { width: 0.03, gap: 0.02, depth: 0.03, angleDeg: 90, slatMaterialId: region.materialId }
                  : undefined,
              })
            }
          />
        </Row>
        {slats && (
          <>
            <Row label={t(lang, 'fs_slat_width')} htmlFor="fs-slat-w">
              <NumField id="fs-slat-w" value={slats.width} quantity="smallLength" min={0.002} onCommit={(width) => patchSlats({ width })} />
            </Row>
            <Row label={t(lang, 'fs_gap')} htmlFor="fs-slat-g">
              <NumField id="fs-slat-g" value={slats.gap} quantity="smallLength" min={0} onCommit={(gap) => patchSlats({ gap })} />
            </Row>
            <Row label={t(lang, 'fs_depth')} htmlFor="fs-slat-d">
              <NumField id="fs-slat-d" value={slats.depth} quantity="smallLength" min={0.001} onCommit={(depth) => patchSlats({ depth })} />
            </Row>
            <Row label={t(lang, 'fs_angle')} htmlFor="fs-slat-ang">
              <NumField
                id="fs-slat-ang"
                value={(slats.angleDeg * Math.PI) / 180}
                quantity="angle"
                onCommit={(rad) => patchSlats({ angleDeg: (rad * 180) / Math.PI })}
              />
            </Row>
            <Row label={t(lang, 'fs_slat_mat')} htmlFor="fs-slat-mat">
              <MatSelect id="fs-slat-mat" value={slats.slatMaterialId} materials={materials} onChange={(slatMaterialId) => patchSlats({ slatMaterialId })} />
            </Row>
            <Row label={t(lang, 'fs_back_mat')} htmlFor="fs-slat-back">
              <MatSelect
                id="fs-slat-back"
                value={slats.backMaterialId ?? ''}
                materials={materials}
                allowEmpty
                emptyLabel={t(lang, 'fs_none_open')}
                onChange={(v) => patchSlats({ backMaterialId: v || undefined })}
              />
            </Row>
          </>
        )}
      </Group>

      {hasSlatCollision && slats && (
        <div className="fs-alert-warn" role="alert">
          {Number.isFinite(minGap) ? (
            <>
              <span>
                {t(lang, 'fs_collision_gap', { gap: formatQuantity(units, 'smallLength', minGap, { lang }) })}
              </span>
              <button
                type="button"
                className="btn small"
                onClick={() => patchSlats({ gap: Math.ceil(minGap * 10000) / 10000 })}
              >
                {t(lang, 'fs_apply_min_gap')}
              </button>
            </>
          ) : (
            <span>
              {t(lang, 'fs_slat_depth_exceeds_concave_face_radius')}
            </span>
          )}
        </div>
      )}

      <div className="fs-insp-actions">
        <button type="button" className="btn small" onClick={onBackToBase}>
          {t(lang, 'fs_back_to_base_face')}
        </button>
        <button type="button" className="btn danger small" onClick={onDelete}>
          {t(lang, 'fs_delete_region')}
        </button>
      </div>
    </>
  );
}

export function DxfInspector({
  dxf,
  materials,
  defaultMatId,
  lang,
  onPatch,
  onDelete,
  onBackToBase,
}: {
  dxf: FaceDxfOverlay;
  lang: Lang;
  materials: Record<string, Material>;
  defaultMatId: string;
  onPatch: (patch: Partial<FaceDxfOverlay>) => void;
  onDelete: () => void;
  onBackToBase: () => void;
}): ReactElement {
  return (
    <>
      <Group title={t(lang, 'fs_dxf_overlay')} stateKey="fs_dxf">
        <Row label={t(lang, 'fs_name')} htmlFor="fs-dxf-name">
          <TextField id="fs-dxf-name" value={dxf.name} onCommit={(name) => onPatch({ name })} />
        </Row>
        <Row label={t(lang, 'fs_material')} htmlFor="fs-dxf-mat">
          <MatSelect
            id="fs-dxf-mat"
            value={dxf.materialId ?? ''}
            materials={materials}
            allowEmpty
            emptyLabel={`${t(lang, 'fs_inherit')} (${materials[defaultMatId]?.name ?? defaultMatId})`}
            onChange={(v) => onPatch({ materialId: v || undefined })}
          />
        </Row>
        <Row label="Offset U" htmlFor="fs-dxf-ox">
          <NumField id="fs-dxf-ox" value={dxf.offset.x} quantity="length" onCommit={(x) => onPatch({ offset: { x, y: dxf.offset.y } })} />
        </Row>
        <Row label="Offset V" htmlFor="fs-dxf-oy">
          <NumField id="fs-dxf-oy" value={dxf.offset.y} quantity="length" onCommit={(y) => onPatch({ offset: { x: dxf.offset.x, y } })} />
        </Row>
        <Row label={t(lang, 'fs_rotation')} htmlFor="fs-dxf-rot">
          <NumField
            id="fs-dxf-rot"
            value={(dxf.rotationDeg * Math.PI) / 180}
            quantity="angle"
            onCommit={(rad) => onPatch({ rotationDeg: (rad * 180) / Math.PI })}
          />
        </Row>
        <Row label={t(lang, 'fs_scale')} htmlFor="fs-dxf-scale">
          <NumField id="fs-dxf-scale" value={dxf.scale} decimals={3} min={0.001} onCommit={(scale) => onPatch({ scale })} />
        </Row>
        <Row label={t(lang, 'fs_groove_width')} htmlFor="fs-dxf-sep">
          <NumField id="fs-dxf-sep" value={dxf.separatorWidth} quantity="smallLength" min={0.001} onCommit={(separatorWidth) => onPatch({ separatorWidth })} />
        </Row>
        <Row label={t(lang, 'fs_base_offset')} htmlFor="fs-dxf-boff">
          <NumField id="fs-dxf-boff" value={dxf.baseOffset ?? 0} quantity="smallLength" onCommit={(baseOffset) => onPatch({ baseOffset })} />
        </Row>
        <Row label={t(lang, 'fs_thickness')} htmlFor="fs-dxf-thick">
          <NumField id="fs-dxf-thick" value={dxf.thickness ?? 0} quantity="smallLength" onCommit={(thickness) => onPatch({ thickness })} />
        </Row>
      </Group>

      <div className="fs-insp-actions">
        <button type="button" className="btn small" onClick={onBackToBase}>
          {t(lang, 'fs_back_to_base_face')}
        </button>
        <button type="button" className="btn danger small" onClick={onDelete}>
          {t(lang, 'fs_delete_dxf')}
        </button>
      </div>
    </>
  );
}
