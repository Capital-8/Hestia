import { beforeEach, describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, type Component, type Familia } from '@hestia/model';
import { diagnosticarRede, tipoDaFamiliaDeTubo } from '@hestia/engine';
import { viabilidadeDoTrecho } from './tuboViabilidade.ts';
import { opcoesTubo } from './tuboTool.ts';
import { planejarPrumada } from './tuboPrumada.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/*
 * Prumada na ferramenta Tubo (ficha B4): pontos de cotas diferentes com declividade 0 viram vertical + horizontal ligados por joelho
 * (`subir_primeiro` e `andar_primeiro`) ou um tubo diagonal (`diagonal`, só nos ângulos com peça). Recuos da Krona: joelho 90° DN 100
 * = 58 mm; joelho 45° DN 100 = 29,6 mm.
 */

const ESGOTO = 'fam_krona_esgoto_tubo_corte';
const SOLDAVEL = 'fam_krona_soldavel_tubo_corte';
type Ctx = ReturnType<typeof makeEnv>;
const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const porFamilia = (ctx: Ctx, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
// declividade é verificada em diagnosticoRedeDn.test.ts; aqui só a geometria das conexões
const problemas = (ctx: Ctx) => diagnosticarRede(ctx.store.project).filter((d) => d.codigo !== 'ligacao_aberta' && d.codigo !== 'rede_sem_saida' && d.codigo !== 'inclinacao_fora_limite');
const Ls = (ctx: Ctx, id: string): number[] => porFamilia(ctx, id).map((c) => Number(c.values?.L ?? 0)).sort((a, b) => a - b);
const vertical = (c: Component): boolean => Math.abs((c.inclinacao?.[0] ?? 0)) < 1e-9;

/** Ambiente com a Krona esgoto, recolhendo as mensagens da ferramenta. */
function ambiente(familia = ESGOTO) {
  const ctx = makeEnv();
  ctx.env.options().componentFamilyId = familia;
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  return { ctx, msgs };
}

/** Clica `a` na cota `za` e `b` na cota `zb` (a cota do painel muda entre os cliques). */
function trecho(ctx: Ctx, a: [number, number], za: number, b: [number, number], zb: number) {
  const t = tool('tubo', ctx.env);
  opcoesTubo.z = za;
  clickAt(t, a[0], a[1]);
  opcoesTubo.z = zb;
  clickAt(t, b[0], b[1]);
  return t;
}

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0;
  opcoesTubo.declividade = 0;
  opcoesTubo.modoCota = 'subir_primeiro';
});

describe('planejarPrumada (puro)', () => {
  it('mesma cota, declividade e distância nula não geram joelho', () => {
    expect(planejarPrumada([0, 0, 0], [3, 0, 0], 'subir_primeiro', 0, ESGOTO)).toEqual({ bloqueio: null, intermediarios: [] });
    expect(planejarPrumada([0, 0, 0], [3, 0, 2], 'subir_primeiro', 1, ESGOTO)).toEqual({ bloqueio: null, intermediarios: [] });
    expect(planejarPrumada([0, 0, 0], [0.0004, 0, 2], 'andar_primeiro', 0, ESGOTO)).toEqual({ bloqueio: null, intermediarios: [] });
  });
  it('o ponto do joelho depende do modo', () => {
    expect(planejarPrumada([0, 0, 0], [3, 1, 2], 'subir_primeiro', 0, ESGOTO).intermediarios).toEqual([[0, 0, 2]]);
    expect(planejarPrumada([0, 0, 0], [3, 1, 2], 'andar_primeiro', 0, ESGOTO).intermediarios).toEqual([[3, 1, 0]]);
  });
});

describe('subir primeiro', () => {
  it('z de 0 a 2 m e 3 m em planta: vertical de 2 m e horizontal de 3 m, menos o recuo, e 1 joelho 90° da Krona', () => {
    const { ctx } = ambiente();
    trecho(ctx, [0, 0], 0, [3, 0], 2);
    expect(porFamilia(ctx, ESGOTO)).toHaveLength(2);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho90')).toHaveLength(1);
    const L = Ls(ctx, ESGOTO);
    expect(L[0]).toBeCloseTo(2000 - 58, 2);
    expect(L[1]).toBeCloseTo(3000 - 58, 2);
    expect(problemas(ctx)).toEqual([]);
  });
  it('o joelho fica no pé da vertical, na cota final, e não sobra tubo diagonal', () => {
    const { ctx } = ambiente();
    trecho(ctx, [0, 0], 0, [3, 0], 2);
    const j = porFamilia(ctx, 'fam_krona_esgoto_joelho90')[0];
    expect([j?.x, j?.y, j?.z]).toEqual([0, 0, 2]);
    const tubos = porFamilia(ctx, ESGOTO);
    expect(tubos.filter(vertical)).toHaveLength(1);
    expect(tubos.filter((c) => Math.abs((c.inclinacao?.[0] ?? 0) - Math.PI / 2) < 1e-6 || vertical(c))).toHaveLength(2);
  });
  it('a cadeia continua do ponto final: o terceiro clique liga com outro joelho, sem diagonal e com a rede fechando', () => {
    const { ctx } = ambiente();
    const t = trecho(ctx, [0, 0], 0, [3, 0], 2);
    clickAt(t, 3, 2);
    expect(porFamilia(ctx, ESGOTO)).toHaveLength(3);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho90')).toHaveLength(2);
    expect(problemas(ctx)).toEqual([]);
  });
  it('desfazer volta o gesto inteiro (2 tubos e o joelho) em UM passo', () => {
    const { ctx } = ambiente();
    trecho(ctx, [0, 0], 0, [3, 0], 2);
    expect(comps(ctx)).toHaveLength(3);
    ctx.store.undo();
    expect(comps(ctx)).toHaveLength(0);
  });
  it('soldável (DN 25): vertical e horizontal com o joelho soldável', () => {
    opcoesTubo.dn = 25;
    const { ctx } = ambiente(SOLDAVEL);
    trecho(ctx, [0, 0], 0, [2, 0], 1);
    expect(porFamilia(ctx, SOLDAVEL)).toHaveLength(2);
    expect(porFamilia(ctx, 'fam_krona_soldavel_joelho90')).toHaveLength(1);
    expect(problemas(ctx)).toEqual([]);
  });
});

describe('andar primeiro', () => {
  it('horizontal na cota de baixo até o pé e depois vertical; joelho no pé, rede sem problema', () => {
    opcoesTubo.modoCota = 'andar_primeiro';
    const { ctx } = ambiente();
    trecho(ctx, [0, 0], 0, [3, 0], 2);
    const j = porFamilia(ctx, 'fam_krona_esgoto_joelho90')[0];
    expect([j?.x, j?.y, j?.z]).toEqual([3, 0, 0]);
    const L = Ls(ctx, ESGOTO);
    expect(L[0]).toBeCloseTo(2000 - 58, 2);
    expect(L[1]).toBeCloseTo(3000 - 58, 2);
    expect(problemas(ctx)).toEqual([]);
  });
});

describe('diagonal', () => {
  it('a 30° é bloqueada com a mensagem e o ângulo real; nada é criado', () => {
    opcoesTubo.modoCota = 'diagonal';
    const { ctx, msgs } = ambiente();
    trecho(ctx, [0, 0], 0, [3, 0], Math.tan(Math.PI / 6) * 3);
    expect(comps(ctx)).toHaveLength(0);
    expect(msgs.at(-1)).toBe('Bloqueado: não existe conexão para este ângulo (30°). Use "Subir primeiro", "Andar primeiro" ou mude a cota para um desnível que dê 45° ou 90°.');
  });
  it('a 45° gera UM tubo inclinado; encadeado a um trecho horizontal entra o joelho de 45° da Krona nos dois lados', () => {
    opcoesTubo.modoCota = 'diagonal';
    const { ctx } = ambiente();
    const t = tool('tubo', ctx.env);
    opcoesTubo.z = 0;
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    opcoesTubo.z = 1;
    clickAt(t, 2, 0);
    opcoesTubo.z = 1;
    clickAt(t, 3, 0);
    expect(porFamilia(ctx, ESGOTO)).toHaveLength(3);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho45')).toHaveLength(2);
    expect(problemas(ctx)).toEqual([]);
  });
  it('a 45° sozinha gera 1 tubo diagonal sem joelho', () => {
    opcoesTubo.modoCota = 'diagonal';
    const { ctx } = ambiente();
    trecho(ctx, [0, 0], 0, [2, 0], 2);
    expect(porFamilia(ctx, ESGOTO)).toHaveLength(1);
    expect(Ls(ctx, ESGOTO)[0]).toBeCloseTo(Math.SQRT2 * 2000, 2);
  });
  it('tolera 45° ± 2,5° e bloqueia fora disso', () => {
    expect(planejarPrumada([0, 0, 0], [1, 0, Math.tan((47 * Math.PI) / 180)], 'diagonal', 0, ESGOTO).bloqueio).toBeNull();
    expect(planejarPrumada([0, 0, 0], [1, 0, Math.tan((48 * Math.PI) / 180)], 'diagonal', 0, ESGOTO).bloqueio).toContain('(48°)');
  });
  it('família sem tipo de tubulação (F1 genérica) mantém o tubo inclinado de antes, em qualquer ângulo', () => {
    opcoesTubo.modoCota = 'diagonal';
    opcoesTubo.dn = 50;
    const ctx = makeEnv();
    trecho(ctx, [0, 0], 0, [3, 0], 1);
    const tubos = porFamilia(ctx, 'fam_tubo_esgoto');
    expect(tubos).toHaveLength(1);
    expect(Number(tubos[0]?.values?.L)).toBeCloseTo(Math.hypot(3, 1) * 1000, 2);
  });
});

describe('casos limite', () => {
  it('distância em planta nula: só o trecho vertical, sem joelho', () => {
    const { ctx } = ambiente();
    trecho(ctx, [1, 1], 0, [1, 1], 2);
    expect(porFamilia(ctx, ESGOTO)).toHaveLength(1);
    expect(Number(porFamilia(ctx, ESGOTO)[0]?.values?.L)).toBeCloseTo(2000, 2);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho90')).toHaveLength(0);
  });
  it('desnível de 5 cm em DN 100 é BLOQUEADO (cota insuficiente) e nada é criado; 40 cm passa', () => {
    const { ctx, msgs } = ambiente();
    trecho(ctx, [0, 0], 0, [3, 0], 0.05);
    expect(comps(ctx)).toHaveLength(0);
    expect(msgs.at(-1)).toMatch(/^Bloqueado: Mudança de cota de 50 mm insuficiente para a prumada/);
    const ok = ambiente();
    trecho(ok.ctx, [0, 0], 0, [3, 0], 0.4);
    expect(porFamilia(ok.ctx, ESGOTO)).toHaveLength(2);
    expect(Ls(ok.ctx, ESGOTO)[0]).toBeCloseTo(400 - 58, 2);
  });
  it('o comprimento mínimo depois dos recuos continua valendo: horizontal de 10 cm passa (42 mm de tubo) e, com joelho nas duas pontas, é bloqueada', () => {
    const { ctx } = ambiente();
    trecho(ctx, [0, 0], 0, [0.1, 0], 2);
    expect(Ls(ctx, ESGOTO)[0]).toBeCloseTo(100 - 58, 2);
    const familia = familiaDaBiblioteca(ESGOTO);
    const dominio = tipoDaFamiliaDeTubo(ESGOTO);
    expect(familia && dominio).toBeTruthy();
    const v = viabilidadeDoTrecho(makeEnv().store.project, familia as Familia, 'esgoto', dominio?.regras ?? null, 100, { xyz: [0, 0, 2], alvo: null }, { xyz: [0.1, 0, 2], alvo: null }, { a: 0.058, b: 0.058 });
    expect(v.bloqueio).toMatch(/se sobrepõem/);
  });
  it('declividade diferente de 0: o desnível é intencional e o trecho sai UM tubo inclinado, como antes', () => {
    opcoesTubo.declividade = 1;
    const { ctx } = ambiente();
    trecho(ctx, [0, 0], 0, [3, 0], 2);
    expect(porFamilia(ctx, ESGOTO)).toHaveLength(1);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho90')).toHaveLength(0);
    expect(Number(porFamilia(ctx, ESGOTO)[0]?.values?.L)).toBeCloseTo(Math.hypot(3, 0.03) * 1000, 2);
  });
  it('F1 genérica no padrão (subir primeiro) também sobe na vertical e anda na horizontal', () => {
    opcoesTubo.dn = 50;
    const ctx = makeEnv();
    trecho(ctx, [0, 0], 0, [3, 0], 2);
    expect(porFamilia(ctx, 'fam_tubo_esgoto')).toHaveLength(2);
  });
});
