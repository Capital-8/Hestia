import { useState, type ReactElement } from 'react';
import { formatQuantity, type LevelKeep } from '@hestia/model';
import { useT } from '../editor/i18n.ts';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useUnits } from './useUnits.ts';
import { LEVEL_KEEP_LABEL, levelBearingIds, moveToLevel, readLevelKeep, writeLevelKeep } from '../editor/levelActions.ts';
import { Dialog } from './dialogs/Dialog.tsx';

/** Diálogo "Mover para o nível" (aba Modificar ▸ Seleção e nível). */
export function MoveLevelDialog({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const p = useProject();
  const sel = useUi((s) => s.selection);
  const movable = levelBearingIds(p, sel);
  const [levelId, setLevelId] = useState(() => p.levels.find((l) => l.id === useUi.getState().levelId)?.id ?? p.levels[0]?.id ?? '');
  const [keep, setKeep] = useState<LevelKeep>(readLevelKeep);
  const apply = (): void => {
    if (!levelId || movable.length === 0) return;
    writeLevelKeep(keep);
    const st = useUi.getState();
    useUi.setState({ status: moveToLevel(editor.store, st.selection, levelId, keep, st.levelId).message });
    onClose();
  };
  return (
    <Dialog
      title={t('dlm_move_level')}
      sub={movable.length === 1 ? t('dlm_elements_one', { n: movable.length }) : t('dlm_elements_many', { n: movable.length })}
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('dlm_btn_cancel')}</button>
          <button className="btn primary" onClick={apply} disabled={movable.length === 0 || !levelId}>{t('dlm_btn_move')}</button>
        </>
      }
    >
      <div className="prow">
        <label htmlFor="move-level-to">{t('col_level')}</label>
        <select id="move-level-to" className="select" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          {p.levels.map((l) => (
            <option key={l.id} value={l.id}>{`${l.name} · ${formatQuantity(units, 'length', l.elevation)}`}</option>
          ))}
        </select>
      </div>
      <div className="prow">
        <label htmlFor="move-level-keep">{t('dlm_move_level_keep')}</label>
        <select id="move-level-keep" className="select" value={keep} onChange={(e) => setKeep(e.target.value === 'offset' ? 'offset' : 'elevation')}>
          {(Object.keys(LEVEL_KEEP_LABEL) as LevelKeep[]).map((k) => (
            <option key={k} value={k}>{LEVEL_KEEP_LABEL[k]}</option>
          ))}
        </select>
      </div>
      <div className="hint">{t('dlm_move_level_hint')}</div>
    </Dialog>
  );
}
