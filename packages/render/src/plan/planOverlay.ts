import { orientedRect, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { frameOfWall, openingGeometry, resolveAngularDimension, resolveCeilings, wallEndCorners, type ResolvedLevel } from '@hestia/engine';
import { angularDimensionGeometry, dimensionGeometry, dimensionPoints, dimensionText, DIM_TEXT_MM, isCad, isGeneric, isOpening, isWall, levelRoomSeparators, unitsOf, type Id, type Project } from '@hestia/model';
import { floorSelectionOps } from './floors.ts';
import { ALCA_PX, quadradoEm } from './marcadores.ts';
import { slabSelectionOps } from './slabs.ts';
import { roomSelectionOps } from './rooms.ts';
import { ceilingSelectionOps } from './ceilings.ts';
import { roofFootprint, roofSelectionOps } from './roofs.ts';
import { planFootprint, stairSelectionOps } from './stairs.ts';
import { rampFootprint, rampSelectionOps } from './ramps.ts';
import { guideStrokes, previewOverlay, snapMarker, snapTooltipLabel } from './overlay.ts';
import { hiddenSelectionOps, planViewOf, type PlanView } from './view.ts';
import { planContext, type PlanContext } from './planContext.ts';
import { ambientesDoNivel, lajesDoNivel, pisosDoNivel, telhadosDoNivel } from './resolucao.ts';
import { labelGhostOps } from './areaPlan.ts';
import { annotationHighlightOps, blocoEm, drawnAnnotations, textBlockModel } from './notes.ts';
import type { PlanInput } from './build.ts';
import { AVISO, AVISO_ALPHA } from '../aviso.ts';
import type { FillOp, PlanOps } from './types.ts';

const ringsOf = (m: MultiPolygon): Ring[] => m.flatMap((p) => p);

/**
 * Forma da parede na planta: as camadas cortadas (`cut`) ou, para parede só de contorno, os fragmentos inteiros
 * (`fragment`, sem as aberturas).
 */
function wallUnion(geo: ResolvedLevel, id: Id, outline = false): MultiPolygon {
  const rw = geo.walls[id];
  if (!rw) return [];
  return outline ? union(...rw.layers.map((l) => l.fragment)) : union(...rw.layers.map((l) => l.cut));
}

function elementHighlight(p: Project, geo: ResolvedLevel, ids: Id[], color: string, alpha: number, view: PlanView | null): FillOp[] {
  const out: FillOp[] = [];
  for (const id of ids) {
    if (view?.hidden.has(id)) continue;
    const e = p.elements[id];
    if (isWall(e)) {
      // Parede fora da geometria (oculta ou fora do intervalo): nada a destacar.
      const m = wallUnion(geo, id, view?.outlineWalls.has(id) === true);
      if (m.length > 0) out.push({ polygons: m, color, alpha });
    } else if (isOpening(e)) {
      const f = frameOfWall(p, e.hostId);
      if (!f) continue;
      const g = openingGeometry(p, e, f);
      out.push({ polygons: [[orientedRect(g.center.x, g.center.y, g.u.x, g.u.y, g.width / 2, g.thickness / 2 + 0.02)]], color, alpha });
    }
  }
  return out;
}

/** Azul do contorno do modo Reveal: o elemento oculto volta ao desenho normal e ganha esta borda. */
const REVEAL = '#2563eb';

/**
 * Realce amarelo do aviso (decisão 0044): a parede que impede a operação fica preenchida em amarelo translúcido e com
 * contorno firme. Só a parede (ou a abertura, quando o aviso vier de um vão): o resto do desenho não muda.
 */
function avisoOps(p: Project, geo: ResolvedLevel, id: Id, view: PlanView | null): PlanOps {
  const out: PlanOps = { fills: [], strokes: [], labels: [] };
  if (view?.hidden.has(id)) return out;
  const e = p.elements[id];
  if (isWall(e)) {
    const m = wallUnion(geo, id, view?.outlineWalls.has(id) === true);
    if (m.length === 0) return out;
    out.fills.push({ polygons: m, color: AVISO, alpha: AVISO_ALPHA });
    for (const ring of m.flat()) out.strokes.push({ pts: ring, closed: true, widthPx: 2.5, color: AVISO, alpha: 1 });
    return out;
  }
  if (isOpening(e)) {
    const f = frameOfWall(p, e.hostId);
    if (!f) return out;
    const g = openingGeometry(p, e, f);
    const rect = orientedRect(g.center.x, g.center.y, g.u.x, g.u.y, g.width / 2, g.thickness / 2 + 0.02);
    out.fills.push({ polygons: [[rect]], color: AVISO, alpha: AVISO_ALPHA });
    out.strokes.push({ pts: rect, closed: true, widthPx: 2.5, color: AVISO, alpha: 1 });
  }
  return out;
}/** Folga da caixa do Reveal em volta do texto de uma anotação, em mm de papel. */
const REVEAL_FOLGA_MM = 0.8;

/**
 * Contorno azul dos elementos revelados (modo Reveal): o desenho normal continua sendo o da geometria; aqui só entra a
 * borda de 2 px, por cima. O que o intervalo de vista ou a categoria escondem continua fora (`hidden`), mesmo que o id
 * esteja em `revealed`: o Reveal é do Hide in View, não do intervalo.
 */
function revealedOutlineOps(input: PlanInput, ctx: PlanContext): PlanOps {
  const revealed = input.revealed;
  if (!revealed || revealed.size === 0) return vazio();
  const { project: p, levelId } = input;
  const { geo, hidden, stairs, ramps, view, style } = ctx;
  const ids = [...revealed].filter((id) => !hidden?.has(id));
  if (ids.length === 0) return vazio();
  const out = vazio();
  const contorno = (m: MultiPolygon): void => {
    for (const ring of m.flat()) out.strokes.push({ pts: ring, closed: true, widthPx: 2, color: REVEAL, alpha: 1 });
  };
  // Pegadas de piso, laje, forro, telhado, escada, rampa e ambiente: a mesma forma que a seleção e o fantasma usam.
  const pegadas = new Map<Id, MultiPolygon>();
  for (const f of pisosDoNivel(p, levelId)) pegadas.set(f.floorId, f.polygon);
  for (const s of lajesDoNivel(p, levelId)) pegadas.set(s.slabId, s.polygon);
  for (const c of resolveCeilings(p, levelId)) pegadas.set(c.ceilingId, c.polygon);
  for (const t of telhadosDoNivel(p, levelId)) pegadas.set(t.roofId, roofFootprint(t));
  for (const s of stairs) pegadas.set(s.id, planFootprint(s));
  for (const r of ramps) pegadas.set(r.id, rampFootprint(r));
  for (const r of ambientesDoNivel(p, levelId)) if (r.polygon) pegadas.set(r.roomId, [r.polygon]);
  for (const id of ids) {
    const e = p.elements[id];
    if (!e) continue;
    if (isWall(e)) {
      contorno(wallUnion(geo, id, view?.outlineWalls.has(id) === true));
      continue;
    }
    if (isOpening(e)) {
      // Abertura de parede oculta não volta sozinha: o vão não tem mais hospedeiro desenhado.
      if (hidden?.has(e.hostId)) continue;
      const f = frameOfWall(p, e.hostId);
      if (!f) continue;
      const g = openingGeometry(p, e, f);
      out.strokes.push({ pts: orientedRect(g.center.x, g.center.y, g.u.x, g.u.y, g.width / 2, g.thickness / 2 + 0.02), closed: true, widthPx: 2, color: REVEAL, alpha: 1 });
      continue;
    }
    const m = pegadas.get(id);
    if (m) {
      contorno(m);
      continue;
    }
    if (isGeneric(e) && e.outline?.length) {
      out.strokes.push({ pts: e.outline, closed: true, widthPx: 2, color: REVEAL, alpha: 1 });
      continue;
    }
    if (isCad(e)) {
      for (const path of e.paths) if (path.pts.length >= 2) out.strokes.push({ pts: path.pts, closed: path.closed, widthPx: 2, color: REVEAL, alpha: 1 });
    }
  }
  // Anotações: caixa em volta do texto (texto, cota) e o próprio traço (linha/região de detalhe e separador de ambiente).
  const scale = input.areaPlan && input.areaPlan.scale > 0 ? input.areaPlan.scale : style.scale;
  const mPerMm = scale / 1000;
  const annotations = drawnAnnotations(p, levelId, input.areaPlan);
  const sel = new Set(ids);
  const caixa = (at: Vec2, w: number, h: number, rotation: number): void => {
    out.strokes.push({ pts: blocoEm(at, w, h, rotation, REVEAL_FOLGA_MM * mPerMm), closed: true, widthPx: 2, color: REVEAL, alpha: 1 });
  };
  for (const t of annotations.texts) {
    if (!sel.has(t.id)) continue;
    const b = textBlockModel(t, scale);
    caixa(t.at, b.w, b.h, t.rotation);
  }
  for (const d of annotations.dimensions) {
    if (!sel.has(d.id)) continue;
    const textMm = d.textHeight ?? DIM_TEXT_MM;
    if (d.angular) {
      const rd = resolveAngularDimension(p, levelId, d);
      const g = angularDimensionGeometry(rd);
      if (!g) continue;
      const b = textBlockModel({ text: dimensionText(p, rd, unitsOf(p)), height: textMm }, scale);
      caixa(g.textAt, b.w, b.h, g.textRotation);
      continue;
    }
    const { a, b } = dimensionPoints(p, d);
    const g = dimensionGeometry(a, b, d.offset, mPerMm, textMm, d.textAt);
    const bloco = textBlockModel({ text: dimensionText(p, d, unitsOf(p)), height: textMm }, scale);
    caixa(g.textAt, bloco.w, bloco.h, g.textRotation);
  }
  for (const l of annotations.detailLines) if (sel.has(l.id)) out.strokes.push({ pts: [l.a, l.b], closed: false, widthPx: 2, color: REVEAL, alpha: 1 });
  for (const r of annotations.detailRegions) if (sel.has(r.id)) out.strokes.push({ pts: r.boundary, closed: true, widthPx: 2, color: REVEAL, alpha: 1 });
  for (const s of levelRoomSeparators(p, levelId)) if (sel.has(s.id)) out.strokes.push({ pts: [s.a, s.b], closed: false, widthPx: 2, color: REVEAL, alpha: 1 });
  return out;
}

/** Operações de uma sobreposição: uma lista neutra com preenchimentos, traços e rótulos. */
const vazio = (): PlanOps => ({ fills: [], strokes: [], labels: [] });

/** Anotações que a vista desenha (as da vista, ou as do nível) e a escala de papel em que o bloco do texto é medido. */
function anotacoesDaVista(input: PlanInput, escala: number): { annotations: ReturnType<typeof drawnAnnotations>; scale: number } {
  return { annotations: drawnAnnotations(input.project, input.levelId, input.areaPlan), scale: input.areaPlan && input.areaPlan.scale > 0 ? input.areaPlan.scale : escala };
}

/** Junta o destaque das anotações (caixa, alça do texto e realce do hover) à sobreposição. */
function comAnotacoes(out: PlanOps, input: PlanInput, escala: number, target: { selection: readonly Id[]; hover: Id | null }): void {
  const { annotations, scale } = anotacoesDaVista(input, escala);
  const h = annotationHighlightOps(input.project, input.levelId, scale, { select: input.theme.select, paper: input.theme.bg, hoverColor: input.theme.selectHover }, target, annotations);
  out.fills.push(...h.fills);
  out.strokes.push(...h.strokes);
  out.labels.push(...h.labels);
}

/**
 * Sobreposição de seleção e hover. Não depende do cursor, da pré-visualização nem da captura: mudar o cursor refaz só a
 * camada viva (`buildPlanLiveOverlay`), e mudar o hover refaz só a camada de hover (`buildPlanHoverOverlay`), sem tocar
 * nos destaques da seleção nem na geometria do nível.
 */
export function buildPlanSelectionOverlay(input: PlanInput): PlanOps {
  const { project: p, theme } = input;
  const ctx = planContext(input);
  const { geo, hidden, up, roofHidden, stairs, view, style } = ctx;
  const selection = input.selection;
  const out = vazio();
  const add = (o: PlanOps): void => {
    out.fills.push(...o.fills);
    out.strokes.push(...o.strokes);
    out.labels.push(...o.labels);
  };

  // A planta de área é de análise/anotação: destaca e seleciona o modelo, mas não desenha alças de mover.
  const alcasDeModelo = input.areaPlan === undefined;
  // Seleção (pisos: destaque próprio; paredes e aberturas em elementHighlight).
  add(floorSelectionOps(p, input.levelId, selection, null, theme, input.viewport, hidden, alcasDeModelo));
  const rmsel = roomSelectionOps(p, input.levelId, selection, null, theme, hidden);
  out.fills.push(...rmsel.fills);
  out.strokes.push(...rmsel.strokes);
  add(slabSelectionOps(p, input.levelId, selection, null, theme, input.viewport, hidden, alcasDeModelo));
  if (up) add(ceilingSelectionOps(p, input.levelId, selection, null, theme, input.viewport, hidden, alcasDeModelo));
  add(roofSelectionOps(p, input.levelId, selection, null, theme, input.viewport, roofHidden, style.paint.roof, alcasDeModelo));
  add(stairSelectionOps(p, stairs, selection, null, theme, input.viewport, alcasDeModelo));
  if (selection.length) {
    out.fills.push(...elementHighlight(p, geo, selection, theme.select, 0.26, view));
    for (const id of selection) {
      const e = p.elements[id];
      if (!isWall(e) || hidden?.has(id)) continue;
      for (const ring of ringsOf(wallUnion(geo, id, view?.outlineWalls.has(id) === true))) out.strokes.push({ pts: ring, closed: true, widthPx: 2, color: theme.select, alpha: 1 });
      // Alças nas pontas do eixo e nos cantos visíveis (a ponta que se vê): é lá que o arrasto pega a parede.
      if (!alcasDeModelo) continue;
      const corners = wallEndCorners(p, e);
      for (const pt of [e.a, e.b, ...corners.a, ...corners.b] as Vec2[]) {
        const q = quadradoEm(pt, ALCA_PX);
        out.fills.push({ ...q.fill, color: '#ffffff', alpha: 1 });
        out.strokes.push({ ...q.traco, widthPx: 1.6, color: theme.select, alpha: 1 });
      }
    }
  }
  // Anotações (textos e cotas): caixa de seleção, alça do texto e realce leve do hover em camada própria.
  comAnotacoes(out, input, style.scale, { selection, hover: null });
  // Modo Reveal: os ocultos voltam ao desenho (geometria) e ganham esta borda azul, uma vez só, na camada de seleção.
  add(revealedOutlineOps(input, ctx));
  return out;
}

/** Sobreposição do alvo sob o cursor. Só o elemento em hover (o selecionado não se repete). */
export function buildPlanHoverOverlay(input: PlanInput): PlanOps {
  const { project: p, theme } = input;
  const { geo, hidden, up, roofHidden, stairs, ramps, view, style } = planContext(input);
  const hover = input.hover;
  const aviso = input.aviso ?? null;
  const out = vazio();
  // Decisão 0044: a parede que impede a operação fica amarela por cima do desenho, com ou sem hover.
  if (aviso) {
    const marca = avisoOps(p, geo, aviso, view);
    out.fills.push(...marca.fills);
    out.strokes.push(...marca.strokes);
  }
  if (!hover || input.selection.includes(hover)) return out;
  const alcasDeModelo = input.areaPlan === undefined;
  const add = (o: PlanOps): void => {
    out.fills.push(...o.fills);
    out.strokes.push(...o.strokes);
    out.labels.push(...o.labels);
  };
  add(floorSelectionOps(p, input.levelId, [], hover, theme, input.viewport, hidden, alcasDeModelo));
  const rmsel = roomSelectionOps(p, input.levelId, [], hover, theme, hidden);
  out.fills.push(...rmsel.fills);
  out.strokes.push(...rmsel.strokes);
  add(slabSelectionOps(p, input.levelId, [], hover, theme, input.viewport, hidden, alcasDeModelo));
  if (up) add(ceilingSelectionOps(p, input.levelId, [], hover, theme, input.viewport, hidden, alcasDeModelo));
  add(roofSelectionOps(p, input.levelId, [], hover, theme, input.viewport, roofHidden, style.paint.roof, alcasDeModelo));
  add(stairSelectionOps(p, stairs, [], hover, theme, input.viewport, alcasDeModelo));
  add(rampSelectionOps(p, ramps, [], hover, theme, input.viewport, alcasDeModelo));
  out.fills.push(...elementHighlight(p, geo, [hover], theme.select, 0.16, view));
  comAnotacoes(out, input, style.scale, { selection: [], hover });
  return out;
}

/** Sobreposição viva da ferramenta: pré-visualização, guias, marcador de captura e o balão de inferência. */
export function buildPlanLiveOverlay(input: PlanInput): PlanOps {
  const { project: p, theme } = input;
  const { geo, view, style } = planContext(input);
  const out = vazio();
  const previa = previewOverlay(input.preview, theme, (ids) => elementHighlight(p, geo, ids, theme.accent, 0.2, view));
  out.fills.push(...previa.fills);
  out.strokes.push(...previa.strokes);
  out.labels.push(...previa.labels);
  if (input.inference) {
    out.strokes.push(...guideStrokes(input.inference.guides, theme));
    out.strokes.push(...snapMarker(input.inference, theme));
    const tip = snapTooltipLabel(input.inference, p);
    if (tip) out.labels.push(tip);
  }
  if (input.tagGhost) {
    const ghost = labelGhostOps(p, input.levelId, input.tagGhost, input.areaPlan?.scale ?? style.scale, input.areaPlan?.graphics.tagDefault.fields, input.dark);
    out.fills.push(...ghost.fills);
    out.strokes.push(...ghost.strokes);
    out.labels.push(...ghost.labels);
  }
  return out;
}

/**
 * Sobreposição da planta completa (modo CPU, plotagem e testes), na mesma ordem de desenho de sempre: destaques de
 * seleção e hover, pré-visualização e inferência. Na tela, as três partes são camadas separadas da cena (`PlanFrame`),
 * para uma não refazer as outras.
 */
export function buildPlanOverlay(input: PlanInput): PlanOps {
  const { project: p, theme, viewport: v } = input;
  const ctx = planContext(input);
  const { geo, hidden, up, roofHidden, stairs, ramps, view, style } = ctx;
  const { selection, hover } = input;
  const out = vazio();
  const alcasDeModelo = input.areaPlan === undefined;
  const add = (o: PlanOps): void => {
    out.fills.push(...o.fills);
    out.strokes.push(...o.strokes);
    out.labels.push(...o.labels);
  };

  // Hover e seleção (pisos: destaque próprio; paredes e aberturas em elementHighlight).
  add(floorSelectionOps(p, input.levelId, selection, hover, theme, v, hidden, alcasDeModelo));
  const rmsel = roomSelectionOps(p, input.levelId, selection, hover, theme, hidden);
  out.fills.push(...rmsel.fills);
  out.strokes.push(...rmsel.strokes);
  add(slabSelectionOps(p, input.levelId, selection, hover, theme, v, hidden, alcasDeModelo));
  if (up) add(ceilingSelectionOps(p, input.levelId, selection, hover, theme, v, hidden, alcasDeModelo));
  add(roofSelectionOps(p, input.levelId, selection, hover, theme, v, roofHidden, style.paint.roof, alcasDeModelo));
  add(stairSelectionOps(p, stairs, selection, hover, theme, v, alcasDeModelo));
  add(rampSelectionOps(p, ramps, selection, hover, theme, v, alcasDeModelo));
  if (hover && !selection.includes(hover)) out.fills.push(...elementHighlight(p, geo, [hover], theme.select, 0.16, view));
  if (selection.length) {
    out.fills.push(...elementHighlight(p, geo, selection, theme.select, 0.26, view));
    for (const id of selection) {
      const e = p.elements[id];
      if (!isWall(e) || hidden?.has(id)) continue;
      for (const ring of ringsOf(wallUnion(geo, id, view?.outlineWalls.has(id) === true))) out.strokes.push({ pts: ring, closed: true, widthPx: 2, color: theme.select, alpha: 1 });
      if (!alcasDeModelo) continue;
      const corners = wallEndCorners(p, e);
      for (const pt of [e.a, e.b, ...corners.a, ...corners.b] as Vec2[]) {
        const q = quadradoEm(pt, ALCA_PX);
        out.fills.push({ ...q.fill, color: '#ffffff', alpha: 1 });
        out.strokes.push({ ...q.traco, widthPx: 1.6, color: theme.select, alpha: 1 });
      }
    }
  }

  // Anotações (textos e cotas): caixa de seleção, alça do texto e realce leve do hover.
  comAnotacoes(out, input, style.scale, { selection, hover });

  // Modo Reveal: os ocultos voltam ao desenho (geometria) e ganham esta borda azul, uma vez só, na sobreposição.
  add(revealedOutlineOps(input, ctx));

  // Pré-visualização, guias e marcador de captura.
  add(previewOverlay(input.preview, theme, (ids) => elementHighlight(p, geo, ids, theme.accent, 0.2, view)));
  if (input.inference) {
    out.strokes.push(...guideStrokes(input.inference.guides, theme));
    out.strokes.push(...snapMarker(input.inference, theme));
    const tip = snapTooltipLabel(input.inference, p);
    if (tip) out.labels.push(tip);
  }
  return out;
}

/**
 * Sobreposição da tela: a de `buildPlanOverlay` mais o contorno fantasma dos selecionados que estão fora do intervalo de
 * vista (decisão 0013 §4). A planta não os desenha; o fantasma vai por último, como antes.
 */
export function buildPlanScreenOverlay(input: PlanInput): PlanOps {
  const o = buildPlanOverlay(input);
  const ghosts = hiddenSelectionOps(input.project, input.levelId, planViewOf(input.project, input.levelId), input.selection, input.theme);
  return ghosts.length ? { ...o, strokes: [...o.strokes, ...ghosts] } : o;
}
