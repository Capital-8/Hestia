import { describe, expect, it } from 'vitest';
import {
  beamLength,
  beamMidPoint,
  beamPolygon,
  columnsOnLevel,
  beamsOnLevel,
  findBeamType,
  footingsOnLevel,
  makeLevel,
  makeWall,
} from '@hestia/model';
import {
  ColumnTool,
  BeamTool,
  FootingTool,
  placeFootingsAtColumns,
  createTool,
  TOOL_GROUPS,
  TOOL_LABEL,
  PERFIL_REVIT,
  PERFIL_SIMPLES,
  componentSnapIndex,
} from './index.ts';
import { gripHoldAt } from './selectGrips.ts';
import { makeEnv, P, clickAt, tool } from './testEnv.ts';

describe('ColumnTool (criação de pilares)', () => {
  it('cria pilar por clique e visualiza prévia', () => {
    const { env, store } = makeEnv();
    const colTool = tool('column', env) as ColumnTool;
    colTool.move(P(2, 3));
    expect(colTool.preview().some((i) => i.kind === 'polygon')).toBe(true);
    clickAt(colTool, 2, 3);
    const cols = columnsOnLevel(store.project, 'lv_0');
    expect(cols).toHaveLength(1);
    expect(cols[0]!.at).toEqual({ x: 2, y: 3 });
    expect(cols[0]!.rotation).toBe(0);
  });

  it('rotaciona pilar com tecla Espaço e atalho onKey', () => {
    const { env, store } = makeEnv();
    const colTool = tool('column', env) as ColumnTool;
    colTool.move(P(1, 1));
    colTool.space();
    clickAt(colTool, 1, 1);
    colTool.onKey(' ');
    clickAt(colTool, 2, 2);
    const cols = columnsOnLevel(store.project, 'lv_0');
    expect(cols).toHaveLength(2);
    expect(cols[0]!.rotation).toBeCloseTo(Math.PI / 2);
    expect(cols[1]!.rotation).toBeCloseTo(Math.PI);
  });

  it('calcula vão de altura conectando ao nível de topo', () => {
    const { env, store, options } = makeEnv();
    store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Nível 1', elevation: 3.0 }) });
    const colTool = tool('column', env) as ColumnTool;
    options.columnDepthMode = 'height';
    clickAt(colTool, 0, 0);
    const cols = columnsOnLevel(store.project, 'lv_0');
    expect(cols[0]!.topLevelId).toBe('lv_1');
    expect(cols[0]!.height).toBeCloseTo(3.0);
  });
});

describe('BeamTool (criação de vigas)', () => {
  it('cria viga reta com dois cliques e gera linha de eixo e polígono', () => {
    const { env, store } = makeEnv();
    const bmTool = tool('beam', env) as BeamTool;
    bmTool.move(P(0, 0));
    expect(bmTool.preview().some((i) => i.kind === 'point')).toBe(true);
    clickAt(bmTool, 0, 0);
    bmTool.move(P(4, 0));
    expect(bmTool.preview().some((i) => i.kind === 'polygon')).toBe(true);
    expect(bmTool.preview().some((i) => i.kind === 'line' && i.dashed)).toBe(true);
    clickAt(bmTool, 4, 0);
    const bms = beamsOnLevel(store.project, 'lv_0');
    expect(bms).toHaveLength(1);
    expect(bms[0]!.a).toEqual({ x: 0, y: 0 });
    expect(bms[0]!.b).toEqual({ x: 4, y: 0 });
  });

  it('permite comprimento digitado e suporta cadeia (chain)', () => {
    const { env, store, options } = makeEnv();
    options.chain = true;
    const bmTool = tool('beam', env) as BeamTool;
    clickAt(bmTool, 0, 0);
    bmTool.move(P(1, 0));
    expect(bmTool.inputPrompt()).toBe('Comprimento');
    const ok = bmTool.type('3.5');
    expect(ok).toBe(true);
    let bms = beamsOnLevel(store.project, 'lv_0');
    expect(bms).toHaveLength(1);
    expect(bms[0]!.b.x).toBeCloseTo(3.5);

    bmTool.move(P(3.5, 2));
    bmTool.type('2');
    bms = beamsOnLevel(store.project, 'lv_0');
    expect(bms).toHaveLength(2);
    expect(bms[1]!.a.x).toBeCloseTo(3.5);
    expect(bms[1]!.b.y).toBeCloseTo(2);
  });

  it('recusa vigas menores que 0,05 m e entrega tempDims', () => {
    const { env, store } = makeEnv();
    const bmTool = tool('beam', env) as BeamTool;
    clickAt(bmTool, 0, 0);
    bmTool.move(P(0.01, 0));
    clickAt(bmTool, 0.01, 0);
    expect(beamsOnLevel(store.project, 'lv_0')).toHaveLength(0);
    bmTool.move(P(2, 0));
    expect(bmTool.tempDims().length).toBeGreaterThan(0);
  });
});

describe('FootingTool (criação de sapatas)', () => {
  it('cria sapata livre e rotaciona com Espaço', () => {
    const { env, store } = makeEnv();
    const ftTool = tool('footing', env) as FootingTool;
    ftTool.move(P(1, 1));
    expect(ftTool.preview().some((i) => i.kind === 'polygon')).toBe(true);
    ftTool.space();
    clickAt(ftTool, 1, 1);
    const fts = footingsOnLevel(store.project, 'lv_0');
    expect(fts).toHaveLength(1);
    expect(fts[0]!.at).toEqual({ x: 1, y: 1 });
    expect(fts[0]!.rotation).toBeCloseTo(Math.PI / 2);
    expect(fts[0]!.columnId).toBeNull();
  });

  it('associa automaticamente ao pilar quando inserida próxima dele no modo livre', () => {
    const { env, store } = makeEnv();
    const colTool = tool('column', env);
    clickAt(colTool, 3, 3);
    const col = columnsOnLevel(store.project, 'lv_0')[0]!;

    const ftTool = tool('footing', env);
    clickAt(ftTool, 3, 3);
    const fts = footingsOnLevel(store.project, 'lv_0');
    expect(fts).toHaveLength(1);
    expect(fts[0]!.columnId).toBe(col.id);
  });

  it('modo atColumns destaca pilar sob o cursor e cria sapata vinculada', () => {
    const { env, store, options } = makeEnv();
    const colTool = tool('column', env);
    clickAt(colTool, 5, 5);
    const col = columnsOnLevel(store.project, 'lv_0')[0]!;

    options.footingMode = 'atColumns';
    const ftTool = tool('footing', env) as FootingTool;
    ftTool.move(P(5.1, 5.1));
    expect(ftTool.preview().some((i) => i.kind === 'highlight')).toBe(true);
    clickAt(ftTool, 5.1, 5.1);

    const fts = footingsOnLevel(store.project, 'lv_0');
    expect(fts).toHaveLength(1);
    expect(fts[0]!.columnId).toBe(col.id);
    expect(fts[0]!.at).toEqual(col.at);

    clickAt(ftTool, 5.1, 5.1);
    expect(footingsOnLevel(store.project, 'lv_0')).toHaveLength(1);
  });

  it('placeFootingsAtColumns cria sapatas em lote para todos os pilares do nível', () => {
    const { env, store } = makeEnv();
    const colTool = tool('column', env);
    clickAt(colTool, 0, 0);
    clickAt(colTool, 4, 0);
    expect(columnsOnLevel(store.project, 'lv_0')).toHaveLength(2);

    const created = placeFootingsAtColumns(env);
    expect(created).toHaveLength(2);
    expect(footingsOnLevel(store.project, 'lv_0')).toHaveLength(2);

    const second = placeFootingsAtColumns(env);
    expect(second).toHaveLength(0);
  });
});

describe('Registro e atalhos de ferramentas estruturais', () => {
  it('registro contém as ferramentas estruturais no grupo Construir', () => {
    const buildGroup = TOOL_GROUPS.find((g) => g.title === 'Construir')!;
    expect(buildGroup.tools).toContain('column');
    expect(buildGroup.tools).toContain('beam');
    expect(buildGroup.tools).toContain('footing');

    expect(TOOL_LABEL.column).toBe('Pilar');
    expect(TOOL_LABEL.beam).toBe('Viga');
    expect(TOOL_LABEL.footing).toBe('Sapata');

    const { env } = makeEnv();
    expect(createTool('column', env)).toBeInstanceOf(ColumnTool);
    expect(createTool('beam', env)).toBeInstanceOf(BeamTool);
    expect(createTool('footing', env)).toBeInstanceOf(FootingTool);
  });

  it('atalhos padrão possuem entradas não conflitantes para os três elementos', () => {
    expect(PERFIL_REVIT.column).toBe('CL');
    expect(PERFIL_REVIT.beam).toBe('BM');
    expect(PERFIL_REVIT.footing).toBe('FT');

    expect(PERFIL_SIMPLES.column).toBe('VP');
    expect(PERFIL_SIMPLES.beam).toBe('VB');
    expect(PERFIL_SIMPLES.footing).toBe('VF');
  });
});

describe('Captura (componentSnapIndex) para estruturais', () => {
  it('componentSnapIndex captura vértices, eixos e centros de elementos estruturais', () => {
    const { env, store } = makeEnv();
    const colTool = tool('column', env);
    clickAt(colTool, 0, 0);

    const bmTool = tool('beam', env);
    clickAt(bmTool, 0, 0);
    clickAt(bmTool, 4, 0);

    const ftTool = tool('footing', env);
    clickAt(ftTool, 4, 0);

    const snapIdx = componentSnapIndex(store.project, 'lv_0');
    expect(snapIdx.pontos.length).toBeGreaterThan(0);
    expect(snapIdx.arestas.length).toBeGreaterThan(0);

    // Centro do pilar em (0,0) com kind 'center'
    const colCenter = snapIdx.pontos.find((p) => p.kind === 'center' && Math.hypot(p.x - 0, p.y - 0) < 0.05);
    expect(colCenter).toBeDefined();

    // Ponto médio da viga em (2, 0) com kind 'midpoint'
    const beamMid = snapIdx.pontos.find((p) => p.kind === 'midpoint' && Math.hypot(p.x - 2, p.y - 0) < 0.05);
    expect(beamMid).toBeDefined();

    // Centro da sapata em (4, 0) com kind 'center'
    const footCenter = snapIdx.pontos.find((p) => p.kind === 'center' && Math.hypot(p.x - 4, p.y - 0) < 0.05);
    expect(footCenter).toBeDefined();

    // Aresta da viga
    const beamEdge = snapIdx.arestas.find((e) => Math.hypot(e.a.x - 0, e.a.y - 0) < 0.2 || Math.hypot(e.b.x - 4, e.b.y - 0) < 0.2);
    expect(beamEdge).toBeDefined();
  });
});

describe('Atalhos 1-9 e Espaço para ancoragem estrutural (Itens 6 e 7)', () => {
  it('FootingTool: teclas 1-9 selecionam predefinições e Espaço cicla perímetro quando excêntrica (ou gira 90° centrada)', () => {
    const { env, store, options } = makeEnv();
    const ft = tool('footing', env);

    // Centrada: Espaço gira 90°
    clickAt(ft, 0, 0);
    ft.space?.();
    clickAt(ft, 3, 0);
    const footingsCentered = Object.values(store.project.elements).filter((e) => e.kind === 'footing');
    expect(footingsCentered).toHaveLength(2);
    expect((footingsCentered[0] as { rotation: number }).rotation).toBe(0);
    expect(Math.abs((footingsCentered[1] as { rotation: number }).rotation - Math.PI / 2)).toBeLessThan(1e-6);

    // Excêntrica: teclas numéricas 1..9 e Espaço ciclam bordas sem alterar rotação padrão
    options.footingEccentric = true;
    expect(ft.onKey?.('1')).toBe(true);
    expect(options.footingEccentric).toBe(true);
    expect((options.footingEccentricityX ?? 0)).not.toBe(0);
    expect((options.footingEccentricityY ?? 0)).not.toBe(0);

    const ox1 = options.footingEccentricityX;
    const oy1 = options.footingEccentricityY;
    expect(ft.onKey?.('9')).toBe(true);
    expect(options.footingEccentricityX).toBe(-(ox1 ?? 0));
    expect(options.footingEccentricityY).toBe(-(oy1 ?? 0));

    // Tecla 5 volta ao centro
    expect(ft.onKey?.('5')).toBe(true);
    expect(options.footingEccentric).toBe(false);
    expect(options.footingEccentricityX).toBe(0);
    expect(options.footingEccentricityY).toBe(0);

    // Espaço cicla perímetro quando excêntrica
    expect(ft.onKey?.('7')).toBe(true);
    const snapBefore = [options.footingEccentricityX, options.footingEccentricityY];
    ft.space?.();
    expect([options.footingEccentricityX, options.footingEccentricityY]).not.toEqual(snapBefore);
  });

  it('BeamTool: Espaço cicla justificação (center -> left -> right) e 4/5/6 selecionam direto antes do 1º clique', () => {
    const { env, store, options } = makeEnv();
    const bm = tool('beam', env);
    expect(options.beamJustify ?? 'center').toBe('center');

    bm.space?.();
    expect(options.beamJustify).toBe('left');
    bm.space?.();
    expect(options.beamJustify).toBe('right');
    bm.space?.();
    expect(options.beamJustify).toBe('center');

    expect(bm.onKey?.('4')).toBe(true);
    expect(options.beamJustify).toBe('left');
    clickAt(bm, 0, 0);
    // Após o 1º clique durante um trecho ativo, tecla numérica não altera justificação
    expect(bm.onKey?.('6')).toBe(false);
    expect(options.beamJustify).toBe('left');
    clickAt(bm, 4, 0);

    const beams = Object.values(store.project.elements).filter((e) => e.kind === 'beam');
    expect(beams).toHaveLength(1);
    expect((beams[0] as { justify: string }).justify).toBe('left');
  });

  it('ColumnTool: âncora 1-9 desloca centro lançado, Tab cicla 9 pontos e Espaço cicla bordas quando não centrada', () => {
    const { env, store, options } = makeEnv();
    const col = tool('column', env);

    // Tecla 1 -> 'bl'
    expect(col.onKey?.('1')).toBe(true);
    expect(options.columnAnchor).toBe('bl');
    clickAt(col, 2, 3);
    const cols = Object.values(store.project.elements).filter((e) => e.kind === 'column');
    expect(cols).toHaveLength(1);
    const c1 = cols[0] as { at: { x: number; y: number } };
    expect(Math.hypot(c1.at.x - 2, c1.at.y - 3)).toBeGreaterThan(0.05);

    // Espaço com âncora excêntrica cicla bordas sem girar
    col.space?.();
    expect(options.columnAnchor).toBe('left');

    // Tab avança pelo conjunto completo de âncoras
    const beforeTab = options.columnAnchor;
    col.tab?.(false);
    expect(options.columnAnchor).not.toBe(beforeTab);

    // Tecla 5 recentra e Espaço volta a girar 90°
    expect(col.onKey?.('5')).toBe(true);
    expect(options.columnAnchor).toBe('center');
    col.space?.();
    clickAt(col, 5, 3);
    const c2 = Object.values(store.project.elements).filter((e) => e.kind === 'column')[1] as { at: { x: number; y: number }; rotation: number };
    expect(c2.at).toEqual({ x: 5, y: 3 });
    expect(Math.abs(c2.rotation - Math.PI / 2)).toBeLessThan(1e-6);
  });
});

describe('Viga curva e galeria de formas da BeamTool', () => {
  it('cria viga em arco por 3 pontos com sag, comprimento real, polígono curvo e alça do ápice', () => {
    const { env, store, options } = makeEnv();
    options.beamShape = 'arc';
    const bm = tool('beam', env) as BeamTool;

    clickAt(bm, 0, 0);
    clickAt(bm, 4, 0);
    bm.move(P(2, 1));
    expect(bm.preview().some((i) => i.kind === 'polygon' && i.ring.length > 4)).toBe(true);
    expect(bm.preview().some((i) => i.kind === 'label')).toBe(true);
    clickAt(bm, 2, 1);

    const bms = beamsOnLevel(store.project, 'lv_0');
    expect(bms).toHaveLength(1);
    const curved = bms[0]!;
    expect(Math.abs(curved.sag ?? 0)).toBeCloseTo(1, 5);
    expect(beamLength(curved)).toBeGreaterThan(4.5);
    expect(beamPolygon(curved, findBeamType(store.project, curved.typeId)).length).toBeGreaterThan(8);
    expect(beamMidPoint(curved).y).toBeCloseTo(1, 3);

    // Alça do meio (ápice do arco) ajusta a flecha sem mover as pontas
    env.setSelection([curved.id]);
    const mid = beamMidPoint(curved);
    const hold = gripHoldAt(env, mid);
    expect(hold).not.toBeNull();
    hold!.drag(P(2, 1.5), () => ({ x: 2, y: 1.5 }));
    hold!.release(P(2, 1.5), () => {});
    const updated = beamsOnLevel(store.project, 'lv_0')[0]!;
    expect(beamMidPoint(updated).y).toBeCloseTo(1.5, 3);

    // Espelhamento inverte o sinal de sag
    store.exec({
      type: 'transform',
      ids: [updated.id],
      transform: { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
    });
    const mirrored = beamsOnLevel(store.project, 'lv_0')[0]!;
    expect(mirrored.sag).toBeCloseTo(-(updated.sag ?? 0), 5);
  });

  it('cria vigas circulares (2 arcos de 180°) no modo circle', () => {
    const { env, store, options } = makeEnv();
    options.beamShape = 'circle';
    const bm = tool('beam', env) as BeamTool;

    clickAt(bm, 2, 2);
    bm.move(P(4, 2));
    expect(bm.preview().filter((i) => i.kind === 'polygon')).toHaveLength(2);
    clickAt(bm, 4, 2);

    const bms = beamsOnLevel(store.project, 'lv_0');
    expect(bms).toHaveLength(2);
    expect(bms.every((b) => Math.abs(b.sag ?? 0) > 1.9)).toBe(true);
    const totalLen = bms.reduce((acc, b) => acc + beamLength(b), 0);
    expect(totalLen).toBeCloseTo(2 * Math.PI * 2, 3);
  });

  it('cria vigas em polígono inscrito (digitando lados e por clique padrão de 6 lados)', () => {
    const { env, store, options } = makeEnv();
    options.beamShape = 'poly-inscribed';
    const bm = tool('beam', env) as BeamTool;

    clickAt(bm, 0, 0);
    bm.move(P(3, 0));
    expect(bm.preview().filter((i) => i.kind === 'polygon')).toHaveLength(6);
    clickAt(bm, 3, 0);
    expect(bm.type('5')).toBe(true);
    expect(beamsOnLevel(store.project, 'lv_0')).toHaveLength(5);

    clickAt(bm, 10, 0);
    clickAt(bm, 12, 0);
    clickAt(bm, 12, 0);
    expect(beamsOnLevel(store.project, 'lv_0')).toHaveLength(11);
  });

  it('cria viga curva por seleção de face/eixo de parede existente no modo pick-face', () => {
    const { env, store, options } = makeEnv();
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w_arc', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: 1 }),
    });
    options.beamShape = 'pick-face';
    const bm = tool('beam', env) as BeamTool;

    bm.move(P(2, 1));
    bm.tab?.();
    bm.tab?.();
    clickAt(bm, 2, 1);

    const bms = beamsOnLevel(store.project, 'lv_0');
    expect(bms).toHaveLength(1);
    expect(Math.abs(bms[0]!.sag ?? 0)).toBeGreaterThan(0.5);
  });
});
