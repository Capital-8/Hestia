import type { ReactElement } from 'react';
import { useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useT } from '../editor/i18n.ts';
import { NumField } from './fields.tsx';

/**
 * Opções das ferramentas Laje (tipo e deslocamento do topo) e Inclinação (percentual). A inclinação só aparece na
 * ferramenta Inclinação: a laje não a usa (sai com `slope: null`). Fica fora do OptionsBar para que a barra principal só
 * repasse a escolha da ferramenta.
 */
export function SlabOptionsBar({ tool }: { tool: 'slab' | 'slope' }): ReactElement {
  const p = useProject();
  const o = useUi((s) => s.options);
  const { t } = useT();
  const set = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...useUi.getState().options, ...patch } });
  const slope = (
    <label>
      {t('pro_slope')}
      <NumField id="opt-slope" value={o.slabSlopePercent / 100} onCommit={(v) => set({ slabSlopePercent: v * 100 })} quantity="slope" />
    </label>
  );
  if (tool === 'slope') {
    return (
      <>
        {slope}
        <span className="hint">{t('pro_slope_hint')}</span>
      </>
    );
  }
  return (
    <>
      <label>
        {t('pro_type')}
        <select id="opt-slabtype" className="select" value={o.slabTypeId} onChange={(e) => set({ slabTypeId: e.target.value })}>
          {Object.values(p.slabTypes).map((tp) => (
            <option key={tp.id} value={tp.id}>{tp.name}</option>
          ))}
        </select>
      </label>
      <label>
        {t('pro_top_offset')}
        <NumField id="opt-slaboffset" value={o.slabOffset} onCommit={(v) => set({ slabOffset: v })} quantity="length" />
      </label>
    </>
  );
}
