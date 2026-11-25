import { beforeEach, describe, expect, it } from 'vitest';
import { isComponent, validateProject, type Component } from '@hestia/model';
import { diagnosticarRede, planejarTrocaDeBitola } from '@hestia/engine';
import { opcoesTubo } from './tuboTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';
import { aplicarTrocaDeBitola, textoDaTroca, trocarBitolaDoTubo } from './trocaBitolaAplicar.ts';

/*
 * Troca de bitola de tubo já traçado (ficha B3), no ambiente da ferramenta Tubo: desenha dois trechos a 90° com a ferramenta e troca
 * o DN do primeiro. Krona esgoto (sem redução): a conexão sai e avisa; esgoto genérico da F1 (com redução): a redução entra.
 */

const KRONA = 'fam_krona_esgoto_tubo_corte';
const GENERICO = 'fam_tubo_esgoto';
const comps = (ctx: ReturnType<typeof makeEnv>): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const porFamilia = (ctx: ReturnType<typeof makeEnv>, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);

/** Dois trechos de 1 m a 90° (tubos, joelho e recuos pela ferramenta Tubo). */
function desenhar(familia: string, dn = 100): { ctx: ReturnType<typeof makeEnv>; t0: Component; t1: Component } {
  const ctx = makeEnv();
  opcoesTubo.dn = dn;
  if (familia === KRONA) ctx.env.options().componentFamilyId = familia;
  const t = tool('tubo', ctx.env);
  clickAt(t, 0, 0);
  clickAt(t, 1, 0);
  clickAt(t, 1, 1);
  const tubos = porFamilia(ctx, familia);
  return { ctx, t0: tubos[0]!, t1: tubos[1]! };
}

const atual = (ctx: ReturnType<typeof makeEnv>, c: Component): Component => ctx.store.project.elements[c.id] as Component;

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
});

describe('troca de bitola na Krona esgoto', () => {
  it('troca o primeiro trecho de DN 100 para DN 75: o joelho fica, entra a redução e não há alerta', () => {
    const { ctx, t0, t1 } = desenhar(KRONA);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho90')).toHaveLength(1);
    const r = trocarBitolaDoTubo(ctx.env, t0.id, 75);
    expect(r.ok).toBe(true);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho90')).toHaveLength(1);
    const reducoes = porFamilia(ctx, 'fam_krona_esgoto_reducao_excentrica');
    expect(reducoes).toHaveLength(1);
    expect(reducoes[0]?.values?.COD).toBeDefined();
    expect(atual(ctx, t0).values?.DN).toBe(75);
    expect(atual(ctx, t1).values?.DN).toBe(100);
    expect(atual(ctx, t0).ligacoes?.b?.componenteId).toBe(reducoes[0]?.id);
    expect(atual(ctx, t1).ligacoes).toBeDefined();
    expect(r.mensagens).toEqual([]);
    expect(textoDaTroca(r)).toBe('');
    expect(diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'ligacao_aberta')).toHaveLength(2);
  });
  it('DN 63 é recusado com o motivo e as bitolas; nada muda e não há passo de desfazer novo', () => {
    const { ctx, t0 } = desenhar(KRONA);
    const antes = ctx.store.project;
    const r = trocarBitolaDoTubo(ctx.env, t0.id, 63);
    expect(r.ok).toBe(false);
    expect(r.recusa).toBe('DN 63 não existe na linha esgoto da Krona. Bitolas: 40, 50, 75, 100, 150, 200, 250.');
    expect(textoDaTroca(r)).toBe(r.recusa);
    expect(ctx.store.project).toBe(antes);
  });
  it('desfazer volta tudo num passo só: DN, joelho, ligações e comprimentos', () => {
    const { ctx, t0 } = desenhar(KRONA);
    const antes = JSON.stringify(ctx.store.project.elements);
    const versaoAntes = ctx.store.version;
    trocarBitolaDoTubo(ctx.env, t0.id, 75);
    expect(JSON.stringify(ctx.store.project.elements)).not.toBe(antes);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
    expect(ctx.store.version).toBeGreaterThan(versaoAntes);
    expect(validateProject(ctx.store.project)).toEqual([]);
  });
  it('troca para o mesmo DN não muda nada e não cria passo de desfazer', () => {
    const { ctx, t0 } = desenhar(KRONA);
    const antes = ctx.store.project;
    const undoAntes = ctx.store.undoLabel;
    const r = trocarBitolaDoTubo(ctx.env, t0.id, 100);
    expect(r).toEqual({ ok: true, mensagens: [] });
    expect(ctx.store.project).toBe(antes);
    expect(ctx.store.undoLabel).toBe(undoAntes);
  });
  it('o projeto continua válido depois da troca (conexões recíprocas, sistemas sem resto)', () => {
    const { ctx, t0 } = desenhar(KRONA);
    trocarBitolaDoTubo(ctx.env, t0.id, 75);
    expect(validateProject(ctx.store.project)).toEqual([]);
    const usados = new Set(comps(ctx).flatMap((c) => Object.values(c.ligacoes ?? {}).map((l) => l.sistemaId)));
    expect(Object.keys(ctx.store.project.sistemasMep ?? {}).every((id) => usados.has(id))).toBe(true);
  });
  it('trocar o segundo trecho também funciona: a redução liga-se ao tubo trocado, sem alerta', () => {
    const { ctx, t1 } = desenhar(KRONA);
    const plano = planejarTrocaDeBitola(ctx.store.project, t1.id, 50);
    expect(plano.alertas).toEqual([]);
    expect(plano.reducoesInseridas).toHaveLength(1);
    expect(aplicarTrocaDeBitola(ctx.env, plano).ok).toBe(true);
    expect(atual(ctx, t1).values?.DN).toBe(50);
    expect(atual(ctx, t1).ligacoes?.a?.componenteId).toBe(plano.reducoesInseridas[0]?.elementId);
  });
});

describe('troca de bitola no esgoto genérico (com redução)', () => {
  it('a redução entra entre o joelho e o tubo trocado, sem remover nem alertar', () => {
    const { ctx, t0 } = desenhar(GENERICO);
    const r = trocarBitolaDoTubo(ctx.env, t0.id, 75);
    expect(r).toEqual({ ok: true, mensagens: [] });
    const reducoes = porFamilia(ctx, 'fam_esgoto_reducao');
    expect(reducoes).toHaveLength(1);
    expect(reducoes[0]?.values).toMatchObject({ DN: 100, DN2: 75 });
    expect(porFamilia(ctx, 'fam_esgoto_curva90')).toHaveLength(1);
    expect(atual(ctx, t0).ligacoes?.b?.componenteId).toBe(reducoes[0]?.id);
    expect(validateProject(ctx.store.project)).toEqual([]);
  });
  it('desfazer remove a redução e devolve o DN, num passo só', () => {
    const { ctx, t0 } = desenhar(GENERICO);
    const antes = JSON.stringify(ctx.store.project.elements);
    trocarBitolaDoTubo(ctx.env, t0.id, 75);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
  });
});

describe('aplicação sem lançar dentro da transação', () => {
  it('plano com comando inválido não grava nada (ensaio antes) e devolve o motivo', () => {
    const { ctx, t0 } = desenhar(KRONA);
    const plano = planejarTrocaDeBitola(ctx.store.project, t0.id, 75);
    plano.comandos.push({ type: 'disconnectComponents', a: t0.id, ligacaoA: 'inexistente' });
    const antes = ctx.store.project;
    const undoAntes = ctx.store.undoLabel;
    const r = aplicarTrocaDeBitola(ctx.env, plano);
    expect(r.ok).toBe(false);
    expect(r.recusa).toContain('Não foi possível trocar a bitola');
    expect(ctx.store.project).toBe(antes);
    expect(ctx.store.undoLabel).toBe(undoAntes);
  });
  it('plano recusado devolve a recusa sem tocar o projeto', () => {
    const { ctx, t0 } = desenhar(KRONA);
    const antes = ctx.store.project;
    const r = aplicarTrocaDeBitola(ctx.env, planejarTrocaDeBitola(ctx.store.project, t0.id, 63));
    expect(r.ok).toBe(false);
    expect(ctx.store.project).toBe(antes);
  });
});
