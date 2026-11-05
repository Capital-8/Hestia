import type { ReactElement, ReactNode } from 'react';
import { levelAbove, levelElevation, type Id, type Project } from '@hestia/model';
import { dictOf, fmtNum, useI18n, type Lang } from '../editor/i18n.ts';
import { NumField } from './fields.tsx';

/** Altura padrão da rampa quando não há nível acima (mesmo valor de `makeRamp`). */
const RAMP_DEFAULT_HEIGHT = 0.8;

/** Níveis e deslocamentos da rampa: os mesmos campos de `RampToolOptions` (opções da ferramenta e da rampa criada). */
export interface RampLevelsValue {
  topLevelId: Id | null;
  baseOffset: number;
  topOffset: number;
  height: number;
}

/** Valor dos campos a partir das opções da ferramenta. Campos ausentes: topo automático, deslocamentos zero e altura padrão. */
export function rampLevelsValue(o: { topLevelId?: Id | null; baseOffset?: number; topOffset?: number; height?: number }): RampLevelsValue {
  return { topLevelId: o.topLevelId ?? null, baseOffset: o.baseOffset ?? 0, topOffset: o.topOffset ?? 0, height: o.height ?? RAMP_DEFAULT_HEIGHT };
}

/**
 * Desnível (m) da rampa colocada no nível `levelId`: base = elevação do nível + desloc. da base; topo = elevação do nível
 * de topo (o explícito ou o imediatamente acima) + desloc. do topo. Sem nível de topo, vale a altura. Segue `rampTopZ`.
 */
export function rampRiseFromLevels(p: Project, levelId: Id, v: RampLevelsValue): number {
  const base = levelElevation(p, levelId) + v.baseOffset;
  const top = v.topLevelId !== null ? (p.levels.find((l) => l.id === v.topLevelId) ?? null) : levelAbove(p, levelId);
  return top ? top.elevation + v.topOffset - base : v.height;
}

/** Texto da barra com o desnível e a vírgula decimal do idioma (PT: "Desnível: 1,50 m"; EN: "Rise: 1.50 m"). */
export function rampRiseText(rise: number, lang: Lang): string {
  return `${dictOf(lang).ramp_prop_rise}: ${fmtNum(rise, 2, lang)} m`;
}

export interface RampLevelsFieldsProps {
  project: Project;
  levelId: Id;
  /** Prefixo dos ids dos campos (ex.: `opt-ramp` na barra, `place-ramp` nas propriedades). */
  idPrefix: string;
  value: RampLevelsValue;
  onChange: (patch: Partial<RampLevelsValue>) => void;
  /** Envolve cada campo (rótulo + controle): a barra usa `<label>`; as propriedades usam `Row`. */
  Field: (props: { label: string; htmlFor?: string; children: ReactNode }) => ReactElement;
}

/**
 * Níveis da rampa, usados pela barra de opções e pelas propriedades de colocação. Base = nível ativo (só leitura);
 * "Até Nível" para o topo (ou automático, o nível acima); deslocamentos; e a altura quando não há nível acima.
 */
export function RampLevelsFields({ project: p, levelId, idPrefix, value, onChange, Field }: RampLevelsFieldsProps): ReactElement {
  const t = dictOf(useI18n((s) => s.lang));
  const baseName = p.levels.find((l) => l.id === levelId)?.name ?? t.pra_msg_active_level;
  const noLevelAbove = levelAbove(p, levelId) === null;
  return (
    <>
      <Field label={t.ramp_levels_base}>
        <span className="val">{baseName}</span>
      </Field>
      <Field label={t.ramp_levels_base_offset} htmlFor={`${idPrefix}-base`}>
        <NumField id={`${idPrefix}-base`} value={value.baseOffset} unit="m" onCommit={(v) => onChange({ baseOffset: v })} />
      </Field>
      <Field label={t.ramp_levels_top} htmlFor={`${idPrefix}-top`}>
        <select id={`${idPrefix}-top`} className="select" value={value.topLevelId ?? ''} onChange={(e) => onChange({ topLevelId: e.target.value || null })}>
          <option value="">{t.ramp_levels_auto}</option>
          {p.levels.filter((l) => l.id !== levelId).map((l) => <option key={l.id} value={l.id}>{`${t.ramp_levels_until} ${l.name}`}</option>)}
        </select>
      </Field>
      <Field label={t.ramp_levels_top_offset} htmlFor={`${idPrefix}-topoff`}>
        <NumField id={`${idPrefix}-topoff`} value={value.topOffset} unit="m" onCommit={(v) => onChange({ topOffset: v })} />
      </Field>
      {noLevelAbove && value.topLevelId === null && (
        <Field label={t.ramp_levels_height} htmlFor={`${idPrefix}-height`}>
          <NumField id={`${idPrefix}-height`} value={value.height} unit="m" min={0.1} onCommit={(v) => onChange({ height: v })} />
        </Field>
      )}
    </>
  );
}
