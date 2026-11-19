import { describe, expect, it, vi } from 'vitest';
import type { Patch } from 'immer';
import { createEmptyProject } from './defaults.ts';
import { makeWall } from './wall.ts';
import { ProjectStore } from './history.ts';
import { checkModelIntegrityForCollab, extractTouchedIds } from './collabHistory.ts';
import type { Command } from './commands.ts';
import type { CollabDeltaMeta } from './collabTypes.ts';
import type { Opening, Wall } from './types.ts';

const wall = (id: string, ax = 0, ay = 0, bx = 4, by = 0): Omit<Wall, 'order'> =>
  makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: ax, y: ay }, b: { x: bx, y: by } });

const door = (id: string, hostId: string, offset = 1): Opening => ({
  id,
  kind: 'door',
  typeId: 'ot_p80',
  hostId,
  offset,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
});

describe('collabHistory & ProjectStore multi-autor', () => {
  it('extractTouchedIds extrai IDs de elementos, tipos, níveis e configurações sem colidir em nextOrder', () => {
    const patches: Patch[] = [
      { op: 'add', path: ['elements', 'w1'], value: {} },
      { op: 'replace', path: ['elements', 'w1', 'height'], value: 3 },
      { op: 'replace', path: ['nextOrder'], value: 2 },
      { op: 'replace', path: ['wallTypes', 'wt_alv14', 'name'], value: 'Alvenaria' },
      { op: 'replace', path: ['settings', 'showTags'], value: true },
      { op: 'replace', path: ['levels', 0, 'name'], value: 'Térreo' },
    ];
    expect(extractTouchedIds(patches)).toEqual([
      'w1',
      'type:wt_alv14',
      '__settings__',
      'levels:0',
    ]);
  });

  it('execAsAuthor registra autoria de Ana e Bruno sem disparar onDelta nem alterar autor local', () => {
    const store = new ProjectStore(createEmptyProject());
    const onDelta = vi.fn();
    store.onDelta = onDelta;

    const dAna = store.execAsAuthor('ana', 'Ana', [{ type: 'addWall', wall: wall('w_ana', 0, 0, 4, 0) }]);
    const dBruno = store.execAsAuthor('bruno', 'Bruno', [{ type: 'addWall', wall: wall('w_bruno', 0, 3, 4, 3) }]);

    expect(dAna).not.toBeNull();
    expect(dAna!.authorId).toBe('ana');
    expect(dAna!.authorName).toBe('Ana');
    expect(dAna!.touchedIds).toEqual(['w_ana']);

    expect(dBruno).not.toBeNull();
    expect(dBruno!.authorId).toBe('bruno');
    expect(dBruno!.touchedIds).toEqual(['w_bruno']);

    expect(store.project.elements['w_ana']).toBeDefined();
    expect(store.project.elements['w_bruno']).toBeDefined();
    expect(store.authorId).toBe('local');
    expect(onDelta).not.toHaveBeenCalled();
  });

  it('undoByAuthor(ana) desfaz apenas o passo de Ana após Bruno editar outra parede', () => {
    const store = new ProjectStore(createEmptyProject());
    store.execAsAuthor('ana', 'Ana', [{ type: 'addWall', wall: wall('w_ana', 0, 0, 4, 0) }]);
    store.execAsAuthor('bruno', 'Bruno', [{ type: 'addWall', wall: wall('w_bruno', 0, 3, 4, 3) }]);
    store.execAsAuthor('bruno', 'Bruno', [
      { type: 'updateElements', ids: ['w_bruno'], patch: { height: 3.2 } },
    ]);

    const res = store.undoByAuthor('ana');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.touchedIds).toEqual(['w_ana']);
    }
    expect(store.project.elements['w_ana']).toBeUndefined();
    expect((store.project.elements['w_bruno'] as Wall).height).toBe(3.2);

    const empty = store.undoByAuthor('ana');
    expect(empty).toEqual({ ok: false, reason: 'empty' });
  });

  it('undoByAuthor(ana) retorna conflito quando Bruno modificou a parede de Ana', () => {
    const store = new ProjectStore(createEmptyProject());
    store.execAsAuthor('ana', 'Ana', [{ type: 'addWall', wall: wall('w1', 0, 0, 4, 0) }]);
    store.execAsAuthor('bruno', 'Bruno', [
      { type: 'updateElements', ids: ['w1'], patch: { height: 3.5 } },
    ]);

    const res = store.undoByAuthor('ana');
    expect(res).toEqual({
      ok: false,
      reason: 'conflict',
      conflictAuthor: 'Bruno',
      conflictIds: ['w1'],
    });
    expect((store.project.elements['w1'] as Wall).height).toBe(3.5);

    // Após Bruno desfazer a alteração dele, Ana consegue desfazer a criação da parede.
    expect(store.undoByAuthor('bruno').ok).toBe(true);
    expect(store.undoByAuthor('ana').ok).toBe(true);
    expect(store.project.elements['w1']).toBeUndefined();
  });

  it('undoByAuthor(ana) retorna conflito de integridade quando Bruno colocou porta na parede de Ana', () => {
    const store = new ProjectStore(createEmptyProject());
    store.execAsAuthor('ana', 'Ana', [{ type: 'addWall', wall: wall('w1', 0, 0, 4, 0) }]);
    store.execAsAuthor('bruno', 'Bruno', [{ type: 'addOpening', opening: door('d1', 'w1', 1.5) }]);

    const res = store.undoByAuthor('ana');
    expect(res).toEqual({
      ok: false,
      reason: 'conflict',
      conflictAuthor: 'Bruno',
      conflictIds: ['d1'],
    });
    expect(store.project.elements['w1']).toBeDefined();
    expect(store.project.elements['d1']).toBeDefined();
    expect(checkModelIntegrityForCollab(store.project)).toEqual({ ok: true });
  });

  it('redoByAuthor(ana) restaura a alteração desfeita sem afetar o trabalho de Bruno', () => {
    const store = new ProjectStore(createEmptyProject());
    store.execAsAuthor('ana', 'Ana', [{ type: 'addWall', wall: wall('w_ana', 0, 0, 4, 0) }]);
    store.execAsAuthor('bruno', 'Bruno', [{ type: 'addWall', wall: wall('w_bruno', 0, 4, 4, 4) }]);

    expect(store.undoByAuthor('ana').ok).toBe(true);
    expect(store.project.elements['w_ana']).toBeUndefined();

    const redoRes = store.redoByAuthor('ana');
    expect(redoRes.ok).toBe(true);
    expect(store.project.elements['w_ana']).toBeDefined();
    expect(store.project.elements['w_bruno']).toBeDefined();

    expect(store.redoByAuthor('ana')).toEqual({ ok: false, reason: 'empty' });
  });

  it('applyRemotePatches sincroniza um store convidado de forma idêntica ao anfitrião', () => {
    const host = new ProjectStore(createEmptyProject());
    const guest = new ProjectStore(structuredClone(host.project));
    const guestOnDelta = vi.fn();
    guest.onDelta = guestOnDelta;

    const deltas: CollabDeltaMeta[] = [];
    deltas.push(host.execAsAuthor('ana', 'Ana', [{ type: 'addWall', wall: wall('w1', 0, 0, 5, 0) }])!);
    deltas.push(host.execAsAuthor('bruno', 'Bruno', [{ type: 'addWall', wall: wall('w2', 0, 3, 5, 3) }])!);

    const undoAna = host.undoByAuthor('ana');
    expect(undoAna.ok).toBe(true);
    if (undoAna.ok) {
      deltas.push({
        label: undoAna.label,
        patches: undoAna.patches,
        inverse: undoAna.inverse,
        authorId: 'ana',
        authorName: 'Ana',
        touchedIds: undoAna.touchedIds,
      });
    }

    const redoAna = host.redoByAuthor('ana');
    expect(redoAna.ok).toBe(true);
    if (redoAna.ok) {
      deltas.push({
        label: redoAna.label,
        patches: redoAna.patches,
        inverse: redoAna.inverse,
        authorId: 'ana',
        authorName: 'Ana',
        touchedIds: redoAna.touchedIds,
      });
    }

    deltas.forEach((d, idx) => {
      guest.applyRemotePatches(d.patches, d.inverse, {
        label: d.label,
        authorId: d.authorId,
        authorName: d.authorName,
        seq: idx + 1,
        touchedIds: d.touchedIds,
      });
    });

    expect(guest.project).toEqual(host.project);
    expect(guestOnDelta).not.toHaveBeenCalled();
  });

  it('collabInterceptor intercepta exec e transaction sem mutar store.project nem emitir listeners', () => {
    const store = new ProjectStore(createEmptyProject());
    const intercepted: Array<{ cmds: Command[]; label: string }> = [];
    const listener = vi.fn();
    const onDelta = vi.fn();
    store.subscribe(listener);
    store.onDelta = onDelta;

    store.collabInterceptor = (cmds, label) => {
      intercepted.push({ cmds, label });
      return true;
    };

    const initialVersion = store.version;
    store.exec({ type: 'addWall', wall: wall('w1', 0, 0, 4, 0) });

    expect(intercepted).toHaveLength(1);
    expect(intercepted[0]!.cmds).toHaveLength(1);
    expect(store.project.elements['w1']).toBeUndefined();
    expect(store.version).toBe(initialVersion);
    expect(listener).not.toHaveBeenCalled();
    expect(onDelta).not.toHaveBeenCalled();

    // Transação com comandos encadeados (abertura depende da parede criada na mesma transação)
    store.transaction('Parede com porta', () => {
      store.exec({ type: 'addWall', wall: wall('w2', 0, 0, 4, 0) });
      expect(store.project.elements['w2']).toBeDefined();
      store.exec({ type: 'addOpening', opening: door('d1', 'w2', 2) });
    });

    expect(intercepted).toHaveLength(2);
    expect(intercepted[1]!.label).toBe('Parede com porta');
    expect(intercepted[1]!.cmds.map((c) => c.type)).toEqual(['addWall', 'addOpening']);
    expect(store.project.elements['w2']).toBeUndefined();
    expect(store.project.elements['d1']).toBeUndefined();
    expect(store.version).toBe(initialVersion);
    expect(store.canUndo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(onDelta).not.toHaveBeenCalled();

    // Erro dentro de transação interceptada restaura basePresent sem acionar interceptor
    expect(() =>
      store.transaction('Inválida', () => {
        store.exec({ type: 'addWall', wall: wall('w3', 0, 0, 4, 0) });
        throw new Error('falha');
      }),
    ).toThrow('falha');
    expect(intercepted).toHaveLength(2);
    expect(store.project.elements['w3']).toBeUndefined();

    // Quando collabInterceptor retorna false, aplica normalmente e dispara onDelta
    store.collabInterceptor = () => false;
    store.setAuthor('host', 'Anfitrião');
    store.exec({ type: 'addWall', wall: wall('w4', 0, 0, 4, 0) });
    expect(store.project.elements['w4']).toBeDefined();
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta.mock.calls[0]![0]).toMatchObject({
      authorId: 'host',
      authorName: 'Anfitrião',
      touchedIds: ['w4'],
    });
  });
});
