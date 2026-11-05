import type { ReactElement } from 'react';
import { t as translate, useT } from '../editor/i18n.ts';
import { Check } from './fields.tsx';

/** Texto PT da dica (compatibilidade); a UI usa a chave `shc_disjoin_hint` no idioma ativo. */
export const DISJOIN_HINT = translate('pt', 'shc_disjoin_hint');

/** Caixa "Desconectar" da barra de opções de Mover, Rotacionar e Espelhar. */
export function DisjoinCheck({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }): ReactElement {
  const { t } = useT();
  return (
    <Check id={id} checked={checked} onChange={onChange}>
      <span title={t('shc_disjoin_hint')}>{t('shc_disjoin')}</span>
    </Check>
  );
}
