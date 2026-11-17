import type { ReactElement } from 'react';
import { PANE_STYLE_PRESETS, descreverEstiloAplicado } from '../editor/paneStyle.ts';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { usePanes } from '../editor/paneStore.ts';
import type { Pane } from '../editor/panes.ts';

/**
 * Estilo visual do painel (independente dos outros e do projeto). Vazio = herda do projeto. No 3D também liga/desliga
 * sombras e arestas. Prancha não tem estilo próprio: não mostra nada.
 */
export function PaneStyleSelect({ pane }: { pane: Pane }): ReactElement | null {
  const { t } = useT();
  useProject(); // o valor herdado do projeto muda com ele
  const kind = pane.view.kind;
  if (kind === 'sheet') return null;
  const is3d = kind === '3d';
  const presets = is3d ? PANE_STYLE_PRESETS.view3d : PANE_STYLE_PRESETS.view2d;
  const { setPaneStyle } = usePanes.getState();
  const ef = descreverEstiloAplicado(pane.id);
  return (
    <>
      <select
        className="select pane-style"
        aria-label={t('pane_style_select')}
        title={t('pane_style_select')}
        value={pane.style.style ?? ''}
        onChange={(e) => setPaneStyle(pane.id, { style: e.target.value === '' ? undefined : (e.target.value as (typeof presets)[number]['style']) })}
      >
        <option value="">{t('pane_style_inherit')}</option>
        {presets.map((p) => (
          <option key={p.key} value={p.style}>
            {t(p.label as 'pane_style_wireframe')}
          </option>
        ))}
      </select>
      {is3d && (
        <>
          <button type="button" className="ibtn pane-toggle" aria-pressed={ef?.shadows === true} title={t('pane_style_shadows')} aria-label={t('pane_style_shadows')} onClick={() => setPaneStyle(pane.id, { shadows: ef?.shadows !== true })}>
            {t('pane_style_shadows')}
          </button>
          <button type="button" className="ibtn pane-toggle" aria-pressed={ef?.edges === true} title={t('pane_style_edges')} aria-label={t('pane_style_edges')} onClick={() => setPaneStyle(pane.id, { edges: ef?.edges !== true })}>
            {t('pane_style_edges')}
          </button>
        </>
      )}
    </>
  );
}
