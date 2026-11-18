import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { ProjectStore, aplicarOpsFontes, createEmptyProject, makeLevel, makeTerrain, type Terrain } from '@hestia/model';
import { gravarOps, opsBorda, opsCota, opsCotado, opsCurva, opsMover, opsPonto, opsQuebra, opsRemover, opsRemoverBorda, opsRotulo, terrenoAlvo, terrenoDaSelecao } from './terrainEditGestos.ts';
import { makeEnv } from './testEnv.ts';

const base = (): Terrain => ({
  ...makeTerrain({ id: 'tn_x', levelId: 'lv_0' }),
  order: 0,
  pontos: [0, 0, 1, 10, 0, 2],
  curvas: [{ z: 5, xy: [2, 2, 8, 2, 8, 8], fechada: true }, { z: 6, xy: [1, 1, 2, 2], fechada: false }],
  quebras: [{ xyz: [1, 9, 3, 9, 9, 4, 5, 5, 4] }],
  linhasRotulo: [0, 5, 10, 5, 0, 6, 10, 6],
  pontosCotados: [5, 8, 6, 9],
});
const aplica = (tn: Terrain, ops: ReturnType<typeof opsMover>): Terrain => aplicarOpsFontes(tn, ops);

describe('terrainEditGestos: operações de cada gesto', () => {
  it('mover mantém a cota; rótulo e ponto cotado não se arrastam', () => {
    const tn = base();
    expect(aplica(tn, opsMover(tn, { tipo: 'ponto', i: 1 }, 11, 1)).pontos).toEqual([0, 0, 1, 11, 1, 2]);
    expect(aplica(tn, opsMover(tn, { tipo: 'curva', i: 0, j: 1 }, 9, 3)).curvas[0]!.xy).toEqual([2, 2, 9, 3, 8, 8]);
    expect(aplica(tn, opsMover(tn, { tipo: 'quebra', i: 0, j: 2 }, 6, 6)).quebras[0]!.xyz).toEqual([1, 9, 3, 9, 9, 4, 6, 6, 4]);
    expect(opsMover(tn, { tipo: 'rotulo', i: 0 }, 1, 1)).toEqual([]);
    expect(opsMover(tn, { tipo: 'cotado', i: 0 }, 1, 1)).toEqual([]);
  });

  it('cota: do ponto, da CURVA INTEIRA e do vértice da quebra', () => {
    const tn = base();
    expect(aplica(tn, opsCota(tn, { tipo: 'ponto', i: 0 }, 7)).pontos).toEqual([0, 0, 7, 10, 0, 2]);
    const c = aplica(tn, opsCota(tn, { tipo: 'curva', i: 0, j: 2 }, 9));
    expect(c.curvas[0]!.z).toBe(9);
    expect(c.curvas[1]!.z).toBe(6);
    expect(aplica(tn, opsCota(tn, { tipo: 'quebra', i: 0, j: 1 }, 0)).quebras[0]!.xyz).toEqual([1, 9, 3, 9, 9, 0, 5, 5, 4]);
    expect(opsCota(tn, { tipo: 'rotulo', i: 0 }, 1)).toEqual([]);
  });

  it('remover: ponto inteiro; vértice de curva ou de quebra sai só ele; abaixo de 2 pontos a linha toda sai', () => {
    const tn = base();
    expect(aplica(tn, opsRemover(tn, { tipo: 'ponto', i: 0 })).pontos).toEqual([10, 0, 2]);
    const c = aplica(tn, opsRemover(tn, { tipo: 'curva', i: 0, j: 1 }));
    expect(c.curvas).toHaveLength(2);
    expect(c.curvas[1]).toEqual({ z: 5, xy: [2, 2, 8, 8], fechada: false });
    const q = aplica(tn, opsRemover(tn, { tipo: 'quebra', i: 0, j: 0 }));
    expect(q.quebras[0]!.xyz).toEqual([9, 9, 4, 5, 5, 4]);
    const dois = aplica(tn, opsRemover(tn, { tipo: 'curva', i: 1, j: 0 }));
    expect(dois.curvas).toHaveLength(1);
    const so = { ...tn, quebras: [{ xyz: [0, 0, 1, 1, 1, 1] }] };
    expect(aplica(so, opsRemover(so, { tipo: 'quebra', i: 0, j: 1 })).quebras).toEqual([]);
  });

  it('remover rótulo e ponto cotado tira só o escolhido', () => {
    const tn = base();
    expect(aplica(tn, opsRemover(tn, { tipo: 'rotulo', i: 0 })).linhasRotulo).toEqual([0, 6, 10, 6]);
    expect(aplica(tn, opsRemover(tn, { tipo: 'cotado', i: 1 })).pontosCotados).toEqual([5, 8]);
  });

  it('criação: ponto, curva, quebra com cota por vértice, borda, remover borda, rótulo e ponto cotado', () => {
    const tn = base();
    expect(aplica(tn, opsPonto(3, 3, 4)).pontos.slice(-3)).toEqual([3, 3, 4]);
    expect(aplica(tn, opsCurva([{ x: 0, y: 0 }, { x: 1, y: 0 }], 2, false)).curvas.at(-1)).toEqual({ z: 2, xy: [0, 0, 1, 0], fechada: false });
    expect(aplica(tn, opsQuebra([{ x: 0, y: 0 }, { x: 1, y: 0 }], [7, 8])).quebras.at(-1)!.xyz).toEqual([0, 0, 7, 1, 0, 8]);
    const comBorda = aplica(tn, opsBorda([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]));
    expect(comBorda.borda).toHaveLength(6);
    expect(aplica(comBorda, opsRemoverBorda()).borda).toBeUndefined();
    expect(aplica(tn, opsRotulo(tn, { x: 1, y: 1 }, { x: 2, y: 2 })).linhasRotulo.slice(-4)).toEqual([1, 1, 2, 2]);
    expect(aplica(tn, opsCotado(tn, { x: 4, y: 4 })).pontosCotados.slice(-2)).toEqual([4, 4]);
  });
});

describe('terrainEditGestos: terreno alvo e gravação', () => {
  it('terrenoDaSelecao: terreno, ou o terreno da região; terrenoAlvo cai no único terreno do nível', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T5');
    expect(terrenoDaSelecao(s.project, ['tn_t5'])?.id).toBe('tn_t5');
    expect(terrenoDaSelecao(s.project, ['rg_t5'])?.id).toBe('tn_t5');
    expect(terrenoDaSelecao(s.project, [])).toBeNull();
    expect(terrenoAlvo(s.project, [], 'lv_0')?.id).toBe('tn_t5');
    expect(terrenoAlvo(s.project, [], 'lv_9')).toBeNull();
    adicionarFixtureTerreno(s, 'T1');
    expect(terrenoAlvo(s.project, [], 'lv_0')).toBeNull();
    expect(terrenoAlvo(s.project, ['tn_t1'], 'lv_0')?.id).toBe('tn_t1');
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'P1', elevation: 3 }) });
  });

  it('gravarOps: um comando; operação inválida não grava e diz o motivo', () => {
    const ctx = makeEnv();
    adicionarFixtureTerreno(ctx.store, 'T1');
    const tn = ctx.store.project.elements['tn_t1'] as Terrain;
    const msgs: string[] = [];
    ctx.env.say = (m) => { msgs.push(m); };
    expect(gravarOps(ctx.env, tn, [], 'x', 'pt')).toBe(false);
    expect(gravarOps(ctx.env, tn, [{ op: 'removePonto', i: 99 }], 'x', 'pt')).toBe(false);
    expect(gravarOps(ctx.env, tn, [{ op: 'addPonto', x: Number.NaN, y: 0, z: 0 }], 'x', 'pt')).toBe(false);
    expect(msgs).toHaveLength(2);
    expect((ctx.store.project.elements['tn_t1'] as Terrain).pontos).toHaveLength(12);
    expect(gravarOps(ctx.env, tn, opsPonto(5, 5, 3), 'Colocar', 'pt')).toBe(true);
    expect((ctx.store.project.elements['tn_t1'] as Terrain).pontos).toHaveLength(15);
  });
});
