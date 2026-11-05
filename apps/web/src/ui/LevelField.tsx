import { useState, type ReactElement } from 'react';
import { elementLevelId, formatQuantity, type Id, type LevelKeep } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { moveToLevel, readLevelKeep, writeLevelKeep } from '../editor/levelActions.ts';
import { Row } from './fields.tsx';
import { useUnits } from './useUnits.ts';

/**
 * Linha "Nível" de paredes, pisos, lajes e telhados: troca o nível de todos os ids dados num único passo de desfazer.
 * Com seleção mista de níveis mostra "—". O controle "Ao trocar:" escolhe entre manter a cota e levar o deslocamento.
 */
export function LevelField({ ids, label }: { ids: Id[]; label?: string }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const p = useProject();
  const active = useUi((s) => s.levelId);
  const [keep, setKeep] = useState<LevelKeep>(readLevelKeep);
  const levels = ids.map((id) => elementLevelId(p.elements[id]));
  const first = levels[0] ?? null;
  const mixed = levels.some((l) => l !== first);
  const value = mixed || first === null ? '' : first;
  const missing = first !== null && !p.levels.some((l) => l.id === first);
  const rowLabel = label ?? t('prc_fld_level');

  const onLevel = (levelId: string): void => {
    if (!levelId) return;
    useUi.setState({ status: moveToLevel(editor.store, ids, levelId, keep, active).message });
  };
  const onKeep = (v: string): void => {
    const k: LevelKeep = v === 'offset' ? 'offset' : 'elevation';
    setKeep(k);
    writeLevelKeep(k);
  };

  return (
    <>
      <Row label={rowLabel} htmlFor="prop-level">
        <select id="prop-level" className="select" value={value} onChange={(e) => onLevel(e.target.value)} aria-label={rowLabel}>
          {(mixed || value === '') && (
            <option value="" disabled>
              {mixed ? '—' : t('prc_opt_no_level')}
            </option>
          )}
          {missing && <option value={first!}>{t('prc_opt_missing_level', { id: first })}</option>}
          {p.levels.map((l) => (
            <option key={l.id} value={l.id}>{`${l.name} · ${formatQuantity(units, 'length', l.elevation)}`}</option>
          ))}
        </select>
      </Row>
      <Row label={t('prc_fld_when_changing')} htmlFor="prop-level-keep">
        <select id="prop-level-keep" className="select" value={keep} onChange={(e) => onKeep(e.target.value)} aria-label={t('prc_aria_when_changing_level')}>
          <option value="elevation">{t('prc_opt_keep_elevation')}</option>
          <option value="offset">{t('prc_opt_keep_offset')}</option>
        </select>
      </Row>
    </>
  );
}
