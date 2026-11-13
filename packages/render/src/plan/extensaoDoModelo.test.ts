/**
 * TESTE-GUARDA da extensão do modelo (docs/contratos/familias-e-ferramentas.md, regra 3): a caixa que limita a elevação, o
 * "enquadrar tudo" e as pranchas vem de TODOS os elementos que aparecem em corte e elevação, não só das paredes.
 *
 * Duas travas:
 * 1. Compilação: `CASOS` é um `Record<Element['kind'], ...>`. Um kind novo em `Element` sem linha aqui não compila.
 * 2. Execução: cada kind que diz `entra` precisa alargar a caixa até o elemento; cada kind que não entra tem de dizer o motivo
 *    em `KINDS_NA_EXTENSAO` e deixar a caixa vazia. O modelo declara (`KINDS_NA_EXTENSAO`) e o teste confere os dois lados.
 */
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import {
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  makeBeam,
  makeCeiling,
  makeColumn,
  makeFooting,
  makeFloor,
  makeGuardaCorpo,
  makeRamp,
  makeRoof,
  makeRoom,
  makeSlab,
  makeStair,
  makeWall,
  type CadDrawing,
  type Element,
  type Generic,
  type Opening,
  type Project,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import { elevationFrameBox, levelBox, levelFrameBox } from './build.ts';
import { extensaoDoModelo, KINDS_NA_EXTENSAO, type CaixaPlano } from './extensaoDoModelo.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v(ax, ay), b: v(bx, by), sag: 0 });
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];

/** Lance reto em +x com `n` espelhos a cada `passo` metros, a partir de x = 20 (longe da origem, para a caixa provar a posição). */
function lance(n: number, passo: number, x0: number, width = 1.2): StairRun {
  const xs = Array.from({ length: n }, (_, k) => x0 + k * passo);
  const fim = xs[xs.length - 1]! + 0.5;
  return { id: 'run', kind: 'run', boundaryLeft: [ln(x0 - 0.5, width / 2, fim, width / 2)], boundaryRight: [ln(x0 - 0.5, -width / 2, fim, -width / 2)], risers: xs.map((x) => ln(x, -1, x, 1)), path: [] };
}

const escada = (id = 'st1') => makeStair({ id, typeId: defaultStairTypeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [lance(10, 0.28, 20)] });

function com(...cmds: Parameters<ProjectStore['exec']>[0][]): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const c of cmds) s.exec(c);
  return s.project;
}

const abertura = (kind: 'door' | 'window'): Opening => ({ id: 'ab1', kind, typeId: kind === 'door' ? 'ot_p80' : 'ot_j120', hostId: 'w1', offset: 7, flipHand: false, flipFacing: false, sillOverride: null, mark: '' });
const parede = () => makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(10, 0) });

interface Caso {
  /** O kind aparece em corte e elevação? */
  entra: boolean;
  /** Projeto só com esse elemento (a esquadria leva a parede anfitriã). */
  projeto: () => Project;
  /** Ponto em planta que a caixa tem de cobrir (kinds que entram). */
  alvo?: Vec2[];
}

const generico: Omit<Generic, 'order'> = { id: 'g1', kind: 'generic', levelId: 'lv_0', name: 'Viga', sourceClass: 'IFCBEAM', mesh: { positions: [30, 30, 0, 34, 30, 0, 34, 31, 3], indices: [0, 1, 2] }, outline: rect(30, 30, 34, 31) };
const cad: Omit<CadDrawing, 'order'> = { id: 'cad1', kind: 'cad', levelId: 'lv_0', name: 'Planta', source: 'dxf', unit: 'm', layers: [{ name: '0', color: 7 }], paths: [{ layer: '0', closed: false, pts: [v(40, 40), v(45, 45)] }], texts: [] };

const CASOS: Record<Element['kind'], Caso> = {
  wall: { entra: true, projeto: () => com({ type: 'addWall', wall: parede() }), alvo: [v(0, 0), v(10, 0)] },
  door: { entra: true, projeto: () => com({ type: 'addWall', wall: parede() }, { type: 'addOpening', opening: abertura('door') }), alvo: [v(7, 0)] },
  window: { entra: true, projeto: () => com({ type: 'addWall', wall: parede() }, { type: 'addOpening', opening: abertura('window') }), alvo: [v(7, 0)] },
  floor: { entra: true, projeto: () => com({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_laje12', levelId: 'lv_0', boundary: rect(-5, -4, 9, 6) }) }), alvo: [v(-5, -4), v(9, 6)] },
  slab: { entra: true, projeto: () => com({ type: 'addSlab', slab: makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: rect(-5, -4, 9, 6) }) }), alvo: [v(-5, -4), v(9, 6)] },
  ceiling: { entra: true, projeto: () => com({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c1', typeId: 'ct_gesso', levelId: 'lv_0', boundary: rect(-5, -4, 9, 6) }) }), alvo: [v(-5, -4), v(9, 6)] },
  roof: {
    entra: true,
    projeto: () => com({ type: 'addRoof', roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: rect(-5, -4, 9, 6), heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: v(1, 0) }) }),
    alvo: [v(-5, -4), v(9, 6)],
  },
  stair: { entra: true, projeto: () => com({ type: 'addStair', stair: escada() }), alvo: [v(20, -0.6), v(22.5, 0.6)] },
  ramp: {
    entra: true,
    // A rampa é um caso à parte (precisa de nível de topo); ver o teste dedicado abaixo.
    projeto: () => com(),
  },
  railing: {
    entra: true,
    projeto: () =>
      com({
        type: 'addGuardaCorpo',
        guardaCorpo: makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId: 'gct_balaustres', cotaBase: 3, hospedeiro: { tipo: 'manual', uso: 'varanda', caminho: [{ x: 50, y: 8, dz: 0 }, { x: 54, y: 8, dz: 0 }, { x: 54, y: 11, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' } }),
      }),
    alvo: [v(50, 8), v(54, 11)],
  },
  // estrutura: ficha R1a. O pilar entra com a meia-diagonal da caixa do perfil (25 x 25: 0,1768 m) em volta da posição.
  column: { entra: true, projeto: () => com({ type: 'addColumn', column: makeColumn({ id: 'cl1', typeId: 'pil_est_25x25', levelId: 'lv_0', pos: v(70, 70) }) }), alvo: [v(69.8233, 69.8233), v(70.1767, 70.1767)] },
  beam: { entra: true, projeto: () => com({ type: 'addBeam', beam: makeBeam({ id: 'bm1', typeId: 'vig_15x40', levelId: 'lv_0', a: v(70, 70), b: v(75, 70) }) }), alvo: [v(70, 70), v(75, 70)] },
  footing: { entra: true, projeto: () => com({ type: 'addFooting', footing: makeFooting({ id: 'ft1', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: v(70, 70) }) }), alvo: [v(70, 70)] },
  room: { entra: false, projeto: () => com({ type: 'addRoom', room: makeRoom({ id: 'rm1', levelId: 'lv_0', name: 'Sala', number: '1', point: v(60, 60) }) }) },
  generic: { entra: false, projeto: () => com({ type: 'addGeneric', generic: generico }) },
  cad: { entra: false, projeto: () => com({ type: 'addCadDrawing', cad }) },
};

const contem = (b: CaixaPlano, pts: Vec2[]): boolean => pts.every((q) => q.x >= b.minX - 1e-9 && q.x <= b.maxX + 1e-9 && q.y >= b.minY - 1e-9 && q.y <= b.maxY + 1e-9);

describe('contrato: todo kind de elemento está classificado na extensão do modelo', () => {
  it('a classificação do modelo e a do teste falam dos mesmos kinds', () => {
    expect(Object.keys(KINDS_NA_EXTENSAO).sort()).toEqual(Object.keys(CASOS).sort());
  });

  for (const [kind, caso] of Object.entries(CASOS) as Array<[Element['kind'], Caso]>) {
    if (kind === 'ramp') continue; // coberto abaixo
    it(`${kind}: ${caso.entra ? 'entra na caixa e a caixa o cobre' : 'não entra (com motivo escrito) e deixa a caixa vazia'}`, () => {
      expect(KINDS_NA_EXTENSAO[kind].entra, `${kind}: o modelo e o teste discordam`).toBe(caso.entra);
      const box = extensaoDoModelo(caso.projeto());
      if (caso.entra) {
        expect(box, `${kind}: um modelo só com este elemento tem de ter caixa`).not.toBeNull();
        expect(contem(box!, caso.alvo!), `${kind}: a caixa não cobre o elemento`).toBe(true);
      } else {
        expect(KINDS_NA_EXTENSAO[kind].motivo, `${kind}: kind fora da extensão exige o motivo`).toBeTruthy();
        expect(box).toBeNull();
      }
    });
  }

  it('ramp: entra na caixa e a caixa cobre a pegada da rampa', () => {
    expect(KINDS_NA_EXTENSAO.ramp.entra).toBe(true);
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertLevel', level: { ...s.project.levels[0]!, id: 'lv_top', name: 'Topo', elevation: 1.2 } });
    s.exec({
      type: 'addRamp',
      ramp: makeRampDeTeste(),
    });
    const box = extensaoDoModelo(s.project)!;
    expect(box).not.toBeNull();
    expect(box.minX).toBeLessThanOrEqual(30);
    expect(box.maxX).toBeGreaterThanOrEqual(36);
  });
});

function makeRampDeTeste() {
  const tipo = createEmptyProject().rampTypes.rmt_nbr9050!;
  return makeRamp({
    id: 'rp1',
    typeId: tipo.id,
    levelId: 'lv_0',
    topLevelId: 'lv_top',
    components: [{ ...lance(2, 6, 30, 1.5), id: 'c0', kind: 'run' as const }],
    inputMode: 'length',
    slopeTarget: 1 / 12,
  });
}

describe('extensão do modelo: sem paredes', () => {
  it('modelo vazio não tem caixa', () => {
    expect(extensaoDoModelo(createEmptyProject())).toBeNull();
    expect(elevationFrameBox(createEmptyProject(), 'lv_0')).toBeNull();
    expect(levelBox(createEmptyProject(), 'lv_0')).toBeNull();
  });

  it('escada sozinha: a caixa de elevação existe e cobre a escada com folga', () => {
    const p = com({ type: 'addStair', stair: escada() });
    const b = elevationFrameBox(p, 'lv_0')!;
    expect(b).not.toBeNull();
    expect(contem(b, [v(20, -0.6), v(22.5, 0.6)])).toBe(true);
    // Sem as paredes a caixa continua só em volta da escada, não da origem.
    expect(b.minX).toBeGreaterThan(15);
  });

  it('escada + guarda-corpo manual: a caixa cobre os dois', () => {
    const p = com(
      { type: 'addStair', stair: escada() },
      { type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId: 'gct_balaustres', cotaBase: 3, hospedeiro: { tipo: 'manual', uso: 'varanda', caminho: [{ x: 50, y: 8, dz: 0 }, { x: 54, y: 8, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' } }) },
    );
    expect(contem(elevationFrameBox(p, 'lv_0')!, [v(19.5, -0.6), v(54, 8)])).toBe(true);
  });

  it('guarda-corpo de escada (hospedeiro): a caixa cobre a escada do hospedeiro, mesmo em outro nível', () => {
    const lado = { lance: true, patamar: true };
    const p = com(
      { type: 'addStair', stair: escada() },
      { type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc2', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) },
    );
    expect(contem(extensaoDoModelo(p, 'lv_0')!, [v(20, -0.6), v(22.5, 0.6)])).toBe(true);
  });
});

describe('extensão do modelo: com paredes (regressão)', () => {
  const paredes = (): Project =>
    com(
      { type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(4, 0) }) },
      { type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: v(4, 0), b: v(4, 3) }) },
    );

  it('só paredes: levelBox é a caixa das paredes com 0,5 m de folga, como sempre foi', () => {
    expect(levelBox(paredes(), 'lv_0')).toEqual({ minX: -0.5, minY: -0.5, maxX: 4.5, maxY: 3.5 });
  });

  it('só paredes: a caixa de elevação é idêntica à de enquadramento do nível', () => {
    const p = paredes();
    expect(elevationFrameBox(p, 'lv_0')).toEqual(levelFrameBox(p, 'lv_0'));
  });

  it('o que cabe dentro das paredes não muda a caixa', () => {
    const p = com(
      { type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(10, 0) }) },
      { type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: v(10, 0), b: v(10, 8) }) },
      { type: 'addSlab', slab: makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: rect(0, 0, 10, 8) }) },
    );
    expect(levelBox(p, 'lv_0')).toEqual({ minX: -0.5, minY: -0.5, maxX: 10.5, maxY: 8.5 });
  });

  it('balanço de laje além das paredes alarga a caixa (antes ficava de fora)', () => {
    const p = com(
      { type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(10, 0) }) },
      { type: 'addSlab', slab: makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: rect(-2, -2, 12, 4) }) },
    );
    expect(levelBox(p, 'lv_0')).toEqual({ minX: -2.5, minY: -2.5, maxX: 12.5, maxY: 4.5 });
  });
});

describe('estrutura: ficha R1a (pilar, viga e fundação entram na extensão)', () => {
  const pilar = (id: string, typeId: string, pos: Vec2, extra: Partial<Parameters<typeof makeColumn>[0]> = {}) => ({ type: 'addColumn' as const, column: makeColumn({ id, typeId, levelId: 'lv_0', pos, ...extra }) });

  it('pilar 0,20 x 0,40 girado: a caixa cobre qualquer rotação (meia-diagonal do perfil)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertColumnType', columnType: { id: 'pil_20x40', name: 'E', code: 'E', description: '', disciplina: 'estrutural', perfil: { forma: 'retangular', b: 0.2, h: 0.4 }, materialId: 'mat_concreto', cost: 0 } });
    s.exec(pilar('c1', 'pil_20x40', v(10, 20), { rotation: Math.PI / 5 }));
    const box = extensaoDoModelo(s.project)!;
    const r = Math.hypot(0.2, 0.4) / 2;
    expect(box.minX).toBeCloseTo(10 - r, 9);
    expect(box.maxY).toBeCloseTo(20 + r, 9);
    // Os quatro cantos do retângulo girado ficam dentro da caixa.
    const a = Math.PI / 5;
    for (const [lx, ly] of [[-0.1, -0.2], [0.1, -0.2], [0.1, 0.2], [-0.1, 0.2]] as const) {
      const q = { x: 10 + lx * Math.cos(a) - ly * Math.sin(a), y: 20 + lx * Math.sin(a) + ly * Math.cos(a) };
      expect(contem(box, [q])).toBe(true);
    }
  });

  it('pilar circular, perfil personalizado e tipo ausente (só a posição)', () => {
    const s = new ProjectStore(createEmptyProject());
    const tipo = (id: string, perfil: never) => ({ id, name: id, code: id, description: '', disciplina: 'estrutural' as const, perfil, materialId: 'mat_concreto', cost: 0 });
    s.exec({ type: 'upsertColumnType', columnType: tipo('pc', { forma: 'circular', d: 0.4 } as never) });
    s.exec({ type: 'upsertColumnType', columnType: tipo('pp', { forma: 'personalizado', anel: [[0, 0], [0.6, 0], [0.6, 0.1], [0, 0.1]] } as never) });
    s.exec(pilar('c1', 'pc', v(0, 0)));
    expect(extensaoDoModelo(s.project)).toEqual({ minX: -0.2, minY: -0.2, maxX: 0.2, maxY: 0.2 });
    s.exec(pilar('c2', 'pp', v(10, 0)));
    expect(extensaoDoModelo(s.project)!.maxX).toBeCloseTo(10 + Math.hypot(0.6, 0.1) / 2, 9);
    const q = structuredClone(s.project);
    (q.elements['c2'] as { typeId: string }).typeId = 'inexistente';
    expect(extensaoDoModelo(q)!.maxX).toBe(10);
  });

  it('fundação corrida entra com a e b; filtra por nível', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f1', typeId: 'bal_40x30', levelId: 'lv_0', a: v(1, 2), b: v(7, 2) }) });
    s.exec({ type: 'addBeam', beam: makeBeam({ id: 'b1', typeId: 'vig_15x40', levelId: 'lv_1', a: v(0, 9), b: v(3, 9) }) });
    expect(extensaoDoModelo(s.project, 'lv_0')).toEqual({ minX: 1, minY: 2, maxX: 7, maxY: 2 });
    expect(extensaoDoModelo(s.project, 'lv_1')).toEqual({ minX: 0, minY: 9, maxX: 3, maxY: 9 });
    expect(extensaoDoModelo(s.project)).toEqual({ minX: 0, minY: 2, maxX: 7, maxY: 9 });
  });
});
