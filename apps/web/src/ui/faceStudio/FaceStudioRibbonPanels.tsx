import { useRef, type ChangeEvent, type ReactElement } from 'react';
import { v2 } from '@hestia/geom';
import { unwrapElementFace, type UnwrappedFace } from '@hestia/engine';
import { parseDxfText } from '@hestia/io';
import {
  findExactFacePaint,
  isFacePaintableElement,
  newId,
  type FaceDxfOverlay,
  type Id,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { t, useI18n, type Lang } from '../../editor/i18n.ts';
import { useUi, type FaceStudioShape } from '../../editor/state.ts';
import { activateView } from '../../editor/viewTabActions.ts';
import { Icon } from '../Icon.tsx';
import { PERIMETER_SHAPES } from '../perimeter/PerimeterRibbonPanels.tsx';
import { Ic, ShapeGallery, type PerimeterShape } from '../perimeter/ShapeGallery.tsx';
import '../perimeter/perimeter.css';

const FACE_SHAPE_IDS = new Set<PerimeterShape>([
  'line',
  'rect',
  'poly-inscribed',
  'poly-circumscribed',
  'circle',
  'arc-3pt',
  'arc-center',
  'arc-tangent',
  'ellipse',
]);

const FACE_SHAPES = PERIMETER_SHAPES.filter((s) => FACE_SHAPE_IDS.has(s.id));

function buildDxfOverlay(
  text: string,
  fileName: string,
  unwrapped: UnwrappedFace,
  materialId: Id,
  lang: Lang,
): FaceDxfOverlay | null {
  const parsed = parseDxfText(text, fileName.replace(/\.dxf$/i, ''), lang);
  const validPaths = parsed.paths.filter((path) => path.pts.length >= 2);
  if (validPaths.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of validPaths) {
    for (const pt of path.pts) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dxfW = Math.max(1e-4, maxX - minX);
  const dxfH = Math.max(1e-4, maxY - minY);
  const faceW = Math.max(0.1, unwrapped.width);
  const faceH = Math.max(0.1, unwrapped.height);
  const needsFit = dxfW > faceW || dxfH > faceH || (dxfW < 0.01 && dxfH < 0.01);
  const scale = needsFit ? Math.min((faceW * 0.85) / dxfW, (faceH * 0.85) / dxfH) : 1;

  return {
    id: newId('dxf'),
    name: parsed.name || 'DXF',
    paths: validPaths.map((path) => ({
      closed: path.closed,
      pts: path.pts.map((pt) => v2(pt.x - cx, pt.y - cy)),
    })),
    offset: v2(unwrapped.width / 2, unwrapped.height / 2),
    rotationDeg: 0,
    scale,
    separatorWidth: 0.01,
    materialId,
    baseOffset: 0,
    thickness: 0,
  };
}

/** Painéis da aba contextual do Estúdio da Face 2D na faixa de ferramentas. */
export function FaceStudioRibbonPanels(): ReactElement {
  const p = useProject();
  const faceView = useUi((s) => s.faceView);
  const fs = useUi((s) => s.faceStudio);
  const lang = useI18n((s) => s.lang);
  const fileRef = useRef<HTMLInputElement>(null);

  const el = faceView ? p.elements[faceView.elementId] : undefined;
  const paintable = isFacePaintableElement(el) ? el : null;
  const unwrapped = faceView && paintable ? unwrapElementFace(p, faceView.elementId, faceView.face, faceView.layer) : null;
  const entry = faceView && paintable
    ? (findExactFacePaint(paintable.facePaints, faceView.face, faceView.layer) ?? { face: faceView.face, layer: faceView.layer })
    : null;
  const defaultMat = unwrapped?.defaultMaterialId || Object.keys(p.materials)[0] || '';
  const effectiveMatId = fs.activeMaterialId && p.materials[fs.activeMaterialId] ? fs.activeMaterialId : defaultMat;

  const handleDxfFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !faceView || !unwrapped || !entry) return;
    const text = await file.text();
    const overlay = buildDxfOverlay(text, file.name, unwrapped, effectiveMatId, lang);
    if (!overlay) {
      useUi.setState({ status: t(lang, 'fs_dxf_has_no_importable_paths') });
      return;
    }
    editor.store.exec({
      type: 'setFacePaint',
      elementId: faceView.elementId,
      entry: { ...entry, dxfOverlays: [...(entry.dxfOverlays ?? []), overlay] },
    });
    useUi.setState((s) => ({
      faceStudio: { ...s.faceStudio, tool: 'select', selection: { kind: 'dxf', id: overlay.id } },
    }));
  };

  return (
    <>
      <div className="rb-panel" role="group" aria-label={t(lang, 'fs_select_paint')}>
        <div className="rb-cols">
          <button
            type="button"
            className={`rb-btn rb-large${fs.tool === 'select' ? ' on' : ''}`}
            aria-pressed={fs.tool === 'select'}
            title={t(lang, 'fs_select_region_or_dxf')}
            onClick={() => useUi.setState((s) => ({ faceStudio: { ...s.faceStudio, tool: 'select' } }))}
          >
            <Icon name="select" size={32} />
            <span className="rb-lbl">{t(lang, 'fs_select')}</span>
          </button>
          <button
            type="button"
            className={`rb-btn rb-large${fs.tool === 'paintBucket' ? ' on' : ''}`}
            aria-pressed={fs.tool === 'paintBucket'}
            title={t(lang, 'fs_paint_bucket')}
            onClick={() => useUi.setState((s) => ({ faceStudio: { ...s.faceStudio, tool: 'paintBucket' } }))}
          >
            <Icon name="paintBucket" size={32} />
            <span className="rb-lbl">{t(lang, 'fs_paint_bucket')}</span>
          </button>
          <input ref={fileRef} type="file" accept=".dxf" hidden onChange={(e) => { void handleDxfFile(e); }} />
          <button
            type="button"
            className="rb-btn rb-large"
            disabled={!unwrapped}
            title={t(lang, 'fs_import_dxf_paths_onto_face')}
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="open" size={32} />
            <span className="rb-lbl">{t(lang, 'fs_import_dxf')}</span>
          </button>
        </div>
        <div className="rb-title">{t(lang, 'fs_select_paint')}</div>
      </div>

      <div className="rb-panel" role="group" aria-label={t(lang, 'fs_draw')}>
        <div className="rb-cols">
          <div className="rb-stack">
            <button
              type="button"
              className={`rb-btn rb-small${!fs.asBand ? ' on' : ''}`}
              aria-pressed={!fs.asBand}
              title={t(lang, 'fs_filled_region')}
              onClick={() => useUi.setState((s) => ({ faceStudio: { ...s.faceStudio, asBand: false } }))}
            >
              <Ic size={16}>
                <path className="ic-bl" d="M4 6H28V26H4Z" />
                <path className="ic-s1" d="M4 6H28V26H4Z" />
              </Ic>
              <span className="rb-lbl">{t(lang, 'fs_filled_region')}</span>
            </button>
            <button
              type="button"
              className={`rb-btn rb-small${fs.asBand ? ' on' : ''}`}
              aria-pressed={fs.asBand}
              title={t(lang, 'fs_band_strip')}
              onClick={() => useUi.setState((s) => ({ faceStudio: { ...s.faceStudio, asBand: true } }))}
            >
              <Ic size={16}>
                <path className="ic-s1" d="M4 11H28V21H4Z" />
                <path className="ic-ac" d="M4 16H28" strokeDasharray="3 2" />
              </Ic>
              <span className="rb-lbl">{t(lang, 'fs_band_strip')}</span>
            </button>
          </div>
          <ShapeGallery
            shapes={FACE_SHAPES}
            selected={fs.tool === 'shape' ? fs.shape : null}
            onSelect={(id) =>
              useUi.setState((s) => ({
                faceStudio: { ...s.faceStudio, tool: 'shape', shape: id as FaceStudioShape },
              }))
            }
          />
        </div>
        <div className="rb-title">{t(lang, 'fs_draw')}</div>
      </div>

      <div className="rb-panel" role="group" aria-label={t(lang, 'fs_mode')}>
        <div className="rb-cols">
          <button
            type="button"
            className="rb-btn rb-large"
            title={t(lang, 'fs_finish_face_editing_and_return_to_3d')}
            aria-label={t(lang, 'fs_finish')}
            onClick={() => activateView({ kind: '3d' })}
          >
            <Ic size={32}>
              <path d="M5 17L12.5 24.5L27 7" fill="none" style={{ stroke: 'var(--revit-green)' }} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            </Ic>
            <span className="rb-lbl">{t(lang, 'fs_finish')}</span>
          </button>
        </div>
        <div className="rb-title">{t(lang, 'fs_mode')}</div>
      </div>
    </>
  );
}
