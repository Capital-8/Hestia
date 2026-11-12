import { floorViewId, levelRoomSeparators, planAnnotationIds, projectGrids, viewAnnotationsOf, type AreaPlan, type Id, type Project } from '@hestia/model';

/**
 * Parte da seleção que a geometria do nível usa: as cotas do nível (decisão 0019), as linhas e regiões de detalhe, as
 * grades de eixos e as marcas de corte e elevação selecionadas mudam de cor (e espessura) com a seleção. A geometria
 * depende só desse subconjunto; o resto é da sobreposição. As linhas e regiões de detalhe ficam aqui porque o desenho
 * delas (com o realce 1,7--) é feito por `notes.ts` na geometria -- sem elas, a seleção não chegava ao desenho (achado A2).
 */
export function planGeometrySelection(p: Project, levelId: Id, selection: readonly Id[], areaPlan?: Pick<AreaPlan, 'annotations'>, viewId?: Id): Id[] {
  if (selection.length === 0) return [];
  // A planta de piso desenha as anotações da vista de piso; a planta de área, só as que ela POSSUI (`viewId`): nada é lido
  // da planta de piso para a área.
  const doNivel = areaPlan ? { dimensions: [], detailLines: [], detailRegions: [] } : viewAnnotationsOf(p, floorViewId(levelId));
  const proprias = (): Id[] => {
    if (viewId === undefined) return areaPlan ? planAnnotationIds(areaPlan) : [];
    const a = viewAnnotationsOf(p, viewId);
    return [...a.dimensions.map((x) => x.id), ...a.texts.map((x) => x.id), ...a.detailLines.map((x) => x.id), ...a.detailRegions.map((x) => x.id), ...a.tags.map((x) => x.id)];
  };
  const used = new Set<Id>([
    ...doNivel.dimensions.map((d) => d.id),
    ...levelRoomSeparators(p, levelId).map((r) => r.id),
    ...p.views.map((v) => v.id),
    ...projectGrids(p).map((g) => g.id),
    ...doNivel.detailLines.map((l) => l.id),
    ...doNivel.detailRegions.map((r) => r.id),
    // Anotações da planta de área (cotas, textos, detalhes e etiquetas da vista): a seleção chega ao desenho por aqui.
    ...(areaPlan ? proprias() : []),
  ]);
  return selection.filter((id) => used.has(id));
}
