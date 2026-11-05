import { sheetDimsMm, sheetOf, viewportClipped, type Id, type Project, type SheetViewport } from '@hestia/model';
import { furnitureParts } from './frame.ts';
import { areaTablePartsOf, areaPlanPartsOf, planPartsOf, sectionPartsOf } from './viewports.ts';
import { vista3dParts } from './vista3d.ts';
import { type SheetDrawList, type ViewportParts } from './types.ts';
import type { Lang } from '../i18n.ts';

function partsOfViewport(p: Project, v: SheetViewport, lang: Lang): ViewportParts {
  switch (v.view.kind) {
    case 'plan':
      return planPartsOf(p, v.view.levelId, v, lang);
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

/**
 * Lista de desenho de uma prancha em mm de papel (decisão 0022): cada vista num grupo recortado à sua caixa e, por
 * último, a moldura, as legendas e o carimbo. Prancha inexistente: null.
 */
export function buildSheetDrawList(p: Project, sheetId: Id, lang: Lang = 'pt'): SheetDrawList | null {
  const s = sheetOf(p, sheetId);
  if (!s) return null;
  const d = sheetDimsMm(s);
  const groups: SheetDrawList['groups'] = s.viewports.map((v) => ({
    // `clip: false` deixa o desenho transbordar a caixa (detalhes); ausente = recorta, como no Revit.
    clip: viewportClipped(v) ? { x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h } : null,
    ...partsOfViewport(p, v, lang),
  }));
  groups.push({ clip: null, ...furnitureParts(p, s, lang) });
  return { widthMm: d.w, heightMm: d.h, groups };
}
