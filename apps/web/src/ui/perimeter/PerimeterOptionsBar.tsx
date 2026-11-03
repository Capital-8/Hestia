import type { ReactElement } from 'react';
import type { SketchTarget } from '@hestia/geom';
import type { PerimeterModifyKind } from '@hestia/tools';
import { type Dict, useT } from '../../editor/i18n.ts';
import { Check, NumField } from '../fields.tsx';
import { perimeterTool } from './PerimeterStatus.ts';

/** Opções do modo de perímetro. Cada alvo usa só as que se aplicam. */
export interface PerimeterOptions {
  /** Balanço padrão do beiral (m). Só telhado. */
  overhang: number;
  /** Inclinação padrão das arestas (%). Só telhado. */
  slopePct: number;
  /** Estender a linha até o núcleo da parede. Todos os alvos. */
  extendToCore: boolean;
  /** Deslocamento do nível (m). Piso, laje e forro. */
  heightOffset: number;
  /** Vincular às paredes (piso e laje). Só com o esboço de "Por perímetro". Ausente = desmarcada. */
  linkToWalls?: boolean;
  /** Acompanhar o ambiente (forro). Só com o contorno de "Por ambiente". Ausente = desmarcada. */
  followRoom?: boolean;
}

export interface PerimeterOptionsBarProps {
  target: SketchTarget;
  options: PerimeterOptions;
  /** Comando de Modificar ativo sobre o esboço: o nome aparece ao lado do título. */
  modify?: PerimeterModifyKind | null;
  onChange: (patch: Partial<PerimeterOptions>) => void;
}

/** Rótulo traduzido de cada comando de Modificar do perímetro. */
const MODIFY_KEY: Record<PerimeterModifyKind, keyof Dict> = {
  trim: 'pro_pm_modify_trim',
  split: 'pro_pm_modify_split',
  offset: 'pro_pm_modify_offset',
  move: 'pro_pm_modify_move',
  copy: 'pro_pm_modify_copy',
  rotate: 'pro_pm_modify_rotate',
  mirror: 'pro_pm_modify_mirror',
  array: 'pro_pm_modify_array',
  align: 'pro_pm_modify_align',
  delete: 'pro_pm_modify_delete',
};

/** Barra de opções (`.optbar`) do modo de perímetro, com as mesmas classes das outras barras. */
export function PerimeterOptionsBar({ target, options: o, modify, onChange }: PerimeterOptionsBarProps): ReactElement {
  const { t, lang } = useT();
  const roof = target === 'roof';
  const tool = perimeterTool(target, lang);
  return (
    <div className="optbar" role="group" aria-label={t('pro_tool_options')}>
      <span className="tool-name">{modify ? `${tool} · ${t(MODIFY_KEY[modify])}` : tool}</span>
      {roof && (
        <label>
          {t('pro_overhang')}
          <NumField id="opt-pm-overhang" value={o.overhang} onCommit={(v) => onChange({ overhang: v })} quantity="length" min={0} />
        </label>
      )}
      {!roof && (
        <label>
          {t('pro_pm_level_offset')}
          <NumField id="opt-pm-offset" value={o.heightOffset} onCommit={(v) => onChange({ heightOffset: v })} quantity="length" />
        </label>
      )}
      {(target === 'floor' || target === 'slab') && (
        <Check
          id="opt-pm-link"
          checked={!!o.linkToWalls}
          disabled={!o.linkToWalls && o.extendToCore}
          onChange={(v) => onChange({ linkToWalls: v })}
        >
          {t('pro_pm_link_walls')}
        </Check>
      )}
      {target === 'ceiling' && (
        <Check id="opt-pm-room" checked={!!o.followRoom} onChange={(v) => onChange({ followRoom: v })}>
          {t('pro_pm_follow_room')}
        </Check>
      )}
      <Check id="opt-pm-extend" checked={o.extendToCore} disabled={!!o.linkToWalls} onChange={(v) => onChange({ extendToCore: v })}>
        {t('pro_pm_extend_core')}
      </Check>
      {roof && (
        <label>
          {t('pro_pm_default_edge_slope')}
          <NumField id="opt-pm-slope" value={o.slopePct / 100} onCommit={(v) => onChange({ slopePct: v * 100 })} quantity="slope" min={0.001} max={2} />
        </label>
      )}
    </div>
  );
}
