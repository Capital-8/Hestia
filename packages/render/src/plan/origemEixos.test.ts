import { describe, expect, it } from 'vitest';
import { comEixosDaOrigem, origemEixosPlanta } from './origemEixos.ts';
import type { PlanOps } from './types.ts';
import type { Viewport } from '../viewport.ts';

const comp = (pts: { x: number; y: number }[]): number => Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);

describe('origemEixosPlanta', () => {
  it('a 100 px/m os eixos têm 32 px = 0,32 m, X vermelho em +X e Y verde em +Y', () => {
    const o = origemEixosPlanta(100);
    const x = o.strokes.find((s) => s.role === 'origem-x')!;
    const y = o.strokes.find((s) => s.role === 'origem-y')!;
    expect(x.color).toBe('#e5484d');
    expect(y.color).toBe('#30a46c');
    expect(x.pts).toEqual([{ x: 0, y: 0 }, { x: 0.32, y: 0 }]);
    expect(y.pts).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0.32 }]);
    expect(comp(x.pts)).toBeCloseTo(0.32, 9);
    expect(x.widthPx).toBe(1.5);
  });

  it('a 50 px/m os eixos têm 0,64 m (mesmos 32 px na tela)', () => {
    const o = origemEixosPlanta(50);
    expect(comp(o.strokes.find((s) => s.role === 'origem-x')!.pts)).toBeCloseTo(0.64, 9);
    expect(comp(o.strokes.find((s) => s.role === 'origem-y')!.pts)).toBeCloseTo(0.64, 9);
  });

  it('o Z é um círculo azul #3e63dd de 4 px na origem; rótulos X e Y nas pontas com as cores dos eixos', () => {
    const o = origemEixosPlanta(100);
    expect(o.fills).toHaveLength(1);
    expect(o.fills[0]!.color).toBe('#3e63dd');
    const anel = o.fills[0]!.polygons[0]![0]!;
    expect(Math.max(...anel.map((p) => Math.hypot(p.x, p.y)))).toBeCloseTo(0.04, 9);
    expect(o.strokes.find((s) => s.role === 'origem-z')!.color).toBe('#3e63dd');
    expect(o.labels.map((l) => [l.text, l.color, l.at.x, l.at.y])).toEqual([['X', '#e5484d', 0.32, 0], ['Y', '#30a46c', 0, 0.32]]);
  });

  it('zoom inválido não desenha nada', () => {
    expect(origemEixosPlanta(0)).toEqual({ fills: [], strokes: [], labels: [] });
  });
});

describe('comEixosDaOrigem', () => {
  const v = { cx: 0, cy: 0, zoom: 100, width: 800, height: 600 } as Viewport;
  const vazio: PlanOps = { fills: [], strokes: [], labels: [] };
  const upd = { liveKey: 'k', live: () => vazio };

  it('desligado devolve a atualização intacta (nada desenhado)', () => {
    expect(comEixosDaOrigem(upd, false, v)).toBe(upd);
  });

  it('ligado soma o marcador à camada viva e a chave muda com o zoom', () => {
    const a = comEixosDaOrigem(upd, true, v);
    expect(a.live!().strokes).toHaveLength(5);
    expect(a.live!().labels).toHaveLength(2);
    expect(a.liveKey).toBe('k|origem:100');
    expect(comEixosDaOrigem(upd, true, { ...v, zoom: 50 }).liveKey).toBe('k|origem:50');
  });
});
