import { useState, type ReactElement } from 'react';
import { formatQuantity, getWall, profileError, profileMax, profileMean, wallHeight, wallLength, type Id, type ProfilePoint } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { NumField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { ProfilePreview } from './ProfilePreview.tsx';
import { insertPoint, presetDegrau, presetEmpena, presetInclinado, profileRangeError, straightProfile } from './profilePresets.ts';
import { useUnits } from '../useUnits.ts';
import { useT } from '../../editor/i18n.ts';

/**
 * Editar perfil superior de uma parede reta (Revit: Editar perfil). `draft` null = topo reto por altura/nível;
 * a tabela mostra então o topo reto, e a primeira edição cria o perfil. Grava só no OK.
 */
export function ProfileDialog({ wallId, onClose }: { wallId: Id; onClose: () => void }): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const units = useUnits();
  const wall = getWall(p, wallId);
  const [draft, setDraft] = useState<ProfilePoint[] | null>(wall?.topProfile ? wall.topProfile.map((q) => ({ ...q })) : null);
  if (!wall) return null;
  const L = wallLength(wall);
  const H = wallHeight(p, wall);
  const pts = draft ?? straightProfile(L, H);
  const err = profileError(pts) ?? profileRangeError(pts, L, lang);
  const setPts = (next: ProfilePoint[]): void => setDraft(next.map((q) => ({ t: q.t, h: q.h })));
  const edit = (i: number, patch: Partial<ProfilePoint>): void => setPts(pts.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const removeAt = (i: number): void => {
    if (pts.length > 2) setPts(pts.filter((_, k) => k !== i));
  };
  const ok = (): void => {
    if (err) return;
    editor.store.exec({ type: 'updateElements', ids: [wall.id], patch: { topProfile: draft } }, 'undo_edit_roof_profile');
    onClose();
  };
  return (
    <Dialog
      title={t('dlt_profile_title')}
      sub={t('dlt_profile_sub', { L: formatQuantity(units, 'length', L), H: formatQuantity(units, 'length', H) })}
      size="mid"
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>{t('stt_cancel')}</button>
          <button className="btn primary" onClick={ok} disabled={!!err} title={err ?? undefined}>{t('stt_ok')}</button>
        </>
      }
    >
      <div className="profile-presets" role="group" aria-label={t('dlt_prof_presets')}>
        <button id="pf-incl" className="btn small" onClick={() => setPts(presetInclinado(L, H, H + 0.5))}>{t('dlt_prof_sloped')}</button>
        <button id="pf-empena" className="btn small" onClick={() => setPts(presetEmpena(L, H, H + 1.5))}>{t('dlt_prof_gable')}</button>
        <button id="pf-degrau" className="btn small" onClick={() => setPts(presetDegrau(L, Math.max(0.1, H - 0.5), H))}>{t('dlt_prof_step')}</button>
        <button id="pf-remover" className="btn small" onClick={() => setDraft(null)} disabled={draft === null}>{t('dlt_prof_remove')}</button>
      </div>
      <div className="split">
        <div className="profile-edit">
          <table className="layers profile-table">
            <thead>
              <tr><th>#</th><th>{t('dlt_col_position_t')}</th><th>{t('dlt_col_height_h')}</th><th /></tr>
            </thead>
            <tbody>
              {pts.map((q, i) => (
                <tr key={i}>
                  <td className="mono">{i + 1}</td>
                  <td><NumField id={`pf-t-${i}`} value={q.t} quantity="length" onCommit={(v) => edit(i, { t: v })} /></td>
                  <td><NumField id={`pf-h-${i}`} value={q.h} quantity="length" onCommit={(v) => edit(i, { h: v })} /></td>
                  <td>
                    <button id={`pf-del-${i}`} className="ibtn" onClick={() => removeAt(i)} disabled={pts.length <= 2} aria-label={t('dlt_a11y_delete_point', { n: i + 1 })} title={pts.length <= 2 ? t('dlt_profile_min_points') : t('dlt_delete_point')}>
                      <Icon name="close" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="profile-actions">
            <button id="pf-add" className="btn small" onClick={() => setPts(insertPoint(pts, L))}>{t('dlt_profile_add_point')}</button>
          </div>
          {err ? <p className="error profile-error" role="alert">{err}</p> : null}
          {draft === null && <p className="hint profile-hint">{t('dlt_profile_straight_hint')}</p>}
        </div>
        <div>
          <ProfilePreview pts={pts} length={L} height={H} />
          <dl className="profile-stats">
            <div><dt>{t('dlt_profile_max_height')}</dt><dd>{formatQuantity(units, 'length', Math.max(0, profileMax(pts)))}</dd></div>
            <div><dt>{t('dlt_profile_mean_height')}</dt><dd>{formatQuantity(units, 'length', profileMean(pts, L))}</dd></div>
            <div><dt>{t('dlt_profile_length')}</dt><dd>{formatQuantity(units, 'length', L)}</dd></div>
          </dl>
        </div>
      </div>
    </Dialog>
  );
}
