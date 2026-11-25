import { beforeEach, describe, expect, it } from 'vitest';
import { isComponent, type Component } from '@hestia/model';
import { opcoesTubo } from './tuboTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';
import { trocarBitolaDoTubo } from './trocaBitolaAplicar.ts';

/*
 * Troca de bitola (ficha B6) na Krona esgoto com a redução excêntrica no tipo: um trecho de DN 100 ligado DIRETO (sem peça) a outro
 * de DN 100, ao trocar o primeiro para DN 75, ganha a redução em vez de ter a ligação removida. Par sem tipo no catálogo continua
 * removendo a ligação, com aviso.
 */

const ESG = 'fam_krona_esgoto_tubo_corte';
const RED_ESG = 'fam_krona_esgoto_reducao_excentrica';
const comps = (ctx: ReturnType<typeof makeEnv>): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const porFamilia = (ctx: ReturnType<typeof makeEnv>, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
const atual = (ctx: ReturnType<typeof makeEnv>, c: Component): Component => ctx.store.project.elements[c.id] as Component;

/** Dois trechos retos de mesmo DN ligados direto (a ferramenta Tubo não põe peça entre tubos colineares do mesmo DN). */
function doisRetos(dn: number): { ctx: ReturnType<typeof makeEnv>; t0: Component; t1: Component } {
  const ctx = makeEnv();
  ctx.env.say = () => {};
  ctx.env.options().componentFamilyId = ESG;
  opcoesTubo.dn = dn;
  let t = tool('tubo', ctx.env);
  clickAt(t, 0, 0);
  clickAt(t, 1, 0);
  t.cancel();
  t = tool('tubo', ctx.env);
  clickAt(t, 1, 0);
  clickAt(t, 2, 0);
  t.cancel();
  const tubos = porFamilia(ctx, ESG);
  return { ctx, t0: tubos[0]!, t1: tubos[1]! };
}

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
});

describe('troca de bitola na Krona esgoto com redução no tipo', () => {
  it('DN 100 ligado direto a DN 100: trocar um para DN 75 insere a redução COD 656 em vez de remover a ligação', () => {
    const { ctx, t0, t1 } = doisRetos(100);
    expect(atual(ctx, t0).ligacoes?.b).toBeDefined();
    const r = trocarBitolaDoTubo(ctx.env, t0.id, 75);
    expect(r.ok).toBe(true);
    const reducoes = porFamilia(ctx, RED_ESG);
    expect(reducoes).toHaveLength(1);
    expect(reducoes[0]?.values?.COD).toBe(656);
    expect(reducoes[0]?.typeId).toBe('cod0656');
    expect(atual(ctx, t0).values?.DN).toBe(75);
    expect(atual(ctx, t1).values?.DN).toBe(100);
    expect(r.mensagens.some((m) => m.includes('removid'))).toBe(false);
  });

  it('par sem tipo no catálogo (DN 150 → 50, ligado direto): a ligação sai, com aviso, e nada é inventado', () => {
    const { ctx, t0 } = doisRetos(150);
    const r = trocarBitolaDoTubo(ctx.env, t0.id, 50);
    expect(r.ok).toBe(true);
    expect(porFamilia(ctx, RED_ESG)).toHaveLength(0);
    expect(atual(ctx, t0).ligacoes?.b).toBeUndefined();
    expect(r.mensagens.some((m) => m.includes('ligação foi removida'))).toBe(true);
  });
});
