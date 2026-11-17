import type { ReactElement } from 'react';
import type { ToolOptions } from '@hestia/tools';
import { useT } from '../editor/i18n.ts';
import { NumField } from './fields.tsx';
import { wallModeOf } from './wallModes.ts';

/**
 * Ajustes do modo de parede que pedem número: lados do polígono (3 a 64) e tolerância do ajuste a arcos da elipse e da
 * spline (1 a 50 mm; o padrão 5 mm vale como 0,005 m). Reexportado por OptionsBar.tsx para os testes.
 */
export function WallShapeFields({ o, set }: { o: ToolOptions; set: (patch: Partial<ToolOptions>) => void }): ReactElement | null {
  const { t } = useT();
  const modo = wallModeOf(o);
  if (modo === 'polygonIn' || modo === 'polygonOut') {
    return (
      <label>
        {t('pro_poly_sides')}
        <NumField id="opt-poly-sides" value={o.wallPolygonSides ?? 6} decimals={0} min={3} max={64} onCommit={(v) => set({ wallPolygonSides: Math.min(64, Math.max(3, Math.round(v))) })} />
      </label>
    );
  }
  if (modo === 'ellipse' || modo === 'spline') {
    return (
      <label>
        {t('pro_fit_tol')}
        <NumField id="opt-fit-tol" value={o.wallFitTol ?? 0.005} quantity="smallLength" min={0.001} onCommit={(v) => set({ wallFitTol: Math.min(0.05, Math.max(0.001, v)) })} />
      </label>
    );
  }
  return null;
}

/**
 * Lados do polígono da linha de detalhe (3 a 64, padrão 6), só com a forma inscrita ou circunscrita. Mesmo padrão do
 * campo de lados da Parede (`WallShapeFields`). Exportado para a barra de opções e os testes.
 */
export function DetailShapeFields({ o, set }: { o: ToolOptions; set: (patch: Partial<ToolOptions>) => void }): ReactElement | null {
  const { t } = useT();
  if (o.detailLineShape !== 'poly-inscribed' && o.detailLineShape !== 'poly-circumscribed') return null;
  return (
    <label>
      {t('pro_poly_sides')}
      <NumField id="opt-dl-sides" value={o.detailLinePolygonSides ?? 6} decimals={0} min={3} max={64} onCommit={(v) => set({ detailLinePolygonSides: Math.min(64, Math.max(3, Math.round(v))) })} />
    </label>
  );
}
