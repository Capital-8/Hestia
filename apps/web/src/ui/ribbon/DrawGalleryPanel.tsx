import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { editor } from '../../editor/controller.ts';
import type { ToolId, ToolOptions } from '@hestia/tools';
import { useT, type Dict } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { PERIMETER_SHAPES, type PerimeterShape } from '../perimeter/PerimeterRibbonPanels.tsx';
import { WALL_SHAPES } from '../WallDrawPanel.tsx';
import { editorDeTerreno, topografiaAtiva } from '../terrainActions.ts';

/** A Parede tem o painel próprio (`WallDrawPanel`, modos da ferramenta com polígono, elipse e spline). */
export type GalleryDrawTool = 'beam' | 'detailLine' | 'terrain' | 'terrainEdit';

interface DrawShapeChoice {
  value: string;
  shapeId: PerimeterShape | 'spline';
  labelKey: keyof Dict;
}

interface DrawGallerySpec {
  optionKey: 'beamShape' | 'detailLineShape' | 'terrainShape';
  defaultValue: string;
  items: readonly DrawShapeChoice[];
}

/** Formas das curvas de nível da Topografia: as da Parede (o terreno guarda polilinhas, discretizadas ao concluir) e a spline por pontos. */
const TERRAIN_ITEMS: readonly DrawShapeChoice[] = [
  { value: 'line', shapeId: 'line', labelKey: 'pro_pm_shape_line' },
  { value: 'arc', shapeId: 'arc-3pt', labelKey: 'pro_pm_shape_arc3' },
  { value: 'arc-center', shapeId: 'arc-center', labelKey: 'pro_pm_shape_arc_center' },
  { value: 'arc-tangent', shapeId: 'arc-tangent', labelKey: 'pro_pm_shape_arc_tangent' },
  { value: 'circle', shapeId: 'circle', labelKey: 'pro_pm_shape_circle' },
  { value: 'ellipse', shapeId: 'ellipse', labelKey: 'pro_pm_shape_ellipse' },
  { value: 'rect', shapeId: 'rect', labelKey: 'pro_pm_shape_rect' },
  { value: 'poly-inscribed', shapeId: 'poly-inscribed', labelKey: 'pro_pm_shape_poly_in' },
  { value: 'poly-circumscribed', shapeId: 'poly-circumscribed', labelKey: 'pro_pm_shape_poly_circ' },
  { value: 'spline', shapeId: 'spline', labelKey: 'pro_pm_shape_spline' },
];

const DRAW_GALLERIES: Record<GalleryDrawTool, DrawGallerySpec> = {
  terrain: { optionKey: 'terrainShape', defaultValue: 'line', items: TERRAIN_ITEMS },
  terrainEdit: { optionKey: 'terrainShape', defaultValue: 'line', items: TERRAIN_ITEMS },
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

const SHAPE_ICONS = new Map<string, ReactNode>([...PERIMETER_SHAPES, ...WALL_SHAPES.filter((s) => s.id === 'spline')].map((s) => [s.id, s.icon]));

export function isGalleryDrawTool(tool: ToolId): tool is GalleryDrawTool {
  return tool === 'beam' || tool === 'detailLine' || tool === 'terrain' || tool === 'terrainEdit';
}

const cls = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(' ');
const STEP = 30;

/** Painel "Desenhar" compartilhado com a galeria `.pm-galbox` do perímetro para ferramentas lineares/formas geométricas. */
export function DrawGalleryPanel({ tool }: { tool: GalleryDrawTool }): ReactElement {
  const { t } = useT();
  const options = useUi((s) => s.options);
  useUi((s) => s.previewTick);
  const galRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const spec = DRAW_GALLERIES[tool];
  const current = (options[spec.optionKey] as string | undefined) ?? spec.defaultValue;
  const scroll = (dy: number): void => galRef.current?.scrollBy({ top: dy, behavior: 'smooth' });
  const galleryTitle = expanded ? t('pro_pm_gallery_collapse') : t('pro_pm_gallery_expand');
  const setOption = (value: string): void => {
    useUi.setState((s) => ({ options: { ...s.options, [spec.optionKey]: value } as ToolOptions }));
  };

  // Topografia: só o modo de curvas (e, no Editar terreno, o submodo Curva) tem formas.
  if ((tool === 'terrain' && topografiaAtiva(editor)?.modoAtual === 'pontos') || (tool === 'terrainEdit' && editorDeTerreno(editor)?.modoAtual !== 'curva')) return <></>;
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
