import { describe, expect, it } from 'vitest';
import {
  annotationTarget,
  applyCommand,
  createEmptyProject,
  DEFAULT_AREA_GRAPHICS,
  floorViewId,
  hiddenTargetOfView,
  makeLevel,
  makeRoom,
  planViewHiddenOf,
  planViewOf,
  ProjectStore,
  roofViewId,
  viewHiddenOf,
  viewRangeOf,
  planViewRangeOf,
  planViewsOf,
  viewAnnotationsOf,
  viewGraphicsOf,
  type AnnotationCommand,
  type AreaPlan,
  type Command,
  type DetailLine,
  type DetailRegion,
  type Dimension,
  type ElementTag,
  type TextNote,
} from './index.ts';
import { areaPlansOf } from './index.ts';

const LV0 = 'lv_0';

const area = (id: string, over: Partial<AreaPlan> = {}): AreaPlan => ({
  id, name: `Área ${id}`, levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } }, tags: [], ...over,
});
const dim = (id: string): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.8 });
const txt = (id: string): TextNote => ({ id, at: { x: 1, y: 1 }, text: 'Sala', height: 2.5, rotation: 0 });
const line = (id: string): DetailLine => ({ id, a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, style: 'dashed' });
const region = (id: string): DetailRegion => ({ id, boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] });
const tag = (id: string): ElementTag => ({ id, hostId: 'r1', at: { x: 2, y: 2 }, property: 'name' });

/** lv_0 com uma planta de área SEM conjunto próprio (ap_herda) e outra COM (ap_propria, `annotations` vazio). */
function montar(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: LV0, name: 'Sala', number: '101', point: { x: 2, y: 1.5 } }) });
  s.exec({ type: 'addAreaPlan', plan: area('ap_herda') });
  s.exec({ type: 'addAreaPlan', plan: area('ap_propria', { annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] } }) });
  return s;
}

const snap = (s: ProjectStore) => JSON.parse(JSON.stringify(s.project));

describe('comandos de anotação por viewId = forma antiga', () => {
  const casos: Array<{ nome: string; viewId: string; antigo: { levelId: string; planId?: string } }> = [
    { nome: 'piso', viewId: floorViewId(LV0), antigo: { levelId: LV0 } },
    { nome: 'área com conjunto próprio', viewId: 'ap_propria', antigo: { levelId: LV0, planId: 'ap_propria' } },
    { nome: 'área sem conjunto próprio', viewId: 'ap_herda', antigo: { levelId: LV0, planId: 'ap_herda' } },
  ];
  const sequencia = (t: { levelId: string; planId?: string; viewId?: string }): AnnotationCommand[] => [
    { type: 'addDimension', ...t, dimension: dim('d1') },
    { type: 'addDimension', ...t, dimension: dim('d2') },
    { type: 'updateDimension', ...t, id: 'd1', patch: { offset: 1.5 } },
    { type: 'removeDimension', ...t, id: 'd2' },
    { type: 'addText', ...t, text: txt('t1') },
    { type: 'updateText', ...t, id: 't1', patch: { text: 'Cozinha' } },
    { type: 'addDetailLine', ...t, item: line('l1') },
    { type: 'updateDetailLine', ...t, id: 'l1', patch: { style: 'solid' } },
    { type: 'addDetailRegion', ...t, item: region('r1') },
    { type: 'updateDetailRegion', ...t, id: 'r1', patch: { boundary: region('z').boundary.slice(0, 3) } },
    { type: 'addTag', ...t, item: tag('g1') },
    { type: 'updateTag', ...t, id: 'g1', patch: { at: { x: 5, y: 5 } } },
    { type: 'removeText', ...t, id: 't1' },
    { type: 'removeDetailLine', ...t, id: 'l1' },
    { type: 'removeDetailRegion', ...t, id: 'r1' },
    { type: 'removeTag', ...t, id: 'g1' },
  ];

  for (const c of casos) {
    it(`${c.nome}: o projeto resultante é idêntico a cada passo`, () => {
      const novo = montar();
      const antigo = montar();
      const porViewId = sequencia({ levelId: LV0, viewId: c.viewId });
      const porLegado = sequencia(c.antigo);
      porViewId.forEach((cmd, i) => {
        novo.exec(cmd);
        antigo.exec(porLegado[i]!);
        expect(snap(novo), `passo ${i} (${cmd.type})`).toEqual(snap(antigo));
      });
    });

    it(`${c.nome}: annotationTarget monta a forma antiga equivalente`, () => {
      expect(annotationTarget(montar().project, c.viewId)).toEqual(c.antigo);
    });
  }

  it('viewId prevalece sobre planId, mas recusa nível diferente e vista inexistente sem alterar o projeto', () => {
    const s = montar();
    const antes = snap(s);
    s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap_herda', viewId: 'ap_propria', dimension: dim('d1') });
    expect(areaPlansOf(s.project).find((a) => a.id === 'ap_propria')!.annotations!.dimensions.map((d) => d.id)).toEqual(['d1']);
    // Esquema 24: não há herança; a planta que nasceu sem `annotations` tem o conjunto próprio (aqui vazio, o nível não tinha nada).
    expect(areaPlansOf(s.project).find((a) => a.id === 'ap_herda')!.annotations!.dimensions).toEqual([]);
    s.undo();
    expect(snap(s)).toEqual(antes);

    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Térreo 2', elevation: 3 }) });
    const depois = snap(s);
    expect(() => s.exec({ type: 'addDimension', levelId: 'lv_1', viewId: 'ap_propria', dimension: dim('d9') })).toThrow();
    expect(() => s.exec({ type: 'addDimension', levelId: LV0, viewId: 'nao_existe', dimension: dim('d9') })).toThrow();
    expect(snap(s)).toEqual(depois);
  });

  it('um lote que cria o nível e anota por viewId no mesmo rascunho funciona', () => {
    const s = montar();
    s.exec({ type: 'batch', commands: [
      { type: 'upsertLevel', level: makeLevel({ id: 'lv_9', name: 'Novo', elevation: 9 }) },
      { type: 'addDimension', levelId: 'lv_9', viewId: floorViewId('lv_9'), dimension: dim('d1') },
    ] });
    expect(viewAnnotationsOf(s.project, floorViewId('lv_9')).dimensions.map((d) => d.id)).toEqual(['d1']);
  });

  it('com viewId de cobertura a anotação fica na cobertura e não aparece no piso (a forma antiga grava no piso)', () => {
    const s = montar();
    s.exec({ type: 'addDimension', levelId: LV0, viewId: roofViewId(LV0), dimension: dim('dr') });
    expect(viewAnnotationsOf(s.project, roofViewId(LV0)).dimensions.map((d) => d.id)).toEqual(['dr']);
    expect(viewAnnotationsOf(s.project, floorViewId(LV0)).dimensions).toEqual([]);
    s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('df') });
    expect(viewAnnotationsOf(s.project, floorViewId(LV0)).dimensions.map((d) => d.id)).toEqual(['df']);
    s.exec({ type: 'removeDimension', levelId: LV0, viewId: roofViewId(LV0), id: 'dr' });
    expect(viewAnnotationsOf(s.project, roofViewId(LV0)).dimensions).toEqual([]);
  });
});

describe('updatePlanView = comando antigo equivalente', () => {
  const igual = (viewId: string, patch: Parameters<typeof upd>[1], antigo: Command[]): void => {
    const a = montar();
    const b = montar();
    const inicial = snap(a);
    a.exec(upd(viewId, patch));
    for (const c of antigo) b.exec(c);
    expect(snap(a)).toEqual(snap(b));
    expect(snap(a)).not.toEqual(inicial);
    a.undo();
    expect(snap(a)).toEqual(inicial);
    a.redo();
    expect(snap(a)).toEqual(snap(b));
  };
  const upd = (viewId: string, patch: Extract<Command, { type: 'updatePlanView' }>['patch']): Command => ({ type: 'updatePlanView', viewId, patch });

  const range = (s: ProjectStore, id: string) => planViewRangeOf(s.project, id);
  const escala = (s: ProjectStore, id: string): number => viewGraphicsOf(s.project, id).scale;

  it('piso: hidden = setViewHidden; reset de graphics só na vista', () => {
    igual(floorViewId(LV0), { hidden: { elements: ['e1'], categories: ['door'] } }, [{ type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId(LV0) }, hidden: { elements: ['e1'], categories: ['door'] } }]);
    const s = montar();
    s.exec(upd(floorViewId(LV0), { graphics: { scale: 50 } }));
    s.exec(upd(floorViewId(LV0), { graphics: null }));
    expect(escala(s, floorViewId(LV0))).toBe(escala(montar(), floorViewId(LV0)));
  });

  it('updatePlanView altera SÓ a vista pedida; os comandos antigos por nível propagam à cobertura (gráficos) e à área', () => {
    const base = montar();
    const padrao = range(base, floorViewId(LV0));
    // updatePlanView: só o piso.
    const s = montar();
    s.exec(upd(floorViewId(LV0), { viewRange: { cut: 1.0 }, graphics: { scale: 25 } }));
    expect(range(s, floorViewId(LV0)).cut).toBe(1.0);
    expect(escala(s, floorViewId(LV0))).toBe(25);
    for (const id of [roofViewId(LV0), 'ap_herda', 'ap_propria']) {
      expect(range(s, id), id).toEqual(padrao);
      expect(escala(s, id), id).toBe(escala(base, id));
    }
    // comandos antigos: piso e áreas recebem o intervalo (a cobertura não o usa e fica no padrão); os gráficos vão a todas.
    const t = montar();
    t.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { cut: 1.0 } });
    t.exec({ type: 'setLevelGraphics', levelId: LV0, patch: { scale: 25 } });
    for (const id of [floorViewId(LV0), 'ap_herda', 'ap_propria']) expect(range(t, id).cut, id).toBe(1.0);
    expect(range(t, roofViewId(LV0))).toEqual(padrao);
    for (const id of [floorViewId(LV0), roofViewId(LV0), 'ap_herda', 'ap_propria']) expect(escala(t, id), id).toBe(25);
    // O outro nível não muda.
    expect(range(t, floorViewId('lv_1'))).toEqual(padrao);
    t.exec({ type: 'resetLevelGraphics', levelId: LV0 });
    for (const id of [floorViewId(LV0), roofViewId(LV0), 'ap_herda']) expect(escala(t, id), id).toBe(escala(base, id));
  });

  it('piso: nome da vista principal = nome do nível', () => {
    igual(floorViewId(LV0), { hidden: { categories: ['wall'] } }, [{ type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId(LV0) }, hidden: { categories: ['wall'] } }]);
    const s = montar();
    s.exec(upd(floorViewId(LV0), { name: 'Pavimento Térreo' }));
    expect(s.project.levels[0]!.name).toBe('Pavimento Térreo');
    expect(planViewOf(s.project, floorViewId(LV0))!.name).toBe('Pavimento Térreo');
    // O nome da vista principal é o do nível: a cobertura acompanha.
    expect(planViewOf(s.project, roofViewId(LV0))!.name).toBe('Pavimento Térreo');
  });

  it('cobertura: hidden fica na vista de cobertura; gráficos só nela', () => {
    igual(roofViewId(LV0), { hidden: { elements: ['e1'] } }, [{ type: 'setViewHidden', target: { kind: 'plan', viewId: roofViewId(LV0) }, hidden: { elements: ['e1'] } }]);
    const s = montar();
    s.exec(upd(roofViewId(LV0), { hidden: { elements: ['e1'] }, graphics: { scale: 200 } }));
    expect(planViewHiddenOf(s.project, roofViewId(LV0))).toEqual({ elements: ['e1'] });
    expect(planViewOf(s.project, floorViewId(LV0))!.hidden).toBeUndefined();
    expect(escala(s, roofViewId(LV0))).toBe(200);
    expect(escala(s, floorViewId(LV0))).toBe(escala(montar(), floorViewId(LV0)));
  });

  it('cobertura recusa intervalo de vista e não altera o projeto', () => {
    const s = montar();
    const antes = snap(s);
    expect(() => s.exec(upd(roofViewId(LV0), { viewRange: { cut: 1 } }))).toThrow();
    expect(snap(s)).toEqual(antes);
  });

  it('área: campos comuns e de area = updateAreaPlan; hidden = setViewHidden; intervalo só da vista', () => {
    for (const id of ['ap_propria', 'ap_herda']) {
      igual(id, { name: 'Renomeada' }, [{ type: 'updateAreaPlan', id, patch: { name: 'Renomeada' } }]);
      igual(id, { area: { scale: 100, schemeId: 'sc1' } }, [{ type: 'updateAreaPlan', id, patch: { scale: 100, schemeId: 'sc1' } }]);
      igual(id, { area: { graphics: { showWalls: 'hidden' } } }, [{ type: 'updateAreaPlan', id, patch: { graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'hidden' } } }]);
      igual(id, { hidden: { elements: ['e1'] } }, [{ type: 'setViewHidden', target: { kind: 'plan', viewId: id }, hidden: { elements: ['e1'] } }]);
      // O intervalo é da vista: o piso e a outra planta de área não mudam.
      const s = montar();
      s.exec(upd(id, { viewRange: { cut: 1.1 } }));
      expect(planViewRangeOf(s.project, id).cut).toBe(1.1);
      expect(planViewRangeOf(s.project, floorViewId(LV0)).cut).toBe(1.2);
    }
  });

  it('recusas: campo de área em piso, escala inválida, vista inexistente, nome vazio (projeto intacto)', () => {
    const s = montar();
    const antes = snap(s);
    expect(() => s.exec(upd(floorViewId(LV0), { area: { scale: 10 } }))).toThrow();
    expect(() => s.exec(upd('ap_herda', { viewRange: { cut: 1 }, area: { scale: -1 } }))).toThrow();
    expect(() => s.exec(upd('nao_existe', { name: 'x' }))).toThrow();
    expect(() => s.exec(upd(floorViewId(LV0), { name: '  ' }))).toThrow();
    expect(snap(s)).toEqual(antes);
  });

  it('um lote que cria o nível e altera a vista dele no mesmo rascunho funciona', () => {
    const s = montar();
    s.exec({ type: 'batch', commands: [
      { type: 'upsertLevel', level: makeLevel({ id: 'lv_9', name: 'Novo', elevation: 9 }) },
      upd(floorViewId('lv_9'), { viewRange: { cut: 1.0 } }),
    ] });
    expect(planViewRangeOf(s.project, floorViewId('lv_9')).cut).toBe(1.0);
  });
});

describe('addPlanView e removePlanView', () => {
  it('área: igual a addAreaPlan/removeAreaPlan, com desfazer', () => {
    const a = montar();
    const b = montar();
    const inicial = snap(a);
    a.exec({ type: 'addPlanView', view: { id: 'ap_nova', kind: 'area', levelId: LV0, name: 'Nova', area: { scale: 75, graphics: { showWalls: 'normal' }, schemeId: 's1' }, hidden: { elements: ['e1'] }, annotations: { dimensions: [dim('d1')], texts: [], detailLines: [], detailRegions: [], tags: [] } } });
    b.exec({ type: 'addAreaPlan', plan: area('ap_nova', { name: 'Nova', scale: 75, schemeId: 's1', graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'normal' }, hidden: { elements: ['e1'] }, annotations: { dimensions: [dim('d1')], texts: [], detailLines: [], detailRegions: [], tags: [] } }) });
    expect(snap(a)).toEqual(snap(b));
    a.undo();
    expect(snap(a)).toEqual(inicial);
    a.redo();
    a.exec({ type: 'removePlanView', viewId: 'ap_nova' });
    b.exec({ type: 'removeAreaPlan', id: 'ap_nova' });
    expect(snap(a)).toEqual(snap(b));
    a.undo();
    expect(areaPlansOf(a.project).some((x) => x.id === 'ap_nova')).toBe(true);
  });

  it('aceita qualquer kind; a vista nasce com cópia do intervalo e dos gráficos do piso; remover principal/inexistente é recusado', () => {
    const s = montar();
    s.exec({ type: 'setLevelGraphics', levelId: LV0, patch: { scale: 25 } });
    for (const kind of ['floor', 'roof', 'ceiling'] as const) {
      s.exec({ type: 'addPlanView', view: { id: `v_${kind}`, kind, levelId: LV0, name: `V ${kind}` } });
      expect(planViewOf(s.project, `v_${kind}`)).toMatchObject({ kind, levelId: LV0, name: `V ${kind}` });
      expect(viewGraphicsOf(s.project, `v_${kind}`).scale).toBe(25);
      expect(planViewRangeOf(s.project, `v_${kind}`)).toEqual(planViewRangeOf(s.project, floorViewId(LV0)));
    }
    s.exec({ type: 'removePlanView', viewId: 'v_floor' });
    expect(planViewOf(s.project, 'v_floor')).toBeUndefined();
    const antes = snap(s);
    expect(() => s.exec({ type: 'addPlanView', view: { id: 'v_roof', kind: 'floor', levelId: LV0, name: 'repetida' } })).toThrow();
    expect(() => s.exec({ type: 'addPlanView', view: { id: 'vx', kind: 'floor', levelId: 'lv_fantasma', name: 'X' } })).toThrow();
    expect(() => s.exec({ type: 'removePlanView', viewId: floorViewId(LV0) })).toThrow('principal');
    expect(() => s.exec({ type: 'removePlanView', viewId: roofViewId(LV0) })).toThrow('principal');
    expect(() => s.exec({ type: 'removePlanView', viewId: 'nao_existe' })).toThrow();
    expect(snap(s)).toEqual(antes);
  });

  it('criar nível cria pv_/pvr_; remover nível remove todas as vistas dele (e as dos outros ficam)', () => {
    const s = montar();
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_9', name: 'Novo', elevation: 9 }) });
    s.exec({ type: 'addAreaPlan', plan: area('ap9', { levelId: 'lv_9' }) });
    expect(planViewsOf(s.project).map((v) => v.id)).toEqual([floorViewId(LV0), roofViewId(LV0), floorViewId('lv_1'), roofViewId('lv_1'), floorViewId('lv_9'), roofViewId('lv_9'), 'ap_herda', 'ap_propria', 'ap9']);
    s.exec({ type: 'deleteLevel', id: 'lv_9' });
    expect(planViewsOf(s.project).map((v) => v.id)).toEqual([floorViewId(LV0), roofViewId(LV0), floorViewId('lv_1'), roofViewId('lv_1'), 'ap_herda', 'ap_propria']);
    s.undo();
    expect(planViewsOf(s.project).some((v) => v.levelId === 'lv_9')).toBe(true);
  });

  it('renomear o nível por upsertLevel acompanha o nome das vistas principais e a elevação reordena sem perder dados', () => {
    const s = montar();
    s.exec({ type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId(LV0) }, hidden: { elements: ['e1'] } });
    s.exec({ type: 'upsertLevel', level: { ...s.project.levels[0]!, name: 'Embaixo', elevation: 20 } });
    expect(planViewOf(s.project, floorViewId(LV0))!.name).toBe('Embaixo');
    expect(planViewOf(s.project, roofViewId(LV0))!.name).toBe('Embaixo');
    expect(planViewHiddenOf(s.project, floorViewId(LV0))).toEqual({ elements: ['e1'] });
    expect(planViewsOf(s.project).slice(0, 4).map((v) => v.id)).toEqual([floorViewId('lv_1'), roofViewId('lv_1'), floorViewId(LV0), roofViewId(LV0)]);
  });
});

describe('hiddenTargetOfView e annotationTarget', () => {
  it('converte os três tipos e recusa id inexistente', () => {
    const p = montar().project;
    expect(hiddenTargetOfView(p, floorViewId(LV0))).toEqual({ kind: 'plan', viewId: floorViewId(LV0) });
    expect(hiddenTargetOfView(p, roofViewId(LV0))).toEqual({ kind: 'plan', viewId: roofViewId(LV0) });
    expect(hiddenTargetOfView(p, 'ap_herda')).toEqual({ kind: 'plan', viewId: 'ap_herda' });
    expect(() => hiddenTargetOfView(p, 'nao_existe')).toThrow();
    expect(() => hiddenTargetOfView(p, floorViewId('lv_fantasma'))).toThrow();
    expect(annotationTarget(p, floorViewId(LV0))).toEqual({ levelId: LV0 });
    expect(annotationTarget(p, roofViewId(LV0))).toEqual({ levelId: LV0 });
    expect(annotationTarget(p, 'ap_propria')).toEqual({ levelId: LV0, planId: 'ap_propria' });
    expect(() => annotationTarget(p, 'nao_existe')).toThrow();
  });

  it('o alvo montado funciona com setViewHidden e lê o mesmo que planViewHiddenOf', () => {
    const s = montar();
    for (const id of [floorViewId(LV0), roofViewId(LV0), 'ap_herda']) {
      s.exec({ type: 'setViewHidden', target: hiddenTargetOfView(s.project, id), hidden: { elements: [`e_${id}`] } });
      expect(planViewHiddenOf(s.project, id)).toEqual({ elements: [`e_${id}`] });
      expect(viewHiddenOf(s.project, hiddenTargetOfView(s.project, id))).toEqual({ elements: [`e_${id}`] });
    }
  });
});

describe('leituras antigas por cima da API', () => {
  it('viewRangeOf(p, levelId) dá o do piso e o padrão para nível inexistente', () => {
    const s = montar();
    s.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { cut: 1.0 } });
    expect(viewRangeOf(s.project, LV0)).toEqual(planViewRangeOf(s.project, floorViewId(LV0)));
    expect(viewRangeOf(s.project, 'lv_fantasma')).toEqual(planViewRangeOf(s.project, 'nao_existe'));
  });

  it('applyCommand sobre rascunho rejeita comando fora da família (retorna sem efeito para tipos conhecidos)', () => {
    const p = montar().project;
    expect(() => applyCommand(structuredClone(p), { type: 'removePlanView', viewId: 'nao_existe' })).toThrow();
  });
});
