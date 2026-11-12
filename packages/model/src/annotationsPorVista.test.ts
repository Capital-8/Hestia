import { describe, expect, it } from 'vitest';
import { ProjectStore, projetoComCoberturaDeTeste, annotationIdsIn, annotationMoveCommands, floorViewId, legacyRoofViewId as roofViewId, viewAnnotationsOf, type Dimension, type TextNote } from './index.ts';

const LV0 = 'lv_0';
const dim = (id: string): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, mode: 'aligned' });
const texto = (id: string): TextNote => ({ id, at: { x: 1, y: 1 }, text: id, height: 2.5, rotation: 0 });

/** Uma cota e um texto no piso e outros na cobertura. */
function montar(): ProjectStore {
  const s = new ProjectStore(projetoComCoberturaDeTeste());
  s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('dp') });
  s.exec({ type: 'addText', levelId: LV0, text: texto('tp') });
  s.exec({ type: 'addDimension', levelId: LV0, viewId: roofViewId(LV0), dimension: dim('dc') });
  s.exec({ type: 'addText', levelId: LV0, viewId: roofViewId(LV0), text: texto('tc') });
  return s;
}

describe('annotationIdsIn com viewId', () => {
  it('sem viewId: só as do piso; com viewId: só as da vista pedida', () => {
    const s = montar();
    const todos = ['dp', 'tp', 'dc', 'tc', 'zz'];
    expect(annotationIdsIn(s.project, LV0, todos)).toEqual(['dp', 'tp']);
    expect(annotationIdsIn(s.project, LV0, todos, floorViewId(LV0))).toEqual(['dp', 'tp']);
    expect(annotationIdsIn(s.project, LV0, todos, roofViewId(LV0))).toEqual(['dc', 'tc']);
  });
});

describe('annotationMoveCommands com viewId', () => {
  it('sem viewId a forma antiga continua: comandos sem vista, só sobre o piso', () => {
    const s = montar();
    const cmds = annotationMoveCommands(s.project, LV0, ['dp', 'dc'], { x: 1, y: 0 }, false);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'updateDimension', levelId: LV0, id: 'dp' });
    expect('viewId' in cmds[0]!).toBe(false);
  });

  it('com a vista de piso os comandos continuam sem viewId', () => {
    const s = montar();
    const cmds = annotationMoveCommands(s.project, LV0, ['dp', 'tp'], { x: 1, y: 0 }, false, floorViewId(LV0));
    expect(cmds.map((c) => c.type)).toEqual(['updateDimension', 'updateText']);
    expect(cmds.every((c) => !('viewId' in c))).toBe(true);
  });

  it('Mover na cobertura: os comandos levam o viewId e só a cobertura muda', () => {
    const s = montar();
    const cmds = annotationMoveCommands(s.project, LV0, ['dp', 'tp', 'dc', 'tc'], { x: 1, y: 2 }, false, roofViewId(LV0));
    expect(cmds.map((c) => ('id' in c ? c.id : ''))).toEqual(['dc', 'tc']);
    expect(cmds.every((c) => 'viewId' in c && c.viewId === roofViewId(LV0))).toBe(true);
    for (const c of cmds) s.exec(c);
    const piso = viewAnnotationsOf(s.project, floorViewId(LV0));
    const cobertura = viewAnnotationsOf(s.project, roofViewId(LV0));
    expect(piso.texts[0]!.at).toEqual({ x: 1, y: 1 });
    expect(cobertura.texts[0]!.at).toEqual({ x: 2, y: 3 });
    expect(cobertura.dimensions[0]!.a).toEqual({ x: 1, y: 2 });
  });

  it('Copiar na cobertura: as cópias nascem na cobertura, com ids novos', () => {
    const s = montar();
    const cmds = annotationMoveCommands(s.project, LV0, ['dc', 'tc'], { x: 1, y: 0 }, true, roofViewId(LV0));
    expect(cmds.map((c) => c.type)).toEqual(['addDimension', 'addText']);
    for (const c of cmds) s.exec(c);
    expect(viewAnnotationsOf(s.project, roofViewId(LV0)).dimensions).toHaveLength(2);
    expect(viewAnnotationsOf(s.project, roofViewId(LV0)).texts).toHaveLength(2);
    expect(viewAnnotationsOf(s.project, floorViewId(LV0)).dimensions).toHaveLength(1);
    expect(viewAnnotationsOf(s.project, floorViewId(LV0)).texts).toHaveLength(1);
  });
});
