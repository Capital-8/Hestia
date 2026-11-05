import { useState, type ReactElement } from 'react';
import {
  defaultExtrusionProfile,
  extrusionFrame,
  insertRoofProfilePoint,
  presetArco,
  presetBorboleta,
  presetDenteSerra,
  presetDuasAguas,
  presetMansarda,
  presetUmaAgua,
  roofProfileError,
  roofProfileSlopeError,
  shiftProfile,
} from '@hestia/engine';
import { formatQuantity, isRoof, type Id, type RoofProfilePoint } from '@hestia/model';
import { machineNumber } from '@hestia/geom';
import { editor, useProject } from '../../editor/controller.ts';
import { applyRoofPatch } from '../../editor/roofEdgeActions.ts';
import { NumField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { useUnits } from '../useUnits.ts';
import { useT } from '../../editor/i18n.ts';

const pt = (n: number): string => machineNumber(n, 1);

const W = 340;
const H = 170;
const PAD_X = 18;
const PAD_TOP = 22;
const PAD_BOT = 26;

/**
 * Seção do telhado por extrusão: t na horizontal (a partir da borda do contorno, em metros), z para cima, beiral na
 * cota 0. Escala única nos dois eixos para a inclinação aparecer como é. As extensões planas além do perfil saem reta.
 */
function SectionChart({ pts, width }: { pts: RoofProfilePoint[]; width: number }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const tLo = Math.min(0, ...pts.map((q) => q.t));
  const tHi = Math.max(width, ...pts.map((q) => q.t));
  const zTop = Math.max(0.1, ...pts.map((q) => q.z));
  const zBot = Math.min(0, ...pts.map((q) => q.z));
  const span = Math.max(tHi - tLo, 1e-3);
  const k = Math.min((W - PAD_X * 2) / span, (H - PAD_TOP - PAD_BOT) / Math.max(zTop - zBot, 1e-3));
  const ox = (W - span * k) / 2;
  const base = H - PAD_BOT;
  const x = (t: number): number => ox + (t - tLo) * k;
  const y = (z: number): number => base - (z - zBot) * k;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const outline: RoofProfilePoint[] = first && last ? [{ t: tLo, z: first.z }, ...pts, { t: tHi, z: last.z }] : [];
  const shape = [`${pt(x(tLo))},${pt(y(0))}`, ...outline.map((q) => `${pt(x(q.t))},${pt(y(q.z))}`), `${pt(x(tHi))},${pt(y(0))}`].join(' ');
  const maxZ = Math.max(0, ...pts.map((q) => q.z));
  return (
    <svg className="profile-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dlt_a11y_roof_section_max', { h: formatQuantity(units, 'length', maxZ) })}>
      <line x1={pt(x(0))} x2={pt(x(0))} y1={pt(y(zTop))} y2={pt(y(zBot))} className="profile-straight" />
      <line x1={pt(x(width))} x2={pt(x(width))} y1={pt(y(zTop))} y2={pt(y(zBot))} className="profile-straight" />
      <polygon points={shape} className="profile-fill" />
      {pts.map((q, i) => (
        <circle key={i} cx={pt(x(q.t))} cy={pt(y(q.z))} r={2.6} className="profile-dot" />
      ))}
      <line x1={pt(x(tLo) - 8)} x2={pt(x(tHi) + 8)} y1={pt(y(0))} y2={pt(y(0))} className="profile-ground" />
      <text x={pt(x(0))} y={pt(base + 14)} className="profile-tick" textAnchor="start">0</text>
      <text x={pt(x(width))} y={pt(base + 14)} className="profile-tick" textAnchor="end">{formatQuantity(units, 'length', width)}</text>
      <text x={PAD_X} y={12} className="profile-tick">{t('dlt_profile_height_max', { h: formatQuantity(units, 'length', maxZ) })}</text>
    </svg>
  );
}

/**
 * Perfil de um telhado por extrusão (A9): predefinições (arco, mansarda, dente de serra, borboleta, uma e duas águas),
 * tabela editável de t × z, seção ao vivo e erro em linha. OK grava pelo motor (não aplica se o telhado ficar sem águas).
 * A tabela mostra t a partir da borda do contorno; o perfil guardado usa a mesma origem do referencial da extrusão.
 */
export function RoofProfileDialog({ roofId, onClose }: { roofId: Id; onClose: () => void }): ReactElement | null {
  const { t } = useT();
  const units = useUnits();
  const p = useProject();
  const roof = p.elements[roofId];
  const [draft, setDraft] = useState<RoofProfilePoint[]>(() => {
    if (!isRoof(roof)) return [];
    return roof.profile.length >= 2 ? roof.profile.map((q) => ({ ...q })) : defaultExtrusionProfile(roof.boundary, roof.dir);
  });
  const [h, setH] = useState(1);
  const [dentes, setDentes] = useState(3);
  if (!isRoof(roof)) return null;
  const frame = extrusionFrame(roof.boundary, roof.dir);
  if (!frame) return null;
  const base = frame.tMin;
  const width = frame.tMax - frame.tMin;
  const rel = draft.map((q) => ({ t: q.t - base, z: q.z }));
  const err = roofProfileError(draft) ?? roofProfileSlopeError(draft, units);
  const setPts = (next: RoofProfilePoint[]): void => setDraft(next.map((q) => ({ t: q.t, z: q.z })));
  const applyPreset = (pts: RoofProfilePoint[]): void => setDraft(shiftProfile(pts, base));
  const edit = (i: number, change: Partial<RoofProfilePoint>): void => setPts(draft.map((q, k) => (k === i ? { ...q, ...change } : q)));
  const removeAt = (i: number): void => {
    if (draft.length > 2) setPts(draft.filter((_, k) => k !== i));
  };
  const ok = (): void => {
    if (err) return;
    if (applyRoofPatch(editor.store, [roof.id], { profile: draft })) onClose();
  };
  const maxZ = Math.max(0, ...rel.map((q) => q.z));
  return (
    <Dialog
      title={t('dlt_roof_profile_title')}
      sub={t('dlt_roof_profile_sub', { L: formatQuantity(units, 'length', width) })}
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
        <button id="rp-arco" className="btn small" onClick={() => applyPreset(presetArco(width, h))}>{t('dlt_roof_preset_arch')}</button>
        <button id="rp-mansarda" className="btn small" onClick={() => applyPreset(presetMansarda(width, h * 0.6, width / 5, h))}>{t('dlt_roof_preset_mansard')}</button>
        <button id="rp-serra" className="btn small" onClick={() => applyPreset(presetDenteSerra(width, dentes, h))}>{t('dlt_roof_preset_sawtooth')}</button>
        <button id="rp-borboleta" className="btn small" onClick={() => applyPreset(presetBorboleta(width, h))}>{t('dlt_roof_preset_butterfly')}</button>
        <button id="rp-agua" className="btn small" onClick={() => applyPreset(presetUmaAgua(width, h))}>{t('dlt_roof_preset_shed')}</button>
        <button id="rp-duas" className="btn small" onClick={() => applyPreset(presetDuasAguas(width, h))}>{t('dlt_roof_preset_gable')}</button>
      </div>
      <div className="profile-actions">
        <span className="hint">{t('dlt_fld_height')}</span>
        <NumField id="rp-h" value={h} onCommit={(v) => setH(Math.max(0, v))} quantity="length" min={0} />
        <span className="hint">{t('dlt_fld_teeth')}</span>
        <NumField id="rp-dentes" value={dentes} decimals={0} onCommit={(v) => setDentes(Math.max(1, Math.round(v)))} min={1} />
      </div>
      <div className="split">
        <div className="profile-edit">
          <table className="layers profile-table">
            <thead>
              <tr><th>#</th><th>{t('dlt_col_position_t')}</th><th>{t('dlt_col_height_z')}</th><th /></tr>
            </thead>
            <tbody>
              {rel.map((q, i) => (
                <tr key={i}>
                  <td className="mono">{i + 1}</td>
                  <td><NumField id={`rp-t-${i}`} value={q.t} quantity="length" onCommit={(v) => edit(i, { t: v + base })} /></td>
                  <td><NumField id={`rp-z-${i}`} value={q.z} quantity="length" onCommit={(v) => edit(i, { z: v })} /></td>
                  <td>
                    <button id={`rp-del-${i}`} className="ibtn" onClick={() => removeAt(i)} disabled={draft.length <= 2} aria-label={t('dlt_a11y_delete_point', { n: i + 1 })} title={draft.length <= 2 ? t('dlt_profile_min_points') : t('dlt_delete_point')}>
                      <Icon name="close" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="profile-actions">
            <button id="rp-add" className="btn small" onClick={() => setPts(insertRoofProfilePoint(draft, frame.tMin, frame.tMax))}>{t('dlt_profile_add_point')}</button>
          </div>
          {err ? <p className="error profile-error" role="alert">{err}</p> : null}
          <p className="hint profile-hint">{t('dlt_roof_profile_hint')}</p>
        </div>
        <div>
          <SectionChart pts={rel} width={width} />
          <dl className="profile-stats">
            <div><dt>{t('dlt_profile_max_height')}</dt><dd>{formatQuantity(units, 'length', maxZ)}</dd></div>
            <div><dt>{t('dlt_profile_segments')}</dt><dd>{Math.max(0, draft.length - 1)}</dd></div>
            <div><dt>{t('dlt_profile_width')}</dt><dd>{formatQuantity(units, 'length', width)}</dd></div>
          </dl>
        </div>
      </div>
    </Dialog>
  );
}
