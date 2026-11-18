import { useMemo, type ReactElement } from 'react';
import { multiArea, partitionFacePaint } from '@hestia/geom';
import { faceEntryToArtItems, unwrapElementFace } from '@hestia/engine';
import {
  availableFacesForElement,
  findExactFacePaint,
  formatQuantity,
  isFacePaintableElement,
  isFloor,
  isWall,
  type FaceLayerTarget,
  type FacePaintEntry,
  type FaceSlot,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { t, useI18n } from '../../editor/i18n.ts';
import { useUi, type FaceStudioState } from '../../editor/state.ts';
import { openFaceStudioTab } from '../../editor/viewTabActions.ts';
import { Check, Group, NumField, Row } from '../fields.tsx';
import { useUnits } from '../useUnits.ts';
import { FaceSelect, MatSelect } from './FaceSelect.tsx';
import { DxfInspector, RegionInspector } from './FaceStudioInspectorParts.tsx';
import { elementLayerOptions, faceSlotLabel } from './faceStudioTypes.ts';

/** Painel de propriedades contextual do Estúdio da Face 2D (substitui o inspetor lateral antigo). */
export function FaceStudioProperties(): ReactElement | null {
  const p = useProject();
  const faceView = useUi((s) => s.faceView);
  const fs = useUi((s) => s.faceStudio);
  const units = useUnits();
  const lang = useI18n((s) => s.lang);

  const el = faceView ? p.elements[faceView.elementId] : undefined;
  const paintable = isFacePaintableElement(el) ? el : null;
  const unwrapped = useMemo(
    () => (faceView && paintable ? unwrapElementFace(p, faceView.elementId, faceView.face, faceView.layer) : null),
    [p, faceView, paintable],
  );

  const entry = useMemo<FacePaintEntry | null>(() => {
    if (!faceView || !paintable) return null;
    return (
      findExactFacePaint(paintable.facePaints, faceView.face, faceView.layer) ?? {
        face: faceView.face,
        layer: faceView.layer,
      }
    );
  }, [faceView, paintable]);

  const baseMatId = entry && unwrapped ? (entry.materialId ?? unwrapped.defaultMaterialId) : '';

  const part = useMemo(() => {
    if (!unwrapped || !entry) return null;
    return partitionFacePaint(unwrapped.boundary, baseMatId, faceEntryToArtItems(entry, unwrapped.defaultMaterialId));
  }, [unwrapped, entry, baseMatId]);

  if (!faceView || !paintable || !unwrapped || !entry || !part) return null;

  const defaultMat = unwrapped.defaultMaterialId || Object.keys(p.materials)[0] || '';
  const effectiveMatId = fs.activeMaterialId && p.materials[fs.activeMaterialId] ? fs.activeMaterialId : defaultMat;

  const setFs = (patch: Partial<FaceStudioState>): void => {
    useUi.setState((s) => ({ faceStudio: { ...s.faceStudio, ...patch } }));
  };

  const commitEntry = (nextEntry: FacePaintEntry): void => {
    editor.store.exec({ type: 'setFacePaint', elementId: faceView.elementId, entry: nextEntry });
  };

  const clearFace = (): void => {
    editor.store.exec({ type: 'removeFacePaint', elementId: faceView.elementId, face: faceView.face, layer: faceView.layer });
    setFs({ selection: { kind: 'base' } });
  };

  const faces = availableFacesForElement(p, paintable);
  const layers = elementLayerOptions(p, paintable, lang);

  const totalArea = multiArea(unwrapped.boundary);
  const paintedArea = part.coplanar
    .filter((piece) => piece.materialId !== unwrapped.defaultMaterialId)
    .reduce((acc, piece) => acc + multiArea(piece.poly), 0);

  const regionId = fs.selection.kind === 'region' ? fs.selection.id : null;
  const dxfId = fs.selection.kind === 'dxf' ? fs.selection.id : null;
  const selectedRegion = regionId !== null
    ? (entry.regions ?? []).find((r) => r.id === regionId)
    : undefined;
  const selectedDxf = dxfId !== null
    ? (entry.dxfOverlays ?? []).find((d) => d.id === dxfId)
    : undefined;

  const hasContent = Boolean(
    entry.materialId || (entry.regions && entry.regions.length > 0) || (entry.dxfOverlays && entry.dxfOverlays.length > 0),
  );

  const kindLabel = isWall(paintable)
    ? (t(lang, 'fs_wall_face_studio'))
    : isFloor(paintable)
      ? (t(lang, 'fs_floor_face_studio'))
      : (t(lang, 'fs_slab_face_studio'));

  return (
    <>
      <div className="rv-stick">
        <div className="rv-head">
          <b>{kindLabel}</b>
          <span>{faceSlotLabel(faceView.face, lang)}</span>
        </div>
      </div>

      <Group title={t(lang, 'fs_face_draw')} stateKey="fs_face_draw">
        <Row label={t(lang, 'fs_face')} htmlFor="fs-prop-face">
          <FaceSelect
            id="fs-prop-face"
            value={faceView.face}
            options={faces.map((f) => ({ value: f.face, label: faceSlotLabel(f.face, lang) }))}
            onChange={(v) => openFaceStudioTab(faceView.elementId, v as FaceSlot, faceView.layer)}
          />
        </Row>
        <Row label={t(lang, 'fs_layer')} htmlFor="fs-prop-layer">
          <FaceSelect
            id="fs-prop-layer"
            value={faceView.layer === 'all' ? 'all' : String(faceView.layer)}
            options={[
              { value: 'all', label: t(lang, 'fs_all_layers') },
              ...layers.map((l) => ({ value: String(l.index), label: l.label })),
            ]}
            onChange={(raw) => {
              const nextLayer: FaceLayerTarget = raw === 'all' ? 'all' : Number(raw);
              openFaceStudioTab(faceView.elementId, faceView.face, nextLayer);
            }}
          />
        </Row>
        <Row label={t(lang, 'fs_active_material')} htmlFor="fs-prop-mat">
          <MatSelect
            id="fs-prop-mat"
            className="fs-mat-pick"
            value={effectiveMatId}
            materials={p.materials}
            onChange={(activeMaterialId) => setFs({ activeMaterialId })}
          />
        </Row>
        <Row label={t(lang, 'fs_draw_mode')} htmlFor="fs-prop-mode">
          <FaceSelect
            id="fs-prop-mode"
            value={fs.asBand ? 'band' : 'region'}
            options={[
              { value: 'region', label: t(lang, 'fs_filled_region') },
              { value: 'band', label: t(lang, 'fs_band_strip') },
            ]}
            onChange={(v) => setFs({ asBand: v === 'band' })}
          />
        </Row>
        {fs.asBand && (
          <Row label={t(lang, 'fs_band_width')} htmlFor="fs-prop-bw">
            <NumField id="fs-prop-bw" value={fs.bandWidth} quantity="smallLength" min={0.004} onCommit={(bandWidth) => setFs({ bandWidth })} />
          </Row>
        )}
        <Row label={t(lang, 'fs_snap_to_grid')} htmlFor="fs-prop-grid">
          <Check id="fs-prop-grid" checked={fs.snapGrid} onChange={(snapGrid) => setFs({ snapGrid })} />
        </Row>
        <div className="fs-insp-actions">
          <button type="button" className="btn danger small" disabled={!hasContent} onClick={clearFace}>
            {t(lang, 'fs_restore_clear_paint')}
          </button>
        </div>
      </Group>

      {selectedRegion ? (
        <RegionInspector
          region={selectedRegion}
          materials={p.materials}
          unwrapped={unwrapped}
          lang={lang}
          onPatch={(patch) =>
            commitEntry({
              ...entry,
              regions: (entry.regions ?? []).map((r) => (r.id === selectedRegion.id ? { ...r, ...patch } : r)),
            })
          }
          onDelete={() => {
            commitEntry({
              ...entry,
              regions: (entry.regions ?? []).filter((r) => r.id !== selectedRegion.id),
            });
            setFs({ selection: { kind: 'base' } });
          }}
          onBackToBase={() => setFs({ selection: { kind: 'base' } })}
        />
      ) : selectedDxf ? (
        <DxfInspector
          dxf={selectedDxf}
          materials={p.materials}
          defaultMatId={baseMatId}
          lang={lang}
          onPatch={(patch) =>
            commitEntry({
              ...entry,
              dxfOverlays: (entry.dxfOverlays ?? []).map((ov) => (ov.id === selectedDxf.id ? { ...ov, ...patch } : ov)),
            })
          }
          onDelete={() => {
            commitEntry({
              ...entry,
              dxfOverlays: (entry.dxfOverlays ?? []).filter((ov) => ov.id !== selectedDxf.id),
            });
            setFs({ selection: { kind: 'base' } });
          }}
          onBackToBase={() => setFs({ selection: { kind: 'base' } })}
        />
      ) : (
        <Group title={t(lang, 'fs_base_face')} stateKey="fs_base">
          <Row label={t(lang, 'fs_base_material')} htmlFor="fs-base-mat">
            <MatSelect
              id="fs-base-mat"
              value={baseMatId}
              materials={p.materials}
              onChange={(materialId) => commitEntry({ ...entry, materialId })}
            />
          </Row>
          <div className="fs-insp-actions">
            <button
              type="button"
              className="btn small"
              disabled={!entry.materialId}
              onClick={() => commitEntry({ ...entry, materialId: undefined })}
            >
              {t(lang, 'fs_restore_layer_material')}
            </button>
          </div>
        </Group>
      )}

      <Group title={t(lang, 'fs_face_items')} stateKey="fs_items">
        {(entry.regions?.length ?? 0) > 0 || (entry.dxfOverlays?.length ?? 0) > 0 ? (
          <div className="fs-item-list">
            {(entry.regions ?? []).map((r) => {
              const on = fs.selection.kind === 'region' && fs.selection.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`fs-item-row${on ? ' on' : ''}`}
                  onClick={() => setFs({ selection: { kind: 'region', id: r.id } })}
                >
                  <span className="fs-swatch" style={{ background: p.materials[r.materialId]?.color ?? '#ccc' }} />
                  <span>{r.name || (t(lang, 'fs_region'))}</span>
                  <span className="fs-item-tag">#{r.order}</span>
                </button>
              );
            })}
            {(entry.dxfOverlays ?? []).map((ov) => {
              const on = fs.selection.kind === 'dxf' && fs.selection.id === ov.id;
              return (
                <button
                  key={ov.id}
                  type="button"
                  className={`fs-item-row${on ? ' on' : ''}`}
                  onClick={() => setFs({ selection: { kind: 'dxf', id: ov.id } })}
                >
                  <span className="fs-swatch" style={{ background: p.materials[ov.materialId ?? baseMatId]?.color ?? '#999' }} />
                  <span>{ov.name}</span>
                  <span className="fs-item-tag">DXF</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="hint">{t(lang, 'fs_no_regions_or_dxf_on_this_face')}</div>
        )}
      </Group>

      <Group title={t(lang, 'fs_face_dimensions')} stateKey="fs_summary">
        <Row label={t(lang, 'fs_width')} readOnly>
          <span className="val">{formatQuantity(units, 'length', unwrapped.width, { lang })}</span>
        </Row>
        <Row label={t(lang, 'fs_height')} readOnly>
          <span className="val">{formatQuantity(units, 'length', unwrapped.height, { lang })}</span>
        </Row>
        <Row label={t(lang, 'fs_net_area')} readOnly>
          <span className="val">{formatQuantity(units, 'area', totalArea, { lang })}</span>
        </Row>
        <Row label={t(lang, 'fs_painted_area')} readOnly>
          <span className="val">{formatQuantity(units, 'area', paintedArea, { lang })}</span>
        </Row>
        {unwrapped.isCurved && unwrapped.curveRadius !== null && (
          <Row label={t(lang, 'fs_radius')} readOnly>
            <span className="val">{formatQuantity(units, 'length', unwrapped.curveRadius, { lang })}</span>
          </Row>
        )}
      </Group>
    </>
  );
}
