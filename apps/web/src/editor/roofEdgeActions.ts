import { isRoofGeometryPatch, roofCheck, roofPatchProblem, roofStepMessage } from '@hestia/tools';
import { isRoof, type Id, type ProjectStore, type Roof } from '@hestia/model';
import { useI18n } from './i18n.ts';
import { pedirConfirmacaoDegrauTelhado } from './roofStepPrompt.ts';
import { useUi } from './state.ts';

/**
 * Aplica `patch` aos telhados `ids` só se o motor ainda gerar águas para eles; senão não aplica e diz o motivo na barra
 * de status. Única porta de alteração de telhado pela interface de Propriedades e pelo modo de perímetro.
 */
export function applyRoofPatch(store: ProjectStore, ids: Id[], patch: Partial<Roof>): boolean {
  if (Object.keys(patch).length === 0) return true;
  const problem = roofPatchProblem(store.project, ids, patch);
  if (problem) {
    useUi.setState({ status: { key: 'edc_roof_change_failed', args: { problem } } });
    return false;
  }
  const undecidedIds =
    patch.closeStepGaps === undefined && isRoofGeometryPatch(patch)
      ? ids.filter((id) => {
          const r = store.project.elements[id];
          return isRoof(r) && r.closeStepGaps === undefined;
        })
      : [];
  store.exec({ type: 'updateElements', ids, patch });
  if (undecidedIds.length > 0) {
    const withSteps = undecidedIds
      .map((id) => store.project.elements[id])
      .filter(isRoof)
      .map((r) => ({ roof: r, steps: roofCheck(store.project, [r]).steps }))
      .filter((x) => x.steps.length > 0);
    if (withSteps.length > 0) {
      const first = withSteps[0]!;
      const message = roofStepMessage(store.project, first.roof, first.steps, useI18n.getState().lang);
      const targetIds = withSteps.map((x) => x.roof.id);
      void pedirConfirmacaoDegrauTelhado(message).then((close) => {
        store.exec({ type: 'updateElements', ids: targetIds, patch: { closeStepGaps: close } });
      });
    }
  }
  return true;
}
