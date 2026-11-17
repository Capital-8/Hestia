import type { ReactElement } from 'react';
import { resolveBoundary } from '@hestia/engine';
import { isFloor, isSlab, type Id, type OutlineSource, type ProjectStore } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { t, useT, type Lang } from '../editor/i18n.ts';
import { Group, Row } from './fields.tsx';

/** Só o que o grupo lê de um piso ou laje (decisão 0023 §8.2). */
export interface OutlineHolder {
  id: Id;
  outlineSource?: OutlineSource;
}

/** Nome do modo de origem, como aparece no painel (decisão 0023 §8.2a). Mantido em PT como fallback. */
export const OUTLINE_MODE_LABEL: Record<OutlineSource['mode'], string> = {
  'walls-finish': 'face de acabamento',
  'walls-core': 'núcleo',
  perimeter: 'perímetro externo',
};

const OUTLINE_MODE_KEY: Record<OutlineSource['mode'], 'msc_outline_mode_walls_finish' | 'msc_outline_mode_walls_core' | 'msc_outline_mode_perimeter'> = {
  'walls-finish': 'msc_outline_mode_walls_finish',
  'walls-core': 'msc_outline_mode_walls_core',
  perimeter: 'msc_outline_mode_perimeter',
};

/** Estado do grupo "Contorno" para a seleção: texto e quais ids podem ser desvinculados ou revinculados. */
export interface OutlineView {
  text: string;
  detachIds: Id[];
  relinkIds: Id[];
}

/**
 * Texto e ações do grupo "Contorno" de piso ou laje. Vinculado: "Desvincular" fica ativo. Estático (editado à mão):
 * "Revincular às paredes" fica ativo. Sem origem (desenhado por croqui): os dois ficam desabilitados.
 */
export function outlineView(els: readonly OutlineHolder[], lang: Lang = 'pt'): OutlineView {
  const linked = els.filter((e) => e.outlineSource?.linked);
  const estatico = els.filter((e) => e.outlineSource && !e.outlineSource.linked);
  const semOrigem = els.filter((e) => !e.outlineSource);
  const modes = new Set(linked.map((e) => e.outlineSource!.mode));
  const parts: string[] = [];
  if (linked.length > 0) {
    const modo = modes.size === 1 ? OUTLINE_MODE_KEY[[...modes][0]!] : null;
    parts.push(modo ? t(lang, 'msc_outline_linked_mode', { mode: t(lang, modo) }) : t(lang, 'msc_outline_linked_mixed'));
  }
  if (estatico.length > 0) parts.push(t(lang, 'msc_outline_static'));
  if (semOrigem.length > 0) parts.push(t(lang, 'msc_outline_unlinked'));
  return {
    text: parts.join(' · ') || t(lang, 'msc_outline_none'),
    detachIds: linked.map((e) => e.id),
    relinkIds: estatico.map((e) => e.id),
  };
}

/**
 * Congela o circuito atual no contorno gravado antes de soltar: o que o usuário vê passa a ser o contorno estático. Com
 * circuito aberto não há o que congelar, e fica o último contorno válido (decisão 0023 §8.2c).
 */
function freezeOutline(store: Pick<ProjectStore, 'project' | 'exec'>, id: Id): void {
  const p = store.project;
  const el = p.elements[id];
  if (!el || !(isFloor(el) || isSlab(el))) return;
  const r = resolveBoundary(p, el.levelId, el);
  if (!r.polygon) return;
  store.exec({ type: 'updateElements', ids: [id], patch: { boundary: r.polygon[0]!, holes: [...el.holes, ...r.polygon.slice(1)] } });
}

/** Aplica o vínculo a todos os ids num único passo de desfazer. Ids sem origem são ignorados pelo comando. */
export function runOutlineAction(store: Pick<ProjectStore, 'project' | 'transaction' | 'exec'>, action: 'detach' | 'relink', ids: Id[]): void {
  if (ids.length === 0) return;
  // Chave, não texto: o TitleBar/historyStatus traduz no render e acompanha a troca de idioma.
  const label = action === 'detach' ? 'msc_undo_outline_detach' : 'msc_undo_outline_relink';
  store.transaction(label, () => {
    for (const id of ids) {
      if (action === 'detach') freezeOutline(store, id);
      store.exec({ type: action === 'detach' ? 'detachOutline' : 'relinkOutline', id });
    }
  });
}

/** "Seguir: Base | Topo da parede" (T-F): grava `reference` na origem de cada elemento vinculado, num único passo de desfazer. */
export function runOutlineReference(store: Pick<ProjectStore, 'project' | 'transaction' | 'exec'>, ids: Id[], reference: 'base' | 'top'): void {
  const alvo = ids.filter((id) => {
    const el = store.project.elements[id];
    return !!el && (isFloor(el) || isSlab(el)) && !!el.outlineSource?.linked && (el.outlineSource.reference ?? 'base') !== reference;
  });
  if (alvo.length === 0) return;
  store.transaction('msc_undo_outline_follow', () => {
    for (const id of alvo) {
      const el = store.project.elements[id];
      if (!el || !(isFloor(el) || isSlab(el)) || !el.outlineSource) continue;
      store.exec({ type: 'updateElements', ids: [id], patch: { outlineSource: { ...el.outlineSource, reference } } });
    }
  });
}

/** "Seguir" comum aos vinculados: 'base', 'top' ou null (misto). */
export function outlineReferenceOf(els: readonly OutlineHolder[]): 'base' | 'top' | null {
  const refs = new Set(els.filter((e) => e.outlineSource?.linked).map((e) => e.outlineSource!.reference ?? 'base'));
  return refs.size === 1 ? [...refs][0]! : null;
}

/** Grupo "Contorno" do painel de piso e de laje: estado do vínculo às paredes e os botões Desvincular / Revincular. */
export function OutlineGroup({ elements }: { elements: readonly OutlineHolder[] }): ReactElement {
  const { t, lang } = useT();
  const view = outlineView(elements, lang);
  const linkedIds = elements.filter((e) => e.outlineSource?.linked).map((e) => e.id);
  const reference = outlineReferenceOf(elements);
  return (
    <Group title={t('msc_outline_title')}>
      <div className="hint" id="p-outline-state">{view.text}</div>
      {linkedIds.length > 0 && (
        <Row label={t('msc_outline_follow')} htmlFor="p-outline-ref">
          <select id="p-outline-ref" className="select" value={reference ?? ''} onChange={(e) => runOutlineReference(editor.store, linkedIds, e.target.value === 'top' ? 'top' : 'base')}>
            {reference === null && <option value="" disabled />}
            <option value="base">{t('msc_outline_follow_base')}</option>
            <option value="top">{t('msc_outline_follow_top')}</option>
          </select>
        </Row>
      )}
      <div className="row">
        <button className="btn small" disabled={view.detachIds.length === 0} onClick={() => runOutlineAction(editor.store, 'detach', view.detachIds)}>
          {t('msc_outline_detach')}
        </button>
      </div>
      <div className="row">
        <button className="btn small" disabled={view.relinkIds.length === 0} onClick={() => runOutlineAction(editor.store, 'relink', view.relinkIds)}>
          {t('msc_outline_relink')}
        </button>
      </div>
    </Group>
  );
}
