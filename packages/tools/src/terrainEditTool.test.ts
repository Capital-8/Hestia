import { afterEach, describe, expect, it, vi } from 'vitest';
import { adicionarFixtureTerreno, servicoTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, isTerrain, type Command, type Terrain } from '@hestia/model';
import { TerrainEditTool } from './terrainEditTool.ts';
import { construcoesDoIndice, limparIndicesDasFontes, LIMITE_ALCAS } from './terrainEditPick.ts';
import { makeEnv, P } from './testEnv.ts';

const T3 = 'tn_t3';

function cena(nome: 'T3' | 'T1' | 'T8' = 'T3', preparo?: (s: ProjectStore) => void) {
  limparIndicesDasFontes();
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, nome);
  preparo?.(ctx.store);
  const id = `tn_${nome.toLowerCase()}`;
  ctx.env.setSelection([id]);
  const t = new TerrainEditTool(ctx.env);
  t.start();
  const tn = (): Terrain => ctx.store.project.elements[id] as Terrain;
  const execs: Command[] = [];
  const orig = ctx.store.exec.bind(ctx.store);
  vi.spyOn(ctx.store, 'exec').mockImplementation((c: Command, ...r: unknown[]) => { execs.push(c); return (orig as (c: Command, ...r: unknown[]) => unknown)(c, ...r); });
  return { ctx, t, tn, execs, id };
}
const edicoes = (execs: Command[]): Command[] => execs.filter((c) => c.type === 'editTerrainFontes');
const arrastar = (t: TerrainEditTool, a: [number, number], b: [number, number]): void => {
  t.down(P(...a));
  t.drag(P(...b));
  t.up(P(...b));
};
const clicar = (t: TerrainEditTool, x: number, y: number): void => {
  t.move(P(x, y));
  t.down(P(x, y));
  t.up(P(x, y));
  t.click(P(x, y));
};
const comCurva = (s: ProjectStore): void => {
  s.exec({ type: 'editTerrainFontes', terrenoId: T3, ops: [{ op: 'addCurva', z: 3, xy: [6, 6, 14, 6, 14, 14, 6, 14], fechada: true }] });
};

afterEach(() => vi.restoreAllMocks());

describe('Editar terreno: começar', () => {
  it('pega o terreno da seleção (ou o da região) e anuncia a ajuda; sem terreno avisa', () => {
    const { t, id } = cena();
    expect(t.terrenoId).toBe(id);
    expect(t.modoAtual).toBe('editar');
    const ctx = makeEnv();
    const msgs: string[] = [];
    ctx.env.say = (m) => { msgs.push(m); };
    const v = new TerrainEditTool(ctx.env);
    v.start();
    expect(v.terrenoId).toBeNull();
    expect(msgs.at(-1)).toMatch(/Selecione um terreno/);
    clicar(v, 1, 1);
    expect(v.selecionado).toBeNull();
  });
});

describe('Editar terreno: mover ponto', () => {
  it('arrastar o ponto central: UM editTerrainFontes e UM desfazer', () => {
    const { ctx, t, tn, execs } = cena();
    arrastar(t, [10.02, 10], [12, 11]);
    expect(edicoes(execs)).toHaveLength(1);
    expect(edicoes(execs)[0]).toMatchObject({ type: 'editTerrainFontes', terrenoId: T3, ops: [{ op: 'movePonto', i: 4, x: 12, y: 11, z: 5 }] });
    expect(tn().pontos.slice(12, 15)).toEqual([12, 11, 5]);
    expect(t.selecionado).toEqual({ tipo: 'ponto', i: 4 });
    ctx.store.undo();
    expect(tn().pontos.slice(12, 15)).toEqual([10, 10, 5]);
    expect(tn().pontos).toHaveLength(15);
  });

  it('clique sem arrastar só escolhe: nenhum comando', () => {
    const { t, execs } = cena();
    clicar(t, 20, 20);
    expect(t.selecionado).toEqual({ tipo: 'ponto', i: 2 });
    expect(edicoes(execs)).toHaveLength(0);
  });

  it('clique no vazio limpa a escolha; Esc no meio do arrasto cancela sem gravar', () => {
    const { t, tn, execs } = cena();
    clicar(t, 20, 20);
    clicar(t, 5, 5);
    expect(t.selecionado).toBeNull();
    t.down(P(0, 0));
    t.drag(P(3, 3));
    t.cancel();
    t.up(P(3, 3));
    expect(edicoes(execs)).toHaveLength(0);
    expect(tn().pontos.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('mover vértice de curva e de quebra', () => {
    const { t, tn } = cena('T3', comCurva);
    arrastar(t, [6, 6.02], [7, 7]);
    expect(tn().curvas[0]!.xy.slice(0, 2)).toEqual([7, 7]);
    expect(tn().curvas[0]!.z).toBe(3);
  });
});

describe('Editar terreno: cota', () => {
  it('mudar a cota de um vértice de curva muda a curva INTEIRA (um comando, um desfazer)', () => {
    const { ctx, t, tn, execs } = cena('T3', comCurva);
    clicar(t, 14, 14);
    expect(t.selecionado).toEqual({ tipo: 'curva', i: 0, j: 2 });
    expect(t.cotaDoSelecionado).toBe(3);
    expect(t.definirCotaDoCampo(2.5)).toBe(true);
    expect(tn().curvas[0]!.z).toBe(2.5);
    expect(edicoes(execs).at(-1)).toMatchObject({ ops: [{ op: 'setCurvaZ', i: 0, z: 2.5 }] });
    expect(tn().curvas[0]!.xy).toEqual([6, 6, 14, 6, 14, 14, 6, 14]);
    ctx.store.undo();
    expect(tn().curvas[0]!.z).toBe(3);
  });

  it('a cota do ponto muda só o ponto; o valor digitado passa por cotaDoProjeto (altitude da cota zero)', () => {
    const { ctx, t, tn } = cena('T3', (s) => s.exec({ type: 'setLocalizacao', localizacao: { origemE: 0, origemN: 0, cotaZero: 740, norteVerdadeiro: 0 } }));
    clicar(t, 10, 10);
    expect(t.cotaDoSelecionado).toBe(745);
    expect(t.definirCotaDoCampo(748)).toBe(true);
    expect(tn().pontos.slice(12, 15)).toEqual([10, 10, 8]);
    expect(tn().pontos.slice(0, 3)).toEqual([0, 0, 0]);
    expect(t.cotaDoModelo).toBe(8);
    ctx.store.undo();
    expect(tn().pontos[14]).toBe(5);
  });

  it('cota inválida é recusada sem mudar nada', () => {
    const { t, tn, execs } = cena();
    clicar(t, 10, 10);
    expect(t.definirCotaDoCampo(Number.NaN)).toBe(false);
    expect(t.definirCotaDoCampo(1e9)).toBe(false);
    expect(edicoes(execs)).toHaveLength(0);
    expect(tn().pontos[14]).toBe(5);
  });

  it('sem item escolhido, o campo só guarda o valor para o desenho', () => {
    const { t, execs } = cena();
    expect(t.definirCotaDoCampo(3)).toBe(true);
    expect(t.cotaDoCampo).toBe(3);
    expect(edicoes(execs)).toHaveLength(0);
  });
});

describe('Editar terreno: remover', () => {
  it('Delete remove o ponto escolhido (um desfazer) e devolve true; sem escolha devolve false', () => {
    const { ctx, t, tn, execs } = cena();
    expect(t.deleteKey()).toBe(false);
    clicar(t, 10, 10);
    expect(t.deleteKey()).toBe(true);
    expect(tn().pontos).toHaveLength(12);
    expect(edicoes(execs)).toHaveLength(1);
    expect(t.selecionado).toBeNull();
    expect(t.deleteKey()).toBe(false);
    ctx.store.undo();
    expect(tn().pontos).toHaveLength(15);
  });

  it('Delete num vértice de curva tira só o vértice', () => {
    const { t, tn } = cena('T3', comCurva);
    clicar(t, 14, 14);
    t.deleteKey();
    expect(tn().curvas).toHaveLength(1);
    expect(tn().curvas[0]!.xy).toEqual([6, 6, 14, 6, 6, 14]);
    expect(tn().curvas[0]!.z).toBe(3);
  });
});

describe('Editar terreno: desenhar fontes', () => {
  it('ponto: cada clique é um editTerrainFontes na cota do campo', () => {
    const { ctx, t, tn, execs } = cena('T1');
    t.definirModo('ponto');
    t.definirCotaDoCampo(4);
    t.move(P(5, 5));
    t.click(P(5, 5));
    expect(tn().pontos.slice(-3)).toEqual([5, 5, 4]);
    expect(edicoes(execs)).toHaveLength(1);
    ctx.store.undo();
    expect(tn().pontos).toHaveLength(12);
  });

  it('curva: Enter conclui na cota do campo; C fecha', () => {
    const { t, tn } = cena('T1');
    t.definirModo('curva');
    t.definirCotaDoCampo(2);
    for (const [x, y] of [[3, 3], [9, 3], [9, 9]] as const) { t.move(P(x, y)); t.click(P(x, y)); }
    expect(t.type('c')).toBe(true);
    expect(tn().curvas).toEqual([{ z: 2, xy: [3, 3, 9, 3, 9, 9], fechada: true }]);
    t.move(P(1, 1)); t.click(P(1, 1));
    t.move(P(2, 1)); t.click(P(2, 1));
    t.confirm();
    expect(tn().curvas[1]).toEqual({ z: 2, xy: [1, 1, 2, 1], fechada: false });
  });

  it('linha de quebra: a cota de cada vértice é a do terreno ali (servicoTerreno por spy) e um desfazer remove a linha', () => {
    const { ctx, t, tn, execs } = cena('T1');
    const alturas = [7, 8, 9];
    let n = 0;
    const spy = vi.spyOn(servicoTerreno(), 'cotaDoTerreno').mockImplementation((_p, pts) => pts.map(() => ({ z: alturas[Math.min(n, 2)]!, declividade: 0, terrenoId: 'tn_t1' })));
    t.definirModo('quebra');
    for (const [x, y] of [[2, 2], [10, 2], [10, 10]] as const) {
      t.click(P(x, y));
      n++;
    }
    expect(spy).toHaveBeenCalled();
    t.confirm();
    expect(tn().quebras).toHaveLength(1);
    const xyz = tn().quebras[0]!.xyz;
    expect(xyz).toHaveLength(9);
    expect(xyz.filter((_, i) => i % 3 === 2).every((z) => z >= 7 && z <= 9)).toBe(true);
    expect(xyz[2]).toBe(7);
    expect(edicoes(execs)).toHaveLength(1);
    ctx.store.undo();
    expect(tn().quebras).toEqual([]);
  });

  it('linha de quebra com cota digitada usa a do campo, não a do terreno; usarCotaDoTerreno volta', () => {
    const { t, tn } = cena('T1');
    const spy = vi.spyOn(servicoTerreno(), 'cotaDoTerreno').mockImplementation((_p, pts) => pts.map(() => ({ z: 99, declividade: 0, terrenoId: 'tn_t1' })));
    t.definirModo('quebra');
    t.definirCotaDoCampo(6);
    t.click(P(2, 2));
    t.click(P(10, 2));
    expect(spy).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 1);
    t.confirm();
    expect(tn().quebras[0]!.xyz.filter((_, i) => i % 3 === 2)).toEqual([6, 6]);
    t.usarCotaDoTerreno();
    t.click(P(3, 3));
    t.click(P(4, 3));
    t.confirm();
    expect(tn().quebras[1]!.xyz.filter((_, i) => i % 3 === 2)).toEqual([99, 99]);
  });

  it('quebra sem kernel (cotaDoTerreno nulo) cai na cota do campo; um ponto só não conclui', () => {
    const { t, tn } = cena('T1');
    vi.spyOn(servicoTerreno(), 'cotaDoTerreno').mockReturnValue(null);
    t.definirModo('quebra');
    t.click(P(2, 2));
    t.confirm();
    expect(tn().quebras).toEqual([]);
    t.click(P(10, 2));
    t.confirm();
    expect(tn().quebras[0]!.xyz.filter((_, i) => i % 3 === 2)).toEqual([0, 0]);
  });
});

describe('Editar terreno: borda', () => {
  it('desenhar a borda grava setBorda (um desfazer); Remover borda volta à envoltória', () => {
    const { ctx, t, tn, execs } = cena('T3');
    t.definirModo('borda');
    for (const [x, y] of [[5, 5], [15, 5], [15, 15], [5, 15]] as const) { t.move(P(x, y)); t.click(P(x, y)); }
    t.confirm();
    expect(tn().borda).toEqual([5, 5, 15, 5, 15, 15, 5, 15]);
    expect(edicoes(execs)).toHaveLength(1);
    expect(t.removerBorda()).toBe(true);
    expect(tn().borda).toBeUndefined();
    expect(edicoes(execs)).toHaveLength(2);
    ctx.store.undo();
    expect(tn().borda).toEqual([5, 5, 15, 5, 15, 15, 5, 15]);
    ctx.store.undo();
    expect(tn().borda).toBeUndefined();
  });

  it('C fecha a borda; menos de 3 pontos não conclui; sem borda, remover avisa e não grava', () => {
    const { t, tn, execs } = cena('T3');
    t.definirModo('borda');
    t.click(P(1, 1));
    t.click(P(5, 1));
    t.confirm();
    expect(tn().borda).toBeUndefined();
    t.click(P(5, 5));
    expect(t.type('c')).toBe(true);
    expect(tn().borda).toHaveLength(6);
    expect(t.removerBorda()).toBe(true);
    expect(t.removerBorda()).toBe(false);
    expect(edicoes(execs)).toHaveLength(2);
  });

  it('borda que se cruza é recusada pelo modelo: nada gravado e o traçado fica para corrigir', () => {
    const { t, tn } = cena('T3');
    t.definirModo('borda');
    for (const [x, y] of [[0, 0], [10, 10], [10, 0], [0, 10]] as const) t.click(P(x, y));
    t.confirm();
    expect(tn().borda).toBeUndefined();
    expect(t.inputPrompt()).not.toBeNull();
  });
});

describe('Editar terreno: mais de 500 vértices na janela', () => {
  const muitos = (s: ProjectStore): void => {
    const pontos: number[] = [];
    for (let k = 0; k < 600; k++) pontos.push(k % 30, Math.floor(k / 30), 1);
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t1', ops: [{ op: 'substituirFontes', pontos, curvas: [], quebras: [] }] });
  };

  it('não devolve alças e devolve a mensagem; clicar não escolhe vértice; aproximar volta a funcionar', () => {
    const { ctx, t, execs } = cena('T1', muitos);
    const msgs: string[] = [];
    ctx.env.say = (m) => { msgs.push(m); };
    const r = t.alcas();
    expect(LIMITE_ALCAS).toBe(500);
    expect(r.alcas).toEqual([]);
    expect(r.mensagem).toBe('aproxime para editar pontos');
    clicar(t, 3, 3);
    expect(t.selecionado).toBeNull();
    expect(msgs.at(-1)).toBe('aproxime para editar pontos');
    arrastar(t, [3, 3], [4, 4]);
    expect(edicoes(execs)).toHaveLength(0);
    t.definirJanela({ min: { x: 1.5, y: 1.5 }, max: { x: 4.5, y: 4.5 } });
    const perto = t.alcas();
    expect(perto.mensagem).toBeNull();
    expect(perto.alcas).toHaveLength(9);
    clicar(t, 3, 3);
    expect(t.selecionado).toEqual({ tipo: 'ponto', i: 93 });
  });

  it('com até 500 vértices há alças e nenhuma mensagem', () => {
    const { t } = cena('T3');
    const r = t.alcas();
    expect(r.alcas).toHaveLength(5);
    expect(r.mensagem).toBeNull();
  });
});

describe('Editar terreno: Esc', () => {
  it('Esc sem nada em curso sai do modo sem alterar o terreno', () => {
    const { ctx, t, tn, execs } = cena();
    const antes = JSON.stringify(tn());
    clicar(t, 10, 10);
    t.cancel();
    expect(ctx.done()).toBe(1);
    expect(t.selecionado).toBeNull();
    expect(edicoes(execs)).toHaveLength(0);
    expect(JSON.stringify(tn())).toBe(antes);
  });

  it('Esc com traçado em curso só cancela o traçado; o segundo Esc sai', () => {
    const { ctx, t, tn } = cena('T1');
    t.definirModo('curva');
    t.click(P(2, 2));
    t.click(P(5, 5));
    t.cancel();
    expect(ctx.done()).toBe(0);
    expect(tn().curvas).toEqual([]);
    t.cancel();
    expect(ctx.done()).toBe(1);
  });

  it('trocar de submodo descarta o traçado em curso', () => {
    const { t, tn } = cena('T1');
    t.definirModo('curva');
    t.click(P(2, 2));
    t.definirModo('ponto');
    t.definirModo('curva');
    t.click(P(7, 7));
    t.confirm();
    expect(tn().curvas).toEqual([]);
  });
});

describe('Editar terreno: índice espacial só refaz quando as fontes mudam', () => {
  it('mover o cursor e clicar muitas vezes não remonta; um movimento remonta uma vez', () => {
    const { t, tn } = cena();
    clicar(t, 10, 10);
    const base = construcoesDoIndice();
    for (let i = 0; i < 30; i++) clicar(t, 10 + i * 0.001, 10);
    t.alcas();
    expect(construcoesDoIndice()).toBe(base);
    arrastar(t, [10, 10], [12, 12]);
    clicar(t, 12, 12);
    t.alcas();
    expect(construcoesDoIndice()).toBe(base + 1);
    expect(isTerrain(tn())).toBe(true);
  });
});
