import { afterEach, describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { createEmptyProject, isTerrain, isTerrainRegion, ProjectStore, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import { clipboardFrom } from './clipboard.ts';
import { setPasteClip } from './pasteTool.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

const TN = 'tn_t5';
const RG = 'rg_t5';

/** Terreno T5 (quadrado 0..20 cota 10) com a plataforma (5,5)-(15,15), no `lv_0`. */
function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, 'T5');
  setPasteClip(clipboardFrom(ctx.store.project, [TN])!);
  return ctx;
}
const terrenos = (p: Project): Terrain[] => Object.values(p.elements).filter(isTerrain);
const regioes = (p: Project): TerrainRegion[] => Object.values(p.elements).filter(isTerrainRegion);
const foto = (p: Project): unknown => structuredClone({ t: terrenos(p), r: regioes(p) });

afterEach(() => setPasteClip(null));

describe('Colar com prévia: terreno e região acompanham o cursor', () => {
  it('a prévia desenha o terreno e a região no deslocamento do cursor (ids do terreno e da região entram)', () => {
    const { env } = cena();
    const c = tool('paste', env);
    // Âncora = centro do conteúdo (10, 10); o cursor em (40, 10) desloca 30 m em x.
    c.move(P(40, 10));
    const itens = c.preview();
    const pontos = itens.filter((i) => i.kind === 'polygon').flatMap((i) => (i.kind === 'polygon' ? i.ring : []));
    expect(pontos.some((q) => q.x === 30 && q.y === 0), 'o contorno do terreno não foi deslocado').toBe(true);
    expect(pontos.some((q) => q.x === 35 && q.y === 5), 'o contorno da região não foi deslocado').toBe(true);
  });
});

describe('Colar com deslocamento: o terreno entra deslocado, com a região remapeada para o terreno novo', () => {
  it('o buffer com terreno e região, colado a 30 m, entra deslocado e a região aponta para o terreno novo', () => {
    const { store, env } = cena();
    const original = structuredClone(terrenos(store.project).find((t) => t.id === TN));
    const c = tool('paste', env);
    clickAt(c, 40, 10);
    const novo = terrenos(store.project).find((t) => t.id !== TN)!;
    expect(novo.pontos).toEqual([30, 0, 10, 50, 0, 10, 50, 20, 10, 30, 20, 10]);
    const novaRg = regioes(store.project).find((r) => r.id !== RG)!;
    expect(novaRg.terrenoId).toBe(novo.id);
    expect(novaRg.contorno[0]).toEqual({ x: 35, y: 5 });
    expect(novaRg.papel).toBe('plataforma');
    expect(novaRg.cota).toBe(8);
    expect(tn(store.project)).toEqual(original);
    expect(rg(store.project).terrenoId).toBe(TN);
  });

  it('um desfazer remove o terreno e a região colados', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const c = tool('paste', env);
    clickAt(c, 40, 10);
    expect(terrenos(store.project)).toHaveLength(2);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

function tn(p: Project, id = TN): Terrain {
  return p.elements[id] as Terrain;
}
function rg(p: Project, id = RG): TerrainRegion {
  return p.elements[id] as TerrainRegion;
}
