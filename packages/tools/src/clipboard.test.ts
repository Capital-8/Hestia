import { describe, expect, it } from 'vitest';
import { ProjectStore, makeCeiling, makeLevel, openingsOfWall, wallsOnLevel, type Generic, type Opening, type Wall } from '@hestia/model';
import { clipboardFrom, copyableIds, pasteAlignedCommand } from './clipboard.ts';
import { drawWall, makeEnv, tool } from './testEnv.ts';

/** Projeto com dois níveis; lv_1 é o destino. Paredes: uma reta com porta, outra em L. */
function build() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pav. 1', elevation: 3 }) });
  drawWall(ctx.env, [0, 0], [4, 0]);
  drawWall(ctx.env, [4, 0], [4, 3]);
  const d = tool('door', ctx.env);
  d.move({ raw: { x: 1, y: 0 }, shift: false, ctrl: false, alt: false });
  d.click({ raw: { x: 1, y: 0 }, shift: false, ctrl: false, alt: false });
  return ctx;
}

const onLevel = (s: ProjectStore, id: string): Wall[] => wallsOnLevel(s.project, id);

/** Porta criada por `build()`, hospedada na primeira parede. */
const doorOf = (s: ProjectStore) => Object.values(s.project.elements).find((e) => e.kind === 'door')!;

describe('copiar e colar alinhado (F7)', () => {
  it('cola no outro nível nas mesmas coordenadas, com ids e ordem novos', () => {
    const { store } = build();
    const src = onLevel(store, 'lv_0');
    const clip = clipboardFrom(store.project, src.map((w) => w.id));
    expect(clip?.walls).toHaveLength(2);
    expect(clip?.openings).toHaveLength(1);
    const r = pasteAlignedCommand(store.project, clip!, 'lv_1');
    expect(r).not.toBeNull();
    store.exec(r!.command, 'Colar alinhado');
    const dst = onLevel(store, 'lv_1');
    expect(dst).toHaveLength(2);
    expect(dst.map((w) => w.id).some((id) => src.some((s) => s.id === id))).toBe(false);
    expect(dst[0]!.a).toEqual(src[0]!.a);
    expect(dst[0]!.b).toEqual(src[0]!.b);
    expect(dst[1]!.b).toEqual(src[1]!.b);
    expect(dst[0]!.order).toBeGreaterThan(src[1]!.order);
    expect(onLevel(store, 'lv_0')).toHaveLength(2); // original intacto
  });

  it('leva a abertura para a parede nova, no mesmo deslocamento', () => {
    const { store } = build();
    const src = onLevel(store, 'lv_0');
    const clip = clipboardFrom(store.project, src.map((w) => w.id))!;
    const r = pasteAlignedCommand(store.project, clip, 'lv_1')!;
    store.exec(r.command);
    const dstWall = onLevel(store, 'lv_1')[0]!;
    const ops = openingsOfWall(store.project, dstWall.id) as Opening[];
    expect(ops).toHaveLength(1);
    expect(ops[0]!.offset).toBeCloseTo((openingsOfWall(store.project, src[0]!.id) as Opening[])[0]!.offset);
    expect(ops[0]!.id).not.toBe((openingsOfWall(store.project, src[0]!.id) as Opening[])[0]!.id);
  });

  it('um único passo de desfazer remove tudo que foi colado', () => {
    const { store } = build();
    const clip = clipboardFrom(store.project, onLevel(store, 'lv_0').map((w) => w.id))!;
    store.exec(pasteAlignedCommand(store.project, clip, 'lv_1')!.command);
    expect(onLevel(store, 'lv_1')).toHaveLength(2);
    store.undo();
    expect(onLevel(store, 'lv_1')).toHaveLength(0);
    expect(onLevel(store, 'lv_0')).toHaveLength(2);
  });

  it('colar duas vezes cria dois conjuntos independentes', () => {
    const { store } = build();
    const clip = clipboardFrom(store.project, onLevel(store, 'lv_0').map((w) => w.id))!;
    store.exec(pasteAlignedCommand(store.project, clip, 'lv_1')!.command);
    store.exec(pasteAlignedCommand(store.project, clip, 'lv_1')!.command);
    expect(onLevel(store, 'lv_1')).toHaveLength(4);
  });

  it('o buffer é um retrato: alterar o original depois não muda o que foi copiado', () => {
    const { store } = build();
    const first = onLevel(store, 'lv_0')[0]!;
    const clip = clipboardFrom(store.project, [first.id])!;
    store.exec({ type: 'setWallEnds', id: first.id, b: { x: 9, y: 9 } });
    const r = pasteAlignedCommand(store.project, clip, 'lv_1')!;
    store.exec(r.command);
    expect(onLevel(store, 'lv_1')[0]!.b).toEqual({ x: 4, y: 0 });
  });

  it('sem parede na seleção não há buffer', () => {
    const { store } = build();
    expect(clipboardFrom(store.project, [])).toBeNull();
    const door = Object.values(store.project.elements).find((e) => e.kind === 'door')!;
    expect(clipboardFrom(store.project, [door.id])).toBeNull();
  });

  it('nível inexistente não cola', () => {
    const { store } = build();
    const clip = clipboardFrom(store.project, onLevel(store, 'lv_0').map((w) => w.id))!;
    expect(pasteAlignedCommand(store.project, clip, 'nada')).toBeNull();
  });

  it('descarta abertura cujo tipo não existe no projeto de destino e usa o tipo padrão de parede', () => {
    const { store } = build();
    const clip = clipboardFrom(store.project, onLevel(store, 'lv_0').map((w) => w.id))!;
    clip.openings[0]!.typeId = 'ot_inexistente';
    clip.walls[0]!.typeId = 'wt_inexistente';
    const r = pasteAlignedCommand(store.project, clip, 'lv_1')!;
    expect(r.openingIds).toHaveLength(0);
    store.exec(r.command);
    expect(onLevel(store, 'lv_1')[0]!.typeId).toBe(store.project.defaults.wallTypeId);
  });
});

describe('ids que o Copiar levaria (copyableIds)', () => {
  it('parede com porta hospedada leva a porta; parede sem porta leva só a parede', () => {
    const { store } = build();
    const [comPorta, semPorta] = onLevel(store, 'lv_0');
    expect(copyableIds(store.project, [comPorta!.id])).toEqual([comPorta!.id, doorOf(store).id]);
    expect(copyableIds(store.project, [semPorta!.id])).toEqual([semPorta!.id]);
  });

  it('porta sozinha não é copiável: sem a parede anfitriã não há como colar', () => {
    const { store } = build();
    expect(copyableIds(store.project, [doorOf(store).id])).toEqual([]);
  });

  it('grade, anotação e separador de ambiente ficam de fora; forro e objeto genérico entram', () => {
    const { store } = build();
    store.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c1', typeId: 'ct_gesso', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }] }) });
    store.exec({ type: 'addText', levelId: 'lv_0', text: { id: 't1', at: { x: 0, y: 0 }, text: 'nota', height: 2.5, rotation: 0 } });
    store.exec({ type: 'addRoomSeparator', levelId: 'lv_0', separator: { id: 'sep1', a: { x: 0, y: 2 }, b: { x: 2, y: 2 } } });
    store.exec({ type: 'addGrid', grid: { id: 'gr1', name: '1', typeId: 'gt_6mm', points: [{ x: 0, y: 0 }, { x: 0, y: 5 }], sag: 0, bubbleStart: true, bubbleEnd: true } });
    const generico: Generic = { id: 'g1', kind: 'generic', levelId: 'lv_0', name: 'Viga', sourceClass: 'IFCBEAM', mesh: { positions: [], indices: [] }, order: 1 };
    const p = { ...store.project, elements: { ...store.project.elements, g1: generico } };
    expect(copyableIds(p, ['c1', 't1', 'sep1', 'gr1', 'g1'])).toEqual(['c1', 'g1']);
    // Com uma parede junto, ela e as suas aberturas entram na ordem da seleção.
    const semPorta = onLevel(store, 'lv_0')[1]!;
    expect(copyableIds(p, ['c1', semPorta.id])).toEqual(['c1', semPorta.id]);
  });

  it('ids inexistentes e duplicatas não aparecem; a ordem é a da seleção e depois as aberturas', () => {
    const { store } = build();
    const [w1, w2] = onLevel(store, 'lv_0');
    expect(copyableIds(store.project, ['zzz'])).toEqual([]);
    expect(copyableIds(store.project, [w1!.id, w1!.id, 'zzz', w2!.id])).toEqual([w1!.id, w2!.id, doorOf(store).id]);
  });

  it('forro, objeto genérico e CAD formam buffer sozinhos; abertura sozinha continua sem buffer', () => {
    const { store } = build();
    store.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c1', typeId: 'ct_gesso', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }] }) });
    const generico: Generic = { id: 'g1', kind: 'generic', levelId: 'lv_0', name: 'Viga', sourceClass: 'IFCBEAM', mesh: { positions: [], indices: [] }, order: 1 };
    store.exec({ type: 'addCadDrawing', cad: { id: 'cad1', kind: 'cad', levelId: 'lv_0', name: 'Planta', source: 'dxf', unit: 'm', layers: [{ name: '0' }], paths: [{ layer: '0', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }], closed: false }], texts: [] } });
    const p = { ...store.project, elements: { ...store.project.elements, g1: generico } };
    expect(clipboardFrom(p, ['c1'])?.ceilings).toHaveLength(1);
    expect(clipboardFrom(p, ['g1'])?.generics).toHaveLength(1);
    expect(clipboardFrom(p, ['cad1'])?.cad).toHaveLength(1);
    expect(clipboardFrom(p, [doorOf(store).id])).toBeNull();
  });

  it('bate com o que clipboardFrom realmente copia', () => {
    const { store } = build();
    const ids = onLevel(store, 'lv_0').map((w) => w.id);
    const clip = clipboardFrom(store.project, ids)!;
    expect(copyableIds(store.project, ids)).toEqual([...clip.walls.map((w) => w.id), ...clip.openings.map((o) => o.id)]);
  });
});
