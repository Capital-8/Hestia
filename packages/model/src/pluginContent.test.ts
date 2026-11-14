import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { applyPluginBatch } from './pluginCommands.ts';
import { loadedContentIds, planContentLoad, planContentRemoval, type ContentOffer } from './pluginContent.ts';
import { makeWall } from './index.ts';

const P = 'dev.teste.conteudo';
const camadas = [{ function: 'structure', materialId: 'cinza', thickness: 0.1 }];
const porta = { kind: 'door', name: 'Porta teste 80 x 210', width: 0.8, height: 2.1, sill: 0, leaves: 1, plan: 'swing', frameMaterialId: 'cinza' };

const oferta = (over: Partial<ContentOffer> = {}): ContentOffer => ({
  pluginId: P, pluginName: 'Teste', version: '1.0.0',
  materials: [{ id: 'cinza', name: 'Cinza', color: '#808080', gloss: 0.2, opacity: 1 }],
  families: [
    { id: 'parede', category: 'wall', types: [{ name: 'Parede teste', layers: camadas }] },
    { id: 'porta', category: 'opening', types: [porta] },
    { id: 'piso', category: 'floor', types: [{ name: 'Piso teste', layers: camadas }] },
    { id: 'laje', category: 'slab', types: [{ name: 'Laje teste', layers: camadas }] },
    { id: 'forro', category: 'ceiling', types: [{ name: 'Forro teste', layers: camadas }] },
    { id: 'telhado', category: 'roof', types: [{ name: 'Telhado teste', layers: camadas }] },
  ],
  ...over,
});

const novo = (): ProjectStore => new ProjectStore(createEmptyProject());
function carregar(s: ProjectStore, o: ContentOffer, upd = false): ReturnType<typeof planContentLoad> {
  const plan = planContentLoad(s.project, o, { updateExisting: upd });
  const r = applyPluginBatch(s, { pluginId: P, label: 'Teste: carregar', commands: plan.commands, isIssuedId: () => false, dataSchema: 1, version: o.version });
  expect(r.ok).toBe(true);
  return plan;
}

describe('carga de conteúdo de suplemento', () => {
  it('prévia: tudo novo; só entra no projeto pela carga, em um passo de desfazer', () => {
    const s = novo();
    const v0 = s.version;
    const plan = planContentLoad(s.project, oferta());
    expect(plan.counts).toMatchObject({ new: 7, invalid: 0, applied: 7 });
    expect(s.version).toBe(v0);
    expect(s.project.materials[`${P}:cinza`]).toBeUndefined();
    carregar(s, oferta());
    expect(s.project.materials[`${P}:cinza`]).toMatchObject({ color: '#808080', hatch: 'none' });
    expect(s.project.wallTypes[`${P}:parede`]?.layers[0]?.materialId).toBe(`${P}:cinza`);
    expect(s.project.openingTypes[`${P}:porta`]?.frameMaterialId).toBe(`${P}:cinza`);
    expect(s.project.floorTypes[`${P}:piso`]).toBeDefined();
    expect(s.project.slabTypes[`${P}:laje`]).toBeDefined();
    expect(s.project.ceilingTypes[`${P}:forro`]).toBeDefined();
    expect(s.project.roofTypes[`${P}:telhado`]).toBeDefined();
    expect(s.project.plugins?.data?.[P]?.values.content).toMatchObject({ version: '1.0.0' });
    s.undo();
    expect(s.project.materials[`${P}:cinza`]).toBeUndefined();
    expect(s.project.wallTypes[`${P}:parede`]).toBeUndefined();
    expect(s.project.plugins?.data?.[P]?.values.content).toBeUndefined();
  });

  it('recarregar igual = nada a fazer; versão nova com tipo diferente = atualização só se o usuário pedir', () => {
    const s = novo();
    carregar(s, oferta());
    expect(planContentLoad(s.project, oferta()).counts).toMatchObject({ unchanged: 7, new: 0, applied: 0 });
    const v2 = oferta({ version: '2.0.0', families: [{ id: 'parede', category: 'wall', types: [{ name: 'Parede teste v2', layers: camadas }] }], materials: [] });
    const semAtualizar = planContentLoad(s.project, v2);
    expect(semAtualizar.counts).toMatchObject({ update: 1, applied: 0 });
    expect(semAtualizar.commands).toHaveLength(0);
    carregar(s, v2, true);
    expect(s.project.wallTypes[`${P}:parede`]?.name).toBe('Parede teste v2');
  });

  it('recusa o inválido com o validador do app sem impedir o resto', () => {
    const o = oferta({
      materials: [{ id: 'cinza', name: 'Cinza', color: '#808080' }, { id: 'ruim', name: 'Ruim', color: 'vermelho' }, { id: 'opaco', name: 'Opaco', color: '#fff000', opacity: 2 }, { id: 'brilho', name: 'B', color: '#ffffff', gloss: -1 }],
      families: [
        { id: 'porta-ruim', category: 'opening', types: [{ ...porta, plan: 'sliding', leaves: 1, kind: 'door' }, { ...porta, plan: 'inexistente' }] },
        { id: 'sem-material', category: 'floor', types: [{ name: 'X', layers: [{ function: 'structure', materialId: 'nao-existe', thickness: 0.1 }] }] },
        { id: 'sem-camada', category: 'slab', types: [{ name: 'Y', layers: [] }] },
        { id: 'ok', category: 'floor', types: [{ name: 'Z', layers: camadas }] },
      ],
    });
    const plan = planContentLoad(novo().project, o);
    const invalidos = plan.items.filter((i) => i.status === 'invalid').map((i) => i.source);
    expect(invalidos).toEqual(expect.arrayContaining(['ruim', 'opaco', 'brilho', 'porta-ruim', 'sem-material', 'sem-camada']));
    expect(plan.items.find((i) => i.source === 'ok')?.status).toBe('new');
    expect(plan.items.find((i) => i.source === 'cinza')?.status).toBe('new');
  });

  it('seleção de famílias e materiais; vários tipos na família usam key ou posição', () => {
    const o = oferta({ families: [{ id: 'portas', category: 'opening', types: [{ ...porta, key: 'p80' }, { ...porta, name: 'Porta 90', width: 0.9 }] }] });
    const plan = planContentLoad(novo().project, o, { select: { families: new Set(['portas']), materials: new Set() } });
    expect(plan.items.map((i) => i.id)).toEqual([`${P}:portas-p80`, `${P}:portas-2`].map((x) => x));
    expect(plan.items.every((i) => i.status === 'invalid')).toBe(true); // sem o material 'cinza' selecionado
    const completo = planContentLoad(novo().project, o, { select: { families: new Set(['portas']) } });
    expect(completo.items.filter((i) => i.status === 'new').map((i) => i.id)).toEqual(expect.arrayContaining([`${P}:portas-p80`, `${P}:portas-2`, `${P}:cinza`]));
  });
});

describe('remoção segura', () => {
  it('remove o que está livre (tipos e materiais) em um passo de desfazer', () => {
    const s = novo();
    carregar(s, oferta());
    expect(loadedContentIds(s.project, P)).toHaveLength(7);
    const plan = planContentRemoval(s.project, P);
    expect(plan.blocked).toBe(0);
    const r = applyPluginBatch(s, { pluginId: P, label: 'Teste: remover', commands: plan.commands, isIssuedId: () => false, dataSchema: 1 });
    expect(r.ok).toBe(true);
    expect(loadedContentIds(s.project, P)).toHaveLength(0);
    expect(s.project.plugins?.data?.[P]?.values.content).toBeUndefined();
    s.undo();
    expect(loadedContentIds(s.project, P)).toHaveLength(7);
  });

  it('não remove tipo em uso (nem o material que ele usa) e avisa', () => {
    const s = novo();
    carregar(s, oferta());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: `${P}:parede`, levelId: s.project.levels[0]!.id, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addOpening', opening: { id: 'o1', kind: 'door', typeId: `${P}:porta`, hostId: 'w1', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const plan = planContentRemoval(s.project, P);
    const por = (id: string) => plan.items.find((i) => i.id === `${P}:${id}`);
    expect(por('parede')).toMatchObject({ status: 'in-use', uses: 1 });
    expect(por('porta')).toMatchObject({ status: 'in-use', uses: 1 });
    expect(por('cinza')?.status).toBe('in-use');
    expect(por('piso')?.status).toBe('removable');
    expect(plan.blocked).toBeGreaterThan(0);
    expect(applyPluginBatch(s, { pluginId: P, label: 'x', commands: plan.commands, isIssuedId: () => false }).ok).toBe(true);
    expect(s.project.wallTypes[`${P}:parede`]).toBeDefined();
    expect(s.project.floorTypes[`${P}:piso`]).toBeUndefined();
    expect(() => s.exec({ type: 'deleteOpeningType', id: `${P}:porta` })).toThrow();
    expect(() => s.exec({ type: 'deleteMaterial', id: `${P}:cinza` })).toThrow();
  });

  it('plugin só remove o que é dele', () => {
    const s = novo();
    const r = applyPluginBatch(s, { pluginId: P, label: 'x', commands: [{ type: 'deleteMaterial', id: 'mat_tinta' }], isIssuedId: () => false });
    expect(r.ok).toBe(false);
  });
});

describe('escada e rampa', () => {
  it('carrega tipos de escada e rampa clonados dos padrões, validados pelos validadores do app', () => {
    const s = novo();
    const stair = Object.values(s.project.stairTypes)[0]!;
    const ramp = Object.values(s.project.rampTypes)[0]!;
    const o = oferta({ materials: [], families: [
      { id: 'escada', category: 'stair', types: [{ ...stair, name: 'Escada teste' }] },
      { id: 'rampa', category: 'ramp', types: [{ ...ramp, name: 'Rampa teste' }] },
    ] });
    const plan = planContentLoad(s.project, o);
    expect(plan.items.map((i) => i.status)).toEqual(['new', 'new']);
    carregar(s, o);
    expect(s.project.stairTypes[`${P}:escada`]?.name).toBe('Escada teste');
    expect(s.project.rampTypes[`${P}:rampa`]?.name).toBe('Rampa teste');
    const ruim = oferta({ materials: [], families: [{ id: 'rampa-ruim', category: 'ramp', types: [{ ...ramp, name: 'Ruim', defaultSlope: -5 }] }] });
    expect(planContentLoad(s.project, ruim).items[0]?.status).toBe('invalid');
  });
});
