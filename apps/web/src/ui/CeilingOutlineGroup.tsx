import type { ReactElement } from 'react';
import { ceilingOutline, ceilingRoomFor } from '@hestia/engine';
import { followsRoom, type Ceiling, type Id, type Project, type ProjectStore } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { t, useT, type Lang } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group } from './fields.tsx';

/** Texto e ações do grupo "Contorno" de forro (decisão 0023 §13, P-5): quais ids podem ser soltos ou revinculados. */
export interface CeilingOutlineView {
  text: string;
  detachIds: Id[];
  relinkIds: Id[];
}

/** Nome do ambiente de origem, ou o id quando ele não existe mais. */
const roomName = (p: Project, roomId: Id): string => {
  const r = p.elements[roomId];
  return r && r.kind === 'room' ? r.number || r.name || roomId : roomId;
};

/**
 * Estado do vínculo de cada forro selecionado. Acompanha o ambiente: "Acompanha o ambiente «nome»" (ou o aviso, quando o
 * ambiente não fecha ou foi apagado). Solto (editado à mão): "Estático (editado à mão)", com "Revincular ao ambiente".
 * Desenhado à mão, sem ambiente: "Sem ambiente (desenhado à mão)", sem ações.
 */
export function ceilingOutlineView(p: Project, ceilings: readonly Ceiling[], lang: Lang = 'pt'): CeilingOutlineView {
  const parts = new Set<string>();
  const detachIds: Id[] = [];
  const relinkIds: Id[] = [];
  for (const c of ceilings) {
    if (followsRoom(c)) {
      const { problem } = ceilingOutline(p, c);
      const nome = roomName(p, c.roomId!);
      if (!problem) parts.add(t(lang, 'msc_ceiling_follows_room', { name: nome }));
      else if (problem === 'apagado') parts.add(t(lang, 'msc_ceiling_room_deleted'));
      else parts.add(t(lang, 'msc_ceiling_room_open', { name: nome }));
      detachIds.push(c.id);
    } else if (c.roomId) {
      parts.add(t(lang, 'msc_ceiling_static'));
      relinkIds.push(c.id);
    } else {
      parts.add(t(lang, 'msc_ceiling_no_room'));
    }
  }
  return { text: [...parts].join(' · ') || t(lang, 'msc_no_elements'), detachIds, relinkIds };
}

/**
 * Solta os forros do ambiente, congelando o contorno que o usuário vê (o do ambiente, quando resolve) como estático. Um
 * só desfazer. Ids sem vínculo são ignorados pelo comando.
 */
export function detachCeilingOutlines(store: Pick<ProjectStore, 'project' | 'transaction' | 'exec'>, ids: Id[]): void {
  if (ids.length === 0) return;
  store.transaction('msc_undo_detach_ceiling', () => {
    for (const id of ids) {
      const c = store.project.elements[id];
      if (c?.kind !== 'ceiling') continue;
      const { boundary, holes } = ceilingOutline(store.project, c);
      store.exec({ type: 'updateElements', ids: [id], patch: { boundary, holes } });
      store.exec({ type: 'detachCeilingRoom', id });
    }
  });
}

/**
 * Religa os forros ao ambiente: o de origem, se existe, ou o que contém o forro. Devolve quantos foram religados; quando
 * nenhum ambiente serve, o forro fica como está e a barra de status avisa.
 */
export function relinkCeilingOutlines(store: Pick<ProjectStore, 'project' | 'transaction' | 'exec'>, ids: Id[]): number {
  let done = 0;
  store.transaction('msc_undo_relink_ceiling', () => {
    for (const id of ids) {
      const c = store.project.elements[id];
      if (c?.kind !== 'ceiling') continue;
      const roomId = ceilingRoomFor(store.project, c);
      if (!roomId) continue;
      store.exec({ type: 'relinkCeilingRoom', id, roomId });
      done += 1;
    }
  });
  if (ids.length > 0 && done === 0) useUi.setState({ status: { key: 'msc_ceiling_no_room_contains' } });
  return done;
}

/** Grupo "Contorno" do painel de forro: estado do vínculo com o ambiente e os botões Desvincular / Revincular ao ambiente. */
export function CeilingOutlineGroup({ ceilings }: { ceilings: readonly Ceiling[] }): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const view = ceilingOutlineView(p, ceilings, lang);
  return (
    <Group title={t('prb_fld_outline')}>
      <div className="hint" id="p-ceiling-outline">{view.text}</div>
      <div className="row">
        <button className="btn small" disabled={view.detachIds.length === 0} onClick={() => detachCeilingOutlines(editor.store, view.detachIds)}>
          {t('msc_ceiling_detach')}
        </button>
      </div>
      <div className="row">
        <button className="btn small" disabled={view.relinkIds.length === 0} onClick={() => relinkCeilingOutlines(editor.store, view.relinkIds)}>
          {t('msc_ceiling_relink')}
        </button>
      </div>
    </Group>
  );
}
