import type { ReactElement } from 'react';
import { isRoof } from '@hestia/model';
import { roofToFreePatch } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useT } from '../editor/i18n.ts';

/**
 * Barra da seta de inclinação: a primeira seta já converte o telhado em águas livres, então o botão é só um atalho para
 * converter antes (as águas atuais viram planos) e reinicia a ferramenta, para a barra de status dizer o próximo passo.
 */
export function RoofArrowOptionsBar(): ReactElement | null {
  const p = useProject();
  const sel = useUi((s) => s.selection);
  const { t } = useT();
  const el = sel.length === 1 ? p.elements[sel[0]!] : undefined;
  const roof = el && isRoof(el) ? el : null;
  if (!roof || roof.shape === 'free') return null;
  const convert = (): void => {
    editor.store.exec({ type: 'updateElements', ids: [roof.id], patch: roofToFreePatch(roof) });
    editor.setTool('roofarrow');
  };
  return (
    <button type="button" className="btn" id="opt-roofarrow-free" onClick={convert}>
      {t('pro_roof_arrow_free')}
    </button>
  );
}
