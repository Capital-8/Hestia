import { afterEach, describe, expect, it, vi } from 'vitest';
import { adicionarFixtureTerreno, regiaoDaFixture, resolveSlabs, servicoTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, isTerrainRegion, makeSlab, type Project, type TerrainRegion } from '@hestia/model';
import { COTA_REGIAO_PADRAO, PADROES_REGIAO, TerrainRegionTool } from './terrainRegionTool.ts';
import { clickAt, makeEnv, P } from './testEnv.ts';

afterEach(() => vi.restoreAllMocks());

const v = (x: number, y: number) => ({ x, y });
const QUADRADO = [[5, 5], [15, 5], [15, 15], [5, 15]] as const;

/** Terreno T1 (quadrado 0..20, cota 10) no `lv_0`, com a ferramenta ligada e as mensagens da barra de status coletadas. */
function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, 'T1');
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  const t = new TerrainRegionTool(ctx.env);
  t.start();
  return { ctx, t, msgs };
}
const regioes = (p: Project): TerrainRegion[] => Object.values(p.elements).filter(isTerrainRegion);
const desenha = (t: TerrainRegionTool, pts: ReadonlyArray<readonly [number, number]> = QUADRADO): void => {
  for (const [x, y] of pts) clickAt(t, x, y);
  t.confirm();
};
/** Região de fixture sem os campos que dependem de quem a cria (id, terreno, nome, ordem). */
const essencial = (r: Omit<TerrainRegion, 'order'> | TerrainRegion): unknown => {
  const { id: _i, terrenoId: _t, name: _n, ...resto } = r as TerrainRegion;
  const { order: _o, ...sem } = resto;
  return sem;
};

describe('Região de terreno: padrões das três predefinições (A.6)', () => {
  it('Subdivisão: permeável; Plataforma: taludes 0, impermeável; Região nivelada: taludes 1,5 e 2, impermeável', () => {
    expect(PADROES_REGIAO.subdivisao).toEqual({ taludeCorte: 0, taludeAterro: 0, permeavel: true });
    expect(PADROES_REGIAO.plataforma).toEqual({ taludeCorte: 0, taludeAterro: 0, permeavel: false });
    expect(PADROES_REGIAO.nivelada).toEqual({ taludeCorte: 1.5, taludeAterro: 2, permeavel: false });
    const { t } = cena();
    expect(t.predefinicao).toBe('plataforma');
    t.definirPredefinicao('nivelada');
    expect([t.taludeCorte, t.taludeAterro, t.permeavel]).toEqual([1.5, 2, false]);
    t.definirPredefinicao('subdivisao');
    expect([t.taludeCorte, t.taludeAterro, t.permeavel]).toEqual([0, 0, true]);
    expect(COTA_REGIAO_PADRAO).toBe(0);
  });

  it('campos inválidos são recusados sem mudar nada', () => {
    const { t } = cena();
    expect(t.definirCotaDoCampo(Number.NaN)).toBe(false);
    expect(t.definirCotaDoCampo(1e9)).toBe(false);
    expect(t.definirInclinacao(1.5)).toBe(false);
    expect(t.definirInclinacao(-0.1)).toBe(false);
    expect(t.definirTalude('corte', 11)).toBe(false);
    expect(t.definirTalude('aterro', -1)).toBe(false);
    expect([t.cotaDoCampo, t.inclinacao, t.taludeCorte, t.taludeAterro]).toEqual([0, 0, 0, 0]);
    expect(t.definirInclinacao(0.02)).toBe(true);
    expect(t.definirTalude('corte', 3)).toBe(true);
    expect([t.inclinacao, t.taludeCorte]).toEqual([0.02, 3]);
  });

  it('a cota digitada passa por cotaDoProjeto (exibida = z + altitude da cota zero)', () => {
    const { ctx, t } = cena();
    ctx.store.exec({ type: 'setLocalizacao', localizacao: { origemE: 0, origemN: 0, cotaZero: 740, norteVerdadeiro: 0 } });
    expect(t.definirCotaDoCampo(748)).toBe(true);
    expect(t.cotaDoModelo).toBe(8);
    expect(t.cotaDoCampo).toBe(748);
    desenha(t);
    expect(regioes(ctx.store.project)[0]!.cota).toBe(8);
  });
});

describe('Região de terreno: criação de T5 e T6 pela ferramenta (sem navegador)', () => {
  it('T5: plataforma no quadrado (5,5)-(15,15), cota 8, taludes 0; igual à região da fixture', () => {
    const { ctx, t } = cena();
    t.definirCotaDoCampo(8);
    desenha(t);
    const [r] = regioes(ctx.store.project);
    expect(regioes(ctx.store.project)).toHaveLength(1);
    expect(r!.terrenoId).toBe('tn_t1');
    expect(r!.levelId).toBe('lv_0');
    expect(essencial(r!)).toEqual(essencial(regiaoDaFixture('T5')!));
    expect(r!.papel).toBe('plataforma');
    expect(r!.permeavel).toBe(false);
    expect(ctx.sel()).toEqual([r!.id]);
    expect(ctx.done()).toBe(1);
  });

  it('T6: região nivelada, cota 8, talude de corte 1 e aterro 0; igual à região da fixture', () => {
    const { ctx, t } = cena();
    t.definirPredefinicao('nivelada');
    t.definirCotaDoCampo(8);
    t.definirTalude('corte', 1);
    t.definirTalude('aterro', 0);
    desenha(t);
    const [r] = regioes(ctx.store.project);
    expect(essencial(r!)).toEqual(essencial(regiaoDaFixture('T6')!));
    expect(r!.papel).toBe('nivelada');
    expect(r!.taludeCorte).toBe(1);
    expect(r!.taludeAterro).toBe(0);
  });

  it('nivelada com os padrões: taludes 1,5 e 2; plano com inclinação e direção gravados', () => {
    const { ctx, t } = cena();
    t.definirPredefinicao('nivelada');
    t.definirCotaDoCampo(9);
    t.definirInclinacao(0.05);
    t.definirDirecao(Math.PI / 2);
    desenha(t);
    const [r] = regioes(ctx.store.project);
    expect([r!.taludeCorte, r!.taludeAterro, r!.cota, r!.inclinacao, r!.direcao]).toEqual([1.5, 2, 9, 0.05, Math.PI / 2]);
  });

  it('subdivisão: papel subdivisao, permeavel true, sem plano (cota, inclinação e direção ficam em 0)', () => {
    const { ctx, t } = cena();
    t.definirPredefinicao('subdivisao');
    t.definirCotaDoCampo(8);
    t.definirInclinacao(0.1);
    desenha(t);
    const [r] = regioes(ctx.store.project);
    expect(r!.papel).toBe('subdivisao');
    expect(r!.permeavel).toBe(true);
    expect([r!.cota, r!.inclinacao, r!.direcao, r!.taludeCorte, r!.taludeAterro]).toEqual([0, 0, 0, 0, 0]);
  });

  it('um desfazer remove a região; o contorno vem anti-horário mesmo desenhado no sentido horário', () => {
    const { ctx, t } = cena();
    desenha(t, [[5, 15], [15, 15], [15, 5], [5, 5]]);
    const [r] = regioes(ctx.store.project);
    const c = r!.contorno;
    const area = c.reduce((s, q, i) => s + (q.x * c[(i + 1) % c.length]!.y - c[(i + 1) % c.length]!.x * q.y), 0) / 2;
    expect(area).toBeGreaterThan(0);
    ctx.store.undo();
    expect(regioes(ctx.store.project)).toHaveLength(0);
  });

  it('C fecha o polígono; clique perto do primeiro ponto também fecha; Enter com menos de três pontos avisa e não cria', () => {
    const { ctx, t, msgs } = cena();
    clickAt(t, 5, 5);
    clickAt(t, 15, 5);
    t.confirm();
    expect(regioes(ctx.store.project)).toHaveLength(0);
    expect(msgs.at(-1)).toContain('três pontos');
    clickAt(t, 15, 15);
    expect(t.type('c')).toBe(true);
    expect(regioes(ctx.store.project)).toHaveLength(1);
    const { ctx: c2, t: t2 } = cena();
    for (const [x, y] of QUADRADO) clickAt(t2, x, y);
    clickAt(t2, 5.01, 5.01);
    expect(regioes(c2.store.project)).toHaveLength(1);
  });

  it('Esc cancela o polígono em traçado sem criar; de novo, sai da ferramenta', () => {
    const { ctx, t } = cena();
    clickAt(t, 5, 5);
    clickAt(t, 15, 5);
    t.cancel();
    expect(t.pontosPendentes()).toEqual([]);
    expect(regioes(ctx.store.project)).toHaveLength(0);
    expect(ctx.done()).toBe(0);
    t.cancel();
    expect(ctx.done()).toBe(1);
  });

  it('autointersecção: o modelo recusa, a mensagem vai à barra de status e nada é criado', () => {
    const { ctx, t, msgs } = cena();
    desenha(t, [[5, 5], [15, 15], [15, 5], [5, 15]]);
    expect(regioes(ctx.store.project)).toHaveLength(0);
    expect(msgs.at(-1)).toBeTruthy();
    expect(ctx.done()).toBe(0);
  });

  it('nomes sequenciais por papel no terreno', () => {
    const { ctx, t } = cena();
    desenha(t);
    const t2 = new TerrainRegionTool(ctx.env);
    t2.start();
    desenha(t2, [[1, 1], [3, 1], [3, 3], [1, 3]]);
    expect(regioes(ctx.store.project).map((r) => r.name)).toEqual(['Plataforma 1', 'Plataforma 2']);
  });
});

describe('Região de terreno: o terreno sob o primeiro clique', () => {
  it('sem terreno sob o primeiro clique: mensagem, nada é criado e o polígono não começa', () => {
    const { ctx, t, msgs } = cena();
    clickAt(t, 50, 50);
    expect(msgs.at(-1)).toContain('terreno');
    expect(t.pontosPendentes()).toEqual([]);
    desenha(t, [[50, 50], [60, 50], [60, 60]]);
    expect(regioes(ctx.store.project)).toHaveLength(0);
  });

  it('o terreno sob o primeiro clique vira terrenoId e a região fica no nível dele', () => {
    const ctx = makeEnv(new ProjectStore(createEmptyProject()));
    adicionarFixtureTerreno(ctx.store, 'T1');
    ctx.store.exec({ type: 'addTerrain', terrain: { id: 'tn_b', kind: 'terrain', levelId: 'lv_1', name: 'B', pontos: [100, 0, 5, 120, 0, 5, 120, 20, 5, 100, 20, 5], curvas: [], quebras: [], intervaloCurvas: 1, mestraCada: 5, espessuraBase: 3, mostrarExistente: false, linhasRotulo: [], pontosCotados: [] } });
    const t = new TerrainRegionTool(ctx.env);
    t.start();
    desenha(t, [[105, 5], [115, 5], [115, 15], [105, 15]]);
    const [r] = regioes(ctx.store.project);
    expect(r!.terrenoId).toBe('tn_b');
    expect(r!.levelId).toBe('lv_1');
  });

  it('o terreno sob o clique vem do kernel quando ele responde (cotaDoTerreno), e fora dele (null) nada é criado', () => {
    const { ctx, t, msgs } = cena();
    const spy = vi.spyOn(servicoTerreno(), 'cotaDoTerreno').mockImplementation((_p, pts) => pts.map(() => null));
    clickAt(t, 10, 10);
    expect(spy).toHaveBeenCalled();
    expect(t.pontosPendentes()).toEqual([]);
    expect(msgs.at(-1)).toContain('terreno');
    spy.mockImplementation((_p, pts) => pts.map(() => ({ z: 10, declividade: 0, terrenoId: 'tn_t1' })));
    desenha(t);
    expect(regioes(ctx.store.project)).toHaveLength(1);
  });

  it('vértice fora do terreno: avisa na barra de status e CRIA a região (o aviso 6 do kernel fica no painel)', () => {
    const { ctx, t, msgs } = cena();
    clickAt(t, 15, 15);
    clickAt(t, 25, 15);
    expect(msgs.at(-1)).toContain('1 vértice');
    clickAt(t, 25, 5);
    clickAt(t, 15, 5);
    t.confirm();
    expect(regioes(ctx.store.project)).toHaveLength(1);
    expect(msgs.some((m) => m.includes('2 vértice'))).toBe(true);
    expect(msgs.at(-1)).toContain('2 vértice');
    expect(regioes(ctx.store.project)[0]!.contorno.some((q) => q.x === 25)).toBe(true);
  });

  it('dentro do terreno: nenhum aviso de vértice fora', () => {
    const { t, msgs } = cena();
    desenha(t);
    expect(msgs.some((m) => m.includes('fora do terreno'))).toBe(false);
  });
});

describe('Região de terreno: plataforma "Por elemento"', () => {
  /** Laje (5,5)-(15,15) no `lv_0` com o topo a 8,5 m acima do nível: face inferior = topo menos a espessura. */
  function comLaje(): ReturnType<typeof cena> & { faceInferior: number } {
    const c = cena();
    c.ctx.store.exec({ type: 'addSlab', slab: makeSlab({ id: 'lj1', typeId: 'ls_mac12', levelId: 'lv_0', heightOffset: 8.5, boundary: [v(5, 5), v(15, 5), v(15, 15), v(5, 15)] }) });
    const r = resolveSlabs(c.ctx.store.project, 'lv_0').find((s) => s.slabId === 'lj1')!;
    return { ...c, faceInferior: r.bottomZ };
  }

  it('o clique numa laje cria a plataforma com o contorno da laje e a cota da face inferior', () => {
    const { ctx, t, faceInferior } = comLaje();
    expect(faceInferior).toBeLessThan(8.5);
    t.definirPorElemento(true);
    expect(t.porElemento).toBe(true);
    clickAt(t, 10, 10);
    const [r] = regioes(ctx.store.project);
    expect(regioes(ctx.store.project)).toHaveLength(1);
    expect(r!.papel).toBe('plataforma');
    expect(r!.cota).toBeCloseTo(faceInferior, 9);
    expect(r!.taludeCorte).toBe(0);
    expect(r!.taludeAterro).toBe(0);
    expect(r!.permeavel).toBe(false);
    expect(r!.terrenoId).toBe('tn_t1');
    const chaves = r!.contorno.map((q) => `${q.x},${q.y}`).sort();
    expect(chaves).toEqual(['15,15', '15,5', '5,15', '5,5']);
    expect(t.cotaDoModelo).toBeCloseTo(faceInferior, 9);
    expect(ctx.sel()).toEqual([r!.id]);
    ctx.store.undo();
    expect(regioes(ctx.store.project)).toHaveLength(0);
  });

  it('clique sem laje nem piso: mensagem e nada criado; fora da plataforma a opção se desliga', () => {
    const { ctx, t, msgs } = comLaje();
    t.definirPorElemento(true);
    clickAt(t, 18, 18);
    expect(regioes(ctx.store.project)).toHaveLength(0);
    expect(msgs.at(-1)).toContain('Nenhuma laje');
    t.definirPredefinicao('nivelada');
    expect(t.porElemento).toBe(false);
  });

  it('laje sobre fora de todo terreno: nada é criado', () => {
    const { ctx, t, msgs } = cena();
    ctx.store.exec({ type: 'addSlab', slab: makeSlab({ id: 'lj2', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [v(50, 50), v(60, 50), v(60, 60), v(50, 60)] }) });
    t.definirPorElemento(true);
    clickAt(t, 55, 55);
    expect(regioes(ctx.store.project)).toHaveLength(0);
    expect(msgs.at(-1)).toContain('terreno');
  });
});

describe('Região de terreno: núcleo comum de desenho', () => {
  it('captura os vértices de uma região já existente (snap de região, regra 6) e usa o último ponto como origem', () => {
    const { ctx, t } = cena();
    desenha(t);
    const [existente] = regioes(ctx.store.project);
    const t2 = new TerrainRegionTool(ctx.env);
    t2.start();
    t2.move(P(15.004, 5.003));
    const inf = t2.inference();
    expect(inf?.point).toEqual({ x: 15, y: 5 });
    expect(existente!.contorno.some((q) => q.x === 15 && q.y === 5)).toBe(true);
  });

  it('comprimento digitado + Enter acrescenta o ponto na direção do cursor; a prévia e a cota dinâmica acompanham', () => {
    const { t } = cena();
    clickAt(t, 5, 5);
    t.move(P(15, 5));
    expect(t.inputPrompt()).toBeTruthy();
    expect(t.tempDims()).toHaveLength(1);
    expect(t.type('4')).toBe(true);
    expect(t.pontosPendentes()[1]!.x).toBeCloseTo(9, 6);
    expect(t.preview().length).toBeGreaterThan(0);
  });
});
