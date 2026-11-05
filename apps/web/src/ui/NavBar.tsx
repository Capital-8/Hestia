import type { ReactElement } from 'react';
import { editor } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Icon } from './Icon.tsx';

/** Câmera 3D: só o que a barra de navegação usa (a classe real fica em `ViewportCanvas`). */
interface Camera3d {
  fit: () => void;
  orbit: { zoom: (delta: number) => void };
}

/**
 * Barra de navegação (canto da vista, como no Revit): roda de navegação (ainda não disponível), aproximar, afastar e
 * enquadrar tudo. No 3D fica logo abaixo do ViewCube.
 */
export function NavBar({ model, center }: { model: Camera3d; center: () => { x: number; y: number } }): ReactElement {
  const view = useUi((s) => s.view);
  const { t } = useT();
  const zoom = (dir: 1 | -1): void => (view === '3d' ? model.orbit.zoom(-dir * 240) : editor.zoomWheel(center(), -dir * 240));
  const fit = (): void => {
    if (view === '3d') {
      model.fit();
      useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
    } else editor.zoomExtents();
  };
  return (
    <div className={`navbar${view === '3d' ? ' below-cube' : ''}`} role="toolbar" aria-label={t('shc_nav_aria')}>
      <button disabled className="soon" title={`${t('shc_nav_steering')}\n— ${t('shc_nav_not_available')}`} aria-label={t('shc_nav_steering')}><Icon name="nav" size={16} /></button>
      <button title={t('shc_nav_zoom_in')} aria-label={t('shc_nav_zoom_in')} onClick={() => zoom(1)}><Icon name="zoom" size={16} /></button>
      <button title={t('shc_nav_zoom_out')} aria-label={t('shc_nav_zoom_out')} onClick={() => zoom(-1)}><span className="navminus">−</span></button>
      <button title={t('shc_nav_fit')} aria-label={t('shc_nav_fit')} onClick={fit}><Icon name="fit" size={16} /></button>
    </div>
  );
}
