import { describe, expect, it } from 'vitest';
import { diagnosticarRede, ligacaoNoMundo, resolverComponente, trechoDeTubo, type PlanoMovimento } from '@hestia/engine';
import { familiaDaBiblioteca, isComponent, type Component, type Id, type Project } from '@hestia/model';
import { deslocamentoRigido, itensDoPlano, planoDoGesto, textoDoPlano } from './movimentoLigadoTools.ts';
import { makeEnv, P, tool } from './testEnv.ts';

/*
 * Ficha F4, camada de ferramentas: o Mover e o arrasto do Selecionar levam as ligações junto (tubos esticam, um passo de desfazer),
 * "Desconectar" (opção na barra) ou Alt solta tudo como antes, e a prévia mostra o fantasma do tubo esticado ou o trecho em vermelho.
 */

type Ctx = ReturnType<typeof makeEnv>;
const CAIXA = 'fam_krona_eletrica_caixa_4x4';
const TUBO = 'fam_krona_eletrica_tubo_corte';

const comp = (p: Project, id: Id): Component => {
  const c = p.elements[id];
  if (!isComponent(c)) throw new Error('sem ' + id);
  return c;
};

/** Duas caixas em x = 0 e x = 2 (ao longo de y = 0) e o eletroduto ligando as portas d e c. */
function redeEletrica(): { ctx: Ctx; msgs: string[] } {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  for (const id of [TUBO, CAIXA]) ctx.store.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(id)!) });
  for (const [id, x] of [['c1', 0], ['c2', 2]] as const) {
    ctx.store.exec({ type: 'addComponent', component: { id, kind: 'component', familyId: CAIXA, typeId: null, levelId: 'lv_0', x, y: 0, z: 0.3, rotation: 0, mirrored: false, mark: id } as Component });
  }
  const porta = (id: Id, lig: string) => {
    const c = comp(ctx.store.project, id);
    return ligacaoNoMundo(resolverComponente(ctx.store.project, c).ligacoes!.find((l) => l.id === lig)!, c).posicaoMundo;
  };
  const t = trechoDeTubo(porta('c1', 'd'), porta('c2', 'c'), { id: TUBO }, 20, { id: 't1', levelId: 'lv_0' })!;
  ctx.store.exec({ type: 'addComponent', component: t });
  ctx.store.exec({ type: 'connectComponents', a: 'c1', ligacaoA: 'd', b: 't1', ligacaoB: 'a' });
  ctx.store.exec({ type: 'connectComponents', a: 'c2', ligacaoA: 'c', b: 't1', ligacaoB: 'b' });
  return { ctx, msgs };
}

const afastadas = (p: Project) => diagnosticarRede(p).filter((d) => d.codigo === 'conexao_afastada' || d.codigo === 'incompativel');
const L = (p: Project): number => comp(p, 't1').values?.L as number;
const abertas = (p: Project) => diagnosticarRede(p).filter((d) => d.codigo === 'ligacao_aberta' && ((d.elementId === 'c2' && d.ligacaoId === 'c') || (d.elementId === 't1' && d.ligacaoId === 'b')));

/** Mover: base em (2, 0), destino em (2 + dx, dy). */
function moverCaixa(ctx: Ctx, dx: number, dy: number, alt = false): void {
  ctx.env.setSelection(['c2']);
  const t = tool('move', ctx.env);
  t.move(P(2, 0, { alt }));
  t.click(P(2, 0, { alt }));
  t.move(P(2 + dx, dy, { alt }));
  t.click(P(2 + dx, dy, { alt }));
}

describe('Mover leva as ligações junto', () => {
  it('mover a caixa ao longo do eletroduto estica o tubo e a rede fica sem ligação afastada nem aberta', () => {
    const { ctx } = redeEletrica();
    const antes = L(ctx.store.project);
    moverCaixa(ctx, 0.5, 0);
    expect(comp(ctx.store.project, 'c2').x).toBeCloseTo(2.5, 6);
    expect(L(ctx.store.project)).toBeCloseTo(antes + 500, 4);
    expect(afastadas(ctx.store.project)).toEqual([]);
    expect(abertas(ctx.store.project)).toEqual([]);
    expect(ctx.alertas()).toEqual([]);
  });

  it('o gesto inteiro vale UM passo de desfazer: um Ctrl+Z devolve a caixa e o tubo', () => {
    const { ctx } = redeEletrica();
    const foto = JSON.stringify(ctx.store.project);
    moverCaixa(ctx, 0.5, 0);
    expect(JSON.stringify(ctx.store.project)).not.toBe(foto);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project)).toBe(foto);
  });

  it('com "Desconectar" ligado na barra, solta tudo: o tubo fica para trás e a rede acusa a ligação afastada (comportamento de antes)', () => {
    const { ctx } = redeEletrica();
    ctx.options.moveDisjoin = true;
    const antes = L(ctx.store.project);
    moverCaixa(ctx, 0.5, 0);
    expect(L(ctx.store.project)).toBeCloseTo(antes, 6);
    expect(diagnosticarRede(ctx.store.project).some((d) => d.codigo === 'conexao_afastada')).toBe(true);
  });

  it('Alt na confirmação também solta (inverte a opção)', () => {
    const { ctx } = redeEletrica();
    const antes = L(ctx.store.project);
    moverCaixa(ctx, 0.5, 0, true);
    expect(L(ctx.store.project)).toBeCloseTo(antes, 6);
    expect(diagnosticarRede(ctx.store.project).some((d) => d.codigo === 'conexao_afastada')).toBe(true);
  });

  it('Alt com "Desconectar" ligado volta a acompanhar (a tecla inverte nos dois sentidos)', () => {
    const { ctx } = redeEletrica();
    ctx.options.moveDisjoin = true;
    const antes = L(ctx.store.project);
    moverCaixa(ctx, 0.5, 0, true);
    expect(L(ctx.store.project)).toBeCloseTo(antes + 500, 4);
  });

  it('a prévia mostra o tubo esticado (fantasma tracejado com o comprimento) além da caixa', () => {
    const { ctx } = redeEletrica();
    ctx.env.setSelection(['c2']);
    const t = tool('move', ctx.env);
    t.move(P(2, 0));
    t.click(P(2, 0));
    t.move(P(2.5, 0));
    const itens = t.preview();
    expect(itens.some((i) => i.kind === 'polygon' && i.dashed === true)).toBe(true);
    expect(itens.some((i) => i.kind === 'label')).toBe(true);
    expect(itens.some((i) => i.kind === 'line' && i.tone === 'invalid')).toBe(false);
  });

  it('tubo acima do L máximo: prévia em vermelho com o motivo na barra, e o clique não grava nada', () => {
    const { ctx, msgs } = redeEletrica();
    const foto = JSON.stringify(ctx.store.project);
    ctx.env.setSelection(['c2']);
    const t = tool('move', ctx.env);
    t.move(P(2, 0));
    t.click(P(2, 0));
    t.move(P(7, 0));
    expect(t.preview().some((i) => i.kind === 'line' && i.tone === 'invalid')).toBe(true);
    expect(msgs.some((m) => /Bloqueado: .*comprimento máximo/.test(m))).toBe(true);
    t.click(P(7, 0));
    expect(JSON.stringify(ctx.store.project)).toBe(foto);
  });

  it('ligação que não acompanha vira alerta na tela (diálogo) e o passo de desfazer inclui a ligação desfeita', () => {
    const { ctx } = redeEletrica();
    const foto = JSON.stringify(ctx.store.project);
    moverCaixa(ctx, 0, 0.5);
    expect(ctx.alertas()).toHaveLength(1);
    expect(ctx.alertas()[0]).toMatch(/desfeita/);
    expect(comp(ctx.store.project, 't1').ligacoes?.b).toBeUndefined();
    expect(afastadas(ctx.store.project)).toEqual([]);
    ctx.store.undo();
    expect(comp(ctx.store.project, 't1').ligacoes?.b?.componenteId).toBe('c2');
    expect(JSON.stringify(ctx.store.project)).toBe(foto);
  });
});

describe('arrasto do Selecionar leva as ligações junto', () => {
  function arrastar(ctx: Ctx, dx: number, dy: number, alt = false): void {
    ctx.env.setSelection(['c2']);
    const t = tool('select', ctx.env);
    t.down?.(P(2.05, 0.02, { alt }));
    t.drag?.(P(2.05 + dx, 0.02 + dy, { alt }));
    t.up?.(P(2.05 + dx, 0.02 + dy, { alt }));
  }

  it('arrastar a caixa selecionada ao longo do eletroduto estica o tubo sem deixar ligação afastada', () => {
    const { ctx } = redeEletrica();
    const antes = L(ctx.store.project);
    arrastar(ctx, 0.5, 0);
    expect(comp(ctx.store.project, 'c2').x).toBeGreaterThan(2.3);
    expect(L(ctx.store.project)).toBeGreaterThan(antes + 300);
    expect(afastadas(ctx.store.project)).toEqual([]);
  });

  it('um Ctrl+Z desfaz o arrasto inteiro (caixa e tubo)', () => {
    const { ctx } = redeEletrica();
    const foto = JSON.stringify(ctx.store.project);
    arrastar(ctx, 0.5, 0);
    ctx.store.undo();
    expect(JSON.stringify(ctx.store.project)).toBe(foto);
  });

  it('com Alt o arrasto solta as ligações (movimento rígido, como antes)', () => {
    const { ctx } = redeEletrica();
    const antes = L(ctx.store.project);
    arrastar(ctx, 0.5, 0, true);
    expect(L(ctx.store.project)).toBeCloseTo(antes, 6);
  });

  it('a prévia do arrasto mostra o tubo esticado e, bloqueado, o trecho vermelho', () => {
    const { ctx } = redeEletrica();
    ctx.env.setSelection(['c2']);
    const t = tool('select', ctx.env);
    t.down?.(P(2.05, 0.02));
    t.drag?.(P(2.55, 0.02));
    expect(t.preview().some((i) => i.kind === 'polygon' && i.dashed === true)).toBe(true);
    t.drag?.(P(8, 0.02));
    expect(t.preview().some((i) => i.kind === 'line' && i.tone === 'invalid')).toBe(true);
  });

  it('arrasto bloqueado não grava nada ao soltar', () => {
    const { ctx } = redeEletrica();
    const foto = JSON.stringify(ctx.store.project);
    arrastar(ctx, 6, 0);
    expect(JSON.stringify(ctx.store.project)).toBe(foto);
  });
});

describe('funções do gesto', () => {
  const pose = (x: number, y: number, rotation = 0) => ({ x, y, rotation });

  it('deslocamento rígido: o mesmo vetor para todos e sem giro', () => {
    const { ctx } = redeEletrica();
    const p = ctx.store.project;
    expect(deslocamentoRigido(p, new Map([['c1', pose(0.3, 0.1)], ['c2', pose(2.3, 0.1)]]))).toEqual([expect.closeTo(0.3, 9), expect.closeTo(0.1, 9), 0]);
  });

  it('deslocamento rígido: giro, vetores diferentes ou nada a mover dão null', () => {
    const { ctx } = redeEletrica();
    const p = ctx.store.project;
    expect(deslocamentoRigido(p, new Map([['c2', pose(2.3, 0.1, 0.5)]]))).toBeNull();
    expect(deslocamentoRigido(p, new Map([['c1', pose(0.3, 0)], ['c2', pose(2.5, 0)]]))).toBeNull();
    expect(deslocamentoRigido(p, new Map([['c2', pose(2, 0)]]))).toBeNull();
  });

  it('planoDoGesto: desligado devolve null; ligado devolve o plano com o tubo esticado', () => {
    const { ctx } = redeEletrica();
    const p = ctx.store.project;
    const poses = new Map([['c2', pose(2.5, 0)]]);
    expect(planoDoGesto(p, poses, false)).toBeNull();
    expect(planoDoGesto(p, poses, true)?.esticados.map((e) => e.id)).toEqual(['t1']);
  });

  it('itensDoPlano e textoDoPlano: nulo não desenha nem diz nada; plano bloqueado desenha o vermelho', () => {
    const { ctx } = redeEletrica();
    const p = ctx.store.project;
    expect(itensDoPlano(p, null)).toEqual([]);
    expect(textoDoPlano(null)).toBe('');
    const bloqueado: PlanoMovimento = { comandos: [], alertas: [], desfeitas: [], esticados: [], movidos: [], bloqueado: 'trecho longo demais', trechoBloqueado: { a: [0, 0, 0], b: [8, 0, 0] } };
    expect(itensDoPlano(p, bloqueado).some((i) => i.kind === 'line' && i.tone === 'invalid')).toBe(true);
    expect(itensDoPlano(p, { ...bloqueado, trechoBloqueado: undefined })).toEqual([]);
  });

  it('textoDoPlano junta os alertas do plano', () => {
    const plano: PlanoMovimento = { comandos: [], alertas: [{ codigo: 'ligacao_desfeita', motivo: 'Primeiro.', elementId: 'a' }, { codigo: 'ligacao_desfeita', motivo: 'Segundo.', elementId: 'b' }], desfeitas: [], esticados: [], movidos: [] };
    expect(textoDoPlano(plano)).toBe('Primeiro. Segundo.');
  });
});
