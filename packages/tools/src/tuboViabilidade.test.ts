import { beforeEach, describe, expect, it } from 'vitest';
import { isComponent, type Component } from '@hestia/model';
import { opcoesTubo } from './tuboTool.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

/*
 * Viabilidade na ferramenta Tubo (ficha B2): antes de gravar, os recuos REAIS das conexões decidem se o nó fica bem feito. Bloqueio
 * não cria nada (nem tubo nem conexão) e mantém o início da cadeia. Famílias sem encaixe (F1) seguem como antes.
 */

const ESGOTO = 'fam_krona_esgoto_tubo_corte';
type Ctx = ReturnType<typeof makeEnv>;
const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const falas = (ctx: Ctx): string[] => {
  const dita: string[] = [];
  const original = ctx.env.say;
  ctx.env.say = (m: string): void => {
    dita.push(m);
    original(m);
  };
  return dita;
};

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
});

describe('viabilidade na ferramenta Tubo (Krona)', () => {
  it('dois trechos a 90° com 60 mm no segundo: o tubo ficaria menor que o mínimo, é bloqueado e nada é criado', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const dita = falas(ctx);
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    const antes = comps(ctx).length;
    t.move(P(1, 1));
    t.type?.('0.06'); // 60 mm: o tubo, depois do recuo de 58 mm do joelho, ficaria com 2 mm
    expect(comps(ctx)).toHaveLength(antes);
    expect(comps(ctx).filter((c) => c.familyId === 'fam_krona_esgoto_joelho90')).toHaveLength(0);
    expect(dita.some((m) => m.startsWith('Bloqueado: '))).toBe(true);
    expect(dita.join(' ')).toMatch(/mm/);
  });

  it('o bloqueio mantém o primeiro ponto da cadeia: um clique válido depois cria o trecho a partir dele', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    t.move(P(1, 1));
    t.type?.('0.06');
    clickAt(t, 1, 1);
    const tubos = comps(ctx).filter((c) => c.familyId === ESGOTO);
    expect(tubos).toHaveLength(2);
    expect(comps(ctx).filter((c) => c.familyId === 'fam_krona_esgoto_joelho90')).toHaveLength(1);
  });

  it('os mesmos trechos com 1 m passam, com joelho', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const dita = falas(ctx);
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(comps(ctx).filter((c) => c.familyId === 'fam_krona_esgoto_joelho90')).toHaveLength(1);
    expect(dita.some((m) => m.startsWith('Bloqueado'))).toBe(false);
  });

  it('mudança de cota de 5 cm numa prumada é bloqueada; a de 40 cm passa', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const dita = falas(ctx);
    const t = tool('tubo', ctx.env);
    clickAt(t, 1, 0); // início a 0,50 m
    opcoesTubo.z = 0.55;
    clickAt(t, 1, 0); // prumada de 5 cm
    const antes = comps(ctx).length;
    clickAt(t, 2, 0); // trecho horizontal sairia do topo: joelho de 90° não cabe na prumada de 5 cm
    expect(comps(ctx)).toHaveLength(antes);
    expect(dita.some((m) => m.startsWith('Bloqueado: ') && m.includes('cota'))).toBe(true);

    const ctx2 = makeEnv();
    ctx2.env.options().componentFamilyId = ESGOTO;
    const dita2 = falas(ctx2);
    const t2 = tool('tubo', ctx2.env);
    opcoesTubo.z = 0.5;
    clickAt(t2, 1, 0);
    opcoesTubo.z = 0.9;
    clickAt(t2, 1, 0); // prumada de 40 cm
    clickAt(t2, 2, 0);
    expect(comps(ctx2).filter((c) => c.familyId === 'fam_krona_esgoto_joelho90')).toHaveLength(1);
    expect(dita2.some((m) => m.startsWith('Bloqueado'))).toBe(false);
  });

  it('declividade fora da faixa só avisa: o trecho é criado', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    opcoesTubo.declividade = 10;
    const dita = falas(ctx);
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(comps(ctx).filter((c) => c.familyId === ESGOTO)).toHaveLength(1);
    expect(dita.some((m) => m.includes('Declividade de 10 %'))).toBe(true);
    expect(dita.some((m) => m.startsWith('Bloqueado'))).toBe(false);
  });
});

describe('viabilidade: família sem encaixe (F1) não muda', () => {
  it('tubo da F1 com trechos curtos a 90° continua passando como antes', () => {
    const ctx = makeEnv();
    opcoesTubo.dn = 50;
    const dita = falas(ctx);
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    t.move(P(1, 0));
    t.type?.('0.06');
    t.move(P(0.06, 1));
    t.type?.('0.06');
    expect(comps(ctx).filter((c) => c.familyId === 'fam_tubo_esgoto')).toHaveLength(2);
    expect(dita.some((m) => m.startsWith('Bloqueado'))).toBe(false);
  });
});
