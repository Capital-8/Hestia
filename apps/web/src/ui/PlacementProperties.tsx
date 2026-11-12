import type { ReactElement } from 'react';
import { camposDeNivel } from '../editor/vistaAtiva.ts';
import { isOpeningDimRef, isWallDimRef, planViewOf, type LocationLine } from '@hestia/model';
import { DEFAULT_RAMP_OPTIONS, roofAutoOffset, stairTypeForShape, type ToolId } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { clearDimOverride, setDimOverride, useUi } from '../editor/state.ts';
import { useT, type Dict } from '../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { OPENING_OPTIONS, WALL_OPTIONS, sessionChoice } from './dialogs/dimensionSettingsModel.ts';
import { RampLevelsFields, rampLevelsValue } from './RampLevelsFields.tsx';
import { abrirCaixaDeTexto } from './dialogs/TextDialog.tsx';
import { stairRunFields, stairShapeOptions } from './stairRunFields.ts';

const PLACE_TOOLS = new Set<ToolId>(['wall', 'door', 'window', 'floor', 'slab', 'slope', 'ceiling', 'roof', 'roofextrusion', 'stair', 'stairrun', 'ramp', 'room', 'roomsep', 'dimension', 'text', 'section']);

/** Linha de localização da parede: mesma lista de `LOCATION_LABEL`, traduzida pelo dicionário. */
const LOCATION_KEY: Record<LocationLine, keyof Dict> = {
  wallCenter: 'pra_loc_wall_center',
  coreCenter: 'pra_loc_core_center',
  finishExterior: 'pra_loc_finish_exterior',
  finishInterior: 'pra_loc_finish_interior',
  coreExterior: 'pra_loc_core_exterior',
  coreInterior: 'pra_loc_core_interior',
};

export function hasPlacementProperties(tool: ToolId): boolean {
  return PLACE_TOOLS.has(tool);
}

/** Configurações de colocação ligadas ao mesmo ToolOptions que as ferramentas leem ao criar cada elemento. */
export function PlacementProperties({ tool }: { tool: ToolId }): ReactElement {
  const p = useProject();
  const format = useFormat();
  const { t } = useT();
  const levelId = useUi((s) => s.levelId);
  const planViewId = useUi((s) => s.planViewId);
  const vistaAtiva = planViewOf(p, planViewId);
  const areaPlan = vistaAtiva?.kind === 'area' ? vistaAtiva : undefined;
  // Na planta de área, as anotações ficam na vista; a frase abaixo já reflete o destino real.
  const targetName = areaPlan
    ? t('pra_msg_area_plan_target', { name: areaPlan.name })
    : t('pra_msg_active_level_target', { name: p.levels.find((l) => l.id === levelId)?.name ?? t('pra_msg_current_level') });
  const o = useUi((s) => s.options);
  const dimOverrides = useUi((s) => s.dimOverrides);
  // Troca rápida das cotas: vale só para a sessão ('' volta ao padrão do projeto).
  const chooseDim = (key: string, v: string): void => (isWallDimRef(v) || isOpeningDimRef(v) ? setDimOverride(key, v) : clearDimOverride(key));
  const set = (patch: Partial<typeof o>): void => useUi.setState((s) => ({ options: { ...s.options, ...patch } }));
  const setStairRun = (patch: Partial<NonNullable<typeof o.stairRun>>): void => set({ stairRun: { ...(o.stairRun ?? { shape: 'straight', width: 1.2, turn: 'left' }), ...patch } });
  const setStair = (patch: Partial<NonNullable<typeof o.stair>>): void => set({ stair: { ...(o.stair ?? {}), ...patch } });
  const setRamp = (patch: Partial<NonNullable<typeof o.ramp>>): void => set({ ramp: { ...(o.ramp ?? DEFAULT_RAMP_OPTIONS), ...patch } });

  return (
    <>
      {tool === 'wall' && (
        <Group title={t('pra_pgrp_placement_wall')}>
          <Row label={t('pra_fld_form')} htmlFor="place-wall-shape"><select id="place-wall-shape" className="select" value={o.wallShape} onChange={(e) => set({ wallShape: e.target.value as typeof o.wallShape })}><option value="line">{t('pra_opt_line')}</option><option value="arc">{t('pra_opt_arc_3_points')}</option><option value="rect">{t('pra_opt_rectangle')}</option></select></Row>
          <Row label={t('pra_fld_base_level')}><span className="val">{p.levels.find((l) => l.id === levelId)?.name ?? t('pra_msg_active_level')}</span></Row>
          <Row label={t('pra_fld_base_offset')} htmlFor="place-wall-base"><NumField id="place-wall-base" value={o.wallBaseOffset ?? 0} quantity="length" onCommit={(v) => set({ wallBaseOffset: v })} /></Row>
          <Row label={t('pra_fld_top_level')} htmlFor="place-wall-top"><select id="place-wall-top" className="select" value={o.wallTopLevelId ?? ''} onChange={(e) => set({ wallTopLevelId: e.target.value || null })}><option value="">{t('pra_opt_by_height')}</option>{p.levels.filter((l) => l.id !== levelId).map((l) => <option key={l.id} value={l.id}>{t('pra_opt_up_to', { name: l.name })}</option>)}</select></Row>
          {o.wallTopLevelId ? <Row label={t('pra_fld_top_offset')} htmlFor="place-wall-topoff"><NumField id="place-wall-topoff" value={o.wallTopOffset ?? 0} quantity="length" onCommit={(v) => set({ wallTopOffset: v })} /></Row> : <Row label={t('pra_fld_height')} htmlFor="place-wall-height"><NumField id="place-wall-height" value={o.wallHeight} quantity="length" min={0.1} onCommit={(v) => set({ wallHeight: v })} /></Row>}
          <Row label={t('pra_fld_location_line')} htmlFor="place-wall-location"><select id="place-wall-location" className="select" value={o.locationLine} onChange={(e) => set({ locationLine: e.target.value as LocationLine })}>{Object.keys(LOCATION_KEY).map((key) => <option key={key} value={key}>{t(LOCATION_KEY[key as LocationLine])}</option>)}</select></Row>
          <Row label={t('pra_fld_flip_exterior')}><Check id="place-wall-flipped" checked={o.wallFlipped ?? false} onChange={(v) => set({ wallFlipped: v })} /></Row>
          <Row label={t('pra_fld_chain')}><Check id="place-wall-chain" checked={o.chain} onChange={(v) => set({ chain: v })} /></Row>
        </Group>
      )}
      {(tool === 'door' || tool === 'window') && (
        <Group title={tool === 'door' ? t('pra_pgrp_placement_door') : t('pra_pgrp_placement_window')}>
          <Row label={t('pra_fld_flip_hand')}><Check id="place-open-hand" checked={o.openingFlipHand ?? false} onChange={(v) => set({ openingFlipHand: v })} /></Row>
          <Row label={t('pra_fld_flip_facing')}><Check id="place-open-facing" checked={o.openingFlipFacing ?? false} onChange={(v) => set({ openingFlipFacing: v })} /></Row>
          <Row label={t('pra_fld_facing')} htmlFor="place-open-facing-mode"><select id="place-open-facing-mode" className="select" value={o.openingFacingMode ?? 'cursor'} onChange={(e) => set({ openingFacingMode: e.target.value as NonNullable<typeof o.openingFacingMode> })}><option value="cursor">{t('pra_opt_by_cursor')}</option><option value="fixed">{t('pra_opt_manual')}</option></select></Row>
          <Row label={t('pra_fld_open')} htmlFor="place-open-toward"><select id="place-open-toward" className="select" value={o.openingToward ?? 'cursor'} onChange={(e) => set({ openingToward: e.target.value as NonNullable<typeof o.openingToward> })}><option value="cursor">{t('pra_opt_toward_cursor')}</option><option value="away">{t('pra_opt_away_from_cursor')}</option></select></Row>
          <Row label={t('pra_fld_anchor')} htmlFor="place-open-anchor"><select id="place-open-anchor" className="select" value={o.openingAnchor ?? 'center'} onChange={(e) => set({ openingAnchor: e.target.value as NonNullable<typeof o.openingAnchor> })}><option value="center">{t('pra_opt_center')}</option><option value="hinge">{t('pra_opt_hinge_jamb')}</option><option value="latch">{t('pra_opt_latch_jamb')}</option></select></Row>
          <Row label={t('pra_fld_corner_clearance')} htmlFor="place-open-clear"><NumField id="place-open-clear" value={o.openingClear ?? 0.1} quantity="smallLength" min={0} onCommit={(v) => set({ openingClear: v })} /></Row>
          <Row label={t('pra_fld_dim_wall')} htmlFor="place-open-dim-wall"><select id="place-open-dim-wall" className="select" value={sessionChoice(dimOverrides, 'opening:wall')} onChange={(e) => chooseDim('opening:wall', e.target.value)}><option value="">{t('pra_opt_project_default')}</option>{WALL_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></Row>
          <Row label={t('pra_fld_dim_opening')} htmlFor="place-open-dim-self"><select id="place-open-dim-self" className="select" value={sessionChoice(dimOverrides, 'opening:opening')} onChange={(e) => chooseDim('opening:opening', e.target.value)}><option value="">{t('pra_opt_project_default')}</option>{OPENING_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></Row>
          <Row label={t('pra_fld_opening_tags')}><Check id="place-open-tags" checked={p.settings.showOpeningTags === true} onChange={(v) => editor.store.exec({ type: 'setSettings', patch: { showOpeningTags: v } })} /></Row>
          <Row label={t('pra_fld_tag_on_place')}><Check id="place-open-tag-place" checked={o.openingTagOnPlace !== false} onChange={(v) => set({ openingTagOnPlace: v })} /></Row>
          {(() => { const typeId = tool === 'door' ? o.doorTypeId : o.windowTypeId; const type = p.openingTypes[typeId]; return <Row label={t('pra_fld_sill')} htmlFor="place-opening-sill"><NumField id="place-opening-sill" value={o.openingSillOverride ?? type?.sill ?? 0} placeholder={type ? t('pra_ph_sill_from_type', { value: format('length', type.sill) }) : undefined} onCommit={(v) => set({ openingSillOverride: v })} onClear={() => set({ openingSillOverride: null })} quantity="length" min={0} /></Row>; })()}
          <div className="hint">{t('pra_msg_opening_placement_hint')}</div>
        </Group>
      )}
      {tool === 'floor' && (
        <Group title={t('pra_pgrp_placement_floor')}>
          <Row label={t('pra_fld_top_offset')} htmlFor="place-floor-offset"><NumField id="place-floor-offset" value={o.floorOffset} quantity="length" onCommit={(v) => set({ floorOffset: v })} /></Row>
        </Group>
      )}
      {(tool === 'slab' || tool === 'slope') && (
        <Group title={tool === 'slope' ? t('pra_pgrp_placement_slope') : t('pra_pgrp_placement_slab')}>
          {tool === 'slab' && <>
            <Row label={t('pra_fld_top_offset')} htmlFor="place-slab-offset"><NumField id="place-slab-offset" value={o.slabOffset} quantity="length" onCommit={(v) => set({ slabOffset: v })} /></Row>
          </>}
          <Row label={t('pra_fld_slope_percent')} htmlFor="place-slab-slope"><NumField id="place-slab-slope" value={o.slabSlopePercent / 100} quantity="slope" onCommit={(v) => set({ slabSlopePercent: v * 100 })} /></Row>
        </Group>
      )}
      {tool === 'ceiling' && (
        <Group title={t('pra_pgrp_placement_ceiling')}>
          <Row label={t('pra_fld_top_elevation')} htmlFor="place-ceiling-offset"><NumField id="place-ceiling-offset" value={o.ceilingOffset ?? 2.6} quantity="length" onCommit={(v) => set({ ceilingOffset: v })} /></Row>
        </Group>
      )}
      {(tool === 'roof' || tool === 'roofextrusion') && (
        <Group title={t('pra_pgrp_placement_roof')}>
          <Row label={t('pra_fld_inclination')} htmlFor="place-roof-slope"><NumField id="place-roof-slope" value={(o.roofSlope ?? 30) / 100} quantity="slope" min={0.001} onCommit={(v) => set({ roofSlope: v * 100 })} /></Row>
          <Row label={t('pra_fld_eave_overhang')} htmlFor="place-roof-overhang"><NumField id="place-roof-overhang" value={o.roofOverhang ?? 0.5} quantity="length" min={0} onCommit={(v) => set({ roofOverhang: v })} /></Row>
          <Row label={t('pra_fld_eave_elevation')} htmlFor="place-roof-offset"><NumField id="place-roof-offset" value={o.roofOffset ?? roofAutoOffset(p, levelId)} quantity="length" onCommit={(v) => set({ roofOffset: v })} /></Row>
          <div className="prow"><span /><button className="btn small" onClick={() => set({ roofOffset: null })}>{t('pra_btn_auto_elevation')}</button></div>
        </Group>
      )}
      {tool === 'stair' && (
        <Group title={t('pra_pgrp_placement_stair')}>
          <Row label={t('pra_fld_top_level_stair')} htmlFor="place-stair-top"><select id="place-stair-top" className="select" value={o.stair?.topLevelId ?? ''} onChange={(e) => setStair({ topLevelId: e.target.value || null })}><option value="">{t('pra_opt_level_above')}</option>{p.levels.filter((l) => l.id !== levelId).map((l) => <option key={l.id} value={l.id}>{t('pra_opt_up_to', { name: l.name })}</option>)}</select></Row>
          <Row label={t('pra_fld_base_offset')} htmlFor="place-stair-base"><NumField id="place-stair-base" value={o.stair?.baseOffset ?? 0} quantity="length" onCommit={(v) => setStair({ baseOffset: v })} /></Row>
          <Row label={t('pra_fld_top_offset')} htmlFor="place-stair-topoff"><NumField id="place-stair-topoff" value={o.stair?.topOffset ?? 0} quantity="length" onCommit={(v) => setStair({ topOffset: v })} /></Row>
          {!(o.stair?.topLevelId ?? p.levels.some((l) => l.elevation > (p.levels.find((x) => x.id === levelId)?.elevation ?? 0))) && <Row label={t('pra_fld_height')} htmlFor="place-stair-height"><NumField id="place-stair-height" value={o.stair?.height ?? 2.8} quantity="length" min={0.1} onCommit={(v) => setStair({ height: v })} /></Row>}
        </Group>
      )}
      {tool === 'stairrun' && (() => {
        const run = o.stairRun ?? { shape: 'straight' as const, width: 1.2, turn: 'left' as const };
        const fields = stairRunFields(run.shape);
        return (
          <Group title={t('pra_pgrp_placement_stair_run')}>
            <Row label={t('pra_fld_form')} htmlFor="place-run-shape"><select id="place-run-shape" className="select" value={run.shape} onChange={(e) => { const shape = e.target.value as NonNullable<typeof o.stairRun>['shape']; setStairRun({ shape, typeId: stairTypeForShape(p, shape, run.typeId) ?? undefined }); }}>{stairShapeOptions(t('stair_shape_free')).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Row>
            {fields.width && <Row label={t('pra_fld_width')} htmlFor="place-run-width"><NumField id="place-run-width" value={run.width} quantity="length" min={0.4} onCommit={(v) => setStairRun({ width: v })} /></Row>}
            {fields.landing && <Row label={t('pra_fld_landing_depth')} htmlFor="place-run-landing"><NumField id="place-run-landing" value={run.landingDepth ?? null} placeholder={t('pra_ph_width')} quantity="length" min={0.1} onCommit={(v) => setStairRun({ landingDepth: v })} onClear={() => setStairRun({ landingDepth: undefined })} /></Row>}
            {fields.turn && <Row label={t('pra_fld_turn')} htmlFor="place-run-turn"><select id="place-run-turn" className="select" value={run.turn} onChange={(e) => setStairRun({ turn: e.target.value as 'left' | 'right' })}><option value="left">{t('pra_opt_left')}</option><option value="right">{t('pra_opt_right')}</option></select></Row>}
            {/* units-ok: varredura da escada em graus (valor gravado em graus) */}
            {fields.spiral && <><Row label={t('pra_fld_inner_radius')} htmlFor="place-run-inner"><NumField id="place-run-inner" value={run.spiralInner ?? 0.1} quantity="length" min={0.05} onCommit={(v) => setStairRun({ spiralInner: v })} /></Row><Row label={t('pra_fld_outer_radius')} htmlFor="place-run-outer"><NumField id="place-run-outer" value={run.spiralOuter ?? 1} quantity="length" min={0.2} onCommit={(v) => setStairRun({ spiralOuter: v })} /></Row><Row label={t('pra_fld_sweep')} htmlFor="place-run-sweep"><NumField id="place-run-sweep" value={((run.spiralSweep ?? 360) * Math.PI) / 180} quantity="angle" min={(30 * Math.PI) / 180} max={(720 * Math.PI) / 180} onCommit={(v) => setStairRun({ spiralSweep: (v * 180) / Math.PI })} /></Row></>}
          </Group>
        );
      })()}
      {tool === 'ramp' && (
        <Group title={t('pra_pgrp_placement_ramp')}>
          <RampLevelsFields project={p} levelId={levelId} idPrefix="place-ramp" value={rampLevelsValue(o.ramp ?? DEFAULT_RAMP_OPTIONS)} onChange={setRamp} Field={Row} />
        </Group>
      )}
      {tool === 'room' && (
        <Group title={t('pra_pgrp_placement_room')}>
          <Row label={t('pra_fld_level')} htmlFor="place-room-level"><select id="place-room-level" className="select" value={levelId} onChange={(e) => useUi.setState((s) => ({ ...camposDeNivel(p, s, e.target.value), selection: [] }))}>{p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Row>
          <Row label={t('pra_fld_name')} htmlFor="place-room-name"><TextField id="place-room-name" value={o.roomName ?? ''} placeholder={t('pra_opt_automatic')} onCommit={(v) => set({ roomName: v })} /></Row>
          <Row label={t('pra_fld_number')} htmlFor="place-room-number"><TextField id="place-room-number" value={o.roomNumber ?? ''} placeholder={t('pra_opt_automatic')} onCommit={(v) => set({ roomNumber: v })} /></Row>
          <Row label={t('pra_fld_base_offset')} htmlFor="place-room-offset"><NumField id="place-room-offset" value={o.roomHeightOffset ?? 0} quantity="length" onCommit={(v) => set({ roomHeightOffset: v })} /></Row>
          <Row label={t('pra_fld_ceiling_height')} htmlFor="place-room-height"><NumField id="place-room-height" value={o.roomCeilingHeight ?? 2.8} quantity="length" min={0.1} onCommit={(v) => set({ roomCeilingHeight: v })} /></Row>
          <Row label={t('pra_fld_finish_floor_long')} htmlFor="place-room-floor"><TextField id="place-room-floor" value={o.roomFloorFinish ?? ''} onCommit={(v) => set({ roomFloorFinish: v })} /></Row>
          <Row label={t('pra_fld_finish_wall_long')} htmlFor="place-room-wall"><TextField id="place-room-wall" value={o.roomWallFinish ?? ''} onCommit={(v) => set({ roomWallFinish: v })} /></Row>
          <Row label={t('pra_fld_finish_ceiling_long')} htmlFor="place-room-ceiling"><TextField id="place-room-ceiling" value={o.roomCeilingFinish ?? ''} onCommit={(v) => set({ roomCeilingFinish: v })} /></Row>
          <Row label={t('pra_fld_color')}><input id="place-room-color" type="color" aria-label={t('pra_aria_room_color')} value={o.roomColor ?? '#b8c4d4'} onChange={(e) => set({ roomColor: e.target.value })} /></Row>
        </Group>
      )}
      {tool === 'text' && (
        <Group title={t('pra_pgrp_placement_text')}>
          <Row label={t('pra_fld_text_height')} htmlFor="place-text-height"><NumField id="place-text-height" value={o.textHeight ?? 2.5} unit="mm" min={0.1} onCommit={(v) => set({ textHeight: v })} /></Row>
          <Row label={t('pra_fld_rotation')} htmlFor="place-text-rotation"><NumField id="place-text-rotation" value={o.textRotation ?? 0} unit="°" onCommit={(v) => set({ textRotation: v })} /></Row>
          <div className="prow"><span /><button type="button" className="btn small" onClick={abrirCaixaDeTexto}>{t('pra_btn_text_box')}</button></div>
          <div className="hint">{t('pra_msg_text_placement_hint')}</div>
        </Group>
      )}
      {['room', 'roomsep', 'dimension', 'text', 'section'].includes(tool) && (
        <Group title={tool === 'room' ? t('pra_pgrp_placement_room') : tool === 'roomsep' ? t('pra_pgrp_placement_room_sep') : tool === 'dimension' ? t('pra_pgrp_placement_dimension') : tool === 'text' ? t('pra_pgrp_placement_text') : t('pra_pgrp_placement_section')}>
          <div className="hint">{t('pra_msg_annotation_target_hint', { target: targetName })}</div>
        </Group>
      )}
      {!['room', 'roomsep', 'dimension', 'text', 'section'].includes(tool) && (
        <Group title={t('pra_pgrp_level_identity')} open={false}>
          <Row label={t('pra_fld_level')} htmlFor="place-level"><select id="place-level" className="select" value={levelId} onChange={(e) => useUi.setState((s) => ({ ...camposDeNivel(p, s, e.target.value), selection: [] }))}>{p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Row>
          <Row label={t('pra_fld_mark')} htmlFor="place-mark"><TextField id="place-mark" value={o.placementMark ?? ''} onCommit={(v) => set({ placementMark: v })} /></Row>
          {tool !== 'door' && tool !== 'window' ? <Row label={t('pra_fld_comments')} htmlFor="place-comments"><TextField id="place-comments" value={o.placementComments ?? ''} onCommit={(v) => set({ placementComments: v })} /></Row> : null}
        </Group>
      )}
    </>
  );
}
