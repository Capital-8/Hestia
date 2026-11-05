import type { ReactElement } from 'react';
import { sectionAnnotationsOf, type Id } from '@hestia/model';
import { DARK, LIGHT, sectionFrame, type PlanDrawList, type Viewport } from '@hestia/render';
import { editor, useProject } from '../editor/controller.ts';
import { useT, type Lang } from '../editor/i18n.ts';
import { thinLinesOn } from '../editor/graphicsActions.ts';
import { useUi } from '../editor/state.ts';
import { Icon } from './Icon.tsx';

/**
 * Quadro da vista de corte ou elevação: a mesma lista de desenho da planta, desenhada pelo mesmo canvas.
 * As ferramentas de anotação/edição usam `(t,z)`; o cálculo do corte é cacheado pelo controlador por projeto. Seleção e
 * cursor realçam o desenho (decisão 0016).
 */

/**
 * Lista de desenho do corte/elevação (R4). A lista é montada uma vez por `SectionFrame` e reaproveitada: pan, zoom e
 * tamanho da vista não geram geometria nova. Com GPU, a lista volta como está (o shader aplica `papel`/`zoomMin` com o
 * zoom corrente); sem GPU, ela sai resolvida para o zoom do Canvas2D.
 */
export function buildSectionFrame(v: Viewport, dark: boolean, hidden?: ReadonlySet<Id>, revealed?: ReadonlySet<Id>, lang: Lang = 'pt'): PlanDrawList | null {
  const st = useUi.getState();
  const section = editor.sectionOf(st.sectionId);
  if (!section || !st.sectionId) return null;
  const view = editor.project.views.find((x) => x.id === st.sectionId);
  const gpu = st.gpu === 'webgl2' || st.gpu === 'webgpu';
  const entrada = {
    project: editor.project,
    version: editor.store.version,
    sectionId: st.sectionId,
    section,
    theme: dark ? DARK : LIGHT,
    dark,
    showGrid: st.showGrid,
    hidden,
    revealed,
    annotations: view ? sectionAnnotationsOf(view) : undefined,
    levelExtents: view?.levelExtents,
    highlight: { selection: st.selection, hover: st.hover, aviso: st.avisoParede ? [st.avisoParede] : [] },
    thinLines: thinLinesOn(editor.project, 'section'),
    lang,
  };
  return sectionFrame.drawList(entrada, v, gpu);
}

/** Bancada do R4 (`?debug=1`): montagens × reaproveitamentos da lista do corte. */
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, {
    __hestiaSection: {
      snapshot: () => sectionFrame.stats(),
      reset: () => sectionFrame.reset(),
    },
  });
}

/** Nome da vista aberta, no canto, com saída para a planta. */
export function SectionBadge(): ReactElement | null {
  const { t } = useT();
  const p = useProject();
  const id = useUi((s) => s.sectionId);
  const view = p.views.find((x) => x.id === id);
  if (!view) return null;
  const isSection = view.kind === 'section';
  return (
    <div className="section-badge">
      <Icon name={isSection ? 'section' : 'elevation'} size={14} />
      <span className="section-name">{view.name}</span>
      <span className="section-kind">{isSection ? t('cvv_section_kind') : t('cvv_elevation_kind')}</span>
      <button className="ibtn" title={t('cvv_close_section')} aria-label={t('cvv_close_section')} onClick={() => editor.closeSection()}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
