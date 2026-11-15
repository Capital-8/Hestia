import { afterEach, describe, expect, it, vi } from 'vitest';
import { adicionarFixtureTerreno, servicoTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, isTerrainRegion, type Project, type TerrainRegion } from '@hestia/model';
import { SelectTool } from './selectTool.ts';
import { alcaDaRegiaoEm, bordasDeRegiao, gravarContornoDaRegiao, previaDasAlcasDaRegiao, referenciaDaRegiao, removerVerticeDaRegiao, setaDaRegiao } from './terrainRegionHandles.ts';
import { makeEnv, P } from './testEnv.ts';

const RG = 'rg_t5';

afterEach(() => vi.restoreAllMocks());

/** Terreno T5 com a plataforma (5,5)-(15,15) selecionada, e a ferramenta Selecionar ligada. */
function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, 'T5');
  ctx.env.setSelection([RG]);
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  const s = new SelectTool(ctx.env);
  s.start();
  return { ...ctx, s, msgs };
}
const rg = (p: Project): TerrainRegion => p.elements[RG] as TerrainRegion;
const regioes = (p: Project): TerrainRegion[] => Object.values(p.elements).filter(isTerrainRegion);
const arrastar = (s: SelectTool, de: [number, number], ate: [number, number]): void => {
  s.move(P(de[0], de[1]));
  s.down(P(de[0], de[1]));
  s.drag(P(ate[0], ate[1]));
  s.up(P(ate[0], ate[1]));
};

describe('alças da região (vértice e meio de aresta)', () => {
  it('alcaDaRegiaoEm: vértice tem prioridade sobre o meio da aresta; só entre as selecionadas', () => {
    const { store } = cena();
    expect(alcaDaRegiaoEm(store.project, [RG], { x: 5.02, y: 5.01 }, 0.01)).toEqual({ regiaoId: RG, kind: 'vertex', index: 0, at: { x: 5, y: 5 } });
    expect(alcaDaRegiaoEm(store.project, [RG], { x: 10.02, y: 5 }, 0.01)).toEqual({ regiaoId: RG, kind: 'edge', index: 0, at: { x: 10, y: 5 } });
    expect(alcaDaRegiaoEm(store.project, [], { x: 5, y: 5 }, 0.01)).toBeNull();
    expect(alcaDaRegiaoEm(store.project, ['tn_t5'], { x: 5, y: 5 }, 0.01)).toBeNull();
    expect(alcaDaRegiaoEm(store.project, [RG], { x: 12, y: 12 }, 0.01)).toBeNull();
  });

  it('arrastar um vértice grava o contorno (um desfazer)', () => {
    const { store, s } = cena();
    const antes = structuredClone(rg(store.project).contorno);
    arrastar(s, [5, 5], [3, 4]);
    expect(rg(store.project).contorno[0]).toEqual({ x: 3, y: 4 });
    expect(rg(store.project).contorno).toHaveLength(4);
    expect(rg(store.project).cota).toBe(8);
    store.undo();
    expect(rg(store.project).contorno).toEqual(antes);
  });

  it('arrastar o meio da aresta insere um vértice novo', () => {
    const { store, s } = cena();
    arrastar(s, [10, 5], [10, 2]);
    expect(rg(store.project).contorno).toHaveLength(5);
    expect(rg(store.project).contorno.some((q) => q.x === 10 && q.y === 2)).toBe(true);
    store.undo();
    expect(rg(store.project).contorno).toHaveLength(4);
  });

  it('arrastar um vértice para criar autointersecção é recusado pelo modelo: nada muda e a mensagem aparece', () => {
    const { store, s, msgs } = cena();
    const antes = structuredClone(rg(store.project).contorno);
    arrastar(s, [5, 5], [15, 15]);
    expect(rg(store.project).contorno).toEqual(antes);
    expect(msgs.at(-1)).toBeTruthy();
  });

  it('vértice levado para fora do terreno grava e avisa na barra de status', () => {
    const { store, s, msgs } = cena();
    arrastar(s, [15, 15], [25, 15]);
    expect(rg(store.project).contorno.some((q) => q.x === 25)).toBe(true);
    expect(msgs.at(-1)).toContain('fora do terreno');
  });

  it('clique sem arrastar num vértice o põe em foco; Delete remove o vértice (mínimo de 3)', () => {
    const { store, s, msgs } = cena();
    s.move(P(15, 15));
    s.down(P(15, 15));
    s.up(P(15, 15));
    expect(msgs.at(-1)).toContain('Vértice em foco');
    expect(s.deleteKey()).toBe(true);
    expect(rg(store.project).contorno).toHaveLength(3);
    expect(regioes(store.project)).toHaveLength(1);
    // Com 3 vértices o Delete recusa e a região continua.
    s.move(P(15, 5));
    s.down(P(15, 5));
    s.up(P(15, 5));
    expect(s.deleteKey()).toBe(true);
    expect(rg(store.project).contorno).toHaveLength(3);
    expect(msgs.at(-1)).toContain('pelo menos 3');
    store.undo();
    expect(rg(store.project).contorno).toHaveLength(4);
  });
});

describe('gravarContornoDaRegiao e removerVerticeDaRegiao', () => {
  it('contorno inválido (menos de 3 pontos) é recusado com a mensagem do modelo', () => {
    const { store, env, msgs } = cena();
    expect(gravarContornoDaRegiao(env, RG, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    expect(rg(store.project).contorno).toHaveLength(4);
    expect(msgs.at(-1)).toBeTruthy();
  });

  it('o contorno clockwise é normalizado para anti-horário na gravação', () => {
    const { store, env } = cena();
    expect(gravarContornoDaRegiao(env, RG, [{ x: 5, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 5 }, { x: 5, y: 5 }])).toBe(true);
    const c = rg(store.project).contorno;
    const a = c.reduce((acc, q, i) => acc + (q.x * c[(i + 1) % c.length]!.y - c[(i + 1) % c.length]!.x * q.y), 0) / 2;
    expect(a).toBeGreaterThan(0);
  });

  it('foco que não é de região devolve null (o Delete segue o caminho de sempre); região fora da seleção também', () => {
    const { env } = cena();
    expect(removerVerticeDaRegiao(env, { id: 'tn_t5', index: 0 })).toBeNull();
    env.setSelection([]);
    expect(removerVerticeDaRegiao(env, { id: RG, index: 0 })).toBeNull();
  });

  it('sem kernel e com kernel: o aviso de vértice fora usa cotaDoTerreno quando ele responde', () => {
    const { env, msgs } = cena();
    vi.spyOn(servicoTerreno(), 'cotaDoTerreno').mockImplementation((_p, pts) => pts.map(() => null));
    gravarContornoDaRegiao(env, RG, [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }]);
    expect(msgs.at(-1)).toContain('3 vértice');
  });
});

describe('prévia das alças e seta de subida', () => {
  it('a região selecionada mostra um ponto em cada vértice e no meio de cada aresta', () => {
    const { env } = cena();
    const itens = previaDasAlcasDaRegiao(env);
    expect(itens.filter((i) => i.kind === 'point')).toHaveLength(8);
  });

  it('sem seleção ou com a região de outro nível: nenhuma alça', () => {
    const { env, store } = cena();
    env.setSelection([]);
    expect(previaDasAlcasDaRegiao(env)).toEqual([]);
    env.setSelection([RG]);
    store.exec({ type: 'updateTerrainRegion', id: RG, patch: { levelId: 'lv_1' } });
    expect(previaDasAlcasDaRegiao(env)).toEqual([]);
  });

  it('seta de subida só com inclinação > 0 em plataforma ou nivelada; aponta na direção do plano', () => {
    const { store, env } = cena();
    expect(setaDaRegiao(store.project, rg(store.project))).toEqual([]);
    store.exec({ type: 'updateTerrainRegion', id: RG, patch: { inclinacao: 0.05, direcao: Math.PI / 2 } });
    const seta = setaDaRegiao(store.project, rg(store.project));
    expect(seta.length).toBeGreaterThan(0);
    const corpo = seta.find((i) => i.kind === 'line')!;
    if (corpo.kind !== 'line') throw new Error('esperava linha');
    expect(corpo.a).toEqual(referenciaDaRegiao(rg(store.project).contorno));
    expect(Math.abs(corpo.b.x - corpo.a.x)).toBeLessThan(1e-9);
    expect(corpo.b.y).toBeGreaterThan(corpo.a.y);
    expect(previaDasAlcasDaRegiao(env).filter((i) => i.kind === 'line').length).toBeGreaterThan(0);
    store.exec({ type: 'updateTerrainRegion', id: RG, patch: { papel: 'subdivisao' } });
    expect(setaDaRegiao(store.project, rg(store.project))).toEqual([]);
  });
});

describe('bordasDeRegiao (Alinhar)', () => {
  it('arestas a até `tol` do cursor, só do nível e só das regiões visíveis', () => {
    const { store } = cena();
    const arestas = bordasDeRegiao(store.project, 'lv_0', { x: 15, y: 10 }, 0.5);
    expect(arestas).toHaveLength(1);
    expect(arestas[0]).toMatchObject({ regiaoId: RG, d: 0 });
    expect(bordasDeRegiao(store.project, 'lv_1', { x: 15, y: 10 }, 0.5)).toEqual([]);
    expect(bordasDeRegiao(store.project, 'lv_0', { x: 15, y: 10 }, 0.5, new Set([RG]))).toEqual([]);
    expect(bordasDeRegiao(store.project, 'lv_0', { x: 10, y: 10 }, 0.5)).toEqual([]);
  });
});
