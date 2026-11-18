import { describe, expect, it } from 'vitest';
import type { Transform } from '@hestia/geom';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { inverterLote, isLot, ladosPadrao, makeLot, normalizarLote, transformLot } from './lot.ts';
import type { LadoLote, Lot } from './lotTypes.ts';
import { lotIssue } from './validateLot.ts';

const eixoX: Transform = { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } };
const giro90: Transform = { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 };
const mover: Transform = { kind: 'translate', d: { x: 100, y: -50 } };

/** Retângulo 20 x 30 com papéis e recuos distintos em cada lado (os lados 1 e 3 têm recuos diferentes entre si). */
const contorno = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }];
const lados: LadoLote[] = [{ papel: 'frente', recuo: 5 }, { papel: 'lateral', recuo: 1.5 }, { papel: 'fundo', recuo: 3 }, { papel: 'lateral', recuo: 2 }];
const lote = (): Lot => ({ ...makeLot({ id: 'lt1', levelId: 'lv_0', contorno, lados, limites: { taxaOcupacaoMax: 0.5 } }), order: 0 });

/** Os lados como segmentos não orientados: ponto, ponto, papel, recuo (para conferir que o espelho preserva o par). */
const segmentos = (l: Lot): string[] =>
  l.lados.map((x, i) => {
    const a = l.contorno[i]!;
    const b = l.contorno[(i + 1) % l.contorno.length]!;
    const [p, q] = [a, b].map((v) => `${Math.round(v.x * 1e6) / 1e6},${Math.round(v.y * 1e6) / 1e6}`).sort() as [string, string];
    return `${p}|${q}|${x.papel}|${x.recuo}`;
  });

describe('transform do lote (A.3 item 5)', () => {
  it('mover e girar mantêm a ordem dos pontos e dos lados', () => {
    const m = transformLot(lote(), mover);
    expect(m.contorno).toEqual(contorno.map((q) => ({ x: q.x + 100, y: q.y - 50 })));
    expect(m.lados).toEqual(lados);
    const g = transformLot(lote(), giro90);
    g.contorno.forEach((q, k) => {
      expect(q.x).toBeCloseTo(-contorno[k]!.y, 9);
      expect(q.y).toBeCloseTo(contorno[k]!.x, 9);
    });
    expect(g.lados).toEqual(lados);
  });

  it('espelhar: contorno\'[k] = espelho(contorno[(n − k) mod n]) e lados\'[k] = lados[n − 1 − k]', () => {
    const e = transformLot(lote(), eixoX);
    const n = contorno.length;
    e.contorno.forEach((q, k) => {
      const o = contorno[(n - k) % n]!;
      expect(q.x).toBeCloseTo(o.x, 9);
      expect(q.y).toBeCloseTo(-o.y, 9);
    });
    expect(e.lados).toEqual([lados[3], lados[2], lados[1], lados[0]]);
  });

  it('espelhar mantém o lote válido (anti-horário) e cada lado com o seu papel, o seu recuo e o seu par de pontos', () => {
    const e = transformLot(lote(), eixoX);
    expect(lotIssue(e)).toBeNull();
    // O lado de papel "frente" e recuo 5 ainda liga os mesmos dois pontos, agora espelhados.
    const orig = segmentos(lote());
    const esperado = orig.map((s) => {
      const [p, q, papel, recuo] = s.split('|') as [string, string, string, string];
      const esp = (v: string): string => {
        const [x, y] = v.split(',').map(Number) as [number, number];
        return `${x},${Math.round(-y * 1e6) / 1e6 + 0}`;
      };
      return [esp(p), esp(q)].sort().concat(papel, recuo).join('|');
    });
    expect(segmentos(e).sort()).toEqual(esperado.sort());
    const idxFrente = e.lados.findIndex((x) => x.papel === 'frente');
    expect(e.lados[idxFrente]!.recuo).toBe(5);
    expect(e.lados.filter((x) => x.papel === 'lateral').map((x) => x.recuo).sort()).toEqual([1.5, 2]);
  });

  it('espelhar duas vezes devolve o lote original', () => {
    const e = transformLot(transformLot(lote(), eixoX), eixoX);
    e.contorno.forEach((q, k) => {
      expect(q.x).toBeCloseTo(contorno[k]!.x, 9);
      expect(Math.abs(q.y - contorno[k]!.y)).toBeLessThan(1e-9);
    });
    expect(e.lados).toEqual(lados);
  });

  it('espelhar com uma linha oblíqua também mantém o par de pontos de cada lado', () => {
    const diag: Transform = { kind: 'mirror', a: { x: 3, y: 1 }, b: { x: 7, y: 4 } };
    const e = transformLot(lote(), diag);
    expect(lotIssue(e)).toBeNull();
    // O lado de papel "fundo" liga os pontos 2 e 3 do original; no resultado liga os espelhos deles.
    const k = e.lados.findIndex((x) => x.papel === 'fundo');
    const a = e.contorno[k]!;
    const b = e.contorno[(k + 1) % 4]!;
    const refl = (p: { x: number; y: number }) => {
      const d = { x: 4 / 5, y: 3 / 5 };
      const v = { x: p.x - 3, y: p.y - 1 };
      const dot = v.x * d.x + v.y * d.y;
      return { x: 3 + 2 * dot * d.x - v.x, y: 1 + 2 * dot * d.y - v.y };
    };
    const alvo = [refl(contorno[2]!), refl(contorno[3]!)];
    const tem = (q: { x: number; y: number }): boolean => alvo.some((r) => Math.hypot(r.x - q.x, r.y - q.y) < 1e-9);
    expect(tem(a) && tem(b)).toBe(true);
  });

  it('não altera o original nem compartilha os lados', () => {
    const o = lote();
    const e = transformLot(o, mover);
    e.lados[0]!.recuo = 99;
    expect(o).toEqual(lote());
  });

  it('pelo comando, com desfazer e refazer; a cópia vem como lote novo', () => {
    const s = new ProjectStore(createEmptyProject());
    const { order: _o, ...base } = lote();
    s.exec({ type: 'addLot', lot: base });
    const l0 = structuredClone(s.project.elements['lt1']) as Lot;
    for (const tr of [mover, giro90, eixoX]) {
      s.exec({ type: 'transform', ids: ['lt1'], transform: tr });
      expect(s.project.elements['lt1']).toEqual({ ...transformLot(l0, tr), order: l0.order });
      s.undo();
      expect(s.project.elements['lt1']).toEqual(l0);
      s.redo();
      s.undo();
    }
    s.exec({ type: 'transform', ids: ['lt1'], transform: eixoX, copy: { idMap: { lt1: 'lt_copia' } } });
    expect(isLot(s.project.elements['lt_copia'])).toBe(true);
    expect(s.project.elements['lt1']).toEqual(l0);
    expect((s.project.elements['lt_copia'] as Lot).lados).toEqual([lados[3], lados[2], lados[1], lados[0]]);
  });
});

describe('lote: normalização e atalhos', () => {
  it('inverterLote preserva o primeiro vértice e o par de pontos de cada lado', () => {
    const r = inverterLote(contorno, lados);
    expect(r.contorno[0]).toEqual(contorno[0]);
    expect(r.contorno.map((q) => `${q.x},${q.y}`)).toEqual(['0,0', '0,30', '20,30', '20,0']);
    expect(r.lados).toEqual([lados[3], lados[2], lados[1], lados[0]]);
    // Lado "frente" (original: (0,0)→(20,0)) agora liga (20,0)→(0,0), ou seja, o último lado do novo polígono.
    expect(r.lados[3]!.papel).toBe('frente');
  });

  it('normalizarLote deixa anti-horário sem mexer e inverte o horário levando os lados', () => {
    expect(normalizarLote(contorno, lados)).toEqual({ contorno, lados });
    const horario = [...contorno].reverse();
    const n = normalizarLote(horario, lados);
    expect(n.contorno.map((q) => `${q.x},${q.y}`)).toEqual(['0,30', '0,0', '20,0', '20,30']);
    expect(n.lados).toEqual([lados[3], lados[2], lados[1], lados[0]]);
  });

  it('makeLot e ladosPadrao', () => {
    const l = makeLot({ id: 'a', levelId: 'lv_0', contorno, lados: ladosPadrao(4) });
    expect(l).toMatchObject({ kind: 'lot', name: 'Lote', limites: {}, mostrarEdificavel: true });
    expect(ladosPadrao(3)).toEqual([{ papel: 'lateral', recuo: 0 }, { papel: 'lateral', recuo: 0 }, { papel: 'lateral', recuo: 0 }]);
  });
});
