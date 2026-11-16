import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { ToolId, ToolOptions } from '@hestia/tools';
import { useT, type Dict } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { PERIMETER_SHAPES, type PerimeterShape } from '../perimeter/PerimeterRibbonPanels.tsx';

/** A Parede tem o painel próprio (`WallDrawPanel`, modos da ferramenta com polígono, elipse e spline). */
export type GalleryDrawTool = 'beam' | 'detailLine';

interface DrawShapeChoice {
  value: string;
  shapeId: PerimeterShape;
  labelKey: keyof Dict;
}

interface DrawGallerySpec {
  optionKey: 'beamShape' | 'detailLineShape';
  defaultValue: string;
  items: readonly DrawShapeChoice[];
}

const DRAW_GALLERIES: Record<GalleryDrawTool, DrawGallerySpec> = {
  beam: {
    optionKey: 'beamShape',
    defaultValue: 'line',
    items: [
      { value: 'line', shapeId: 'line', labelKey: 'pro_pm_shape_line' },
      { value: 'rect', shapeId: 'rect', labelKey: 'pro_pm_shape_rect' },
      { value: 'poly-inscribed', shapeId: 'poly-inscribed', labelKey: 'pro_pm_shape_poly_in' },
      { value: 'poly-circumscribed', shapeId: 'poly-circumscribed', labelKey: 'pro_pm_shape_poly_circ' },
      { value: 'circle', shapeId: 'circle', labelKey: 'pro_pm_shape_circle' },
      { value: 'arc', shapeId: 'arc-3pt', labelKey: 'pro_pm_shape_arc3' },
      { value: 'arc-center', shapeId: 'arc-center', labelKey: 'pro_pm_shape_arc_center' },
      { value: 'arc-tangent', shapeId: 'arc-tangent', labelKey: 'pro_pm_shape_arc_tangent' },
      { value: 'ellipse', shapeId: 'ellipse', labelKey: 'pro_pm_shape_ellipse' },
      { value: 'pick-face', shapeId: 'pick-face', labelKey: 'pro_pm_shape_pick_face' },
    ],
  },
  detailLine: {
    optionKey: 'detailLineShape',
    defaultValue: 'line',
    items: [
      { value: 'line', shapeId: 'line', labelKey: 'pro_pm_shape_line' },
      { value: 'rect', shapeId: 'rect', labelKey: 'pro_pm_shape_rect' },
      { value: 'poly-inscribed', shapeId: 'poly-inscribed', labelKey: 'pro_pm_shape_poly_in' },
      { value: 'poly-circumscribed', shapeId: 'poly-circumscribed', labelKey: 'pro_pm_shape_poly_circ' },
      { value: 'circle', shapeId: 'circle', labelKey: 'pro_pm_shape_circle' },
      { value: 'arc', shapeId: 'arc-3pt', labelKey: 'pro_pm_shape_arc3' },
      { value: 'arc-center', shapeId: 'arc-center', labelKey: 'pro_pm_shape_arc_center' },
      { value: 'arc-tangent', shapeId: 'arc-tangent', labelKey: 'pro_pm_shape_arc_tangent' },
      { value: 'ellipse', shapeId: 'ellipse', labelKey: 'pro_pm_shape_ellipse' },
    ],
  },
};

const SHAPE_ICONS = new Map<PerimeterShape, ReactNode>(PERIMETER_SHAPES.map((s) => [s.id, s.icon]));

export function isGalleryDrawTool(tool: ToolId): tool is GalleryDrawTool {
  return tool === 'beam' || tool === 'detailLine';
}

const cls = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(' ');
const STEP = 30;

/** Painel "Desenhar" compartilhado com a galeria `.pm-galbox` do perímetro para ferramentas lineares/formas geométricas. */
export function DrawGalleryPanel({ tool }: { tool: GalleryDrawTool }): ReactElement {
  const { t } = useT();
  const options = useUi((s) => s.options);
  const galRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const spec = DRAW_GALLERIES[tool];
  const current = (options[spec.optionKey] as string | undefined) ?? spec.defaultValue;
  const scroll = (dy: number): void => galRef.current?.scrollBy({ top: dy, behavior: 'smooth' });
  const galleryTitle = expanded ? t('pro_pm_gallery_collapse') : t('pro_pm_gallery_expand');
  const setOption = (value: string): void => {
    useUi.setState((s) => ({ options: { ...s.options, [spec.optionKey]: value } as ToolOptions }));
  };

  return (
    <div className="rb-panel" role="group" aria-label={t('pro_pm_panel_draw')}>
      <div className="rb-cols">
        <div className={cls('pm-galbox', expanded && 'pm-expanded')} role="group" aria-label={t('pro_pm_shapes_aria')}>
          <div className="pm-gal" ref={galRef}>
            {spec.items.map((item) => {
              const label = t(item.labelKey);
              const on = current === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={cls('pm-gi', on && 'on')}
                  title={label}
                  aria-label={label}
                  aria-pressed={on}
                  onClick={(e) => { setOption(item.value); e.currentTarget.blur(); }}
                >
                  <svg className="ic" width={20} height={20} viewBox="0 0 32 32" aria-hidden="true">
                    {SHAPE_ICONS.get(item.shapeId)}
                  </svg>
                </button>
              );
            })}
          </div>
          <div className="pm-gscroll">
            <button type="button" title={t('pro_pm_scroll_up')} aria-label={t('pro_pm_scroll_up')} onClick={() => scroll(-STEP)}>▴</button>
            <button type="button" title={t('pro_pm_scroll_down')} aria-label={t('pro_pm_scroll_down')} onClick={() => scroll(STEP)}>▾</button>
            <button
              type="button"
              title={galleryTitle}
              aria-label={galleryTitle}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              ▾
            </button>
          </div>
        </div>
      </div>
      <div className="rb-title">{t('pro_pm_panel_draw')}</div>
    </div>
  );
}
