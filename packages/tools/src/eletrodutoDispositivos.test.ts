import { beforeEach, describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, KRONA_ELETRICA, type Component } from '@hestia/model';
import { diagnosticarRede, ligacaoNoMundo, resolverComponente } from '@hestia/engine';
import { FAMILIA_ELETRODUTO, opcoesEletroduto } from './eletrodutoTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/*
 * Ficha C8a (defeitos A, B, C e F da C7): tomada, interruptor e luminária ligam o eletroduto da Krona como as caixas. Causa: as
 * ligações de eletroduto desses dispositivos tinham o diâmetro da tabela genérica da F5 (25 mm no DN 20, contra os 20 mm do eletroduto
 * Krona) e uma única entrada, nos fundos; e o traçado ignorava a direção das entradas (ia reto, ou subia primeiro), então a rede
 * acusava "incompatível". O número de trechos e de curvas de cada caso abaixo é RESULTADO do caminho em 90° calculado por
 * `tuboCaminho.ts`, não uma regra: o teste confere a conta e que a rede não acusa nada.
 */

const CAIXA = 'fam_krona_eletrica_caixa_4x4';
const TUBO = FAMILIA_ELETRODUTO;
const CURVA = 'fam_krona_eletrica_curva90';
type Ctx = ReturnType<typeof makeEnv>;
const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const n = (ctx: Ctx, fam: string): number => comps(ctx).filter((c) => c.familyId === fam).length;

function ambiente() {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  return { ctx, msgs, t: tool('eletroduto', ctx.env) };
}

/** Instância da família da biblioteca (a família entra no projeto); `tipo` opcional. */
function colocar(ctx: Ctx, familia: string, id: string, x: number, y: number, tipo?: string): void {
  const f = familiaDaBiblioteca(familia);
  if (!f) throw new Error(`família ausente: ${familia}`);
  if (!ctx.store.project.componentFamilies?.[familia]) ctx.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  ctx.store.exec({ type: 'addComponent', component: { id, kind: 'component', familyId: familia, typeId: tipo ?? f.tipoPadrao ?? f.tipos[0]?.id ?? null, levelId: 'lv_0', x, y, z: 0, rotation: 0, mirrored: false, values: {}, mark: '' } as unknown as Component });
}

/** Ligação de eletroduto da instância no mundo. */
function ligacoes(ctx: Ctx, id: string) {
  const c = ctx.store.project.elements[id] as Component;
  return resolverComponente(ctx.store.project, c).ligacoes.filter((l) => l.dominio === 'eletroduto').map((l) => ({ id: l.id, diametro: l.diametro, m: ligacaoNoMundo(l, c) }));
}
const entrada = (ctx: Ctx, id: string, lig: string) => {
  const e = ligacoes(ctx, id).find((l) => l.id === lig);
  if (!e) throw new Error(`entrada ausente: ${id}.${lig}`);
  return { x: e.m.posicaoMundo[0], y: e.m.posicaoMundo[1], z: e.m.posicaoMundo[2] };
};

/** Traça entre duas entradas (e um canto livre, se `canto`), como o usuário: cada clique cai sobre uma entrada ou no ponto livre. */
function tracar(a: ReturnType<typeof ambiente>, de: { x: number; y: number; z: number }, ate: { x: number; y: number; z: number }, canto?: { x: number; y: number }) {
  opcoesEletroduto.z = de.z;
  clickAt(a.t, de.x, de.y);
  if (canto) clickAt(a.t, canto.x, canto.y);
  clickAt(a.t, ate.x, ate.y);
}

const problemas = (ctx: Ctx) => diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'incompativel' || d.codigo === 'conexao_afastada' || d.codigo === 'conexao_invalida' || d.codigo === 'dispositivo_sem_eletroduto');

beforeEach(() => {
  opcoesEletroduto.dn = 20;
  opcoesEletroduto.z = 0;
  opcoesEletroduto.declividade = 0;
  opcoesEletroduto.modoCota = 'subir_primeiro';
  opcoesEletroduto.familiaId = FAMILIA_ELETRODUTO;
});

describe('entradas dos dispositivos (causa A: diâmetro e direção)', () => {
  const catalogoD = (bitola: string): number => Number(KRONA_ELETRICA.itens.find((i) => i.id === 'tubo_eletroduto_de_pvc_rigido_soldavel_3m')?.linhas.find((l) => l.bitola === bitola)?.valores['D']);

  it.each([['fam_tomada_2p_t', 'dn20', 20], ['fam_tomada_2p_t', 'dn25', 25], ['fam_interruptor_simples', 'simples', 20], ['fam_luminaria_plafon_redondo', 'dn20', 20]])('%s tipo %s: todas as entradas de eletroduto têm o diâmetro do eletroduto Krona do DN (catálogo)', (fam, tipo, dn) => {
    const { ctx } = ambiente();
    colocar(ctx, fam, 'd', 0, 0, tipo);
    const ls = ligacoes(ctx, 'd');
    expect(ls.length).toBeGreaterThanOrEqual(4);
    for (const l of ls) expect(l.diametro * 1000).toBeCloseTo(catalogoD(String(dn)), 6);
  });

  it('tomada e interruptor têm entradas nos quatro lados, topo e base, além do fundo que já existia (ids antigos preservados)', () => {
    const { ctx } = ambiente();
    colocar(ctx, 'fam_tomada_2p_t', 't', 0, 0);
    const ids = ligacoes(ctx, 't').map((l) => l.id).sort();
    expect(ids).toEqual(['eletroduto', 'eletroduto_base', 'eletroduto_dir', 'eletroduto_esq', 'eletroduto_topo']);
  });

  it('a luminária de teto ganha entradas esquerda, direita e frente; a arandela, topo e base; todas axiais e unitárias', () => {
    const { ctx } = ambiente();
    colocar(ctx, 'fam_luminaria_plafon_redondo', 'p', 0, 0);
    colocar(ctx, 'fam_luminaria_arandela', 'a', 5, 0);
    expect(ligacoes(ctx, 'p').map((l) => l.id).sort()).toEqual(['eletroduto', 'eletroduto_dir', 'eletroduto_esq', 'eletroduto_frente']);
    expect(ligacoes(ctx, 'a').map((l) => l.id).sort()).toEqual(['eletroduto', 'eletroduto_base', 'eletroduto_dir', 'eletroduto_esq', 'eletroduto_topo']);
    for (const id of ['p', 'a']) for (const l of ligacoes(ctx, id)) expect(Math.max(...l.m.direcaoMundo.map(Math.abs))).toBeCloseTo(1, 9);
  });
});

describe('caixa para dispositivo: o caminho vem do cálculo e a rede não acusa nada', () => {
  it('caixa → tomada com cota diferente (caso B): entrada lateral a lateral dá horizontal, vertical e horizontal (3 trechos, 2 curvas)', () => {
    const a = ambiente();
    colocar(a.ctx, CAIXA, 'cx', 3, 3);
    colocar(a.ctx, 'fam_tomada_2p_t', 'tm', 6, 3);
    tracar(a, entrada(a.ctx, 'cx', 'd'), entrada(a.ctx, 'tm', 'eletroduto_esq'));
    expect([n(a.ctx, TUBO), n(a.ctx, CURVA)]).toEqual([3, 2]);
    expect(Object.keys((a.ctx.store.project.elements['tm'] as Component).ligacoes ?? {})).toEqual(['eletroduto_esq']);
    expect(Object.keys((a.ctx.store.project.elements['cx'] as Component).ligacoes ?? {})).toEqual(['d']);
    expect(problemas(a.ctx)).toEqual([]);
  });

  it('caixa → tomada pela base com cota diferente: horizontal e vertical, 2 trechos e 1 curva (o vertical chega por baixo)', () => {
    const a = ambiente();
    colocar(a.ctx, CAIXA, 'cx', 3, 3);
    colocar(a.ctx, 'fam_tomada_2p_t', 'tm', 6, 3);
    tracar(a, entrada(a.ctx, 'cx', 'd'), entrada(a.ctx, 'tm', 'eletroduto_base'));
    expect([n(a.ctx, TUBO), n(a.ctx, CURVA)]).toEqual([2, 1]);
    expect(problemas(a.ctx)).toEqual([]);
  });

  it('caixa → luminária (caso C): pela frente da luminária, entrada lateral da caixa, canto no plano: 3 trechos e 2 curvas (o desnível até o teto pede um vertical)', () => {
    const a = ambiente();
    colocar(a.ctx, CAIXA, 'cx', 3, 0);
    colocar(a.ctx, 'fam_luminaria_plafon_redondo', 'lm', 4.5, 4);
    const de = entrada(a.ctx, 'cx', 'd');
    const ate = entrada(a.ctx, 'lm', 'eletroduto_frente');
    tracar(a, de, ate, { x: ate.x, y: de.y });
    expect([n(a.ctx, TUBO), n(a.ctx, CURVA)]).toEqual([3, 2]);
    expect(Object.keys((a.ctx.store.project.elements['lm'] as Component).ligacoes ?? {})).toEqual(['eletroduto_frente']);
    expect(problemas(a.ctx)).toEqual([]);
  });

  it('caixa → interruptor (caso C) pela base: canto no plano, horizontal até debaixo do interruptor e vertical: 2 trechos e 1 curva', () => {
    const a = ambiente();
    colocar(a.ctx, CAIXA, 'cx', 3, 0);
    colocar(a.ctx, 'fam_interruptor_simples', 'in', 8, 0);
    const de = entrada(a.ctx, 'cx', 'd');
    const ate = entrada(a.ctx, 'in', 'eletroduto_base');
    tracar(a, de, ate);
    expect([n(a.ctx, TUBO), n(a.ctx, CURVA)]).toEqual([2, 1]);
    expect(problemas(a.ctx)).toEqual([]);
  });

  it('caixa → interruptor pela entrada lateral, com canto em L no plano e cota diferente: horizontal, vertical e horizontal', () => {
    const a = ambiente();
    colocar(a.ctx, CAIXA, 'cx', 3, 0);
    colocar(a.ctx, 'fam_interruptor_simples', 'in', 8, 3);
    const de = entrada(a.ctx, 'cx', 'd');
    const ate = entrada(a.ctx, 'in', 'eletroduto_esq');
    tracar(a, de, ate, { x: ate.x - 0.5, y: de.y });
    expect(n(a.ctx, CURVA)).toBeGreaterThanOrEqual(3);
    expect(problemas(a.ctx)).toEqual([]);
  });

  it('DN 25: o tipo dn25 da tomada liga o eletroduto DN 25 (diâmetro do catálogo); o DN 20 não liga na entrada de 25', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'tm', 6, 3, 'dn25');
    const ate = entrada(a.ctx, 'tm', 'eletroduto_esq');
    opcoesEletroduto.dn = 25;
    opcoesEletroduto.z = ate.z;
    clickAt(a.t, ate.x - 1, ate.y);
    clickAt(a.t, ate.x, ate.y);
    expect(Object.keys((a.ctx.store.project.elements['tm'] as Component).ligacoes ?? {})).toEqual(['eletroduto_esq']);
    expect(problemas(a.ctx)).toEqual([]);
    const b = ambiente();
    colocar(b.ctx, 'fam_tomada_2p_t', 'tm', 6, 3, 'dn25');
    opcoesEletroduto.dn = 20;
    clickAt(b.t, ate.x - 1, ate.y);
    clickAt(b.t, ate.x, ate.y);
    expect(Object.keys((b.ctx.store.project.elements['tm'] as Component).ligacoes ?? {})).toEqual([]);
  });

  it('duas caixas empilhadas no plano (nenhuma entrada olha para a outra): o caminho ganha um desvio em U e a rede fica sem incompatível', () => {
    const a = ambiente();
    colocar(a.ctx, CAIXA, 'c1', 3, 0);
    colocar(a.ctx, CAIXA, 'c2', 3, 3);
    tracar(a, entrada(a.ctx, 'c1', 'd'), entrada(a.ctx, 'c2', 'd'));
    expect(n(a.ctx, CURVA)).toBe(2);
    expect(problemas(a.ctx)).toEqual([]);
  });
});
