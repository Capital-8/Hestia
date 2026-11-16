import { useUi, type DialogKind } from '../editor/state.ts';
import { useProject } from '../editor/controller.ts';
import { useI18n, useT, type Dict } from '../editor/i18n.ts';
import {
  defaultDimensionFamilyIdOf,
  defaultNorthArrowFamilyIdOf,
  defaultRevisionCloudFamilyIdOf,
  defaultSpotFamilyIdOf,
  defaultTagFamilyIdOf,
  defaultTextFamilyIdOf,
  dimensionFamiliesOf,
  dimensionStyleOf,
  northArrowFamiliesOf,
  revisionCloudFamiliesOf,
  spotFamiliesOf,
  tagFamiliesOf,
  textFamiliesOf,
} from '@hestia/model';
import { DEFAULT_RAMP_OPTIONS, DEFAULT_STAIR_RUN_OPTIONS, stairTypeForShape, stairTypeId, stairTypesForShape } from '@hestia/tools';
import type { ReactElement } from 'react';
import { TypeSelector } from './TypeSelector.tsx';
import { beamOptions, ceilingOptions, columnOptions, dimensionOptions, floorOptions, footingOptions, openingOptions, openingOptionsDaCortina, rampOptions, roofOptions, slabOptions, stairOptions, tagOptions, wallOptions } from './typeOptions.ts';
import { setStairOpt } from './StairOptionsBar.tsx';

/** Ferramentas de colocação com tipo: a paleta mostra o tipo escolhido antes de desenhar (o mesmo valor da barra de opções). */
export type ToolTypeKind = 'wall' | 'door' | 'window' | 'curtainDoor' | 'curtainWindow' | 'floor' | 'slab' | 'ceiling' | 'roof' | 'roofextrusion' | 'stair' | 'stairrun' | 'ramp' | 'column' | 'beam' | 'footing' | 'dimension' | 'text' | 'spotElevation' | 'spotCoordinate' | 'revisionCloud' | 'northArrow' | 'tag';
const TOOL_TYPE_LABEL = {
  wall: 'prb_place_wall',
  door: 'prb_place_door',
  window: 'prb_place_window',
  // Porta/janela na cortina: o mesmo cabeçalho e o mesmo seletor de tipo das esquadrias de parede (decisão 0056, §7.2).
  curtainDoor: 'prb_place_door',
  curtainWindow: 'prb_place_window',
  floor: 'prb_place_floor',
  slab: 'prb_place_slab',
  ceiling: 'prb_place_ceiling',
  roof: 'prb_place_roof',
  roofextrusion: 'prb_place_roof_extrusion',
  stair: 'prb_place_stair_sketch',
  stairrun: 'prb_place_stair',
  ramp: 'prb_place_ramp',
  column: 'tool_column',
  beam: 'tool_beam',
  footing: 'tool_footing',
  dimension: 'pra_pgrp_placement_dimension',
  text: 'pra_pgrp_placement_text',
  spotElevation: 'pra_pgrp_placement_dimension',
  spotCoordinate: 'pra_pgrp_placement_dimension',
  revisionCloud: 'pra_pgrp_detail_line',
  northArrow: 'pra_pgrp_detail_line',
  tag: 'tg_pgrp_tag',
} as const satisfies Record<ToolTypeKind, keyof Dict>;

export function isToolTypeKind(tool: string): tool is ToolTypeKind {
  return tool in TOOL_TYPE_LABEL;
}

/** Seletor de tipo da ferramenta ativa, sem seleção: lê e grava o tipo nas opções, como a barra de opções faz. */
export function ToolTypeProps({ tool }: { tool: ToolTypeKind }): ReactElement {
  const p = useProject();
  const { t } = useT();
  const o = useUi((s) => s.options);
  const setOpt = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...useUi.getState().options, ...patch } });
  const categoryLabel = t(TOOL_TYPE_LABEL[tool]);
  const edit = (dialog: DialogKind, id: string | undefined): void => {
    if (id) useUi.setState({ dialog, dialogArg: id });
  };
  switch (tool) {
    case 'wall':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-walltype" label={t('prb_prop_type_wall')} options={wallOptions(p)} selectedId={o.wallTypeId ?? null}
          onSelect={(id) => setOpt({ wallTypeId: id })} onEdit={() => edit('wallType', o.wallTypeId)} />
      );
    case 'door':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-opentype" label={t('prb_prop_type_opening')} options={openingOptions(p, 'door')} selectedId={o.doorTypeId ?? null}
          favoriteIds={p.settings.favoriteOpeningTypes ?? []} onSelect={(id) => setOpt({ doorTypeId: id })} onEdit={() => edit('openingType', o.doorTypeId)} />
      );
    case 'curtainDoor':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-opentype" label={t('prb_prop_type_opening')} options={openingOptionsDaCortina(p, 'door')} selectedId={o.doorTypeId ?? null}
          favoriteIds={p.settings.favoriteOpeningTypes ?? []} onSelect={(id) => setOpt({ doorTypeId: id })} onEdit={() => edit('openingType', o.doorTypeId)} />
      );
    case 'window':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-opentype" label={t('prb_prop_type_opening')} options={openingOptions(p, 'window')} selectedId={o.windowTypeId ?? null}
          favoriteIds={p.settings.favoriteOpeningTypes ?? []} onSelect={(id) => setOpt({ windowTypeId: id })} onEdit={() => edit('openingType', o.windowTypeId)} />
      );
    case 'curtainWindow':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-opentype" label={t('prb_prop_type_opening')} options={openingOptionsDaCortina(p, 'window')} selectedId={o.windowTypeId ?? null}
          favoriteIds={p.settings.favoriteOpeningTypes ?? []} onSelect={(id) => setOpt({ windowTypeId: id })} onEdit={() => edit('openingType', o.windowTypeId)} />
      );
    case 'floor':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-floortype" label={t('prb_prop_type_floor')} options={floorOptions(p)} selectedId={o.floorTypeId ?? null}
          onSelect={(id) => setOpt({ floorTypeId: id })} onEdit={() => edit('floorType', o.floorTypeId)} />
      );
    case 'slab':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-slabtype" label={t('prb_prop_type_slab')} options={slabOptions(p)} selectedId={o.slabTypeId ?? null}
          onSelect={(id) => setOpt({ slabTypeId: id })} onEdit={() => edit('slabType', o.slabTypeId)} />
      );
    case 'ceiling':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-ceilingtype" label={t('prb_prop_type_ceiling')} options={ceilingOptions(p)} selectedId={o.ceilingTypeId ?? null}
          onSelect={(id) => setOpt({ ceilingTypeId: id })} onEdit={() => edit('ceilingType', o.ceilingTypeId)} />
      );
    case 'roof':
    case 'roofextrusion':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-rooftype" label={t('prb_prop_type_roof')} options={roofOptions(p)} selectedId={o.roofTypeId ?? null}
          onSelect={(id) => setOpt({ roofTypeId: id })} onEdit={() => edit('roofType', o.roofTypeId)} />
      );
    case 'stair': {
      const sid = stairTypeId(p, o.stair?.typeId) ?? '';
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-stairtype" label={t('prb_prop_type_stair')} options={stairOptions(p)} selectedId={sid || null}
          onSelect={(id) => setStairOpt({ typeId: id })} onEdit={() => edit('stairType', sid)} />
      );
    }
    case 'stairrun': {
      // A escada por lance (reta, L, U, leque ou caracol) só lista os tipos que servem à forma escolhida na barra de opções.
      const run = o.stairRun ?? DEFAULT_STAIR_RUN_OPTIONS;
      const allowed = new Set(stairTypesForShape(p, run.shape).map((t) => t.id));
      const sid = stairTypeForShape(p, run.shape, run.typeId) ?? '';
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-stairruntype" label={t('prb_prop_type_stair')} options={stairOptions(p).filter((t) => allowed.has(t.id))} selectedId={sid || null}
          onSelect={(id) => setOpt({ stairRun: { ...(useUi.getState().options.stairRun ?? DEFAULT_STAIR_RUN_OPTIONS), typeId: id } })} onEdit={() => edit('stairType', sid)} />
      );
    }
    case 'ramp': {
      const current = o.ramp ?? DEFAULT_RAMP_OPTIONS;
      const rid = current.typeId && p.rampTypes[current.typeId] ? current.typeId : (Object.keys(p.rampTypes)[0] ?? '');
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-ramptype" label={t('prb_prop_type_ramp')} options={rampOptions(p)} selectedId={rid || null}
          onSelect={(id) => setOpt({ ramp: { ...current, typeId: id } })} onEdit={() => edit('rampType', rid)} />
      );
    }
    case 'column':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-columntype" label={t('str_prop_type_column')} options={columnOptions(p)} selectedId={o.columnTypeId ?? null}
          onSelect={(id) => setOpt({ columnTypeId: id })} onEdit={() => edit('columnType', o.columnTypeId)} />
      );
    case 'beam':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-beamtype" label={t('str_prop_type_beam')} options={beamOptions(p)} selectedId={o.beamTypeId ?? null}
          onSelect={(id) => setOpt({ beamTypeId: id })} onEdit={() => edit('beamType', o.beamTypeId)} />
      );
    case 'footing':
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-footingtype" label={t('str_prop_type_footing')} options={footingOptions(p)} selectedId={o.footingTypeId ?? null}
          onSelect={(id) => setOpt({ footingTypeId: id })} onEdit={() => edit('footingType', o.footingTypeId)} />
      );
    case 'dimension': {
      const fams = dimensionFamiliesOf(p.settings, useI18n.getState().lang);
      const id = o.dimensionFamilyId ?? defaultDimensionFamilyIdOf(p.settings);
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-dimfamily" label={t('pra_pgrp_placement_dimension')} options={dimensionOptions(fams, categoryLabel)} selectedId={id}
          onSelect={(v) => setOpt({ dimensionFamilyId: v })} onEdit={() => useUi.setState({ dialog: 'dimensionFamilies', dimFamilyFocus: id })} />
      );
    }
    case 'text': {
      const fams = textFamiliesOf(p.settings);
      const id = o.textFamilyId ?? defaultTextFamilyIdOf(p.settings);
      const subj = { kind: 'dimension' as const, style: dimensionStyleOf(p.settings) };
      return (
        <TypeSelector categoryLabel={categoryLabel} triggerId="prop-textfamily" label={t('pra_pgrp_text')} options={fams.map((f) => ({ id: f.id, name: f.name, code: '', family: t('pra_pgrp_text'), subject: subj }))} selectedId={id}
          onSelect={(v) => setOpt({ textFamilyId: v })} onEdit={() => edit('textFamilies', id)} />
      );
    }
    case 'spotElevation':
    case 'spotCoordinate': {
      const kind = tool === 'spotElevation' ? 'elevation' : 'coordinate';
      const famLabel = kind === 'elevation' ? 'Cota de elevação' : 'Coordenada de ponto';
      const fams = spotFamiliesOf(p.settings, kind);
      const id = (kind === 'elevation' ? o.spotElevationFamilyId : o.spotCoordinateFamilyId) ?? defaultSpotFamilyIdOf(p.settings, kind);
      const subj = { kind: 'dimension' as const, style: dimensionStyleOf(p.settings) };
      return (
        <TypeSelector categoryLabel={famLabel} triggerId="prop-spotfamily" label={famLabel} options={fams.map((f) => ({ id: f.id, name: f.name, code: '', family: famLabel, subject: subj }))} selectedId={id}
          onSelect={(v) => setOpt(kind === 'elevation' ? { spotElevationFamilyId: v } : { spotCoordinateFamilyId: v })} onEdit={() => edit('spotFamilies', id)} />
      );
    }
    case 'revisionCloud': {
      const fams = revisionCloudFamiliesOf(p.settings);
      const id = o.revisionCloudFamilyId ?? defaultRevisionCloudFamilyIdOf(p.settings);
      const subj = { kind: 'dimension' as const, style: dimensionStyleOf(p.settings) };
      return (
        <TypeSelector categoryLabel="Nuvem de revisão" triggerId="prop-rcfamily" label="Nuvem de revisão" options={fams.map((f) => ({ id: f.id, name: f.name, code: '', family: 'Nuvem de revisão', subject: subj }))} selectedId={id}
          onSelect={(v) => setOpt({ revisionCloudFamilyId: v })} onEdit={() => edit('revisionCloudFamilies', id)} />
      );
    }
    case 'northArrow': {
      const fams = northArrowFamiliesOf(p.settings);
      const id = o.northArrowFamilyId ?? defaultNorthArrowFamilyIdOf(p.settings);
      const subj = { kind: 'dimension' as const, style: dimensionStyleOf(p.settings) };
      return (
        <TypeSelector categoryLabel="Seta norte" triggerId="prop-symfamily" label="Seta norte" options={fams.map((f) => ({ id: f.id, name: f.name, code: '', family: 'Seta norte', subject: subj }))} selectedId={id}
          onSelect={(v) => setOpt({ northArrowFamilyId: v })} onEdit={() => edit('northArrowFamilies', id)} />
      );
    }
    case 'tag': {
      const fams = tagFamiliesOf(p.settings, useI18n.getState().lang);
      const id = o.tagFamilyId ?? defaultTagFamilyIdOf(p.settings);
      return (
        <TypeSelector categoryLabel={t('tg_pgrp_tag')} triggerId="prop-tagfamily" label={t('tg_fld_family')} options={tagOptions(fams, t('tg_pgrp_tag'))} selectedId={id}
          onSelect={(v) => setOpt({ tagFamilyId: v })} onEdit={() => useUi.setState({ dialog: 'tagFamilies', tagFamilyFocus: id })} />
      );
    }
  }
}

