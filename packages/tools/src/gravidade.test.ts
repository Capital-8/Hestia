import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, isTerrainRegion, isWall, type Project, type TerrainRegion } from '@hestia/model';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { addSegs, newDraft, type NewSeg } from './perimeterSession.ts';
import { commitPerimeter } from './perimeterCommit.ts';
import { cotaAbsolutaSobPonto, deslocamentoDoTerreno } from './gravidade.ts';
import { TerrainRegionTool } from './terrainRegionTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/** Rampa de T2: z = 10,25 + 0,1·x dentro do quadrado 0..20; fora, sem terreno. */
const rampa = (x: number, y: number): number | null => (x >= 0 && x <= 20 && y >= 0 && y <= 20 ? 10.25 + 0.1 * x : null);

/** Projeto com o nível lv_0 elevado a `elev`. */
function projetoComNivel(elev: number): Project {
  const p = createEmptyProject();
  return { ...p, levels: p.levels.map((l) => (l.id === 'lv_0' ? { ...l, elevation: elev } : l)) };
}

const quadrado = (x0: number, y0: number, x1: number, y1: number): NewSeg[] => [
  { a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
  { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
  { a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
  { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } },
];

describe('Gravidade (G1): funções de apoio', () => {
  it('deslocamentoDoTerreno: cota menos a elevação do nível; sem ambiente de gravidade, null', () => {
    const p = projetoComNivel(3);
    expect(deslocamentoDoTerreno({ cotaDoTerreno: rampa }, p, 'lv_0', 10, 10)).toBeCloseTo(8.25, 10);
    expect(deslocamentoDoTerreno({ cotaDoTerreno: rampa }, p, 'lv_0', 50, 10)).toBeNull();
    expect(deslocamentoDoTerreno({}, p, 'lv_0', 10, 10)).toBeNull();
    expect(deslocamentoDoTerreno({ cotaDoTerreno: rampa }, p, 'inexistente', 10, 10)).toBeNull();
    expect(cotaAbsolutaSobPonto({ cotaDoTerreno: rampa }, 10, 10)).toBeCloseTo(11.25, 10);
    expect(cotaAbsolutaSobPonto({ cotaDoTerreno: () => Number.NaN }, 10, 10)).toBeNull();
  });
});

describe('Gravidade (G1): parede', () => {
  const nova = (comGravidade: boolean, elev = 3) => {
    const ctx = makeEnv(new ProjectStore(projetoComNivel(elev)));
    if (comGravidade) ctx.env.cotaDoTerreno = rampa;
    return ctx;
  };
  const desenha = (ctx: ReturnType<typeof nova>, a: [number, number], b: [number, number]) => {
    const w = tool('wall', ctx.env);
    clickAt(w, a[0], a[1]);
    clickAt(w, b[0], b[1]);
    w.cancel();
    return Object.values(ctx.store.project.elements).filter(isWall);
  };

  it('ligada: parede iniciada em (10, 10) nasce com baseOffset = 11,25 − elevação do nível', () => {
    const [w] = desenha(nova(true), [10, 10], [15, 10]);
    expect(w!.baseOffset).toBeCloseTo(11.25 - 3, 10);
  });

  it('desligada: baseOffset 0, e a parede tem os mesmos campos da parede com gravidade (nenhum vínculo gravado)', () => {
    const [sem] = desenha(nova(false), [10, 10], [15, 10]);
    const [com] = desenha(nova(true), [10, 10], [15, 10]);
    expect(sem!.baseOffset).toBe(0);
    expect(Object.keys(com!).sort()).toEqual(Object.keys(sem!).sort());
  });

  it('fora do terreno: nada muda', () => {
    const [w] = desenha(nova(true), [30, 30], [35, 30]);
    expect(w!.baseOffset).toBe(0);
  });

  it('deslocamento explícito da barra tem prioridade; a cadeia usa o primeiro clique', () => {
    const ctx = nova(true);
    ctx.options.wallBaseOffset = 0.5;
    expect(desenha(ctx, [10, 10], [15, 10])[0]!.baseOffset).toBe(0.5);
    const c2 = nova(true);
    const w = tool('wall', c2.env);
    clickAt(w, 10, 10);
    clickAt(w, 15, 10);
    clickAt(w, 15, 15);
    w.cancel();
    const ps = Object.values(c2.store.project.elements).filter(isWall);
    expect(ps).toHaveLength(2);
    for (const x of ps) expect(x.baseOffset).toBeCloseTo(8.25, 10);
  });

  it('retângulo: as quatro paredes nascem com a cota do primeiro canto', () => {
    const ctx = nova(true);
    ctx.options.wallShape = 'rect';
    const w = tool('wall', ctx.env);
    clickAt(w, 10, 10);
    clickAt(w, 14, 14);
    const ps = Object.values(ctx.store.project.elements).filter(isWall);
    expect(ps).toHaveLength(4);
    for (const x of ps) expect(x.baseOffset).toBeCloseTo(8.25, 10);
  });
});

describe('Gravidade (G1): piso e laje', () => {
  const comando = (alvo: 'floor' | 'slab', opts: Parameters<typeof commitPerimeter>[2]) => {
    const r = commitPerimeter(projetoComNivel(3), addSegs(newDraft(alvo), quadrado(10, 10, 14, 14)), { typeId: alvo === 'floor' ? 'ft_ceram' : 'ls_mac12', levelId: 'lv_0', ...opts });
    if (!r.ok) throw new Error(r.message);
    const c = r.commands[0]!;
    return (c.type === 'addFloor' ? c.floor : c.type === 'addSlab' ? c.slab : null)!;
  };

  it.each(['floor', 'slab'] as const)('%s: ligada, heightOffset = 11,25 − elevação do nível', (alvo) => {
    expect(comando(alvo, { heightOffset: 0, cotaDoTerreno: rampa }).heightOffset).toBeCloseTo(8.25, 10);
  });

  it.each(['floor', 'slab'] as const)('%s: sem gravidade, fora do terreno ou com deslocamento próprio, nada muda', (alvo) => {
    expect(comando(alvo, { heightOffset: 0 }).heightOffset).toBe(0);
    expect(comando(alvo, { cotaDoTerreno: () => null }).heightOffset).toBe(0);
    expect(comando(alvo, { heightOffset: 0.2, cotaDoTerreno: rampa }).heightOffset).toBe(0.2);
  });

  it('o elemento criado tem os mesmos campos com e sem gravidade', () => {
    const a = comando('slab', { heightOffset: 0, cotaDoTerreno: rampa });
    const b = comando('slab', { heightOffset: 0 });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });
});

describe('Gravidade (G1): plataforma e região nivelada', () => {
  const cena = (comGravidade: boolean) => {
    const ctx = makeEnv(new ProjectStore(createEmptyProject()));
    adicionarFixtureTerreno(ctx.store, 'T2');
    if (comGravidade) ctx.env.cotaDoTerreno = rampa;
    const t = new TerrainRegionTool(ctx.env);
    t.start();
    return { ctx, t };
  };
  const regioes = (p: Project): TerrainRegion[] => Object.values(p.elements).filter(isTerrainRegion);
  const desenha = (t: TerrainRegionTool, pts: ReadonlyArray<readonly [number, number]>): void => {
    for (const [x, y] of pts) clickAt(t, x, y);
    t.confirm();
  };
  const PTS = [[10, 10], [14, 10], [14, 14], [10, 14]] as const;

  it.each(['plataforma', 'nivelada'] as const)('%s: ligada, cota = 11,25 (absoluta) sob o primeiro clique', (predef) => {
    const { ctx, t } = cena(true);
    t.definirPredefinicao(predef);
    desenha(t, PTS);
    const [r] = regioes(ctx.store.project);
    expect(r!.cota).toBeCloseTo(11.25, 10);
  });

  it('desligada, a cota continua a padrão; subdivisão não usa cota', () => {
    const { ctx, t } = cena(false);
    desenha(t, PTS);
    expect(regioes(ctx.store.project)[0]!.cota).toBe(t.cotaDoModelo);
    const c = cena(true);
    c.t.definirPredefinicao('subdivisao');
    desenha(c.t, PTS);
    expect(regioes(c.ctx.store.project)[0]!.cota).toBe(0);
  });
});
