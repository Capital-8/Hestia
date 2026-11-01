import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  followsRoom,
  isCad,
  makeCeiling,
  ProjectStore,
  type CadDrawing,
  type Ceiling,
  type Command,
  type Generic,
  type Id,
  type Project,
} from '@hestia/model';
import type { ClipBuffer, MintId } from '../clipboard.ts';
import { cloneCategories, type CategoryContext } from './categories.ts';

type AddGeneric = Extract<Command, { type: 'addGeneric' }>;

/** Contador de ids por teste: prefixo + sequência, como o `newId` do modelo. */
function newMint(): MintId {
  let n = 0;
  return (prefix: string) => `${prefix}_${++n}` as Id;
}

function newStore(): ProjectStore {
  return new ProjectStore(createEmptyProject());
}

function ctxOf(p: Project, mint: MintId, over: Partial<CategoryContext> = {}): CategoryContext {
  return { p, levelId: 'lv_1', srcLevelId: 'lv_0', mint, wallMap: new Map(), ...over };
}

/** Buffer mínimo: só as categorias extras em teste (o W1 preenche o resto). */
function clipOf(parts: { ceilings?: Ceiling[]; generics?: Generic[]; cad?: CadDrawing[] }): ClipBuffer {
  return { walls: [], openings: [], floors: [], slabs: [], roofs: [], ...parts } as ClipBuffer;
}

const BOUNDARY = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];

const ceilingOf = (over: Partial<Ceiling> = {}): Ceiling => ({
  ...makeCeiling({ id: 'c_origem', typeId: 'ct_gesso', levelId: 'lv_0', boundary: BOUNDARY, roomId: 'rm_origem' }),
  order: 1,
  ...over,
});

const genericOf = (over: Partial<Generic> = {}): Generic => ({
  id: 'g_origem',
  kind: 'generic',
  levelId: 'lv_0',
  name: 'Viga importada',
  sourceClass: 'IFCBEAM',
  mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 2], indices: [0, 1, 2] },
  outline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
  ifcProperties: [{ name: 'FireRating', value: 'R60' }],
  order: 2,
  ...over,
});

const cadOf = (over: Partial<CadDrawing> = {}): CadDrawing => ({
  id: 'cad_origem',
  kind: 'cad',
  levelId: 'lv_0',
  name: 'Planta DXF',
  source: 'dxf',
  unit: 'm',
  offsetZ: 0.5,
  layers: [{ name: 'A-WALL' }],
  paths: [{ layer: 'A-WALL', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false }],
  texts: [{ layer: 'A-WALL', at: { x: 0, y: 0 }, text: 'P1', height: 0.2, rotation: 0 }],
  order: 3,
  ...over,
});

describe('cloneCategories — forros', () => {
  it('com o ambiente copiado: id e nível novos, tipo e contorno preservados, roomId remapeado', () => {
    const s = newStore();
    const origem = ceilingOf();
    const r = cloneCategories(s.project, clipOf({ ceilings: [origem] }), 'lv_1', ctxOf(s.project, newMint(), {
      roomMap: new Map([['rm_origem', 'rm_novo']]),
    }));

    expect(r.commands).toHaveLength(1);
    const cmd = r.commands[0] as Extract<Command, { type: 'addCeilings' }>;
    expect(cmd.type).toBe('addCeilings');
    const [colado] = cmd.ceilings;
    expect(colado).toBeDefined();
    expect(colado!.id).not.toBe(origem.id);
    expect(colado!.id.startsWith('c_')).toBe(true);
    expect(colado!.levelId).toBe('lv_1');
    expect(colado!.typeId).toBe('ct_gesso');
    expect(colado!.boundary).toEqual(BOUNDARY);
    expect(colado!.roomId).toBe('rm_novo');
    expect(colado!.roomLinked).not.toBe(false);
    expect(r.ids.ceilings).toEqual([colado!.id]);
    expect(r.warnings).toEqual([]);

    // Aplica: o forro entra no nível de destino e acompanha o ambiente remapeado.
    s.exec({ type: 'batch', commands: r.commands });
    const salvo = s.project.elements[colado!.id];
    expect(salvo?.kind).toBe('ceiling');
    expect(followsRoom(salvo as Ceiling)).toBe(true);
  });

  it('usa o mapa geral de ids (hostMap) do W1 para remapear o ambiente', () => {
    const s = newStore();
    const origem = ceilingOf();
    const r = cloneCategories(s.project, clipOf({ ceilings: [origem] }), 'lv_1', ctxOf(s.project, newMint(), {
      hostMap: new Map<Id, Id>([['rm_origem', 'rm_pelo_host']]),
    }));
    const cmd = r.commands[0] as Extract<Command, { type: 'addCeilings' }>;
    expect(cmd.ceilings[0]!.roomId).toBe('rm_pelo_host');
    expect(r.warnings).toEqual([]);
  });

  it('sem o ambiente copiado: solta o vínculo, mantém o contorno e avisa ceiling-unlinked', () => {
    const s = newStore();
    const origem = ceilingOf({ typeId: 'ct_inexistente' });
    const r = cloneCategories(s.project, clipOf({ ceilings: [origem] }), 'lv_1', ctxOf(s.project, newMint()));

    const cmd = r.commands[0] as Extract<Command, { type: 'addCeilings' }>;
    const [colado] = cmd.ceilings;
    expect(colado!.roomLinked).toBe(false);
    expect(colado!.roomId).toBe('rm_origem');
    // Tipo ausente no projeto cai no primeiro tipo de forro.
    expect(colado!.typeId).toBe(Object.keys(s.project.ceilingTypes)[0]);
    expect(r.warnings).toEqual([{ levelId: 'lv_1', kind: 'ceiling-unlinked', count: 1 }]);

    s.exec({ type: 'batch', commands: r.commands });
    expect(followsRoom(s.project.elements[colado!.id] as Ceiling)).toBe(false);
  });

  it('forro desenhado à mão (sem roomId) não gera aviso', () => {
    const s = newStore();
    const origem = ceilingOf({ roomId: null });
    const r = cloneCategories(s.project, clipOf({ ceilings: [origem] }), 'lv_1', ctxOf(s.project, newMint()));
    const cmd = r.commands[0] as Extract<Command, { type: 'addCeilings' }>;
    expect(cmd.ceilings[0]!.roomId ?? null).toBeNull();
    expect(r.warnings).toEqual([]);
  });
});

describe('cloneCategories — genéricos/IFC', () => {
  it('translada a malha em Z pelo delta entre os níveis e preserva IFC e demais campos', () => {
    const s = newStore();
    const origem = genericOf();
    const r = cloneCategories(s.project, clipOf({ generics: [origem] }), 'lv_1', ctxOf(s.project, newMint()));

    expect(r.commands).toHaveLength(1);
    const cmd = r.commands[0] as AddGeneric;
    expect(cmd.type).toBe('addGeneric');
    const colado = cmd.generic as Generic;
    expect(colado.id.startsWith('g_')).toBe(true);
    expect(colado.id).not.toBe(origem.id);
    expect(colado.levelId).toBe('lv_1');
    // lv_1 = 3,00 m; lv_0 = 0,00 m: só o Z muda.
    expect(colado.mesh.positions).toEqual([0, 0, 3, 1, 0, 3, 0, 1, 5]);
    expect(colado.mesh.indices).toBe(origem.mesh.indices);
    expect(colado.outline).toBe(origem.outline);
    expect(colado.ifcProperties).toBe(origem.ifcProperties);
    expect(r.ids.generics).toEqual([colado.id]);
    expect(r.ids.ceilings).toEqual([]);
    expect(r.warnings).toEqual([]);
    // O buffer (origem) fica intacto para os outros níveis.
    expect(origem.mesh.positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 2]);
  });

  it('no mesmo nível não desloca e compartilha as posições', () => {
    const s = newStore();
    const origem = genericOf();
    const r = cloneCategories(s.project, clipOf({ generics: [origem] }), 'lv_0', ctxOf(s.project, newMint(), { levelId: 'lv_0' }));
    const colado = (r.commands[0] as AddGeneric).generic;
    expect(colado.mesh.positions).toBe(origem.mesh.positions);
  });
});

describe('cloneCategories — desenhos CAD', () => {
  it('id e nível novos, offset preservado e geometria compartilhada (sem cópia profunda)', () => {
    const s = newStore();
    const origem = cadOf();
    const r = cloneCategories(s.project, clipOf({ cad: [origem] }), 'lv_1', ctxOf(s.project, newMint()));

    expect(r.commands).toHaveLength(1);
    const cmd = r.commands[0] as Extract<Command, { type: 'addCadDrawing' }>;
    expect(cmd.type).toBe('addCadDrawing');
    expect(cmd.cad.id.startsWith('cad_')).toBe(true);
    expect(cmd.cad.id).not.toBe(origem.id);
    expect(cmd.cad.levelId).toBe('lv_1');
    expect(cmd.cad.offsetZ).toBe(0.5);
    expect('order' in cmd.cad).toBe(false);
    // Mesmas referências: o desenho não é multiplicado por nível.
    expect(cmd.cad.paths).toBe(origem.paths);
    expect(cmd.cad.texts).toBe(origem.texts);
    expect(cmd.cad.layers).toBe(origem.layers);
    expect(r.ids.cad).toEqual([cmd.cad.id]);

    // Outro nível reaproveita as mesmas listas.
    const outro = cloneCategories(s.project, clipOf({ cad: [origem] }), 'lv_0', ctxOf(s.project, newMint(), { levelId: 'lv_0' }));
    expect((outro.commands[0] as Extract<Command, { type: 'addCadDrawing' }>).cad.paths).toBe(origem.paths);

    s.exec({ type: 'batch', commands: r.commands });
    const salvo = s.project.elements[cmd.cad.id];
    expect(isCad(salvo)).toBe(true);
    if (isCad(salvo)) expect(salvo.order).toBeGreaterThan(0);
  });
});

describe('cloneCategories — buffer vazio', () => {
  it('não devolve comando, id nem aviso', () => {
    const s = newStore();
    const r = cloneCategories(s.project, clipOf({}), 'lv_1', ctxOf(s.project, newMint()));
    expect(r.commands).toEqual([]);
    expect(r.ids.ceilings).toEqual([]);
    expect(r.ids.generics).toEqual([]);
    expect(r.ids.cad).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
