import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, planOf, ProjectStore, type CollabPeer, type CollabPresence, type Project } from '@hestia/model';
import { CollabManager } from './session.ts';
import { InMemoryTransport } from './transport.ts';
import { presencaParaPublicar } from './useCollabIntegration.ts';
import { rotuloDoCursor } from '../ui/collab/CollabPresenceOverlay.tsx';

/** Presença mínima de um peer (o que hoje o colaborar publica, sem disciplina). */
const presenca = (patch: Partial<CollabPresence> = {}): CollabPresence => ({
  view: 'plan',
  levelId: 'lv_0',
  selection: [],
  updatedAt: 1_000,
  ...patch,
});

const peer = (name: string, presence: CollabPresence): Pick<CollabPeer, 'name' | 'presence'> => ({ name, presence });

const projetoComPaisagismo = (): Project => ({
  ...createEmptyProject('Projeto Colaborativo'),
  disciplines: [{ id: 'paisagismo', name: 'Paisagismo' }],
});

describe('Rótulo do cursor remoto com a disciplina do peer', () => {
  it('mostra o nome e a disciplina embutida traduzida', () => {
    const ana = peer('Ana', presenca({ discipline: 'estrutura' }));
    expect(rotuloDoCursor(ana, projetoComPaisagismo(), 'pt')).toBe('Ana · Estrutura');
  });

  it('mostra o nome declarado da disciplina criada no projeto', () => {
    const ana = peer('Ana', presenca({ discipline: 'paisagismo' }));
    expect(rotuloDoCursor(ana, projetoComPaisagismo(), 'pt')).toBe('Ana · Paisagismo');
  });

  it('sem disciplina publicada, mostra só o nome', () => {
    expect(rotuloDoCursor(peer('Ana', presenca()), projetoComPaisagismo(), 'pt')).toBe('Ana');
  });
});

describe('Presença colaborativa transporta a disciplina', () => {
  const managers: CollabManager[] = [];

  afterEach(() => {
    while (managers.length > 0) managers.pop()!.stopSession();
  });

  async function dupla(): Promise<{ host: CollabManager; guest: CollabManager }> {
    const roomId = 'rm_presenca_disciplina';
    const host = new CollabManager();
    const guest = new CollabManager();
    managers.push(host, guest);
    host.attachStore(new ProjectStore(createEmptyProject('Projeto do anfitrião')));
    guest.attachStore(new ProjectStore(createEmptyProject('Projeto do convidado')));
    host.startHosting({ hostName: 'Ana', roomId, transport: new InMemoryTransport(roomId, 'transporte_anfitriao') });
    const link = host.store.getState().links.find((l) => l.role === 'editor')!;
    const entrada = guest.joinSession({
      roomId,
      token: link.token,
      name: 'Beto',
      transport: new InMemoryTransport(roomId, 'transporte_convidado'),
    });
    host.approveJoin(guest.store.getState().myPeerId);
    expect(await entrada).toBe(true);
    return { host, guest };
  }

  it('publica e atualiza a disciplina do peer, sem alterar a presença sem disciplina', async () => {
    const { host, guest } = await dupla();
    const guestId = guest.store.getState().myPeerId;

    guest.publishPresence({ view: 'plan', levelId: 'lv_0', selection: ['w_1'], discipline: 'estrutura' });
    expect(host.store.getState().peers.find((p) => p.id === guestId)?.presence?.discipline).toBe('estrutura');

    // Chave de seleção diferente: republica na hora (sem esperar o limitador de taxa).
    guest.publishPresence({ view: 'plan', levelId: 'lv_0', selection: ['w_2'], discipline: 'hidrossanitario' });
    expect(host.store.getState().peers.find((p) => p.id === guestId)?.presence?.discipline).toBe('hidrossanitario');

    // Compatibilidade: presença antiga (sem `discipline`) continua válida e chega inteira.
    host.publishPresence({ view: 'plan', levelId: 'lv_0', selection: ['w_0'] });
    const hostVisto = guest.store.getState().peers.find((p) => p.id === host.store.getState().myPeerId)?.presence;
    expect(hostVisto?.view).toBe('plan');
    expect(hostVisto?.levelId).toBe('lv_0');
    expect(hostVisto && 'discipline' in hostVisto).toBe(false);
  });
});

describe('Disciplina publicada é a pessoal, não a da vista', () => {
  it('usa minhaDisciplina mesmo com a planta padrão em outra disciplina', () => {
    const base = createEmptyProject('Projeto');
    const projeto: Project = {
      ...base,
      levels: base.levels.map((l) => (l.id === 'lv_0' ? { ...l, discipline: 'hidrossanitario' } : l)),
    };
    expect(planOf(projeto, 'lv_0').discipline).toBe('hidrossanitario');

    const publicada = presencaParaPublicar({
      view: 'plan',
      levelId: 'lv_0',
      sectionId: null,
      sheetId: null,
      selection: ['w_1'],
      minhaDisciplina: 'estrutura',
    });
    expect(publicada.discipline).toBe('estrutura');

    const automatica = presencaParaPublicar({
      view: 'plan',
      levelId: 'lv_0',
      sectionId: null,
      sheetId: null,
      selection: ['w_1'],
      minhaDisciplina: null,
    });
    expect(automatica.discipline).toBeUndefined();
  });
});
