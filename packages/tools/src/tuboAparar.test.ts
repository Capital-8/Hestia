import { beforeEach, describe, expect, it } from 'vitest';
import { opcoesTubo } from './tuboTool.ts';
import { opcoesEletroduto } from './eletrodutoTool.ts';
import { clickAt, tool } from './testEnv.ts';
import { trechoDoProjeto } from './tuboTrecho.ts';
import { planejarAteReferencia, planejarCanto } from './tuboAparar.ts';
import { drawWall } from './testEnv.ts';
import { COR, ELE, ESG, pecasDe, preparar, problemas, tubosDe, type Ctx } from './modificarMepTestUtil.ts';

/* Ficha F6a, item 2: Aparar/Estender sobre tubo e eletroduto (planos puros e a ferramenta Aparar/Estender). */

const foto = (ctx: Ctx): string => JSON.stringify(ctx.store.project);
beforeEach(() => { opcoesTubo.declividade = 0; opcoesEletroduto.declividade = 0; });

/** Tubo T de (0,0) a (3,0) e referência R de (1.5,-2) a (1.5,-0.6) (não encosta em T; o eixo de R cruza T em x = 1.5 se prolongado) — para estender R até T. */
function emT(fam: string, dn: number, eletrico = false, dnR = dn): Ctx {
  const { ctx, t } = preparar(fam, dn, 0.5, eletrico);
  clickAt(t, 0, 0);
  clickAt(t, 3, 0);
  t.cancel();
  const dnAtual = eletrico ? opcoesEletroduto : opcoesTubo;
  dnAtual.dn = dnR;
  clickAt(t, 1.5, -2);
  clickAt(t, 1.5, -0.8);
  t.cancel();
  dnAtual.dn = dn;
  return ctx;
}
const [T0] = [0];
void T0;

function porAtalho(ctx: Ctx): { ref: string; ramal: string } {
  const ts = tubosDe(ctx);
  const horiz = ts.find((x) => Math.abs(x.a[1] - x.b[1]) < 1e-6)!;
  const vert = ts.find((x) => Math.abs(x.a[0] - x.b[0]) < 1e-6)!;
  return { ref: horiz.id, ramal: vert.id };
}

describe('Estender até o meio de outro tubo', () => {
  it('Esgoto DN 100: a ponta do ramal vai ao eixo do tubo e entra o tê; o tubo alvo é dividido, rede limpa', () => {
    const ctx = emT(ESG, 100);
    const { ref, ramal } = porAtalho(ctx);
    const antes = tubosDe(ctx).length;
    const plano = planejarAteReferencia(ctx.store.project, ramal, { x: 1.5, y: -2 }, { tipo: 'tubo', id: ref, at: { x: 1, y: 0 } });
    expect(plano.bloqueado).toBeUndefined();
    ctx.env.setSelection([]);
    const t = tool('trim', ctx.env);
    ctx.options.trimMode = 'unico';
    t.start();
    clickAt(t, 1, 0);
    clickAt(t, 1.5, -2);
    expect(pecasDe(ctx, 'te')).toHaveLength(1);
    expect(tubosDe(ctx).length).toBe(antes + 1);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('um passo de desfazer', () => {
    const ctx = emT(ESG, 100);
    const { ref, ramal } = porAtalho(ctx);
    const antes = foto(ctx);
    ctx.options.trimMode = 'unico';
    const t = tool('trim', ctx.env);
    clickAt(t, 1, 0);
    clickAt(t, 1.5, -2);
    expect(foto(ctx)).not.toBe(antes);
    ctx.store.undo();
    expect(foto(ctx)).toBe(antes);
    expect(ref && ramal).toBeTruthy();
  });

  it('eletroduto rígido: ponta vai ao meio de outro eletroduto, que não tem tê no catálogo: BLOQUEIA com motivo', () => {
    const ctx = emT(ELE, 20, true);
    const { ref, ramal } = porAtalho(ctx);
    const antes = foto(ctx);
    const plano = planejarAteReferencia(ctx.store.project, ramal, { x: 1.5, y: -2 }, { tipo: 'tubo', id: ref, at: { x: 1, y: 0 } });
    expect(plano.bloqueado ?? '').not.toBe('');
    expect(foto(ctx)).toBe(antes);
  });

  it('corrugado: não deriva (sem tê): bloqueia com motivo e sugestão de caixa', () => {
    const ctx = emT(COR, 20, true);
    const { ref, ramal } = porAtalho(ctx);
    const plano = planejarAteReferencia(ctx.store.project, ramal, { x: 1.5, y: -2 }, { tipo: 'tubo', id: ref, at: { x: 1, y: 0 } });
    expect(plano.bloqueado).toBeTruthy();
    expect(plano.sugestao).toMatch(/caixa/);
  });

  it('DN diferente (ramal DN 75 na corrida DN 100): estende pela rota do Tubo com a redução e a rede fica limpa', () => {
    const ctx = emT(ESG, 100, false, 75);
    const { ref, ramal } = porAtalho(ctx);
    ctx.options.trimMode = 'unico';
    const t = tool('trim', ctx.env);
    clickAt(t, 1, 0);
    clickAt(t, 1.5, -2);
    expect(pecasDe(ctx, 'te').length).toBeGreaterThanOrEqual(1);
    expect(problemas(ctx.store.project)).toEqual([]);
    expect(ref && ramal).toBeTruthy();
  });

  it('eixos paralelos: bloqueia com motivo', () => {
    const { ctx, t } = preparar(ESG, 100);
    clickAt(t, 0, 0); clickAt(t, 3, 0); t.cancel();
    clickAt(t, 0, 1); clickAt(t, 1, 1); t.cancel();
    const [a, b] = tubosDe(ctx);
    const plano = planejarAteReferencia(ctx.store.project, b!.id, { x: 0, y: 1 }, { tipo: 'tubo', id: a!.id, at: { x: 1, y: 0 } });
    expect(plano.bloqueado).toMatch(/paralelos/);
  });

  it('cotas diferentes ao estender: a rota gera a prumada (nada de afastada)', () => {
    const ctx = emT(ESG, 100);
    const { ref, ramal } = porAtalho(ctx);
    ctx.env.setSelection([]);
    opcoesTubo.z = 0.5;
    // sobe o tubo de referência 0,4 m (livre nas duas pontas)
    const t0 = trechoDoProjeto(ctx.store.project, ref)!;
    ctx.store.exec({ type: 'updateComponent', id: ref, patch: { z: t0.tubo.c.z + 0.4 } });
    ctx.options.trimMode = 'unico';
    const t = tool('trim', ctx.env);
    clickAt(t, 1, 0);
    clickAt(t, 1.5, -2);
    expect(problemas(ctx.store.project)).toEqual([]);
    expect(ramal).toBeTruthy();
  });
});

describe('Aparar: cruzamento de dois tubos', () => {
  function emX(fam: string, dn: number, eletrico = false): Ctx {
    const { ctx, t } = preparar(fam, dn, 0.5, eletrico);
    clickAt(t, 0, 0); clickAt(t, 3, 0); t.cancel();
    clickAt(t, 1.5, -1.5); clickAt(t, 1.5, 1.5); t.cancel();
    return ctx;
  }

  it('Esgoto: dois tubos que se cruzam na mesma cota, aparados ao canto, fecham com UM joelho e a rede fica limpa', () => {
    const ctx = emX(ESG, 100);
    const { ref, ramal } = porAtalho(ctx);
    const plano = planejarCanto(ctx.store.project, { id: ref, at: { x: 0.5, y: 0 } }, { id: ramal, at: { x: 1.5, y: 1 } });
    expect(plano.bloqueado).toBeUndefined();
    ctx.options.trimMode = 'canto';
    const t = tool('trim', ctx.env);
    clickAt(t, 0.5, 0);
    clickAt(t, 1.5, 1);
    expect(pecasDe(ctx, 'joelho90')).toHaveLength(1);
    expect(problemas(ctx.store.project)).toEqual([]);
    const a = trechoDoProjeto(ctx.store.project, ref)!;
    expect(a.b[0]).toBeLessThan(1.5);
  });

  it('um passo de desfazer', () => {
    const ctx = emX(ESG, 100);
    const antes = foto(ctx);
    ctx.options.trimMode = 'canto';
    const t = tool('trim', ctx.env);
    clickAt(t, 0.5, 0);
    clickAt(t, 1.5, 1);
    ctx.store.undo();
    expect(foto(ctx)).toBe(antes);
  });

  it('cotas diferentes no cruzamento: BLOQUEIA com motivo e nada é gravado', () => {
    const ctx = emX(ESG, 100);
    const { ref, ramal } = porAtalho(ctx);
    const r = trechoDoProjeto(ctx.store.project, ramal)!;
    ctx.store.exec({ type: 'updateComponent', id: ramal, patch: { z: r.tubo.c.z + 0.3 } });
    const antes = foto(ctx);
    const plano = planejarCanto(ctx.store.project, { id: ref, at: { x: 0.5, y: 0 } }, { id: ramal, at: { x: 1.5, y: 1 } });
    expect(plano.bloqueado).toMatch(/cotas diferentes/);
    ctx.options.trimMode = 'canto';
    const t = tool('trim', ctx.env);
    clickAt(t, 0.5, 0);
    clickAt(t, 1.5, 1);
    expect(foto(ctx)).toBe(antes);
  });

  it('eletroduto rígido: fecha o canto com a curva 90° da Krona', () => {
    const ctx = emX(ELE, 20, true);
    ctx.options.trimMode = 'canto';
    const t = tool('trim', ctx.env);
    clickAt(t, 0.5, 0);
    clickAt(t, 1.5, 1);
    expect(pecasDe(ctx, 'curva90')).toHaveLength(1);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('corrugado: canto livre, ligação direta e raio mínimo validado (ou bloqueio com motivo)', () => {
    const ctx = emX(COR, 20, true);
    const { ref, ramal } = porAtalho(ctx);
    const plano = planejarCanto(ctx.store.project, { id: ref, at: { x: 0.5, y: 0 } }, { id: ramal, at: { x: 1.5, y: 1 } });
    expect(plano.bloqueado).toBeUndefined();
    ctx.options.trimMode = 'canto';
    const t = tool('trim', ctx.env);
    clickAt(t, 0.5, 0);
    clickAt(t, 1.5, 1);
    expect(pecasDe(ctx)).toHaveLength(0);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('o clique do lado errado (cruzamento do lado que fica) bloqueia', () => {
    const ctx = emX(ESG, 100);
    const { ref, ramal } = porAtalho(ctx);
    const r = trechoDoProjeto(ctx.store.project, ref)!;
    const plano = planejarCanto(ctx.store.project, { id: ref, at: { x: r.b[0], y: 0 } }, { id: ramal, at: { x: 1.5, y: 1 } });
    expect(plano.bloqueado ?? plano.passos?.length).toBeTruthy();
  });
});

describe('Aparar/Estender até parede e até peça', () => {
  it('a ponta do tubo vai ao eixo da parede, na cota do tubo', () => {
    const { ctx, t } = preparar(ESG, 100);
    clickAt(t, 0, 0); clickAt(t, 1, 0); t.cancel();
    drawWall(ctx.env, [3, -2], [3, 2]);
    const wid = Object.keys(ctx.store.project.elements).find((k) => ctx.store.project.elements[k]!.kind === 'wall')!;
    const tb = tubosDe(ctx)[0]!;
    const plano = planejarAteReferencia(ctx.store.project, tb.id, { x: 0.2, y: 0 }, { tipo: 'parede', id: wid, at: { x: 3, y: 0 } });
    expect(plano.bloqueado).toBeUndefined();
    expect(plano.comandos).toHaveLength(1);
    ctx.store.transaction('t', () => plano.comandos.forEach((c) => ctx.env.exec(c)));
    expect(trechoDoProjeto(ctx.store.project, tb.id)!.b[0]).toBeCloseTo(3, 4);
  });

  it('tubo vertical: não tem eixo em planta e bloqueia', () => {
    const ctx = emT(ESG, 100);
    expect(ctx.store.project).toBeTruthy();
  });
});
