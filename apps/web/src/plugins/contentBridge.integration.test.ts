/**
 * Conteúdo de suplementos ponta a ponta (fase G): instalar o pacote de exemplo, ativar, carregar famílias e materiais
 * (só quando o usuário manda), ver os tipos no projeto, remover com segurança e desfazer em um passo.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createZip, type ZipFile } from '@hestia/io';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { afterEach, describe, expect, it } from 'vitest';
import { createModelPort, setPluginInfoResolver } from './appModelPort.ts';
import { loadContent, previewContent, removeContent } from './contentBridge.ts';
import { pluginRegistry } from './registry.ts';
import { KvPackageStore, MemoryKv } from './supStore.ts';
import { SupplementRuntime } from './supRuntime.ts';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const FAM = 'dev.hestia.familias-exemplo';
const MAT = 'dev.hestia.materiais-exemplo';

function pacote(nome: string): Uint8Array {
  const base = path.join(RAIZ, 'plugins-exemplo', nome);
  const out: ZipFile[] = [];
  const visita = (dir: string): void => {
    for (const n of readdirSync(dir).sort()) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) visita(p);
      else out.push({ path: path.relative(base, p).split(path.sep).join('/'), data: new Uint8Array(readFileSync(p)) });
    }
  };
  visita(base);
  return createZip(out);
}

function montar(): { rt: SupplementRuntime; store: ProjectStore } {
  const store = new ProjectStore(createEmptyProject());
  const { model, data } = createModelPort(() => store);
  const rt = new SupplementRuntime({
    store: new KvPackageStore(new MemoryKv()),
    createWorker: () => { throw new Error('suplemento declarativo não cria Worker'); },
    registry: pluginRegistry, model, data, setInfoResolver: setPluginInfoResolver, defer: (fn) => fn(),
  });
  return { rt, store };
}

afterEach(() => {
  for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
  setPluginInfoResolver((p) => ({ name: p, dataSchema: 1, version: '' }));
});

async function instalarEAtivar(rt: SupplementRuntime, nome: string, id: string, grants: string[]): Promise<void> {
  expect(await rt.install({ kind: 'package', bytes: pacote(nome) })).toMatchObject({ ok: true, id });
  expect(await rt.approve(id, grants)).toMatchObject({ ok: true });
}

describe('famílias-exemplo: instalar, carregar, aparecer no catálogo e desfazer', () => {
  it('nada entra ao ativar; a carga adiciona materiais, portas e paredes em um passo de desfazer', async () => {
    const { rt, store } = montar();
    await instalarEAtivar(rt, 'familias-exemplo', FAM, ['content.families', 'content.materials']);
    // Ativar não carrega nada.
    expect(Object.keys(store.project.openingTypes).filter((k) => k.startsWith(FAM))).toEqual([]);
    const ofertas = await rt.contentOffers();
    const o = ofertas.find((x) => x.pluginId === FAM)!;
    expect(o.families.map((f) => f.id)).toEqual(['portas', 'parede-bloco-grafite', 'parede-drywall-freijo']);

    const prev = previewContent(rt.modelPort, o);
    expect(prev.counts).toMatchObject({ new: 7, invalid: 0 });
    expect(Object.keys(store.project.wallTypes).some((k) => k.startsWith(FAM))).toBe(false);

    const r = loadContent(rt.modelPort, o);
    expect(r.result).toMatchObject({ ok: true });
    // Catálogo: as 3 portas e as 2 paredes aparecem com o prefixo do suplemento.
    expect(Object.keys(store.project.openingTypes).filter((k) => k.startsWith(`${FAM}:`)).sort()).toEqual([`${FAM}:portas-correr-160`, `${FAM}:portas-dupla-160`, `${FAM}:portas-giro-90`]);
    expect(store.project.wallTypes[`${FAM}:parede-bloco-grafite`]?.layers[0]?.materialId).toBe(`${FAM}:pintura-grafite`);
    expect(store.project.materials[`${FAM}:madeira-freijo`]?.color).toBe('#b98b57');
    expect(store.project.openingTypes[`${FAM}:portas-giro-90`]?.frameMaterialId).toBe(`${FAM}:madeira-freijo`);
    // Os tipos do projeto continuam intactos.
    expect(store.project.wallTypes.wt_alv14).toBeDefined();
    expect(store.project.openingTypes.ot_p80).toBeDefined();

    // Recarregar igual não muda nada (já carregado).
    expect(previewContent(rt.modelPort, o).counts).toMatchObject({ unchanged: 7, applied: 0 });

    // Um único Desfazer volta ao estado anterior.
    store.undo();
    expect(Object.keys(store.project.openingTypes).some((k) => k.startsWith(`${FAM}:`))).toBe(false);
    expect(Object.keys(store.project.materials).some((k) => k.startsWith(`${FAM}:`))).toBe(false);
  });

  it('só oferece o que o usuário concedeu e só de suplemento ativo', async () => {
    const { rt } = montar();
    await instalarEAtivar(rt, 'familias-exemplo', FAM, ['content.materials']);
    const o = (await rt.contentOffers()).find((x) => x.pluginId === FAM)!;
    expect(o.families).toEqual([]);
    expect(o.materials).toHaveLength(2);
    await rt.setEnabled(FAM, false);
    expect(await rt.contentOffers()).toEqual([]);
  });

  it('remoção segura: tipo em uso fica, o resto sai, tudo em um passo de desfazer', async () => {
    const { rt, store } = montar();
    await instalarEAtivar(rt, 'familias-exemplo', FAM, ['content.families', 'content.materials']);
    const o = (await rt.contentOffers())[0]!;
    loadContent(rt.modelPort, o);
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: `${FAM}:parede-drywall-freijo`, levelId: store.project.levels[0]!.id, a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
    const r = removeContent(rt.modelPort, FAM);
    expect(r.result).toMatchObject({ ok: true });
    expect(r.plan.items.filter((i) => i.status === 'in-use').map((i) => i.id).sort()).toEqual([`${FAM}:madeira-freijo`, `${FAM}:parede-drywall-freijo`]);
    expect(store.project.wallTypes[`${FAM}:parede-drywall-freijo`]).toBeDefined();
    expect(store.project.wallTypes[`${FAM}:parede-bloco-grafite`]).toBeUndefined();
    expect(store.project.openingTypes[`${FAM}:portas-giro-90`]).toBeUndefined();
    expect(store.project.materials[`${FAM}:pintura-grafite`]).toBeUndefined();
    store.undo();
    expect(store.project.wallTypes[`${FAM}:parede-bloco-grafite`]).toBeDefined();
  });
});

describe('materiais-exemplo: carga e atualização de versão', () => {
  it('carrega os 3 materiais; versão nova com cor diferente vira atualização só se pedida', async () => {
    const { rt, store } = montar();
    await instalarEAtivar(rt, 'materiais-exemplo', MAT, ['content.materials']);
    const o = (await rt.contentOffers())[0]!;
    expect(loadContent(rt.modelPort, o).result).toMatchObject({ ok: true, applied: 4 });
    expect(Object.keys(store.project.materials).filter((k) => k.startsWith(`${MAT}:`))).toHaveLength(3);
    expect(store.project.materials[`${MAT}:vidro-verde`]).toMatchObject({ opacity: 0.35, gloss: 0.9 });
    const v2 = { ...o, version: '1.1.0', materials: o.materials.map((m) => (m.id === 'reboco-claro' ? { ...m, color: '#ffffff' } : m)) };
    expect(previewContent(rt.modelPort, v2).counts).toMatchObject({ update: 1, unchanged: 2, applied: 0 });
    expect(loadContent(rt.modelPort, v2).result).toMatchObject({ ok: true, applied: 0 });
    expect(loadContent(rt.modelPort, v2, { updateExisting: true }).result).toMatchObject({ ok: true });
    expect(store.project.materials[`${MAT}:reboco-claro`]?.color).toBe('#ffffff');
  });

  it('desinstalar o suplemento não apaga o conteúdo já carregado', async () => {
    const { rt, store } = montar();
    await instalarEAtivar(rt, 'materiais-exemplo', MAT, ['content.materials']);
    loadContent(rt.modelPort, (await rt.contentOffers())[0]!);
    await rt.uninstall(MAT);
    expect(store.project.materials[`${MAT}:reboco-claro`]).toBeDefined();
  });
});
