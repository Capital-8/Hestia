import type { ReactElement } from 'react';
import { functionLabels, type HatchKind, type Id, type Layer, type LayerFunction, type Material } from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import { NumField, TextField } from '../fields.tsx';
import { FamilyActions, FamilyCheck, FamilyRow, FamilySection } from './familia/index.ts';

const HATCHES: readonly HatchKind[] = ['solid', 'diagonal', 'cross', 'dots', 'gesso', 'none'];
const HATCH_KEY = {
  solid: 'dlt_hatch_solid',
  diagonal: 'dlt_hatch_diagonal',
  cross: 'dlt_hatch_cross',
  dots: 'dlt_hatch_dots',
  gesso: 'estr_hatch_gesso',
  none: 'dlt_hatch_none',
} as const satisfies Record<HatchKind, string>;
const FUNCOES: readonly LayerFunction[] = ['structure', 'substrate', 'thermal', 'membrane', 'finish1', 'finish2'];

/** Seletor de material do corpo (linha do esqueleto). */
export function MaterialRow({ id, label, value, materials, onChange }: { id: string; label: string; value: Id; materials: Record<Id, Material>; onChange: (v: Id) => void }): ReactElement {
  return (
    <FamilyRow label={label} htmlFor={id}>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {!materials[value] ? <option value={value}>—</option> : null}
        {Object.values(materials).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </FamilyRow>
  );
}

interface IdentidadeProps {
  idBase: string;
  value: { code: string; description: string; cost: number; hatch?: HatchKind };
  onChange: (patch: { code?: string; description?: string; cost?: number; hatch?: HatchKind | undefined }) => void;
}

/** Seção Identidade: código, descrição, custo por metro e hachura (vazia = a do material). */
export function IdentidadeSection({ idBase, value, onChange }: IdentidadeProps): ReactElement {
  const { t } = useT();
  return (
    <FamilySection title={t('estr_sec_identity')}>
      <FamilyRow label={t('estr_f_code')} htmlFor={`${idBase}-code`}><TextField id={`${idBase}-code`} value={value.code} onCommit={(v) => onChange({ code: v })} /></FamilyRow>
      <FamilyRow label={t('estr_f_description')} htmlFor={`${idBase}-desc`}><TextField id={`${idBase}-desc`} value={value.description} onCommit={(v) => onChange({ description: v })} /></FamilyRow>
      <FamilyRow label={t('estr_f_cost')} htmlFor={`${idBase}-cost`} title={t('estr_tt_cost')}><NumField id={`${idBase}-cost`} value={value.cost} quantity="currency" min={0} onCommit={(v) => onChange({ cost: v })} /></FamilyRow>
      <FamilyRow label={t('estr_f_hatch')} htmlFor={`${idBase}-hatch`}>
        <select id={`${idBase}-hatch`} className="select" value={value.hatch ?? ''} onChange={(e) => onChange({ hatch: e.target.value === '' ? undefined : (e.target.value as HatchKind) })}>
          <option value="">{t('estr_hatch_material')}</option>
          {HATCHES.map((h) => <option key={h} value={h}>{t(HATCH_KEY[h])}</option>)}
        </select>
      </FamilyRow>
    </FamilySection>
  );
}

interface CamadasProps {
  camadas: Layer[];
  materials: Record<Id, Material>;
  onChange: (c: Layer[]) => void;
}

/** Seção Camadas (só pilar arquitetônico): acabamentos sobre o perfil, de dentro para fora; uma sub-seção por camada. */
export function CamadasSection({ camadas, materials, onChange }: CamadasProps): ReactElement {
  const { t, lang } = useT();
  const funcoes = functionLabels(lang);
  const set = (i: number, patch: Partial<Layer>): void => onChange(camadas.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const mover = (i: number, d: -1 | 1): void => {
    const j = i + d;
    if (j < 0 || j >= camadas.length) return;
    const ls = [...camadas];
    [ls[i], ls[j]] = [ls[j]!, ls[i]!];
    onChange(ls);
  };
  const nova = (): Layer => ({ function: 'finish1', materialId: Object.keys(materials)[0] ?? 'mat_reboco', thickness: 0.02, wraps: false });
  return (
    <FamilySection title={t('estr_sec_layers')}>
      {camadas.length === 0 ? <FamilyRow label={t('estr_f_layers')}><span>{t('estr_layers_none')}</span></FamilyRow> : null}
      {camadas.map((l, i) => (
        <FamilySection key={i} title={t('estr_layer_n', { n: i + 1 })} collapsible={false}>
          <FamilyRow label={t('estr_f_function')} htmlFor={`pil-cam-${i}-fn`}>
            <select id={`pil-cam-${i}-fn`} className="select" value={l.function} onChange={(e) => set(i, { function: e.target.value as LayerFunction })}>
              {FUNCOES.map((f) => <option key={f} value={f}>{funcoes[f]}</option>)}
            </select>
          </FamilyRow>
          <MaterialRow id={`pil-cam-${i}-mat`} label={t('estr_f_material')} value={l.materialId} materials={materials} onChange={(v) => set(i, { materialId: v })} />
          <FamilyRow label={t('estr_f_thickness')} htmlFor={`pil-cam-${i}-esp`}>
            <NumField id={`pil-cam-${i}-esp`} value={l.thickness} quantity="smallLength" min={0.001} onCommit={(v) => set(i, { thickness: v })} />
          </FamilyRow>
          <FamilyCheck id={`pil-cam-${i}-wr`} checked={l.wraps} onChange={(v) => set(i, { wraps: v })}>{t('estr_f_wraps')}</FamilyCheck>
          <FamilyActions>
            <button type="button" className="btn small" disabled={i === 0} onClick={() => mover(i, -1)}>{t('estr_btn_up')}</button>
            <button type="button" className="btn small" disabled={i === camadas.length - 1} onClick={() => mover(i, 1)}>{t('estr_btn_down')}</button>
            <button type="button" className="btn small" onClick={() => onChange(camadas.filter((_, k) => k !== i))}>{t('estr_btn_remove_layer')}</button>
          </FamilyActions>
        </FamilySection>
      ))}
      <FamilyActions>
        <button type="button" className="btn small" onClick={() => onChange([...camadas, nova()])}>{t('estr_btn_add_layer')}</button>
      </FamilyActions>
    </FamilySection>
  );
}

/** Aplica o patch de Identidade ao tipo; `hatch: undefined` apaga o campo (volta à hachura do material). */
export function mesclarIdentidade<T extends { hatch?: HatchKind }>(tipo: T, patch: { code?: string; description?: string; cost?: number; hatch?: HatchKind | undefined }): T {
  const { hatch, ...resto } = patch;
  const base: T = { ...tipo, ...resto };
  if (!('hatch' in patch)) return base;
  const { hatch: _antigo, ...semHatch } = base;
  return (hatch === undefined ? semHatch : { ...semHatch, hatch }) as T;
}
