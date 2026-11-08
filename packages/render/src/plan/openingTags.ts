import { levelFrames, pointAt } from '@hestia/engine';
import { openingTypeById, type Id, type Project } from '@hestia/model';
import { aberturasDaParede } from './resolucao.ts';
import type { LabelOp } from './types.ts';
import type { PlanPaint } from './style.ts';

/** Medidas da etiqueta em mm de papel, como as etiquetas de parede (anotação, decisão 0019). */
const TAG_TEXT_MM = 1.6;
/** Afastamento (m) da face da parede para o lado da etiqueta. */
const TAG_GAP = 0.12;

/**
 * Etiqueta com o código do tipo em cada porta e janela do nível (Revit: Tag on Placement). Portas recebem a etiqueta
 * do lado OPOSTO ao da abertura (fora do arco); janelas de fachada, do lado externo da parede. Sem código no tipo,
 * usa o nome. Só devolve rótulos com `settings.showOpeningTags` ligado; a fonte segue a categoria 'anotação'.
 */
export function openingTagLabels(p: Project, levelId: Id, paint: PlanPaint, scale: number, hidden?: ReadonlySet<Id>): LabelOp[] {
  const out: LabelOp[] = [];
  if (!paint.visible || p.settings.showOpeningTags !== true) return out;
  for (const f of levelFrames(p, levelId)) {
    for (const o of aberturasDaParede(p, f.wall.id)) {
      if (hidden?.has(o.id)) continue;
      const type = openingTypeById(p, o.typeId);
      if (!type) continue;
      const text = type.code?.trim() || type.name;
      if (!text) continue;
      const s = type.kind === 'window'
        ? f.sExt + f.sign * TAG_GAP
        : f.sMid - (o.flipFacing ? -1 : 1) * (f.thickness / 2 + TAG_GAP);
      out.push({ at: pointAt(f, o.offset, s), text, papel: { escala: scale, fontMm: TAG_TEXT_MM } });
    }
  }
  return out;
}
