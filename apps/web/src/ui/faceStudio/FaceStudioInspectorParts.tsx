import type { ReactElement } from 'react';
import { concaveSlatMinGap, type SlatsSpec } from '@hestia/geom';
import type { UnwrappedFace } from '@hestia/engine';
import { formatQuantity, type FaceDxfOverlay, type FaceRegion, type Material } from '@hestia/model';
import type { Lang } from '../../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from '../fields.tsx';
import { useUnits } from '../useUnits.ts';
import { FaceSelect, MatSelect } from './FaceSelect.tsx';

export { MatSelect };

export function RegionInspector({
  region,
  materials,
  unwrapped,
  pt,
  lang,
  onPatch,
  onDelete,
  onBackToBase,
}: {
  region: FaceRegion;
  materials: Record<string, Material>;
  unwrapped: UnwrappedFace;
  pt: boolean;
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
      <Group title={pt ? 'Região selecionada' : 'Selected region'} stateKey="fs_region">
        <Row label={pt ? 'Nome' : 'Name'} htmlFor="fs-reg-name">
          <TextField id="fs-reg-name" value={region.name ?? ''} placeholder={pt ? 'Região' : 'Region'} onCommit={(name) => onPatch({ name })} />
        </Row>
        <Row label={pt ? 'Material' : 'Material'} htmlFor="fs-reg-mat">
          <MatSelect id="fs-reg-mat" value={region.materialId} materials={materials} onChange={(materialId) => onPatch({ materialId })} />
        </Row>
        <Row label={pt ? 'Prioridade' : 'Order'} htmlFor="fs-reg-order">
          <NumField id="fs-reg-order" value={region.order} decimals={0} min={0} max={9999} onCommit={(order) => onPatch({ order: Math.round(order) })} />
        </Row>
        <Row label={pt ? 'Recorte' : 'Cut mode'} htmlFor="fs-reg-cut">
          <FaceSelect
            id="fs-reg-cut"
            value={region.cutMode ?? 'clipBelow'}
            options={[
              { value: 'clipBelow', label: pt ? 'Recortar abaixo (apoio s/ colisão)' : 'Clip below (non-colliding)' },
              { value: 'overlay', label: pt ? 'Sobrepor' : 'Overlay' },
            ]}
            onChange={(v) => onPatch({ cutMode: v as 'clipBelow' | 'overlay' })}
          />
        </Row>
        <Row label={pt ? 'Desloc. base' : 'Base offset'} htmlFor="fs-reg-boff">
          <NumField id="fs-reg-boff" value={region.baseOffset ?? 0} quantity="smallLength" onCommit={(baseOffset) => onPatch({ baseOffset })} />
        </Row>
        <Row label={pt ? 'Espessura' : 'Thickness'} htmlFor="fs-reg-thick">
          <NumField id="fs-reg-thick" value={region.thickness ?? 0} quantity="smallLength" onCommit={(thickness) => onPatch({ thickness })} />
        </Row>
      </Group>

      <Group title={pt ? 'Ripado paramétrico' : 'Parametric slats'} stateKey="fs_slats">
        <Row label={pt ? 'Ativar ripado' : 'Enable slats'} htmlFor="fs-slat-on">
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
            <Row label={pt ? 'Largura ripa' : 'Slat width'} htmlFor="fs-slat-w">
              <NumField id="fs-slat-w" value={slats.width} quantity="smallLength" min={0.002} onCommit={(width) => patchSlats({ width })} />
            </Row>
            <Row label={pt ? 'Vão' : 'Gap'} htmlFor="fs-slat-g">
              <NumField id="fs-slat-g" value={slats.gap} quantity="smallLength" min={0} onCommit={(gap) => patchSlats({ gap })} />
            </Row>
            <Row label={pt ? 'Profundidade' : 'Depth'} htmlFor="fs-slat-d">
              <NumField id="fs-slat-d" value={slats.depth} quantity="smallLength" min={0.001} onCommit={(depth) => patchSlats({ depth })} />
            </Row>
            <Row label={pt ? 'Ângulo' : 'Angle'} htmlFor="fs-slat-ang">
              <NumField
                id="fs-slat-ang"
                value={(slats.angleDeg * Math.PI) / 180}
                quantity="angle"
                onCommit={(rad) => patchSlats({ angleDeg: (rad * 180) / Math.PI })}
              />
            </Row>
            <Row label={pt ? 'Mat. ripas' : 'Slat mat.'} htmlFor="fs-slat-mat">
              <MatSelect id="fs-slat-mat" value={slats.slatMaterialId} materials={materials} onChange={(slatMaterialId) => patchSlats({ slatMaterialId })} />
            </Row>
            <Row label={pt ? 'Mat. fundo' : 'Back mat.'} htmlFor="fs-slat-back">
              <MatSelect
                id="fs-slat-back"
                value={slats.backMaterialId ?? ''}
                materials={materials}
                allowEmpty
                emptyLabel={pt ? 'Nenhum (vazado)' : 'None (open)'}
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
                {pt
                  ? `Colisão frontal em face côncava: vão mínimo recomendado de ${formatQuantity(units, 'smallLength', minGap, { lang })}.`
                  : `Concave front-edge collision: minimum recommended gap is ${formatQuantity(units, 'smallLength', minGap, { lang })}.`}
              </span>
              <button
                type="button"
                className="btn small"
                onClick={() => patchSlats({ gap: Math.ceil(minGap * 10000) / 10000 })}
              >
                {pt ? 'Ajustar vão mínimo' : 'Apply min gap'}
              </button>
            </>
          ) : (
            <span>
              {pt
                ? 'Profundidade da ripa excede o raio da face côncava.'
                : 'Slat depth exceeds concave face radius.'}
            </span>
          )}
        </div>
      )}

      <div className="fs-insp-actions">
        <button type="button" className="btn small" onClick={onBackToBase}>
          {pt ? 'Voltar p/ face base' : 'Back to base face'}
        </button>
        <button type="button" className="btn danger small" onClick={onDelete}>
          {pt ? 'Excluir região' : 'Delete region'}
        </button>
      </div>
    </>
  );
}

export function DxfInspector({
  dxf,
  materials,
  defaultMatId,
  pt,
  onPatch,
  onDelete,
  onBackToBase,
}: {
  dxf: FaceDxfOverlay;
  materials: Record<string, Material>;
  defaultMatId: string;
  pt: boolean;
  onPatch: (patch: Partial<FaceDxfOverlay>) => void;
  onDelete: () => void;
  onBackToBase: () => void;
}): ReactElement {
  return (
    <>
      <Group title={pt ? 'Sobreposição DXF' : 'DXF overlay'} stateKey="fs_dxf">
        <Row label={pt ? 'Nome' : 'Name'} htmlFor="fs-dxf-name">
          <TextField id="fs-dxf-name" value={dxf.name} onCommit={(name) => onPatch({ name })} />
        </Row>
        <Row label={pt ? 'Material' : 'Material'} htmlFor="fs-dxf-mat">
          <MatSelect
            id="fs-dxf-mat"
            value={dxf.materialId ?? ''}
            materials={materials}
            allowEmpty
            emptyLabel={`${pt ? 'Herdar' : 'Inherit'} (${materials[defaultMatId]?.name ?? defaultMatId})`}
            onChange={(v) => onPatch({ materialId: v || undefined })}
          />
        </Row>
        <Row label="Offset U" htmlFor="fs-dxf-ox">
          <NumField id="fs-dxf-ox" value={dxf.offset.x} quantity="length" onCommit={(x) => onPatch({ offset: { x, y: dxf.offset.y } })} />
        </Row>
        <Row label="Offset V" htmlFor="fs-dxf-oy">
          <NumField id="fs-dxf-oy" value={dxf.offset.y} quantity="length" onCommit={(y) => onPatch({ offset: { x: dxf.offset.x, y } })} />
        </Row>
        <Row label={pt ? 'Rotação' : 'Rotation'} htmlFor="fs-dxf-rot">
          <NumField
            id="fs-dxf-rot"
            value={(dxf.rotationDeg * Math.PI) / 180}
            quantity="angle"
            onCommit={(rad) => onPatch({ rotationDeg: (rad * 180) / Math.PI })}
          />
        </Row>
        <Row label={pt ? 'Escala' : 'Scale'} htmlFor="fs-dxf-scale">
          <NumField id="fs-dxf-scale" value={dxf.scale} decimals={3} min={0.001} onCommit={(scale) => onPatch({ scale })} />
        </Row>
        <Row label={pt ? 'Largura friso' : 'Groove width'} htmlFor="fs-dxf-sep">
          <NumField id="fs-dxf-sep" value={dxf.separatorWidth} quantity="smallLength" min={0.001} onCommit={(separatorWidth) => onPatch({ separatorWidth })} />
        </Row>
        <Row label={pt ? 'Desloc. base' : 'Base offset'} htmlFor="fs-dxf-boff">
          <NumField id="fs-dxf-boff" value={dxf.baseOffset ?? 0} quantity="smallLength" onCommit={(baseOffset) => onPatch({ baseOffset })} />
        </Row>
        <Row label={pt ? 'Espessura' : 'Thickness'} htmlFor="fs-dxf-thick">
          <NumField id="fs-dxf-thick" value={dxf.thickness ?? 0} quantity="smallLength" onCommit={(thickness) => onPatch({ thickness })} />
        </Row>
      </Group>

      <div className="fs-insp-actions">
        <button type="button" className="btn small" onClick={onBackToBase}>
          {pt ? 'Voltar p/ face base' : 'Back to base face'}
        </button>
        <button type="button" className="btn danger small" onClick={onDelete}>
          {pt ? 'Excluir DXF' : 'Delete DXF'}
        </button>
      </div>
    </>
  );
}
