import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, emptyTitleBlock, sheetOf, type Sheet, type SheetViewport } from '@hestia/model';
import { alignViewportsAction, distributeViewportsAction, planAlign, planDistribute, type AlignItem, type SheetInner } from './sheetAlign.ts';
import { resolveText } from './i18n.ts';

/** A3 deitada, margem 10: área de desenho de 10 a 410 em x e de 10 a 287 em y (mm de papel). */
const INNER: SheetInner = { x0: 10, y0: 10, x1: 410, y1: 287 };

const items: AlignItem[] = [
  { id: 'a', box: { x: 20, y: 20, w: 50, h: 30 } },
  { id: 'b', box: { x: 100, y: 80, w: 30, h: 40 } },
  { id: 'c', box: { x: 60, y: 40, w: 40, h: 20 } },
];

const sheetWith = (viewports: SheetViewport[]): Sheet => ({
  id: 'sht_teste',
  number: 'A-101',
  name: 'Teste',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock: emptyTitleBlock(),
  viewports,
});

const vp = (id: string, at: { x: number; y: number }, size = { w: 50, h: 30 }): SheetViewport => ({ id, view: { kind: '3d' }, at, size, scale: 100 });

const positions = (s: Sheet): { x: number; y: number }[] => s.viewports.map((v) => v.at);

const storeWith = (viewports: SheetViewport[]): ProjectStore => {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addSheet', sheet: sheetWith(viewports) }, 'Criar prancha');
  return store;
};

describe('pranchas: alinhar vistas', () => {
  it('alinha à esquerda, à direita, ao topo e à base pelas extremidades do conjunto', () => {
    // Conjunto: x de 20 a 130, y de 20 a 120.
    expect(planAlign(items, 'left', INNER)).toEqual([
      { id: 'a', at: { x: 20, y: 20 } },
      { id: 'b', at: { x: 20, y: 80 } },
      { id: 'c', at: { x: 20, y: 40 } },
    ]);
    expect(planAlign(items, 'right', INNER).map((p) => p.at.x)).toEqual([80, 100, 90]);
    expect(planAlign(items, 'top', INNER).map((p) => p.at.y)).toEqual([20, 20, 20]);
    expect(planAlign(items, 'bottom', INNER).map((p) => p.at.y)).toEqual([90, 80, 100]);
  });

  it('centraliza no meio do conjunto, na horizontal e na vertical', () => {
    // Centro do conjunto: x = (20 + 130) / 2 = 75; y = (20 + 120) / 2 = 70.
    expect(planAlign(items, 'hcenter', INNER).map((p) => p.at.x)).toEqual([50, 60, 55]);
    expect(planAlign(items, 'vcenter', INNER).map((p) => p.at.y)).toEqual([55, 50, 60]);
  });

  it('devolve todas as vistas, inclusive as que já estavam no lugar', () => {
    const schon = planAlign([{ id: 'a', box: { x: 20, y: 20, w: 50, h: 30 } }, { id: 'b', box: { x: 20, y: 90, w: 30, h: 40 } }], 'left', INNER);
    expect(schon).toEqual([
      { id: 'a', at: { x: 20, y: 20 } },
      { id: 'b', at: { x: 20, y: 90 } },
    ]);
  });

  it('limita à área de desenho: à direita, uma caixa larga fica dentro da folha', () => {
    // Direita do conjunto = 430 (passa da borda 410): cada caixa é puxada para a borda.
    const out = planAlign([{ id: 'a', box: { x: 330, y: 10, w: 100, h: 50 } }, { id: 'b', box: { x: 20, y: 100, w: 40, h: 50 } }], 'right', INNER);
    expect(out).toEqual([
      { id: 'a', at: { x: 310, y: 10 } },
      { id: 'b', at: { x: 370, y: 100 } },
    ]);
    for (const p of out) {
      const it = p.id === 'a' ? 100 : 40;
      expect(p.at.x).toBeGreaterThanOrEqual(INNER.x0);
      expect(p.at.x + it).toBeLessThanOrEqual(INNER.x1);
    }
    // Caixa maior que a área de desenho encosta no início da área, sem sair para a esquerda.
    expect(planAlign([{ id: 'w', box: { x: 50, y: 10, w: 500, h: 50 } }], 'right', INNER)[0]!.at.x).toBe(INNER.x0);
  });
});

describe('pranchas: distribuir vistas', () => {
  it('iguala os vãos na horizontal entre três caixas de larguras diferentes', () => {
    const alvo: AlignItem[] = [
      { id: 'a', box: { x: 20, y: 20, w: 40, h: 20 } },
      { id: 'b', box: { x: 100, y: 50, w: 20, h: 20 } },
      { id: 'c', box: { x: 200, y: 80, w: 60, h: 20 } },
    ];
    // Fora de ordem de propósito: a distribuição ordena pelo eixo antes de calcular.
    const out = planDistribute([alvo[1]!, alvo[0]!, alvo[2]!], 'h', INNER);
    const [a, b, c] = out;
    expect(a!.id).toBe('a');
    expect(a!.at.x).toBe(20);
    expect(b!.id).toBe('b');
    expect(b!.at.x).toBe(120);
    expect(c!.id).toBe('c');
    expect(c!.at.x).toBe(200);
    const gap1 = b!.at.x - (a!.at.x + 40);
    const gap2 = c!.at.x - (b!.at.x + 20);
    expect(gap1).toBeCloseTo(gap2, 9);
    expect(gap1).toBeCloseTo(60, 9);
  });

  it('iguala os vãos na vertical mantendo a primeira e a última paradas', () => {
    const alvo: AlignItem[] = [
      { id: 'a', box: { x: 20, y: 20, w: 20, h: 20 } },
      { id: 'b', box: { x: 60, y: 90, w: 20, h: 40 } },
      { id: 'c', box: { x: 100, y: 200, w: 20, h: 30 } },
    ];
    const out = planDistribute(alvo, 'v', INNER);
    expect(out[0]!.at.y).toBe(20);
    expect(out[2]!.at.y).toBe(200);
    expect(out[1]!.at.y - (out[0]!.at.y + 20)).toBeCloseTo(out[2]!.at.y - (out[1]!.at.y + 40), 9);
  });

  it('com menos de três vistas mantém as posições atuais', () => {
    expect(planDistribute([items[0]!], 'h', INNER)).toEqual([{ id: 'a', at: { x: 20, y: 20 } }]);
    expect(planDistribute([items[0]!, items[1]!], 'v', INNER)).toEqual([
      { id: 'a', at: { x: 20, y: 20 } },
      { id: 'b', at: { x: 100, y: 80 } },
    ]);
  });
});

describe('pranchas: ações de alinhar e distribuir', () => {
  it('alinhar grava um único passo de desfazer que volta todas as posições', () => {
    const store = storeWith([vp('v1', { x: 20, y: 20 }), vp('v2', { x: 100, y: 80 }, { w: 30, h: 40 }), vp('v3', { x: 60, y: 40 }, { w: 40, h: 20 })]);
    const antes = positions(sheetOf(store.project, 'sht_teste')!);
    expect(alignViewportsAction(store, 'sht_teste', ['v1', 'v2', 'v3'], 'left')).toBeNull();
    expect(positions(sheetOf(store.project, 'sht_teste')!).map((p) => p.x)).toEqual([20, 20, 20]);
    expect(resolveText(store.undoLabel!, 'pt')).toBe('Alinhar vistas da prancha');
    store.undo();
    expect(positions(sheetOf(store.project, 'sht_teste')!)).toEqual(antes);
  });

  it('distribuir grava um único passo de desfazer com o rótulo próprio', () => {
    const store = storeWith([vp('v1', { x: 20, y: 20 }, { w: 40, h: 20 }), vp('v2', { x: 100, y: 50 }, { w: 20, h: 20 }), vp('v3', { x: 200, y: 80 }, { w: 60, h: 20 })]);
    const antes = positions(sheetOf(store.project, 'sht_teste')!);
    expect(distributeViewportsAction(store, 'sht_teste', ['v1', 'v2', 'v3'], 'h')).toBeNull();
    expect(positions(sheetOf(store.project, 'sht_teste')!).map((p) => p.x)).toEqual([20, 120, 200]);
    expect(resolveText(store.undoLabel!, 'pt')).toBe('Distribuir vistas da prancha');
    store.undo();
    expect(positions(sheetOf(store.project, 'sht_teste')!)).toEqual(antes);
  });

  it('recusa com menos de duas vistas existentes, em português, sem gravar', () => {
    const store = storeWith([vp('v1', { x: 20, y: 20 })]);
    const msg = alignViewportsAction(store, 'sht_teste', ['v1'], 'left');
    expect(msg).toBe('Selecione ao menos duas vistas da prancha.');
    expect(distributeViewportsAction(store, 'sht_teste', ['v1', 'nao_existe'], 'h')).toBe('Selecione ao menos duas vistas da prancha.');
    expect(store.undoLabel).toBe('Criar prancha');
  });

  it('recusa prancha inexistente', () => {
    const store = storeWith([vp('v1', { x: 20, y: 20 }), vp('v2', { x: 100, y: 80 })]);
    expect(alignViewportsAction(store, 'sht_nao', ['v1', 'v2'], 'top')).toBe('Prancha inexistente');
    expect(distributeViewportsAction(store, 'sht_nao', ['v1', 'v2'], 'v')).toBe('Prancha inexistente');
  });
});
