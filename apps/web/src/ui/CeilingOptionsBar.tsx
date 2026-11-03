import type { ReactElement } from 'react';
import { useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { addCeilingsAllRooms } from '../editor/ceilingRoomActions.ts';
import { useT } from '../editor/i18n.ts';
import { NumField } from './fields.tsx';

/** Opções da ferramenta Forro: tipo e cota do topo, e o forro em todos os ambientes. Fica fora do OptionsBar, como a da laje. */
export function CeilingOptionsBar(): ReactElement {
  const p = useProject();
  const o = useUi((s) => s.options);
  const { t } = useT();
  const set = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...useUi.getState().options, ...patch } });
  return (
    <>
      <label>
        {t('pro_type')}
        <select id="opt-ceilingtype" className="select" value={o.ceilingTypeId ?? ''} onChange={(e) => set({ ceilingTypeId: e.target.value })}>
          {Object.values(p.ceilingTypes).map((tp) => (
            <option key={tp.id} value={tp.id}>{tp.name}</option>
          ))}
        </select>
      </label>
      <label>
        {t('pro_height_offset')}
        <NumField id="opt-ceilingoffset" value={o.ceilingOffset ?? 2.6} onCommit={(v) => set({ ceilingOffset: v })} quantity="length" />
      </label>
      <button id="opt-ceilingall" className="btn small" onClick={() => addCeilingsAllRooms()} title={t('pro_ceilings_all_title')}>
        {t('pro_ceilings_all')}
      </button>
    </>
  );
}
