import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { unwrapElementFace } from '@hestia/engine';
import {
  findExactFacePaint,
  isFacePaintableElement,
  type FaceLayerTarget,
  type FacePaintEntry,
  type FaceSlot,
  type Id,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useI18n } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { activateView } from '../../editor/viewTabActions.ts';
import { FaceStudioCanvas, type FaceStudioCanvasHandle } from './FaceStudioCanvas.tsx';
import './faceStudio.css';

export function FaceStudioView({
  elementId,
  face,
  layer,
}: {
  elementId: Id;
  face: FaceSlot;
  layer: FaceLayerTarget;
}): ReactElement | null {
  const p = useProject();
  const lang = useI18n((s) => s.lang);
  const pt = lang === 'pt';

  const el = p.elements[elementId];
  const paintable = isFacePaintableElement(el) ? el : null;
  const unwrapped = useMemo(
    () => (paintable ? unwrapElementFace(p, elementId, face, layer) : null),
    [p, paintable, elementId, face, layer],
  );

  const entry: FacePaintEntry = useMemo(
    () => findExactFacePaint(paintable?.facePaints, face, layer) ?? { face, layer },
    [paintable?.facePaints, face, layer],
  );

  const canvasHandle = useRef<FaceStudioCanvasHandle>(null);

  useEffect(() => {
    useUi.setState((s) => ({ faceStudio: { ...s.faceStudio, selection: { kind: 'base' } } }));
  }, [elementId, face, layer]);

  const commitEntry = useCallback(
    (nextEntry: FacePaintEntry): void => {
      editor.store.exec({ type: 'setFacePaint', elementId, entry: nextEntry });
    },
    [elementId],
  );

  if (!paintable || !unwrapped) {
    return (
      <div className="fs-root">
        <div className="fs-empty">
          <p>{pt ? 'Elemento ou face não encontrado.' : 'Element or face not found.'}</p>
          <button type="button" className="btn primary" onClick={() => activateView({ kind: '3d' })}>
            {pt ? 'Voltar ao 3D' : 'Back to 3D'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fs-root">
      <div className="fs-body">
        <FaceStudioCanvas
          canvasRefHandle={canvasHandle}
          unwrapped={unwrapped}
          entry={entry}
          materials={p.materials}
          onChangeEntry={commitEntry}
        />

        <div className="fs-zoom-float" role="group" aria-label={pt ? 'Controle de zoom' : 'Zoom controls'}>
          <button
            type="button"
            className="btn small"
            title={pt ? 'Aproximar' : 'Zoom in'}
            aria-label={pt ? 'Aproximar' : 'Zoom in'}
            onClick={() => canvasHandle.current?.zoomIn()}
          >
            +
          </button>
          <button
            type="button"
            className="btn small"
            title={pt ? 'Afastar' : 'Zoom out'}
            aria-label={pt ? 'Afastar' : 'Zoom out'}
            onClick={() => canvasHandle.current?.zoomOut()}
          >
            −
          </button>
          <button
            type="button"
            className="btn small"
            title={pt ? 'Enquadrar face' : 'Fit face'}
            onClick={() => canvasHandle.current?.zoomFit()}
          >
            {pt ? 'Enquadrar' : 'Fit'}
          </button>
        </div>
      </div>
    </div>
  );
}
