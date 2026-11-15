import { describe, expect, it } from 'vitest';
import { ProjectStore } from '@hestia/model';
import { computeSection, resolveLevel } from './index.ts';
import { medirCenario, medirNovoSnapshot, zigue } from './fixtureZigueZague.ts';

/** Etapa P: limite folgado de 5x (meta real < 100 ms); imprime os tempos. */
describe('Etapa P · desempenho multicamada (cenário do P7)', () => {
  it('30 paredes a 15°: junção, corte e elevação (limite 5x da meta de 100 ms) e razão com a vertical', () => {
    const linhas: string[] = [];
    for (const [n, t] of [[6, 15], [6, 0], [30, 15], [30, 0]] as const) {
      const f = medirCenario(n, t); const m = medirNovoSnapshot(n, t);
      linhas.push(`${n} paredes ${t}°: frio ${Object.entries(f).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')} | novo snapshot ${Object.entries(m).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')} ms`);
    }
    console.log('P-perf\n' + linhas.join('\n'));
    const i = medirCenario(30, 15);
    expect(i.juncao).toBeLessThan(500);
    expect(i.corte).toBeLessThan(500);
    expect(i.elevacao).toBeLessThan(500);
    const m = medirNovoSnapshot(30, 15);
    expect(m.corte).toBeLessThan(500);
    expect(m.elevacao).toBeLessThan(500);
  }, 120000);
  it('novo snapshot sem mexer nas paredes reaproveita a planta inclinada; mudar o tilt a refaz', () => {
    const s = new ProjectStore(zigue(30, 15));
    const a = resolveLevel(s.project, 'lv_0');
    s.exec({ type: 'setProjectName', name: 'x' });
    const b = resolveLevel(s.project, 'lv_0');
    expect(b.walls.Z3!.layers[0]!.cut).toBe(a.walls.Z3!.layers[0]!.cut);
    expect(b.walls.Z3!.tiltPlan).toBe(a.walls.Z3!.tiltPlan);
    expect(b.clusters[0]!.silhouette).toBe(a.clusters[0]!.silhouette);
    s.exec({ type: 'setWallTilt', ids: ['Z3'], tilt: 20 });
    const c = resolveLevel(s.project, 'lv_0');
    expect(c.walls.Z3!.tiltPlan).not.toBe(a.walls.Z3!.tiltPlan);
    expect(c.walls.Z3!.tilt).toBe(20);
  });
  it('corte e elevação de projetos iguais dão o mesmo resultado (memo não muda a geometria)', () => {
    const p = zigue(10, 15);
    const L = { a: { x: -2, y: 1 }, b: { x: 40, y: 1 }, depth: 6 };
    const x = computeSection(p, L);
    const y = computeSection(new ProjectStore(p).project, L);
    expect(JSON.stringify(y)).toBe(JSON.stringify(x));
  });
});
