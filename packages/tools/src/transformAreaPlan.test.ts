import { describe, expect, it } from 'vitest';
import { annotationIdsIn, annotationIdsInView, annotationMoveCommands, DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, planAnnotationsOf, areaPlanOf, type AreaPlan } from '@hestia/model';
import { clickAt, drawWall, makeEnv, tool, walls } from './testEnv.ts';

/*
 * Gap de Mover/Copiar com anotações de planta de área (decisão 0060 §5): caracterizado na fase 1B ("hoje: ..."), FECHADO
 * na etapa 2.3A. Cenário: uma parede de (0,0) a (4,0) no nível lv_0; cota do nível dN (y = -2); na planta de área ap1
 * (do mesmo nível), a cota dA (0,0)-(4,0) e o texto tA. Antes, `annotationIdsIn` e `annotationMoveCommands` só liam as
 * anotações do nível, e a cota e o texto da planta de área ficavam fora do conjunto movível. Agora, com o `planId` ativo
 * (a ferramenta passa `viewPlanId(env)`), eles entram no Mover e no Copiar e voltam NA PRÓPRIA planta. Os quatro testes
 * foram invertidos (nome e asserção): é a única alteração de teste da fase 1 permitida nesta etapa.
 */

const planaArea: AreaPlan = {
  id: 'ap1',
  name: 'Planta de área',
  levelId: 'lv_0',
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
  tags: [],
};

function cenario() {
  const ctx = makeEnv();
  drawWall(ctx.env, [0, 0], [4, 0]);
  const s = ctx.store;
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dN', a: { x: 0, y: -2 }, b: { x: 4, y: -2 }, offset: 0.5 } });
  s.exec({ type: 'addAreaPlan', plan: planaArea });
  s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'ap1', dimension: { id: 'dA', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1.5 } });
  s.exec({ type: 'addText', levelId: 'lv_0', planId: 'ap1', text: { id: 'tA', at: { x: 2, y: 4 }, text: 'NOTA DA AREA', height: 3, rotation: 0 } });
  ctx.setAreaPlanId('ap1');
  return ctx;
}

describe('Mover/Copiar com anotações de planta de área (gap fechado na 2.3A)', () => {
  it('com planId: cota e texto da planta de área ENTRAM no conjunto movível; sem planId continua só o nível', () => {
    const ctx = cenario();
    const p = ctx.store.project;
    expect(annotationIdsIn(p, 'lv_0', ['dA', 'tA', 'dN'])).toEqual(['dN']); // sem planId: o contrato de sempre (planta padrão)
    expect(annotationIdsIn(p, 'lv_0', ['dA', 'tA', 'dN'], 'ap1')).toEqual(['dA', 'tA', 'dN']);
    expect(annotationMoveCommands(p, 'lv_0', ['dA', 'tA'], { x: 1, y: 0 }, false)).toEqual([]);
    const mover = annotationMoveCommands(p, 'lv_0', ['dA', 'tA'], { x: 1, y: 0 }, false, 'ap1');
    expect(mover).toEqual([
      { type: 'updateDimension', levelId: 'lv_0', planId: 'ap1', id: 'dA', patch: { a: { x: 1, y: 0 }, b: { x: 5, y: 0 }, offset: 1.5, id: 'dA', refs: undefined } },
      { type: 'updateText', levelId: 'lv_0', planId: 'ap1', id: 'tA', patch: { at: { x: 3, y: 4 }, leader: undefined } },
    ]);
    const copiar = annotationMoveCommands(p, 'lv_0', ['dA', 'tA'], { x: 1, y: 0 }, true, 'ap1');
    expect(copiar.map((c) => [c.type, 'planId' in c ? c.planId : null])).toEqual([['addDimension', 'ap1'], ['addText', 'ap1']]);
    // A rota que já existia para a planta de área (annotationIdsInView com planId) enxerga as três.
    expect(annotationIdsInView(p, 'lv_0', 'ap1')).toEqual(expect.arrayContaining(['dN', 'dA', 'tA']));
  });

  it('Mover com só cota e texto da planta de área selecionados move os dois NA planta (o nível fica intacto)', () => {
    const ctx = cenario();
    ctx.env.setSelection(['dA', 'tA']);
    const m = tool('move', ctx.env);
    clickAt(m, 0, 0);
    clickAt(m, 0, 1); // deslocamento (0, 1)
    const p = ctx.store.project;
    expect(planAnnotationsOf(areaPlanOf(p, 'ap1')!).dimensions[0]).toMatchObject({ id: 'dA', a: { x: 0, y: 1 }, b: { x: 4, y: 1 } });
    expect(planAnnotationsOf(areaPlanOf(p, 'ap1')!).texts[0]).toMatchObject({ id: 'tA', at: { x: 2, y: 5 } });
    expect(p.levels.find((l) => l.id === 'lv_0')!.dimensions![0]).toMatchObject({ id: 'dN', a: { x: 0, y: -2 }, b: { x: 4, y: -2 } });
  });

  it('Mover com parede, cota do nível e cota/texto da área move os quatro, cada anotação no seu dono', () => {
    const ctx = cenario();
    const w0 = walls(ctx.store)[0]!;
    ctx.env.setSelection([w0.id, 'dA', 'tA', 'dN']);
    const m = tool('move', ctx.env);
    clickAt(m, 0, 0);
    clickAt(m, 0, 1); // deslocamento (0, 1)
    const p = ctx.store.project;
    expect(walls(ctx.store)[0]).toMatchObject({ a: { x: 0, y: 1 }, b: { x: 4, y: 1 } });
    expect(planAnnotationsOf(areaPlanOf(p, 'ap1')!).dimensions[0]).toMatchObject({ a: { x: 0, y: 1 }, b: { x: 4, y: 1 } });
    expect(planAnnotationsOf(areaPlanOf(p, 'ap1')!).texts[0]).toMatchObject({ at: { x: 2, y: 5 } });
    expect(p.levels.find((l) => l.id === 'lv_0')!.dimensions![0]).toMatchObject({ id: 'dN', a: { x: 0, y: -1 }, b: { x: 4, y: -1 } });
    expect(p.levels.find((l) => l.id === 'lv_0')!.texts ?? []).toHaveLength(0);
  });

  it('Copiar com parede, cota do nível e cota/texto da área copia cada uma NO SEU dono (nada da área vira do nível)', () => {
    const ctx = cenario();
    const w0 = walls(ctx.store)[0]!;
    ctx.env.setSelection([w0.id, 'dA', 'tA', 'dN']);
    const c = tool('copy', ctx.env);
    clickAt(c, 0, 0);
    clickAt(c, 0, 1);
    c.cancel();
    const p = ctx.store.project;
    expect(walls(ctx.store)).toHaveLength(2);
    expect(p.levels.find((l) => l.id === 'lv_0')!.dimensions).toHaveLength(2); // dN + a cópia dela
    expect(p.levels.find((l) => l.id === 'lv_0')!.texts ?? []).toHaveLength(0); // o texto da área não vira texto do nível
    const area = planAnnotationsOf(areaPlanOf(p, 'ap1')!);
    expect(area.dimensions).toHaveLength(2); // dA + a cópia (na própria planta)
    expect(area.texts).toHaveLength(2);
    expect(area.dimensions.find((d) => d.id !== 'dA')).toMatchObject({ a: { x: 0, y: 1 }, b: { x: 4, y: 1 } });
    expect(area.texts.find((t) => t.id !== 'tA')).toMatchObject({ at: { x: 2, y: 5 } });
  });
});
