import { describe, expect, it } from 'vitest';
import { projetoTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, isTerrain, terrainIssue, type Terrain } from '@hestia/model';
import { COTA_PADRAO, PASSO_PADRAO, TerrainTool } from './terrainTool.ts';
import { clickAt, makeEnv, P } from './testEnv.ts';

const nova = (ctx = makeEnv()): { ctx: ReturnType<typeof makeEnv>; t: TerrainTool } => {
  const t = new TerrainTool(ctx.env);
  t.start();
  return { ctx, t };
};
const terrenos = (s: ProjectStore): Terrain[] => Object.values(s.project.elements).filter(isTerrain);
const esperado = (nome: 'T1' | 'T3'): Terrain => Object.values(projetoTerreno(nome).elements).find(isTerrain)!;

describe('Topografia: campos Cota e Passo (estado da ferramenta)', () => {
  it('valores padrão testáveis', () => {
    const { t } = nova();
    expect(COTA_PADRAO).toBe(0);
    expect(PASSO_PADRAO).toBe(1);
    expect(t.cotaDoCampo).toBe(0);
    expect(t.passo).toBe(1);
    expect(t.modoAtual).toBe('pontos');
  });

  it('a cota digitada passa por cotaDoProjeto (exibida = z + altitude da cota zero)', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'setLocalizacao', localizacao: { origemE: 0, origemN: 0, cotaZero: 740, norteVerdadeiro: 0 } });
    const { t } = nova(ctx);
    expect(t.cotaDoCampo).toBe(740);
    expect(t.definirCotaDoCampo(750)).toBe(true);
    expect(t.cotaDoModelo).toBe(10);
    expect(t.cotaDoCampo).toBe(750);
    clickAt(t, 0, 0);
    t.confirm();
    expect(terrenos(ctx.store)[0]!.pontos).toEqual([0, 0, 10]);
  });

  it('valores inválidos são recusados sem mudar nada', () => {
    const { t } = nova();
    expect(t.definirCotaDoCampo(Number.NaN)).toBe(false);
    expect(t.definirCotaDoCampo(1e9)).toBe(false);
    expect(t.cotaDoCampo).toBe(0);
    expect(t.definirPasso(0)).toBe(false);
    expect(t.definirPasso(Number.POSITIVE_INFINITY)).toBe(false);
    expect(t.passo).toBe(1);
    expect(t.definirPasso(-0.5)).toBe(true);
    expect(t.passo).toBe(-0.5);
  });
});

describe('Topografia: criação de T1 e T3 pela ferramenta (sem navegador)', () => {
  it('T1: pontos nos 4 cantos, cota 10, Enter cria o terreno (fontes como na fixture)', () => {
    const { ctx, t } = nova();
    t.definirCotaDoCampo(10);
    for (const [x, y] of [[0, 0], [20, 0], [20, 20], [0, 20]] as const) clickAt(t, x, y);
    expect(t.fontesPendentes().pontos).toHaveLength(12);
    t.confirm();
    const [tn] = terrenos(ctx.store);
    expect(terrenos(ctx.store)).toHaveLength(1);
    const ref = esperado('T1');
    expect(tn!.pontos).toEqual(ref.pontos);
    expect(tn!.curvas).toEqual(ref.curvas);
    expect(tn!.quebras).toEqual([]);
    expect(tn!.levelId).toBe('lv_0');
    expect(terrainIssue(tn!)).toBeNull();
    expect(ctx.sel()).toEqual([tn!.id]);
    expect(ctx.done()).toBe(1);
  });

  it('T1: um desfazer remove o terreno inteiro; as fontes pendentes foram limpas', () => {
    const { ctx, t } = nova();
    t.definirCotaDoCampo(10);
    clickAt(t, 0, 0);
    clickAt(t, 20, 0);
    clickAt(t, 20, 20);
    t.confirm();
    expect(terrenos(ctx.store)).toHaveLength(1);
    ctx.store.undo();
    expect(terrenos(ctx.store)).toHaveLength(0);
    expect(t.fontesPendentes()).toEqual({ pontos: [], curvas: [] });
  });

  it('T3: curvas quadradas z=1..4 (a cota avança pelo Passo) mais ponto central z=5', () => {
    const { ctx, t } = nova();
    t.definirModo('curvas');
    t.definirCotaDoCampo(1);
    t.definirPasso(1);
    for (const lado of [16, 12, 8, 4]) {
      const a = 10 - lado / 2;
      const b = 10 + lado / 2;
      for (const [x, y] of [[a, a], [b, a], [b, b], [a, b]] as const) clickAt(t, x, y);
      expect(t.type('c')).toBe(true);
    }
    // 4 curvas concluídas: a cota seguinte já é 5, que é a do ponto central.
    expect(t.cotaDoCampo).toBe(5);
    t.definirModo('pontos');
    clickAt(t, 10, 10);
    t.confirm();
    const [tn] = terrenos(ctx.store);
    expect(tn!.pontos).toEqual([10, 10, 5]);
    expect(tn!.curvas.map((c) => c.z)).toEqual([1, 2, 3, 4]);
    expect(tn!.curvas.every((c) => c.fechada)).toBe(true);
    // Quadrados de lado 16, 12, 8 e 4 (perímetros 64, 48, 32, 16 da fixture T3 de A.10).
    const perimetro = (xy: number[]): number => xy.reduce((s, _, i) => (i % 2 ? s : s + Math.hypot(xy[(i + 2) % xy.length]! - xy[i]!, xy[(i + 3) % xy.length]! - xy[i + 1]!)), 0);
    expect(tn!.curvas.map((c) => perimetro(c.xy))).toEqual([64, 48, 32, 16]);
    expect(tn!.curvas[0]!.xy).toEqual([2, 2, 18, 2, 18, 18, 2, 18]);
    expect(tn!.curvas[3]!.xy).toEqual([8, 8, 12, 8, 12, 12, 8, 12]);
    expect(terrainIssue(tn!)).toBeNull();
    // Os mesmos vértices da pirâmide T3 da fixture (o ponto central); a fixture usa cantos em vez de curvas.
    expect(esperado('T3').pontos.slice(-3)).toEqual(tn!.pontos);
    ctx.store.undo();
    expect(terrenos(ctx.store)).toHaveLength(0);
  });
});

describe('Topografia: Enter, Esc, curvas abertas e comprimento digitado', () => {
  it('Enter conclui a curva (dois pontos ou mais) e avança a cota; Enter sem curva em curso cria o terreno', () => {
    const { ctx, t } = nova();
    t.definirModo('curvas');
    t.definirCotaDoCampo(3);
    t.definirPasso(0.5);
    clickAt(t, 0, 0);
    t.confirm();
    expect(t.fontesPendentes().curvas).toHaveLength(0); // um ponto só: avisa, não conclui
    clickAt(t, 5, 0);
    t.confirm();
    expect(t.fontesPendentes().curvas).toEqual([{ z: 3, xy: [0, 0, 5, 0], fechada: false }]);
    expect(t.cotaDoCampo).toBe(3.5);
    expect(terrenos(ctx.store)).toHaveLength(0);
    t.confirm(); // sem curva em curso: cria
    expect(terrenos(ctx.store)[0]!.curvas).toEqual([{ z: 3, xy: [0, 0, 5, 0], fechada: false }]);
  });

  it('Esc cancela a curva em curso, depois descarta as fontes pendentes, depois sai', () => {
    const { ctx, t } = nova();
    t.definirModo('curvas');
    clickAt(t, 0, 0);
    clickAt(t, 5, 0);
    t.confirm();
    clickAt(t, 0, 5);
    t.cancel(); // cancela só a curva em traçado
    expect(t.fontesPendentes().curvas).toHaveLength(1);
    expect(ctx.done()).toBe(0);
    t.cancel(); // descarta as fontes
    expect(t.fontesPendentes()).toEqual({ pontos: [], curvas: [] });
    expect(ctx.done()).toBe(0);
    t.cancel(); // sem nada: sai
    expect(ctx.done()).toBe(1);
    expect(terrenos(ctx.store)).toHaveLength(0);
  });

  it('Enter sem nada não cria terreno', () => {
    const { ctx, t } = nova();
    t.confirm();
    expect(terrenos(ctx.store)).toHaveLength(0);
    expect(ctx.done()).toBe(0);
  });

  it('comprimento digitado + Enter acrescenta o vértice a essa distância, na direção do cursor (núcleo comum)', () => {
    const { t } = nova();
    t.definirModo('curvas');
    clickAt(t, 0, 0);
    t.move(P(1, 0));
    expect(t.inputPrompt()).not.toBeNull();
    expect(t.type('5')).toBe(true);
    expect(t.fontesPendentes().curvas).toHaveLength(0);
    t.confirm();
    expect(t.fontesPendentes().curvas[0]!.xy).toEqual([0, 0, 5, 0]);
  });

  it('clicar no primeiro vértice (três pontos ou mais) fecha a curva', () => {
    const { t } = nova();
    t.definirModo('curvas');
    for (const [x, y] of [[0, 0], [4, 0], [4, 4]] as const) clickAt(t, x, y);
    clickAt(t, 0, 0);
    expect(t.fontesPendentes().curvas).toEqual([{ z: 0, xy: [0, 0, 4, 0, 4, 4], fechada: true }]);
  });

  it('com um terreno selecionado, Enter acrescenta as fontes a ele em um só desfazer', () => {
    const ctx = makeEnv();
    const base = projetoTerreno('T1');
    const tn = Object.values(base.elements).find(isTerrain)!;
    ctx.store.exec({ type: 'addTerrain', terrain: { ...tn } });
    ctx.store.exec({ type: 'editTerrainFontes', terrenoId: tn.id, ops: [{ op: 'substituirFontes', pontos: tn.pontos, curvas: [], quebras: [] }] });
    ctx.env.setSelection([tn.id]);
    const { t } = nova(ctx);
    t.definirCotaDoCampo(12);
    clickAt(t, 10, 10);
    t.confirm();
    expect(terrenos(ctx.store)).toHaveLength(1);
    expect(terrenos(ctx.store)[0]!.pontos).toEqual([...tn.pontos, 10, 10, 12]);
    ctx.store.undo();
    expect(terrenos(ctx.store)[0]!.pontos).toEqual(tn.pontos);
  });

  it('terreno inválido (vértice fora do limite) é recusado sem criar nada pela metade', () => {
    const { ctx, t } = nova();
    clickAt(t, 200000, 0);
    const ant = ctx.store.project;
    t.confirm();
    expect(terrenos(ctx.store)).toHaveLength(0);
    expect(ctx.store.project).toBe(ant);
    expect(ctx.done()).toBe(0);
  });

  it('o projeto vazio é o ponto de partida (sem terreno)', () => {
    expect(Object.values(createEmptyProject().elements).filter(isTerrain)).toHaveLength(0);
  });
});
