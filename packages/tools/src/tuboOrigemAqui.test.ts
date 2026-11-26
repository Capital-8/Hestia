import { beforeEach, describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, type Component } from '@hestia/model';
import { opcoesTubo, type TuboTool } from './tuboTool.ts';
import { extremosDoTubo } from './tuboGeometria.ts';
import { EIXOS, listarCaminhosOrtogonais } from './tuboCaminho.ts';
import { meioDeTubo } from './tuboMeio.ts';
import { origemDoComponente } from './tuboOrigem.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/*
 * Meio de tubo como snap, caminhos em eixos e 'Criar tubo a partir daqui' (fase 4, ficha F5): unidades puras e a origem pela seleção.
 */

const ESG = 'fam_krona_esgoto_tubo_corte';
const TE = 'fam_krona_esgoto_te';
const JOELHO = 'fam_krona_esgoto_joelho90';
const CAIXA = 'fam_krona_eletrica_caixa_4x4';
type Ctx = ReturnType<typeof makeEnv>;

const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const daFamilia = (ctx: Ctx, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
const ext = (ctx: Ctx, c: Component) => extremosDoTubo(ctx.store.project, c) as NonNullable<ReturnType<typeof extremosDoTubo>>;

function eixoDe(ctx: Ctx, c: Component): 'x' | 'y' | 'z' {
  const e = ext(ctx, c);
  const [dx, dy, dz] = [Math.abs(e.b[0] - e.a[0]), Math.abs(e.b[1] - e.a[1]), Math.abs(e.b[2] - e.a[2])];
  return dz > dx && dz > dy ? 'z' : dx >= dy ? 'x' : 'y';
}

/** Tubo reto de `comp` m ao longo de +X na cota `z`, com a ferramenta já sem cadeia. */
function com(fam: string, dn: number, comp = 4, z = 0.5) {
  const ctx = makeEnv();
  ctx.env.say = () => {};
  ctx.env.gridStep = () => 0.01;
  ctx.env.options().componentFamilyId = fam;
  opcoesTubo.dn = dn;
  opcoesTubo.z = z;
  const t = tool('tubo', ctx.env);
  clickAt(t, 0, 0);
  clickAt(t, comp, 0);
  t.cancel();
  return { ctx, t };
}

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
  opcoesTubo.modoCota = 'subir_primeiro';
});

describe('meio de tubo e caminhos em eixos (unidades)', () => {
  it('meioDeTubo: ponto do eixo em planta, cota do tubo; fora da tolerância, nulo; nas pontas, nulo', () => {
    const { ctx } = com(ESG, 100);
    const p = ctx.store.project;
    const m = meioDeTubo(p, ESG, { x: 2, y: 0.03 }, 0, 0.05, 0.05, Infinity);
    expect(m?.xyz[0]).toBeCloseTo(2, 6);
    expect(m?.xyz[2]).toBeCloseTo(0.5, 6);
    expect(meioDeTubo(p, ESG, { x: 2, y: 0.5 }, 0.5, 0.05, 0.05, Infinity)).toBeNull();
    expect(meioDeTubo(p, ESG, { x: 0.01, y: 0 }, 0.5, 0.05, 0.05, Infinity)).toBeNull();
  });

  it('meioDeTubo: com zTol finito só pega o tubo na cota da ferramenta', () => {
    const { ctx } = com(ESG, 100);
    const p = ctx.store.project;
    expect(meioDeTubo(p, ESG, { x: 2, y: 0 }, 1.5, 0.05, 0.05, 0.05)).toBeNull();
    expect(meioDeTubo(p, ESG, { x: 2, y: 0 }, 0.52, 0.05, 0.05, 0.05)).not.toBeNull();
  });

  it('meioDeTubo: tubo vertical não entra (em planta é um ponto)', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 1);
    opcoesTubo.z = 1.5;
    clickAt(t, 2, 1, { alt: true });
    const p = ctx.store.project;
    const vertical = daFamilia(ctx, ESG).find((c) => eixoDe(ctx, c) === 'z');
    expect(vertical).toBeDefined();
    expect(meioDeTubo(p, ESG, { x: 2, y: 1 }, 1, 0.05, 0.05, Infinity, vertical?.id)).toBeNull();
  });

  it('listarCaminhosOrtogonais: saídas restritas valem; o primeiro caminho é o de menos trechos', () => {
    const z = EIXOS[4];
    const y = EIXOS[2];
    const lista = listarCaminhosOrtogonais([0, 0, 0], [0, 1, 1], [z as never], null, 'subir_primeiro', 0.05, 0.1);
    expect(lista[0]?.trechos).toBe(2);
    expect(lista.every((c) => c.trechos >= 2)).toBe(true);
    const soY = listarCaminhosOrtogonais([0, 0, 0], [0, 1, 1], [y as never], null, 'andar_primeiro', 0.05, 0.1);
    expect(soY[0]?.intermediarios[0]?.[1]).toBeCloseTo(1, 6);
  });

  it('listarCaminhosOrtogonais: marca o desvio em U ou Z; o caminho monotônico não tem desvio', () => {
    const z = EIXOS[4];
    const reto = listarCaminhosOrtogonais([0, 0, 0], [0, 1, 1], null, null, 'subir_primeiro', 0.05, 0.1);
    expect(reto[0]?.desvio).toBe(false);
    const u = listarCaminhosOrtogonais([0, 0, 1], [0, 1, 0], [z as never], null, 'subir_primeiro', 0.05, 0.1);
    expect(u.length).toBeGreaterThan(0);
    expect(u.every((c) => c.desvio === true)).toBe(true);
  });
});

describe('Criar tubo a partir daqui (origem pela seleção)', () => {
  it('tubo clicado no meio: origem em derivação no ponto do eixo sob o cursor, com o DN e a família do tubo', () => {
    const { ctx } = com(ESG, 100);
    const tubo = daFamilia(ctx, ESG)[0] as Component;
    const o = origemDoComponente(ctx.store.project, tubo.id, { x: 1.2, y: 0.4 });
    expect('erro' in o).toBe(false);
    if ('erro' in o) return;
    expect(o.origem.derivacao).toBe(true);
    expect(o.origem.xyz[0]).toBeCloseTo(1.2, 6);
    expect(o.origem.xyz[2]).toBeCloseTo(0.5, 6);
    expect(o.dn).toBe(100);
    expect(o.familiaId).toBe(ESG);
    expect(o.ferramenta).toBe('tubo');
  });

  it('tubo clicado perto da ponta aberta: a origem é a porta livre dela', () => {
    const { ctx } = com(ESG, 100);
    const tubo = daFamilia(ctx, ESG)[0] as Component;
    const o = origemDoComponente(ctx.store.project, tubo.id, { x: 0.05, y: 0.02 });
    if ('erro' in o) throw new Error(o.erro);
    expect(o.origem.alvo?.componentId).toBe(tubo.id);
    expect(o.origem.derivacao).toBeUndefined();
  });

  it('sem cursor, o tubo sem ponta livre usa o centro; com as duas pontas abertas, a porta mais perto do cursor ou o meio', () => {
    const { ctx } = com(ESG, 100);
    const tubo = daFamilia(ctx, ESG)[0] as Component;
    const o = origemDoComponente(ctx.store.project, tubo.id);
    if ('erro' in o) throw new Error(o.erro);
    expect(o.origem.derivacao).toBe(true);
    expect(o.origem.xyz[0]).toBeCloseTo(2, 6);
  });

  it('componente sem porta livre (joelho com as duas bocas ligadas) devolve o motivo', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESG;
    opcoesTubo.dn = 100;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    t.cancel();
    const joelho = daFamilia(ctx, JOELHO)[0] as Component;
    const o = origemDoComponente(ctx.store.project, joelho.id);
    expect('erro' in o).toBe(true);
  });

  it('caixa elétrica: a origem é a porta livre mais perto do cursor, com a direção da entrada e a ferramenta Eletroduto', () => {
    const ctx = makeEnv();
    const f = familiaDaBiblioteca(CAIXA);
    if (!f) throw new Error('caixa ausente');
    ctx.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
    ctx.store.exec({ type: 'addComponent', component: { id: 'cx1', kind: 'component', familyId: CAIXA, typeId: f.tipos[0]?.id ?? null, levelId: 'lv_0', x: 0, y: 0, z: 0.5, rotation: 0, mirrored: false, values: { L: 100, A: 100, P: 50 }, mark: '' } as unknown as Component });
    const o = origemDoComponente(ctx.store.project, 'cx1', { x: 5, y: 0 });
    if ('erro' in o) throw new Error(o.erro);
    expect(o.ferramenta).toBe('eletroduto');
    expect(o.origem.direcao).toBeDefined();
    expect(o.origem.alvo?.componentId).toBe('cx1');
  });

  it('iniciarEm: a ferramenta começa no meio do tubo e o próximo clique fecha o ramal com tê, num passo de desfazer', () => {
    const { ctx, t } = com(ESG, 100);
    const tubo = daFamilia(ctx, ESG)[0] as Component;
    const o = origemDoComponente(ctx.store.project, tubo.id, { x: 2, y: 0.3 });
    if ('erro' in o) throw new Error(o.erro);
    const antes = JSON.stringify(ctx.store.project.elements);
    (t as unknown as TuboTool).iniciarEm(o.origem);
    clickAt(t, 2, 2);
    expect(daFamilia(ctx, TE)).toHaveLength(1);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
  });
});
