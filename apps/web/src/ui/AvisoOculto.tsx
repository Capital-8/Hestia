import type { ReactElement } from 'react';
import { desfazerCriacaoDoAviso, mostrarCategoriaDoAviso } from '../editor/avisoOcultoActions.ts';
import { useT } from '../editor/i18n.ts';
import { categoriasPorExtenso } from '../editor/profileWarning.ts';
import { useUi } from '../editor/state.ts';
import { planViewIdAtivo } from '../editor/vistaAtiva.ts';

/**
 * Aviso de criação em categoria oculta da vista (barra de status): "Criado, mas esta vista oculta paredes." com as ações
 * "Mostrar categoria nesta vista" e "Desfazer". Só aparece na vista em que o elemento foi criado.
 */
export function AvisoOculto(): ReactElement | null {
  const { t, lang } = useT();
  const aviso = useUi((s) => s.avisoOculto);
  const ativa = useUi((s) => planViewIdAtivo(s));
  if (!aviso || aviso.viewId !== ativa) return null;
  const layers = categoriasPorExtenso(lang, aviso.categories);
  return (
    <span className="sb-aviso-oculto" role="alert" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span title={t('edc_hidden_creation', { layers })}>{t('edc_hidden_creation', { layers })}</span>
      <button type="button" className="btn small" onClick={mostrarCategoriaDoAviso}>{t('edc_hidden_show_category')}</button>
      <button type="button" className="btn small" onClick={desfazerCriacaoDoAviso}>{t('btn_undo')}</button>
    </span>
  );
}
