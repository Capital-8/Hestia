import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, isLot, LOTE_LIMITES, type Lot, type Project } from '@hestia/model';
import { LotTool } from './lotTool.ts';
import { clickAt, makeEnv, P } from './testEnv.ts';

const L1 = [[0, 0], [12, 0], [12, 30], [0, 30]] as const;

function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  const t = new LotTool(ctx.env);
  t.start();
  return { ctx, t, msgs };
}
const lotes = (p: Project): Lot[] => Object.values(p.elements).filter(isLot);
const desenha = (t: LotTool, pts: ReadonlyArray<readonly [number, number]> = L1): void => {
  for (const [x, y] of pts) clickAt(t, x, y);
  t.confirm();
};

describe('ferramenta Linhas de propriedade (lot)', () => {
  it('cria L1 pelo desenho: retângulo (0,0)-(12,30), primeiro lado frente e os demais laterais com recuo 0', () => {
    const { ctx, t } = cena();
    desenha(t);
    const [l] = lotes(ctx.store.project);
    expect(lotes(ctx.store.project)).toHaveLength(1);
    expect(l!.contorno).toEqual([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 30 }, { x: 0, y: 30 }]);
    expect(l!.lados).toEqual([{ papel: 'frente', recuo: 0 }, { papel: 'lateral', recuo: 0 }, { papel: 'lateral', recuo: 0 }, { papel: 'lateral', recuo: 0 }]);
    expect(l!.levelId).toBe('lv_0');
    expect(l!.mostrarEdificavel).toBe(true);
    expect(ctx.sel()).toEqual([l!.id]);
    expect(ctx.done()).toBe(1);
  });

  it('um desfazer remove o lote', () => {
    const { ctx, t } = cena();
    desenha(t);
    ctx.store.undo();
    expect(lotes(ctx.store.project)).toHaveLength(0);
  });

  it('traçado horário: o modelo normaliza e o primeiro lado desenhado continua sendo a frente', () => {
    const { ctx, t } = cena();
    desenha(t, [[0, 0], [0, 30], [12, 30], [12, 0]]);
    const l = lotes(ctx.store.project)[0]!;
    // Lado desenhado primeiro: (0,0)-(0,30). Depois de inverter, ele liga os mesmos dois pontos.
    const i = l.lados.findIndex((x) => x.papel === 'frente');
    const a = l.contorno[i]!;
    const b = l.contorno[(i + 1) % l.contorno.length]!;
    expect([a, b].map((q) => `${q.x},${q.y}`).sort()).toEqual(['0,0', '0,30']);
    expect(l.lados.filter((x) => x.papel === 'frente')).toHaveLength(1);
  });

  it('C fecha com 3 pontos ou mais; antes disso avisa e nada é criado', () => {
    const { ctx, t, msgs } = cena();
    clickAt(t, 0, 0);
    clickAt(t, 12, 0);
    expect(t.type('c')).toBe(false);
    t.confirm();
    expect(msgs.some((m) => m.includes('3 pontos'))).toBe(true);
    expect(lotes(ctx.store.project)).toHaveLength(0);
    clickAt(t, 12, 30);
    expect(t.type('C')).toBe(true);
    expect(lotes(ctx.store.project)).toHaveLength(1);
    expect(lotes(ctx.store.project)[0]!.contorno).toHaveLength(3);
  });

  it('clique perto do primeiro ponto fecha o polígono', () => {
    const { ctx, t } = cena();
    for (const [x, y] of L1) clickAt(t, x, y);
    clickAt(t, 0.02, 0.02);
    expect(lotes(ctx.store.project)).toHaveLength(1);
    expect(lotes(ctx.store.project)[0]!.contorno).toHaveLength(4);
  });

  it('polígono que se cruza é recusado com a mensagem do modelo, nada é criado e o traçado continua', () => {
    const { ctx, t, msgs } = cena();
    desenha(t, [[0, 0], [10, 10], [10, 0], [0, 10]]);
    expect(lotes(ctx.store.project)).toHaveLength(0);
    expect(msgs.length).toBeGreaterThan(0);
    expect(t.pontosPendentes()).toHaveLength(4);
  });

  it('Esc cancela o traçado em curso; sem traçado, sai da ferramenta', () => {
    const { ctx, t } = cena();
    clickAt(t, 0, 0);
    clickAt(t, 5, 0);
    expect(t.pontosPendentes()).toHaveLength(2);
    t.cancel();
    expect(t.pontosPendentes()).toHaveLength(0);
    expect(ctx.done()).toBe(0);
    t.cancel();
    expect(ctx.done()).toBe(1);
    expect(lotes(ctx.store.project)).toHaveLength(0);
  });

  it('comprimento digitado acrescenta um ponto na direção do cursor (núcleo comum de desenho)', () => {
    const { t } = cena();
    clickAt(t, 0, 0);
    t.move(P(5, 0));
    expect(t.inputPrompt()).not.toBeNull();
    expect(t.type('12')).toBe(true);
    expect(t.pontosPendentes()[1]!.x).toBeCloseTo(12, 9);
    expect(t.pontosPendentes()[1]!.y).toBeCloseTo(0, 9);
  });

  it('respeita o limite de pontos do lote', () => {
    const { t, msgs } = cena();
    for (let i = 0; i < LOTE_LIMITES.pontos + 2; i++) clickAt(t, i * 0.5, (i % 2) * 0.5);
    expect(t.pontosPendentes()).toHaveLength(LOTE_LIMITES.pontos);
    expect(msgs.some((m) => m.includes(String(LOTE_LIMITES.pontos)))).toBe(true);
  });

  it('modo escolher ponto: o clique devolve o ponto e termina; nada é criado; Esc chama o cancelamento', () => {
    const { ctx, t } = cena();
    let achado: { x: number; y: number } | null = null;
    t.escolherPonto((q) => { achado = q; });
    clickAt(t, 3, 4);
    expect(achado).toEqual({ x: 3, y: 4 });
    expect(ctx.done()).toBe(1);
    expect(lotes(ctx.store.project)).toHaveLength(0);
    let cancelou = false;
    t.escolherPonto(() => undefined, () => { cancelou = true; });
    t.cancel();
    expect(cancelou).toBe(true);
    expect(ctx.done()).toBe(2);
  });

  it('desenha a prévia e a cota dinâmica do trecho', () => {
    const { t } = cena();
    clickAt(t, 0, 0);
    t.move(P(6, 0));
    expect(t.preview().some((i) => i.kind === 'line')).toBe(true);
    expect(t.tempDims()).toHaveLength(1);
  });
});
