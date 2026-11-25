import { describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, isWall, makeWall, type Component } from '@hestia/model';
import { diagnosticarRede } from '@hestia/engine';
import { makeEnv, P, tool } from './testEnv.ts';

/*
 * Ficha C8b, defeito (D): a ferramenta Mover recusava peça de família selecionada ("selecione elementos antes"), e o arrasto de
 * componentes só existia no Selecionar. Aqui o Mover leva componentes de família (elétricos e hidráulicos) pelo mesmo mecanismo do
 * Selecionar (`ArrastoComponentes`: encaixe na parede e nos vizinhos), num só passo de desfazer. As ligações do eletroduto ao
 * componente movido ficam abertas e a rede acusa: é o esperado, e o teste não tenta reconectar.
 */

type Ctx = ReturnType<typeof makeEnv>;

function ambiente() {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  return { ctx, msgs };
}

/** Instância de família da biblioteca no nível 0 (a família entra no projeto). */
function colocar(ctx: Ctx, familia: string, id: string, x: number, y: number, rotation = 0): void {
  const f = familiaDaBiblioteca(familia);
  if (!f) throw new Error(`família ausente: ${familia}`);
  if (!ctx.store.project.componentFamilies?.[familia]) ctx.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  ctx.store.exec({
    type: 'addComponent',
    component: { id, kind: 'component', familyId: familia, typeId: f.tipoPadrao ?? f.tipos[0]?.id ?? null, levelId: 'lv_0', x, y, z: 0, rotation, mirrored: false, values: {}, mark: id } as unknown as Component,
  });
}

const pose = (ctx: Ctx, id: string) => {
  const c = ctx.store.project.elements[id];
  if (!isComponent(c)) throw new Error('não é componente: ' + id);
  return { x: c.x, y: c.y, rotation: c.rotation };
};

const TOMADA = 'fam_tomada_2p_t';
const CAIXA = 'fam_krona_eletrica_caixa_4x4';

describe('Mover leva componentes de família selecionados', () => {
  it('com a tomada selecionada, clicar na planta não diz "selecione elementos antes"', () => {
    const { ctx, msgs } = ambiente();
    colocar(ctx, TOMADA, 't1', 1, 1);
    ctx.env.setSelection(['t1']);
    const t = tool('move', ctx.env);
    t.click?.(P(1, 1));
    expect(msgs.some((m) => /selecione elementos antes/.test(m))).toBe(false);
  });

  it('clique na base e clique no destino move a tomada pelo vetor do gesto', () => {
    const { ctx } = ambiente();
    colocar(ctx, TOMADA, 't1', 1, 1);
    ctx.env.setSelection(['t1']);
    const t = tool('move', ctx.env);
    t.move?.(P(1, 1));
    t.click?.(P(1, 1));
    t.move?.(P(2.2, 1.6));
    t.click?.(P(2.2, 1.6));
    const p = pose(ctx, 't1');
    expect(p.x).toBeCloseTo(2.2, 6);
    expect(p.y).toBeCloseTo(1.6, 6);
  });

  it('arrasto da caixa de luz (hidráulica ou elétrica, família de corpo) também move', () => {
    const { ctx } = ambiente();
    colocar(ctx, CAIXA, 'cx1', 3, 0);
    ctx.env.setSelection(['cx1']);
    const t = tool('move', ctx.env);
    t.move?.(P(3, 0));
    t.click?.(P(3, 0));
    t.click?.(P(3.5, 0.4));
    const p = pose(ctx, 'cx1');
    expect(Math.hypot(p.x - 3.5, p.y - 0.4)).toBeLessThan(1e-6);
  });

  it('desfazer em um passo volta a tomada à pose anterior', () => {
    const { ctx } = ambiente();
    colocar(ctx, TOMADA, 't1', 1, 1);
    ctx.env.setSelection(['t1']);
    const t = tool('move', ctx.env);
    t.click?.(P(1, 1));
    t.click?.(P(2.5, 2));
    expect(pose(ctx, 't1').x).toBeCloseTo(2.5, 6);
    ctx.store.undo();
    expect(pose(ctx, 't1').x).toBeCloseTo(1, 6);
    expect(pose(ctx, 't1').y).toBeCloseTo(1, 6);
  });

  it('mover a tomada com parede e componente selecionados move os dois no mesmo passo de desfazer', () => {
    const { ctx } = ambiente();
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w9', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 5 }, b: { x: 4, y: 5 } }) });
    colocar(ctx, TOMADA, 't1', 1, 1);
    ctx.env.setSelection(['w9', 't1']);
    const t = tool('move', ctx.env);
    t.click?.(P(1, 1));
    t.click?.(P(1, 2));
    expect(pose(ctx, 't1').y).toBeCloseTo(2, 6);
    const w = ctx.store.project.elements['w9'];
    expect(isWall(w) && w.a.y).toBeCloseTo(6, 6);
    ctx.store.undo();
    expect(pose(ctx, 't1').y).toBeCloseTo(1, 6);
    const w0 = ctx.store.project.elements['w9'];
    expect(isWall(w0) && w0.a.y).toBeCloseTo(5, 6);
  });

  it('a prévia do Mover mostra o componente na posição de destino (ghost com itens)', () => {
    const { ctx } = ambiente();
    colocar(ctx, TOMADA, 't1', 1, 1);
    ctx.env.setSelection(['t1']);
    const t = tool('move', ctx.env);
    t.click?.(P(1, 1));
    t.move?.(P(2, 1));
    expect(t.preview().length).toBeGreaterThan(0);
  });

  it('depois de mover a tomada, a rede acusa a ligação aberta e o dispositivo sem eletroduto (sem reconectar)', () => {
    const { ctx } = ambiente();
    colocar(ctx, TOMADA, 't1', 1, 1);
    ctx.env.setSelection(['t1']);
    const t = tool('move', ctx.env);
    t.click?.(P(1, 1));
    t.click?.(P(1.8, 1));
    const diag = diagnosticarRede(ctx.store.project);
    expect(diag.some((d) => d.codigo === 'ligacao_aberta')).toBe(true);
    expect(diag.some((d) => d.codigo === 'dispositivo_sem_eletroduto')).toBe(true);
  });
});

describe('arrasto pelo Selecionar (regressão)', () => {
  it('arrastar a tomada selecionada com o Selecionar move a tomada', () => {
    const { ctx } = ambiente();
    colocar(ctx, TOMADA, 't1', 1, 1);
    ctx.env.setSelection(['t1']);
    const t = tool('select', ctx.env);
    t.down?.(P(1, 1));
    t.drag?.(P(1.5, 1.4));
    t.up?.(P(1.5, 1.4));
    expect(pose(ctx, 't1').x).toBeGreaterThan(1.2);
  });
});
