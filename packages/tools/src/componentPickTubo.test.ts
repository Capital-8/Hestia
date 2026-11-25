import { beforeEach, describe, expect, it } from 'vitest';
import { isComponent } from '@hestia/model';
import { opcoesTubo } from './tuboTool.ts';
import { componentAt, componentIdsInBox } from './pick.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/*
 * Seleção de tubos MEP na planta (ficha B9, defeito 5): clique no meio do tubo, no joelho e janela, com tubo da Krona (esgoto) desenhado
 * pela ferramenta Tubo, em ângulo reto e em diagonal.
 */

const ESGOTO = 'fam_krona_esgoto_tubo_corte';
const MPP = 0.01;

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
});

/** Dois trechos em L ((0,0)→(2,0)→(2,2)) com joelho, desenhados pela ferramenta. */
function emL() {
  const ctx = makeEnv();
  ctx.env.options().componentFamilyId = ESGOTO;
  const t = tool('tubo', ctx.env);
  clickAt(t, 0, 0);
  clickAt(t, 2, 0);
  clickAt(t, 2, 2);
  const comps = Object.values(ctx.store.project.elements).filter(isComponent);
  return { ctx, tubos: comps.filter((c) => c.familyId === ESGOTO), joelhos: comps.filter((c) => c.familyId !== ESGOTO) };
}

describe('seleção de tubo Krona na planta', () => {
  it('o desenho em L tem 2 tubos e 1 joelho', () => {
    const { tubos, joelhos } = emL();
    expect(tubos).toHaveLength(2);
    expect(joelhos).toHaveLength(1);
  });

  it('clique no meio de um trecho horizontal seleciona o tubo', () => {
    const { ctx, tubos } = emL();
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1, y: 0 }, MPP)).toBe(tubos[0]?.id);
  });

  it('clique no meio do trecho vertical seleciona o outro tubo', () => {
    const { ctx, tubos } = emL();
    expect(componentAt(ctx.store.project, 'lv_0', { x: 2, y: 1 }, MPP)).toBe(tubos[1]?.id);
  });

  it('clique no joelho seleciona o joelho', () => {
    const { ctx, joelhos } = emL();
    expect(componentAt(ctx.store.project, 'lv_0', { x: 2, y: 0 }, MPP)).toBe(joelhos[0]?.id);
  });

  it('clique a 3 cm do eixo (dentro do raio do DN 100) ainda pega o tubo', () => {
    const { ctx, tubos } = emL();
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1, y: 0.03 }, MPP)).toBe(tubos[0]?.id);
  });

  it('clique longe do tubo não pega nada', () => {
    const { ctx } = emL();
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1, y: 0.5 }, MPP)).toBeNull();
  });

  it('janela que cobre tudo seleciona os dois tubos e o joelho', () => {
    const { ctx, tubos, joelhos } = emL();
    const ids = componentIdsInBox(ctx.store.project, 'lv_0', { x: -0.5, y: -0.5 }, { x: 2.5, y: 2.5 });
    expect(ids.sort()).toEqual([...tubos, ...joelhos].map((c) => c.id).sort());
  });

  it('janela que cobre só o trecho horizontal e o joelho não leva o vertical', () => {
    const { ctx, tubos } = emL();
    const ids = componentIdsInBox(ctx.store.project, 'lv_0', { x: -0.5, y: -0.5 }, { x: 2.5, y: 0.5 });
    expect(ids).toContain(tubos[0]?.id);
    expect(ids).not.toContain(tubos[1]?.id);
  });

  it('tubo na diagonal: clique no meio seleciona', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 2);
    const tubo = Object.values(ctx.store.project.elements).filter(isComponent).find((c) => c.familyId === ESGOTO);
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1, y: 1 }, MPP)).toBe(tubo?.id);
  });
});
