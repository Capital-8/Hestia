import { describe, expect, it } from 'vitest';
import { cleanOutlineRing } from './ringClean.ts';

const area = (r: Array<{ x: number; y: number }>): number => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]!; return s + (p.x * q.y - q.x * p.y); }, 0) / 2;

describe('limpeza do contorno do perímetro', () => {
  it('um degrau de 2 mm entre duas paredes quase alinhadas some, e o contorno fica com os quatro cantos', () => {
    const r = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 5.002, y: 3 }, { x: 5.002, y: 6 }, { x: 0, y: 6 }];
    const c = cleanOutlineRing(r);
    expect(c.length).toBe(4);
    expect(Math.abs(area(c))).toBeCloseTo(30, 1);
  });
  it('vértice numa reta (giro 0°) é removido; canto de 90° e curva de passos de 5° ficam', () => {
    const reta = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
    expect(cleanOutlineRing(reta)).toHaveLength(4);
    const arco = Array.from({ length: 19 }, (_, k) => ({ x: Math.cos((k * 5 * Math.PI) / 180), y: Math.sin((k * 5 * Math.PI) / 180) }));
    expect(cleanOutlineRing(arco)).toHaveLength(19);
  });
  it('nunca deixa menos de três vértices e já limpo não muda', () => {
    const tri = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(cleanOutlineRing(tri)).toHaveLength(3);
    const quad = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    expect(cleanOutlineRing(quad)).toEqual(quad);
  });
});
