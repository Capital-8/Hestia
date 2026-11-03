import { useDeferredValue, type ReactElement } from 'react';
import {
  openingAngle2d,
  openingAngle3d,
  openingDetail2d,
  openingDetail3d,
  openingFrameStyle,
  openingGrid,
  openingHandle,
  openingLeafStyle,
  type Material,
  type OpeningFamily,
  type OpeningFrameStyle,
  type OpeningHandle,
  type OpeningLeafStyle,
  type OpeningOptionSupport,
  type OpeningType,
} from '@hestia/model';
import { useT, type Dict } from '../../../../editor/i18n.ts';
import { OpeningTypeThumb } from '../OpeningTypeThumb.tsx';
import { withOpeningField } from '../openingTypeFields.ts';

/** Propriedades que todo painel de componente recebe. Cada painel é uma lista de linhas `field-row`. */
export interface PanelProps {
  d: OpeningType;
  onChange: (next: OpeningType) => void;
  /** Família do tipo (null quando o dado está fora do contrato). */
  family: OpeningFamily | null;
  /** Linha de `openingOptionSupport(família)`: o painel só mostra o que a tabela marca como suportado. */
  support: OpeningOptionSupport;
  /** Contagens de folhas aceitas pela família. */
  leaves: ReadonlyArray<{ value: OpeningType['leaves']; label: string }>;
  materials: Record<string, Material>;
}

export const FIELD_LEAF: ReadonlyArray<readonly [OpeningLeafStyle, keyof Dict]> = [
  ['flush', 'dlo_o_leaf_flush'],
  ['panel', 'dlo_o_leaf_panel'],
  ['glass', 'dlo_o_leaf_glass'],
  ['louver', 'dlo_o_leaf_louver'],
  ['grille', 'dlo_o_leaf_grille'],
];

export const FIELD_HANDLE: ReadonlyArray<readonly [OpeningHandle, keyof Dict]> = [
  ['none', 'dlo_o_handle_none'],
  ['lever', 'dlo_o_handle_lever'],
  ['knob', 'dlo_o_handle_knob'],
  ['pull', 'dlo_o_handle_pull'],
];

export const FIELD_FRAME: ReadonlyArray<readonly [OpeningFrameStyle, keyof Dict]> = [
  ['rebate', 'dlo_o_frame_rebate'],
  ['simple', 'dlo_o_frame_simple'],
  ['aduela', 'dlo_o_frame_aduela'],
  ['block', 'dlo_o_frame_block'],
];

/**
 * Ferramentas comuns dos painéis: valores efetivos (padrão por leitura), `set` para campos simples e `setField` para os
 * campos v2 que só são gravados quando diferem do padrão. É um hook por causa do tipo adiado das miniaturas.
 */
export function usePanelKit(d: OpeningType, onChange: (next: OpeningType) => void) {
  const set = (patch: Partial<OpeningType>): void => onChange({ ...d, ...patch });
  const setField = (field: Parameters<typeof withOpeningField>[1], value: unknown, fallback: unknown): void => {
    onChange(withOpeningField(d, field, value, fallback));
  };
  /** Tira o campo opcional do tipo (volta ao padrão por leitura). */
  const limpar = (campo: keyof OpeningType): void => {
    const next: OpeningType = { ...d };
    delete next[campo];
    onChange(next);
  };
  return {
    set,
    setField,
    limpar,
    // As miniaturas são caras: o React atualiza o tipo adiado sem segurar a digitação nos campos.
    thumbnailType: useDeferredValue(d),
    leafStyle: openingLeafStyle(d),
    leafFallback: openingLeafStyle({ kind: d.kind }),
    handle: openingHandle(d),
    handleFallback: openingHandle({ kind: d.kind, plan: d.plan, leaves: d.leaves }),
    frameStyle: openingFrameStyle(d),
    frameFallback: openingFrameStyle({}),
    angle2d: openingAngle2d(d),
    angle2dFallback: openingAngle2d({ plan: d.plan }),
    angle3d: openingAngle3d(d),
    angle3dFallback: openingAngle3d({ kind: d.kind, plan: d.plan }),
    grid: openingGrid(d),
    gridFallback: openingGrid({}),
    detail2d: openingDetail2d(d),
    detail2dFallback: openingDetail2d({}),
    detail3d: openingDetail3d(d),
    detail3dFallback: openingDetail3d({}),
  };
}

/** Galeria de escolhas com a elevação em miniatura gerada pelo mesmo caminho da prévia (projeto mínimo + seção). */
export function Miniaturas<T extends string>({
  value,
  options,
  onPick,
  preview,
}: {
  value: T;
  options: ReadonlyArray<readonly [T, keyof Dict]>;
  onPick: (v: T) => void;
  preview: (v: T) => OpeningType;
}): ReactElement {
  const { t } = useT();
  return (
    <div className="op-choices">
      {options.map(([v, labelKey]) => (
        <button
          key={v}
          type="button"
          className={`btn small op-choice${v === value ? ' on' : ''}`}
          title={t(labelKey)}
          aria-label={t(labelKey)}
          aria-pressed={v === value}
          onClick={() => onPick(v)}
        >
          <OpeningTypeThumb type={preview(v)} width={58} height={42} />
        </button>
      ))}
    </div>
  );
}

/** Seletor de material (caixilho, vidro...). */
export function MaterialSelect({ id, labelKey, value, materials, onPick }: { id: string; labelKey: keyof Dict; value: string; materials: Record<string, Material>; onPick: (id: string) => void }): ReactElement {
  const { t } = useT();
  return (
    <div className="field-row">
      <label htmlFor={id}>{t(labelKey)}</label>
      <select id={id} className="select" value={value} onChange={(e) => onPick(e.target.value)}>
        {Object.values(materials).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}
