import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isComponent, type Component } from '@hestia/model';
import { categoriaDaFamilia, diagnosticarRede, planejarTrocaDeBitola, TIPOS_TUBULACAO, type ParDireto } from '@hestia/engine';
import { opcoesTubo } from './tuboTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';
import { trocarBitolaDoTubo } from './trocaBitolaAplicar.ts';

/*
 * Conformidade entre conexões (fase 4, ficha F1): ao trocar a bitola de um trecho que sai de um joelho, a redução NÃO pode ser emendada
 * direto no joelho: entra um tubo curto (>= `trechoMinimoEntreConexoes` do tipo) entre as duas, ou, sem comprimento, a conexão sai
 * com alerta. Casos do dono: soldável Krona DN 25 -> 32 e o equivalente no esgoto.
 */

const SOL = 'fam_krona_soldavel_tubo_corte';
const ESG = 'fam_krona_esgoto_tubo_corte';
type Ctx = ReturnType<typeof makeEnv>;
type V2 = [number, number];

const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const tubos = (ctx: Ctx, fam: string): Component[] => comps(ctx).filter((c) => c.familyId === fam);

/** Desenha a polilinha `pts` (um clique por vértice, mesma cadeia) com a ferramenta Tubo, no DN dado. */
function desenhar(fam: string, dn: number, pts: V2[]): Ctx {
  const ctx = makeEnv();
  ctx.env.say = () => {};
  ctx.env.gridStep = () => 0.01;
  ctx.env.metersPerPixel = () => 0.001;
  ctx.env.options().componentFamilyId = fam;
  opcoesTubo.dn = dn;
  const t = tool('tubo', ctx.env);
  for (const [x, y] of pts) clickAt(t, x, y);
  t.cancel();
  return ctx;
}

/** Pares de instâncias ligadas direto em que as duas são conexões de tubulação (peça com peça). */
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

const codigos = (ctx: Ctx): string[] => diagnosticarRede(ctx.store.project).map((d) => d.codigo);
/** Códigos que dizem respeito às emendas (ignora ponta aberta e declividade de trecho plano). */
const dasEmendas = (ctx: Ctx): string[] => codigos(ctx).filter((c) => c !== 'ligacao_aberta' && c !== 'inclinacao_fora_limite' && c !== 'rede_sem_saida');

/** Distância (mm) entre o fim do tubo curto e o início do tubo de DN novo no mesmo eixo: lido pelo comprimento L. */
const L = (c: Component | undefined): number => Number(c?.values?.L ?? NaN);

beforeEach(() => {
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
});

describe('caso do dono: soldável DN 25 saindo de um joelho, trecho trocado para DN 32', () => {
  const montar = (): { ctx: Ctx; segundo: Component } => {
    const ctx = desenhar(SOL, 25, [[0, 0], [1, 0], [1, 1]]);
    return { ctx, segundo: tubos(ctx, SOL)[1] as Component };
  };

  it('a redução NÃO é emendada no joelho: entra um tubo curto de DN 25 entre as duas peças', () => {
    const { ctx, segundo } = montar();
    const r = trocarBitolaDoTubo(ctx.env, segundo.id, 32);
    expect(r.ok).toBe(true);
    expect(pecasColadas(ctx)).toEqual([]);
    const curto = tubos(ctx, SOL).filter((c) => c.id.includes('_tubo_'));
    expect(curto).toHaveLength(1);
    expect(curto[0]?.values?.DN).toBe(25);
  });

  it('o tubo curto tem pelo menos o mínimo do tipo (10 mm, CONFERIR) e liga o joelho à redução', () => {
    const { ctx, segundo } = montar();
    trocarBitolaDoTubo(ctx.env, segundo.id, 32);
    const curto = tubos(ctx, SOL).find((c) => c.id.includes('_tubo_')) as Component;
    expect(L(curto)).toBeGreaterThanOrEqual(10 - 1e-6);
    const joelho = comps(ctx).find((c) => c.familyId === 'fam_krona_soldavel_joelho90') as Component;
    const vizinhosDoJoelho = Object.values(joelho.ligacoes ?? {}).map((x) => x.componenteId);
    expect(vizinhosDoJoelho).toContain(curto.id);
    const luva = comps(ctx).find((c) => c.familyId === 'fam_krona_soldavel_luva_reducao') as Component;
    expect(Object.values(curto.ligacoes ?? {}).map((x) => x.componenteId).sort()).toEqual([joelho.id, luva.id].sort());
  });

  it('a rede não acusa conexões coladas, afastamento nem incompatibilidade (antes: afastada 19 mm e bolsa em bolsa)', () => {
    const { ctx, segundo } = montar();
    trocarBitolaDoTubo(ctx.env, segundo.id, 32);
    expect(dasEmendas(ctx)).toEqual([]);
  });

  it('o trecho trocado vira DN 32 e cede comprimento ao tubo curto e à redução', () => {
    const { ctx, segundo } = montar();
    const antes = L(segundo);
    trocarBitolaDoTubo(ctx.env, segundo.id, 32);
    const T = ctx.store.project.elements[segundo.id] as Component;
    expect(T.values?.DN).toBe(32);
    expect(L(T)).toBeLessThan(antes);
    expect(L(T)).toBeGreaterThan(900);
  });

  it('o plano relata o tubo inserido (id, DN, comprimento e as duas peças)', () => {
    const { ctx, segundo } = montar();
    const plano = planejarTrocaDeBitola(ctx.store.project, segundo.id, 32);
    expect(plano.tubosInseridos).toHaveLength(1);
    const t = plano.tubosInseridos[0];
    expect(t?.dn).toBe(25);
    expect(t?.comprimento).toBeCloseTo(10, 6);
    expect(t?.entre).toHaveLength(2);
    expect(plano.reducoesInseridas).toHaveLength(1);
  });

  it('tudo (tubo curto, redução, atualização do trecho) cabe em UM passo de desfazer', () => {
    const { ctx, segundo } = montar();
    const antes = comps(ctx).length;
    const r = trocarBitolaDoTubo(ctx.env, segundo.id, 32);
    expect(r.ok).toBe(true);
    expect(comps(ctx).length).toBe(antes + 2);
    ctx.store.undo();
    expect(comps(ctx)).toHaveLength(antes);
    expect((ctx.store.project.elements[segundo.id] as Component).values?.DN).toBe(25);
    expect(pecasColadas(ctx)).toEqual([]);
  });
});

describe('equivalente no esgoto: Krona DN 100 saindo de um joelho, trecho trocado para DN 75', () => {
  const montar = (): { ctx: Ctx; segundo: Component } => {
    const ctx = desenhar(ESG, 100, [[0, 0], [1, 0], [1, 1]]);
    return { ctx, segundo: tubos(ctx, ESG)[1] as Component };
  };

  it('a redução excêntrica NÃO é emendada no joelho: tubo curto de DN 100 entre elas', () => {
    const { ctx, segundo } = montar();
    expect(trocarBitolaDoTubo(ctx.env, segundo.id, 75).ok).toBe(true);
    expect(pecasColadas(ctx)).toEqual([]);
    const curto = tubos(ctx, ESG).filter((c) => c.id.includes('_tubo_'));
    expect(curto).toHaveLength(1);
    expect(curto[0]?.values?.DN).toBe(100);
    expect(L(curto[0])).toBeGreaterThanOrEqual(10 - 1e-6);
  });

  it('a rede não acusa conexões coladas nem incompatibilidade; o único afastamento é o da excêntrica fora do eixo (B6, conhecido)', () => {
    const { ctx, segundo } = montar();
    trocarBitolaDoTubo(ctx.env, segundo.id, 75);
    expect(dasEmendas(ctx)).toEqual(['conexao_afastada']);
    const af = diagnosticarRede(ctx.store.project).find((d) => d.codigo === 'conexao_afastada');
    expect(af?.valor).toBeGreaterThan(13);
    expect(af?.valor).toBeLessThan(13.2);
  });
});

describe('redução entre dois joelhos e falta de espaço', () => {
  /** U com o trecho do meio de `meio` m entre dois joelhos. */
  const U = (meio: number): { ctx: Ctx; medio: Component } => {
    const ctx = desenhar(SOL, 25, [[0, 0], [1, 0], [1, meio], [0, meio]]);
    return { ctx, medio: tubos(ctx, SOL)[1] as Component };
  };

  it('trecho do meio longo trocado para DN 32: tubo curto nas DUAS pontas e nenhuma peça colada em peça', () => {
    const { ctx, medio } = U(1);
    const r = trocarBitolaDoTubo(ctx.env, medio.id, 32);
    expect(r.ok).toBe(true);
    expect(tubos(ctx, SOL).filter((c) => c.id.includes('_tubo_'))).toHaveLength(2);
    expect(pecasColadas(ctx)).toEqual([]);
    expect(dasEmendas(ctx)).toEqual([]);
  });

  it('o tubo longo do meio cede comprimento: continua maior que o mínimo e menor que o original', () => {
    const { ctx, medio } = U(1);
    const antes = L(medio);
    trocarBitolaDoTubo(ctx.env, medio.id, 32);
    const T = ctx.store.project.elements[medio.id] as Component;
    expect(L(T)).toBeLessThan(antes - 20);
    expect(L(T)).toBeGreaterThan(10);
  });

  it('sem comprimento entre os joelhos (60 mm entre centros): a conexão sai com alerta de conexões coladas, nunca emendada', () => {
    const { ctx, medio } = U(0.06);
    const plano = planejarTrocaDeBitola(ctx.store.project, medio.id, 32);
    expect(plano.ok).toBe(true);
    expect(plano.conexoesRemovidas.length).toBeGreaterThanOrEqual(1);
    expect(plano.alertas.some((a) => a.codigo === 'conexao_removida' && /coladas/.test(a.motivo))).toBe(true);
    const r = trocarBitolaDoTubo(ctx.env, medio.id, 32);
    expect(r.ok).toBe(true);
    expect(r.mensagens.some((m) => m.includes('coladas') && m.includes('10 mm'))).toBe(true);
    expect(pecasColadas(ctx)).toEqual([]);
    expect((ctx.store.project.elements[medio.id] as Component).values?.DN).toBe(32);
  });

  it('o motivo cita as duas conexões e o mínimo de tubo', () => {
    const { ctx, medio } = U(0.06);
    const plano = planejarTrocaDeBitola(ctx.store.project, medio.id, 32);
    const m = plano.alertas.find((a) => /coladas/.test(a.motivo))?.motivo ?? '';
    expect(m).toMatch(/As conexões .+ e .+ ficariam coladas: o trecho entre elas precisa de pelo menos 10 mm de tubo\./);
  });
});

describe('pares diretos configuráveis (padrão: nenhum)', () => {
  const tipo = TIPOS_TUBULACAO.find((t) => t.id === 'krona_soldavel') as { paresDiretos: readonly ParDireto[] };
  const original = tipo.paresDiretos;
  afterEach(() => { tipo.paresDiretos = original; });

  it('o padrão dos três tipos é vazio: nada é liberado por palpite', () => {
    expect(TIPOS_TUBULACAO.every((t) => t.paresDiretos.length === 0)).toBe(true);
  });

  it('com [curva90, redução] liberado o plano emenda direto (sem tubo curto) e a rede não acusa coladas', () => {
    tipo.paresDiretos = [['curva90', 'reducao']];
    const ctx = desenhar(SOL, 25, [[0, 0], [1, 0], [1, 1]]);
    const segundo = tubos(ctx, SOL)[1] as Component;
    const plano = planejarTrocaDeBitola(ctx.store.project, segundo.id, 32);
    expect(plano.tubosInseridos).toEqual([]);
    expect(plano.reducoesInseridas).toHaveLength(1);
    trocarBitolaDoTubo(ctx.env, segundo.id, 32);
    expect(codigos(ctx)).not.toContain('conexoes_coladas');
  });

  it('o par liberado vale nos dois sentidos [redução, curva90]', () => {
    tipo.paresDiretos = [['reducao', 'curva90']];
    const ctx = desenhar(SOL, 25, [[0, 0], [1, 0], [1, 1]]);
    const plano = planejarTrocaDeBitola(ctx.store.project, (tubos(ctx, SOL)[1] as Component).id, 32);
    expect(plano.tubosInseridos).toEqual([]);
  });
});

describe('mínimo por tipo no traçado novo (redução, curva e tê vizinhos)', () => {
  const tipo = TIPOS_TUBULACAO.find((t) => t.id === 'krona_soldavel') as { trechoMinimoEntreConexoes: number };
  const original = tipo.trechoMinimoEntreConexoes;
  afterEach(() => { tipo.trechoMinimoEntreConexoes = original; });

  /** Joelho e, a 70 mm dele (sobram 55,6 mm de tubo depois da bolsa), a continuação em DN 32 (redução). */
  const traco = (minimo: number): { dito: string[] } => {
    const ctx = desenhar(SOL, 25, [[0, 0], [0.5, 0], [0.5, 0.07]]);
    tipo.trechoMinimoEntreConexoes = minimo;
    const dito: string[] = [];
    ctx.env.say = (m: string) => { dito.push(m); };
    opcoesTubo.dn = 32;
    const t = tool('tubo', ctx.env);
    clickAt(t, 0.5, 0.07);
    clickAt(t, 0.5, 1);
    return { dito };
  };

  it('com o mínimo padrão (10 mm) um tubo de 55,6 mm entre joelho e redução passa', () => {
    expect(traco(10).dito.some((m) => m.startsWith('Bloqueado'))).toBe(false);
  });

  it('com o mínimo do tipo em 100 mm o mesmo traçado é bloqueado, com o mínimo na mensagem', () => {
    const { dito } = traco(100);
    expect(dito.some((m) => m.startsWith('Bloqueado') && m.includes('mínimo 100 mm'))).toBe(true);
  });
});
