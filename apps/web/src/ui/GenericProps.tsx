import { useMemo, type ReactElement } from 'react';
import { genericQuantities } from '@hestia/engine';
import type { Generic } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { fmtNum, t, useI18n, useT, type Lang } from '../editor/i18n.ts';
import { Group, Row } from './fields.tsx';

/** Máximo de propriedades IFC listadas por objeto; o resto vira um aviso "+N". */
const MAX_PROPS = 30;

/** Valor comum aos selecionados, ou `null` quando nenhum tem valor (ou `variados` quando divergem). */
function commonText(values: Array<string | undefined>, lang: Lang): string | null {
  const present = values.filter((v): v is string => !!v);
  if (present.length === 0) return null;
  const unique = new Set(present);
  return unique.size === 1 ? [...unique][0]! : t(lang, 'prc_opt_varied');
}

/** Chave de um vértice pela posição: a malha importada duplica os vértices por triângulo, então o índice não serve. */
function vertexKey(positions: readonly number[], i: number): string {
  return `${positions[i * 3]!.toFixed(6)},${positions[i * 3 + 1]!.toFixed(6)},${positions[i * 3 + 2]!.toFixed(6)}`;
}

/**
 * Malha aberta = alguma aresta não é compartilhada por exatamente dois triângulos. Numa malha importada os vértices vêm
 * repetidos em cada triângulo, por isso a comparação é pela posição, não pelo índice.
 */
export function isOpenMesh(mesh: Generic['mesh']): boolean {
  const count = Math.floor(mesh.positions.length / 3);
  const triples = Math.floor(mesh.indices.length / 3);
  if (triples === 0) return true;
  const edges = new Map<string, number>();
  for (let t = 0; t < triples; t++) {
    const ia = mesh.indices[t * 3]!;
    const ib = mesh.indices[t * 3 + 1]!;
    const ic = mesh.indices[t * 3 + 2]!;
    if (![ia, ib, ic].every((i) => Number.isInteger(i) && i >= 0 && i < count)) return true;
    if (![ia, ib, ic].every((i) => [0, 1, 2].every((k) => Number.isFinite(mesh.positions[i * 3 + k])))) return true;
    const keys = [vertexKey(mesh.positions, ia), vertexKey(mesh.positions, ib), vertexKey(mesh.positions, ic)];
    for (const [a, b] of [[keys[0]!, keys[1]!], [keys[1]!, keys[2]!], [keys[2]!, keys[0]!]] as const) {
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  return [...edges.values()].some((n) => n !== 2);
}

/** Valor de uma propriedade IFC para exibição (booleano vira Sim/Não; texto e número saem como vieram). */
const propText = (v: string | number | boolean, lang: Lang): string => (typeof v === 'boolean' ? (v ? t(lang, 'prc_val_yes') : t(lang, 'prc_val_no')) : String(v));

/** Contagens da seleção atual; o painel de Propriedades usa para o rótulo do cabeçalho. */
export interface SelectionLabelInput {
  walls: number;
  ops: number;
  floors: number;
  slabs: number;
  ceilings: number;
  roofs: number;
  stairs: number;
  ramps: number;
  rooms: number;
  generics: number;
  /** Desenhos CAD importados (opcional para não quebrar os chamadores antigos). */
  cads?: number;
  grade: { name: string } | null | undefined;
  view: { kind: string; name: string } | null;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

/** Rótulo do cabeçalho da paleta: o grupo selecionado, com singular e plural. */
export function selectionLabel(c: SelectionLabelInput, lang: Lang = useI18n.getState().lang): string {
  if (c.grade) return t(lang, 'prc_sel_grade', { name: c.grade.name });
  if (c.walls) return plural(c.walls, t(lang, 'prc_sel_wall_one'), t(lang, 'prc_sel_wall_many'));
  if (c.ops) return plural(c.ops, t(lang, 'prc_sel_opening_one'), t(lang, 'prc_sel_opening_many'));
  if (c.floors) return plural(c.floors, t(lang, 'prc_sel_floor_one'), t(lang, 'prc_sel_floor_many'));
  if (c.slabs) return plural(c.slabs, t(lang, 'prc_sel_slab_one'), t(lang, 'prc_sel_slab_many'));
  if (c.ceilings) return plural(c.ceilings, t(lang, 'prc_sel_ceiling_one'), t(lang, 'prc_sel_ceiling_many'));
  if (c.roofs) return plural(c.roofs, t(lang, 'prc_sel_roof_one'), t(lang, 'prc_sel_roof_many'));
  if (c.stairs) return plural(c.stairs, t(lang, 'prc_sel_stair_one'), t(lang, 'prc_sel_stair_many'));
  if (c.ramps) return plural(c.ramps, t(lang, 'prc_sel_ramp_one'), t(lang, 'prc_sel_ramp_many'));
  if (c.rooms) return plural(c.rooms, t(lang, 'prc_sel_room_one'), t(lang, 'prc_sel_room_many'));
  if (c.cads) return plural(c.cads, t(lang, 'prc_sel_cad_one'), t(lang, 'prc_sel_cad_many'));
  if (c.generics) return plural(c.generics, t(lang, 'prc_sel_generic_one'), t(lang, 'prc_sel_generic_many'));
  if (c.view) return `${c.view.kind === 'elevation' ? t(lang, 'prc_sel_view_elevation') : t(lang, 'prc_sel_view_section')} ${c.view.name}`;
  return t(lang, 'prc_sel_view');
}

/**
 * Propriedades de objetos importados do IFC (`Generic`): classe de origem, dados do arquivo e quantitativos geométricos
 * de cada selecionado. Somente leitura — não há edição de viga, pilar ou mobiliário importado na v1.
 */
export function GenericProps({ items }: { items: Generic[] }): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const quantities = useMemo(() => new Map(genericQuantities(p).map((q) => [q.id, q])), [p]);
  const levelName = (levelId: string): string => p.levels.find((l) => l.id === levelId)?.name ?? levelId;
  const sourceClass = commonText(items.map((g) => g.sourceClass), lang) ?? '';
  const predefinedType = commonText(items.map((g) => g.predefinedType), lang);
  const objectType = commonText(items.map((g) => g.objectType), lang);
  return (
    <>
      <Group title={t('prc_pgrp_imported')} stateKey="imported">
        <Row label={t('prc_fld_ifc_class')} readOnly><span className="val">{sourceClass}</span></Row>
        {predefinedType && <Row label={t('prc_fld_predefined_type')} readOnly><span className="val soft">{predefinedType}</span></Row>}
        {objectType && <Row label={t('prc_fld_object_type')} readOnly><span className="val soft">{objectType}</span></Row>}
      </Group>
      {items.map((g) => {
        const q = quantities.get(g.id);
        const open = isOpenMesh(g.mesh);
        const props = g.ifcProperties ?? [];
        const shown = props.slice(0, MAX_PROPS);
        return (
          <Group key={g.id} title={g.name}>
            <Row label={t('prc_fld_level')} readOnly><span className="val">{levelName(g.levelId)}</span></Row>
            <Row label={t('prc_fld_triangles')} readOnly><span className="val">{q?.triangles ?? 0}</span></Row>
            <Row label={open ? t('prc_fld_indicative_volume') : t('prc_fld_volume')} readOnly><span className="val">{fmtNum(q?.volume ?? 0, 2, lang)} m³</span></Row>
            <Row label={t('prc_fld_area')} readOnly><span className="val">{fmtNum(q?.area ?? 0, 2, lang)} m²</span></Row>
            {shown.map((prop, i) => {
              const text = propText(prop.value, lang);
              return (
                <Row key={`${prop.name}-${i}`} label={prop.name} readOnly>
                  <span className="val" title={text}>{text}</span>
                </Row>
              );
            })}
            {props.length > MAX_PROPS && <div className="hint">{t('prc_msg_ifc_props_hidden', { n: props.length - MAX_PROPS })}</div>}
          </Group>
        );
      })}
    </>
  );
}
