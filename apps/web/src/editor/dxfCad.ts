import { isCad, type CadDrawing, type DxfLayerStyle, type Id, type Project } from '@hestia/model';
import type { DxfNoteText, DxfPoint } from '@hestia/io';
import { ROOM_TEXT_HEIGHT_M } from './dxfConstantes.ts';

/**
 * Nome de camada do CAD importado no DXF: `CAD_<DESENHO>_<CAMADA>`, em maiúsculas, sem acento, símbolos viram `_` e no
 * máximo 60 caracteres. O nome do desenho e o da camada ficam separados por `_`.
 */
export function cadDxfLayerName(drawing: string, layer: string): string {
  return `CAD_${cadLayerSafe(drawing) || 'DESENHO'}_${cadLayerSafe(layer) || '0'}`.slice(0, 60);
}

/** Texto para nome de camada do CAD: sem acentos, maiúsculas, fora de `A-Z0-9_` vira `_`. */
function cadLayerSafe(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Desenhos CAD do nível, visíveis, na ordem de desenho. */
function cadDrawingsOf(p: Project, levelId: Id): CadDrawing[] {
  return Object.values(p.elements)
    .filter((e): e is CadDrawing => isCad(e) && e.levelId === levelId && e.visible !== false)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Cor ACI da camada do desenho; ausente = a da entidade (ou a padrão, 7). */
const cadLayerColorOf = (d: CadDrawing, layer: string): number | undefined => d.layers.find((l) => l.name === layer)?.color;

/** O CAD importado em geometria de DXF: trechos de reta, textos e o estilo de cada camada `CAD_*`. */
export interface CadDxf {
  lines: Array<{ a: DxfPoint; b: DxfPoint; layer: string }>;
  texts: DxfNoteText[];
  styles: Record<string, DxfLayerStyle>;
}

/**
 * CAD importado do nível para o DXF (fase 5): cada traço vira LINE por trecho (fechado: o último trecho volta ao início) e
 * cada texto vira TEXT, todos na camada `CAD_<DESENHO>_<CAMADA>`, com a cor ACI original (a da entidade, quando ela tem,
 * senão a da camada; ausente = 7), linha contínua e espessura 0. Categoria `generic` oculta = nada sai.
 */
export function cadDxfOf(p: Project, levelId: Id, visible: boolean): CadDxf {
  const out: CadDxf = { lines: [], texts: [], styles: {} };
  if (!visible) return out;
  const styleOfLayer = (layer: string, aci: number | undefined): void => {
    out.styles[layer] ??= { color: aci ?? 7, linetype: 'CONTINUOUS', lineWeight: 0 };
  };
  for (const d of cadDrawingsOf(p, levelId)) {
    for (const path of d.paths) {
      if (path.pts.length < 2) continue;
      const layer = cadDxfLayerName(d.name, path.layer);
      styleOfLayer(layer, path.color ?? cadLayerColorOf(d, path.layer));
      const pts = path.closed ? [...path.pts, path.pts[0]!] : path.pts;
      for (let i = 1; i < pts.length; i++) out.lines.push({ a: pts[i - 1]!, b: pts[i]!, layer });
    }
    for (const t of d.texts) {
      if (t.text === '') continue;
      const layer = cadDxfLayerName(d.name, t.layer);
      styleOfLayer(layer, t.color ?? cadLayerColorOf(d, t.layer));
      out.texts.push({ at: t.at, text: t.text, height: t.height > 0 ? t.height : ROOM_TEXT_HEIGHT_M, rotation: t.rotation, layer });
    }
  }
  return out;
}

