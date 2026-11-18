import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { ProjectStore, TERRENO_LIMITES, createEmptyProject, type Terrain } from '@hestia/model';
import { createTool, type ToolId } from './registry.ts';
import { TerrainEditTool } from './terrainEditTool.ts';
import { limparIndicesDasFontes } from './terrainEditPick.ts';
import { clickAt, makeEnv, P } from './testEnv.ts';

function cena(nome: 'T3' | 'T1' = 'T3') {
  limparIndicesDasFontes();
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, nome);
  const id = `tn_${nome.toLowerCase()}`;
  const tn = (): Terrain => ctx.store.project.elements[id] as Terrain;
  const ferramenta = (t: ToolId) => {
    const f = createTool(t, ctx.env);
    f.start();
    return f;
  };
  return { ctx, tn, ferramenta, id };
}

describe('Rótulo de curva (terrainLabel): dois cliques', () => {
  it('cria a linha de rótulo no terreno único do nível (um desfazer) e fica ativa para outra', () => {
    const { ctx, tn, ferramenta } = cena();
    const f = ferramenta('terrainLabel');
    expect(f.id).toBe('terrainLabel');
    clickAt(f, 2, 10);
    expect(tn().linhasRotulo).toEqual([]);
    clickAt(f, 18, 10);
    expect(tn().linhasRotulo).toEqual([2, 10, 18, 10]);
    expect(ctx.done()).toBe(0);
    clickAt(f, 10, 2);
    clickAt(f, 10, 18);
    expect(tn().linhasRotulo).toEqual([2, 10, 18, 10, 10, 2, 10, 18]);
    ctx.store.undo();
    expect(tn().linhasRotulo).toEqual([2, 10, 18, 10]);
  });

  it('usa o terreno selecionado quando há vários', () => {
    const { ctx, tn, ferramenta } = cena();
    adicionarFixtureTerreno(ctx.store, 'T1');
    ctx.env.setSelection(['tn_t3']);
    const f = ferramenta('terrainLabel');
    clickAt(f, 1, 1);
    clickAt(f, 5, 5);
    expect(tn().linhasRotulo).toEqual([1, 1, 5, 5]);
    expect((ctx.store.project.elements['tn_t1'] as Terrain).linhasRotulo).toEqual([]);
  });

  it('sem terreno alvo (vários e nenhum selecionado) avisa e não grava; Esc cancela a linha e depois sai', () => {
    const { ctx, tn, ferramenta } = cena();
    adicionarFixtureTerreno(ctx.store, 'T1');
    const msgs: string[] = [];
    ctx.env.say = (m) => { msgs.push(m); };
    const f = ferramenta('terrainLabel');
    clickAt(f, 1, 1);
    expect(msgs.at(-1)).toMatch(/Selecione um terreno/);
    expect(tn().linhasRotulo).toEqual([]);
    ctx.env.setSelection(['tn_t3']);
    clickAt(f, 1, 1);
    f.cancel();
    expect(ctx.done()).toBe(0);
    clickAt(f, 2, 2);
    expect(tn().linhasRotulo).toEqual([]);
    f.cancel();
    f.cancel();
    expect(ctx.done()).toBe(1);
  });

  it('comprimento digitado fixa o 2º ponto; segundo clique no mesmo lugar não cria', () => {
    const { tn, ferramenta } = cena();
    const f = ferramenta('terrainLabel');
    clickAt(f, 0, 0);
    clickAt(f, 0, 0);
    expect(tn().linhasRotulo).toEqual([]);
    f.move(P(10, 0));
    expect(f.type('5')).toBe(true);
    expect(tn().linhasRotulo).toHaveLength(4);
    expect(tn().linhasRotulo.slice(0, 2)).toEqual([0, 0]);
    expect(f.tempDims?.()).toEqual([]);
  });

  it('respeita o limite de linhas de rótulo', () => {
    const { ctx, tn, ferramenta } = cena();
    const v = Array.from({ length: TERRENO_LIMITES.linhasRotulo * 4 }, (_, i) => i % 7);
    ctx.store.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'setLinhasRotulo', v }] });
    const f = ferramenta('terrainLabel');
    clickAt(f, 1, 1);
    clickAt(f, 5, 5);
    expect(tn().linhasRotulo).toHaveLength(TERRENO_LIMITES.linhasRotulo * 4);
  });
});

describe('Cota de ponto (terrainSpot): um clique', () => {
  it('cada clique grava um ponto cotado (um desfazer cada); Esc sai', () => {
    const { ctx, tn, ferramenta } = cena();
    const f = ferramenta('terrainSpot');
    expect(f.id).toBe('terrainSpot');
    clickAt(f, 4, 6);
    clickAt(f, 12, 7);
    expect(tn().pontosCotados).toEqual([4, 6, 12, 7]);
    ctx.store.undo();
    expect(tn().pontosCotados).toEqual([4, 6]);
    f.cancel();
    expect(ctx.done()).toBe(1);
  });

  it('sem terreno alvo avisa; respeita o limite de pontos cotados', () => {
    const { ctx, tn, ferramenta } = cena();
    adicionarFixtureTerreno(ctx.store, 'T1');
    const f = ferramenta('terrainSpot');
    clickAt(f, 1, 1);
    expect(tn().pontosCotados).toEqual([]);
    ctx.env.setSelection(['tn_t3']);
    ctx.store.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'setPontosCotados', v: Array.from({ length: TERRENO_LIMITES.pontosCotados * 2 }, (_, i) => i % 9) }] });
    clickAt(f, 3, 3);
    expect(tn().pontosCotados).toHaveLength(TERRENO_LIMITES.pontosCotados * 2);
  });
});

describe('Apagar rótulo e ponto cotado no modo de edição', () => {
  it('criados pelas ferramentas, escolhidos no modo de edição e removidos com Delete (um desfazer cada)', () => {
    const { ctx, tn } = cena();
    const rotulo = createTool('terrainLabel', ctx.env);
    rotulo.start();
    clickAt(rotulo, 2, 10);
    clickAt(rotulo, 18, 10);
    const spot = createTool('terrainSpot', ctx.env);
    spot.start();
    clickAt(spot, 5, 3);
    expect(tn().linhasRotulo).toHaveLength(4);
    expect(tn().pontosCotados).toHaveLength(2);

    ctx.env.setSelection(['tn_t3']);
    const ed = new TerrainEditTool(ctx.env);
    ed.start();
    ed.down(P(5.02, 3));
    ed.up(P(5.02, 3));
    expect(ed.selecionado).toEqual({ tipo: 'cotado', i: 0 });
    expect(ed.deleteKey()).toBe(true);
    expect(tn().pontosCotados).toEqual([]);

    ed.down(P(12, 10.03));
    ed.up(P(12, 10.03));
    expect(ed.selecionado).toEqual({ tipo: 'rotulo', i: 0 });
    expect(ed.deleteKey()).toBe(true);
    expect(tn().linhasRotulo).toEqual([]);

    ctx.store.undo();
    expect(tn().linhasRotulo).toEqual([2, 10, 18, 10]);
    ctx.store.undo();
    expect(tn().pontosCotados).toEqual([5, 3]);
  });
});
