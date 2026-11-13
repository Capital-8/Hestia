import { useRef, useState, type ReactElement } from 'react';
import { DEFAULT_DISJOIN, type ToolOptions } from '@hestia/tools';
import { addRoomsAllCircuits } from '../editor/roomActions.ts';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { type Dict, type Lang, t, toolLabel, useT } from '../editor/i18n.ts';
import { perimeterActions, usePerimeter } from '../editor/perimeter.ts';
import { PerimeterOptionsBar } from './perimeter/PerimeterOptionsBar.tsx';
import { Check, NumField } from './fields.tsx';
import { useUnits } from './useUnits.ts';
import { DisjoinCheck } from './DisjoinCheck.tsx';
import { SlabOptionsBar } from './SlabOptionsBar.tsx';
import { CeilingOptionsBar } from './CeilingOptionsBar.tsx';
import { RoofOptionsBar } from './RoofOptionsBar.tsx';
import { RoofArrowOptionsBar } from './RoofArrowOptionsBar.tsx';
import { StairOptionsBar } from './StairOptionsBar.tsx';
import { StairRunOptionsBar } from './StairRunOptionsBar.tsx';
import { RampOptionsBar } from './RampOptionsBar.tsx';
import { GuardaCorpoOptionsBar } from './GuardaCorpoOptionsBar.tsx';
import { ArrayOptionsBar } from './ArrayOptionsBar.tsx';
import { GridOptionsBar } from './GridOptionsBar.tsx';
import { formatQuantity, openingFamilies, openingFamilyOf, DIM_FAMILY_PADRAO, defaultDimensionFamilyIdOf, dimensionFamiliesOf, type LocationLine } from '@hestia/model';

/** Chave do dicionário de cada linha de localização da parede. */
const LOCATION_KEY: Record<LocationLine, keyof Dict> = {
  wallCenter: 'pro_loc_wall_center',
  coreCenter: 'pro_loc_core_center',
  finishExterior: 'pro_loc_finish_exterior',
  finishInterior: 'pro_loc_finish_interior',
  coreExterior: 'pro_loc_core_exterior',
  coreInterior: 'pro_loc_core_interior',
};

/** Rótulo traduzido da linha de localização. */
export function locationLabel(line: LocationLine, lang: Lang): string {
  return t(lang, LOCATION_KEY[line]);
}

/**
 * Opções da ferramenta Cota: **família** (a aparência nomeada, criada no diálogo "Famílias de cotas") + direção e
 * sequência. Unidade, casas, marca e altura do texto saíram daqui: são da família (antes a barra gravava esses campos
 * cota por cota, o que furava o estilo do projeto).
 */
function DimensionOptions(): ReactElement {
  const p = useProject();
  const o = useUi((s) => s.options);
  const { t } = useT();
  const set = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...useUi.getState().options, ...patch } });
  const familias = dimensionFamiliesOf(p.settings);
  const familia = o.dimensionFamilyId ?? defaultDimensionFamilyIdOf(p.settings);
  return (
    <>
      <label>{t('pro_dim_family')}
        <select
          id="opt-dimfamily"
          className="select"
          value={familia}
          title={t('pro_dim_family_title')}
          onChange={(e) => set({ dimensionFamilyId: e.target.value === DIM_FAMILY_PADRAO ? null : e.target.value })}
        >
          {familias.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label>{t('pro_dim_direction')}
        <select className="select" value={o.dimensionMode ?? 'auto'} onChange={(e) => set({ dimensionMode: e.target.value as 'auto' | 'aligned' | 'horizontal' | 'vertical' })}>
          <option value="auto">{t('pro_dim_dir_auto')}</option>
          <option value="aligned">{t('pro_dim_dir_aligned')}</option>
          <option value="horizontal">{t('pro_dim_dir_horizontal')}</option>
          <option value="vertical">{t('pro_dim_dir_vertical')}</option>
        </select>
      </label>
      <label>{t('pro_dim_string')}<select className="select" value={o.dimensionString ?? 'single'} onChange={(e) => set({ dimensionString: e.target.value as 'single' | 'continuous' | 'baseline' })}><option value="single">{t('pro_dim_string_single')}</option><option value="continuous">{t('pro_dim_string_continuous')}</option><option value="baseline">{t('pro_dim_string_baseline')}</option></select></label>
      {o.dimensionMode === 'aligned' || o.dimensionMode === 'horizontal' || o.dimensionMode === 'vertical' ? null : (
        <span style={{ color: 'var(--fg-soft)' }}>{t('pro_dim_dir_hint')}</span>
      )}
    </>
  );
}

/**
 * Barra da porta/janela na cortina (decisão 0056, §7.3): o mesmo seletor de tipo das esquadrias, os dois modos (preencher
 * a célula ou ajustar a grade à porta), o alinhamento da grade e as inversões (também Espaço e Tab na ferramenta).
 */
export function CurtainOpeningOptions({ tool }: { tool: 'curtainDoor' | 'curtainWindow' }): ReactElement {
  const o = useUi((s) => s.options);
  const { t } = useT();
  const set = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...useUi.getState().options, ...patch } });
  const kind = tool === 'curtainDoor' ? 'door' : 'window';
  return (
    <>
      <span style={{ color: 'var(--fg-soft)' }}>{t('pct_curtain_tool_hint')}</span>
      <OpeningTypePicker kind={kind} value={kind === 'door' ? o.doorTypeId : o.windowTypeId} onChange={(id) => set(kind === 'door' ? { doorTypeId: id } : { windowTypeId: id })} />
      <CurtainOpeningModes opcoes={o} onChange={set} />
    </>
  );
}

/** Modo (preencher a célula ou ajustar a grade), alinhamento da grade e inversões. Puro: as opções entram e o patch sai. */
export function CurtainOpeningModes({ opcoes, onChange }: { opcoes: Pick<ToolOptions, 'curtainFit' | 'curtainAlign' | 'openingFlipHand' | 'openingFlipFacing'>; onChange: (patch: Partial<ToolOptions>) => void }): ReactElement {
  const { t } = useT();
  const fit = opcoes.curtainFit ?? 'cell';
  return (
    <>
      <label>
        {t('pct_mode')}
        <select id="opt-curtain-fit" className="select" value={fit} onChange={(e) => onChange({ curtainFit: e.target.value as 'cell' | 'grid' })}>
          <option value="cell">{t('pct_fit_cell')}</option>
          <option value="grid">{t('pct_fit_grid')}</option>
        </select>
      </label>
      {fit === 'grid' && (
        <label>
          {t('pct_justify')}
          <select id="opt-curtain-align" className="select" value={opcoes.curtainAlign ?? 'center'} onChange={(e) => onChange({ curtainAlign: e.target.value as 'center' | 'start' | 'end' })}>
            <option value="center">{t('pct_justify_center')}</option>
            <option value="start">{t('pct_justify_start')}</option>
            <option value="end">{t('pct_justify_end')}</option>
          </select>
        </label>
      )}
      <button id="opt-curtain-hand" className="btn small" aria-pressed={opcoes.openingFlipHand === true} onClick={() => onChange({ openingFlipHand: opcoes.openingFlipHand !== true })}>
        {t('pct_flip_hand')}
      </button>
      <button id="opt-curtain-facing" className="btn small" aria-pressed={opcoes.openingFlipFacing === true} onClick={() => onChange({ openingFlipFacing: opcoes.openingFlipFacing !== true })}>
        {t('pct_flip_facing')}
      </button>
    </>
  );
}

/** Tipo Selector do Revit: agrupa os tipos por família e filtra por nome ou código. */
function OpeningTypePicker({ kind, value, onChange }: { kind: 'door' | 'window'; value: string; onChange: (id: string) => void }): ReactElement {
  const p = useProject();
  const { t, lang } = useT();
  const [q, setQ] = useState('');
  const types = Object.values(p.openingTypes).filter((tp) => tp.kind === kind);
  const needle = q.trim().toLowerCase();
  const shown = needle ? types.filter((tp) => tp.name.toLowerCase().includes(needle) || (tp.code ?? '').toLowerCase().includes(needle)) : types;
  // Favoritos no topo (ArchiCAD: Favorites); os demais ficam agrupados por família.
  const favorites = p.settings.favoriteOpeningTypes ?? [];
  const favSet = new Set(favorites);
  const favoriteItems = shown.filter((tp) => favSet.has(tp.id));
  const rest = shown.filter((tp) => !favSet.has(tp.id));
  // Um grupo por família (ordem da interface); tipos sem família (dado fora do contrato) caem em "Outros".
  const groups = openingFamilies(kind, lang)
    .map((f) => ({ family: f, items: rest.filter((tp) => openingFamilyOf(tp, lang)?.id === f.id) }))
    .filter((g) => g.items.length);
  const orphans = rest.filter((tp) => !openingFamilyOf(tp, lang));
  const visible = new Set(shown.map((tp) => tp.id));
  const current = p.openingTypes[value];
  return (
    <>
      <label>
        {t('pro_search')}
        <input id="opt-opensearch" className="input" style={{ width: 120 }} value={q} placeholder={t('pro_search_ph')} aria-label={t('pro_search_aria')} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <label>
        {t('pro_type')}
        <select id="opt-opentype" className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          {current && !visible.has(value) ? <option value={value}>{current.name}</option> : null}
          {favoriteItems.length ? (
            <optgroup label={t('pro_favorites')}>
              {favoriteItems.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </optgroup>
          ) : null}
          {groups.map((g) => (
            <optgroup key={g.family.id} label={g.family.name}>
              {g.items.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </optgroup>
          ))}
          {orphans.length ? (
            <optgroup label={t('pro_others')}>
              {orphans.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </optgroup>
          ) : null}
        </select>
      </label>
      <button
        type="button"
        className="btn small"
        aria-label={favSet.has(value) ? t('pro_fav_remove') : t('pro_fav_add')}
        title={favSet.has(value) ? t('pro_fav_remove_title') : t('pro_fav_add_title')}
        onClick={() => editor.store.exec({ type: 'toggleOpeningFavorite', id: value }, favSet.has(value) ? t('pro_fav_remove') : t('pro_fav_add_cmd'))}
      >
        {favSet.has(value) ? '★' : '☆'}
      </button>
    </>
  );
}

export function OptionsBar(): ReactElement {
  const p = useProject();
  const perim = usePerimeter();
  const tool = useUi((s) => s.tool);
  const o = useUi((s) => s.options);
  const units = useUnits();
  const sel = useUi((s) => s.selection);
  const { t, lang } = useT();
  // O aviso de distância inválida é identificado por flag, não pelo texto (que muda com o idioma).
  const invalidDistance = useRef(false);
  const areaPlan = useUi((s) => s.view === 'plan' && s.planKind === 'area' && !!s.areaPlanId);
  const set = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...o, ...patch } });
  if (perim.active) return <PerimeterOptionsBar target={perim.target} modify={perim.modify} options={perim.options} onChange={perimeterActions.setOptions} />;
  // A paleta Propriedades é a fonte de configuração antes da colocação; a barra superior fica como indicação da ferramenta.
  if (['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'stairrun', 'roof', 'roofextrusion'].includes(tool)) {
    return <div className="optbar" role="group" aria-label={t('pro_tool_options')}><span className="tool-name">{toolLabel(tool, lang)}</span><span style={{ color: 'var(--fg-soft)' }}>{t('pro_settings_in_props')}</span></div>;
  }
  return (
    <div className="optbar" role="group" aria-label={t('pro_tool_options')}>
      <span className="tool-name">{toolLabel(tool, lang)}</span>
      {areaPlan && <span style={{ color: 'var(--fg-soft)' }}>{t('pro_area_plan_note')}</span>}
      {areaPlan && <button className="btn small" onClick={() => useUi.setState({ dialog: 'cotasAuto' })} title={t('pro_auto_dim_title')}>{t('pro_auto_dim_btn')}</button>}
      {tool === 'wall' && (
        <>
          <label>
            {t('pro_type')}
            <select id="opt-walltype" className="select" value={o.wallTypeId} onChange={(e) => set({ wallTypeId: e.target.value })}>
              {Object.values(p.wallTypes).map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('pro_shape')}
            <select id="opt-shape" className="select" value={o.wallShape} onChange={(e) => set({ wallShape: e.target.value as 'line' | 'arc' | 'rect' })}>
              <option value="line">{t('pro_shape_line')}</option>
              <option value="arc">{t('pro_shape_arc3')}</option>
              <option value="rect">{t('pro_shape_rect')}</option>
            </select>
          </label>
          <label>
            {t('pro_location_line')}
            <select id="opt-loc" className="select" value={o.locationLine} onChange={(e) => set({ locationLine: e.target.value as LocationLine })}>
              {(Object.keys(LOCATION_KEY) as LocationLine[]).map((k) => (
                <option key={k} value={k}>{locationLabel(k, lang)}</option>
              ))}
            </select>
          </label>
          <label>
            {t('pro_height')}
            <NumField id="opt-height" value={o.wallHeight} onCommit={(v) => set({ wallHeight: v })} quantity="length" min={0.1} />
          </label>
          <Check id="opt-chain" checked={o.chain} onChange={(v) => set({ chain: v })}>{t('pro_chain')}</Check>
        </>
      )}
      {tool === 'room' && (
        <button id="opt-roomall" className="btn small" onClick={() => addRoomsAllCircuits()} title={t('pro_rooms_all_title')}>
          {t('pro_rooms_all')}
        </button>
      )}
      {tool === 'dimension' && <DimensionOptions />}
      {tool === 'text' && (
        <>
          <label>{t('pro_height')}<NumField id="opt-textheight" value={(o.textHeight ?? 2.5) / 1000} quantity="smallLength" min={0.0005} onCommit={(v) => set({ textHeight: v * 1000 })} /></label>
          <label>{t('pro_width')}<NumField id="opt-textwidth" value={(o.textWidth ?? 60) / 1000} quantity="smallLength" min={0.005} onCommit={(v) => set({ textWidth: v * 1000 })} /></label>
          <label>{t('pro_leader')}<select className="select" value={o.textLeader ?? 'none'} onChange={(e) => set({ textLeader: e.target.value as 'none' | 'straight' | 'elbow' })}><option value="none">{t('pro_leader_none')}</option><option value="straight">{t('pro_shape_line')}</option><option value="elbow">{t('pro_leader_elbow')}</option></select></label>
        </>
      )}
      {tool === 'filledRegion' && <Check id="opt-region-mask" checked={o.regionMask === true} onChange={(v) => set({ regionMask: v })}>{t('pro_region_mask')}</Check>}
      {tool === 'filledRegion' && <label>{t('pro_color')}<input className="input" type="color" value={o.regionColor ?? '#f5d782'} onChange={(e) => set({ regionColor: e.target.value })} /></label>}
      {tool === 'detailLine' && <label>{t('pro_line_style')}<select className="select" value={o.detailLineStyle ?? 'solid'} onChange={(e) => set({ detailLineStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}><option value="solid">{t('pro_line_solid')}</option><option value="dashed">{t('pro_line_dashed')}</option><option value="dotted">{t('pro_line_dotted')}</option></select></label>}
      {tool === 'tag' && (
        <>
          <label>{t('pro_tag_info')}<select className="select" value={o.tagProperty ?? 'type'} onChange={(e) => set({ tagProperty: e.target.value as NonNullable<typeof o.tagProperty> })}><option value="type">{t('pro_type')}</option><option value="name">{t('pro_name')}</option><option value="mark">{t('pro_mark')}</option><option value="level">{t('pro_level')}</option><option value="width">{t('pro_width')}</option><option value="height">{t('pro_height')}</option></select></label>
          <label>{t('pro_orientation')}<select className="select" value={o.tagOrientation ?? 'horizontal'} onChange={(e) => set({ tagOrientation: e.target.value as 'horizontal' | 'vertical' })}><option value="horizontal">{t('pro_horizontal')}</option><option value="vertical">{t('pro_vertical')}</option></select></label>
          <Check id="opt-tag-leader" checked={o.tagLeader !== false} onChange={(v) => set({ tagLeader: v })}>{t('pro_leader_label')}</Check>
        </>
      )}
      {tool === 'floor' && (
        <>
          <label>
            {t('pro_type')}
            <select id="opt-floortype" className="select" value={o.floorTypeId} onChange={(e) => set({ floorTypeId: e.target.value })}>
              {Object.values(p.floorTypes).map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('pro_top_offset')}
            <NumField id="opt-flooroffset" value={o.floorOffset} onCommit={(v) => set({ floorOffset: v })} quantity="length" />
          </label>
        </>
      )}
      {(tool === 'slab' || tool === 'slope') && <SlabOptionsBar tool={tool} />}
      {tool === 'ceiling' && <CeilingOptionsBar />}
      {(tool === 'roof' || tool === 'roofextrusion') && <RoofOptionsBar />}
      {tool === 'roofarrow' && <RoofArrowOptionsBar />}
      {tool === 'stair' && <StairOptionsBar />}
      {tool === 'stairrun' && <StairRunOptionsBar />}
      {tool === 'ramp' && <RampOptionsBar />}
      {tool === 'railing' && <GuardaCorpoOptionsBar />}
      {(tool === 'door' || tool === 'window') && (
        <OpeningTypePicker
          kind={tool}
          value={tool === 'door' ? o.doorTypeId : o.windowTypeId}
          onChange={(id) => set(tool === 'door' ? { doorTypeId: id } : { windowTypeId: id })}
        />
      )}
      {(tool === 'curtainDoor' || tool === 'curtainWindow') && <CurtainOpeningOptions tool={tool} />}
      {tool === 'trim' && (
        <label>
          {t('pro_mode')}
          <select
            id="opt-trimmode"
            className="select"
            value={o.trimMode ?? 'unico'}
            onChange={(e) => {
              // Trocar o modo recomeça a escolha (como no modo do Piso).
              useUi.setState({ options: { ...useUi.getState().options, trimMode: e.target.value as 'canto' | 'unico' | 'varios' } });
              editor.setTool('trim');
            }}
          >
            <option value="canto">{t('pro_trim_corner')}</option>
            <option value="unico">{t('pro_trim_single')}</option>
            <option value="varios">{t('pro_trim_multi')}</option>
          </select>
        </label>
      )}
      {tool === 'move' && <DisjoinCheck id="opt-mdisjoin" checked={o.moveDisjoin ?? DEFAULT_DISJOIN.move} onChange={(v) => set({ moveDisjoin: v })} />}
      {tool === 'rotate' && (
        <>
          <Check id="opt-rcopy" checked={o.rotateCopy} onChange={(v) => set({ rotateCopy: v })}>{t('tool_copy')}</Check>
          <DisjoinCheck id="opt-rdisjoin" checked={o.rotateDisjoin ?? DEFAULT_DISJOIN.rotate} onChange={(v) => set({ rotateDisjoin: v })} />
        </>
      )}
      {tool === 'mirror' && (
        <>
          <Check id="opt-mcopy" checked={o.mirrorCopy} onChange={(v) => set({ mirrorCopy: v })}>{t('tool_copy')}</Check>
          <DisjoinCheck id="opt-mirrordisjoin" checked={o.mirrorDisjoin ?? DEFAULT_DISJOIN.mirror} onChange={(v) => set({ mirrorDisjoin: v })} />
        </>
      )}
      {tool === 'array' && <ArrayOptionsBar />}
      {tool === 'grid' && <GridOptionsBar />}
      {tool === 'align' && (
        <label>
          {t('pro_align_prefer')}
          <select
            id="opt-alignprefer"
            className="select"
            value={o.alignPrefer ?? 'faces'}
            onChange={(e) => set({ alignPrefer: e.target.value as NonNullable<typeof o.alignPrefer> })}
          >
            <option value="faces">{t('pro_align_faces')}</option>
            <option value="eixos">{t('pro_align_axes')}</option>
            <option value="nucleo">{t('pro_align_core')}</option>
          </select>
        </label>
      )}
      {tool === 'offset' && (
        <>
          <label>
            {t('pro_distance')}
            <NumField
              id="opt-offset"
              value={o.offsetDistance}
              onCommit={(v) => set({ offsetDistance: v })}
              quantity="length"
              min={0.01}
              strictRange
              onInvalid={(texto) => {
                invalidDistance.current = true;
                useUi.setState({ status: { key: 'pro_invalid_distance', args: { text: texto.trim() || t('pro_distance_empty'), kept: formatQuantity(units, 'length', o.offsetDistance) } } });
              }}
              onValid={() => {
                if (!invalidDistance.current) return;
                invalidDistance.current = false;
                useUi.setState({ status: { key: 'pro_status_ready' } });
              }}
            />
          </label>
          <Check id="opt-ocopy" checked={o.offsetCopy} onChange={(v) => set({ offsetCopy: v })}>{t('tool_copy')}</Check>
        </>
      )}
      {tool === 'parallel' && (
        <label>
          {t('pro_measure_distance')}
          <select id="opt-offsetfrom" className="select" value={o.offsetFrom ?? 'face'} onChange={(e) => set({ offsetFrom: e.target.value as 'axis' | 'face' })}>
            <option value="face">{t('pro_offset_face')}</option>
            <option value="axis">{t('pro_offset_axis')}</option>
          </select>
        </label>
      )}
      {tool === 'select' && (
        <>
          <span style={{ color: 'var(--fg-soft)' }}>{sel.length ? t(sel.length > 1 ? 'pro_selected_many' : 'pro_selected_one', { n: sel.length }) : t('pro_nothing_selected')}</span>
          {sel.length > 0 && (
            <button className="btn small danger" onClick={() => editor.deleteSelection()}>{t('pro_delete')}</button>
          )}
        </>
      )}
    </div>
  );
}
