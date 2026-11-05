import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Sheet } from '@hestia/model';
import type { SheetDrawList } from '@hestia/render';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { useT, type TextLike } from '../../editor/i18n.ts';
import { commitMove } from './sheetCommit.ts';
import { alignDelta, sameOwner, sheetAlignFeatures, type SheetAlignFeature } from './sheetAlignTool.ts';
import { viewportBox } from '@hestia/model';
import type { PaperBox, PaperPoint } from './sheetSelection.ts';

const say = (status: TextLike): void => useUi.setState({ status });

export interface SheetAlignOverlay {
  ref: SheetAlignFeature | null;
  candidate: SheetAlignFeature | null;
  queue: readonly SheetAlignFeature[];
  ghost: { box: PaperBox; delta: { x: number; y: number } } | null;
}

export interface SheetAlignApi {
  /** Ferramenta ativa (fonte: `useUi.sheetAlign`, para o botão da faixa e o da barra ficarem sincronizados). */
  on: boolean;
  toggle: () => void;
  /** Atualiza a candidata sob o cursor (no `pointermove`). */
  hover: (pt: PaperPoint) => void;
  /** Clique: escolhe a referência, soma à fila (Ctrl) ou aplica. */
  click: (pt: PaperPoint, ctrl: boolean) => void;
  /** Tab: alterna entre as feições sob o cursor (mesmo gesto do Alinhar do modelo). */
  cycle: () => void;
  /** Esc: limpa a fila, depois a referência, depois desliga a ferramenta. */
  back: () => void;
  /** Enter: aplica a fila acumulada com Ctrl+clique. */
  confirm: () => void;
  overlay: SheetAlignOverlay | null;
}

/**
 * Ferramenta Alinhar na prancha: reaproveita a captura do Alinhar do modelo (`alignFeaturesAt`) para achar faces,
 * eixos e arestas **dentro** das vistas, e também aceita a moldura da vista e as bordas da folha. Segue o gesto do
 * Revit: referência → alvo, Ctrl+clique acumula, Tab alterna, Esc volta um passo; a referência fica até o Esc.
 */
export function useSheetAlign(args: { sheet: Sheet | null; sheetId: string; drawList: SheetDrawList | null; zoom: number }): SheetAlignApi {
  const { sheet, sheetId, drawList, zoom } = args;
  const { t, lang } = useT();
  const on = useUi((s) => s.sheetAlign);
  const [ref, setRef] = useState<SheetAlignFeature | null>(null);
  const [cands, setCands] = useState<SheetAlignFeature[]>([]);
  const [idx, setIdx] = useState(0);
  const [queue, setQueue] = useState<SheetAlignFeature[]>([]);
  const wasOn = useRef(false);

  // Liga/desliga limpando referência, fila e candidatas.
  useEffect(() => {
    if (wasOn.current === on) return;
    wasOn.current = on;
    setRef(null);
    setQueue([]);
    setCands([]);
    setIdx(0);
    if (on) say({ key: 'cvs_align_hint' });
  }, [on]);

  const candidates = useCallback(
    (at: PaperPoint): SheetAlignFeature[] => (sheet && drawList ? sheetAlignFeatures({ project: editor.project, sheet, drawList, at, zoom, prefer: 'faces', lang }) : []),
    [sheet, drawList, zoom, lang],
  );

  const apply = useCallback(
    (reference: SheetAlignFeature, targets: SheetAlignFeature[]): void => {
      if (!sheet) return;
      const boxes: Record<string, PaperBox> = {};
      const notes: string[] = [];
      for (const target of targets) {
        if (sameOwner(reference, target)) {
          notes.push(t('cvs_align_note_ref'));
          continue;
        }
        const owner = target.owner;
        if (owner.type !== 'viewport') {
          notes.push(t('cvs_align_note_sheet'));
          continue;
        }
        const vp = sheet.viewports.find((v) => v.id === owner.id);
        if (!vp) continue;
        if (vp.locked) {
          notes.push(t('cvs_align_note_locked'));
          continue;
        }
        const d = alignDelta(reference, target);
        if (!d) {
          notes.push(t('cvs_align_note_parallel'));
          continue;
        }
        if (Math.abs(d.dx) < 1e-6 && Math.abs(d.dy) < 1e-6) continue;
        boxes[vp.id] = { ...viewportBox(vp), x: vp.at.x + d.dx, y: vp.at.y + d.dy };
      }
      const ids = Object.keys(boxes);
      if (ids.length === 0) {
        say(notes.length ? { key: 'cvs_align_nothing', args: { notes: notes.join('; ') } } : { key: 'cvs_align_already' });
        return;
      }
      const err = commitMove(editor.store, sheetId, sheet, ids, boxes);
      if (err) {
        say(err);
        return;
      }
      const after = editor.project.sheets?.find((s) => s.id === sheetId);
      const partial = after
        ? ids.some((id) => {
            const v = after.viewports.find((x) => x.id === id);
            const want = boxes[id]!;
            return !v || Math.abs(v.at.x - want.x) > 0.01 || Math.abs(v.at.y - want.y) > 0.01;
          })
        : false;
      const done =
        ids.length > 1
          ? partial
            ? ('cvs_align_done_many_partial' as const)
            : ('cvs_align_done_many' as const)
          : partial
            ? ('cvs_align_done_one_partial' as const)
            : ('cvs_align_done_one' as const);
      say({ key: done, args: { label: reference.label } });
      setQueue([]);
    },
    [sheet, sheetId, t],
  );

  const hover = useCallback(
    (pt: PaperPoint): void => {
      const list = candidates(pt);
      const key = cands[idx]?.key;
      const found = key ? list.findIndex((c) => c.key === key) : -1;
      setCands(list);
      setIdx(found >= 0 ? found : 0);
    },
    [candidates, cands, idx],
  );

  const click = useCallback(
    (pt: PaperPoint, ctrl: boolean): void => {
      const list = candidates(pt);
      const cand = list[idx] ?? list[0] ?? null;
      if (!ref) {
        if (!cand) {
          say({ key: 'cvs_align_pick' });
          return;
        }
        setRef(cand);
        setQueue([]);
        say({ key: 'cvs_align_ref_set', args: { label: cand.label } });
        return;
      }
      if (!cand) {
        say({ key: 'cvs_align_pick_target' });
        return;
      }
      if (ctrl) {
        const has = queue.some((q) => q.key === cand.key);
        const n = has ? queue.length - 1 : queue.length + 1;
        setQueue((q) => (has ? q.filter((x) => x.key !== cand.key) : [...q, cand]));
        say({ key: n === 1 ? 'cvs_align_queue_one' : 'cvs_align_queue_many', args: { n } });
        return;
      }
      const targets = queue.length ? [...queue.filter((q) => q.key !== cand.key), cand] : [cand];
      setQueue([]);
      apply(ref, targets);
    },
    [apply, candidates, idx, queue, ref],
  );

  const cycle = useCallback((): void => {
    const n = cands.length;
    if (n < 2) {
      if (cands[0]) say({ key: 'cvs_align_cycle_one', args: { label: cands[0].label, hint: t('cvs_align_hint') } });
      return;
    }
    const next = (idx + 1) % n;
    setIdx(next);
    say({ key: ref ? 'cvs_align_click_align' : 'cvs_align_click_ref', args: { label: cands[next]!.label } });
  }, [cands, idx, ref, t]);

  const back = useCallback((): void => {
    if (queue.length) {
      setQueue([]);
      say({ key: 'cvs_align_cancel', args: { label: ref?.label ?? t('cvs_none'), hint: t('cvs_align_hint') } });
      return;
    }
    if (ref) {
      setRef(null);
      say({ key: 'cvs_align_hint' });
      return;
    }
    useUi.setState({ sheetAlign: false });
  }, [queue.length, ref, t]);

  const confirm = useCallback((): void => {
    if (ref && queue.length) apply(ref, queue);
  }, [apply, queue, ref]);

  const overlay = useMemo((): SheetAlignOverlay | null => {
    if (!on) return null;
    const candidate = cands[idx] ?? null;
    let ghost: SheetAlignOverlay['ghost'] = null;
    if (sheet && ref && candidate && !sameOwner(ref, candidate)) {
      const owner = candidate.owner;
      if (owner.type === 'viewport') {
        const vp = sheet.viewports.find((v) => v.id === owner.id);
        const d = vp ? alignDelta(ref, candidate) : null;
        if (vp && d) ghost = { box: { x: vp.at.x + d.dx, y: vp.at.y + d.dy, w: vp.size.w, h: vp.size.h }, delta: { x: d.dx, y: d.dy } };
      }
    }
    return { ref, candidate, queue, ghost };
  }, [on, sheet, ref, cands, idx, queue]);

  const toggle = useCallback((): void => useUi.setState({ sheetAlign: !useUi.getState().sheetAlign }), []);

  return { on, toggle, hover, click, cycle, back, confirm, overlay };
}
