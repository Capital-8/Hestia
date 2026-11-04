import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  SCHEMA_VERSION,
  copyLinkOf,
  createEmptyProject,
  linkRoleIndex,
  linkedSiblings,
  makeCopyLink,
  makeLevel,
  makeRoof,
  makeWall,
  migrateProject,
  syncLinkedCommand,
  syncWholeLinkCommand,
  type CopyLink,
  type Generic,
  type Opening,
  type Project,
  type Wall,
} from './index.ts';

const square = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 5, y: 4 },
  { x: 0, y: 4 },
];

/** Projeto com `n` níveis de 3 em 3 metros (lv_0 na cota 0). */
function storeWithLevels(n: number): ProjectStore {
  const p = createEmptyProject();
  p.levels = Array.from({ length: n }, (_, i) => makeLevel({ id: `lv_${i}`, name: `Nível ${i}`, elevation: i * 3 }));
  return new ProjectStore(p);
}

function addWall(s: ProjectStore, id: string, levelId: string, extra: Partial<Wall> = {}): void {
  s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ...extra }) });
}

function addRoof(s: ProjectStore, id: string, levelId: string): void {
  s.exec({ type: 'addRoof', roof: makeRoof({ id, typeId: 'rt_ceramica', levelId, boundary: square }) });
}

let minted = 0;
const mint = (prefix: string): string => `${prefix}_test${++minted}`;

describe('vínculo de andar-tipo', () => {
  it('sincroniza o andar-tipo inteiro (parede + telhado) a partir da origem, num undo', () => {
    const s = storeWithLevels(3);
    addWall(s, 'w0', 'lv_0');
    addWall(s, 'w1', 'lv_1');
    addWall(s, 'w2', 'lv_2');
    addRoof(s, 'r0', 'lv_0');
    addRoof(s, 'r1', 'lv_1');
    addRoof(s, 'r2', 'lv_2');
    const link = makeCopyLink(
      ['w0', 'r0'],
      [
        { levelId: 'lv_1', ids: ['w1', 'r1'] },
        { levelId: 'lv_2', ids: ['w2', 'r2'] },
      ],
      mint,
    );
    s.exec({ type: 'addCopyLink', link });
    s.exec({ type: 'updateElements', ids: ['w0'], patch: { height: 3.4 } });
    s.exec({ type: 'updateElements', ids: ['r0'], patch: { heightOffset: 0.3 } });

    const command = syncWholeLinkCommand(s.project, link.id, 'w0');
    expect(command).not.toBeNull();
    s.exec(command!);
    expect((s.project.elements['w1'] as Wall).height).toBe(3.4);
    expect((s.project.elements['w2'] as Wall).height).toBe(3.4);
    expect((s.project.elements['r1'] as { heightOffset: number }).heightOffset).toBe(0.3);
    expect((s.project.elements['r2'] as { heightOffset: number }).heightOffset).toBe(0.3);

    s.undo();
    expect((s.project.elements['w1'] as Wall).height).not.toBe(3.4);
    expect((s.project.elements['r1'] as { heightOffset: number }).heightOffset).not.toBe(0.3);
  });

  it('cria o vínculo e localiza origem, cópias e irmãos por papel', () => {
    const s = storeWithLevels(3);
    addWall(s, 'w0', 'lv_0');
    addWall(s, 'w1', 'lv_1');
    addWall(s, 'w2', 'lv_2');
    const link = makeCopyLink(
      ['w0'],
      [
        { levelId: 'lv_1', ids: ['w1'] },
        { levelId: 'lv_2', ids: ['w2'] },
      ],
      mint,
    );
    expect(link.id).toMatch(/^link_/);
    expect(link.sourceIds).toEqual(['w0']);
    expect(link.members.map((m) => m.levelId)).toEqual(['lv_1', 'lv_2']);
    expect(link.createdAt).toBeGreaterThan(0);

    s.exec({ type: 'addCopyLink', link });
    expect(s.project.copyLinks).toHaveLength(1);
    expect(s.undoLabel).toBe('Manter cópias vinculadas');
    expect(copyLinkOf(s.project, 'w0')).toEqual(link);
    expect(copyLinkOf(s.project, 'w2')).toEqual(link);
    expect(copyLinkOf(s.project, 'w9')).toBeNull();

    expect(linkRoleIndex(link, 'w0')).toBe(0);
    expect(linkRoleIndex(link, 'w2')).toBe(0);
    expect(linkRoleIndex(link, 'w9')).toBe(-1);

    expect(linkedSiblings(s.project, link, 'w0')).toEqual(['w1', 'w2']);
    expect(linkedSiblings(s.project, link, 'w1')).toEqual(['w2']);
    expect(linkedSiblings(s.project, link, 'w9')).toEqual([]);
  });

  it('sincroniza 3 cópias em um único batch, preservando id, nível e ordem', () => {
    const s = storeWithLevels(4);
    addWall(s, 'w0', 'lv_0');
    addWall(s, 'w1', 'lv_1');
    addWall(s, 'w2', 'lv_2');
    addWall(s, 'w3', 'lv_3');
    const link = makeCopyLink(
      ['w0'],
      [
        { levelId: 'lv_1', ids: ['w1'] },
        { levelId: 'lv_2', ids: ['w2'] },
        { levelId: 'lv_3', ids: ['w3'] },
      ],
      mint,
    );
    s.exec({ type: 'addCopyLink', link });
    const copies = ['w1', 'w2', 'w3'].map((id) => s.project.elements[id] as Wall);
    const orders = copies.map((w) => w.order);
    const ids = copies.map((w) => w.id);

    s.exec({
      type: 'updateElements',
      ids: ['w0'],
      patch: { a: { x: 1, y: 2 }, b: { x: 6, y: 2 }, height: 3.2, baseOffset: 0.2, sag: 0.4, mark: 'M-1' },
    });
    const cmd = syncLinkedCommand(s.project, { linkId: link.id, fromId: 'w0' });
    if (!cmd || cmd.type !== 'batch') throw new Error('esperava um batch de sincronização');
    expect(cmd.commands).toHaveLength(3);

    s.exec(cmd, 'Sincronizar cópias vinculadas');
    for (const id of ['w1', 'w2', 'w3']) {
      const w = s.project.elements[id] as Wall;
      expect(w.a).toEqual({ x: 1, y: 2 });
      expect(w.b).toEqual({ x: 6, y: 2 });
      expect(w.height).toBe(3.2);
      expect(w.baseOffset).toBe(0.2);
      expect(w.sag).toBe(0.4);
      expect(w.mark).toBe('M-1');
    }
    expect(['w1', 'w2', 'w3'].map((id) => (s.project.elements[id] as Wall).levelId)).toEqual(['lv_1', 'lv_2', 'lv_3']);
    expect(['w1', 'w2', 'w3'].map((id) => (s.project.elements[id] as Wall).id)).toEqual(ids);
    expect(['w1', 'w2', 'w3'].map((id) => (s.project.elements[id] as Wall).order)).toEqual(orders);

    // Um único desfazer devolve as 3 cópias.
    expect(s.undoLabel).toBe('Sincronizar cópias vinculadas');
    s.undo();
    for (const id of ['w1', 'w2', 'w3']) {
      const w = s.project.elements[id] as Wall;
      expect(w.a).toEqual({ x: 0, y: 0 });
      expect(w.height).toBe(2.8);
    }
  });

  it('sincroniza a partir de uma cópia e respeita toIds', () => {
    const s = storeWithLevels(3);
    addWall(s, 'w0', 'lv_0');
    addWall(s, 'w1', 'lv_1');
    addWall(s, 'w2', 'lv_2');
    const link = makeCopyLink(
      ['w0'],
      [
        { levelId: 'lv_1', ids: ['w1'] },
        { levelId: 'lv_2', ids: ['w2'] },
      ],
      mint,
    );
    s.exec({ type: 'addCopyLink', link });
    s.exec({ type: 'updateElements', ids: ['w1'], patch: { mark: 'Vindo da cópia' } });

    const onlyW2 = syncLinkedCommand(s.project, { linkId: link.id, fromId: 'w1', toIds: ['w2'] });
    if (!onlyW2 || onlyW2.type !== 'batch') throw new Error('esperava um batch de sincronização');
    expect(onlyW2.commands).toHaveLength(1);
    expect(onlyW2.commands[0]).toMatchObject({ type: 'updateElements', ids: ['w2'] });
    s.exec(onlyW2);
    expect((s.project.elements.w2 as Wall).mark).toBe('Vindo da cópia');
    // A origem não é tocada quando o fromId é uma cópia.
    expect((s.project.elements.w0 as Wall).mark).toBe('');
  });

  it('remapeia topLevelId por delta de índice e attachTopRoofId para o telhado da cópia', () => {
    const s = storeWithLevels(5);
    addRoof(s, 'r0', 'lv_0');
    addRoof(s, 'r1', 'lv_1');
    addRoof(s, 'r2', 'lv_2');
    addWall(s, 'w0', 'lv_0', { topLevelId: 'lv_1', topOffset: 0.15, attachTopToRoof: true, attachTopRoofId: 'r0' });
    addWall(s, 'w1', 'lv_1', { topLevelId: 'lv_2', topOffset: 0.15, attachTopToRoof: true, attachTopRoofId: 'r1' });
    addWall(s, 'w2', 'lv_2', { topLevelId: 'lv_3', topOffset: 0.15, attachTopToRoof: true, attachTopRoofId: 'r2' });
    const link = makeCopyLink(
      ['w0', 'r0'],
      [
        { levelId: 'lv_1', ids: ['w1', 'r1'] },
        { levelId: 'lv_2', ids: ['w2', 'r2'] },
      ],
      mint,
    );
    s.exec({ type: 'addCopyLink', link });

    const cmd = syncLinkedCommand(s.project, { linkId: link.id, fromId: 'w0' });
    if (!cmd || cmd.type !== 'batch') throw new Error('esperava um batch de sincronização');
    s.exec(cmd);
    expect((s.project.elements.w1 as Wall).topLevelId).toBe('lv_2');
    expect((s.project.elements.w2 as Wall).topLevelId).toBe('lv_3');
    expect((s.project.elements.w1 as Wall).topOffset).toBe(0.15);
    expect((s.project.elements.w1 as Wall).attachTopRoofId).toBe('r1');
    expect((s.project.elements.w2 as Wall).attachTopRoofId).toBe('r2');

    // Topo que estoura o último nível cai para a altura explícita (topLevelId null).
    s.exec({ type: 'updateElements', ids: ['w0'], patch: { topLevelId: 'lv_3' } });
    const overflow = syncLinkedCommand(s.project, { linkId: link.id, fromId: 'w0' });
    if (!overflow || overflow.type !== 'batch') throw new Error('esperava um batch de sincronização');
    s.exec(overflow);
    expect((s.project.elements.w2 as Wall).topLevelId).toBeNull();
  });

  it('abertura sincronizada passa a se hospedar na parede da cópia do mesmo nível', () => {
    const s = storeWithLevels(2);
    addWall(s, 'w0', 'lv_0');
    addWall(s, 'w1', 'lv_1');
    addWall(s, 'w1b', 'lv_1', { a: { x: 0, y: 3 }, b: { x: 4, y: 3 } });
    const door = (id: string, hostId: string, offset: number, flipHand = false): Opening => ({
      id,
      kind: 'door',
      typeId: 'ot_p80',
      hostId,
      offset,
      flipHand,
      flipFacing: false,
      sillOverride: null,
      mark: '',
    });
    s.exec({ type: 'addOpening', opening: door('d0', 'w0', 1) });
    s.exec({ type: 'addOpening', opening: door('d1', 'w1b', 2) });
    const link = makeCopyLink(['w0', 'd0'], [{ levelId: 'lv_1', ids: ['w1', 'd1'] }], mint);
    s.exec({ type: 'addCopyLink', link });
    s.exec({ type: 'updateElements', ids: ['d0'], patch: { offset: 1.2, flipHand: true, flipFacing: true } });

    const cmd = syncLinkedCommand(s.project, { linkId: link.id, fromId: 'd0' });
    if (!cmd || cmd.type !== 'batch') throw new Error('esperava um batch de sincronização');
    s.exec(cmd);
    const d1 = s.project.elements.d1 as Opening;
    expect(d1.hostId).toBe('w1');
    expect(d1.offset).toBe(1.2);
    expect(d1.flipHand).toBe(true);
    expect(d1.flipFacing).toBe(true);
  });

  it('translada a malha do genérico pelo delta de nível ao sincronizar', () => {
    const s = storeWithLevels(3);
    const slab = (z: number): number[] => [0, 0, z, 1, 0, z, 1, 1, z, 0, 1, z];
    const generic = (id: string, levelId: string, z: number): void => {
      s.exec({
        type: 'addGeneric',
        generic: { id, kind: 'generic', levelId, name: 'Viga', sourceClass: 'IFCBEAM', mesh: { positions: slab(z), indices: [0, 1, 2] } },
      });
    };
    generic('g0', 'lv_0', 0);
    generic('g1', 'lv_1', 3);
    generic('g2', 'lv_2', 6);
    expect((s.project.elements.g1 as Generic).order).toBeGreaterThan(0);
    const link = makeCopyLink(
      ['g0'],
      [
        { levelId: 'lv_1', ids: ['g1'] },
        { levelId: 'lv_2', ids: ['g2'] },
      ],
      mint,
    );
    s.exec({ type: 'addCopyLink', link });
    s.exec({ type: 'updateGeneric', id: 'g0', patch: { mesh: { positions: slab(0.5), indices: [0, 1, 2] } } });

    const cmd = syncLinkedCommand(s.project, { linkId: link.id, fromId: 'g0' });
    if (!cmd || cmd.type !== 'batch') throw new Error('esperava um batch de sincronização');
    s.exec(cmd);
    const zs = (id: string): number[] =>
      (s.project.elements[id] as Generic).mesh.positions.filter((_, i) => i % 3 === 2);
    expect(zs('g1')).toEqual([3.5, 3.5, 3.5, 3.5]);
    expect(zs('g2')).toEqual([6.5, 6.5, 6.5, 6.5]);
    expect((s.project.elements.g1 as Generic).levelId).toBe('lv_1');
    expect((s.project.elements.g1 as Generic).id).toBe('g1');
  });

  it('desvincula sem apagar as cópias', () => {
    const s = storeWithLevels(2);
    addWall(s, 'w0', 'lv_0');
    addWall(s, 'w1', 'lv_1');
    const link = makeCopyLink(['w0'], [{ levelId: 'lv_1', ids: ['w1'] }], mint);
    s.exec({ type: 'addCopyLink', link });
    expect(copyLinkOf(s.project, 'w1')).toEqual(link);

    s.exec({ type: 'deleteCopyLink', id: link.id });
    expect(s.project.copyLinks ?? []).toEqual([]);
    expect(copyLinkOf(s.project, 'w1')).toBeNull();
    expect(s.project.elements.w0).toBeDefined();
    expect(s.project.elements.w1).toBeDefined();
    expect(s.undoLabel).toBe('Desvincular');

    s.undo();
    expect(copyLinkOf(s.project, 'w1')).toEqual(link);
  });

  it('não devolve comando quando o vínculo, a origem ou o papel não existem', () => {
    const s = storeWithLevels(2);
    addWall(s, 'w0', 'lv_0');
    const link = makeCopyLink(['w0'], [{ levelId: 'lv_1', ids: ['outro'] }], mint);
    s.exec({ type: 'addCopyLink', link });
    expect(syncLinkedCommand(s.project, { linkId: 'nao_existe', fromId: 'w0' })).toBeNull();
    expect(syncLinkedCommand(s.project, { linkId: link.id, fromId: 'nao_existe' })).toBeNull();
    // Cópia inexistente: não há irmão para receber a sincronização.
    expect(syncLinkedCommand(s.project, { linkId: link.id, fromId: 'w0' })).toBeNull();
  });
});

describe('migração do vínculo de andar-tipo (v22 → v23)', () => {
  it('projeto antigo sem copyLinks passa para a versão atual com nenhum vínculo', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    raw.schemaVersion = 22;
    delete raw.copyLinks;
    const m: Project = migrateProject(raw);
    expect(SCHEMA_VERSION).toBe(25);
    expect(m.schemaVersion).toBe(25);
    expect(m.copyLinks ?? []).toEqual([]);
    expect(m.levels).toHaveLength(2);
  });

  it('vínculo salvo no arquivo é preservado na migração e na ida e volta do JSON', () => {
    const s = storeWithLevels(2);
    addWall(s, 'w0', 'lv_0');
    addWall(s, 'w1', 'lv_1');
    const link: CopyLink = makeCopyLink(['w0'], [{ levelId: 'lv_1', ids: ['w1'] }], mint);
    s.exec({ type: 'addCopyLink', link });
    const volta = migrateProject(JSON.parse(JSON.stringify(s.project)));
    expect(volta.copyLinks).toEqual([link]);
  });
});
