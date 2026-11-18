import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, isComponent, type Component } from '@hestia/model';
import { makeEnv, P, tool } from './testEnv.ts';

/** Projeto com a família do armário escolhida nas opções da ferramenta. */
function ctxComFamilia() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  ctx.options.componentFamilyId = FAMILIA_ARMARIO.id;
  ctx.options.componentTypeId = 'A80';
  return ctx;
}

const componentes = (ctx: ReturnType<typeof makeEnv>): Component[] =>
  Object.values(ctx.store.project.elements).filter(isComponent);

describe('ferramenta Componente', () => {
  it('sem família escolhida não insere nada', () => {
    const ctx = makeEnv();
    const t = tool('component', ctx.env);
    t.click(P(1, 2));
    expect(componentes(ctx)).toHaveLength(0);
  });

  it('família fora do projeto não insere nada', () => {
    const ctx = ctxComFamilia();
    ctx.options.componentFamilyId = 'fam_inexistente';
    const t = tool('component', ctx.env);
    t.click(P(1, 2));
    expect(componentes(ctx)).toHaveLength(0);
  });

  it('o clique insere um componente na posição capturada e fica ativo para repetir', () => {
    const ctx = ctxComFamilia();
    const t = tool('component', ctx.env);
    t.move(P(1, 2));
    expect(t.preview().some((i) => i.kind === 'polygon')).toBe(true);
    t.click(P(1, 2));
    t.click(P(3, 2));
    const lista = componentes(ctx);
    expect(lista).toHaveLength(2);
    expect(lista.map((c) => [c.x, c.y])).toEqual([
      [1, 2],
      [3, 2],
    ]);
    expect(lista[0]!.levelId).toBe('lv_0');
    expect(lista[0]!.typeId).toBe('A80');
    expect(lista[0]!.z).toBe(0);
    expect(lista[0]!.rotation).toBe(0);
    expect(lista[0]!.mirrored).toBe(false);
    expect(lista[0]!.values).toBeUndefined();
    expect(lista[0]!.mark).toBe('');
    expect(ctx.done()).toBe(0);
  });

  it('R gira 90° anti-horário e Shift+R volta', () => {
    const ctx = ctxComFamilia();
    const t = tool('component', ctx.env);
    expect(t.key?.('r')).toBe(true);
    t.click(P(1, 2));
    expect(componentes(ctx)[0]!.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(t.key?.('r', true)).toBe(true);
    t.click(P(3, 2));
    expect(componentes(ctx)[1]!.rotation).toBeCloseTo(0, 9);
  });

  it('M espelha e a prévia acompanha', () => {
    const ctx = ctxComFamilia();
    const t = tool('component', ctx.env);
    t.move(P(1, 2));
    expect(t.key?.('m')).toBe(true);
    t.move(P(1, 2));
    t.click(P(1, 2));
    expect(componentes(ctx)[0]!.mirrored).toBe(true);
  });

  it('o desfazer remove o componente inserido', () => {
    const ctx = ctxComFamilia();
    const t = tool('component', ctx.env);
    t.click(P(1, 2));
    expect(componentes(ctx)).toHaveLength(1);
    ctx.store.undo();
    expect(componentes(ctx)).toHaveLength(0);
  });

  it('Esc sai da ferramenta', () => {
    const ctx = ctxComFamilia();
    const t = tool('component', ctx.env);
    t.cancel();
    expect(ctx.done()).toBe(1);
  });
});
