import type { ReactElement } from 'react';
import { editor } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { activatePane } from '../editor/paneActivation.ts';
import type { PaneId } from '../editor/panes.ts';
import { useUi, type ViewKind } from '../editor/state.ts';
import { Icon } from './Icon.tsx';

/** Câmera 3D: só o que a barra de navegação usa (a classe real fica em `ViewportCanvas`). */
interface Camera3d {
  fit: () => void;
  orbit: { zoom: (delta: number) => void };
}

/**
 * Barra de navegação (canto da vista, como no Revit): aproximar, afastar e
 * enquadrar tudo. No 3D fica logo abaixo do ViewCube.
 */
export function NavBar({ model, center, view, paneId }: { model: Camera3d; center: () => { x: number; y: number }; view: ViewKind; paneId?: PaneId }): ReactElement {
  // `view` é a vista do PRÓPRIO painel (não a do app): a posição da barra não pode mudar quando outro painel vira o ativo.
  const { t } = useT();
  // Os botões agem na câmera deste painel: se ele não é o ativo (mouse ainda não pousou, ativação recusada), ativa antes.
  const ativar = (): void => {
    if (paneId !== undefined) activatePane(paneId);
  };
  const zoom = (dir: 1 | -1): void => {
    ativar();
    if (view === '3d') model.orbit.zoom(-dir * 240);
    else editor.zoomWheel(center(), -dir * 240);
  };
  const fit = (): void => {
    ativar();
    if (view === '3d') {
      model.fit();
      useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
    } else editor.zoomExtents();
  };
  return (
    <div className={`navbar${view === '3d' ? ' below-cube' : ''}`} role="toolbar" aria-label={t('shc_nav_aria')} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <button title={t('shc_nav_zoom_in')} aria-label={t('shc_nav_zoom_in')} onClick={() => zoom(1)}><Icon name="zoom" size={16} /></button>
      <button title={t('shc_nav_zoom_out')} aria-label={t('shc_nav_zoom_out')} onClick={() => zoom(-1)}><span className="navminus">−</span></button>
      <button title={t('shc_nav_fit')} aria-label={t('shc_nav_fit')} onClick={fit}><Icon name="fit" size={16} /></button>
    </div>
  );
}
