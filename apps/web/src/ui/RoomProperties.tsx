import { useMemo, type ReactElement } from 'react';
import { resolveRooms, type ResolvedRoom } from '@hestia/engine';
import { areaViewIdAtivo } from '../editor/vistaAtiva.ts';
import { areaPlanOf, DEFAULT_ROOM_CATEGORIES, roomCeilingHeight, type AreaPlan, type Id, type Project, type Room, type RoomTag, type TagField } from '@hestia/model';
import { ensureRoomTagAction, removeRoomTagAction, updateRoomTagAction, type RoomTagPatch } from '../editor/areaPlanActions.ts';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { t as translate, useT, type Dict, type Lang, type TextLike } from '../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';


const ROOM_DEFAULT_COLOR = '#b8c4d4';

const say = (status: TextLike): void => useUi.setState({ status });

/** Campos da etiqueta de ambiente, na ordem em que aparecem no bloco. */
export const TAG_FIELD_OPTIONS: ReadonlyArray<{ field: TagField; labelKey: keyof Dict }> = [
  { field: 'name', labelKey: 'pra_fld_name' },
  { field: 'number', labelKey: 'pra_fld_number' },
  { field: 'area', labelKey: 'pra_fld_area' },
  { field: 'category', labelKey: 'pra_fld_category' },
  { field: 'level', labelKey: 'pra_fld_level' },
  { field: 'perimeter', labelKey: 'pra_fld_perimeter' },
  { field: 'volume', labelKey: 'pra_fld_volume' },
  { field: 'custom', labelKey: 'pra_opt_custom' },
];

/** Liga ou desliga um campo da etiqueta, mantendo ao menos um (o modelo recusa a lista vazia). */
export function toggleTagField(fields: readonly TagField[], field: TagField): TagField[] {
  const on = new Set(fields);
  if (on.has(field)) {
    if (on.size === 1) return [...fields];
    on.delete(field);
  } else on.add(field);
  return TAG_FIELD_OPTIONS.map((o) => o.field).filter((f) => on.has(f));
}

/** Valor comum a todos os selecionados, ou `mixed` quando divergem. */
function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

function patch(ids: Id[], p: Partial<Room>): void {
  editor.store.exec({ type: 'updateElements', ids, patch: p });
}

/** Aviso do ambiente sem circuito fechado: o motivo (ponto fora ou circuito aberto). */
export function roomWarning(r: ResolvedRoom, lang: Lang = 'pt'): string | null {
  if (r.problem === 'fora') return translate(lang, 'pra_msg_room_not_closed_point');
  if (r.problem === 'aberto') return translate(lang, 'pra_msg_room_open_loop');
  if (r.duplicateOf !== undefined) return translate(lang, 'pra_msg_room_duplicate', { name: r.duplicateOf });
  return null;
}

/**
 * Etiqueta do ambiente **nesta planta de área** (`plan.tags`). Os ajustes são da vista: não mexem em
 * `Room.labelPosition` nem no rótulo compartilhado do grupo "Rótulo (todas as vistas)".
 */
export function RoomTagGroup({ room, plan, hasCircuit }: { room: Room; plan: AreaPlan; hasCircuit: boolean }): ReactElement {
  const { t } = useT();
  const tag: RoomTag | undefined = plan.tags.find((t) => t.roomId === room.id);
  const fields = tag?.fields ?? plan.graphics.tagDefault.fields;
  const orientation = tag?.orientation ?? plan.graphics.tagDefault.orientation;
  const leader = tag?.leader ?? plan.graphics.tagDefault.leader;
  const save = (patch: RoomTagPatch): void => {
    try {
      if (!updateRoomTagAction(editor.store, plan.id, room.id, patch)) say({ key: 'pra_msg_room_not_closed_plan' });
    } catch (e) {
      say(e instanceof Error ? e.message : { key: 'pra_msg_tag_update_failed' });
    }
  };
  const toggle = (field: TagField): void => {
    const patch: RoomTagPatch = { fields: toggleTagField(fields, field) };
    // Ao ligar "Personalizado" sem texto, começa com o nome para o rótulo não desaparecer.
    if (field === 'custom' && !fields.includes('custom') && !tag?.custom) patch.custom = room.name;
    save(patch);
  };
  return (
    <Group title={t('pra_pgrp_room_tag_plan')}>
      {hasCircuit ? (
        <>
          <Row label={t('pra_fld_fields')}>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', padding: '2px 4px' }}>
              {TAG_FIELD_OPTIONS.map((o) => (
                <Check key={o.field} id={`p-tagfield-${o.field}`} checked={fields.includes(o.field)} disabled={fields.length === 1 && fields.includes(o.field)} onChange={() => toggle(o.field)}>
                  {t(o.labelKey)}
                </Check>
              ))}
            </span>
          </Row>
          {fields.includes('custom') && (
            <Row label={t('pra_fld_text')} htmlFor="p-tagcustom">
              <TextField id="p-tagcustom" value={tag?.custom ?? ''} placeholder={t('pra_ph_tag_text')} onCommit={(v) => save({ custom: v })} />
            </Row>
          )}
          <Row label={t('pra_fld_orientation')} htmlFor="p-tagorient">
            <select id="p-tagorient" className="select" value={orientation} onChange={(e) => save({ orientation: e.target.value as RoomTag['orientation'] })}>
              <option value="horizontal">{t('pra_opt_horizontal')}</option>
              <option value="vertical">{t('pra_opt_vertical')}</option>
            </select>
          </Row>
          <Row label={t('pra_fld_leader')} htmlFor="p-tagleader">
            <select id="p-tagleader" className="select" value={leader} onChange={(e) => save({ leader: e.target.value as RoomTag['leader'] })}>
              <option value="none">{t('pra_opt_none')}</option>
              <option value="straight">{t('pra_opt_straight')}</option>
              <option value="kinked">{t('pra_opt_kinked')}</option>
              <option value="crossed">{t('pra_opt_crossed')}</option>
            </select>
          </Row>
          <Row label={t('pra_fld_visible_in_plan')}><Check id="p-tagvisible" checked={tag?.visible ?? true} onChange={(v) => save({ visible: v })} /></Row>
          <div className="btn-row">
            <button
              type="button"
              className="btn small"
              onClick={() => {
                const created = ensureRoomTagAction(editor.store, plan.id, room.id);
                say(created ? { key: tag ? 'pra_msg_tag_already_created' : 'pra_msg_tag_created' } : { key: 'pra_msg_room_not_closed_plan' });
              }}
            >
              {t('pra_btn_create_update_tag')}
            </button>
            <button type="button" className="btn small" disabled={!tag} onClick={() => say(removeRoomTagAction(editor.store, plan.id, room.id) ? { key: 'pra_msg_tag_reset' } : { key: 'pra_msg_tag_already_default' })}>
              {t('pra_btn_reset_to_default')}
            </button>
          </div>
          <div className="hint">{t('pra_msg_tag_plan_only')}</div>
        </>
      ) : (
        <div className="hint">{t('pra_msg_tag_needs_closed_loop')}</div>
      )}
    </Group>
  );
}

/** Propriedades de um ou mais ambientes: nome, número, ponto interior (leitura), deslocamento, pé-direito, acabamentos e cor, com área, perímetro e volume. */
export function RoomProperties({ rooms }: { rooms: Room[] }): ReactElement {
  const fmt = useFormat();
  const { t, lang } = useT();
  const p: Project = useProject();
  // Planta de área ativa: a etiqueta da vista só aparece nesse contexto.
  const areaPlanId = useUi((s) => areaViewIdAtivo(p, s));
  const areaPlan = areaPlanId ? areaPlanOf(p, areaPlanId) : undefined;
  const ids = rooms.map((r) => r.id);
  const name = common(rooms, (r) => r.name);
  const number = common(rooms, (r) => r.number);
  const offset = common(rooms, (r) => r.heightOffset ?? 0);
  const ceiling = common(rooms, (r) => roomCeilingHeight(p, r));
  const floorFin = common(rooms, (r) => r.floorFinish ?? '');
  const wallFin = common(rooms, (r) => r.wallFinish ?? '');
  const ceilFin = common(rooms, (r) => r.ceilingFinish ?? '');
  const color = common(rooms, (r) => r.color ?? '');
  const category = common(rooms, (r) => r.categoryId ?? '');
  const cats = p.roomCategories ?? DEFAULT_ROOM_CATEGORIES;
  const single = rooms.length === 1 ? rooms[0]! : null;
  const resolved = useMemo(() => {
    const levels = [...new Set(rooms.map((r) => r.levelId))];
    return new Map(levels.flatMap((levelId) => resolveRooms(p, levelId).map((r) => [r.roomId, r] as const)));
  }, [p, rooms]);
  const geo = single ? resolved.get(single.id) : undefined;
  const sum = (f: (r: ResolvedRoom) => number): number => rooms.reduce((s, r) => s + (resolved.get(r.id) ? f(resolved.get(r.id)!) : 0), 0);
  const warning = single && geo ? roomWarning(geo, lang) : null;

  return (
    <>
      {warning && <div className="hint warn" role="alert">{warning}</div>}
      <Group title={t('pra_pgrp_identity')}>
        <Row label={t('pra_fld_name')} htmlFor="p-rname"><TextField id="p-rname" value={name.value} mixed={name.mixed} onCommit={(v) => patch(ids, { name: v })} /></Row>
        <Row label={t('pra_fld_number')} htmlFor="p-rnum"><TextField id="p-rnum" value={number.value} mixed={number.mixed} onCommit={(v) => patch(ids, { number: v })} /></Row>
        <Row label={t('pra_fld_category')} htmlFor="p-rcat">
          <select id="p-rcat" className="select" value={category.value} onChange={(e) => patch(ids, { categoryId: e.target.value || undefined })}>
            <option value="">{t('pra_opt_no_category')}</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Row>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => useUi.setState({ dialog: 'roomCategories' })}>{t('pra_btn_manage_categories')}</button>
        </div>
        {single && (
          <Row label={t('pra_fld_interior_point')}>
            <span className="val" title={t('pra_tip_interior_point')}>
              {fmt('length', single.point.x)}; {fmt('length', single.point.y)}
            </span>
          </Row>
        )}
      </Group>
      <Group title={t('pra_pgrp_dimensions')}>
        <Row label={t('pra_fld_base_offset')} htmlFor="p-roff">
          <NumField id="p-roff" value={offset.value} mixed={offset.mixed} onCommit={(v) => patch(ids, { heightOffset: v })} quantity="length" />
        </Row>
        <Row label={t('pra_fld_ceiling_height')} htmlFor="p-rceil">
          <NumField id="p-rceil" value={ceiling.value} mixed={ceiling.mixed} min={0.1} onCommit={(v) => patch(ids, { ceilingHeight: v })} quantity="length" />
        </Row>
        <Row label={rooms.length > 1 ? t('pra_fld_area_total') : t('pra_fld_net_area')}><span className="val">{fmt('area', sum((r) => r.area))}</span></Row>
        <Row label={rooms.length > 1 ? t('pra_fld_perimeter_total') : t('pra_fld_perimeter')}><span className="val">{fmt('length', sum((r) => r.perimeter))}</span></Row>
        <Row label={rooms.length > 1 ? t('pra_fld_volume_total') : t('pra_fld_volume')}><span className="val">{fmt('volume', sum((r) => r.volume))}</span></Row>
      </Group>
      <Group title={t('pra_pgrp_finishes')}>
        <Row label={t('pra_fld_finish_floor')} htmlFor="p-rfloor"><TextField id="p-rfloor" value={floorFin.value} mixed={floorFin.mixed} onCommit={(v) => patch(ids, { floorFinish: v })} /></Row>
        <Row label={t('pra_fld_finish_wall')} htmlFor="p-rwall"><TextField id="p-rwall" value={wallFin.value} mixed={wallFin.mixed} onCommit={(v) => patch(ids, { wallFinish: v })} /></Row>
        <Row label={t('pra_fld_finish_ceiling')} htmlFor="p-rceilf"><TextField id="p-rceilf" value={ceilFin.value} mixed={ceilFin.mixed} onCommit={(v) => patch(ids, { ceilingFinish: v })} /></Row>
      </Group>
      {single && (
        <Group title={t('pra_pgrp_room_label_all_views')}>
          <Row label={t('pra_fld_position_x')} htmlFor="p-lx">
            <NumField id="p-lx" value={(single.labelPosition ?? single.referencePoint ?? single.point).x} unit="m" onCommit={(v) => editor.store.exec({ type: 'setRoomLabel', id: single.id, position: { x: v, y: (single.labelPosition ?? single.referencePoint ?? single.point).y } }, t('pra_undo_move_label'))} />
          </Row>
          <Row label={t('pra_fld_position_y')} htmlFor="p-ly">
            <NumField id="p-ly" value={(single.labelPosition ?? single.referencePoint ?? single.point).y} unit="m" onCommit={(v) => editor.store.exec({ type: 'setRoomLabel', id: single.id, position: { x: (single.labelPosition ?? single.referencePoint ?? single.point).x, y: v } }, t('pra_undo_move_label'))} />
          </Row>
          <Row label={t('pra_fld_rotation')} htmlFor="p-lrot">
            <NumField id="p-lrot" value={single.labelRotation ?? 0} unit="°" onCommit={(v) => editor.store.exec({ type: 'setRoomLabel', id: single.id, position: single.labelPosition ?? null, rotation: v }, t('pra_undo_rotate_label'))} />
          </Row>
          <Row label={t('pra_fld_leader')} htmlFor="p-llead">
            <select id="p-llead" className="select" value={single.labelLeader ?? 'auto'} onChange={(e) => editor.store.exec({ type: 'setRoomLabel', id: single.id, position: single.labelPosition ?? null, leader: e.target.value as 'auto' | 'none' | 'straight' | 'kinked' | 'crossed' }, t('pra_undo_change_label_leader'))}>
              <option value="auto">{t('pra_opt_leader_auto')}</option>
              <option value="none">{t('pra_opt_leader_none')}</option>
              <option value="straight">{t('pra_opt_straight')}</option>
              <option value="kinked">{t('pra_opt_kinked')}</option>
              <option value="crossed">{t('pra_opt_crossed')}</option>
            </select>
          </Row>
          <div className="btn-row">
            <button type="button" className="btn small" onClick={() => editor.store.exec({ type: 'setRoomLabel', id: single.id, position: null, leader: 'auto' }, t('pra_undo_recenter_label'))}>{t('pra_btn_recenter_label')}</button>
          </div>
          <div className="hint">{t('pra_msg_label_position_scope')}</div>
        </Group>
      )}
      {single && areaPlan && areaPlan.levelId === single.levelId && (
        <RoomTagGroup room={single} plan={areaPlan} hasCircuit={!!geo?.polygon} />
      )}
      <Group title={t('pra_pgrp_view')} open={false}>
        <Row label={t('pra_fld_color')} htmlFor="p-rcolor">
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input id="p-rcolor" type="color" value={color.value || ROOM_DEFAULT_COLOR} aria-label={t('pra_aria_room_color')} onChange={(e) => patch(ids, { color: e.target.value })} />
            <button type="button" className="btn small" disabled={!color.value} onClick={() => patch(ids, { color: undefined })} title={t('pra_tip_reset_theme_color')}>{t('pra_opt_default')}</button>
          </span>
        </Row>
        <div className="hint">{t('pra_msg_room_color_scope')}</div>
      </Group>
    </>
  );
}
