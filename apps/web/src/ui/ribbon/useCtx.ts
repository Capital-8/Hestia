import { useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProject } from '../../editor/controller.ts';
import { usePerimeter } from '../../editor/perimeter.ts';
import { useUi } from '../../editor/state.ts';
import type { RibbonCtx } from './actions.ts';

/** Estado que a faixa (e a barra de acesso rápido) lê; o seletor raso evita redesenhar a cada movimento do cursor. */
export function useRibbonCtx(): RibbonCtx {
  const p = useProject();
  const perim = usePerimeter();
  const ui = useUi(useShallow((s) => ({
    tool: s.tool, selection: s.selection, view: s.view, planViewId: s.planViewId, levelId: s.levelId,
    showGrid: s.showGrid, showUnderlay: s.showUnderlay,
    showRoofProjection: s.showRoofProjection, propsOpen: s.propsOpen, browserOpen: s.browserOpen, sides: s.dock.sides, options: s.options,
  })));
  // A faixa lê a seleção num desenho de prioridade baixa: o clique/caixa não espera o redesenho de todos os botões.
  const selection = useDeferredValue(ui.selection);
  return { ...ui, selection, p, perimetro: perim.active ? { modify: perim.modify, selecting: perim.selecting === true } : null };
}
