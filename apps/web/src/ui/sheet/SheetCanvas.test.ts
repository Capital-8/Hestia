import { describe, expect, it } from 'vitest';
import { strokeRuns } from './SheetCanvas.tsx';

const path = (pts: [number, number][], color: string, widthMm: number, closed = false, dashMm?: [number, number]) => ({
  pts: pts.map(([x, y]) => ({ x, y })),
  closed,
  widthMm,
  color,
  ...(dashMm ? { dashMm } : {}),
});

describe('strokeRuns: traços consecutivos de mesmo estilo viram um só caminho', () => {
  it('funde vizinhos iguais, mantém a ordem e não funde estilos diferentes nem iguais separados por outro', () => {
    const runs = strokeRuns(
      [
        path([[0, 0], [10, 5]], '#000000', 0.2),
        path([[1, 1], [2, 1], [2, 2]], '#000000', 0.2, true),
        path([[3, 3], [4, 4]], '#ff0000', 0.2),
        path([[5, 5], [6, 6]], '#000000', 0.2),
      ],
      100,
    );
    expect(runs).toEqual([
      { d: 'M0 100 L10 95 M1 99 L2 99 L2 98Z', color: '#000000', widthMm: 0.2, dash: undefined },
      { d: 'M3 97 L4 96', color: '#ff0000', widthMm: 0.2, dash: undefined },
      { d: 'M5 95 L6 94', color: '#000000', widthMm: 0.2, dash: undefined },
    ]);
  });

  it('espessura e tracejado diferentes quebram a sequência; o tracejado sai em mm', () => {
    const runs = strokeRuns(
      [path([[0, 0], [1, 0]], '#111111', 0.1, false, [2, 1]), path([[0, 1], [1, 1]], '#111111', 0.1, false, [2, 1]), path([[0, 2], [1, 2]], '#111111', 0.25)],
      10,
    );
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({ d: 'M0 10 L1 10 M0 9 L1 9', color: '#111111', widthMm: 0.1, dash: '2 1' });
    expect(runs[1]).toEqual({ d: 'M0 8 L1 8', color: '#111111', widthMm: 0.25, dash: undefined });
  });

  it('sem traços não gera nada', () => {
    expect(strokeRuns([], 10)).toEqual([]);
  });
});
