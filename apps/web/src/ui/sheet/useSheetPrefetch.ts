import { useEffect } from 'react';
import { areaPlansOf, planViewsOfLevel, sheetDimsMm, type Project, type Sheet, type SheetViewSource } from '@hestia/model';
import { prefetchViewportParts } from '@hestia/render';
import { useI18n } from '../../editor/i18n.ts';
import { dragPlacement } from '../../editor/sheetInsert.ts';
import { warmLayerStrings } from './SheetGroupContent.tsx';

/** Quanto tempo sem gesto antes de preparar a próxima vista, e o intervalo entre uma e outra (ms). */
export const PREFETCH_IDLE_MS = 500;
export const PREFETCH_MAX_VIEWS = 32;

/** As vistas do Navegador que podem ser soltas na prancha (planta de cada nível e de disciplina, plantas de área, cortes e elevações). */
export function draggableViews(p: Project): SheetViewSource[] {
  return [
    ...p.levels.flatMap((l): SheetViewSource[] => [
      { kind: 'plan', levelId: l.id },
      ...planViewsOfLevel(p, l.id).map((pv): SheetViewSource => ({ kind: 'plan', levelId: l.id, planId: pv.id })),
    ]),
    ...areaPlansOf(p).map((a): SheetViewSource => ({ kind: 'areaPlan', planId: a.id })),
    ...p.views.map((v): SheetViewSource => ({ kind: 'section', sectionId: v.id })),
  ].slice(0, PREFETCH_MAX_VIEWS);
}

/**
 * Com a prancha aberta e parada, calcula (uma vista por vez, só sem gesto em curso) o desenho de cada vista do
 * Navegador na escala em que ela entraria na folha. Soltar uma vista vira acerto de cache, inclusive a primeira.
 * Recomeça quando o modelo muda (o cache é validado pela versão do modelo) e para ao fechar a prancha.
 */
export function useSheetPrefetch(project: Project, sheet: Sheet | null): void {
  useEffect(() => {
    if (!sheet) return;
    let alive = true;
    let timer = 0;
    let last = performance.now();
    const touch = (): void => {
      last = performance.now();
    };
    window.addEventListener('pointermove', touch, true);
    window.addEventListener('wheel', touch, true);
    window.addEventListener('keydown', touch, true);
    const queue = draggableViews(project);
    const lang = useI18n.getState().lang;
    const inner = { x: sheet.margin, y: sheet.margin };
    const paperH = sheetDimsMm(sheet).h;
    const step = (): void => {
      if (!alive) return;
      const idle = performance.now() - last;
      if (idle < PREFETCH_IDLE_MS) {
        timer = window.setTimeout(step, PREFETCH_IDLE_MS - idle + 20);
        return;
      }
      const view = queue.shift();
      if (!view) return;
      try {
        const plan = dragPlacement(project, sheet, view, inner);
        if (plan) warmLayerStrings(prefetchViewportParts(project, { id: 'prefetch', view, at: { x: 0, y: 0 }, size: plan.size, scale: plan.scale }, lang), paperH);
      } catch {
        /* uma vista que falha ao preparar falha de verdade ao soltar, com a mensagem certa */
      }
      timer = window.setTimeout(step, 60);
    };
    timer = window.setTimeout(step, PREFETCH_IDLE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', touch, true);
      window.removeEventListener('wheel', touch, true);
      window.removeEventListener('keydown', touch, true);
    };
  }, [project, sheet]);
}
