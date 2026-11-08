import { pickSection, pickSectionAnnotation, screenToWorld, type SectionAnnotationPick, type SectionPick } from '@hestia/render';
import { sectionAnnotationsOf } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { anotacoesSemOcultas } from './viewAnnotations.ts';
import { visibilityOf } from './viewVisibility.ts';

/** Tolerância de clique no corte e na elevação, em pixels de tela (decisão 0016). */
const TOLERANCE_PX = 4;
/** Cota e texto de anotação do corte: 6 px na linha, 10 px no texto (a mesma regra da planta, annotationPick.ts). */
const NOTE_LINE_PX = 6;
const NOTE_TEXT_PX = 10;

/** Ponto em pixels, relativo ao canvas. */
export interface ScreenPt {
  x: number;
  y: number;
}

/** Alvo sob o cursor no corte: um elemento (parede, abertura...) ou uma anotação da vista (cota, texto, detalhe, etiqueta). */
export type SectionHit = SectionPick | SectionAnnotationPick;

/**
 * Alvo sob o ponto da tela na vista de corte ou elevação aberta (decisão 0016). Anotações da vista (cotas, textos,
 * detalhes e etiquetas) têm prioridade sobre os elementos: uma cota por cima da parede é a que o clique pega. Os
 * elementos usam 4 px; as anotações, 6 px na linha e 10 px no texto, convertidos em unidades do desenho pelo zoom.
 * Null fora do desenho ou no vazio.
 */
export function sectionPickAt(s: ScreenPt): SectionHit | null {
  const v = editor.viewport();
  const id = useUi.getState().sectionId;
  const result = editor.sectionOf(id);
  if (!v || !result) return null;
  const point = screenToWorld(v, s);
  const view = editor.project.views.find((x) => x.id === id);
  // A escala é a da vista: o mesmo tamanho de papel da cota/texto que o desenho usa (antes ficava fixo em 1:100).
  // Oculto na vista não é alvo de clique (o mesmo conjunto efetivo que o desenho usa), nem as anotações ocultas.
  const hidden = visibilityOf(editor.project, useUi.getState()).hidden;
  const note = pickSectionAnnotation(anotacoesSemOcultas(sectionAnnotationsOf(view), hidden), point, NOTE_LINE_PX / v.zoom, editor.viewScale(), NOTE_TEXT_PX / v.zoom);
  if (note) return note;
  return pickSection(result, point, TOLERANCE_PX / v.zoom, hidden);
}

let frame = 0;
let last: ScreenPt | null = null;

/** Realce ao passar o cursor sobre o corte: um pick por quadro de animação (o último ponto ganha), como no 3D. */
export function hoverSectionAt(s: ScreenPt): void {
  last = s;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!last || useUi.getState().view !== 'section') return;
    const id = sectionPickAt(last)?.id ?? null;
    if (useUi.getState().hover !== id) useUi.setState({ hover: id });
  });
}
