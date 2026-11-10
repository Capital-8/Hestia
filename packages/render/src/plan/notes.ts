import { angularDimensionGeometry, dimensionFormatStyle, dimensionPoints, dimensionStyleFor, dimensionValue, DIM_TEXT_MM, floorViewId, formatDimension, levelRoomSeparators, unitsOf, viewAnnotationsOf, viewProfileOf, type AreaPlan, type AreaPlanAnnotations, type Dimension, type DimensionStyle, type Id, type Project, type TextNote } from '@hestia/model';
import { resolveAngularDimension } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import type { Viewport } from '../viewport.ts';
import { quadradoEm } from './marcadores.ts';
import { elementTagOpsOf, noteLabel } from './tags.ts';
import { planViewIdOf } from './viewId.ts';
import { drawDimension, layoutDimensions, type DimItem } from './dimDraw.ts';
import { espessuraDeCorte, espessuraDeProjecao, type PlanPaint } from './style.ts';
import { espessuraVezes } from './espessura.ts';
import { type FillOp, type LabelOp, type StrokeOp } from './types.ts';

/** Cores e seleção para desenhar as anotações. */
export interface NoteLook {
  ink: string;
  select: string;
  /** Cor do realce sob o cursor (ausente usa `select`). */
  hoverColor?: string;
  paper?: string;
  selection: Id[];
  /** Estilo global de cotas (ausente usa o padrão). */
  dimStyle?: DimensionStyle;
  /** Cota sob o cursor: destacada inteira (linha, chamadas, marcadores e texto). */
  hover?: Id | null;
}

/** Espessura relativa das linhas de separação selecionadas (um pouco maior que a normal, traço mantido). */
const SEPARATOR_SELECTED_WIDTH = 1.5;

/** Largura média de um caractere, em múltiplos do corpo da fonte (a mesma estimativa da seleção em `annotationPick`). */
const CARACTERE_EM = 0.6;
/** Entrelinha, em múltiplos do corpo (o CSS de `.plan-note` usa 1,15; aqui um pouco de folga para a caixa). */
const LINHA_EM = 1.25;
/** Folga entre o texto e a moldura da caixa (`TextNote.frame`), em mm de papel. */
const MOLDURA_MM = 0.35;
/** Folga da caixa de seleção em volta do bloco, em mm de papel. */
const SELECAO_MM = 0.8;
/** Meio lado da alça quadrada do texto, em pixels de tela (o ponto de ancoragem é `text.at`). */
const ALCA_TEXTO_PX = 4;
/** Espessura das linhas da cota em destaque (hover/seleção) em relação à normal. */
const DIM_ESTADO_FATOR = 1.5;
/** Alfa do realce leve sob o cursor (o preenchimento não esconde o desenho de trás). */
const HOVER_ALPHA = 0.12;

/**
 * Linhas do texto: as quebras de `\n` e, quando há `width` (mm de papel), a quebra por largura. A largura do caractere
 * é estimada (`CARACTERE_EM` do corpo), a mesma conta da caixa da moldura e da seleção do texto.
 */
export function linhasDoTexto(text: string, fontMm: number, widthMm?: number): string[] {
  const paragrafos = text.split('\n');
  if (!widthMm || widthMm <= 0 || fontMm <= 0) return paragrafos;
  const porLinha = Math.max(1, Math.floor(widthMm / (fontMm * CARACTERE_EM)));
  const linhas: string[] = [];
  for (const paragrafo of paragrafos) {
    let atual = '';
    for (const palavra of paragrafo.split(' ')) {
      let resto = palavra;
      while (resto.length > porLinha) {
        if (atual) {
          linhas.push(atual);
          atual = '';
        }
        linhas.push(resto.slice(0, porLinha));
        resto = resto.slice(porLinha);
      }
      const candidata = atual ? `${atual} ${resto}` : resto;
      if (candidata.length <= porLinha) atual = candidata;
      else {
        linhas.push(atual);
        atual = resto;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Bloco do texto em metros: as linhas (quebradas como na tela) e a largura/altura da caixa. */
export interface TextBlockModel {
  lines: string[];
  /** Largura da caixa em metros (a de `width`, ou a estimada pelo maior verso). */
  w: number;
  /** Altura da caixa em metros (todas as linhas). */
  h: number;
}

/** Bloco de um texto em metros: `width` limita a largura e quebra as linhas; `height` é o corpo em mm de papel. */
export function textBlockModel(t: Pick<TextNote, 'text' | 'height' | 'width'>, escala: number): TextBlockModel {
  const mPerMm = escala / 1000;
  const fontMm = t.height > 0 ? t.height : DIM_TEXT_MM;
  const lines = linhasDoTexto(t.text, fontMm, t.width);
  const doVerso = Math.max(1, ...lines.map((l) => l.length)) * fontMm * CARACTERE_EM;
  const w = (t.width && t.width > 0 ? t.width : doVerso) * mPerMm;
  const h = Math.max(1, lines.length) * fontMm * LINHA_EM * mPerMm;
  return { lines, w, h };
}

/**
 * Ponto da alça de movimento: canto inferior esquerdo da caixa de seleção do texto. Fica fora do bloco (o texto é
 * desenhado por cima do canvas), para o quadradinho não sumir atrás das letras; é o mesmo ponto que `textGripAt` pega.
 */
export function alcaDoTextoEm(t: Pick<TextNote, 'at' | 'text' | 'height' | 'width' | 'rotation'>, escala: number): Vec2 {
  const b = textBlockModel(t, escala);
  const folga = (SELECAO_MM + MOLDURA_MM) * escala / 1000;
  const hw = b.w / 2 + folga;
  const hh = b.h / 2 + folga;
  const r = (t.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Canto inferior esquerdo no referencial do texto: x negativo, y negativo (o eixo y do modelo aponta para cima).
  return { x: t.at.x + -hw * c - -hh * s, y: t.at.y + -hw * s + -hh * c };
}

/**
 * Retângulo do bloco (polígono fechado) centrado em `at`, girado por `rotation` graus (o mesmo sentido do texto na
 * planta) e com `folga` em metros em cada lado. É a caixa da moldura, da seleção e do realce sob o cursor.
 */
export function blocoEm(at: Vec2, w: number, h: number, rotation: number, folga = 0): Vec2[] {
  const hw = w / 2 + folga;
  const hh = h / 2 + folga;
  const r = (rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: at.x + x! * c - y! * s, y: at.y + x! * s + y! * c }));
}

/**
 * Anotações que a vista desenha (`viewAnnotationsOf`: as próprias da planta de área ou, sem elas, as do nível). O perfil
 * da vista filtra o que aparece (a mesma regra de `build.ts`), para o destaque não cercar anotação oculta. `viewId`
 * opcional: quem já o tem (o contexto de desenho) o passa; sem ele sai de `levelId` + `plan`.
 */
export function drawnAnnotations(p: Project, levelId: Id, plan?: AreaPlan, viewId?: Id): AreaPlanAnnotations {
  const vid = viewId ?? planViewIdOf(p, levelId, { areaPlan: plan });
  const all: AreaPlanAnnotations = viewAnnotationsOf(p, vid);
  if (!plan) return all;
  const prof = viewProfileOf(p, vid).layers;
  return {
    dimensions: prof.dimensions ? all.dimensions : [],
    texts: prof.texts ? all.texts : [],
    detailLines: prof.detail ? all.detailLines : [],
    detailRegions: prof.detail ? all.detailRegions : [],
    tags: prof.tags ? all.tags : [],
  };
}

export interface NoteOps {
  fills: FillOp[];
  strokes: StrokeOp[];
  labels: LabelOp[];
}

/**
 * Itens de cota prontos para o desenho (pontos medidos ou geometria angular + texto formatado com o estilo): o MESMO
 * caminho da planta, da planta de área, do corte e da elevação. A família gravada na cota (`Dimension.familyId`) entra
 * com o seu estilo e com a sua formatação; sem família, vale o estilo global da vista (comportamento antigo).
 */
export function dimensionItems(p: Project, levelId: Id, dims: readonly Dimension[], style?: DimensionStyle): DimItem[] {
  const units = unitsOf(p);
  const familyOf = (d: Dimension): DimensionStyle | undefined => (d.familyId ? dimensionStyleFor(p.settings, d) : undefined);
  const texto = (d: Dimension): string => {
    const fixo = d.text?.trim();
    return fixo ? fixo : formatDimension(d, dimensionValue(p, d), units, dimensionFormatStyle(familyOf(d) ?? style));
  };
  const out: DimItem[] = [];
  for (const d of dims) {
    if (d.angular) {
      const rd = resolveAngularDimension(p, levelId, d);
      const ang = angularDimensionGeometry(rd);
      if (!ang) continue;
      const family = familyOf(d);
      out.push({ d, a: rd.a, b: rd.b, text: texto(rd), ang, ...(family ? { style: family } : {}) });
      continue;
    }
    const { a, b } = dimensionPoints(p, d);
    const family = familyOf(d);
    out.push({ d, a, b, text: texto(d), ...(family ? { style: family } : {}) });
  }
  return out;
}

/**
 * Anotações do nível no mesmo formato da vista (`AreaPlanAnnotations`): é o fallback da planta de área quando ela ainda
 * não tem anotações próprias. As linhas de separação continuam no nível e não entram neste conjunto.
 */
export function annotationsOfLevel(p: Project, levelId: Id): AreaPlanAnnotations {
  return viewAnnotationsOf(p, floorViewId(levelId));
}

/**
 * Cotas e textos do nível na planta (decisão 0019). Só desenha com a categoria 'annotation' visível; a espessura é a de
 * corte dela. O texto do valor sai centrado acima da linha de cota, com o tamanho de `DIM_TEXT_MM` em papel.
 *
 * `annotations` (planta de área) substitui as anotações do nível: usa as cotas, textos, linhas/regiões de detalhe e
 * etiquetas de elemento DA VISTA, sem somar as do nível. Sem ele, o comportamento é o de sempre. As linhas de separação
 * de ambiente não são anotação de vista: continuam vindo do nível (com `annotations`, o chamador as desenha).
 */
export function noteOps(p: Project, levelId: Id, pt: PlanPaint, look: NoteLook, scale: number, v?: Viewport, annotations?: AreaPlanAnnotations, viewId: Id = floorViewId(levelId)): NoteOps {
  const out: NoteOps = { fills: [], strokes: [], labels: [] };
  if (!pt.visible) return out;
  const color = pt.color ?? look.ink;
  const picked = (id: Id): boolean => look.selection.includes(id);
  const { dimensions, texts, detailLines, detailRegions } = annotations ?? viewAnnotationsOf(p, viewId);
  const corte = espessuraDeCorte(pt);
  const projecao = espessuraDeProjecao(pt);
  // Disposição das cotas da vista: o texto que não cabe sai com linha de chamada e os rótulos não se sobrepõem.
  const layouts = layoutDimensions(dimensionItems(p, levelId, dimensions, look.dimStyle), { scale, style: look.dimStyle, v });
  for (const l of layouts) {
    const id = l.item.d.id;
    const sel = picked(id);
    const hov = !sel && look.hover === id;
    const estado = sel || hov;
    const c = sel ? look.select : hov ? (look.hoverColor ?? look.select) : color;
    const d = drawDimension(l, scale, { color: c, fina: projecao, marcador: corte, fator: estado ? DIM_ESTADO_FATOR : 1 });
    out.fills.push(...d.fills);
    out.strokes.push(...d.strokes);
    out.labels.push(...d.labels);
  }
  for (const t of texts) {
    const selecionado = picked(t.id);
    const c = selecionado ? look.select : color;
    const mPorMm = scale / 1000;
    const bloco = textBlockModel(t, scale);
    if (t.leader) for (let i = 0; i < t.leader.length - 1; i++) out.strokes.push({ pts: [t.leader[i]!, t.leader[i + 1]!], closed: false, ...projecao, color: c, alpha: 1 });
    // Moldura do texto (`frame`): fundo do papel e contorno em volta do bloco, quebrado por `width` quando houver.
    if (t.frame) {
      const folga = MOLDURA_MM * mPorMm;
      out.fills.push({ polygons: [[blocoEm(t.at, bloco.w, bloco.h, t.rotation, folga)]], color: look.paper ?? '#fbfbfa', alpha: 1 });
      out.strokes.push({ pts: blocoEm(t.at, bloco.w, bloco.h, t.rotation, folga), closed: true, ...projecao, color: c, alpha: 1 });
    }
    // Seleção: caixa em volta do bloco e o quadradinho da alça no canto inferior esquerdo, fora do texto.
    if (selecionado) {
      out.strokes.push({ pts: blocoEm(t.at, bloco.w, bloco.h, t.rotation, (MOLDURA_MM + SELECAO_MM) * mPorMm), closed: true, widthPx: 2, color: look.select, alpha: 1 });
      const q = quadradoEm(alcaDoTextoEm(t, scale), ALCA_TEXTO_PX);
      out.fills.push({ ...q.fill, color: '#ffffff', alpha: 1 });
      out.strokes.push({ ...q.traco, widthPx: 1.5, color: look.select, alpha: 1 });
    }
    const label = noteLabel(t.at, t.text, t.height, scale, t.rotation);
    if (t.width) label.papel = { ...label.papel!, widthMm: t.width };
    // `whiteSpace: pre-wrap` preserva as quebras de `\n` (e as de `width`) no texto de tela; a cor de seleção tinge o texto.
    out.labels.push({ ...label, whiteSpace: 'pre-wrap', bold: t.bold, italic: t.italic, underline: t.underline, align: t.align, ...(selecionado ? { color: look.select } : {}) });
  }
  for (const line of detailLines) {
    const selected = picked(line.id);
    out.strokes.push({ pts: [line.a, line.b], closed: false, ...(selected ? espessuraVezes(projecao, 1.7) : projecao), color: selected ? look.select : color, alpha: 1, dash: line.style === 'dashed' ? [7, 4] : line.style === 'dotted' ? [1, 3] : undefined });
  }
  for (const region of detailRegions) {
    const ink = picked(region.id) ? look.select : color;
    if (region.mask) {
      out.labels.push({ at: region.boundary[0]!, text: '', maskBoundary: region.boundary, maskColor: look.paper ?? '#fbfbfa', maskBorderColor: ink });
    } else {
      out.fills.push({ polygons: [[region.boundary]], color: region.color ?? '#f5d782', alpha: 0.48 });
      out.strokes.push({ pts: region.boundary, closed: true, ...projecao, color: ink, alpha: 1 });
    }
  }
  // Sem anotações de vista, as linhas de separação saem daqui (como sempre). Com elas (planta de área), o chamador as
  // desenha no lugar e na cor de sempre: separador não é anotação da vista.
  if (!annotations) out.strokes.push(...roomSeparatorStrokes(p, levelId, pt, color, new Set(look.selection), look.select));
  // Etiquetas de elemento da vista (planta de área): mesmo desenho das etiquetas do nível, com os hóspedes do modelo.
  // Só entram quando a vista traz as suas anotações; sem elas, `build.ts` desenha as do nível à parte (como antes).
  if (annotations) {
    const tags = elementTagOpsOf(p, annotations.tags, pt, scale);
    out.strokes.push(...tags.strokes);
    out.labels.push(...tags.labels);
  }
  return out;
}

/** O que destacar nas anotações: a seleção (caixa e alça do texto) e o alvo sob o cursor (realce leve). */
export interface NoteTarget {
  selection?: readonly Id[];
  hover?: Id | null;
}

/**
 * Destaque de seleção e hover das anotações (textos e cotas) em camada própria: só a caixa, a alça do texto e o realce
 * leve sob o cursor. O texto e a cota continuam vindo de `noteOps` (a cor de seleção deles sai de lá, quando a geometria
 * é refeita), e aqui nada é redesenhado: a camada de hover pode ser refeita sem tocar na geometria do nível.
 *
 * A alça do texto é o quadradinho de `ALCA_TEXTO_PX` px em `text.at` — o mesmo ponto que o `selectTool` usa para pegar o
 * texto e arrastá-lo. Para cotas, a seleção continua só na cor; o hover cercar o valor com um realce leve.
 */
export function annotationHighlightOps(
  p: Project,
  levelId: Id,
  scale: number,
  look: Pick<NoteLook, 'select' | 'paper' | 'hoverColor' | 'dimStyle'>,
  target: NoteTarget,
  annotations?: AreaPlanAnnotations,
  v?: Viewport,
): NoteOps {
  const out: NoteOps = { fills: [], strokes: [], labels: [] };
  const selected = new Set(target.selection ?? []);
  const hover = target.hover ?? null;
  if (selected.size === 0 && hover === null) return out;
  const a = annotations ?? drawnAnnotations(p, levelId);
  const mPerMm = scale / 1000;
  const hoverColor = look.hoverColor ?? look.select;
  const folga = (MOLDURA_MM + SELECAO_MM) * mPerMm;
  for (const t of a.texts) {
    const selecionado = selected.has(t.id);
    const alvo = !selecionado && hover === t.id;
    if (!selecionado && !alvo) continue;
    const bloco = textBlockModel(t, scale);
    if (alvo) {
      out.fills.push({ polygons: [[blocoEm(t.at, bloco.w, bloco.h, t.rotation, folga)]], color: hoverColor, alpha: HOVER_ALPHA });
      out.strokes.push({ pts: blocoEm(t.at, bloco.w, bloco.h, t.rotation, folga), closed: true, widthPx: 1.2, color: hoverColor, alpha: 0.7 });
      continue;
    }
    out.strokes.push({ pts: blocoEm(t.at, bloco.w, bloco.h, t.rotation, folga), closed: true, widthPx: 2, color: look.select, alpha: 1 });
    const q = quadradoEm(alcaDoTextoEm(t, scale), ALCA_TEXTO_PX);
    out.fills.push({ ...q.fill, color: '#ffffff', alpha: 1 });
    out.strokes.push({ ...q.traco, widthPx: 1.5, color: look.select, alpha: 1 });
  }
  // Cotas: o hover destaca a cota INTEIRA (linha, chamadas, marcadores e texto) na cor de realce, mais grossa, e cerca o
  // valor com o realce leve; a cota selecionada já sai na cor de seleção em `noteOps`. A disposição é a de `noteOps`.
  if (a.dimensions.some((d) => hover === d.id && !selected.has(d.id))) {
    const layouts = layoutDimensions(dimensionItems(p, levelId, a.dimensions, look.dimStyle), { scale, style: look.dimStyle, v });
    const fina = { widthPx: 1.1 };
    const marcador = { widthPx: 1.6 };
    for (const l of layouts) {
      if (hover !== l.item.d.id || selected.has(l.item.d.id)) continue;
      const d = drawDimension(l, scale, { color: hoverColor, fina, marcador, fator: DIM_ESTADO_FATOR });
      out.fills.push(...d.fills);
      out.strokes.push(...d.strokes);
      out.labels.push(...d.labels);
      const bloco = blocoEm(l.textAt, l.w, l.h, l.rotation, folga);
      out.fills.push({ polygons: [[bloco]], color: hoverColor, alpha: HOVER_ALPHA });
      out.strokes.push({ pts: bloco, closed: true, widthPx: 1.2, color: hoverColor, alpha: 0.7 });
    }
  }
  return out;
}

/**
 * Linhas de separação de ambiente do nível (tracejadas e finas, como o Revit). Usam a cor e a espessura de projeção da
 * categoria 'anotação' e o traço das membranas. Só o nível pedido: a planta de outro nível não as recebe.
 */
export function roomSeparatorStrokes(p: Project, levelId: Id, pt: PlanPaint, color: string, selected: ReadonlySet<Id> = new Set(), select: string = color): StrokeOp[] {
  if (!pt.visible) return [];
  return levelRoomSeparators(p, levelId).map((r) => {
    const picked = selected.has(r.id);
    return { pts: [r.a, r.b], closed: false, ...(picked ? espessuraVezes(espessuraDeProjecao(pt), SEPARATOR_SELECTED_WIDTH) : espessuraDeProjecao(pt)), color: picked ? select : color, alpha: 1, dash: [6, 3] as [number, number] };
  });
}
