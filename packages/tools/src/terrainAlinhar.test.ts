import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { createEmptyProject, isTerrain, isTerrainRegion, ProjectStore, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import { applyAlignMany } from './alignApply.ts';
import { alignFeaturesAt, type AlignFeature } from './alignFeatures.ts';
import { solveAlign } from './alignSolve.ts';
import { bordasDeTerreno } from './terrainHandles.ts';
import { makeEnv } from './testEnv.ts';

const TN = 'tn_t5';
const RG = 'rg_t5';

/** Terreno T5 (quadrado 0..20 cota 10) com a plataforma (5,5)-(15,15), no `lv_0`. */
function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, 'T5');
  return ctx;
}
const tn = (p: Project): Terrain => p.elements[TN] as Terrain;
const rg = (p: Project): TerrainRegion => p.elements[RG] as TerrainRegion;
const foto = (p: Project): unknown => structuredClone({ t: Object.values(p.elements).filter(isTerrain), r: Object.values(p.elements).filter(isTerrainRegion) });

/** Feição de borda do terreno sob o ponto (x, y), no nível `lv_0`. */
function bordaEm(p: Project, x: number, y: number): AlignFeature {
  const f = alignFeaturesAt({ project: p, levelId: 'lv_0', at: { x, y }, metersPerPixel: 0.01 }).find((q) => q.kind === 'bordaTerreno');
  if (!f) throw new Error(`sem feição de borda do terreno em (${x}, ${y})`);
  return f;
}

/** Reta de referência vertical em x (a parede fixa de cima de que o terreno se alinha). */
const referenciaVertical = (x: number) => ({ p: { x, y: 0 }, d: { x: 0, y: 1 } });

describe('Alinhar do terreno: a borda é a feição, a política é transladar', () => {
  it('a borda do terreno vira feição bordaTerreno com alvo terreno, no nível dele', () => {
    const { store } = cena();
    const f = bordaEm(store.project, 20, 10);
    expect(f.move).toEqual({ policy: 'transladar', target: 'terreno', id: TN });
    expect(alignFeaturesAt({ project: store.project, levelId: 'lv_1', at: { x: 20, y: 10 }, metersPerPixel: 0.01 }).some((q) => q.kind === 'bordaTerreno')).toBe(false);
  });

  it('com a borda do modelo, só as arestas dela contam (não a envoltória das fontes)', () => {
    const { store } = cena();
    store.exec({ type: 'editTerrainFontes', terrenoId: TN, ops: [{ op: 'setBorda', xy: [0, 0, 20, 0, 20, 10, 0, 10] }] });
    expect(bordaEm(store.project, 20, 5).seg).toEqual({ a: { x: 20, y: 0 }, b: { x: 20, y: 10 } });
    const fora = alignFeaturesAt({ project: store.project, levelId: 'lv_0', at: { x: 20, y: 15 }, metersPerPixel: 0.01 });
    expect(fora.some((q) => q.kind === 'bordaTerreno')).toBe(false);
  });
});

describe('bordasDeTerreno: arestas da borda a até `tol` do cursor', () => {
  it('sem borda do modelo, usa a envoltória das fontes: só a aresta a até `tol` do cursor entra, com a distância', () => {
    const { store } = cena();
    const arestas = bordasDeTerreno(store.project, 'lv_0', { x: 20, y: 10 }, 0.5);
    expect(arestas).toHaveLength(1);
    expect(arestas[0]).toMatchObject({ terrenoId: TN, nome: 'T5', d: 0 });
  });

  it('terreno de outro nível e terreno oculto ficam de fora', () => {
    const { store } = cena();
    expect(bordasDeTerreno(store.project, 'lv_1', { x: 20, y: 10 }, 0.5)).toEqual([]);
    expect(bordasDeTerreno(store.project, 'lv_0', { x: 20, y: 10 }, 0.5, new Set([TN]))).toEqual([]);
  });
});

describe('Alinhar do terreno: translada o terreno e a região junto; desfazer devolve tudo', () => {
  it('alinhar a borda direita (x = 20) a uma referência em x = 30 translada 10 m; a região anda junto', () => {
    const { store, env } = cena();
    const sol = solveAlign(referenciaVertical(30), bordaEm(store.project, 20, 10), store.project);
    expect(sol).toMatchObject({ kind: 'transladar', target: 'terreno', id: TN });
    expect(applyAlignMany(env, [sol], 'Alinhar').applied).toBe(1);
    expect(tn(store.project).pontos.filter((_, i) => i % 3 === 0)).toEqual([10, 30, 30, 10]);
    expect(tn(store.project).pontos.filter((_, i) => i % 3 === 2)).toEqual([10, 10, 10, 10]);
    expect(rg(store.project).contorno[0]).toEqual({ x: 15, y: 5 });
  });

  it('desfazer (um só passo) devolve o terreno e a região', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const sol = solveAlign(referenciaVertical(30), bordaEm(store.project, 20, 10), store.project);
    applyAlignMany(env, [sol], 'Alinhar');
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('já alinhado não muda nada', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const sol = solveAlign(referenciaVertical(20), bordaEm(store.project, 20, 10), store.project);
    expect(sol).toEqual({ kind: 'nada' });
    expect(applyAlignMany(env, [sol], 'Alinhar').applied).toBe(0);
    expect(foto(store.project)).toEqual(antes);
  });
});
