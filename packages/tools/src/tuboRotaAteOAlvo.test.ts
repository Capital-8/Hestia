import { beforeEach, describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, type Component } from '@hestia/model';
import { diagnosticarRede, trechoMinimoDe, tipoDaFamiliaDeTubo } from '@hestia/engine';
import { FAMILIA_ELETRODUTO, opcoesEletroduto } from './eletrodutoTool.ts';
import { opcoesTubo } from './tuboTool.ts';
import { extremosDoTubo, type PontoTubo } from './tuboGeometria.ts';
import { pontasDoTubo } from './tuboApoio.ts';
import { semDerivacao } from './tuboMeio.ts';
import { verificarTraco, type EntradaRota } from './tuboRota.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

/*
 * Rota até o alvo (fase 4, ficha F5): a partir do meio de um tubo (ou de uma porta com direção) até um ponto em OUTRA cota, em direção que
 * não fecha com 90°/45°, ou até o meio de outro tubo. Vale a MENOR rota viável (menos trechos, depois menor comprimento) com os joelhos do
 * tipo; vertical (subir ou descer) + horizontais; L máximo pede ponto intermediário; declividade mantém o tubo reto inclinado.
 */

const ESG = 'fam_krona_esgoto_tubo_corte';
const TE = 'fam_krona_esgoto_te';
const JOELHO = 'fam_krona_esgoto_joelho90';
const CORRUGADO = 'fam_tigre_tigreflex_amarelo';
type Ctx = ReturnType<typeof makeEnv>;

const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const daFamilia = (ctx: Ctx, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
const ext = (ctx: Ctx, c: Component) => extremosDoTubo(ctx.store.project, c) as NonNullable<ReturnType<typeof extremosDoTubo>>;
const avisosDeRede = (ctx: Ctx) => diagnosticarRede(ctx.store.project).filter((d) => ['conexao_afastada', 'incompativel', 'conexao_invalida', 'conexoes_coladas', 'ligacao_incompativel'].includes(d.codigo));

/** Eixo dominante de um tubo: 'z' (vertical), 'x' ou 'y'. */
function eixoDe(ctx: Ctx, c: Component): 'x' | 'y' | 'z' {
  const e = ext(ctx, c);
  const [dx, dy, dz] = [Math.abs(e.b[0] - e.a[0]), Math.abs(e.b[1] - e.a[1]), Math.abs(e.b[2] - e.a[2])];
  return dz > dx && dz > dy ? 'z' : dx >= dy ? 'x' : 'y';
}

/** Tubo reto de `comp` m ao longo de +X na altura `y`, cota `z`, com a ferramenta já sem cadeia. */
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
  return { ctx, msgs, t };
}

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
  opcoesTubo.modoCota = 'subir_primeiro';
  opcoesEletroduto.z = 0.5;
  opcoesEletroduto.dn = 20;
  opcoesEletroduto.declividade = 0;
  opcoesEletroduto.familiaId = FAMILIA_ELETRODUTO;
});

describe('rota vertical + horizontal até um alvo em outra cota', () => {
  it('três deslocamentos (x, y e z): sobe do tê, anda em y e em x, com dois joelhos e a rede sem avisos', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0);
    opcoesTubo.z = 1.5;
    clickAt(t, 3, 1);
    expect(daFamilia(ctx, TE)).toHaveLength(1);
    expect(daFamilia(ctx, JOELHO)).toHaveLength(2);
    const ramal = daFamilia(ctx, ESG).filter((c) => [ext(ctx, c).a, ext(ctx, c).b].some((p) => Math.abs(p[1]) > 1e-6 || Math.abs(p[2] - 0.5) > 1e-6));
    expect(ramal.map((c) => eixoDe(ctx, c)).sort()).toEqual(['x', 'y', 'z']);
    expect(avisosDeRede(ctx)).toEqual([]);
  });

  it('o ramal sai do tê na vertical (subir primeiro) e termina na cota do clique final', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0);
    opcoesTubo.z = 1.5;
    clickAt(t, 3, 1);
    const te = daFamilia(ctx, TE)[0] as Component;
    const vertical = daFamilia(ctx, ESG).find((c) => eixoDe(ctx, c) === 'z') as Component;
    expect(Math.hypot(ext(ctx, vertical).a[0] - te.x, ext(ctx, vertical).a[1] - te.y)).toBeLessThan(1e-6);
    const alturas = daFamilia(ctx, ESG).flatMap((c) => [ext(ctx, c).a[2], ext(ctx, c).b[2]]);
    expect(Math.max(...alturas)).toBeCloseTo(1.5, 6);
  });

  it('a MENOR rota: com y e z diferentes (x igual) são só dois trechos e um joelho', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0);
    opcoesTubo.z = 1.5;
    clickAt(t, 2, 1);
    expect(daFamilia(ctx, JOELHO)).toHaveLength(1);
    expect(daFamilia(ctx, ESG)).toHaveLength(4);
    expect(avisosDeRede(ctx)).toEqual([]);
  });

  it('subir primeiro: a vertical fica no tê; andar primeiro: a vertical fica no fim (empate de trechos e de comprimento)', () => {
    const subir = com(ESG, 100);
    clickAt(subir.t, 2, 0);
    opcoesTubo.z = 1.5;
    clickAt(subir.t, 2, 1);
    const vSub = daFamilia(subir.ctx, ESG).find((c) => eixoDe(subir.ctx, c) === 'z') as Component;
    expect(ext(subir.ctx, vSub).a[1]).toBeCloseTo(0, 6);
    opcoesTubo.modoCota = 'andar_primeiro';
    opcoesTubo.z = 0.5;
    const andar = com(ESG, 100);
    clickAt(andar.t, 2, 0);
    opcoesTubo.z = 1.5;
    clickAt(andar.t, 2, 1);
    const vAnd = daFamilia(andar.ctx, ESG).find((c) => eixoDe(andar.ctx, c) === 'z') as Component;
    expect(ext(andar.ctx, vAnd).a[1]).toBeCloseTo(1, 6);
  });

  it('descer: alvo abaixo do tubo também fecha, com joelho e vertical para baixo', () => {
    const { ctx, t } = com(ESG, 100, 4, 1.5);
    clickAt(t, 2, 0);
    opcoesTubo.z = 0.5;
    clickAt(t, 2, 1.2);
    const vertical = daFamilia(ctx, ESG).find((c) => eixoDe(ctx, c) === 'z') as Component;
    expect(vertical).toBeDefined();
    expect(daFamilia(ctx, JOELHO)[0]?.z).toBeCloseTo(0.5, 6);
    expect(avisosDeRede(ctx)).toEqual([]);
  });

  it('alvo logo acima do ponto (Alt: ponto livre sobre o eixo): um trecho vertical só, ligado ao tê', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0);
    opcoesTubo.z = 1.5;
    clickAt(t, 2, 0, { alt: true });
    expect(daFamilia(ctx, TE)).toHaveLength(1);
    expect(daFamilia(ctx, JOELHO)).toHaveLength(0);
    expect(daFamilia(ctx, ESG).filter((c) => eixoDe(ctx, c) === 'z')).toHaveLength(1);
  });

  it('ângulo que não fecha (60° em planta, mesma cota): o tê sai a 90° e a rota entra no lugar do trecho solto', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0);
    clickAt(t, 2.5, 0.866);
    expect(daFamilia(ctx, TE)).toHaveLength(1);
    expect(daFamilia(ctx, JOELHO)).toHaveLength(1);
    expect(avisosDeRede(ctx)).toEqual([]);
  });

  it('um passo de desfazer volta a rede inteira', () => {
    const { ctx, t } = com(ESG, 100);
    const antes = JSON.stringify(ctx.store.project.elements);
    clickAt(t, 2, 0);
    opcoesTubo.z = 1.5;
    clickAt(t, 3, 1);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
  });
});

describe('alvo no MEIO de outro tubo', () => {
  /** Dois tubos paralelos: o de baixo em z = 0,5 (y = 0) e o de cima em z = 1,5 (y = 3). */
  function dois(dnAlvo = 100) {
    const a = com(ESG, 100);
    opcoesTubo.z = 1.5;
    opcoesTubo.dn = dnAlvo;
    clickAt(a.t, 0, 3);
    clickAt(a.t, 4, 3);
    a.t.cancel();
    opcoesTubo.dn = 100;
    opcoesTubo.z = 0.5;
    return a;
  }

  it('do meio de um ao meio do outro: dois tês, vertical + horizontal, um joelho e a rede sem avisos', () => {
    const { ctx, t } = dois();
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    expect(daFamilia(ctx, TE)).toHaveLength(2);
    expect(daFamilia(ctx, JOELHO)).toHaveLength(1);
    expect(daFamilia(ctx, ESG)).toHaveLength(6);
    expect(avisosDeRede(ctx)).toEqual([]);
  });

  it('o tubo de chegada é dividido e mantém uma metade de cada lado do tê', () => {
    const { ctx, t } = dois();
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    const alto = daFamilia(ctx, ESG).filter((c) => ext(ctx, c).a[1] === 3 && ext(ctx, c).b[1] === 3);
    expect(alto).toHaveLength(2);
  });

  it('chegando no meio de um tubo de DN diferente entra o tubo curto e a redução do lado da chegada', () => {
    const { ctx, t } = dois(75);
    opcoesTubo.dn = 100;
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    expect(daFamilia(ctx, 'fam_krona_esgoto_reducao_excentrica').length).toBeGreaterThanOrEqual(1);
    expect(daFamilia(ctx, TE)).toHaveLength(2);
  });

  it('o alvo no meio de outro tubo desfaz num passo só', () => {
    const { ctx, t } = dois();
    const antes = JSON.stringify(ctx.store.project.elements);
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
  });
});

describe('viabilidade, L máximo e declividade', () => {
  it('trecho acima de 6 m pede ponto intermediário: bloqueia com o motivo e nada é gravado', () => {
    const { ctx, msgs, t } = com(ESG, 100);
    const antes = comps(ctx).length;
    clickAt(t, 2, 0);
    clickAt(t, 2, 7);
    expect(comps(ctx)).toHaveLength(antes);
    expect(msgs.at(-1)).toMatch(/^Bloqueado: /);
    expect(msgs.at(-1)).toMatch(/ponto intermediário/);
  });

  it('a prévia do que não fecha fica VERMELHA, com "Bloqueado" no rótulo', () => {
    const { t } = com(ESG, 100);
    clickAt(t, 2, 0);
    t.move(P(2, 7));
    const itens = t.preview();
    expect(itens.some((i) => i.kind === 'line' && i.tone === 'invalid')).toBe(true);
    expect(itens.some((i) => i.kind === 'label' && i.text.startsWith('Bloqueado'))).toBe(true);
  });

  it('a prévia da rota viável mostra a rota INTEIRA em fantasma (um segmento por trecho)', () => {
    const { t } = com(ESG, 100);
    clickAt(t, 2, 0);
    opcoesTubo.z = 1.5;
    t.move(P(3, 1));
    const tracejados = t.preview().filter((i) => i.kind === 'line' && i.dashed === true);
    expect(tracejados).toHaveLength(3);
  });

  it('declividade diferente de 0 mantém o ramal reto e inclinado: nenhum joelho, um tê', () => {
    const { ctx, t } = com(ESG, 100);
    opcoesTubo.declividade = -1;
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    expect(daFamilia(ctx, TE)).toHaveLength(1);
    expect(daFamilia(ctx, JOELHO)).toHaveLength(0);
    const ramal = daFamilia(ctx, ESG).find((c) => eixoDe(ctx, c) === 'y') as Component;
    expect(ramal).toBeDefined();
    const e = ext(ctx, ramal);
    expect((e.b[2] - e.a[2]) / (e.b[1] - e.a[1])).toBeCloseTo(-0.01, 6);
  });

  it('trecho vertical curto demais para a prumada (cota insuficiente) bloqueia com sugestão e sem gravar', () => {
    const { ctx, msgs, t } = com(ESG, 100);
    const antes = comps(ctx).length;
    clickAt(t, 2, 0);
    opcoesTubo.z = 0.55;
    clickAt(t, 2, 1);
    expect(comps(ctx)).toHaveLength(antes);
    expect(msgs.at(-1)).toMatch(/^Bloqueado: /);
  });

  it('o tubo curto guarda o mínimo do tipo em toda a rota (sem peça colada em peça)', () => {
    const { ctx, t } = com(ESG, 100);
    clickAt(t, 2, 0);
    opcoesTubo.z = 1.5;
    clickAt(t, 3, 1);
    const minimo = trechoMinimoDe(tipoDaFamiliaDeTubo(ESG));
    for (const c of daFamilia(ctx, ESG)) expect(Number(c.values?.L)).toBeGreaterThanOrEqual(minimo - 1e-6);
  });
});

describe('tipos que não derivam: bloqueio com motivo e sugestão de caixa', () => {
  it('corrugado: clicar no meio de outro trecho bloqueia (o corrugado deriva de caixa)', () => {
    const ctx = makeEnv();
    const msgs: string[] = [];
    ctx.env.say = (m: string) => { msgs.push(m); };
    opcoesEletroduto.familiaId = CORRUGADO;
    const t = tool('eletroduto', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    const antes = comps(ctx).length;
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(comps(ctx)).toHaveLength(antes);
    expect(msgs.at(-1)).toMatch(/corrugado/);
    expect(msgs.at(-1)).toMatch(/caixa/);
  });

  it('eletroduto rígido da Krona: sem tê no catálogo, bloqueia e sugere a caixa', () => {
    const ctx = makeEnv();
    const msgs: string[] = [];
    ctx.env.say = (m: string) => { msgs.push(m); };
    const t = tool('eletroduto', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    const antes = comps(ctx).length;
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(comps(ctx)).toHaveLength(antes);
    expect(msgs.at(-1)).toMatch(/não tem tê/);
    expect(msgs.at(-1)).toMatch(/caixa/);
  });

  it('semDerivacao: corrugado e rígido elétrico bloqueiam; esgoto e soldável não', () => {
    expect(semDerivacao(CORRUGADO, null, 'eletroduto')?.sugestao).toMatch(/caixa/);
    expect(semDerivacao(FAMILIA_ELETRODUTO, tipoDaFamiliaDeTubo(FAMILIA_ELETRODUTO)?.regras ?? null, 'eletroduto')?.motivo).toMatch(/não tem tê/);
    expect(semDerivacao(ESG, tipoDaFamiliaDeTubo(ESG)?.regras ?? null, 'esgoto')).toBeNull();
    expect(semDerivacao('fam_krona_soldavel_tubo_corte', tipoDaFamiliaDeTubo('fam_krona_soldavel_tubo_corte')?.regras ?? null, 'agua_fria')).toBeNull();
  });
});

describe('porta com direção e meio de tubo (verificarTraco, sem ferramenta)', () => {
  function entrada(ctx: Ctx): EntradaRota {
    const familia = ctx.store.project.componentFamilies?.[ESG] ?? familiaDaBiblioteca(ESG);
    if (!familia) throw new Error('família ausente');
    const pontas = pontasDoTubo(familia, 100);
    if (!pontas) throw new Error('sem pontas');
    return { projeto: ctx.store.project, ctx: { familia, pontas }, regras: tipoDaFamiliaDeTubo(ESG)?.regras ?? null, levelId: 'lv_0', dn: 100, modo: 'subir_primeiro', declividade: 0, luvaEmLinha: false, respeitaEntradas: false };
  }

  it('porta virada para baixo: o primeiro trecho sai para baixo e a rota chega ao tê no sentido perpendicular', () => {
    const { ctx } = com(ESG, 100);
    const a: PontoTubo = { xyz: [2, 2, 1.5], alvo: { componentId: 'porta', ligacaoId: 'x' }, direcao: [0, 0, -1] };
    const b: PontoTubo = { xyz: [2, 0, 0.5], alvo: null, derivacao: true };
    const v = verificarTraco(entrada(ctx), a, b, []);
    expect(v.bloqueio).toBeNull();
    expect((v.pts[1] as PontoTubo).xyz[2]).toBeCloseTo(0.5, 6);
    expect((v.pts[1] as PontoTubo).xyz[1]).toBeCloseTo(2, 6);
  });

  it('porta virada para cima com o alvo abaixo: desvio em U (sobe, anda, desce) com três trechos', () => {
    const { ctx } = com(ESG, 100);
    const a: PontoTubo = { xyz: [2, 2, 1.5], alvo: { componentId: 'porta', ligacaoId: 'x' }, direcao: [0, 0, 1] };
    const b: PontoTubo = { xyz: [2, 0, 0.5], alvo: null, derivacao: true };
    const v = verificarTraco(entrada(ctx), a, b, []);
    expect(v.bloqueio).toBeNull();
    expect(v.pts).toHaveLength(4);
    expect((v.pts[1] as PontoTubo).xyz[2]).toBeGreaterThan(1.5);
  });

  it('porta sem direção livre em outra cota e derivação a 45°: o resultado vem do tipo (junção) sem inventar peça', () => {
    const { ctx } = com(ESG, 100);
    const a: PontoTubo = { xyz: [1, 1, 0.5], alvo: null };
    const b: PontoTubo = { xyz: [2, 0, 0.5], alvo: null, derivacao: true };
    const v = verificarTraco(entrada(ctx), a, b, []);
    expect(v.bloqueio).toBeNull();
    expect(v.pts).toHaveLength(2);
  });
});
