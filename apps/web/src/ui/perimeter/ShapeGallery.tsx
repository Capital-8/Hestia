import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { SketchTarget } from '@hestia/geom';
import { type Dict, useT } from '../../editor/i18n.ts';

/** Forma da galeria "Desenhar". `isNew` marca o que o programa ainda não tem (ponto azul no canto). */
export type PerimeterShape =
  | 'line' | 'rect' | 'poly-inscribed' | 'poly-circumscribed' | 'circle' | 'arc-3pt' | 'arc-center' | 'arc-tangent'
  | 'fillet' | 'ellipse' | 'pick-face' | 'by-perimeter' | 'pick-room';

/** Ids que a galeria sabe rotular: as do perímetro e a spline (só da parede). */
export type GalleryShapeId = PerimeterShape | 'spline';

export interface ShapeDef<I extends string = PerimeterShape> {
  id: I;
  label: string;
  isNew: boolean;
  icon: ReactNode;
  /** Alvos que mostram a forma. Ausente = todos. */
  targets?: readonly SketchTarget[];
}

/** Chave do dicionário de cada forma da galeria. */
export const SHAPE_KEY: Record<GalleryShapeId, keyof Dict> = {
  line: 'pro_pm_shape_line',
  rect: 'pro_pm_shape_rect',
  'poly-inscribed': 'pro_pm_shape_poly_in',
  'poly-circumscribed': 'pro_pm_shape_poly_circ',
  circle: 'pro_pm_shape_circle',
  'arc-3pt': 'pro_pm_shape_arc3',
  'arc-center': 'pro_pm_shape_arc_center',
  'arc-tangent': 'pro_pm_shape_arc_tangent',
  fillet: 'pro_pm_shape_fillet',
  ellipse: 'pro_pm_shape_ellipse',
  'pick-face': 'pro_pm_shape_pick_face',
  'by-perimeter': 'pro_pm_shape_by_perimeter',
  'pick-room': 'pro_pm_shape_pick_room',
  spline: 'pro_pm_shape_spline',
};

export const cls = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(' ');

/** Ícone 32×32 no estilo da faixa: as cores vêm das classes `ic-*` de styles.css. */
export function Ic({ size = 20, children }: { size?: number; children: ReactNode }): ReactElement {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Passo de rolagem da galeria (uma linha de 30 px, com folga). */
const STEP = 30;

export interface ShapeGalleryProps<I extends GalleryShapeId> {
  shapes: readonly ShapeDef<I>[];
  /** Forma marcada; null com nenhuma (ex.: um comando de Modificar ativo). */
  selected: I | null;
  onSelect: (id: I) => void;
}

/** Galeria de formas em caixa com rolagem (ícones 32×32, ponto azul nas novas). Usada pelo perímetro e pela Parede. */
export function ShapeGallery<I extends GalleryShapeId>({ shapes, selected, onSelect }: ShapeGalleryProps<I>): ReactElement {
  const { t } = useT();
  const galRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const scroll = (dy: number): void => galRef.current?.scrollBy({ top: dy, behavior: 'smooth' });
  const galleryTitle = expanded ? t('pro_pm_gallery_collapse') : t('pro_pm_gallery_expand');
  return (
    <div className={cls('pm-galbox', expanded && 'pm-expanded')} role="group" aria-label={t('pro_pm_shapes_aria')}>
      <div className="pm-gal" ref={galRef}>
        {shapes.map((s) => (
          <button
            key={s.id}
            className={cls('pm-gi', s.isNew && 'new', selected === s.id && 'on')}
            title={t(SHAPE_KEY[s.id])}
            aria-label={t(SHAPE_KEY[s.id])}
            aria-pressed={selected === s.id}
            onClick={() => onSelect(s.id)}
          >
            <Ic>{s.icon}</Ic>
          </button>
        ))}
      </div>
      <div className="pm-gscroll">
        <button type="button" title={t('pro_pm_scroll_up')} aria-label={t('pro_pm_scroll_up')} onClick={() => scroll(-STEP)}>▴</button>
        <button type="button" title={t('pro_pm_scroll_down')} aria-label={t('pro_pm_scroll_down')} onClick={() => scroll(STEP)}>▾</button>
        <button type="button" title={galleryTitle} aria-label={galleryTitle} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          ▿
        </button>
      </div>
    </div>
  );
}
