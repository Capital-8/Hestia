import { formatQuantity, openingTypeById, clampOffset, isOpening, isWall, unitsOf, type Id, type Opening, type Project, type ProjectStore, wallLength } from '@hestia/model';
import { t, useI18n } from './i18n.ts';

/** Resultado de trocar o tipo de abertura: o que gravar (posição por abertura) ou o motivo da recusa. */
export type OpeningTypePlan =
  | { ok: true; updates: Array<{ id: Id; offset: number; from: number }> }
  | { ok: false; message: string };

/**
 * Planeja a troca de tipo das aberturas `ids` para `typeId` (Propriedades). O modelo só empurra a abertura para as
 * pontas da parede; aqui se vê se ela ainda cabe: recusa quando a parede é curta demais ou quando a abertura nova
 * sobrepõe outra abertura da mesma parede (decisão de segurança: nada muda em silêncio).
 */
export function planOpeningTypeChange(p: Project, ids: Id[], typeId: Id): OpeningTypePlan {
  const lang = useI18n.getState().lang;
  const tipo = openingTypeById(p, typeId);
  if (!tipo) return { ok: false, message: t(lang, 'edc_opening_type_missing') };
  const updates: Array<{ id: Id; offset: number; from: number }> = [];
  for (const id of ids) {
    const o = p.elements[id];
    if (!o || !isOpening(o)) continue;
    const host = p.elements[o.hostId];
    if (!isWall(host)) continue;
    if (wallLength(host) < tipo.width + 0.02) return { ok: false, message: t(lang, 'edc_wall_too_short', { type: tipo.name }) };
    const next: Opening = { ...o, typeId };
    const offset = clampOffset(p, next, host);
    const half = tipo.width / 2;
    // Outras aberturas da mesma parede (as da própria seleção ficam de fora: mudam juntas, com o mesmo tipo).
    const clash = Object.values(p.elements).some((e) => {
      if (!isOpening(e) || e.hostId !== host.id || ids.includes(e.id)) return false;
      const w = (openingTypeById(p, e.typeId)?.width ?? 0.8) / 2;
      return offset + half > e.offset - w + 1e-6 && offset - half < e.offset + w - 1e-6;
    });
    if (clash) return { ok: false, message: t(lang, 'edc_no_space_for_opening', { type: tipo.name }) };
    updates.push({ id, offset, from: o.offset });
  }
  return { ok: true, updates };
}

/**
 * Troca o tipo das aberturas selecionadas (um só Ctrl+Z) e avisa na barra de status quando alguma foi deslocada para
 * caber. Recusada, nada é gravado e a barra mostra o motivo.
 */
export function changeOpeningType(store: ProjectStore, ids: Id[], typeId: Id, setStatus: (m: string) => void): void {
  const lang = useI18n.getState().lang;
  const plan = planOpeningTypeChange(store.project, ids, typeId);
  if (!plan.ok) {
    setStatus(plan.message);
    return;
  }
  store.transaction('edc_undo_change_opening_type', () => {
    store.exec({ type: 'updateElements', ids, patch: { typeId } });
    for (const u of plan.updates) store.exec({ type: 'updateElements', ids: [u.id], patch: { offset: u.offset } });
  });
  const moved = plan.updates.filter((u) => Math.abs(u.offset - u.from) > 1e-6);
  if (moved.length === 1) setStatus(t(lang, 'edc_openings_moved_one', {
    from: formatQuantity(unitsOf(store.project), 'length', moved[0]!.from, { lang }),
    to: formatQuantity(unitsOf(store.project), 'length', moved[0]!.offset, { lang }),
  }));
  else if (moved.length > 1) setStatus(t(lang, 'edc_openings_moved_many', { n: moved.length }));
}
