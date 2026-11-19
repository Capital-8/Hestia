import { beforeEach, describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeTerrain, type Terrain } from '@hestia/model';
import { alcasNaJanela, alvoDeEdicao, construcoesDoIndice, cotaDoItem, indiceDasFontes, limparIndicesDasFontes, linhaDeRotulo, listaDeVerticesDasFontes, LIMITE_ALCAS, mesmaRef, pontoCotado, posicaoDoItem, verticeMaisProximo } from './terrainEditPick.ts';

const terreno = (over: Partial<Terrain> = {}): Terrain => ({ ...makeTerrain({ id: 'tn_x', levelId: 'lv_0' }), order: 0, ...over });
const comCurva = (): Terrain => terreno({
  pontos: [0, 0, 1, 10, 0, 2],
  curvas: [{ z: 5, xy: [2, 2, 8, 2, 8, 8], fechada: false }],
  quebras: [{ xyz: [1, 9, 3, 9, 9, 4] }],
});

beforeEach(() => limparIndicesDasFontes());

describe('terrainEditPick: vértices das fontes', () => {
  it('lista na ordem canônica: pontos, curvas, quebras (a cota da curva vale para todos os seus vértices)', () => {
    const v = listaDeVerticesDasFontes(comCurva());
    expect(v.map((q) => q.ref)).toEqual([
      { tipo: 'ponto', i: 0 }, { tipo: 'ponto', i: 1 },
      { tipo: 'curva', i: 0, j: 0 }, { tipo: 'curva', i: 0, j: 1 }, { tipo: 'curva', i: 0, j: 2 },
      { tipo: 'quebra', i: 0, j: 0 }, { tipo: 'quebra', i: 0, j: 1 },
    ]);
    expect(v.filter((q) => q.ref.tipo === 'curva').map((q) => q.z)).toEqual([5, 5, 5]);
    expect(v[6]).toMatchObject({ x: 9, y: 9, z: 4 });
  });

  it('o mais próximo dentro da tolerância; fora dela, nenhum; empate: o primeiro da ordem canônica', () => {
    const ix = indiceDasFontes(comCurva());
    expect(verticeMaisProximo(ix, { x: 8.05, y: 2.02 }, 0.1)?.ref).toEqual({ tipo: 'curva', i: 0, j: 1 });
    expect(verticeMaisProximo(ix, { x: 5, y: 5 }, 0.1)).toBeNull();
    const dois = indiceDasFontes(terreno({ pontos: [0, 0, 1, 2, 0, 1] }));
    expect(verticeMaisProximo(dois, { x: 1, y: 0 }, 2)?.ref).toEqual({ tipo: 'ponto', i: 0 });
  });

  it('tolerância enorme varre tudo (sem a grade) e acha o certo', () => {
    const ix = indiceDasFontes(comCurva());
    expect(verticeMaisProximo(ix, { x: 9.2, y: 9.1 }, 1000)?.ref).toEqual({ tipo: 'quebra', i: 0, j: 1 });
  });

  it('terreno sem fontes: índice vazio', () => {
    const ix = indiceDasFontes(terreno());
    expect(ix.vertices).toEqual([]);
    expect(verticeMaisProximo(ix, { x: 0, y: 0 }, 5)).toBeNull();
    expect(alcasNaJanela(ix, null)).toEqual({ vertices: [], n: 0, excedeu: false });
  });
});

describe('terrainEditPick: janela e limite de alças', () => {
  const muitos = (n: number): Terrain => terreno({ pontos: Array.from({ length: n }, (_, k) => [k % 100, Math.floor(k / 100), 0]).flat() });

  it('até o limite devolve as alças da janela; acima, nenhuma e excedeu', () => {
    const ix = indiceDasFontes(muitos(LIMITE_ALCAS));
    expect(alcasNaJanela(ix, null).vertices).toHaveLength(LIMITE_ALCAS);
    const mais = indiceDasFontes(muitos(LIMITE_ALCAS + 1));
    const r = alcasNaJanela(mais, null);
    expect(r.excedeu).toBe(true);
    expect(r.vertices).toEqual([]);
  });

  it('a janela conta só o que está dentro: aproximar tira o excesso', () => {
    const ix = indiceDasFontes(muitos(2000));
    expect(alcasNaJanela(ix, { min: { x: -1, y: -1 }, max: { x: 200, y: 200 } }).excedeu).toBe(true);
    const perto = alcasNaJanela(ix, { min: { x: -0.5, y: -0.5 }, max: { x: 4.5, y: 4.5 } });
    expect(perto.excedeu).toBe(false);
    expect(perto.vertices).toHaveLength(25);
    expect(alcasNaJanela(ix, { min: { x: 500, y: 500 }, max: { x: 600, y: 600 } }).n).toBe(0);
  });
});

describe('terrainEditPick: cache do índice (só refaz quando as fontes mudam)', () => {
  it('mesmas listas: nenhuma construção nova; fontes diferentes: uma só', () => {
    const tn = comCurva();
    const antes = construcoesDoIndice();
    const a = indiceDasFontes(tn);
    expect(construcoesDoIndice()).toBe(antes + 1);
    for (let i = 0; i < 50; i++) expect(indiceDasFontes(tn)).toBe(a);
    expect(construcoesDoIndice()).toBe(antes + 1);
    const movido = { ...tn, pontos: [0.5, 0, 1, 10, 0, 2] };
    const b = indiceDasFontes(movido);
    expect(b).not.toBe(a);
    expect(construcoesDoIndice()).toBe(antes + 2);
    expect(verticeMaisProximo(b, { x: 0.5, y: 0 }, 0.01)?.ref).toEqual({ tipo: 'ponto', i: 0 });
  });

  it('listas novas com o MESMO conteúdo (edição de rótulo copia tudo) e outros campos mudando não refazem', () => {
    const tn = comCurva();
    const a = indiceDasFontes(tn);
    const antes = construcoesDoIndice();
    const copia = { ...tn, pontos: tn.pontos.slice(), curvas: tn.curvas.map((c) => ({ ...c, xy: c.xy.slice() })), quebras: tn.quebras.map((q) => ({ xyz: q.xyz.slice() })), linhasRotulo: [0, 0, 1, 1], name: 'outro', color: '#fff', borda: [0, 0, 5, 0, 5, 5] };
    expect(indiceDasFontes(copia)).toBe(a);
    expect(construcoesDoIndice()).toBe(antes);
  });

  it('pelo armazém: editar rótulo e ponto cotado não refaz; mover vértice refaz uma vez', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T3');
    const get = (): Terrain => s.project.elements['tn_t3'] as Terrain;
    indiceDasFontes(get());
    const base = construcoesDoIndice();
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'setLinhasRotulo', v: [0, 0, 5, 5] }, { op: 'setPontosCotados', v: [3, 3] }] });
    indiceDasFontes(get());
    expect(construcoesDoIndice()).toBe(base);
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'movePonto', i: 4, x: 11, y: 10, z: 5 }] });
    indiceDasFontes(get());
    indiceDasFontes(get());
    expect(construcoesDoIndice()).toBe(base + 1);
  });
});

describe('terrainEditPick: alvos (vértice, ponto cotado, rótulo)', () => {
  const tn = (): Terrain => ({ ...comCurva(), linhasRotulo: [0, 5, 10, 5], pontosCotados: [5, 8] });

  it('ponto cotado e linha de rótulo se escolhem; vértice ganha o empate', () => {
    const t = tn();
    const ix = indiceDasFontes(t);
    expect(alvoDeEdicao(t, ix, { x: 5.02, y: 8.01 }, 0.1)).toEqual({ tipo: 'cotado', i: 0 });
    expect(alvoDeEdicao(t, ix, { x: 4, y: 5.03 }, 0.1)).toEqual({ tipo: 'rotulo', i: 0 });
    expect(alvoDeEdicao(t, ix, { x: 0, y: 5 }, 0.1)).toEqual({ tipo: 'rotulo', i: 0 });
    expect(alvoDeEdicao(t, ix, { x: 0.02, y: 0 }, 0.1)).toEqual({ tipo: 'ponto', i: 0 });
    expect(alvoDeEdicao(t, ix, { x: 3, y: 3 }, 0.1)).toBeNull();
  });

  it('sem vértices (alças escondidas) só rótulo e ponto cotado', () => {
    const t = tn();
    const ix = indiceDasFontes(t);
    expect(alvoDeEdicao(t, ix, { x: 0.02, y: 0 }, 0.1, false)).toBeNull();
    expect(alvoDeEdicao(t, ix, { x: 5, y: 8 }, 0.1, false)).toEqual({ tipo: 'cotado', i: 0 });
  });

  it('posição, cota e comparação de referências', () => {
    const t = tn();
    expect(posicaoDoItem(t, { tipo: 'curva', i: 0, j: 2 })).toEqual({ x: 8, y: 8 });
    expect(posicaoDoItem(t, { tipo: 'quebra', i: 0, j: 0 })).toEqual({ x: 1, y: 9 });
    expect(posicaoDoItem(t, { tipo: 'rotulo', i: 0 })).toEqual({ x: 5, y: 5 });
    expect(posicaoDoItem(t, { tipo: 'ponto', i: 9 })).toBeNull();
    expect(cotaDoItem(t, { tipo: 'curva', i: 0, j: 1 })).toBe(5);
    expect(cotaDoItem(t, { tipo: 'quebra', i: 0, j: 1 })).toBe(4);
    expect(cotaDoItem(t, { tipo: 'rotulo', i: 0 })).toBeNull();
    expect(linhaDeRotulo(t, 1)).toBeNull();
    expect(pontoCotado(t, 0)).toEqual({ x: 5, y: 8 });
    expect(mesmaRef({ tipo: 'curva', i: 0, j: 1 }, { tipo: 'curva', i: 0, j: 1 })).toBe(true);
    expect(mesmaRef({ tipo: 'curva', i: 0, j: 1 }, { tipo: 'curva', i: 0, j: 2 })).toBe(false);
    expect(mesmaRef({ tipo: 'ponto', i: 0 }, { tipo: 'cotado', i: 0 })).toBe(false);
    expect(mesmaRef(null, null)).toBe(false);
  });
});
