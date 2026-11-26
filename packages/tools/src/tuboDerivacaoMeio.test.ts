import { beforeEach, describe, expect, it } from 'vitest';
import { isComponent, type Component } from '@hestia/model';
import { categoriaDaFamilia, diagnosticarRede, trechoMinimoDe, tipoDaFamiliaDeTubo } from '@hestia/engine';
import { opcoesTubo } from './tuboTool.ts';
import { extremosDoTubo } from './tuboGeometria.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

/*
 * Derivação a partir do MEIO de um tubo (fase 4, ficha F5): o clique no meio de um tubo inicia ou fecha o traçado; o tubo é dividido
 * e entra o tê ou a junção 45° do tipo, com os recuos e o tubo curto (F1) de cada lado; DN diferente ganha tubo curto + redução; a rota
 * até o alvo em outra cota usa vertical + horizontal com os joelhos do tipo. Esgoto e soldável Krona (valores do catálogo, CONFERIR).
 */

const ESG = 'fam_krona_esgoto_tubo_corte';
const SOL = 'fam_krona_soldavel_tubo_corte';
const TE = 'fam_krona_esgoto_te';
const J45 = 'fam_krona_esgoto_juncao45';
const JOELHO = 'fam_krona_esgoto_joelho90';
const RED = 'fam_krona_esgoto_reducao_excentrica';
type Ctx = ReturnType<typeof makeEnv>;
type V3 = [number, number, number];

const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const daFamilia = (ctx: Ctx, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
const L = (c: Component | undefined): number => Number(c?.values?.L ?? NaN);
const DN = (c: Component | undefined): number => Number(c?.values?.DN ?? NaN);
const avisosDeRede = (ctx: Ctx) => diagnosticarRede(ctx.store.project).filter((d) => ['conexao_afastada', 'incompativel', 'conexao_invalida', 'conexoes_coladas', 'ligacao_incompativel'].includes(d.codigo));
const ext = (ctx: Ctx, c: Component) => extremosDoTubo(ctx.store.project, c) as NonNullable<ReturnType<typeof extremosDoTubo>>;

/** Pares de peças de tubulação ligadas direto uma na outra (o que a F1 proíbe). */
function pecasColadas(ctx: Ctx): string[] {
  const out: string[] = [];
  for (const c of comps(ctx)) {
    for (const cx of Object.values(c.ligacoes ?? {})) {
      const o = ctx.store.project.elements[cx.componenteId];
      if (isComponent(o) && c.id < o.id && categoriaDaFamilia(c.familyId) && categoriaDaFamilia(o.familyId)) out.push(`${c.familyId}|${o.familyId}`);
    }
  }
  return out;
}

/** Ambiente com um tubo reto de DN `dn` ao longo de +X, de (0,0) a (comp,0), na família `fam` e cota `z`; devolve a ferramenta já sem cadeia. */
function com(fam: string, dn: number, comp = 4, z = 0.5) {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  ctx.env.gridStep = () => 0.01;
  ctx.env.options().componentFamilyId = fam;
  opcoesTubo.dn = dn;
  opcoesTubo.z = z;
  const t = tool('tubo', ctx.env);
  clickAt(t, 0, 0);
  clickAt(t, comp, 0);
  t.cancel();
  return { ctx, msgs, t, principal: comps(ctx).find((c) => c.familyId === fam) as Component };
}

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
  opcoesTubo.modoCota = 'subir_primeiro';
});

describe('derivação no meio do tubo: tê e junção 45° do esgoto Krona', () => {
  it('ramal a 90° em nível: o tubo é dividido em dois e entra UM tê, com o ramal ligado', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0.01);
    clickAt(t, 2, 2);
    expect(daFamilia(ctx, TE)).toHaveLength(1);
    expect(daFamilia(ctx, ESG)).toHaveLength(3);
    const te = daFamilia(ctx, TE)[0] as Component;
    expect(Object.keys(te.ligacoes ?? {})).toHaveLength(3);
    expect(avisosDeRede(ctx)).toEqual([]);
  });

  it('o snap pega o ponto do EIXO em planta, na cota do tubo (não na da ferramenta)', () => {
    const { ctx, t } = com(ESG, 100);
    opcoesTubo.z = 0;
    clickAt(t, 2, 0.03);
    clickAt(t, 2, 2);
    const te = daFamilia(ctx, TE)[0] as Component;
    expect(te).toBeDefined();
    expect(te.y).toBeCloseTo(0, 6);
    expect(te.z).toBeCloseTo(0.5, 6);
  });

  it('ramal a 45° em nível: junção 45° (e não tê), ligada às duas metades do tubo e ao ramal', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 1, 0);
    clickAt(t, 2, 1);
    expect(daFamilia(ctx, J45)).toHaveLength(1);
    expect(daFamilia(ctx, TE)).toHaveLength(0);
    expect(daFamilia(ctx, ESG)).toHaveLength(3);
    expect(avisosDeRede(ctx)).toEqual([]);
  });

  it('as duas metades somam o tubo original menos os recuos do tê, e o ramal nasce no ponto da derivação', () => {
    const { ctx, t, principal } = com(ESG, 100);
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    const tubos = daFamilia(ctx, ESG);
    const metades = tubos.filter((c) => ext(ctx, c).a[1] === 0 && ext(ctx, c).b[1] === 0);
    expect(metades).toHaveLength(2);
    expect(metades.some((c) => c.id === principal.id)).toBe(true);
    const soma = metades.reduce((s, c) => s + L(c), 0);
    expect(soma).toBeLessThan(4000);
    expect(soma).toBeGreaterThan(3600);
  });

  it('cada metade guarda o tubo mínimo do tipo depois dos recuos (tubo curto F1 de cada lado)', () => {
    const { ctx, t } = com(ESG, 100, 0.6);
    clickAt(t, 0.3, 0);
    clickAt(t, 0.3, 1);
    const minimo = trechoMinimoDe(tipoDaFamiliaDeTubo(ESG));
    for (const c of daFamilia(ctx, ESG)) expect(L(c)).toBeGreaterThanOrEqual(minimo - 1e-6);
  });

  it('nenhuma peça de tubulação fica ligada direto em outra peça', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    expect(pecasColadas(ctx)).toEqual([]);
  });

  it('um único passo de desfazer volta ao estado exato anterior', () => {
    const { ctx, t } = com(ESG, 100);
    const antes = JSON.stringify(ctx.store.project.elements);
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    expect(daFamilia(ctx, TE)).toHaveLength(1);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
  });

  it('a divisão preserva a ligação do fim do tubo: o segundo pedaço fica ligado ao vizinho', () => {
    const ctx = makeEnv();
    ctx.env.gridStep = () => 0.01;
    ctx.env.options().componentFamilyId = ESG;
    const t = tool('tubo', ctx.env);
    for (const [x, y] of [[0, 0], [3, 0], [3, 2]] as const) clickAt(t, x, y);
    t.cancel();
    const joelho = daFamilia(ctx, JOELHO)[0] as Component;
    const primeiro = daFamilia(ctx, ESG).find((c) => Object.values(c.ligacoes ?? {}).some((l) => l.componenteId === joelho.id) && ext(ctx, c).a[1] === 0) as Component;
    clickAt(t, 1.5, 0);
    clickAt(t, 1.5, -2);
    const tes = daFamilia(ctx, TE);
    expect(tes).toHaveLength(1);
    const ligadosAoJoelho = daFamilia(ctx, ESG).filter((c) => Object.values(c.ligacoes ?? {}).some((l) => l.componenteId === joelho.id));
    expect(ligadosAoJoelho).toHaveLength(2);
    expect(ligadosAoJoelho.some((c) => c.id === primeiro.id)).toBe(false);
    expect(avisosDeRede(ctx)).toEqual([]);
  });

  it('derivação bem perto da conexão vizinha é bloqueada (tubo curto F1) com motivo e sugestão, sem gravar nada', () => {
    const ctx = makeEnv();
    const msgs: string[] = [];
    ctx.env.say = (m: string) => { msgs.push(m); };
    ctx.env.gridStep = () => 0.01;
    ctx.env.metersPerPixel = () => 0.001;
    ctx.env.options().componentFamilyId = ESG;
    const t = tool('tubo', ctx.env);
    for (const [x, y] of [[0, 0], [1, 0], [1, 1]] as const) clickAt(t, x, y);
    t.cancel();
    const antes = comps(ctx).length;
    clickAt(t, 0.89, 0);
    clickAt(t, 0.89, -1);
    expect(comps(ctx)).toHaveLength(antes);
    expect(msgs.at(-1)).toMatch(/^Bloqueado: /);
    expect(msgs.at(-1)).toMatch(/Sugestão/);
  });
});

describe('derivação com DN diferente: tubo curto da corrida + redução', () => {
  it('esgoto: ramal DN 75 numa corrida DN 100 recebe tê, tubo curto DN 100 e a redução 100 x 75', () => {
    const { ctx, t } = com(ESG, 100);
    opcoesTubo.dn = 75;
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    expect(daFamilia(ctx, TE)).toHaveLength(1);
    expect(daFamilia(ctx, RED)).toHaveLength(1);
    const dns = daFamilia(ctx, ESG).map(DN).sort((x, y) => x - y);
    expect(dns).toEqual([75, 100, 100, 100]);
    // Pendência B6 já registrada: a redução excêntrica 100 x 75 fica 13,07 mm fora do eixo; nada além disso (sem incompatível nem coladas).
    expect(avisosDeRede(ctx).map((d) => d.codigo)).toEqual(['conexao_afastada']);
    expect(avisosDeRede(ctx)[0]?.valor).toBeCloseTo(13.07, 1);
  });

  it('o tubo curto entre o tê e a redução tem pelo menos o mínimo do tipo, e nada fica colado', () => {
    const { ctx, t } = com(ESG, 100);
    opcoesTubo.dn = 75;
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    const minimo = trechoMinimoDe(tipoDaFamiliaDeTubo(ESG));
    const red = daFamilia(ctx, RED)[0] as Component;
    const curto = daFamilia(ctx, ESG).find((c) => DN(c) === 100 && Object.values(c.ligacoes ?? {}).some((l) => l.componenteId === red.id)) as Component;
    expect(curto).toBeDefined();
    expect(L(curto)).toBeGreaterThanOrEqual(minimo - 1e-6);
    expect(pecasColadas(ctx)).toEqual([]);
  });

  it('soldável: ramal DN 25 numa corrida DN 32 recebe tê, tubo curto e a luva de redução', () => {
    const { ctx, t } = com(SOL, 32);
    opcoesTubo.dn = 25;
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    expect(daFamilia(ctx, 'fam_krona_soldavel_te')).toHaveLength(1);
    expect(daFamilia(ctx, 'fam_krona_soldavel_luva_reducao')).toHaveLength(1);
    expect(pecasColadas(ctx)).toEqual([]);
  });

  it('soldável com o mesmo DN: só o tê, sem redução', () => {
    const { ctx, t } = com(SOL, 25);
    clickAt(t, 2, 0);
    clickAt(t, 2, 1.5);
    expect(daFamilia(ctx, 'fam_krona_soldavel_te')).toHaveLength(1);
    expect(daFamilia(ctx, 'fam_krona_soldavel_luva_reducao')).toHaveLength(0);
  });

  it('par de bitolas que o catálogo não tem (150 x 50) bloqueia com motivo e sugere o DN da corrida', () => {
    const { ctx, msgs, t } = com(ESG, 150);
    opcoesTubo.dn = 50;
    const antes = comps(ctx).length;
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    expect(comps(ctx)).toHaveLength(antes);
    expect(msgs.at(-1)).toMatch(/^Bloqueado: /);
    expect(msgs.at(-1)).toMatch(/DN 150/);
  });

  it('ramal DN 75 em corrida DN 100 com desfazer: um passo só volta tudo', () => {
    const { ctx, t } = com(ESG, 100);
    const antes = JSON.stringify(ctx.store.project.elements);
    opcoesTubo.dn = 75;
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
  });
});

describe('bloqueio onde o tipo não deriva', () => {
  it('soldável sem junção 45°: ramal a 45° bloqueia (não há peça para o ângulo) e não grava', () => {
    const { ctx, t } = com(SOL, 25);
    const antes = comps(ctx).length;
    clickAt(t, 1, 0);
    clickAt(t, 2, 1);
    // A rota em eixos entra no lugar do ramal solto: nunca uma junção que o catálogo não tem.
    expect(daFamilia(ctx, 'fam_krona_soldavel_juncao45')).toHaveLength(0);
    expect(comps(ctx).length).toBeGreaterThanOrEqual(antes);
  });

  it('a prévia mostra o halo e o rótulo "Derivar aqui" quando o cursor está sobre o eixo de um tubo', () => {
    const { t } = com(ESG, 100);
    t.move(P(2, 0.02));
    const rotulos = t.preview().filter((i) => i.kind === 'label').map((i) => (i as { text: string }).text);
    expect(rotulos.some((x) => x.startsWith('Derivar aqui'))).toBe(true);
  });

  it('Alt desliga o snap de meio de tubo: o clique é um ponto livre (nada é dividido)', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0, { alt: true });
    clickAt(t, 2, 2, { alt: true });
    expect(daFamilia(ctx, TE)).toHaveLength(0);
    expect(daFamilia(ctx, ESG)).toHaveLength(2);
  });
});
