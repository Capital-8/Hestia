import { beforeEach, describe, expect, it } from 'vitest';
import { isComponent, type Component } from '@hestia/model';
import { diagnosticarRede, tipoDaFamiliaDeTubo } from '@hestia/engine';
import { opcoesTubo } from './tuboTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/*
 * Ferramenta Tubo com a Krona (fichas L1, L3, O2 e P2): o tipo de tubulação vem da família do trecho; o DN só vale na lista do tipo;
 * os trechos se ligam por joelho, tê ou junção da Krona; cada trecho recua do encontro até a ponta ficar DENTRO da bolsa
 * (profundidade do catálogo) e o diagnóstico da rede não acusa afastamento nem incompatibilidade.
 */

const ESGOTO = 'fam_krona_esgoto_tubo_corte';
const SOLDAVEL = 'fam_krona_soldavel_tubo_corte';
const comps = (ctx: ReturnType<typeof makeEnv>): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const porFamilia = (ctx: ReturnType<typeof makeEnv>, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
const problemas = (ctx: ReturnType<typeof makeEnv>) => diagnosticarRede(ctx.store.project).filter((d) => d.codigo !== 'ligacao_aberta' && d.codigo !== 'rede_sem_saida');

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
});

describe('tipos de tubulação', () => {
  it('a família do trecho acha o tipo e as bitolas', () => {
    expect(tipoDaFamiliaDeTubo(ESGOTO)?.dominio).toBe('esgoto');
    expect(tipoDaFamiliaDeTubo(SOLDAVEL)?.bitolas).toContain(25);
    expect(tipoDaFamiliaDeTubo('fam_tubo_esgoto')).toBeUndefined();
  });
});

describe('ferramenta Tubo com a Krona', () => {
  it('DN fora da lista do tipo é recusado com o motivo e nada é criado', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    opcoesTubo.dn = 63;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(comps(ctx)).toHaveLength(0);
  });

  it('dois trechos a 90°: entra o joelho da Krona e cada trecho recua 58 mm (DN 100: B + Z = 103 mm, bolsa de 45 mm)', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    const tubos = porFamilia(ctx, ESGOTO);
    const joelhos = porFamilia(ctx, 'fam_krona_esgoto_joelho90');
    expect(tubos).toHaveLength(2);
    expect(joelhos).toHaveLength(1);
    const L = tubos.map((c) => Number(c.values?.L ?? 0)).sort((a, b) => a - b);
    expect(L[0]).toBeCloseTo(1000 - 58, 6);
    expect(L[1]).toBeCloseTo(1000 - 58, 6);
    expect(joelhos[0]?.x).toBeCloseTo(1, 9);
    expect(joelhos[0]?.y).toBeCloseTo(0, 9);
  });

  it('com o recuo, a rede não acusa conexão afastada nem ligações incompatíveis', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(problemas(ctx)).toEqual([]);
  });

  it('três trechos em L: dois joelhos, quatro encurtamentos, rede sem problema', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    clickAt(t, 0, 1);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho90')).toHaveLength(2);
    expect(problemas(ctx)).toEqual([]);
  });

  it('desvio de 45°: joelho de 45° da Krona e recuo = Z + B − B', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 2, 1);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho45')).toHaveLength(1);
    const L = porFamilia(ctx, ESGOTO).map((c) => Number(c.values?.L ?? 0)).sort((a, b) => a - b);
    // Z do joelho 45° DN 100 = 29,6 mm; o segundo trecho tem 1414,2 mm de eixo a eixo.
    // O motor arredonda as posições das ligações a 1 µm: confere a 2 casas (0,005 mm).
    expect(L[0]).toBeCloseTo(1000 - 29.6, 2);
    expect(L[1]).toBeCloseTo(Math.SQRT2 * 1000 - 29.6, 2);
    expect(problemas(ctx)).toEqual([]);
  });

  it('tê numa derivação a 90°: o tubo principal é dividido, cada ponta recua e a rede fecha', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    clickAt(t, 1, 1);
    clickAt(t, 1, 0);
    expect(porFamilia(ctx, 'fam_krona_esgoto_te').length).toBe(1);
    expect(porFamilia(ctx, ESGOTO)).toHaveLength(3);
    expect(problemas(ctx)).toEqual([]);
  });

  it('água fria soldável: joelho soldável, DN 25, recuo = Z (11,4 + 16,5 de bolsa menos 16,5 no DN 20)', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = SOLDAVEL;
    opcoesTubo.dn = 20;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(porFamilia(ctx, 'fam_krona_soldavel_joelho90')).toHaveLength(1);
    const L = porFamilia(ctx, SOLDAVEL).map((c) => Number(c.values?.L ?? 0)).sort((a, b) => a - b);
    expect(L[0]).toBeCloseTo(1000 - 11.4, 6);
    expect(problemas(ctx)).toEqual([]);
  });

  it('soldável não tem junção a 45°: o trecho fica sem essa conexão, com aviso, e nada é inventado', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = SOLDAVEL;
    opcoesTubo.dn = 25;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    clickAt(t, 1, 1);
    clickAt(t, 1.5, 0);
    expect(porFamilia(ctx, 'fam_krona_soldavel_te')).toHaveLength(0);
  });
});

describe('declividade ao desenhar (ficha M2)', () => {
  it('−1 % em 2 m: o ponto final desce 20 mm e o trecho sai com declividade de −1 % no modelo', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    opcoesTubo.declividade = -1;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    const c = porFamilia(ctx, ESGOTO)[0];
    expect(c?.z).toBeCloseTo(0.5, 9);
    // Comprimento do eixo = √(2² + 0,02²); inclinação interna medida a partir da vertical: 90° + atan(0,01).
    expect(Number(c?.values?.L)).toBeCloseTo(Math.hypot(2, 0.02) * 1000, 3);
    const incl = c?.inclinacao?.[0] ?? NaN;
    expect(Math.tan(Math.PI / 2 - incl) * 100).toBeCloseTo(-1, 6);
  });
  it('declividade 0 mantém o trecho em nível (comportamento de sempre)', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(Number(porFamilia(ctx, ESGOTO)[0]?.values?.L)).toBeCloseTo(2000, 6);
  });
  it('comprimento digitado também aplica a declividade (3 m a +2 %: sobe 60 mm)', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    opcoesTubo.declividade = 2;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    t.type?.('3');
    expect(Number(porFamilia(ctx, ESGOTO)[0]?.values?.L)).toBeCloseTo(Math.hypot(3, 0.06) * 1000, 3);
  });
});
