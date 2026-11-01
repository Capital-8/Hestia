import { describe, expect, it } from 'vitest';
import { ceilingsOnLevel, copyLinkOf, createEmptyProject, floorsOnLevel, isWall, makeCeiling, makeFloor, makeLevel, makeRamp, makeRoof, makeRoom, makeSlab, makeStair, makeWall, openingsOfWall, ProjectStore, rampsOnLevel, roomsOnLevel, roofsOnLevel, slabsOnLevel, stairsOnLevel, validateProject, type Opening, type Wall } from '@hestia/model';
import { clipboardFrom, pasteAlignedCommand } from '../clipboard.ts';
import { pasteAlignedToLevelsCommand, previewPasteLevels } from './command.ts';
import { remapTopLevel } from './remap.ts';

/** Projeto com 4 níveis: lv_0 (0 m), lv_1 (3 m), lv_2 (6 m), lv_3 (9 m). */
function buildProject(): ProjectStore {
  const store = new ProjectStore({ ...createEmptyProject(), levels: [] });
  for (const [id, name, elevation] of [
    ['lv_0', 'Térreo', 0],
    ['lv_1', 'Pav. 1', 3],
    ['lv_2', 'Pav. 2', 6],
    ['lv_3', 'Pav. 3', 9],
  ] as const) {
    store.exec({ type: 'upsertLevel', level: makeLevel({ id, name, elevation }) });
  }
  return store;
}

/** Parede reta simples num nível. */
function wall(store: ProjectStore, id: string, levelId: string, a: [number, number], b: [number, number], extra: Partial<Omit<Wall, 'order' | 'kind'>> = {}): void {
  store.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, ...extra }) });
}

/** Porta centrada na parede. */
function door(store: ProjectStore, id: string, hostId: string, offset = 2): void {
  const opening: Opening = { id, kind: 'door', typeId: 'ot_p80', hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  store.exec({ type: 'addOpening', opening });
}

/** Contador de ids por prefixo, para os testes conferirem que os ids são novos e distintos. */
function counterMint(): (prefix: string) => string {
  const n = new Map<string, number>();
  return (prefix) => {
    const next = (n.get(prefix) ?? 0) + 1;
    n.set(prefix, next);
    return `${prefix}_t${next}`;
  };
}

describe('remapTopLevel', () => {
  it('preserva o delta de índice entre os níveis ordenados por elevação', () => {
    const p = buildProject().project;
    expect(remapTopLevel(p, 'lv_0', 'lv_1', 'lv_2')).toEqual({ topLevelId: 'lv_3', overflow: false });
    expect(remapTopLevel(p, 'lv_1', 'lv_2', 'lv_0')).toEqual({ topLevelId: 'lv_1', overflow: false });
    expect(remapTopLevel(p, 'lv_0', null, 'lv_3')).toEqual({ topLevelId: null, overflow: false });
  });

  it('estoura o último nível quando o delta passa do topo', () => {
    const p = buildProject().project;
    expect(remapTopLevel(p, 'lv_0', 'lv_2', 'lv_2')).toEqual({ topLevelId: null, overflow: true });
    expect(remapTopLevel(p, 'lv_0', 'lv_0', 'lv_0')).toEqual({ topLevelId: 'lv_0', overflow: false });
  });
});

describe('pasteAlignedToLevelsCommand', () => {
  it('cola parede e porta em 3 níveis, com ids novos, X/Y igual e levelId do destino', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    door(store, 'd1', 'w1', 2);
    const clip = clipboardFrom(store.project, ['w1'])!;
    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_1', 'lv_2', 'lv_3'], { mint: counterMint() })!;
    expect(r).not.toBeNull();
    store.exec(r.command);

    const ids = new Set<string>();
    for (const levelId of ['lv_1', 'lv_2', 'lv_3']) {
      const [w] = Object.values(store.project.elements).filter(isWall).filter((e) => e.levelId === levelId).sort((a, b) => a.order - b.order);
      expect(w).toBeDefined();
      expect(w!.a).toEqual({ x: 0, y: 0 });
      expect(w!.b).toEqual({ x: 4, y: 0 });
      expect(w!.levelId).toBe(levelId);
      expect(ids.has(w!.id)).toBe(false);
      ids.add(w!.id);
      const ops = openingsOfWall(store.project, w!.id) as Opening[];
      expect(ops).toHaveLength(1);
      expect(ops[0]!.offset).toBeCloseTo(2);
      expect(r.byLevel[levelId]!.walls).toEqual([w!.id]);
      expect(r.byLevel[levelId]!.openings).toEqual([ops[0]!.id]);
      ids.add(ops[0]!.id);
    }
    // A porta de cada nível está na parede colada do MESMO nível.
    for (const levelId of ['lv_1', 'lv_2', 'lv_3']) {
      const w = r.byLevel[levelId]!.walls[0]!;
      const o = r.byLevel[levelId]!.openings[0]!;
      expect(store.project.elements[o]!.kind === 'door' || store.project.elements[o]!.kind === 'window').toBe(true);
      expect((store.project.elements[o] as Opening).hostId).toBe(w);
    }
  });

  it('um único undo remove os conjuntos dos 3 níveis', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    const clip = clipboardFrom(store.project, ['w1'])!;
    store.exec(pasteAlignedToLevelsCommand(store.project, clip, ['lv_1', 'lv_2', 'lv_3'])!.command);
    expect(Object.values(store.project.elements).filter((e) => e.kind === 'wall')).toHaveLength(4);
    store.undo();
    expect(Object.values(store.project.elements).filter((e) => e.kind === 'wall')).toHaveLength(1);
  });

  it('remapeia o topLevelId da parede e passa em validateProject', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0], { topLevelId: 'lv_1', height: 3 });
    const clip = clipboardFrom(store.project, ['w1'])!;
    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_2'], { mint: counterMint() })!;
    store.exec(r.command);
    const w = Object.values(store.project.elements).find((e) => e.kind === 'wall' && e.levelId === 'lv_2');
    expect(w).toBeDefined();
    expect(w!.kind === 'wall' && w!.topLevelId).toBe('lv_3');
    expect(validateProject(store.project).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('cai para altura explícita quando o topo estoura o último nível', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0], { topLevelId: 'lv_1', height: 3, topOffset: 0.5 });
    const clip = clipboardFrom(store.project, ['w1'])!;
    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_3'], { mint: counterMint() })!;
    store.exec(r.command);
    const w = Object.values(store.project.elements).find((e) => e.kind === 'wall' && e.levelId === 'lv_3');
    expect(w!.kind === 'wall' && w!.topLevelId).toBeNull();
    expect(w!.kind === 'wall' && w!.height).toBeCloseTo(3.5); // (3 + 0,5) - (0 + 0)
    expect(r.warnings).toContainEqual({ levelId: 'lv_3', kind: 'top-overflow', count: 1 });
    expect(validateProject(store.project).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('remapeia o attachTopRoofId para o telhado copiado e limpa quando o telhado não está no buffer', () => {
    const store = buildProject();
    store.exec({ type: 'addRoof', roof: makeRoof({ id: 't1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }) });
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0], { attachTopToRoof: true, attachTopRoofId: 't1' });
    const mint = counterMint();
    const clip = clipboardFrom(store.project, ['w1', 't1'])!;
    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_1'], { mint })!;
    store.exec(r.command);
    const newRoof = r.byLevel['lv_1']!.roofs[0]!;
    const newWall = Object.values(store.project.elements).find((e) => e.kind === 'wall' && e.levelId === 'lv_1');
    expect(newWall!.kind === 'wall' && newWall!.attachTopRoofId).toBe(newRoof);
    expect(r.warnings.some((w) => w.kind === 'roof-unlinked')).toBe(false);

    // Sem o telhado no buffer, o vínculo é limpo e o aviso aparece.
    const semTelhado = clipboardFrom(store.project, ['w1'])!;
    const r2 = pasteAlignedToLevelsCommand(store.project, semTelhado, ['lv_1'], { mint })!;
    store.exec(r2.command);
    const semVinculo = Object.values(store.project.elements).find((e) => e.kind === 'wall' && e.levelId === 'lv_1' && e.id !== newWall!.id);
    expect(semVinculo!.kind === 'wall' && semVinculo!.attachTopRoofId).toBeUndefined();
    expect(r2.warnings).toContainEqual({ levelId: 'lv_1', kind: 'roof-unlinked', count: 1 });
  });

  it('copia piso, laje, forro, telhado, escada, rampa e ambiente para o nível de destino', () => {
    const store = buildProject();
    store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }) });
    store.exec({ type: 'addSlab', slab: makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }) });
    store.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c1', typeId: 'ct_gesso', levelId: 'lv_0', roomId: 'r1', roomLinked: true, boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }) });
    store.exec({ type: 'addRoof', roof: makeRoof({ id: 't1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }) });
    store.exec({ type: 'addStair', stair: makeStair({ id: 's1', typeId: 'stt_monolitica', levelId: 'lv_0', topLevelId: 'lv_1', height: 3 }) });
    store.exec({ type: 'addRamp', ramp: makeRamp({ id: 'rp1', typeId: 'rmt_nbr9050', levelId: 'lv_0', topLevelId: 'lv_1', height: 3 }) });
    store.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '1', point: { x: 2, y: 1 } }) });
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    wall(store, 'w2', 'lv_0', [4, 0], [4, 3]);
    wall(store, 'w3', 'lv_0', [4, 3], [0, 3]);
    wall(store, 'w4', 'lv_0', [0, 3], [0, 0]);
    const clip = clipboardFrom(store.project, ['f1', 'l1', 'c1', 't1', 's1', 'rp1', 'r1', 'w1', 'w2', 'w3', 'w4'])!;

    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_1'], { mint: counterMint() })!;
    expect(r).not.toBeNull();
    store.exec(r.command);
    expect(floorsOnLevel(store.project, 'lv_1')).toHaveLength(1);
    expect(slabsOnLevel(store.project, 'lv_1')).toHaveLength(1);
    const ceiling = ceilingsOnLevel(store.project, 'lv_1')[0]!;
    expect(ceiling.levelId).toBe('lv_1');
    expect(ceiling.roomId).toBe(r.byLevel['lv_1']!.rooms[0]); // W2 remapeia o forro para o ambiente copiado
    expect(r.warnings.some((w) => w.kind === 'ceiling-unlinked')).toBe(false);
    expect(roofsOnLevel(store.project, 'lv_1')).toHaveLength(1);
    expect(stairsOnLevel(store.project, 'lv_1')).toHaveLength(1);
    expect(rampsOnLevel(store.project, 'lv_1')).toHaveLength(1);
    expect(roomsOnLevel(store.project, 'lv_1')).toHaveLength(1);
    expect(roomsOnLevel(store.project, 'lv_1')[0]!.point).toEqual({ x: 2, y: 1 });
    const stair = stairsOnLevel(store.project, 'lv_1')[0]!;
    expect(stair.levelId).toBe('lv_1');
    expect(stair.topLevelId).toBe('lv_2');
    const ramp = rampsOnLevel(store.project, 'lv_1')[0]!;
    expect(ramp.levelId).toBe('lv_1');
    expect(ramp.topLevelId).toBe('lv_2');
    expect(r.warnings.filter((w) => w.kind === 'room-open' && w.count > 0)).toEqual([]);
  });

  it('avisa room-open quando o ambiente é colado sem as paredes que o fecham', () => {
    const store = buildProject();
    store.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '1', point: { x: 2, y: 1 } }) });
    const clip = clipboardFrom(store.project, ['r1'])!;
    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_2'])!;
    expect(r.warnings).toContainEqual({ levelId: 'lv_2', kind: 'room-open', count: 1 });
  });

  it('descarta abertura sem parede anfitriã no buffer e avisa opening-dropped', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    door(store, 'd1', 'w1');
    const clip = clipboardFrom(store.project, ['w1'])!;
    clip.walls = [];
    // Sem parede, o buffer só tem a porta: não há o que colar.
    expect(pasteAlignedToLevelsCommand(store.project, clip, ['lv_1'])).toBeNull();

    // Com uma parede de outro id, a porta não encontra anfitriã e é descartada.
    const clip2 = clipboardFrom(store.project, ['w1'])!;
    clip2.walls = [{ ...clip2.walls[0]!, id: 'outra' }];
    const r = pasteAlignedToLevelsCommand(store.project, clip2, ['lv_1'])!;
    expect(r.byLevel['lv_1']!.openings).toEqual([]);
    expect(r.warnings).toContainEqual({ levelId: 'lv_1', kind: 'opening-dropped', count: 1 });
  });

  it('copia genérico transladado em Z e CAD com id novo e mesmo conteúdo (W2)', () => {
    const store = buildProject();
    const generic = { id: 'g1', kind: 'generic' as const, levelId: 'lv_0', name: 'Viga', sourceClass: 'IFCBEAM', mesh: { positions: [0, 0, 2, 1, 0, 2, 0, 1, 2], indices: [0, 1, 2] }, outline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], order: 0 };
    const cad = { id: 'cad1', kind: 'cad' as const, levelId: 'lv_0', name: 'Planta', source: 'dxf' as const, unit: 'm' as const, layers: [{ name: '0' }], paths: [{ layer: '0', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }], closed: false }], texts: [], order: 0, offsetZ: 0.5 };
    const p = { ...store.project, elements: { ...store.project.elements, g1: generic, cad1: cad } };
    const clip = clipboardFrom(p, ['g1', 'cad1'])!;
    const r = pasteAlignedToLevelsCommand(p, clip, ['lv_1'], { mint: counterMint() })!;
    store.exec(r.command);

    const g = store.project.elements[r.byLevel['lv_1']!.generics[0]!]!;
    expect(g.kind).toBe('generic');
    if (g.kind === 'generic') {
      expect(g.id).not.toBe('g1');
      expect(g.levelId).toBe('lv_1');
      expect(g.mesh.positions).toEqual([0, 0, 5, 1, 0, 5, 0, 1, 5]); // +3 m do nível
      expect(g.outline).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    }

    const c = store.project.elements[r.byLevel['lv_1']!.cad[0]!]!;
    expect(c.kind).toBe('cad');
    if (c.kind === 'cad') {
      expect(c.id).not.toBe('cad1');
      expect(c.levelId).toBe('lv_1');
      expect(c.paths).toEqual(cad.paths); // mesmo conteúdo do desenho
      expect(c.offsetZ).toBe(0.5);
    }
  });

  it('forro sem o ambiente copiado solta o vínculo e avisa ceiling-unlinked (W2)', () => {
    const store = buildProject();
    store.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c1', typeId: 'ct_gesso', levelId: 'lv_0', roomId: 'r1', roomLinked: true, boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }) });
    const clip = clipboardFrom(store.project, ['c1'])!;
    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_1'], { mint: counterMint() })!;
    store.exec(r.command);
    const ceiling = ceilingsOnLevel(store.project, 'lv_1')[0]!;
    expect(ceiling.roomLinked).toBe(false);
    expect(r.warnings).toContainEqual({ levelId: 'lv_1', kind: 'ceiling-unlinked', count: 1 });
  });

  it('o colar de um nível delega ao motor, remapeia o topo e não cria vínculo', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0], { topLevelId: 'lv_1', height: 3 });
    const clip = clipboardFrom(store.project, ['w1'])!;
    const r = pasteAlignedCommand(store.project, clip, 'lv_2', counterMint())!;
    store.exec(r.command);
    const w = Object.values(store.project.elements).find((e) => e.kind === 'wall' && e.levelId === 'lv_2');
    expect(w!.kind === 'wall' && w!.topLevelId).toBe('lv_3');
    expect(store.project.copyLinks).toBeUndefined();
    expect(r.wallIds).toHaveLength(1);
  });

  it('conta sobreposições simples ao colar duas vezes no mesmo nível', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    const clip = clipboardFrom(store.project, ['w1'])!;
    const first = pasteAlignedToLevelsCommand(store.project, clip, ['lv_1'])!;
    store.exec(first.command);
    const second = pasteAlignedToLevelsCommand(store.project, clip, ['lv_1'])!;
    expect(second.warnings).toContainEqual({ levelId: 'lv_1', kind: 'overlap', count: 1 });
  });

  it('com link monta sourceIds na ordem canônica e um membro por nível', () => {
    const store = buildProject();
    store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }) });
    store.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c1', typeId: 'ct_gesso', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }) });
    store.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '1', point: { x: 2, y: 1 } }) });
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    door(store, 'd1', 'w1');
    const clip = clipboardFrom(store.project, ['f1', 'c1', 'r1', 'w1'])!;
    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_1', 'lv_2'], { link: true, mint: counterMint() })!;
    store.exec(r.command);

    const link = store.project.copyLinks?.[0];
    expect(link).toBeDefined();
    expect(link!.sourceIds).toEqual([...clip.walls, ...clip.openings, ...clip.floors, ...clip.slabs, ...(clip.ceilings ?? []), ...clip.roofs, ...(clip.stairs ?? []), ...(clip.ramps ?? []), ...(clip.rooms ?? []), ...(clip.generics ?? []), ...(clip.cad ?? [])].map((e) => e.id));
    expect(link!.members.map((m) => m.levelId)).toEqual(['lv_1', 'lv_2']);
    for (const levelId of ['lv_1', 'lv_2']) {
      const member = link!.members.find((m) => m.levelId === levelId)!;
      expect(member.ids).toHaveLength(link!.sourceIds.length);
      const ids = r.byLevel[levelId]!;
      expect(member.ids).toEqual([...ids.walls, ...ids.openings, ...ids.floors, ...ids.slabs, ...ids.ceilings, ...ids.roofs, ...ids.stairs, ...ids.ramps, ...ids.rooms, ...ids.generics, ...ids.cad]);
    }
    expect(copyLinkOf(store.project, r.byLevel['lv_1']!.walls[0]!)).toBe(link);
  });

  it('nível repetido, inexistente ou lista vazia não cola e não altera o modelo', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    const clip = clipboardFrom(store.project, ['w1'])!;
    const before = JSON.stringify(store.project);
    expect(pasteAlignedToLevelsCommand(store.project, clip, ['lv_1', 'lv_1'])).toBeNull();
    expect(pasteAlignedToLevelsCommand(store.project, clip, ['nada'])).toBeNull();
    expect(pasteAlignedToLevelsCommand(store.project, clip, [])).toBeNull();
    expect(JSON.stringify(store.project)).toBe(before);
  });

  it('corte não entra no buffer (a seleção é ignorada sem erro)', () => {
    const store = buildProject();
    store.exec({ type: 'addView', view: { id: 'sec1', name: 'Corte', kind: 'section', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 3 } });
    expect(clipboardFrom(store.project, ['sec1'])).toBeNull();
  });
});

describe('previewPasteLevels', () => {
  it('devolve um rascunho com os elementos colados sem tocar no projeto real', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    const clip = clipboardFrom(store.project, ['w1'])!;
    const before = Object.keys(store.project.elements).length;
    const draft = previewPasteLevels(store.project, clip, ['lv_1', 'lv_2']);
    expect(Object.keys(store.project.elements)).toHaveLength(before);
    expect(Object.values(store.project.elements).filter((e) => e.kind === 'wall')).toHaveLength(1);
    expect(Object.values(draft.elements).filter((e) => e.kind === 'wall' && e.levelId === 'lv_1')).toHaveLength(1);
    expect(Object.values(draft.elements).filter((e) => e.kind === 'wall' && e.levelId === 'lv_2')).toHaveLength(1);
    expect(draft).not.toBe(store.project);
  });

  it('lista inválida devolve uma cópia intacta', () => {
    const store = buildProject();
    wall(store, 'w1', 'lv_0', [0, 0], [4, 0]);
    const clip = clipboardFrom(store.project, ['w1'])!;
    const draft = previewPasteLevels(store.project, clip, ['nada']);
    expect(draft).not.toBe(store.project);
    expect(draft.elements).toEqual(store.project.elements);
  });
});
