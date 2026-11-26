import { beforeEach, describe, expect, it } from 'vitest';
import { isComponent, type Component } from '@hestia/model';
import { opcoesTubo } from './tuboTool.ts';
import { opcoesEletroduto } from './eletrodutoTool.ts';
import { clickAt } from './testEnv.ts';
import { posicoesDosPegadores } from './tuboPegadores.ts';
import { planejarMeio } from './tuboPegadoresMeio.ts';
import { aplicarPlanoTrecho, planejarPonta } from './tuboPegadoresPlano.ts';
import { trechoDoProjeto } from './tuboTrecho.ts';
import { arrastarComSelecionar, CAIXA, COR, ELE, ESG, L, pecasDe, preparar, problemas, redeEmL, redeEntreCaixas, redeReta, SOL, tubosDe, type Ctx } from './modificarMepTestUtil.ts';

/*
 * Ficha F6a, item 1: pegadores do trecho selecionado (pontas e meio). Ponta livre só estica; ponta ligada leva a conexão (re-resolvida);
 * o meio move o trecho e, com a cota, gera a prumada; Alt solta; um passo de desfazer; rede sem afastada, incompatível nem colada.
 */

const foto = (ctx: Ctx): string => JSON.stringify(ctx.store.project);
const sel = (ctx: Ctx, id: string): void => ctx.env.setSelection([id]);
const primeiro = (ctx: Ctx, fam: string) => tubosDe(ctx, fam)[0]!;

beforeEach(() => {
  opcoesTubo.declividade = 0;
  opcoesEletroduto.declividade = 0;
});

describe('pegadores: onde ficam', () => {
  it('um trecho selecionado ganha três pegadores: as pontas e o meio; na ponta ligada a conexão o pegador fica no nó dela', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    const pos = posicoesDosPegadores(ctx.store.project, t1);
    expect(pos.a.x).toBeCloseTo(0, 6);
    expect(pos.b.x).toBeCloseTo(2, 6);
    expect(pos.b.y).toBeCloseTo(0, 6);
    expect(pos.meio.x).toBeCloseTo((t1.a[0] + t1.b[0]) / 2, 6);
  });
});

describe('pegador da ponta: Esgoto Krona DN 100', () => {
  it('ponta LIVRE só estica: o trecho cresce e a rede fica limpa', () => {
    const ctx = redeReta(ESG, 100);
    const t = primeiro(ctx, ESG);
    sel(ctx, t.id);
    arrastarComSelecionar(ctx, [3, 0], [3.5, 0]);
    const novo = trechoDoProjeto(ctx.store.project, t.id)!;
    expect(novo.b[0]).toBeCloseTo(3.5, 4);
    expect(novo.a[0]).toBeCloseTo(0, 6);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('prolongar a ponta ligada ao joelho leva o joelho e o outro trecho junto (o canto segue a 90°)', () => {
    const ctx = redeEmL(ESG, 100);
    const [t1, t2] = tubosDe(ctx, ESG) as [ReturnType<typeof primeiro>, ReturnType<typeof primeiro>];
    sel(ctx, t1.id);
    const antes = L(ctx.store.project.elements[t1.id] as Component);
    arrastarComSelecionar(ctx, [2, 0], [2.5, 0]);
    const joelho = pecasDe(ctx, 'joelho90')[0]!;
    expect(joelho.x).toBeCloseTo(2.5, 4);
    expect(L(ctx.store.project.elements[t1.id] as Component)).toBeCloseTo(antes + 500, 2);
    const novoT2 = trechoDoProjeto(ctx.store.project, t2.id)!;
    expect(novoT2.a[0]).toBeCloseTo(2.5, 4);
    expect(novoT2.b[0]).toBeCloseTo(2.5, 4);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('encurtar a ponta ligada: o trecho encolhe, o joelho acompanha e a rede fica limpa', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    const antes = L(ctx.store.project.elements[t1.id] as Component);
    arrastarComSelecionar(ctx, [2, 0], [1.5, 0]);
    expect(L(ctx.store.project.elements[t1.id] as Component)).toBeCloseTo(antes - 500, 2);
    expect(pecasDe(ctx, 'joelho90')[0]!.x).toBeCloseTo(1.5, 4);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('mover a ponta para o lado muda a direção do trecho e o joelho é re-resolvido (ou a ligação é desfeita com alerta), sem nada afastado', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    arrastarComSelecionar(ctx, [2, 0], [2, 0.8]);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('a ponta que deixaria o trecho abaixo do mínimo é BLOQUEADA com motivo e sugestão, e nada é gravado', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    const antes = foto(ctx);
    const plano = planejarPonta(ctx.store.project, t1.id, 'b', { x: 0.03, y: 0 });
    expect(plano.bloqueado).toMatch(/mínimo/);
    expect(plano.sugestao).toMatch(/Sugestão/);
    arrastarComSelecionar(ctx, [2, 0], [0.03, 0]);
    expect(foto(ctx)).toBe(antes);
  });

  it('passar do comprimento máximo da barra (L 6000) é BLOQUEADO e pede a divisão', () => {
    const ctx = redeReta(ESG, 100, 3);
    const t = primeiro(ctx, ESG);
    const plano = planejarPonta(ctx.store.project, t.id, 'b', { x: 8, y: 0 });
    expect(plano.bloqueado).toMatch(/comprimento máximo/);
    expect(plano.sugestao).toMatch(/Dividir/);
    const antes = foto(ctx);
    sel(ctx, t.id);
    arrastarComSelecionar(ctx, [3, 0], [8, 0]);
    expect(foto(ctx)).toBe(antes);
  });

  it('o gesto inteiro é UM passo de desfazer (um Ctrl+Z devolve o joelho e os dois trechos)', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    const antes = foto(ctx);
    arrastarComSelecionar(ctx, [2, 0], [2.5, 0]);
    expect(foto(ctx)).not.toBe(antes);
    ctx.store.undo();
    expect(foto(ctx)).toBe(antes);
  });

  it('com Alt as ligações SOLTAM: o joelho fica onde estava e a ligação é desfeita com alerta', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    arrastarComSelecionar(ctx, [2, 0], [2.5, 0], { alt: true });
    expect(pecasDe(ctx, 'joelho90')[0]!.x).toBeCloseTo(2, 6);
    expect(Object.keys((ctx.store.project.elements[t1.id] as Component).ligacoes ?? {})).not.toContain('b');
    expect(ctx.alertas().join(' ')).toMatch(/desfeita/);
  });

  it('com declividade ≠ 0 a ponta livre mantém a inclinação do trecho', () => {
    const { ctx, t } = preparar(ESG, 100, 0.5);
    opcoesTubo.declividade = 2;
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    t.cancel();
    opcoesTubo.declividade = 0;
    const tr = primeiro(ctx, ESG);
    const inclinacao = (tr.b[2] - tr.a[2]) / 3;
    sel(ctx, tr.id);
    arrastarComSelecionar(ctx, [3, 0], [4, 0]);
    const novo = trechoDoProjeto(ctx.store.project, tr.id)!;
    expect((novo.b[2] - novo.a[2]) / (novo.b[0] - novo.a[0])).toBeCloseTo(inclinacao, 4);
    expect(novo.b[0]).toBeCloseTo(4, 4);
  });

  it('DN diferente no outro lado do joelho (redução): a ponta prolonga e a rede segue limpa', () => {
    const { ctx, t } = preparar(ESG, 100, 0.5);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    opcoesTubo.dn = 75;
    clickAt(t, 2, 2);
    t.cancel();
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    arrastarComSelecionar(ctx, [2, 0], [2.4, 0]);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('água fria soldável DN 25: a ponta livre prolonga e a ligação ao joelho acompanha', () => {
    const ctx = redeEmL(SOL, 25);
    const t1 = primeiro(ctx, SOL);
    sel(ctx, t1.id);
    arrastarComSelecionar(ctx, [2, 0], [2.3, 0]);
    expect(pecasDe(ctx, 'joelho90')[0]!.x).toBeCloseTo(2.3, 4);
    expect(problemas(ctx.store.project)).toEqual([]);
  });
});

describe('pegador do meio: mover e prumada', () => {
  it('em planta, move o trecho inteiro como o corpo (F4): as conexões vão junto e a rede fica limpa', () => {
    const ctx = redeReta(ESG, 100);
    const t = primeiro(ctx, ESG);
    sel(ctx, t.id);
    arrastarComSelecionar(ctx, [1.5, 0], [1.5, 0.6]);
    const novo = trechoDoProjeto(ctx.store.project, t.id)!;
    expect(novo.a[1]).toBeCloseTo(0.6, 4);
    expect(novo.b[1]).toBeCloseTo(0.6, 4);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('com Ctrl o eixo vai à cota do campo Cota e a ponta ligada GANHA A PRUMADA (vertical e joelhos), rede limpa', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    opcoesTubo.z = 0.8;
    const joelhosAntes = pecasDe(ctx, 'joelho90').length;
    const meio = (t1.a[0] + t1.b[0]) / 2;
    arrastarComSelecionar(ctx, [meio, 0], [meio, 0], { ctrl: true });
    const novo = trechoDoProjeto(ctx.store.project, t1.id)!;
    expect(novo.a[2]).toBeCloseTo(0.8, 3);
    expect(pecasDe(ctx, 'joelho90').length).toBeGreaterThanOrEqual(joelhosAntes + 2);
    expect(tubosDe(ctx, ESG).some((x) => Math.abs(x.a[0] - x.b[0]) < 1e-3 && Math.abs(x.a[1] - x.b[1]) < 1e-3)).toBe(true);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('a prumada também é UM passo de desfazer', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    opcoesTubo.z = 0.8;
    const antes = foto(ctx);
    const meio = (t1.a[0] + t1.b[0]) / 2;
    arrastarComSelecionar(ctx, [meio, 0], [meio, 0], { ctrl: true });
    expect(foto(ctx)).not.toBe(antes);
    ctx.store.undo();
    expect(foto(ctx)).toBe(antes);
  });

  it('trecho livre nas duas pontas: a cota muda sem prumada nenhuma', () => {
    const ctx = redeReta(ESG, 100);
    const t = primeiro(ctx, ESG);
    const plano = planejarMeio(ctx.store.project, t.id, { x: 0, y: 0 }, { cota: 0.9 });
    expect(plano.bloqueado).toBeUndefined();
    expect(plano.rotas).toEqual([]);
    expect(aplicarPlanoTrecho(ctx.env, plano, 'x').ok).toBe(true);
    expect(trechoDoProjeto(ctx.store.project, t.id)!.a[2]).toBeCloseTo(0.9, 6);
  });

  it('com Alt o trecho anda sozinho e as ligações se desfazem com alerta', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = primeiro(ctx, ESG);
    sel(ctx, t1.id);
    arrastarComSelecionar(ctx, [1, 0], [1, 0.5], { alt: true });
    expect(Object.keys((ctx.store.project.elements[t1.id] as Component).ligacoes ?? {})).toEqual([]);
  });
});

describe('pegadores no eletroduto rígido (Krona)', () => {
  it('prolongar a ponta ligada à curva leva a curva junto e a rede fica limpa', () => {
    const ctx = redeEmL(ELE, 20, 0.5, true);
    const t1 = primeiro(ctx, ELE);
    sel(ctx, t1.id);
    arrastarComSelecionar(ctx, [2, 0], [2.4, 0]);
    expect(pecasDe(ctx, 'curva90')[0]!.x).toBeCloseTo(2.4, 4);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('o meio com Ctrl gera a prumada do eletroduto (curvas 90°) e a rede fica limpa', () => {
    const ctx = redeEmL(ELE, 20, 0.5, true);
    const t1 = primeiro(ctx, ELE);
    sel(ctx, t1.id);
    opcoesEletroduto.z = 0.9;
    const meio = (t1.a[0] + t1.b[0]) / 2;
    arrastarComSelecionar(ctx, [meio, 0], [meio, 0], { ctrl: true });
    expect(trechoDoProjeto(ctx.store.project, t1.id)!.a[2]).toBeCloseTo(0.9, 3);
    expect(problemas(ctx.store.project)).toEqual([]);
  });
});

describe('pegadores no eletroduto entre caixas', () => {
  it('o meio com Ctrl leva o eletroduto à cota do campo e gera a prumada nas duas caixas (curvas entram no projeto), rede limpa', () => {
    const ctx = redeEntreCaixas(2);
    sel(ctx, 't1');
    opcoesEletroduto.z = 0.8;
    arrastarComSelecionar(ctx, [1, 0.0235], [1, 0.0235], { ctrl: true });
    expect(trechoDoProjeto(ctx.store.project, 't1')!.a[2]).toBeCloseTo(0.8, 3);
    expect(pecasDe(ctx, 'curva90').length).toBeGreaterThanOrEqual(4);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('arrastar a ponta para longe da caixa SOLTA a ligação (a caixa não anda) e avisa', () => {
    const ctx = redeEntreCaixas(2);
    sel(ctx, 't1');
    const t = trechoDoProjeto(ctx.store.project, 't1')!;
    arrastarComSelecionar(ctx, [t.b[0], t.b[1]], [t.b[0] - 0.5, t.b[1]]);
    expect((ctx.store.project.elements.c2 as Component).x).toBeCloseTo(2, 6);
    expect(Object.keys((ctx.store.project.elements.t1 as Component).ligacoes ?? {})).toEqual(['a']);
    expect(ctx.alertas().join(' ')).toMatch(/desfeita/);
    expect(CAIXA).toBeTruthy();
  });
});

describe('pegadores no eletroduto corrugado', () => {
  function corrugadoEmL(): Ctx {
    const { ctx, t } = preparar(COR, 20, 0.5, true);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 2, 2);
    t.cancel();
    return ctx;
  }

  it('a ponta livre estica inclinada com a tecla de cota (o corrugado muda de cota livremente)', () => {
    const ctx = corrugadoEmL();
    const ultimo = tubosDe(ctx, COR)[1]!;
    opcoesEletroduto.z = 0.9;
    const plano = planejarPonta(ctx.store.project, ultimo.id, 'b', { x: 2, y: 2.5 }, { cota: 0.9 });
    expect(plano.bloqueado).toBeUndefined();
    expect(aplicarPlanoTrecho(ctx.env, plano, 'x').ok).toBe(true);
    expect(trechoDoProjeto(ctx.store.project, ultimo.id)!.b[2]).toBeCloseTo(0.9, 4);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('o raio mínimo é validado durante o arrasto: canto fechado demais é BLOQUEADO com motivo', () => {
    const ctx = corrugadoEmL();
    const primeiroT = tubosDe(ctx, COR)[0]!;
    // Leva a ponta do primeiro trecho para quase em cima do segundo: o canto fica mais fechado que o raio mínimo.
    const plano = planejarPonta(ctx.store.project, primeiroT.id, 'b', { x: 1.99, y: 1.9 });
    const motivo = plano.bloqueado ?? plano.alertas.map((a) => a.motivo).join(' ');
    expect(motivo).toMatch(/raio mínimo|mínimo|desfeita/);
  });

  it('o meio com cota no corrugado é BLOQUEADO com motivo e sugestão de arrastar pela ponta', () => {
    const ctx = corrugadoEmL();
    const t1 = tubosDe(ctx, COR)[0]!;
    const plano = planejarMeio(ctx.store.project, t1.id, { x: 0, y: 0 }, { cota: 0.9 });
    expect(plano.bloqueado).toMatch(/corrugado/);
    expect(plano.sugestao).toMatch(/ponta/);
  });
});

describe('pegadores só aparecem com UM trecho selecionado', () => {
  it('sem seleção ou com dois selecionados, o gesto não é dos pegadores', () => {
    const ctx = redeEmL(ESG, 100);
    const ts = tubosDe(ctx, ESG);
    ctx.env.setSelection(ts.map((x) => x.id));
    const antes = foto(ctx);
    arrastarComSelecionar(ctx, [0, 0], [0, 0]);
    expect(foto(ctx)).toBe(antes);
    expect(isComponent(ctx.store.project.elements[ts[0]!.id])).toBe(true);
  });
});
