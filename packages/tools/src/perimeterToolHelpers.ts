import type { SketchDraft, SketchSeg, Vec2 } from '@hestia/geom';
import type { InferContext } from './infer.ts';
import { contextoDeTraco } from './desenhoPolilinha.ts';
import { addSegs } from './perimeterSession.ts';
import { draftEdges, draftPoints } from './perimeterToolPick.ts';
import { facePreview } from './perimeterToolInput.ts';
import { anchorOf, pointsOf, type ShapeStep } from './perimeterToolShape.ts';
import type { ShapeKindId } from './sketchShapes.ts';
import type { PreviewItem, ToolEnv } from './types.ts';
import type { Lang } from './i18n.ts';

/** Substitui as linhas com o mesmo id (fileta, por exemplo) e acrescenta as demais, com ids novos. */
export function applySegs(d: SketchDraft, segs: SketchSeg[]): SketchDraft {
  const byId = new Map(segs.map((s) => [s.id, s] as const));
  const known = new Set(d.segs.map((s) => s.id));
  return addSegs({ ...d, segs: d.segs.map((s) => byId.get(s.id) ?? s) }, segs.filter((s) => !known.has(s.id)));
}

/** Captura para os pontos: vértices e linhas do rascunho, mais os pontos do passo, e o ponto anterior da forma. */
export function snapExtraOf(d: SketchDraft, st: ShapeStep | null): Partial<InferContext> {
  const anchor = anchorOf(st);
  return contextoDeTraco(anchor, {
    extraPoints: [...draftPoints(d.segs), ...pointsOf(st)],
    extraSegments: draftEdges(d.segs),
  });
}

/** Id de uma forma de desenho; null nos modos de referência (face, caixa, ambiente) e na seleção. */
export function shapeIdOf(shape: ShapeKindId | 'pickFace' | 'byPerimeter' | 'pickRoom' | null): ShapeKindId | null {
  return shape === null || shape === 'pickFace' || shape === 'byPerimeter' || shape === 'pickRoom' ? null : shape;
}

/** Prévia da face sob o cursor no modo de seleção da forma: realce e aviso, acrescentados à prévia corrente. */
export function faceMove(env: ToolEnv, at: Vec2, cycle: number, items: PreviewItem[], lang: Lang = 'pt'): void {
  const r = facePreview(env, at, cycle, lang);
  items.push(...r.items);
  env.say(r.msg);
}

/** Aviso na barra de status, devolvendo false para encadear recusas. */
export function refuse(env: Pick<ToolEnv, 'say'>, msg: string): false {
  env.say(msg);
  return false;
}
