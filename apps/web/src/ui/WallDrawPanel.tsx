import type { ReactElement } from 'react';
import type { ToolOptions } from '@hestia/tools';
import { t, useT } from '../editor/i18n.ts';
import { PERIMETER_SHAPES } from './perimeter/PerimeterRibbonPanels.tsx';
import { Ic, ShapeGallery, type ShapeDef } from './perimeter/ShapeGallery.tsx';
import { wallGalleryOf, wallGalleryPatch, type WallGalleryId } from './wallModes.ts';

const fromPerimeter = (id: Exclude<WallGalleryId, 'spline'>): ShapeDef<WallGalleryId> => {
  const s = PERIMETER_SHAPES.find((x) => x.id === id)!;
  return { id, label: s.label, isNew: s.isNew, icon: s.icon };
};

/** Formas da Parede: as da galeria do perímetro que valem para parede, mais a spline (só aqui). Sem filete, face, perímetro e ambiente. */
export const WALL_SHAPES: readonly ShapeDef<WallGalleryId>[] = [
  { ...fromPerimeter('line'), isNew: false },
  fromPerimeter('rect'),
  fromPerimeter('poly-inscribed'),
  fromPerimeter('poly-circumscribed'),
  fromPerimeter('circle'),
  fromPerimeter('arc-3pt'),
  fromPerimeter('arc-center'),
  fromPerimeter('arc-tangent'),
  fromPerimeter('ellipse'),
  {
    id: 'spline', label: t('pt', 'pro_pm_shape_spline'), isNew: true,
    icon: <><path className="ic-s1" d="M3 22C9 6 14 6 16 16S24 26 29 10" /><rect className="ic-bl" x="1" y="20" width="4" height="4" /><rect className="ic-bl" x="27" y="8" width="4" height="4" /></>,
  },
];

/** Painel "Desenhar" da ferramenta Parede: a mesma galeria do modo de perímetro, ligada à opção `wallShape`. */
export function WallDrawPanel({ options, onPatch }: { options: ToolOptions; onPatch: (patch: Partial<ToolOptions>) => void }): ReactElement {
  const { t } = useT();
  return (
    <div className="rb-panel" role="group" aria-label={t('pro_pm_panel_draw')}>
      <div className="rb-cols">
        <ShapeGallery shapes={WALL_SHAPES} selected={wallGalleryOf(options)} onSelect={(id) => onPatch(wallGalleryPatch(id))} />
      </div>
      <div className="rb-title">{t('pro_pm_panel_draw')}</div>
    </div>
  );
}
