import type { ReactElement } from 'react';
import { tipoGuardaCorpoValido } from '@hestia/tools';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';

/** Barra da ferramenta Guarda-corpo (decisão 0055, Fase 6b): escolhe o tipo dos próximos guarda-corpos traçados. */
export function GuardaCorpoOptionsBar(): ReactElement {
  const p = useProject();
  const { t } = useT();
  const options = useUi((s) => s.options);
  const types = Object.values(p.tiposGuardaCorpo ?? {});
  const current = tipoGuardaCorpoValido(p, options.railingTypeId) ?? '';
  return (
    <label>
      {t('gc6b_options_type')}
      <select
        id="opt-railingtype"
        className="select"
        value={current}
        onChange={(e) => {
          const cur = useUi.getState().options;
          useUi.setState({ options: { ...cur, railingTypeId: e.target.value } });
        }}
      >
        {types.map((tp) => (
          <option key={tp.id} value={tp.id}>{tp.name}</option>
        ))}
      </select>
    </label>
  );
}
