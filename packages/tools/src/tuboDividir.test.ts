import { beforeEach, describe, expect, it } from 'vitest';
import { opcoesTubo } from './tuboTool.ts';
import { opcoesEletroduto } from './eletrodutoTool.ts';
import { clickAt, tool } from './testEnv.ts';
import { planejarDivisao } from './tuboDividir.ts';
import { trechoDoProjeto } from './tuboTrecho.ts';
import { COR, ELE, ESG, L, pecasDe, problemas, redeEmL, redeReta, SOL, tubosDe, type Ctx } from './modificarMepTestUtil.ts';
import type { SplitTuboInserir } from './types.ts';

/* Ficha F6a, item 3: Dividir sobre tubo e eletroduto (luva, união, tê, pontas livres). */

const foto = (ctx: Ctx): string => JSON.stringify(ctx.store.project);
beforeEach(() => { opcoesTubo.declividade = 0; opcoesEletroduto.declividade = 0; });

function dividir(ctx: Ctx, opcao: SplitTuboInserir, x: number, y = 0): string[] {
  const falas: string[] = [];
  ctx.env.say = (m: string) => { falas.push(m); };
  ctx.options.splitTuboInserir = opcao;
  const t = tool('split', ctx.env);
  clickAt(t, x, y);
  return falas;
}

describe('Dividir tubo: luva', () => {
  it('Esgoto DN 100: divide no ponto clicado e entra a luva do tipo, com tubo dos dois lados e rede limpa', () => {
    const ctx = redeReta(ESG, 100, 3);
    dividir(ctx, 'luva', 1.2);
    expect(tubosDe(ctx, ESG)).toHaveLength(2);
    expect(pecasDe(ctx, 'luva')).toHaveLength(1);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('os dois trechos somam o original menos a folga da luva, e a luva fica no ponto do corte', () => {
    const ctx = redeReta(ESG, 100, 3);
    dividir(ctx, 'luva', 1.2);
    const soma = tubosDe(ctx, ESG).reduce((s, t) => s + L(t.tubo.c), 0);
    expect(soma).toBeLessThanOrEqual(3000);
    expect(soma).toBeGreaterThan(2700);
    expect(Math.abs(pecasDe(ctx, 'luva')[0]!.x - 1.2)).toBeLessThan(0.06);
  });

  it('um passo de desfazer', () => {
    const ctx = redeReta(ESG, 100, 3);
    const antes = foto(ctx);
    dividir(ctx, 'luva', 1.2);
    expect(foto(ctx)).not.toBe(antes);
    ctx.store.undo();
    expect(foto(ctx)).toBe(antes);
  });

  it('a ligação do fim do tubo (o joelho) passa para a segunda metade, e o resto da rede fica limpa', () => {
    const ctx = redeEmL(ESG, 100);
    const t1 = tubosDe(ctx, ESG)[0]!;
    dividir(ctx, 'luva', 1);
    expect(tubosDe(ctx, ESG)).toHaveLength(3);
    expect(Object.keys((ctx.store.project.elements[t1.id] as { ligacoes?: object }).ligacoes ?? {})).toContain('b');
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('eletroduto rígido: entra a luva da Krona (DN 20)', () => {
    const ctx = redeReta(ELE, 20, 3, 0.5, true);
    dividir(ctx, 'luva', 1.5);
    expect(pecasDe(ctx, 'luva')).toHaveLength(1);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('água fria soldável DN 25: luva soldável', () => {
    const ctx = redeReta(SOL, 25, 3);
    dividir(ctx, 'luva', 1.5);
    expect(pecasDe(ctx, 'luva')).toHaveLength(1);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('corte colado numa ponta BLOQUEIA com motivo e nada é gravado', () => {
    const ctx = redeReta(ESG, 100, 3);
    const antes = foto(ctx);
    const falas = dividir(ctx, 'luva', 0.02);
    expect(falas.join(' ')).toMatch(/Bloqueado: o corte fica colado/);
    expect(foto(ctx)).toBe(antes);
  });

  it('corte perto do joelho (sobraria menos que o tubo curto): o ensaio recusa e nada é gravado', () => {
    const ctx = redeEmL(ESG, 100);
    const antes = foto(ctx);
    dividir(ctx, 'luva', 1.9);
    expect(problemas(ctx.store.project)).toEqual([]);
    if (tubosDe(ctx, ESG).length === 2) expect(foto(ctx)).toBe(antes);
  });
});

describe('Dividir tubo: união, pontas livres e tê', () => {
  it('união: nenhum tipo transcrito tem união: BLOQUEIA com motivo e sugestão de luva', () => {
    const ctx = redeReta(ESG, 100, 3);
    const antes = foto(ctx);
    const plano = planejarDivisao(ctx.store.project, tubosDe(ctx)[0]!.id, { x: 1.5, y: 0 }, 'uniao');
    expect(plano.bloqueado).toMatch(/união/);
    expect(plano.sugestao).toMatch(/Luva/);
    dividir(ctx, 'uniao', 1.5);
    expect(foto(ctx)).toBe(antes);
  });

  it('pontas livres: dois trechos sem peça e a rede só acusa as pontas abertas', () => {
    const ctx = redeReta(ESG, 100, 3);
    dividir(ctx, 'livre', 1.5);
    expect(tubosDe(ctx, ESG)).toHaveLength(2);
    expect(pecasDe(ctx)).toHaveLength(0);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('pontas livres no corrugado: divide sem peça (único modo que vale)', () => {
    const ctx = redeReta(COR, 20, 3, 0.5, true);
    dividir(ctx, 'livre', 1.5);
    expect(tubosDe(ctx, COR)).toHaveLength(2);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('corrugado com luva: BLOQUEIA (corrugado não tem luva) e sugere pontas livres', () => {
    const ctx = redeReta(COR, 20, 3, 0.5, true);
    const plano = planejarDivisao(ctx.store.project, tubosDe(ctx)[0]!.id, { x: 1.5, y: 0 }, 'luva');
    expect(plano.bloqueado).toMatch(/corrugado/);
    expect(plano.sugestao).toMatch(/livres/);
  });

  it('tê (esgoto): entra o tê no corte com o ramal ABERTO (a rede só acusa a porta livre do ramal) e pede o traçado do ramal', () => {
    const ctx = redeReta(ESG, 100, 3);
    let aberto: string | null = null;
    ctx.env.abrirTracado = (id) => { aberto = id; };
    dividir(ctx, 'te', 1.5);
    expect(pecasDe(ctx, 'te')).toHaveLength(1);
    expect(tubosDe(ctx, ESG)).toHaveLength(2);
    expect(aberto).toBe(pecasDe(ctx, 'te')[0]!.id);
    expect(problemas(ctx.store.project)).toEqual([]);
  });

  it('tê no eletroduto rígido: o catálogo não tem tê, BLOQUEIA com motivo e sugestão de caixa', () => {
    const ctx = redeReta(ELE, 20, 3, 0.5, true);
    const antes = foto(ctx);
    const falas = dividir(ctx, 'te', 1.5);
    expect(falas.join(' ')).toMatch(/Bloqueado/);
    expect(foto(ctx)).toBe(antes);
  });

  it('tê em tubo inclinado (declividade 2%): o tê acompanha a cota do eixo e a rede fica limpa', () => {
    const ctx = redeReta(ESG, 100, 3);
    ctx.store.exec({ type: 'updateComponent', id: tubosDe(ctx)[0]!.id, patch: {} });
    dividir(ctx, 'te', 1.5);
    const te = pecasDe(ctx, 'te')[0]!;
    expect(te.z).toBeCloseTo(0.5, 3);
  });

  it('tubo vertical não tem corte em planta: bloqueia', () => {
    const ctx = redeReta(ESG, 100, 3);
    expect(trechoDoProjeto(ctx.store.project, tubosDe(ctx)[0]!.id)).toBeTruthy();
  });
});
