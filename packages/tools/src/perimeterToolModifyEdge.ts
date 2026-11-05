import { add, mul, type SketchDraft, type Vec2 } from '@hestia/geom';
import { alignFeaturesAt, type AlignFeature } from './alignFeatures.ts';
import { alignSegToLine, deleteSegs, extendToBoundary, splitAt, splitBetween, trimExtendToCorner, trimToBoundary } from './perimeterModify.ts';
import type { PerimeterModifyKind } from './perimeterModifyKind.ts';
import { clearData, ghost, halo, lineAt, segById, type ModHost, type Step } from './perimeterToolModifyStep.ts';
import type { PointerInfo, PreviewItem } from './types.ts';
import { t as translate, type DictKey, type Lang } from './i18n.ts';

const lg = (h: ModHost): Lang => h.lang?.() ?? 'pt';

/** Mensagem quando a operação de aparar/estender não tem resultado, por modo. */
const TRIM_FAIL: DictKey[] = [
  'tl_msg_trim_fail_corner',
  'tl_msg_trim_fail_boundary',
  'tl_msg_trim_fail_front',
];

/** Dica do comando de linha (aparar/estender, dividir, alinhar, excluir), conforme o modo e o estágio. */
export function edgeHint(kind: PerimeterModifyKind, st: Step, lang: Lang = 'pt'): string {
  if (kind === 'delete') return translate(lang, 'tl_hint_edge_delete');
  if (kind === 'align') {
    return st.stage === 0
      ? translate(lang, 'tl_hint_edge_align_ref')
      : translate(lang, 'tl_hint_edge_align_line');
  }
  if (kind === 'split') {
    if (st.mode === 0) return translate(lang, 'tl_hint_edge_split');
    return translate(lang, st.stage === 0 ? 'tl_hint_edge_split_gap_first' : 'tl_hint_edge_split_gap_second');
  }
  if (kind !== 'trim') return '';
  if (st.mode === 0) {
    return translate(lang, st.stage === 0 ? 'tl_hint_edge_trim_corner_first' : 'tl_hint_edge_trim_corner_second');
  }
  const what = translate(lang, st.mode === 1 ? 'tl_hint_edge_limit_trim' : 'tl_hint_edge_limit_extend');
  return translate(lang, st.stage === 0 ? 'tl_hint_edge_limit_first' : 'tl_hint_edge_limit_second', { what });
}

/** Resultado de aparar/estender para a linha `id` clicada em `pick`, conforme o modo. */
function trimResult(d: SketchDraft, st: Step, id: string, pick: Vec2): SketchDraft | null {
  const first = st.ids[0]!;
  if (st.mode === 0) return trimExtendToCorner(d, first, st.pts[0]!, id, pick);
  return st.mode === 1 ? trimToBoundary(d, id, pick, first) : extendToBoundary(d, id, pick, first);
}

function trimClick(h: ModHost, st: Step, id: string, pick: Vec2): void {
  if (st.stage === 0) {
    st.ids = [id];
    st.pts = st.mode === 0 ? [pick] : [];
    st.stage = 1;
    return h.say(edgeHint('trim', st, lg(h)));
  }
  if (id === st.ids[0]) return h.say(translate(lg(h), 'tl_msg_choose_other_line'));
  const next = trimResult(h.draft(), st, id, pick);
  if (!next) return h.say(translate(lg(h), TRIM_FAIL[st.mode]!));
  h.commit(next);
  if (st.mode === 0) {
    clearData('trim', st);
    return h.say(translate(lg(h), 'tl_msg_corner_done'));
  }
  // Até limite: o limite continua escolhido para a próxima linha.
  st.pts = [];
  h.say(translate(lg(h), 'tl_msg_trimmed'));
}

function splitClick(h: ModHost, st: Step, id: string, pick: Vec2): void {
  const d = h.draft();
  if (st.mode === 0) {
    const next = splitAt(d, id, pick);
    if (!next) return h.say(translate(lg(h), 'tl_msg_split_mid'));
    h.commit(next);
    return h.say(translate(lg(h), 'tl_msg_line_split'));
  }
  if (st.stage === 0) {
    st.ids = [id];
    st.pts = [pick];
    st.stage = 1;
    return h.say(edgeHint('split', st, lg(h)));
  }
  if (id !== st.ids[0]) return h.say(translate(lg(h), 'tl_msg_split_same_line'));
  const next = splitBetween(d, id, st.pts[0]!, pick);
  if (!next) return h.say(translate(lg(h), 'tl_msg_split_too_small'));
  h.commit(next);
  clearData('split', st);
  h.say(translate(lg(h), 'tl_msg_segment_removed', { hint: edgeHint('split', st, lg(h)) }));
}

/** Referência fora do esboço (face, eixo, ombreira, aresta) sob o cursor, se houver projeto no host. */
function referenceFeature(h: ModHost, at: Vec2): AlignFeature | null {
  const project = h.project?.();
  const levelId = h.levelId?.();
  if (!project || !levelId) return null;
  const features = alignFeaturesAt({
    project,
    levelId,
    at,
    metersPerPixel: h.mpp(),
    prefer: h.options().alignPrefer ?? 'faces',
    draft: h.draft(),
  });
  return features.find((f) => f.kind !== 'linhaEsboco') ?? null;
}

/** Resultado de alinhar a linha `id` à referência do passo: outra linha do esboço ou uma feição do projeto. */
function alignNext(d: SketchDraft, st: Step, id: string): SketchDraft | null {
  const ref = st.ids.length ? segById(d, st.ids[0]!) : undefined;
  const a = ref?.a ?? st.pts[0];
  const b = ref?.b ?? st.pts[1];
  return a && b ? alignSegToLine(d, id, a, b) : null;
}

function alignClick(h: ModHost, st: Step, id: string | null, p: PointerInfo): void {
  if (st.stage === 0) {
    if (id) {
      st.ids = [id];
      st.pts = [];
      st.stage = 1;
      return h.say(edgeHint('align', st, lg(h)));
    }
    const ref = referenceFeature(h, p.raw);
    if (!ref) return h.say(translate(lg(h), 'tl_msg_click_sketch_or_ref'));
    st.ids = [];
    st.pts = [ref.line.p, add(ref.line.p, mul(ref.line.d, 1))];
    st.stage = 1;
    return h.say(translate(lg(h), 'tl_msg_ref_hint', { ref: ref.label, hint: edgeHint('align', st, lg(h)) }));
  }
  if (!id) return h.say(translate(lg(h), 'tl_msg_align_click_line'));
  if (id === st.ids[0]) return h.say(translate(lg(h), 'tl_msg_align_same_line'));
  const next = alignNext(h.draft(), st, id);
  if (!next) return h.say(translate(lg(h), 'tl_msg_align_straight_only'));
  h.commit(next);
  clearData('align', st);
  h.say(translate(lg(h), 'tl_msg_line_aligned'));
}

function deleteClick(h: ModHost, id: string): void {
  const next = deleteSegs(h.draft(), [id]);
  if (!next) return h.say(translate(lg(h), 'tl_msg_nothing_delete'));
  h.commit(next);
  h.say(translate(lg(h), 'tl_msg_line_deleted'));
}

/**
 * Clique num comando de linha. `p.raw` escolhe a linha sob o cursor; `at` (capturado) é o ponto da operação
 * (aparar, dividir ou o lado do deslocamento).
 */
export function edgeClick(h: ModHost, kind: PerimeterModifyKind, st: Step, p: PointerInfo, at: Vec2 = p.raw): void {
  const id = lineAt(h.draft(), p.raw, h.mpp());
  if (kind === 'align') return alignClick(h, st, id, p);
  if (!id) return h.say(translate(lg(h), 'tl_msg_click_sketch_line'));
  if (kind === 'trim') return trimClick(h, st, id, at);
  if (kind === 'split') return splitClick(h, st, id, at);
  deleteClick(h, id);
}

/**
 * Prévia de um comando de linha com o cursor em `raw`: realce da linha sob o cursor e o resultado da operação no ponto
 * capturado `at` (que pode diferir do cursor).
 */
export function edgePreview(h: ModHost, kind: PerimeterModifyKind, st: Step, at: Vec2, raw: Vec2 = at): PreviewItem[] {
  const d = h.draft();
  const id = lineAt(d, raw, h.mpp());
  const under = id ? halo(d, id) : [];
  if (kind === 'align' && st.stage === 0 && !id) {
    const ref = referenceFeature(h, raw);
    return ref
      ? [
          { kind: 'line', a: add(ref.line.p, mul(ref.line.d, -1)), b: add(ref.line.p, mul(ref.line.d, 1)), halo: true },
          { kind: 'label', at: ref.line.p, text: ref.label },
        ]
      : [];
  }
  if (kind === 'delete' || st.stage === 0) return under;
  const first = halo(d, st.ids[0]!);
  if (kind === 'trim') {
    return [...first, ...(id && id !== st.ids[0] ? ghost(d, trimResult(d, st, id, at)) : under)];
  }
  if (kind === 'align') return [...first, ...(id && id !== st.ids[0] ? ghost(d, alignNext(d, st, id)) : [])];
  // Dividir com espaço, no segundo ponto: o trecho sai, e o resto da linha fica.
  return [...first, { kind: 'point', at: st.pts[0]! }, ...ghost(d, splitBetween(d, st.ids[0]!, st.pts[0]!, at))];
}
