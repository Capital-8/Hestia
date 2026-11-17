import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, isLot, makeLot, type LadoLote, type Lot, type Project } from '@hestia/model';
import { alcaDoLoteEm, bordasDoLote, ghostLote, gravarContornoDoLote, inserirVerticeDoLote, moverVerticeDoLote, previaDasAlcasDoLote, removerVerticeDoFocoDoLote, removerVerticeDoLote, selectedLots } from './lotHandles.ts';
import { SelectTool } from './selectTool.ts';
import { makeEnv, P } from './testEnv.ts';

const LT = 'lt_l1';
const v = (x: number, y: number) => ({ x, y });
const L1 = [v(0, 0), v(12, 0), v(12, 30), v(0, 30)];
const A: LadoLote = { papel: 'frente', recuo: 5 };
const B: LadoLote = { papel: 'lateral', recuo: 1.5 };
const C: LadoLote = { papel: 'fundo', recuo: 3 };
const D: LadoLote = { papel: 'lateral', recuo: 1.2 };

/** L1 com lados distintos (frente 5, lateral 1,5, fundo 3, lateral 1,2), selecionado, e a ferramenta Selecionar ligada. */
function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  ctx.store.exec({ type: 'addLot', lot: makeLot({ id: LT, levelId: 'lv_0', contorno: L1, lados: [A, B, C, D] }) });
  ctx.env.setSelection([LT]);
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  const s = new SelectTool(ctx.env);
  s.start();
  return { ...ctx, s, msgs };
}
const lt = (p: Project): Lot => p.elements[LT] as Lot;
const lotes = (p: Project): Lot[] => Object.values(p.elements).filter(isLot);
const arrastar = (s: SelectTool, de: [number, number], ate: [number, number]): void => {
  s.move(P(de[0], de[1]));
  s.down(P(de[0], de[1]));
  s.drag(P(ate[0], ate[1]));
  s.up(P(ate[0], ate[1]));
};
const clicar = (s: SelectTool, x: number, y: number): void => {
  s.move(P(x, y));
  s.down(P(x, y));
  s.up(P(x, y));
};
const caixa = (s: SelectTool, a: [number, number], b: [number, number]): void => {
  s.down(P(a[0], a[1]));
  s.drag(P(b[0], b[1]));
  s.up(P(b[0], b[1]));
};
const c0 = { contorno: L1, lados: [A, B, C, D] };

describe('edição pura do contorno do lote', () => {
  it('mover um vértice mantém os lados', () => {
    const r = moverVerticeDoLote(c0, 1, v(13, 1));
    expect(r.contorno[1]).toEqual(v(13, 1));
    expect(r.lados).toEqual([A, B, C, D]);
    expect(c0.contorno[1]).toEqual(v(12, 0));
  });

  it('inserir vértice no lado duplica o papel e o recuo daquele lado; lados.length === contorno.length', () => {
    const r = inserirVerticeDoLote(c0, 1, v(12, 15));
    expect(r.contorno).toEqual([v(0, 0), v(12, 0), v(12, 15), v(12, 30), v(0, 30)]);
    expect(r.lados).toEqual([A, B, B, C, D]);
    expect(r.lados).toHaveLength(r.contorno.length);
    const ultimo = inserirVerticeDoLote(c0, 3, v(0, 15));
    expect(ultimo.contorno[4]).toEqual(v(0, 15));
    expect(ultimo.lados).toEqual([A, B, C, D, D]);
  });

  it('remover vértice funde os dois lados e fica o do primeiro', () => {
    const r1 = removerVerticeDoLote(c0, 1)!;
    expect(r1.contorno).toEqual([v(0, 0), v(12, 30), v(0, 30)]);
    expect(r1.lados).toEqual([A, C, D]);
    expect(r1.lados).toHaveLength(r1.contorno.length);
    // Vértice 0: os lados que se encontram são o último (D) e o primeiro (A); fica o D, que vem primeiro no contorno.
    const r0 = removerVerticeDoLote(c0, 0)!;
    expect(r0.contorno).toEqual([v(12, 0), v(12, 30), v(0, 30)]);
    expect(r0.lados).toEqual([B, C, D]);
  });

  it('com 3 vértices não se remove mais', () => {
    expect(removerVerticeDoLote({ contorno: [v(0, 0), v(4, 0), v(0, 3)], lados: [A, B, C] }, 0)).toBeNull();
  });
});

describe('alças do lote (vértice e meio de aresta)', () => {
  it('alcaDoLoteEm: vértice tem prioridade sobre o meio; só entre os selecionados', () => {
    const { store } = cena();
    expect(alcaDoLoteEm(store.project, [LT], v(0.03, 0.02), 0.01)).toEqual({ loteId: LT, kind: 'vertex', index: 0, at: v(0, 0) });
    expect(alcaDoLoteEm(store.project, [LT], v(6.02, 0), 0.01)).toEqual({ loteId: LT, kind: 'edge', index: 0, at: v(6, 0) });
    expect(alcaDoLoteEm(store.project, [], v(0, 0), 0.01)).toBeNull();
    expect(alcaDoLoteEm(store.project, [LT], v(6, 15), 0.01)).toBeNull();
  });

  it('arrastar um vértice move só ele e mantém lados; um desfazer', () => {
    const { store, s } = cena();
    arrastar(s, [12, 0], [14, 1]);
    expect(lt(store.project).contorno[1]).toEqual(v(14, 1));
    expect(lt(store.project).lados).toEqual([A, B, C, D]);
    store.undo();
    expect(lt(store.project).contorno[1]).toEqual(v(12, 0));
  });

  it('arrastar o meio da aresta insere um vértice e duplica papel e recuo do lado', () => {
    const { store, s } = cena();
    arrastar(s, [12, 15], [14, 15]);
    const l = lt(store.project);
    expect(l.contorno).toHaveLength(5);
    expect(l.contorno.some((q) => q.x === 14 && q.y === 15)).toBe(true);
    expect(l.lados).toHaveLength(5);
    expect(l.lados).toEqual([A, B, B, C, D]);
    store.undo();
    expect(lt(store.project).contorno).toHaveLength(4);
    expect(lt(store.project).lados).toEqual([A, B, C, D]);
  });

  it('autointersecção é recusada pelo modelo: nada muda e a mensagem aparece', () => {
    const { store, s, msgs } = cena();
    const antes = structuredClone(lt(store.project));
    arrastar(s, [0, 0], [12, 30]);
    expect(lt(store.project)).toEqual(antes);
    expect(msgs.at(-1)).toBeTruthy();
  });

  it('clique num vértice o põe em foco; Delete remove o vértice e funde os lados (mínimo de 3)', () => {
    const { store, s, msgs } = cena();
    clicar(s, 12, 0);
    expect(msgs.at(-1)).toContain('Vértice em foco');
    expect(s.deleteKey()).toBe(true);
    expect(lt(store.project).contorno).toEqual([v(0, 0), v(12, 30), v(0, 30)]);
    expect(lt(store.project).lados).toEqual([A, C, D]);
    expect(lotes(store.project)).toHaveLength(1);
    // Com 3 vértices o Delete recusa e o lote continua.
    clicar(s, 0, 30);
    expect(s.deleteKey()).toBe(true);
    expect(lt(store.project).contorno).toHaveLength(3);
    expect(msgs.at(-1)).toContain('pelo menos 3');
    store.undo();
    expect(lt(store.project).contorno).toHaveLength(4);
    expect(lt(store.project).lados).toEqual([A, B, C, D]);
  });

  it('removerVerticeDoFocoDoLote: foco de outro elemento ou lote fora da seleção devolve null', () => {
    const { env } = cena();
    expect(removerVerticeDoFocoDoLote(env, { id: 'outro', index: 0 })).toBeNull();
    env.setSelection([]);
    expect(removerVerticeDoFocoDoLote(env, { id: LT, index: 0 })).toBeNull();
  });

  it('a prévia das alças desenha um ponto por vértice e um por meio de aresta (só do nível do lote)', () => {
    const { env } = cena();
    expect(previaDasAlcasDoLote(env)).toHaveLength(8);
    env.setSelection([]);
    expect(previaDasAlcasDoLote(env)).toHaveLength(0);
  });
});

describe('gravarContornoDoLote', () => {
  it('contorno inválido é recusado com a mensagem do modelo', () => {
    const { store, env, msgs } = cena();
    expect(gravarContornoDoLote(env, LT, { contorno: [v(0, 0), v(1, 1)], lados: [A, B] })).toBe(false);
    expect(lt(store.project).contorno).toHaveLength(4);
    expect(msgs.at(-1)).toBeTruthy();
  });

  it('contorno horário é normalizado e os lados vão junto', () => {
    const { store, env } = cena();
    const horario = { contorno: [v(0, 0), v(0, 30), v(12, 30), v(12, 0)], lados: [D, C, B, A] };
    expect(gravarContornoDoLote(env, LT, horario)).toBe(true);
    expect(lt(store.project).lados).toHaveLength(4);
    // O lado frente (A, recuo 5) continua ligando (0,0) a (12,0).
    const l = lt(store.project);
    const i = l.lados.findIndex((x) => x.recuo === 5);
    expect([l.contorno[i], l.contorno[(i + 1) % 4]].map((q) => `${q!.x},${q!.y}`).sort()).toEqual(['0,0', '12,0']);
  });

  it('elemento que não é lote devolve falso sem mexer em nada', () => {
    const { env } = cena();
    expect(gravarContornoDoLote(env, 'nao_existe', c0)).toBe(false);
  });
});

describe('Alinhar e fantasma', () => {
  it('bordasDoLote devolve as arestas próximas ao cursor', () => {
    const { store } = cena();
    const r = bordasDoLote(store.project, 'lv_0', v(6, 0.02), 0.1);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ loteId: LT, i: 0, a: v(0, 0), b: v(12, 0) });
    expect(bordasDoLote(store.project, 'lv_0', v(6, 15), 0.1)).toHaveLength(0);
    expect(bordasDoLote(store.project, 'outro', v(6, 0), 0.1)).toHaveLength(0);
    expect(bordasDoLote(store.project, 'lv_0', v(6, 0), 0.1, new Set([LT]))).toHaveLength(0);
  });

  it('selectedLots e ghostLote', () => {
    const { store } = cena();
    expect(selectedLots(store.project, [LT, 'x'])).toEqual([LT]);
    const g = ghostLote(store.project, LT, { kind: 'translate', d: v(1, 2) });
    expect(g).toEqual([{ kind: 'polygon', ring: [v(1, 2), v(13, 2), v(13, 32), v(1, 32)], dashed: true }]);
    expect(ghostLote(store.project, 'x', { kind: 'translate', d: v(1, 2) })).toEqual([]);
  });
});

describe('Selecionar: lote pelo contorno, nunca pelo interior', () => {
  it('clique no contorno seleciona o lote', () => {
    const { env, s, sel } = cena();
    env.setSelection([]);
    clicar(s, 6, 0.03);
    expect(sel()).toEqual([LT]);
  });

  it('clique no INTERIOR não seleciona e limpa a seleção', () => {
    const { env, s, sel } = cena();
    env.setSelection([LT]);
    clicar(s, 6, 15);
    expect(sel()).toEqual([]);
  });

  it('caixa: janela pega o lote inteiro dentro; cruzamento basta tocar o contorno; dentro sem tocar não pega', () => {
    const { env, s, sel } = cena();
    env.setSelection([]);
    caixa(s, [-1, -1], [13, 31]);
    expect(sel()).toEqual([LT]);
    env.setSelection([]);
    caixa(s, [-1, -1], [6, 31]);
    expect(sel()).toEqual([]);
    caixa(s, [14, 15], [6, 10]);
    expect(sel()).toEqual([LT]);
    env.setSelection([]);
    caixa(s, [8, 20], [4, 10]);
    expect(sel()).toEqual([]);
  });
});
