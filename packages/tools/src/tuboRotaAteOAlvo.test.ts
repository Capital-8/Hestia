import { beforeEach, describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, type Component } from '@hestia/model';
import { diagnosticarRede, trechoMinimoDe, tipoDaFamiliaDeTubo } from '@hestia/engine';
import { FAMILIA_ELETRODUTO, opcoesEletroduto } from './eletrodutoTool.ts';
import { opcoesTubo, type TuboTool } from './tuboTool.ts';
import { extremosDoTubo, type PontoTubo } from './tuboGeometria.ts';
import { pontasDoTubo } from './tuboApoio.ts';
import { EIXOS, listarCaminhosOrtogonais } from './tuboCaminho.ts';
import { meioDeTubo, semDerivacao } from './tuboMeio.ts';
import { verificarTraco, type EntradaRota } from './tuboRota.ts';
import { origemDoComponente } from './tuboOrigem.ts';
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
const CAIXA = 'fam_krona_eletrica_caixa_4x4';
type Ctx = ReturnType<typeof makeEnv>;

const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const daFamilia = (ctx: Ctx, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
const ext = (ctx: Ctx, c: Component) => extremosDoTubo(ctx.store.project, c) as NonNullable<ReturnType<typeof extremosDoTubo>>;
const avisosDeRede = (ctx: Ctx) => diagnosticarRede(ctx.store.project).filter((d) => ['conexao_afastada', 'incompativel', 'conexao_invalida', 'conexoes_coladas', 'ligacao_incompativel'].includes(d.codigo));

/** Eixo dominante de um tubo: 'z' (vertical), 'x' ou 'y'. */
function eixoDe(ctx: Ctx, c: Component): 'x' | 'y' | 'z' {
  const e = ext(ctx, c);
  const d = [Math.abs(e.b[0] - e.a[0]), Math.abs(e.b[1] - e.a[1]), Math.abs(e.b[2] - e.a[2])];
  return d[2] > d[0] && d[2] > d[1] ? 'z' : d[0] >= d[1] ? 'x' : 'y';
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
    const ramal = daFamilia(ctx, ESG).filter((c) => ext(ctx, c).a[1] !== 0 || ext(ctx, c).b[1] !== 0 || ext(ctx, c).a[2] !== 0.5 || ext(ctx, c).b[2] !== 0.5);
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
    expect(Math.min(ext(ctx, vertical).a[2], ext(ctx, vertical).b[2])).toBeCloseTo(0.5, 6);
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
    const tracejados = t.preview().filter((i) => i.kind === 'polygon' && i.dashed === true);
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
    expect(Math.abs(ext(ctx, ramal).b[2] - ext(ctx, ramal).a[2])).toBeCloseTo(0.02, 6);
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
  const meio = (ctx: Ctx): PontoTubo => ({ xyz: [2, 0, 0.5], alvo: null, derivacao: true });
  void meio;

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

  it('listarCaminhosOrtogonais: chegada restrita; sem sentido que sirva, lista vazia', () => {
    const x = EIXOS[0];
    expect(listarCaminhosOrtogonais([0, 0, 0], [0, 1, 1], null, [x as never], 'subir_primeiro', 0.05, 0.1)).toEqual([]);
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
