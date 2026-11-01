import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAIR_TYPES,
  ProjectStore,
  STAIR_CALC_PRESETS,
  createEmptyProject,
  defaultStairTypeId,
  elementLevelId,
  levelAbove,
  makeLevel,
  makeStair,
  migrateProject,
  stairCalcRuleOf,
  stairTypeIssue,
  stairBaseZ,
  stairTopLevel,
  stairTopZ,
  stairsOnLevel,
  validateProject,
  type Project,
  type Stair,
  type StairCurve,
  type StairRun,
  type StairType,
  type ValidationIssue,
} from './index.ts';

const TERREO = 'lv_0';
const PAV2 = 'lv_1';
const COBERTURA = 'lv_2';

const curve = (ax: number, ay: number, bx: number, by: number, sag = 0): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag });

/** Lance de dois limites verticais (x=0 e x=1) com um espelho no pé. */
const run = (id: string): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 0, 0, 3, 0.2)],
  boundaryRight: [curve(1, 0, 1, 3)],
  risers: [curve(0, 0, 1, 0)],
  path: [],
});

/** Projeto com três níveis: térreo (0 m), pavimento 2 (3 m) e cobertura (6 m). */
function projectWithLevels(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: COBERTURA, name: 'Cobertura', elevation: 6 }) });
  return s;
}

const addStair = (s: ProjectStore, extra: Partial<Stair> = {}): void => {
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: TERREO, components: [run('r1')], ...extra }) });
};

const stairOf = (p: Project, id = 'st1'): Stair => p.elements[id] as Stair;

const stairCodes = (p: Project): string[] => validateProject(p).filter((i: ValidationIssue) => i.code.startsWith('stair-')).map((i) => i.code);

describe('makeStair e tipos padrão', () => {
  it('escada nova usa os valores padrão da decisão 0011', () => {
    expect(makeStair({ id: 's', typeId: 't', levelId: TERREO })).toEqual({
      id: 's',
      kind: 'stair',
      typeId: 't',
      levelId: TERREO,
      topLevelId: null,
      baseOffset: 0,
      topOffset: 0,
      height: 2.8,
      components: [],
      openingMode: 'headroom',
      openingHeadroom: null,
      openingMargin: 0.05,
      openingRect: false,
      mark: '',
      comments: '',
    });
  });

  it('há quatro tipos iniciais: os dois do item 8 e os dois caracol (decisão 0014 §8)', () => {
    expect(DEFAULT_STAIR_TYPES.map((t) => t.name)).toEqual([
      'Escada monolítica concreto',
      'Escada de piso e espelho',
      'Escada caracol monolítica',
      'Escada caracol com poste central',
    ]);
    for (const t of DEFAULT_STAIR_TYPES) {
      expect(t).toMatchObject({ maxRiser: 0.18, minRiser: 0.16, minTread: 0.28, nosing: 0.015, landingThickness: 0.15, minHeadroom: 2.1 });
    }
    for (const t of DEFAULT_STAIR_TYPES.slice(0, 2)) expect(t.minRunWidth).toBe(0.8);
    expect(DEFAULT_STAIR_TYPES[0]).toMatchObject({ runStyle: 'monolithic', undersideStyle: 'smooth', structuralDepth: 0.2, materialId: 'mat_concreto' });
    expect(DEFAULT_STAIR_TYPES[1]!.undersideStyle).toBe('smooth');
    expect(DEFAULT_STAIR_TYPES[1]).toMatchObject({ runStyle: 'assembled', treadThickness: 0.03, riserThickness: 0.02, materialId: 'mat_madeira' });
  });

  it('o tipo padrão existe entre os tipos iniciais e projeto novo já os traz', () => {
    const p = createEmptyProject();
    expect(p.stairTypes[defaultStairTypeId]).toBeDefined();
    expect(Object.keys(p.stairTypes).sort()).toEqual(DEFAULT_STAIR_TYPES.map((t) => t.id).sort());
  });
});

describe('comandos de escada', () => {
  it('addStair cria a escada com ordem e pode ser desfeito e refeito', () => {
    const s = projectWithLevels();
    addStair(s);
    expect(stairOf(s.project)).toMatchObject({ kind: 'stair', levelId: TERREO, order: expect.any(Number) });
    s.undo();
    expect(s.project.elements.st1).toBeUndefined();
    s.redo();
    expect(stairOf(s.project).components).toHaveLength(1);
  });

  it('addStair recusa tipo inexistente', () => {
    const s = projectWithLevels();
    expect(() => s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'nao_existe', levelId: TERREO }) })).toThrow('Tipo de escada inexistente');
  });

  it('updateElements altera propriedades da escada e o desfazer volta', () => {
    const s = projectWithLevels();
    addStair(s);
    s.exec({ type: 'updateElements', ids: ['st1'], patch: { height: 3.2, topOffset: -0.1, mark: 'E-1' } });
    expect(stairOf(s.project)).toMatchObject({ height: 3.2, topOffset: -0.1, mark: 'E-1' });
    s.undo();
    expect(stairOf(s.project)).toMatchObject({ height: 2.8, topOffset: 0, mark: '' });
  });

  it('upsertStairType cria e edita um tipo; desfazer restaura', () => {
    const s = projectWithLevels();
    const novo: StairType = { ...DEFAULT_STAIR_TYPES[0]!, id: 'stt_nova', name: 'Escada de teste' };
    s.exec({ type: 'upsertStairType', stairType: novo });
    expect(s.project.stairTypes.stt_nova?.name).toBe('Escada de teste');
    s.undo();
    expect(s.project.stairTypes.stt_nova).toBeUndefined();
  });

  it('upsertStairType aceita a face inferior escalonada e a guarda', () => {
    const s = projectWithLevels();
    s.exec({ type: 'upsertStairType', stairType: { ...DEFAULT_STAIR_TYPES[0]!, id: 'stt_esc', undersideStyle: 'stepped' } });
    expect(s.project.stairTypes.stt_esc?.undersideStyle).toBe('stepped');
    s.undo();
    expect(s.project.stairTypes.stt_esc).toBeUndefined();
  });

  it('deleteStairType é bloqueado enquanto há escada usando o tipo', () => {
    const s = projectWithLevels();
    addStair(s, { typeId: 'stt_piso_espelho' });
    expect(() => s.exec({ type: 'deleteStairType', id: 'stt_piso_espelho' })).toThrow('Tipo em uso');
    expect(s.project.stairTypes.stt_piso_espelho).toBeDefined();
  });

  it('deleteStairType exclui tipo sem uso, e não exclui o último tipo', () => {
    const s = projectWithLevels();
    s.exec({ type: 'deleteStairType', id: 'stt_piso_espelho' });
    expect(s.project.stairTypes.stt_piso_espelho).toBeUndefined();
    s.exec({ type: 'deleteStairType', id: 'stt_caracol_monolitica' });
    s.exec({ type: 'deleteStairType', id: 'stt_caracol_poste' });
    expect(() => s.exec({ type: 'deleteStairType', id: defaultStairTypeId })).toThrow('ao menos um tipo de escada');
  });

  it('deleteElements remove a escada e o desfazer a devolve', () => {
    const s = projectWithLevels();
    addStair(s);
    s.exec({ type: 'deleteElements', ids: ['st1'] });
    expect(s.project.elements.st1).toBeUndefined();
    s.undo();
    expect(stairOf(s.project).id).toBe('st1');
  });

  it('deleteLevel é bloqueado por escada no nível e por escada com topo explícito nele', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: PAV2 });
    expect(() => s.exec({ type: 'deleteLevel', id: PAV2 })).toThrow('Nível em uso');
    s.exec({ type: 'deleteElements', ids: ['st1'] });
    addStair(s, { id: 'st2', levelId: TERREO, topLevelId: COBERTURA });
    expect(() => s.exec({ type: 'deleteLevel', id: COBERTURA })).toThrow('Nível em uso');
  });

  it('deleteLevel libera o nível quando o topo é o automático (não é referência)', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: TERREO });
    s.exec({ type: 'deleteLevel', id: PAV2 });
    expect(s.project.levels.some((l) => l.id === PAV2)).toBe(false);
  });

  it('mudar de nível mantendo a cota compensa a base; a escada conta como elemento com nível', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: TERREO });
    s.exec({ type: 'setElementLevel', ids: ['st1'], levelId: PAV2, keep: 'elevation' });
    expect(elementLevelId(s.project.elements.st1)).toBe(PAV2);
    expect(stairOf(s.project).baseOffset).toBe(-3);
    expect(stairBaseZ(s.project, stairOf(s.project))).toBe(0);
  });

  it('mudar de nível levando o deslocamento move a base para a cota do novo nível', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: TERREO });
    s.exec({ type: 'setElementLevel', ids: ['st1'], levelId: PAV2, keep: 'offset' });
    expect(stairOf(s.project).baseOffset).toBe(0);
    expect(stairBaseZ(s.project, stairOf(s.project))).toBe(3);
  });

  it('stairsOnLevel lista só as escadas do nível, na ordem de criação', () => {
    const s = projectWithLevels();
    addStair(s, { id: 'a', levelId: TERREO });
    addStair(s, { id: 'b', levelId: PAV2 });
    addStair(s, { id: 'c', levelId: TERREO });
    expect(stairsOnLevel(s.project, TERREO).map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('transformação de escada', () => {
  it('mover desloca todos os croquis (lados, espelhos e caminhada)', () => {
    const s = projectWithLevels();
    addStair(s);
    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'translate', d: { x: 5, y: 0 } } });
    const r = (stairOf(s.project).components[0] as StairRun);
    expect(r.boundaryRight[0]!.a).toEqual({ x: 6, y: 0 });
    expect(r.boundaryLeft[0]!.sag).toBe(0.2);
    expect(r.risers[0]!.b).toEqual({ x: 6, y: 0 });
  });

  it('espelhar troca os limites e nega a flecha dos arcos', () => {
    const s = projectWithLevels();
    addStair(s);
    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } } });
    const r = stairOf(s.project).components[0] as StairRun;
    // O limite direito (x=1) vai para x=-1 e passa a ser o esquerdo; o esquerdo (com arco) passa a ser o direito.
    expect(r.boundaryLeft[0]!.a).toEqual({ x: -1, y: 0 });
    expect(r.boundaryRight[0]!.a).toEqual({ x: 0, y: 0 });
    expect(r.boundaryRight[0]!.sag).toBeCloseTo(-0.2);
  });

  it('copiar com idMap cria outra escada e deixa a original', () => {
    const s = projectWithLevels();
    addStair(s);
    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'translate', d: { x: 2, y: 2 } }, copy: { idMap: { st1: 'st2' } } });
    expect((stairOf(s.project, 'st1').components[0] as StairRun).boundaryRight[0]!.a).toEqual({ x: 1, y: 0 });
    expect((stairOf(s.project, 'st2').components[0] as StairRun).boundaryRight[0]!.a).toEqual({ x: 3, y: 2 });
  });

  it('escada livre: freePath acompanha mover e espelhar; round-trip por JSON', () => {
    const path = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 6 }];
    const s = projectWithLevels();
    addStair(s, { freePath: path, manualLandings: [1], components: [{ ...run('r1'), generatedBy: 'free' }] });
    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'translate', d: { x: 1, y: 2 } } });
    expect(stairOf(s.project).freePath).toEqual([{ x: 1, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 8 }]);
    expect(stairOf(s.project).manualLandings).toEqual([1]);
    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } } });
    expect(stairOf(s.project).freePath).toEqual([{ x: -1, y: 2 }, { x: -6, y: 2 }, { x: -6, y: 8 }]);
    const back = JSON.parse(JSON.stringify(stairOf(s.project))) as Stair;
    expect(back.freePath).toEqual(stairOf(s.project).freePath);
    expect(back.manualLandings).toEqual([1]);
    expect((back.components[0] as StairRun).generatedBy).toBe('free');
  });

  it('escada sem freePath continua sem o campo (projetos antigos)', () => {
    const s = projectWithLevels();
    addStair(s);
    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'translate', d: { x: 1, y: 2 } } });
    expect('freePath' in stairOf(s.project)).toBe(false);
  });
});

describe('escada livre: migração e esquema', () => {
  it('projeto com escada livre e sem freePath passa pela migração e pela validação', () => {
    const semPath = projectWithLevels();
    addStair(semPath);
    const livre = projectWithLevels();
    addStair(livre, { freePath: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 6 }], manualLandings: [1] });
    for (const p of [semPath.project, livre.project]) {
      const back = migrateProject(JSON.parse(JSON.stringify(p)));
      expect(back).toEqual(p);
      expect(validateProject(back).filter((i) => i.code.startsWith('stair-'))).toEqual([]);
    }
  });
});

describe('níveis e cotas da escada', () => {
  const s = projectWithLevels();
  const p = s.project;

  it('levelAbove devolve o nível de menor elevação acima do dado', () => {
    expect(levelAbove(p, TERREO)?.id).toBe(PAV2);
    expect(levelAbove(p, PAV2)?.id).toBe(COBERTURA);
    expect(levelAbove(p, COBERTURA)).toBeNull();
    expect(levelAbove(p, 'lv_inexistente')).toBeNull();
  });

  it('com topo automático, a cota do topo é o nível acima mais topOffset', () => {
    addStair(s, { levelId: TERREO, baseOffset: 0.05, topOffset: 0.1 });
    const st = stairOf(s.project);
    expect(stairTopLevel(s.project, st)?.id).toBe(PAV2);
    expect(stairBaseZ(s.project, st)).toBeCloseTo(0.05);
    expect(stairTopZ(s.project, st)).toBeCloseTo(3.1);
  });

  it('com topo explícito, usa o nível indicado e ignora o nível acima', () => {
    addStair(s, { id: 'st2', levelId: TERREO, topLevelId: COBERTURA, topOffset: 0 });
    const st = stairOf(s.project, 'st2');
    expect(stairTopLevel(s.project, st)?.id).toBe(COBERTURA);
    expect(stairTopZ(s.project, st)).toBe(6);
  });

  it('no nível mais alto, sem nível acima, o topo é base + height', () => {
    addStair(s, { id: 'st3', levelId: COBERTURA, baseOffset: 0.5, height: 2.4 });
    const st = stairOf(s.project, 'st3');
    expect(stairTopLevel(s.project, st)).toBeNull();
    expect(stairTopZ(s.project, st)).toBeCloseTo(6 + 0.5 + 2.4);
  });

  it('escada no pavimento 2 com nível acima usa a cota da cobertura', () => {
    addStair(s, { id: 'st4', levelId: PAV2 });
    expect(stairTopZ(s.project, stairOf(s.project, 'st4'))).toBe(6);
  });
});

describe('validação da escada', () => {
  it('escada válida não gera problemas', () => {
    const s = projectWithLevels();
    addStair(s);
    expect(stairCodes(s.project)).toEqual([]);
  });

  it('nível inexistente é erro', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: 'lv_x' });
    expect(stairCodes(s.project)).toEqual(['stair-level-missing']);
  });

  it('tipo inexistente é erro (inserido direto no mapa, já que o comando recusa)', () => {
    const p = createEmptyProject();
    p.elements.st1 = { ...makeStair({ id: 'st1', typeId: 'nope', levelId: TERREO }), order: 1 } as Stair;
    expect(stairCodes(p)).toEqual(['stair-type-missing']);
  });

  it('topo explícito inexistente é erro', () => {
    const s = projectWithLevels();
    addStair(s, { topLevelId: 'lv_x' });
    expect(stairCodes(s.project)).toEqual(['stair-top-level-missing']);
  });

  it('topo abaixo do nível da escada é erro', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: PAV2, topLevelId: TERREO });
    expect(stairCodes(s.project)).toEqual(['stair-top-not-above']);
  });

  it('topo explícito no mesmo nível da escada é erro (altura zero)', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: PAV2, topLevelId: PAV2 });
    expect(stairCodes(s.project)).toEqual(['stair-top-not-above']);
  });

  it('offset de topo que zera a altura é erro', () => {
    const s = projectWithLevels();
    addStair(s, { topLevelId: PAV2, topOffset: -3 });
    expect(stairCodes(s.project)).toEqual(['stair-top-not-above']);
  });

  it('altura de 1 mm ou menos conta como não acima; acima de 1 mm é aceita', () => {
    const fino = projectWithLevels();
    addStair(fino, { topLevelId: PAV2, topOffset: -3 + 0.0005 });
    expect(stairCodes(fino.project)).toEqual(['stair-top-not-above']);
    const ok = projectWithLevels();
    addStair(ok, { topLevelId: PAV2, topOffset: -3 + 0.002 });
    expect(stairCodes(ok.project)).toEqual([]);
  });

  it('sem nível acima, altura zero ou negativa é erro de topo não acima', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: COBERTURA, height: 0 });
    expect(stairCodes(s.project)).toEqual(['stair-top-not-above']);
    const n = projectWithLevels();
    addStair(n, { levelId: COBERTURA, height: -1 });
    expect(stairCodes(n.project)).toEqual(['stair-top-not-above']);
  });

  it('a mensagem é a da decisão 0011 §3', () => {
    const s = projectWithLevels();
    addStair(s, { levelId: PAV2, topLevelId: TERREO });
    expect(validateProject(s.project).find((i) => i.code === 'stair-top-not-above')).toMatchObject({
      severity: 'error',
      message: 'O nível de topo deve estar acima do nível da escada.',
      elementId: 'st1',
    });
  });
});

describe('escada caracol: tipos, poste e metadado do croqui', () => {
  it('caracol monolítico e caracol com poste têm os valores da decisão 0014', () => {
    expect(DEFAULT_STAIR_TYPES[2]).toMatchObject({ id: 'stt_caracol_monolitica', runStyle: 'monolithic', structuralDepth: 0.15, undersideStyle: 'smooth', minRunWidth: 0.8, materialId: 'mat_concreto' });
    expect(DEFAULT_STAIR_TYPES[3]).toMatchObject({ id: 'stt_caracol_poste', runStyle: 'post', treadThickness: 0.05, treadOverlap: 0.025, riserThickness: 0, landingThickness: 0.15, minRunWidth: 0.6, materialId: 'mat_aco', postMaterialId: 'mat_aco' });
  });

  it('os tipos iniciais guardam sobreposição e material do poste padrão', () => {
    for (const t of DEFAULT_STAIR_TYPES) expect(t).toMatchObject({ treadOverlap: 0.025, postMaterialId: 'mat_aco' });
    expect(createEmptyProject().materials.mat_aco).toMatchObject({ name: 'Aço' });
  });

  it('upsertStairType aceita os três estilos com valores válidos', () => {
    const s = projectWithLevels();
    s.exec({ type: 'upsertStairType', stairType: { ...DEFAULT_STAIR_TYPES[1]!, id: 'stt_t_mont', runStyle: 'assembled' } });
    s.exec({ type: 'upsertStairType', stairType: { ...DEFAULT_STAIR_TYPES[0]!, id: 'stt_t_mono', runStyle: 'monolithic' } });
    s.exec({ type: 'upsertStairType', stairType: { ...DEFAULT_STAIR_TYPES[3]!, id: 'stt_t_post', treadOverlap: 0 } });
    expect(s.project.stairTypes.stt_t_mont?.runStyle).toBe('assembled');
    expect(s.project.stairTypes.stt_t_mono?.runStyle).toBe('monolithic');
    expect(s.project.stairTypes.stt_t_post).toMatchObject({ runStyle: 'post', treadOverlap: 0 });
  });

  it('upsertStairType rejeita estilo desconhecido, sobreposição negativa ou nula no poste, e não guarda o tipo', () => {
    const s = projectWithLevels();
    const base = { ...DEFAULT_STAIR_TYPES[3]!, id: 'stt_ruim' };
    expect(() => s.exec({ type: 'upsertStairType', stairType: { ...base, runStyle: 'spiralx' as never } })).toThrow('Estilo de escada desconhecido');
    expect(() => s.exec({ type: 'upsertStairType', stairType: { ...base, treadOverlap: -0.01 } })).toThrow('não pode ser negativa');
    expect(() => s.exec({ type: 'upsertStairType', stairType: { ...base, treadOverlap: NaN } })).toThrow('não pode ser negativa');
    expect(() => s.exec({ type: 'upsertStairType', stairType: { ...base, treadThickness: 0 } })).toThrow('espessura do degrau');
    expect(s.project.stairTypes.stt_ruim).toBeUndefined();
  });

  it('no poste, a sobreposição precisa ser menor que a espessura do degrau; nos outros estilos não é conferida contra ela', () => {
    expect(stairTypeIssue({ runStyle: 'post', treadThickness: 0.05, treadOverlap: 0.05 })).toMatch(/menor que a espessura/);
    expect(stairTypeIssue({ runStyle: 'post', treadThickness: 0.05, treadOverlap: 0.049 })).toBeNull();
    // Espelho mínimo (NBR 9050: 0,16–0,18 m): positivo e menor que o máximo.
    const base = { runStyle: 'assembled' as const, treadThickness: 0.03, treadOverlap: 0 };
    expect(stairTypeIssue({ ...base, minRiser: 0.16, maxRiser: 0.18 })).toBeNull();
    expect(stairTypeIssue({ ...base, minRiser: 0, maxRiser: 0.18 })).toMatch(/espelho mínimo/);
    expect(stairTypeIssue({ ...base, minRiser: 0.18, maxRiser: 0.18 })).toMatch(/menor que o espelho máximo/);
    expect(stairTypeIssue({ ...base, minRiser: 0.2, maxRiser: 0.18 })).toMatch(/menor que o espelho máximo/);
    expect(stairTypeIssue({ runStyle: 'assembled', treadThickness: 0.03, treadOverlap: 0.1 })).toBeNull();
    expect(stairTypeIssue({ runStyle: 'monolithic', treadThickness: 0, treadOverlap: 0 })).toBeNull();
  });

  it('o metadado spiral do lance sobrevive a salvar e abrir; o lance sem spiral continua sem a chave', () => {
    const s = projectWithLevels();
    const spiral = { center: { x: 2, y: 3 }, rInner: 0.1, rOuter: 1, startAngle: 0.5, sweep: -2 * Math.PI };
    s.exec({
      type: 'addStair',
      stair: makeStair({ id: 'st1', typeId: 'stt_caracol_poste', levelId: TERREO, components: [{ ...run('r1'), generatedBy: 'spiral', spiral }, run('r2')] }),
    });
    const back = migrateProject(JSON.parse(JSON.stringify(s.project)));
    expect(back).toEqual(s.project);
    const [a, b] = stairOf(back).components as StairRun[];
    expect(a!.spiral).toEqual(spiral);
    expect(a!.generatedBy).toBe('spiral');
    expect(b).not.toHaveProperty('spiral');
  });

  it('mover o caracol leva o centro do spiral junto; girar soma o ângulo; espelhar reflete e inverte a varredura', () => {
    const s = projectWithLevels();
    const spiral = { center: { x: 2, y: 0 }, rInner: 0.1, rOuter: 1, startAngle: 0, sweep: Math.PI };
    s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'stt_caracol_poste', levelId: TERREO, components: [{ ...run('r1'), generatedBy: 'spiral', spiral }] }) });
    const spOf = (): StairRun['spiral'] => (stairOf(s.project).components[0] as StairRun).spiral;

    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'translate', d: { x: 1, y: 1 } } });
    expect(spOf()).toEqual({ ...spiral, center: { x: 3, y: 1 } });

    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    const girado = spOf()!;
    expect(girado.center.x).toBeCloseTo(-1, 9);
    expect(girado.center.y).toBeCloseTo(3, 9);
    expect(girado.startAngle).toBeCloseTo(Math.PI / 2, 9);
    expect(girado.sweep).toBeCloseTo(Math.PI, 9);

    // Desfaz mover e girar: volta ao centro (2, 0), ângulo 0, varredura π. Espelhar no eixo y: centro (-2, 0).
    s.undo();
    s.undo();
    s.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } } });
    const espelhado = spOf()!;
    expect(espelhado.center.x).toBeCloseTo(-2, 9);
    expect(espelhado.center.y).toBeCloseTo(0, 9);
    expect(espelhado.startAngle).toBeCloseTo(Math.PI, 9);
    expect(espelhado.sweep).toBeCloseTo(-Math.PI, 9);
    // O primeiro espelho, que estava em (3, 0), tem de cair em (-3, 0): é o ponto do ângulo inicial refletido.
    const pFirst = { x: espelhado.center.x + espelhado.rOuter * Math.cos(espelhado.startAngle), y: espelhado.center.y + espelhado.rOuter * Math.sin(espelhado.startAngle) };
    expect(pFirst.x).toBeCloseTo(-3, 9);
    expect(pFirst.y).toBeCloseTo(0, 9);
  });
});

describe('regra de cálculo do tipo de escada', () => {
  it('os tipos iniciais usam a regra padrão 2R + T (0,63 a 0,65 m), alvo 0,63 e piso máximo 0,32', () => {
    for (const t of DEFAULT_STAIR_TYPES) {
      expect(stairCalcRuleOf(t)).toEqual({
        calcRiserFactor: 2,
        calcTreadFactor: 1,
        calcTarget: 0.63,
        calcMin: 0.63,
        calcMax: 0.65,
        maxTread: 0.32,
      });
    }
  });

  it('as predefinições trazem as faixas da NBR 9050, da NBR 9077 e do IBC', () => {
    expect(STAIR_CALC_PRESETS.map((p) => p.id)).toEqual(['nbr9050', 'nbr9077', 'ibc']);
    const [nbr9050, nbr9077, ibc] = STAIR_CALC_PRESETS;
    expect(nbr9050!.rule).toMatchObject({ calcRiserFactor: 2, calcTreadFactor: 1, calcTarget: 0.63, calcMin: 0.63, calcMax: 0.65, maxTread: 0.32 });
    expect(nbr9077!.rule).toMatchObject({ calcMin: 0.63, calcMax: 0.64, calcTarget: 0.63, maxTread: 0.32 });
    expect(ibc!.rule).toMatchObject({ calcMin: 0.6, calcMax: 0.65, calcTarget: 0.63, maxTread: 0.32 });
  });

  it('a validação do tipo exige fatores positivos, alvo na faixa e piso máximo ≥ mínimo', () => {
    const base = { ...DEFAULT_STAIR_TYPES[0]! };
    expect(stairTypeIssue(base)).toBeNull();
    expect(stairTypeIssue({ ...base, calcRiserFactor: 0 })).toMatch(/fator do espelho/);
    expect(stairTypeIssue({ ...base, calcTreadFactor: -1 })).toMatch(/fator do piso/);
    expect(stairTypeIssue({ ...base, calcMin: 0.7 })).toMatch(/alvo/);
    expect(stairTypeIssue({ ...base, calcMax: 0.6 })).toMatch(/alvo/);
    expect(stairTypeIssue({ ...base, maxTread: 0.2 })).toMatch(/piso máximo/);
  });

  it('upsertStairType rejeita uma regra de cálculo inválida e não guarda o tipo', () => {
    const s = projectWithLevels();
    const base = { ...DEFAULT_STAIR_TYPES[0]!, id: 'stt_calc_ruim' };
    expect(() => s.exec({ type: 'upsertStairType', stairType: { ...base, calcTarget: 0.8 } })).toThrow(/alvo/);
    expect(() => s.exec({ type: 'upsertStairType', stairType: { ...base, maxTread: 0.1 } })).toThrow(/piso máximo/);
    expect(s.project.stairTypes.stt_calc_ruim).toBeUndefined();
  });
});
