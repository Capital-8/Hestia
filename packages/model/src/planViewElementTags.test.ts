import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  ProjectStore,
  projetoComCoberturaDeTeste,
  floorViewId,
  makeWall,
  legacyRoofViewId as roofViewId,
  viewAnnotationsOf,
  type AreaPlan,
  type ElementTag,
} from './index.ts';

/**
 * Etapa 2a-1, item 6: apagar ou dividir um elemento percorre as anotações de TODAS as vistas do nível (piso, cobertura,
 * planta de área e as cópias), não só as do nível.
 */
const LV0 = 'lv_0';
const AP = 'ap_t';
const tag = (id: string, hostId: string): ElementTag => ({ id, hostId, at: { x: 1, y: 1 }, property: 'type' });
const area: AreaPlan = { id: AP, name: 'Área', levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } }, tags: [] };
const VISTAS = [floorViewId(LV0), roofViewId(LV0), AP];

/** Duas paredes e, em cada uma das três vistas, uma etiqueta da parede `wa` e outra da parede `wb`. */
function montar(): ProjectStore {
  const s = new ProjectStore(projetoComCoberturaDeTeste());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'wa', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'wb', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 3 }, b: { x: 6, y: 3 } }) });
  s.exec({ type: 'addAreaPlan', plan: area });
  for (const viewId of VISTAS) {
    s.exec({ type: 'addTag', levelId: LV0, viewId, item: tag(`ta_${viewId}`, 'wa') });
    s.exec({ type: 'addTag', levelId: LV0, viewId, item: tag(`tb_${viewId}`, 'wb') });
  }
  return s;
}

const hosts = (s: ProjectStore, viewId: string): string[] => viewAnnotationsOf(s.project, viewId).tags.map((t) => t.hostId);

describe('apagar e dividir elemento percorre as anotações de todas as vistas', () => {
  it('montagem: cada vista tem as duas etiquetas, nenhuma compartilhada', () => {
    const s = montar();
    for (const v of VISTAS) expect(hosts(s, v)).toEqual(['wa', 'wb']);
  });

  it('deleteElements remove as etiquetas do elemento apagado em piso, cobertura e planta de área', () => {
    const s = montar();
    s.exec({ type: 'deleteElements', ids: ['wa'] });
    for (const v of VISTAS) expect(hosts(s, v), v).toEqual(['wb']);
  });

  it('deleteElements de um elemento sem etiqueta não toca nas anotações (mesma referência)', () => {
    const s = montar();
    const antes = VISTAS.map((v) => viewAnnotationsOf(s.project, v));
    s.exec({ type: 'addWall', wall: makeWall({ id: 'wc', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 6 }, b: { x: 6, y: 6 } }) });
    s.exec({ type: 'deleteElements', ids: ['wc'] });
    VISTAS.forEach((v, i) => expect(viewAnnotationsOf(s.project, v)).toBe(antes[i]));
  });

  it('splitWall limpa as etiquetas órfãs (host que deixou de existir) em todas as vistas e mantém as válidas', () => {
    // Etiqueta órfã numa vista de cada tipo, como num arquivo antigo (o comando recusa criar uma): a divisão limpa todas.
    const p = structuredClone(montar().project);
    for (const v of p.planViews) if (VISTAS.includes(v.id)) v.annotations.tags.push(tag(`to_${v.id}`, 'fantasma'));
    const s = new ProjectStore(p);
    for (const v of VISTAS) expect(hosts(s, v)).toContain('fantasma');
    s.exec({ type: 'splitWall', id: 'wb', newId: 'wb2', t: 2 });
    for (const v of VISTAS) expect(hosts(s, v), v).toEqual(['wa', 'wb']);
  });
});
