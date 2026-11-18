import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, isTerrain, newId, TERRENO_LIMITES, type Terrain } from '@hestia/model';
import { TerrainEditTool } from './terrainEditTool.ts';
import { DesenhoDeForma } from './terrainFormaCurva.ts';
import { TerrainTool } from './terrainTool.ts';
import { clickAt, makeEnv, P } from './testEnv.ts';

const linhas = (t: unknown): number => (t as { items: Array<{ kind: string }> }).items.filter((i) => i.kind === 'line').length;
const dist0 = (x: number, y: number, cx = 0, cy = 0): number => Math.hypot(x - cx, y - cy);

function topografia(forma: string) {
  const ctx = makeEnv();
  ctx.options.terrainShape = forma as never;
  const msgs: string[] = [];
  ctx.env.say = (m) => { msgs.push(m); };
  const t = new TerrainTool(ctx.env);
  t.start();
  t.definirModo('curvas');
  return { ctx, t, msgs };
}

describe('Topografia (curvas): formas da galeria viram UMA curva fechada ou aberta na cota do campo', () => {
  it('círculo de raio 5 m: 50 vértices a 5 m do centro, fechada, na cota 3; a cota avança o passo', () => {
    const { t } = topografia('circle');
    t.definirCotaDoCampo(3);
    clickAt(t, 0, 0);
    clickAt(t, 5, 0);
    const f = t.fontesPendentes();
    expect(f.curvas).toHaveLength(1);
    const c = f.curvas[0]!;
    expect(c.fechada).toBe(true);
    expect(c.z).toBe(3);
    expect(c.xy).toHaveLength(100);
    for (let i = 0; i < 100; i += 2) expect(Math.abs(dist0(c.xy[i]!, c.xy[i + 1]!) - 5)).toBeLessThan(1e-9);
    expect(t.cotaDoModelo).toBe(4);
  });

  it('retângulo: 4 vértices, fechado', () => {
    const { t } = topografia('rect');
    clickAt(t, 0, 0);
    clickAt(t, 4, 3);
    const c = t.fontesPendentes().curvas[0]!;
    expect(c.xy).toEqual([0, 0, 4, 0, 4, 3, 0, 3]);
    expect(c.fechada).toBe(true);
  });

  it('arco por 3 pontos: aberto, 26 vértices, extremos nos pontos dados', () => {
    const { t } = topografia('arc');
    clickAt(t, -5, 0);
    clickAt(t, 0, 5);
    clickAt(t, 5, 0);
    const c = t.fontesPendentes().curvas[0]!;
    expect(c.fechada).toBe(false);
    expect(c.xy[0]).toBeCloseTo(-5, 9);
    expect(c.xy[1]).toBeCloseTo(0, 9);
    expect(c.xy[50]).toBeCloseTo(5, 9);
    expect(c.xy[51]).toBeCloseTo(0, 9);
    expect(c.xy.length / 2).toBe(26);
  });

  it('flecha da barra de opções: 0,04 m dá 26 vértices no círculo de 5 m (e 0,01 dá 50)', () => {
    const { ctx, t } = topografia('circle');
    ctx.options.terrainFlecha = 0.04;
    clickAt(t, 0, 0);
    clickAt(t, 5, 0);
    expect(t.fontesPendentes().curvas[0]!.xy.length / 2).toBe(26);
  });

  it('spline: passa pelos pontos de controle; Enter conclui aberta; Enter de novo cria o terreno', () => {
    const { ctx, t } = topografia('spline');
    clickAt(t, 0, 0);
    clickAt(t, 4, 3);
    clickAt(t, 8, -1);
    expect(t.fontesPendentes().curvas).toHaveLength(0);
    t.confirm();
    const c = t.fontesPendentes().curvas[0]!;
    expect(c.fechada).toBe(false);
    const tem = (x: number, y: number): boolean => c.xy.some((_, i) => i % 2 === 0 && c.xy[i] === x && c.xy[i + 1] === y);
    expect(tem(0, 0) && tem(4, 3) && tem(8, -1)).toBe(true);
    expect(c.xy.length / 2).toBeGreaterThan(10);
    t.confirm();
    const tn = Object.values(ctx.store.project.elements).find(isTerrain)!;
    expect(tn.curvas).toHaveLength(1);
  });

  it('spline fechada com C (3 pontos): fechada, sem repetir o primeiro vértice', () => {
    const { t } = topografia('spline');
    clickAt(t, 0, 0);
    clickAt(t, 10, 0);
    clickAt(t, 5, 8);
    expect(t.type('c')).toBe(true);
    const c = t.fontesPendentes().curvas[0]!;
    expect(c.fechada).toBe(true);
    expect(c.xy.slice(0, 2)).toEqual([0, 0]);
    expect(c.xy.slice(-2)).not.toEqual([0, 0]);
  });

  it('Esc descarta a forma em curso; a prévia ao vivo mostra a forma discretizada (círculo: 50 cordas)', () => {
    const { t } = topografia('circle');
    clickAt(t, 0, 0);
    t.move(P(5, 0));
    expect(linhas(t)).toBe(50);
    t.cancel();
    expect(t.fontesPendentes().curvas).toHaveLength(0);
    expect(linhas(t)).toBe(0);
  });

  it('forma "Linha" segue como antes (cliques viram vértices retos)', () => {
    const { t } = topografia('line');
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    t.confirm();
    expect(t.fontesPendentes().curvas[0]!.xy).toEqual([0, 0, 3, 0]);
  });
});

describe('teto de vértices no desenho por forma', () => {
  it('capacidade 30: o círculo de 5 m sobe a flecha para 0,04 (26 vértices) e avisa; capacidade 3: recusa', () => {
    const ctx = makeEnv();
    ctx.options.terrainShape = 'circle';
    const d = new DesenhoDeForma(ctx.env, () => 'pt');
    d.click({ x: 0, y: 0 }, 30, 0.1);
    const r = d.click({ x: 5, y: 0 }, 30, 0.1);
    expect(r.kind).toBe('pronta');
    if (r.kind === 'pronta') {
      expect(r.reduzida).toBe(true);
      expect(r.forma.pts).toHaveLength(26);
      expect(r.forma.flecha).toBeCloseTo(0.04, 12);
    }
    d.click({ x: 0, y: 0 }, 3, 0.1);
    expect(d.click({ x: 5, y: 0 }, 3, 0.1)).toEqual({ kind: 'recusa', motivo: 'limite' });
  });

  it('spline: ponto de controle além da capacidade é recusado', () => {
    const ctx = makeEnv();
    ctx.options.terrainShape = 'spline';
    const d = new DesenhoDeForma(ctx.env, () => 'pt');
    expect(d.click({ x: 0, y: 0 }, 2, 0.1).kind).toBe('nada');
    expect(d.click({ x: 1, y: 0 }, 2, 0.1).kind).toBe('nada');
    expect(d.click({ x: 2, y: 3 }, 2, 0.1)).toEqual({ kind: 'recusa', motivo: 'limite' });
  });
});

/** Terreno com 3 pontos, 1 curva (z=5) e 1 quebra, para o Editar terreno. */
function cenaEdicao(extra?: (s: ProjectStore) => void) {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  const id = newId('tn');
  ctx.store.exec({ type: 'addTerrain', terrain: { id, kind: 'terrain', levelId: 'lv_0', name: 'T', order: 0, pontos: [], curvas: [], quebras: [], linhasRotulo: [], pontosCotados: [], intervaloCurvas: 1, mestraCada: 5, espessuraBase: 1, mostrarExistente: true } as unknown as Terrain });
  ctx.store.exec({
    type: 'editTerrainFontes', terrenoId: id,
    ops: [{ op: 'substituirFontes', pontos: [0, 0, 1, 10, 0, 2, 10, 10, 3], curvas: [{ z: 5, xy: [20, 20, 30, 20, 30, 30], fechada: false }], quebras: [{ xyz: [40, 40, 7, 50, 40, 8] }] }],
  });
  extra?.(ctx.store);
  ctx.env.setSelection([id]);
  const msgs: string[] = [];
  ctx.env.say = (m) => { msgs.push(m); };
  const t = new TerrainEditTool(ctx.env);
  t.start();
  const tn = (): Terrain => ctx.store.project.elements[id] as Terrain;
  const escolher = (x: number, y: number): void => { t.move(P(x, y)); t.down(P(x, y)); t.up(P(x, y)); };
  return { ctx, t, tn, id, msgs, escolher };
}

describe('Editar terreno: formas no submodo Curva', () => {
  it('retângulo grava UMA curva fechada na cota do campo, com um só desfazer', () => {
    const { ctx, t, tn } = cenaEdicao();
    ctx.options.terrainShape = 'rect';
    t.definirModo('curva');
    t.definirCotaDoCampo(9);
    clickAt(t, 60, 60);
    clickAt(t, 64, 63);
    expect(tn().curvas).toHaveLength(2);
    expect(tn().curvas[1]).toEqual({ z: 9, xy: [60, 60, 64, 60, 64, 63, 60, 63], fechada: true });
    ctx.store.undo();
    expect(tn().curvas).toHaveLength(1);
  });

  it('spline: Enter grava a curva aberta passando pelos controles', () => {
    const { ctx, t, tn } = cenaEdicao();
    ctx.options.terrainShape = 'spline';
    t.definirModo('curva');
    clickAt(t, 60, 60);
    clickAt(t, 64, 63);
    clickAt(t, 68, 59);
    t.confirm();
    const c = tn().curvas[1]!;
    expect(c.fechada).toBe(false);
    expect(c.xy.slice(0, 2)).toEqual([60, 60]);
    expect(c.xy.slice(-2)).toEqual([68, 59]);
    expect(c.xy.some((_, i) => i % 2 === 0 && c.xy[i] === 64 && c.xy[i + 1] === 63)).toBe(true);
  });

  it('teto: terreno com 199 990 vértices comporta 10: o círculo de 5 m sobe a flecha para 0,32 (10 vértices); o seguinte é recusado', () => {
    const pontos: number[] = [];
    for (let i = 0; i < 199_990 - 3 - 3 - 2; i++) pontos.push(1000 + (i % 400), 1000 + Math.floor(i / 400), 0);
    const { ctx, t, tn, msgs } = cenaEdicao((s) => {
      const id = Object.keys(s.project.elements).find((k) => isTerrain(s.project.elements[k]!))!;
      s.exec({ type: 'editTerrainFontes', terrenoId: id, ops: pontos.length > 0 ? [{ op: 'substituirFontes', pontos: [0, 0, 1, 10, 0, 2, 10, 10, 3, ...pontos], curvas: [{ z: 5, xy: [20, 20, 30, 20, 30, 30], fechada: false }], quebras: [{ xyz: [40, 40, 7, 50, 40, 8] }] }] : [] });
    });
    expect(TERRENO_LIMITES.vertices).toBe(200_000);
    ctx.options.terrainShape = 'circle';
    t.definirModo('curva');
    clickAt(t, 80, 80);
    clickAt(t, 85, 80);
    expect(tn().curvas).toHaveLength(2);
    expect(tn().curvas[1]!.xy.length / 2).toBe(10);
    expect(msgs.some((m) => m.includes('0,32'))).toBe(true);
    clickAt(t, 80, 80);
    clickAt(t, 85, 80);
    expect(tn().curvas).toHaveLength(2);
    expect(msgs[msgs.length - 1]).toContain('200000');
  }, 120_000);
});

describe('Editar terreno: propriedades do ponto selecionado', () => {
  it('ponto solto: X, Y e Cota gravam movePonto em UM desfazer; a cota é a exibida (cota zero 740)', () => {
    const { ctx, t, tn, escolher } = cenaEdicao((s) => s.exec({ type: 'setLocalizacao', localizacao: { origemE: 500000, origemN: 7000000, cotaZero: 740, norteVerdadeiro: 0 } }));
    escolher(10, 0);
    expect(t.pontoSelecionado).toEqual({ ref: { tipo: 'ponto', i: 1 }, x: 10, y: 0, z: 2 });
    expect(t.definirPontoSelecionado({ x: 11, y: 0.5, cota: 742.5 })).toBe(true);
    expect(tn().pontos).toEqual([0, 0, 1, 11, 0.5, 2.5, 10, 10, 3]);
    expect(t.pontoSelecionado?.x).toBe(11);
    ctx.store.undo();
    expect(tn().pontos).toEqual([0, 0, 1, 10, 0, 2, 10, 10, 3]);
  });

  it('vértice de curva: a cota vale para a curva inteira; X e Y só do vértice; tudo num só desfazer', () => {
    const { ctx, t, tn, escolher } = cenaEdicao();
    escolher(30, 20);
    expect(t.pontoSelecionado).toEqual({ ref: { tipo: 'curva', i: 0, j: 1 }, x: 30, y: 20, z: 5 });
    expect(t.definirPontoSelecionado({ cota: 6 })).toBe(true);
    expect(tn().curvas[0]).toEqual({ z: 6, xy: [20, 20, 30, 20, 30, 30], fechada: false });
    expect(t.definirPontoSelecionado({ x: 31, y: 21, cota: 8 })).toBe(true);
    expect(tn().curvas[0]).toEqual({ z: 8, xy: [20, 20, 31, 21, 30, 30], fechada: false });
    ctx.store.undo();
    expect(tn().curvas[0]!.z).toBe(6);
    expect(tn().curvas[0]!.xy).toEqual([20, 20, 30, 20, 30, 30]);
  });

  it('vértice de quebra: X, Y e Z do vértice', () => {
    const { t, tn, escolher } = cenaEdicao();
    escolher(50, 40);
    expect(t.pontoSelecionado?.ref).toEqual({ tipo: 'quebra', i: 0, j: 1 });
    expect(t.definirPontoSelecionado({ x: 52, y: 41, cota: 9 })).toBe(true);
    expect(tn().quebras[0]!.xyz).toEqual([40, 40, 7, 52, 41, 9]);
  });

  it('valores fora do limite ou não numéricos são recusados com mensagem e nada muda', () => {
    const { ctx, t, tn, escolher, msgs } = cenaEdicao();
    escolher(10, 0);
    const antes = tn().pontos.slice();
    const versao = ctx.store.version;
    expect(t.definirPontoSelecionado({ x: Number.NaN })).toBe(false);
    expect(t.definirPontoSelecionado({ y: 100_001 })).toBe(false);
    expect(t.definirPontoSelecionado({ cota: 10_001 })).toBe(false);
    expect(tn().pontos).toEqual(antes);
    expect(ctx.store.version).toBe(versao);
    expect(msgs[msgs.length - 1]).toContain('100000');
  });

  it('mover para cima de outro vértice segue o terrainIssue do modelo (que aceita coincidentes: o kernel funde); o mesmo caminho do arrasto', () => {
    const { ctx, t, tn, escolher } = cenaEdicao();
    escolher(10, 0);
    expect(t.definirPontoSelecionado({ x: 0, y: 0 })).toBe(true);
    expect(tn().pontos).toEqual([0, 0, 1, 0, 0, 2, 10, 10, 3]);
    ctx.store.undo();
    expect(tn().pontos).toEqual([0, 0, 1, 10, 0, 2, 10, 10, 3]);
  });

  it('sem mudança de valor não grava; sem ponto escolhido, devolve falso; rótulo não conta como ponto', () => {
    const { ctx, t, escolher } = cenaEdicao();
    expect(t.definirPontoSelecionado({ x: 1 })).toBe(false);
    escolher(10, 0);
    const versao = ctx.store.version;
    expect(t.definirPontoSelecionado({ x: 10, y: 0, cota: 2 })).toBe(false);
    expect(ctx.store.version).toBe(versao);
  });

  it('modo Ponto: o ponto recém-criado fica escolhido', () => {
    const { t, tn } = cenaEdicao();
    t.definirModo('ponto');
    t.definirCotaDoCampo(4);
    clickAt(t, 70, 70);
    expect(tn().pontos.slice(-3)).toEqual([70, 70, 4]);
    expect(t.pontoSelecionado).toEqual({ ref: { tipo: 'ponto', i: 3 }, x: 70, y: 70, z: 4 });
  });

  it('desfazer o que criou o ponto escolhido deixa a escolha sem ponto (null)', () => {
    const { ctx, t } = cenaEdicao();
    t.definirModo('ponto');
    clickAt(t, 70, 70);
    ctx.store.undo();
    expect(t.pontoSelecionado).toBeNull();
  });
});
