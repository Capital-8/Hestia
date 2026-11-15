import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project } from '@hestia/model';
import { computeSection, junctionLevel, resolveLevel } from './index.ts';
import { limparCachesDeConteudo } from './cachesDeConteudo.ts';

/** Etapa B · defeito 7: corte e elevação com 30 paredes inclinadas. Meta < 100 ms; limite 5x para não oscilar sob carga. */
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
function projeto(n: number, tilt: number, tipo = 'wt_t'): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  // Cadeia em degraus (escada de paredes retas ortogonais): cada parede liga na seguinte.
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const nx = i % 2 === 0 ? x + 3 : x, ny = i % 2 === 0 ? y : y + 3;
    const j = { kind: 'miter' as const, flip: false };
    s.exec({ type: 'addWall', wall: makeWall({ id: `W${i}`, typeId: tipo, levelId: 'lv_0', height: 3, a: { x, y }, b: { x: nx, y: ny }, tilt, joinStart: j, joinEnd: j }) });
    x = nx; y = ny;
  }
  return s.project;
}
const ms = (f: () => unknown): number => { const t = performance.now(); f(); return performance.now() - t; };
function grade(tilt: number): Project {
  const base = createEmptyProject();
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  let k = 0;
  const add = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
    if (k >= 30) return;
    s.exec({ type: 'addWall', wall: makeWall({ id: `G${k++}`, typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a, b, tilt, joinStart: j, joinEnd: j }) });
  };
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) add({ x: c * 4, y: r * 4 }, { x: c * 4 + 4, y: r * 4 });
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) add({ x: c * 4, y: r * 4 }, { x: c * 4, y: r * 4 + 4 });
  return s.project;
}
const LIN = { a: { x: -1, y: 1.5 }, b: { x: 50, y: 1.5 }, depth: 60 };

describe('Etapa B · desempenho com 30 paredes inclinadas', () => {
  it('grade, tipo de 3 camadas', () => {
    const p = grade(15);
    const t = [ms(() => resolveLevel(p, 'lv_0')), ms(() => junctionLevel(p, 'lv_0')), ms(() => computeSection(p, { a: { x: 6, y: -1 }, b: { x: 6, y: 17 }, depth: 3 })), ms(() => computeSection(p, { a: { x: -1, y: 6 }, b: { x: 13, y: 6 }, depth: 30 }))];
    console.log(`B-perf grade resolver ${t[0]!.toFixed(0)}, junção ${t[1]!.toFixed(0)}, corte ${t[2]!.toFixed(0)}, elevação ${t[3]!.toFixed(0)} ms`);
    expect(t[2]).toBeLessThan(500);
  });
  it('novo snapshot sem editar parede (aberta/vista): sem refazer a junção inclinada', () => {
    const s = new ProjectStore(grade(15));
    const L = { a: { x: 6, y: -1 }, b: { x: 6, y: 17 }, depth: 3 };
    const frio = ms(() => computeSection(s.project, L));
    const tempos: number[] = [];
    for (let i = 0; i < 3; i++) {
      s.exec({ type: 'setProjectName', name: `n${i}` });
      tempos.push(ms(() => resolveLevel(s.project, 'lv_0')), ms(() => junctionLevel(s.project, 'lv_0')), ms(() => computeSection(s.project, L)));
    }
    // Junção e análise inclinada reaproveitadas entre snapshots (identidade), e mudar o tilt de uma parede as refaz.
    const j0 = junctionLevel(s.project, 'lv_0');
    s.exec({ type: 'setProjectName', name: 'outro' });
    expect(junctionLevel(s.project, 'lv_0')).toBe(j0);
    s.exec({ type: 'setWallTilt', ids: ['G0'], tilt: 10 });
    expect(junctionLevel(s.project, 'lv_0')).not.toBe(j0);
    console.log(`B-perf snapshot novo: frio ${frio.toFixed(0)} ms; resolver/junção/corte por snapshot ${tempos.map((t) => t.toFixed(0)).join('/')} ms`);
    expect(Math.max(...tempos)).toBeLessThan(500);
  });
  it('corte e elevação em tempo curto (meta 100 ms; limite 500 ms)', () => {
    const p = projeto(30, 15, 'wt_alv14');
    const tRes = ms(() => resolveLevel(p, 'lv_0'));
    const tJ = ms(() => junctionLevel(p, 'lv_0'));
    const tCorte = ms(() => computeSection(p, { a: { x: 4.5, y: -1 }, b: { x: 4.5, y: 30 }, depth: 3 }));
    const tElev = ms(() => computeSection(p, LIN));
    const tCorte2 = ms(() => computeSection(p, { a: { x: 7.5, y: -1 }, b: { x: 7.5, y: 30 }, depth: 3 }));
    const tElev2 = ms(() => computeSection(p, { ...LIN, a: { x: -1, y: 4.5 }, b: { x: 50, y: 4.5 } }));
    console.log(`B-perf resolver ${tRes.toFixed(0)} ms, junção ${tJ.toFixed(0)} ms, corte ${tCorte.toFixed(0)} ms, elevação ${tElev.toFixed(0)} ms, corte2 ${tCorte2.toFixed(0)} ms, elevação2 ${tElev2.toFixed(0)} ms`);
    expect(tCorte2).toBeLessThan(500);
    expect(tElev2).toBeLessThan(500);
    limparCachesDeConteudo();
  });
});
