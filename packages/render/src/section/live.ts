import type { Project } from '@hestia/model';
import type { Inference } from '@hestia/tools';
import { guideStrokes, snapMarker, snapTooltipLabel } from '../plan/overlay.ts';
import type { FillOp, LabelOp, PlanTheme, StrokeOp } from '../plan/types.ts';

/**
 * Camada viva da vista de corte/elevação: o marcador de captura, as guias/trilhas e o tooltip de snap, em `(t, z)`.
 *
 * É a mesma sobreposição viva da planta (`buildPlanLiveOverlay`), sem a prévia da ferramenta: a inferência muda a cada
 * movimento do mouse e esta camada é remontada sozinha, sem refazer a lista do corte (`SectionFrame`). As coordenadas
 * entram e saem em `(t, z)` — x = distância ao longo do corte, y = cota — e as funções da planta são agnósticas ao
 * sistema: o marcador é um traço ancorado no ponto com `deslocamentoPx`, então mantém o mesmo tamanho na tela.
 */
export interface SectionLiveOps {
  fills: FillOp[];
  strokes: StrokeOp[];
  labels: LabelOp[];
}

/**
 * Operações da camada viva do corte/elevação.
 *
 * Sem inferência (ou com `kind === 'none'`) não desenha nada. Fora isso: as guias inteiras (`guideStrokes`, sem recorte
 * — uma extensão de alinhamento continua de ponta a ponta), o marcador de captura da regra usada (`snapMarker`) e o
 * tooltip de snap (`snapTooltipLabel`). O tooltip já cobre o alinhamento ("Alinhamento") e o nome da parede de origem
 * (`hostId`), então não há rótulo de referência duplicado. A grade pode gerar só o marcador fino, sem tooltip.
 */
export function sectionLiveOps(input: { inference: Inference | null; project: Project; theme: PlanTheme }): SectionLiveOps {
  const out: SectionLiveOps = { fills: [], strokes: [], labels: [] };
  const inf = input.inference;
  if (!inf || inf.kind === 'none') return out;
  out.strokes.push(...guideStrokes(inf.guides, input.theme));
  out.strokes.push(...snapMarker(inf, input.theme));
  const tip = snapTooltipLabel(inf, input.project);
  if (tip) out.labels.push(tip);
  return out;
}
