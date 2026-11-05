import { Fragment, type ReactElement } from 'react';
import { newId, type Material, type WallStrip } from '@hestia/model';
import { NumField, TextField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { t as translate, useT, type Lang } from '../../editor/i18n.ts';

type Draft = Omit<WallStrip, 'id'>;

type Preset = { label: string; strip: Draft };

/** Mensagem de erro de uma faixa, ou `null` quando ela é válida. Usada também pelo diálogo para bloquear o OK. */
export function stripError(s: WallStrip, lang: Lang = 'pt'): string | null {
  if (!(s.z1 > s.z0)) return translate(lang, 'dlt_strip_err_end_height');
  if (!(s.thickness > 0)) return translate(lang, 'dlt_strip_err_thickness');
  return null;
}

interface StripsTabProps {
  strips: WallStrip[];
  materials: Record<string, Material>;
  onChange: (next: WallStrip[]) => void;
  /** Abre o navegador de materiais para a faixa de índice `index`; quem escolhe é o diálogo pai. */
  onPickMaterial: (index: number) => void;
}

/** Aba "Faixas" do tipo de parede: edita `draft.strips` (rascunho local; grava só no OK do diálogo). */
export function StripsTab({ strips, materials, onChange, onPickMaterial }: StripsTabProps): ReactElement {
  const { t, lang } = useT();
  /** Predefinições de faixa: o rótulo e o nome padrão nascem no idioma ativo. */
  const PRESETS: Preset[] = [
    { label: t('dlt_strip_preset_baseboard'), strip: { name: t('dlt_strip_name_baseboard'), side: 'interior', materialId: 'mat_madeira', thickness: 0.02, z0: 0, z1: 0.1 } },
    { label: t('dlt_strip_preset_tile'), strip: { name: t('dlt_strip_name_tile'), side: 'interior', materialId: 'mat_ceramica', thickness: 0.01, z0: 0, z1: 1.5 } },
    { label: t('dlt_strip_preset_frieze'), strip: { name: t('dlt_strip_name_frieze'), side: 'exterior', materialId: 'mat_argamassa', thickness: 0.02, z0: 2.4, z1: 2.6 } },
  ];
  const SIDES: Array<[WallStrip['side'], string]> = [
    ['exterior', t('dlt_strip_side_exterior')],
    ['interior', t('dlt_strip_side_interior')],
  ];

  const update = (i: number, patch: Partial<WallStrip>): void => onChange(strips.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const remove = (i: number): void => onChange(strips.filter((_, k) => k !== i));
  const add = (strip: Draft): void => onChange([...strips, { id: newId('st'), ...strip }]);
  const addBlank = (): void => add({ name: t('dlt_strip_new'), side: 'interior', materialId: Object.keys(materials)[0] ?? '', thickness: 0.01, z0: 0, z1: 0.1 });
  return (
    <div>
      <p className="hint strips-help">
        {t('dlt_strip_help')}
      </p>
      <div className="strips-presets" role="group" aria-label={t('dlt_a11y_strip_presets')}>
        {PRESETS.map((p, k) => (
          <button key={p.label} id={`st-preset-${k}`} className="btn small" onClick={() => add(p.strip)}>{p.label}</button>
        ))}
      </div>
      <div className="strips-scroll">
        <table className="layers strips-table">
          <thead>
            <tr><th>{t('dlt_col_name')}</th><th>{t('dlt_col_side')}</th><th>{t('dlt_col_material')}</th><th>{t('dlt_col_thickness_cm')}</th><th>{t('dlt_col_start_height_cm')}</th><th>{t('dlt_col_end_height_cm')}</th><th /></tr>
          </thead>
          <tbody>
            {strips.length === 0 && (
              <tr><td colSpan={7} className="strips-empty">{t('dlt_strip_empty')}</td></tr>
            )}
            {strips.map((s, i) => {
              const m = materials[s.materialId];
              const err = stripError(s, lang);
              return (
                <Fragment key={s.id}>
                  <tr>
                    <td><TextField id={`st-${s.id}-nome`} value={s.name} onCommit={(v) => update(i, { name: v })} /></td>
                    <td>
                      <select id={`st-${s.id}-lado`} className="select" aria-label={t('dlt_a11y_strip_side', { n: i + 1 })} value={s.side} onChange={(e) => update(i, { side: e.target.value as WallStrip['side'] })}>
                        {SIDES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      <button id={`st-${s.id}-mat`} className="btn small strip-mat" onClick={() => onPickMaterial(i)} title={t('dlt_tt_pick_material')}>
                        <span className="swatch" style={{ background: m?.color }} />
                        <span className="strip-mat-name">{m?.name ?? '—'}</span>
                      </button>
                    </td>
                    {/* min em metros: 0,001 m = 0,1 cm */}
                    <td><NumField id={`st-${s.id}-esp`} value={s.thickness} quantity="smallLength" min={0.001} onCommit={(v) => update(i, { thickness: v })} /></td>
                    <td><NumField id={`st-${s.id}-de`} value={s.z0} quantity="smallLength" min={0} onCommit={(v) => update(i, { z0: v })} /></td>
                    <td><NumField id={`st-${s.id}-ate`} value={s.z1} quantity="smallLength" min={0} onCommit={(v) => update(i, { z1: v })} /></td>
                    <td>
                      <button id={`st-${s.id}-del`} className="ibtn" onClick={() => remove(i)} aria-label={t('dlt_a11y_strip_remove', { n: i + 1 })}><Icon name="close" size={14} /></button>
                    </td>
                  </tr>
                  {err && (
                    <tr className="strip-err">
                      <td colSpan={7} role="alert">{t('dlt_strip_row_error', { n: i + 1, error: err })}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="strips-foot">
        <button id="st-add" className="btn small" onClick={addBlank}>{t('dlt_strip_add')}</button>
      </div>
    </div>
  );
}
