import type { Vec2 } from '@hestia/geom';
import type { Id, Project } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Pranchas (decisão 0022): folha de papel com moldura, carimbo e vistas (planta, corte ou 3D) em escala. Tudo em mm de
 * papel; as vistas usam o mundo em metros e a escala 1:`scale`. Campos opcionais em `Project.sheets`: sem eles, não há
 * pranchas e o arquivo antigo continua valendo (sem migração).
 */
export type SheetSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
export type SheetOrientation = 'landscape' | 'portrait';
export const SHEET_SIZES: readonly SheetSize[] = ['A0', 'A1', 'A2', 'A3', 'A4'];
export const SHEET_ORIENTATIONS: readonly SheetOrientation[] = ['landscape', 'portrait'];

/** Dimensões da folha ISO 216 em mm, na orientação de retrato (largura × altura). */
export const SHEET_PAPER_MM: Record<SheetSize, { w: number; h: number }> = {
  A0: { w: 841, h: 1189 },
  A1: { w: 594, h: 841 },
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
};

/** Margem padrão da folha (mm de papel). */
export const SHEET_DEFAULT_MARGIN = 10;

/** Dados do carimbo (cabeçalho do bloco de título). */
export interface TitleBlock {
  project: string;
  client: string;
  author: string;
  date: string;
  revision: string;
  /** Texto livre da escala; sem ele, o carimbo mostra as escalas das vistas. */
  scaleNote?: string;
}

/**
 * Câmera da vista 3D na prancha: retrato do `OrbitCamera` da tela (decisão 0040). É o que permite a prancha mostrar
 * exatamente o enquadramento escolhido na aba 3D, sem depender do estado vivo da tela. Ausente = enquadramento padrão
 * (axonométrica que cobre o modelo).
 */
export interface SheetView3DCamera {
  /** Ângulo da órbita em radianos (0 = leste, anti-horário). */
  azimuth: number;
  /** Elevação da câmera em radianos (acima do horizonte). */
  elevation: number;
  /** Distância da câmera ao alvo, em metros. */
  distance: number;
  /** Ponto para onde a câmera olha, em metros. */
  target: { x: number; y: number; z: number };
  /** Projeção ortogonal (true) ou em perspectiva (false). */
  ortho: boolean;
}

/** O que a vista mostra: planta de um nível, planta de área, corte/elevação de uma seção do projeto ou o 3D vetorial. */
export type SheetViewSource =
  | { kind: 'plan'; levelId: Id }
  | { kind: 'areaPlan'; planId: Id }
  | { kind: 'areaTable' }
  | { kind: 'section'; sectionId: Id }
  | { kind: '3d'; pointId?: Id; camera?: SheetView3DCamera };

/** Motivo de recusa de uma câmera 3D, ou null. */
export function sheetView3DCameraIssue(c: SheetView3DCamera): string | null {
  const finitos = [c.azimuth, c.elevation, c.distance, c.target.x, c.target.y, c.target.z].every((n) => Number.isFinite(n));
  if (!finitos) return 'Câmera da vista 3D inválida';
  if (!(c.distance > 0)) return 'A distância da câmera 3D deve ser maior que zero.';
  return null;
}

/**
 * Legenda da vista na prancha (Revit: *View Title*, ArchiCAD: *Drawing Title*). Ausente = legenda padrão abaixo da
 * caixa, com o nome e a escala.
 */
export interface SheetViewportLabel {
  /** `false` esconde a legenda (a moldura continua). Ausente = mostra. */
  show?: boolean;
  /** Altura do texto em mm de papel. Ausente = 2,5 mm. */
  sizeMm?: number;
  /** Barra de escala gráfica ao lado do texto (arquiCAD/Revit). Ausente = não. */
  scaleBar?: boolean;
  /** Linha sob o texto, como no Revit. Ausente = sim. */
  rule?: boolean;
}

/**
 * Vista colocada numa prancha. `at` é o canto inferior esquerdo e `size` a caixa, ambos em mm de papel. `size` é a
 * região de recorte (Revit: *Crop Region*): redimensionar a caixa recorta o desenho, sem mudar a escala.
 */
export interface SheetViewport {
  id: Id;
  view: SheetViewSource;
  at: Vec2;
  size: { w: number; h: number };
  /** Denominador da escala: 100 = 1:100. */
  scale: number;
  title?: string;
  /**
   * Deslocamento do conteúdo dentro da caixa (pan), em mm de papel. Ausente = conteúdo centrado. Serve para escolher
   * que parte do modelo aparece no recorte, sem abrir a vista.
   */
  offset?: Vec2;
  /** Recorta o desenho à caixa. `false` deixa o desenho transbordar (útil para detalhes). Ausente = recorta. */
  clip?: boolean;
  /** Desenha a moldura fina da vista. Ausente = desenha. */
  frame?: boolean;
  /** Como a legenda aparece. Ausente = legenda padrão. */
  label?: SheetViewportLabel;
  /** Vista travada: não se move nem se redimensiona na prancha (Revit: *Pin*). */
  locked?: boolean;
  /**
   * Âncora do conteúdo no papel (mm): o ponto onde cai o centro do desenho. Ausente = centro da caixa + `offset`
   * (comportamento antigo, recentralizado). Com âncora, redimensionar a caixa recorta o desenho sem movê-lo — como no
   * Revit — e mover a vista desloca a âncora junto.
   */
  anchor?: Vec2;
}

/** Linha da tabela de revisões do carimbo (Revit: *Sheet Issues/Revisions*, ArchiCAD: *Revision History*). */
export interface SheetRevision {
  /** Identificador curto da revisão: "0", "A", "R1". */
  tag: string;
  date: string;
  description: string;
  /** Autor da revisão. */
  by?: string;
}

export interface Sheet {
  id: Id;
  number: string;
  name: string;
  size: SheetSize;
  orientation: SheetOrientation;
  /** Margem entre a borda da folha e a moldura (mm). */
  margin: number;
  titleBlock: TitleBlock;
  viewports: SheetViewport[];
  /** Histórico de revisões mostrado no carimbo; ausente = nenhuma revisão listada. */
  revisions?: SheetRevision[];
  /** Assinatura do carimbo (logo em data URL, PNG). Ausente = carimbo só com texto. */
  logo?: string;
  /** Disciplina da prancha ("Arquitetura", "Estrutura"), usada na lista e na numeração. Ausente = sem disciplina. */
  discipline?: string;
}

/** Largura e altura da folha em mm, conforme a orientação. */
export function sheetDimsMm(s: Pick<Sheet, 'size' | 'orientation'>): { w: number; h: number } {
  const { w, h } = SHEET_PAPER_MM[s.size];
  return s.orientation === 'landscape' ? { w: h, h: w } : { w, h };
}

/** Área de desenho de uma vista: a folha menos a margem. Vistas precisam caber nela. */
export function sheetInnerBox(s: Pick<Sheet, 'size' | 'orientation' | 'margin'>): { x0: number; y0: number; x1: number; y1: number } {
  const d = sheetDimsMm(s);
  return { x0: s.margin, y0: s.margin, x1: d.w - s.margin, y1: d.h - s.margin };
}

export const emptyTitleBlock = (): TitleBlock => ({ project: '', client: '', author: '', date: '', revision: '' });

const finite = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

/** Motivo de recusa de uma prancha (tamanho, orientação, margem), ou null. */
export function sheetIssue(s: Sheet, lang: Lang = 'pt'): string | null {
  if (!SHEET_SIZES.includes(s.size)) return translate(lang, 'md_cmd_sheet_size_unknown');
  if (!SHEET_ORIENTATIONS.includes(s.orientation)) return translate(lang, 'md_cmd_sheet_orientation_unknown');
  const d = sheetDimsMm(s);
  if (!(Number.isFinite(s.margin) && s.margin >= 0 && s.margin * 2 < Math.min(d.w, d.h))) return translate(lang, 'md_cmd_sheet_margin_invalid');
  return null;
}

/** Motivo de recusa de uma vista na prancha, ou null. Vista fora da área de desenho da folha é recusada. */
export function viewportIssue(s: Pick<Sheet, 'size' | 'orientation' | 'margin'>, v: SheetViewport, lang: Lang = 'pt'): string | null {
  if (!finite(v.at)) return translate(lang, 'md_cmd_viewport_position');
  if (!(Number.isFinite(v.size.w) && Number.isFinite(v.size.h) && v.size.w > 0 && v.size.h > 0)) return translate(lang, 'md_cmd_viewport_size');
  if (!(Number.isFinite(v.scale) && v.scale > 0)) return translate(lang, 'md_cmd_viewport_scale');
  if (v.offset !== undefined && !finite(v.offset)) return translate(lang, 'md_cmd_viewport_offset');
  if (v.anchor !== undefined && !finite(v.anchor)) return translate(lang, 'md_cmd_viewport_anchor');
  if (v.label?.sizeMm !== undefined && !(Number.isFinite(v.label.sizeMm) && v.label.sizeMm > 0)) return translate(lang, 'md_cmd_viewport_label_size');
  const box = sheetInnerBox(s);
  const eps = 1e-6;
  if (v.at.x < box.x0 - eps || v.at.y < box.y0 - eps || v.at.x + v.size.w > box.x1 + eps || v.at.y + v.size.h > box.y1 + eps) return translate(lang, 'md_cmd_viewport_outside');
  return null;
}

/** Retângulo de uma vista na folha (mm de papel, y para cima). */
export interface SheetBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const viewportBox = (v: Pick<SheetViewport, 'at' | 'size'>): SheetBox => ({ x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h });

/** Deslocamento do conteúdo da vista (mm de papel); ausente = centrado. */
export const viewportOffset = (v: Pick<SheetViewport, 'offset'>): Vec2 => v.offset ?? { x: 0, y: 0 };

/**
 * Âncora do conteúdo no papel (mm, y para cima): onde cai o centro do desenho. A âncora existe para redimensionar a
 * caixa sem mover o desenho; sem ela, vale o centro da caixa mais o `offset` (arquivos antigos).
 */
export function viewportAnchor(v: Pick<SheetViewport, 'at' | 'size'> & Partial<Pick<SheetViewport, 'offset' | 'anchor'>>): Vec2 {
  if (v.anchor) return v.anchor;
  const o = v.offset ?? { x: 0, y: 0 };
  return { x: v.at.x + v.size.w / 2 + o.x, y: v.at.y + v.size.h / 2 + o.y };
}

/** A vista recorta o desenho à caixa? (ausente = sim, como no Revit). */
export const viewportClipped = (v: Pick<SheetViewport, 'clip'>): boolean => v.clip !== false;

/** A moldura fina da vista aparece? (ausente = sim). */
export const viewportFrameVisible = (v: Pick<SheetViewport, 'frame'>): boolean => v.frame !== false;

/** Legenda normalizada da vista: tamanho em mm, linha e barra de escala. */
export interface ResolvedViewportLabel {
  show: boolean;
  sizeMm: number;
  scaleBar: boolean;
  rule: boolean;
}

export const LABEL_DEFAULT_MM = 2.5;

export function viewportLabel(v: Pick<SheetViewport, 'label'>): ResolvedViewportLabel {
  return {
    show: v.label?.show !== false,
    sizeMm: v.label?.sizeMm !== undefined && v.label.sizeMm > 0 ? v.label.sizeMm : LABEL_DEFAULT_MM,
    scaleBar: v.label?.scaleBar === true,
    rule: v.label?.rule !== false,
  };
}

/** Pranchas do projeto (ausente = nenhuma). */
export const projectSheets = (p: Pick<Project, 'sheets'>): Sheet[] => p.sheets ?? [];

export function sheetOf(p: Pick<Project, 'sheets'>, id: Id): Sheet | undefined {
  return projectSheets(p).find((s) => s.id === id);
}

/**
 * Número da prancha que mostra a vista de corte/elevação `viewId` (primeiro viewport achado), ou `undefined` se a
 * vista ainda não está em nenhuma prancha. Usado na marca de corte em planta (número do corte sobre número da prancha).
 */
export function sectionSheetNumberOf(p: Pick<Project, 'sheets'>, viewId: Id): string | undefined {
  for (const sheet of projectSheets(p)) {
    for (const vp of sheet.viewports) {
      if (vp.view.kind === 'section' && vp.view.sectionId === viewId) return sheet.number;
    }
  }
  return undefined;
}
