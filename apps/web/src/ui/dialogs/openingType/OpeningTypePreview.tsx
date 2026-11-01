import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import type { OpeningCheck } from '@hestia/engine';
import type { OpeningLineConvention, OpeningType } from '@hestia/model';
import { NumField } from '../../fields.tsx';
import { Preview3D } from './Preview3D.tsx';
import { previewElevationSvg, previewPlanSvg, previewSectionFrames } from './previewViews.ts';

export type PreviewTab = 'plan' | 'elevation' | 'section' | 'lines3d' | 'shaded3d';

const TABS: ReadonlyArray<{ id: PreviewTab; label: string }> = [
  { id: 'plan', label: 'Planta' },
  { id: 'elevation', label: 'Elevação' },
  { id: 'section', label: 'Corte' },
  { id: 'lines3d', label: '3D linhas' },
  { id: 'shaded3d', label: '3D sombreado' },
];

interface OpeningTypePreviewProps {
  d: OpeningType;
  tab: PreviewTab;
  onTab: (tab: PreviewTab) => void;
  flipHand: boolean;
  flipFacing: boolean;
  onFlipHand: () => void;
  onFlipFacing: () => void;
  angle: number;
  onAngle: (angle: number) => void;
  checks: readonly OpeningCheck[];
  /** Convenção do V do projeto real (decisão 0034 §2); ausente usa o padrão. */
  openingLine?: OpeningLineConvention;
}

/** Atraso do redesenho da prévia (ms): a digitação nos campos nunca espera o desenho. */
const PREVIEW_DEBOUNCE_MS = 60;

/** Tamanho interno dos SVGs da prévia: a área é 4:3 e ampliada (coluna de 460 px, altura mínima de 340 px). */
const PREVIEW_W = 440;
const PREVIEW_H = 330;

/** SVG da prévia 2D pelo mesmo pipeline das vistas do projeto; erro no dado vira aviso, não quebra o diálogo. */
function previewSvg(
  tab: PreviewTab,
  d: OpeningType,
  flipHand: boolean,
  flipFacing: boolean,
  angle: number,
  openingLine: OpeningLineConvention | undefined,
): string {
  try {
    if (tab === 'plan') return previewPlanSvg(d, { flipHand, flipFacing, angle, openingLine, width: PREVIEW_W, height: PREVIEW_H });
    return previewElevationSvg(d, { flipHand, flipFacing, openingLine, width: PREVIEW_W, height: PREVIEW_H });
  } catch {
    return '';
  }
}

/**
 * Coluna de prévia: as cinco vistas desenhadas pelos pipelines do projeto (planta, seção e a cena 3D), os controles de
 * dobradiça/sentido/ângulo (estado da prévia, não do tipo) e a faixa de verificações.
 */
export function OpeningTypePreview({
  d,
  tab,
  onTab,
  flipHand,
  flipFacing,
  onFlipHand,
  onFlipFacing,
  angle,
  onAngle,
  checks,
  openingLine,
}: OpeningTypePreviewProps): ReactElement {
  // O renderizador WebGL é único para o diálogo: nasce com a prévia (o diálogo aberto) e é descartado ao fechar.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') {
      setWebglFailed(true);
      return;
    }
    try {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      rendererRef.current = r;
      setRenderer(r);
    } catch {
      setWebglFailed(true);
    }
    return () => {
      const r = rendererRef.current;
      rendererRef.current = null;
      r?.dispose();
      r?.domElement.remove();
    };
  }, []);
  // Redesenho com debounce: o rascunho pode mudar a cada tecla, mas a prévia só refaz 60 ms depois.
  const [debounced, setDebounced] = useState(d);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(d), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [d]);
  const is3d = tab === 'lines3d' || tab === 'shaded3d';
  const noWebgl = webglFailed || typeof document === 'undefined';
  const svg = useMemo(
    () => (is3d || tab === 'section' ? '' : previewSvg(tab, debounced, flipHand, flipFacing, angle, openingLine)),
    [debounced, tab, is3d, flipHand, flipFacing, angle, openingLine],
  );
  // O corte vira três quadros (inteiro + cabeça + soleira), todos pelo pipeline de seção do projeto.
  const sectionFrames = useMemo(() => {
    if (tab !== 'section') return null;
    try {
      return previewSectionFrames(debounced, {
        flipHand,
        flipFacing,
        openingLine,
        width: PREVIEW_W,
        height: PREVIEW_H,
      });
    } catch {
      return null;
    }
  }, [debounced, tab, flipHand, flipFacing, openingLine]);
  return (
    <aside className="op-preview" aria-label="Pré-visualização do tipo">
      <div className="op-tabs" role="tablist" aria-label="Vistas da prévia">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`op-tab${t.id === tab ? ' on' : ''}`}
            aria-selected={t.id === tab}
            title={t.label}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="op-pv-box" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label ?? 'Prévia'}>
        {is3d ? (
          noWebgl ? (
            <div className="op-pv-soon">3D indisponível neste navegador</div>
          ) : (
            <Preview3D
              renderer={renderer}
              type={debounced}
              style={tab === 'lines3d' ? 'lines' : 'shaded'}
              angle={angle}
              flipHand={flipHand}
              flipFacing={flipFacing}
              active={is3d}
            />
          )
        ) : tab === 'section' && sectionFrames ? (
          <div className="op-section-frames">
            <figure className="op-frame">
              <div className="op-frame-svg" dangerouslySetInnerHTML={{ __html: sectionFrames[0]!.svg }} />
              <figcaption>{sectionFrames[0]!.title}</figcaption>
            </figure>
            <div className="op-frame-details">
              {sectionFrames.slice(1).map((f) => (
                <figure key={f.id} className="op-frame">
                  <div className="op-frame-svg" dangerouslySetInnerHTML={{ __html: f.svg }} />
                  <figcaption>{f.title}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : svg ? (
          <div style={{ width: '100%', height: '100%', minHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="op-pv-soon">Prévia indisponível</div>
        )}
      </div>
      <div className="op-pv-actions">
        <button type="button" className="btn small" aria-pressed={flipHand} onClick={onFlipHand}>Inverter dobradiça</button>
        <button type="button" className="btn small" aria-pressed={flipFacing} onClick={onFlipFacing}>Inverter sentido</button>
        <label htmlFor="op-pv-angle">Ângulo</label>
        <NumField id="op-pv-angle" value={(angle * Math.PI) / 180} quantity="angle" onCommit={(v) => onAngle((v * 180) / Math.PI)} />
      </div>
      <div className="op-pv-state">
        <span>Dobradiça: {flipHand ? 'direita' : 'esquerda'}</span>
        <span>Sentido: {flipFacing ? 'oposto' : 'padrão'}</span>
      </div>
      <div className="op-checks" aria-label="Verificações">
        <div className="op-checks-title">Verificações</div>
        {checks.length === 0 ? <p className="hint">Sem verificações.</p> : (
          <ul>
            {checks.map((c, i) => (
              <li key={`${c.level}-${i}`} className={c.level}>
                <span className="op-check-mark" aria-hidden="true">{c.level === 'ok' ? '✓' : '!'}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
