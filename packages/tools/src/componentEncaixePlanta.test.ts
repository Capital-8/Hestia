import { describe, expect, it } from 'vitest';
import { caixaLocalDoComponente } from '@hestia/engine';
import {
  FAMILIA_ARMARIO,
  isComponent,
  isWall,
  makeWall,
  totalThickness,
  wallType,
  type Component,
} from '@hestia/model';
import { componentGhostItemsNasPoses } from './componentGhost.ts';
import { textoStatusArrastoComponentes } from './componentDrag.ts';
import { makeEnv, P, tool } from './testEnv.ts';

const comp = (id: string, x: number, y: number): Omit<Component, 'order'> => ({
  id,
  kind: 'component',
  familyId: FAMILIA_ARMARIO.id,
  typeId: 'A80',
  levelId: 'lv_0',
  x,
  y,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: id,
});

/** Projeto com a família e um A80. */
function ctxBase(): ReturnType<typeof makeEnv> {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  return ctx;
}

/** Acrescenta a parede reta em y = 0 (espessura de `wt_alv14`). */
function comParede(ctx: ReturnType<typeof makeEnv>): void {
  ctx.store.exec({
    type: 'addWall',
    wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }),
  });
}

const componente = (ctx: ReturnType<typeof makeEnv>, id: string): Component => {
  const c = ctx.store.project.elements[id];
  if (!isComponent(c)) throw new Error('não é componente');
  return c;
};

describe('encaixe do componente no arrasto da planta', () => {
  it('arrastar até a parede gira π e encosta o fundo na face', () => {
    const ctx = ctxBase();
    comParede(ctx);
    ctx.store.exec({ type: 'addComponent', component: comp('c1', 1, 1) });
    ctx.env.setSelection(['c1']);
    const pr = ctx.store.project;
    const caixa = caixaLocalDoComponente(pr, componente(ctx, 'c1'));
    const parede = pr.elements['w1'];
    const espessura = isWall(parede) ? totalThickness(wallType(pr, parede)) : 0;
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 1.2));
    t.drag?.(P(1.6, 0.3));
    t.up?.(P(1.6, 0.3));
    const c = componente(ctx, 'c1');
    expect(c.rotation).toBeCloseTo(Math.PI, 9);
    expect(c.y).toBeCloseTo(espessura / 2 + (caixa?.max[1] ?? 0), 9);
  });

  it('com Alt pressionado no arrasto não encaixa', () => {
    const ctx = ctxBase();
    comParede(ctx);
    ctx.store.exec({ type: 'addComponent', component: comp('c1', 1, 1) });
    ctx.env.setSelection(['c1']);
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 1.2, { alt: true }));
    t.drag?.(P(1.6, 0.3, { alt: true }));
    t.up?.(P(1.6, 0.3, { alt: true }));
    const c = componente(ctx, 'c1');
    expect(c.rotation).toBeCloseTo(0, 9);
    expect(c.x).toBeCloseTo(1.2, 9);
    expect(c.y).toBeCloseTo(0.1, 9);
  });

  it('longe de tudo o arrasto é só deslocamento', () => {
    const ctx = ctxBase();
    ctx.store.exec({ type: 'addComponent', component: comp('c1', 1, 1) });
    ctx.env.setSelection(['c1']);
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 1.2));
    t.drag?.(P(2.5, 1.5));
    t.up?.(P(2.5, 1.5));
    const c = componente(ctx, 'c1');
    expect(c.x).toBeCloseTo(2.1, 9);
    expect(c.y).toBeCloseTo(1.3, 9);
    expect(c.rotation).toBeCloseTo(0, 9);
  });

  it('um desfazer volta posição e rotação do encaixe', () => {
    const ctx = ctxBase();
    comParede(ctx);
    ctx.store.exec({ type: 'addComponent', component: comp('c1', 1, 1) });
    ctx.env.setSelection(['c1']);
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 1.2));
    t.drag?.(P(1.6, 0.3));
    t.up?.(P(1.6, 0.3));
    expect(componente(ctx, 'c1').rotation).toBeCloseTo(Math.PI, 9);
    ctx.store.undo();
    const c = componente(ctx, 'c1');
    expect(c.x).toBeCloseTo(1, 9);
    expect(c.y).toBeCloseTo(1, 9);
    expect(c.rotation).toBeCloseTo(0, 9);
  });

  it('conjunto de 3 move e gira rígido junto, com a linha coerente e um único desfazer', () => {
    const ctx = ctxBase();
    comParede(ctx);
    ctx.store.exec({ type: 'addComponent', component: comp('c1', 1, 1) });
    ctx.store.exec({ type: 'addComponent', component: comp('c2', 2, 1) });
    ctx.store.exec({ type: 'addComponent', component: comp('c3', 3, 1) });
    ctx.store.exec({
      type: 'upsertComponentGroup',
      group: { id: 'g1', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1', 'c2', 'c3'], linha: { a: { x: 1, y: 1 }, b: { x: 3, y: 1 } } },
    });
    ctx.env.setSelection(['c1', 'c2', 'c3']);
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 1.2));
    t.drag?.(P(1.6, 0.3));
    t.up?.(P(1.6, 0.3));
    const c1 = componente(ctx, 'c1');
    const c2 = componente(ctx, 'c2');
    const c3 = componente(ctx, 'c3');
    expect(c1.rotation).toBeCloseTo(Math.PI, 9);
    expect(c2.x).toBeCloseTo(c1.x - 1, 9);
    expect(c2.y).toBeCloseTo(c1.y, 9);
    expect(c2.rotation).toBeCloseTo(Math.PI, 9);
    expect(c3.x).toBeCloseTo(c1.x - 2, 9);
    expect(c3.y).toBeCloseTo(c1.y, 9);
    expect(c3.rotation).toBeCloseTo(Math.PI, 9);
    const linha = ctx.store.project.componentGroups?.g1?.linha;
    expect(linha?.a.x).toBeCloseTo(c1.x, 9);
    expect(linha?.a.y).toBeCloseTo(c1.y, 9);
    expect(linha?.b.x).toBeCloseTo(c1.x - 2, 9);
    expect(linha?.b.y).toBeCloseTo(c1.y, 9);
    ctx.store.undo();
    expect(componente(ctx, 'c1')).toMatchObject({ x: 1, y: 1, rotation: 0 });
    expect(componente(ctx, 'c2')).toMatchObject({ x: 2, y: 1, rotation: 0 });
    expect(componente(ctx, 'c3')).toMatchObject({ x: 3, y: 1, rotation: 0 });
    expect(ctx.store.project.componentGroups?.g1?.linha?.a).toEqual({ x: 1, y: 1 });
  });

  it('o status do arrasto mostra a parede, o vizinho pela marca e a colisão', () => {
    const ctx = ctxBase();
    ctx.store.exec({ type: 'addComponent', component: { ...comp('c1', 1, 1), mark: 'M-01' } });
    const pr = ctx.store.project;
    expect(textoStatusArrastoComponentes(pr, { parede: 0, colisoes: [] })).toBe('Encaixado na parede');
    expect(textoStatusArrastoComponentes(pr, { vizinho: 'c1', colisoes: [] })).toBe('Colado em M-01');
    expect(textoStatusArrastoComponentes(pr, { colisoes: ['c1'] })).toBe('Colide com M-01');
    expect(textoStatusArrastoComponentes(pr, { colisoes: [] })).toBe('');
  });

  it('o fantasma usa a rotação encaixada, não só o deslocamento', () => {
    const ctx = ctxBase();
    ctx.store.exec({ type: 'addComponent', component: comp('c1', 1, 1) });
    const itens = componentGhostItemsNasPoses(ctx.store.project, new Map([['c1', { x: 1, y: 1, rotation: Math.PI / 2 }]]));
    const pontos = itens.flatMap((i) => (i.kind === 'polygon' ? i.ring : []));
    const xs = pontos.map((p) => p.x);
    const ys = pontos.map((p) => p.y);
    const largura = Math.max(...xs) - Math.min(...xs);
    const altura = Math.max(...ys) - Math.min(...ys);
    // O A80 é mais largo que profundo; girado 90°, a profundidade vira a largura.
    expect(largura).toBeLessThan(altura);
  });

  it('arrasto sem componentes não muda o projeto', () => {
    const ctx = makeEnv();
    const antes = JSON.stringify(ctx.store.project.elements);
    const t = tool('select', ctx.env);
    t.down?.(P(1, 1));
    t.drag?.(P(3, 3));
    t.up?.(P(3, 3));
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
  });
});
