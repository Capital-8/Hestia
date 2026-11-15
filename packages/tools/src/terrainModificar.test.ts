import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, isTerrain, isTerrainRegion, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import { clipboardFrom, copyableIds, pasteAlignedCommand } from './clipboard.ts';
import { pasteAlignedToLevelsCommand } from './pasteLevels/command.ts';
import { comandosMoverNoCorte } from './sectionMoverElementos.ts';
import { selectedMovables } from './edit.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

const TN = 'tn_t5';
const RG = 'rg_t5';

/** Terreno T5 (4 pontos cota 10) com a plataforma (5,5)-(15,15) cota 8, no `lv_0`. */
function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, 'T5');
  ctx.env.setSelection([TN]);
  return ctx;
}
const terrenos = (p: Project): Terrain[] => Object.values(p.elements).filter(isTerrain);
const regioes = (p: Project): TerrainRegion[] => Object.values(p.elements).filter(isTerrainRegion);
const tn = (p: Project, id = TN): Terrain => p.elements[id] as Terrain;
const rg = (p: Project, id = RG): TerrainRegion => p.elements[id] as TerrainRegion;
const foto = (p: Project): unknown => structuredClone({ t: terrenos(p), r: regioes(p) });

describe('seleção do terreno leva as regiões', () => {
  it('selectedMovables: terreno e regiões dele; a região sozinha também entra (ficha T3)', () => {
    const { store } = cena();
    expect(selectedMovables(store.project, [TN])).toEqual([TN, RG]);
    expect(selectedMovables(store.project, [RG])).toEqual([RG]);
    expect(selectedMovables(store.project, [TN, RG])).toEqual([TN, RG]);
  });
});

describe('Mover: o terreno leva a região; desfazer devolve tudo', () => {
  it('translada pontos e contorno; z, cota e papel não mudam', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const m = tool('move', env);
    clickAt(m, 0, 0);
    clickAt(m, 3, 2);
    expect(tn(store.project).pontos).toEqual([3, 2, 10, 23, 2, 10, 23, 22, 10, 3, 22, 10]);
    expect(rg(store.project).contorno[0]).toEqual({ x: 8, y: 7 });
    expect(rg(store.project).cota).toBe(8);
    expect(terrenos(store.project)).toHaveLength(1);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Copiar: a cópia vem com as regiões remapeadas para o terreno novo', () => {
  it('cria terreno e região novos; a região nova aponta para o terreno novo e o original fica intacto', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const c = tool('copy', env);
    clickAt(c, 0, 0);
    clickAt(c, 30, 0);
    c.cancel();
    expect(terrenos(store.project)).toHaveLength(2);
    expect(regioes(store.project)).toHaveLength(2);
    const novoTn = terrenos(store.project).find((t) => t.id !== TN)!;
    const novaRg = regioes(store.project).find((r) => r.id !== RG)!;
    expect(novaRg.terrenoId).toBe(novoTn.id);
    expect(rg(store.project).terrenoId).toBe(TN);
    expect(novoTn.pontos).toEqual([30, 0, 10, 50, 0, 10, 50, 20, 10, 30, 20, 10]);
    expect(novaRg.contorno[0]).toEqual({ x: 35, y: 5 });
    expect(novaRg.papel).toBe('plataforma');
    expect(novaRg.cota).toBe(8);
    expect(tn(store.project).pontos).toEqual([0, 0, 10, 20, 0, 10, 20, 20, 10, 0, 20, 10]);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Girar e Espelhar: terreno e região juntos', () => {
  it('girar 90 graus em torno da origem: pontos, contorno e direção da região', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const r = tool('rotate', env);
    clickAt(r, 0, 0);
    expect(r.type('90')).toBe(true);
    const p0 = tn(store.project).pontos;
    expect(p0[3]).toBeCloseTo(0, 9); // (20, 0) -> (0, 20)
    expect(p0[4]).toBeCloseTo(20, 9);
    expect(p0[5]).toBe(10);
    expect(rg(store.project).direcao).toBeCloseTo(Math.PI / 2, 9);
    expect(rg(store.project).contorno).toHaveLength(4);
    expect(rg(store.project).contorno.some((q) => Math.abs(q.x + 5) < 1e-9 && Math.abs(q.y - 5) < 1e-9)).toBe(true);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('espelhar por x = -1: pontos, contorno (ordem invertida, anti-horário) e direção da região', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const m = tool('mirror', env);
    clickAt(m, -1, -1);
    clickAt(m, -1, 5);
    expect(tn(store.project).pontos.slice(0, 3)).toEqual([-2, 0, 10]); // (0, 0) -> (-2, 0)
    expect(rg(store.project).direcao).toBeCloseTo(Math.PI, 9); // 2φ − direção, com φ = 90 graus
    const c = rg(store.project).contorno;
    const area = c.reduce((s, q, i) => s + (q.x * c[(i + 1) % c.length]!.y - c[(i + 1) % c.length]!.x * q.y), 0) / 2;
    expect(area).toBeGreaterThan(0); // continua anti-horário
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Matriz: cópias do terreno com as regiões remapeadas; um desfazer', () => {
  it('matriz linear de 3 itens: 3 terrenos e 3 regiões, cada região no seu terreno', () => {
    const { store, env, options } = cena();
    const antes = foto(store.project);
    options.arrayCount = 3;
    const a = tool('array', env);
    clickAt(a, 0, 0);
    clickAt(a, 30, 0);
    expect(terrenos(store.project)).toHaveLength(3);
    expect(regioes(store.project)).toHaveLength(3);
    for (const r of regioes(store.project)) expect(terrenos(store.project).some((t) => t.id === r.terrenoId)).toBe(true);
    const donos = new Set(regioes(store.project).map((r) => r.terrenoId));
    expect(donos.size).toBe(3);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Apagar: o terreno leva as regiões; desfazer devolve', () => {
  it('deleteElements do terreno apaga a região na mesma transação', () => {
    const { store } = cena();
    const antes = foto(store.project);
    store.exec({ type: 'deleteElements', ids: [TN] });
    expect(terrenos(store.project)).toHaveLength(0);
    expect(regioes(store.project)).toHaveLength(0);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Copiar e colar', () => {
  it('o buffer leva o terreno e as regiões; o colar remapeia a região para o terreno novo; um desfazer', () => {
    const { store } = cena();
    const antes = foto(store.project);
    const clip = clipboardFrom(store.project, [TN])!;
    expect(clip.terrains).toHaveLength(1);
    expect(clip.terrainRegions).toHaveLength(1);
    expect(copyableIds(store.project, [TN])).toEqual([TN, RG]);
    const r = pasteAlignedCommand(store.project, clip, 'lv_1')!;
    expect(r.terrainIds).toHaveLength(1);
    expect(r.terrainRegionIds).toHaveLength(1);
    store.exec(r.command);
    expect(terrenos(store.project)).toHaveLength(2);
    expect(tn(store.project, r.terrainIds[0]).levelId).toBe('lv_1');
    expect(rg(store.project, r.terrainRegionIds[0]).terrenoId).toBe(r.terrainIds[0]);
    expect(rg(store.project, r.terrainRegionIds[0]).terrenoId).not.toBe(TN);
    expect(rg(store.project).terrenoId).toBe(TN);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('colar entre pavimentos: o terreno fica de fora (cotas absolutas, um só para todos os níveis)', () => {
    const { store } = cena();
    const clip = clipboardFrom(store.project, [TN])!;
    expect(pasteAlignedToLevelsCommand(store.project, clip, ['lv_0', 'lv_1'])).toBeNull();
  });
});

describe('Mover no corte', () => {
  const u = { x: 1, y: 0 };

  it('vertical: soma o deslocamento a TODAS as cotas das fontes (um comando) e à cota da região; desfazer volta', () => {
    const { store } = cena();
    const antes = foto(store.project);
    const r = comandosMoverNoCorte(store.project, [TN], u, 0, 2.5);
    const edicoes = r.commands.filter((c) => c.type === 'editTerrainFontes');
    expect(edicoes).toHaveLength(1);
    store.transaction('Mover no corte', () => r.commands.forEach((c) => store.exec(c)));
    expect(tn(store.project).pontos.filter((_, i) => i % 3 === 2)).toEqual([12.5, 12.5, 12.5, 12.5]);
    expect(rg(store.project).cota).toBe(10.5);
    expect(tn(store.project).pontos.filter((_, i) => i % 3 !== 2)).toEqual([0, 0, 20, 0, 20, 20, 0, 20]);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('vertical com curvas e quebras: z de curva e z de cada vértice de quebra sobem', () => {
    const ctx = makeEnv(new ProjectStore(createEmptyProject()));
    adicionarFixtureTerreno(ctx.store, 'T4');
    ctx.store.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t4', ops: [{ op: 'addCurva', z: 1, xy: [2, 2, 8, 2, 8, 8], fechada: false }] });
    const r = comandosMoverNoCorte(ctx.store.project, ['tn_t4'], u, 0, -1);
    ctx.store.transaction('v', () => r.commands.forEach((c) => ctx.store.exec(c)));
    const t = tn(ctx.store.project, 'tn_t4');
    expect(t.curvas[0]!.z).toBe(0);
    expect(t.quebras[0]!.xyz.filter((_, i) => i % 3 === 2)).toEqual([-1, -1]);
    expect(t.pontos.filter((_, i) => i % 3 === 2)).toEqual([1, 1, 1, 1]);
  });

  it('horizontal é um `transform` de translação que leva as regiões; sem corte vertical', () => {
    const { store } = cena();
    const r = comandosMoverNoCorte(store.project, [TN], u, 3, 0);
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]).toMatchObject({ type: 'transform', ids: [TN, RG] });
    store.exec(r.commands[0]!);
    expect(tn(store.project).pontos.slice(0, 3)).toEqual([3, 0, 10]);
    expect(rg(store.project).contorno[0]).toEqual({ x: 8, y: 5 });
  });

  it('copiar no corte (horizontal e vertical): terreno novo com a região remapeada e as cotas somadas', () => {
    const { store } = cena();
    const antes = foto(store.project);
    const r = comandosMoverNoCorte(store.project, [TN], u, 40, 1, true);
    expect(r.copias).toHaveLength(1);
    store.transaction('Copiar no corte', () => r.commands.forEach((c) => store.exec(c)));
    const novo = tn(store.project, r.copias[0]!);
    expect(novo.pontos.slice(0, 3)).toEqual([40, 0, 11]);
    const novaRg = regioes(store.project).find((x) => x.id !== RG)!;
    expect(novaRg.terrenoId).toBe(novo.id);
    expect(novaRg.cota).toBe(9);
    expect(tn(store.project).pontos[2]).toBe(10); // o original não mudou
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});
