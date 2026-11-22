import { sheetDimsMm, sheetOf, viewportClipped, type Id, type Project, type SheetViewport } from '@hestia/model';
import { furnitureParts } from './frame.ts';
import { modelSig } from './cache.ts';
import { cachedViewportParts } from './partsCache.ts';
import { areaTablePartsOf, areaPlanPartsOf, planPartsOf, sectionPartsOf } from './viewports.ts';
import { vista3dParts } from './vista3d.ts';
import { type SheetDrawList, type SheetPoint, type SheetRect, type ViewportParts } from './types.ts';
import type { Lang } from '../i18n.ts';

function partsOfViewport(p: Project, v: SheetViewport, lang: Lang): ViewportParts {
  switch (v.view.kind) {
    case 'plan':
      return planPartsOf(p, v.view.levelId, v, lang, v.view.planId);
    case 'areaPlan':
      return areaPlanPartsOf(p, v.view.planId, v, lang);
    case 'areaTable':
      return areaTablePartsOf(p, v, lang);
    case 'section':
      return sectionPartsOf(p, v.view.sectionId, v);
    case '3d':
      return vista3dParts(p, v);
  }
}

/** Partes de uma vista pelo cache (ver `partsCache.ts`); `exact` não aceita deslocamento (saída idêntica ao cálculo direto). */
export function viewportPartsCached(p: Project, v: SheetViewport, lang: Lang, exact = false): { parts: ViewportParts; shift: SheetPoint } {
  return cachedViewportParts(p, v, lang, () => partsOfViewport(p, v, lang), modelSig(p), exact);
}

/** Prepara o cache de uma vista que ainda não está na prancha (ao arrastá-la do Navegador): o soltar vira acerto de cache. */
export function prefetchViewportParts(p: Project, v: SheetViewport, lang: Lang = 'pt'): ViewportParts {
  return viewportPartsCached(p, v, lang).parts;
}

const clipOf = (v: SheetViewport): SheetRect | null => (viewportClipped(v) ? { x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h } : null);

/** Camada de uma vista para a tela: o desenho do cache (sem copiar) e o deslocamento de papel a aplicar. */
export interface SheetLayer {
  id: Id;
  /** Recorte já na posição atual da caixa (mm de papel); null = sem recorte. */
  clip: SheetRect | null;
  /** Partes na coordenada do cache; somar `shift` para obter o papel. */
  parts: ViewportParts;
  shift: SheetPoint;
}

export interface SheetLayers {
  widthMm: number;
  heightMm: number;
  layers: SheetLayer[];
  /** Moldura, legendas e carimbo (já em papel). */
  furniture: ViewportParts;
}

/** Camadas da prancha para a tela (usa e alimenta o cache; mover uma vista não recalcula nenhum desenho). */
export function buildSheetLayers(p: Project, sheetId: Id, lang: Lang = 'pt'): SheetLayers | null {
  const s = sheetOf(p, sheetId);
  if (!s) return null;
  const d = sheetDimsMm(s);
  const sig = modelSig(p);
  const layers = s.viewports.map((v): SheetLayer => {
    const r = cachedViewportParts(p, v, lang, () => partsOfViewport(p, v, lang), sig);
    return { id: v.id, clip: clipOf(v), parts: r.parts, shift: r.shift };
  });
  return { widthMm: d.w, heightMm: d.h, layers, furniture: furnitureParts(p, s, lang) };
}

/**
 * Lista de desenho de uma prancha em mm de papel (decisão 0022): cada vista num grupo recortado à sua caixa e, por
 * último, a moldura, as legendas e o carimbo. Prancha inexistente: null. Usa o cache só com acerto na mesma posição
 * (o PDF e o DXF saem idênticos ao cálculo direto).
 */
export function buildSheetDrawList(p: Project, sheetId: Id, lang: Lang = 'pt'): SheetDrawList | null {
  const s = sheetOf(p, sheetId);
  if (!s) return null;
  const d = sheetDimsMm(s);
  const sig = modelSig(p);
  const groups: SheetDrawList['groups'] = s.viewports.map((v) => ({
    // `clip: false` deixa o desenho transbordar a caixa (detalhes); ausente = recorta, como no Revit.
    clip: clipOf(v),
    ...cachedViewportParts(p, v, lang, () => partsOfViewport(p, v, lang), sig, true).parts,
  }));
  groups.push({ clip: null, ...furnitureParts(p, s, lang) });
  return { widthMm: d.w, heightMm: d.h, groups };
}

/** Lista de desenho a partir das camadas (para quem precisa das coordenadas de papel: encaixe, Alinhar e Mover). */
export function drawListOfLayers(l: SheetLayers): SheetDrawList {
  const groups: SheetDrawList['groups'] = l.layers.map((ly) => ({ clip: ly.clip, ...shiftedParts(ly.parts, ly.shift) }));
  groups.push({ clip: null, ...l.furniture });
  return { widthMm: l.widthMm, heightMm: l.heightMm, groups };
}

/** Como `drawListOfLayers`, mas os grupos só são montados no primeiro acesso (quem só desenha na tela nunca paga a cópia). */
export function lazyDrawListOfLayers(l: SheetLayers): SheetDrawList {
  let groups: SheetDrawList['groups'] | null = null;
  return {
    widthMm: l.widthMm,
    heightMm: l.heightMm,
    get groups(): SheetDrawList['groups'] {
      groups ??= drawListOfLayers(l).groups;
      return groups;
    },
  };
}

/** Cópia das partes deslocada em mm de papel; com deslocamento zero devolve o próprio objeto. */
export function shiftedParts(parts: ViewportParts, shift: SheetPoint): ViewportParts {
  if (shift.x === 0 && shift.y === 0) return parts;
  const mv = (q: SheetPoint): SheetPoint => ({ x: q.x + shift.x, y: q.y + shift.y });
  return {
    fills: parts.fills.map((f) => ({ ...f, polygons: f.polygons.map((poly) => poly.map((ring) => ring.map(mv))) })),
    paths: parts.paths.map((s) => ({ ...s, pts: s.pts.map(mv) })),
    texts: parts.texts.map((t) => ({ ...t, at: mv(t.at) })),
  };
}
